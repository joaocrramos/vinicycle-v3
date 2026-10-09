// EnoTrace › Relatórios da cantina: evaporação por barrica e período (cantina.md, Atesto em lote).
import { type FastifyInstance } from 'fastify'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { naEmpresa } from '../../nucleo/requisicao'

const F = 'enotrace.relatorios'
const data = z.iso.date()

export async function rotasRelatorios(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  /**
   * Evaporação de cada recipiente no período (pela data da execução, no fuso do estabelecimento):
   * litros, atestos e o percentual sobre a capacidade. Operações estornadas não contam.
   */
  app.get('/api/relatorios/evaporacao', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const q = z.object({ de: data, ate: data }).parse(req.query)
      const estabs = ctx.estabelecimentoId
        ? [ctx.estabelecimentoId]
        : await ctx.estabelecimentosPermitidos()
      if (!estabs.length) return []
      const r = await ctx.tx.execute<{
        recipienteId: string
        recipiente: string
        tipo: string
        capacidade: string
        evaporacao: string
        atestos: number
      }>(sql`
        select r.id as "recipienteId", r.codigo as recipiente, t.nome as tipo,
          r.capacidade_litros as capacidade, -sum(m.litros) as evaporacao,
          count(distinct m.operacao_id)::int as atestos
        from movimento_volume m
          join operacao o on o.id = m.operacao_id
          join recipiente r on r.id = m.recipiente_id
          join tipo_recipiente t on t.id = r.tipo_recipiente_id
          join estabelecimento e on e.id = m.estabelecimento_id
        where m.empresa_id = ${ctx.empresaId}
          and m.estabelecimento_id in (${sql.join(
            estabs.map((x) => sql`${x}`),
            sql`, `,
          )})
          and m.tipo = 'evaporacao' and o.situacao = 'confirmada'
          and (m.executado_em at time zone e.fuso)::date between ${q.de} and ${q.ate}
        group by r.id, r.codigo, t.nome, r.capacidade_litros
        order by r.codigo`)
      return r.rows.map((x) => ({
        ...x,
        percentual: Number(((Number(x.evaporacao) / Number(x.capacidade)) * 100).toFixed(2)),
      }))
    }),
  )
}
