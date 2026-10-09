// Personificação (P28): um membro da equipe com a permissão assume a visão de um usuário do
// cliente, sem conhecer nem alterar a senha dele, por no máximo 60 minutos e com motivo (ou o
// número do chamado). O Master da empresa é avisado por e-mail; a empresa vê na auditoria.
import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as s from '../db/schema';
import { enfileirarEmail } from '../nucleo/email';
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros';
import { emailAvisoPersonificacao } from '../nucleo/modelos-email';
import { naEmpresa, naPlataforma } from '../nucleo/requisicao';

export const DURACAO_PERSONIFICACAO_MIN = 60;

const iniciar = z.object({
  empresaId: z.uuid(),
  usuarioId: z.uuid(),
  motivo: z.string().trim().min(5, 'Informe o motivo').max(500),
  chamadoId: z.uuid().nullable().optional(),
});

const colunas = {
  id: s.personificacao.id,
  membro: s.personificacao.membroNome,
  usuario: s.personificacao.usuarioNome,
  motivo: s.personificacao.motivo,
  chamadoId: s.personificacao.chamadoId,
  inicio: s.personificacao.inicio,
  fimPrevisto: s.personificacao.fimPrevisto,
  fim: s.personificacao.fim,
  formaEncerramento: s.personificacao.formaEncerramento,
};

export async function rotasPersonificacao(app: FastifyInstance): Promise<void> {
  const { db } = app.deps;

  app.post('/api/plataforma/personificacoes', async (req) =>
    naPlataforma(
      db,
      req,
      ['plataforma.personificacao', 'criar'],
      async ({ tx, usuarioId, sessao, auditar }) => {
        const d = iniciar.parse(req.body);
        if (d.usuarioId === usuarioId)
          throw new ErroRegra('Não é possível personificar a si mesmo.', 'proprio');
        const [alvo] = await tx
          .select({ nome: s.ficha.nome, ativo: s.usuario.ativo, eMaster: s.vinculo.eMaster })
          .from(s.vinculo)
          .innerJoin(s.usuario, eq(s.usuario.id, s.vinculo.usuarioId))
          .innerJoin(s.ficha, eq(s.ficha.id, s.usuario.fichaId))
          .where(
            and(
              eq(s.vinculo.empresaId, d.empresaId),
              eq(s.vinculo.usuarioId, d.usuarioId),
              eq(s.vinculo.ativo, true),
            ),
          );
        if (!alvo?.ativo) throw new ErroNaoEncontrado('Usuário sem acesso ativo a esta empresa.');
        if (d.chamadoId) {
          const [c] = await tx
            .select({ id: s.chamado.id })
            .from(s.chamado)
            .where(and(eq(s.chamado.id, d.chamadoId), eq(s.chamado.empresaId, d.empresaId)));
          if (!c) throw new ErroRegra('O chamado não é desta empresa.', 'chamado');
        }
        const [membro] = await tx
          .select({ nome: s.ficha.nome })
          .from(s.usuario)
          .innerJoin(s.ficha, eq(s.ficha.id, s.usuario.fichaId))
          .where(eq(s.usuario.id, usuarioId));
        const [p] = await tx
          .insert(s.personificacao)
          .values({
            membroId: usuarioId,
            membroNome: membro!.nome,
            usuarioId: d.usuarioId,
            usuarioNome: alvo.nome,
            empresaId: d.empresaId,
            motivo: d.motivo,
            chamadoId: d.chamadoId ?? null,
            fimPrevisto: sql`now() + ${`${DURACAO_PERSONIFICACAO_MIN} minutes`}::interval`,
          })
          .returning({ id: s.personificacao.id });
        await tx
          .update(s.sessao)
          .set({
            personificacaoId: p!.id,
            contexto: 'empresa',
            empresaId: d.empresaId,
            estabelecimentoId: null,
          })
          .where(eq(s.sessao.id, sessao.id));
        await auditar({
          acao: 'personificar',
          entidade: 'personificacao',
          registroId: p!.id,
          empresaId: d.empresaId,
          dados: { usuarioId: d.usuarioId, usuario: alvo.nome, chamadoId: d.chamadoId ?? null },
          motivo: d.motivo,
        });
        // Aviso aos Masters (sem aprovação prévia).
        const masters = await tx
          .select({ email: s.usuario.email })
          .from(s.vinculo)
          .innerJoin(s.usuario, eq(s.usuario.id, s.vinculo.usuarioId))
          .where(
            and(
              eq(s.vinculo.empresaId, d.empresaId),
              eq(s.vinculo.eMaster, true),
              eq(s.vinculo.ativo, true),
            ),
          );
        const [e] = await tx
          .select({ nome: s.ficha.nome, fantasia: s.ficha.nomeFantasia })
          .from(s.empresa)
          .innerJoin(s.ficha, eq(s.ficha.id, s.empresa.fichaId))
          .where(eq(s.empresa.id, d.empresaId));
        for (const m of masters) {
          await enfileirarEmail(tx, {
            ...emailAvisoPersonificacao({
              para: m.email,
              empresa: e?.fantasia || e?.nome || '',
              membro: membro!.nome,
              usuario: alvo.nome,
              motivo: d.motivo,
            }),
            modelo: 'personificacao_aviso',
            origem: 'personificacao',
            origemId: p!.id,
            empresaId: d.empresaId,
          });
        }
        return { id: p!.id };
      },
    ),
  );

  /** Personificações de um cliente (ficha do cliente). */
  app.get<{ Params: { id: string } }>('/api/plataforma/empresas/:id/personificacoes', async (req) =>
    naPlataforma(db, req, ['plataforma.clientes', 'visualizar'], async ({ tx }) =>
      tx
        .select(colunas)
        .from(s.personificacao)
        .where(eq(s.personificacao.empresaId, z.uuid().parse(req.params.id)))
        .orderBy(desc(s.personificacao.inicio))
        .limit(50),
    ),
  );

  /** A empresa vê quando e por quem foi personificada (P28, transparência). */
  app.get('/api/personificacoes', async (req) =>
    naEmpresa(db, req, ['gestao.config.auditoria', 'visualizar'], async (ctx) =>
      ctx.tx
        .select(colunas)
        .from(s.personificacao)
        .where(eq(s.personificacao.empresaId, ctx.empresaId))
        .orderBy(desc(s.personificacao.inicio))
        .limit(100),
    ),
  );
}
