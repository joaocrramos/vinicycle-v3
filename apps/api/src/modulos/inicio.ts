// Início (ambiente-cliente.md, Primeiro acesso do Master): o que já foi cadastrado, para marcar os
// passos da implantação (locais, recipientes, produtos, insumos, usuários, carga inicial).
import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { naEmpresa } from '../nucleo/requisicao'

export async function rotasInicio(app: FastifyInstance): Promise<void> {
  const { db } = app.deps
  app.get('/api/inicio', async (req) =>
    naEmpresa(db, req, null, async (ctx) => {
      const e = ctx.empresaId
      const [r] = (
        await ctx.tx.execute<Record<string, number | boolean>>(sql`
          select
            (select count(*)::int from local where empresa_id = ${e} and ativo) as locais,
            (select count(*)::int from recipiente where empresa_id = ${e} and situacao <> 'inativo') as recipientes,
            (select count(*)::int from produto where empresa_id = ${e} and ativo) as produtos,
            (select count(*)::int from item_estoque where empresa_id = ${e} and ativo and tipo <> 'produto_acabado') as itens,
            (select count(*)::int from vinculo where empresa_id = ${e} and ativo) as usuarios,
            (select count(*)::int from importacao where empresa_id = ${e} and situacao = 'aplicada') as cargas,
            (select count(*)::int from projeto where empresa_id = ${e}) as projetos,
            exists (select 1 from empresa em join ficha f on f.id = em.ficha_id
              where em.id = ${e} and f.documento is not null) as "empresaCompleta"`)
      ).rows
      return r
    }),
  )
}
