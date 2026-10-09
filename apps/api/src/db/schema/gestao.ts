// Gestão (03-modelo-de-dados.md, 2.3; gestao.md).
import { SITUACOES_SIVIBE } from '@vinicycle/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { estabelecimento, usuario } from './acesso';
import { papel, tipoDocumento } from './catalogos';
import { alteracao, criacao, emLista, id, inativacao } from './comum';
import { ficha } from './ficha';
import { empresa } from './plataforma';

/** Cadastro único de pessoas com papéis (P2). Documento único por empresa (na ficha). */
export const pessoa = pgTable(
  'pessoa',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    fichaId: uuid('ficha_id')
      .notNull()
      .references(() => ficha.id),
    ...criacao(),
    ...alteracao(),
    ...inativacao(),
  },
  (t) => [
    unique('pessoa_id_empresa').on(t.id, t.empresaId),
    uniqueIndex('pessoa_ficha').on(t.fichaId),
    index('pessoa_empresa').on(t.empresaId),
  ],
);

/** Referência composta à pessoa da mesma empresa. */
const refPessoa = (t: { pessoaId: never; empresaId: never }, nome?: string) =>
  foreignKey({
    name: nome,
    columns: [t.pessoaId, t.empresaId],
    foreignColumns: [pessoa.id, pessoa.empresaId],
  }).onDelete('cascade');

export const pessoaPapel = pgTable(
  'pessoa_papel',
  {
    id: id(),
    empresaId: uuid('empresa_id').notNull(),
    pessoaId: uuid('pessoa_id').notNull(),
    papel: text('papel')
      .notNull()
      .references(() => papel.codigo),
    desde: date('desde')
      .notNull()
      .default(sql`current_date`),
    ativo: boolean('ativo').notNull().default(true),
  },
  (t) => [
    refPessoa(t as never),
    unique('pessoa_papel_unico').on(t.pessoaId, t.papel),
    index('pessoa_papel_empresa').on(t.empresaId, t.papel),
  ],
);

/** Extensões de papel: uma linha por pessoa, com a chave na própria pessoa. */
const extensao = () => ({
  pessoaId: uuid('pessoa_id').primaryKey(),
  empresaId: uuid('empresa_id').notNull(),
});

export const pessoaCliente = pgTable(
  'pessoa_cliente',
  { ...extensao(), condicoesComerciais: text('condicoes_comerciais') },
  (t) => [refPessoa(t as never)],
);

export const pessoaFornecedor = pgTable(
  'pessoa_fornecedor',
  {
    ...extensao(),
    /** Códigos da lista "categoria_fornecimento". */
    categorias: text('categorias')
      .array()
      .notNull()
      .default(sql`'{}'`),
  },
  (t) => [refPessoa(t as never)],
);

export const pessoaProdutorUva = pgTable(
  'pessoa_produtor_uva',
  {
    ...extensao(),
    numeroSivibe: text('numero_sivibe'),
    situacaoCadastro: text('situacao_cadastro')
      .notNull()
      .default('nao_verificado')
      .$type<(typeof SITUACOES_SIVIBE)[number]>(),
    declaracaoAnoAnterior: boolean('declaracao_ano_anterior'),
    conferidoEm: date('conferido_em'),
  },
  (t) => [
    refPessoa(t as never),
    check('pessoa_produtor_uva_situacao', emLista('situacao_cadastro', SITUACOES_SIVIBE)),
  ],
);

export const pessoaFuncionario = pgTable(
  'pessoa_funcionario',
  {
    ...extensao(),
    /** Código da lista "cargo". */
    cargo: text('cargo'),
    situacao: text('situacao')
      .notNull()
      .default('ativo')
      .$type<'ativo' | 'afastado' | 'desligado'>(),
  },
  (t) => [
    refPessoa(t as never),
    check('pessoa_funcionario_situacao', emLista('situacao', ['ativo', 'afastado', 'desligado'])),
  ],
);

export const pessoaLaboratorio = pgTable(
  'pessoa_laboratorio',
  {
    ...extensao(),
    credenciamentoMapa: text('credenciamento_mapa'),
    credenciamentoValidade: date('credenciamento_validade'),
    prazoMedioLaudoDias: integer('prazo_medio_laudo_dias'),
  },
  (t) => [refPessoa(t as never)],
);

export const pessoaRt = pgTable(
  'pessoa_rt',
  {
    ...extensao(),
    /** Código da lista "conselho_profissional". */
    conselho: text('conselho'),
    numeroRegistro: text('numero_registro'),
    artNumero: text('art_numero'),
    artValidade: date('art_validade'),
  },
  (t) => [refPessoa(t as never)],
);

export const pessoaFabricanteMarca = pgTable(
  'pessoa_fabricante_marca',
  {
    id: id(),
    empresaId: uuid('empresa_id').notNull(),
    pessoaId: uuid('pessoa_id').notNull(),
    marca: text('marca').notNull(),
  },
  (t) => [
    refPessoa(t as never),
    uniqueIndex('pessoa_fabricante_marca_unica').on(t.pessoaId, sql`lower(marca)`),
  ],
);

export const pessoaTransportadorPlaca = pgTable(
  'pessoa_transportador_placa',
  {
    id: id(),
    empresaId: uuid('empresa_id').notNull(),
    pessoaId: uuid('pessoa_id').notNull(),
    placa: text('placa').notNull(),
  },
  (t) => [
    refPessoa(t as never),
    unique('pessoa_transportador_placa_unica').on(t.pessoaId, t.placa),
  ],
);

/** Pessoas de contato de uma pessoa jurídica, sem documento obrigatório (gestao.md). */
export const pessoaContato = pgTable(
  'pessoa_contato',
  {
    id: id(),
    empresaId: uuid('empresa_id').notNull(),
    pessoaId: uuid('pessoa_id').notNull(),
    nome: text('nome').notNull(),
    cargo: text('cargo'),
    emails: text('emails')
      .array()
      .notNull()
      .default(sql`'{}'`),
    telefones: text('telefones')
      .array()
      .notNull()
      .default(sql`'{}'`),
  },
  (t) => [refPessoa(t as never), index('pessoa_contato_pessoa').on(t.pessoaId)],
);

/** Documento acompanhado (registro MAPA, licença, contrato…). Vazio no estabelecimento = empresa toda. */
export const documento = pgTable(
  'documento',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    estabelecimentoId: uuid('estabelecimento_id'),
    tipoDocumentoId: uuid('tipo_documento_id')
      .notNull()
      .references(() => tipoDocumento.id),
    titulo: text('titulo').notNull(),
    /** Vínculo opcional a um módulo (ex.: ENOTRACE). */
    modulo: text('modulo'),
    orgaoEmissor: text('orgao_emissor'),
    /** Responsável pela renovação (usuário da empresa). */
    responsavelId: uuid('responsavel_id').references(() => usuario.id),
    observacoes: text('observacoes'),
    ...criacao(),
    ...alteracao(),
    ...inativacao(),
  },
  (t) => [
    foreignKey({
      columns: [t.estabelecimentoId, t.empresaId],
      foreignColumns: [estabelecimento.id, estabelecimento.empresaId],
    }),
    unique('documento_id_empresa').on(t.id, t.empresaId),
    index('documento_empresa').on(t.empresaId),
  ],
);

/** Cada emissão ou renovação. Renovar cria versão nova; a anterior vira "substituída". */
export const documentoVersao = pgTable(
  'documento_versao',
  {
    id: id(),
    empresaId: uuid('empresa_id').notNull(),
    documentoId: uuid('documento_id').notNull(),
    numero: text('numero'),
    emissao: date('emissao'),
    vencimento: date('vencimento'),
    situacao: text('situacao').notNull().default('vigente').$type<'vigente' | 'substituida'>(),
    assinadoPor: text('assinado_por'),
    assinadoEm: date('assinado_em'),
    observacoes: text('observacoes'),
    anteriorId: uuid('anterior_id'),
    ...criacao(),
  },
  (t) => [
    foreignKey({
      columns: [t.documentoId, t.empresaId],
      foreignColumns: [documento.id, documento.empresaId],
    }).onDelete('cascade'),
    uniqueIndex('documento_versao_vigente')
      .on(t.documentoId)
      .where(sql`situacao = 'vigente'`),
    check('documento_versao_situacao', emLista('situacao', ['vigente', 'substituida'])),
    check(
      'documento_versao_datas',
      sql`vencimento is null or emissao is null or vencimento >= emissao`,
    ),
  ],
);

export const etiqueta = pgTable(
  'etiqueta',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    nome: text('nome').notNull(),
    cor: text('cor'),
    ...criacao(),
  },
  (t) => [
    unique('etiqueta_id_empresa').on(t.id, t.empresaId),
    uniqueIndex('etiqueta_nome').on(t.empresaId, sql`lower(nome)`),
  ],
);

export const documentoEtiqueta = pgTable(
  'documento_etiqueta',
  {
    documentoId: uuid('documento_id').notNull(),
    etiquetaId: uuid('etiqueta_id').notNull(),
    empresaId: uuid('empresa_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.documentoId, t.etiquetaId] }),
    foreignKey({
      columns: [t.documentoId, t.empresaId],
      foreignColumns: [documento.id, documento.empresaId],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.etiquetaId, t.empresaId],
      foreignColumns: [etiqueta.id, etiqueta.empresaId],
    }).onDelete('cascade'),
  ],
);

/** Configurações simples (gestao.md, Configurações). Estabelecimento vazio = da empresa. */
export const parametro = pgTable(
  'parametro',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    estabelecimentoId: uuid('estabelecimento_id'),
    chave: text('chave').notNull(),
    valor: jsonb('valor').notNull(),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    foreignKey({
      columns: [t.estabelecimentoId, t.empresaId],
      foreignColumns: [estabelecimento.id, estabelecimento.empresaId],
    }),
    unique('parametro_chave').on(t.empresaId, t.estabelecimentoId, t.chave).nullsNotDistinct(),
  ],
);
