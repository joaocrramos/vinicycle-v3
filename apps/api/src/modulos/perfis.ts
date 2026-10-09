// Configurações › Perfis e permissões (P27). A grade é uma matriz telas × ações. O Master tem
// tudo e a grade dele não é editável. Só o Master mexe aqui.
import {
  buscarFuncionalidade,
  dadosPerfil,
  FUNCIONALIDADES,
  gradePerfil,
  motivo,
} from '@vinicycle/shared'
import { and, count, eq, inArray, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../db/schema'
import { conferirVersao } from '../nucleo/entidades'
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros'
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao'

async function carregar(ctx: ContextoEmpresa, id: string) {
  const [p] = await ctx.tx
    .select()
    .from(s.perfil)
    .where(and(eq(s.perfil.id, id), eq(s.perfil.empresaId, ctx.empresaId)))
  if (!p) throw new ErroNaoEncontrado('Perfil não encontrado.')
  return p
}

async function gradeAtual(ctx: ContextoEmpresa, perfilId: string): Promise<string[]> {
  const linhas = await ctx.tx
    .select({ f: s.funcionalidade.codigo, a: s.perfilPermissao.acao })
    .from(s.perfilPermissao)
    .innerJoin(s.funcionalidade, eq(s.funcionalidade.id, s.perfilPermissao.funcionalidadeId))
    .where(eq(s.perfilPermissao.perfilId, perfilId))
  return linhas.map((l) => `${l.f}:${l.a}`).sort()
}

async function gravarGrade(ctx: ContextoEmpresa, perfilId: string, pares: string[]): Promise<void> {
  await ctx.tx.delete(s.perfilPermissao).where(eq(s.perfilPermissao.perfilId, perfilId))
  if (!pares.length) return
  const funcs = new Map(
    (
      await ctx.tx
        .select({ id: s.funcionalidade.id, codigo: s.funcionalidade.codigo })
        .from(s.funcionalidade)
    ).map((f) => [f.codigo, f.id]),
  )
  await ctx.tx.insert(s.perfilPermissao).values(
    pares.map((p) => {
      const [f, a] = p.split(':') as [string, string]
      return { perfilId, funcionalidadeId: funcs.get(f)!, acao: a, empresaId: ctx.empresaId }
    }),
  )
}

export async function rotasPerfis(app: FastifyInstance): Promise<void> {
  const { db } = app.deps
  const F = 'gestao.config.perfis'

  /** Funcionalidades que entram na grade da empresa: dos módulos contratados, sem as do Master. */
  app.get('/api/perfis/funcionalidades', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) =>
      FUNCIONALIDADES.filter(
        (f) =>
          f.escopo === 'empresa' &&
          !f.somenteMaster &&
          f.modulo &&
          ctx.acesso.modulos.has(f.modulo),
      ).map((f) => ({ codigo: f.codigo, nome: f.nome, modulo: f.modulo, acoes: f.acoes })),
    ),
  )

  app.get('/api/perfis', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const usuarios = ctx.tx
        .select({ perfilId: s.vinculo.perfilId, n: count().as('n') })
        .from(s.vinculo)
        .where(and(eq(s.vinculo.empresaId, ctx.empresaId), eq(s.vinculo.ativo, true)))
        .groupBy(s.vinculo.perfilId)
        .as('usuarios')
      return ctx.tx
        .select({
          id: s.perfil.id,
          nome: s.perfil.nome,
          descricao: s.perfil.descricao,
          eMaster: s.perfil.eMaster,
          modelo: sql<boolean>`${s.perfil.modeloOrigemId} is not null`,
          ativo: s.perfil.ativo,
          versao: s.perfil.versao,
          usuarios: sql<number>`coalesce(${usuarios.n}, 0)::int`,
        })
        .from(s.perfil)
        .leftJoin(usuarios, eq(usuarios.perfilId, s.perfil.id))
        .where(eq(s.perfil.empresaId, ctx.empresaId))
        .orderBy(sql`${s.perfil.eMaster} desc`, s.perfil.nome)
    }),
  )

  app.get<{ Params: { id: string } }>('/api/perfis/:id', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const p = await carregar(ctx, z.uuid().parse(req.params.id))
      return {
        id: p.id,
        nome: p.nome,
        descricao: p.descricao,
        eMaster: p.eMaster,
        ativo: p.ativo,
        versao: p.versao,
        permissoes: p.eMaster ? [] : await gradeAtual(ctx, p.id),
      }
    }),
  )

  app.post('/api/perfis', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const d = dadosPerfil.parse(req.body)
      let grade: string[] = []
      if (d.copiarDe) {
        const origem = await carregar(ctx, d.copiarDe)
        if (origem.eMaster) throw new ErroRegra('O perfil Master não pode ser copiado.', 'master')
        grade = await gradeAtual(ctx, origem.id)
      }
      const [p] = await ctx.tx
        .insert(s.perfil)
        .values({
          escopo: 'empresa',
          empresaId: ctx.empresaId,
          nome: d.nome,
          descricao: d.descricao ?? null,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.perfil.id })
        .catch((e: { cause?: { constraint?: string } }) => {
          if (e.cause?.constraint === 'perfil_nome_empresa')
            throw new ErroRegra('Já existe um perfil com este nome.', 'nome_duplicado')
          throw e
        })
      await gravarGrade(ctx, p!.id, grade)
      await ctx.auditar({
        acao: 'criar',
        entidade: 'perfil',
        registroId: p!.id,
        depois: { nome: d.nome, descricao: d.descricao ?? null, permissoes: grade },
      })
      return { id: p!.id }
    }),
  )

  app.put<{ Params: { id: string } }>('/api/perfis/:id', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const d = dadosPerfil
        .omit({ copiarDe: true })
        .extend({ versao: z.number().int().optional() })
        .parse(req.body)
      const p = await carregar(ctx, id)
      conferirVersao(p.versao, d.versao)
      if (p.eMaster) throw new ErroRegra('O perfil Master não pode ser alterado.', 'master')
      await ctx.tx
        .update(s.perfil)
        .set({
          nome: d.nome,
          descricao: d.descricao ?? null,
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.perfil.versao} + 1`,
        })
        .where(eq(s.perfil.id, id))
        .catch((e: { cause?: { constraint?: string } }) => {
          if (e.cause?.constraint === 'perfil_nome_empresa')
            throw new ErroRegra('Já existe um perfil com este nome.', 'nome_duplicado')
          throw e
        })
      await ctx.auditar({
        acao: 'editar',
        entidade: 'perfil',
        registroId: id,
        antes: { nome: p.nome, descricao: p.descricao },
        depois: { nome: d.nome, descricao: d.descricao ?? null },
      })
      return { ok: true }
    }),
  )

  // A mudança vale na próxima ação dos usuários, sem novo login (P27).
  app.put<{ Params: { id: string } }>('/api/perfis/:id/grade', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const d = gradePerfil.extend({ versao: z.number().int().optional() }).parse(req.body)
      const p = await carregar(ctx, id)
      conferirVersao(p.versao, d.versao)
      if (p.eMaster)
        throw new ErroRegra('A grade do Master não é editável: ele tem acesso a tudo.', 'master')
      const pares = new Set<string>()
      for (const { funcionalidade, acao } of d.permissoes) {
        const f = buscarFuncionalidade(funcionalidade)
        if (!f || f.escopo !== 'empresa' || f.somenteMaster || !f.acoes.includes(acao)) {
          throw new ErroRegra(
            `Permissão inválida: ${funcionalidade} / ${acao}.`,
            'permissao_invalida',
          )
        }
        pares.add(`${funcionalidade}:${acao}`)
      }
      const antes = await gradeAtual(ctx, id)
      // Permissões de módulos não contratados não aparecem na tela; ficam guardadas como estão.
      for (const par of antes) {
        const modulo = buscarFuncionalidade(par.split(':')[0]!)?.modulo
        if (modulo && !ctx.acesso.modulos.has(modulo)) pares.add(par)
      }
      const depois = [...pares].sort()
      await gravarGrade(ctx, id, depois)
      await ctx.tx
        .update(s.perfil)
        .set({
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.perfil.versao} + 1`,
        })
        .where(eq(s.perfil.id, id))
      await ctx.auditar({
        acao: 'editar_grade',
        entidade: 'perfil',
        registroId: id,
        dados: {
          incluidas: depois.filter((x) => !antes.includes(x)),
          retiradas: antes.filter((x) => !depois.includes(x)),
        },
      })
      return { ok: true }
    }),
  )

  app.post<{ Params: { id: string } }>('/api/perfis/:id/inativar', async (req) =>
    naEmpresa(db, req, [F, 'inativar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const { motivo: m } = motivo.parse(req.body)
      const p = await carregar(ctx, id)
      if (p.eMaster) throw new ErroRegra('O perfil Master não pode ser inativado.', 'master')
      const [{ n }] = (await ctx.tx
        .select({ n: count() })
        .from(s.vinculo)
        .where(and(eq(s.vinculo.perfilId, id), eq(s.vinculo.ativo, true)))) as [{ n: number }]
      const [{ c }] = (await ctx.tx
        .select({ c: count() })
        .from(s.convite)
        .where(and(eq(s.convite.perfilId, id), inArray(s.convite.situacao, ['pendente'])))) as [
        { c: number },
      ]
      if (n > 0 || c > 0) {
        throw new ErroRegra(
          'Há usuários ou convites com este perfil. Troque o perfil deles antes de inativar.',
          'em_uso',
        )
      }
      await ctx.tx
        .update(s.perfil)
        .set({
          ativo: false,
          inativadoEm: sql`now()`,
          inativadoPor: ctx.usuarioId,
          motivoInativacao: m,
        })
        .where(eq(s.perfil.id, id))
      await ctx.auditar({ acao: 'inativar', entidade: 'perfil', registroId: id, motivo: m })
      return { ok: true }
    }),
  )

  app.post<{ Params: { id: string } }>('/api/perfis/:id/reativar', async (req) =>
    naEmpresa(db, req, [F, 'inativar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      await carregar(ctx, id)
      await ctx.tx
        .update(s.perfil)
        .set({ ativo: true, inativadoEm: null, inativadoPor: null, motivoInativacao: null })
        .where(eq(s.perfil.id, id))
      await ctx.auditar({ acao: 'reativar', entidade: 'perfil', registroId: id })
      return { ok: true }
    }),
  )
}
