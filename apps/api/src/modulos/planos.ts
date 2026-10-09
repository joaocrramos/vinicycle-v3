// Planos e adicionais (administracao.md, Planos, adicionais e assinaturas; P25): preço por
// periodicidade com vigência, módulos, limites e formas de pagamento aceitas.
import {
  type AdicionalEntrada,
  adicionalEntrada,
  MODULO_SEMPRE_PRESENTE,
  motivo,
  type Periodicidade,
  type PlanoEntrada,
  planoEntrada,
} from '@vinicycle/shared'
import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Tx } from '../db/cliente'
import * as s from '../db/schema'
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros'
import { pode } from '../nucleo/permissoes'
import { type ContextoPlataforma, naPlataforma } from '../nucleo/requisicao'

export function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Preço do plano vigente na data, ou nulo se a periodicidade não é vendida. */
export async function precoDoPlano(
  tx: Tx,
  planoId: string,
  periodicidade: Periodicidade,
  data: string,
): Promise<string | null> {
  const [p] = await tx
    .select({ valor: s.planoPreco.valor })
    .from(s.planoPreco)
    .where(
      and(
        eq(s.planoPreco.planoId, planoId),
        eq(s.planoPreco.periodicidade, periodicidade),
        lte(s.planoPreco.vigenteDesde, data),
      ),
    )
    .orderBy(desc(s.planoPreco.vigenteDesde))
    .limit(1)
  return p?.valor ?? null
}

export async function precoDoAdicional(
  tx: Tx,
  adicionalId: string,
  periodicidade: Periodicidade,
  data: string,
): Promise<string | null> {
  const [p] = await tx
    .select({ valor: s.adicionalPreco.valor })
    .from(s.adicionalPreco)
    .where(
      and(
        eq(s.adicionalPreco.adicionalId, adicionalId),
        eq(s.adicionalPreco.periodicidade, periodicidade),
        lte(s.adicionalPreco.vigenteDesde, data),
      ),
    )
    .orderBy(desc(s.adicionalPreco.vigenteDesde))
    .limit(1)
  return p?.valor ?? null
}

type Preco = { periodicidade: Periodicidade; valor: string; vigenteDesde: string }

/** Preços vigentes hoje e os que começam depois, por periodicidade. */
function resumirPrecos(linhas: Preco[], data: string) {
  const vigentes: Record<string, string> = {}
  const futuros: Preco[] = []
  for (const l of [...linhas].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde))) {
    if (l.vigenteDesde <= data) vigentes[l.periodicidade] = l.valor
    else
      futuros.push({
        periodicidade: l.periodicidade,
        valor: l.valor,
        vigenteDesde: l.vigenteDesde,
      })
  }
  return { precos: vigentes, precosFuturos: futuros }
}

async function gravarPrecos(
  tx: Tx,
  tabela: typeof s.planoPreco | typeof s.adicionalPreco,
  dono: { planoId: string } | { adicionalId: string },
  precos: Array<{ periodicidade: Periodicidade; valor: string }>,
  desde: string,
  usuarioId: string,
): Promise<boolean> {
  let mudou = false
  for (const p of precos) {
    const atual =
      'planoId' in dono
        ? await precoDoPlano(tx, dono.planoId, p.periodicidade, desde)
        : await precoDoAdicional(tx, dono.adicionalId, p.periodicidade, desde)
    if (atual !== null && Number(atual) === Number(p.valor)) continue
    mudou = true
    const alvo =
      'planoId' in dono
        ? [s.planoPreco.planoId, s.planoPreco.periodicidade, s.planoPreco.vigenteDesde]
        : [
            s.adicionalPreco.adicionalId,
            s.adicionalPreco.periodicidade,
            s.adicionalPreco.vigenteDesde,
          ]
    await tx
      .insert(tabela)
      .values({
        ...dono,
        periodicidade: p.periodicidade,
        valor: p.valor,
        vigenteDesde: desde,
        criadoPor: usuarioId,
      } as never)
      .onConflictDoUpdate({ target: alvo as never, set: { valor: p.valor } })
  }
  return mudou
}

async function idsDosModulos(tx: Tx, codigos: string[]): Promise<string[]> {
  const todos = [...new Set([MODULO_SEMPRE_PRESENTE, ...codigos])]
  const linhas = await tx
    .select({ id: s.modulo.id, codigo: s.modulo.codigo })
    .from(s.modulo)
    .where(inArray(s.modulo.codigo, todos))
  if (linhas.length !== todos.length) throw new ErroRegra('Módulo inválido.', 'modulos')
  return linhas.map((l) => l.id)
}

function dadosPlano(d: PlanoEntrada) {
  return {
    nome: d.nome,
    descricao: d.descricao,
    limiteEstabelecimentos: d.limiteEstabelecimentos,
    limiteUsuarios: d.limiteUsuarios,
    limiteArmazenamentoGb: d.limiteArmazenamentoGb,
    formasPagamento: d.formasPagamento,
  }
}

async function moduloDoAdicional(tx: Tx, d: AdicionalEntrada): Promise<string | null> {
  if (!d.moduloCodigo) return null
  const [m] = await tx
    .select({ id: s.modulo.id })
    .from(s.modulo)
    .where(eq(s.modulo.codigo, d.moduloCodigo))
  if (!m || d.moduloCodigo === MODULO_SEMPRE_PRESENTE) {
    throw new ErroRegra('Módulo inválido para o adicional.', 'moduloCodigo')
  }
  return m.id
}

function nomeRepetido(e: unknown): never {
  if ((e as { cause?: { code?: string } }).cause?.code === '23505') {
    throw new ErroRegra('Já existe um plano com esse nome.', 'nome')
  }
  throw e
}

export async function listarPlanos(tx: Tx, todos: boolean) {
  const data = hoje()
  const planos = await tx
    .select()
    .from(s.plano)
    .where(todos ? undefined : eq(s.plano.ativo, true))
    .orderBy(desc(s.plano.ativo), asc(s.plano.nome))
  const ids = planos.map((p) => p.id)
  const modulos = ids.length
    ? await tx
        .select({ planoId: s.planoModulo.planoId, codigo: s.modulo.codigo })
        .from(s.planoModulo)
        .innerJoin(s.modulo, eq(s.modulo.id, s.planoModulo.moduloId))
        .where(inArray(s.planoModulo.planoId, ids))
        .orderBy(s.modulo.ordem)
    : []
  const precos = ids.length
    ? await tx
        .select({
          planoId: s.planoPreco.planoId,
          periodicidade: s.planoPreco.periodicidade,
          valor: s.planoPreco.valor,
          vigenteDesde: s.planoPreco.vigenteDesde,
        })
        .from(s.planoPreco)
        .where(inArray(s.planoPreco.planoId, ids))
    : []
  const assinaturas = ids.length
    ? await tx
        .select({ planoId: s.assinatura.planoId, n: sql<number>`count(*)::int` })
        .from(s.assinatura)
        .where(and(inArray(s.assinatura.planoId, ids), eq(s.assinatura.situacao, 'vigente')))
        .groupBy(s.assinatura.planoId)
    : []
  return planos.map((p) => ({
    id: p.id,
    nome: p.nome,
    descricao: p.descricao,
    ativo: p.ativo,
    motivoInativacao: p.motivoInativacao,
    limiteEstabelecimentos: p.limiteEstabelecimentos,
    limiteUsuarios: p.limiteUsuarios,
    limiteArmazenamentoGb: p.limiteArmazenamentoGb,
    formasPagamento: p.formasPagamento,
    modulos: modulos.filter((m) => m.planoId === p.id).map((m) => m.codigo),
    assinaturas: assinaturas.find((a) => a.planoId === p.id)?.n ?? 0,
    ...resumirPrecos(
      precos.filter((x) => x.planoId === p.id),
      data,
    ),
  }))
}

export async function listarAdicionais(tx: Tx, todos: boolean) {
  const data = hoje()
  const adicionais = await tx
    .select({
      id: s.adicional.id,
      nome: s.adicional.nome,
      descricao: s.adicional.descricao,
      tipo: s.adicional.tipo,
      moduloCodigo: s.modulo.codigo,
      quantidadePorUnidade: s.adicional.quantidadePorUnidade,
      ativo: s.adicional.ativo,
      motivoInativacao: s.adicional.motivoInativacao,
    })
    .from(s.adicional)
    .leftJoin(s.modulo, eq(s.modulo.id, s.adicional.moduloId))
    .where(todos ? undefined : eq(s.adicional.ativo, true))
    .orderBy(desc(s.adicional.ativo), asc(s.adicional.nome))
  const ids = adicionais.map((a) => a.id)
  const precos = ids.length
    ? await tx
        .select({
          adicionalId: s.adicionalPreco.adicionalId,
          periodicidade: s.adicionalPreco.periodicidade,
          valor: s.adicionalPreco.valor,
          vigenteDesde: s.adicionalPreco.vigenteDesde,
        })
        .from(s.adicionalPreco)
        .where(inArray(s.adicionalPreco.adicionalId, ids))
    : []
  return adicionais.map((a) => ({
    ...a,
    ...resumirPrecos(
      precos.filter((x) => x.adicionalId === a.id),
      data,
    ),
  }))
}

/** Inativar e reativar plano ou adicional (P26): o inativo não é vendido; as assinaturas seguem. */
function rotasAtivo(
  app: FastifyInstance,
  url: string,
  tabela: typeof s.plano | typeof s.adicional,
  entidade: string,
): void {
  const { db } = app.deps
  for (const acao of ['inativar', 'reativar'] as const) {
    app.post<{ Params: { id: string } }>(`${url}/:id/${acao}`, async (req) =>
      naPlataforma(db, req, ['plataforma.planos', 'inativar'], async (ctx) => {
        const id = z.uuid().parse(req.params.id)
        const m = acao === 'inativar' ? motivo.parse(req.body).motivo : null
        const r = await ctx.tx
          .update(tabela)
          .set(
            acao === 'inativar'
              ? {
                  ativo: false,
                  inativadoEm: sql`now()`,
                  inativadoPor: ctx.usuarioId,
                  motivoInativacao: m,
                }
              : { ativo: true, inativadoEm: null, inativadoPor: null, motivoInativacao: null },
          )
          .where(eq(tabela.id, id))
          .returning({ id: tabela.id })
        if (!r.length) throw new ErroNaoEncontrado()
        await ctx.auditar({ acao, entidade, registroId: id, motivo: m })
        return { ok: true }
      }),
    )
  }
}

/** Planos ativos: quem cria clientes também precisa deles. */
function exigirLeituraPlanos(ctx: ContextoPlataforma): void {
  if (!pode(ctx.acesso, 'plataforma.clientes', 'visualizar')) {
    ctx.exigir('plataforma.planos', 'visualizar')
  }
}

export async function rotasPlanos(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  app.get('/api/plataforma/planos', async (req) =>
    naPlataforma(db, req, null, async (ctx) => {
      exigirLeituraPlanos(ctx)
      const { todos } = z.object({ todos: z.literal('1').optional() }).parse(req.query)
      if (todos) ctx.exigir('plataforma.planos', 'visualizar')
      return listarPlanos(ctx.tx, !!todos)
    }),
  )

  app.get('/api/plataforma/modulos', async (req) =>
    naPlataforma(db, req, null, async (ctx) => {
      exigirLeituraPlanos(ctx)
      return ctx.tx
        .select({
          codigo: s.modulo.codigo,
          nome: s.modulo.nome,
          funcao: s.modulo.funcao,
          situacao: s.modulo.situacao,
        })
        .from(s.modulo)
        .orderBy(s.modulo.ordem)
    }),
  )

  app.post('/api/plataforma/planos', async (req) =>
    naPlataforma(db, req, ['plataforma.planos', 'criar'], async (ctx) => {
      const d = planoEntrada.parse(req.body)
      const modulos = await idsDosModulos(ctx.tx, d.modulos)
      const [p] = await ctx.tx
        .insert(s.plano)
        .values({ ...dadosPlano(d), criadoPor: ctx.usuarioId, atualizadoPor: ctx.usuarioId })
        .returning({ id: s.plano.id })
        .catch(nomeRepetido)
      await ctx.tx
        .insert(s.planoModulo)
        .values(modulos.map((m) => ({ planoId: p!.id, moduloId: m })))
      await gravarPrecos(
        ctx.tx,
        s.planoPreco,
        { planoId: p!.id },
        d.precos,
        d.precosDesde,
        ctx.usuarioId,
      )
      await ctx.auditar({ acao: 'criar', entidade: 'plano', registroId: p!.id, depois: d })
      return { id: p!.id }
    }),
  )

  app.put<{ Params: { id: string } }>('/api/plataforma/planos/:id', async (req) =>
    naPlataforma(db, req, ['plataforma.planos', 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const d = planoEntrada.parse(req.body)
      const [antes] = await ctx.tx.select().from(s.plano).where(eq(s.plano.id, id))
      if (!antes) throw new ErroNaoEncontrado('Plano não encontrado.')
      const modulos = await idsDosModulos(ctx.tx, d.modulos)
      await ctx.tx
        .update(s.plano)
        .set({
          ...dadosPlano(d),
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.plano.versao} + 1`,
        })
        .where(eq(s.plano.id, id))
        .catch(nomeRepetido)
      // Os módulos valem para todas as assinaturas do plano, já na próxima requisição (P25).
      await ctx.tx.delete(s.planoModulo).where(eq(s.planoModulo.planoId, id))
      await ctx.tx.insert(s.planoModulo).values(modulos.map((m) => ({ planoId: id, moduloId: m })))
      await gravarPrecos(
        ctx.tx,
        s.planoPreco,
        { planoId: id },
        d.precos,
        d.precosDesde,
        ctx.usuarioId,
      )
      await ctx.auditar({ acao: 'editar', entidade: 'plano', registroId: id, antes, depois: d })
      return { ok: true }
    }),
  )

  app.get('/api/plataforma/adicionais', async (req) =>
    naPlataforma(db, req, null, async (ctx) => {
      exigirLeituraPlanos(ctx)
      const { todos } = z.object({ todos: z.literal('1').optional() }).parse(req.query)
      if (todos) ctx.exigir('plataforma.planos', 'visualizar')
      return listarAdicionais(ctx.tx, !!todos)
    }),
  )

  app.post('/api/plataforma/adicionais', async (req) =>
    naPlataforma(db, req, ['plataforma.planos', 'criar'], async (ctx) => {
      const d = adicionalEntrada.parse(req.body)
      const [a] = await ctx.tx
        .insert(s.adicional)
        .values({
          nome: d.nome,
          descricao: d.descricao,
          tipo: d.tipo,
          moduloId: await moduloDoAdicional(ctx.tx, d),
          quantidadePorUnidade: d.tipo === 'modulo' ? 1 : d.quantidadePorUnidade,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.adicional.id })
      await gravarPrecos(
        ctx.tx,
        s.adicionalPreco,
        { adicionalId: a!.id },
        d.precos,
        d.precosDesde,
        ctx.usuarioId,
      )
      await ctx.auditar({ acao: 'criar', entidade: 'adicional', registroId: a!.id, depois: d })
      return { id: a!.id }
    }),
  )

  app.put<{ Params: { id: string } }>('/api/plataforma/adicionais/:id', async (req) =>
    naPlataforma(db, req, ['plataforma.planos', 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const d = adicionalEntrada.parse(req.body)
      const [antes] = await ctx.tx.select().from(s.adicional).where(eq(s.adicional.id, id))
      if (!antes) throw new ErroNaoEncontrado('Adicional não encontrado.')
      // O tipo define o que o adicional soma às assinaturas: não muda depois de criado.
      if (antes.tipo !== d.tipo) {
        throw new ErroRegra('O tipo do adicional não muda. Crie outro adicional.', 'tipo')
      }
      await ctx.tx
        .update(s.adicional)
        .set({
          nome: d.nome,
          descricao: d.descricao,
          moduloId: await moduloDoAdicional(ctx.tx, d),
          quantidadePorUnidade: d.tipo === 'modulo' ? 1 : d.quantidadePorUnidade,
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.adicional.versao} + 1`,
        })
        .where(eq(s.adicional.id, id))
      await gravarPrecos(
        ctx.tx,
        s.adicionalPreco,
        { adicionalId: id },
        d.precos,
        d.precosDesde,
        ctx.usuarioId,
      )
      await ctx.auditar({
        acao: 'editar',
        entidade: 'adicional',
        registroId: id,
        antes,
        depois: d,
      })
      return { ok: true }
    }),
  )

  rotasAtivo(app, '/api/plataforma/planos', s.plano, 'plano')
  rotasAtivo(app, '/api/plataforma/adicionais', s.adicional, 'adicional')
}
