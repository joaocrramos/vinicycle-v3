// EnoTrace › Cadastros › Parâmetros técnicos (gestao.md, Configurações; cantina.md): parâmetros de
// análise medidos, com unidade preferida e faixa ideal da empresa; rendimento padrão (kg → litros);
// nomes dos ciclos da safra; periodicidade de higienização; parâmetros técnicos dos tratamentos.
// Tudo configurável (P29).
import {
  ciclosSafra,
  parametrosAnaliseEmpresa,
  parametroTratamento,
  periodicidadesHigienizacao,
  rendimentosPadrao,
} from '@vinicycle/shared'
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import * as s from '../db/schema'
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros'
import { naEmpresa } from '../nucleo/requisicao'
import { lerParametro } from './parametros'

const F = 'enotrace.cadastros'

export async function rotasParametrosCantina(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  /** Fator e limite da prática da chaptalização, para a tela da operação (o parâmetro é da Gestão). */
  app.get('/api/cantina/chaptalizacao', async (req) =>
    naEmpresa(db, req, ['enotrace.operacoes', 'visualizar'], (ctx) =>
      lerParametro(ctx, 'chaptalizacao'),
    ),
  )

  app.get('/api/cantina/parametros-analise', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const params = await ctx.tx
        .select()
        .from(s.parametroAnalise)
        .where(
          and(
            eq(s.parametroAnalise.ativo, true),
            or(
              isNull(s.parametroAnalise.empresaId),
              eq(s.parametroAnalise.empresaId, ctx.empresaId),
            ),
          ),
        )
        .orderBy(asc(s.parametroAnalise.ordem), asc(s.parametroAnalise.nome))
      const escolhas = await ctx.tx
        .select()
        .from(s.empresaParametroAnalise)
        .where(eq(s.empresaParametroAnalise.empresaId, ctx.empresaId))
      const faixas = await ctx.tx
        .select()
        .from(s.faixaIdeal)
        .where(and(eq(s.faixaIdeal.empresaId, ctx.empresaId), eq(s.faixaIdeal.nivel, 'empresa')))
      return params.map((p) => {
        const e = escolhas.find((x) => x.parametroId === p.id)
        const f = faixas.find((x) => x.parametroId === p.id)
        return {
          parametroId: p.id,
          nome: p.nome,
          unidadePadrao: p.unidadePadrao,
          unidadesAceitas: p.unidadesAceitas,
          casas: p.casas,
          ativo: e?.ativo ?? false,
          unidadePreferida: e?.unidadePreferida ?? null,
          minimo: f?.minimo ?? null,
          maximo: f?.maximo ?? null,
        }
      })
    }),
  )

  app.put('/api/cantina/parametros-analise', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const d = parametrosAnaliseEmpresa.parse(req.body)
      const ids = d.parametros.map((p) => p.parametroId)
      const validos = ids.length
        ? await ctx.tx
            .select()
            .from(s.parametroAnalise)
            .where(
              and(
                inArray(s.parametroAnalise.id, ids),
                or(
                  isNull(s.parametroAnalise.empresaId),
                  eq(s.parametroAnalise.empresaId, ctx.empresaId),
                ),
              ),
            )
        : []
      for (const p of d.parametros) {
        const def = validos.find((v) => v.id === p.parametroId)
        if (!def) throw new ErroRegra('Parâmetro inválido.', 'parametro')
        if (
          p.unidadePreferida &&
          ![def.unidadePadrao, ...def.unidadesAceitas].includes(p.unidadePreferida)
        ) {
          throw new ErroRegra(`Unidade não aceita para ${def.nome}.`, 'unidade')
        }
        if (p.minimo && p.maximo && Number(p.minimo) > Number(p.maximo)) {
          throw new ErroRegra(`Em ${def.nome}, o mínimo é maior que o máximo.`, 'faixa')
        }
        await ctx.tx
          .insert(s.empresaParametroAnalise)
          .values({
            empresaId: ctx.empresaId,
            parametroId: p.parametroId,
            ativo: p.ativo,
            unidadePreferida: p.unidadePreferida ?? null,
          })
          .onConflictDoUpdate({
            target: [s.empresaParametroAnalise.empresaId, s.empresaParametroAnalise.parametroId],
            set: { ativo: p.ativo, unidadePreferida: p.unidadePreferida ?? null },
          })
        await ctx.tx
          .delete(s.faixaIdeal)
          .where(
            and(
              eq(s.faixaIdeal.empresaId, ctx.empresaId),
              eq(s.faixaIdeal.parametroId, p.parametroId),
              eq(s.faixaIdeal.nivel, 'empresa'),
            ),
          )
        if (p.minimo || p.maximo) {
          await ctx.tx.insert(s.faixaIdeal).values({
            empresaId: ctx.empresaId,
            parametroId: p.parametroId,
            nivel: 'empresa',
            minimo: p.minimo ?? null,
            maximo: p.maximo ?? null,
            criadoPor: ctx.usuarioId,
            atualizadoPor: ctx.usuarioId,
          })
        }
      }
      await ctx.auditar({
        acao: 'editar',
        entidade: 'parametros_analise',
        dados: { parametros: d.parametros.filter((p) => p.ativo) },
      })
      return { ok: true }
    }),
  )

  app.get('/api/cantina/rendimentos', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      return ctx.tx
        .select({
          variedadeId: s.rendimentoPadrao.variedadeId,
          variedade: s.variedade.nome,
          estilo: s.rendimentoPadrao.estilo,
          litrosPorKg: s.rendimentoPadrao.litrosPorKg,
        })
        .from(s.rendimentoPadrao)
        .leftJoin(s.variedade, eq(s.variedade.id, s.rendimentoPadrao.variedadeId))
        .where(eq(s.rendimentoPadrao.estabelecimentoId, estab))
        .orderBy(asc(s.variedade.nome), asc(s.rendimentoPadrao.estilo))
    }),
  )

  app.put('/api/cantina/rendimentos', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const d = rendimentosPadrao.parse(req.body)
      // A chave estrangeira não passa pelo RLS: confere que a variedade é visível para a empresa.
      const variedades = [
        ...new Set(d.itens.map((i) => i.variedadeId).filter((v): v is string => !!v)),
      ]
      if (variedades.length) {
        const visiveis = await ctx.tx
          .select({ id: s.variedade.id })
          .from(s.variedade)
          .where(
            and(
              inArray(s.variedade.id, variedades),
              or(isNull(s.variedade.empresaId), eq(s.variedade.empresaId, ctx.empresaId)),
            ),
          )
        if (visiveis.length !== variedades.length)
          throw new ErroRegra('Variedade inválida.', 'variedade')
      }
      const chaves = d.itens.map((i) => `${i.variedadeId ?? ''}|${i.estilo ?? ''}`)
      if (new Set(chaves).size !== chaves.length)
        throw new ErroRegra('Há combinações de variedade e estilo repetidas.', 'duplicado')
      const antes = await ctx.tx
        .select()
        .from(s.rendimentoPadrao)
        .where(eq(s.rendimentoPadrao.estabelecimentoId, estab))
      await ctx.tx.delete(s.rendimentoPadrao).where(eq(s.rendimentoPadrao.estabelecimentoId, estab))
      if (d.itens.length) {
        await ctx.tx.insert(s.rendimentoPadrao).values(
          d.itens.map((i) => ({
            empresaId: ctx.empresaId,
            estabelecimentoId: estab,
            variedadeId: i.variedadeId ?? null,
            estilo: i.estilo ?? null,
            litrosPorKg: i.litrosPorKg,
            criadoPor: ctx.usuarioId,
            atualizadoPor: ctx.usuarioId,
          })),
        )
      }
      await ctx.auditar({
        acao: 'editar',
        entidade: 'rendimento_padrao',
        antes: {
          itens: antes.map((a) => ({
            variedadeId: a.variedadeId,
            estilo: a.estilo,
            litrosPorKg: a.litrosPorKg,
          })),
        },
        depois: { itens: d.itens },
      })
      return { ok: true }
    }),
  )

  app.get('/api/cantina/ciclos', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      return ctx.tx
        .select({ numero: s.ciclo.numero, nome: s.ciclo.nome })
        .from(s.ciclo)
        .where(eq(s.ciclo.estabelecimentoId, estab))
        .orderBy(asc(s.ciclo.numero))
    }),
  )

  app.put('/api/cantina/ciclos', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const d = ciclosSafra.parse(req.body)
      if (new Set(d.ciclos.map((c) => c.numero)).size !== d.ciclos.length)
        throw new ErroRegra('Número de ciclo repetido.', 'duplicado')
      const antes = await ctx.tx
        .select({ numero: s.ciclo.numero, nome: s.ciclo.nome })
        .from(s.ciclo)
        .where(eq(s.ciclo.estabelecimentoId, estab))
      await ctx.tx.delete(s.ciclo).where(eq(s.ciclo.estabelecimentoId, estab))
      if (d.ciclos.length) {
        await ctx.tx.insert(s.ciclo).values(
          d.ciclos.map((c) => ({
            ...c,
            empresaId: ctx.empresaId,
            estabelecimentoId: estab,
            criadoPor: ctx.usuarioId,
          })),
        )
      }
      await ctx.auditar({
        acao: 'editar',
        entidade: 'ciclo',
        antes: { ciclos: antes },
        depois: { ciclos: d.ciclos },
      })
      return { ok: true }
    }),
  )

  app.get('/api/cantina/higienizacao', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) =>
      ctx.tx
        .select({
          tipoRecipienteId: s.periodicidadeHigienizacao.tipoRecipienteId,
          intervaloDias: s.periodicidadeHigienizacao.intervaloDias,
        })
        .from(s.periodicidadeHigienizacao)
        .where(eq(s.periodicidadeHigienizacao.empresaId, ctx.empresaId)),
    ),
  )

  app.put('/api/cantina/higienizacao', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const d = periodicidadesHigienizacao.parse(req.body)
      const tipos = [...new Set(d.itens.map((i) => i.tipoRecipienteId))]
      if (tipos.length !== d.itens.length)
        throw new ErroRegra('Tipo de recipiente repetido.', 'duplicado')
      if (tipos.length) {
        const visiveis = await ctx.tx
          .select({ id: s.tipoRecipiente.id })
          .from(s.tipoRecipiente)
          .where(
            and(
              inArray(s.tipoRecipiente.id, tipos),
              or(isNull(s.tipoRecipiente.empresaId), eq(s.tipoRecipiente.empresaId, ctx.empresaId)),
            ),
          )
        if (visiveis.length !== tipos.length)
          throw new ErroRegra('Tipo de recipiente inválido.', 'tipo_recipiente')
      }
      const antes = await ctx.tx
        .select({
          tipoRecipienteId: s.periodicidadeHigienizacao.tipoRecipienteId,
          intervaloDias: s.periodicidadeHigienizacao.intervaloDias,
        })
        .from(s.periodicidadeHigienizacao)
        .where(eq(s.periodicidadeHigienizacao.empresaId, ctx.empresaId))
      await ctx.tx
        .delete(s.periodicidadeHigienizacao)
        .where(eq(s.periodicidadeHigienizacao.empresaId, ctx.empresaId))
      if (d.itens.length) {
        await ctx.tx.insert(s.periodicidadeHigienizacao).values(
          d.itens.map((i) => ({
            ...i,
            empresaId: ctx.empresaId,
            criadoPor: ctx.usuarioId,
            atualizadoPor: ctx.usuarioId,
          })),
        )
      }
      await ctx.auditar({
        acao: 'editar',
        entidade: 'periodicidade_higienizacao',
        antes: { itens: antes },
        depois: { itens: d.itens },
      })
      return { ok: true }
    }),
  )

  // Parâmetros técnicos por tipo de tratamento (cantina.md, Tratamentos; 2.5; P29).
  app.get('/api/cantina/parametros-tratamento', async (req) =>
    naEmpresa(db, req, ['enotrace.operacoes', 'visualizar'], async (ctx) =>
      ctx.tx
        .select({
          id: s.tipoTratamentoParametro.id,
          tipoTratamento: s.tipoTratamentoParametro.tipoTratamento,
          nome: s.tipoTratamentoParametro.nome,
          unidade: s.tipoTratamentoParametro.unidade,
          obrigatorio: s.tipoTratamentoParametro.obrigatorio,
          ativo: s.tipoTratamentoParametro.ativo,
        })
        .from(s.tipoTratamentoParametro)
        .where(eq(s.tipoTratamentoParametro.empresaId, ctx.empresaId))
        .orderBy(
          asc(s.tipoTratamentoParametro.tipoTratamento),
          asc(s.tipoTratamentoParametro.nome),
        ),
    ),
  )

  const nomeRepetido = (e: unknown): never => {
    if (
      (e as { cause?: { constraint?: string } }).cause?.constraint ===
      'tipo_tratamento_parametro_nome'
    )
      throw new ErroRegra('Já existe um parâmetro com esse nome neste tratamento.', 'duplicado')
    throw e
  }

  app.post('/api/cantina/parametros-tratamento', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const d = parametroTratamento.parse(req.body)
      const [p] = await ctx.tx
        .insert(s.tipoTratamentoParametro)
        .values({
          ...d,
          unidade: d.unidade ?? null,
          empresaId: ctx.empresaId,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.tipoTratamentoParametro.id })
        .catch(nomeRepetido)
      await ctx.auditar({
        acao: 'criar',
        entidade: 'tipo_tratamento_parametro',
        registroId: p!.id,
        depois: d,
      })
      return { id: p!.id }
    }),
  )

  app.put<{ Params: { id: string } }>('/api/cantina/parametros-tratamento/:id', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const d = parametroTratamento.extend({ ativo: z.boolean().default(true) }).parse(req.body)
      const r = await ctx.tx
        .update(s.tipoTratamentoParametro)
        .set({
          nome: d.nome,
          unidade: d.unidade ?? null,
          obrigatorio: d.obrigatorio,
          ativo: d.ativo,
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
        })
        .where(
          and(
            eq(s.tipoTratamentoParametro.id, id),
            eq(s.tipoTratamentoParametro.empresaId, ctx.empresaId),
          ),
        )
        .returning({ id: s.tipoTratamentoParametro.id })
        .catch(nomeRepetido)
      if (!r.length) throw new ErroNaoEncontrado('Parâmetro não encontrado.')
      await ctx.auditar({
        acao: 'editar',
        entidade: 'tipo_tratamento_parametro',
        registroId: id,
        depois: d,
      })
      return { ok: true }
    }),
  )
}
