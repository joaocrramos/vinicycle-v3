// Numeração (P19; 03-modelo-de-dados.md, 1.8): sequencial por estabelecimento, por tipo e por
// período, sem buracos nem repetição. O número é tomado só na confirmação, dentro da transação:
// se ela desfizer, o número volta junto, e nunca há buraco.
import { montarCodigo, type TipoCodigo } from '@vinicycle/shared'
import { sql } from 'drizzle-orm'
import { lerParametro } from '../modulos/parametros'
import type { ContextoEmpresa } from './requisicao'

/** Ano de uma data no fuso do estabelecimento (a virada do ano é a do local). */
export function anoNoFuso(data: Date, fuso: string): number {
  return Number(new Intl.DateTimeFormat('en-CA', { year: 'numeric', timeZone: fuso }).format(data))
}

/**
 * Toma o próximo número da série e monta o código. A linha da sequência fica travada até o fim da
 * transação, o que serializa duas confirmações simultâneas do mesmo tipo.
 */
export async function proximoCodigo(
  ctx: ContextoEmpresa,
  d: {
    estabelecimentoId: string
    tipo: TipoCodigo
    /** Ano da série: da data de execução, ou a safra no lote de produção. */
    ano: number
    ciclo?: string | null
  },
): Promise<string> {
  const periodo = String(d.ano)
  const r = await ctx.tx.execute<{ ultimo: number }>(sql`
    insert into sequencia (empresa_id, estabelecimento_id, tipo, periodo, ultimo)
    values (${ctx.empresaId}, ${d.estabelecimentoId}, ${d.tipo}, ${periodo}, 1)
    on conflict on constraint sequencia_serie
    do update set ultimo = sequencia.ultimo + 1
    returning ultimo`)
  const numero = r.rows[0]!.ultimo
  const formatos = await lerParametro(ctx, 'formatos_codigo')
  return montarCodigo(formatos[d.tipo], { ano: d.ano, numero, ciclo: d.ciclo })
}
