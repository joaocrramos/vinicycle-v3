// Inativar e reativar (P26), com motivo e auditoria (P14): o mesmo par de rotas em cada cadastro.
import { motivo } from '@vinicycle/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ErroNaoEncontrado } from './erros'
import { naEmpresa } from './requisicao'

type Tabela = PgTable & { id: AnyPgColumn; empresaId: AnyPgColumn }

export function rotasInativacao(
  app: FastifyInstance,
  opcoes: { url: string; tabela: Tabela; entidade: string; funcionalidade: string },
): void {
  const { db } = app.deps
  for (const acao of ['inativar', 'reativar'] as const) {
    app.post<{ Params: { id: string } }>(`${opcoes.url}/:id/${acao}`, async (req) =>
      naEmpresa(db, req, [opcoes.funcionalidade, 'inativar'], async (ctx) => {
        const id = z.uuid().parse(req.params.id)
        const m = acao === 'inativar' ? motivo.parse(req.body).motivo : null
        const alterados = await ctx.tx
          .update(opcoes.tabela)
          .set(
            (acao === 'inativar'
              ? {
                  ativo: false,
                  inativadoEm: sql`now()`,
                  inativadoPor: ctx.usuarioId,
                  motivoInativacao: m,
                }
              : {
                  ativo: true,
                  inativadoEm: null,
                  inativadoPor: null,
                  motivoInativacao: null,
                }) as never,
          )
          .where(and(eq(opcoes.tabela.id, id), eq(opcoes.tabela.empresaId, ctx.empresaId)))
          .returning({ id: opcoes.tabela.id })
        if (!alterados.length) throw new ErroNaoEncontrado()
        await ctx.auditar({ acao, entidade: opcoes.entidade, registroId: id, motivo: m })
        return { ok: true }
      }),
    )
  }
}
