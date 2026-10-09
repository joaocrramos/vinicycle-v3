// Central de alertas (P20; 03-modelo-de-dados.md, 2.2, Alerta e Notificação): um alerta aberto por
// chave, que se resolve sozinho quando a causa some; a leitura é por usuário.
import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { estabelecimento, usuario } from './acesso'
import { dataHora, emLista, id } from './comum'
import { empresa } from './plataforma'

export const GRAVIDADES_ALERTA = ['info', 'atencao', 'critico'] as const

export const alerta = pgTable(
  'alerta',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    /** Vazio = da empresa toda (ex.: documento da empresa, declaração anual). */
    estabelecimentoId: uuid('estabelecimento_id').references(() => estabelecimento.id),
    tipo: text('tipo').notNull(),
    gravidade: text('gravidade').notNull().$type<(typeof GRAVIDADES_ALERTA)[number]>(),
    /** Tela de origem: só vê o alerta quem pode visualizá-la (P27). */
    funcionalidade: text('funcionalidade').notNull(),
    /** Deduplicação: um alerta aberto por chave (ex.: "documento:<id>:vencido"). */
    chave: text('chave').notNull(),
    mensagem: text('mensagem').notNull(),
    link: text('link'),
    venceEm: date('vence_em'),
    situacao: text('situacao').notNull().default('aberto').$type<'aberto' | 'resolvido'>(),
    abertoEm: dataHora('aberto_em').notNull().defaultNow(),
    resolvidoEm: dataHora('resolvido_em'),
  },
  (t) => [
    check('alerta_gravidade', emLista('gravidade', GRAVIDADES_ALERTA)),
    check('alerta_situacao', sql`situacao in ('aberto', 'resolvido')`),
    uniqueIndex('alerta_chave_aberta')
      .on(t.empresaId, t.chave)
      .where(sql`situacao = 'aberto'`),
    index('alerta_situacao').on(t.empresaId, t.situacao),
  ],
)

/** Leitura do alerta por usuário (2.2, Notificação: "lida em"). */
export const alertaLeitura = pgTable(
  'alerta_leitura',
  {
    alertaId: uuid('alerta_id')
      .notNull()
      .references(() => alerta.id, { onDelete: 'cascade' }),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    lidaEm: dataHora('lida_em').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.alertaId, t.usuarioId] })],
)
