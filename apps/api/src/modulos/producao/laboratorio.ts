// EnoTrace › Laboratório (cantina.md, Análises e Laboratório): análises internas e laudos externos
// do lote, com os parâmetros que a empresa mede; o valor digitado em outra unidade é convertido para
// a padrão e o original fica guardado; fora da faixa (lote, projeto ou empresa) fica marcado, sem
// bloquear (P29). Pedido de análise externa: amostra com código, coletada → enviada → laudo
// recebido, com o prazo do laboratório; o laudo, ao chegar, fecha o pedido.
import { dadosAmostra, dadosAnalise, paraUnidadePadrao, SITUACOES_AMOSTRA } from '@vinicycle/shared'
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../../db/schema'
import { conferirVersao } from '../../nucleo/entidades'
import { ErroNaoEncontrado, ErroRegra } from '../../nucleo/erros'
import { anoNoFuso, proximoCodigo } from '../../nucleo/numeracao'
import { type ContextoEmpresa, naEmpresa } from '../../nucleo/requisicao'
import { fusoDo, saldosNaData } from './apoio'

const F = 'enotrace.laboratorio'

/** Lote e recipiente da análise: o lote que está no recipiente na hora da amostra, ou o informado. */
async function loteDaAmostra(
  ctx: ContextoEmpresa,
  estab: string,
  d: { recipienteId?: string | null; loteId?: string | null },
  em: Date,
) {
  if (d.recipienteId) {
    const [r] = await ctx.tx
      .select({ estab: s.recipiente.estabelecimentoId, codigo: s.recipiente.codigo })
      .from(s.recipiente)
      .where(and(eq(s.recipiente.id, d.recipienteId), eq(s.recipiente.empresaId, ctx.empresaId)))
    if (!r || r.estab !== estab) throw new ErroRegra('Recipiente inválido.', 'recipiente')
    const [parte] = await saldosNaData(ctx, [d.recipienteId], em)
    if (!parte)
      throw new ErroRegra(`O recipiente ${r.codigo} está vazio na hora da amostra.`, 'vazio')
    if (d.loteId && d.loteId !== parte.loteId)
      throw new ErroRegra('O lote não é o que está no recipiente.', 'lote')
    return { loteId: parte.loteId, recipienteId: d.recipienteId }
  }
  const [l] = await ctx.tx
    .select({ estab: s.lote.estabelecimentoId })
    .from(s.lote)
    .where(and(eq(s.lote.id, d.loteId!), eq(s.lote.empresaId, ctx.empresaId)))
  if (!l || l.estab !== estab) throw new ErroRegra('Lote inválido.', 'lote')
  return { loteId: d.loteId!, recipienteId: null }
}

/** Laboratório: pessoa da empresa com o papel "laboratório"; avisa credenciamento ausente ou vencido. */
export async function conferirLaboratorio(
  ctx: ContextoEmpresa,
  id: string | null | undefined,
  em: Date,
) {
  if (!id) return []
  const [l] = await ctx.tx
    .execute<{
      nome: string
      credenciamento: string | null
      validade: string | null
    }>(
      sql`
    select f.nome, pl.credenciamento_mapa as credenciamento, pl.credenciamento_validade::text as validade
    from pessoa p join ficha f on f.id = p.ficha_id
      join pessoa_papel pp on pp.pessoa_id = p.id and pp.papel = 'laboratorio'
      left join pessoa_laboratorio pl on pl.pessoa_id = p.id
    where p.id = ${id} and p.empresa_id = ${ctx.empresaId}`,
    )
    .then((r) => r.rows)
  if (!l) throw new ErroRegra('Escolha um laboratório cadastrado em Pessoas.', 'laboratorio')
  const dia = em.toISOString().slice(0, 10)
  if (!l.credenciamento) return [`O laboratório ${l.nome} não tem credenciamento MAPA cadastrado.`]
  if (l.validade && l.validade < dia)
    return [
      `O credenciamento MAPA do laboratório ${l.nome} venceu em ${l.validade.split('-').reverse().join('/')}.`,
    ]
  return []
}

/** Faixa de cada parâmetro pelo nível mais específico: lote, projeto, empresa (cantina.md). */
async function faixasDoLote(ctx: ContextoEmpresa, loteId: string) {
  const [l] = await ctx.tx
    .select({ projetoId: s.lote.projetoId })
    .from(s.lote)
    .where(eq(s.lote.id, loteId))
  const linhas = await ctx.tx
    .select()
    .from(s.faixaIdeal)
    .where(
      and(
        eq(s.faixaIdeal.empresaId, ctx.empresaId),
        or(
          eq(s.faixaIdeal.nivel, 'empresa'),
          and(eq(s.faixaIdeal.nivel, 'projeto'), eq(s.faixaIdeal.registroId, l!.projetoId)),
          and(eq(s.faixaIdeal.nivel, 'lote'), eq(s.faixaIdeal.registroId, loteId)),
        ),
      ),
    )
  const peso = { lote: 3, projeto: 2, modelo_plano: 1, empresa: 0 } as const
  const mapa = new Map<string, { minimo: number | null; maximo: number | null }>()
  for (const f of [...linhas].sort((a, b) => peso[a.nivel] - peso[b.nivel]))
    mapa.set(f.parametroId, {
      minimo: f.minimo === null ? null : Number(f.minimo),
      maximo: f.maximo === null ? null : Number(f.maximo),
    })
  return mapa
}

/** Converte, confere os limites físicos e marca o que está fora da faixa. */
async function prepararResultados(
  ctx: ContextoEmpresa,
  loteId: string,
  resultados: z.output<typeof dadosAnalise>['resultados'],
) {
  const ids = resultados.map((r) => r.parametroId)
  const params = await ctx.tx
    .select()
    .from(s.parametroAnalise)
    .where(
      and(
        inArray(s.parametroAnalise.id, ids),
        or(isNull(s.parametroAnalise.empresaId), eq(s.parametroAnalise.empresaId, ctx.empresaId)),
      ),
    )
  if (params.length !== ids.length) throw new ErroRegra('Parâmetro inválido.', 'parametro')
  const faixas = await faixasDoLote(ctx, loteId)
  return resultados.map((r) => {
    const p = params.find((x) => x.id === r.parametroId)!
    const valor = paraUnidadePadrao(p, Number(r.valor), r.unidade)
    if (valor === null)
      throw new ErroRegra(
        `${p.nome}: a unidade ${r.unidade} não converte para ${p.unidadePadrao}.`,
        'unidade',
      )
    // Limite físico: o que é impossível medir bloqueia (P29); fora da faixa só marca.
    if (
      (p.minimo !== null && valor < Number(p.minimo)) ||
      (p.maximo !== null && valor > Number(p.maximo))
    )
      throw new ErroRegra(
        `${p.nome}: ${r.valor.replace('.', ',')} ${r.unidade} está fora do que se pode medir.`,
        'valor_impossivel',
      )
    const f = faixas.get(p.id)
    const foraFaixa =
      !!f && ((f.minimo !== null && valor < f.minimo) || (f.maximo !== null && valor > f.maximo))
    return {
      parametroId: p.id,
      valor: valor.toFixed(4),
      valorDigitado: r.valor,
      unidadeDigitada: r.unidade,
      foraFaixa,
    }
  })
}

/** Análises com os resultados, nome do parâmetro e unidades. */
async function listarAnalises(ctx: ContextoEmpresa, filtro: ReturnType<typeof sql>) {
  const r = await ctx.tx.execute<{
    id: string
    tipo: 'interna' | 'laudo'
    amostraEm: string
    loteId: string
    lote: string
    recipienteId: string | null
    recipiente: string | null
    laboratorioId: string | null
    laboratorio: string | null
    amostraId: string | null
    amostra: string | null
    documento: string | null
    observacao: string | null
    versao: number
    resultados: Array<{
      parametroId: string
      codigo: string
      nome: string
      unidadePadrao: string
      casas: number
      valor: string
      valorDigitado: string | null
      unidadeDigitada: string | null
      foraFaixa: boolean
    }>
  }>(sql`
    select a.id, a.tipo, a.amostra_em as "amostraEm", a.lote_id as "loteId", l.codigo as lote,
      a.recipiente_id as "recipienteId", r.codigo as recipiente,
      a.laboratorio_id as "laboratorioId", (select f.nome from pessoa p join ficha f on f.id = p.ficha_id where p.id = a.laboratorio_id) as laboratorio,
      a.amostra_id as "amostraId", (select m.codigo from amostra m where m.id = a.amostra_id) as amostra,
      a.documento, a.observacao, a.versao,
      coalesce((select json_agg(json_build_object('parametroId', p.id, 'codigo', p.codigo, 'nome', p.nome,
          'unidadePadrao', p.unidade_padrao, 'casas', p.casas, 'valor', ar.valor::text,
          'valorDigitado', ar.valor_digitado, 'unidadeDigitada', ar.unidade_digitada, 'foraFaixa', ar.fora_faixa)
          order by p.ordem, p.nome)
        from analise_resultado ar join parametro_analise p on p.id = ar.parametro_id where ar.analise_id = a.id), '[]') as resultados
    from analise a join lote l on l.id = a.lote_id left join recipiente r on r.id = a.recipiente_id
    where a.empresa_id = ${ctx.empresaId} and ${filtro}
    order by a.amostra_em desc
    limit 300`)
  return r.rows
}

async function carregarAmostra(ctx: ContextoEmpresa, id: string) {
  const [a] = await ctx.tx
    .select()
    .from(s.amostra)
    .where(and(eq(s.amostra.id, id), eq(s.amostra.empresaId, ctx.empresaId)))
    .for('update')
  if (!a || !(await ctx.estabelecimentosPermitidos()).includes(a.estabelecimentoId))
    throw new ErroNaoEncontrado('Amostra não encontrada.')
  return a
}

export async function rotasLaboratorio(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  /** Parâmetros que a empresa mede (Parâmetros técnicos › Análises), com as unidades. */
  app.get('/api/laboratorio/parametros', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const r = await ctx.tx.execute<{
        id: string
        codigo: string
        nome: string
        unidadePadrao: string
        unidadesAceitas: string[]
        unidadePreferida: string | null
        casas: number
        minimo: string | null
        maximo: string | null
      }>(sql`
        select p.id, p.codigo, p.nome, p.unidade_padrao as "unidadePadrao", p.unidades_aceitas as "unidadesAceitas",
          e.unidade_preferida as "unidadePreferida", p.casas,
          f.minimo::text as minimo, f.maximo::text as maximo
        from parametro_analise p
          join empresa_parametro_analise e on e.parametro_id = p.id and e.empresa_id = ${ctx.empresaId} and e.ativo
          left join faixa_ideal f on f.parametro_id = p.id and f.empresa_id = ${ctx.empresaId} and f.nivel = 'empresa'
        where p.ativo and (p.empresa_id is null or p.empresa_id = ${ctx.empresaId})
        order by p.ordem, p.nome`)
      return r.rows
    }),
  )

  /** Laboratórios: pessoas com o papel "laboratório", com o credenciamento e o prazo médio. */
  app.get('/api/laboratorios', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const r = await ctx.tx.execute<{
        id: string
        nome: string
        credenciamento: string | null
        validade: string | null
        prazoDias: number | null
      }>(sql`
        select p.id, f.nome, pl.credenciamento_mapa as credenciamento,
          pl.credenciamento_validade::text as validade, pl.prazo_medio_laudo_dias as "prazoDias"
        from pessoa p join ficha f on f.id = p.ficha_id
          join pessoa_papel pp on pp.pessoa_id = p.id and pp.papel = 'laboratorio'
          left join pessoa_laboratorio pl on pl.pessoa_id = p.id
        where p.empresa_id = ${ctx.empresaId} and p.ativo
        order by f.nome`)
      return r.rows
    }),
  )

  app.get('/api/analises', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const q = z
        .object({
          lote: z.uuid().optional(),
          recipiente: z.uuid().optional(),
          tipo: z.enum(['interna', 'laudo']).optional(),
        })
        .parse(req.query)
      return listarAnalises(
        ctx,
        sql`a.estabelecimento_id = ${estab}
          ${q.lote ? sql`and a.lote_id = ${q.lote}` : sql``}
          ${q.recipiente ? sql`and a.recipiente_id = ${q.recipiente}` : sql``}
          ${q.tipo ? sql`and a.tipo = ${q.tipo}` : sql``}`,
      )
    }),
  )

  app.get<{ Params: { id: string } }>('/api/analises/:id', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const [a] = await listarAnalises(ctx, sql`a.id = ${id}`)
      if (!a) throw new ErroNaoEncontrado('Análise não encontrada.')
      return a
    }),
  )

  app.post('/api/analises', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const d = dadosAnalise.parse(req.body)
      const em = new Date(d.amostraEm)
      if (em.getTime() > Date.now() + 5 * 60_000)
        throw new ErroRegra('A amostra não pode ser no futuro.', 'data_futura')
      const alvo = await loteDaAmostra(ctx, estab, d, em)
      const avisos = d.tipo === 'laudo' ? await conferirLaboratorio(ctx, d.laboratorioId, em) : []
      let laboratorioId = d.tipo === 'laudo' ? (d.laboratorioId ?? null) : null
      if (d.amostraId) {
        const a = await carregarAmostra(ctx, d.amostraId)
        if (a.situacao === 'laudo_recebido' || a.situacao === 'cancelada')
          throw new ErroRegra(
            `A amostra ${a.codigo} já está ${SITUACOES_AMOSTRA[a.situacao].toLowerCase()}.`,
            'amostra',
          )
        if (a.loteId !== alvo.loteId)
          throw new ErroRegra(`A amostra ${a.codigo} é de outro lote.`, 'amostra')
        laboratorioId ??= a.laboratorioId
      }
      const resultados = await prepararResultados(ctx, alvo.loteId, d.resultados)
      const [a] = await ctx.tx
        .insert(s.analise)
        .values({
          empresaId: ctx.empresaId,
          estabelecimentoId: estab,
          loteId: alvo.loteId,
          recipienteId: alvo.recipienteId,
          amostraEm: em,
          tipo: d.tipo,
          laboratorioId,
          amostraId: d.amostraId ?? null,
          documento: d.documento ?? null,
          observacao: d.observacao ?? null,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.analise.id })
      await ctx.tx
        .insert(s.analiseResultado)
        .values(resultados.map((r) => ({ ...r, empresaId: ctx.empresaId, analiseId: a!.id })))
      if (d.amostraId) {
        await ctx.tx
          .update(s.amostra)
          .set({
            situacao: 'laudo_recebido',
            atualizadoEm: sql`now()`,
            atualizadoPor: ctx.usuarioId,
            versao: sql`${s.amostra.versao} + 1`,
          })
          .where(eq(s.amostra.id, d.amostraId))
      }
      await ctx.auditar({
        acao: 'criar',
        entidade: 'analise',
        registroId: a!.id,
        dados: { tipo: d.tipo, resultados: d.resultados },
      })
      return {
        id: a!.id,
        avisos,
        foraFaixa: resultados.filter((r) => r.foraFaixa).length,
      }
    }),
  )

  /** Corrigir os valores: a análise não é livro (P13 vale para volume e estoque); fica auditada. */
  app.put<{ Params: { id: string } }>('/api/analises/:id', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const d = dadosAnalise.parse(req.body)
      const [atual] = await ctx.tx
        .select()
        .from(s.analise)
        .where(and(eq(s.analise.id, id), eq(s.analise.empresaId, ctx.empresaId)))
        .for('update')
      if (!atual || !(await ctx.estabelecimentosPermitidos()).includes(atual.estabelecimentoId))
        throw new ErroNaoEncontrado('Análise não encontrada.')
      conferirVersao(atual.versao, d.versao)
      const em = new Date(d.amostraEm)
      const avisos =
        atual.tipo === 'laudo' ? await conferirLaboratorio(ctx, d.laboratorioId, em) : []
      const resultados = await prepararResultados(ctx, atual.loteId, d.resultados)
      await ctx.tx.delete(s.analiseResultado).where(eq(s.analiseResultado.analiseId, id))
      await ctx.tx
        .insert(s.analiseResultado)
        .values(resultados.map((r) => ({ ...r, empresaId: ctx.empresaId, analiseId: id })))
      await ctx.tx
        .update(s.analise)
        .set({
          amostraEm: em,
          laboratorioId: atual.tipo === 'laudo' ? (d.laboratorioId ?? atual.laboratorioId) : null,
          documento: d.documento ?? null,
          observacao: d.observacao ?? null,
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.analise.versao} + 1`,
        })
        .where(eq(s.analise.id, id))
      await ctx.auditar({
        acao: 'editar',
        entidade: 'analise',
        registroId: id,
        dados: { resultados: d.resultados },
      })
      return { ok: true, avisos }
    }),
  )

  /** Excluir uma análise lançada por engano; o pedido que ela fechou volta a "enviada". */
  app.post<{ Params: { id: string } }>('/api/analises/:id/excluir', async (req) =>
    naEmpresa(db, req, [F, 'inativar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const { motivo } = z
        .object({ motivo: z.string().trim().min(3, 'Informe o motivo').max(500) })
        .parse(req.body)
      const [a] = await ctx.tx
        .select()
        .from(s.analise)
        .where(and(eq(s.analise.id, id), eq(s.analise.empresaId, ctx.empresaId)))
        .for('update')
      if (!a || !(await ctx.estabelecimentosPermitidos()).includes(a.estabelecimentoId))
        throw new ErroNaoEncontrado('Análise não encontrada.')
      await ctx.tx.delete(s.analise).where(eq(s.analise.id, id))
      if (a.amostraId)
        await ctx.tx
          .update(s.amostra)
          .set({ situacao: 'enviada', versao: sql`${s.amostra.versao} + 1` })
          .where(eq(s.amostra.id, a.amostraId))
      await ctx.auditar({ acao: 'excluir', entidade: 'analise', registroId: id, motivo })
      return { ok: true }
    }),
  )

  // Pedidos de análise externa ---------------------------------------------------------------

  app.get('/api/amostras', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const q = z
        .object({
          situacao: z.enum(['abertas', 'todas']).default('abertas'),
          lote: z.uuid().optional(),
        })
        .parse(req.query)
      const r = await ctx.tx.execute<{
        id: string
        codigo: string
        loteId: string
        lote: string
        recipiente: string | null
        coletadaEm: string
        enviadaEm: string | null
        laboratorioId: string
        laboratorio: string
        prazo: string | null
        situacao: keyof typeof SITUACOES_AMOSTRA
        atrasada: boolean
        analiseId: string | null
        observacao: string | null
      }>(sql`
        select m.id, m.codigo, m.lote_id as "loteId", l.codigo as lote, r.codigo as recipiente,
          m.coletada_em as "coletadaEm", m.enviada_em as "enviadaEm", m.laboratorio_id as "laboratorioId",
          (select f.nome from pessoa p join ficha f on f.id = p.ficha_id where p.id = m.laboratorio_id) as laboratorio,
          m.prazo::text as prazo, m.situacao,
          (m.situacao in ('coletada', 'enviada') and m.prazo is not null
            and m.prazo < (now() at time zone (select e.fuso from estabelecimento e where e.id = m.estabelecimento_id))::date) as atrasada,
          (select a.id from analise a where a.amostra_id = m.id) as "analiseId", m.observacao
        from amostra m join lote l on l.id = m.lote_id left join recipiente r on r.id = m.recipiente_id
        where m.empresa_id = ${ctx.empresaId} and m.estabelecimento_id = ${estab}
          ${q.situacao === 'abertas' ? sql`and m.situacao in ('coletada', 'enviada')` : sql``}
          ${q.lote ? sql`and m.lote_id = ${q.lote}` : sql``}
        order by m.coletada_em desc limit 300`)
      return r.rows
    }),
  )

  app.post('/api/amostras', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const d = dadosAmostra.parse(req.body)
      const em = new Date(d.coletadaEm)
      if (em.getTime() > Date.now() + 5 * 60_000)
        throw new ErroRegra('A coleta não pode ser no futuro.', 'data_futura')
      const alvo = await loteDaAmostra(ctx, estab, d, em)
      const avisos = await conferirLaboratorio(ctx, d.laboratorioId, em)
      let prazo = d.prazo ?? null
      if (!prazo) {
        const [l] = await ctx.tx
          .select({ dias: s.pessoaLaboratorio.prazoMedioLaudoDias })
          .from(s.pessoaLaboratorio)
          .where(eq(s.pessoaLaboratorio.pessoaId, d.laboratorioId))
        if (l?.dias) prazo = new Date(em.getTime() + l.dias * 86400_000).toISOString().slice(0, 10)
      }
      const fuso = await fusoDo(ctx, estab)
      const codigo = await proximoCodigo(ctx, {
        estabelecimentoId: estab,
        tipo: 'amostra',
        ano: anoNoFuso(em, fuso),
      })
      const [a] = await ctx.tx
        .insert(s.amostra)
        .values({
          empresaId: ctx.empresaId,
          estabelecimentoId: estab,
          codigo,
          loteId: alvo.loteId,
          recipienteId: alvo.recipienteId,
          coletadaEm: em,
          laboratorioId: d.laboratorioId,
          prazo,
          observacao: d.observacao ?? null,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.amostra.id })
      await ctx.auditar({
        acao: 'criar',
        entidade: 'amostra',
        registroId: a!.id,
        dados: { codigo },
      })
      return { id: a!.id, codigo, avisos }
    }),
  )

  app.post<{ Params: { id: string } }>('/api/amostras/:id/enviar', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const d = z.object({ enviadaEm: z.iso.datetime({ offset: true }) }).parse(req.body)
      const a = await carregarAmostra(ctx, id)
      if (a.situacao !== 'coletada')
        throw new ErroRegra('Só a amostra coletada é enviada.', 'amostra')
      const em = new Date(d.enviadaEm)
      if (em < a.coletadaEm) throw new ErroRegra('O envio é antes da coleta.', 'data')
      await ctx.tx
        .update(s.amostra)
        .set({
          situacao: 'enviada',
          enviadaEm: em,
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.amostra.versao} + 1`,
        })
        .where(eq(s.amostra.id, id))
      await ctx.auditar({ acao: 'enviar', entidade: 'amostra', registroId: id })
      return { ok: true }
    }),
  )

  app.post<{ Params: { id: string } }>('/api/amostras/:id/cancelar', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const { motivo } = z
        .object({ motivo: z.string().trim().min(3, 'Informe o motivo').max(500) })
        .parse(req.body)
      const a = await carregarAmostra(ctx, id)
      if (a.situacao === 'laudo_recebido' || a.situacao === 'cancelada')
        throw new ErroRegra('A amostra já está encerrada.', 'amostra')
      await ctx.tx
        .update(s.amostra)
        .set({
          situacao: 'cancelada',
          observacao: [a.observacao, `Cancelada: ${motivo}`].filter(Boolean).join('\n'),
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.amostra.versao} + 1`,
        })
        .where(eq(s.amostra.id, id))
      await ctx.auditar({ acao: 'cancelar', entidade: 'amostra', registroId: id, motivo })
      return { ok: true }
    }),
  )
}
