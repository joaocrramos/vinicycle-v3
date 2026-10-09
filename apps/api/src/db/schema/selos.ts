// Selos numerados (cantina.md, Engarrafamento, Selos de indicação geográfica; 04, roteiro do ciclo
// 9): o selo é item de estoque com numeração. Entra por faixa (do nº X ao Y, com série opcional);
// cada produção do engarrafamento registra as faixas usadas e os números perdidos. Disponível =
// faixas recebidas menos as usadas e as perdidas; nenhum número se repete (integridade, P29).
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  bigint,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core'
import { estabelecimento } from './acesso'
import { itemEstoque } from './cantina'
import { criacao, dataHora, id } from './comum'
import { producaoParcial } from './envase'
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

/** Faixa recebida: a entrada no estoque (grupo do livro) com a numeração. */
export const seloFaixa = pgTable(
  'selo_faixa',
  {
    id: id(),
    empresaId: empresaId(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    itemId: uuid('item_id').notNull(),
    /** Série ou prefixo impresso no selo; vazio = sem série. */
    serie: text('serie').notNull().default(''),
    inicio: bigint('inicio', { mode: 'number' }).notNull(),
    fim: bigint('fim', { mode: 'number' }).notNull(),
    grupoId: uuid('grupo_id').notNull(),
    recebidaEm: dataHora('recebida_em').notNull(),
    documento: text('documento'),
    /** Estornada a entrada, a faixa deixa de valer. */
    estornadaEm: dataHora('estornada_em'),
    ...criacao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.itemId, t.empresaId, itemEstoque),
    check('selo_faixa_ordem', sql`inicio >= 0 and fim >= inicio`),
    index('selo_faixa_item').on(t.itemId, t.serie),
  ],
)

/** Números usados ou perdidos numa produção do engarrafamento. */
export const seloUso = pgTable(
  'selo_uso',
  {
    id: id(),
    empresaId: empresaId(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    itemId: uuid('item_id').notNull(),
    producaoId: uuid('producao_id').notNull(),
    tipo: text('tipo').notNull().$type<'usado' | 'perdido'>(),
    serie: text('serie').notNull().default(''),
    inicio: bigint('inicio', { mode: 'number' }).notNull(),
    fim: bigint('fim', { mode: 'number' }).notNull(),
    ...criacao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.itemId, t.empresaId, itemEstoque),
    foreignKey({
      columns: [t.producaoId],
      foreignColumns: [producaoParcial.id],
    }).onDelete('cascade'),
    check('selo_uso_tipo', sql`tipo in ('usado', 'perdido')`),
    check('selo_uso_ordem', sql`inicio >= 0 and fim >= inicio`),
    index('selo_uso_item').on(t.itemId, t.serie),
    index('selo_uso_producao').on(t.producaoId),
  ],
)
