// Locais: onde ficam recipientes e estoques, por estabelecimento (gestao.md, Parâmetros;
// ambiente-cliente.md, Estoque).
import { consultaListagem, dadosLocal, motivo, USOS_LOCAL } from '@vinicycle/shared'
import { and, count, eq, inArray, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../db/schema'
import { conferirVersao } from '../nucleo/entidades'
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros'
import { buscaTexto, listar } from '../nucleo/listagem'
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao'

async function carregar(ctx: ContextoEmpresa, id: string) {
  const permitidos = await ctx.estabelecimentosPermitidos()
  const [l] = await ctx.tx
    .select()
    .from(s.local)
    .where(and(eq(s.local.id, id), eq(s.local.empresaId, ctx.empresaId)))
  if (!l || !permitidos.includes(l.estabelecimentoId))
    throw new ErroNaoEncontrado('Local não encontrado.')
  return l
}

function tratarNomeRepetido(e: unknown): never {
  if ((e as { cause?: { constraint?: string } }).cause?.constraint === 'local_nome') {
    throw new ErroRegra('Já existe um local com este nome no estabelecimento.', 'nome_duplicado')
  }
  throw e
}

export async function rotasLocais(app: FastifyInstance): Promise<void> {
  const { db } = app.deps
  const F = 'gestao.config.locais'

  app.get('/api/locais', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const consulta = consultaListagem
        .extend({
          situacao: z.enum(['ativos', 'inativos', 'todos']).default('ativos'),
          uso: z.enum(USOS_LOCAL).optional(),
        })
        .parse(req.query)
      // Com um estabelecimento ativo, só os locais dele; em "Todos", os permitidos (P12).
      const estabs = ctx.estabelecimentoId
        ? [ctx.estabelecimentoId]
        : await ctx.estabelecimentosPermitidos()
      if (!estabs.length) return { itens: [], total: 0, pagina: 1, tamanho: consulta.tamanho }
      const filtro = and(
        eq(s.local.empresaId, ctx.empresaId),
        inArray(s.local.estabelecimentoId, estabs),
        consulta.situacao === 'todos'
          ? undefined
          : eq(s.local.ativo, consulta.situacao === 'ativos'),
        consulta.uso ? eq(s.local.uso, consulta.uso) : undefined,
        buscaTexto(consulta.busca, [s.local.nome, s.local.observacoes]),
      )
      return listar({
        consulta,
        ordenaveis: { nome: s.local.nome, uso: s.local.uso, estabelecimento: s.ficha.nome },
        ordemPadrao: { campo: 'nome', direcao: 'asc' },
        contar: async () => (await ctx.tx.select({ n: count() }).from(s.local).where(filtro))[0]!.n,
        buscar: ({ ordem, limite, deslocamento }) =>
          ctx.tx
            .select({
              id: s.local.id,
              nome: s.local.nome,
              uso: s.local.uso,
              moduloEstoque: s.local.moduloEstoque,
              refrigerado: s.local.refrigerado,
              externo: s.local.externo,
              observacoes: s.local.observacoes,
              ativo: s.local.ativo,
              versao: s.local.versao,
              estabelecimentoId: s.local.estabelecimentoId,
              estabelecimento: s.ficha.nome,
            })
            .from(s.local)
            .innerJoin(s.estabelecimento, eq(s.estabelecimento.id, s.local.estabelecimentoId))
            .innerJoin(s.ficha, eq(s.ficha.id, s.estabelecimento.fichaId))
            .where(filtro)
            .orderBy(...ordem)
            .limit(limite)
            .offset(deslocamento),
      })
    }),
  )

  app.post('/api/locais', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const d = dadosLocal.parse(req.body)
      const estabelecimentoId = ctx.exigirEstabelecimento()
      if (d.moduloEstoque && !ctx.acesso.modulos.has(d.moduloEstoque)) {
        throw new ErroRegra('O estoque só pode ficar num módulo contratado.', 'modulo')
      }
      const [l] = await ctx.tx
        .insert(s.local)
        .values({
          ...d,
          empresaId: ctx.empresaId,
          estabelecimentoId,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.local.id })
        .catch(tratarNomeRepetido)
      const { versao: _v, ...depois } = d
      await ctx.auditar({
        acao: 'criar',
        entidade: 'local',
        registroId: l!.id,
        depois: { ...depois, estabelecimentoId },
      })
      return { id: l!.id }
    }),
  )

  app.put<{ Params: { id: string } }>('/api/locais/:id', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const d = dadosLocal.parse(req.body)
      const l = await carregar(ctx, id)
      conferirVersao(l.versao, d.versao)
      if (
        d.moduloEstoque &&
        d.moduloEstoque !== l.moduloEstoque &&
        !ctx.acesso.modulos.has(d.moduloEstoque)
      ) {
        throw new ErroRegra('O estoque só pode ficar num módulo contratado.', 'modulo')
      }
      const { versao: _v, ...depois } = d
      await ctx.tx
        .update(s.local)
        .set({
          ...depois,
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.local.versao} + 1`,
        })
        .where(eq(s.local.id, id))
        .catch(tratarNomeRepetido)
      await ctx.auditar({
        acao: 'editar',
        entidade: 'local',
        registroId: id,
        antes: {
          nome: l.nome,
          uso: l.uso,
          moduloEstoque: l.moduloEstoque,
          refrigerado: l.refrigerado,
          externo: l.externo,
          observacoes: l.observacoes,
        },
        depois,
      })
      return { ok: true }
    }),
  )

  app.post<{ Params: { id: string } }>('/api/locais/:id/inativar', async (req) =>
    naEmpresa(db, req, [F, 'inativar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const { motivo: m } = motivo.parse(req.body)
      const l = await carregar(ctx, id)
      if (!l.ativo) return { ok: true }
      await ctx.tx
        .update(s.local)
        .set({
          ativo: false,
          inativadoEm: sql`now()`,
          inativadoPor: ctx.usuarioId,
          motivoInativacao: m,
        })
        .where(eq(s.local.id, id))
      await ctx.auditar({ acao: 'inativar', entidade: 'local', registroId: id, motivo: m })
      return { ok: true }
    }),
  )

  app.post<{ Params: { id: string } }>('/api/locais/:id/reativar', async (req) =>
    naEmpresa(db, req, [F, 'inativar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const l = await carregar(ctx, id)
      if (l.ativo) return { ok: true }
      await ctx.tx
        .update(s.local)
        .set({ ativo: true, inativadoEm: null, inativadoPor: null, motivoInativacao: null })
        .where(eq(s.local.id, id))
      await ctx.auditar({ acao: 'reativar', entidade: 'local', registroId: id })
      return { ok: true }
    }),
  )
}
