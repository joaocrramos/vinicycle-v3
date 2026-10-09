// Bloco cadastral padrão (P2; 03-modelo-de-dados.md, 1.12 e 1.13).
import { REDES, ROTULOS_ENDERECO, TIPOS_CONTATO, TIPOS_PESSOA, UFS } from '@vinicycle/shared';
import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { alteracao, criacao, emLista, id } from './comum';

export const DONOS_FICHA = ['empresa', 'estabelecimento', 'pessoa', 'usuario'] as const;

/**
 * Ficha cadastral. Empresa, estabelecimento, pessoa e usuário apontam cada um para uma ficha.
 * `empresa_id` é vazio só na ficha do usuário (identidade única, P8). A chave estrangeira de
 * `empresa_id` é adiada para o fim da transação (migração de segurança), porque a empresa e a
 * ficha dela nascem juntas.
 */
export const ficha = pgTable(
  'ficha',
  {
    id: id(),
    empresaId: uuid('empresa_id'),
    dono: text('dono').notNull().$type<(typeof DONOS_FICHA)[number]>(),
    tipoPessoa: text('tipo_pessoa').notNull().$type<(typeof TIPOS_PESSOA)[number]>(),
    nome: text('nome').notNull(),
    nomeFantasia: text('nome_fantasia'),
    tipoDocumento: text('tipo_documento').$type<'cpf' | 'cnpj' | 'outro'>(),
    documento: text('documento'),
    pais: text('pais'),
    inscricaoEstadual: text('inscricao_estadual'),
    inscricaoMunicipal: text('inscricao_municipal'),
    site: text('site'),
    avatarCor: text('avatar_cor'),
    avatarAnexoId: uuid('avatar_anexo_id'),
    observacoes: text('observacoes'),
    ...criacao(),
    ...alteracao(),
  },
  (t) => [
    check('ficha_dono', emLista('dono', DONOS_FICHA)),
    check('ficha_tipo_pessoa', emLista('tipo_pessoa', TIPOS_PESSOA)),
    check('ficha_empresa_dono', sql`(dono = 'usuario') = (empresa_id is null)`),
    index('ficha_empresa').on(t.empresaId),
    // Documento da empresa: único na plataforma (ambiente-cliente.md, Documento do cliente).
    uniqueIndex('ficha_documento_empresa')
      .on(t.documento)
      .where(sql`dono = 'empresa' and documento is not null`),
    // Documento do estabelecimento e da pessoa: único na empresa.
    uniqueIndex('ficha_documento_na_empresa')
      .on(t.empresaId, t.dono, t.documento)
      .where(sql`dono in ('estabelecimento', 'pessoa') and documento is not null`),
  ],
);

export const fichaEndereco = pgTable(
  'ficha_endereco',
  {
    id: id(),
    fichaId: uuid('ficha_id')
      .notNull()
      .references(() => ficha.id, { onDelete: 'cascade' }),
    rotulo: text('rotulo').notNull(),
    cep: text('cep').notNull(),
    logradouro: text('logradouro').notNull(),
    numero: text('numero').notNull(),
    complemento: text('complemento'),
    bairro: text('bairro').notNull().default(''),
    municipio: text('municipio').notNull(),
    codigoIbge: text('codigo_ibge'),
    uf: text('uf').notNull(),
    principal: boolean('principal').notNull().default(false),
  },
  (t) => [
    check('ficha_endereco_rotulo', emLista('rotulo', ROTULOS_ENDERECO)),
    check('ficha_endereco_uf', emLista('uf', UFS)),
    check('ficha_endereco_cep', sql`cep ~ '^[0-9]{8}$'`),
    index('ficha_endereco_ficha').on(t.fichaId),
    uniqueIndex('ficha_endereco_principal')
      .on(t.fichaId)
      .where(sql`principal`),
  ],
);

export const fichaContato = pgTable(
  'ficha_contato',
  {
    id: id(),
    fichaId: uuid('ficha_id')
      .notNull()
      .references(() => ficha.id, { onDelete: 'cascade' }),
    tipo: text('tipo').notNull(),
    rotulo: text('rotulo').notNull().default(''),
    valor: text('valor').notNull(),
    whatsapp: boolean('whatsapp').notNull().default(false),
    rede: text('rede'),
    principal: boolean('principal').notNull().default(false),
  },
  (t) => [
    check('ficha_contato_tipo', emLista('tipo', TIPOS_CONTATO)),
    check('ficha_contato_rede', sql`rede is null or ${emLista('rede', REDES)}`),
    index('ficha_contato_ficha').on(t.fichaId),
    uniqueIndex('ficha_contato_email_principal')
      .on(t.fichaId)
      .where(sql`principal and tipo = 'email'`),
  ],
);
