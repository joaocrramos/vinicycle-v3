// EnoTrace › Cadastros › Insumos e embalagens: itens do estoque do módulo (ambiente-cliente.md,
// Estoque: um por módulo). O produto acabado não é cadastrado aqui: nasce com o formato do produto.
// Os saldos e movimentos chegam no ciclo 5.
import { consultaListagem, dadosItemEstoque } from '@vinicycle/shared'
import { and, count, eq, isNull, or, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../db/schema'
import { conferirVersao } from '../nucleo/entidades'
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros'
import { rotasInativacao } from '../nucleo/inativacao'
import { buscaTexto, listar } from '../nucleo/listagem'
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao'

const F = 'enotrace.cadastros'
const MODULO = 'ENOTRACE'

async function carregar(ctx: ContextoEmpresa, id: string) {
  const [i] = await ctx.tx
    .select()
    .from(s.itemEstoque)
    .where(
      and(
        eq(s.itemEstoque.id, id),
        eq(s.itemEstoque.empresaId, ctx.empresaId),
        eq(s.itemEstoque.modulo, MODULO),
      ),
    )
  if (!i) throw new ErroNaoEncontrado('Item não encontrado.')
  return i
}

/** Unidade existente; no insumo, unidade e apresentação permitidas pelo tipo (ambiente-cliente.md). */
async function conferir(ctx: ContextoEmpresa, d: z.output<typeof dadosItemEstoque>): Promise<void> {
  const [u] = await ctx.tx
    .select({ s: s.unidade.simbolo })
    .from(s.unidade)
    .where(eq(s.unidade.simbolo, d.unidadeBase))
  if (!u) throw new ErroRegra('Unidade inválida.', 'unidade')
  if (d.tipo !== 'insumo' || !d.insumo) return
  const [tipo] = await ctx.tx
    .select()
    .from(s.tipoInsumo)
    .where(
      and(
        eq(s.tipoInsumo.id, d.insumo.tipoInsumoId),
        or(isNull(s.tipoInsumo.empresaId), eq(s.tipoInsumo.empresaId, ctx.empresaId)),
      ),
    )
  if (!tipo) throw new ErroRegra('Tipo de insumo inválido.', 'tipo_insumo')
  if (tipo.unidades.length && !tipo.unidades.includes(d.unidadeBase)) {
    throw new ErroRegra(
      `Para ${tipo.nome}, use uma destas unidades: ${tipo.unidades.join(', ')}.`,
      'unidade',
    )
  }
  if (
    d.insumo.apresentacao &&
    tipo.apresentacoes.length &&
    !tipo.apresentacoes.includes(d.insumo.apresentacao)
  ) {
    throw new ErroRegra(`Apresentação não prevista para ${tipo.nome}.`, 'apresentacao')
  }
  if (d.insumo.fabricanteId) {
    const [f] = await ctx.tx
      .select({ id: s.pessoaPapel.id })
      .from(s.pessoaPapel)
      .where(
        and(
          eq(s.pessoaPapel.pessoaId, d.insumo.fabricanteId),
          eq(s.pessoaPapel.empresaId, ctx.empresaId),
          eq(s.pessoaPapel.papel, 'fabricante'),
          eq(s.pessoaPapel.ativo, true),
        ),
      )
    if (!f)
      throw new ErroRegra(
        'O fabricante precisa ser uma pessoa com o papel de fabricante.',
        'fabricante',
      )
  }
}

const valoresItem = (d: z.output<typeof dadosItemEstoque>) => ({
  tipo: d.tipo,
  nome: d.nome,
  codigoInterno: d.codigoInterno ?? null,
  unidadeBase: d.unidadeBase,
  estoqueMinimo: d.estoqueMinimo ?? null,
  controlaLote: d.controlaLote,
  controlaValidade: d.controlaValidade,
  eAlcoolEtilico: d.eAlcoolEtilico,
  // O selo é sempre numerado; embalagem ou outro item pode ser (ex.: etiqueta numerada).
  controlaNumeracao: d.tipo === 'selo' || d.controlaNumeracao,
  observacoes: d.observacoes ?? null,
})

const valoresInsumo = (d: z.output<typeof dadosItemEstoque>) =>
  d.tipo === 'insumo' && d.insumo
    ? {
        tipoInsumoId: d.insumo.tipoInsumoId,
        nomeComercial: d.insumo.nomeComercial ?? null,
        marca: d.insumo.marca ?? null,
        fabricanteId: d.insumo.fabricanteId ?? null,
        apresentacao: d.insumo.apresentacao ?? null,
        teorSo2: d.insumo.teorSo2 ?? null,
      }
    : null

function nomeRepetido(e: unknown): never {
  if ((e as { cause?: { constraint?: string } }).cause?.constraint === 'item_estoque_nome') {
    throw new ErroRegra('Já existe um item com este nome.', 'nome_duplicado')
  }
  throw e
}

export async function rotasItensEstoque(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  app.get('/api/itens-estoque', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const q = consultaListagem
        .extend({
          tipo: z.enum(['insumo', 'embalagem', 'selo', 'produto_acabado', 'outro']).optional(),
          tipoInsumo: z.uuid().optional(),
          situacao: z.enum(['ativos', 'inativos', 'todos']).default('ativos'),
        })
        .parse(req.query)
      const filtro = and(
        eq(s.itemEstoque.empresaId, ctx.empresaId),
        eq(s.itemEstoque.modulo, MODULO),
        q.tipo ? eq(s.itemEstoque.tipo, q.tipo) : undefined,
        q.tipoInsumo ? eq(s.itemInsumo.tipoInsumoId, q.tipoInsumo) : undefined,
        q.situacao === 'todos' ? undefined : eq(s.itemEstoque.ativo, q.situacao === 'ativos'),
        buscaTexto(q.busca, [
          s.itemEstoque.nome,
          s.itemEstoque.codigoInterno,
          s.itemInsumo.nomeComercial,
          s.itemInsumo.marca,
        ]),
      )
      return listar({
        consulta: q,
        ordenaveis: {
          nome: s.itemEstoque.nome,
          tipo: s.itemEstoque.tipo,
          tipoInsumo: s.tipoInsumo.nome,
        },
        ordemPadrao: { campo: 'nome', direcao: 'asc' },
        contar: async () =>
          (
            await ctx.tx
              .select({ n: count() })
              .from(s.itemEstoque)
              .leftJoin(s.itemInsumo, eq(s.itemInsumo.itemId, s.itemEstoque.id))
              .where(filtro)
          )[0]!.n,
        buscar: ({ ordem, limite, deslocamento }) =>
          ctx.tx
            .select({
              id: s.itemEstoque.id,
              tipo: s.itemEstoque.tipo,
              nome: s.itemEstoque.nome,
              codigoInterno: s.itemEstoque.codigoInterno,
              unidadeBase: s.itemEstoque.unidadeBase,
              estoqueMinimo: s.itemEstoque.estoqueMinimo,
              controlaLote: s.itemEstoque.controlaLote,
              controlaValidade: s.itemEstoque.controlaValidade,
              tipoInsumo: s.tipoInsumo.nome,
              nomeComercial: s.itemInsumo.nomeComercial,
              marca: s.itemInsumo.marca,
              fabricante: sql<
                string | null
              >`(select f.nome from pessoa p join ficha f on f.id = p.ficha_id where p.id = ${s.itemInsumo.fabricanteId})`,
              ativo: s.itemEstoque.ativo,
            })
            .from(s.itemEstoque)
            .leftJoin(s.itemInsumo, eq(s.itemInsumo.itemId, s.itemEstoque.id))
            .leftJoin(s.tipoInsumo, eq(s.tipoInsumo.id, s.itemInsumo.tipoInsumoId))
            .where(filtro)
            .orderBy(...ordem)
            .limit(limite)
            .offset(deslocamento),
      })
    }),
  )

  app.get<{ Params: { id: string } }>('/api/itens-estoque/:id', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const i = await carregar(ctx, z.uuid().parse(req.params.id))
      const [insumo] = await ctx.tx.select().from(s.itemInsumo).where(eq(s.itemInsumo.itemId, i.id))
      const { empresaId: _e, criadoPor: _c, atualizadoPor: _a, ...resto } = i
      return {
        ...resto,
        insumo: insumo
          ? {
              tipoInsumoId: insumo.tipoInsumoId,
              nomeComercial: insumo.nomeComercial,
              marca: insumo.marca,
              fabricanteId: insumo.fabricanteId,
              apresentacao: insumo.apresentacao,
              teorSo2: insumo.teorSo2,
            }
          : undefined,
      }
    }),
  )

  app.post('/api/itens-estoque', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const d = dadosItemEstoque.parse(req.body)
      await conferir(ctx, d)
      const [i] = await ctx.tx
        .insert(s.itemEstoque)
        .values({
          ...valoresItem(d),
          modulo: MODULO,
          empresaId: ctx.empresaId,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.itemEstoque.id })
        .catch(nomeRepetido)
      const insumo = valoresInsumo(d)
      if (insumo)
        await ctx.tx
          .insert(s.itemInsumo)
          .values({ ...insumo, itemId: i!.id, empresaId: ctx.empresaId })
      await ctx.auditar({
        acao: 'criar',
        entidade: 'item_estoque',
        registroId: i!.id,
        depois: { ...valoresItem(d), insumo },
      })
      return { id: i!.id }
    }),
  )

  app.put<{ Params: { id: string } }>('/api/itens-estoque/:id', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const d = dadosItemEstoque.parse(req.body)
      const atual = await carregar(ctx, id)
      conferirVersao(atual.versao, d.versao)
      if (atual.tipo === 'produto_acabado') {
        throw new ErroRegra(
          'O produto acabado é mantido pelo cadastro do produto (formatos).',
          'produto_acabado',
        )
      }
      if (atual.tipo !== d.tipo)
        throw new ErroRegra('O tipo do item não muda depois de cadastrado.', 'tipo_item')
      await conferir(ctx, d)
      const [insumoAntes] = await ctx.tx
        .select()
        .from(s.itemInsumo)
        .where(eq(s.itemInsumo.itemId, id))
      await ctx.tx
        .update(s.itemEstoque)
        .set({
          ...valoresItem(d),
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.itemEstoque.versao} + 1`,
        })
        .where(eq(s.itemEstoque.id, id))
        .catch(nomeRepetido)
      const insumo = valoresInsumo(d)
      if (insumo) {
        await ctx.tx
          .insert(s.itemInsumo)
          .values({ ...insumo, itemId: id, empresaId: ctx.empresaId })
          .onConflictDoUpdate({ target: s.itemInsumo.itemId, set: insumo })
      }
      const antesItem = Object.fromEntries(
        Object.keys(valoresItem(d)).map((k) => [k, atual[k as keyof typeof atual]]),
      )
      const {
        itemId: _i,
        empresaId: _e,
        ...antesInsumo
      } = insumoAntes ?? ({} as Record<string, unknown>)
      await ctx.auditar({
        acao: 'editar',
        entidade: 'item_estoque',
        registroId: id,
        antes: { ...antesItem, insumo: insumoAntes ? antesInsumo : null },
        depois: { ...valoresItem(d), insumo },
      })
      return { ok: true }
    }),
  )

  rotasInativacao(app, {
    url: '/api/itens-estoque',
    tabela: s.itemEstoque,
    entidade: 'item_estoque',
    funcionalidade: F,
  })
}
