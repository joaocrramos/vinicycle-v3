// Declarações (cantina.md, Declarações e fechamento; 03-modelo-de-dados.md, 2.5): a declaração anual
// de produção e estoques ao MAPA (Portaria MAPA 615/2023) e a de uvas no SIVIBE (IN MAPA 59/2020),
// com o instantâneo dos números. A anual entregue trava o ano do estabelecimento; mudanças só por
// retificação registrada, com motivo e novo protocolo (P13).
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { estabelecimento, usuario } from './acesso';
import { dataHora, id } from './comum';
import { empresa } from './plataforma';

export const TIPOS_DECLARACAO = ['anual_mapa', 'sivibe'] as const;
export const SITUACOES_DECLARACAO = ['declarada', 'em_retificacao', 'retificada'] as const;

export const declaracao = pgTable(
  'declaracao',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    estabelecimentoId: uuid('estabelecimento_id')
      .notNull()
      .references(() => estabelecimento.id),
    tipo: text('tipo').notNull().$type<(typeof TIPOS_DECLARACAO)[number]>(),
    ano: integer('ano').notNull(),
    situacao: text('situacao').notNull().$type<(typeof SITUACOES_DECLARACAO)[number]>(),
    /** Instantâneo dos números entregues, na ordem do formulário. */
    numeros: jsonb('numeros').notNull(),
    /** Protocolo do gov.br (ou do SIVIBE); o recibo vai em anexo. */
    protocolo: text('protocolo').notNull(),
    declaradaEm: dataHora('declarada_em').notNull(),
    declaradaPor: uuid('declarada_por')
      .notNull()
      .references(() => usuario.id),
  },
  (t) => [
    uniqueIndex('declaracao_ano').on(t.estabelecimentoId, t.tipo, t.ano),
    check('declaracao_tipo', sql`tipo in ('anual_mapa', 'sivibe')`),
    check('declaracao_situacao', sql`situacao in ('declarada', 'em_retificacao', 'retificada')`),
    check('declaracao_ano_valido', sql`ano between 2000 and 2200`),
  ],
);

/** Retificação: aberta com motivo (destrava o ano), concluída com novo protocolo e números. */
export const declaracaoRetificacao = pgTable(
  'declaracao_retificacao',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    declaracaoId: uuid('declaracao_id')
      .notNull()
      .references(() => declaracao.id),
    motivo: text('motivo').notNull(),
    abertaEm: dataHora('aberta_em').notNull(),
    abertaPor: uuid('aberta_por')
      .notNull()
      .references(() => usuario.id),
    /** Números e protocolo que valiam antes da retificação. */
    numerosAnteriores: jsonb('numeros_anteriores').notNull(),
    protocoloAnterior: text('protocolo_anterior').notNull(),
    concluidaEm: dataHora('concluida_em'),
    concluidaPor: uuid('concluida_por').references(() => usuario.id),
    protocolo: text('protocolo'),
  },
  (t) => [
    index('declaracao_retificacao_declaracao').on(t.declaracaoId),
    check('declaracao_retificacao_conclusao', sql`(concluida_em is null) = (protocolo is null)`),
  ],
);
