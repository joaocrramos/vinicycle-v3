// Consultas da cantina: conteúdo e livro do recipiente, ficha do lote (partes, composição,
// genealogia, etapas) e o que o rótulo pode declarar (03-modelo-de-dados.md, seções 4 e 5;
// cantina.md, Composição e rótulo). O sistema informa; não impede (P29).
import {
  type Composicao,
  COMPOSICAO_VAZIA,
  misturar,
  paraCentilitros,
  porSafra,
  porVariedade,
  TIPOS_MOVIMENTO,
  TIPOS_OPERACAO,
} from '@vinicycle/shared'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../../db/schema'
import { ErroNaoEncontrado } from '../../nucleo/erros'
import { fonteDaRegra, regrasVigentes } from '../../nucleo/regras'
import { type ContextoEmpresa, naEmpresa } from '../../nucleo/requisicao'
import { partesAtuais } from './motor'

export interface Parte {
  loteId: string
  recipienteId: string
  recipiente: string
  cl: number
  composicao: Composicao
}

/** Partes com saldo (o lote em cada recipiente) e a composição vigente de cada uma (5.1). */
export async function partesComSaldo(
  ctx: ContextoEmpresa,
  filtro: { loteIds?: string[]; recipienteIds?: string[]; projetoId?: string },
): Promise<Parte[]> {
  const saldos = await ctx.tx
    .select({
      recipienteId: s.movimentoVolume.recipienteId,
      recipiente: s.recipiente.codigo,
      loteId: s.movimentoVolume.loteId,
      total: sql<string>`sum(${s.movimentoVolume.litros})`,
    })
    .from(s.movimentoVolume)
    .innerJoin(s.recipiente, eq(s.recipiente.id, s.movimentoVolume.recipienteId))
    .innerJoin(s.lote, eq(s.lote.id, s.movimentoVolume.loteId))
    .where(
      and(
        eq(s.movimentoVolume.empresaId, ctx.empresaId),
        filtro.loteIds ? inArray(s.movimentoVolume.loteId, filtro.loteIds) : undefined,
        filtro.recipienteIds
          ? inArray(s.movimentoVolume.recipienteId, filtro.recipienteIds)
          : undefined,
        filtro.projetoId ? eq(s.lote.projetoId, filtro.projetoId) : undefined,
      ),
    )
    .groupBy(s.movimentoVolume.recipienteId, s.recipiente.codigo, s.movimentoVolume.loteId)
    .having(sql`sum(${s.movimentoVolume.litros}) > 0`)
  const partes = await partesAtuais(ctx, [...new Set(saldos.map((x) => x.recipienteId))])
  return saldos.map((x) => {
    const p = partes.get(x.recipienteId)
    return {
      loteId: x.loteId,
      recipienteId: x.recipienteId,
      recipiente: x.recipiente,
      cl: paraCentilitros(x.total),
      composicao: p && p.loteId === x.loteId ? p.composicao : COMPOSICAO_VAZIA,
    }
  })
}

/** Composição ponderada pelos litros das partes (5.4): a do lote, a do projeto. */
export const composicaoDas = (partes: Parte[]) =>
  misturar(partes.map((p) => ({ centilitros: p.cl, composicao: p.composicao })))

/**
 * O que o rótulo pode declarar (cantina.md, Composição e rótulo): varietal pela regra mais
 * exigente entre a nacional e a das IGs do estabelecimento; safra pela regra vigente. Informa.
 */
export async function rotulo(
  ctx: ContextoEmpresa,
  estabelecimentoId: string,
  composicao: Composicao,
) {
  const igs = await ctx.tx
    .select({ codigo: s.indicacaoGeografica.codigo, nome: s.indicacaoGeografica.nome })
    .from(s.estabelecimentoIg)
    .innerJoin(
      s.indicacaoGeografica,
      eq(s.indicacaoGeografica.id, s.estabelecimentoIg.indicacaoGeograficaId),
    )
    .where(eq(s.estabelecimentoIg.estabelecimentoId, estabelecimentoId))
  const data = new Date().toISOString().slice(0, 10)
  const varietais = await regrasVigentes(ctx.tx, 'varietal_minimo', {
    data,
    igs: igs.map((i) => i.codigo),
  })
  const [safra] = await regrasVigentes(ctx.tx, 'safra_minima', { data })
  const ids = [
    ...new Set(composicao.componentes.flatMap((c) => (c.variedadeId ? [c.variedadeId] : []))),
  ]
  const nomes = new Map(
    ids.length
      ? (
          await ctx.tx
            .select({ id: s.variedade.id, nome: s.variedade.nome })
            .from(s.variedade)
            .where(inArray(s.variedade.id, ids))
        ).map((v) => [v.id, v.nome])
      : [],
  )
  return {
    varietal: varietais.map((r) => ({
      abrangencia:
        r.abrangencia === 'ig'
          ? (igs.find((i) => i.codigo === r.abrangenciaCodigo)?.nome ?? r.abrangenciaCodigo)
          : 'Nacional',
      minimo: Number(r.minimo),
      fonte: fonteDaRegra(r),
      variedades: porVariedade(composicao).map((v) => ({
        nome: nomes.get(v.variedadeId ?? '') ?? 'Não informada',
        percentual: Number((v.fracao * 100).toFixed(2)),
        pode: v.fracao * 100 >= Number(r.minimo),
      })),
    })),
    safra: safra
      ? {
          minimo: Number(safra.minimo),
          fonte: fonteDaRegra(safra),
          safras: porSafra(composicao).map((x) => ({
            safra: x.safra,
            percentual: Number((x.fracao * 100).toFixed(2)),
            pode: x.fracao * 100 >= Number(safra.minimo),
          })),
        }
      : null,
  }
}

export async function rotasConsultas(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  // Conteúdo do recipiente e o livro, com o saldo acumulado (seção 4).
  app.get<{ Params: { id: string } }>('/api/recipientes/:id/conteudo', async (req) =>
    naEmpresa(db, req, ['enotrace.cadastros', 'visualizar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const [r] = await ctx.tx
        .select({
          estab: s.recipiente.estabelecimentoId,
          capacidade: s.recipiente.capacidadeLitros,
        })
        .from(s.recipiente)
        .where(and(eq(s.recipiente.id, id), eq(s.recipiente.empresaId, ctx.empresaId)))
      if (!r || !(await ctx.estabelecimentosPermitidos()).includes(r.estab))
        throw new ErroNaoEncontrado('Recipiente não encontrado.')
      const [parte] = await partesComSaldo(ctx, { recipienteIds: [id] })
      const lote = parte
        ? (
            await ctx.tx
              .select({
                id: s.lote.id,
                codigo: s.lote.codigo,
                etapa: s.lote.etapa,
                projetoId: s.lote.projetoId,
                projeto: sql<string>`(select p.codigo || ' · ' || p.nome from projeto p where p.id = lote.projeto_id)`,
              })
              .from(s.lote)
              .where(eq(s.lote.id, parte.loteId))
          )[0]
        : null
      const movimentos = await ctx.tx
        .select({
          executadoEm: s.movimentoVolume.executadoEm,
          lancadoEm: s.movimentoVolume.lancadoEm,
          operacaoId: s.operacao.id,
          operacao: s.operacao.codigo,
          tipoOperacao: s.operacao.tipo,
          situacaoOperacao: s.operacao.situacao,
          tipo: s.movimentoVolume.tipo,
          lote: s.lote.codigo,
          litros: s.movimentoVolume.litros,
          estimado: s.movimentoVolume.estimado,
          // Saldo depois do lançamento, na ordem da execução.
          saldo: sql<string>`sum(${s.movimentoVolume.litros}) over (order by ${s.movimentoVolume.executadoEm}, ${s.movimentoVolume.lancadoEm}, ${s.movimentoVolume.id})`,
        })
        .from(s.movimentoVolume)
        .innerJoin(s.operacao, eq(s.operacao.id, s.movimentoVolume.operacaoId))
        .innerJoin(s.lote, eq(s.lote.id, s.movimentoVolume.loteId))
        .where(eq(s.movimentoVolume.recipienteId, id))
        .orderBy(
          asc(s.movimentoVolume.executadoEm),
          asc(s.movimentoVolume.lancadoEm),
          asc(s.movimentoVolume.id),
        )
      return {
        volume: parte ? (parte.cl / 100).toFixed(2) : '0.00',
        capacidade: r.capacidade,
        lote,
        composicao: parte?.composicao ?? COMPOSICAO_VAZIA,
        movimentos: movimentos
          .map((m) => ({
            ...m,
            nomeTipo: TIPOS_MOVIMENTO[m.tipo as keyof typeof TIPOS_MOVIMENTO],
            nomeOperacao: TIPOS_OPERACAO[m.tipoOperacao as keyof typeof TIPOS_OPERACAO],
          }))
          .reverse(),
      }
    }),
  )

  // Ficha do lote: partes, composição, genealogia, etapas, uva de origem e o rótulo.
  app.get<{ Params: { id: string } }>('/api/lotes/:id', async (req) =>
    naEmpresa(db, req, ['enotrace.projetos', 'visualizar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const [l] = await ctx.tx
        .select({
          id: s.lote.id,
          codigo: s.lote.codigo,
          estab: s.lote.estabelecimentoId,
          projetoId: s.lote.projetoId,
          projeto: sql<string>`(select p.codigo || ' · ' || p.nome from projeto p where p.id = lote.projeto_id)`,
          titular: sql<
            string | null
          >`(select f.nome from pessoa p join ficha f on f.id = p.ficha_id where p.id = lote.titular_id)`,
          tipo: s.lote.tipo,
          etapa: s.lote.etapa,
          origem: s.lote.origem,
          safra: s.lote.safra,
          ciclo: s.lote.ciclo,
          rendimentoReal: s.lote.rendimentoReal,
          situacao: s.lote.situacao,
          criadoEm: s.lote.criadoEm,
        })
        .from(s.lote)
        .where(and(eq(s.lote.id, id), eq(s.lote.empresaId, ctx.empresaId)))
      if (!l || !(await ctx.estabelecimentosPermitidos()).includes(l.estab))
        throw new ErroNaoEncontrado('Lote não encontrado.')
      const partes = await partesComSaldo(ctx, { loteIds: [id] })
      const composicao = composicaoDas(partes)
      const genealogia = await ctx.tx.execute<{
        sentido: 'origem' | 'destino'
        loteId: string
        codigo: string
        litros: string
        tipo: string
        operacao: string
        operacaoId: string
      }>(sql`
        select 'origem' as sentido, o.id as "loteId", o.codigo, g.litros, g.tipo, op.codigo as operacao, op.id as "operacaoId"
          from genealogia g join lote o on o.id = g.origem_lote_id join operacao op on op.id = g.operacao_id
          where g.destino_lote_id = ${id} and not g.estornada
        union all
        select 'destino', d.id, d.codigo, g.litros, g.tipo, op.codigo, op.id
          from genealogia g join lote d on d.id = g.destino_lote_id join operacao op on op.id = g.operacao_id
          where g.origem_lote_id = ${id} and not g.estornada`)
      const uva = await ctx.tx.execute<{
        romaneio: string
        romaneioId: string
        variedade: string
        kg: string
        fornecedor: string | null
      }>(sql`
        select r.codigo as romaneio, r.id as "romaneioId", v.nome as variedade, -sum(m.kg) as kg,
          (select f.nome from pessoa p join ficha f on f.id = p.ficha_id where p.id = r.fornecedor_id) as fornecedor
        from movimento_uva m join romaneio_item i on i.id = m.item_id join romaneio r on r.id = i.romaneio_id
          join variedade v on v.id = i.variedade_id
        where m.lote_id = ${id}
        group by r.codigo, r.id, v.nome, r.fornecedor_id having sum(m.kg) <> 0 order by r.codigo`)
      const etapas = await ctx.tx
        .select({
          etapa: s.loteEtapa.etapa,
          desde: s.loteEtapa.desde,
          por: sql<
            string | null
          >`(select f.nome from usuario u join ficha f on f.id = u.ficha_id where u.id = lote_etapa.por)`,
        })
        .from(s.loteEtapa)
        .where(eq(s.loteEtapa.loteId, id))
        .orderBy(asc(s.loteEtapa.desde))
      const { estab, ...resto } = l
      return {
        ...resto,
        volume: (partes.reduce((t, p) => t + p.cl, 0) / 100).toFixed(2),
        partes: partes.map((p) => ({
          recipienteId: p.recipienteId,
          recipiente: p.recipiente,
          litros: (p.cl / 100).toFixed(2),
          composicao: p.composicao,
        })),
        composicao,
        genealogia: genealogia.rows,
        uva: uva.rows,
        etapas,
        rotulo: await rotulo(ctx, estab, composicao),
      }
    }),
  )

  // Composição real do projeto: a dos seus lotes, ponderada (cantina.md, Dados do projeto).
  app.get<{ Params: { id: string } }>('/api/projetos/:id/composicao', async (req) =>
    naEmpresa(db, req, ['enotrace.projetos', 'visualizar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const [p] = await ctx.tx
        .select({ estab: s.projeto.estabelecimentoId })
        .from(s.projeto)
        .where(and(eq(s.projeto.id, id), eq(s.projeto.empresaId, ctx.empresaId)))
      if (!p || !(await ctx.estabelecimentosPermitidos()).includes(p.estab))
        throw new ErroNaoEncontrado('Projeto não encontrado.')
      const partes = await partesComSaldo(ctx, { projetoId: id })
      const composicao = composicaoDas(partes)
      return { composicao, rotulo: await rotulo(ctx, p.estab, composicao) }
    }),
  )
}
