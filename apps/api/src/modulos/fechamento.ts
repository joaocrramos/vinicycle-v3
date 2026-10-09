// EnoTrace › Fechamento do mês (cantina.md, Declarações e fechamento; 04, roteiro do ciclo 6): lista
// de conferência (o mês não fecha com pendência de estoque negativo, P29; o resto pede "ciente"),
// relatório do mês (granel em litros e produto acabado em garrafas e litros: estoque inicial,
// entradas, saídas e final, base da declaração mensal, Lei 7.678/1988, art. 31), fechar e reabrir.
import { TIPOS_MOVIMENTO, TIPOS_MOVIMENTO_ESTOQUE } from '@vinicycle/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../db/schema'
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros'
import { exigeAprovacao, pedirAprovacao } from '../nucleo/aprovacoes'
import { type Aviso, exigirCientes } from '../nucleo/regras'
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao'

const F = 'enotrace.declaracoes'

/** Grupos dos movimentos do livro de volumes no relatório. */
const GRUPO_VOLUME: Record<string, 'entradas' | 'saidas' | 'internos' | 'ajustes'> = {
  entrada_mosto: 'entradas',
  entrada_granel: 'entradas',
  abertura_saldo: 'entradas',
  saida_granel: 'saidas',
  engarrafamento: 'saidas',
  tiragem: 'saidas',
  perda: 'saidas',
  evaporacao: 'saidas',
  // Prensagem: a da uva entra vinho novo; a da massa se anula (saída e entrada) e sobra o ajuste.
  saida_prensagem: 'entradas',
  entrada_prensagem: 'entradas',
  ajuste_prensagem: 'entradas',
  saida_trasfega: 'internos',
  entrada_trasfega: 'internos',
  saida_atesto: 'internos',
  entrada_atesto: 'internos',
  saida_corte: 'internos',
  entrada_corte: 'internos',
  saida_titularidade: 'internos',
  entrada_titularidade: 'internos',
  ajuste_inventario: 'ajustes',
  estorno: 'ajustes',
}
const GRUPO_ESTOQUE: Record<string, 'entradas' | 'saidas' | 'internos' | 'ajustes'> = {
  producao: 'entradas',
  entrada: 'entradas',
  entrada_nfe: 'entradas',
  carga_inicial: 'entradas',
  devolucao: 'entradas',
  saida: 'saidas',
  consumo_operacao: 'saidas',
  consumo_envase: 'saidas',
  transferencia: 'internos',
  titularidade: 'internos',
  ajuste_inventario: 'ajustes',
  descarte: 'ajustes',
  estorno: 'ajustes',
}

export async function limites(ctx: ContextoEmpresa, estab: string, ano: number, mes: number) {
  const [r] = (
    await ctx.tx.execute<{ inicio: string; fim: string; terminou: boolean }>(sql`
      select make_timestamptz(${ano}, ${mes}, 1, 0, 0, 0, e.fuso)::text as inicio,
        (make_timestamptz(${ano}, ${mes}, 1, 0, 0, 0, e.fuso) + interval '1 month')::text as fim,
        (make_timestamptz(${ano}, ${mes}, 1, 0, 0, 0, e.fuso) + interval '1 month') <= now() as terminou
      from estabelecimento e where e.id = ${estab}`)
  ).rows
  return r!
}

/** Lista de conferência do mês (cantina.md, Fechamento do mês). */
async function conferencia(ctx: ContextoEmpresa, estab: string, inicio: string, fim: string) {
  const conta = async (q: ReturnType<typeof sql>) =>
    (await ctx.tx.execute<{ n: number; itens: string[] | null }>(q)).rows[0]!
  const rascunhos = await conta(sql`
    select count(*)::int as n, (array_agg(tipo order by executado_em))[1:10] as itens from operacao
    where estabelecimento_id = ${estab} and situacao = 'rascunho' and executado_em >= ${inicio}::timestamptz and executado_em < ${fim}::timestamptz`)
  const romaneios = await conta(sql`
    select count(*)::int as n, null as itens from romaneio
    where estabelecimento_id = ${estab} and situacao = 'rascunho' and chegada_em >= ${inicio}::timestamptz and chegada_em < ${fim}::timestamptz`)
  const inventarios = await conta(sql`
    select count(*)::int as n, null as itens from inventario_cantina
    where estabelecimento_id = ${estab} and situacao = 'rascunho' and contado_em >= ${inicio}::timestamptz and contado_em < ${fim}::timestamptz`)
  const notas = await conta(sql`
    select count(*)::int as n, (array_agg(numero order by emissao))[1:10] as itens from nfe
    where estabelecimento_id = ${estab} and situacao = 'em_conferencia' and tipo_uso in ('compra', 'venda')
      and emissao >= ${inicio}::timestamptz and emissao < ${fim}::timestamptz`)
  const semLote = await conta(sql`
    select count(distinct sa.id)::int as n, null as itens from saida sa
      join saida_item si on si.saida_id = sa.id join saida_baixa b on b.saida_item_id = si.id
    where sa.estabelecimento_id = ${estab} and sa.situacao = 'lancada' and b.lote_item_id is null
      and sa.executado_em >= ${inicio}::timestamptz and sa.executado_em < ${fim}::timestamptz`)
  const pendencias = await conta(sql`
    select count(*)::int as n, (array_agg(i.nome))[1:10] as itens from pendencia_estoque p join item_estoque i on i.id = p.item_id
    where p.estabelecimento_id = ${estab} and p.situacao = 'aberta' and p.executado_em < ${fim}::timestamptz`)
  const laudos = await conta(sql`
    select count(*)::int as n, (array_agg(codigo))[1:10] as itens from amostra
    where estabelecimento_id = ${estab} and situacao in ('coletada', 'enviada') and prazo < (${fim}::timestamptz)::date`)
  const alertas = await conta(sql`
    select count(*)::int as n, null as itens from alerta
    where estabelecimento_id = ${estab} and situacao = 'aberto' and gravidade = 'critico'`)
  const itens = [
    {
      codigo: 'rascunhos',
      nome: 'Operações em rascunho no mês',
      ...rascunhos,
      link: '/enotrace/operacoes',
    },
    {
      codigo: 'romaneios',
      nome: 'Romaneios em rascunho no mês',
      ...romaneios,
      link: '/enotrace/recepcao',
    },
    {
      codigo: 'inventarios',
      nome: 'Inventários em rascunho no mês',
      ...inventarios,
      link: '/enotrace/inventarios',
    },
    {
      codigo: 'notas',
      nome: 'Notas em conferência emitidas no mês',
      ...notas,
      link: '/enotrace/estoque/notas',
    },
    {
      codigo: 'saidas_sem_lote',
      nome: 'Saídas sem lote no mês',
      ...semLote,
      link: '/enotrace/saidas',
    },
    {
      codigo: 'laudos',
      nome: 'Laudos atrasados',
      ...laudos,
      link: '/enotrace/laboratorio/pedidos',
    },
    { codigo: 'alertas', nome: 'Alertas críticos abertos', ...alertas, link: '/alertas' },
    {
      codigo: 'pendencias',
      nome: 'Pendências de estoque negativo até o fim do mês',
      ...pendencias,
      link: '/enotrace/estoque',
      impede: true,
    },
  ]
  return itens.map((i) => ({ ...i, impede: 'impede' in i && i.impede, itens: i.itens ?? [] }))
}

/**
 * Relatório do mês: granel em litros e produto acabado por produto e formato. O estorno conta no
 * tipo do movimento que ele desfaz (um desengace estornado não aparece como entrada).
 */
export async function relatorio(ctx: ContextoEmpresa, estab: string, inicio: string, fim: string) {
  const vol = await ctx.tx.execute<{ tipo: string; litros: string }>(sql`
    select coalesce(o.tipo, m.tipo) as tipo, sum(m.litros)::text as litros from movimento_volume m
      left join movimento_volume o on o.id = m.estorno_de_id
    where m.estabelecimento_id = ${estab} and m.executado_em >= ${inicio}::timestamptz and m.executado_em < ${fim}::timestamptz
    group by 1 order by 1`)
  const [ini] = (
    await ctx.tx.execute<{ litros: string }>(sql`
      select coalesce(sum(litros), 0)::text as litros from movimento_volume
      where estabelecimento_id = ${estab} and executado_em < ${inicio}::timestamptz`)
  ).rows
  const somaGrupo = (g: string) =>
    vol.rows
      .filter((r) => (GRUPO_VOLUME[r.tipo] ?? 'ajustes') === g)
      .reduce((t, r) => t + Number(r.litros), 0)
  const inicial = Number(ini!.litros)
  const granel = {
    inicial: inicial.toFixed(2),
    entradas: somaGrupo('entradas').toFixed(2),
    saidas: somaGrupo('saidas').toFixed(2),
    internos: somaGrupo('internos').toFixed(2),
    ajustes: somaGrupo('ajustes').toFixed(2),
    final: (inicial + vol.rows.reduce((t, r) => t + Number(r.litros), 0)).toFixed(2),
    porTipo: vol.rows.map((r) => ({
      tipo: r.tipo,
      nome: TIPOS_MOVIMENTO[r.tipo as keyof typeof TIPOS_MOVIMENTO] ?? r.tipo,
      grupo: GRUPO_VOLUME[r.tipo] ?? 'ajustes',
      litros: Number(r.litros).toFixed(2),
    })),
  }
  const prod = await ctx.tx.execute<{
    item_id: string
    item: string
    produto: string | null
    volume_ml: number | null
    tipo: string | null
    inicial: string
    quantidade: string | null
  }>(sql`
    select i.id as item_id, i.nome as item, p.nome as produto, f.volume_ml,
      coalesce(o.tipo, m.tipo) as tipo, coalesce((select sum(x.quantidade) from movimento_estoque x where x.item_id = i.id
        and x.estabelecimento_id = ${estab} and x.executado_em < ${inicio}::timestamptz), 0)::text as inicial,
      sum(m.quantidade)::text as quantidade
    from item_estoque i left join produto_formato f on f.item_estoque_id = i.id left join produto p on p.id = f.produto_id
      left join movimento_estoque m on m.item_id = i.id and m.estabelecimento_id = ${estab}
        and m.executado_em >= ${inicio}::timestamptz and m.executado_em < ${fim}::timestamptz
      left join movimento_estoque o on o.id = m.estorno_de_id
    where i.empresa_id = ${ctx.empresaId} and i.tipo = 'produto_acabado'
    group by i.id, i.nome, p.nome, f.volume_ml, coalesce(o.tipo, m.tipo)
    order by p.nome, f.volume_ml`)
  const porItem = new Map<
    string,
    {
      itemId: string
      item: string
      produto: string | null
      volumeMl: number | null
      inicial: number
      entradas: number
      saidas: number
      ajustes: number
      internos: number
    }
  >()
  for (const r of prod.rows) {
    const x = porItem.get(r.item_id) ?? {
      itemId: r.item_id,
      item: r.item,
      produto: r.produto,
      volumeMl: r.volume_ml,
      inicial: Number(r.inicial),
      entradas: 0,
      saidas: 0,
      ajustes: 0,
      internos: 0,
    }
    if (r.tipo) x[GRUPO_ESTOQUE[r.tipo] ?? 'ajustes'] += Number(r.quantidade)
    porItem.set(r.item_id, x)
  }
  const produtos = [...porItem.values()]
    .map((x) => {
      const final = x.inicial + x.entradas + x.saidas + x.ajustes + x.internos
      const litros = (g: number) => (x.volumeMl ? ((g * x.volumeMl) / 1000).toFixed(2) : null)
      return {
        ...x,
        final,
        litrosInicial: litros(x.inicial),
        litrosFinal: litros(final),
        litrosEntradas: litros(x.entradas),
        litrosSaidas: litros(x.saidas),
      }
    })
    .filter((x) => x.inicial || x.entradas || x.saidas || x.ajustes || x.internos)
  return { granel, produtos, tiposEstoque: TIPOS_MOVIMENTO_ESTOQUE }
}

export async function rotasFechamento(app: FastifyInstance): Promise<void> {
  const { db } = app.deps
  const params = z.object({
    ano: z.coerce.number().int().min(2000).max(2200),
    mes: z.coerce.number().int().min(1).max(12),
  })

  app.get('/api/fechamentos', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const { ano } = z
        .object({ ano: z.coerce.number().int().min(2000).max(2200) })
        .parse(req.query)
      const linhas = await ctx.tx
        .select({
          mes: s.fechamentoMensal.mes,
          situacao: s.fechamentoMensal.situacao,
          fechadoEm: s.fechamentoMensal.fechadoEm,
          reabertoEm: s.fechamentoMensal.reabertoEm,
        })
        .from(s.fechamentoMensal)
        .where(
          and(eq(s.fechamentoMensal.estabelecimentoId, estab), eq(s.fechamentoMensal.ano, ano)),
        )
      return Array.from({ length: 12 }, (_, n) => {
        const f = linhas.find((l) => l.mes === n + 1)
        return {
          mes: n + 1,
          situacao: f?.situacao ?? 'aberto',
          fechadoEm: f?.fechadoEm ?? null,
          reabertoEm: f?.reabertoEm ?? null,
        }
      })
    }),
  )

  app.get<{ Params: { ano: string; mes: string } }>('/api/fechamentos/:ano/:mes', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const { ano, mes } = params.parse(req.params)
      const [f] = await ctx.tx
        .select()
        .from(s.fechamentoMensal)
        .where(
          and(
            eq(s.fechamentoMensal.estabelecimentoId, estab),
            eq(s.fechamentoMensal.ano, ano),
            eq(s.fechamentoMensal.mes, mes),
          ),
        )
      const { inicio, fim, terminou } = await limites(ctx, estab, ano, mes)
      // Mês fechado mostra o instantâneo; aberto, a conferência e o relatório de agora.
      if (f?.situacao === 'fechado')
        return {
          ano,
          mes,
          situacao: 'fechado',
          terminou,
          conferencia: f.conferencia,
          relatorio: f.relatorio,
          fechadoEm: f.fechadoEm,
          reabertoEm: f.reabertoEm,
          motivoReabertura: f.motivoReabertura,
        }
      return {
        ano,
        mes,
        situacao: f ? 'reaberto' : 'aberto',
        terminou,
        conferencia: await conferencia(ctx, estab, inicio, fim),
        relatorio: await relatorio(ctx, estab, inicio, fim),
        fechadoEm: f?.fechadoEm ?? null,
        reabertoEm: f?.reabertoEm ?? null,
        motivoReabertura: f?.motivoReabertura ?? null,
      }
    }),
  )

  /** Fechar: só mês terminado, sem pendência de estoque negativo; o resto pede "ciente". */
  app.post<{ Params: { ano: string; mes: string } }>(
    '/api/fechamentos/:ano/:mes/fechar',
    async (req) =>
      naEmpresa(db, req, [F, 'confirmar'], async (ctx) => {
        const estab = ctx.exigirEstabelecimento()
        const { ano, mes } = params.parse(req.params)
        const { cientes } = z
          .object({ cientes: z.array(z.string().max(100)).max(50).default([]) })
          .parse(req.body ?? {})
        const { inicio, fim, terminou } = await limites(ctx, estab, ano, mes)
        if (!terminou) throw new ErroRegra('O mês ainda não terminou.', 'mes_aberto')
        const [atual] = await ctx.tx
          .select()
          .from(s.fechamentoMensal)
          .where(
            and(
              eq(s.fechamentoMensal.estabelecimentoId, estab),
              eq(s.fechamentoMensal.ano, ano),
              eq(s.fechamentoMensal.mes, mes),
            ),
          )
          .for('update')
        if (atual?.situacao === 'fechado') throw new ErroRegra('O mês já está fechado.', 'fechado')
        const conf = await conferencia(ctx, estab, inicio, fim)
        const impede = conf.find((c) => c.impede && c.n > 0)
        if (impede)
          throw new ErroRegra(
            `${impede.nome}: ${impede.n}. Resolva pela nota ou por ajuste antes de fechar (P29).`,
            'pendencia_estoque',
          )
        const avisos: Aviso[] = conf
          .filter((c) => !c.impede && c.n > 0)
          .map((c) => ({ codigo: `fechamento:${c.codigo}`, mensagem: `${c.nome}: ${c.n}.` }))
        exigirCientes(avisos, cientes)
        const rel = await relatorio(ctx, estab, inicio, fim)
        const valores = {
          situacao: 'fechado' as const,
          conferencia: conf,
          relatorio: rel,
          fechadoEm: new Date(),
          fechadoPor: ctx.usuarioId,
        }
        if (atual)
          await ctx.tx
            .update(s.fechamentoMensal)
            .set(valores)
            .where(eq(s.fechamentoMensal.id, atual.id))
        else
          await ctx.tx
            .insert(s.fechamentoMensal)
            .values({ ...valores, empresaId: ctx.empresaId, estabelecimentoId: estab, ano, mes })
        await ctx.auditar({
          acao: 'fechar',
          entidade: 'fechamento_mensal',
          registroId: atual?.id ?? null,
          dados: { ano, mes, avisos: avisos.map((a) => a.mensagem) },
        })
        return { ok: true }
      }),
  )

  app.post<{ Params: { ano: string; mes: string } }>(
    '/api/fechamentos/:ano/:mes/reabrir',
    async (req) =>
      naEmpresa(db, req, ['enotrace.reabrir_periodo', 'reabrir_periodo'], async (ctx) => {
        const estab = ctx.exigirEstabelecimento()
        const { ano, mes } = params.parse(req.params)
        const { motivo } = z
          .object({ motivo: z.string().trim().min(3, 'Informe o motivo').max(500) })
          .parse(req.body)
        const atual = await mesParaReabrir(ctx, estab, ano, mes)
        if (await exigeAprovacao(ctx, 'reabertura'))
          return pedirAprovacao(ctx, {
            tipo: 'reabertura',
            estabelecimentoId: estab,
            entidade: 'fechamento_mensal',
            registroId: atual.id,
            resumo: `Reabrir ${String(mes).padStart(2, '0')}/${ano}: ${motivo}`,
            dados: { ano, mes, motivo },
          })
        return reabrirMes(ctx, estab, ano, mes, motivo, ctx.usuarioId)
      }),
  )
}

async function mesParaReabrir(ctx: ContextoEmpresa, estab: string, ano: number, mes: number) {
  const [atual] = await ctx.tx
    .select()
    .from(s.fechamentoMensal)
    .where(
      and(
        eq(s.fechamentoMensal.estabelecimentoId, estab),
        eq(s.fechamentoMensal.ano, ano),
        eq(s.fechamentoMensal.mes, mes),
      ),
    )
    .for('update')
  if (!atual || atual.situacao !== 'fechado') throw new ErroNaoEncontrado('O mês não está fechado.')
  return atual
}

/** Reabre o mês (direto ou na aprovação do pedido; "por" é quem pediu). */
export async function reabrirMes(
  ctx: ContextoEmpresa,
  estab: string,
  ano: number,
  mes: number,
  motivo: string,
  por: string,
) {
  const atual = await mesParaReabrir(ctx, estab, ano, mes)
  await ctx.tx
    .update(s.fechamentoMensal)
    .set({
      situacao: 'reaberto',
      reabertoEm: new Date(),
      reabertoPor: por,
      motivoReabertura: motivo,
    })
    .where(eq(s.fechamentoMensal.id, atual.id))
  await ctx.auditar({
    acao: 'reabrir',
    entidade: 'fechamento_mensal',
    registroId: atual.id,
    motivo,
    dados: { ano, mes },
  })
  return { ok: true }
}
