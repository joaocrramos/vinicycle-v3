// Espumante na garrafa (cantina.md, Espumantes; 04, roteiro do ciclo 9): métodos tradicional e
// ancestral. A tiragem tira o vinho-base do recipiente (operação "tiragem" no livro de volumes) e
// forma um lote de garrafas em processo; cada estágio (lista "estagio_espumante") registra a data e
// as garrafas perdidas; no fim, as garrafas viram produto acabado num lote comercial. Charmat e Asti
// seguem como vinho em recipiente (autoclave).
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  check,
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
import { produto } from './cantina'
import { criacao, dataHora, id } from './comum'
import { loteComercial } from './envase'
import { empresa } from './plataforma'
import { operacao, projeto } from './producao'

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

export const METODOS_GARRAFA = ['tradicional', 'ancestral'] as const
export const SITUACOES_ESPUMANTE = ['em_processo', 'finalizado', 'cancelado'] as const

/** Lote de tiragem: as garrafas em processo. */
export const espumanteLote = pgTable(
  'espumante_lote',
  {
    id: id(),
    empresaId: empresaId(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    codigo: text('codigo').notNull(),
    projetoId: uuid('projeto_id').notNull(),
    metodo: text('metodo').notNull().$type<(typeof METODOS_GARRAFA)[number]>(),
    /** Operação "tiragem": o vinho-base que saiu dos recipientes. */
    operacaoId: uuid('operacao_id').notNull(),
    tiragemEm: dataHora('tiragem_em').notNull(),
    volumeMl: integer('volume_ml').notNull(),
    garrafasIniciais: integer('garrafas_iniciais').notNull(),
    litros: numeric('litros', { precision: 12, scale: 2 }).notNull(),
    /** Composição do vinho-base tirado (média ponderada dos recipientes). */
    composicao: jsonb('composicao').notNull(),
    /** Onde as garrafas descansam (opcional: cave, pupitre…). */
    localId: uuid('local_id'),
    situacao: text('situacao')
      .notNull()
      .default('em_processo')
      .$type<(typeof SITUACOES_ESPUMANTE)[number]>(),
    finalizadoEm: dataHora('finalizado_em'),
    produtoId: uuid('produto_id'),
    loteComercialId: uuid('lote_comercial_id'),
    /** Grupo do livro de estoque da finalização (entrada do produto e licor), para o estorno. */
    grupoFinalizacao: uuid('grupo_finalizacao'),
    garrafasFinais: integer('garrafas_finais'),
    observacao: text('observacao'),
    ...criacao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.projetoId, t.empresaId, projeto),
    daEmpresa(t.operacaoId, t.empresaId, operacao),
    daEmpresa(t.localId, t.empresaId, local),
    daEmpresa(t.produtoId, t.empresaId, produto),
    daEmpresa(t.loteComercialId, t.empresaId, loteComercial),
    unique('espumante_lote_id_empresa').on(t.id, t.empresaId),
    uniqueIndex('espumante_lote_codigo').on(t.estabelecimentoId, t.codigo),
    uniqueIndex('espumante_lote_operacao').on(t.operacaoId),
    check('espumante_lote_metodo', sql`metodo in ('tradicional', 'ancestral')`),
    check('espumante_lote_situacao', sql`situacao in ('em_processo', 'finalizado', 'cancelado')`),
    check('espumante_lote_garrafas', sql`garrafas_iniciais > 0 and volume_ml > 0`),
  ],
)

/** Um estágio das garrafas em processo, com as perdas (garrafas quebradas). */
export const espumanteEvento = pgTable(
  'espumante_evento',
  {
    id: id(),
    empresaId: empresaId(),
    loteId: uuid('lote_id').notNull(),
    /** Código da lista "estagio_espumante". */
    estagio: text('estagio').notNull(),
    executadoEm: dataHora('executado_em').notNull(),
    perdas: integer('perdas').notNull().default(0),
    /** Insumos do estágio (ex.: licor de expedição), baixados no estoque: o grupo do livro. */
    grupoEstoque: uuid('grupo_estoque'),
    insumos: jsonb('insumos'),
    observacao: text('observacao'),
    anuladoEm: dataHora('anulado_em'),
    motivoAnulacao: text('motivo_anulacao'),
    ...criacao(),
  },
  (t) => [
    daEmpresa(t.loteId, t.empresaId, espumanteLote),
    check('espumante_evento_perdas', sql`perdas >= 0`),
    check('espumante_evento_anulacao', sql`(anulado_em is null) = (motivo_anulacao is null)`),
    index('espumante_evento_lote').on(t.loteId, t.executadoEm),
  ],
)
