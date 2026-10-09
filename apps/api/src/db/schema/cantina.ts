// Cadastros da cantina e do estoque comum (03-modelo-de-dados.md, 2.4 e 2.5; cantina.md).
import { SITUACOES_RECIPIENTE, TIPOS_ITEM_ESTOQUE } from '@vinicycle/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { estabelecimento, local } from './acesso';
import {
  classeProduto,
  parametroAnalise,
  tipoInsumo,
  tipoRecipiente,
  unidade,
  variedade,
} from './catalogos';
import { alteracao, criacao, dataHora, emLista, id, inativacao } from './comum';
import { pessoa } from './gestao';
import { empresa } from './plataforma';

const refEstab = (t: { estabelecimentoId: never; empresaId: never }) =>
  foreignKey({
    columns: [t.estabelecimentoId, t.empresaId],
    foreignColumns: [estabelecimento.id, estabelecimento.empresaId],
  });

/** Variedades com que a empresa trabalha: só elas aparecem nas telas (ambiente-cliente.md). */
export const empresaVariedade = pgTable(
  'empresa_variedade',
  {
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    variedadeId: uuid('variedade_id')
      .notNull()
      .references(() => variedade.id),
    ativo: boolean('ativo').notNull().default(true),
    ...criacao(),
  },
  (t) => [primaryKey({ columns: [t.empresaId, t.variedadeId] })],
);

/** Tanque, barrica, autoclave… O volume não é campo: é a soma do livro (seção 4 do modelo). */
export const recipiente = pgTable(
  'recipiente',
  {
    id: id(),
    empresaId: uuid('empresa_id').notNull(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    codigo: text('codigo').notNull(),
    tipoRecipienteId: uuid('tipo_recipiente_id')
      .notNull()
      .references(() => tipoRecipiente.id),
    /** Código da lista "material_recipiente". */
    material: text('material'),
    capacidadeLitros: numeric('capacidade_litros', { precision: 12, scale: 2 }).notNull(),
    possuiFrio: boolean('possui_frio').notNull().default(false),
    localId: uuid('local_id').notNull(),
    situacao: text('situacao')
      .notNull()
      .default('ativo')
      .$type<(typeof SITUACOES_RECIPIENTE)[number]>(),
    situacaoDesde: dataHora('situacao_desde').notNull().defaultNow(),
    motivoSituacao: text('motivo_situacao'),
    dimensoes: text('dimensoes'),
    fabricante: text('fabricante'),
    dataAquisicao: date('data_aquisicao'),
    // Barricas (cantina.md, Recipientes).
    tanoaria: text('tanoaria'),
    origemMadeira: text('origem_madeira'),
    tosta: text('tosta'),
    anoPrimeiroUso: integer('ano_primeiro_uso'),
    observacoes: text('observacoes'),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    refEstab(t as never),
    foreignKey({ columns: [t.localId, t.empresaId], foreignColumns: [local.id, local.empresaId] }),
    unique('recipiente_id_empresa').on(t.id, t.empresaId),
    uniqueIndex('recipiente_codigo').on(t.estabelecimentoId, sql`lower(codigo)`),
    check('recipiente_situacao', emLista('situacao', SITUACOES_RECIPIENTE)),
    check('recipiente_capacidade', sql`capacidade_litros > 0`),
    check(
      'recipiente_ano',
      sql`ano_primeiro_uso is null or ano_primeiro_uso between 1900 and 2200`,
    ),
  ],
);

/** O que se guarda no estoque, de qualquer módulo. O saldo é por estabelecimento e local. */
export const itemEstoque = pgTable(
  'item_estoque',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    modulo: text('modulo').notNull(),
    tipo: text('tipo').notNull().$type<(typeof TIPOS_ITEM_ESTOQUE)[number]>(),
    nome: text('nome').notNull(),
    codigoInterno: text('codigo_interno'),
    unidadeBase: text('unidade_base')
      .notNull()
      .references(() => unidade.simbolo),
    estoqueMinimo: numeric('estoque_minimo', { precision: 14, scale: 3 }),
    controlaLote: boolean('controla_lote').notNull().default(false),
    controlaValidade: boolean('controla_validade').notNull().default(false),
    controlaNumeracao: boolean('controla_numeracao').notNull().default(false),
    /** Entrada de álcool etílico é comunicada ao MAPA (P20). */
    eAlcoolEtilico: boolean('e_alcool_etilico').notNull().default(false),
    observacoes: text('observacoes'),
    ...criacao(),
    ...alteracao(),
    ...inativacao(),
  },
  (t) => [
    unique('item_estoque_id_empresa').on(t.id, t.empresaId),
    uniqueIndex('item_estoque_nome').on(t.empresaId, t.modulo, t.tipo, sql`lower(nome)`),
    check('item_estoque_tipo', emLista('tipo', TIPOS_ITEM_ESTOQUE)),
    check('item_estoque_minimo', sql`estoque_minimo is null or estoque_minimo >= 0`),
  ],
);

/** Detalhe do insumo enológico (ambiente-cliente.md, Cadastros: cadastro completo). */
export const itemInsumo = pgTable(
  'item_insumo',
  {
    itemId: uuid('item_id').primaryKey(),
    empresaId: uuid('empresa_id').notNull(),
    tipoInsumoId: uuid('tipo_insumo_id')
      .notNull()
      .references(() => tipoInsumo.id),
    nomeComercial: text('nome_comercial'),
    marca: text('marca'),
    fabricanteId: uuid('fabricante_id'),
    /** Código da lista "apresentacao_insumo". */
    apresentacao: text('apresentacao'),
    /** Teor de SO₂ (% em massa; nas soluções, g por 100 mL), para o SO₂ acumulado (ciclo 4). */
    teorSo2: numeric('teor_so2', { precision: 6, scale: 2 }),
  },
  (t) => [
    foreignKey({
      columns: [t.itemId, t.empresaId],
      foreignColumns: [itemEstoque.id, itemEstoque.empresaId],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.fabricanteId, t.empresaId],
      foreignColumns: [pessoa.id, pessoa.empresaId],
    }),
  ],
);

/** Marca comercial. Dono vazio = a própria empresa; senão, o cliente de vinificação. */
export const marca = pgTable(
  'marca',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    nome: text('nome').notNull(),
    donoId: uuid('dono_id'),
    ...criacao(),
    ...alteracao(),
    ...inativacao(),
  },
  (t) => [
    foreignKey({ columns: [t.donoId, t.empresaId], foreignColumns: [pessoa.id, pessoa.empresaId] }),
    unique('marca_id_empresa').on(t.id, t.empresaId),
    uniqueIndex('marca_nome').on(
      t.empresaId,
      sql`coalesce(dono_id, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`lower(nome)`,
    ),
  ],
);

/** Vinho comercial. Denominação = classe + cor + açúcar (IN MAPA 14/2018, art. 26). */
export const produto = pgTable(
  'produto',
  {
    id: id(),
    empresaId: uuid('empresa_id').notNull(),
    nome: text('nome').notNull(),
    marcaId: uuid('marca_id').notNull(),
    classeProdutoId: uuid('classe_produto_id')
      .notNull()
      .references(() => classeProduto.id),
    /** Códigos das listas "cor_vinho", "teor_acucar" e "metodo_espumante". */
    cor: text('cor'),
    teorAcucar: text('teor_acucar'),
    metodoEspumante: text('metodo_espumante'),
    registroMapa: text('registro_mapa'),
    /** Vinho de terceiro (vinificação para terceiros). Vazio = a própria empresa. */
    titularId: uuid('titular_id'),
    observacoes: text('observacoes'),
    ...criacao(),
    ...alteracao(),
    ...inativacao(),
  },
  (t) => [
    foreignKey({ columns: [t.marcaId, t.empresaId], foreignColumns: [marca.id, marca.empresaId] }),
    foreignKey({
      columns: [t.titularId, t.empresaId],
      foreignColumns: [pessoa.id, pessoa.empresaId],
    }),
    unique('produto_id_empresa').on(t.id, t.empresaId),
    uniqueIndex('produto_nome').on(t.empresaId, t.marcaId, sql`lower(nome)`),
  ],
);

/** Versões de rótulo, com o teor alcoólico declarado. */
export const produtoRotulo = pgTable(
  'produto_rotulo',
  {
    id: id(),
    empresaId: uuid('empresa_id').notNull(),
    produtoId: uuid('produto_id').notNull(),
    versao: text('versao').notNull(),
    teorAlcoolico: numeric('teor_alcoolico', { precision: 4, scale: 1 }).notNull(),
    urlPagina: text('url_pagina'),
    vigenteDesde: date('vigente_desde').notNull(),
    vigenteAte: date('vigente_ate'),
    observacoes: text('observacoes'),
    ...criacao(),
  },
  (t) => [
    foreignKey({
      columns: [t.produtoId, t.empresaId],
      foreignColumns: [produto.id, produto.empresaId],
    }).onDelete('cascade'),
    unique('produto_rotulo_versao').on(t.produtoId, t.versao),
    check('produto_rotulo_teor', sql`teor_alcoolico > 0 and teor_alcoolico < 100`),
  ],
);

/** Apresentação (750 mL, 1,5 L…). Cada formato é um item de estoque de produto acabado. */
export const produtoFormato = pgTable(
  'produto_formato',
  {
    id: id(),
    empresaId: uuid('empresa_id').notNull(),
    produtoId: uuid('produto_id').notNull(),
    volumeMl: integer('volume_ml').notNull(),
    itemEstoqueId: uuid('item_estoque_id').notNull(),
    ...criacao(),
    ...inativacao(),
  },
  (t) => [
    foreignKey({
      columns: [t.produtoId, t.empresaId],
      foreignColumns: [produto.id, produto.empresaId],
    }),
    foreignKey({
      columns: [t.itemEstoqueId, t.empresaId],
      foreignColumns: [itemEstoque.id, itemEstoque.empresaId],
    }),
    unique('produto_formato_id_empresa').on(t.id, t.empresaId),
    unique('produto_formato_volume').on(t.produtoId, t.volumeMl),
    uniqueIndex('produto_formato_item').on(t.itemEstoqueId),
    check('produto_formato_volume_positivo', sql`volume_ml > 0`),
  ],
);

/** Materiais por unidade do formato (cantina.md, Engarrafamento). */
export const fichaEmbalagem = pgTable(
  'ficha_embalagem',
  {
    id: id(),
    empresaId: uuid('empresa_id').notNull(),
    formatoId: uuid('formato_id').notNull(),
    itemEstoqueId: uuid('item_estoque_id').notNull(),
    /** Quantidade por garrafa (ex.: 1/6 de caixa = 0,1667). */
    quantidade: numeric('quantidade', { precision: 12, scale: 4 }).notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.formatoId, t.empresaId],
      foreignColumns: [produtoFormato.id, produtoFormato.empresaId],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.itemEstoqueId, t.empresaId],
      foreignColumns: [itemEstoque.id, itemEstoque.empresaId],
    }),
    unique('ficha_embalagem_item').on(t.formatoId, t.itemEstoqueId),
    check('ficha_embalagem_quantidade', sql`quantidade > 0`),
  ],
);

/** Nome de cada ciclo da safra, por estabelecimento (cantina.md, Códigos). */
export const ciclo = pgTable(
  'ciclo',
  {
    id: id(),
    empresaId: uuid('empresa_id').notNull(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    numero: text('numero').notNull(),
    nome: text('nome').notNull(),
    ...criacao(),
  },
  (t) => [
    refEstab(t as never),
    unique('ciclo_numero').on(t.estabelecimentoId, t.numero),
    check('ciclo_numero_formato', sql`numero ~ '^[0-9]{2}$'`),
  ],
);

/** Litros estimados por kg de uva (cantina.md, Quilos → litros). */
export const rendimentoPadrao = pgTable(
  'rendimento_padrao',
  {
    id: id(),
    empresaId: uuid('empresa_id').notNull(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    variedadeId: uuid('variedade_id').references(() => variedade.id),
    /** Estilo do vinho (código da lista "cor_vinho"); vazio = qualquer. */
    estilo: text('estilo'),
    litrosPorKg: numeric('litros_por_kg', { precision: 6, scale: 4 }).notNull(),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    refEstab(t as never),
    unique('rendimento_padrao_chave')
      .on(t.estabelecimentoId, t.variedadeId, t.estilo)
      .nullsNotDistinct(),
    check('rendimento_padrao_faixa', sql`litros_por_kg > 0 and litros_por_kg < 1`),
  ],
);

/** Parâmetros de análise que a empresa mede, com a unidade preferida. */
export const empresaParametroAnalise = pgTable(
  'empresa_parametro_analise',
  {
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    parametroId: uuid('parametro_id')
      .notNull()
      .references(() => parametroAnalise.id),
    unidadePreferida: text('unidade_preferida').references(() => unidade.simbolo),
    ativo: boolean('ativo').notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.empresaId, t.parametroId] })],
);

/** Faixa de referência; o nível mais específico vence (cantina.md, Análises). */
export const faixaIdeal = pgTable(
  'faixa_ideal',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    parametroId: uuid('parametro_id')
      .notNull()
      .references(() => parametroAnalise.id),
    nivel: text('nivel')
      .notNull()
      .default('empresa')
      .$type<'empresa' | 'modelo_plano' | 'projeto' | 'lote'>(),
    registroId: uuid('registro_id'),
    minimo: numeric('minimo', { precision: 14, scale: 4 }),
    maximo: numeric('maximo', { precision: 14, scale: 4 }),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    unique('faixa_ideal_nivel')
      .on(t.empresaId, t.parametroId, t.nivel, t.registroId)
      .nullsNotDistinct(),
    check(
      'faixa_ideal_nivel_valido',
      emLista('nivel', ['empresa', 'modelo_plano', 'projeto', 'lote']),
    ),
    check('faixa_ideal_ordem', sql`minimo is null or maximo is null or minimo <= maximo`),
  ],
);

/** Higienização por tipo de recipiente; vencida gera alerta (cantina.md, Recipientes). */
export const periodicidadeHigienizacao = pgTable(
  'periodicidade_higienizacao',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    tipoRecipienteId: uuid('tipo_recipiente_id')
      .notNull()
      .references(() => tipoRecipiente.id),
    intervaloDias: integer('intervalo_dias').notNull(),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    unique('periodicidade_higienizacao_tipo').on(t.empresaId, t.tipoRecipienteId),
    check('periodicidade_higienizacao_dias', sql`intervalo_dias > 0`),
    index('periodicidade_higienizacao_empresa').on(t.empresaId),
  ],
);

/** Parâmetros técnicos por tipo de tratamento, configurados pela empresa (2.5; P29). */
export const tipoTratamentoParametro = pgTable(
  'tipo_tratamento_parametro',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    /** Código da lista "tipo_tratamento". */
    tipoTratamento: text('tipo_tratamento').notNull(),
    nome: text('nome').notNull(),
    unidade: text('unidade'),
    obrigatorio: boolean('obrigatorio').notNull().default(false),
    ...criacao(),
    ...alteracao(),
    ...inativacao(),
  },
  (t) => [
    unique('tipo_tratamento_parametro_id_empresa').on(t.id, t.empresaId),
    uniqueIndex('tipo_tratamento_parametro_nome').on(
      t.empresaId,
      t.tipoTratamento,
      sql`lower(nome)`,
    ),
  ],
);
