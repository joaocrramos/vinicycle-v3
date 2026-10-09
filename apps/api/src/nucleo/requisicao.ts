// Execução de cada requisição autenticada: transação com o contexto do RLS, conferência de
// permissões (P27) e auditoria (P14), tudo na mesma transação.
import type { Acao } from '@vinicycle/shared'
import { and, eq, inArray } from 'drizzle-orm'
import type { FastifyRequest } from 'fastify'
import { definirContexto, emContexto, type Db, type Tx } from '../db/cliente'
import * as s from '../db/schema'
import { auditar, type Evento, type Origem } from './auditoria'
import { ErroAplicacao, ErroNaoAutenticado, ErroPermissao, ErroRegra } from './erros'
import {
  type AcessoEmpresa,
  type AcessoPlataforma,
  carregarAcessoEmpresa,
  carregarAcessoPlataforma,
  exigir,
} from './permissoes'
import { SEGUNDO_FATOR_VALIDADE_MS, type SessaoAtiva } from './sessoes'

declare module 'fastify' {
  interface FastifyRequest {
    sessao: SessaoAtiva | null
  }
}

/** Quem age de fato e, na personificação, como quem (P28): as duas identidades na auditoria. */
export function identidades(
  sessao: SessaoAtiva,
): Pick<Origem, 'usuarioId' | 'personificadoId' | 'personificacaoId'> {
  return sessao.real
    ? {
        usuarioId: sessao.real.usuarioId,
        personificadoId: sessao.usuarioId,
        personificacaoId: sessao.real.personificacaoId,
      }
    : { usuarioId: sessao.usuarioId }
}

/**
 * O que a personificação não faz (P28): perfis e permissões, segredos (certificado A1 e
 * integrações), exportação completa dos dados.
 */
const BLOQUEADAS_NA_PERSONIFICACAO: Record<string, readonly Acao[] | 'todas'> = {
  'gestao.config.perfis': ['criar', 'editar', 'inativar'],
  'gestao.config.integracoes': 'todas',
  'gestao.config.exportar_dados': 'todas',
}

export function exigirSemPersonificacao(sessao: SessaoAtiva | null, oque = 'esta ação'): void {
  if (sessao?.real) {
    throw new ErroPermissao(
      'personificacao',
      'editar',
      `Durante a personificação, ${oque} não é permitido.`,
    )
  }
}

export function origemDaRequisicao(req: FastifyRequest): Omit<Origem, 'empresaId' | 'usuarioId'> {
  return {
    ip: req.ip,
    navegador: req.headers['user-agent']?.slice(0, 500) ?? null,
    requisicaoId: req.id,
    estabelecimentoId: req.sessao?.estabelecimentoId ?? null,
  }
}

interface Base<A> {
  tx: Tx
  usuarioId: string
  sessao: SessaoAtiva
  acesso: A
  origem: Origem
  auditar(evento: Evento): Promise<void>
  exigir(funcionalidade: string, acao: Acao): void
}

export interface ContextoEmpresa extends Base<AcessoEmpresa> {
  empresaId: string
  /** Estabelecimento ativo; vazio = "Todos". */
  estabelecimentoId: string | null
  /** Estabelecimentos que o usuário pode ver (ativos e permitidos no vínculo). */
  estabelecimentosPermitidos(): Promise<string[]>
  /** Exige um estabelecimento ativo (registros de nível Est, P12). */
  exigirEstabelecimento(): string
}

export type ContextoPlataforma = Base<AcessoPlataforma>

type Permissao = readonly [string, Acao]

async function registrarNegado(
  db: Db,
  ctx: { usuarioId: string; empresaId: string | null },
  origem: Origem,
  erro: ErroPermissao,
): Promise<void> {
  await emContexto(db, ctx, (tx) =>
    auditar(tx, origem, {
      acao: 'acesso_negado',
      entidade: 'funcionalidade',
      dados: { funcionalidade: erro.funcionalidade, acao: erro.acao, mensagem: erro.message },
    }),
  )
}

/** Rota do ambiente do cliente: exige empresa ativa e, se informada, a permissão. */
export async function naEmpresa<T>(
  db: Db,
  req: FastifyRequest,
  permissao: Permissao | null,
  fn: (ctx: ContextoEmpresa) => Promise<T>,
): Promise<T> {
  const sessao = req.sessao
  if (!sessao) throw new ErroNaoAutenticado()
  const empresaId = sessao.empresaId
  if (!empresaId) throw new ErroRegra('Escolha uma empresa para continuar.', 'sem_empresa')
  const origem: Origem = { ...origemDaRequisicao(req), ...identidades(sessao), empresaId }
  if (sessao.real && permissao) {
    const b = BLOQUEADAS_NA_PERSONIFICACAO[permissao[0]]
    if (b === 'todas' || b?.includes(permissao[1])) exigirSemPersonificacao(sessao)
  }
  try {
    return await emContexto(db, { usuarioId: sessao.usuarioId, empresaId }, async (tx) => {
      const acesso = await carregarAcessoEmpresa(tx, sessao.usuarioId, empresaId)
      if (!acesso) {
        throw new ErroPermissao('empresa', 'visualizar', 'Você não tem mais acesso a esta empresa.')
      }
      if (permissao) exigir(acesso, permissao[0], permissao[1])
      // O estabelecimento ativo pode ter sido inativado ou retirado do vínculo: vira "Todos".
      let estabelecimentoId = sessao.estabelecimentoId
      if (estabelecimentoId) {
        const restritos = acesso.estabelecimentosRestritos
        const [ok] = await tx
          .select({ id: s.estabelecimento.id })
          .from(s.estabelecimento)
          .where(
            and(
              eq(s.estabelecimento.id, estabelecimentoId),
              eq(s.estabelecimento.ativo, true),
              restritos.length ? inArray(s.estabelecimento.id, restritos) : undefined,
            ),
          )
        if (!ok) estabelecimentoId = null
      }
      origem.estabelecimentoId = estabelecimentoId
      const ctx = montarContexto(tx, sessao, acesso, origem, empresaId, estabelecimentoId)
      return fn(ctx)
    })
  } catch (e) {
    if (e instanceof ErroPermissao) {
      await registrarNegado(db, { usuarioId: sessao.usuarioId, empresaId }, origem, e)
    }
    throw e
  }
}

/** Rota da Administração: exige membro ativo da equipe, segundo fator e a permissão (P8, P21). */
export async function naPlataforma<T>(
  db: Db,
  req: FastifyRequest,
  permissao: Permissao | null,
  fn: (ctx: ContextoPlataforma) => Promise<T>,
): Promise<T> {
  const sessao = req.sessao
  if (!sessao) throw new ErroNaoAutenticado()
  const origem: Origem = {
    ...origemDaRequisicao(req),
    usuarioId: sessao.usuarioId,
    empresaId: null,
  }
  try {
    return await db.transaction(async (tx) => {
      await definirContexto(tx, { usuarioId: sessao.usuarioId })
      const acesso = await carregarAcessoPlataforma(tx, sessao.usuarioId)
      if (!acesso) {
        throw new ErroPermissao(
          'plataforma',
          'visualizar',
          'Acesso restrito à equipe da plataforma.',
        )
      }
      const fator = sessao.segundoFatorEm?.getTime() ?? 0
      if (Date.now() - fator > SEGUNDO_FATOR_VALIDADE_MS) {
        throw new ErroAplicacao(
          403,
          'segundo_fator',
          'Confirme o código do aplicativo autenticador para entrar na Administração.',
        )
      }
      if (permissao) exigir(acesso, permissao[0], permissao[1])
      await definirContexto(tx, { usuarioId: sessao.usuarioId, plataforma: true })
      return fn({
        tx,
        usuarioId: sessao.usuarioId,
        sessao,
        acesso,
        origem,
        auditar: (evento) => auditar(tx, origem, evento),
        exigir: (f, a) => exigir(acesso, f, a),
      })
    })
  } catch (e) {
    if (e instanceof ErroPermissao) {
      await registrarNegado(db, { usuarioId: sessao.usuarioId, empresaId: null }, origem, e)
    }
    throw e
  }
}

/** Rota do próprio usuário, fora de empresa (perfil, sessões, preferências). */
export async function doUsuario<T>(
  db: Db,
  req: FastifyRequest,
  fn: (ctx: { tx: Tx; usuarioId: string; sessao: SessaoAtiva; origem: Origem }) => Promise<T>,
): Promise<T> {
  const sessao = req.sessao
  if (!sessao) throw new ErroNaoAutenticado()
  // Senha, e-mail, segundo fator, sessões e preferências do usuário: só ele muda (P28).
  if (req.method !== 'GET') exigirSemPersonificacao(sessao, 'mudar os dados de acesso do usuário')
  // Sem empresa ativa no contexto: estas rotas só tocam as tabelas do próprio usuário.
  const origem: Origem = {
    ...origemDaRequisicao(req),
    ...identidades(sessao),
    empresaId: null,
  }
  return emContexto(db, { usuarioId: sessao.usuarioId }, (tx) =>
    fn({ tx, usuarioId: sessao.usuarioId, sessao, origem }),
  )
}

function montarContexto(
  tx: Tx,
  sessao: SessaoAtiva,
  acesso: AcessoEmpresa,
  origem: Origem,
  empresaId: string,
  estabelecimentoId: string | null,
): ContextoEmpresa {
  let permitidos: string[] | null = null
  return {
    tx,
    usuarioId: sessao.usuarioId,
    sessao,
    acesso,
    origem,
    empresaId,
    estabelecimentoId,
    auditar: (evento) => auditar(tx, origem, evento),
    exigir: (f, a) => exigir(acesso, f, a),
    async estabelecimentosPermitidos() {
      if (permitidos) return permitidos
      const linhas = await tx
        .select({ id: s.estabelecimento.id })
        .from(s.estabelecimento)
        .where(
          and(
            eq(s.estabelecimento.empresaId, empresaId),
            eq(s.estabelecimento.ativo, true),
            acesso.estabelecimentosRestritos.length
              ? inArray(s.estabelecimento.id, acesso.estabelecimentosRestritos)
              : undefined,
          ),
        )
      permitidos = linhas.map((l) => l.id)
      return permitidos
    },
    exigirEstabelecimento() {
      if (!estabelecimentoId) {
        throw new ErroRegra('Escolha um estabelecimento para continuar.', 'sem_estabelecimento')
      }
      return estabelecimentoId
    },
  }
}

/**
 * Tarefa de fundo em nome de um usuário (ex.: relatório agendado): o mesmo contexto de uma
 * requisição, com as permissões dele agora (P27). Sem acesso à empresa ou ao estabelecimento, nada.
 */
export async function comoUsuario<T>(
  db: Db,
  quem: { usuarioId: string; email: string; empresaId: string; estabelecimentoId: string },
  fn: (ctx: ContextoEmpresa) => Promise<T>,
): Promise<T | null> {
  return emContexto(db, { usuarioId: quem.usuarioId, empresaId: quem.empresaId }, async (tx) => {
    const acesso = await carregarAcessoEmpresa(tx, quem.usuarioId, quem.empresaId)
    if (!acesso) return null
    const restritos = acesso.estabelecimentosRestritos
    if (restritos.length && !restritos.includes(quem.estabelecimentoId)) return null
    const sessao: SessaoAtiva = {
      id: 'tarefa',
      usuarioId: quem.usuarioId,
      email: quem.email,
      contexto: 'empresa',
      empresaId: quem.empresaId,
      estabelecimentoId: quem.estabelecimentoId,
      segundoFatorEm: null,
      criadaEm: new Date(),
    }
    const origem: Origem = {
      usuarioId: quem.usuarioId,
      empresaId: quem.empresaId,
      estabelecimentoId: quem.estabelecimentoId,
      requisicaoId: 'tarefa',
    }
    return fn(montarContexto(tx, sessao, acesso, origem, quem.empresaId, quem.estabelecimentoId))
  })
}
