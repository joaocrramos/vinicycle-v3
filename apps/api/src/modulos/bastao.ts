// Passagem de bastão do Master (administracao.md, Master e passagem de bastão). Toda empresa tem
// sempre um só Master (P27): nada muda até o escolhido aceitar, em até 48 horas. O Master pode
// cancelar, o escolhido pode recusar, e o suporte pode designar um novo Master com motivo e
// comprovante (P15). Há no máximo um pedido pendente por empresa.
import { aceitarBastao, designarMaster, passarBastao, TIPOS_ANEXO_ACEITOS } from '@vinicycle/shared'
import { and, eq, lt, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { createHash } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { z } from 'zod'
import { definirContexto, type Tx } from '../db/cliente'
import * as s from '../db/schema'
import { chaveAnexo } from '../nucleo/armazenamento'
import { auditar, type Origem } from '../nucleo/auditoria'
import { enfileirarEmail } from '../nucleo/email'
import { ErroAplicacao, ErroNaoEncontrado, ErroRegra } from '../nucleo/erros'
import {
  emailAvisoTrocaPeloSuporte,
  emailBastao,
  emailBastaoDecidido,
} from '../nucleo/modelos-email'
import { naEmpresa, naPlataforma, origemDaRequisicao } from '../nucleo/requisicao'
import { exigirSemPersonificacao } from '../nucleo/requisicao'
import { gerarToken, hashToken } from '../nucleo/seguranca'
import { autenticar, criarSessao } from '../nucleo/sessoes'
import { gravarCookie } from './autenticacao'
import { conferirLimiteUsuarios, entrarOuCadastrar, termosVigentes } from './convites'
import { estabelecimentosDoVinculo, estadoSessao } from './estado-sessao'

const F_USUARIOS = 'gestao.config.usuarios'
const F_SUPORTE = 'plataforma.troca_master'

async function prazoHoras(tx: Tx): Promise<number> {
  const [c] = await tx.select({ horas: s.configPlataforma.bastaoHoras }).from(s.configPlataforma)
  return c?.horas ?? 48
}

/** Pedido vencido deixa de ser pendente (e libera a empresa para um novo). */
async function expirarPendentes(tx: Tx, empresaId: string): Promise<void> {
  await tx
    .update(s.trocaMaster)
    .set({ situacao: 'expirada', decididoEm: sql`now()` })
    .where(
      and(
        eq(s.trocaMaster.empresaId, empresaId),
        eq(s.trocaMaster.situacao, 'pendente'),
        lt(s.trocaMaster.expiraEm, sql`now()`),
      ),
    )
}

async function nomeDoUsuario(tx: Tx, usuarioId: string | null): Promise<string | null> {
  if (!usuarioId) return null
  const [u] = await tx
    .select({ nome: s.ficha.nome })
    .from(s.usuario)
    .innerJoin(s.ficha, eq(s.ficha.id, s.usuario.fichaId))
    .where(eq(s.usuario.id, usuarioId))
  return u?.nome ?? null
}

async function nomeDaEmpresa(tx: Tx, empresaId: string): Promise<string> {
  const [e] = await tx
    .select({ nome: s.ficha.nome, fantasia: s.ficha.nomeFantasia })
    .from(s.empresa)
    .innerJoin(s.ficha, eq(s.ficha.id, s.empresa.fichaId))
    .where(eq(s.empresa.id, empresaId))
  return e?.fantasia || e?.nome || ''
}

async function masterAtivo(tx: Tx, empresaId: string) {
  const [m] = await tx
    .select({ vinculoId: s.vinculo.id, usuarioId: s.vinculo.usuarioId, email: s.usuario.email })
    .from(s.vinculo)
    .innerJoin(s.usuario, eq(s.usuario.id, s.vinculo.usuarioId))
    .where(
      and(
        eq(s.vinculo.empresaId, empresaId),
        eq(s.vinculo.eMaster, true),
        eq(s.vinculo.ativo, true),
      ),
    )
  return m ?? null
}

/** O perfil que o Master atual passa a ter: da empresa, ativo e que não seja o de Master. */
async function conferirPerfilAnterior(tx: Tx, empresaId: string, perfilId: string | null) {
  if (!perfilId) return
  const [p] = await tx
    .select({ eMaster: s.perfil.eMaster, ativo: s.perfil.ativo })
    .from(s.perfil)
    .where(and(eq(s.perfil.id, perfilId), eq(s.perfil.empresaId, empresaId)))
  if (!p || !p.ativo || p.eMaster) throw new ErroRegra('Escolha um perfil válido.', 'perfil')
}

/** Cria o pedido e envia o e-mail ao escolhido. */
async function criarPedido(
  tx: Tx,
  origem: Origem,
  d: {
    empresaId: string
    masterAtualId: string
    escolhidoEmail: string
    perfilAnteriorId: string | null
    iniciadoPor: 'master' | 'suporte'
    motivo: string | null
    urlAplicacao: string
  },
): Promise<string> {
  await expirarPendentes(tx, d.empresaId)
  const [pendente] = await tx
    .select({ id: s.trocaMaster.id })
    .from(s.trocaMaster)
    .where(and(eq(s.trocaMaster.empresaId, d.empresaId), eq(s.trocaMaster.situacao, 'pendente')))
  if (pendente) {
    throw new ErroRegra(
      'Já há uma passagem de bastão pendente. Cancele-a antes de fazer outra.',
      'bastao_pendente',
    )
  }
  const [usuario] = await tx
    .select({ id: s.usuario.id })
    .from(s.usuario)
    .where(eq(sql`lower(${s.usuario.email})`, d.escolhidoEmail))
  if (usuario?.id === d.masterAtualId)
    throw new ErroRegra('Escolha outra pessoa: este já é o Master.', 'mesmo_master')
  const { token, hash } = gerarToken()
  const horas = await prazoHoras(tx)
  const [t] = await tx
    .insert(s.trocaMaster)
    .values({
      empresaId: d.empresaId,
      masterAtualId: d.masterAtualId,
      escolhidoUsuarioId: usuario?.id ?? null,
      escolhidoEmail: d.escolhidoEmail,
      perfilAnteriorId: d.perfilAnteriorId,
      iniciadoPor: d.iniciadoPor,
      motivo: d.motivo,
      tokenHash: hash,
      expiraEm: new Date(Date.now() + horas * 3600_000),
      criadoPor: origem.usuarioId,
    })
    .returning({ id: s.trocaMaster.id })
  const empresa = await nomeDaEmpresa(tx, d.empresaId)
  await enfileirarEmail(tx, {
    ...emailBastao({
      para: d.escolhidoEmail,
      empresa,
      quem: (await nomeDoUsuario(tx, d.masterAtualId)) ?? 'O Master',
      link: `${d.urlAplicacao}/bastao/${token}`,
      suporte: d.iniciadoPor === 'suporte',
    }),
    modelo: 'bastao',
    origem: 'troca_master',
    origemId: t!.id,
    empresaId: d.empresaId,
  })
  await auditar(tx, origem, {
    acao: 'bastao_pedido',
    entidade: 'troca_master',
    registroId: t!.id,
    empresaId: d.empresaId,
    depois: {
      escolhido: d.escolhidoEmail,
      perfilAnteriorId: d.perfilAnteriorId,
      iniciadoPor: d.iniciadoPor,
    },
    motivo: d.motivo,
  })
  return t!.id
}

async function cancelarPendente(tx: Tx, origem: Origem, empresaId: string): Promise<void> {
  await expirarPendentes(tx, empresaId)
  const [t] = await tx
    .update(s.trocaMaster)
    .set({ situacao: 'cancelada', decididoEm: sql`now()` })
    .where(and(eq(s.trocaMaster.empresaId, empresaId), eq(s.trocaMaster.situacao, 'pendente')))
    .returning({ id: s.trocaMaster.id, email: s.trocaMaster.escolhidoEmail })
  if (!t) throw new ErroNaoEncontrado('Não há passagem de bastão pendente.')
  await enfileirarEmail(tx, {
    ...emailBastaoDecidido({
      para: t.email,
      empresa: await nomeDaEmpresa(tx, empresaId),
      escolhido: t.email,
      decisao: 'cancelada',
      paraEscolhido: true,
    }),
    modelo: 'bastao_cancelado',
    origem: 'troca_master',
    origemId: t.id,
    empresaId,
  })
  await auditar(tx, origem, {
    acao: 'bastao_cancelado',
    entidade: 'troca_master',
    registroId: t.id,
    empresaId,
  })
}

/** Pedido pendente da empresa, para o Master e o suporte acompanharem. */
async function pedidoPendente(tx: Tx, empresaId: string) {
  await expirarPendentes(tx, empresaId)
  const [t] = await tx
    .select({
      id: s.trocaMaster.id,
      escolhidoEmail: s.trocaMaster.escolhidoEmail,
      escolhidoUsuarioId: s.trocaMaster.escolhidoUsuarioId,
      perfilAnteriorId: s.trocaMaster.perfilAnteriorId,
      iniciadoPor: s.trocaMaster.iniciadoPor,
      expiraEm: s.trocaMaster.expiraEm,
      criadoEm: s.trocaMaster.criadoEm,
    })
    .from(s.trocaMaster)
    .where(and(eq(s.trocaMaster.empresaId, empresaId), eq(s.trocaMaster.situacao, 'pendente')))
  if (!t) return null
  const [perfil] = t.perfilAnteriorId
    ? await tx
        .select({ nome: s.perfil.nome })
        .from(s.perfil)
        .where(eq(s.perfil.id, t.perfilAnteriorId))
    : []
  return {
    ...t,
    escolhido: (await nomeDoUsuario(tx, t.escolhidoUsuarioId)) ?? t.escolhidoEmail,
    perfilAnterior: perfil?.nome ?? null,
  }
}

/** Lê o pedido pelo link e ativa o contexto da empresa (como no convite). */
async function abrirPedido(tx: Tx, token: string) {
  const hash = hashToken(token)
  const r = await tx.execute<{ empresa: string | null }>(
    sql`select troca_master_empresa_por_token(${hash}) as empresa`,
  )
  const empresaId = r.rows[0]?.empresa
  if (!empresaId) throw new ErroNaoEncontrado('Link inválido. Peça um novo pedido ao Master.')
  await definirContexto(tx, { empresaId, autenticacao: true })
  await expirarPendentes(tx, empresaId)
  const [t] = await tx.select().from(s.trocaMaster).where(eq(s.trocaMaster.tokenHash, hash))
  if (!t) throw new ErroNaoEncontrado('Link inválido. Peça um novo pedido ao Master.')
  return t
}

function exigirPendente(situacao: string): void {
  if (situacao === 'pendente') return
  const mensagens: Record<string, string> = {
    expirada: 'O prazo para aceitar terminou. Peça ao Master um novo pedido.',
    cancelada: 'Este pedido foi cancelado.',
    recusada: 'Este pedido foi recusado.',
    aceita: 'Este pedido já foi aceito.',
  }
  throw new ErroRegra(mensagens[situacao] ?? 'Pedido indisponível.', 'bastao_situacao')
}

export async function rotasBastao(app: FastifyInstance): Promise<void> {
  const { db, config, armazenamento } = app.deps

  // Master ---------------------------------------------------------------------------------------

  app.get('/api/usuarios/bastao', async (req) =>
    naEmpresa(db, req, [F_USUARIOS, 'visualizar'], async (ctx) =>
      pedidoPendente(ctx.tx, ctx.empresaId),
    ),
  )

  app.post<{ Params: { id: string } }>('/api/usuarios/:id/bastao', async (req) =>
    naEmpresa(db, req, [F_USUARIOS, 'editar'], async (ctx) => {
      const vinculoId = z.uuid().parse(req.params.id)
      const d = passarBastao.parse(req.body)
      exigirSemPersonificacao(ctx.sessao, 'passar o bastão')
      if (!ctx.acesso.eMaster) throw new ErroRegra('Só o Master passa o bastão.', 'nao_master')
      const [escolhido] = await ctx.tx
        .select({ usuarioId: s.vinculo.usuarioId, ativo: s.vinculo.ativo, email: s.usuario.email })
        .from(s.vinculo)
        .innerJoin(s.usuario, eq(s.usuario.id, s.vinculo.usuarioId))
        .where(and(eq(s.vinculo.id, vinculoId), eq(s.vinculo.empresaId, ctx.empresaId)))
      if (!escolhido) throw new ErroNaoEncontrado('Usuário não encontrado.')
      if (!escolhido.ativo)
        throw new ErroRegra('Reative o usuário antes de passar o bastão.', 'inativo')
      await conferirPerfilAnterior(ctx.tx, ctx.empresaId, d.perfilAnteriorId)
      const id = await criarPedido(ctx.tx, ctx.origem, {
        empresaId: ctx.empresaId,
        masterAtualId: ctx.usuarioId,
        escolhidoEmail: escolhido.email.toLowerCase(),
        perfilAnteriorId: d.perfilAnteriorId,
        iniciadoPor: 'master',
        motivo: null,
        urlAplicacao: config.URL_APLICACAO,
      })
      return { id }
    }),
  )

  app.post('/api/usuarios/bastao/cancelar', async (req) =>
    naEmpresa(db, req, [F_USUARIOS, 'editar'], async (ctx) => {
      await cancelarPendente(ctx.tx, ctx.origem, ctx.empresaId)
      return { ok: true }
    }),
  )

  // Escolhido (pelo link) -----------------------------------------------------------------------

  app.get<{ Params: { token: string } }>('/api/bastao/:token', async (req) =>
    db.transaction(async (tx) => {
      const t = await abrirPedido(tx, req.params.token)
      const [u] = await tx
        .select({ id: s.usuario.id })
        .from(s.usuario)
        .where(eq(sql`lower(${s.usuario.email})`, t.escolhidoEmail))
      return {
        empresa: await nomeDaEmpresa(tx, t.empresaId),
        quem: t.iniciadoPor === 'suporte' ? null : await nomeDoUsuario(tx, t.masterAtualId),
        email: t.escolhidoEmail,
        situacao: t.situacao,
        expiraEm: t.expiraEm,
        usuarioExiste: !!u,
        // Com a sessão do escolhido aberta, não é preciso digitar a senha.
        sessaoConfere: !!u && req.sessao?.usuarioId === u.id,
        termos: u ? [] : await termosVigentes(tx),
      }
    }),
  )

  app.post<{ Params: { token: string } }>(
    '/api/bastao/:token/aceitar',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const dados = aceitarBastao.parse(req.body ?? {})
      const r = await db.transaction(async (tx) => {
        const t = await abrirPedido(tx, req.params.token)
        exigirPendente(t.situacao)

        let usuarioId: string
        let novo = false
        const sessao = req.sessao
        const [daSessao] = sessao
          ? await tx
              .select({ id: s.usuario.id })
              .from(s.usuario)
              .where(
                and(
                  eq(s.usuario.id, sessao.usuarioId),
                  eq(sql`lower(${s.usuario.email})`, t.escolhidoEmail),
                ),
              )
          : []
        if (daSessao) {
          usuarioId = daSessao.id
          await definirContexto(tx, { empresaId: t.empresaId, usuarioId, autenticacao: true })
        } else {
          const entrada = await entrarOuCadastrar(
            tx,
            t.escolhidoEmail,
            t.empresaId,
            { ...dados, senha: dados.senha ?? '' },
            req.ip,
          )
          if ('erro' in entrada) return entrada
          ;({ usuarioId, novo } = entrada)
        }

        // O Master não pode ter mudado desde o pedido.
        const master = await masterAtivo(tx, t.empresaId)
        if (!master || master.usuarioId !== t.masterAtualId) {
          throw new ErroRegra(
            'O Master da empresa mudou desde o pedido. Este pedido não vale mais.',
            'master_mudou',
          )
        }
        if (t.perfilAnteriorId) await conferirPerfilAnterior(tx, t.empresaId, t.perfilAnteriorId)
        const [perfilMaster] = await tx
          .select({ id: s.perfil.id })
          .from(s.perfil)
          .where(and(eq(s.perfil.empresaId, t.empresaId), eq(s.perfil.eMaster, true)))

        // Primeiro o Master atual deixa de ser Master: o banco aceita um só Master ativo.
        await tx
          .update(s.vinculo)
          .set(
            t.perfilAnteriorId
              ? {
                  perfilId: t.perfilAnteriorId,
                  eMaster: false,
                  atualizadoEm: sql`now()`,
                  atualizadoPor: usuarioId,
                  versao: sql`${s.vinculo.versao} + 1`,
                }
              : {
                  eMaster: false,
                  ativo: false,
                  inativadoEm: sql`now()`,
                  inativadoPor: usuarioId,
                  motivoInativacao: 'Troca do Master pelo suporte',
                  versao: sql`${s.vinculo.versao} + 1`,
                },
          )
          .where(eq(s.vinculo.id, master.vinculoId))

        // Depois o escolhido vira Master, sem restrição de estabelecimento (P12).
        const [vinculo] = await tx
          .select({ id: s.vinculo.id, ativo: s.vinculo.ativo })
          .from(s.vinculo)
          .where(and(eq(s.vinculo.empresaId, t.empresaId), eq(s.vinculo.usuarioId, usuarioId)))
        // Na troca pelo Master, o escolhido precisa continuar com acesso à empresa.
        if (t.iniciadoPor === 'master' && !vinculo?.ativo) {
          throw new ErroRegra(
            'O seu acesso à empresa foi inativado depois do pedido. Fale com o Master.',
            'vinculo_inativo',
          )
        }
        let vinculoId: string
        if (vinculo) {
          await tx
            .update(s.vinculo)
            .set({
              perfilId: perfilMaster!.id,
              eMaster: true,
              ativo: true,
              inativadoEm: null,
              inativadoPor: null,
              motivoInativacao: null,
              atualizadoEm: sql`now()`,
              atualizadoPor: usuarioId,
              versao: sql`${s.vinculo.versao} + 1`,
            })
            .where(eq(s.vinculo.id, vinculo.id))
          vinculoId = vinculo.id
          await tx
            .delete(s.vinculoEstabelecimento)
            .where(eq(s.vinculoEstabelecimento.vinculoId, vinculo.id))
        } else {
          const [v] = await tx
            .insert(s.vinculo)
            .values({
              empresaId: t.empresaId,
              usuarioId,
              perfilId: perfilMaster!.id,
              eMaster: true,
              criadoPor: usuarioId,
              atualizadoPor: usuarioId,
            })
            .returning({ id: s.vinculo.id })
          vinculoId = v!.id
        }

        await tx
          .update(s.trocaMaster)
          .set({ situacao: 'aceita', decididoEm: sql`now()`, escolhidoUsuarioId: usuarioId })
          .where(eq(s.trocaMaster.id, t.id))

        const empresa = await nomeDaEmpresa(tx, t.empresaId)
        const escolhido = (await nomeDoUsuario(tx, usuarioId)) ?? t.escolhidoEmail
        for (const [para, paraEscolhido] of [
          [master.email, false],
          [t.escolhidoEmail, true],
        ] as const) {
          await enfileirarEmail(tx, {
            ...emailBastaoDecidido({ para, empresa, escolhido, decisao: 'aceita', paraEscolhido }),
            modelo: 'bastao_aceito',
            origem: 'troca_master',
            origemId: t.id,
            empresaId: t.empresaId,
          })
        }

        const estabs = await estabelecimentosDoVinculo(tx, t.empresaId, [])
        const nova = await criarSessao(tx, {
          usuarioId,
          ip: req.ip,
          navegador: req.headers['user-agent'] ?? null,
          empresaId: t.empresaId,
          estabelecimentoId: estabs[0]?.id ?? null,
        })
        const origem: Origem = { ...origemDaRequisicao(req), usuarioId, empresaId: t.empresaId }
        await auditar(tx, origem, {
          acao: 'bastao_aceito',
          entidade: 'troca_master',
          registroId: t.id,
          dados: {
            novoMaster: usuarioId,
            vinculoId,
            masterAnterior: t.masterAtualId,
            perfilAnteriorId: t.perfilAnteriorId,
            novoUsuario: novo,
          },
        })
        await auditar(tx, origem, { acao: 'login', entidade: 'sessao', registroId: nova.id })
        return { token: nova.token }
      })
      if ('erro' in r) throw new ErroAplicacao(401, 'credenciais', r.erro)
      gravarCookie(app, reply, r.token)
      return estadoSessao(db, (await autenticar(db, r.token))!)
    },
  )

  // Recusar só pelo link: ele prova o acesso ao e-mail escolhido.
  app.post<{ Params: { token: string } }>(
    '/api/bastao/:token/recusar',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) =>
      db.transaction(async (tx) => {
        const t = await abrirPedido(tx, req.params.token)
        exigirPendente(t.situacao)
        await tx
          .update(s.trocaMaster)
          .set({ situacao: 'recusada', decididoEm: sql`now()` })
          .where(eq(s.trocaMaster.id, t.id))
        const master = await masterAtivo(tx, t.empresaId)
        if (master && t.iniciadoPor === 'master') {
          await enfileirarEmail(tx, {
            ...emailBastaoDecidido({
              para: master.email,
              empresa: await nomeDaEmpresa(tx, t.empresaId),
              escolhido: (await nomeDoUsuario(tx, t.escolhidoUsuarioId)) ?? t.escolhidoEmail,
              decisao: 'recusada',
              paraEscolhido: false,
            }),
            modelo: 'bastao_recusado',
            origem: 'troca_master',
            origemId: t.id,
            empresaId: t.empresaId,
          })
        }
        await auditar(
          tx,
          { ...origemDaRequisicao(req), usuarioId: t.escolhidoUsuarioId, empresaId: t.empresaId },
          { acao: 'bastao_recusado', entidade: 'troca_master', registroId: t.id },
        )
        return { ok: true }
      }),
  )

  // Suporte --------------------------------------------------------------------------------------

  // Pedido pendente e os perfis que o Master anterior pode receber.
  app.get<{ Params: { id: string } }>('/api/plataforma/empresas/:id/bastao', async (req) =>
    naPlataforma(db, req, ['plataforma.clientes', 'visualizar'], async ({ tx }) => {
      const empresaId = z.uuid().parse(req.params.id)
      const perfis = await tx
        .select({ id: s.perfil.id, nome: s.perfil.nome })
        .from(s.perfil)
        .where(
          and(
            eq(s.perfil.empresaId, empresaId),
            eq(s.perfil.ativo, true),
            eq(s.perfil.eMaster, false),
          ),
        )
        .orderBy(s.perfil.nome)
      return { pendente: await pedidoPendente(tx, empresaId), perfis }
    }),
  )

  // Designação com motivo e comprovante (P15), em formulário com arquivo.
  app.post<{ Params: { id: string } }>('/api/plataforma/empresas/:id/bastao', async (req) => {
    const empresaId = z.uuid().parse(req.params.id)
    const arquivo = await req.file()
    if (!arquivo) throw new ErroRegra('Anexe o comprovante do pedido.', 'comprovante')
    const campos = Object.fromEntries(
      Object.entries(arquivo.fields).flatMap(([k, v]) =>
        v && !Array.isArray(v) && v.type === 'field' ? [[k, String(v.value)]] : [],
      ),
    )
    const d = designarMaster.parse(campos)
    const conteudo = await arquivo.toBuffer()
    if (arquivo.file.truncated)
      throw new ErroRegra('Arquivo acima do tamanho máximo (25 MB).', 'arquivo_grande')
    if (!(TIPOS_ANEXO_ACEITOS as readonly string[]).includes(arquivo.mimetype))
      throw new ErroRegra(
        'Tipo de arquivo não aceito. Use PDF, imagem, planilha, documento, XML, CSV ou ZIP.',
        'tipo_arquivo',
      )
    return naPlataforma(db, req, [F_SUPORTE, 'criar'], async ({ tx, origem }) => {
      const master = await masterAtivo(tx, empresaId)
      if (!master) {
        throw new ErroRegra(
          'A empresa não tem Master ativo. Use o convite do Master.',
          'sem_master',
        )
      }
      await conferirPerfilAnterior(tx, empresaId, d.perfilAnteriorId)
      // Escolhido sem acesso à empresa e Master anterior mantido: entra um usuário a mais (P25).
      const [jaVinculado] = await tx
        .select({ id: s.vinculo.id })
        .from(s.vinculo)
        .innerJoin(s.usuario, eq(s.usuario.id, s.vinculo.usuarioId))
        .where(
          and(
            eq(s.vinculo.empresaId, empresaId),
            eq(s.vinculo.ativo, true),
            eq(sql`lower(${s.usuario.email})`, d.email),
          ),
        )
      if (!jaVinculado && d.perfilAnteriorId) await conferirLimiteUsuarios(tx, empresaId)
      const o = { ...origem, empresaId }
      const trocaId = await criarPedido(tx, o, {
        empresaId,
        masterAtualId: master.usuarioId,
        escolhidoEmail: d.email,
        perfilAnteriorId: d.perfilAnteriorId,
        iniciadoPor: 'suporte',
        motivo: d.motivo,
        urlAplicacao: config.URL_APLICACAO,
      })
      const anexoId = uuidv7()
      const caminho = chaveAnexo({
        empresaId,
        estabelecimentoId: null,
        entidade: 'troca_master',
        registroId: trocaId,
        anexoId,
      })
      await armazenamento.gravar(caminho, conteudo)
      await tx.insert(s.anexo).values({
        id: anexoId,
        empresaId,
        entidade: 'troca_master',
        registroId: trocaId,
        categoria: 'comprovante',
        nomeOriginal: arquivo.filename.slice(0, 255),
        tipoMime: arquivo.mimetype,
        tamanhoBytes: conteudo.length,
        hashSha256: createHash('sha256').update(conteudo).digest('hex'),
        caminho,
        descricao: 'Comprovante da troca do Master pelo suporte',
        criadoPor: origem.usuarioId,
      })
      // O Master anterior é avisado (administracao.md, decidido em 03/10/2026).
      await enfileirarEmail(tx, {
        ...emailAvisoTrocaPeloSuporte({
          para: master.email,
          empresa: await nomeDaEmpresa(tx, empresaId),
          escolhido: d.email,
        }),
        modelo: 'bastao_aviso_suporte',
        origem: 'troca_master',
        origemId: trocaId,
        empresaId,
      })
      return { id: trocaId }
    })
  })

  app.post<{ Params: { id: string } }>(
    '/api/plataforma/empresas/:id/bastao/cancelar',
    async (req) =>
      naPlataforma(db, req, [F_SUPORTE, 'criar'], async ({ tx, origem }) => {
        const empresaId = z.uuid().parse(req.params.id)
        await cancelarPendente(tx, { ...origem, empresaId }, empresaId)
        return { ok: true }
      }),
  )
}
