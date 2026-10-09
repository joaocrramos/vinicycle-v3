// Menu do avatar: Meu perfil, Segurança e Preferências (P9, P10).
import {
  confirmarEmail,
  fichaEntrada,
  preferenciasUsuario,
  trocarEmail,
  trocarSenha,
} from '@vinicycle/shared';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { emContexto } from '../db/cliente';
import * as s from '../db/schema';
import { auditar } from '../nucleo/auditoria';
import { enfileirarEmail } from '../nucleo/email';
import { ErroAplicacao, ErroNaoEncontrado, ErroRegra } from '../nucleo/erros';
import {
  emailCodigoTrocaSenha,
  emailConfirmarEmail,
  emailEmailAlterado,
  emailSenhaAlterada,
} from '../nucleo/modelos-email';
import { doUsuario, origemDaRequisicao } from '../nucleo/requisicao';
import {
  conferirSenha,
  gerarCodigo,
  gerarHashSenha,
  gerarToken,
  hashToken,
} from '../nucleo/seguranca';
import { encerrarOutrasSessoes, encerrarSessao } from '../nucleo/sessoes';
import { atualizarFicha, lerFicha, resumoFicha } from './fichas';

const CODIGO_MS = 15 * 60 * 1000;
const CODIGO_TENTATIVAS = 5;
const LINK_EMAIL_MS = 60 * 60 * 1000;

export async function rotasEu(app: FastifyInstance): Promise<void> {
  const { db, config } = app.deps;

  /** O e-mail é a identidade (P8): não pode colidir com outra conta. */
  const emailEmUso = (email: string) =>
    emContexto(db, { autenticacao: true }, async (tx) => {
      const [u] = await tx
        .select({ id: s.usuario.id })
        .from(s.usuario)
        .where(eq(sql`lower(${s.usuario.email})`, email));
      return !!u;
    });

  app.get('/api/eu', async (req) =>
    doUsuario(db, req, async ({ tx, usuarioId }) => {
      const [u] = await tx.select().from(s.usuario).where(eq(s.usuario.id, usuarioId));
      return {
        email: u!.email,
        preferencias: u!.preferencias,
        segundoFatorAtivo: !!u!.totpAtivoEm,
        senhaAlteradaEm: u!.senhaAlteradaEm,
        versao: u!.versao,
        ficha: await lerFicha(tx, u!.fichaId),
      };
    }),
  );

  app.put('/api/eu/ficha', async (req) =>
    doUsuario(db, req, async ({ tx, usuarioId, origem }) => {
      const d = fichaEntrada.parse(req.body);
      const [u] = await tx
        .select({ fichaId: s.usuario.fichaId })
        .from(s.usuario)
        .where(eq(s.usuario.id, usuarioId));
      const antes = await lerFicha(tx, u!.fichaId);
      await atualizarFicha(tx, u!.fichaId, d, usuarioId);
      await auditar(tx, origem, {
        acao: 'editar',
        entidade: 'usuario',
        registroId: usuarioId,
        antes: resumoFicha(antes),
        depois: resumoFicha(d),
      });
      return { ok: true };
    }),
  );

  app.put('/api/eu/preferencias', async (req) =>
    doUsuario(db, req, async ({ tx, usuarioId }) => {
      const d = preferenciasUsuario.parse(req.body);
      await tx
        .update(s.usuario)
        .set({ preferencias: sql`${s.usuario.preferencias} || ${JSON.stringify(d)}::jsonb` })
        .where(eq(s.usuario.id, usuarioId));
      return { ok: true };
    }),
  );

  // Dispositivos conectados (P10).
  app.get('/api/eu/sessoes', async (req) =>
    doUsuario(db, req, async ({ tx, usuarioId, sessao }) => {
      const linhas = await tx
        .select({
          id: s.sessao.id,
          criadaEm: s.sessao.criadaEm,
          ultimoUsoEm: s.sessao.ultimoUsoEm,
          ip: s.sessao.ip,
          navegador: s.sessao.navegador,
        })
        .from(s.sessao)
        .where(
          and(
            eq(s.sessao.usuarioId, usuarioId),
            isNull(s.sessao.encerradaEm),
            gt(s.sessao.expiraEm, sql`now()`),
          ),
        )
        .orderBy(desc(s.sessao.ultimoUsoEm));
      return linhas.map((l) => ({ ...l, atual: l.id === sessao.id }));
    }),
  );

  app.post<{ Params: { id: string } }>('/api/eu/sessoes/:id/encerrar', async (req) =>
    doUsuario(db, req, async ({ tx, usuarioId, origem }) => {
      const id = z.uuid().parse(req.params.id);
      const [alvo] = await tx
        .select({ id: s.sessao.id })
        .from(s.sessao)
        .where(and(eq(s.sessao.id, id), eq(s.sessao.usuarioId, usuarioId)));
      if (!alvo) throw new ErroNaoEncontrado('Sessão não encontrada.');
      await encerrarSessao(tx, id, 'encerrada_pelo_usuario');
      await auditar(tx, origem, { acao: 'encerrar_sessao', entidade: 'sessao', registroId: id });
      return { ok: true };
    }),
  );

  // Troca de senha com sessão aberta: código de 6 dígitos no e-mail (P10).
  app.post(
    '/api/eu/senha/codigo',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req) =>
      doUsuario(db, req, async ({ tx, usuarioId, sessao, origem }) => {
        const codigo = gerarCodigo();
        const id = uuidv7();
        await tx
          .update(s.tokenVerificacao)
          .set({ usadoEm: sql`now()` })
          .where(
            and(
              eq(s.tokenVerificacao.usuarioId, usuarioId),
              eq(s.tokenVerificacao.tipo, 'trocar_senha'),
              isNull(s.tokenVerificacao.usadoEm),
            ),
          );
        await tx.insert(s.tokenVerificacao).values({
          id,
          usuarioId,
          email: sessao.email,
          tipo: 'trocar_senha',
          // O hash leva o identificador do token: códigos iguais nunca colidem.
          tokenHash: hashToken(`${id}:${codigo}`),
          expiraEm: new Date(Date.now() + CODIGO_MS),
        });
        await enfileirarEmail(tx, {
          ...emailCodigoTrocaSenha({ para: sessao.email, codigo }),
          modelo: 'codigo_troca_senha',
          origem: 'usuario',
          origemId: usuarioId,
        });
        await auditar(tx, origem, {
          acao: 'senha_codigo',
          entidade: 'usuario',
          registroId: usuarioId,
        });
        return { ok: true };
      }),
  );

  app.post(
    '/api/eu/senha',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const r = await doUsuario(db, req, async ({ tx, usuarioId, sessao, origem }) => {
        const d = trocarSenha.parse(req.body);
        const [t] = await tx
          .select()
          .from(s.tokenVerificacao)
          .where(
            and(
              eq(s.tokenVerificacao.usuarioId, usuarioId),
              eq(s.tokenVerificacao.tipo, 'trocar_senha'),
              isNull(s.tokenVerificacao.usadoEm),
              gt(s.tokenVerificacao.expiraEm, sql`now()`),
            ),
          )
          .orderBy(desc(s.tokenVerificacao.criadoEm))
          .limit(1);
        if (!t) throw new ErroRegra('Peça um novo código.', 'codigo_vencido');
        const esperado = hashToken(`${t.id}:${d.codigo}`);
        if (!esperado.equals(t.tokenHash)) {
          const tentativas = t.tentativas + 1;
          await tx
            .update(s.tokenVerificacao)
            .set({ tentativas, usadoEm: tentativas >= CODIGO_TENTATIVAS ? sql`now()` : null })
            .where(eq(s.tokenVerificacao.id, t.id));
          return {
            erro:
              tentativas >= CODIGO_TENTATIVAS
                ? 'Código incorreto. Peça um novo código.'
                : 'Código incorreto.',
          };
        }
        if (d.senha.toLowerCase().includes(sessao.email.split('@')[0]!.toLowerCase())) {
          throw new ErroRegra('A senha não pode conter o seu e-mail.', 'senha');
        }
        await tx
          .update(s.tokenVerificacao)
          .set({ usadoEm: sql`now()` })
          .where(eq(s.tokenVerificacao.id, t.id));
        await tx
          .update(s.usuario)
          .set({ senhaHash: await gerarHashSenha(d.senha), senhaAlteradaEm: sql`now()` })
          .where(eq(s.usuario.id, usuarioId));
        await encerrarOutrasSessoes(tx, usuarioId, sessao.id, 'senha_trocada');
        await enfileirarEmail(tx, {
          ...emailSenhaAlterada({ para: sessao.email }),
          modelo: 'senha_alterada',
          origem: 'usuario',
          origemId: usuarioId,
        });
        await auditar(tx, origem, {
          acao: 'senha_trocada',
          entidade: 'usuario',
          registroId: usuarioId,
        });
        return { ok: true };
      });
      if ('erro' in r) throw new ErroAplicacao(400, 'codigo_invalido', r.erro!);
      return r;
    },
  );

  // Troca de e-mail (P10): pede a senha atual e confirma pelo link enviado ao endereço novo.
  app.post(
    '/api/eu/email',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req) => {
      const d = trocarEmail.parse(req.body);
      const r = await doUsuario(db, req, async ({ tx, usuarioId, sessao, origem }) => {
        const [u] = await tx.select().from(s.usuario).where(eq(s.usuario.id, usuarioId));
        if (!(await conferirSenha(u!.senhaHash, d.senha))) return { erro: 'Senha incorreta.' };
        if (d.email === u!.email.toLowerCase())
          throw new ErroRegra('Este já é o seu e-mail.', 'mesmo_email');
        if (await emailEmUso(d.email))
          throw new ErroRegra('Este e-mail já é usado por outra conta.', 'email_em_uso');
        // Um pedido por vez: o anterior deixa de valer.
        await tx
          .update(s.tokenVerificacao)
          .set({ usadoEm: sql`now()` })
          .where(
            and(
              eq(s.tokenVerificacao.usuarioId, usuarioId),
              eq(s.tokenVerificacao.tipo, 'trocar_email'),
              isNull(s.tokenVerificacao.usadoEm),
            ),
          );
        const { token, hash } = gerarToken();
        await tx.insert(s.tokenVerificacao).values({
          usuarioId,
          email: d.email,
          tipo: 'trocar_email',
          tokenHash: hash,
          dados: { anterior: sessao.email },
          expiraEm: new Date(Date.now() + LINK_EMAIL_MS),
        });
        await enfileirarEmail(tx, {
          ...emailConfirmarEmail({
            para: d.email,
            link: `${config.URL_APLICACAO}/confirmar-email?token=${token}`,
          }),
          modelo: 'confirmar_email',
          origem: 'usuario',
          origemId: usuarioId,
        });
        await auditar(tx, origem, {
          acao: 'email_pedido',
          entidade: 'usuario',
          registroId: usuarioId,
          dados: { novo: d.email },
        });
        return { ok: true };
      });
      if ('erro' in r) throw new ErroAplicacao(400, 'senha_incorreta', r.erro!);
      return r;
    },
  );

  // Confirmação pelo link: o link prova o acesso ao endereço novo; não exige sessão aberta.
  app.post(
    '/api/eu/email/confirmar',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const d = confirmarEmail.parse(req.body);
      return emContexto(db, { autenticacao: true }, async (tx) => {
        const [t] = await tx
          .select()
          .from(s.tokenVerificacao)
          .where(
            and(
              eq(s.tokenVerificacao.tokenHash, hashToken(d.token)),
              eq(s.tokenVerificacao.tipo, 'trocar_email'),
              isNull(s.tokenVerificacao.usadoEm),
              gt(s.tokenVerificacao.expiraEm, sql`now()`),
            ),
          );
        if (!t?.usuarioId) {
          throw new ErroRegra(
            'Link inválido ou vencido. Peça a troca de novo em Meu perfil.',
            'token',
          );
        }
        const [u] = await tx
          .select({ email: s.usuario.email })
          .from(s.usuario)
          .where(eq(s.usuario.id, t.usuarioId));
        await tx
          .update(s.tokenVerificacao)
          .set({ usadoEm: sql`now()` })
          .where(eq(s.tokenVerificacao.id, t.id));
        await tx
          .update(s.usuario)
          .set({ email: t.email, versao: sql`${s.usuario.versao} + 1` })
          .where(eq(s.usuario.id, t.usuarioId))
          .catch((e: { cause?: { constraint?: string } }) => {
            // Outra conta passou a usar o endereço depois do pedido.
            if (e.cause?.constraint === 'usuario_email')
              throw new ErroRegra('Este e-mail já é usado por outra conta.', 'email_em_uso');
            throw e;
          });
        await enfileirarEmail(tx, {
          ...emailEmailAlterado({ para: u!.email, novo: t.email }),
          modelo: 'email_alterado',
          origem: 'usuario',
          origemId: t.usuarioId,
        });
        await auditar(
          tx,
          { ...origemDaRequisicao(req), usuarioId: t.usuarioId, empresaId: null },
          {
            acao: 'email_trocado',
            entidade: 'usuario',
            registroId: t.usuarioId,
            antes: { email: u!.email },
            depois: { email: t.email },
          },
        );
        return { email: t.email };
      });
    },
  );
}
