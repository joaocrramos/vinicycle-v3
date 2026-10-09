// EnoTrace › Selos (cantina.md, Engarrafamento, Selos de indicação geográfica; 04, roteiro do ciclo
// 9): entrada de selos numerados por faixa (do nº X ao Y, série opcional), números disponíveis, e
// as faixas usadas e os números perdidos em cada produção do engarrafamento. Nenhum número entra
// duas vezes nem se usa duas vezes (integridade, P29). O estorno da produção devolve os números.
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../db/schema'
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros'
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao'
import { lancarEstoque } from './estoque'
import { dataExecucao } from './producao/apoio'

const F = 'enotrace.estoque'

export interface Faixa {
  inicio: number
  fim: number
}

/** Junta faixas que se tocam ou se sobrepõem. */
export function unir(faixas: Faixa[]): Faixa[] {
  const ord = [...faixas].sort((a, b) => a.inicio - b.inicio)
  const r: Faixa[] = []
  for (const f of ord) {
    const u = r.at(-1)
    if (u && f.inicio <= u.fim + 1) u.fim = Math.max(u.fim, f.fim)
    else r.push({ inicio: f.inicio, fim: f.fim })
  }
  return r
}

/** O que sobra de "base" tirando "menos". */
export function subtrair(base: Faixa[], menos: Faixa[]): Faixa[] {
  let r = unir(base)
  for (const m of unir(menos)) {
    r = r.flatMap((f) => {
      if (m.fim < f.inicio || m.inicio > f.fim) return [f]
      const partes: Faixa[] = []
      if (m.inicio > f.inicio) partes.push({ inicio: f.inicio, fim: m.inicio - 1 })
      if (m.fim < f.fim) partes.push({ inicio: m.fim + 1, fim: f.fim })
      return partes
    })
  }
  return r
}

export const contar = (faixas: Faixa[]) => faixas.reduce((t, f) => t + f.fim - f.inicio + 1, 0)

const faixa = z
  .object({ inicio: z.number().int().min(0), fim: z.number().int().min(0) })
  .refine((f) => f.fim >= f.inicio, { message: 'O fim vem depois do início' })
  .refine((f) => f.fim - f.inicio < 1_000_000, { message: 'Faixa grande demais (até 1 milhão)' })

async function itemSelo(ctx: ContextoEmpresa, itemId: string) {
  const [i] = await ctx.tx
    .select({
      id: s.itemEstoque.id,
      nome: s.itemEstoque.nome,
      numerado: s.itemEstoque.controlaNumeracao,
    })
    .from(s.itemEstoque)
    .where(and(eq(s.itemEstoque.id, itemId), eq(s.itemEstoque.empresaId, ctx.empresaId)))
  if (!i) throw new ErroNaoEncontrado('Item não encontrado.')
  if (!i.numerado) throw new ErroRegra(`${i.nome} não controla numeração.`, 'nao_numerado')
  return i
}

/** Faixas recebidas (válidas) e usos de um item e série, na empresa. */
async function situacao(ctx: ContextoEmpresa, itemId: string, serie: string, semProducao?: string) {
  const recebidas = await ctx.tx
    .select({ inicio: s.seloFaixa.inicio, fim: s.seloFaixa.fim })
    .from(s.seloFaixa)
    .where(
      and(
        eq(s.seloFaixa.itemId, itemId),
        eq(s.seloFaixa.serie, serie),
        isNull(s.seloFaixa.estornadaEm),
      ),
    )
  const usos = await ctx.tx
    .select({ inicio: s.seloUso.inicio, fim: s.seloUso.fim, producaoId: s.seloUso.producaoId })
    .from(s.seloUso)
    .where(and(eq(s.seloUso.itemId, itemId), eq(s.seloUso.serie, serie)))
  return {
    recebidas,
    usos: usos.filter((u) => u.producaoId !== semProducao),
  }
}

export async function liberarSelosDaProducao(ctx: ContextoEmpresa, operacaoId: string) {
  await ctx.tx.execute(sql`
    delete from selo_uso where producao_id in (select id from producao_parcial where operacao_id = ${operacaoId})`)
}

export async function rotasSelos(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  /** Os selos numerados do estabelecimento: faixas recebidas, usadas, perdidas e disponíveis. */
  app.get('/api/selos', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const itens = await ctx.tx
        .select({ id: s.itemEstoque.id, nome: s.itemEstoque.nome })
        .from(s.itemEstoque)
        .where(
          and(
            eq(s.itemEstoque.empresaId, ctx.empresaId),
            eq(s.itemEstoque.controlaNumeracao, true),
            eq(s.itemEstoque.ativo, true),
          ),
        )
        .orderBy(asc(s.itemEstoque.nome))
      if (!itens.length) return []
      const faixas = await ctx.tx
        .select()
        .from(s.seloFaixa)
        .where(
          and(
            eq(s.seloFaixa.estabelecimentoId, estab),
            inArray(
              s.seloFaixa.itemId,
              itens.map((i) => i.id),
            ),
          ),
        )
        .orderBy(asc(s.seloFaixa.serie), asc(s.seloFaixa.inicio))
      const usos = await ctx.tx.execute<{
        item_id: string
        serie: string
        inicio: number
        fim: number
        tipo: 'usado' | 'perdido'
        producao_id: string
        ordem_id: string
        lote: string | null
        data: string
      }>(sql`
        select u.item_id, u.serie, u.inicio::int8 as inicio, u.fim::int8 as fim, u.tipo, u.producao_id,
          p.ordem_id, (select lc.codigo from lote_comercial lc join ordem_engarrafamento o on o.lote_comercial_id = lc.id where o.id = p.ordem_id) as lote,
          p.executado_em::text as data
        from selo_uso u join producao_parcial p on p.id = u.producao_id
        where u.estabelecimento_id = ${estab}
        order by u.serie, u.inicio`)
      return itens.map((i) => {
        const fs = faixas.filter((f) => f.itemId === i.id)
        const us = usos.rows
          .filter((u) => u.item_id === i.id)
          .map((u) => ({ ...u, inicio: Number(u.inicio), fim: Number(u.fim) }))
        const series = [...new Set([...fs.map((f) => f.serie), ...us.map((u) => u.serie)])]
        return {
          id: i.id,
          nome: i.nome,
          series: series.map((serie) => {
            const validas = fs.filter((f) => f.serie === serie && !f.estornadaEm)
            const doSerie = us.filter((u) => u.serie === serie)
            const disponiveis = subtrair(validas, doSerie)
            return {
              serie,
              recebidas: contar(validas),
              usados: contar(doSerie.filter((u) => u.tipo === 'usado')),
              perdidos: contar(doSerie.filter((u) => u.tipo === 'perdido')),
              disponiveis,
              totalDisponivel: contar(disponiveis),
            }
          }),
          faixas: fs.map((f) => ({
            id: f.id,
            serie: f.serie,
            inicio: f.inicio,
            fim: f.fim,
            recebidaEm: f.recebidaEm,
            documento: f.documento,
            estornada: !!f.estornadaEm,
          })),
          usos: us.map((u) => ({
            serie: u.serie,
            inicio: u.inicio,
            fim: u.fim,
            tipo: u.tipo,
            ordemId: u.ordem_id,
            lote: u.lote,
            data: u.data,
          })),
        }
      })
    }),
  )

  /** Entrada de uma faixa: confere a numeração e lança a entrada no estoque. */
  app.post('/api/selos/faixas', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const d = z
        .object({
          itemId: z.uuid(),
          serie: z.string().trim().max(20).default(''),
          inicio: z.number().int().min(0),
          fim: z.number().int().min(0),
          localId: z.uuid('Escolha o local'),
          recebidaEm: z.string(),
          documento: z.string().trim().max(60).nullable().optional(),
        })
        .parse(req.body)
      faixa.parse({ inicio: d.inicio, fim: d.fim })
      const i = await itemSelo(ctx, d.itemId)
      const { recebidas } = await situacao(ctx, d.itemId, d.serie)
      const repetida = recebidas.find((f) => f.inicio <= d.fim && d.inicio <= f.fim)
      if (repetida)
        throw new ErroRegra(
          `A faixa encosta em números já recebidos (${repetida.inicio} a ${repetida.fim}${d.serie ? `, série ${d.serie}` : ''}).`,
          'faixa_repetida',
        )
      const executadoEm = dataExecucao(d.recebidaEm)
      const r = await lancarEstoque(ctx, {
        estabelecimentoId: estab,
        executadoEm,
        movimentos: [
          {
            localId: d.localId,
            itemId: i.id,
            quantidade: String(d.fim - d.inicio + 1),
            tipo: 'entrada',
            documento: d.documento ?? null,
            motivo: `Selos ${d.serie ? `${d.serie} ` : ''}${d.inicio} a ${d.fim}`,
            faixaSelos: true,
          },
        ],
      })
      const [f] = await ctx.tx
        .insert(s.seloFaixa)
        .values({
          empresaId: ctx.empresaId,
          estabelecimentoId: estab,
          itemId: i.id,
          serie: d.serie,
          inicio: d.inicio,
          fim: d.fim,
          grupoId: r.grupoId,
          recebidaEm: executadoEm,
          documento: d.documento ?? null,
          criadoPor: ctx.usuarioId,
        })
        .returning({ id: s.seloFaixa.id })
      await ctx.auditar({
        acao: 'criar',
        entidade: 'selo_faixa',
        registroId: f!.id,
        dados: { item: i.nome, serie: d.serie, inicio: d.inicio, fim: d.fim },
      })
      return { id: f!.id }
    }),
  )

  /** Estorna a entrada de uma faixa sem número usado ou perdido. */
  app.post<{ Params: { id: string } }>('/api/selos/faixas/:id/estornar', async (req) =>
    naEmpresa(db, req, [F, 'estornar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const { motivo } = z
        .object({ motivo: z.string().trim().min(3, 'Informe o motivo').max(500) })
        .parse(req.body)
      const [f] = await ctx.tx
        .select()
        .from(s.seloFaixa)
        .where(
          and(
            eq(s.seloFaixa.id, z.uuid().parse(req.params.id)),
            eq(s.seloFaixa.empresaId, ctx.empresaId),
          ),
        )
        .for('update')
      if (!f || f.estabelecimentoId !== estab) throw new ErroNaoEncontrado('Faixa não encontrada.')
      if (f.estornadaEm) throw new ErroRegra('A faixa já foi estornada.', 'estornada')
      const { usos } = await situacao(ctx, f.itemId, f.serie)
      if (usos.some((u) => u.inicio <= f.fim && f.inicio <= u.fim))
        throw new ErroRegra('Há números desta faixa usados ou perdidos numa produção.', 'em_uso')
      const movs = await ctx.tx
        .select()
        .from(s.movimentoEstoque)
        .where(eq(s.movimentoEstoque.grupoId, f.grupoId))
      await lancarEstoque(ctx, {
        estabelecimentoId: estab,
        executadoEm: f.recebidaEm,
        movimentos: movs.map((m) => ({
          localId: m.localId,
          itemId: m.itemId,
          loteItemId: m.loteItemId,
          quantidade: (-Number(m.quantidade)).toFixed(3),
          tipo: 'estorno' as const,
          motivo,
          documento: m.documento,
          estornoDeId: m.id,
        })),
      })
      await ctx.tx
        .update(s.seloFaixa)
        .set({ estornadaEm: new Date() })
        .where(eq(s.seloFaixa.id, f.id))
      await ctx.auditar({
        acao: 'estornar',
        entidade: 'selo_faixa',
        registroId: f.id,
        motivo,
        dados: { serie: f.serie, inicio: f.inicio, fim: f.fim },
      })
      return { ok: true }
    }),
  )

  /** Selos da produção: os itens numerados da produção (pelos materiais) e os números já registrados. */
  app.get<{ Params: { id: string } }>('/api/engarrafamento/producoes/:id/selos', async (req) =>
    naEmpresa(db, req, ['enotrace.engarrafamento', 'visualizar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const usos = await ctx.tx
        .select()
        .from(s.seloUso)
        .where(and(eq(s.seloUso.producaoId, id), eq(s.seloUso.empresaId, ctx.empresaId)))
        .orderBy(asc(s.seloUso.serie), asc(s.seloUso.inicio))
      const materiais = (
        await ctx.tx.execute<{ item_id: string; nome: string; real: string }>(sql`
          select pm.item_id, i.nome, sum(pm.real)::text as real from producao_material pm
            join item_estoque i on i.id = pm.item_id
          where pm.producao_id = ${id} and i.controla_numeracao group by pm.item_id, i.nome`)
      ).rows
      return { materiais, usos }
    }),
  )

  /** Registra (substitui) as faixas usadas e os números perdidos de um selo numa produção. */
  app.put<{ Params: { id: string } }>('/api/engarrafamento/producoes/:id/selos', async (req) =>
    naEmpresa(db, req, ['enotrace.engarrafamento', 'confirmar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const producaoId = z.uuid().parse(req.params.id)
      const d = z
        .object({
          itemId: z.uuid(),
          serie: z.string().trim().max(20).default(''),
          usados: z.array(faixa).max(200),
          perdidos: z.array(z.number().int().min(0)).max(5000),
        })
        .parse(req.body)
      const [p] = (
        await ctx.tx.execute<{ estab: string; situacao: string }>(sql`
          select o.estabelecimento_id as estab, o.situacao from producao_parcial pp join operacao o on o.id = pp.operacao_id
          where pp.id = ${producaoId} and pp.empresa_id = ${ctx.empresaId}`)
      ).rows
      if (!p || p.estab !== estab) throw new ErroNaoEncontrado('Produção não encontrada.')
      if (p.situacao !== 'confirmada') throw new ErroRegra('A produção foi estornada.', 'estornada')
      await itemSelo(ctx, d.itemId)
      const novos: Array<Faixa & { tipo: 'usado' | 'perdido' }> = [
        ...d.usados.map((f) => ({ ...f, tipo: 'usado' as const })),
        ...d.perdidos.map((n) => ({ inicio: n, fim: n, tipo: 'perdido' as const })),
      ]
      // Sem repetição entre as próprias faixas informadas.
      if (contar(unir(novos)) !== contar(novos))
        throw new ErroRegra(
          'Há números repetidos entre as faixas usadas e os perdidos.',
          'repetido',
        )
      const { recebidas, usos } = await situacao(ctx, d.itemId, d.serie, producaoId)
      const fora = subtrair(novos, recebidas)
      if (fora.length)
        throw new ErroRegra(
          `Números que não foram recebidos: ${fora.map((f) => (f.inicio === f.fim ? f.inicio : `${f.inicio} a ${f.fim}`)).join(', ')}.`,
          'nao_recebido',
        )
      const ja = novos.filter((n) => usos.some((u) => u.inicio <= n.fim && n.inicio <= u.fim))
      if (ja.length)
        throw new ErroRegra(
          `Números já usados ou perdidos em outra produção: ${ja.map((f) => (f.inicio === f.fim ? f.inicio : `${f.inicio} a ${f.fim}`)).join(', ')}.`,
          'ja_usado',
        )
      await ctx.tx
        .delete(s.seloUso)
        .where(
          and(
            eq(s.seloUso.producaoId, producaoId),
            eq(s.seloUso.itemId, d.itemId),
            eq(s.seloUso.serie, d.serie),
          ),
        )
      if (novos.length)
        await ctx.tx.insert(s.seloUso).values(
          novos.map((n) => ({
            empresaId: ctx.empresaId,
            estabelecimentoId: estab,
            itemId: d.itemId,
            producaoId,
            tipo: n.tipo,
            serie: d.serie,
            inicio: n.inicio,
            fim: n.fim,
            criadoPor: ctx.usuarioId,
          })),
        )
      await ctx.auditar({
        acao: 'editar',
        entidade: 'selo_uso',
        registroId: producaoId,
        dados: d,
      })
      // Aviso (não bloqueia): o total difere do selo baixado nos materiais da produção.
      const [m] = (
        await ctx.tx.execute<{ real: string | null }>(sql`
          select sum(real)::text as real from producao_material where producao_id = ${producaoId} and item_id = ${d.itemId}`)
      ).rows
      const total = contar(novos)
      return {
        total,
        aviso:
          m?.real !== null && m?.real !== undefined && Number(m.real) !== total
            ? `Foram ${total} selos (usados e perdidos), mas a produção baixou ${Number(m.real)} no estoque.`
            : null,
      }
    }),
  )
}
