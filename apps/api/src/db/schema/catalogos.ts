// Catálogos da plataforma e catálogos globais com itens próprios (P8, P16;
// 03-modelo-de-dados.md, 1.11 e 2.1). Nos catálogos "Glob+", empresa vazia = item global, mantido
// pela plataforma; a empresa cria os seus e nunca altera um global.
import { CORES_UVA, TIPOS_UVA } from '@vinicycle/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { alteracao, criacao, dataHora, emLista, id, inativacao } from './comum';
import { empresa } from './plataforma';

/** Colunas comuns dos catálogos Glob+. */
const globMais = () => ({
  id: id(),
  empresaId: uuid('empresa_id').references(() => empresa.id),
  /** Código estável dos itens globais (dados de referência). Vazio nos itens próprios. */
  codigo: text('codigo'),
  ...criacao(),
  ...alteracao(),
  ...inativacao(),
});

/** Nome único dentro do mesmo escopo (global ou da empresa); código único entre os globais. */
const unicidadeGlobMais = (tabela: string, t: { empresaId: unknown; codigo: unknown }) => [
  uniqueIndex(`${tabela}_codigo_global`)
    .on(t.codigo as never)
    .where(sql`empresa_id is null`),
  uniqueIndex(`${tabela}_nome`).on(
    sql`coalesce(empresa_id, '00000000-0000-0000-0000-000000000000'::uuid)`,
    sql`lower(nome)`,
  ),
  check(`${tabela}_codigo_so_global`, sql`empresa_id is null or codigo is null`),
];

/** Papéis de pessoa. Só a plataforma cria (gestao.md, Pessoas). */
export const papel = pgTable('papel', {
  id: id(),
  codigo: text('codigo').notNull().unique(),
  nome: text('nome').notNull(),
  ordem: integer('ordem').notNull(),
});

/** Catálogo único de unidades (P17), com as casas decimais da grandeza (P3). */
export const unidade = pgTable('unidade', {
  id: id(),
  simbolo: text('simbolo').notNull().unique(),
  nome: text('nome').notNull(),
  grandeza: text('grandeza').notNull(),
  casas: integer('casas').notNull(),
  ordem: integer('ordem').notNull(),
});

/** Classificação oficial de produtos, versionada (P16). */
export const classeProduto = pgTable(
  'classe_produto',
  {
    id: id(),
    codigo: text('codigo').notNull(),
    nome: text('nome').notNull(),
    categoria: text('categoria').notNull().$type<'vinho' | 'espumante' | 'derivado'>(),
    exigeMetodoEspumante: boolean('exige_metodo_espumante').notNull().default(false),
    ordem: integer('ordem').notNull(),
    fonte: text('fonte').notNull(),
    vigenteDesde: date('vigente_desde').notNull(),
    vigenteAte: date('vigente_ate'),
  },
  (t) => [
    unique('classe_produto_versao').on(t.codigo, t.vigenteDesde),
    check('classe_produto_categoria', emLista('categoria', ['vinho', 'espumante', 'derivado'])),
  ],
);

/** Indicações geográficas (IP, DO). As regras de cada IG são regras versionadas (P16). */
export const indicacaoGeografica = pgTable(
  'indicacao_geografica',
  {
    id: id(),
    codigo: text('codigo').notNull().unique(),
    nome: text('nome').notNull(),
    tipo: text('tipo').notNull().$type<'IP' | 'DO'>(),
    municipiosIbge: text('municipios_ibge')
      .array()
      .notNull()
      .default(sql`'{}'`),
    entidadeGestora: text('entidade_gestora'),
    fonte: text('fonte').notNull(),
    ativo: boolean('ativo').notNull().default(true),
  },
  () => [check('indicacao_geografica_tipo', emLista('tipo', ['IP', 'DO']))],
);

/** Variedades: o catálogo oficial e as variedades próprias de cada empresa. */
export const variedade = pgTable(
  'variedade',
  {
    ...globMais(),
    /** Código da tabela de cultivares. Vazio = "sem código oficial" (item próprio). */
    codigoOficial: text('codigo_oficial'),
    nome: text('nome').notNull(),
    tipo: text('tipo').notNull().$type<(typeof TIPOS_UVA)[number]>(),
    cor: text('cor').notNull().$type<(typeof CORES_UVA)[number]>(),
    sinonimos: text('sinonimos')
      .array()
      .notNull()
      .default(sql`'{}'`),
    fonte: text('fonte'),
    /** Item próprio: quando a plataforma foi avisada para avaliar a inclusão no catálogo global. */
    avisadaPlataformaEm: dataHora('avisada_plataforma_em'),
    equivaleA: uuid('equivale_a'),
  },
  (t) => [
    ...unicidadeGlobMais('variedade', t),
    uniqueIndex('variedade_codigo_oficial')
      .on(t.codigoOficial)
      .where(sql`empresa_id is null and codigo_oficial is not null`),
    check('variedade_tipo', emLista('tipo', TIPOS_UVA)),
    check('variedade_cor', emLista('cor', CORES_UVA)),
    check('variedade_propria_sem_codigo', sql`empresa_id is null or codigo_oficial is null`),
  ],
);

export const tipoRecipiente = pgTable(
  'tipo_recipiente',
  {
    ...globMais(),
    nome: text('nome').notNull(),
    pressurizado: boolean('pressurizado').notNull().default(false),
    /** Habilita os campos de barrica (tanoaria, madeira, tosta, ano do primeiro uso). */
    eBarrica: boolean('e_barrica').notNull().default(false),
  },
  (t) => unicidadeGlobMais('tipo_recipiente', t),
);

export const tipoInsumo = pgTable(
  'tipo_insumo',
  {
    ...globMais(),
    nome: text('nome').notNull(),
    /** Símbolos das unidades permitidas (ambiente-cliente.md, Cadastros). */
    unidades: text('unidades')
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** Códigos da lista "apresentacao_insumo". */
    apresentacoes: text('apresentacoes')
      .array()
      .notNull()
      .default(sql`'{}'`),
  },
  (t) => unicidadeGlobMais('tipo_insumo', t),
);

export const tipoDocumento = pgTable(
  'tipo_documento',
  {
    ...globMais(),
    nome: text('nome').notNull(),
    temVencimento: boolean('tem_vencimento').notNull().default(true),
    /** Antecedência dos avisos, em dias (padrão 60, 30 e 7; gestao.md, Documentos). */
    avisosDias: integer('avisos_dias')
      .array()
      .notNull()
      .default(sql`'{60,30,7}'`),
  },
  (t) => unicidadeGlobMais('tipo_documento', t),
);

/** Parâmetros de análise. O valor é guardado na unidade padrão (cantina.md, Laboratório). */
export const parametroAnalise = pgTable(
  'parametro_analise',
  {
    ...globMais(),
    nome: text('nome').notNull(),
    unidadePadrao: text('unidade_padrao')
      .notNull()
      .references(() => unidade.simbolo),
    unidadesAceitas: text('unidades_aceitas')
      .array()
      .notNull()
      .default(sql`'{}'`),
    casas: integer('casas').notNull(),
    /** Limites físicos (o que é impossível medir), não limites legais. */
    minimo: numeric('minimo', { precision: 14, scale: 4 }),
    maximo: numeric('maximo', { precision: 14, scale: 4 }),
    ordem: integer('ordem').notNull().default(100),
  },
  (t) => unicidadeGlobMais('parametro_analise', t),
);

/** Listas simples configuráveis (03-modelo-de-dados.md, 1.11). */
export const opcaoLista = pgTable(
  'opcao_lista',
  {
    id: id(),
    empresaId: uuid('empresa_id').references(() => empresa.id),
    lista: text('lista').notNull(),
    codigo: text('codigo').notNull(),
    nome: text('nome').notNull(),
    ordem: integer('ordem').notNull().default(100),
    dados: jsonb('dados').notNull().default({}),
    ...criacao(),
    ...alteracao(),
    ...inativacao(),
  },
  (t) => [
    uniqueIndex('opcao_lista_codigo').on(
      sql`coalesce(empresa_id, '00000000-0000-0000-0000-000000000000'::uuid)`,
      t.lista,
      t.codigo,
    ),
    uniqueIndex('opcao_lista_nome').on(
      sql`coalesce(empresa_id, '00000000-0000-0000-0000-000000000000'::uuid)`,
      t.lista,
      sql`lower(nome)`,
    ),
  ],
);
