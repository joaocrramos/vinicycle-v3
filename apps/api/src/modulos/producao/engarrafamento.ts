// EnoTrace › Engarrafamento (cantina.md, Engarrafamento e Lote comercial; 03-modelo-de-dados.md,
// 2.5 e 5.6). A previsão calcula garrafas e materiais pela ficha de embalagem e o que falta no
// estoque; a ordem não reserva estoque. Cada dia de envase é uma produção parcial: uma operação
// "engarrafamento" no livro de volumes (sai do recipiente; o estorno devolve), a baixa dos materiais
// e a entrada do produto acabado, um lote de item por formato com o código do lote comercial. O
// lote comercial (um por ordem) guarda a composição do que foi efetivamente engarrafado.
import { codigoComPrefixo } from '../contratos'
import { liberarSelosDaProducao } from '../selos'
import {
  type Composicao,
  dadosOrdemEngarrafamento,
  deCentilitros,
  estornoOperacao,
  misturar,
  paraCentilitros,
  previsaoEnvase,
  producaoEngarrafamento,
  safraCicloPredominante,
} from '@vinicycle/shared'
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../../db/schema'
import { conferirVersao } from '../../nucleo/entidades'
import { ErroNaoEncontrado, ErroRegra } from '../../nucleo/erros'
import { anoNoFuso, proximoCodigo } from '../../nucleo/numeracao'
import type { Aviso } from '../../nucleo/regras'
import { type ContextoEmpresa, naEmpresa } from '../../nucleo/requisicao'
import { type MovimentoNovo, obterLote } from '../estoque'
import { lerParametro } from '../parametros'
import { carregarProjeto, conferirPessoas, dataExecucao, saldosNaData } from './apoio'
import { conferirLaboratorio } from './laboratorio'
import { confirmar, type Lancamento, type LinhaOperacao, partesAtuais, preparar } from './motor'

const F = 'enotrace.engarrafamento'

/** Milésimos inteiros, para somar materiais sem ponto flutuante. */
const paraMil = (q: string | number) => Math.round(Number(q) * 1000)
const deMil = (m: number) => (m / 1000).toFixed(3)

// Previsão ---------------------------------------------------------------------------------------

/** Recipientes com vinho do projeto, com o lote e os litros. */
async function vinhoDoProjeto(ctx: ContextoEmpresa, projetoId: string) {
  const r = await ctx.tx.execute<{
    recipiente_id: string
    codigo: string
    lote_id: string
    lote: string
    litros: string
  }>(sql`
    select m.recipiente_id, r.codigo, m.lote_id, l.codigo as lote, sum(m.litros)::text as litros
    from movimento_volume m join lote l on l.id = m.lote_id join recipiente r on r.id = m.recipiente_id
    where l.projeto_id = ${projetoId} and m.empresa_id = ${ctx.empresaId}
    group by m.recipiente_id, r.codigo, m.lote_id, l.codigo having sum(m.litros) > 0
    order by r.codigo`)
  return r.rows.map((x) => ({
    recipienteId: x.recipiente_id,
    codigo: x.codigo,
    loteId: x.lote_id,
    lote: x.lote,
    litros: x.litros,
  }))
}

async function formatosDoProduto(ctx: ContextoEmpresa, produtoId: string) {
  return ctx.tx
    .select({
      id: s.produtoFormato.id,
      volumeMl: s.produtoFormato.volumeMl,
      itemEstoqueId: s.produtoFormato.itemEstoqueId,
      nome: s.itemEstoque.nome,
      ativo: s.produtoFormato.ativo,
    })
    .from(s.produtoFormato)
    .innerJoin(s.itemEstoque, eq(s.itemEstoque.id, s.produtoFormato.itemEstoqueId))
    .where(
      and(eq(s.produtoFormato.produtoId, produtoId), eq(s.produtoFormato.empresaId, ctx.empresaId)),
    )
    .orderBy(asc(s.produtoFormato.volumeMl))
}

/**
 * Materiais pela ficha de embalagem de cada formato (cantina.md, Ficha de embalagem): garrafas ×
 * quantidade por garrafa. Material contado em unidades arredonda para cima (1/6 de caixa).
 */
async function materiaisPrevistos(
  ctx: ContextoEmpresa,
  garrafas: Array<{ formatoId: string; garrafas: number }>,
) {
  const ids = garrafas.filter((g) => g.garrafas > 0).map((g) => g.formatoId)
  if (!ids.length) return []
  const ficha = await ctx.tx
    .select({
      formatoId: s.fichaEmbalagem.formatoId,
      itemId: s.fichaEmbalagem.itemEstoqueId,
      quantidade: s.fichaEmbalagem.quantidade,
      nome: s.itemEstoque.nome,
      unidade: s.itemEstoque.unidadeBase,
      controlaLote: s.itemEstoque.controlaLote,
    })
    .from(s.fichaEmbalagem)
    .innerJoin(s.itemEstoque, eq(s.itemEstoque.id, s.fichaEmbalagem.itemEstoqueId))
    .where(inArray(s.fichaEmbalagem.formatoId, ids))
  const porItem = new Map<
    string,
    { itemId: string; nome: string; unidade: string; controlaLote: boolean; mil: number }
  >()
  for (const f of ficha) {
    const g = garrafas.find((x) => x.formatoId === f.formatoId)!.garrafas
    const atual = porItem.get(f.itemId) ?? {
      itemId: f.itemId,
      nome: f.nome,
      unidade: f.unidade,
      controlaLote: f.controlaLote,
      mil: 0,
    }
    atual.mil += Math.round(g * Number(f.quantidade) * 1000)
    porItem.set(f.itemId, atual)
  }
  return [...porItem.values()].map((m) => ({
    itemId: m.itemId,
    nome: m.nome,
    unidade: m.unidade,
    controlaLote: m.controlaLote,
    previsto: deMil(m.unidade === 'un' ? Math.ceil(m.mil / 1000) * 1000 : m.mil),
  }))
}

/** Saldo de cada item no local (ou em todos os locais do estabelecimento). */
async function saldosDeItens(
  ctx: ContextoEmpresa,
  estab: string,
  itens: string[],
  localId: string | null | undefined,
) {
  if (!itens.length) return new Map<string, string>()
  const r = await ctx.tx
    .select({
      itemId: s.movimentoEstoque.itemId,
      total: sql<string>`sum(${s.movimentoEstoque.quantidade})::text`,
    })
    .from(s.movimentoEstoque)
    .where(
      and(
        inArray(s.movimentoEstoque.itemId, itens),
        eq(s.movimentoEstoque.estabelecimentoId, estab),
        localId ? eq(s.movimentoEstoque.localId, localId) : undefined,
      ),
    )
    .groupBy(s.movimentoEstoque.itemId)
  return new Map(r.map((x) => [x.itemId, x.total]))
}

/** Previsão do envase (cantina.md, Do "pronto para envase" ao envase). */
async function preverEnvase(ctx: ContextoEmpresa, corpo: unknown) {
  const estab = ctx.exigirEstabelecimento()
  const d = previsaoEnvase.parse(corpo)
  await carregarProjeto(ctx, d.projetoId, estab)
  const { perdaPercentual } = await lerParametro(ctx, 'envase')
  const vinho = await vinhoDoProjeto(ctx, d.projetoId)
  const usados = d.recipientes.length
    ? vinho.filter((v) => d.recipientes.includes(v.recipienteId))
    : vinho
  const litros = usados.reduce((t, v) => t + paraCentilitros(v.litros), 0)
  const formatos = await formatosDoProduto(ctx, d.produtoId)
  const pedidos = d.formatos.map((f) => {
    const x = formatos.find((y) => y.id === f.formatoId)
    if (!x) throw new ErroRegra('Formato de outro produto.', 'formato')
    // Sem garrafas informadas e com um só formato, sugere pelos litros e pela perda média.
    const sugeridas =
      d.formatos.length === 1
        ? Math.floor(((litros * 10) / x.volumeMl) * (1 - perdaPercentual / 100))
        : 0
    return {
      formatoId: x.id,
      nome: x.nome,
      volumeMl: x.volumeMl,
      garrafas: f.garrafas ?? sugeridas,
    }
  })
  const engarrafarCl = pedidos.reduce((t, p) => t + (p.garrafas * p.volumeMl) / 10, 0)
  const necessariosCl = Math.ceil(engarrafarCl / (1 - perdaPercentual / 100))
  const materiais = await materiaisPrevistos(ctx, pedidos)
  const saldos = await saldosDeItens(
    ctx,
    estab,
    materiais.map((m) => m.itemId),
    d.localMateriaisId,
  )
  const avisos: string[] = []
  if (necessariosCl > litros)
    avisos.push(
      `As garrafas pedem cerca de ${deCentilitros(necessariosCl).replace('.', ',')} L, com a perda média de ${perdaPercentual}%; há ${deCentilitros(litros).replace('.', ',')} L.`,
    )
  const comFalta = materiais.map((m) => {
    const saldo = saldos.get(m.itemId) ?? '0'
    const falta = Math.max(0, paraMil(m.previsto) - paraMil(saldo))
    return { ...m, saldo: deMil(paraMil(saldo)), falta: deMil(falta) }
  })
  return {
    perdaPercentual,
    litrosDisponiveis: deCentilitros(litros),
    litrosNecessarios: deCentilitros(necessariosCl),
    recipientes: vinho,
    formatos: pedidos,
    materiais: comFalta,
    avisos,
  }
}

// Ordem ------------------------------------------------------------------------------------------

async function carregarOrdem(ctx: ContextoEmpresa, id: string, travar = false) {
  const q = ctx.tx
    .select()
    .from(s.ordemEngarrafamento)
    .where(
      and(eq(s.ordemEngarrafamento.id, id), eq(s.ordemEngarrafamento.empresaId, ctx.empresaId)),
    )
  const [o] = travar ? await q.for('update') : await q
  if (!o || o.estabelecimentoId !== ctx.exigirEstabelecimento())
    throw new ErroNaoEncontrado('Ordem não encontrada.')
  return o
}

/** Confere produto, rótulo, formatos, recipientes, locais e prestador da ordem. */
async function conferirOrdem(
  ctx: ContextoEmpresa,
  estab: string,
  d: ReturnType<typeof dadosOrdemEngarrafamento.parse>,
) {
  await carregarProjeto(ctx, d.projetoId, estab)
  const [p] = await ctx.tx
    .select({ id: s.produto.id, ativo: s.produto.ativo })
    .from(s.produto)
    .where(and(eq(s.produto.id, d.produtoId), eq(s.produto.empresaId, ctx.empresaId)))
  if (!p || !p.ativo) throw new ErroRegra('Produto inválido.', 'produto')
  let rotuloId = d.rotuloId ?? null
  if (rotuloId) {
    const [r] = await ctx.tx
      .select({ produtoId: s.produtoRotulo.produtoId })
      .from(s.produtoRotulo)
      .where(eq(s.produtoRotulo.id, rotuloId))
    if (r?.produtoId !== d.produtoId) throw new ErroRegra('Rótulo de outro produto.', 'rotulo')
  } else {
    // O rótulo vigente na data prevista.
    const [r] = await ctx.tx
      .select({ id: s.produtoRotulo.id })
      .from(s.produtoRotulo)
      .where(
        and(
          eq(s.produtoRotulo.produtoId, d.produtoId),
          sql`${s.produtoRotulo.vigenteDesde} <= ${d.dataPrevista}`,
          sql`(${s.produtoRotulo.vigenteAte} is null or ${s.produtoRotulo.vigenteAte} >= ${d.dataPrevista})`,
        ),
      )
      .orderBy(sql`${s.produtoRotulo.vigenteDesde} desc`)
      .limit(1)
    rotuloId = r?.id ?? null
  }
  const formatos = await formatosDoProduto(ctx, d.produtoId)
  for (const f of d.formatos)
    if (!formatos.some((x) => x.id === f.formatoId && x.ativo))
      throw new ErroRegra('Formato inválido para o produto.', 'formato')
  const vinho = await vinhoDoProjeto(ctx, d.projetoId)
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
  const sem = recipientes.filter((r) => !vinho.some((v) => v.recipienteId === r.id))
  if (sem.length)
    throw new ErroRegra(
      `${sem.map((r) => r.codigo).join(', ')} sem vinho do projeto.`,
      'recipiente_sem_vinho',
    )
  const locais = await ctx.tx
    .select({ id: s.local.id })
    .from(s.local)
    .where(
      and(
        inArray(s.local.id, [d.localProdutoId, d.localMateriaisId]),
        eq(s.local.estabelecimentoId, estab),
        inArray(s.local.uso, ['estoque', 'ambos']),
        eq(s.local.moduloEstoque, 'ENOTRACE'),
      ),
    )
  if (locais.length !== new Set([d.localProdutoId, d.localMateriaisId]).size)
    throw new ErroRegra('Escolha locais de estoque do EnoTrace neste estabelecimento.', 'local')
  await conferirPessoas(ctx, [d.engarrafadoPorId])
  return { rotuloId }
}

async function gravarDetalhes(
  ctx: ContextoEmpresa,
  ordemId: string,
  d: ReturnType<typeof dadosOrdemEngarrafamento.parse>,
) {
  await ctx.tx.delete(s.ordemFormato).where(eq(s.ordemFormato.ordemId, ordemId))
  await ctx.tx.delete(s.ordemOrigem).where(eq(s.ordemOrigem.ordemId, ordemId))
  await ctx.tx.insert(s.ordemFormato).values(
    d.formatos.map((f) => ({
      empresaId: ctx.empresaId,
      ordemId,
      formatoId: f.formatoId,
      garrafasPrevistas: f.garrafasPrevistas,
    })),
  )
  await ctx.tx
    .insert(s.ordemOrigem)
    .values(d.recipientes.map((r) => ({ empresaId: ctx.empresaId, ordemId, recipienteId: r })))
}

/** Muda a situação do projeto com o envase (cantina.md, Do "pronto para envase" ao envase). */
async function situacaoDoProjeto(ctx: ContextoEmpresa, projetoId: string) {
  const [p] = await ctx.tx
    .select({ situacao: s.projeto.situacao })
    .from(s.projeto)
    .where(eq(s.projeto.id, projetoId))
  if (!p || ['encerrado', 'cancelado'].includes(p.situacao)) return
  const [r] = (
    await ctx.tx.execute<{ abertas: number; saldo: string }>(sql`
      select (select count(*)::int from ordem_engarrafamento where projeto_id = ${projetoId}
                and situacao in ('planejada', 'em_execucao')) as abertas,
             coalesce((select sum(m.litros) from movimento_volume m join lote l on l.id = m.lote_id
                where l.projeto_id = ${projetoId}), 0)::text as saldo`)
  ).rows
  let nova = p.situacao
  if (Number(r!.saldo) <= 0 && p.situacao !== 'planejado') nova = 'engarrafado'
  else if (r!.abertas > 0) nova = 'envase_planejado'
  else if (['envase_planejado', 'engarrafado'].includes(p.situacao)) nova = 'pronto_envase'
  if (nova === p.situacao) return
  await ctx.tx
    .update(s.projeto)
    .set({ situacao: nova, situacaoDesde: sql`now()`, versao: sql`${s.projeto.versao} + 1` })
    .where(eq(s.projeto.id, projetoId))
  await ctx.auditar({
    acao: 'situacao',
    entidade: 'projeto',
    registroId: projetoId,
    antes: { situacao: p.situacao },
    depois: { situacao: nova },
    motivo: 'Envase',
  })
}

// Produção do dia --------------------------------------------------------------------------------

/**
 * Laudo do teor alcoólico (cantina.md, Laudo fora do padrão): a análise mais recente de cada lote
 * comparada ao rótulo, com ±0,5% vol (IN MAPA 14/2018, art. 11, §4º). Alerta, ou bloqueio se a
 * empresa ligar; laudo de laboratório sem credenciamento também alerta.
 */
async function conferirLaudo(
  ctx: ContextoEmpresa,
  lotes: string[],
  rotuloId: string | null,
  em: Date,
): Promise<{ avisos: Aviso[]; bloqueios: string[] }> {
  const avisos: Aviso[] = []
  const bloqueios: string[] = []
  if (!rotuloId || !lotes.length) return { avisos, bloqueios }
  const [rotulo] = await ctx.tx
    .select({ teor: s.produtoRotulo.teorAlcoolico, versao: s.produtoRotulo.versao })
    .from(s.produtoRotulo)
    .where(eq(s.produtoRotulo.id, rotuloId))
  if (!rotulo) return { avisos, bloqueios }
  const { bloquearLaudo } = await lerParametro(ctx, 'envase')
  const r = await ctx.tx.execute<{
    lote: string
    valor: string
    laboratorio_id: string | null
    tipo: string
  }>(sql`
    select distinct on (a.lote_id) l.codigo as lote, ar.valor::text as valor, a.laboratorio_id, a.tipo
    from analise a join analise_resultado ar on ar.analise_id = a.id
      join parametro_analise p on p.id = ar.parametro_id and p.codigo = 'teor_alcoolico'
      join lote l on l.id = a.lote_id
    where a.lote_id in ${sql.raw(`(${lotes.map((x) => `'${x}'`).join(',')})`)} and a.amostra_em <= ${em}
    order by a.lote_id, a.amostra_em desc`)
  const declarado = Number(rotulo.teor)
  for (const x of r.rows) {
    const medido = Number(x.valor)
    if (Math.abs(medido - declarado) > 0.5) {
      const msg = `O lote ${x.lote} tem ${medido.toLocaleString('pt-BR')}% vol na última análise; o rótulo ${rotulo.versao} declara ${declarado.toLocaleString('pt-BR')}% vol (tolerância de 0,5% vol).`
      if (bloquearLaudo) bloqueios.push(msg)
      else
        avisos.push({
          codigo: `laudo_teor:${x.lote}`,
          mensagem: msg,
          fonte: 'IN MAPA 14/2018, art. 11, §4º',
        })
    }
    if (x.tipo === 'laudo' && x.laboratorio_id) {
      for (const m of await conferirLaboratorio(ctx, x.laboratorio_id, em))
        avisos.push({ codigo: `laboratorio:${x.laboratorio_id}`, mensagem: m })
    }
  }
  return { avisos, bloqueios }
}

/** Monta a operação de engarrafamento do dia; com o lote comercial, também a entrada do produto. */
async function montarProducao(
  ctx: ContextoEmpresa,
  ordem: typeof s.ordemEngarrafamento.$inferSelect,
  corpo: unknown,
  loteComercial: { codigo: string } | null,
) {
  if (!['planejada', 'em_execucao'].includes(ordem.situacao))
    throw new ErroRegra('A ordem não está aberta.', 'situacao')
  const d = producaoEngarrafamento.parse(corpo)
  const executadoEm = dataExecucao(d.executadoEm)
  await conferirPessoas(ctx, [d.responsavelId, d.executadoPorId])
  const origens = (
    await ctx.tx
      .select({ id: s.ordemOrigem.recipienteId })
      .from(s.ordemOrigem)
      .where(eq(s.ordemOrigem.ordemId, ordem.id))
  ).map((o) => o.id)
  if (d.recipientes.some((r) => !origens.includes(r.recipienteId)))
    throw new ErroRegra('Recipiente fora da ordem: inclua-o na ordem antes.', 'recipiente')
  const formatosOrdem = await ctx.tx
    .select({
      formatoId: s.ordemFormato.formatoId,
      volumeMl: s.produtoFormato.volumeMl,
      itemEstoqueId: s.produtoFormato.itemEstoqueId,
    })
    .from(s.ordemFormato)
    .innerJoin(s.produtoFormato, eq(s.produtoFormato.id, s.ordemFormato.formatoId))
    .where(eq(s.ordemFormato.ordemId, ordem.id))
  if (d.formatos.some((f) => !formatosOrdem.some((x) => x.formatoId === f.formatoId)))
    throw new ErroRegra('Formato fora da ordem.', 'formato')

  const ids = d.recipientes.map((r) => r.recipienteId)
  const naData = await saldosNaData(ctx, ids, executadoEm)
  const lotes = naData.length
    ? await ctx.tx
        .select({ id: s.lote.id, projetoId: s.lote.projetoId, titularId: s.lote.titularId })
        .from(s.lote)
        .where(
          inArray(
            s.lote.id,
            naData.map((x) => x.loteId),
          ),
        )
    : []
  const nomes = new Map(
    (
      await ctx.tx
        .select({ id: s.recipiente.id, codigo: s.recipiente.codigo })
        .from(s.recipiente)
        .where(inArray(s.recipiente.id, ids))
    ).map((r) => [r.id, r.codigo]),
  )
  const linhas: LinhaOperacao[] = []
  const lancamentos: Lancamento[] = []
  let tirados = 0
  for (const [n, r] of d.recipientes.entries()) {
    const parte = naData.find((x) => x.recipienteId === r.recipienteId)
    const l = parte && lotes.find((x) => x.id === parte.loteId)
    if (!parte || l?.projetoId !== ordem.projetoId)
      throw new ErroRegra(
        `${nomes.get(r.recipienteId) ?? ''} não tem vinho do projeto na data da execução.`,
        'recipiente_sem_vinho',
      )
    const cl = paraCentilitros(r.litros)
    tirados += cl
    linhas.push({
      ordem: n + 1,
      papel: 'origem',
      recipienteId: r.recipienteId,
      lote: { id: parte.loteId },
      centilitros: cl,
    })
    lancamentos.push({
      recipienteId: r.recipienteId,
      lote: { id: parte.loteId },
      centilitros: -cl,
      tipo: 'engarrafamento',
      linha: n + 1,
    })
  }
  const engarrafados = d.formatos.reduce(
    (t, f) =>
      t + (f.garrafas * formatosOrdem.find((x) => x.formatoId === f.formatoId)!.volumeMl) / 10,
    0,
  )
  if (engarrafados > tirados)
    throw new ErroRegra(
      `As garrafas somam ${deCentilitros(Math.round(engarrafados)).replace('.', ',')} L, mais que os ${deCentilitros(tirados).replace('.', ',')} L tirados dos recipientes.`,
      'garrafas_demais',
    )

  // Materiais: previsto pela ficha, real informado (P29: o usuário ajusta quebras e perdas).
  const previstos = await materiaisPrevistos(
    ctx,
    d.formatos.map((f) => ({ formatoId: f.formatoId, garrafas: f.garrafas })),
  )
  const informados = new Map(d.materiais.map((m) => [m.itemId, m]))
  const extras = d.materiais.filter((m) => !previstos.some((p) => p.itemId === m.itemId))
  const materiais = [
    ...previstos.map((p) => ({
      itemId: p.itemId,
      previsto: p.previsto,
      real: informados.get(p.itemId)?.real ?? p.previsto,
      loteItemId: informados.get(p.itemId)?.loteItemId ?? null,
    })),
    ...extras.map((m) => ({
      itemId: m.itemId,
      previsto: '0.000',
      real: m.real,
      loteItemId: m.loteItemId ?? null,
    })),
  ]
  const estoque: MovimentoNovo[] = materiais
    .filter((m) => paraMil(m.real) > 0)
    .map((m) => ({
      localId: ordem.localMateriaisId,
      itemId: m.itemId,
      loteItemId: m.loteItemId,
      quantidade: deMil(-paraMil(m.real)),
      tipo: 'consumo_envase' as const,
      documento: loteComercial?.codigo ?? null,
    }))
  if (loteComercial) {
    for (const f of d.formatos) {
      const x = formatosOrdem.find((y) => y.formatoId === f.formatoId)!
      estoque.push({
        localId: ordem.localProdutoId,
        itemId: x.itemEstoqueId,
        loteItemId: await obterLote(
          ctx,
          ordem.estabelecimentoId,
          x.itemEstoqueId,
          { codigo: loteComercial.codigo },
          'producao',
          lotes[0]?.titularId ?? null,
        ),
        quantidade: String(f.garrafas),
        tipo: 'producao',
        documento: loteComercial.codigo,
      })
    }
  }
  const laudo = await conferirLaudo(
    ctx,
    [...new Set(lancamentos.map((l) => ('id' in l.lote ? l.lote.id : '')))],
    ordem.rotuloId,
    executadoEm,
  )
  if (laudo.bloqueios.length) throw new ErroRegra(laudo.bloqueios[0]!, 'laudo')

  return {
    d,
    tirados,
    engarrafados: Math.round(engarrafados),
    materiais,
    titularId: lotes[0]?.titularId ?? null,
    plano: {
      tipo: 'engarrafamento' as const,
      estabelecimentoId: ordem.estabelecimentoId,
      executadoEm,
      projetoId: ordem.projetoId,
      responsavelId: d.responsavelId ?? null,
      executadoPorId: d.executadoPorId ?? null,
      observacao: d.observacao ?? null,
      dados: {
        ordemId: ordem.id,
        loteComercial: loteComercial?.codigo ?? null,
        garrafas: d.formatos,
        perdaLitros: deCentilitros(tirados - Math.round(engarrafados)),
      },
      linhas,
      lancamentos,
      estoque,
      avisos: laudo.avisos,
    },
  }
}

/**
 * Refaz o lote comercial pelas produções não estornadas (03-modelo-de-dados.md, 5.6): composição
 * ponderada pelos litros tirados, datas do primeiro e do último envase, litros e lotes de origem.
 */
async function refazerLoteComercial(ctx: ContextoEmpresa, ordemId: string) {
  const [o] = await ctx.tx
    .select({ lote: s.ordemEngarrafamento.loteComercialId })
    .from(s.ordemEngarrafamento)
    .where(eq(s.ordemEngarrafamento.id, ordemId))
  if (!o?.lote) return
  const producoes = await ctx.tx
    .select({
      operacaoId: s.producaoParcial.operacaoId,
      executadoEm: s.producaoParcial.executadoEm,
      litrosTirados: s.producaoParcial.litrosTirados,
      litrosEngarrafados: s.producaoParcial.litrosEngarrafados,
      composicao: s.producaoParcial.composicao,
    })
    .from(s.producaoParcial)
    .innerJoin(s.operacao, eq(s.operacao.id, s.producaoParcial.operacaoId))
    .where(and(eq(s.producaoParcial.ordemId, ordemId), eq(s.operacao.situacao, 'confirmada')))
  const composicao = misturar(
    producoes.map((p) => ({
      centilitros: paraCentilitros(p.litrosTirados),
      composicao: p.composicao as Composicao,
    })),
  )
  const datas = producoes.map((p) => p.executadoEm.getTime())
  await ctx.tx
    .update(s.loteComercial)
    .set({
      composicao: producoes.length ? composicao : null,
      chaptalizado: composicao.chaptalizado,
      litros: deCentilitros(
        producoes.reduce((t, p) => t + paraCentilitros(p.litrosEngarrafados), 0),
      ),
      primeiroEnvase: datas.length ? new Date(Math.min(...datas)) : null,
      ultimoEnvase: datas.length ? new Date(Math.max(...datas)) : null,
    })
    .where(eq(s.loteComercial.id, o.lote))
  await ctx.tx
    .delete(s.loteComercialOrigem)
    .where(eq(s.loteComercialOrigem.loteComercialId, o.lote))
  const ops = producoes.map((p) => p.operacaoId)
  if (ops.length) {
    const origem = await ctx.tx
      .select({
        loteId: s.movimentoVolume.loteId,
        litros: sql<string>`(-sum(${s.movimentoVolume.litros}))::text`,
      })
      .from(s.movimentoVolume)
      .where(
        and(
          inArray(s.movimentoVolume.operacaoId, ops),
          eq(s.movimentoVolume.tipo, 'engarrafamento'),
        ),
      )
      .groupBy(s.movimentoVolume.loteId)
    if (origem.length)
      await ctx.tx.insert(s.loteComercialOrigem).values(
        origem.map((x) => ({
          loteComercialId: o.lote!,
          empresaId: ctx.empresaId,
          loteId: x.loteId,
          litros: x.litros,
        })),
      )
  }
}

/** Depois do estorno de uma produção: refaz o lote comercial, a ordem e o projeto. */
export async function aposEstornoEngarrafamento(ctx: ContextoEmpresa, operacaoId: string) {
  const [p] = await ctx.tx
    .select({ ordemId: s.producaoParcial.ordemId })
    .from(s.producaoParcial)
    .where(eq(s.producaoParcial.operacaoId, operacaoId))
  if (!p) return
  // Os selos numerados da produção estornada voltam a ficar disponíveis.
  await liberarSelosDaProducao(ctx, operacaoId)
  await refazerLoteComercial(ctx, p.ordemId)
  const ordem = await carregarOrdem(ctx, p.ordemId, true)
  const [r] = (
    await ctx.tx.execute<{ ativas: number }>(sql`
      select count(*)::int as ativas from producao_parcial pp join operacao o on o.id = pp.operacao_id
      where pp.ordem_id = ${ordem.id} and o.situacao = 'confirmada'`)
  ).rows
  if (ordem.situacao === 'em_execucao' && !r!.ativas)
    await ctx.tx
      .update(s.ordemEngarrafamento)
      .set({ situacao: 'planejada', versao: sql`${s.ordemEngarrafamento.versao} + 1` })
      .where(eq(s.ordemEngarrafamento.id, ordem.id))
  await situacaoDoProjeto(ctx, ordem.projetoId)
}

// Rotas ------------------------------------------------------------------------------------------

export async function rotasEngarrafamento(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  app.post('/api/engarrafamento/previsao', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => preverEnvase(ctx, req.body)),
  )

  app.get('/api/engarrafamento/ordens', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const { situacao } = z
        .object({ situacao: z.enum(['abertas', 'todas']).default('todas') })
        .parse(req.query)
      const r = await ctx.tx.execute<Record<string, unknown>>(sql`
        select o.id, o.situacao, o.data_prevista as "dataPrevista",
          p.codigo as projeto, p.nome as "projetoNome", pr.nome as produto, lc.codigo as "loteComercial",
          (select coalesce(sum(garrafas_previstas), 0)::int from ordem_formato f where f.ordem_id = o.id) as previstas,
          (select coalesce(sum(pf.garrafas), 0)::int from producao_parcial pp
             join producao_formato pf on pf.producao_id = pp.id
             join operacao op on op.id = pp.operacao_id and op.situacao = 'confirmada'
           where pp.ordem_id = o.id) as produzidas
        from ordem_engarrafamento o join projeto p on p.id = o.projeto_id join produto pr on pr.id = o.produto_id
          left join lote_comercial lc on lc.id = o.lote_comercial_id
        where o.estabelecimento_id = ${estab}
          ${situacao === 'abertas' ? sql`and o.situacao in ('planejada', 'em_execucao')` : sql``}
        order by o.data_prevista desc, o.criado_em desc
        limit 500`)
      return r.rows
    }),
  )

  app.post('/api/engarrafamento/ordens', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const d = dadosOrdemEngarrafamento.parse(req.body)
      const { rotuloId } = await conferirOrdem(ctx, estab, d)
      const [o] = await ctx.tx
        .insert(s.ordemEngarrafamento)
        .values({
          empresaId: ctx.empresaId,
          estabelecimentoId: estab,
          projetoId: d.projetoId,
          produtoId: d.produtoId,
          rotuloId,
          dataPrevista: d.dataPrevista,
          engarrafadoPorId: d.engarrafadoPorId ?? null,
          localProdutoId: d.localProdutoId,
          localMateriaisId: d.localMateriaisId,
          observacao: d.observacao ?? null,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.ordemEngarrafamento.id })
      await gravarDetalhes(ctx, o!.id, d)
      await situacaoDoProjeto(ctx, d.projetoId)
      await ctx.auditar({
        acao: 'criar',
        entidade: 'ordem_engarrafamento',
        registroId: o!.id,
        depois: d,
      })
      return { id: o!.id }
    }),
  )

  app.put<{ Params: { id: string } }>('/api/engarrafamento/ordens/:id', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const atual = await carregarOrdem(ctx, z.uuid().parse(req.params.id), true)
      if (!['planejada', 'em_execucao'].includes(atual.situacao))
        throw new ErroRegra('A ordem não está aberta.', 'situacao')
      const d = dadosOrdemEngarrafamento.parse(req.body)
      conferirVersao(atual.versao, d.versao)
      if (d.projetoId !== atual.projetoId || d.produtoId !== atual.produtoId) {
        const [tem] = (
          await ctx.tx.execute<{ n: number }>(
            sql`select count(*)::int as n from producao_parcial where ordem_id = ${atual.id}`,
          )
        ).rows
        if (tem!.n)
          throw new ErroRegra('A ordem já tem produção: o projeto e o produto ficam.', 'producao')
      }
      // Formato com garrafas produzidas não sai da ordem.
      const produzidos = (
        await ctx.tx.execute<{ formato_id: string }>(sql`
          select distinct pf.formato_id from producao_formato pf join producao_parcial pp on pp.id = pf.producao_id
          where pp.ordem_id = ${atual.id}`)
      ).rows.map((x) => x.formato_id)
      if (produzidos.some((f) => !d.formatos.some((x) => x.formatoId === f)))
        throw new ErroRegra('Formato com garrafas produzidas não sai da ordem.', 'formato')
      const { rotuloId } = await conferirOrdem(ctx, estab, d)
      await ctx.tx
        .update(s.ordemEngarrafamento)
        .set({
          projetoId: d.projetoId,
          produtoId: d.produtoId,
          rotuloId,
          dataPrevista: d.dataPrevista,
          engarrafadoPorId: d.engarrafadoPorId ?? null,
          localProdutoId: d.localProdutoId,
          localMateriaisId: d.localMateriaisId,
          observacao: d.observacao ?? null,
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.ordemEngarrafamento.versao} + 1`,
        })
        .where(eq(s.ordemEngarrafamento.id, atual.id))
      await gravarDetalhes(ctx, atual.id, d)
      if (d.projetoId !== atual.projetoId) await situacaoDoProjeto(ctx, atual.projetoId)
      await situacaoDoProjeto(ctx, d.projetoId)
      await ctx.auditar({
        acao: 'editar',
        entidade: 'ordem_engarrafamento',
        registroId: atual.id,
        depois: d,
      })
      return { ok: true }
    }),
  )

  app.get<{ Params: { id: string } }>('/api/engarrafamento/ordens/:id', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const o = await carregarOrdem(ctx, z.uuid().parse(req.params.id))
      const [cab] = (
        await ctx.tx.execute<Record<string, unknown>>(sql`
          select p.codigo as projeto, p.nome as "projetoNome", pr.nome as produto,
            r.versao as rotulo, r.teor_alcoolico::text as "teorDeclarado",
            (select f.nome from pessoa pe join ficha f on f.id = pe.ficha_id where pe.id = ${o.engarrafadoPorId}) as "engarrafadoPor",
            (select nome from local where id = ${o.localProdutoId}) as "localProduto",
            (select nome from local where id = ${o.localMateriaisId}) as "localMateriais"
          from projeto p, produto pr left join produto_rotulo r on r.id = ${o.rotuloId}
          where p.id = ${o.projetoId} and pr.id = ${o.produtoId}`)
      ).rows
      const formatos = await ctx.tx.execute<Record<string, unknown>>(sql`
        select f.formato_id as "formatoId", pf.volume_ml as "volumeMl", i.nome, f.garrafas_previstas as previstas,
          (select coalesce(sum(x.garrafas), 0)::int from producao_formato x join producao_parcial pp on pp.id = x.producao_id
             join operacao op on op.id = pp.operacao_id and op.situacao = 'confirmada'
           where pp.ordem_id = ${o.id} and x.formato_id = f.formato_id) as produzidas
        from ordem_formato f join produto_formato pf on pf.id = f.formato_id join item_estoque i on i.id = pf.item_estoque_id
        where f.ordem_id = ${o.id} order by pf.volume_ml`)
      const vinho = await vinhoDoProjeto(ctx, o.projetoId)
      const origens = (
        await ctx.tx
          .select({ recipienteId: s.ordemOrigem.recipienteId, codigo: s.recipiente.codigo })
          .from(s.ordemOrigem)
          .innerJoin(s.recipiente, eq(s.recipiente.id, s.ordemOrigem.recipienteId))
          .where(eq(s.ordemOrigem.ordemId, o.id))
          .orderBy(asc(s.recipiente.codigo))
      ).map((x) => {
        const v = vinho.find((y) => y.recipienteId === x.recipienteId)
        return {
          ...x,
          litros: v?.litros ?? '0.00',
          lote: v?.lote ?? null,
          loteId: v?.loteId ?? null,
        }
      })
      const producoes = await ctx.tx.execute<Record<string, unknown>>(sql`
        select pp.id, pp.operacao_id as "operacaoId", op.codigo, op.situacao, pp.executado_em as "executadoEm",
          pp.litros_tirados as "litrosTirados", pp.litros_engarrafados as "litrosEngarrafados", pp.perda_litros as "perdaLitros",
          (select json_agg(json_build_object('formatoId', x.formato_id, 'garrafas', x.garrafas)) from producao_formato x where x.producao_id = pp.id) as formatos,
          (select json_agg(json_build_object('item', i.nome, 'unidade', i.unidade_base, 'previsto', m.previsto::text, 'real', m.real::text))
             from producao_material m join item_estoque i on i.id = m.item_id where m.producao_id = pp.id) as materiais
        from producao_parcial pp join operacao op on op.id = pp.operacao_id
        where pp.ordem_id = ${o.id} order by pp.executado_em`)
      const lote = o.loteComercialId
        ? (
            await ctx.tx
              .select()
              .from(s.loteComercial)
              .where(eq(s.loteComercial.id, o.loteComercialId))
          )[0]
        : null
      const origensLote = lote
        ? await ctx.tx
            .select({
              loteId: s.loteComercialOrigem.loteId,
              codigo: s.lote.codigo,
              litros: s.loteComercialOrigem.litros,
            })
            .from(s.loteComercialOrigem)
            .innerJoin(s.lote, eq(s.lote.id, s.loteComercialOrigem.loteId))
            .where(eq(s.loteComercialOrigem.loteComercialId, lote.id))
        : []
      // Materiais do que falta engarrafar, para comprar a tempo (P20).
      const faltam = (
        formatos.rows as Array<{ formatoId: string; previstas: number; produzidas: number }>
      ).map((f) => ({ formatoId: f.formatoId, garrafas: Math.max(0, f.previstas - f.produzidas) }))
      const materiais = await materiaisPrevistos(ctx, faltam)
      const saldos = await saldosDeItens(
        ctx,
        o.estabelecimentoId,
        materiais.map((m) => m.itemId),
        o.localMateriaisId,
      )
      return {
        ...o,
        ...cab,
        formatos: formatos.rows,
        origens,
        producoes: producoes.rows,
        loteComercial: lote ? { ...lote, origens: origensLote } : null,
        materiais: materiais.map((m) => {
          const saldo = saldos.get(m.itemId) ?? '0'
          return {
            ...m,
            saldo: deMil(paraMil(saldo)),
            falta: deMil(Math.max(0, paraMil(m.previsto) - paraMil(saldo))),
          }
        }),
      }
    }),
  )

  /** Prévia da produção do dia: volumes, materiais previsto × real, perda e avisos. */
  app.post<{ Params: { id: string } }>(
    '/api/engarrafamento/ordens/:id/producoes/previa',
    async (req) =>
      naEmpresa(db, req, [F, 'criar'], async (ctx) => {
        const ordem = await carregarOrdem(ctx, z.uuid().parse(req.params.id))
        const m = await montarProducao(ctx, ordem, req.body, null)
        const { previa } = await preparar(ctx, m.plano, { travar: false })
        const itens = m.materiais.length
          ? await ctx.tx
              .select({
                id: s.itemEstoque.id,
                nome: s.itemEstoque.nome,
                unidade: s.itemEstoque.unidadeBase,
              })
              .from(s.itemEstoque)
              .where(
                inArray(
                  s.itemEstoque.id,
                  m.materiais.map((x) => x.itemId),
                ),
              )
          : []
        return {
          ...previa,
          litrosTirados: deCentilitros(m.tirados),
          litrosEngarrafados: deCentilitros(m.engarrafados),
          perdaLitros: deCentilitros(m.tirados - m.engarrafados),
          materiais: m.materiais.map((x) => {
            const i = itens.find((y) => y.id === x.itemId)
            return { ...x, nome: i?.nome ?? '', unidade: i?.unidade ?? '' }
          }),
        }
      }),
  )

  app.post<{ Params: { id: string } }>('/api/engarrafamento/ordens/:id/producoes', async (req) =>
    naEmpresa(db, req, [F, 'confirmar'], async (ctx) => {
      const ordem = await carregarOrdem(ctx, z.uuid().parse(req.params.id), true)
      // Lote comercial na primeira produção: L + ano do envase + sequência (cantina.md, Códigos).
      let lote: { id: string; codigo: string }
      if (ordem.loteComercialId) {
        const [l] = await ctx.tx
          .select({ id: s.loteComercial.id, codigo: s.loteComercial.codigo })
          .from(s.loteComercial)
          .where(eq(s.loteComercial.id, ordem.loteComercialId))
        lote = l!
      } else {
        const previa = await montarProducao(ctx, ordem, req.body, null)
        const [estab] = await ctx.tx
          .select({ fuso: s.estabelecimento.fuso })
          .from(s.estabelecimento)
          .where(eq(s.estabelecimento.id, ordem.estabelecimentoId))
        const codigo = await codigoComPrefixo(
          ctx,
          previa.titularId,
          previa.plano.executadoEm,
          await proximoCodigo(ctx, {
            estabelecimentoId: ordem.estabelecimentoId,
            tipo: 'lote_comercial',
            ano: anoNoFuso(previa.plano.executadoEm, estab!.fuso),
          }),
        )
        const [l] = await ctx.tx
          .insert(s.loteComercial)
          .values({
            empresaId: ctx.empresaId,
            estabelecimentoId: ordem.estabelecimentoId,
            codigo,
            projetoId: ordem.projetoId,
            produtoId: ordem.produtoId,
            titularId: previa.titularId,
            origem: 'envase',
            criadoPor: ctx.usuarioId,
          })
          .returning({ id: s.loteComercial.id, codigo: s.loteComercial.codigo })
        lote = l!
        await ctx.tx
          .update(s.ordemEngarrafamento)
          .set({ loteComercialId: lote.id })
          .where(eq(s.ordemEngarrafamento.id, ordem.id))
      }
      const m = await montarProducao(ctx, ordem, req.body, lote)
      // Composição do que sai de cada recipiente, antes da operação (5.6).
      const partes = await partesAtuais(
        ctx,
        m.d.recipientes.map((r) => r.recipienteId),
      )
      const composicao = misturar(
        m.d.recipientes.map((r) => ({
          centilitros: paraCentilitros(r.litros),
          composicao: partes.get(r.recipienteId)?.composicao ?? {
            componentes: [],
            chaptalizado: false,
          },
        })),
      )
      const op = await confirmar(ctx, m.plano, m.d.cientes)
      const [pp] = await ctx.tx
        .insert(s.producaoParcial)
        .values({
          empresaId: ctx.empresaId,
          ordemId: ordem.id,
          operacaoId: op.operacaoId,
          executadoEm: m.plano.executadoEm,
          litrosTirados: deCentilitros(m.tirados),
          litrosEngarrafados: deCentilitros(m.engarrafados),
          perdaLitros: deCentilitros(m.tirados - m.engarrafados),
          composicao,
        })
        .returning({ id: s.producaoParcial.id })
      await ctx.tx.insert(s.producaoFormato).values(
        m.d.formatos.map((f) => ({
          empresaId: ctx.empresaId,
          producaoId: pp!.id,
          formatoId: f.formatoId,
          garrafas: f.garrafas,
        })),
      )
      if (m.materiais.length)
        await ctx.tx.insert(s.producaoMaterial).values(
          m.materiais.map((x) => ({
            empresaId: ctx.empresaId,
            producaoId: pp!.id,
            itemId: x.itemId,
            loteItemId: x.loteItemId,
            previsto: x.previsto,
            real: deMil(paraMil(x.real)),
          })),
        )
      if (ordem.situacao === 'planejada')
        await ctx.tx
          .update(s.ordemEngarrafamento)
          .set({ situacao: 'em_execucao', versao: sql`${s.ordemEngarrafamento.versao} + 1` })
          .where(eq(s.ordemEngarrafamento.id, ordem.id))
      await refazerLoteComercial(ctx, ordem.id)
      await situacaoDoProjeto(ctx, ordem.projetoId)
      return { ...op, loteComercial: lote.codigo, producaoId: pp!.id }
    }),
  )

  app.post<{ Params: { id: string } }>('/api/engarrafamento/ordens/:id/encerrar', async (req) =>
    naEmpresa(db, req, [F, 'confirmar'], async (ctx) => {
      const o = await carregarOrdem(ctx, z.uuid().parse(req.params.id), true)
      if (o.situacao !== 'em_execucao')
        throw new ErroRegra('Só a ordem em execução se encerra.', 'situacao')
      await ctx.tx
        .update(s.ordemEngarrafamento)
        .set({
          situacao: 'encerrada',
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.ordemEngarrafamento.versao} + 1`,
        })
        .where(eq(s.ordemEngarrafamento.id, o.id))
      await situacaoDoProjeto(ctx, o.projetoId)
      await ctx.auditar({ acao: 'encerrar', entidade: 'ordem_engarrafamento', registroId: o.id })
      return { ok: true }
    }),
  )

  /** Cancelar: só sem produção confirmada (as estornadas não contam). */
  app.post<{ Params: { id: string } }>('/api/engarrafamento/ordens/:id/cancelar', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const o = await carregarOrdem(ctx, z.uuid().parse(req.params.id), true)
      const { motivo } = estornoOperacao.parse(req.body)
      if (!['planejada', 'em_execucao'].includes(o.situacao))
        throw new ErroRegra('A ordem não está aberta.', 'situacao')
      const ativas = await ctx.tx
        .select({ id: s.producaoParcial.id })
        .from(s.producaoParcial)
        .innerJoin(s.operacao, eq(s.operacao.id, s.producaoParcial.operacaoId))
        .where(and(eq(s.producaoParcial.ordemId, o.id), ne(s.operacao.situacao, 'estornada')))
      if (ativas.length)
        throw new ErroRegra(
          'A ordem tem produção: estorne as produções antes, ou encerre a ordem.',
          'producao',
        )
      await ctx.tx
        .update(s.ordemEngarrafamento)
        .set({
          situacao: 'cancelada',
          motivoCancelamento: motivo,
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.ordemEngarrafamento.versao} + 1`,
        })
        .where(eq(s.ordemEngarrafamento.id, o.id))
      await situacaoDoProjeto(ctx, o.projetoId)
      await ctx.auditar({
        acao: 'cancelar',
        entidade: 'ordem_engarrafamento',
        registroId: o.id,
        motivo,
      })
      return { ok: true }
    }),
  )

  /** Lotes comerciais (cantina.md, Lote comercial), para a lista e as saídas. */
  app.get('/api/lotes-comerciais', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const r = await ctx.tx.execute<Record<string, unknown>>(sql`
        select lc.id, lc.codigo, lc.litros, lc.primeiro_envase as "primeiroEnvase", lc.ultimo_envase as "ultimoEnvase",
          lc.chaptalizado, lc.composicao, pr.nome as produto, p.codigo as projeto, o.id as "ordemId"
        from lote_comercial lc left join produto pr on pr.id = lc.produto_id
          left join projeto p on p.id = lc.projeto_id
          left join ordem_engarrafamento o on o.lote_comercial_id = lc.id
        where lc.estabelecimento_id = ${estab}
        order by lc.codigo desc limit 500`)
      return r.rows.map((x) => ({
        ...x,
        safra: x.composicao ? safraCicloPredominante(x.composicao as Composicao)?.safra : null,
      }))
    }),
  )
}
