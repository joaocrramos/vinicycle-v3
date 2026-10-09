// Engarrafamento (cantina.md, Engarrafamento; 03-modelo-de-dados.md, 2.5, Engarrafamento): ordem de
// produção com formatos e recipientes de origem, produções parciais (uma operação "engarrafamento"
// por dia) e o lote comercial do contrarrótulo, um por ordem, com a composição do que foi
// engarrafado (5.6). Selos de IG e espumante tradicional ficam para 2027 (04, roteiro do ciclo 5).
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { estabelecimento, local } from './acesso';
import { itemEstoque, produto, produtoFormato, produtoRotulo, recipiente } from './cantina';
import { alteracao, criacao, dataHora, emLista, id } from './comum';
import { loteItem } from './estoque';
import { pessoa } from './gestao';
import { empresa } from './plataforma';
import { lote, operacao, projeto } from './producao';

function daEmpresa(
  coluna: AnyPgColumn,
  empresaId: AnyPgColumn,
  alvo: { id: AnyPgColumn; empresaId: AnyPgColumn },
) {
  return foreignKey({ columns: [coluna, empresaId], foreignColumns: [alvo.id, alvo.empresaId] });
}

const empresaId = () =>
  uuid('empresa_id')
    .notNull()
    .references(() => empresa.id);

export const SITUACOES_ORDEM = ['planejada', 'em_execucao', 'encerrada', 'cancelada'] as const;
export const ORIGENS_LOTE_COMERCIAL = ['envase', 'retorno_terceiro', 'carga_inicial'] as const;

/** Lote do contrarrótulo (cantina.md, Lote comercial): um por ordem, mesmo com vários formatos. */
export const loteComercial = pgTable(
  'lote_comercial',
  {
    id: id(),
    empresaId: empresaId(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    codigo: text('codigo').notNull(),
    projetoId: uuid('projeto_id'),
    produtoId: uuid('produto_id'),
    /** Vazio = a própria empresa. */
    titularId: uuid('titular_id'),
    primeiroEnvase: dataHora('primeiro_envase'),
    ultimoEnvase: dataHora('ultimo_envase'),
    /** Instantâneo da composição do que foi engarrafado (5.6), refeito a cada produção e estorno. */
    composicao: jsonb('composicao'),
    chaptalizado: boolean('chaptalizado').notNull().default(false),
    litros: numeric('litros', { precision: 12, scale: 2 }).notNull().default('0'),
    origem: text('origem').notNull().$type<(typeof ORIGENS_LOTE_COMERCIAL)[number]>(),
    ...criacao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.projetoId, t.empresaId, projeto),
    daEmpresa(t.produtoId, t.empresaId, produto),
    daEmpresa(t.titularId, t.empresaId, pessoa),
    unique('lote_comercial_id_empresa').on(t.id, t.empresaId),
    uniqueIndex('lote_comercial_codigo').on(t.estabelecimentoId, t.codigo),
    check('lote_comercial_origem', emLista('origem', ORIGENS_LOTE_COMERCIAL)),
  ],
);

/** Ordem de engarrafamento (2.5): não reserva estoque; vários formatos, um só lote comercial. */
export const ordemEngarrafamento = pgTable(
  'ordem_engarrafamento',
  {
    id: id(),
    empresaId: empresaId(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    projetoId: uuid('projeto_id').notNull(),
    produtoId: uuid('produto_id').notNull(),
    rotuloId: uuid('rotulo_id'),
    dataPrevista: date('data_prevista').notNull(),
    /** Prestador (engarrafadora); vazio = a própria vinícola. */
    engarrafadoPorId: uuid('engarrafado_por_id'),
    /** Local de estoque onde entra o produto acabado e de onde saem os materiais. */
    localProdutoId: uuid('local_produto_id').notNull(),
    localMateriaisId: uuid('local_materiais_id').notNull(),
    situacao: text('situacao')
      .notNull()
      .default('planejada')
      .$type<(typeof SITUACOES_ORDEM)[number]>(),
    loteComercialId: uuid('lote_comercial_id'),
    observacao: text('observacao'),
    motivoCancelamento: text('motivo_cancelamento'),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.projetoId, t.empresaId, projeto),
    daEmpresa(t.produtoId, t.empresaId, produto),
    foreignKey({
      columns: [t.rotuloId],
      foreignColumns: [produtoRotulo.id],
    }),
    daEmpresa(t.engarrafadoPorId, t.empresaId, pessoa),
    daEmpresa(t.localProdutoId, t.empresaId, local),
    daEmpresa(t.localMateriaisId, t.empresaId, local),
    daEmpresa(t.loteComercialId, t.empresaId, loteComercial),
    unique('ordem_engarrafamento_id_empresa').on(t.id, t.empresaId),
    uniqueIndex('ordem_engarrafamento_lote').on(t.loteComercialId),
    check('ordem_engarrafamento_situacao', emLista('situacao', SITUACOES_ORDEM)),
    index('ordem_engarrafamento_projeto').on(t.projetoId),
  ],
);

/** Cada formato envasado na ordem, com as garrafas previstas. */
export const ordemFormato = pgTable(
  'ordem_formato',
  {
    id: id(),
    empresaId: empresaId(),
    ordemId: uuid('ordem_id').notNull(),
    formatoId: uuid('formato_id').notNull(),
    garrafasPrevistas: integer('garrafas_previstas').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.ordemId, t.empresaId],
      foreignColumns: [ordemEngarrafamento.id, ordemEngarrafamento.empresaId],
    }).onDelete('cascade'),
    daEmpresa(t.formatoId, t.empresaId, produtoFormato),
    unique('ordem_formato_unico').on(t.ordemId, t.formatoId),
    check('ordem_formato_garrafas', sql`garrafas_previstas >= 0`),
  ],
);

/** Recipientes de onde sai o vinho (o lote é o que está nele). */
export const ordemOrigem = pgTable(
  'ordem_origem',
  {
    id: id(),
    empresaId: empresaId(),
    ordemId: uuid('ordem_id').notNull(),
    recipienteId: uuid('recipiente_id').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.ordemId, t.empresaId],
      foreignColumns: [ordemEngarrafamento.id, ordemEngarrafamento.empresaId],
    }).onDelete('cascade'),
    daEmpresa(t.recipienteId, t.empresaId, recipiente),
    unique('ordem_origem_unica').on(t.ordemId, t.recipienteId),
  ],
);

/**
 * Um dia de envase (2.5, Produção parcial): a operação "engarrafamento" (litros por recipiente), as
 * garrafas por formato, a perda de vinho e a composição do que saiu dos recipientes.
 */
export const producaoParcial = pgTable(
  'producao_parcial',
  {
    id: id(),
    empresaId: empresaId(),
    ordemId: uuid('ordem_id').notNull(),
    operacaoId: uuid('operacao_id').notNull(),
    executadoEm: dataHora('executado_em').notNull(),
    litrosTirados: numeric('litros_tirados', { precision: 12, scale: 2 }).notNull(),
    litrosEngarrafados: numeric('litros_engarrafados', { precision: 12, scale: 2 }).notNull(),
    perdaLitros: numeric('perda_litros', { precision: 12, scale: 2 }).notNull(),
    /** Composição dos litros tirados (média ponderada dos recipientes). */
    composicao: jsonb('composicao').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.ordemId, t.empresaId],
      foreignColumns: [ordemEngarrafamento.id, ordemEngarrafamento.empresaId],
    }),
    daEmpresa(t.operacaoId, t.empresaId, operacao),
    uniqueIndex('producao_parcial_operacao').on(t.operacaoId),
    index('producao_parcial_ordem').on(t.ordemId),
  ],
);

export const producaoFormato = pgTable(
  'producao_formato',
  {
    id: id(),
    empresaId: empresaId(),
    producaoId: uuid('producao_id').notNull(),
    formatoId: uuid('formato_id').notNull(),
    garrafas: integer('garrafas').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.producaoId],
      foreignColumns: [producaoParcial.id],
    }).onDelete('cascade'),
    daEmpresa(t.formatoId, t.empresaId, produtoFormato),
    check('producao_formato_garrafas', sql`garrafas > 0`),
  ],
);

/** Material previsto pela ficha de embalagem × real consumido (2.5, Consumo de material). */
export const producaoMaterial = pgTable(
  'producao_material',
  {
    id: id(),
    empresaId: empresaId(),
    producaoId: uuid('producao_id').notNull(),
    itemId: uuid('item_id').notNull(),
    loteItemId: uuid('lote_item_id'),
    previsto: numeric('previsto', { precision: 14, scale: 3 }).notNull(),
    real: numeric('real', { precision: 14, scale: 3 }).notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.producaoId],
      foreignColumns: [producaoParcial.id],
    }).onDelete('cascade'),
    daEmpresa(t.itemId, t.empresaId, itemEstoque),
    daEmpresa(t.loteItemId, t.empresaId, loteItem),
  ],
);

/** Lotes de produção que formam o lote comercial (genealogia de saída, 5.6). */
export const loteComercialOrigem = pgTable(
  'lote_comercial_origem',
  {
    loteComercialId: uuid('lote_comercial_id').notNull(),
    empresaId: empresaId(),
    loteId: uuid('lote_id').notNull(),
    litros: numeric('litros', { precision: 12, scale: 2 }).notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.loteComercialId, t.empresaId],
      foreignColumns: [loteComercial.id, loteComercial.empresaId],
    }).onDelete('cascade'),
    daEmpresa(t.loteId, t.empresaId, lote),
    unique('lote_comercial_origem_unica').on(t.loteComercialId, t.loteId),
  ],
);
