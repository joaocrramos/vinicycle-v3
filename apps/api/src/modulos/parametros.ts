// Configurações › Parâmetros (gestao.md, Configurações): valores simples da empresa. Sem valor
// gravado, vale o padrão do registro em @vinicycle/shared. Os formatos de código ficam na tabela
// própria do modelo (`formato_codigo`, P19); os demais, em `parametro`.
import {
  CHAVES_PARAMETRO,
  type ChaveParametro,
  PARAMETROS,
  TIPOS_CODIGO,
  type TipoCodigo,
  type ValorParametro,
} from '@vinicycle/shared'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../db/schema'
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao'

const F = 'gestao.config.parametros'

/** Valor gravado (ou indefinido, se a empresa nunca alterou). */
async function gravado(ctx: ContextoEmpresa, chave: ChaveParametro): Promise<unknown> {
  if (chave === 'formatos_codigo') {
    const linhas = await ctx.tx
      .select({ tipo: s.formatoCodigo.tipo, mascara: s.formatoCodigo.mascara })
      .from(s.formatoCodigo)
      .where(eq(s.formatoCodigo.empresaId, ctx.empresaId))
    if (!linhas.length) return undefined
    return {
      ...PARAMETROS.formatos_codigo.padrao,
      ...Object.fromEntries(linhas.map((l) => [l.tipo, l.mascara])),
    }
  }
  const [p] = await ctx.tx
    .select({ valor: s.parametro.valor })
    .from(s.parametro)
    .where(
      and(
        eq(s.parametro.empresaId, ctx.empresaId),
        isNull(s.parametro.estabelecimentoId),
        eq(s.parametro.chave, chave),
      ),
    )
  return p?.valor
}

function emVigor<C extends ChaveParametro>(chave: C, valor: unknown) {
  const r = PARAMETROS[chave].esquema.safeParse(valor)
  return {
    valor: (r.success ? r.data : PARAMETROS[chave].padrao) as ValorParametro<C>,
    padrao: !r.success,
  }
}

/** Valor em vigor; um valor gravado que deixou de ser válido (registro mudou) cai no padrão. */
export async function lerParametro<C extends ChaveParametro>(
  ctx: ContextoEmpresa,
  chave: C,
): Promise<ValorParametro<C>> {
  return emVigor(chave, await gravado(ctx, chave)).valor
}

async function gravar(ctx: ContextoEmpresa, chave: ChaveParametro, valor: object): Promise<void> {
  if (chave === 'formatos_codigo') {
    for (const tipo of Object.keys(TIPOS_CODIGO) as TipoCodigo[]) {
      const mascara = (valor as Record<TipoCodigo, string>)[tipo]
      await ctx.tx
        .insert(s.formatoCodigo)
        .values({
          empresaId: ctx.empresaId,
          tipo,
          mascara,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .onConflictDoUpdate({
          target: [s.formatoCodigo.empresaId, s.formatoCodigo.tipo],
          set: { mascara, atualizadoEm: sql`now()`, atualizadoPor: ctx.usuarioId },
        })
    }
    return
  }
  const alterado = await ctx.tx
    .update(s.parametro)
    .set({ valor, atualizadoEm: sql`now()`, atualizadoPor: ctx.usuarioId })
    .where(
      and(
        eq(s.parametro.empresaId, ctx.empresaId),
        isNull(s.parametro.estabelecimentoId),
        eq(s.parametro.chave, chave),
      ),
    )
    .returning({ id: s.parametro.id })
  if (!alterado.length) {
    await ctx.tx.insert(s.parametro).values({
      empresaId: ctx.empresaId,
      chave,
      valor,
      criadoPor: ctx.usuarioId,
      atualizadoPor: ctx.usuarioId,
    })
  }
}

export async function rotasParametros(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  app.get('/api/parametros', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const todos: Record<string, unknown> = {}
      for (const chave of CHAVES_PARAMETRO) todos[chave] = emVigor(chave, await gravado(ctx, chave))
      return todos
    }),
  )

  app.put<{ Params: { chave: string } }>('/api/parametros/:chave', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const chave = z.enum(CHAVES_PARAMETRO).parse(req.params.chave)
      const valor = PARAMETROS[chave].esquema.parse(req.body) as Record<string, unknown>
      if (chave === 'avisos_validade') (valor.dias as number[]).sort((a, b) => b - a)
      const antes = emVigor(chave, await gravado(ctx, chave)).valor
      await gravar(ctx, chave, valor)
      await ctx.auditar({
        acao: 'editar',
        entidade: 'parametro',
        registroId: null,
        antes: { [chave]: antes },
        depois: { [chave]: valor },
      })
      return { ok: true }
    }),
  )
}
