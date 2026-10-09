// Dados de demonstração (P6): só para desenvolvimento e testes manuais; recusado na produção.
// Cria a "Vinícola Demonstração" com Master, estabelecimento e local, se ainda não existir.
//   pnpm --filter @vinicycle/api demo
// O Master é demo@vinicycle.local, com a senha de DEMO_SENHA (padrão: demonstracao-local).
// Cria também equipe@vinicycle.local, Administrador da plataforma com a mesma senha e um segredo
// fixo de segundo fator, para conferir a Administração no navegador. O código do momento:
//   pnpm --filter @vinicycle/api demo codigo
import { FORMATOS_CODIGO_PADRAO } from '@vinicycle/shared'
import { and, eq, sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { lerConfig } from '../config'
import { criarBanco, definirContexto, emContexto } from '../db/cliente'
import { PERFIL_ADMINISTRADOR, PLANO_COMPLETO } from '../db/referencia'
import * as s from '../db/schema'
import { cifrar, codigoTotp, gerarHashSenha } from '../nucleo/seguranca'
import { criarFicha } from '../modulos/fichas'
import { copiarPerfisModelo } from '../modulos/plataforma'

const config = lerConfig()
if (config.NODE_ENV === 'production' || config.URL_APLICACAO.startsWith('https://app.')) {
  throw new Error('Dados de demonstração não vão para a produção (P6).')
}
const EMAIL = 'demo@vinicycle.local'
const EMAIL_EQUIPE = 'equipe@vinicycle.local'
/** Segredo de segundo fator só da demonstração local (nunca usado fora dela). */
const SEGREDO_EQUIPE = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
const SENHA = process.env.DEMO_SENHA ?? 'demonstracao-local'

if (process.argv[2] === 'codigo') {
  console.log(codigoTotp(SEGREDO_EQUIPE))
  process.exit(0)
}

const { pool, db } = criarBanco(config.DATABASE_URL, 1)

try {
  await emContexto(db, { plataforma: true, autenticacao: true }, async (tx) => {
    const [existe] = await tx
      .select({ id: s.usuario.id })
      .from(s.usuario)
      .where(eq(sql`lower(${s.usuario.email})`, EMAIL))
    if (existe) {
      console.log(`Demonstração já existe: ${EMAIL}`)
      return
    }
    const [plano] = await tx.select().from(s.plano).where(eq(s.plano.nome, PLANO_COMPLETO))
    const empresaId = uuidv7()
    const fichaEmpresa = await criarFicha(
      tx,
      {
        tipoPessoa: 'juridica',
        nome: 'Vinícola Demonstração Ltda',
        nomeFantasia: 'Vinícola Demonstração',
        documento: '11222333000181',
        enderecos: [],
        contatos: [],
      },
      'empresa',
      empresaId,
      null,
    )
    await tx.insert(s.empresa).values({ id: empresaId, fichaId: fichaEmpresa, situacao: 'ativo' })
    await tx.insert(s.empresaSituacao).values({ empresaId, situacao: 'ativo', origem: 'criacao' })
    await tx.insert(s.assinatura).values({
      empresaId,
      planoId: plano!.id,
      periodicidade: 'mensal',
      inicio: '2026-10-01',
      situacao: 'vigente',
    })
    const perfis = await copiarPerfisModelo(tx, empresaId, null)
    await tx.insert(s.formatoCodigo).values(
      Object.entries(FORMATOS_CODIGO_PADRAO).map(([tipo, mascara]) => ({
        empresaId,
        tipo,
        mascara,
      })),
    )
    const fichaUsuario = await criarFicha(
      tx,
      {
        tipoPessoa: 'fisica',
        nome: 'Maria Demonstração',
        documento: null,
        enderecos: [],
        contatos: [],
      },
      'usuario',
      null,
      null,
    )
    const [u] = await tx
      .insert(s.usuario)
      .values({
        email: EMAIL,
        fichaId: fichaUsuario,
        senhaHash: await gerarHashSenha(SENHA),
      })
      .returning({ id: s.usuario.id })
    await definirContexto(tx, {
      plataforma: true,
      autenticacao: true,
      empresaId,
      usuarioId: u!.id,
    })
    await tx
      .insert(s.vinculo)
      .values({ empresaId, usuarioId: u!.id, perfilId: perfis.get('MASTER')!, eMaster: true })
    const fichaEstab = await criarFicha(
      tx,
      {
        tipoPessoa: 'juridica',
        nome: 'Vinícola Demonstração - Cantina',
        documento: '11444777000161',
        enderecos: [
          {
            rotulo: 'principal',
            cep: '48900000',
            logradouro: 'Rodovia BA-210',
            numero: 'km 12',
            bairro: '',
            municipio: 'Juazeiro',
            codigoIbge: '2918407',
            uf: 'BA',
            principal: true,
          },
        ],
        contatos: [],
      },
      'estabelecimento',
      empresaId,
      null,
    )
    const [e] = await tx
      .insert(s.estabelecimento)
      .values({
        empresaId,
        fichaId: fichaEstab,
        fuso: 'America/Bahia',
        atividadesMapa: ['produtor', 'engarrafador'],
        capacidadeLitros: '45000.00',
      })
      .returning({ id: s.estabelecimento.id })
    await tx.insert(s.local).values({
      empresaId,
      estabelecimentoId: e!.id,
      nome: 'Adega',
      uso: 'ambos',
      moduloEstoque: 'ENOTRACE',
    })
    const [cs] = await tx
      .select({ id: s.variedade.id })
      .from(s.variedade)
      .where(and(eq(s.variedade.codigoOficial, '1058')))
    await tx.insert(s.empresaVariedade).values({ empresaId, variedadeId: cs!.id })
    console.log(
      `Demonstração criada: entre com ${EMAIL} (senha em DEMO_SENHA ou "demonstracao-local").`,
    )
  })
  await emContexto(db, { plataforma: true, autenticacao: true }, async (tx) => {
    const [existe] = await tx
      .select({ id: s.usuario.id })
      .from(s.usuario)
      .where(eq(sql`lower(${s.usuario.email})`, EMAIL_EQUIPE))
    if (existe) return
    const ficha = await criarFicha(
      tx,
      {
        tipoPessoa: 'fisica',
        nome: 'Equipe Demonstração',
        documento: null,
        enderecos: [],
        contatos: [],
      },
      'usuario',
      null,
      null,
    )
    const [u] = await tx
      .insert(s.usuario)
      .values({
        email: EMAIL_EQUIPE,
        fichaId: ficha,
        senhaHash: await gerarHashSenha(SENHA),
        totpSegredoCifrado: cifrar(config.CHAVE_CIFRA, SEGREDO_EQUIPE),
        totpAtivoEm: new Date(),
      })
      .returning({ id: s.usuario.id })
    const [admin] = await tx
      .select({ id: s.perfil.id })
      .from(s.perfil)
      .where(and(eq(s.perfil.escopo, 'plataforma'), eq(s.perfil.codigo, PERFIL_ADMINISTRADOR)))
    await tx.insert(s.equipeMembro).values({ usuarioId: u!.id, perfilId: admin!.id })
    console.log(`Equipe da plataforma: ${EMAIL_EQUIPE}; código do segundo fator: "demo codigo".`)
  })
} finally {
  await pool.end()
}
