// Fechamento mensal (cantina.md, Declarações e fechamento; 03-modelo-de-dados.md, 2.5): mês fechado
// por estabelecimento, com o instantâneo da lista de conferência e do relatório do mês; nenhum
// lançamento entra em mês fechado (P13). Reabrir pede a permissão própria e o motivo (P27).
import { check, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { estabelecimento, usuario } from './acesso';
import { dataHora, id } from './comum';
import { empresa } from './plataforma';

export const fechamentoMensal = pgTable(
  'fechamento_mensal',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    estabelecimentoId: uuid('estabelecimento_id')
      .notNull()
      .references(() => estabelecimento.id),
    ano: integer('ano').notNull(),
    mes: integer('mes').notNull(),
    situacao: text('situacao').notNull().$type<'fechado' | 'reaberto'>(),
    conferencia: jsonb('conferencia').notNull(),
    relatorio: jsonb('relatorio').notNull(),
    fechadoEm: dataHora('fechado_em').notNull(),
    fechadoPor: uuid('fechado_por')
      .notNull()
      .references(() => usuario.id),
    reabertoEm: dataHora('reaberto_em'),
    reabertoPor: uuid('reaberto_por').references(() => usuario.id),
    motivoReabertura: text('motivo_reabertura'),
  },
  (t) => [
    uniqueIndex('fechamento_mensal_mes').on(t.estabelecimentoId, t.ano, t.mes),
    check('fechamento_mensal_situacao', sql`situacao in ('fechado', 'reaberto')`),
    check('fechamento_mensal_mes_valido', sql`mes between 1 and 12`),
  ],
);
