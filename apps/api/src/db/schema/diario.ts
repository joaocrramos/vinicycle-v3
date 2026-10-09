// Diário (ambiente-cliente.md, Diário; 03-modelo-de-dados.md, 2.2): notas datadas por
// estabelecimento, com autor, anexos e vínculo opcional a projeto, recipiente ou parcela. No campo,
// base da etapa 2 da declaração de uvas no SIVIBE ("condições que afetaram a produtividade").
import {
  type AnyPgColumn,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { estabelecimento } from './acesso'
import { recipiente } from './cantina'
import { alteracao, criacao, id, inativacao } from './comum'
import { empresa } from './plataforma'
import { parcela, projeto } from './producao'

function daEmpresa(
  coluna: AnyPgColumn,
  empresaId: AnyPgColumn,
  alvo: { id: AnyPgColumn; empresaId: AnyPgColumn },
) {
  return foreignKey({ columns: [coluna, empresaId], foreignColumns: [alvo.id, alvo.empresaId] })
}

export const diarioNota = pgTable(
  'diario_nota',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    data: date('data').notNull(),
    texto: text('texto').notNull(),
    projetoId: uuid('projeto_id'),
    recipienteId: uuid('recipiente_id'),
    parcelaId: uuid('parcela_id'),
    ...criacao(),
    ...alteracao(),
    ...inativacao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.projetoId, t.empresaId, projeto),
    daEmpresa(t.recipienteId, t.empresaId, recipiente),
    daEmpresa(t.parcelaId, t.empresaId, parcela),
    unique('diario_nota_id_empresa').on(t.id, t.empresaId),
    index('diario_nota_estabelecimento').on(t.estabelecimentoId, t.data),
    index('diario_nota_projeto').on(t.projetoId),
    index('diario_nota_recipiente').on(t.recipienteId),
    index('diario_nota_parcela').on(t.parcelaId),
  ],
)
