// Produção em terceiro, o "vinho cigano" (cantina.md, Produção em terceiro; 03-modelo-de-dados.md,
// 2.5, Terceirização; 04, roteiro do ciclo 10, bloco 5). Lado de quem contrata: a remessa à cantina
// (uva, mosto ou vinho a granel, insumos e embalagens) e os retornos, parciais, do vinho pronto.
// O produtor não registra as operações da cantina ("entrega simples"). O granel sai e entra pelas
// operações da cantina (saída e entrada de granel); os insumos, pelo livro do estoque, para um
// local externo (a cantina), onde fica o saldo em poder do terceiro.
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { estabelecimento, local } from './acesso';
import { itemEstoque, produto, produtoFormato } from './cantina';
import { variedade } from './catalogos';
import { criacao, dataHora, emLista, id } from './comum';
import { loteComercial } from './envase';
import { loteItem } from './estoque';
import { pessoa } from './gestao';
import { empresa } from './plataforma';
import { operacao, parcela, projeto, romaneioItem } from './producao';
import { contratoTerceirizacao } from './terceiros';

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

export const SITUACOES_TERCEIRO = ['lancada', 'estornada'] as const;
export const TIPOS_ITEM_REMESSA = ['uva', 'granel', 'insumo'] as const;
export const ORIGENS_UVA_REMESSA = ['parcela', 'romaneio', 'fornecedor'] as const;
export const TIPOS_ITEM_RETORNO = ['granel', 'engarrafado', 'insumo_consumido'] as const;

export const remessaTerceiro = pgTable(
  'remessa_terceiro',
  {
    id: id(),
    empresaId: empresaId(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    projetoId: uuid('projeto_id').notNull(),
    /** Cantina que elabora (pessoa com o papel de cantina prestadora). */
    cantinaId: uuid('cantina_id').notNull(),
    contratoId: uuid('contrato_id'),
    executadoEm: dataHora('executado_em').notNull(),
    nfNumero: text('nf_numero'),
    nfChave: text('nf_chave'),
    /** Movimentos de estoque dos insumos e embalagens remetidos. */
    grupoEstoqueId: uuid('grupo_estoque_id'),
    /** Marcada pelo usuário quando a cantina devolveu tudo o que ia devolver. */
    concluidaEm: dataHora('concluida_em'),
    observacao: text('observacao'),
    situacao: text('situacao')
      .notNull()
      .default('lancada')
      .$type<(typeof SITUACOES_TERCEIRO)[number]>(),
    motivoEstorno: text('motivo_estorno'),
    ...criacao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.projetoId, t.empresaId, projeto),
    daEmpresa(t.cantinaId, t.empresaId, pessoa),
    daEmpresa(t.contratoId, t.empresaId, contratoTerceirizacao),
    unique('remessa_terceiro_id_empresa').on(t.id, t.empresaId),
    check('remessa_terceiro_situacao', emLista('situacao', SITUACOES_TERCEIRO)),
    check('remessa_terceiro_nf_chave', sql`nf_chave is null or nf_chave ~ '^[0-9]{44}$'`),
    index('remessa_terceiro_projeto').on(t.projetoId),
  ],
);

export const remessaTerceiroItem = pgTable(
  'remessa_terceiro_item',
  {
    id: id(),
    empresaId: empresaId(),
    remessaId: uuid('remessa_id').notNull(),
    ordem: integer('ordem').notNull(),
    tipo: text('tipo').notNull().$type<(typeof TIPOS_ITEM_REMESSA)[number]>(),
    // Uva.
    variedadeId: uuid('variedade_id').references(() => variedade.id),
    safra: integer('safra'),
    kg: numeric('kg', { precision: 12, scale: 1 }),
    origemUva: text('origem_uva').$type<(typeof ORIGENS_UVA_REMESSA)[number]>(),
    parcelaId: uuid('parcela_id'),
    romaneioItemId: uuid('romaneio_item_id'),
    fornecedorId: uuid('fornecedor_id'),
    // Granel: a saída de granel (tipo "remessa a terceiro") da cantina.
    operacaoId: uuid('operacao_id'),
    litros: numeric('litros', { precision: 12, scale: 2 }),
    // Insumo ou embalagem: do estoque para o local externo da cantina.
    itemId: uuid('item_id'),
    loteItemId: uuid('lote_item_id'),
    quantidade: numeric('quantidade', { precision: 14, scale: 3 }),
    localDestinoId: uuid('local_destino_id'),
  },
  (t) => [
    daEmpresa(t.remessaId, t.empresaId, remessaTerceiro).onDelete('cascade'),
    daEmpresa(t.parcelaId, t.empresaId, parcela),
    daEmpresa(t.romaneioItemId, t.empresaId, romaneioItem),
    daEmpresa(t.fornecedorId, t.empresaId, pessoa),
    daEmpresa(t.operacaoId, t.empresaId, operacao),
    daEmpresa(t.itemId, t.empresaId, itemEstoque),
    daEmpresa(t.loteItemId, t.empresaId, loteItem),
    daEmpresa(t.localDestinoId, t.empresaId, local),
    check('remessa_terceiro_item_tipo', emLista('tipo', TIPOS_ITEM_REMESSA)),
    check(
      'remessa_terceiro_item_uva',
      sql`tipo <> 'uva' or (variedade_id is not null and kg > 0 and ${emLista('origem_uva', ORIGENS_UVA_REMESSA)})`,
    ),
    check('remessa_terceiro_item_granel', sql`tipo <> 'granel' or operacao_id is not null`),
    check(
      'remessa_terceiro_item_insumo',
      sql`tipo <> 'insumo' or (item_id is not null and quantidade > 0 and local_destino_id is not null)`,
    ),
    index('remessa_terceiro_item_remessa').on(t.remessaId, t.ordem),
    index('remessa_terceiro_item_romaneio').on(t.romaneioItemId),
    index('remessa_terceiro_item_operacao').on(t.operacaoId),
  ],
);

export const retornoTerceiro = pgTable(
  'retorno_terceiro',
  {
    id: id(),
    empresaId: empresaId(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    projetoId: uuid('projeto_id').notNull(),
    cantinaId: uuid('cantina_id').notNull(),
    /** Remessa que este retorno devolve (vários retornos parciais por remessa). */
    remessaId: uuid('remessa_id'),
    executadoEm: dataHora('executado_em').notNull(),
    nfNumero: text('nf_numero'),
    nfChave: text('nf_chave'),
    glt: text('glt'),
    /** Perdas informadas pela cantina neste retorno (litros). */
    perdasInformadas: numeric('perdas_informadas', { precision: 12, scale: 2 }),
    /** Movimentos de estoque das garrafas que voltaram e dos insumos consumidos pela cantina. */
    grupoEstoqueId: uuid('grupo_estoque_id'),
    observacao: text('observacao'),
    situacao: text('situacao')
      .notNull()
      .default('lancada')
      .$type<(typeof SITUACOES_TERCEIRO)[number]>(),
    motivoEstorno: text('motivo_estorno'),
    ...criacao(),
  },
  (t) => [
    daEmpresa(t.estabelecimentoId, t.empresaId, estabelecimento),
    daEmpresa(t.projetoId, t.empresaId, projeto),
    daEmpresa(t.cantinaId, t.empresaId, pessoa),
    daEmpresa(t.remessaId, t.empresaId, remessaTerceiro),
    unique('retorno_terceiro_id_empresa').on(t.id, t.empresaId),
    check('retorno_terceiro_situacao', emLista('situacao', SITUACOES_TERCEIRO)),
    check('retorno_terceiro_nf_chave', sql`nf_chave is null or nf_chave ~ '^[0-9]{44}$'`),
    check('retorno_terceiro_perdas', sql`perdas_informadas is null or perdas_informadas >= 0`),
    index('retorno_terceiro_remessa').on(t.remessaId),
    index('retorno_terceiro_projeto').on(t.projetoId),
  ],
);

export const retornoTerceiroItem = pgTable(
  'retorno_terceiro_item',
  {
    id: id(),
    empresaId: empresaId(),
    retornoId: uuid('retorno_id').notNull(),
    ordem: integer('ordem').notNull(),
    tipo: text('tipo').notNull().$type<(typeof TIPOS_ITEM_RETORNO)[number]>(),
    /** Granel: a entrada de granel (tipo "retorno de terceiro") criada pelo retorno. */
    operacaoId: uuid('operacao_id'),
    litros: numeric('litros', { precision: 12, scale: 2 }),
    // Engarrafado.
    produtoId: uuid('produto_id'),
    formatoId: uuid('formato_id'),
    garrafas: integer('garrafas'),
    loteComercialId: uuid('lote_comercial_id'),
    // Insumo consumido pela cantina (sai do local externo).
    itemId: uuid('item_id'),
    loteItemId: uuid('lote_item_id'),
    quantidade: numeric('quantidade', { precision: 14, scale: 3 }),
    localId: uuid('local_id'),
  },
  (t) => [
    daEmpresa(t.retornoId, t.empresaId, retornoTerceiro).onDelete('cascade'),
    daEmpresa(t.operacaoId, t.empresaId, operacao),
    daEmpresa(t.produtoId, t.empresaId, produto),
    daEmpresa(t.formatoId, t.empresaId, produtoFormato),
    daEmpresa(t.loteComercialId, t.empresaId, loteComercial),
    daEmpresa(t.itemId, t.empresaId, itemEstoque),
    daEmpresa(t.loteItemId, t.empresaId, loteItem),
    daEmpresa(t.localId, t.empresaId, local),
    check('retorno_terceiro_item_tipo', emLista('tipo', TIPOS_ITEM_RETORNO)),
    check('retorno_terceiro_item_granel', sql`tipo <> 'granel' or operacao_id is not null`),
    check(
      'retorno_terceiro_item_engarrafado',
      sql`tipo <> 'engarrafado' or (formato_id is not null and garrafas > 0 and lote_comercial_id is not null)`,
    ),
    check(
      'retorno_terceiro_item_insumo',
      sql`tipo <> 'insumo_consumido' or (item_id is not null and quantidade > 0 and local_id is not null)`,
    ),
    index('retorno_terceiro_item_retorno').on(t.retornoId, t.ordem),
  ],
);
