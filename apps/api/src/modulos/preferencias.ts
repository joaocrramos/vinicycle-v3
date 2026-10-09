// Última ordenação, filtros e tamanho de página, por usuário e por tabela (P4).
import { preferenciaListagem } from '@vinicycle/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as s from '../db/schema';
import { doUsuario } from '../nucleo/requisicao';

const tabela = z.string().regex(/^[a-z0-9_.-]{1,60}$/);

export async function rotasPreferencias(app: FastifyInstance): Promise<void> {
  const { db } = app.deps;

  app.get<{ Params: { tabela: string } }>('/api/preferencias-listagem/:tabela', async (req) =>
    doUsuario(db, req, async ({ tx, usuarioId, sessao }) => {
      const t = tabela.parse(req.params.tabela);
      const [p] = await tx
        .select()
        .from(s.preferenciaListagem)
        .where(
          and(
            eq(s.preferenciaListagem.usuarioId, usuarioId),
            eq(s.preferenciaListagem.tabela, t),
            sessao.empresaId
              ? eq(s.preferenciaListagem.empresaId, sessao.empresaId)
              : isNull(s.preferenciaListagem.empresaId),
          ),
        );
      return p
        ? { ordem: p.ordem, direcao: p.direcao, tamanho: p.tamanho, filtros: p.filtros }
        : null;
    }),
  );

  app.put<{ Params: { tabela: string } }>('/api/preferencias-listagem/:tabela', async (req) =>
    doUsuario(db, req, async ({ tx, usuarioId, sessao }) => {
      const t = tabela.parse(req.params.tabela);
      const d = preferenciaListagem.parse(req.body);
      const valores = {
        ordem: d.ordem,
        direcao: d.direcao,
        tamanho: d.tamanho,
        filtros: d.filtros,
        atualizadoEm: sql`now()`,
      };
      await tx
        .insert(s.preferenciaListagem)
        .values({ usuarioId, empresaId: sessao.empresaId, tabela: t, ...valores })
        .onConflictDoUpdate({
          target: [
            s.preferenciaListagem.usuarioId,
            s.preferenciaListagem.empresaId,
            s.preferenciaListagem.tabela,
          ],
          set: valores,
        });
      return { ok: true };
    }),
  );
}
