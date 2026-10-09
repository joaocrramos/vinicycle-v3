// Transferência de titularidade (cantina.md, Mistura entre titulares; Pagamento em produto; 04,
// roteiro do ciclo 10, bloco 2): registro de cada transferência, a granel (pela operação da cantina)
// ou no estoque (pelo grupo de movimentos), para o contrato e a conta do cliente somarem o que já
// passou de um titular a outro. A validade vem da operação ou dos movimentos: estornados, não contam.
import { CHAVES_MOTIVO_TITULARIDADE, FORMAS_TITULARIDADE } from '@vinicycle/shared';
import { sql } from 'drizzle-orm';
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
  uuid,
} from 'drizzle-orm/pg-core';
import { estabelecimento } from './acesso';
import { criacao, dataHora, emLista, id } from './comum';
import { pessoa } from './gestao';
import { empresa } from './plataforma';
import { loteComercial } from './envase';
import { lote, operacao } from './producao';
import { contratoTerceirizacao } from './terceiros';

function daEmpresa(
  coluna: AnyPgColumn,
  empresaId: AnyPgColumn,
  alvo: { id: AnyPgColumn; empresaId: AnyPgColumn },
) {
  return foreignKey({ columns: [coluna, empresaId], foreignColumns: [alvo.id, alvo.empresaId] });
}

export const transferenciaTitularidade = pgTable(
  'transferencia_titularidade',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    forma: text('forma').notNull().$type<(typeof FORMAS_TITULARIDADE)[number]>(),
    executadoEm: dataHora('executado_em').notNull(),
    motivo: text('motivo').notNull().$type<(typeof CHAVES_MOTIVO_TITULARIDADE)[number]>(),
    contratoId: uuid('contrato_id'),
    /** Vazio = a própria empresa. */
    deTitularId: uuid('de_titular_id'),
    paraTitularId: uuid('para_titular_id'),
    /** Granel: a operação da cantina. */
    operacaoId: uuid('operacao_id'),
    /** Estoque: o grupo dos movimentos. */
    grupoEstoqueId: uuid('grupo_estoque_id'),
    litros: numeric('litros', { precision: 14, scale: 2 }).notNull().default('0'),
    garrafas: integer('garrafas').notNull().default(0),
    observacao: text('observacao'),
    ...criacao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.contratoId, t.empresaId, contratoTerceirizacao),
    daEmpresa(t.deTitularId, t.empresaId, pessoa),
    daEmpresa(t.paraTitularId, t.empresaId, pessoa),
    daEmpresa(t.operacaoId, t.empresaId, operacao),
    check('transferencia_titularidade_forma', emLista('forma', FORMAS_TITULARIDADE)),
    check('transferencia_titularidade_motivo', emLista('motivo', CHAVES_MOTIVO_TITULARIDADE)),
    check(
      'transferencia_titularidade_origem',
      sql`(forma = 'granel') = (operacao_id is not null) and (forma = 'estoque') = (grupo_estoque_id is not null)`,
    ),
    check(
      'transferencia_titularidade_titulares',
      sql`coalesce(de_titular_id, '00000000-0000-0000-0000-000000000000'::uuid) <> coalesce(para_titular_id, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
    index('transferencia_titularidade_contrato').on(t.contratoId),
    index('transferencia_titularidade_titulares').on(t.deTitularId, t.paraTitularId),
  ],
);

/**
 * Dossiê do lote para o cliente (cantina.md, Dossiê do lote; 04, roteiro do ciclo 10, bloco 4): a
 * fotografia do relatório no momento em que foi gerado, já formatada em seções, para imprimir,
 * exportar e enviar por e-mail. Não muda depois de gerado (P13).
 */
export const dossie = pgTable(
  'dossie',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    titularId: uuid('titular_id').notNull(),
    loteId: uuid('lote_id'),
    loteComercialId: uuid('lote_comercial_id'),
    titulo: text('titulo').notNull(),
    conteudo: jsonb('conteudo').notNull(),
    ...criacao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.titularId, t.empresaId, pessoa),
    daEmpresa(t.loteId, t.empresaId, lote),
    daEmpresa(t.loteComercialId, t.empresaId, loteComercial),
    unique('dossie_id_empresa').on(t.id, t.empresaId),
    check('dossie_partida', sql`(lote_id is null) <> (lote_comercial_id is null)`),
    index('dossie_titular').on(t.titularId, t.criadoEm),
  ],
);

/** Cada envio do dossiê por e-mail: para quem e quando. */
export const dossieEnvio = pgTable(
  'dossie_envio',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    dossieId: uuid('dossie_id').notNull(),
    para: text('para').notNull(),
    ...criacao(),
  },
  (t) => [daEmpresa(t.dossieId, t.empresaId, dossie), index('dossie_envio_dossie').on(t.dossieId)],
);
