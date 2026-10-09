// EnoTrace › Operações: desengace/esmagamento e prensagem (cantina.md, Desengace, esmagamento e
// prensagem; Quilos → litros; 03-modelo-de-dados.md, 4.2 e 5.2), rascunho e estorno (cantina.md,
// Regras comuns das operações; 4.5). Cada rota monta o plano da operação; o motor confere, calcula
// a composição e grava (motor.ts).
import {
  consultaListagem,
  deCentilitros,
  desengace as esquemaDesengace,
  estornoOperacao,
  misturar,
  paraCentilitros,
  prensagem as esquemaPrensagem,
  rascunhoOperacao,
  TIPOS_MOVIMENTO,
  TIPOS_OPERACAO,
} from '@vinicycle/shared'
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../../db/schema'
import { exigeAprovacao, pedirAprovacao } from '../../nucleo/aprovacoes'
import { conferirVersao } from '../../nucleo/entidades'
import { ErroNaoEncontrado, ErroRegra } from '../../nucleo/erros'
import { buscaTexto, listar } from '../../nucleo/listagem'
import type { Aviso } from '../../nucleo/regras'
import { type ContextoEmpresa, naEmpresa } from '../../nucleo/requisicao'
import {
  aplicarInsumos,
  avisoRendimento,
  carregarProjeto,
  codigosDeLotes,
  composicaoDoItem,
  conferirEtapaPlano,
  conferirLoteExistente,
  conferirPessoas,
  dataExecucao,
  fusoDo,
  type ItemUva,
  itensUva,
  type Montada,
  rendimentos,
  repartir,
  saldosPorLote,
  titularUnico,
  tratarLoteNoDestino,
} from './apoio'
import {
  confirmar,
  estornar,
  type Lancamento,
  type LigacaoGenealogia,
  type LinhaOperacao,
  type LoteNovo,
  type PlanoOperacao,
  preparar,
  type Previa,
  previaEstorno,
  type RefLote,
} from './motor'
import { partesComSaldo, rotulo } from './consultas'
import { planoAtesto, planoCorte, planoPerda, planoTrasfega } from './movimentos'
import { aposEstornoEngarrafamento } from './engarrafamento'
import { antesEstornoTiragem, aposEstornoTiragem } from './espumantes'
import { planoFermentacao } from './fermentacoes'
import { granelDaOperacao, planoEntradaGranel, planoSaidaGranel } from './granel'
import { planoHigienizacao } from './painel'
import { planoTitularidade, registrarTitularidade, titularidadeDaOperacao } from './titularidade'
import { planoAdicao, planoChaptalizacao, planoTratamento } from './tratamentos'

const F = 'enotrace.operacoes'
const decikg = (kg: string | number) => Math.round(Number(kg) * 10)

/** Monta o plano da operação e acrescenta os insumos aplicados junto (aplicarInsumos). */
async function montarComInsumos(
  ctx: ContextoEmpresa,
  montar: (ctx: ContextoEmpresa, corpo: unknown) => Promise<Montada>,
  corpo: unknown,
): Promise<Montada> {
  const m = await montar(ctx, corpo)
  if (m.insumos) await aplicarInsumos(ctx, m.plano, m.insumos)
  return m
}

// Prévia do corte ------------------------------------------------------------------------------

/**
 * Composição de cada lote que recebe vinho e o que o rótulo pode declarar (cantina.md, Corte:
 * prévia). Num lote existente, entram também as partes dele que a operação não toca (5.4).
 */
async function rotulosDosDestinos(ctx: ContextoEmpresa, plano: PlanoOperacao, previa: Previa) {
  const destinos = new Set(
    plano.linhas.filter((l) => l.papel === 'destino').map((l) => l.recipienteId),
  )
  const grupos = new Map<string, Previa['recipientes']>()
  for (const r of previa.recipientes) {
    if (!destinos.has(r.recipienteId) || !r.depois.lote || r.depois.litros === '0.00') continue
    const k = 'id' in r.depois.lote ? `id:${r.depois.lote.id}` : `novo:${r.depois.lote.novo}`
    grupos.set(k, [...(grupos.get(k) ?? []), r])
  }
  const resultado = []
  for (const [k, rs] of grupos) {
    const loteId = k.startsWith('id:') ? k.slice(3) : null
    const outras = loteId
      ? (await partesComSaldo(ctx, { loteIds: [loteId] })).filter(
          (p) => !previa.recipientes.some((r) => r.recipienteId === p.recipienteId),
        )
      : []
    const composicao = misturar([
      ...rs.map((r) => ({
        centilitros: paraCentilitros(r.depois.litros),
        composicao: r.depois.composicao,
      })),
      ...outras.map((p) => ({ centilitros: p.cl, composicao: p.composicao })),
    ])
    const [codigo] = loteId ? await codigosDeLotes(ctx, [loteId]).then((m) => [...m.values()]) : []
    resultado.push({
      lote: codigo ?? `novo ${k.slice(5)}`,
      recipientes: rs.map((r) => r.recipiente),
      composicao,
      rotulo: await rotulo(ctx, plano.estabelecimentoId, composicao),
    })
  }
  return resultado
}

// Desengace ------------------------------------------------------------------------------------

async function planoDesengace(ctx: ContextoEmpresa, corpo: unknown): Promise<Montada> {
  const estab = ctx.exigirEstabelecimento()
  const d = esquemaDesengace.parse(corpo)
  const executadoEm = dataExecucao(d.executadoEm)
  const projeto = await carregarProjeto(ctx, d.projetoId, estab)
  await conferirPessoas(ctx, [d.responsavelId, d.executadoPorId])
  await conferirEtapaPlano(ctx, d.planoEtapaId, projeto.id)

  const ids = [...new Set(d.consumos.map((c) => c.itemId))]
  if (ids.length !== d.consumos.length)
    throw new ErroRegra('O mesmo item aparece duas vezes.', 'item')
  const itens = await itensUva(ctx, ids)
  if (itens.some((i) => i.estab !== estab))
    throw new ErroRegra('Uva de outro estabelecimento.', 'item')
  const titularId = titularUnico(itens)
  const avisos: Aviso[] = itens
    .filter((i) => i.projetoId !== projeto.id)
    .map((i) => ({
      codigo: `projeto:${i.romaneioId}`,
      mensagem: `A uva do romaneio ${i.romaneio} foi recebida para outro projeto.`,
    }))
  const kgItem = new Map(d.consumos.map((c) => [c.itemId, decikg(c.kg)]))

  // Rendimento: kg × rendimento padrão, ou a estimativa digitada repartida na mesma proporção.
  const rendimento = await rendimentos(ctx, estab, projeto.cor)
  const digitados = d.destinos.filter((x) => x.litros)
  if (digitados.length && digitados.length !== d.destinos.length)
    throw new ErroRegra('Informe os litros de todos os recipientes, ou de nenhum.', 'litros')
  const semRendimento = itens.filter((i) => rendimento(i.variedadeId) === null)
  if (!digitados.length && semRendimento.length) {
    throw new ErroRegra(
      `Sem rendimento padrão para ${[...new Set(semRendimento.map((i) => i.variedade))].join(', ')}: informe os litros estimados de cada recipiente.`,
      'sem_rendimento',
    )
  }

  // kg de cada item em cada destino.
  const alocacao = new Map<string, number>() // `${item}|${recipiente}` → decikg
  if (d.reparticao.length) {
    for (const r of d.reparticao) {
      if (!kgItem.has(r.itemId) || !d.destinos.some((x) => x.recipienteId === r.recipienteId))
        throw new ErroRegra('Repartição com item ou recipiente fora da operação.', 'reparticao')
      const k = `${r.itemId}|${r.recipienteId}`
      alocacao.set(k, (alocacao.get(k) ?? 0) + decikg(r.kg))
    }
    for (const [item, total] of kgItem) {
      const soma = d.destinos.reduce(
        (t, x) => t + (alocacao.get(`${item}|${x.recipienteId}`) ?? 0),
        0,
      )
      if (soma !== total) {
        const i = itens.find((x) => x.id === item)!
        throw new ErroRegra(
          `A repartição de ${i.variedade} não fecha com os kg a processar.`,
          'reparticao',
        )
      }
    }
  } else {
    if (d.destinos.length > 1 && !digitados.length)
      throw new ErroRegra(
        'Com mais de um recipiente, informe os litros de cada um ou reparta a uva por item.',
        'reparticao',
      )
    const pesos = d.destinos.map((x) => (x.litros ? paraCentilitros(x.litros) : 1))
    for (const [item, total] of kgItem) {
      repartir(total, pesos).forEach((kg, n) =>
        alocacao.set(`${item}|${d.destinos[n]!.recipienteId}`, kg),
      )
    }
  }

  // Litros de cada item em cada destino (5.2).
  const base = (item: ItemUva, recipienteId: string) => {
    const kg = alocacao.get(`${item.id}|${recipienteId}`) ?? 0
    const r = rendimento(item.variedadeId)
    return r === null ? kg : kg * r
  }
  const litros = new Map<string, number>() // centilitros
  for (const destino of d.destinos) {
    if (destino.litros) {
      const pesos = itens.map((i) => base(i, destino.recipienteId))
      repartir(paraCentilitros(destino.litros), pesos).forEach((cl, n) =>
        litros.set(`${itens[n]!.id}|${destino.recipienteId}`, cl),
      )
    } else {
      for (const i of itens) {
        const kg = alocacao.get(`${i.id}|${destino.recipienteId}`) ?? 0
        litros.set(
          `${i.id}|${destino.recipienteId}`,
          Math.round((kg / 10) * rendimento(i.variedadeId)! * 100),
        )
      }
    }
  }

  // Lotes de destino.
  const recipientes = d.destinos.map((x) => x.recipienteId)
  const saldos = await saldosPorLote(ctx, recipientes)
  const codigos = await codigosDeLotes(
    ctx,
    saldos.map((x) => x.loteId),
  )
  const lancamentos: Lancamento[] = []
  const genealogia: LigacaoGenealogia[] = []
  const lotesNovos: LoteNovo[] = []
  const linhas: LinhaOperacao[] = []
  for (const [n, destino] of d.destinos.entries()) {
    const alvo: RefLote = destino.lote
    if ('id' in alvo) await conferirLoteExistente(ctx, alvo.id, projeto.id, titularId)
    else if (!lotesNovos.some((x) => x.chave === alvo.novo))
      lotesNovos.push({
        chave: alvo.novo,
        projetoId: projeto.id,
        titularId,
        origem: 'recepcao',
        etapa: 'desengace',
      })
    tratarLoteNoDestino(destino.recipienteId, alvo, saldos, lancamentos, genealogia, codigos)
    let totalDestino = 0
    for (const i of itens) {
      const cl = litros.get(`${i.id}|${destino.recipienteId}`) ?? 0
      if (cl <= 0) continue
      totalDestino += cl
      lancamentos.push({
        recipienteId: destino.recipienteId,
        lote: alvo,
        centilitros: cl,
        tipo: 'entrada_mosto',
        estimado: true,
        linha: n + 1,
        composicao: { composicao: composicaoDoItem(i) },
      })
    }
    linhas.push({
      ordem: n + 1,
      papel: 'destino',
      recipienteId: destino.recipienteId,
      lote: alvo,
      centilitros: totalDestino,
      mistura: 'id' in alvo ? 'incorporar' : 'lote_novo',
    })
  }
  const consumos = itens.flatMap((i) =>
    d.destinos
      .map((destino) => ({
        itemId: i.id,
        decikg: alocacao.get(`${i.id}|${destino.recipienteId}`) ?? 0,
        recipienteId: destino.recipienteId,
        lote: destino.lote as RefLote,
        centilitros: litros.get(`${i.id}|${destino.recipienteId}`) ?? 0,
        estimado: true,
      }))
      .filter((c) => c.decikg > 0),
  )

  return {
    cientes: d.cientes,
    rascunhoId: d.rascunhoId ?? null,
    insumos: {
      lista: d.insumos,
      localEstoqueId: d.localEstoqueId,
      padrao: d.destinos.map((x) => x.recipienteId),
    },
    plano: {
      tipo: 'desengace',
      estabelecimentoId: estab,
      executadoEm,
      projetoId: projeto.id,
      responsavelId: d.responsavelId ?? projeto.enologoId,
      executadoPorId: d.executadoPorId ?? null,
      planoEtapaId: d.planoEtapaId ?? null,
      observacao: d.observacao ?? null,
      dados: { estimativaDigitada: digitados.length > 0, reparticao: d.reparticao.length > 0 },
      linhas,
      lancamentos,
      consumos,
      genealogia,
      lotesNovos,
      residuos: d.residuos.map((r) => ({
        tipo: r.tipo,
        decikg: decikg(r.kg),
        destino: r.destino ?? null,
      })),
      avisos,
    },
  }
}

// Prensagem ------------------------------------------------------------------------------------

async function planoPrensagem(ctx: ContextoEmpresa, corpo: unknown): Promise<Montada> {
  const estab = ctx.exigirEstabelecimento()
  const d = esquemaPrensagem.parse(corpo)
  const executadoEm = dataExecucao(d.executadoEm)
  await conferirPessoas(ctx, [d.responsavelId, d.executadoPorId])
  const lancamentos: Lancamento[] = []
  const genealogia: LigacaoGenealogia[] = []
  const lotesNovos: LoteNovo[] = []
  const linhas: LinhaOperacao[] = []
  const consumos: NonNullable<PlanoOperacao['consumos']> = []
  const totalMedido = d.fracoes.reduce((t, f) => t + paraCentilitros(f.litros), 0)
  const destinos = [...new Set(d.fracoes.map((f) => f.recipienteId))]
  let projetoId: string
  let titularId: string | null
  let kgTotal: number // decikg
  const alvosRendimento: RefLote[] = []

  if (d.origemRecipienteId) {
    // Massa de um recipiente: o medido substitui o estimado (4.2).
    const origem = d.origemRecipienteId
    const saldos = await saldosPorLote(ctx, [origem, ...destinos])
    const massa = saldos.find((x) => x.recipienteId === origem)
    if (!massa) throw new ErroRegra('O recipiente de origem está vazio.', 'origem_vazia')
    const [lote] = await ctx.tx.select().from(s.lote).where(eq(s.lote.id, massa.loteId))
    projetoId = lote!.projetoId
    titularId = lote!.titularId
    await carregarProjeto(ctx, projetoId, estab)
    const [uva] = await ctx.tx
      .select({ kg: sql<string>`coalesce(-sum(${s.movimentoUva.kg}), 0)` })
      .from(s.movimentoUva)
      .where(and(eq(s.movimentoUva.loteId, lote!.id), eq(s.movimentoUva.recipienteId, origem)))
    kgTotal = decikg(uva!.kg)
    const codigos = await codigosDeLotes(
      ctx,
      saldos.map((x) => x.loteId),
    )

    linhas.push({
      ordem: 1,
      papel: 'origem',
      recipienteId: origem,
      lote: { id: lote!.id },
      centilitros: massa.cl,
    })
    const ajuste = totalMedido - massa.cl
    if (ajuste !== 0)
      lancamentos.push({
        recipienteId: origem,
        lote: { id: lote!.id },
        centilitros: ajuste,
        tipo: 'ajuste_prensagem',
        linha: 1,
      })
    alvosRendimento.push({ id: lote!.id })
    for (const [n, f] of d.fracoes.entries()) {
      const cl = paraCentilitros(f.litros)
      const alvo: RefLote = f.lote ?? { id: lote!.id }
      if (f.recipienteId === origem) {
        if (!('id' in alvo) || alvo.id !== lote!.id)
          throw new ErroRegra(
            'A fração que fica no próprio recipiente continua no mesmo lote.',
            'mistura',
          )
      } else {
        if ('id' in alvo && alvo.id !== lote!.id) {
          await conferirLoteExistente(ctx, alvo.id, projetoId, titularId)
          genealogia.push({
            origem: { id: lote!.id },
            destino: alvo,
            centilitros: cl,
            tipo: 'incorporacao',
          })
        }
        if ('novo' in alvo) {
          if (!lotesNovos.some((x) => x.chave === alvo.novo)) {
            lotesNovos.push({
              chave: alvo.novo,
              projetoId,
              titularId,
              origem: 'divisao',
              etapa: lote!.etapa,
            })
            alvosRendimento.push(alvo)
          }
          genealogia.push({
            origem: { id: lote!.id },
            destino: alvo,
            centilitros: cl,
            tipo: 'divisao',
          })
        }
        if (
          !lancamentos.some((x) => x.recipienteId === f.recipienteId && x.tipo === 'entrada_corte')
        )
          tratarLoteNoDestino(f.recipienteId, alvo, saldos, lancamentos, genealogia, codigos)
        lancamentos.push(
          {
            recipienteId: origem,
            lote: { id: lote!.id },
            centilitros: -cl,
            tipo: 'saida_prensagem',
            linha: n + 2,
          },
          {
            recipienteId: f.recipienteId,
            lote: alvo,
            centilitros: cl,
            tipo: 'entrada_prensagem',
            linha: n + 2,
            composicao: { recipienteId: origem },
          },
        )
      }
      linhas.push({
        ordem: n + 2,
        papel: 'destino',
        recipienteId: f.recipienteId,
        lote: alvo,
        centilitros: cl,
        fracaoPrensa: f.fracao,
        mistura: 'novo' in alvo ? 'lote_novo' : 'incorporar',
      })
    }
  } else {
    // Prensagem direta da uva: os litros já nascem medidos (4.2).
    const projeto = await carregarProjeto(ctx, d.projetoId!, estab)
    projetoId = projeto.id
    const itens = await itensUva(
      ctx,
      d.consumos.map((c) => c.itemId),
    )
    if (itens.some((i) => i.estab !== estab))
      throw new ErroRegra('Uva de outro estabelecimento.', 'item')
    titularId = titularUnico(itens)
    const kgItem = new Map(d.consumos.map((c) => [c.itemId, decikg(c.kg)]))
    kgTotal = [...kgItem.values()].reduce((t, k) => t + k, 0)
    const saldos = await saldosPorLote(ctx, destinos)
    const codigos = await codigosDeLotes(
      ctx,
      saldos.map((x) => x.loteId),
    )
    const pesos = itens.map((i) => kgItem.get(i.id)!)
    for (const [n, f] of d.fracoes.entries()) {
      if (!f.lote) throw new ErroRegra('Escolha o lote de cada fração.', 'lote')
      const alvo: RefLote = f.lote
      if ('id' in alvo) await conferirLoteExistente(ctx, alvo.id, projetoId, titularId)
      else if (!lotesNovos.some((x) => x.chave === alvo.novo)) {
        lotesNovos.push({ chave: alvo.novo, projetoId, titularId, origem: 'recepcao' })
      }
      if (!alvosRendimento.some((x) => JSON.stringify(x) === JSON.stringify(alvo)))
        alvosRendimento.push(alvo)
      if (!lancamentos.some((x) => x.recipienteId === f.recipienteId && x.tipo === 'entrada_corte'))
        tratarLoteNoDestino(f.recipienteId, alvo, saldos, lancamentos, genealogia, codigos)
      const cl = paraCentilitros(f.litros)
      const litrosItens = repartir(cl, pesos)
      itens.forEach((i, j) => {
        if (litrosItens[j]! <= 0) return
        lancamentos.push({
          recipienteId: f.recipienteId,
          lote: alvo,
          centilitros: litrosItens[j]!,
          tipo: 'entrada_prensagem',
          linha: n + 1,
          composicao: { composicao: composicaoDoItem(i) },
        })
      })
      linhas.push({
        ordem: n + 1,
        papel: 'destino',
        recipienteId: f.recipienteId,
        lote: alvo,
        centilitros: cl,
        fracaoPrensa: f.fracao,
        mistura: 'novo' in alvo ? 'lote_novo' : 'incorporar',
      })
    }
    // kg de cada item repartidos entre as frações pela proporção dos litros.
    for (const i of itens) {
      const partes = repartir(
        kgItem.get(i.id)!,
        d.fracoes.map((f) => paraCentilitros(f.litros)),
      )
      d.fracoes.forEach((f, n) => {
        if (partes[n]! <= 0) return
        consumos.push({
          itemId: i.id,
          decikg: partes[n]!,
          recipienteId: f.recipienteId,
          lote: f.lote!,
          centilitros: Math.round((totalMedido * partes[n]!) / kgTotal),
          estimado: false,
        })
      })
    }
  }
  await conferirEtapaPlano(ctx, d.planoEtapaId, projetoId)

  // Rendimento real (L/kg) e o limite de 4/5 (Decreto 12.709/2025, art. 93): alerta (P29).
  const litrosPorKg = kgTotal > 0 ? totalMedido / 100 / (kgTotal / 10) : null
  const avisos = litrosPorKg
    ? await avisoRendimento(ctx, executadoEm, await fusoDo(ctx, estab), litrosPorKg)
    : []
  return {
    cientes: d.cientes,
    rascunhoId: d.rascunhoId ?? null,
    insumos: { lista: d.insumos, localEstoqueId: d.localEstoqueId, padrao: destinos },
    plano: {
      tipo: 'prensagem',
      estabelecimentoId: estab,
      executadoEm,
      projetoId,
      responsavelId: d.responsavelId ?? null,
      executadoPorId: d.executadoPorId ?? null,
      planoEtapaId: d.planoEtapaId ?? null,
      observacao: d.observacao ?? null,
      dados: {
        direta: !d.origemRecipienteId,
        litrosMedidos: deCentilitros(totalMedido),
        kg: (kgTotal / 10).toFixed(1),
        rendimento: litrosPorKg?.toFixed(4) ?? null,
      },
      linhas,
      lancamentos,
      consumos,
      genealogia,
      lotesNovos,
      rendimentos: litrosPorKg
        ? alvosRendimento.map((lote) => ({ lote, litrosPorKg: litrosPorKg.toFixed(4) }))
        : [],
      residuos: d.residuos.map((r) => ({
        tipo: r.tipo,
        decikg: decikg(r.kg),
        destino: r.destino ?? null,
      })),
      avisos,
    },
  }
}

// Rotas ----------------------------------------------------------------------------------------

export async function rotasOperacoes(app: FastifyInstance): Promise<void> {
  const { db } = app.deps
  const tipos = {
    desengace: planoDesengace,
    prensagem: planoPrensagem,
    trasfega: planoTrasfega,
    corte: planoCorte,
    atesto: planoAtesto,
    perda: planoPerda,
    adicao_insumo: planoAdicao,
    chaptalizacao: planoChaptalizacao,
    tratamento: planoTratamento,
    fermentacao: planoFermentacao,
    higienizacao: planoHigienizacao,
    entrada_granel: planoEntradaGranel,
    saida_granel: planoSaidaGranel,
    titularidade: planoTitularidade,
  } as const
  /** O que se grava junto da confirmação, além da operação. */
  const aoConfirmar: Partial<
    Record<
      keyof typeof tipos,
      (ctx: ContextoEmpresa, id: string, plano: PlanoOperacao) => Promise<void>
    >
  > = { titularidade: registrarTitularidade }

  for (const [tipo, montar] of Object.entries(tipos)) {
    // Prévia: volumes antes e depois, composição, avisos e bloqueios, sem gravar (cantina.md).
    app.post(`/api/operacoes/${tipo}/previa`, async (req) =>
      naEmpresa(db, req, [F, 'criar'], async (ctx) => {
        const { plano } = await montarComInsumos(ctx, montar, req.body)
        const { previa } = await preparar(ctx, plano, { travar: false })
        return tipo === 'corte' || tipo === 'trasfega'
          ? { ...previa, rotulos: await rotulosDosDestinos(ctx, plano, previa) }
          : previa
      }),
    )
    app.post(`/api/operacoes/${tipo}`, async (req) =>
      naEmpresa(db, req, [F, 'confirmar'], async (ctx) => {
        const { plano, cientes, rascunhoId } = await montarComInsumos(ctx, montar, req.body)
        const r = await confirmar(ctx, plano, cientes, { rascunhoId })
        await aoConfirmar[tipo as keyof typeof tipos]?.(ctx, r.operacaoId, plano)
        return r
      }),
    )
  }

  // Rascunho: o formulário salvo pela metade; não mexe em volume nem em estoque (cantina.md).
  const carregarRascunho = async (ctx: ContextoEmpresa, id: string) => {
    const [r] = await ctx.tx
      .select({
        estab: s.operacao.estabelecimentoId,
        tipo: s.operacao.tipo,
        situacao: s.operacao.situacao,
        versao: s.operacao.versao,
      })
      .from(s.operacao)
      .where(and(eq(s.operacao.id, id), eq(s.operacao.empresaId, ctx.empresaId)))
      .for('update')
    if (!r || !(await ctx.estabelecimentosPermitidos()).includes(r.estab))
      throw new ErroNaoEncontrado('Rascunho não encontrado.')
    if (r.situacao !== 'rascunho')
      throw new ErroRegra('A operação já foi confirmada: só se estorna.', 'confirmada')
    return r
  }
  const cabecalhoRascunho = async (
    ctx: ContextoEmpresa,
    estab: string,
    d: ReturnType<typeof rascunhoOperacao.parse>,
  ) => {
    if (d.projetoId) {
      const [p] = await ctx.tx
        .select({ estab: s.projeto.estabelecimentoId })
        .from(s.projeto)
        .where(and(eq(s.projeto.id, d.projetoId), eq(s.projeto.empresaId, ctx.empresaId)))
      if (!p || p.estab !== estab) throw new ErroRegra('Projeto inválido.', 'projeto')
    }
    return {
      executadoEm: d.executadoEm ? new Date(d.executadoEm) : new Date(),
      projetoId: d.projetoId ?? null,
      observacao: d.observacao ?? null,
      dados: { formulario: d.formulario },
    }
  }

  app.post('/api/operacoes/rascunhos', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const d = rascunhoOperacao.parse(req.body)
      const [r] = await ctx.tx
        .insert(s.operacao)
        .values({
          empresaId: ctx.empresaId,
          estabelecimentoId: estab,
          tipo: d.tipo,
          ...(await cabecalhoRascunho(ctx, estab, d)),
          situacao: 'rascunho',
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.operacao.id })
      await ctx.auditar({
        acao: 'criar',
        entidade: 'operacao',
        registroId: r!.id,
        dados: { rascunho: TIPOS_OPERACAO[d.tipo] },
      })
      return { id: r!.id }
    }),
  )

  app.put<{ Params: { id: string } }>('/api/operacoes/rascunhos/:id', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const d = rascunhoOperacao.parse(req.body)
      const atual = await carregarRascunho(ctx, id)
      if (atual.tipo !== d.tipo) throw new ErroRegra('O rascunho é de outra operação.', 'rascunho')
      conferirVersao(atual.versao, d.versao)
      await ctx.tx
        .update(s.operacao)
        .set({
          ...(await cabecalhoRascunho(ctx, atual.estab, d)),
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.operacao.versao} + 1`,
        })
        .where(eq(s.operacao.id, id))
      await ctx.auditar({ acao: 'editar', entidade: 'operacao', registroId: id })
      return { ok: true, versao: atual.versao + 1 }
    }),
  )

  /** O rascunho pode ser descartado; a operação confirmada, só estornada (P13). */
  app.post<{ Params: { id: string } }>('/api/operacoes/rascunhos/:id/descartar', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      await carregarRascunho(ctx, id)
      await ctx.tx.delete(s.operacao).where(eq(s.operacao.id, id))
      await ctx.auditar({ acao: 'descartar', entidade: 'operacao', registroId: id })
      return { ok: true }
    }),
  )

  // Estorno: prévia com os dependentes e os volumes, e o estorno com motivo (4.5).
  app.get<{ Params: { id: string } }>('/api/operacoes/:id/estorno', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) =>
      previaEstorno(ctx, z.uuid().parse(req.params.id)),
    ),
  )
  app.post<{ Params: { id: string } }>('/api/operacoes/:id/estorno', async (req) =>
    naEmpresa(db, req, [F, 'estornar'], async (ctx) => {
      const { motivo } = estornoOperacao.parse(req.body)
      const id = z.uuid().parse(req.params.id)
      if (await exigeAprovacao(ctx, 'estorno')) {
        // Só vai para a aprovação o que o estorno conseguiria fazer agora.
        const p = await previaEstorno(ctx, id)
        if (p.bloqueios.length) throw new ErroRegra(p.bloqueios[0]!, 'estorno')
        const [op] = await ctx.tx
          .select({ estab: s.operacao.estabelecimentoId, tipo: s.operacao.tipo })
          .from(s.operacao)
          .where(eq(s.operacao.id, id))
        return pedirAprovacao(ctx, {
          tipo: 'estorno',
          estabelecimentoId: op!.estab,
          entidade: 'operacao',
          registroId: id,
          resumo: `Estornar ${p.codigo ?? op!.tipo}: ${motivo}`,
          dados: { operacaoId: id, motivo },
        })
      }
      return estornarOperacao(ctx, id, motivo)
    }),
  )

  app.get('/api/operacoes', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const q = consultaListagem
        .extend({
          projeto: z.uuid().optional(),
          recipiente: z.uuid().optional(),
          lote: z.uuid().optional(),
          /** Lançadas = confirmadas, estornadas e estornos; rascunhos à parte. */
          situacao: z.enum(['lancadas', 'rascunho']).default('lancadas'),
        })
        .parse(req.query)
      const estabs = ctx.estabelecimentoId
        ? [ctx.estabelecimentoId]
        : await ctx.estabelecimentosPermitidos()
      if (!estabs.length) return { itens: [], total: 0, pagina: 1, tamanho: q.tamanho }
      const filtro = and(
        eq(s.operacao.empresaId, ctx.empresaId),
        inArray(s.operacao.estabelecimentoId, estabs),
        q.situacao === 'rascunho'
          ? eq(s.operacao.situacao, 'rascunho')
          : inArray(s.operacao.situacao, ['confirmada', 'estornada']),
        q.projeto ? eq(s.operacao.projetoId, q.projeto) : undefined,
        // Recipientes e lotes tocados: pelo livro de volumes e pelas linhas (a adição não move volume).
        q.recipiente
          ? sql`exists (select 1 from movimento_volume m where m.operacao_id = operacao.id and m.recipiente_id = ${q.recipiente}
              union all select 1 from operacao_linha l where l.operacao_id = operacao.id and l.recipiente_id = ${q.recipiente})`
          : undefined,
        q.lote
          ? sql`exists (select 1 from movimento_volume m where m.operacao_id = operacao.id and m.lote_id = ${q.lote}
              union all select 1 from operacao_linha l where l.operacao_id = operacao.id and l.lote_id = ${q.lote})`
          : undefined,
        buscaTexto(q.busca, [s.operacao.codigo, s.operacao.observacao]),
      )
      return listar({
        consulta: q,
        ordenaveis: {
          executadoEm: s.operacao.executadoEm,
          codigo: s.operacao.codigo,
          tipo: s.operacao.tipo,
          atualizadoEm: s.operacao.atualizadoEm,
        },
        ordemPadrao: {
          campo: q.situacao === 'rascunho' ? 'atualizadoEm' : 'executadoEm',
          direcao: 'desc',
        },
        contar: async () =>
          (await ctx.tx.select({ n: count() }).from(s.operacao).where(filtro))[0]!.n,
        buscar: ({ ordem, limite, deslocamento }) =>
          ctx.tx
            .select({
              id: s.operacao.id,
              codigo: s.operacao.codigo,
              tipo: s.operacao.tipo,
              executadoEm: s.operacao.executadoEm,
              lancadoEm: s.operacao.lancadoEm,
              atualizadoEm: s.operacao.atualizadoEm,
              situacao: s.operacao.situacao,
              estornoDe: sql<
                string | null
              >`(select e.codigo from operacao e where e.id = operacao.estorno_de_id)`,
              projeto: sql<
                string | null
              >`(select p.codigo || ' · ' || p.nome from projeto p where p.id = operacao.projeto_id)`,
              recipientes: sql<
                string[]
              >`coalesce((select array_agg(distinct r.codigo) from (select recipiente_id from movimento_volume where operacao_id = operacao.id union select recipiente_id from operacao_linha where operacao_id = operacao.id) x join recipiente r on r.id = x.recipiente_id), '{}')`,
              lotes: sql<
                string[]
              >`coalesce((select array_agg(distinct l.codigo) from (select lote_id from movimento_volume where operacao_id = operacao.id union select lote_id from operacao_linha where operacao_id = operacao.id) x join lote l on l.id = x.lote_id), '{}')`,
              kg: sql<
                string | null
              >`(select -sum(u.kg) from movimento_uva u where u.operacao_id = operacao.id)`,
            })
            .from(s.operacao)
            .where(filtro)
            .orderBy(...ordem)
            .limit(limite)
            .offset(deslocamento),
      })
    }),
  )

  app.get<{ Params: { id: string } }>('/api/operacoes/:id', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const [o] = await ctx.tx
        .select()
        .from(s.operacao)
        .where(and(eq(s.operacao.id, id), eq(s.operacao.empresaId, ctx.empresaId)))
      if (!o || !(await ctx.estabelecimentosPermitidos()).includes(o.estabelecimentoId))
        throw new ErroNaoEncontrado('Operação não encontrada.')
      const movimentos = await ctx.tx
        .select({
          recipiente: s.recipiente.codigo,
          recipienteId: s.recipiente.id,
          lote: s.lote.codigo,
          loteId: s.lote.id,
          litros: s.movimentoVolume.litros,
          tipo: s.movimentoVolume.tipo,
          estimado: s.movimentoVolume.estimado,
        })
        .from(s.movimentoVolume)
        .innerJoin(s.recipiente, eq(s.recipiente.id, s.movimentoVolume.recipienteId))
        .innerJoin(s.lote, eq(s.lote.id, s.movimentoVolume.loteId))
        .where(eq(s.movimentoVolume.operacaoId, id))
        .orderBy(asc(s.recipiente.codigo))
      const uva = await ctx.tx
        .select({
          romaneio: s.romaneio.codigo,
          variedade: s.variedade.nome,
          kg: sql<string>`-${s.movimentoUva.kg}`,
          recipiente: s.recipiente.codigo,
          lote: s.lote.codigo,
          litros: s.movimentoUva.litros,
        })
        .from(s.movimentoUva)
        .innerJoin(s.romaneioItem, eq(s.romaneioItem.id, s.movimentoUva.itemId))
        .innerJoin(s.romaneio, eq(s.romaneio.id, s.romaneioItem.romaneioId))
        .innerJoin(s.variedade, eq(s.variedade.id, s.romaneioItem.variedadeId))
        .innerJoin(s.recipiente, eq(s.recipiente.id, s.movimentoUva.recipienteId))
        .innerJoin(s.lote, eq(s.lote.id, s.movimentoUva.loteId))
        .where(eq(s.movimentoUva.operacaoId, id))
      const genealogia = await ctx.tx.execute<{
        origem: string
        destino: string
        litros: string
        tipo: string
      }>(sql`
        select o.codigo as origem, d.codigo as destino, g.litros, g.tipo
        from genealogia g join lote o on o.id = g.origem_lote_id join lote d on d.id = g.destino_lote_id
        where g.operacao_id = ${id}`)
      const residuos = await ctx.tx
        .select()
        .from(s.operacaoResiduo)
        .where(eq(s.operacaoResiduo.operacaoId, id))
      const insumos = await ctx.tx.execute<{
        recipiente: string
        lote: string
        item: string | null
        descricao: string | null
        loteItem: string | null
        dose: string
        unidade: string
        volumeTratado: string
        quantidade: string | null
        unidadeItem: string | null
        so2: string | null
      }>(sql`
        select r.codigo as recipiente, l.codigo as lote, it.nome as item, i.descricao,
          (select li.codigo from lote_item li where li.id = i.lote_item_id) as "loteItem",
          i.dose, i.unidade, i.volume_tratado as "volumeTratado", i.quantidade,
          it.unidade_base as "unidadeItem", i.so2
        from operacao_insumo i join recipiente r on r.id = i.recipiente_id join lote l on l.id = i.lote_id
          left join item_estoque it on it.id = i.item_id
        where i.operacao_id = ${id} order by r.codigo`)
      const [chaptalizacao] = await ctx.tx
        .select()
        .from(s.operacaoChaptalizacao)
        .where(eq(s.operacaoChaptalizacao.operacaoId, id))
      const parametros = await ctx.tx
        .select({
          nome: s.tipoTratamentoParametro.nome,
          unidade: s.tipoTratamentoParametro.unidade,
          valor: s.operacaoParametro.valor,
        })
        .from(s.operacaoParametro)
        .innerJoin(
          s.tipoTratamentoParametro,
          eq(s.tipoTratamentoParametro.id, s.operacaoParametro.parametroId),
        )
        .where(eq(s.operacaoParametro.operacaoId, id))
      const higienizacao = await ctx.tx
        .select({
          recipiente: s.recipiente.codigo,
          recipienteId: s.recipiente.id,
          tipo: s.operacaoHigienizacao.tipo,
          produto: s.operacaoHigienizacao.produto,
          dose: s.operacaoHigienizacao.dose,
          situacaoAnterior: s.operacaoHigienizacao.situacaoAnterior,
        })
        .from(s.operacaoHigienizacao)
        .innerJoin(s.recipiente, eq(s.recipiente.id, s.operacaoHigienizacao.recipienteId))
        .where(eq(s.operacaoHigienizacao.operacaoId, id))
        .orderBy(asc(s.recipiente.codigo))
      const ocorrencias = await ctx.tx
        .select({ mensagem: s.ocorrenciaRegra.mensagem, cienteEm: s.ocorrenciaRegra.cienteEm })
        .from(s.ocorrenciaRegra)
        .where(
          and(eq(s.ocorrenciaRegra.entidade, 'operacao'), eq(s.ocorrenciaRegra.registroId, id)),
        )
      const estorno = o.estornoDeId
        ? null
        : (
            await ctx.tx
              .select({
                id: s.operacao.id,
                codigo: s.operacao.codigo,
                lancadoEm: s.operacao.lancadoEm,
                motivo: s.operacao.motivo,
                por: sql<
                  string | null
                >`(select f.nome from usuario u join ficha f on f.id = u.ficha_id where u.id = operacao.criado_por)`,
              })
              .from(s.operacao)
              .where(eq(s.operacao.estornoDeId, id))
              .orderBy(desc(s.operacao.lancadoEm))
              .limit(1)
          )[0]
      const estornoDe = o.estornoDeId
        ? (
            await ctx.tx
              .select({ id: s.operacao.id, codigo: s.operacao.codigo, tipo: s.operacao.tipo })
              .from(s.operacao)
              .where(eq(s.operacao.id, o.estornoDeId))
          )[0]
        : null
      const [nomes] = await ctx.tx
        .select({
          projeto: sql<
            string | null
          >`(select p.codigo || ' · ' || p.nome from projeto p where p.id = operacao.projeto_id)`,
          responsavel: sql<
            string | null
          >`(select f.nome from pessoa p join ficha f on f.id = p.ficha_id where p.id = operacao.responsavel_id)`,
          executadoPor: sql<
            string | null
          >`(select f.nome from pessoa p join ficha f on f.id = p.ficha_id where p.id = operacao.executado_por_id)`,
        })
        .from(s.operacao)
        .where(eq(s.operacao.id, id))
      return {
        id: o.id,
        codigo: o.codigo,
        tipo: o.tipo,
        nomeTipo: TIPOS_OPERACAO[o.tipo as keyof typeof TIPOS_OPERACAO],
        executadoEm: o.executadoEm,
        lancadoEm: o.lancadoEm,
        projetoId: o.projetoId,
        observacao: o.observacao,
        dados: o.situacao === 'rascunho' ? null : o.dados,
        formulario:
          o.situacao === 'rascunho'
            ? ((o.dados as { formulario?: unknown } | null)?.formulario ?? {})
            : null,
        situacao: o.situacao,
        versao: o.versao,
        motivo: o.motivo,
        eCorte: o.eCorte,
        estornadaPor: estorno ?? null,
        estornoDe: estornoDe
          ? {
              ...estornoDe,
              nomeTipo: TIPOS_OPERACAO[estornoDe.tipo as keyof typeof TIPOS_OPERACAO],
            }
          : null,
        ...nomes,
        movimentos: movimentos.map((m) => ({
          ...m,
          nomeTipo: TIPOS_MOVIMENTO[m.tipo as keyof typeof TIPOS_MOVIMENTO],
        })),
        uva,
        genealogia: genealogia.rows,
        residuos,
        ocorrencias,
        insumos: insumos.rows,
        chaptalizacao: chaptalizacao ?? null,
        parametros,
        higienizacao,
        granel: await granelDaOperacao(ctx, id),
        titularidade: await titularidadeDaOperacao(ctx, id),
      }
    }),
  )
}

/** Estorna a operação (direto ou na aprovação do pedido). */
export async function estornarOperacao(ctx: ContextoEmpresa, id: string, motivo: string) {
  // Tiragem de espumante: só sem estágio registrado; estornada, o lote de tiragem se cancela.
  await antesEstornoTiragem(ctx, id)
  const r = await estornar(ctx, id, motivo)
  // Engarrafamento: o lote comercial, a ordem e o projeto se refazem sem a produção estornada.
  await aposEstornoEngarrafamento(ctx, id)
  await aposEstornoTiragem(ctx, id)
  return r
}
