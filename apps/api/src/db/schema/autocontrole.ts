// Autocontrole (gestao.md, Autocontrole; 03-modelo-de-dados.md, 2.2; Decreto 12.709/2025, arts. 117
// a 120): o programa de controles do estabelecimento e as evidências de cada execução. O modelo da
// norma (packages/shared, MODELO_AUTOCONTROLE) é só o ponto de partida: tudo se altera (P29).
// A evidência automática (higienização, temperatura) não é copiada: é lida das operações e análises,
// e some sozinha se elas forem estornadas.
import { CHAVES_EVIDENCIA_AUTOMATICA, CHAVES_UNIDADE_PERIODICIDADE } from '@vinicycle/shared';
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { estabelecimento, usuario } from './acesso';
import { alteracao, criacao, dataHora, emLista, id, inativacao } from './comum';
import { empresa } from './plataforma';

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

export const autocontroleControle = pgTable(
  'autocontrole_controle',
  {
    id: id(),
    empresaId: empresaId(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    /** Controle do modelo de onde veio; vazio = incluído pelo cliente. */
    codigoModelo: text('codigo_modelo'),
    nome: text('nome').notNull(),
    descricao: text('descricao'),
    /** As duas vazias = sob demanda. */
    periodicidadeQuantidade: integer('periodicidade_quantidade'),
    periodicidadeUnidade:
      text('periodicidade_unidade').$type<(typeof CHAVES_UNIDADE_PERIODICIDADE)[number]>(),
    responsavelId: uuid('responsavel_id').references(() => usuario.id),
    evidenciaAutomatica:
      text('evidencia_automatica').$type<(typeof CHAVES_EVIDENCIA_AUTOMATICA)[number]>(),
    /** Começo da contagem do primeiro prazo (a criação ou a reativação). */
    inicio: date('inicio').notNull(),
    ...criacao(),
    ...alteracao(),
    ...inativacao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    unique('autocontrole_controle_id_empresa').on(t.id, t.empresaId),
    index('autocontrole_controle_estabelecimento').on(t.estabelecimentoId),
    check(
      'autocontrole_controle_periodicidade',
      sql`(periodicidade_quantidade is null) = (periodicidade_unidade is null) and (periodicidade_quantidade is null or periodicidade_quantidade between 1 and 999)`,
    ),
    check(
      'autocontrole_controle_unidade',
      sql`periodicidade_unidade is null or ${emLista('periodicidade_unidade', CHAVES_UNIDADE_PERIODICIDADE)}`,
    ),
    check(
      'autocontrole_controle_automatica',
      sql`evidencia_automatica is null or ${emLista('evidencia_automatica', CHAVES_EVIDENCIA_AUTOMATICA)}`,
    ),
  ],
);

/** Evidência registrada à mão (com anexos); as automáticas vêm das operações e análises. */
export const autocontroleEvidencia = pgTable(
  'autocontrole_evidencia',
  {
    id: id(),
    empresaId: empresaId(),
    controleId: uuid('controle_id').notNull(),
    realizadaEm: date('realizada_em').notNull(),
    descricao: text('descricao').notNull(),
    /** Evidência lançada por engano: anulada com motivo, nunca apagada (P13). */
    anuladaEm: dataHora('anulada_em'),
    anuladaPor: uuid('anulada_por').references(() => usuario.id),
    motivoAnulacao: text('motivo_anulacao'),
    ...criacao(),
  },
  (t) => [
    check('autocontrole_evidencia_anulacao', sql`(anulada_em is null) = (motivo_anulacao is null)`),
    daEmpresa(t.controleId, t.empresaId, autocontroleControle),
    unique('autocontrole_evidencia_id_empresa').on(t.id, t.empresaId),
    index('autocontrole_evidencia_controle').on(t.controleId, t.realizadaEm),
  ],
);
