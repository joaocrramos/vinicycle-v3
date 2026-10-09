// EnoTrace › Estoque (ambiente-cliente.md, Estoque; 03-modelo-de-dados.md, 2.4): livro de movimentos
// por local, lotes do fabricante com validade, entrada manual, ajuste, descarte, transferência,
// estorno e pendências de estoque negativo. As operações da cantina baixam insumos por aqui.
import {
  ajusteEstoque,
  consultaListagem,
  entradaEstoque,
  estornoOperacao,
  NOMES_TIPO_ITEM,
  TIPOS_MOVIMENTO_ESTOQUE,
  type TipoMovimentoEstoque,
  transferenciaEstoque,
} from '@vinicycle/shared'
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { v7 as uuidv7 } from 'uuid'
import { z } from 'zod'
import * as s from '../db/schema'
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros'
import { buscaTexto, listar } from '../nucleo/listagem'
import { exigirMesAberto } from '../nucleo/periodo'
import type { Aviso } from '../nucleo/regras'
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao'
import { lerParametro } from './parametros'

const F = 'enotrace.estoque'
const MODULO = 'ENOTRACE'

/** Milésimos inteiros: somas exatas, sem ponto flutuante. */
const paraMil = (q: string | number) => Math.round(Number(q) * 1000)
const deMil = (m: number) => (m / 1000).toFixed(3)
const quantidadeBr = (m: number, unidade: string) =>
  `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${unidade}`

export interface MovimentoNovo {
  localId: string
  itemId: string
  loteItemId?: string | null
  /** Com sinal: + entra, − sai; na unidade base do item. */
  quantidade: string
  tipo: TipoMovimentoEstoque
  motivo?: string | null
  documento?: string | null
  operacaoId?: string | null
  nfeId?: string | null
  estornoDeId?: string | null
  /** Saída sem lote de item que controla lote (cantina.md, Saídas: "sem lote", com aviso de recall). */
  semLote?: boolean
  /** Entrada de selo numerado feita pela faixa (Estoque › Selos): a numeração já foi conferida. */
  faixaSelos?: boolean
}

/**
 * Confere e grava movimentos de estoque numa transação (P13). Trava os itens na ordem dos
 * identificadores. Saldo negativo de insumo ou embalagem é aceito, com aviso e pendência de
 * estoque; de produto acabado ou selo numerado, bloqueia (03-modelo-de-dados.md, 2.4 e 4.3). Com
 * `gravar: false`, só confere e devolve os avisos (prévia das operações).
 */
export async function lancarEstoque(
  ctx: ContextoEmpresa,
  d: {
    estabelecimentoId: string
    executadoEm: Date
    movimentos: MovimentoNovo[]
    gravar?: boolean
    /** Trava os itens para atualizar (padrão: quando grava). */
    travar?: boolean
    grupoId?: string
  },
): Promise<{ grupoId: string; avisos: Aviso[]; ids: string[] }> {
  const grupoId = d.grupoId ?? uuidv7()
  const movs = d.movimentos.filter((m) => paraMil(m.quantidade) !== 0)
  // Mês fechado não recebe lançamentos (P13); a prévia das operações já mostra o bloqueio.
  if (d.gravar !== false && movs.length)
    await exigirMesAberto(ctx.tx, d.estabelecimentoId, d.executadoEm)
  if (!movs.length) return { grupoId, avisos: [], ids: [] }
  const itensIds = [...new Set(movs.map((m) => m.itemId))].sort()
  const itens = await ctx.tx
    .select({
      id: s.itemEstoque.id,
      nome: s.itemEstoque.nome,
      tipo: s.itemEstoque.tipo,
      modulo: s.itemEstoque.modulo,
      unidade: s.itemEstoque.unidadeBase,
      controlaLote: s.itemEstoque.controlaLote,
      controlaNumeracao: s.itemEstoque.controlaNumeracao,
      ativo: s.itemEstoque.ativo,
    })
    .from(s.itemEstoque)
    .where(and(inArray(s.itemEstoque.id, itensIds), eq(s.itemEstoque.empresaId, ctx.empresaId)))
    .orderBy(asc(s.itemEstoque.id))
    .for((d.travar ?? d.gravar !== false) ? 'update' : 'share')
  if (itens.length !== itensIds.length) throw new ErroRegra('Item inválido.', 'item')
  const item = (id: string) => itens.find((i) => i.id === id)!

  const locaisIds = [...new Set(movs.map((m) => m.localId))]
  const locais = await ctx.tx
    .select({ id: s.local.id, nome: s.local.nome, modulo: s.local.moduloEstoque })
    .from(s.local)
    .where(
      and(
        inArray(s.local.id, locaisIds),
        eq(s.local.estabelecimentoId, d.estabelecimentoId),
        inArray(s.local.uso, ['estoque', 'ambos']),
        eq(s.local.ativo, true),
      ),
    )
  if (locais.length !== locaisIds.length)
    throw new ErroRegra('Escolha um local de estoque ativo deste estabelecimento.', 'local')
  // Cada módulo tem o seu estoque (ambiente-cliente.md, Estoque: um por módulo).
  for (const m of movs) {
    const l = locais.find((x) => x.id === m.localId)!
    if (l.modulo !== item(m.itemId).modulo)
      throw new ErroRegra(`O local ${l.nome} é do estoque de outro módulo.`, 'local')
  }
  const nomeLocal = (id: string) => locais.find((l) => l.id === id)!.nome

  const lotesIds = [...new Set(movs.flatMap((m) => (m.loteItemId ? [m.loteItemId] : [])))]
  const lotes = lotesIds.length
    ? await ctx.tx
        .select({
          id: s.loteItem.id,
          itemId: s.loteItem.itemId,
          estab: s.loteItem.estabelecimentoId,
        })
        .from(s.loteItem)
        .where(inArray(s.loteItem.id, lotesIds))
    : []
  for (const m of movs) {
    const i = item(m.itemId)
    if (m.loteItemId) {
      const l = lotes.find((x) => x.id === m.loteItemId)
      if (!l || l.itemId !== m.itemId || l.estab !== d.estabelecimentoId)
        throw new ErroRegra(`Lote inválido para ${i.nome}.`, 'lote')
    } else if (i.controlaLote && !m.semLote) {
      throw new ErroRegra(`${i.nome} controla lote: informe o lote.`, 'lote')
    }
    // Selo numerado entra pela faixa (do nº X ao Y), para a numeração não ter buraco nem repetição.
    if (
      i.controlaNumeracao &&
      paraMil(m.quantidade) > 0 &&
      ['entrada', 'entrada_nfe', 'carga_inicial'].includes(m.tipo) &&
      !m.faixaSelos
    )
      throw new ErroRegra(
        `${i.nome} é numerado: dê entrada pela faixa, em Estoque › Selos.`,
        'selo_faixa',
      )
    if (!i.ativo && paraMil(m.quantidade) > 0 && m.tipo !== 'estorno')
      throw new ErroRegra(`${i.nome} está inativo e não recebe entradas.`, 'item_inativo')
  }

  // Saldo de cada item em cada local, antes e depois.
  const saldos = await ctx.tx
    .select({
      itemId: s.movimentoEstoque.itemId,
      localId: s.movimentoEstoque.localId,
      total: sql<string>`sum(${s.movimentoEstoque.quantidade})`,
    })
    .from(s.movimentoEstoque)
    .where(
      and(
        inArray(s.movimentoEstoque.itemId, itensIds),
        inArray(s.movimentoEstoque.localId, locaisIds),
      ),
    )
    .groupBy(s.movimentoEstoque.itemId, s.movimentoEstoque.localId)
  const pares = new Map<
    string,
    { itemId: string; localId: string; antes: number; depois: number }
  >()
  for (const m of movs) {
    const k = `${m.itemId}|${m.localId}`
    if (!pares.has(k)) {
      const antes = paraMil(
        saldos.find((x) => x.itemId === m.itemId && x.localId === m.localId)?.total ?? 0,
      )
      pares.set(k, { itemId: m.itemId, localId: m.localId, antes, depois: antes })
    }
    pares.get(k)!.depois += paraMil(m.quantidade)
  }
  const avisos: Aviso[] = []
  for (const p of pares.values()) {
    if (p.depois >= 0) continue
    const i = item(p.itemId)
    if (i.tipo === 'produto_acabado' || i.tipo === 'selo')
      throw new ErroRegra(
        `O saldo de ${i.nome} em ${nomeLocal(p.localId)} ficaria negativo. ${NOMES_TIPO_ITEM[i.tipo]} não fica negativo.`,
        'saldo_negativo',
      )
    avisos.push({
      codigo: `estoque:${p.itemId}:${p.localId}`,
      mensagem: `O saldo de ${i.nome} em ${nomeLocal(p.localId)} fica negativo (${quantidadeBr(p.depois, i.unidade)}). Fica uma pendência de estoque, a resolver (pela nota ou por ajuste) antes do fechamento do mês.`,
    })
  }
  if (d.gravar === false) return { grupoId, avisos, ids: [] }

  const ids = movs.map(() => uuidv7())
  await ctx.tx.insert(s.movimentoEstoque).values(
    movs.map((m, n) => ({
      id: ids[n]!,
      empresaId: ctx.empresaId,
      estabelecimentoId: d.estabelecimentoId,
      modulo: item(m.itemId).modulo,
      localId: m.localId,
      itemId: m.itemId,
      loteItemId: m.loteItemId ?? null,
      quantidade: deMil(paraMil(m.quantidade)),
      tipo: m.tipo,
      motivo: m.motivo ?? null,
      documento: m.documento ?? null,
      grupoId,
      operacaoId: m.operacaoId ?? null,
      nfeId: m.nfeId ?? null,
      executadoEm: d.executadoEm,
      estornoDeId: m.estornoDeId ?? null,
      criadoPor: ctx.usuarioId,
    })),
  )

  // Pendências: abre quando fica negativo; resolve quando volta a zero ou mais.
  for (const p of pares.values()) {
    const ultimo =
      ids[movs.map((m) => `${m.itemId}|${m.localId}`).lastIndexOf(`${p.itemId}|${p.localId}`)]!
    const aberta = (
      await ctx.tx
        .select({ id: s.pendenciaEstoque.id })
        .from(s.pendenciaEstoque)
        .where(
          and(
            eq(s.pendenciaEstoque.itemId, p.itemId),
            eq(s.pendenciaEstoque.localId, p.localId),
            eq(s.pendenciaEstoque.situacao, 'aberta'),
          ),
        )
    )[0]
    if (p.depois < 0 && !aberta) {
      await ctx.tx.insert(s.pendenciaEstoque).values({
        empresaId: ctx.empresaId,
        estabelecimentoId: d.estabelecimentoId,
        itemId: p.itemId,
        localId: p.localId,
        movimentoId: ultimo,
        executadoEm: d.executadoEm,
        saldoApurado: deMil(p.depois),
        criadoPor: ctx.usuarioId,
      })
    } else if (p.depois >= 0 && aberta) {
      await ctx.tx
        .update(s.pendenciaEstoque)
        .set({ situacao: 'resolvida', resolvidaPorId: ultimo, resolvidaEm: sql`now()` })
        .where(eq(s.pendenciaEstoque.id, aberta.id))
    }
  }
  return { grupoId, avisos, ids }
}

/** Lote do fabricante pelo código: o existente ou um novo (2.4, Lote de item). */
export async function obterLote(
  ctx: ContextoEmpresa,
  estabelecimentoId: string,
  itemId: string,
  l: { codigo: string; fabricacao?: string | null; validade?: string | null },
  origem: (typeof s.loteItem.$inferInsert)['origem'],
  /** Dono do lote; vazio = a própria empresa. O mesmo código pode existir para cada titular. */
  titularId: string | null = null,
): Promise<string> {
  const [existente] = await ctx.tx
    .select({ id: s.loteItem.id })
    .from(s.loteItem)
    .where(
      and(
        eq(s.loteItem.estabelecimentoId, estabelecimentoId),
        eq(s.loteItem.itemId, itemId),
        eq(s.loteItem.codigo, l.codigo),
        titularId ? eq(s.loteItem.titularId, titularId) : isNull(s.loteItem.titularId),
      ),
    )
  if (existente) return existente.id
  const [novo] = await ctx.tx
    .insert(s.loteItem)
    .values({
      empresaId: ctx.empresaId,
      estabelecimentoId,
      itemId,
      codigo: l.codigo,
      fabricacao: l.fabricacao ?? null,
      validade: l.validade ?? null,
      titularId,
      origem,
      criadoPor: ctx.usuarioId,
    })
    .returning({ id: s.loteItem.id })
  return novo!.id
}

/** Situação da validade: vencendo dentro da maior antecedência dos avisos (Parâmetros, P20). */
async function situacaoValidade(ctx: ContextoEmpresa) {
  const { dias } = await lerParametro(ctx, 'avisos_validade')
  const janela = Math.max(...dias)
  return sql<string>`case when ${s.loteItem.validade} is null then 'sem_validade'
    when ${s.loteItem.validade} < current_date then 'vencido'
    when ${s.loteItem.validade} <= current_date + ${janela}::int then 'vencendo'
    else 'valido' end`
}

function dataExecucao(iso: string): Date {
  const d = new Date(iso)
  if (d.getTime() > Date.now() + 5 * 60_000)
    throw new ErroRegra('A data da execução não pode ser no futuro.', 'data_futura')
  return d
}

export async function rotasEstoque(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  // Saldos por item no estabelecimento (ou num local), com lotes vencendo e pendências.
  app.get('/api/estoque', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const q = consultaListagem
        .extend({
          tipo: z.enum(['insumo', 'embalagem', 'produto_acabado', 'selo', 'outro']).optional(),
          local: z.uuid().optional(),
          situacao: z
            .enum(['com_saldo', 'abaixo_minimo', 'pendencia', 'vencendo', 'todos'])
            .default('todos'),
        })
        .parse(req.query)
      const doLocal = q.local ? sql`and m.local_id = ${q.local}` : sql``
      const saldo = sql<string>`coalesce((select sum(m.quantidade) from movimento_estoque m where m.item_id = item_estoque.id and m.estabelecimento_id = ${estab} ${doLocal}), 0)`
      // Saldo de clientes de vinificação (lotes com titular): fica fora do estoque próprio.
      const saldoTerceiros = sql<string>`coalesce((select sum(m.quantidade) from movimento_estoque m join lote_item l on l.id = m.lote_item_id where m.item_id = item_estoque.id and m.estabelecimento_id = ${estab} and l.titular_id is not null ${doLocal}), 0)`
      const { dias } = await lerParametro(ctx, 'avisos_validade')
      const vencendo = sql<number>`(select count(*)::int from lote_item l where l.item_id = item_estoque.id and l.estabelecimento_id = ${estab} and l.validade <= current_date + ${Math.max(...dias)}::int and coalesce((select sum(m.quantidade) from movimento_estoque m where m.lote_item_id = l.id ${doLocal}), 0) > 0)`
      const pendencia = sql<boolean>`exists (select 1 from pendencia_estoque p where p.item_id = item_estoque.id and p.estabelecimento_id = ${estab} and p.situacao = 'aberta')`
      const filtro = and(
        eq(s.itemEstoque.empresaId, ctx.empresaId),
        eq(s.itemEstoque.modulo, MODULO),
        q.tipo ? eq(s.itemEstoque.tipo, q.tipo) : undefined,
        q.situacao === 'com_saldo' ? sql`${saldo} <> 0` : undefined,
        q.situacao === 'abaixo_minimo'
          ? sql`${s.itemEstoque.estoqueMinimo} is not null and ${saldo} - ${saldoTerceiros} < ${s.itemEstoque.estoqueMinimo}`
          : undefined,
        q.situacao === 'pendencia' ? pendencia : undefined,
        q.situacao === 'vencendo' ? sql`${vencendo} > 0` : undefined,
        q.situacao === 'todos' ? eq(s.itemEstoque.ativo, true) : undefined,
        buscaTexto(q.busca, [s.itemEstoque.nome, s.itemEstoque.codigoInterno]),
      )
      return listar({
        consulta: q,
        ordenaveis: { nome: s.itemEstoque.nome, tipo: s.itemEstoque.tipo, saldo },
        ordemPadrao: { campo: 'nome', direcao: 'asc' },
        contar: async () =>
          (await ctx.tx.select({ n: count() }).from(s.itemEstoque).where(filtro))[0]!.n,
        buscar: ({ ordem, limite, deslocamento }) =>
          ctx.tx
            .select({
              id: s.itemEstoque.id,
              tipo: s.itemEstoque.tipo,
              nome: s.itemEstoque.nome,
              unidade: s.itemEstoque.unidadeBase,
              estoqueMinimo: s.itemEstoque.estoqueMinimo,
              controlaLote: s.itemEstoque.controlaLote,
              controlaValidade: s.itemEstoque.controlaValidade,
              saldo,
              saldoTerceiros,
              lotesVencendo: vencendo,
              pendencia,
            })
            .from(s.itemEstoque)
            .where(filtro)
            .orderBy(...ordem)
            .limit(limite)
            .offset(deslocamento),
      })
    }),
  )

  // Ficha do item no estoque: saldo por local e por lote, movimentos e pendências.
  app.get<{ Params: { id: string } }>('/api/estoque/itens/:id', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const id = z.uuid().parse(req.params.id)
      const [item] = await ctx.tx
        .select({
          id: s.itemEstoque.id,
          nome: s.itemEstoque.nome,
          tipo: s.itemEstoque.tipo,
          unidade: s.itemEstoque.unidadeBase,
          estoqueMinimo: s.itemEstoque.estoqueMinimo,
          controlaLote: s.itemEstoque.controlaLote,
          controlaValidade: s.itemEstoque.controlaValidade,
        })
        .from(s.itemEstoque)
        .where(and(eq(s.itemEstoque.id, id), eq(s.itemEstoque.empresaId, ctx.empresaId)))
      if (!item) throw new ErroNaoEncontrado('Item não encontrado.')
      const porLocal = await ctx.tx.execute<{ localId: string; local: string; saldo: string }>(sql`
        select l.id as "localId", l.nome as local, sum(m.quantidade) as saldo
        from movimento_estoque m join local l on l.id = m.local_id
        where m.item_id = ${id} and m.estabelecimento_id = ${estab}
        group by l.id, l.nome having sum(m.quantidade) <> 0 order by l.nome`)
      const situacao = await situacaoValidade(ctx)
      const lotes = await ctx.tx
        .select({
          id: s.loteItem.id,
          codigo: s.loteItem.codigo,
          fabricacao: s.loteItem.fabricacao,
          validade: s.loteItem.validade,
          situacao,
          titularId: s.loteItem.titularId,
          titular: sql<
            string | null
          >`(select f.nome from pessoa p join ficha f on f.id = p.ficha_id where p.id = lote_item.titular_id)`,
          saldo: sql<string>`coalesce((select sum(m.quantidade) from movimento_estoque m where m.lote_item_id = lote_item.id), 0)`,
          locais: sql<
            Array<{ localId: string; local: string; saldo: string }>
          >`coalesce((select json_agg(json_build_object('localId', x.local_id, 'local', l.nome, 'saldo', x.saldo) order by l.nome) from (select m.local_id, sum(m.quantidade) as saldo from movimento_estoque m where m.lote_item_id = lote_item.id group by m.local_id having sum(m.quantidade) <> 0) x join local l on l.id = x.local_id), '[]')`,
        })
        .from(s.loteItem)
        .where(and(eq(s.loteItem.itemId, id), eq(s.loteItem.estabelecimentoId, estab)))
        .orderBy(asc(s.loteItem.validade), asc(s.loteItem.codigo))
      const movimentos = await ctx.tx
        .select({
          id: s.movimentoEstoque.id,
          grupoId: s.movimentoEstoque.grupoId,
          executadoEm: s.movimentoEstoque.executadoEm,
          lancadoEm: s.movimentoEstoque.lancadoEm,
          tipo: s.movimentoEstoque.tipo,
          quantidade: s.movimentoEstoque.quantidade,
          local: s.local.nome,
          lote: sql<
            string | null
          >`(select l.codigo from lote_item l where l.id = movimento_estoque.lote_item_id)`,
          motivo: s.movimentoEstoque.motivo,
          documento: s.movimentoEstoque.documento,
          operacaoId: s.movimentoEstoque.operacaoId,
          operacao: sql<
            string | null
          >`(select o.codigo from operacao o where o.id = movimento_estoque.operacao_id)`,
          estornado: sql<boolean>`exists (select 1 from movimento_estoque e where e.estorno_de_id = movimento_estoque.id)`,
        })
        .from(s.movimentoEstoque)
        .innerJoin(s.local, eq(s.local.id, s.movimentoEstoque.localId))
        .where(
          and(eq(s.movimentoEstoque.itemId, id), eq(s.movimentoEstoque.estabelecimentoId, estab)),
        )
        .orderBy(desc(s.movimentoEstoque.executadoEm), desc(s.movimentoEstoque.lancadoEm))
        .limit(300)
      const pendencias = await ctx.tx
        .select({
          id: s.pendenciaEstoque.id,
          local: s.local.nome,
          executadoEm: s.pendenciaEstoque.executadoEm,
          saldoApurado: s.pendenciaEstoque.saldoApurado,
          situacao: s.pendenciaEstoque.situacao,
          resolvidaEm: s.pendenciaEstoque.resolvidaEm,
        })
        .from(s.pendenciaEstoque)
        .innerJoin(s.local, eq(s.local.id, s.pendenciaEstoque.localId))
        .where(
          and(eq(s.pendenciaEstoque.itemId, id), eq(s.pendenciaEstoque.estabelecimentoId, estab)),
        )
        .orderBy(desc(s.pendenciaEstoque.criadoEm))
      return {
        ...item,
        saldo: porLocal.rows.reduce((t, l) => t + Number(l.saldo), 0).toFixed(3),
        porLocal: porLocal.rows,
        lotes,
        movimentos: movimentos.map((m) => ({
          ...m,
          nomeTipo: TIPOS_MOVIMENTO_ESTOQUE[m.tipo as TipoMovimentoEstoque],
        })),
        pendencias,
      }
    }),
  )

  // Lotes de um item com saldo (para escolher na adição de insumo, no ajuste…).
  app.get('/api/estoque/lotes', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const q = z.object({ item: z.uuid(), local: z.uuid().optional() }).parse(req.query)
      const doLocal = q.local ? sql`and m.local_id = ${q.local}` : sql``
      const situacao = await situacaoValidade(ctx)
      return ctx.tx
        .select({
          id: s.loteItem.id,
          codigo: s.loteItem.codigo,
          validade: s.loteItem.validade,
          situacao,
          titularId: s.loteItem.titularId,
          titular: sql<
            string | null
          >`(select f.nome from pessoa p join ficha f on f.id = p.ficha_id where p.id = lote_item.titular_id)`,
          saldo: sql<string>`coalesce((select sum(m.quantidade) from movimento_estoque m where m.lote_item_id = lote_item.id ${doLocal}), 0)`,
        })
        .from(s.loteItem)
        .where(and(eq(s.loteItem.itemId, q.item), eq(s.loteItem.estabelecimentoId, estab)))
        .orderBy(asc(s.loteItem.validade), asc(s.loteItem.codigo))
    }),
  )

  // Locais do estoque do EnoTrace no estabelecimento ativo.
  app.get('/api/estoque/locais', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      return ctx.tx
        .select({ id: s.local.id, nome: s.local.nome, externo: s.local.externo })
        .from(s.local)
        .where(
          and(
            eq(s.local.estabelecimentoId, estab),
            eq(s.local.moduloEstoque, MODULO),
            eq(s.local.ativo, true),
          ),
        )
        .orderBy(asc(s.local.nome))
    }),
  )

  /**
   * Consulta inversa: em quais lotes de vinho entrou um lote de insumo (cantina.md, Adição de
   * insumo; Decreto 12.709/2025, art. 122, §1º). Serve ao recolhimento. Sem as estornadas.
   */
  app.get<{ Params: { id: string } }>('/api/estoque/lotes/:id/usos', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const r = await ctx.tx.execute<{
        operacaoId: string
        operacao: string
        tipo: string
        executadoEm: string
        recipiente: string
        loteId: string
        lote: string
        dose: string
        unidade: string
        quantidade: string | null
      }>(sql`
        select o.id as "operacaoId", o.codigo as operacao, o.tipo, o.executado_em as "executadoEm",
          r.codigo as recipiente, l.id as "loteId", l.codigo as lote, i.dose, i.unidade, i.quantidade
        from operacao_insumo i
          join operacao o on o.id = i.operacao_id
          join recipiente r on r.id = i.recipiente_id
          join lote l on l.id = i.lote_id
        where i.lote_item_id = ${id} and i.empresa_id = ${ctx.empresaId} and o.situacao = 'confirmada'
        order by o.executado_em desc`)
      return r.rows
    }),
  )

  app.get('/api/estoque/pendencias', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      return ctx.tx
        .select({
          id: s.pendenciaEstoque.id,
          itemId: s.pendenciaEstoque.itemId,
          item: s.itemEstoque.nome,
          unidade: s.itemEstoque.unidadeBase,
          local: s.local.nome,
          executadoEm: s.pendenciaEstoque.executadoEm,
          saldoApurado: s.pendenciaEstoque.saldoApurado,
        })
        .from(s.pendenciaEstoque)
        .innerJoin(s.itemEstoque, eq(s.itemEstoque.id, s.pendenciaEstoque.itemId))
        .innerJoin(s.local, eq(s.local.id, s.pendenciaEstoque.localId))
        .where(
          and(
            eq(s.pendenciaEstoque.estabelecimentoId, estab),
            eq(s.pendenciaEstoque.situacao, 'aberta'),
          ),
        )
        .orderBy(asc(s.pendenciaEstoque.executadoEm))
    }),
  )

  // Entrada manual, com o número da nota; o lote é o do fabricante (existente ou novo).
  app.post('/api/estoque/entradas', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const d = entradaEstoque.parse(req.body)
      const executadoEm = dataExecucao(d.executadoEm)
      const movimentos: MovimentoNovo[] = []
      // Insumo do cliente (vinificação para terceiro): o lote separa o estoque dele do próprio.
      const titularId = d.titularId ?? null
      if (titularId) {
        const [p] = await ctx.tx
          .select({ id: s.pessoa.id })
          .from(s.pessoa)
          .where(and(eq(s.pessoa.id, titularId), eq(s.pessoa.empresaId, ctx.empresaId)))
        if (!p) throw new ErroRegra('Titular inválido.', 'titularId')
        if (d.itens.some((i) => !i.lote))
          throw new ErroRegra(
            'Item do cliente entra com lote: é ele que separa o estoque do cliente do próprio.',
            'lote',
          )
      }
      for (const i of d.itens) {
        const loteItemId = i.lote
          ? await obterLote(ctx, estab, i.itemId, i.lote, 'entrada', titularId)
          : null
        movimentos.push({
          localId: d.localId,
          itemId: i.itemId,
          loteItemId,
          quantidade: i.quantidade,
          tipo: 'entrada',
          documento: d.documento ?? null,
          motivo: d.observacao ?? null,
        })
      }
      const r = await lancarEstoque(ctx, { estabelecimentoId: estab, executadoEm, movimentos })
      await ctx.auditar({
        acao: 'criar',
        entidade: 'movimento_estoque',
        registroId: r.grupoId,
        dados: {
          tipo: 'entrada',
          documento: d.documento,
          titularId: d.titularId ?? null,
          itens: d.itens.length,
        },
      })
      return r
    }),
  )

  // Ajuste de inventário (± a diferença) ou descarte, com motivo.
  app.post('/api/estoque/ajustes', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const d = ajusteEstoque.parse(req.body)
      const quantidade = d.tipo === 'descarte' ? `-${d.quantidade.replace('-', '')}` : d.quantidade
      const r = await lancarEstoque(ctx, {
        estabelecimentoId: estab,
        executadoEm: dataExecucao(d.executadoEm),
        movimentos: [
          {
            localId: d.localId,
            itemId: d.itemId,
            loteItemId: d.loteItemId ?? null,
            quantidade,
            tipo: d.tipo,
            motivo: d.motivo,
          },
        ],
      })
      await ctx.auditar({
        acao: 'criar',
        entidade: 'movimento_estoque',
        registroId: r.grupoId,
        dados: { tipo: d.tipo, quantidade, motivo: d.motivo },
      })
      return r
    }),
  )

  app.post('/api/estoque/transferencias', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const d = transferenciaEstoque.parse(req.body)
      const r = await lancarEstoque(ctx, {
        estabelecimentoId: estab,
        executadoEm: dataExecucao(d.executadoEm),
        movimentos: d.itens.flatMap((i) => [
          {
            localId: d.origemLocalId,
            itemId: i.itemId,
            loteItemId: i.loteItemId ?? null,
            quantidade: `-${i.quantidade}`,
            tipo: 'transferencia' as const,
          },
          {
            localId: d.destinoLocalId,
            itemId: i.itemId,
            loteItemId: i.loteItemId ?? null,
            quantidade: i.quantidade,
            tipo: 'transferencia' as const,
          },
        ]),
      })
      await ctx.auditar({
        acao: 'criar',
        entidade: 'movimento_estoque',
        registroId: r.grupoId,
        dados: { tipo: 'transferencia', itens: d.itens.length },
      })
      return r
    }),
  )

  /**
   * Estorno de um lançamento do estoque (entrada, ajuste, descarte, transferência): movimentos
   * inversos com a data original (P13). O consumo das operações se estorna com a operação.
   */
  app.post<{ Params: { id: string } }>('/api/estoque/grupos/:id/estorno', async (req) =>
    naEmpresa(db, req, [F, 'estornar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const grupoId = z.uuid().parse(req.params.id)
      const { motivo } = estornoOperacao.parse(req.body)
      const movs = await ctx.tx
        .select()
        .from(s.movimentoEstoque)
        .where(
          and(
            eq(s.movimentoEstoque.grupoId, grupoId),
            eq(s.movimentoEstoque.estabelecimentoId, estab),
          ),
        )
      if (!movs.length) throw new ErroNaoEncontrado('Lançamento não encontrado.')
      if (movs.some((m) => m.operacaoId))
        throw new ErroRegra('O consumo de uma operação se estorna com a operação.', 'operacao')
      if (movs.some((m) => m.nfeId))
        throw new ErroRegra('A entrada de uma NF-e se estorna pela nota.', 'nfe')
      if (movs.some((m) => m.tipo === 'estorno'))
        throw new ErroRegra('O estorno não se estorna: lance de novo.', 'estorno')
      const [ja] = await ctx.tx
        .select({ id: s.movimentoEstoque.id })
        .from(s.movimentoEstoque)
        .where(
          inArray(
            s.movimentoEstoque.estornoDeId,
            movs.map((m) => m.id),
          ),
        )
        .limit(1)
      if (ja) throw new ErroRegra('Este lançamento já foi estornado.', 'estorno')
      const r = await lancarEstoque(ctx, {
        estabelecimentoId: estab,
        executadoEm: movs[0]!.executadoEm,
        movimentos: movs.map((m) => ({
          localId: m.localId,
          itemId: m.itemId,
          loteItemId: m.loteItemId,
          quantidade: deMil(-paraMil(m.quantidade)),
          tipo: 'estorno' as const,
          motivo,
          documento: m.documento,
          estornoDeId: m.id,
        })),
      })
      await ctx.auditar({
        acao: 'estornar',
        entidade: 'movimento_estoque',
        registroId: grupoId,
        dados: { motivo },
      })
      return r
    }),
  )
}
