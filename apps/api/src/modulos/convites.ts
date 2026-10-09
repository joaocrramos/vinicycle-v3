// Convites (P8; administracao.md, Fluxo, passo 3). Link de uso único, com validade de 7 dias e
// reenviável. Quem já tem cadastro só aceita o vínculo, confirmando a senha.
import { aceitarConvite, senhaNova } from '@vinicycle/shared'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { z } from 'zod'
import { definirContexto, type Tx } from '../db/cliente'
import * as s from '../db/schema'
import { auditar, type Origem } from '../nucleo/auditoria'
import { enfileirarEmail } from '../nucleo/email'
import { ErroAplicacao, ErroNaoEncontrado, ErroRegra } from '../nucleo/erros'
import { emailConvite } from '../nucleo/modelos-email'
import { origemDaRequisicao } from '../nucleo/requisicao'
import { conferirSenha, gerarHashSenha, gerarToken, hashToken } from '../nucleo/seguranca'
import { autenticar, criarSessao } from '../nucleo/sessoes'
import { limitesEfetivos } from './assinaturas'
import { gravarCookie, TENTATIVAS_MAXIMAS, BLOQUEIO_MINUTOS } from './autenticacao'
import { estabelecimentosDoVinculo, estadoSessao } from './estado-sessao'
import { criarFicha } from './fichas'

export async function validadeConviteDias(tx: Tx): Promise<number> {
  const [c] = await tx
    .select({ dias: s.configPlataforma.conviteValidadeDias })
    .from(s.configPlataforma)
  return c?.dias ?? 7
}

/** Usuários ativos mais convites pendentes não podem passar do limite do plano (P25). */
export async function conferirLimiteUsuarios(tx: Tx, empresaId: string): Promise<void> {
  const limite = (await limitesEfetivos(tx, empresaId))?.usuarios ?? null
  if (limite === null) return
  const [{ ativos }] = (await tx
    .select({ ativos: sql<number>`count(*)::int` })
    .from(s.vinculo)
    .where(and(eq(s.vinculo.empresaId, empresaId), eq(s.vinculo.ativo, true)))) as [
    { ativos: number },
  ]
  const [{ pendentes }] = (await tx
    .select({ pendentes: sql<number>`count(*)::int` })
    .from(s.convite)
    .where(
      and(
        eq(s.convite.empresaId, empresaId),
        eq(s.convite.situacao, 'pendente'),
        sql`${s.convite.expiraEm} > now()`,
      ),
    )) as [{ pendentes: number }]
  if (ativos + pendentes >= limite) {
    throw new ErroRegra(
      `A assinatura permite ${limite} usuários, e esse limite já foi atingido (contando convites pendentes). Para incluir mais, contrate usuários adicionais.`,
      'limite_plano',
    )
  }
}

/** Cria o convite e enfileira o e-mail. O contexto da transação precisa ser o da empresa. */
export async function criarConvite(
  tx: Tx,
  origem: Origem,
  dados: {
    empresaId: string
    email: string
    perfilId: string
    estabelecimentos: string[]
    urlAplicacao: string
  },
): Promise<string> {
  const [p] = await tx
    .select({ eMaster: s.perfil.eMaster, ativo: s.perfil.ativo })
    .from(s.perfil)
    .where(and(eq(s.perfil.id, dados.perfilId), eq(s.perfil.empresaId, dados.empresaId)))
  if (!p || !p.ativo) throw new ErroRegra('Perfil inválido.', 'perfil')
  if (dados.estabelecimentos.length) {
    const validos = await tx
      .select({ id: s.estabelecimento.id })
      .from(s.estabelecimento)
      .where(
        and(
          eq(s.estabelecimento.empresaId, dados.empresaId),
          inArray(s.estabelecimento.id, dados.estabelecimentos),
        ),
      )
    if (validos.length !== new Set(dados.estabelecimentos).size) {
      throw new ErroRegra('Estabelecimento inválido.', 'estabelecimento')
    }
  }
  const [jaVinculado] = await tx
    .select({ id: s.vinculo.id })
    .from(s.vinculo)
    .innerJoin(s.usuario, eq(s.usuario.id, s.vinculo.usuarioId))
    .where(
      and(
        eq(s.vinculo.empresaId, dados.empresaId),
        eq(s.vinculo.ativo, true),
        eq(sql`lower(${s.usuario.email})`, dados.email.toLowerCase()),
      ),
    )
  if (jaVinculado) throw new ErroRegra('Este e-mail já tem acesso à empresa.', 'ja_vinculado')

  // Um convite pendente por e-mail: o anterior é cancelado e substituído.
  await tx
    .update(s.convite)
    .set({ situacao: 'cancelado', canceladoEm: sql`now()`, canceladoPor: origem.usuarioId })
    .where(
      and(
        eq(s.convite.empresaId, dados.empresaId),
        eq(s.convite.situacao, 'pendente'),
        eq(sql`lower(${s.convite.email})`, dados.email.toLowerCase()),
      ),
    )

  const dias = await validadeConviteDias(tx)
  const { token, hash } = gerarToken()
  const [c] = await tx
    .insert(s.convite)
    .values({
      empresaId: dados.empresaId,
      email: dados.email.toLowerCase(),
      perfilId: dados.perfilId,
      estabelecimentos: dados.estabelecimentos,
      tokenHash: hash,
      enviadoPor: origem.usuarioId,
      expiraEm: new Date(Date.now() + dias * 86400_000),
      criadoPor: origem.usuarioId,
    })
    .returning({ id: s.convite.id })
  await enviarEmailConvite(tx, origem, c!.id, token, dados.urlAplicacao, p.eMaster)
  await auditar(tx, origem, {
    acao: 'criar',
    entidade: 'convite',
    registroId: c!.id,
    empresaId: dados.empresaId,
    depois: {
      email: dados.email,
      perfilId: dados.perfilId,
      estabelecimentos: dados.estabelecimentos,
    },
  })
  return c!.id
}

async function enviarEmailConvite(
  tx: Tx,
  origem: Origem,
  conviteId: string,
  token: string,
  urlAplicacao: string,
  master: boolean,
): Promise<void> {
  const [c] = await tx
    .select({
      email: s.convite.email,
      empresaId: s.convite.empresaId,
      empresa: s.ficha.nome,
      fantasia: s.ficha.nomeFantasia,
    })
    .from(s.convite)
    .innerJoin(s.empresa, eq(s.empresa.id, s.convite.empresaId))
    .innerJoin(s.ficha, eq(s.ficha.id, s.empresa.fichaId))
    .where(eq(s.convite.id, conviteId))
  let quem: string | null = null
  if (origem.usuarioId) {
    const [u] = await tx
      .select({ nome: s.ficha.nome })
      .from(s.usuario)
      .innerJoin(s.ficha, eq(s.ficha.id, s.usuario.fichaId))
      .where(eq(s.usuario.id, origem.usuarioId))
    quem = u?.nome ?? null
  }
  const dias = await validadeConviteDias(tx)
  await enfileirarEmail(tx, {
    ...emailConvite({
      para: c!.email,
      empresa: c!.fantasia || c!.empresa,
      quem,
      link: `${urlAplicacao}/convite/${token}`,
      dias,
      master,
    }),
    modelo: 'convite',
    origem: 'convite',
    origemId: conviteId,
    empresaId: c!.empresaId,
  })
}

/** Reenvia com novo link e nova validade (o link anterior deixa de valer). */
export async function reenviarConvite(
  tx: Tx,
  origem: Origem,
  conviteId: string,
  urlAplicacao: string,
): Promise<void> {
  const [c] = await tx
    .select({
      situacao: s.convite.situacao,
      perfilId: s.convite.perfilId,
      eMaster: s.perfil.eMaster,
      empresaId: s.convite.empresaId,
    })
    .from(s.convite)
    .innerJoin(s.perfil, eq(s.perfil.id, s.convite.perfilId))
    .where(eq(s.convite.id, conviteId))
  if (!c) throw new ErroNaoEncontrado('Convite não encontrado.')
  if (c.situacao !== 'pendente' && c.situacao !== 'expirado') {
    throw new ErroRegra(
      'Só convites pendentes ou expirados podem ser reenviados.',
      'convite_situacao',
    )
  }
  const dias = await validadeConviteDias(tx)
  const { token, hash } = gerarToken()
  await tx
    .update(s.convite)
    .set({
      tokenHash: hash,
      situacao: 'pendente',
      enviadoEm: sql`now()`,
      expiraEm: new Date(Date.now() + dias * 86400_000),
      reenvios: sql`${s.convite.reenvios} + 1`,
    })
    .where(eq(s.convite.id, conviteId))
  await enviarEmailConvite(tx, origem, conviteId, token, urlAplicacao, c.eMaster)
  await auditar(tx, origem, {
    acao: 'reenviar',
    entidade: 'convite',
    registroId: conviteId,
    empresaId: c.empresaId,
  })
}

/** Lê o convite pelo link e ativa o contexto da empresa que convidou. */
async function abrirConvite(tx: Tx, token: string) {
  const hash = hashToken(token)
  const r = await tx.execute<{ empresa: string | null }>(
    sql`select convite_empresa_por_token(${hash}) as empresa`,
  )
  const empresaId = r.rows[0]?.empresa
  if (!empresaId) throw new ErroNaoEncontrado('Convite inválido. Peça um novo a quem convidou.')
  await definirContexto(tx, { empresaId, autenticacao: true })
  const [c] = await tx
    .select({
      id: s.convite.id,
      empresaId: s.convite.empresaId,
      email: s.convite.email,
      perfilId: s.convite.perfilId,
      perfil: s.perfil.nome,
      eMaster: s.perfil.eMaster,
      estabelecimentos: s.convite.estabelecimentos,
      situacao: s.convite.situacao,
      expiraEm: s.convite.expiraEm,
      empresa: s.ficha.nome,
      fantasia: s.ficha.nomeFantasia,
    })
    .from(s.convite)
    .innerJoin(s.perfil, eq(s.perfil.id, s.convite.perfilId))
    .innerJoin(s.empresa, eq(s.empresa.id, s.convite.empresaId))
    .innerJoin(s.ficha, eq(s.ficha.id, s.empresa.fichaId))
    .where(eq(s.convite.tokenHash, hash))
  if (!c) throw new ErroNaoEncontrado('Convite inválido. Peça um novo a quem convidou.')
  const situacao =
    c.situacao === 'pendente' && c.expiraEm.getTime() < Date.now() ? 'expirado' : c.situacao
  return { ...c, situacao }
}

export async function termosVigentes(tx: Tx) {
  return tx
    .selectDistinctOn([s.termoVersao.tipo], {
      id: s.termoVersao.id,
      tipo: s.termoVersao.tipo,
      versao: s.termoVersao.versao,
      texto: s.termoVersao.texto,
    })
    .from(s.termoVersao)
    .where(sql`${s.termoVersao.vigenteDesde} <= now()`)
    .orderBy(s.termoVersao.tipo, desc(s.termoVersao.vigenteDesde))
}

/**
 * Quem recebeu um link de convite ou de bastão: com cadastro, confirma a senha (P8); sem
 * cadastro, preenche os dados, cria a senha e aceita os termos (P21). Ativa o contexto da empresa.
 */
export async function entrarOuCadastrar(
  tx: Tx,
  email: string,
  empresaId: string,
  dados: z.output<typeof aceitarConvite>,
  ip: string,
): Promise<{ usuarioId: string; novo: boolean } | { erro: string }> {
  const [existente] = await tx
    .select()
    .from(s.usuario)
    .where(eq(sql`lower(${s.usuario.email})`, email))
  let usuarioId: string
  if (existente) {
    if (existente.bloqueadoAte && existente.bloqueadoAte.getTime() > Date.now()) {
      return { erro: 'Conta bloqueada por excesso de tentativas. Tente mais tarde.' }
    }
    if (!existente.ativo || !(await conferirSenha(existente.senhaHash, dados.senha))) {
      const tentativas = existente.tentativasLogin + 1
      const bloquear = tentativas >= TENTATIVAS_MAXIMAS
      await tx
        .update(s.usuario)
        .set({
          tentativasLogin: bloquear ? 0 : tentativas,
          bloqueadoAte: bloquear ? new Date(Date.now() + BLOQUEIO_MINUTOS * 60000) : null,
        })
        .where(eq(s.usuario.id, existente.id))
      return { erro: 'Senha incorreta.' }
    }
    usuarioId = existente.id
  } else {
    if (!dados.ficha) throw new ErroRegra('Preencha os seus dados.', 'ficha')
    if (!dados.aceiteTermos) {
      throw new ErroRegra(
        'É preciso aceitar os termos de uso e a política de privacidade.',
        'termos',
      )
    }
    const senha = senhaNova.parse(dados.senha)
    if (senha.toLowerCase().includes(email.split('@')[0]!.toLowerCase())) {
      throw new ErroRegra('A senha não pode conter o seu e-mail.', 'senha')
    }
    const fichaId = await criarFicha(tx, dados.ficha, 'usuario', null, null)
    const [u] = await tx
      .insert(s.usuario)
      .values({
        email,
        fichaId,
        senhaHash: await gerarHashSenha(senha),
        senhaAlteradaEm: sql`now()`,
      })
      .returning({ id: s.usuario.id })
    usuarioId = u!.id
  }
  await definirContexto(tx, { empresaId, usuarioId, autenticacao: true })
  await tx
    .update(s.usuario)
    .set({ tentativasLogin: 0, bloqueadoAte: null, ultimoAcessoEm: sql`now()` })
    .where(eq(s.usuario.id, usuarioId))
  // Aceite datado dos termos vigentes (P21).
  if (dados.aceiteTermos || !existente) {
    for (const t of await termosVigentes(tx)) {
      await tx
        .insert(s.termoAceite)
        .values({ usuarioId, termoVersaoId: t.id, ip })
        .onConflictDoNothing()
    }
  }
  return { usuarioId, novo: !existente }
}

export async function rotasConvites(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  app.get<{ Params: { token: string } }>('/api/convites/:token', async (req) =>
    db.transaction(async (tx) => {
      const c = await abrirConvite(tx, req.params.token)
      const [u] = await tx
        .select({ id: s.usuario.id })
        .from(s.usuario)
        .where(eq(sql`lower(${s.usuario.email})`, c.email))
      return {
        email: c.email,
        empresa: c.fantasia || c.empresa,
        perfil: c.perfil,
        master: c.eMaster,
        situacao: c.situacao,
        usuarioExiste: !!u,
        termos: await termosVigentes(tx),
      }
    }),
  )

  app.post<{ Params: { token: string } }>(
    '/api/convites/:token/aceitar',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const dados = aceitarConvite.parse(req.body)
      const base = origemDaRequisicao(req)
      const r = await db.transaction(async (tx) => {
        const c = await abrirConvite(tx, req.params.token)
        if (c.situacao !== 'pendente') {
          throw new ErroRegra(
            c.situacao === 'expirado'
              ? 'Este convite expirou. Peça a quem convidou para reenviar.'
              : 'Este convite não está mais disponível.',
            'convite_situacao',
          )
        }
        const entrada = await entrarOuCadastrar(tx, c.email, c.empresaId, dados, req.ip)
        if ('erro' in entrada) return entrada
        const { usuarioId, novo } = entrada

        const [vinculoAnterior] = await tx
          .select()
          .from(s.vinculo)
          .where(and(eq(s.vinculo.empresaId, c.empresaId), eq(s.vinculo.usuarioId, usuarioId)))
        if (vinculoAnterior?.ativo)
          throw new ErroRegra('Você já tem acesso a esta empresa.', 'ja_vinculado')
        let vinculoId: string
        if (vinculoAnterior) {
          await tx
            .update(s.vinculo)
            .set({
              perfilId: c.perfilId,
              eMaster: c.eMaster,
              ativo: true,
              inativadoEm: null,
              inativadoPor: null,
              motivoInativacao: null,
              conviteId: c.id,
              atualizadoEm: sql`now()`,
              atualizadoPor: usuarioId,
              versao: sql`${s.vinculo.versao} + 1`,
            })
            .where(eq(s.vinculo.id, vinculoAnterior.id))
          vinculoId = vinculoAnterior.id
          await tx
            .delete(s.vinculoEstabelecimento)
            .where(eq(s.vinculoEstabelecimento.vinculoId, vinculoId))
        } else {
          const [v] = await tx
            .insert(s.vinculo)
            .values({
              empresaId: c.empresaId,
              usuarioId,
              perfilId: c.perfilId,
              eMaster: c.eMaster,
              conviteId: c.id,
              criadoPor: usuarioId,
              atualizadoPor: usuarioId,
            })
            .returning({ id: s.vinculo.id })
            .catch((e: { cause?: { constraint?: string } }) => {
              if (e.cause?.constraint === 'vinculo_master') {
                throw new ErroRegra('A empresa já tem um Master ativo.', 'master_existente')
              }
              throw e
            })
          vinculoId = v!.id
        }
        if (c.estabelecimentos.length) {
          const ativos = await tx
            .select({ id: s.estabelecimento.id })
            .from(s.estabelecimento)
            .where(
              and(
                eq(s.estabelecimento.empresaId, c.empresaId),
                inArray(s.estabelecimento.id, c.estabelecimentos),
              ),
            )
          if (ativos.length) {
            await tx
              .insert(s.vinculoEstabelecimento)
              .values(
                ativos.map((e) => ({ vinculoId, estabelecimentoId: e.id, empresaId: c.empresaId })),
              )
          }
        }
        await tx
          .update(s.convite)
          .set({ situacao: 'aceito', aceitoEm: sql`now()`, aceitoPor: usuarioId })
          .where(eq(s.convite.id, c.id))

        const restritos = c.estabelecimentos
        const estabs = await estabelecimentosDoVinculo(tx, c.empresaId, restritos)
        const sessao = await criarSessao(tx, {
          usuarioId,
          ip: req.ip,
          navegador: req.headers['user-agent'] ?? null,
          empresaId: c.empresaId,
          estabelecimentoId: estabs[0]?.id ?? null,
        })
        const origem: Origem = { ...base, usuarioId, empresaId: c.empresaId }
        await auditar(tx, origem, {
          acao: 'aceitar',
          entidade: 'convite',
          registroId: c.id,
          dados: { vinculoId, novoUsuario: novo },
        })
        await auditar(tx, origem, { acao: 'login', entidade: 'sessao', registroId: sessao.id })
        return { token: sessao.token }
      })
      if ('erro' in r) throw new ErroAplicacao(401, 'credenciais', r.erro!)
      gravarCookie(app, reply, r.token)
      return estadoSessao(db, (await autenticar(db, r.token))!)
    },
  )
}
