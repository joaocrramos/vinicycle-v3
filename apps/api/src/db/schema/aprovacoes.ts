// Fluxo de aprovação (P27; 03-modelo-de-dados.md, 2.2; 04, roteiro do ciclo 8): a ação sujeita à
// aprovação vira um pedido pendente; aprovado, é feito na hora com os dados do pedido. Quais ações
// exigem aprovação é parâmetro da empresa ("aprovacoes"), não tabela própria.
import { CHAVES_SITUACAO_APROVACAO, CHAVES_TIPO_APROVACAO } from '@vinicycle/shared'
import { sql } from 'drizzle-orm'
import { check, index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { estabelecimento, usuario } from './acesso'
import { dataHora, emLista, id } from './comum'
import { empresa } from './plataforma'

export const solicitacaoAprovacao = pgTable(
  'solicitacao_aprovacao',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    estabelecimentoId: uuid('estabelecimento_id')
      .notNull()
      .references(() => estabelecimento.id),
    tipo: text('tipo').notNull().$type<(typeof CHAVES_TIPO_APROVACAO)[number]>(),
    /** O registro alvo (operação, inventário, mês, declaração). */
    entidade: text('entidade').notNull(),
    registroId: text('registro_id').notNull(),
    resumo: text('resumo').notNull(),
    /** O pedido como foi feito (motivo, "cientes", versão do registro), para fazer na aprovação. */
    dados: jsonb('dados').notNull(),
    situacao: text('situacao')
      .notNull()
      .default('pendente')
      .$type<(typeof CHAVES_SITUACAO_APROVACAO)[number]>(),
    solicitadoPor: uuid('solicitado_por')
      .notNull()
      .references(() => usuario.id),
    solicitadoEm: dataHora('solicitado_em').notNull().defaultNow(),
    decididoPor: uuid('decidido_por').references(() => usuario.id),
    decididoEm: dataHora('decidido_em'),
    /** Motivo da recusa ou do cancelamento. */
    motivo: text('motivo'),
    /** Por que a ação aprovada não pôde ser feita (algo mudou depois do pedido). */
    erro: text('erro'),
    /** Quem pediu viu a recusa ou a falha (o alerta some). */
    vistoEm: dataHora('visto_em'),
  },
  (t) => [
    check('solicitacao_aprovacao_tipo', emLista('tipo', CHAVES_TIPO_APROVACAO)),
    check('solicitacao_aprovacao_situacao', emLista('situacao', CHAVES_SITUACAO_APROVACAO)),
    check(
      'solicitacao_aprovacao_motivo',
      sql`situacao not in ('recusada', 'cancelada') or motivo is not null`,
    ),
    // Um pedido pendente por registro e tipo.
    uniqueIndex('solicitacao_aprovacao_pendente')
      .on(t.tipo, t.entidade, t.registroId)
      .where(sql`situacao = 'pendente'`),
    index('solicitacao_aprovacao_estabelecimento').on(t.estabelecimentoId, t.situacao),
  ],
)
