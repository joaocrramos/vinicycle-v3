// Plataforma (03-modelo-de-dados.md, 2.1): o que não pertence a nenhuma empresa.
import {
  AMBIENTES_INTEGRACAO,
  ESCOPOS_PERFIL,
  EVENTOS_PADRAO,
  FORMAS_PAGAMENTO,
  ORIGENS_ITEM_FATURA,
  ORIGENS_RECEBIMENTO,
  ORIGENS_SITUACAO,
  PRIORIDADES_CHAMADO,
  PERIODICIDADES,
  SITUACOES_EMPRESA,
  SITUACOES_CHAMADO,
  SITUACOES_COBRANCA_EXTERNA,
  SITUACOES_ENVIO,
  SITUACOES_FATURA,
  SITUACOES_MUDANCA,
  SITUACOES_NOTA,
  TIPOS_ADICIONAL,
  TIPOS_DESCONTO,
  TIPOS_INTEGRACAO,
  TIPOS_MUDANCA,
  TIPOS_TERMO,
} from '@vinicycle/shared';
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  foreignKey,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { alteracao, criacao, dataHora, emLista, id, inativacao } from './comum';
import { usuario } from './acesso';
import { ficha } from './ficha';

export const modulo = pgTable('modulo', {
  id: id(),
  codigo: text('codigo').notNull().unique(),
  nome: text('nome').notNull(),
  funcao: text('funcao').notNull(),
  situacao: text('situacao').notNull().$type<'disponivel' | 'em_breve'>(),
  ordem: integer('ordem').notNull(),
});

export const funcionalidade = pgTable(
  'funcionalidade',
  {
    id: id(),
    codigo: text('codigo').notNull().unique(),
    nome: text('nome').notNull(),
    moduloId: uuid('modulo_id').references(() => modulo.id),
    escopo: text('escopo').notNull().$type<'empresa' | 'plataforma'>(),
    acoes: text('acoes').array().notNull(),
    somenteMaster: boolean('somente_master').notNull().default(false),
    ordem: integer('ordem').notNull(),
  },
  () => [
    check('funcionalidade_escopo', emLista('escopo', ['empresa', 'plataforma'])),
    check('funcionalidade_modulo_escopo', sql`(escopo = 'empresa') = (modulo_id is not null)`),
  ],
);

export const plano = pgTable('plano', {
  id: id(),
  nome: text('nome').notNull().unique(),
  descricao: text('descricao'),
  /** Vazio = sem limite. */
  limiteEstabelecimentos: integer('limite_estabelecimentos'),
  limiteUsuarios: integer('limite_usuarios'),
  limiteArmazenamentoGb: numeric('limite_armazenamento_gb', { precision: 8, scale: 2 }),
  /** Formas de pagamento aceitas (administracao.md, decidido em 03/10/2026). */
  formasPagamento: text('formas_pagamento')
    .array()
    .notNull()
    .default(sql`'{}'`)
    .$type<(typeof FORMAS_PAGAMENTO)[number][]>(),
  ...criacao(),
  ...alteracao(),
  ...inativacao(),
});

/**
 * Preço do plano por periodicidade, com vigência: um preço novo não muda as assinaturas em vigor,
 * que guardam o preço contratado (P25).
 */
export const planoPreco = pgTable(
  'plano_preco',
  {
    id: id(),
    planoId: uuid('plano_id')
      .notNull()
      .references(() => plano.id),
    periodicidade: text('periodicidade').notNull().$type<(typeof PERIODICIDADES)[number]>(),
    valor: numeric('valor', { precision: 12, scale: 2 }).notNull(),
    vigenteDesde: date('vigente_desde').notNull(),
    ...criacao(),
  },
  (t) => [
    check('plano_preco_periodicidade', emLista('periodicidade', PERIODICIDADES)),
    check('plano_preco_valor', sql`valor >= 0`),
    unique('plano_preco_vigencia').on(t.planoId, t.periodicidade, t.vigenteDesde),
  ],
);

/** Itens vendidos à parte: usuário, estabelecimento, armazenamento, módulo avulso (P25). */
export const adicional = pgTable(
  'adicional',
  {
    id: id(),
    nome: text('nome').notNull(),
    descricao: text('descricao'),
    tipo: text('tipo').notNull().$type<(typeof TIPOS_ADICIONAL)[number]>(),
    moduloId: uuid('modulo_id').references(() => modulo.id),
    /** Quanto cada unidade soma ao limite (usuários, estabelecimentos ou GB). */
    quantidadePorUnidade: integer('quantidade_por_unidade').notNull().default(1),
    ...criacao(),
    ...alteracao(),
    ...inativacao(),
  },
  () => [
    check('adicional_tipo', emLista('tipo', TIPOS_ADICIONAL)),
    check('adicional_modulo', sql`(tipo = 'modulo') = (modulo_id is not null)`),
    check('adicional_quantidade', sql`quantidade_por_unidade >= 1`),
  ],
);

export const adicionalPreco = pgTable(
  'adicional_preco',
  {
    id: id(),
    adicionalId: uuid('adicional_id')
      .notNull()
      .references(() => adicional.id),
    periodicidade: text('periodicidade').notNull().$type<(typeof PERIODICIDADES)[number]>(),
    valor: numeric('valor', { precision: 12, scale: 2 }).notNull(),
    vigenteDesde: date('vigente_desde').notNull(),
    ...criacao(),
  },
  (t) => [
    check('adicional_preco_periodicidade', emLista('periodicidade', PERIODICIDADES)),
    check('adicional_preco_valor', sql`valor >= 0`),
    unique('adicional_preco_vigencia').on(t.adicionalId, t.periodicidade, t.vigenteDesde),
  ],
);

export const planoModulo = pgTable(
  'plano_modulo',
  {
    planoId: uuid('plano_id')
      .notNull()
      .references(() => plano.id),
    moduloId: uuid('modulo_id')
      .notNull()
      .references(() => modulo.id),
  },
  (t) => [primaryKey({ columns: [t.planoId, t.moduloId] })],
);

/** O cliente que assina (P12). Raiz da empresa. */
export const empresa = pgTable(
  'empresa',
  {
    id: id(),
    fichaId: uuid('ficha_id')
      .notNull()
      .references(() => ficha.id),
    situacao: text('situacao').notNull().$type<(typeof SITUACOES_EMPRESA)[number]>(),
    moeda: text('moeda').notNull().default('BRL'),
    /** Marca nos impressos (P9). */
    corMarca: text('cor_marca'),
    logoAnexoId: uuid('logo_anexo_id'),
    contatoFinanceiroNome: text('contato_financeiro_nome'),
    contatoFinanceiroEmail: text('contato_financeiro_email'),
    contatoFinanceiroTelefone: text('contato_financeiro_telefone'),
    /** Guardado; uso só na fase fiscal (FISCAL.md). */
    regimeTributario: text('regime_tributario'),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    uniqueIndex('empresa_ficha').on(t.fichaId),
    check('empresa_situacao', emLista('situacao', SITUACOES_EMPRESA)),
  ],
);

/** Histórico de situações. Somente inclusão. */
export const empresaSituacao = pgTable(
  'empresa_situacao',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    situacao: text('situacao').notNull(),
    desde: dataHora('desde').notNull().defaultNow(),
    motivo: text('motivo'),
    origem: text('origem').notNull(),
    ...criacao(),
  },
  (t) => [
    index('empresa_situacao_empresa').on(t.empresaId, t.desde),
    check('empresa_situacao_situacao', emLista('situacao', SITUACOES_EMPRESA)),
    check('empresa_situacao_origem', emLista('origem', ORIGENS_SITUACAO)),
  ],
);

/**
 * Contrato da empresa. No ciclo 1 guarda só o plano, a vigência e o teste; preços, adicionais e
 * faturas entram com a parte comercial (04-plano-de-entregas.md, 2027).
 */
export const assinatura = pgTable(
  'assinatura',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    planoId: uuid('plano_id')
      .notNull()
      .references(() => plano.id),
    periodicidade: text('periodicidade').notNull(),
    inicio: date('inicio').notNull(),
    fim: date('fim'),
    emTeste: boolean('em_teste').notNull().default(false),
    fimTeste: date('fim_teste'),
    situacao: text('situacao').notNull().$type<'vigente' | 'encerrada'>(),
    /** Preço do plano congelado na contratação (P25). */
    valorContratado: numeric('valor_contratado', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    /** Ciclo de cobrança atual (vazio durante o teste). */
    cicloInicio: date('ciclo_inicio'),
    cicloFim: date('ciclo_fim'),
    /** Dia em que os ciclos começam: o 31 vira o último dia dos meses curtos e volta depois. */
    diaBase: integer('dia_base'),
    diaVencimento: integer('dia_vencimento').notNull().default(1),
    /** Última mudança do dia do vencimento: o Master só muda de novo depois do intervalo. */
    diaVencimentoAlteradoEm: date('dia_vencimento_alterado_em'),
    formaPagamento: text('forma_pagamento').$type<(typeof FORMAS_PAGAMENTO)[number]>(),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    check('assinatura_periodicidade', emLista('periodicidade', PERIODICIDADES)),
    check('assinatura_situacao', emLista('situacao', ['vigente', 'encerrada'])),
    check('assinatura_dia_vencimento', sql`dia_vencimento between 1 and 31`),
    check(
      'assinatura_forma',
      sql`forma_pagamento is null or ${emLista('forma_pagamento', FORMAS_PAGAMENTO)}`,
    ),
    check(
      'assinatura_ciclo',
      sql`(ciclo_inicio is null) = (ciclo_fim is null) and (ciclo_inicio is null or ciclo_fim >= ciclo_inicio)`,
    ),
    check('assinatura_valor', sql`valor_contratado >= 0`),
    uniqueIndex('assinatura_vigente')
      .on(t.empresaId)
      .where(sql`situacao = 'vigente'`),
    unique('assinatura_id_empresa').on(t.id, t.empresaId),
  ],
);

/** Adicionais contratados, com o preço e a quantidade por unidade congelados (P25). */
export const assinaturaItem = pgTable(
  'assinatura_item',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    assinaturaId: uuid('assinatura_id').notNull(),
    adicionalId: uuid('adicional_id')
      .notNull()
      .references(() => adicional.id),
    quantidade: integer('quantidade').notNull(),
    quantidadePorUnidade: integer('quantidade_por_unidade').notNull(),
    valorUnitario: numeric('valor_unitario', { precision: 12, scale: 2 }).notNull(),
    inicio: date('inicio').notNull(),
    /** Último dia em que vale (retirada na renovação); vazio = em vigor. */
    fim: date('fim'),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    foreignKey({
      columns: [t.assinaturaId, t.empresaId],
      foreignColumns: [assinatura.id, assinatura.empresaId],
    }),
    check('assinatura_item_quantidade', sql`quantidade >= 1 and quantidade_por_unidade >= 1`),
    check('assinatura_item_valor', sql`valor_unitario >= 0`),
    index('assinatura_item_assinatura').on(t.assinaturaId),
  ],
);

/**
 * Mudança de assinatura (administracao.md, Upgrade e Downgrade): o que aumenta vale na hora, com o
 * proporcional na próxima fatura; o que diminui fica agendado para a renovação, sem reembolso.
 */
export const assinaturaMudanca = pgTable(
  'assinatura_mudanca',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    assinaturaId: uuid('assinatura_id').notNull(),
    tipo: text('tipo').notNull().$type<(typeof TIPOS_MUDANCA)[number]>(),
    planoAnteriorId: uuid('plano_anterior_id').references(() => plano.id),
    planoId: uuid('plano_id').references(() => plano.id),
    periodicidade: text('periodicidade').$type<(typeof PERIODICIDADES)[number]>(),
    adicionalId: uuid('adicional_id').references(() => adicional.id),
    assinaturaItemId: uuid('assinatura_item_id').references(() => assinaturaItem.id),
    quantidade: integer('quantidade'),
    efeitoEm: date('efeito_em').notNull(),
    situacao: text('situacao').notNull().$type<(typeof SITUACOES_MUDANCA)[number]>(),
    /** Reajuste: o novo preço do plano; vazio = o preço de tabela no dia da renovação. */
    valorNovo: numeric('valor_novo', { precision: 12, scale: 2 }),
    motivo: text('motivo'),
    /** Diferença dos dias restantes do ciclo, cobrada na próxima fatura. */
    valorProporcional: numeric('valor_proporcional', { precision: 12, scale: 2 }),
    /** Fatura que cobrou o proporcional. */
    faturaId: uuid('fatura_id').references((): AnyPgColumn => fatura.id),
    origem: text('origem').notNull().$type<'plataforma' | 'master'>(),
    aplicadaEm: dataHora('aplicada_em'),
    canceladaEm: dataHora('cancelada_em'),
    canceladaPor: uuid('cancelada_por'),
    ...criacao(),
  },
  (t) => [
    foreignKey({
      columns: [t.assinaturaId, t.empresaId],
      foreignColumns: [assinatura.id, assinatura.empresaId],
    }),
    check('assinatura_mudanca_tipo', emLista('tipo', TIPOS_MUDANCA)),
    check('assinatura_mudanca_situacao', emLista('situacao', SITUACOES_MUDANCA)),
    check('assinatura_mudanca_origem', emLista('origem', ['plataforma', 'master'])),
    index('assinatura_mudanca_assinatura').on(t.assinaturaId, t.situacao),
  ],
);

/** Desconto e condição especial por cliente, com motivo e validade (decidido em 03/10/2026). */
export const desconto = pgTable(
  'desconto',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    tipo: text('tipo').notNull().$type<(typeof TIPOS_DESCONTO)[number]>(),
    /** Percentual (0 a 100) ou valor em reais por fatura. */
    valor: numeric('valor', { precision: 12, scale: 2 }).notNull(),
    motivo: text('motivo').notNull(),
    inicio: date('inicio').notNull(),
    /** Validade; vazio = sem fim. */
    fim: date('fim'),
    ...criacao(),
    ...inativacao(),
  },
  () => [
    check('desconto_tipo', emLista('tipo', TIPOS_DESCONTO)),
    check('desconto_valor', sql`valor > 0 and (tipo <> 'percentual' or valor <= 100)`),
    check('desconto_validade', sql`fim is null or fim >= inicio`),
  ],
);

/** Numeração das faturas da plataforma (administracao.md, Faturas: número sequencial). */
export const faturaNumero = pgSequence('fatura_numero', { startWith: 1 });

/** Cobrança de um ciclo da assinatura, ou avulsa (administracao.md, Faturas). */
export const fatura = pgTable(
  'fatura',
  {
    id: id(),
    numero: integer('numero')
      .notNull()
      .unique()
      .default(sql`nextval('fatura_numero')`),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    /** Vazio = fatura avulsa. */
    assinaturaId: uuid('assinatura_id'),
    cicloInicio: date('ciclo_inicio'),
    cicloFim: date('ciclo_fim'),
    emissao: date('emissao').notNull(),
    vencimento: date('vencimento').notNull(),
    total: numeric('total', { precision: 12, scale: 2 }).notNull(),
    situacao: text('situacao').notNull().$type<(typeof SITUACOES_FATURA)[number]>(),
    observacao: text('observacao'),
    canceladaEm: dataHora('cancelada_em'),
    canceladaPor: uuid('cancelada_por'),
    motivoCancelamento: text('motivo_cancelamento'),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    foreignKey({
      columns: [t.assinaturaId, t.empresaId],
      foreignColumns: [assinatura.id, assinatura.empresaId],
    }),
    check('fatura_situacao', emLista('situacao', SITUACOES_FATURA)),
    check('fatura_total', sql`total >= 0`),
    check('fatura_ciclo', sql`(ciclo_inicio is null) = (ciclo_fim is null)`),
    check(
      'fatura_cancelada',
      sql`(situacao = 'cancelada') = (cancelada_em is not null and motivo_cancelamento is not null)`,
    ),
    // Uma fatura válida por ciclo da assinatura.
    uniqueIndex('fatura_ciclo_unico')
      .on(t.assinaturaId, t.cicloInicio)
      .where(sql`situacao <> 'cancelada' and assinatura_id is not null`),
    index('fatura_empresa').on(t.empresaId, t.vencimento),
    unique('fatura_id_empresa').on(t.id, t.empresaId),
  ],
);

export const faturaItem = pgTable(
  'fatura_item',
  {
    id: id(),
    faturaId: uuid('fatura_id').notNull(),
    empresaId: uuid('empresa_id').notNull(),
    ordem: integer('ordem').notNull(),
    descricao: text('descricao').notNull(),
    origem: text('origem').notNull().$type<(typeof ORIGENS_ITEM_FATURA)[number]>(),
    quantidade: integer('quantidade').notNull().default(1),
    valorUnitario: numeric('valor_unitario', { precision: 12, scale: 2 }).notNull(),
    /** Quantidade × unitário; negativo no desconto. */
    valor: numeric('valor', { precision: 12, scale: 2 }).notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.faturaId, t.empresaId],
      foreignColumns: [fatura.id, fatura.empresaId],
    }),
    check('fatura_item_origem', emLista('origem', ORIGENS_ITEM_FATURA)),
    check('fatura_item_sinal', sql`(origem = 'desconto') = (valor < 0) or valor = 0`),
    index('fatura_item_fatura').on(t.faturaId),
  ],
);

/** Baixa de pagamento (administracao.md, Recebimentos). Somente inclusão; erro = estorno. */
export const recebimento = pgTable(
  'recebimento',
  {
    id: id(),
    faturaId: uuid('fatura_id').notNull(),
    empresaId: uuid('empresa_id').notNull(),
    data: date('data').notNull(),
    valor: numeric('valor', { precision: 12, scale: 2 }).notNull(),
    forma: text('forma').notNull().$type<(typeof FORMAS_PAGAMENTO)[number]>(),
    referencia: text('referencia'),
    origem: text('origem').notNull().$type<(typeof ORIGENS_RECEBIMENTO)[number]>(),
    estornadoEm: dataHora('estornado_em'),
    estornadoPor: uuid('estornado_por'),
    motivoEstorno: text('motivo_estorno'),
    ...criacao(),
  },
  (t) => [
    foreignKey({
      columns: [t.faturaId, t.empresaId],
      foreignColumns: [fatura.id, fatura.empresaId],
    }),
    check('recebimento_valor', sql`valor > 0`),
    check('recebimento_forma', emLista('forma', FORMAS_PAGAMENTO)),
    check('recebimento_origem', emLista('origem', ORIGENS_RECEBIMENTO)),
    check('recebimento_estorno', sql`(estornado_em is null) = (motivo_estorno is null)`),
    index('recebimento_fatura').on(t.faturaId),
  ],
);

/** Avisos da régua de cobrança já enviados: cada um sai uma vez (administracao.md, Inadimplência). */
export const avisoCobranca = pgTable(
  'aviso_cobranca',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    tipo: text('tipo').notNull(),
    /** Fatura ou assinatura do aviso. */
    referenciaId: uuid('referencia_id').notNull(),
    /** Ex.: "D-3", "vencida", a data da renovação. */
    chave: text('chave').notNull(),
    ...criacao(),
  },
  (t) => [unique('aviso_cobranca_unico').on(t.tipo, t.referenciaId, t.chave)],
);

/**
 * Interesse num módulo não contratado, registrado na vitrine "Conheça e contrate"; chega à
 * plataforma como oportunidade (ambiente-cliente.md, Módulos).
 */
export const interesseModulo = pgTable(
  'interesse_modulo',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    moduloId: uuid('modulo_id')
      .notNull()
      .references(() => modulo.id),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id),
    observacao: text('observacao'),
    atendidoEm: dataHora('atendido_em'),
    atendidoPor: uuid('atendido_por'),
    ...criacao(),
  },
  (t) => [
    uniqueIndex('interesse_modulo_aberto')
      .on(t.empresaId, t.moduloId)
      .where(sql`atendido_em is null`),
  ],
);

/**
 * Provedores plugáveis (administracao.md, Integração de pagamentos; P20): pagamento, WhatsApp, SMS.
 * Segredos cifrados (P21); o token do aviso (webhook) confere quem chama.
 */
export const integracao = pgTable(
  'integracao',
  {
    id: id(),
    tipo: text('tipo').notNull().$type<(typeof TIPOS_INTEGRACAO)[number]>(),
    adaptador: text('adaptador').notNull(),
    nome: text('nome').notNull(),
    ambiente: text('ambiente').notNull().$type<(typeof AMBIENTES_INTEGRACAO)[number]>(),
    /** Formas de pagamento atendidas (tipo pagamento). */
    formas: text('formas')
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** Configuração sem segredo (nota de serviço, número do WhatsApp…). */
    configuracao: jsonb('configuracao').notNull().default({}),
    credenciaisCifradas: text('credenciais_cifradas'),
    tokenAvisoCifrado: text('token_aviso_cifrado'),
    ...criacao(),
    ...alteracao(),
    ...inativacao(),
  },
  () => [
    check('integracao_tipo', emLista('tipo', TIPOS_INTEGRACAO)),
    check('integracao_ambiente', emLista('ambiente', AMBIENTES_INTEGRACAO)),
  ],
);

/** Avisos recebidos dos provedores. Somente inclusão; o mesmo aviso não é processado duas vezes. */
export const eventoIntegracao = pgTable(
  'evento_integracao',
  {
    id: id(),
    integracaoId: uuid('integracao_id')
      .notNull()
      .references(() => integracao.id),
    identificadorExterno: text('identificador_externo').notNull(),
    tipoOriginal: text('tipo_original').notNull(),
    tipoPadrao: text('tipo_padrao').notNull().$type<(typeof EVENTOS_PADRAO)[number]>(),
    conteudo: jsonb('conteudo').notNull(),
    assinaturaVerificada: boolean('assinatura_verificada').notNull(),
    recebidoEm: dataHora('recebido_em').notNull().defaultNow(),
    processadoEm: dataHora('processado_em'),
    resultado: text('resultado'),
  },
  (t) => [
    unique('evento_integracao_unico').on(t.integracaoId, t.identificadorExterno),
    check('evento_integracao_tipo', emLista('tipo_padrao', EVENTOS_PADRAO)),
  ],
);

/** A empresa como cliente no provedor de pagamento. */
export const clienteProvedor = pgTable(
  'cliente_provedor',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    integracaoId: uuid('integracao_id')
      .notNull()
      .references(() => integracao.id),
    identificadorExterno: text('identificador_externo').notNull(),
    ...criacao(),
  },
  (t) => [unique('cliente_provedor_unico').on(t.empresaId, t.integracaoId)],
);

/** Cobrança da fatura no provedor: link de pagamento, PIX e boleto. */
export const cobrancaExterna = pgTable(
  'cobranca_externa',
  {
    id: id(),
    faturaId: uuid('fatura_id').notNull(),
    empresaId: uuid('empresa_id').notNull(),
    integracaoId: uuid('integracao_id')
      .notNull()
      .references(() => integracao.id),
    forma: text('forma'),
    identificadorExterno: text('identificador_externo'),
    link: text('link'),
    pixCopiaCola: text('pix_copia_cola'),
    situacao: text('situacao').notNull().$type<(typeof SITUACOES_COBRANCA_EXTERNA)[number]>(),
    tentativas: integer('tentativas').notNull().default(0),
    ultimoErro: text('ultimo_erro'),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    foreignKey({
      columns: [t.faturaId, t.empresaId],
      foreignColumns: [fatura.id, fatura.empresaId],
    }),
    check('cobranca_externa_situacao', emLista('situacao', SITUACOES_COBRANCA_EXTERNA)),
    uniqueIndex('cobranca_externa_fatura')
      .on(t.faturaId)
      .where(sql`situacao not in ('cancelada', 'erro')`),
    uniqueIndex('cobranca_externa_identificador')
      .on(t.integracaoId, t.identificadorExterno)
      .where(sql`identificador_externo is not null`),
  ],
);

/** Nota fiscal de serviço da fatura, emitida pelo provedor (pendência 25). */
export const notaServico = pgTable(
  'nota_servico',
  {
    id: id(),
    faturaId: uuid('fatura_id').notNull(),
    empresaId: uuid('empresa_id').notNull(),
    integracaoId: uuid('integracao_id')
      .notNull()
      .references(() => integracao.id),
    identificadorExterno: text('identificador_externo'),
    numero: text('numero'),
    situacao: text('situacao').notNull().$type<(typeof SITUACOES_NOTA)[number]>(),
    linkPdf: text('link_pdf'),
    linkXml: text('link_xml'),
    tentativas: integer('tentativas').notNull().default(0),
    ultimoErro: text('ultimo_erro'),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    foreignKey({
      columns: [t.faturaId, t.empresaId],
      foreignColumns: [fatura.id, fatura.empresaId],
    }),
    check('nota_servico_situacao', emLista('situacao', SITUACOES_NOTA)),
    uniqueIndex('nota_servico_fatura')
      .on(t.faturaId)
      .where(sql`situacao <> 'cancelada'`),
  ],
);

/**
 * Versões dos modelos de mensagem editados pela Administração (administracao.md, Modelos de
 * mensagem). Sem versão ativa, vale o texto padrão do sistema.
 */
export const modeloMensagemVersao = pgTable(
  'modelo_mensagem_versao',
  {
    id: id(),
    codigo: text('codigo').notNull(),
    versao: integer('versao').notNull(),
    assunto: text('assunto').notNull(),
    corpo: text('corpo').notNull(),
    ativa: boolean('ativa').notNull(),
    ...criacao(),
  },
  (t) => [
    unique('modelo_mensagem_versao_unica').on(t.codigo, t.versao),
    uniqueIndex('modelo_mensagem_ativa')
      .on(t.codigo)
      .where(sql`ativa`),
  ],
);

export const chamadoNumero = pgSequence('chamado_numero', { startWith: 1 });

/** Chamado de suporte (administracao.md, Suporte). Sem empresa quando vem da página pública. */
export const chamado = pgTable(
  'chamado',
  {
    id: id(),
    numero: integer('numero')
      .notNull()
      .unique()
      .default(sql`nextval('chamado_numero')`),
    empresaId: uuid('empresa_id').references(() => empresa.id),
    solicitanteId: uuid('solicitante_id').references(() => usuario.id),
    solicitanteNome: text('solicitante_nome').notNull(),
    solicitanteEmail: text('solicitante_email').notNull(),
    documentoInformado: text('documento_informado'),
    origem: text('origem').notNull().$type<'sistema' | 'publico'>(),
    assunto: text('assunto').notNull(),
    categoria: text('categoria').notNull(),
    prioridade: text('prioridade').notNull().$type<(typeof PRIORIDADES_CHAMADO)[number]>(),
    situacao: text('situacao').notNull().$type<(typeof SITUACOES_CHAMADO)[number]>(),
    /** Prazo da primeira resposta da equipe (SLA). */
    prazoEm: dataHora('prazo_em').notNull(),
    primeiraRespostaEm: dataHora('primeira_resposta_em'),
    encerradoEm: dataHora('encerrado_em'),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    check('chamado_origem', emLista('origem', ['sistema', 'publico'])),
    check('chamado_prioridade', emLista('prioridade', PRIORIDADES_CHAMADO)),
    check('chamado_situacao', emLista('situacao', SITUACOES_CHAMADO)),
    index('chamado_empresa').on(t.empresaId, t.situacao),
  ],
);

/** Conversa do chamado. Somente inclusão; nota interna só a equipe vê. */
export const chamadoMensagem = pgTable(
  'chamado_mensagem',
  {
    id: id(),
    chamadoId: uuid('chamado_id')
      .notNull()
      .references(() => chamado.id),
    empresaId: uuid('empresa_id'),
    autorId: uuid('autor_id').references(() => usuario.id),
    autorTipo: text('autor_tipo').notNull().$type<'cliente' | 'equipe'>(),
    texto: text('texto').notNull(),
    interna: boolean('interna').notNull().default(false),
    ...criacao(),
  },
  (t) => [
    check('chamado_mensagem_autor', emLista('autor_tipo', ['cliente', 'equipe'])),
    check('chamado_mensagem_interna', sql`not interna or autor_tipo = 'equipe'`),
    index('chamado_mensagem_chamado').on(t.chamadoId),
  ],
);

/** Mudanças de situação. Somente inclusão. */
export const chamadoHistorico = pgTable('chamado_historico', {
  id: id(),
  chamadoId: uuid('chamado_id')
    .notNull()
    .references(() => chamado.id),
  empresaId: uuid('empresa_id'),
  de: text('de'),
  para: text('para').notNull(),
  ...criacao(),
});

/** Prazo de atendimento por plano ou por cliente, e por prioridade (horas corridas). */
export const chamadoPrazo = pgTable(
  'chamado_prazo',
  {
    id: id(),
    planoId: uuid('plano_id').references(() => plano.id),
    empresaId: uuid('empresa_id').references(() => empresa.id),
    prioridade: text('prioridade').notNull().$type<(typeof PRIORIDADES_CHAMADO)[number]>(),
    horas: integer('horas').notNull(),
    ...criacao(),
  },
  (t) => [
    check('chamado_prazo_alvo', sql`(plano_id is null) <> (empresa_id is null)`),
    check('chamado_prazo_prioridade', emLista('prioridade', PRIORIDADES_CHAMADO)),
    check('chamado_prazo_horas', sql`horas between 1 and 2000`),
    uniqueIndex('chamado_prazo_plano')
      .on(t.planoId, t.prioridade)
      .where(sql`plano_id is not null`),
    uniqueIndex('chamado_prazo_empresa')
      .on(t.empresaId, t.prioridade)
      .where(sql`empresa_id is not null`),
  ],
);

/**
 * Personificação (P28): o membro da equipe vê e age como o usuário do cliente, por tempo limitado e
 * com motivo. Nomes guardados no início, para a auditoria da empresa mostrar sem abrir a equipe.
 */
export const personificacao = pgTable(
  'personificacao',
  {
    id: id(),
    membroId: uuid('membro_id')
      .notNull()
      .references(() => usuario.id),
    membroNome: text('membro_nome').notNull(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id),
    usuarioNome: text('usuario_nome').notNull(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    motivo: text('motivo').notNull(),
    chamadoId: uuid('chamado_id').references(() => chamado.id),
    inicio: dataHora('inicio').notNull().defaultNow(),
    fimPrevisto: dataHora('fim_previsto').notNull(),
    fim: dataHora('fim'),
    formaEncerramento: text('forma_encerramento').$type<'manual' | 'tempo' | 'saida'>(),
  },
  (t) => [
    check(
      'personificacao_forma',
      sql`forma_encerramento is null or forma_encerramento in ('manual', 'tempo', 'saida')`,
    ),
    index('personificacao_empresa').on(t.empresaId, t.inicio),
  ],
);

/** Perfil (P27): de plataforma, modelo ou da empresa. */
export const perfil = pgTable(
  'perfil',
  {
    id: id(),
    escopo: text('escopo').notNull().$type<(typeof ESCOPOS_PERFIL)[number]>(),
    empresaId: uuid('empresa_id').references(() => empresa.id),
    /** Código do modelo (MASTER, RT…), copiado para a empresa. */
    codigo: text('codigo'),
    nome: text('nome').notNull(),
    descricao: text('descricao'),
    modeloOrigemId: uuid('modelo_origem_id'),
    eMaster: boolean('e_master').notNull().default(false),
    ...criacao(),
    ...alteracao(),
    ...inativacao(),
  },
  (t) => [
    check('perfil_escopo', emLista('escopo', ESCOPOS_PERFIL)),
    check('perfil_empresa_escopo', sql`(escopo = 'empresa') = (empresa_id is not null)`),
    check('perfil_master_escopo', sql`not e_master or escopo <> 'plataforma'`),
    unique('perfil_id_empresa').on(t.id, t.empresaId),
    uniqueIndex('perfil_nome_empresa')
      .on(t.empresaId, sql`lower(nome)`)
      .where(sql`escopo = 'empresa'`),
    uniqueIndex('perfil_nome_global')
      .on(t.escopo, sql`lower(nome)`)
      .where(sql`escopo <> 'empresa'`),
    uniqueIndex('perfil_master_empresa')
      .on(t.empresaId)
      .where(sql`e_master and escopo = 'empresa'`),
    foreignKey({ columns: [t.modeloOrigemId], foreignColumns: [t.id] }),
  ],
);

/** Grade telas × ações (P27). Negado por padrão: só as linhas existentes valem. */
export const perfilPermissao = pgTable(
  'perfil_permissao',
  {
    perfilId: uuid('perfil_id')
      .notNull()
      .references(() => perfil.id, { onDelete: 'cascade' }),
    funcionalidadeId: uuid('funcionalidade_id')
      .notNull()
      .references(() => funcionalidade.id),
    acao: text('acao').notNull(),
    /** Repete a empresa do perfil, para o isolamento no banco (RLS). */
    empresaId: uuid('empresa_id').references(() => empresa.id),
  },
  (t) => [
    primaryKey({ columns: [t.perfilId, t.funcionalidadeId, t.acao] }),
    foreignKey({
      columns: [t.perfilId, t.empresaId],
      foreignColumns: [perfil.id, perfil.empresaId],
    }),
    index('perfil_permissao_empresa').on(t.empresaId),
  ],
);

/** Quem é da equipe da plataforma (P8). */
export const equipeMembro = pgTable('equipe_membro', {
  id: id(),
  usuarioId: uuid('usuario_id')
    .notNull()
    .unique()
    .references(() => usuario.id),
  perfilId: uuid('perfil_id')
    .notNull()
    .references(() => perfil.id),
  concedidoPor: uuid('concedido_por'),
  concedidoEm: dataHora('concedido_em').notNull().defaultNow(),
  ...alteracao(),
  ...inativacao(),
});

export const termoVersao = pgTable(
  'termo_versao',
  {
    id: id(),
    tipo: text('tipo').notNull().$type<(typeof TIPOS_TERMO)[number]>(),
    versao: text('versao').notNull(),
    texto: text('texto').notNull(),
    vigenteDesde: dataHora('vigente_desde').notNull(),
    ...criacao(),
  },
  (t) => [
    check('termo_versao_tipo', emLista('tipo', TIPOS_TERMO)),
    unique('termo_versao_tipo_versao').on(t.tipo, t.versao),
  ],
);

/** Aceite datado (P21). Somente inclusão. */
export const termoAceite = pgTable(
  'termo_aceite',
  {
    id: id(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id),
    termoVersaoId: uuid('termo_versao_id')
      .notNull()
      .references(() => termoVersao.id),
    aceitoEm: dataHora('aceito_em').notNull().defaultNow(),
    ip: inet('ip'),
  },
  (t) => [unique('termo_aceite_usuario_versao').on(t.usuarioId, t.termoVersaoId)],
);

/** Parâmetros gerais (administracao.md). Uma linha só. */
export const configPlataforma = pgTable(
  'config_plataforma',
  {
    id: boolean('id').primaryKey().default(true),
    conviteValidadeDias: integer('convite_validade_dias').notNull().default(7),
    bastaoHoras: integer('bastao_horas').notNull().default(48),
    testeDias: integer('teste_dias').notNull().default(7),
    toleranciaDias: integer('tolerancia_dias').notNull().default(5),
    /** Dias de somente leitura depois da tolerância, antes do bloqueio. */
    somenteLeituraDias: integer('somente_leitura_dias').notNull().default(15),
    /** A fatura do ciclo sai estes dias antes do vencimento. */
    faturaAntecedenciaDias: integer('fatura_antecedencia_dias').notNull().default(10),
    /** Avisos antes do vencimento (0 = no dia). */
    /** Categorias dos chamados (lista da plataforma). */
    chamadoCategorias: text('chamado_categorias')
      .array()
      .notNull()
      .default(sql`'{Dúvida,Erro no sistema,Sugestão,Financeiro,Acesso,Outro}'`),
    avisosVencimentoDias: integer('avisos_vencimento_dias')
      .array()
      .notNull()
      .default(sql`'{3,0}'`),
    avisosTesteDias: integer('avisos_teste_dias')
      .array()
      .notNull()
      .default(sql`'{3,1}'`),
    ...alteracao(),
  },
  () => [check('config_plataforma_unica', sql`id`)],
);

/** Fila de e-mail, WhatsApp e SMS. */
export const envio = pgTable(
  'envio',
  {
    id: id(),
    canal: text('canal').notNull().$type<'email' | 'whatsapp' | 'sms'>(),
    destinatario: text('destinatario').notNull(),
    modelo: text('modelo').notNull(),
    assunto: text('assunto'),
    corpoTexto: text('corpo_texto').notNull(),
    corpoHtml: text('corpo_html'),
    origem: text('origem').notNull(),
    origemId: uuid('origem_id'),
    empresaId: uuid('empresa_id').references(() => empresa.id),
    situacao: text('situacao')
      .notNull()
      .default('pendente')
      .$type<(typeof SITUACOES_ENVIO)[number]>(),
    tentativas: integer('tentativas').notNull().default(0),
    ultimoErro: text('ultimo_erro'),
    provedor: text('provedor'),
    proximaTentativaEm: dataHora('proxima_tentativa_em').notNull().defaultNow(),
    enviadoEm: dataHora('enviado_em'),
    ...criacao(),
  },
  (t) => [
    check('envio_canal', emLista('canal', ['email', 'whatsapp', 'sms'])),
    check('envio_situacao', emLista('situacao', SITUACOES_ENVIO)),
    index('envio_pendente')
      .on(t.proximaTentativaEm)
      .where(sql`situacao = 'pendente'`),
  ],
);

/** Cada tentativa de envio. Somente inclusão. */
export const envioTentativa = pgTable('envio_tentativa', {
  id: id(),
  envioId: uuid('envio_id')
    .notNull()
    .references(() => envio.id),
  ocorridaEm: dataHora('ocorrida_em').notNull().defaultNow(),
  sucesso: boolean('sucesso').notNull(),
  resposta: jsonb('resposta'),
});
