// Sessões em cookie (P10, P21). O cookie leva um token aleatório; o banco guarda só o hash.
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { emContexto, type Db, type Tx } from '../db/cliente';
import * as s from '../db/schema';
import { gerarToken, hashToken } from './seguranca';

/** Sessão encerra após 7 dias sem uso e, em qualquer caso, 30 dias depois do login. */
export const SESSAO_INATIVIDADE_MS = 7 * 24 * 3600 * 1000;
export const SESSAO_MAXIMA_MS = 30 * 24 * 3600 * 1000;
/** Na Administração, o segundo fator vale por 12 horas (P21). */
export const SEGUNDO_FATOR_VALIDADE_MS = 12 * 3600 * 1000;

export interface SessaoAtiva {
  id: string;
  usuarioId: string;
  email: string;
  contexto: 'empresa' | 'plataforma';
  empresaId: string | null;
  estabelecimentoId: string | null;
  segundoFatorEm: Date | null;
  criadaEm: Date;
  /**
   * Personificação (P28): a sessão age como o usuário do cliente (usuarioId, email, empresa); aqui
   * fica quem é de fato, para a auditoria e para o que fica bloqueado.
   */
  real?: { usuarioId: string; email: string; personificacaoId: string; expiraEm: Date };
}

export function nomeCookie(seguro: boolean): string {
  // __Host-: só HTTPS, sem Domain, Path=/ (02-arquitetura.md, Endereços).
  return seguro ? '__Host-vinicycle_sessao' : 'vinicycle_sessao';
}

export async function criarSessao(
  tx: Tx,
  dados: {
    usuarioId: string;
    ip: string | null;
    navegador: string | null;
    empresaId: string | null;
    estabelecimentoId: string | null;
  },
): Promise<{ token: string; id: string; expiraEm: Date }> {
  const { token, hash } = gerarToken();
  const expiraEm = new Date(Date.now() + SESSAO_INATIVIDADE_MS);
  const [linha] = await tx
    .insert(s.sessao)
    .values({
      usuarioId: dados.usuarioId,
      tokenHash: hash,
      expiraEm,
      ip: dados.ip,
      navegador: dados.navegador?.slice(0, 500) ?? null,
      empresaId: dados.empresaId,
      estabelecimentoId: dados.estabelecimentoId,
    })
    .returning({ id: s.sessao.id });
  return { token, id: linha!.id, expiraEm };
}

/** Confere o token do cookie. Renova a validade por uso, até o máximo de 30 dias. */
export async function autenticar(db: Db, token: string): Promise<SessaoAtiva | null> {
  const hash = hashToken(token);
  return emContexto(db, { autenticacao: true }, async (tx) => {
    const [r] = await tx
      .select({
        id: s.sessao.id,
        usuarioId: s.sessao.usuarioId,
        email: s.usuario.email,
        contexto: s.sessao.contexto,
        empresaId: s.sessao.empresaId,
        estabelecimentoId: s.sessao.estabelecimentoId,
        segundoFatorEm: s.sessao.segundoFatorEm,
        criadaEm: s.sessao.criadaEm,
        ultimoUsoEm: s.sessao.ultimoUsoEm,
      })
      .from(s.sessao)
      .innerJoin(s.usuario, eq(s.usuario.id, s.sessao.usuarioId))
      .where(
        and(
          eq(s.sessao.tokenHash, hash),
          isNull(s.sessao.encerradaEm),
          gt(s.sessao.expiraEm, sql`now()`),
          eq(s.usuario.ativo, true),
        ),
      );
    if (!r) return null;
    const agora = Date.now();
    const [sp] = await tx
      .select({ personificacaoId: s.sessao.personificacaoId })
      .from(s.sessao)
      .where(eq(s.sessao.id, r.id));
    if (sp?.personificacaoId) {
      const [p] = await tx
        .select({
          id: s.personificacao.id,
          usuarioId: s.personificacao.usuarioId,
          empresaId: s.personificacao.empresaId,
          fimPrevisto: s.personificacao.fimPrevisto,
          fim: s.personificacao.fim,
          email: s.usuario.email,
          ativo: s.usuario.ativo,
        })
        .from(s.personificacao)
        .innerJoin(s.usuario, eq(s.usuario.id, s.personificacao.usuarioId))
        .where(eq(s.personificacao.id, sp.personificacaoId));
      if (p && !p.fim && p.ativo && p.fimPrevisto.getTime() > agora) {
        const { ultimoUsoEm: _u, ...base } = r;
        return {
          ...base,
          usuarioId: p.usuarioId,
          email: p.email,
          contexto: 'empresa',
          empresaId: p.empresaId,
          real: {
            usuarioId: r.usuarioId,
            email: r.email,
            personificacaoId: p.id,
            expiraEm: p.fimPrevisto,
          },
        };
      }
      // Venceu (60 minutos) ou foi encerrada: a sessão volta a ser do membro, na Administração.
      await encerrarPersonificacao(tx, r.id, sp.personificacaoId, 'tempo');
      r.contexto = 'plataforma';
      r.empresaId = null;
      r.estabelecimentoId = null;
    }
    if (agora - r.ultimoUsoEm.getTime() > 5 * 60 * 1000) {
      const limite = r.criadaEm.getTime() + SESSAO_MAXIMA_MS;
      await tx
        .update(s.sessao)
        .set({
          ultimoUsoEm: new Date(agora),
          expiraEm: new Date(Math.min(limite, agora + SESSAO_INATIVIDADE_MS)),
        })
        .where(eq(s.sessao.id, r.id));
    }
    const { ultimoUsoEm: _u, ...sessao } = r;
    return sessao;
  });
}

export async function encerrarSessao(tx: Tx, id: string, motivo: string): Promise<void> {
  await tx
    .update(s.sessao)
    .set({ encerradaEm: sql`now()`, motivoEncerramento: motivo })
    .where(and(eq(s.sessao.id, id), isNull(s.sessao.encerradaEm)));
}

/** Trocar a senha encerra as outras sessões (P10). */
export async function encerrarOutrasSessoes(
  tx: Tx,
  usuarioId: string,
  manter: string | null,
  motivo: string,
): Promise<void> {
  await tx
    .update(s.sessao)
    .set({ encerradaEm: sql`now()`, motivoEncerramento: motivo })
    .where(
      and(
        eq(s.sessao.usuarioId, usuarioId),
        isNull(s.sessao.encerradaEm),
        manter ? sql`${s.sessao.id} <> ${manter}` : undefined,
      ),
    );
}

/** Fim da personificação: registra quando e como, e devolve a sessão ao membro da equipe. */
export async function encerrarPersonificacao(
  tx: Tx,
  sessaoId: string,
  personificacaoId: string,
  forma: 'manual' | 'tempo' | 'saida',
): Promise<void> {
  await tx
    .update(s.personificacao)
    .set({ fim: sql`least(now(), ${s.personificacao.fimPrevisto})`, formaEncerramento: forma })
    .where(and(eq(s.personificacao.id, personificacaoId), isNull(s.personificacao.fim)));
  await tx
    .update(s.sessao)
    .set({
      personificacaoId: null,
      contexto: 'plataforma',
      empresaId: null,
      estabelecimentoId: null,
    })
    .where(eq(s.sessao.id, sessaoId));
}
