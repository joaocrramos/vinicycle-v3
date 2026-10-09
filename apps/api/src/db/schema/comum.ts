// Colunas comuns (03-modelo-de-dados.md, 1.4).
import { sql } from 'drizzle-orm';
import { boolean, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

/** Identificador UUID. A aplicação gera v7 (ordenado no tempo); o banco tem v4 de reserva. */
export const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7())
    .default(sql`gen_random_uuid()`);

export const dataHora = (nome: string) => timestamp(nome, { withTimezone: true, mode: 'date' });

export const criacao = () => ({
  criadoEm: dataHora('criado_em').notNull().defaultNow(),
  criadoPor: uuid('criado_por'),
});

export const alteracao = () => ({
  atualizadoEm: dataHora('atualizado_em').notNull().defaultNow(),
  atualizadoPor: uuid('atualizado_por'),
  /** Controle de edição simultânea. */
  versao: integer('versao').notNull().default(1),
});

/** Inativar em vez de apagar (P26). */
export const inativacao = () => ({
  ativo: boolean('ativo').notNull().default(true),
  inativadoEm: dataHora('inativado_em'),
  inativadoPor: uuid('inativado_por'),
  motivoInativacao: text('motivo_inativacao'),
});

/** Monta a expressão SQL de uma lista fechada para CHECK. */
export function emLista(coluna: string, valores: readonly string[]) {
  return sql.raw(`${coluna} in (${valores.map((v) => `'${v}'`).join(', ')})`);
}
