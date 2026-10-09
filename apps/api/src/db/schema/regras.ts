// Regras versionadas (P16) e ocorrências com "ciente" (P29): 03-modelo-de-dados.md, 1.7 e 2.3.
// O sistema informa; o cliente decide. Uma regra nova é uma nova versão, nunca uma edição.
import { sql } from 'drizzle-orm'
import {
  check,
  date,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { estabelecimento } from './acesso'
import { criacao, dataHora, emLista, id } from './comum'
import { empresa } from './plataforma'

export const ABRANGENCIAS_REGRA = ['nacional', 'uf', 'ig'] as const
export const RESULTADOS_OCORRENCIA = ['alerta', 'bloqueio'] as const

/** Limites, faixas, prazos e dizeres, com vigência, abrangência e fonte legal (P16). */
export const regraRegulatoria = pgTable(
  'regra_regulatoria',
  {
    id: id(),
    tipo: text('tipo').notNull(),
    /** Ex.: "rendimento_prensagem_maximo". */
    chave: text('chave').notNull(),
    abrangencia: text('abrangencia').notNull().$type<(typeof ABRANGENCIAS_REGRA)[number]>(),
    /** UF (sigla) ou código da IG; vazio na nacional. */
    abrangenciaCodigo: text('abrangencia_codigo'),
    vigenteDesde: date('vigente_desde').notNull(),
    vigenteAte: date('vigente_ate'),
    minimo: numeric('minimo', { precision: 14, scale: 4 }),
    maximo: numeric('maximo', { precision: 14, scale: 4 }),
    unidade: text('unidade'),
    dados: jsonb('dados'),
    descricao: text('descricao').notNull(),
    fonteNorma: text('fonte_norma').notNull(),
    fonteArtigo: text('fonte_artigo'),
    fonteLink: text('fonte_link'),
    fonteNota: text('fonte_nota'),
    ...criacao(),
  },
  (t) => [
    uniqueIndex('regra_regulatoria_versao').on(
      t.chave,
      t.abrangencia,
      sql`coalesce(abrangencia_codigo, '')`,
      t.vigenteDesde,
    ),
    check('regra_regulatoria_abrangencia', emLista('abrangencia', ABRANGENCIAS_REGRA)),
    check(
      'regra_regulatoria_codigo',
      sql`(abrangencia = 'nacional') = (abrangencia_codigo is null)`,
    ),
    check('regra_regulatoria_vigencia', sql`vigente_ate is null or vigente_ate >= vigente_desde`),
  ],
)

/**
 * Cada alerta dado num registro e o "ciente" de quem confirmou (P29). Guarda também os avisos
 * operacionais sem regra legal (ex.: recipiente aguardando higienização), pelo código.
 */
export const ocorrenciaRegra = pgTable(
  'ocorrencia_regra',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    estabelecimentoId: uuid('estabelecimento_id'),
    entidade: text('entidade').notNull(),
    registroId: uuid('registro_id').notNull(),
    /** Vazio no aviso operacional. */
    regraId: uuid('regra_id').references(() => regraRegulatoria.id),
    codigo: text('codigo').notNull(),
    mensagem: text('mensagem').notNull(),
    valorApurado: numeric('valor_apurado', { precision: 14, scale: 4 }),
    limite: numeric('limite', { precision: 14, scale: 4 }),
    resultado: text('resultado')
      .notNull()
      .default('alerta')
      .$type<(typeof RESULTADOS_OCORRENCIA)[number]>(),
    cienteEm: dataHora('ciente_em'),
    cientePor: uuid('ciente_por'),
    ...criacao(),
  },
  (t) => [
    foreignKey({
      columns: [t.estabelecimentoId, t.empresaId],
      foreignColumns: [estabelecimento.id, estabelecimento.empresaId],
    }),
    check('ocorrencia_regra_resultado', emLista('resultado', RESULTADOS_OCORRENCIA)),
    index('ocorrencia_regra_registro').on(t.entidade, t.registroId),
  ],
)
