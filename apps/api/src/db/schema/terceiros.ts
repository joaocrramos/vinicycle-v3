// Contrato de terceirização (cantina.md, Vinificação para terceiros e em terceiros; 03-modelo-de-
// dados.md, 2.5, Terceirização; IN MAPA 72/2018, art. 27). Vale para os dois sentidos: a empresa
// presta o serviço (vinificação para terceiro) ou contrata (produção em terceiro, "vinho cigano").
// O contrato não é obrigatório para nada: sem ele, a recepção e a entrada de granel de um titular
// pedem "ciente" (P29).
import {
  CHAVES_ATIVIDADE_CONTRATO,
  CHAVES_FORMA_TEXTO_ROTULO,
  CHAVES_REGISTRO_PRODUTO,
  CHAVES_SENTIDO_CONTRATO,
  CHAVES_TIPO_PERDA_TOLERADA,
  CHAVES_UNIDADE_PAGAMENTO_PRODUTO,
} from '@vinicycle/shared'
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { estabelecimento } from './acesso'
import { marca, produto } from './cantina'
import { alteracao, criacao, emLista, id, inativacao } from './comum'
import { documento, pessoa } from './gestao'
import { empresa } from './plataforma'

function daEmpresa(
  coluna: AnyPgColumn,
  empresaId: AnyPgColumn,
  alvo: { id: AnyPgColumn; empresaId: AnyPgColumn },
) {
  return foreignKey({ columns: [coluna, empresaId], foreignColumns: [alvo.id, alvo.empresaId] })
}

const empresaId = () =>
  uuid('empresa_id')
    .notNull()
    .references(() => empresa.id)

export const contratoTerceirizacao = pgTable(
  'contrato_terceirizacao',
  {
    id: id(),
    empresaId: empresaId(),
    sentido: text('sentido').notNull().$type<(typeof CHAVES_SENTIDO_CONTRATO)[number]>(),
    /** Número ou identificação do contrato, livre. */
    numero: text('numero'),
    /** Elaboração, padronização, envase, guarda (IN 72, art. 25, §§4º e 6º). */
    atividades: text('atividades')
      .array()
      .notNull()
      .$type<Array<(typeof CHAVES_ATIVIDADE_CONTRATO)[number]>>(),
    /** Cliente de vinificação (prestamos) ou cantina prestadora (contratamos). */
    contraparteId: uuid('contraparte_id').notNull(),
    /** Estabelecimento da empresa no contrato: quem produz ou quem recebe o vinho. */
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    registroMapaContraparte: text('registro_mapa_contraparte'),
    registroMapaContraparteValidade: date('registro_mapa_contraparte_validade'),
    /** Quem tem o registro do produto (IN 72, arts. 14 e 30). */
    registroProduto: text('registro_produto')
      .notNull()
      .$type<(typeof CHAVES_REGISTRO_PRODUTO)[number]>(),
    vigenciaInicio: date('vigencia_inicio').notNull(),
    /** Vazio = prazo indeterminado. */
    vigenciaFim: date('vigencia_fim'),
    insumosCantina: text('insumos_cantina'),
    insumosCliente: text('insumos_cliente'),
    perdaToleradaTipo:
      text('perda_tolerada_tipo').$type<(typeof CHAVES_TIPO_PERDA_TOLERADA)[number]>(),
    perdaToleradaValor: numeric('perda_tolerada_valor', { precision: 10, scale: 4 }),
    pagamentoDinheiro: boolean('pagamento_dinheiro').notNull().default(true),
    pagamentoProdutoValor: numeric('pagamento_produto_valor', { precision: 14, scale: 4 }),
    pagamentoProdutoUnidade: text('pagamento_produto_unidade').$type<
      (typeof CHAVES_UNIDADE_PAGAMENTO_PRODUTO)[number]
    >(),
    /** Prefixo do lote comercial: quem elaborou, quando o rótulo omite a cantina (art. 28, §2º). */
    prefixoLote: text('prefixo_lote'),
    formaTexto: text('forma_texto')
      .notNull()
      .default('produzido_para')
      .$type<(typeof CHAVES_FORMA_TEXTO_ROTULO)[number]>(),
    /** Texto do rótulo editado; vazio = o montado pelo sistema. */
    textoRotulo: text('texto_rotulo'),
    /** Comunicação da terceirização no SIPEAGRO (IN 72, art. 27, caput e §1º). */
    comunicadoSipeagroEm: date('comunicado_sipeagro_em'),
    protocoloSipeagro: text('protocolo_sipeagro'),
    /** O contrato mudou depois da comunicação: lembrete de comunicar de novo. */
    alteradoAposComunicacao: boolean('alterado_apos_comunicacao').notNull().default(false),
    /** Documento da Gestão (vencimento, versões); os anexos ficam no próprio contrato. */
    documentoId: uuid('documento_id'),
    observacoes: text('observacoes'),
    ...criacao(),
    ...alteracao(),
    ...inativacao(),
  },
  (t) => [
    daEmpresa(t.contraparteId, t.empresaId, pessoa),
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.documentoId, t.empresaId, documento),
    unique('contrato_terceirizacao_id_empresa').on(t.id, t.empresaId),
    index('contrato_terceirizacao_contraparte').on(t.contraparteId, t.vigenciaInicio),
    check('contrato_terceirizacao_sentido', emLista('sentido', CHAVES_SENTIDO_CONTRATO)),
    check(
      'contrato_terceirizacao_atividades',
      sql`cardinality(atividades) between 1 and 4 and atividades <@ array[${sql.raw(CHAVES_ATIVIDADE_CONTRATO.map((a) => `'${a}'`).join(', '))}]::text[]`,
    ),
    check(
      'contrato_terceirizacao_registro_produto',
      emLista('registro_produto', CHAVES_REGISTRO_PRODUTO),
    ),
    check('contrato_terceirizacao_forma_texto', emLista('forma_texto', CHAVES_FORMA_TEXTO_ROTULO)),
    check(
      'contrato_terceirizacao_vigencia',
      sql`vigencia_fim is null or vigencia_fim >= vigencia_inicio`,
    ),
    check(
      'contrato_terceirizacao_perda',
      sql`(perda_tolerada_tipo is null) = (perda_tolerada_valor is null) and (perda_tolerada_tipo is null or ${emLista('perda_tolerada_tipo', CHAVES_TIPO_PERDA_TOLERADA)})`,
    ),
    check(
      'contrato_terceirizacao_pagamento',
      sql`(pagamento_produto_valor is null) = (pagamento_produto_unidade is null) and (pagamento_produto_unidade is null or ${emLista('pagamento_produto_unidade', CHAVES_UNIDADE_PAGAMENTO_PRODUTO)}) and (pagamento_dinheiro or pagamento_produto_unidade is not null)`,
    ),
    check(
      'contrato_terceirizacao_prefixo',
      sql`prefixo_lote is null or prefixo_lote ~ '^[A-Z0-9]{1,6}$'`,
    ),
  ],
)

/** Itens de preço do serviço, só registrados (serviço, armazenagem por mês, envase por garrafa…). */
export const contratoTerceirizacaoPreco = pgTable(
  'contrato_terceirizacao_preco',
  {
    id: id(),
    empresaId: empresaId(),
    contratoId: uuid('contrato_id').notNull(),
    ordem: integer('ordem').notNull(),
    descricao: text('descricao').notNull(),
    valor: numeric('valor', { precision: 14, scale: 2 }).notNull(),
    unidade: text('unidade').notNull(),
  },
  (t) => [
    daEmpresa(t.contratoId, t.empresaId, contratoTerceirizacao).onDelete('cascade'),
    index('contrato_terceirizacao_preco_contrato').on(t.contratoId, t.ordem),
    check('contrato_terceirizacao_preco_valor', sql`valor >= 0`),
  ],
)

/** Marcas do contrato. Quando prestamos o serviço, a marca é da contraparte. */
export const contratoTerceirizacaoMarca = pgTable(
  'contrato_terceirizacao_marca',
  {
    id: id(),
    empresaId: empresaId(),
    contratoId: uuid('contrato_id').notNull(),
    marcaId: uuid('marca_id').notNull(),
  },
  (t) => [
    daEmpresa(t.contratoId, t.empresaId, contratoTerceirizacao).onDelete('cascade'),
    daEmpresa(t.marcaId, t.empresaId, marca),
    unique('contrato_terceirizacao_marca_unica').on(t.contratoId, t.marcaId),
    index('contrato_terceirizacao_marca_marca').on(t.marcaId),
  ],
)

/** Produtos do contrato (de uma das marcas do mesmo dono). */
export const contratoTerceirizacaoProduto = pgTable(
  'contrato_terceirizacao_produto',
  {
    id: id(),
    empresaId: empresaId(),
    contratoId: uuid('contrato_id').notNull(),
    produtoId: uuid('produto_id').notNull(),
  },
  (t) => [
    daEmpresa(t.contratoId, t.empresaId, contratoTerceirizacao).onDelete('cascade'),
    daEmpresa(t.produtoId, t.empresaId, produto),
    unique('contrato_terceirizacao_produto_unico').on(t.contratoId, t.produtoId),
    index('contrato_terceirizacao_produto_produto').on(t.produtoId),
  ],
)
