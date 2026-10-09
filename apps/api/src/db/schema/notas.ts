// Notas fiscais importadas (P11; 03-modelo-de-dados.md, 2.4): o sistema só guarda a referência e
// lê o XML; não calcula imposto (FISCAL.md). A chave de acesso impede importar a nota duas vezes.
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { estabelecimento, local } from './acesso';
import { itemEstoque } from './cantina';
import { variedade } from './catalogos';
import { alteracao, criacao, dataHora, emLista, id } from './comum';
import { pessoa } from './gestao';
import { empresa } from './plataforma';

export const TIPOS_USO_NFE = ['compra', 'uva', 'venda', 'devolucao', 'remessa', 'retorno'] as const;
export const SITUACOES_NFE = ['em_conferencia', 'lancada', 'descartada', 'estornada'] as const;
export const ORIGENS_NFE = ['arquivo', 'sefaz'] as const;

export const nfe = pgTable(
  'nfe',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    chave: text('chave').notNull(),
    numero: text('numero').notNull(),
    serie: text('serie'),
    emissao: dataHora('emissao').notNull(),
    emitenteId: uuid('emitente_id'),
    /** Como veio na nota, para conferência. */
    emitenteDocumento: text('emitente_documento').notNull(),
    emitenteNome: text('emitente_nome').notNull(),
    destinatarioDocumento: text('destinatario_documento'),
    destinatarioNome: text('destinatario_nome'),
    tipoUso: text('tipo_uso').notNull().$type<(typeof TIPOS_USO_NFE)[number]>(),
    origem: text('origem').notNull().default('arquivo').$type<(typeof ORIGENS_NFE)[number]>(),
    /** O XML fica como anexo da nota (P15). */
    anexoId: uuid('anexo_id'),
    situacao: text('situacao')
      .notNull()
      .default('em_conferencia')
      .$type<(typeof SITUACOES_NFE)[number]>(),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    foreignKey({
      columns: [t.estabelecimentoId, t.empresaId],
      foreignColumns: [estabelecimento.id, estabelecimento.empresaId],
    }),
    foreignKey({
      columns: [t.emitenteId, t.empresaId],
      foreignColumns: [pessoa.id, pessoa.empresaId],
    }),
    unique('nfe_id_empresa').on(t.id, t.empresaId),
    uniqueIndex('nfe_chave').on(t.empresaId, t.chave),
    check('nfe_chave_formato', sql`chave ~ '^[0-9]{44}$'`),
    check('nfe_tipo_uso', emLista('tipo_uso', TIPOS_USO_NFE)),
    check('nfe_origem', emLista('origem', ORIGENS_NFE)),
    check('nfe_situacao', emLista('situacao', SITUACOES_NFE)),
  ],
);

export const nfeItem = pgTable(
  'nfe_item',
  {
    id: id(),
    empresaId: uuid('empresa_id').notNull(),
    nfeId: uuid('nfe_id').notNull(),
    numeroItem: integer('numero_item').notNull(),
    codigoEmitente: text('codigo_emitente').notNull(),
    descricao: text('descricao').notNull(),
    quantidade: numeric('quantidade', { precision: 15, scale: 4 }).notNull(),
    unidade: text('unidade').notNull(),
    valor: numeric('valor', { precision: 15, scale: 2 }),
    /** Lote, fabricação e validade: do grupo de rastreabilidade do XML, conferidos pelo usuário. */
    loteNota: text('lote_nota'),
    fabricacaoNota: date('fabricacao_nota'),
    validadeNota: date('validade_nota'),
    /** Item de estoque associado (insumos e embalagens, ciclo 5). */
    itemEstoqueId: uuid('item_estoque_id'),
    /** Nota da uva: a variedade correspondente (acréscimo do ciclo 3 ao modelo). */
    variedadeId: uuid('variedade_id').references(() => variedade.id),
    /** Quantos da unidade da base cabem em uma unidade da nota (ex.: 1 t = 1000 kg). */
    conversao: numeric('conversao', { precision: 15, scale: 6 }),
    /** Local de estoque de destino (o módulo é o do item). */
    localId: uuid('local_id'),
    /** Motivo do descarte da importação; vazio = entra no estoque. */
    descartado: text('descartado'),
  },
  (t) => [
    foreignKey({
      columns: [t.localId, t.empresaId],
      foreignColumns: [local.id, local.empresaId],
    }),
    foreignKey({
      columns: [t.nfeId, t.empresaId],
      foreignColumns: [nfe.id, nfe.empresaId],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.itemEstoqueId, t.empresaId],
      foreignColumns: [itemEstoque.id, itemEstoque.empresaId],
    }),
    unique('nfe_item_id_empresa').on(t.id, t.empresaId),
    uniqueIndex('nfe_item_numero').on(t.nfeId, t.numeroItem),
  ],
);

/** Lembra a associação para as próximas notas do mesmo emitente (P11). */
export const associacaoItem = pgTable(
  'associacao_item',
  {
    id: id(),
    empresaId: uuid('empresa_id').notNull(),
    /** Emitente; vazio na saída (a nota de venda é emitida pela própria empresa). */
    pessoaId: uuid('pessoa_id'),
    codigoEmitente: text('codigo_emitente').notNull(),
    sentido: text('sentido').notNull().$type<'entrada' | 'saida'>(),
    itemEstoqueId: uuid('item_estoque_id'),
    variedadeId: uuid('variedade_id').references(() => variedade.id),
    conversao: numeric('conversao', { precision: 15, scale: 6 }),
    localId: uuid('local_id'),
    descartar: text('descartar'),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    foreignKey({
      columns: [t.pessoaId, t.empresaId],
      foreignColumns: [pessoa.id, pessoa.empresaId],
    }),
    foreignKey({
      columns: [t.itemEstoqueId, t.empresaId],
      foreignColumns: [itemEstoque.id, itemEstoque.empresaId],
    }),
    foreignKey({
      columns: [t.localId, t.empresaId],
      foreignColumns: [local.id, local.empresaId],
    }),
    uniqueIndex('associacao_item_chave').on(
      t.empresaId,
      sql`coalesce(pessoa_id, '00000000-0000-0000-0000-000000000000'::uuid)`,
      t.codigoEmitente,
      t.sentido,
    ),
    check('associacao_item_sentido', emLista('sentido', ['entrada', 'saida'])),
    index('associacao_item_pessoa').on(t.pessoaId),
  ],
);
