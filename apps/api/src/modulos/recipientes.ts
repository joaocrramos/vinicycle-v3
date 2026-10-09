// EnoTrace › Cadastros › Recipientes (cantina.md, Recipientes): um a um, por estabelecimento. O
// volume não é campo: é a soma do livro (ciclos 3 e 4). A situação muda com motivo e fica no
// histórico; "aguardando higienização" recebe vinho com alerta, não com bloqueio (P29).
import {
  consultaListagem,
  dadosRecipiente,
  SITUACOES_RECIPIENTE,
  situacaoRecipiente,
} from '@vinicycle/shared'
import { and, count, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../db/schema'
import { conferirVersao } from '../nucleo/entidades'
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros'
import { buscaTexto, listar } from '../nucleo/listagem'
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao'

const F = 'enotrace.cadastros'

async function carregar(ctx: ContextoEmpresa, id: string) {
  const permitidos = await ctx.estabelecimentosPermitidos()
  const [r] = await ctx.tx
    .select()
    .from(s.recipiente)
    .where(and(eq(s.recipiente.id, id), eq(s.recipiente.empresaId, ctx.empresaId)))
  if (!r || !permitidos.includes(r.estabelecimentoId))
    throw new ErroNaoEncontrado('Recipiente não encontrado.')
  return r
}

/** Tipo (global ou próprio) e local do mesmo estabelecimento, com uso de recipientes. */
async function conferir(
  ctx: ContextoEmpresa,
  estabelecimentoId: string,
  d: z.output<typeof dadosRecipiente>,
) {
  const [tipo] = await ctx.tx
    .select({ eBarrica: s.tipoRecipiente.eBarrica })
    .from(s.tipoRecipiente)
    .where(
      and(
        eq(s.tipoRecipiente.id, d.tipoRecipienteId),
        or(isNull(s.tipoRecipiente.empresaId), eq(s.tipoRecipiente.empresaId, ctx.empresaId)),
      ),
    )
  if (!tipo) throw new ErroRegra('Tipo de recipiente inválido.', 'tipo_recipiente')
  const [local] = await ctx.tx
    .select({ uso: s.local.uso, ativo: s.local.ativo })
    .from(s.local)
    .where(and(eq(s.local.id, d.localId), eq(s.local.estabelecimentoId, estabelecimentoId)))
  if (!local) throw new ErroRegra('O local precisa ser do mesmo estabelecimento.', 'local')
  if (local.uso === 'estoque')
    throw new ErroRegra('Este local é só de estoque; escolha um local de recipientes.', 'local')
  return tipo
}

function valores(d: z.output<typeof dadosRecipiente>, eBarrica: boolean) {
  return {
    codigo: d.codigo,
    tipoRecipienteId: d.tipoRecipienteId,
    material: d.material ?? null,
    capacidadeLitros: d.capacidadeLitros,
    possuiFrio: d.possuiFrio,
    localId: d.localId,
    dimensoes: d.dimensoes ?? null,
    fabricante: d.fabricante ?? null,
    dataAquisicao: d.dataAquisicao ?? null,
    // Campos de barrica só valem para tipos de madeira.
    tanoaria: eBarrica ? (d.tanoaria ?? null) : null,
    origemMadeira: eBarrica ? (d.origemMadeira ?? null) : null,
    tosta: eBarrica ? (d.tosta ?? null) : null,
    anoPrimeiroUso: eBarrica ? (d.anoPrimeiroUso ?? null) : null,
    observacoes: d.observacoes ?? null,
  }
}

function codigoRepetido(e: unknown): never {
  if ((e as { cause?: { constraint?: string } }).cause?.constraint === 'recipiente_codigo') {
    throw new ErroRegra(
      'Já existe um recipiente com este código no estabelecimento.',
      'codigo_duplicado',
    )
  }
  throw e
}

export async function rotasRecipientes(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  app.get('/api/recipientes', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const q = consultaListagem
        .extend({
          situacao: z.enum([...SITUACOES_RECIPIENTE, 'em_uso', 'todos']).default('em_uso'),
          tipo: z.uuid().optional(),
          local: z.uuid().optional(),
        })
        .parse(req.query)
      const estabs = ctx.estabelecimentoId
        ? [ctx.estabelecimentoId]
        : await ctx.estabelecimentosPermitidos()
      if (!estabs.length) return { itens: [], total: 0, pagina: 1, tamanho: q.tamanho }
      const filtro = and(
        eq(s.recipiente.empresaId, ctx.empresaId),
        inArray(s.recipiente.estabelecimentoId, estabs),
        q.situacao === 'todos'
          ? undefined
          : q.situacao === 'em_uso'
            ? sql`${s.recipiente.situacao} <> 'inativo'`
            : eq(s.recipiente.situacao, q.situacao),
        q.tipo ? eq(s.recipiente.tipoRecipienteId, q.tipo) : undefined,
        q.local ? eq(s.recipiente.localId, q.local) : undefined,
        buscaTexto(q.busca, [s.recipiente.codigo, s.recipiente.observacoes, s.recipiente.tanoaria]),
      )
      return listar({
        consulta: q,
        ordenaveis: {
          // Código em ordem natural: T2 antes de T10.
          codigo: sql`regexp_replace(lower(${s.recipiente.codigo}), '\\d+', lpad(substring(${s.recipiente.codigo} from '\\d+'), 10, '0'))`,
          capacidadeLitros: s.recipiente.capacidadeLitros,
          tipo: s.tipoRecipiente.nome,
          local: s.local.nome,
        },
        ordemPadrao: { campo: 'codigo', direcao: 'asc' },
        contar: async () =>
          (await ctx.tx.select({ n: count() }).from(s.recipiente).where(filtro))[0]!.n,
        buscar: ({ ordem, limite, deslocamento }) =>
          ctx.tx
            .select({
              id: s.recipiente.id,
              codigo: s.recipiente.codigo,
              tipo: s.tipoRecipiente.nome,
              eBarrica: s.tipoRecipiente.eBarrica,
              capacidadeLitros: s.recipiente.capacidadeLitros,
              possuiFrio: s.recipiente.possuiFrio,
              local: s.local.nome,
              situacao: s.recipiente.situacao,
              material: s.recipiente.material,
              anoPrimeiroUso: s.recipiente.anoPrimeiroUso,
              // Volume: a soma do livro (seção 4); o lote com saldo (um por vez).
              volume: sql<string>`coalesce((select sum(m.litros) from movimento_volume m where m.recipiente_id = recipiente.id), 0)`,
              lote: sql<{
                id: string
                codigo: string
                projetoId: string
                titularId: string | null
                titular: string | null
              } | null>`(select json_build_object('id', l.id, 'codigo', l.codigo, 'projetoId', l.projeto_id, 'titularId', l.titular_id, 'titular', (select f.nome from pessoa p join ficha f on f.id = p.ficha_id where p.id = l.titular_id)) from lote l where l.id = (select m.lote_id from movimento_volume m where m.recipiente_id = recipiente.id group by m.lote_id having sum(m.litros) > 0 limit 1))`,
            })
            .from(s.recipiente)
            .innerJoin(s.tipoRecipiente, eq(s.tipoRecipiente.id, s.recipiente.tipoRecipienteId))
            .innerJoin(s.local, eq(s.local.id, s.recipiente.localId))
            .where(filtro)
            .orderBy(...ordem)
            .limit(limite)
            .offset(deslocamento),
      })
    }),
  )

  app.get<{ Params: { id: string } }>('/api/recipientes/:id', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const r = await carregar(ctx, z.uuid().parse(req.params.id))
      const { empresaId: _e, criadoPor: _c, atualizadoPor: _a, ...resto } = r
      return resto
    }),
  )

  app.post('/api/recipientes', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const estabelecimentoId = ctx.exigirEstabelecimento()
      const d = dadosRecipiente.parse(req.body)
      const tipo = await conferir(ctx, estabelecimentoId, d)
      const [r] = await ctx.tx
        .insert(s.recipiente)
        .values({
          ...valores(d, tipo.eBarrica),
          empresaId: ctx.empresaId,
          estabelecimentoId,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.recipiente.id })
        .catch(codigoRepetido)
      await ctx.auditar({
        acao: 'criar',
        entidade: 'recipiente',
        registroId: r!.id,
        depois: valores(d, tipo.eBarrica),
      })
      return { id: r!.id }
    }),
  )

  app.put<{ Params: { id: string } }>('/api/recipientes/:id', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const d = dadosRecipiente.parse(req.body)
      const atual = await carregar(ctx, id)
      conferirVersao(atual.versao, d.versao)
      const tipo = await conferir(ctx, atual.estabelecimentoId, d)
      const novos = valores(d, tipo.eBarrica)
      await ctx.tx
        .update(s.recipiente)
        .set({
          ...novos,
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.recipiente.versao} + 1`,
        })
        .where(eq(s.recipiente.id, id))
        .catch(codigoRepetido)
      const antes = Object.fromEntries(
        Object.keys(novos).map((k) => [k, atual[k as keyof typeof atual]]),
      )
      await ctx.auditar({
        acao: 'editar',
        entidade: 'recipiente',
        registroId: id,
        antes,
        depois: novos,
      })
      return { ok: true }
    }),
  )

  // Situação: ativo, aguardando higienização, em manutenção, inativo. Motivo obrigatório para tirar de uso.
  app.post<{ Params: { id: string } }>('/api/recipientes/:id/situacao', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const d = situacaoRecipiente.parse(req.body)
      const atual = await carregar(ctx, id)
      if (atual.situacao === d.situacao) return { ok: true }
      if (d.situacao !== 'ativo' && !d.motivo) throw new ErroRegra('Informe o motivo.', 'motivo')
      if (d.situacao === 'inativo') ctx.exigir(F, 'inativar')
      await ctx.tx
        .update(s.recipiente)
        .set({
          situacao: d.situacao,
          situacaoDesde: sql`now()`,
          motivoSituacao: d.motivo ?? null,
          versao: sql`${s.recipiente.versao} + 1`,
        })
        .where(eq(s.recipiente.id, id))
      await ctx.auditar({
        acao: 'situacao',
        entidade: 'recipiente',
        registroId: id,
        antes: { situacao: atual.situacao },
        depois: { situacao: d.situacao },
        motivo: d.motivo ?? null,
      })
      return { ok: true }
    }),
  )
}
