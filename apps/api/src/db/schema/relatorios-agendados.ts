// Relatório agendado (03-modelo-de-dados.md, 2.2; 04, roteiro do ciclo 8): envio periódico por
// e-mail, por usuário, sempre com as permissões dele no momento do envio (P27).
import { CHAVES_FREQUENCIA_ENVIO, CHAVES_RELATORIO_AGENDAVEL } from '@vinicycle/shared'
import { boolean, check, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { estabelecimento, usuario } from './acesso'
import { criacao, dataHora, emLista, id } from './comum'
import { empresa } from './plataforma'

export const relatorioAgendado = pgTable(
  'relatorio_agendado',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id),
    estabelecimentoId: uuid('estabelecimento_id')
      .notNull()
      .references(() => estabelecimento.id),
    relatorio: text('relatorio').notNull().$type<(typeof CHAVES_RELATORIO_AGENDAVEL)[number]>(),
    frequencia: text('frequencia').notNull().$type<(typeof CHAVES_FREQUENCIA_ENVIO)[number]>(),
    proximoEnvio: dataHora('proximo_envio').notNull(),
    ultimoEnvio: dataHora('ultimo_envio'),
    /** Por que o último não saiu (ex.: sem a permissão da tela). */
    ultimoAviso: text('ultimo_aviso'),
    /** E-mail, WhatsApp ou SMS (P20; ciclo 12). Sem franquia ou sem telefone, vai por e-mail. */
    canal: text('canal').notNull().default('email').$type<'email' | 'whatsapp' | 'sms'>(),
    ativo: boolean('ativo').notNull().default(true),
    ...criacao(),
  },
  (t) => [
    check('relatorio_agendado_relatorio', emLista('relatorio', CHAVES_RELATORIO_AGENDAVEL)),
    check('relatorio_agendado_frequencia', emLista('frequencia', CHAVES_FREQUENCIA_ENVIO)),
    check('relatorio_agendado_canal', emLista('canal', ['email', 'whatsapp', 'sms'])),
    uniqueIndex('relatorio_agendado_unico').on(t.usuarioId, t.estabelecimentoId, t.relatorio),
    index('relatorio_agendado_proximo').on(t.proximoEnvio),
  ],
)
