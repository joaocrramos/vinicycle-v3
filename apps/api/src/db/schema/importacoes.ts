// Importação de planilha (P23; 03-modelo-de-dados.md, 3, Importação e carga inicial): cada carga
// fica registrada (arquivo, quem, quando, linhas) e os registros gerados apontam para ela; tudo ou
// nada; estorno enquanto não houver movimento posterior.
import { boolean, check, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { estabelecimento } from './acesso';
import { criacao, dataHora, emLista, id } from './comum';
import { operacao } from './producao';
import { empresa } from './plataforma';

export const TIPOS_IMPORTACAO = ['saldo_granel', 'saldo_garrafas', 'saldo_itens'] as const;

export const importacao = pgTable(
  'importacao',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    estabelecimentoId: uuid('estabelecimento_id')
      .notNull()
      .references(() => estabelecimento.id),
    tipo: text('tipo').notNull().$type<(typeof TIPOS_IMPORTACAO)[number]>(),
    /** Data do saldo de abertura (ex.: 31/12/2025, 23:59). */
    dataSaldo: dataHora('data_saldo').notNull(),
    eCargaInicial: boolean('e_carga_inicial').notNull().default(true),
    nomeArquivo: text('nome_arquivo').notNull(),
    anexoId: uuid('anexo_id'),
    linhas: integer('linhas').notNull(),
    situacao: text('situacao').notNull().default('aplicada').$type<'aplicada' | 'estornada'>(),
    /** Granel: a operação "abertura de saldo"; garrafas e itens: o grupo dos movimentos. */
    operacaoId: uuid('operacao_id').references(() => operacao.id),
    grupoId: uuid('grupo_id'),
    motivoEstorno: text('motivo_estorno'),
    estornadaEm: dataHora('estornada_em'),
    ...criacao(),
  },
  (t) => [
    check('importacao_tipo', emLista('tipo', TIPOS_IMPORTACAO)),
    check('importacao_situacao', emLista('situacao', ['aplicada', 'estornada'])),
    index('importacao_estab').on(t.estabelecimentoId, t.criadoEm),
  ],
);
