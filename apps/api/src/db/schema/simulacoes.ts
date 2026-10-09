// Simulador de corte (cantina.md, Trasfega e corte; 04, roteiro do ciclo 9): proporções testadas
// sem mexer no volume, salvas no projeto com data e autor. A aprovada vira o corte já preenchido.
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { estabelecimento, usuario } from './acesso';
import { alteracao, criacao, dataHora, id } from './comum';
import { empresa } from './plataforma';
import { projeto } from './producao';

function daEmpresa(
  coluna: AnyPgColumn,
  empresaId: AnyPgColumn,
  alvo: { id: AnyPgColumn; empresaId: AnyPgColumn },
) {
  return foreignKey({ columns: [coluna, empresaId], foreignColumns: [alvo.id, alvo.empresaId] });
}

export const MODOS_SIMULACAO = ['percentual', 'litros'] as const;
export const SITUACOES_SIMULACAO = ['rascunho', 'aprovada', 'descartada'] as const;

export const simulacaoCorte = pgTable(
  'simulacao_corte',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    projetoId: uuid('projeto_id').notNull(),
    nome: text('nome').notNull(),
    modo: text('modo').notNull().$type<(typeof MODOS_SIMULACAO)[number]>(),
    /** Volume desejado, no modo percentual. */
    volumeLitros: numeric('volume_litros', { precision: 12, scale: 2 }),
    /** Partes testadas: recipiente, lote, % e litros (instantâneo do que foi digitado). */
    itens: jsonb('itens').notNull(),
    /** Composição e o que o rótulo pode declarar, no momento em que foi salva. */
    resultado: jsonb('resultado').notNull(),
    observacao: text('observacao'),
    situacao: text('situacao')
      .notNull()
      .default('rascunho')
      .$type<(typeof SITUACOES_SIMULACAO)[number]>(),
    aprovadaEm: dataHora('aprovada_em'),
    aprovadaPor: uuid('aprovada_por').references(() => usuario.id),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.projetoId, t.empresaId, projeto),
    index('simulacao_corte_projeto').on(t.projetoId),
    check('simulacao_corte_modo', sql`modo in ('percentual', 'litros')`),
    check('simulacao_corte_situacao', sql`situacao in ('rascunho', 'aprovada', 'descartada')`),
    check(
      'simulacao_corte_volume',
      sql`modo <> 'percentual' or (volume_litros is not null and volume_litros > 0)`,
    ),
  ],
);
