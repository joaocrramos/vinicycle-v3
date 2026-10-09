// Livro de álcool etílico (cantina.md, Fermentação, chaptalização, álcool e atesto; Lei 7.678/1988,
// art. 29, §3º): cada entrada de álcool etílico é comunicada ao MAPA. A comunicação é registrada à
// mão (data e protocolo); as entradas e os usos vêm do livro de estoque.
import {
  type AnyPgColumn,
  date,
  foreignKey,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { estabelecimento } from './acesso';
import { criacao, id } from './comum';
import { movimentoEstoque } from './estoque';
import { empresa } from './plataforma';

function daEmpresa(
  coluna: AnyPgColumn,
  empresaId: AnyPgColumn,
  alvo: { id: AnyPgColumn; empresaId: AnyPgColumn },
) {
  return foreignKey({ columns: [coluna, empresaId], foreignColumns: [alvo.id, alvo.empresaId] });
}

export const comunicacaoAlcool = pgTable(
  'comunicacao_alcool',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    /** A entrada de álcool no livro de estoque. */
    movimentoId: uuid('movimento_id').notNull(),
    comunicadaEm: date('comunicada_em').notNull(),
    protocolo: text('protocolo'),
    observacao: text('observacao'),
    ...criacao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.movimentoId, t.empresaId, movimentoEstoque),
    uniqueIndex('comunicacao_alcool_movimento').on(t.movimentoId),
  ],
);
