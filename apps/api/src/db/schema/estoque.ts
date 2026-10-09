// Estoque comum (03-modelo-de-dados.md, 2.4; ambiente-cliente.md, Estoque): lotes de item, livro
// de movimentos por local e pendências de estoque negativo. O livro é só de inclusão (P13): ver
// a migração de segurança do estoque.
import { CHAVES_TIPO_MOVIMENTO_ESTOQUE, ORIGENS_LOTE_ITEM } from '@vinicycle/shared'
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { estabelecimento, local } from './acesso'
import { itemEstoque } from './cantina'
import { criacao, dataHora, emLista, id } from './comum'
import { pessoa } from './gestao'
import { nfe } from './notas'
import { operacao } from './producao'
import { empresa } from './plataforma'

function daEmpresa(
  coluna: AnyPgColumn,
  empresaId: AnyPgColumn,
  alvo: { id: AnyPgColumn; empresaId: AnyPgColumn },
) {
  return foreignKey({ columns: [coluna, empresaId], foreignColumns: [alvo.id, alvo.empresaId] })
}

const empresaId = () =>
  uuid('empresa_id')
    .notNull()
    .references(() => empresa.id)

const SITUACOES_PENDENCIA = ['aberta', 'resolvida'] as const

/** Lote do fabricante (2.4, Lote de item): código único por item e estabelecimento. */
export const loteItem = pgTable(
  'lote_item',
  {
    id: id(),
    empresaId: empresaId(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    itemId: uuid('item_id').notNull(),
    codigo: text('codigo').notNull(),
    fabricacao: date('fabricacao'),
    validade: date('validade'),
    /** Vazio = a própria empresa (o lote de terceiro fica fora do estoque próprio). */
    titularId: uuid('titular_id'),
    origem: text('origem').notNull().$type<(typeof ORIGENS_LOTE_ITEM)[number]>(),
    ...criacao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.itemId, t.empresaId, itemEstoque),
    daEmpresa(t.titularId, t.empresaId, pessoa),
    unique('lote_item_id_empresa').on(t.id, t.empresaId),
    // O mesmo código (o impresso na garrafa) pode existir para titulares diferentes, depois de
    // uma transferência de titularidade.
    uniqueIndex('lote_item_codigo').on(
      t.estabelecimentoId,
      t.itemId,
      t.codigo,
      sql`coalesce(titular_id, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
    check('lote_item_origem', emLista('origem', ORIGENS_LOTE_ITEM)),
    check('lote_item_datas', sql`fabricacao is null or validade is null or fabricacao <= validade`),
  ],
)

/** Livro do estoque (2.4, Movimento de estoque): quantidade com sinal, na unidade base do item. */
export const movimentoEstoque = pgTable(
  'movimento_estoque',
  {
    id: id(),
    empresaId: empresaId(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    modulo: text('modulo').notNull(),
    localId: uuid('local_id').notNull(),
    itemId: uuid('item_id').notNull(),
    /** Vazio quando o item não controla lote. */
    loteItemId: uuid('lote_item_id'),
    quantidade: numeric('quantidade', { precision: 14, scale: 3 }).notNull(),
    tipo: text('tipo').notNull(),
    motivo: text('motivo'),
    /** Documento de origem digitado (número da nota na entrada manual). */
    documento: text('documento'),
    /** Movimentos lançados juntos (uma entrada, uma transferência): estornam juntos. */
    grupoId: uuid('grupo_id').notNull(),
    operacaoId: uuid('operacao_id'),
    /** Nota de onde veio a entrada (ambiente-cliente.md, Entrada por NF-e). */
    nfeId: uuid('nfe_id'),
    executadoEm: dataHora('executado_em').notNull(),
    lancadoEm: dataHora('lancado_em').notNull().defaultNow(),
    estornoDeId: uuid('estorno_de_id'),
    ...criacao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.localId, t.empresaId, local),
    daEmpresa(t.itemId, t.empresaId, itemEstoque),
    daEmpresa(t.loteItemId, t.empresaId, loteItem),
    daEmpresa(t.operacaoId, t.empresaId, operacao),
    daEmpresa(t.nfeId, t.empresaId, nfe),
    unique('movimento_estoque_id_empresa').on(t.id, t.empresaId),
    check('movimento_estoque_tipo', emLista('tipo', CHAVES_TIPO_MOVIMENTO_ESTOQUE)),
    check('movimento_estoque_quantidade', sql`quantidade <> 0`),
    index('movimento_estoque_item').on(t.itemId, t.localId),
    index('movimento_estoque_lote').on(t.loteItemId),
    index('movimento_estoque_grupo').on(t.grupoId),
    index('movimento_estoque_operacao').on(t.operacaoId),
    index('movimento_estoque_nfe').on(t.nfeId),
  ],
)

/**
 * Pendência de estoque negativo (2.4): abre quando um movimento deixa o saldo do item no local
 * abaixo de zero; resolve quando o saldo volta a zero ou mais (P29, exceção decidida em 03/10).
 */
export const pendenciaEstoque = pgTable(
  'pendencia_estoque',
  {
    id: id(),
    empresaId: empresaId(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    itemId: uuid('item_id').notNull(),
    localId: uuid('local_id').notNull(),
    movimentoId: uuid('movimento_id').notNull(),
    executadoEm: dataHora('executado_em').notNull(),
    saldoApurado: numeric('saldo_apurado', { precision: 14, scale: 3 }).notNull(),
    situacao: text('situacao')
      .notNull()
      .default('aberta')
      .$type<(typeof SITUACOES_PENDENCIA)[number]>(),
    resolvidaPorId: uuid('resolvida_por_id'),
    resolvidaEm: dataHora('resolvida_em'),
    ...criacao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.itemId, t.empresaId, itemEstoque),
    daEmpresa(t.localId, t.empresaId, local),
    daEmpresa(t.movimentoId, t.empresaId, movimentoEstoque),
    daEmpresa(t.resolvidaPorId, t.empresaId, movimentoEstoque),
    check('pendencia_estoque_situacao', emLista('situacao', SITUACOES_PENDENCIA)),
    check(
      'pendencia_estoque_resolvida',
      sql`(situacao = 'resolvida') = (resolvida_em is not null)`,
    ),
    uniqueIndex('pendencia_estoque_aberta')
      .on(t.itemId, t.localId)
      .where(sql`situacao = 'aberta'`),
  ],
)
