// Entidades transversais (03-modelo-de-dados.md, 1.13).
import { CATEGORIAS_ANEXO } from '@vinicycle/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { estabelecimento, usuario } from './acesso';
import { alteracao, criacao, dataHora, emLista, id, inativacao } from './comum';
import { empresa } from './plataforma';

/**
 * Rastro de tudo (P14). Somente inclusão: o usuário da API só insere e lê. Gravado na mesma
 * transação da mudança.
 */
export const auditoria = pgTable(
  'auditoria',
  {
    id: id(),
    ocorridoEm: dataHora('ocorrido_em').notNull().defaultNow(),
    /** Quem agiu de fato. Em personificação, o membro da equipe (P28). */
    usuarioId: uuid('usuario_id'),
    /** Usuário personificado, quando houver (P28). */
    personificadoId: uuid('personificado_id'),
    personificacaoId: uuid('personificacao_id'),
    empresaId: uuid('empresa_id').references(() => empresa.id),
    estabelecimentoId: uuid('estabelecimento_id'),
    acao: text('acao').notNull(),
    entidade: text('entidade'),
    registroId: uuid('registro_id'),
    /** Antes e depois de cada campo alterado: { campo: [antes, depois] }. */
    diferenca: jsonb('diferenca'),
    dados: jsonb('dados'),
    motivo: text('motivo'),
    ip: text('ip'),
    navegador: text('navegador'),
    requisicaoId: text('requisicao_id'),
  },
  (t) => [
    index('auditoria_empresa_data').on(t.empresaId, t.ocorridoEm),
    index('auditoria_registro').on(t.entidade, t.registroId),
    index('auditoria_usuario_data').on(t.usuarioId, t.ocorridoEm),
    index('auditoria_data').on(t.ocorridoEm),
  ],
);

/** Arquivos de qualquer registro (P15). O arquivo fica fora do banco. */
export const anexo = pgTable(
  'anexo',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    estabelecimentoId: uuid('estabelecimento_id').references(() => estabelecimento.id),
    entidade: text('entidade').notNull(),
    registroId: uuid('registro_id').notNull(),
    categoria: text('categoria').notNull().$type<(typeof CATEGORIAS_ANEXO)[number]>(),
    nomeOriginal: text('nome_original').notNull(),
    tipoMime: text('tipo_mime').notNull(),
    tamanhoBytes: bigint('tamanho_bytes', { mode: 'number' }).notNull(),
    hashSha256: text('hash_sha256').notNull(),
    caminho: text('caminho').notNull(),
    descricao: text('descricao'),
    ...criacao(),
    ...inativacao(),
  },
  (t) => [
    index('anexo_registro').on(t.empresaId, t.entidade, t.registroId),
    index('anexo_hash').on(t.empresaId, t.hashSha256),
    check('anexo_categoria', emLista('categoria', CATEGORIAS_ANEXO)),
    check('anexo_tamanho', sql`tamanho_bytes >= 0`),
  ],
);

/**
 * Próximo número de cada série (P19). Incremento só na confirmação, com a linha travada.
 * Estabelecimento vazio = série da plataforma (faturas).
 */
export const sequencia = pgTable(
  'sequencia',
  {
    id: id(),
    empresaId: uuid('empresa_id').references(() => empresa.id),
    estabelecimentoId: uuid('estabelecimento_id').references(() => estabelecimento.id),
    tipo: text('tipo').notNull(),
    periodo: text('periodo').notNull(),
    ultimo: integer('ultimo').notNull().default(0),
  },
  (t) => [
    unique('sequencia_serie').on(t.estabelecimentoId, t.tipo, t.periodo).nullsNotDistinct(),
    check('sequencia_empresa_estab', sql`(empresa_id is null) = (estabelecimento_id is null)`),
  ],
);

/** Máscara de cada código, por empresa (P19). */
export const formatoCodigo = pgTable(
  'formato_codigo',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    tipo: text('tipo').notNull(),
    mascara: text('mascara').notNull(),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [unique('formato_codigo_tipo').on(t.empresaId, t.tipo)],
);

/** Última ordenação, filtros e tamanho de página, por usuário e por tabela (P4). */
export const preferenciaListagem = pgTable(
  'preferencia_listagem',
  {
    id: id(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id),
    /** Vazio nas tabelas da Administração. */
    empresaId: uuid('empresa_id').references(() => empresa.id),
    tabela: text('tabela').notNull(),
    ordem: text('ordem'),
    direcao: text('direcao'),
    tamanho: integer('tamanho').notNull().default(10),
    filtros: jsonb('filtros').notNull().default({}),
    atualizadoEm: dataHora('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    unique('preferencia_listagem_tabela').on(t.usuarioId, t.empresaId, t.tabela).nullsNotDistinct(),
  ],
);
