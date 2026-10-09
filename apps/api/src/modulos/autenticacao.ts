// Entrada, saída, troca de empresa e de estabelecimento, senha e segundo fator (P8, P10, P12,
// P14, P21).
import {
  codigoSegundoFator,
  entrar,
  esqueciSenha,
  redefinirSenha,
  trocarContexto,
} from '@vinicycle/shared'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply } from 'fastify'
import QRCode from 'qrcode'
import { definirContexto, emContexto, type Tx } from '../db/cliente'
import * as s from '../db/schema'
import { auditar, type Origem } from '../nucleo/auditoria'
import { enfileirarEmail } from '../nucleo/email'
import { ErroAplicacao, ErroNaoAutenticado, ErroRegra } from '../nucleo/erros'
import { emailRedefinirSenha, emailSenhaAlterada } from '../nucleo/modelos-email'
import { carregarAcessoEmpresa, carregarAcessoPlataforma } from '../nucleo/permissoes'
import {
  doUsuario,
  exigirSemPersonificacao,
  identidades,
  origemDaRequisicao,
} from '../nucleo/requisicao'
import {
  cifrar,
  conferirSenha,
  conferirTotp,
  decifrar,
  gerarHashSenha,
  gerarSegredoTotp,
  gerarToken,
  hashToken,
  uriTotp,
} from '../nucleo/seguranca'
import {
  autenticar,
  criarSessao,
  encerrarOutrasSessoes,
  encerrarPersonificacao,
  encerrarSessao,
  nomeCookie,
  SESSAO_MAXIMA_MS,
} from '../nucleo/sessoes'
import { estabelecimentosDoVinculo, estadoSessao } from './estado-sessao'

/** Limite de tentativas de login (P21): 5 erros seguidos bloqueiam a conta por 15 minutos. */
export const TENTATIVAS_MAXIMAS = 5
export const BLOQUEIO_MINUTOS = 15
const TOKEN_SENHA_MS = 3600 * 1000

const LIMITE_ENTRADA = { rateLimit: { max: 20, timeWindow: '1 minute' } }

export function gravarCookie(app: FastifyInstance, reply: FastifyReply, token: string): void {
  const seguro = app.deps.config.cookieSeguro
  reply.setCookie(nomeCookie(seguro), token, {
    httpOnly: true,
    secure: seguro,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSAO_MAXIMA_MS / 1000,
  })
}

/**
 * Escolhe a empresa e o estabelecimento iniciais: os últimos usados, se ainda valem; senão, a
 * única empresa e o primeiro estabelecimento permitido.
 */
export async function contextoInicial(
  tx: Tx,
  usuarioId: string,
  preferida: string | null,
): Promise<{ empresaId: string | null; estabelecimentoId: string | null }> {
  await definirContexto(tx, { usuarioId, autenticacao: true })
  const vinculos = await tx
    .select({ empresaId: s.vinculo.empresaId, ultimoEstab: s.vinculo.ultimoEstabelecimentoId })
    .from(s.vinculo)
    .where(and(eq(s.vinculo.usuarioId, usuarioId), eq(s.vinculo.ativo, true)))
  const escolhido =
    vinculos.find((v) => v.empresaId === preferida) ??
    (vinculos.length === 1 ? vinculos[0] : undefined)
  if (!escolhido) return { empresaId: null, estabelecimentoId: null }
  await definirContexto(tx, { usuarioId, empresaId: escolhido.empresaId, autenticacao: true })
  const acesso = await carregarAcessoEmpresa(tx, usuarioId, escolhido.empresaId)
  if (!acesso) return { empresaId: null, estabelecimentoId: null }
  const estabs = await estabelecimentosDoVinculo(
    tx,
    escolhido.empresaId,
    acesso.estabelecimentosRestritos,
  )
  const estab = estabs.find((e) => e.id === escolhido.ultimoEstab) ?? estabs[0]
  return { empresaId: escolhido.empresaId, estabelecimentoId: estab?.id ?? null }
}

export async function rotasAutenticacao(app: FastifyInstance): Promise<void> {
  const { db, config } = app.deps

  app.post('/api/auth/entrar', { config: LIMITE_ENTRADA }, async (req, reply) => {
    const dados = entrar.parse(req.body)
    const base = origemDaRequisicao(req)
    const resultado = await emContexto(db, { autenticacao: true }, async (tx) => {
      const [u] = await tx
        .select()
        .from(s.usuario)
        .where(eq(sql`lower(${s.usuario.email})`, dados.email))
      const origem: Origem = { ...base, usuarioId: u?.id ?? null, empresaId: null }
      if (u?.bloqueadoAte && u.bloqueadoAte.getTime() > Date.now()) {
        await auditar(tx, origem, {
          acao: 'login_bloqueado',
          entidade: 'usuario',
          registroId: u.id,
        })
        const min = Math.ceil((u.bloqueadoAte.getTime() - Date.now()) / 60000)
        return { erro: `Conta bloqueada por excesso de tentativas. Tente de novo em ${min} min.` }
      }
      const ok = await conferirSenha(u?.senhaHash ?? null, dados.senha)
      if (!u || !ok || !u.ativo) {
        if (u) {
          const tentativas = u.tentativasLogin + 1
          const bloquear = tentativas >= TENTATIVAS_MAXIMAS
          await tx
            .update(s.usuario)
            .set({
              tentativasLogin: bloquear ? 0 : tentativas,
              bloqueadoAte: bloquear ? new Date(Date.now() + BLOQUEIO_MINUTOS * 60000) : null,
            })
            .where(eq(s.usuario.id, u.id))
        }
        await auditar(tx, origem, {
          acao: 'login_falha',
          entidade: 'usuario',
          registroId: u?.id ?? null,
          dados: { email: dados.email },
        })
        return { erro: 'E-mail ou senha incorretos.' }
      }
      await tx
        .update(s.usuario)
        .set({ tentativasLogin: 0, bloqueadoAte: null, ultimoAcessoEm: sql`now()` })
        .where(eq(s.usuario.id, u.id))
      const preferida = (u.preferencias as { ultimaEmpresaId?: string }).ultimaEmpresaId ?? null
      const inicial = await contextoInicial(tx, u.id, preferida)
      const sessao = await criarSessao(tx, {
        usuarioId: u.id,
        ip: req.ip,
        navegador: req.headers['user-agent'] ?? null,
        ...inicial,
      })
      await auditar(
        tx,
        { ...origem, empresaId: inicial.empresaId, estabelecimentoId: inicial.estabelecimentoId },
        {
          acao: 'login',
          entidade: 'sessao',
          registroId: sessao.id,
        },
      )
      return { token: sessao.token }
    })
    if ('erro' in resultado) throw new ErroAplicacao(401, 'credenciais', resultado.erro!)
    gravarCookie(app, reply, resultado.token)
    return estadoSessao(db, (await autenticar(db, resultado.token))!)
  })

  app.post('/api/auth/sair', async (req, reply) => {
    const sessao = req.sessao
    if (sessao) {
      await emContexto(
        db,
        { usuarioId: sessao.usuarioId, empresaId: sessao.empresaId },
        async (tx) => {
          if (sessao.real) {
            await definirContexto(tx, {
              usuarioId: sessao.real.usuarioId,
              empresaId: sessao.empresaId,
              autenticacao: true,
            })
            await encerrarPersonificacao(tx, sessao.id, sessao.real.personificacaoId, 'saida')
          }
          await encerrarSessao(tx, sessao.id, 'logout')
          await auditar(
            tx,
            {
              ...origemDaRequisicao(req),
              ...identidades(sessao),
              empresaId: sessao.empresaId,
            },
            { acao: 'logout', entidade: 'sessao', registroId: sessao.id },
          )
        },
      )
    }
    reply.clearCookie(nomeCookie(config.cookieSeguro), { path: '/' })
    return { ok: true }
  })

  /** Encerra a personificação e volta à Administração (P28). */
  app.post('/api/auth/personificacao/encerrar', async (req) => {
    const sessao = req.sessao
    if (!sessao?.real) throw new ErroRegra('Não há personificação em curso.', 'sem_personificacao')
    const real = sessao.real
    await emContexto(
      db,
      { usuarioId: real.usuarioId, empresaId: sessao.empresaId, autenticacao: true },
      async (tx) => {
        await encerrarPersonificacao(tx, sessao.id, real.personificacaoId, 'manual')
        await auditar(
          tx,
          { ...origemDaRequisicao(req), ...identidades(sessao), empresaId: sessao.empresaId },
          {
            acao: 'encerrar_personificacao',
            entidade: 'personificacao',
            registroId: real.personificacaoId,
          },
        )
      },
    )
    return estadoSessao(db, (await autenticar(db, req.cookies[nomeCookie(config.cookieSeguro)]!))!)
  })

  app.get('/api/auth/sessao', async (req) => {
    if (!req.sessao) throw new ErroNaoAutenticado('Não há sessão aberta.')
    return estadoSessao(db, req.sessao)
  })

  // Troca de empresa, de estabelecimento ou de área (P14: fica na auditoria).
  app.post('/api/auth/contexto', async (req) => {
    const sessao = req.sessao
    if (!sessao) throw new ErroNaoAutenticado()
    const dados = trocarContexto.parse(req.body)
    // Na personificação, só o estabelecimento muda; para sair, encerra-se a personificação (P28).
    if (dados.contexto || (dados.empresaId && dados.empresaId !== sessao.empresaId)) {
      exigirSemPersonificacao(sessao, 'trocar de empresa ou de área')
    }
    await emContexto(db, { usuarioId: sessao.usuarioId }, async (tx) => {
      let empresaId = sessao.empresaId
      let estabelecimentoId = sessao.estabelecimentoId
      let contexto = sessao.contexto
      if (dados.contexto) {
        if (
          dados.contexto === 'plataforma' &&
          !(await carregarAcessoPlataforma(tx, sessao.usuarioId))
        ) {
          throw new ErroRegra('Acesso restrito à equipe da plataforma.', 'sem_permissao')
        }
        contexto = dados.contexto
      }
      if (dados.empresaId && dados.empresaId !== empresaId) {
        const inicial = await contextoInicial(tx, sessao.usuarioId, dados.empresaId)
        if (inicial.empresaId !== dados.empresaId) {
          throw new ErroRegra('Você não tem acesso a esta empresa.', 'sem_permissao')
        }
        empresaId = inicial.empresaId
        estabelecimentoId = inicial.estabelecimentoId
        contexto = 'empresa'
      }
      if (dados.estabelecimentoId !== undefined && empresaId) {
        await definirContexto(tx, { usuarioId: sessao.usuarioId, empresaId })
        const acesso = await carregarAcessoEmpresa(tx, sessao.usuarioId, empresaId)
        if (!acesso) throw new ErroRegra('Você não tem acesso a esta empresa.', 'sem_permissao')
        if (dados.estabelecimentoId !== null) {
          const estabs = await estabelecimentosDoVinculo(
            tx,
            empresaId,
            acesso.estabelecimentosRestritos,
          )
          if (!estabs.some((e) => e.id === dados.estabelecimentoId)) {
            throw new ErroRegra('Você não tem acesso a este estabelecimento.', 'sem_permissao')
          }
        }
        estabelecimentoId = dados.estabelecimentoId
        await tx
          .update(s.vinculo)
          .set({ ultimoEstabelecimentoId: estabelecimentoId })
          .where(eq(s.vinculo.id, acesso.vinculoId))
      }
      await definirContexto(tx, { usuarioId: sessao.usuarioId, empresaId, autenticacao: true })
      await tx
        .update(s.sessao)
        .set({ empresaId, estabelecimentoId, contexto })
        .where(eq(s.sessao.id, sessao.id))
      if (empresaId && !sessao.real) {
        await tx
          .update(s.usuario)
          .set({
            preferencias: sql`${s.usuario.preferencias} || ${JSON.stringify({ ultimaEmpresaId: empresaId })}::jsonb`,
          })
          .where(eq(s.usuario.id, sessao.usuarioId))
      }
      await auditar(
        tx,
        { ...origemDaRequisicao(req), ...identidades(sessao), empresaId, estabelecimentoId },
        {
          acao: 'troca_contexto',
          entidade: 'sessao',
          registroId: sessao.id,
          antes: {
            empresaId: sessao.empresaId,
            estabelecimentoId: sessao.estabelecimentoId,
            contexto: sessao.contexto,
          },
          depois: { empresaId, estabelecimentoId, contexto },
        },
      )
      Object.assign(sessao, { empresaId, estabelecimentoId, contexto })
    })
    return estadoSessao(db, sessao)
  })

  // "Esqueci minha senha" (P10). A resposta é sempre a mesma, para não revelar quem tem cadastro.
  app.post('/api/auth/senha/esqueci', { config: LIMITE_ENTRADA }, async (req) => {
    const dados = esqueciSenha.parse(req.body)
    await emContexto(db, { autenticacao: true }, async (tx) => {
      const [u] = await tx
        .select({ id: s.usuario.id, email: s.usuario.email, ativo: s.usuario.ativo })
        .from(s.usuario)
        .where(eq(sql`lower(${s.usuario.email})`, dados.email))
      if (!u || !u.ativo) return
      const { token, hash } = gerarToken()
      await tx.insert(s.tokenVerificacao).values({
        usuarioId: u.id,
        email: u.email,
        tipo: 'redefinir_senha',
        tokenHash: hash,
        expiraEm: new Date(Date.now() + TOKEN_SENHA_MS),
      })
      const link = `${config.URL_APLICACAO}/redefinir-senha?token=${token}`
      await enfileirarEmail(tx, {
        ...emailRedefinirSenha({ para: u.email, link }),
        modelo: 'redefinir_senha',
        origem: 'usuario',
        origemId: u.id,
      })
      await auditar(
        tx,
        { ...origemDaRequisicao(req), usuarioId: u.id, empresaId: null },
        {
          acao: 'senha_esqueci',
          entidade: 'usuario',
          registroId: u.id,
        },
      )
    })
    return { ok: true }
  })

  app.post('/api/auth/senha/redefinir', { config: LIMITE_ENTRADA }, async (req) => {
    const dados = redefinirSenha.parse(req.body)
    await emContexto(db, { autenticacao: true }, async (tx) => {
      const [t] = await tx
        .select()
        .from(s.tokenVerificacao)
        .where(
          and(
            eq(s.tokenVerificacao.tokenHash, hashToken(dados.token)),
            eq(s.tokenVerificacao.tipo, 'redefinir_senha'),
            isNull(s.tokenVerificacao.usadoEm),
            gt(s.tokenVerificacao.expiraEm, sql`now()`),
          ),
        )
      if (!t?.usuarioId) {
        throw new ErroRegra(
          'Link inválido ou vencido. Peça um novo em "Esqueci minha senha".',
          'token',
        )
      }
      await tx
        .update(s.tokenVerificacao)
        .set({ usadoEm: sql`now()` })
        .where(eq(s.tokenVerificacao.id, t.id))
      await tx
        .update(s.usuario)
        .set({
          senhaHash: await gerarHashSenha(dados.senha),
          senhaAlteradaEm: sql`now()`,
          tentativasLogin: 0,
          bloqueadoAte: null,
        })
        .where(eq(s.usuario.id, t.usuarioId))
      await encerrarOutrasSessoes(tx, t.usuarioId, null, 'senha_redefinida')
      await enfileirarEmail(tx, {
        ...emailSenhaAlterada({ para: t.email }),
        modelo: 'senha_alterada',
        origem: 'usuario',
        origemId: t.usuarioId,
      })
      await auditar(
        tx,
        { ...origemDaRequisicao(req), usuarioId: t.usuarioId, empresaId: null },
        {
          acao: 'senha_redefinida',
          entidade: 'usuario',
          registroId: t.usuarioId,
        },
      )
    })
    return { ok: true }
  })

  // Segundo fator (P21): obrigatório para a equipe da plataforma.
  app.post('/api/auth/segundo-fator/iniciar', async (req) =>
    doUsuario(db, req, async ({ tx, usuarioId, sessao }) => {
      await definirContexto(tx, { usuarioId, autenticacao: true })
      const [u] = await tx.select().from(s.usuario).where(eq(s.usuario.id, usuarioId))
      if (u!.totpAtivoEm)
        throw new ErroRegra('O segundo fator já está ativo.', 'segundo_fator_ativo')
      const segredo = gerarSegredoTotp()
      await tx
        .update(s.usuario)
        .set({ totpSegredoCifrado: cifrar(config.CHAVE_CIFRA, segredo) })
        .where(eq(s.usuario.id, usuarioId))
      const uri = uriTotp(segredo, sessao.email)
      return { segredo, uri, qrSvg: await QRCode.toString(uri, { type: 'svg', margin: 1 }) }
    }),
  )

  const conferirCodigo = (ativar: boolean) => async (req: Parameters<typeof doUsuario>[1]) =>
    doUsuario(db, req, async ({ tx, usuarioId, sessao, origem }) => {
      const { codigo } = codigoSegundoFator.parse(req.body)
      await definirContexto(tx, { usuarioId, autenticacao: true })
      const [u] = await tx.select().from(s.usuario).where(eq(s.usuario.id, usuarioId))
      if (!u!.totpSegredoCifrado || (!ativar && !u!.totpAtivoEm)) {
        throw new ErroRegra('Configure o segundo fator primeiro.', 'segundo_fator_ausente')
      }
      if (ativar && u!.totpAtivoEm)
        throw new ErroRegra('O segundo fator já está ativo.', 'segundo_fator_ativo')
      if (!conferirTotp(decifrar(config.CHAVE_CIFRA, u!.totpSegredoCifrado), codigo)) {
        await auditar(tx, origem, {
          acao: 'segundo_fator_falha',
          entidade: 'usuario',
          registroId: usuarioId,
        })
        return { ok: false as const }
      }
      if (ativar) {
        await tx
          .update(s.usuario)
          .set({ totpAtivoEm: sql`now()` })
          .where(eq(s.usuario.id, usuarioId))
      }
      await tx
        .update(s.sessao)
        .set({ segundoFatorEm: sql`now()` })
        .where(eq(s.sessao.id, sessao.id))
      await auditar(tx, origem, {
        acao: ativar ? 'segundo_fator_ativado' : 'segundo_fator_conferido',
        entidade: 'usuario',
        registroId: usuarioId,
      })
      return { ok: true as const }
    }).then((r) => {
      if (!r.ok)
        throw new ErroAplicacao(
          400,
          'codigo_invalido',
          'Código incorreto. Confira o aplicativo e tente de novo.',
        )
      return { ok: true }
    })

  app.post('/api/auth/segundo-fator/ativar', { config: LIMITE_ENTRADA }, conferirCodigo(true))
  app.post('/api/auth/segundo-fator/conferir', { config: LIMITE_ENTRADA }, conferirCodigo(false))
}
