// EnoTrace › Fermentações (cantina.md, Fermentações): início e fim por operação, leituras de
// densidade e temperatura (análise interna) e a sugestão de fim quando as leituras ficam estáveis.
// O critério é configurável (Parâmetros, "fim_fermentacao"); quem confirma é o enólogo.
import { fermentacao as esquemaFermentacao, leituraFermentacao } from '@vinicycle/shared'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../../db/schema'
import { ErroNaoEncontrado, ErroRegra } from '../../nucleo/erros'
import { type ContextoEmpresa, naEmpresa } from '../../nucleo/requisicao'
import { lerParametro } from '../parametros'
import { conferirPessoas, dataExecucao, type Montada } from './apoio'
import { comVinho, linhasDeAjuste, projetoUnico } from './tratamentos'

const NOMES = { alcoolica: 'alcoólica', malolatica: 'malolática' } as const

/** Fermentações com o início confirmado; "em andamento" se o fim não foi confirmado. */
const fermentacoes = (ctx: ContextoEmpresa) => sql`
  select f.id, f.lote_id as "loteId", f.tipo, f.fim_sugerido_em as "fimSugeridoEm",
    oi.id as "inicioId", oi.codigo as "inicioCodigo", oi.executado_em as "inicioEm",
    ofim.id as "fimId", ofim.codigo as "fimCodigo", ofim.executado_em as "fimEm",
    l.codigo as lote, l.projeto_id as "projetoId",
    (select string_agg(r.codigo, ', ' order by r.codigo) from (select m.recipiente_id from movimento_volume m
      where m.lote_id = f.lote_id group by m.recipiente_id having sum(m.litros) > 0) x
      join recipiente r on r.id = x.recipiente_id) as recipientes
  from fermentacao f
    join operacao oi on oi.id = f.operacao_inicio_id and oi.situacao = 'confirmada'
    left join operacao ofim on ofim.id = f.operacao_fim_id and ofim.situacao = 'confirmada'
    join lote l on l.id = f.lote_id
  where f.empresa_id = ${ctx.empresaId}`

type Fermentacao = {
  id: string
  loteId: string
  tipo: 'alcoolica' | 'malolatica'
  fimSugeridoEm: string | null
  inicioId: string
  inicioCodigo: string
  inicioEm: string
  fimId: string | null
  fimCodigo: string | null
  fimEm: string | null
  lote: string
  projetoId: string
  recipientes: string | null
}

async function emAndamento(ctx: ContextoEmpresa, loteId: string, tipo: string) {
  const r = await ctx.tx.execute<Fermentacao>(
    sql`${fermentacoes(ctx)} and f.lote_id = ${loteId} and f.tipo = ${tipo} and ofim.id is null`,
  )
  return r.rows[0] ?? null
}

/** Início ou fim da fermentação do lote que está no recipiente: operação sem volume. */
export async function planoFermentacao(ctx: ContextoEmpresa, corpo: unknown): Promise<Montada> {
  const estab = ctx.exigirEstabelecimento()
  const d = esquemaFermentacao.parse(corpo)
  const executadoEm = dataExecucao(d.executadoEm)
  await conferirPessoas(ctx, [d.responsavelId, d.executadoPorId])
  const [parte] = await comVinho(ctx, [d.recipienteId])
  const projeto = await projetoUnico(ctx, estab, [parte!], d.planoEtapaId)
  const atual = await emAndamento(ctx, parte!.loteId, d.tipoFermentacao)
  if (d.evento === 'inicio' && atual)
    throw new ErroRegra(
      `A fermentação ${NOMES[d.tipoFermentacao]} deste lote já começou (${atual.inicioCodigo}).`,
      'fermentacao',
    )
  if (d.evento === 'fim') {
    if (!atual)
      throw new ErroRegra(
        `Não há fermentação ${NOMES[d.tipoFermentacao]} em andamento neste lote.`,
        'fermentacao',
      )
    if (executadoEm < new Date(atual.inicioEm))
      throw new ErroRegra('O fim é antes do início da fermentação.', 'fermentacao')
  }
  return {
    cientes: d.cientes,
    rascunhoId: d.rascunhoId ?? null,
    insumos: { lista: d.insumos, localEstoqueId: d.localEstoqueId, padrao: [d.recipienteId] },
    plano: {
      tipo: 'fermentacao',
      estabelecimentoId: estab,
      executadoEm,
      projetoId: projeto?.id ?? null,
      responsavelId: d.responsavelId ?? projeto?.enologoId ?? null,
      executadoPorId: d.executadoPorId ?? null,
      planoEtapaId: d.planoEtapaId ?? null,
      observacao: d.observacao ?? null,
      linhas: linhasDeAjuste([parte!]),
      lancamentos: [],
      dados: { tipoFermentacao: d.tipoFermentacao, evento: d.evento },
      fermentacao: {
        loteId: parte!.loteId,
        tipo: d.tipoFermentacao,
        evento: d.evento,
        id: atual?.id,
      },
    },
  }
}

/** Leituras de densidade e temperatura do lote durante a fermentação, em ordem. */
async function leituras(ctx: ContextoEmpresa, f: Fermentacao) {
  const r = await ctx.tx.execute<{
    analiseId: string
    amostraEm: string
    recipiente: string | null
    densidade: string | null
    temperatura: string | null
  }>(sql`
    select a.id as "analiseId", a.amostra_em as "amostraEm",
      (select r.codigo from recipiente r where r.id = a.recipiente_id) as recipiente,
      max(case when p.codigo = 'densidade' then ar.valor end) as densidade,
      max(case when p.codigo = 'temperatura' then ar.valor end) as temperatura
    from analise a join analise_resultado ar on ar.analise_id = a.id
      join parametro_analise p on p.id = ar.parametro_id
    where a.lote_id = ${f.loteId} and a.amostra_em >= ${f.inicioEm}
      and (${f.fimEm}::timestamptz is null or a.amostra_em <= ${f.fimEm}::timestamptz)
      and p.codigo in ('densidade', 'temperatura')
    group by a.id, a.amostra_em, a.recipiente_id order by a.amostra_em`)
  return r.rows
}

/**
 * Sugestão de fim (alcoólica): as últimas N leituras de densidade iguais (3 casas) e abaixo do
 * máximo configurado. O enólogo confirma lançando o fim.
 */
async function sugereFim(
  ctx: ContextoEmpresa,
  f: Fermentacao,
  lidas: Array<{ densidade: string | null }>,
) {
  if (f.tipo !== 'alcoolica' || f.fimId) return false
  const { leituras: n, densidadeMaxima } = await lerParametro(ctx, 'fim_fermentacao')
  const dens = lidas.flatMap((l) => (l.densidade === null ? [] : [Number(l.densidade)])).slice(-n)
  return (
    dens.length === n &&
    dens.every((x) => x < densidadeMaxima && x.toFixed(3) === dens[0]!.toFixed(3))
  )
}

export async function rotasFermentacoes(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  app.get('/api/fermentacoes', async (req) =>
    naEmpresa(db, req, ['enotrace.operacoes', 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const q = z
        .object({
          situacao: z.enum(['em_andamento', 'todas']).default('em_andamento'),
          lote: z.uuid().optional(),
        })
        .parse(req.query)
      const r = await ctx.tx.execute<Fermentacao>(sql`${fermentacoes(ctx)}
        and f.estabelecimento_id = ${estab}
        ${q.situacao === 'em_andamento' ? sql`and ofim.id is null` : sql``}
        ${q.lote ? sql`and f.lote_id = ${q.lote}` : sql``}
        order by oi.executado_em desc`)
      return Promise.all(
        r.rows.map(async (f) => {
          const lidas = await leituras(ctx, f)
          const ultima = lidas.at(-1) ?? null
          return {
            ...f,
            ultima,
            leituras: lidas.length,
            sugereFim: await sugereFim(ctx, f, lidas),
          }
        }),
      )
    }),
  )

  app.get<{ Params: { id: string } }>('/api/fermentacoes/:id', async (req) =>
    naEmpresa(db, req, ['enotrace.operacoes', 'visualizar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const r = await ctx.tx.execute<Fermentacao>(sql`${fermentacoes(ctx)} and f.id = ${id}`)
      const f = r.rows[0]
      if (!f) throw new ErroNaoEncontrado('Fermentação não encontrada.')
      const lidas = await leituras(ctx, f)
      return { ...f, leituras: lidas, sugereFim: await sugereFim(ctx, f, lidas) }
    }),
  )

  /** Leitura interna (análise) de densidade e temperatura, no lote da fermentação. */
  app.post<{ Params: { id: string } }>('/api/fermentacoes/:id/leituras', async (req) =>
    naEmpresa(db, req, ['enotrace.laboratorio', 'criar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const id = z.uuid().parse(req.params.id)
      const d = leituraFermentacao.parse(req.body)
      const r = await ctx.tx.execute<Fermentacao>(sql`${fermentacoes(ctx)} and f.id = ${id}`)
      const f = r.rows[0]
      if (!f) throw new ErroNaoEncontrado('Fermentação não encontrada.')
      if (f.fimId) throw new ErroRegra('A fermentação já terminou.', 'fermentacao')
      const amostraEm = new Date(d.amostraEm)
      if (amostraEm < new Date(f.inicioEm))
        throw new ErroRegra('A leitura é antes do início da fermentação.', 'leitura')
      const parametros = await ctx.tx
        .select({ id: s.parametroAnalise.id, codigo: s.parametroAnalise.codigo })
        .from(s.parametroAnalise)
        .where(
          and(
            sql`${s.parametroAnalise.codigo} in ('densidade', 'temperatura')`,
            sql`${s.parametroAnalise.empresaId} is null`,
          ),
        )
        .orderBy(asc(s.parametroAnalise.codigo))
      const [a] = await ctx.tx
        .insert(s.analise)
        .values({
          empresaId: ctx.empresaId,
          estabelecimentoId: estab,
          loteId: f.loteId,
          recipienteId: d.recipienteId ?? null,
          amostraEm,
          tipo: 'interna',
          criadoPor: ctx.usuarioId,
        })
        .returning({ id: s.analise.id })
      const valores = [
        ['densidade', d.densidade],
        ['temperatura', d.temperatura],
      ] as const
      for (const [codigo, valor] of valores) {
        if (!valor) continue
        await ctx.tx.insert(s.analiseResultado).values({
          empresaId: ctx.empresaId,
          analiseId: a!.id,
          parametroId: parametros.find((p) => p.codigo === codigo)!.id,
          valor,
          valorDigitado: valor,
          unidadeDigitada: codigo === 'densidade' ? 'g/mL' : '°C',
        })
      }
      // Guarda quando a sugestão de fim apareceu pela primeira vez.
      const lidas = await leituras(ctx, f)
      if (!f.fimSugeridoEm && (await sugereFim(ctx, f, lidas))) {
        await ctx.tx
          .update(s.fermentacao)
          .set({ fimSugeridoEm: sql`now()` })
          .where(eq(s.fermentacao.id, f.id))
      }
      await ctx.auditar({
        acao: 'criar',
        entidade: 'analise',
        registroId: a!.id,
        dados: { fermentacao: f.id, densidade: d.densidade, temperatura: d.temperatura },
      })
      return { id: a!.id }
    }),
  )
}
