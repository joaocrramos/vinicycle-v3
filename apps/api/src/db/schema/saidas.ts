// Saídas de produto e devoluções (cantina.md, Saídas de produto; 03-modelo-de-dados.md, 2.5,
// Saídas e devoluções). Genéricas, sem amarra a um PDV (P29): manual ou pelo XML da nota de venda.
// O comprador é dado da saída, não vira cadastro (LGPD, P21); a baixa por lote liga o lote comercial
// a quem recebeu, para o recolhimento.
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core'
import { estabelecimento, local } from './acesso'
import { itemEstoque } from './cantina'
import { alteracao, criacao, dataHora, emLista, id } from './comum'
import { loteItem, movimentoEstoque } from './estoque'
import { pessoa } from './gestao'
import { nfe, nfeItem } from './notas'
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

export const ORIGENS_SAIDA = ['manual', 'xml'] as const
export const SITUACOES_SAIDA = ['lancada', 'estornada'] as const
export const ESTRATEGIAS_USADAS = ['documento', 'escolha', 'mais_antigo', 'sem_lote'] as const

export const saida = pgTable(
  'saida',
  {
    id: id(),
    empresaId: empresaId(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    /** Código da lista "tipo_saida" (venda, degustação, quebra…). */
    tipo: text('tipo').notNull(),
    origem: text('origem').notNull().$type<(typeof ORIGENS_SAIDA)[number]>(),
    nfeId: uuid('nfe_id'),
    executadoEm: dataHora('executado_em').notNull(),
    /** Número do documento (nota, cupom); na importação, o da nota. */
    documento: text('documento'),
    /** Copiados da nota ou digitados; vazios = consumidor não identificado. */
    destinatarioDocumento: text('destinatario_documento'),
    destinatarioNome: text('destinatario_nome'),
    pessoaId: uuid('pessoa_id'),
    /** Dono do produto que sai; vazio = a própria empresa (vinificação para terceiros). */
    titularId: uuid('titular_id'),
    motivo: text('motivo'),
    situacao: text('situacao')
      .notNull()
      .default('lancada')
      .$type<(typeof SITUACOES_SAIDA)[number]>(),
    motivoEstorno: text('motivo_estorno'),
    /** Movimentos de estoque da saída (estornam juntos). */
    grupoId: uuid('grupo_id').notNull(),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.nfeId, t.empresaId, nfe),
    daEmpresa(t.pessoaId, t.empresaId, pessoa),
    daEmpresa(t.titularId, t.empresaId, pessoa),
    check('saida_origem', emLista('origem', ORIGENS_SAIDA)),
    check('saida_situacao', emLista('situacao', SITUACOES_SAIDA)),
    index('saida_data').on(t.estabelecimentoId, t.executadoEm),
  ],
)

export const saidaItem = pgTable(
  'saida_item',
  {
    id: id(),
    empresaId: empresaId(),
    saidaId: uuid('saida_id').notNull(),
    itemId: uuid('item_id').notNull(),
    quantidade: numeric('quantidade', { precision: 14, scale: 3 }).notNull(),
    /** Código do produto no documento (associação memorizada). */
    codigoDocumento: text('codigo_documento'),
    nfeItemId: uuid('nfe_item_id'),
  },
  (t) => [
    foreignKey({ columns: [t.saidaId], foreignColumns: [saida.id] }).onDelete('cascade'),
    daEmpresa(t.itemId, t.empresaId, itemEstoque),
    daEmpresa(t.nfeItemId, t.empresaId, nfeItem),
    index('saida_item_saida').on(t.saidaId),
  ],
)

/** De qual lote saiu (cantina.md, De qual lote sai cada garrafa): um movimento por baixa. */
export const saidaBaixa = pgTable(
  'saida_baixa',
  {
    id: id(),
    empresaId: empresaId(),
    saidaItemId: uuid('saida_item_id').notNull(),
    /** Vazio = sem lote (aviso de recall). */
    loteItemId: uuid('lote_item_id'),
    localId: uuid('local_id').notNull(),
    quantidade: numeric('quantidade', { precision: 14, scale: 3 }).notNull(),
    estrategia: text('estrategia').notNull().$type<(typeof ESTRATEGIAS_USADAS)[number]>(),
    movimentoId: uuid('movimento_id').notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.saidaItemId], foreignColumns: [saidaItem.id] }).onDelete('cascade'),
    daEmpresa(t.loteItemId, t.empresaId, loteItem),
    daEmpresa(t.localId, t.empresaId, local),
    daEmpresa(t.movimentoId, t.empresaId, movimentoEstoque),
    check('saida_baixa_estrategia', emLista('estrategia', ESTRATEGIAS_USADAS)),
    index('saida_baixa_lote').on(t.loteItemId),
  ],
)

/**
 * Devolução (cantina.md, Devolução): as garrafas voltam ao lote comercial de origem, no local
 * escolhido (o de venda ou um de "avariadas").
 */
export const devolucao = pgTable(
  'devolucao',
  {
    id: id(),
    empresaId: empresaId(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    saidaId: uuid('saida_id'),
    executadoEm: dataHora('executado_em').notNull(),
    documento: text('documento'),
    motivo: text('motivo'),
    grupoId: uuid('grupo_id').notNull(),
    ...criacao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    foreignKey({ columns: [t.saidaId], foreignColumns: [saida.id] }),
    index('devolucao_saida').on(t.saidaId),
  ],
)

export const devolucaoItem = pgTable(
  'devolucao_item',
  {
    id: id(),
    empresaId: empresaId(),
    devolucaoId: uuid('devolucao_id').notNull(),
    baixaId: uuid('baixa_id'),
    itemId: uuid('item_id').notNull(),
    loteItemId: uuid('lote_item_id'),
    localId: uuid('local_id').notNull(),
    quantidade: numeric('quantidade', { precision: 14, scale: 3 }).notNull(),
    avariada: boolean('avariada').notNull().default(false),
    movimentoId: uuid('movimento_id').notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.devolucaoId], foreignColumns: [devolucao.id] }).onDelete('cascade'),
    foreignKey({ columns: [t.baixaId], foreignColumns: [saidaBaixa.id] }),
    daEmpresa(t.itemId, t.empresaId, itemEstoque),
    daEmpresa(t.loteItemId, t.empresaId, loteItem),
    daEmpresa(t.localId, t.empresaId, local),
    daEmpresa(t.movimentoId, t.empresaId, movimentoEstoque),
  ],
)
