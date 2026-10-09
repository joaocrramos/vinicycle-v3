// Empresa e acesso (03-modelo-de-dados.md, 2.2).
import {
  ATIVIDADES_MAPA,
  FORMAS_REGISTRO,
  ORIGENS_UVA,
  SITUACOES_CONVITE,
  TIPOS_TOKEN,
  USOS_LOCAL,
} from '@vinicycle/shared'
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { alteracao, criacao, dataHora, emLista, id, inativacao } from './comum'
import { indicacaoGeografica } from './catalogos'
import { ficha } from './ficha'
import { pessoa } from './gestao'
import { empresa, perfil } from './plataforma'

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' })

/** Unidade com CNPJ e registro MAPA (P12). */
export const estabelecimento = pgTable(
  'estabelecimento',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    fichaId: uuid('ficha_id')
      .notNull()
      .references(() => ficha.id),
    registroMapa: text('registro_mapa'),
    registroMapaValidade: date('registro_mapa_validade'),
    capacidadeLitros: numeric('capacidade_litros', { precision: 14, scale: 2 }),
    fuso: text('fuso').notNull(),
    origemUva: text('origem_uva').$type<(typeof ORIGENS_UVA)[number]>(),
    atividadesMapa: text('atividades_mapa')
      .array()
      .notNull()
      .default(sql`'{}'`),
    temManualBpf: boolean('tem_manual_bpf'),
    manualBpfRevisao: date('manual_bpf_revisao'),
    formaRegistroAtual: text('forma_registro_atual').$type<(typeof FORMAS_REGISTRO)[number]>(),
    /** Responsável técnico: pessoa com o papel de RT (P12). */
    responsavelTecnicoId: uuid('responsavel_tecnico_id'),
    /** Classes oficiais de produto que o estabelecimento elabora (códigos de classe_produto). */
    produtosElaborados: text('produtos_elaborados')
      .array()
      .notNull()
      .default(sql`'{}'`),
    ...criacao(),
    ...alteracao(),
    ...inativacao(),
  },
  (t) => [
    unique('estabelecimento_id_empresa').on(t.id, t.empresaId),
    uniqueIndex('estabelecimento_ficha').on(t.fichaId),
    index('estabelecimento_empresa').on(t.empresaId),
    check(
      'estabelecimento_origem_uva',
      sql`origem_uva is null or ${emLista('origem_uva', ORIGENS_UVA)}`,
    ),
    check(
      'estabelecimento_atividades',
      sql.raw(
        `atividades_mapa <@ array[${ATIVIDADES_MAPA.map((a) => `'${a}'`).join(', ')}]::text[]`,
      ),
    ),
    check(
      'estabelecimento_forma_registro',
      sql`forma_registro_atual is null or ${emLista('forma_registro_atual', FORMAS_REGISTRO)}`,
    ),
    check('estabelecimento_capacidade', sql`capacidade_litros is null or capacidade_litros >= 0`),
    foreignKey({
      name: 'estabelecimento_rt_fk',
      columns: [t.responsavelTecnicoId, t.empresaId],
      foreignColumns: [pessoa.id, pessoa.empresaId],
    }),
  ],
)

/** Onde ficam recipientes e estoques. Um só cadastro de locais (gestao.md). */
export const local = pgTable(
  'local',
  {
    id: id(),
    empresaId: uuid('empresa_id').notNull(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    nome: text('nome').notNull(),
    uso: text('uso').notNull().$type<(typeof USOS_LOCAL)[number]>(),
    /** Módulo do estoque (ambiente-cliente.md, Estoque: um por módulo). */
    moduloEstoque: text('modulo_estoque'),
    refrigerado: boolean('refrigerado').notNull().default(false),
    /** Cantina de terceiro. */
    externo: boolean('externo').notNull().default(false),
    observacoes: text('observacoes'),
    ...criacao(),
    ...alteracao(),
    ...inativacao(),
  },
  (t) => [
    foreignKey({
      columns: [t.estabelecimentoId, t.empresaId],
      foreignColumns: [estabelecimento.id, estabelecimento.empresaId],
    }),
    unique('local_id_empresa').on(t.id, t.empresaId),
    uniqueIndex('local_nome').on(t.estabelecimentoId, sql`lower(nome)`),
    check('local_uso', emLista('uso', USOS_LOCAL)),
    check('local_modulo_estoque', sql`(uso = 'recipientes') = (modulo_estoque is null)`),
  ],
)

/** Identidade única (P8). */
export const usuario = pgTable(
  'usuario',
  {
    id: id(),
    email: text('email').notNull(),
    fichaId: uuid('ficha_id')
      .notNull()
      .references(() => ficha.id),
    /** Vazio até o usuário definir a senha (convite ou criação pela plataforma). */
    senhaHash: text('senha_hash'),
    totpSegredoCifrado: text('totp_segredo_cifrado'),
    totpAtivoEm: dataHora('totp_ativo_em'),
    preferencias: jsonb('preferencias').notNull().default({}),
    tentativasLogin: integer('tentativas_login').notNull().default(0),
    bloqueadoAte: dataHora('bloqueado_ate'),
    ultimoAcessoEm: dataHora('ultimo_acesso_em'),
    senhaAlteradaEm: dataHora('senha_alterada_em'),
    ...criacao(),
    ...alteracao(),
    ...inativacao(),
  },
  (t) => [
    uniqueIndex('usuario_email').on(sql`lower(email)`),
    uniqueIndex('usuario_ficha').on(t.fichaId),
  ],
)

/** Dispositivos conectados (P10). */
export const sessao = pgTable(
  'sessao',
  {
    id: id(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id),
    tokenHash: bytea('token_hash').notNull(),
    criadaEm: dataHora('criada_em').notNull().defaultNow(),
    expiraEm: dataHora('expira_em').notNull(),
    ultimoUsoEm: dataHora('ultimo_uso_em').notNull().defaultNow(),
    encerradaEm: dataHora('encerrada_em'),
    motivoEncerramento: text('motivo_encerramento'),
    ip: inet('ip'),
    navegador: text('navegador'),
    /** "empresa" (ambiente do cliente) ou "plataforma" (Administração). */
    contexto: text('contexto').notNull().default('empresa').$type<'empresa' | 'plataforma'>(),
    empresaId: uuid('empresa_id').references(() => empresa.id),
    /** Vazio com empresa ativa = "Todos" os estabelecimentos permitidos. */
    estabelecimentoId: uuid('estabelecimento_id').references(() => estabelecimento.id),
    /** Segundo fator conferido nesta sessão (P21). */
    segundoFatorEm: dataHora('segundo_fator_em'),
    /** Personificação em curso nesta sessão (P28). */
    personificacaoId: uuid('personificacao_id'),
  },
  (t) => [
    uniqueIndex('sessao_token').on(t.tokenHash),
    index('sessao_usuario').on(t.usuarioId),
    check('sessao_contexto', emLista('contexto', ['empresa', 'plataforma'])),
  ],
)

/** Códigos e links de uso único (P10). */
export const tokenVerificacao = pgTable(
  'token_verificacao',
  {
    id: id(),
    usuarioId: uuid('usuario_id').references(() => usuario.id),
    email: text('email').notNull(),
    tipo: text('tipo').notNull().$type<(typeof TIPOS_TOKEN)[number]>(),
    tokenHash: bytea('token_hash').notNull(),
    dados: jsonb('dados'),
    expiraEm: dataHora('expira_em').notNull(),
    usadoEm: dataHora('usado_em'),
    tentativas: integer('tentativas').notNull().default(0),
    ...criacao(),
  },
  (t) => [
    uniqueIndex('token_verificacao_hash').on(t.tokenHash),
    index('token_verificacao_usuario').on(t.usuarioId, t.tipo),
    check('token_verificacao_tipo', emLista('tipo', TIPOS_TOKEN)),
  ],
)

/** Entrada de usuário na empresa (P8; administracao.md, Fluxo, passo 3). */
export const convite = pgTable(
  'convite',
  {
    id: id(),
    empresaId: uuid('empresa_id').notNull(),
    email: text('email').notNull(),
    perfilId: uuid('perfil_id').notNull(),
    /** Vazio = todos os estabelecimentos (P12). */
    estabelecimentos: uuid('estabelecimentos')
      .array()
      .notNull()
      .default(sql`'{}'`),
    tokenHash: bytea('token_hash').notNull(),
    enviadoPor: uuid('enviado_por'),
    enviadoEm: dataHora('enviado_em').notNull().defaultNow(),
    expiraEm: dataHora('expira_em').notNull(),
    situacao: text('situacao')
      .notNull()
      .default('pendente')
      .$type<(typeof SITUACOES_CONVITE)[number]>(),
    reenvios: integer('reenvios').notNull().default(0),
    aceitoEm: dataHora('aceito_em'),
    aceitoPor: uuid('aceito_por'),
    canceladoEm: dataHora('cancelado_em'),
    canceladoPor: uuid('cancelado_por'),
    ...criacao(),
  },
  (t) => [
    foreignKey({ columns: [t.empresaId], foreignColumns: [empresa.id] }),
    foreignKey({
      columns: [t.perfilId, t.empresaId],
      foreignColumns: [perfil.id, perfil.empresaId],
    }),
    uniqueIndex('convite_token').on(t.tokenHash),
    uniqueIndex('convite_pendente')
      .on(t.empresaId, sql`lower(email)`)
      .where(sql`situacao = 'pendente'`),
    check('convite_situacao', emLista('situacao', SITUACOES_CONVITE)),
  ],
)

/** Usuário numa empresa (P8), com um perfil (P27). */
export const vinculo = pgTable(
  'vinculo',
  {
    id: id(),
    empresaId: uuid('empresa_id').notNull(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id),
    perfilId: uuid('perfil_id').notNull(),
    /** Repete `perfil.e_master`, para garantir no banco um só Master ativo por empresa. */
    eMaster: boolean('e_master').notNull().default(false),
    ultimoEstabelecimentoId: uuid('ultimo_estabelecimento_id'),
    conviteId: uuid('convite_id').references(() => convite.id),
    ...criacao(),
    ...alteracao(),
    ...inativacao(),
  },
  (t) => [
    foreignKey({ columns: [t.empresaId], foreignColumns: [empresa.id] }),
    foreignKey({
      columns: [t.perfilId, t.empresaId],
      foreignColumns: [perfil.id, perfil.empresaId],
    }),
    unique('vinculo_id_empresa').on(t.id, t.empresaId),
    uniqueIndex('vinculo_usuario_empresa').on(t.empresaId, t.usuarioId),
    uniqueIndex('vinculo_master')
      .on(t.empresaId)
      .where(sql`e_master and ativo`),
    index('vinculo_usuario').on(t.usuarioId),
  ],
)

/** Restrição por estabelecimento. Sem linhas = acesso a todos (P12). */
export const vinculoEstabelecimento = pgTable(
  'vinculo_estabelecimento',
  {
    vinculoId: uuid('vinculo_id').notNull(),
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    empresaId: uuid('empresa_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.vinculoId, t.estabelecimentoId] }),
    foreignKey({
      columns: [t.vinculoId, t.empresaId],
      foreignColumns: [vinculo.id, vinculo.empresaId],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.estabelecimentoId, t.empresaId],
      foreignColumns: [estabelecimento.id, estabelecimento.empresaId],
    }),
  ],
)

/** IGs usadas pelo estabelecimento: ligam os controles da IG (00-visao-geral.md, Perfil). */
export const estabelecimentoIg = pgTable(
  'estabelecimento_ig',
  {
    estabelecimentoId: uuid('estabelecimento_id').notNull(),
    empresaId: uuid('empresa_id').notNull(),
    indicacaoGeograficaId: uuid('indicacao_geografica_id')
      .notNull()
      .references(() => indicacaoGeografica.id),
    desde: date('desde'),
  },
  (t) => [
    primaryKey({ columns: [t.estabelecimentoId, t.indicacaoGeograficaId] }),
    foreignKey({
      columns: [t.estabelecimentoId, t.empresaId],
      foreignColumns: [estabelecimento.id, estabelecimento.empresaId],
    }).onDelete('cascade'),
  ],
)

/** Passagem de bastão do Master (administracao.md, Master e passagem de bastão). */
export const trocaMaster = pgTable(
  'troca_master',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    masterAtualId: uuid('master_atual_id').references(() => usuario.id),
    /** Usuário escolhido, quando já tem vínculo; senão, só o e-mail (convite). */
    escolhidoUsuarioId: uuid('escolhido_usuario_id').references(() => usuario.id),
    escolhidoEmail: text('escolhido_email').notNull(),
    /** Perfil que o Master atual recebe; vazio = inativar o vínculo dele. */
    perfilAnteriorId: uuid('perfil_anterior_id'),
    iniciadoPor: text('iniciado_por').notNull().$type<'master' | 'suporte'>(),
    motivo: text('motivo'),
    tokenHash: bytea('token_hash').notNull(),
    expiraEm: dataHora('expira_em').notNull(),
    situacao: text('situacao')
      .notNull()
      .default('pendente')
      .$type<'pendente' | 'aceita' | 'recusada' | 'cancelada' | 'expirada'>(),
    decididoEm: dataHora('decidido_em'),
    ...criacao(),
  },
  (t) => [
    foreignKey({
      columns: [t.perfilAnteriorId, t.empresaId],
      foreignColumns: [perfil.id, perfil.empresaId],
    }),
    uniqueIndex('troca_master_token').on(t.tokenHash),
    uniqueIndex('troca_master_pendente')
      .on(t.empresaId)
      .where(sql`situacao = 'pendente'`),
    check('troca_master_iniciado_por', emLista('iniciado_por', ['master', 'suporte'])),
    check(
      'troca_master_situacao',
      emLista('situacao', ['pendente', 'aceita', 'recusada', 'cancelada', 'expirada']),
    ),
  ],
)
