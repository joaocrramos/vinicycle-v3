// EnoTrace › Painel da cantina (cantina.md, Recipientes: painel) e a operação de higienização e
// manutenção. O painel mostra a ocupação de cada recipiente: lote, volume, % da capacidade, etapa,
// dias no recipiente, situação, composição, fermentações em andamento e a higienização vencida
// pela periodicidade do tipo (Parâmetros técnicos). Tudo é consulta sobre o livro (seção 4).
import { higienizacao as esquemaHigienizacao } from '@vinicycle/shared'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import * as s from '../../db/schema'
import { ErroRegra } from '../../nucleo/erros'
import { type ContextoEmpresa, naEmpresa } from '../../nucleo/requisicao'
import { conferirPessoas, dataExecucao, type Montada, saldosNaData, saldosPorLote } from './apoio'
import { partesAtuais } from './motor'

/**
 * Higienização ou manutenção de um ou mais recipientes: operação sem volume que os devolve a
 * "ativo" (motor.ts, higienizar). Higienizar um recipiente com vinho é impossível: bloqueia.
 */
export async function planoHigienizacao(ctx: ContextoEmpresa, corpo: unknown): Promise<Montada> {
  const estab = ctx.exigirEstabelecimento()
  const d = esquemaHigienizacao.parse(corpo)
  const executadoEm = dataExecucao(d.executadoEm)
  await conferirPessoas(ctx, [d.responsavelId, d.executadoPorId])
  const recipientes = await ctx.tx
    .select({
      id: s.recipiente.id,
      codigo: s.recipiente.codigo,
      estab: s.recipiente.estabelecimentoId,
    })
    .from(s.recipiente)
    .where(and(inArray(s.recipiente.id, d.recipientes), eq(s.recipiente.empresaId, ctx.empresaId)))
  if (recipientes.length !== d.recipientes.length || recipientes.some((r) => r.estab !== estab))
    throw new ErroRegra('Recipiente inválido.', 'recipiente')
  if (d.tipoHigienizacao === 'higienizacao') {
    const cheios = [
      ...(await saldosPorLote(ctx, d.recipientes)),
      ...(await saldosNaData(ctx, d.recipientes, executadoEm)),
    ]
    const comVinho = recipientes.filter((r) => cheios.some((x) => x.recipienteId === r.id))
    if (comVinho.length)
      throw new ErroRegra(
        `${comVinho.map((r) => r.codigo).join(', ')} com vinho: a higienização é feita com o recipiente vazio.`,
        'com_vinho',
      )
  }
  const ordem = new Map(d.recipientes.map((id, n) => [id, n + 1]))
  return {
    cientes: d.cientes,
    rascunhoId: d.rascunhoId ?? null,
    plano: {
      tipo: 'higienizacao',
      estabelecimentoId: estab,
      executadoEm,
      projetoId: null,
      responsavelId: d.responsavelId ?? null,
      executadoPorId: d.executadoPorId ?? null,
      observacao: d.observacao ?? null,
      dados: {
        tipoHigienizacao: d.tipoHigienizacao,
        produto: d.produto ?? null,
        dose: d.dose ?? null,
      },
      linhas: recipientes.map((r) => ({
        ordem: ordem.get(r.id)!,
        papel: 'ajuste' as const,
        recipienteId: r.id,
      })),
      lancamentos: [],
      higienizacao: {
        tipo: d.tipoHigienizacao,
        recipientes: d.recipientes,
        produto: d.produto ?? null,
        dose: d.dose ?? null,
      },
    },
  }
}

type LinhaPainel = {
  id: string
  codigo: string
  tipo: string
  tipoRecipienteId: string
  eBarrica: boolean
  local: string
  localId: string
  capacidade: string
  possuiFrio: boolean
  situacao: string
  situacaoDesde: string
  motivoSituacao: string | null
  volume: string
  loteId: string | null
  desde: string | null
  ultimaHigienizacao: string | null
  intervaloDias: number | null
}

export async function rotasPainel(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  app.get('/api/painel/recipientes', async (req) =>
    naEmpresa(db, req, ['enotrace.painel', 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      // "Desde": a última vez que o recipiente passou de vazio a cheio, pela ordem da execução.
      const r = await ctx.tx.execute<LinhaPainel>(sql`
        with corrente as (
          select m.recipiente_id, m.executado_em, m.litros,
            sum(m.litros) over (partition by m.recipiente_id order by m.executado_em, m.lancado_em, m.id) as saldo
          from movimento_volume m where m.estabelecimento_id = ${estab}
        ),
        entrada as (
          select recipiente_id, max(executado_em) as desde from corrente
          where saldo > 0 and saldo - litros <= 0 group by recipiente_id
        ),
        saldo as (
          select recipiente_id, lote_id, sum(litros) as litros from movimento_volume
          where estabelecimento_id = ${estab} group by recipiente_id, lote_id having sum(litros) <> 0
        ),
        higienizado as (
          select h.recipiente_id, max(o.executado_em) as ultima from operacao_higienizacao h
            join operacao o on o.id = h.operacao_id and o.situacao = 'confirmada'
          where h.tipo = 'higienizacao' group by h.recipiente_id
        )
        select r.id, r.codigo, tr.nome as tipo, r.tipo_recipiente_id as "tipoRecipienteId",
          tr.e_barrica as "eBarrica", l.nome as local, r.local_id as "localId",
          r.capacidade_litros as capacidade, r.possui_frio as "possuiFrio", r.situacao,
          r.situacao_desde as "situacaoDesde", r.motivo_situacao as "motivoSituacao",
          coalesce((select sum(x.litros) from saldo x where x.recipiente_id = r.id), 0) as volume,
          (select x.lote_id from saldo x where x.recipiente_id = r.id and x.litros > 0 limit 1) as "loteId",
          e.desde, h.ultima as "ultimaHigienizacao", p.intervalo_dias as "intervaloDias"
        from recipiente r
          join tipo_recipiente tr on tr.id = r.tipo_recipiente_id
          join local l on l.id = r.local_id
          left join entrada e on e.recipiente_id = r.id
          left join higienizado h on h.recipiente_id = r.id
          left join periodicidade_higienizacao p on p.empresa_id = r.empresa_id and p.tipo_recipiente_id = r.tipo_recipiente_id
        where r.empresa_id = ${ctx.empresaId} and r.estabelecimento_id = ${estab}
          and (r.situacao <> 'inativo' or exists (select 1 from saldo x where x.recipiente_id = r.id))
        order by l.nome, regexp_replace(lower(r.codigo), '\\d+', lpad(substring(r.codigo from '\\d+'), 10, '0'))`)
      const linhas = r.rows
      const cheios = linhas.filter((x) => x.loteId)
      const loteIds = [...new Set(cheios.map((x) => x.loteId!))]
      const lotes = loteIds.length
        ? await ctx.tx
            .select({
              id: s.lote.id,
              codigo: s.lote.codigo,
              etapa: s.lote.etapa,
              projetoId: s.lote.projetoId,
              projeto: sql<string>`(select p.codigo || ' · ' || p.nome from projeto p where p.id = lote.projeto_id)`,
            })
            .from(s.lote)
            .where(inArray(s.lote.id, loteIds))
        : []
      const partes = await partesAtuais(
        ctx,
        cheios.map((x) => x.id),
      )
      const fermentacoes = loteIds.length
        ? (
            await ctx.tx.execute<{
              id: string
              loteId: string
              tipo: string
              inicioEm: string
            }>(sql`
              select f.id, f.lote_id as "loteId", f.tipo, oi.executado_em as "inicioEm"
              from fermentacao f
                join operacao oi on oi.id = f.operacao_inicio_id and oi.situacao = 'confirmada'
                left join operacao ofim on ofim.id = f.operacao_fim_id and ofim.situacao = 'confirmada'
              where f.lote_id in (${sql.join(
                loteIds.map((x) => sql`${x}`),
                sql`, `,
              )}) and ofim.id is null`)
          ).rows
        : []
      const agora = Date.now()
      return linhas.map((x) => {
        const lote = lotes.find((l) => l.id === x.loteId) ?? null
        const parte = partes.get(x.id)
        // Vencida: recipiente vazio cuja última higienização passou do intervalo do tipo.
        const vencida =
          !!x.intervaloDias &&
          !x.loteId &&
          !!x.ultimaHigienizacao &&
          agora - new Date(x.ultimaHigienizacao).getTime() > x.intervaloDias * 86400_000
        return {
          id: x.id,
          codigo: x.codigo,
          tipo: x.tipo,
          tipoRecipienteId: x.tipoRecipienteId,
          eBarrica: x.eBarrica,
          local: x.local,
          localId: x.localId,
          capacidade: x.capacidade,
          possuiFrio: x.possuiFrio,
          situacao: x.situacao,
          situacaoDesde: x.situacaoDesde,
          motivoSituacao: x.motivoSituacao,
          volume: Number(x.volume).toFixed(2),
          lote,
          desde: x.loteId ? x.desde : null,
          composicao: x.loteId && parte ? parte.composicao : null,
          fermentacoes: fermentacoes
            .filter((f) => f.loteId === x.loteId)
            .map((f) => ({ id: f.id, tipo: f.tipo, inicioEm: f.inicioEm })),
          ultimaHigienizacao: x.ultimaHigienizacao,
          intervaloDias: x.intervaloDias,
          higienizacaoVencida: vencida,
        }
      })
    }),
  )
}
