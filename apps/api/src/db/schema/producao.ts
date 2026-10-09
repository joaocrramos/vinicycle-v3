// Produção da cantina: projeto e plano, recepção da uva, lotes, operações, livros de volume e de
// uva, genealogia e composição por recipiente (03-modelo-de-dados.md, 2.5 e seções 4 e 5).
// Livros (movimentos e versões da composição) são só de inclusão (P13): ver 0005_seguranca_producao.
import {
  CHAVES_EMBALAGEM_GRANEL,
  CHAVES_ORIGEM_COMPONENTE,
  CHAVES_SITUACAO_AMOSTRA,
  CHAVES_SITUACAO_PROJETO,
  CHAVES_TIPO_ENTRADA_GRANEL,
  CHAVES_TIPO_MOVIMENTO,
  CHAVES_TIPO_OPERACAO,
  CHAVES_TIPO_SAIDA_GRANEL,
  DECISOES_MISTURA,
  ORIGENS_LOTE,
  PAPEIS_LINHA,
  SITUACOES_LOTE,
  SITUACOES_OPERACAO,
  SITUACOES_ROMANEIO,
  TIPOS_GENEALOGIA,
  TIPOS_LOTE,
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
  jsonb,
  numeric,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { estabelecimento, local } from './acesso'
import { itemEstoque, recipiente, tipoTratamentoParametro } from './cantina'
import { classeProduto, parametroAnalise, variedade } from './catalogos'
import { alteracao, criacao, dataHora, emLista, id, inativacao } from './comum'
import { pessoa } from './gestao'
import { nfe, nfeItem } from './notas'
import { empresa } from './plataforma'
import { contratoTerceirizacao } from './terceiros'

/** Chave estrangeira dentro da mesma empresa (03-modelo-de-dados.md, 1.2). */
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

const ORIGENS_ROMANEIO = ['vinhedo_proprio', 'fornecedor'] as const
const PAPEIS_GENEALOGIA = TIPOS_GENEALOGIA
const TIPOS_RESIDUO = ['engaco', 'bagaco'] as const
const TIPOS_HIGIENIZACAO = ['higienizacao', 'manutencao'] as const

// Projeto e plano ------------------------------------------------------------------------------

/** O vinho que se pretende fazer (cantina.md, Projeto de vinho). */
export const projeto = pgTable(
  'projeto',
  {
    id: id(),
    empresaId: empresaId(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    codigo: text('codigo').notNull(),
    nome: text('nome').notNull(),
    safraPrevista: integer('safra_prevista').notNull(),
    cicloPrevisto: text('ciclo_previsto'),
    classeProdutoId: uuid('classe_produto_id').references(() => classeProduto.id),
    /** Códigos das listas "cor_vinho", "teor_acucar" e "metodo_espumante". */
    cor: text('cor'),
    teorAcucar: text('teor_acucar'),
    metodoEspumante: text('metodo_espumante'),
    teorAlcoolicoPretendido: numeric('teor_alcoolico_pretendido', { precision: 4, scale: 1 }),
    volumePrevistoLitros: numeric('volume_previsto_litros', { precision: 12, scale: 2 }),
    kgPrevistos: numeric('kg_previstos', { precision: 12, scale: 1 }),
    enologoId: uuid('enologo_id'),
    projetoOrigemId: uuid('projeto_origem_id'),
    incorporadoAoProjetoId: uuid('incorporado_ao_projeto_id'),
    situacao: text('situacao')
      .notNull()
      .default('planejado')
      .$type<(typeof CHAVES_SITUACAO_PROJETO)[number]>(),
    situacaoDesde: dataHora('situacao_desde').notNull().defaultNow(),
    observacoes: text('observacoes'),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.enologoId, t.empresaId, pessoa),
    unique('projeto_id_empresa').on(t.id, t.empresaId),
    uniqueIndex('projeto_codigo').on(t.estabelecimentoId, t.codigo),
    check('projeto_situacao', emLista('situacao', CHAVES_SITUACAO_PROJETO)),
    check('projeto_safra', sql`safra_prevista between 1900 and 2200`),
  ],
)

/** Variedades previstas, sem percentual: o real vem da composição (cantina.md, Dados do projeto). */
export const projetoVariedade = pgTable(
  'projeto_variedade',
  {
    projetoId: uuid('projeto_id').notNull(),
    empresaId: empresaId(),
    variedadeId: uuid('variedade_id')
      .notNull()
      .references(() => variedade.id),
  },
  (t) => [
    daEmpresa(t.projetoId, t.empresaId, projeto),
    unique('projeto_variedade_pk').on(t.projetoId, t.variedadeId),
  ],
)

/** Plano reutilizável com dias relativos (cantina.md, Modelos de plano). */
export const modeloPlano = pgTable(
  'modelo_plano',
  {
    id: id(),
    empresaId: empresaId(),
    nome: text('nome').notNull(),
    descricao: text('descricao'),
    ...criacao(),
    ...alteracao(),
    ...inativacao(),
  },
  (t) => [
    unique('modelo_plano_id_empresa').on(t.id, t.empresaId),
    uniqueIndex('modelo_plano_nome').on(t.empresaId, sql`lower(nome)`),
  ],
)

export const modeloPlanoEtapa = pgTable(
  'modelo_plano_etapa',
  {
    id: id(),
    empresaId: empresaId(),
    modeloId: uuid('modelo_id').notNull(),
    tipoOperacao: text('tipo_operacao').notNull(),
    /** Dia 0 = desengace. */
    diaRelativo: integer('dia_relativo').notNull(),
    observacao: text('observacao'),
    ordem: integer('ordem').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.modeloId, t.empresaId],
      foreignColumns: [modeloPlano.id, modeloPlano.empresaId],
    }).onDelete('cascade'),
    unique('modelo_plano_etapa_id_empresa').on(t.id, t.empresaId),
    check('modelo_plano_etapa_tipo', emLista('tipo_operacao', CHAVES_TIPO_OPERACAO)),
  ],
)

/** Passo planejado do projeto (cantina.md, Plano do projeto). */
export const planoEtapa = pgTable(
  'plano_etapa',
  {
    id: id(),
    empresaId: empresaId(),
    projetoId: uuid('projeto_id').notNull(),
    tipoOperacao: text('tipo_operacao').notNull(),
    dataPrevista: date('data_prevista').notNull(),
    recipienteId: uuid('recipiente_id'),
    observacao: text('observacao'),
    ordem: integer('ordem').notNull(),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    daEmpresa(t.projetoId, t.empresaId, projeto),
    daEmpresa(t.recipienteId, t.empresaId, recipiente),
    unique('plano_etapa_id_empresa').on(t.id, t.empresaId),
    check('plano_etapa_tipo', emLista('tipo_operacao', CHAVES_TIPO_OPERACAO)),
  ],
)

/** Dose prevista, na etapa do plano ou do modelo (cantina.md, Previsto × executado). */
export const planoInsumo = pgTable(
  'plano_insumo',
  {
    id: id(),
    empresaId: empresaId(),
    planoEtapaId: uuid('plano_etapa_id'),
    modeloEtapaId: uuid('modelo_etapa_id'),
    itemEstoqueId: uuid('item_estoque_id').notNull(),
    dose: numeric('dose', { precision: 12, scale: 4 }).notNull(),
    /** Ex.: g/hL, mL/hL, g/L. */
    unidade: text('unidade').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.planoEtapaId, t.empresaId],
      foreignColumns: [planoEtapa.id, planoEtapa.empresaId],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.modeloEtapaId, t.empresaId],
      foreignColumns: [modeloPlanoEtapa.id, modeloPlanoEtapa.empresaId],
    }).onDelete('cascade'),
    daEmpresa(t.itemEstoqueId, t.empresaId, itemEstoque),
    check('plano_insumo_dono', sql`(plano_etapa_id is null) <> (modelo_etapa_id is null)`),
    check('plano_insumo_dose', sql`dose > 0`),
  ],
)

// Vinhedo (cadastro mínimo em 2026; o resto fica para o VitiTrack) -------------------------------

export const propriedade = pgTable(
  'propriedade',
  {
    id: id(),
    empresaId: empresaId(),
    nome: text('nome').notNull(),
    /** Vazio = a própria empresa. */
    donoId: uuid('dono_id'),
    numeroSivibe: text('numero_sivibe'),
    municipio: text('municipio'),
    uf: text('uf'),
    codigoIbge: text('codigo_ibge'),
    observacoes: text('observacoes'),
    ...criacao(),
    ...alteracao(),
    ...inativacao(),
  },
  (t) => [
    daEmpresa(t.donoId, t.empresaId, pessoa),
    unique('propriedade_id_empresa').on(t.id, t.empresaId),
    uniqueIndex('propriedade_nome').on(
      t.empresaId,
      sql`coalesce(dono_id, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`lower(nome)`,
    ),
  ],
)

export const parcela = pgTable(
  'parcela',
  {
    id: id(),
    empresaId: empresaId(),
    propriedadeId: uuid('propriedade_id').notNull(),
    nome: text('nome').notNull(),
    variedadeId: uuid('variedade_id').references(() => variedade.id),
    areaHa: numeric('area_ha', { precision: 10, scale: 4 }),
    ...criacao(),
    ...alteracao(),
    ...inativacao(),
  },
  (t) => [
    daEmpresa(t.propriedadeId, t.empresaId, propriedade),
    unique('parcela_id_empresa').on(t.id, t.empresaId),
    uniqueIndex('parcela_nome').on(t.propriedadeId, sql`lower(nome)`),
    check('parcela_area', sql`area_ha is null or area_ha > 0`),
  ],
)

// Lotes ----------------------------------------------------------------------------------------

/** Porção identificada de mosto ou vinho (cantina.md, Conceitos; 2.5, Lote de produção). */
export const lote = pgTable(
  'lote',
  {
    id: id(),
    empresaId: empresaId(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    codigo: text('codigo').notNull(),
    projetoId: uuid('projeto_id').notNull(),
    /** Vazio = a própria empresa (vinificação própria). */
    titularId: uuid('titular_id'),
    tipo: text('tipo').notNull().$type<(typeof TIPOS_LOTE)[number]>(),
    /** Código da lista "etapa_producao". */
    etapa: text('etapa'),
    origem: text('origem').notNull().$type<(typeof ORIGENS_LOTE)[number]>(),
    safra: integer('safra'),
    ciclo: text('ciclo'),
    /** Litros medidos na prensagem ÷ kg de uva (cantina.md, Quilos → litros). */
    rendimentoReal: numeric('rendimento_real', { precision: 6, scale: 4 }),
    situacao: text('situacao').notNull().default('ativo').$type<(typeof SITUACOES_LOTE)[number]>(),
    operacaoOrigemId: uuid('operacao_origem_id'),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.projetoId, t.empresaId, projeto),
    daEmpresa(t.titularId, t.empresaId, pessoa),
    unique('lote_id_empresa').on(t.id, t.empresaId),
    uniqueIndex('lote_codigo').on(t.estabelecimentoId, t.codigo),
    check('lote_tipo', emLista('tipo', TIPOS_LOTE)),
    check('lote_tipo_titular', sql`(tipo = 'propria') = (titular_id is null)`),
    check('lote_origem', emLista('origem', ORIGENS_LOTE)),
    check('lote_situacao', emLista('situacao', SITUACOES_LOTE)),
    index('lote_projeto').on(t.projetoId),
  ],
)

/** Histórico de etapas do lote, mudadas pelo enólogo (cantina.md, Etapas de produção). */
export const loteEtapa = pgTable(
  'lote_etapa',
  {
    id: id(),
    empresaId: empresaId(),
    loteId: uuid('lote_id').notNull(),
    etapa: text('etapa').notNull(),
    desde: dataHora('desde').notNull().defaultNow(),
    por: uuid('por'),
  },
  (t) => [daEmpresa(t.loteId, t.empresaId, lote), index('lote_etapa_lote').on(t.loteId)],
)

// Recepção da uva -------------------------------------------------------------------------------

/** Uma carga recebida (cantina.md, Romaneio). Código atribuído na confirmação (P19). */
export const romaneio = pgTable(
  'romaneio',
  {
    id: id(),
    empresaId: empresaId(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    codigo: text('codigo'),
    chegadaEm: dataHora('chegada_em').notNull(),
    projetoId: uuid('projeto_id').notNull(),
    origem: text('origem').notNull().$type<(typeof ORIGENS_ROMANEIO)[number]>(),
    fornecedorId: uuid('fornecedor_id'),
    /** Dono da uva na vinificação para terceiro; vazio = a própria empresa. */
    donoUvaId: uuid('dono_uva_id'),
    /** Contrato de terceirização com o dono da uva (opcional; sem ele, "ciente"). */
    contratoId: uuid('contrato_id'),
    nfeId: uuid('nfe_id'),
    nfNumero: text('nf_numero'),
    nfSerie: text('nf_serie'),
    nfEmissao: date('nf_emissao'),
    nfChave: text('nf_chave'),
    transportadorId: uuid('transportador_id'),
    placa: text('placa'),
    caixas: integer('caixas'),
    situacao: text('situacao')
      .notNull()
      .default('rascunho')
      .$type<(typeof SITUACOES_ROMANEIO)[number]>(),
    confirmadoEm: dataHora('confirmado_em'),
    confirmadoPor: uuid('confirmado_por'),
    /** Estorno do romaneio: só sem uva processada (P13). */
    estornadoEm: dataHora('estornado_em'),
    estornadoPor: uuid('estornado_por'),
    motivoEstorno: text('motivo_estorno'),
    observacoes: text('observacoes'),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.projetoId, t.empresaId, projeto),
    daEmpresa(t.fornecedorId, t.empresaId, pessoa),
    daEmpresa(t.donoUvaId, t.empresaId, pessoa),
    daEmpresa(t.contratoId, t.empresaId, contratoTerceirizacao),
    daEmpresa(t.transportadorId, t.empresaId, pessoa),
    daEmpresa(t.nfeId, t.empresaId, nfe),
    unique('romaneio_id_empresa').on(t.id, t.empresaId),
    uniqueIndex('romaneio_codigo').on(t.estabelecimentoId, t.codigo),
    check('romaneio_origem', emLista('origem', ORIGENS_ROMANEIO)),
    check('romaneio_situacao', emLista('situacao', SITUACOES_ROMANEIO)),
    check('romaneio_fornecedor', sql`origem <> 'fornecedor' or fornecedor_id is not null`),
    check(
      'romaneio_confirmado',
      sql`(situacao = 'rascunho') = (codigo is null) and (situacao = 'rascunho') = (confirmado_em is null)`,
    ),
    check(
      'romaneio_estornado',
      sql`(situacao = 'estornado') = (estornado_em is not null) and (situacao <> 'estornado' or motivo_estorno is not null)`,
    ),
    check('romaneio_nf_chave', sql`nf_chave is null or nf_chave ~ '^[0-9]{44}$'`),
    check('romaneio_caixas', sql`caixas is null or caixas >= 0`),
    index('romaneio_projeto').on(t.projetoId),
  ],
)

/** Uma variedade da carga (cantina.md, Dados de cada item). */
export const romaneioItem = pgTable(
  'romaneio_item',
  {
    id: id(),
    empresaId: empresaId(),
    romaneioId: uuid('romaneio_id').notNull(),
    ordem: integer('ordem').notNull(),
    variedadeId: uuid('variedade_id')
      .notNull()
      .references(() => variedade.id),
    parcelaId: uuid('parcela_id'),
    dataColheita: date('data_colheita').notNull(),
    /** Calculada pela data da colheita. */
    safra: integer('safra').notNull(),
    ciclo: text('ciclo'),
    /** Obrigatório na confirmação; o rascunho pode esperar a medição. */
    brix: numeric('brix', { precision: 5, scale: 2 }),
    ph: numeric('ph', { precision: 4, scale: 2 }),
    acidezTotal: numeric('acidez_total', { precision: 6, scale: 2 }),
    /** % de podridão. */
    sanidade: numeric('sanidade', { precision: 5, scale: 2 }),
    temperatura: numeric('temperatura', { precision: 4, scale: 1 }),
    organica: boolean('organica').notNull().default(false),
    candidataIp: boolean('candidata_ip').notNull().default(false),
    dataPoda: date('data_poda'),
    /** Destino indicado na recepção: lote existente (opcional). */
    loteId: uuid('lote_id'),
    /** Linha da nota importada que preencheu o item (P11). */
    nfeItemId: uuid('nfe_item_id'),
    observacoes: text('observacoes'),
  },
  (t) => [
    foreignKey({
      columns: [t.romaneioId, t.empresaId],
      foreignColumns: [romaneio.id, romaneio.empresaId],
    }).onDelete('cascade'),
    daEmpresa(t.parcelaId, t.empresaId, parcela),
    daEmpresa(t.loteId, t.empresaId, lote),
    daEmpresa(t.nfeItemId, t.empresaId, nfeItem),
    unique('romaneio_item_id_empresa').on(t.id, t.empresaId),
    check('romaneio_item_brix', sql`brix is null or (brix >= 0 and brix <= 60)`),
    check('romaneio_item_sanidade', sql`sanidade is null or sanidade between 0 and 100`),
  ],
)

/** Cada passagem na balança: líquido = bruto − tara (digitada; balança integrada no futuro). */
export const pesagem = pgTable(
  'pesagem',
  {
    id: id(),
    empresaId: empresaId(),
    itemId: uuid('item_id').notNull(),
    pesadoEm: dataHora('pesado_em').notNull(),
    brutoKg: numeric('bruto_kg', { precision: 12, scale: 1 }).notNull(),
    taraKg: numeric('tara_kg', { precision: 12, scale: 1 }).notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.itemId, t.empresaId],
      foreignColumns: [romaneioItem.id, romaneioItem.empresaId],
    }).onDelete('cascade'),
    check('pesagem_liquido', sql`bruto_kg > tara_kg and tara_kg >= 0`),
  ],
)

// Operações ------------------------------------------------------------------------------------

/** Cabeçalho de todo evento da cantina (cantina.md, Regras comuns das operações). */
export const operacao = pgTable(
  'operacao',
  {
    id: id(),
    empresaId: empresaId(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    /** Atribuído na confirmação (P19). */
    codigo: text('codigo'),
    tipo: text('tipo').notNull(),
    executadoEm: dataHora('executado_em').notNull(),
    /** Gravado pelo sistema na confirmação. */
    lancadoEm: dataHora('lancado_em'),
    executadoPorId: uuid('executado_por_id'),
    /** Enólogo ou RT (IN MAPA 49/2011, art. 6º). */
    responsavelId: uuid('responsavel_id'),
    projetoId: uuid('projeto_id'),
    planoEtapaId: uuid('plano_etapa_id'),
    /** Mistura de lotes que o enólogo registrou como corte (cantina.md, Trasfega e corte). */
    eCorte: boolean('e_corte').notNull().default(false),
    /** Detalhes da operação (frações, estimativa digitada…), para o histórico. */
    dados: jsonb('dados'),
    observacao: text('observacao'),
    situacao: text('situacao')
      .notNull()
      .default('rascunho')
      .$type<(typeof SITUACOES_OPERACAO)[number]>(),
    estornoDeId: uuid('estorno_de_id'),
    motivo: text('motivo'),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.executadoPorId, t.empresaId, pessoa),
    daEmpresa(t.responsavelId, t.empresaId, pessoa),
    daEmpresa(t.projetoId, t.empresaId, projeto),
    daEmpresa(t.planoEtapaId, t.empresaId, planoEtapa),
    unique('operacao_id_empresa').on(t.id, t.empresaId),
    uniqueIndex('operacao_codigo').on(t.estabelecimentoId, t.codigo),
    check('operacao_tipo', emLista('tipo', CHAVES_TIPO_OPERACAO)),
    check('operacao_situacao', emLista('situacao', SITUACOES_OPERACAO)),
    check(
      'operacao_confirmada',
      sql`(situacao = 'rascunho') = (codigo is null) and (situacao = 'rascunho') = (lancado_em is null)`,
    ),
    index('operacao_projeto').on(t.projetoId),
  ],
)

/** Origens, destinos, perdas e ajustes da operação (2.5, Linha da operação). */
export const operacaoLinha = pgTable(
  'operacao_linha',
  {
    id: id(),
    empresaId: empresaId(),
    operacaoId: uuid('operacao_id').notNull(),
    ordem: integer('ordem').notNull(),
    papel: text('papel').notNull().$type<(typeof PAPEIS_LINHA)[number]>(),
    recipienteId: uuid('recipiente_id'),
    loteId: uuid('lote_id'),
    litros: numeric('litros', { precision: 12, scale: 2 }),
    /** Código da lista "fracao_prensa". */
    fracaoPrensa: text('fracao_prensa'),
    /** Código da lista "motivo_perda". */
    motivoPerda: text('motivo_perda'),
    mistura: text('mistura').$type<(typeof DECISOES_MISTURA)[number]>(),
    esvaziarOrigem: boolean('esvaziar_origem').notNull().default(false),
    litrosMedidos: numeric('litros_medidos', { precision: 12, scale: 2 }),
  },
  (t) => [
    foreignKey({
      columns: [t.operacaoId, t.empresaId],
      foreignColumns: [operacao.id, operacao.empresaId],
    }).onDelete('cascade'),
    daEmpresa(t.recipienteId, t.empresaId, recipiente),
    daEmpresa(t.loteId, t.empresaId, lote),
    unique('operacao_linha_id_empresa').on(t.id, t.empresaId),
    check('operacao_linha_papel', emLista('papel', PAPEIS_LINHA)),
    check(
      'operacao_linha_mistura',
      sql`mistura is null or ${emLista('mistura', DECISOES_MISTURA)}`,
    ),
  ],
)

/** Engaço e bagaço, com destino (cantina.md, Resíduos; opcional). */
export const operacaoResiduo = pgTable(
  'operacao_residuo',
  {
    id: id(),
    empresaId: empresaId(),
    operacaoId: uuid('operacao_id').notNull(),
    tipo: text('tipo').notNull().$type<(typeof TIPOS_RESIDUO)[number]>(),
    kg: numeric('kg', { precision: 12, scale: 1 }).notNull(),
    /** Código da lista "destino_residuo". */
    destino: text('destino'),
  },
  (t) => [
    foreignKey({
      columns: [t.operacaoId, t.empresaId],
      foreignColumns: [operacao.id, operacao.empresaId],
    }).onDelete('cascade'),
    check('operacao_residuo_tipo', emLista('tipo', TIPOS_RESIDUO)),
    check('operacao_residuo_kg', sql`kg > 0`),
  ],
)

/**
 * Insumo aplicado (2.5, Adição de insumo): item e lote do estoque, ou descrição do não estocado;
 * dose, volume tratado e a quantidade baixada (na unidade base do item). Base: registros dos
 * insumos (Decreto 12.709/2025, art. 119, III) e rastreabilidade (art. 122, §1º).
 */
export const operacaoInsumo = pgTable(
  'operacao_insumo',
  {
    id: id(),
    empresaId: empresaId(),
    operacaoId: uuid('operacao_id').notNull(),
    recipienteId: uuid('recipiente_id').notNull(),
    loteId: uuid('lote_id').notNull(),
    itemId: uuid('item_id'),
    loteItemId: uuid('lote_item_id'),
    descricao: text('descricao'),
    dose: numeric('dose', { precision: 14, scale: 4 }).notNull(),
    unidade: text('unidade').notNull(),
    volumeTratado: numeric('volume_tratado', { precision: 12, scale: 2 }).notNull(),
    /** Na unidade base do item; vazio no insumo não estocado. */
    quantidade: numeric('quantidade', { precision: 14, scale: 3 }),
    so2: numeric('so2', { precision: 8, scale: 2 }),
    aplicadoEm: dataHora('aplicado_em').notNull(),
    temperatura: numeric('temperatura', { precision: 4, scale: 1 }),
  },
  (t) => [
    foreignKey({
      columns: [t.operacaoId, t.empresaId],
      foreignColumns: [operacao.id, operacao.empresaId],
    }).onDelete('cascade'),
    daEmpresa(t.recipienteId, t.empresaId, recipiente),
    daEmpresa(t.loteId, t.empresaId, lote),
    daEmpresa(t.itemId, t.empresaId, itemEstoque),
    check('operacao_insumo_item', sql`(item_id is null) <> (descricao is null)`),
    check('operacao_insumo_dose', sql`dose > 0 and volume_tratado > 0`),
    index('operacao_insumo_lote_item').on(t.loteItemId),
    index('operacao_insumo_operacao').on(t.operacaoId),
  ],
)

/** Chaptalização (2.5): açúcar, g/L, ganho estimado e a classe usada no alerta. */
export const operacaoChaptalizacao = pgTable(
  'operacao_chaptalizacao',
  {
    operacaoId: uuid('operacao_id').primaryKey(),
    empresaId: empresaId(),
    acucarKg: numeric('acucar_kg', { precision: 12, scale: 3 }).notNull(),
    gramasPorLitro: numeric('gramas_por_litro', { precision: 8, scale: 2 }).notNull(),
    ganhoEstimado: numeric('ganho_estimado', { precision: 5, scale: 2 }).notNull(),
    /** Regra aplicada (chave), quando havia. */
    regra: text('regra'),
  },
  (t) => [
    foreignKey({
      columns: [t.operacaoId, t.empresaId],
      foreignColumns: [operacao.id, operacao.empresaId],
    }).onDelete('cascade'),
  ],
)

/** Parâmetro técnico do tratamento (2.5, Parâmetro técnico da operação). */
export const operacaoParametro = pgTable(
  'operacao_parametro',
  {
    id: id(),
    empresaId: empresaId(),
    operacaoId: uuid('operacao_id').notNull(),
    parametroId: uuid('parametro_id').notNull(),
    valor: text('valor').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.operacaoId, t.empresaId],
      foreignColumns: [operacao.id, operacao.empresaId],
    }).onDelete('cascade'),
    daEmpresa(t.parametroId, t.empresaId, tipoTratamentoParametro),
  ],
)

/**
 * Higienização ou manutenção de recipiente (2.5; cantina.md, Recipientes): operação sem volume,
 * uma linha por recipiente (várias barricas numa operação, como no atesto). Devolve o recipiente a
 * "ativo"; a situação de antes fica gravada para o estorno. Base: Decreto 12.709/2025, art. 120, IV.
 */
export const operacaoHigienizacao = pgTable(
  'operacao_higienizacao',
  {
    id: id(),
    empresaId: empresaId(),
    operacaoId: uuid('operacao_id').notNull(),
    recipienteId: uuid('recipiente_id').notNull(),
    tipo: text('tipo').notNull().$type<(typeof TIPOS_HIGIENIZACAO)[number]>(),
    produto: text('produto'),
    dose: text('dose'),
    situacaoAnterior: text('situacao_anterior').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.operacaoId, t.empresaId],
      foreignColumns: [operacao.id, operacao.empresaId],
    }).onDelete('cascade'),
    daEmpresa(t.recipienteId, t.empresaId, recipiente),
    check('operacao_higienizacao_tipo', emLista('tipo', TIPOS_HIGIENIZACAO)),
    index('operacao_higienizacao_recipiente').on(t.recipienteId),
  ],
)

/**
 * Entrada e saída de granel (03-modelo-de-dados.md, 2.5, Granel): nota, partes, GLT, embalagem e a
 * confirmação do recebimento. Sem GLT na saída: aviso (Decreto 12.709/2025, arts. 203, IV, e 235).
 */
export const operacaoGranel = pgTable(
  'operacao_granel',
  {
    operacaoId: uuid('operacao_id').primaryKey(),
    empresaId: empresaId(),
    sentido: text('sentido').notNull().$type<'entrada' | 'saida'>(),
    /** Entrada: compra, retorno de terceiro, outra. Saída: venda, remessa, devolução, outra. */
    tipo: text('tipo').notNull(),
    notaNumero: text('nota_numero'),
    notaChave: text('nota_chave'),
    remetenteId: uuid('remetente_id'),
    destinatarioId: uuid('destinatario_id'),
    transportadorId: uuid('transportador_id'),
    glt: text('glt'),
    embalagem: text('embalagem').$type<(typeof CHAVES_EMBALAGEM_GRANEL)[number]>(),
    recebimentoConfirmadoEm: date('recebimento_confirmado_em'),
    recebimentoConfirmadoPor: uuid('recebimento_confirmado_por'),
  },
  (t) => [
    foreignKey({
      columns: [t.operacaoId, t.empresaId],
      foreignColumns: [operacao.id, operacao.empresaId],
    }).onDelete('cascade'),
    daEmpresa(t.remetenteId, t.empresaId, pessoa),
    daEmpresa(t.destinatarioId, t.empresaId, pessoa),
    daEmpresa(t.transportadorId, t.empresaId, pessoa),
    check('operacao_granel_sentido', sql`sentido in ('entrada', 'saida')`),
    check(
      'operacao_granel_tipo',
      sql`(sentido = 'entrada' and ${emLista('tipo', CHAVES_TIPO_ENTRADA_GRANEL)}) or (sentido = 'saida' and ${emLista('tipo', CHAVES_TIPO_SAIDA_GRANEL)})`,
    ),
    check('operacao_granel_embalagem', emLista('embalagem', CHAVES_EMBALAGEM_GRANEL)),
    check('operacao_granel_chave', sql`nota_chave ~ '^[0-9]{44}$'`),
    index('operacao_granel_glt').on(t.glt),
  ],
)

// Análises e fermentações ----------------------------------------------------------------------

const TIPOS_ANALISE = ['interna', 'laudo'] as const
const TIPOS_FERMENTACAO = ['alcoolica', 'malolatica'] as const

/** Pedido de análise externa (2.5, Amostra): coletada → enviada → laudo recebido. */
export const amostra = pgTable(
  'amostra',
  {
    id: id(),
    empresaId: empresaId(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    codigo: text('codigo').notNull(),
    loteId: uuid('lote_id').notNull(),
    recipienteId: uuid('recipiente_id'),
    coletadaEm: dataHora('coletada_em').notNull(),
    laboratorioId: uuid('laboratorio_id').notNull(),
    /** Data em que o laudo deveria chegar; passou dela, o laudo está atrasado. */
    prazo: date('prazo'),
    situacao: text('situacao')
      .notNull()
      .default('coletada')
      .$type<(typeof CHAVES_SITUACAO_AMOSTRA)[number]>(),
    enviadaEm: dataHora('enviada_em'),
    observacao: text('observacao'),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.loteId, t.empresaId, lote),
    daEmpresa(t.recipienteId, t.empresaId, recipiente),
    daEmpresa(t.laboratorioId, t.empresaId, pessoa),
    unique('amostra_id_empresa').on(t.id, t.empresaId),
    uniqueIndex('amostra_codigo').on(t.estabelecimentoId, t.codigo),
    check('amostra_situacao', emLista('situacao', CHAVES_SITUACAO_AMOSTRA)),
    index('amostra_lote').on(t.loteId),
  ],
)

/** Leitura interna ou laudo (2.5, Análise): do lote, com o recipiente, o laboratório e o pedido. */
export const analise = pgTable(
  'analise',
  {
    id: id(),
    empresaId: empresaId(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    loteId: uuid('lote_id').notNull(),
    recipienteId: uuid('recipiente_id'),
    amostraEm: dataHora('amostra_em').notNull(),
    tipo: text('tipo').notNull().default('interna').$type<(typeof TIPOS_ANALISE)[number]>(),
    /** Laboratório externo (pessoa com papel "laboratório"). */
    laboratorioId: uuid('laboratorio_id'),
    /** Pedido que o laudo fecha (cantina.md, Laboratório). */
    amostraId: uuid('amostra_id'),
    /** Número do laudo. */
    documento: text('documento'),
    observacao: text('observacao'),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.loteId, t.empresaId, lote),
    daEmpresa(t.recipienteId, t.empresaId, recipiente),
    daEmpresa(t.laboratorioId, t.empresaId, pessoa),
    daEmpresa(t.amostraId, t.empresaId, amostra),
    unique('analise_id_empresa').on(t.id, t.empresaId),
    check('analise_tipo', emLista('tipo', TIPOS_ANALISE)),
    index('analise_lote').on(t.loteId, t.amostraEm),
    uniqueIndex('analise_amostra').on(t.amostraId),
  ],
)

/** Valor de um parâmetro (2.5, Resultado da análise), na unidade padrão e como foi digitado. */
export const analiseResultado = pgTable(
  'analise_resultado',
  {
    id: id(),
    empresaId: empresaId(),
    analiseId: uuid('analise_id').notNull(),
    parametroId: uuid('parametro_id')
      .notNull()
      .references(() => parametroAnalise.id),
    valor: numeric('valor', { precision: 14, scale: 4 }).notNull(),
    valorDigitado: text('valor_digitado'),
    unidadeDigitada: text('unidade_digitada'),
    foraFaixa: boolean('fora_faixa').notNull().default(false),
  },
  (t) => [
    foreignKey({
      columns: [t.analiseId, t.empresaId],
      foreignColumns: [analise.id, analise.empresaId],
    }).onDelete('cascade'),
    index('analise_resultado_analise').on(t.analiseId),
  ],
)

/**
 * Fermentação alcoólica ou malolática de um lote (2.5, Fermentação): começa e termina por
 * operações; o fim é sugerido pelas leituras e confirmado pelo enólogo (cantina.md, Fermentações).
 */
export const fermentacao = pgTable(
  'fermentacao',
  {
    id: id(),
    empresaId: empresaId(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    loteId: uuid('lote_id').notNull(),
    tipo: text('tipo').notNull().$type<(typeof TIPOS_FERMENTACAO)[number]>(),
    operacaoInicioId: uuid('operacao_inicio_id').notNull(),
    operacaoFimId: uuid('operacao_fim_id'),
    fimSugeridoEm: dataHora('fim_sugerido_em'),
    ...criacao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.loteId, t.empresaId, lote),
    daEmpresa(t.operacaoInicioId, t.empresaId, operacao),
    daEmpresa(t.operacaoFimId, t.empresaId, operacao),
    check('fermentacao_tipo', emLista('tipo', TIPOS_FERMENTACAO)),
    index('fermentacao_lote').on(t.loteId),
  ],
)

// Inventário da cantina -------------------------------------------------------------------------

const SITUACOES_INVENTARIO = ['rascunho', 'confirmado'] as const

/**
 * Sessão de contagem dos recipientes (2.5, Inventário da cantina; cantina.md, Inventário). O
 * cantineiro digita o medido; a confirmação lança de uma vez os ajustes das diferenças numa
 * operação "ajuste de inventário", que fica ligada aqui.
 */
export const inventarioCantina = pgTable(
  'inventario_cantina',
  {
    id: id(),
    empresaId: empresaId(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    /** Data e hora da contagem: é a data de execução dos ajustes. */
    contadoEm: dataHora('contado_em').notNull(),
    /** Local (galpão, cantina) contado; vazio = todos os recipientes. */
    localId: uuid('local_id'),
    situacao: text('situacao')
      .notNull()
      .default('rascunho')
      .$type<(typeof SITUACOES_INVENTARIO)[number]>(),
    operacaoId: uuid('operacao_id'),
    observacao: text('observacao'),
    confirmadoEm: dataHora('confirmado_em'),
    confirmadoPor: uuid('confirmado_por'),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.localId, t.empresaId, local),
    daEmpresa(t.operacaoId, t.empresaId, operacao),
    unique('inventario_cantina_id_empresa').on(t.id, t.empresaId),
    check('inventario_cantina_situacao', emLista('situacao', SITUACOES_INVENTARIO)),
    check(
      'inventario_cantina_confirmado',
      sql`(situacao = 'confirmado') = (confirmado_em is not null)`,
    ),
  ],
)

/**
 * Linha da contagem (2.5, Contagem de recipiente): o medido e o motivo, digitados; o lote e o
 * volume do livro ficam gravados na confirmação (no rascunho, a tela os lê do livro).
 */
export const inventarioCantinaItem = pgTable(
  'inventario_cantina_item',
  {
    id: id(),
    empresaId: empresaId(),
    inventarioId: uuid('inventario_id').notNull(),
    recipienteId: uuid('recipiente_id').notNull(),
    loteId: uuid('lote_id'),
    volumeLivro: numeric('volume_livro', { precision: 12, scale: 2 }),
    /** Vazio = não contado: não gera ajuste. */
    volumeMedido: numeric('volume_medido', { precision: 12, scale: 2 }),
    motivo: text('motivo'),
  },
  (t) => [
    foreignKey({
      columns: [t.inventarioId, t.empresaId],
      foreignColumns: [inventarioCantina.id, inventarioCantina.empresaId],
    }).onDelete('cascade'),
    daEmpresa(t.recipienteId, t.empresaId, recipiente),
    daEmpresa(t.loteId, t.empresaId, lote),
    unique('inventario_cantina_item_recipiente').on(t.inventarioId, t.recipienteId),
    check('inventario_cantina_item_medido', sql`volume_medido is null or volume_medido >= 0`),
  ],
)

// Livros (somente inclusão) ---------------------------------------------------------------------

/** Livro de volumes: o volume do recipiente é a soma dos lançamentos (seção 4). */
export const movimentoVolume = pgTable(
  'movimento_volume',
  {
    id: id(),
    empresaId: empresaId(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    recipienteId: uuid('recipiente_id').notNull(),
    loteId: uuid('lote_id').notNull(),
    /** Com sinal: + entra, − sai. */
    litros: numeric('litros', { precision: 12, scale: 2 }).notNull(),
    tipo: text('tipo').notNull(),
    estimado: boolean('estimado').notNull().default(false),
    operacaoId: uuid('operacao_id').notNull(),
    linhaId: uuid('linha_id'),
    executadoEm: dataHora('executado_em').notNull(),
    lancadoEm: dataHora('lancado_em').notNull().defaultNow(),
    estornoDeId: uuid('estorno_de_id'),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.recipienteId, t.empresaId, recipiente),
    daEmpresa(t.loteId, t.empresaId, lote),
    daEmpresa(t.operacaoId, t.empresaId, operacao),
    check('movimento_volume_tipo', emLista('tipo', CHAVES_TIPO_MOVIMENTO)),
    check('movimento_volume_litros', sql`litros <> 0`),
    index('movimento_volume_recipiente').on(t.recipienteId, t.executadoEm),
    index('movimento_volume_lote').on(t.loteId),
    index('movimento_volume_operacao').on(t.operacaoId),
  ],
)

/** Livro de uva: kg consumidos dos itens do romaneio (2.5, Movimento de uva). */
export const movimentoUva = pgTable(
  'movimento_uva',
  {
    id: id(),
    empresaId: empresaId(),
    itemId: uuid('item_id').notNull(),
    /** Negativo: consumo. */
    kg: numeric('kg', { precision: 12, scale: 1 }).notNull(),
    operacaoId: uuid('operacao_id').notNull(),
    loteId: uuid('lote_id').notNull(),
    recipienteId: uuid('recipiente_id').notNull(),
    /** Litros atribuídos ao item, para a composição (5.2). */
    litros: numeric('litros', { precision: 12, scale: 2 }).notNull(),
    estimado: boolean('estimado').notNull(),
    executadoEm: dataHora('executado_em').notNull(),
    lancadoEm: dataHora('lancado_em').notNull().defaultNow(),
    estornoDeId: uuid('estorno_de_id'),
  },
  (t) => [
    daEmpresa(t.itemId, t.empresaId, romaneioItem),
    daEmpresa(t.operacaoId, t.empresaId, operacao),
    daEmpresa(t.loteId, t.empresaId, lote),
    daEmpresa(t.recipienteId, t.empresaId, recipiente),
    check('movimento_uva_kg', sql`kg <> 0`),
    index('movimento_uva_item').on(t.itemId),
  ],
)

/** De onde veio e para onde foi (seção 5.6). */
export const genealogia = pgTable(
  'genealogia',
  {
    id: id(),
    empresaId: empresaId(),
    origemLoteId: uuid('origem_lote_id').notNull(),
    destinoLoteId: uuid('destino_lote_id').notNull(),
    litros: numeric('litros', { precision: 12, scale: 2 }).notNull(),
    operacaoId: uuid('operacao_id').notNull(),
    tipo: text('tipo').notNull().$type<(typeof PAPEIS_GENEALOGIA)[number]>(),
    estornada: boolean('estornada').notNull().default(false),
  },
  (t) => [
    daEmpresa(t.origemLoteId, t.empresaId, lote),
    daEmpresa(t.destinoLoteId, t.empresaId, lote),
    daEmpresa(t.operacaoId, t.empresaId, operacao),
    check('genealogia_tipo', emLista('tipo', PAPEIS_GENEALOGIA)),
    check('genealogia_litros', sql`litros > 0`),
    check('genealogia_lotes', sql`origem_lote_id <> destino_lote_id`),
    index('genealogia_origem').on(t.origemLoteId),
    index('genealogia_destino').on(t.destinoLoteId),
  ],
)

/** Versão da composição de uma parte do lote (o lote num recipiente): nunca se edita (5.1). */
export const composicaoParte = pgTable(
  'composicao_parte',
  {
    id: id(),
    empresaId: empresaId(),
    loteId: uuid('lote_id').notNull(),
    recipienteId: uuid('recipiente_id').notNull(),
    operacaoId: uuid('operacao_id').notNull(),
    /** Data de execução da operação que gerou a versão. */
    vigenteDesde: dataHora('vigente_desde').notNull(),
    lancadaEm: dataHora('lancada_em').notNull().defaultNow(),
    volumeLitros: numeric('volume_litros', { precision: 12, scale: 2 }).notNull(),
    chaptalizado: boolean('chaptalizado').notNull().default(false),
    /** SO₂ adicionado acumulado, em mg/L: viaja com os litros (bloco 6 do ciclo 4). */
    so2Adicionado: numeric('so2_adicionado', { precision: 8, scale: 2 }).notNull().default('0'),
    anteriorId: uuid('anterior_id'),
    eEstorno: boolean('e_estorno').notNull().default(false),
  },
  (t) => [
    daEmpresa(t.loteId, t.empresaId, lote),
    daEmpresa(t.recipienteId, t.empresaId, recipiente),
    daEmpresa(t.operacaoId, t.empresaId, operacao),
    unique('composicao_parte_id_empresa').on(t.id, t.empresaId),
    check('composicao_parte_volume', sql`volume_litros >= 0`),
    index('composicao_parte_recipiente').on(t.recipienteId, t.vigenteDesde),
    index('composicao_parte_lote').on(t.loteId),
  ],
)

export const composicaoParteItem = pgTable(
  'composicao_parte_item',
  {
    id: id(),
    empresaId: empresaId(),
    parteId: uuid('parte_id').notNull(),
    variedadeId: uuid('variedade_id').references(() => variedade.id),
    safra: integer('safra'),
    ciclo: text('ciclo'),
    origem: text('origem').notNull().$type<(typeof CHAVES_ORIGEM_COMPONENTE)[number]>(),
    organica: boolean('organica').notNull().default(false),
    candidataIp: boolean('candidata_ip').notNull().default(false),
    fracao: numeric('fracao', { precision: 10, scale: 8 }).notNull(),
  },
  (t) => [
    daEmpresa(t.parteId, t.empresaId, composicaoParte),
    check('composicao_parte_item_origem', emLista('origem', CHAVES_ORIGEM_COMPONENTE)),
    check('composicao_parte_item_fracao', sql`fracao > 0 and fracao <= 1`),
    index('composicao_parte_item_parte').on(t.parteId),
  ],
)
