// EnoTrace › Operações: trasfega, corte e perda (cantina.md, Trasfega e corte; Operações; Regras comuns:
// esvaziar origem). Cada função monta o plano da operação; o motor confere bloqueios, calcula a
// composição de cada recipiente e grava (motor.ts).
import {
  atesto as esquemaAtesto,
  type Composicao,
  corte as esquemaCorte,
  deCentilitros,
  misturar,
  paraCentilitros,
  perda as esquemaPerda,
  porSafra,
  porVariedade,
  trasfega as esquemaTrasfega,
} from '@vinicycle/shared'
import { eq, inArray } from 'drizzle-orm'
import * as s from '../../db/schema'
import { ErroRegra } from '../../nucleo/erros'
import type { Aviso } from '../../nucleo/regras'
import type { ContextoEmpresa } from '../../nucleo/requisicao'
import {
  carregarProjeto,
  codigosDeLotes,
  conferirEtapaPlano,
  conferirOpcao,
  conferirPessoas,
  dataExecucao,
  type InsumoForm,
  type Montada,
  repartir,
  saldosNaData,
  saldosPorLote,
  tratarLoteNoDestino,
} from './apoio'
import {
  type Lancamento,
  type LigacaoGenealogia,
  type LinhaOperacao,
  type LoteNovo,
  partesAtuais,
  type RefLote,
} from './motor'

const litrosBr = (cl: number) => deCentilitros(cl).replace('.', ',')

async function codigosDeRecipientes(ctx: ContextoEmpresa, ids: string[]) {
  const r = ids.length
    ? await ctx.tx
        .select({ id: s.recipiente.id, codigo: s.recipiente.codigo })
        .from(s.recipiente)
        .where(inArray(s.recipiente.id, ids))
    : []
  return new Map(r.map((x) => [x.id, x.codigo]))
}

/** Mesma composição por variedade e por safra (tolerância de 0,05 ponto percentual). */
function mesmaComposicao(a: Composicao, b: Composicao): boolean {
  const igual = <K>(x: Array<{ fracao: number } & K>, y: typeof x, chave: (v: K) => unknown) =>
    x.length === y.length &&
    x.every((v) => {
      const w = y.find((z) => chave(z) === chave(v))
      return !!w && Math.abs(w.fracao - v.fracao) < 0.0005
    })
  return (
    igual(porVariedade(a), porVariedade(b), (v) => v.variedadeId) &&
    igual(porSafra(a), porSafra(b), (v) => v.safra)
  )
}

// Trasfega e corte -------------------------------------------------------------------------------

interface FormMistura {
  executadoEm: string
  responsavelId?: string | null
  executadoPorId?: string | null
  planoEtapaId?: string | null
  observacao?: string | null
  cientes: string[]
  rascunhoId?: string | null
  metodo?: string | null
  origens: Array<{
    recipienteId: string
    litros?: string | null
    esvaziar: boolean
    perda?: string | null
  }>
  insumos: InsumoForm[]
  localEstoqueId?: string | null
  destinos: Array<{
    recipienteId: string
    litros: string
    lote?: RefLote | null
    /** Só no atesto: vazio = igual aos litros repostos. */
    evaporacao?: string | null
  }>
}

const TIPOS_MISTURA = {
  trasfega: ['saida_trasfega', 'entrada_trasfega'],
  corte: ['saida_corte', 'entrada_corte'],
  atesto: ['saida_atesto', 'entrada_atesto'],
} as const

/**
 * Trasfega e corte: o vinho sai de uma ou mais origens e chega a um ou mais destinos. Cada destino
 * recebe a mistura das origens na proporção do que saiu de cada uma, e a composição viaja com os
 * litros (03-modelo-de-dados.md, 5.3). Na trasfega, as origens são do mesmo lote; no corte, de
 * lotes diferentes, e todos os vínculos da genealogia são de corte. Destino com outro lote:
 * incorporar ao lote do destino ou formar lote novo. Lote novo com vinhos de projetos diferentes
 * forma um projeto novo; projeto de origem sem saldo se encerra "incorporado" (cantina.md, Corte
 * entre projetos).
 */
async function montarMistura(
  ctx: ContextoEmpresa,
  tipo: keyof typeof TIPOS_MISTURA,
  d: FormMistura,
  opcoes: { eCorte: boolean; projetoNovo?: { nome: string; cor?: string | null } | null },
): Promise<Montada> {
  const estab = ctx.exigirEstabelecimento()
  const corte = tipo === 'corte'
  const atesto = tipo === 'atesto'
  const [tipoSaida, tipoEntrada] = TIPOS_MISTURA[tipo]
  const executadoEm = dataExecucao(d.executadoEm)
  await conferirPessoas(ctx, [d.responsavelId, d.executadoPorId])
  await conferirOpcao(ctx, 'metodo_trasfega', d.metodo, 'Método de trasfega')

  const idsOrigem = d.origens.map((o) => o.recipienteId)
  const idsDestino = d.destinos.map((x) => x.recipienteId)
  const nomes = await codigosDeRecipientes(ctx, [...idsOrigem, ...idsDestino])

  // Lote de cada origem, na data da execução.
  const naData = await saldosNaData(ctx, idsOrigem, executadoEm)
  const saldoOrigem = new Map<string, { loteId: string; cl: number }>()
  for (const id of idsOrigem) {
    const parte = naData.find((x) => x.recipienteId === id)
    if (!parte)
      throw new ErroRegra(
        `O recipiente ${nomes.get(id) ?? ''} está vazio na data da execução.`,
        'origem_vazia',
      )
    saldoOrigem.set(id, parte)
  }
  const lotesOrigem = [...new Set([...saldoOrigem.values()].map((p) => p.loteId))]
  if (!corte && lotesOrigem.length > 1)
    throw new ErroRegra(
      'As origens têm lotes diferentes. Para juntar lotes diferentes, registre um corte.',
      'origens',
    )

  const saldosDestino = await saldosPorLote(ctx, idsDestino)
  const lotes = await ctx.tx
    .select({
      id: s.lote.id,
      codigo: s.lote.codigo,
      projetoId: s.lote.projetoId,
      titularId: s.lote.titularId,
      etapa: s.lote.etapa,
    })
    .from(s.lote)
    .where(inArray(s.lote.id, [...lotesOrigem, ...saldosDestino.map((x) => x.loteId)]))
  const lote = (id: string) => lotes.find((l) => l.id === id)!
  const titulares = new Set(lotesOrigem.map((id) => lote(id).titularId))
  if (titulares.size > 1)
    throw new ErroRegra(
      'Lotes de titulares diferentes não se misturam. Registre antes uma transferência de titularidade.',
      'titulares',
    )
  const titularId = lote(lotesOrigem[0]!).titularId

  // Quanto saiu de cada origem para os destinos, e a borra que ficou.
  const chegou = d.destinos.map((x) => paraCentilitros(x.litros))
  const totalChegou = chegou.reduce((t, c) => t + c, 0)
  const saidas = d.origens.map((o) => {
    const { cl: saldo, loteId } = saldoOrigem.get(o.recipienteId)!
    const cl = o.litros
      ? paraCentilitros(o.litros)
      : d.origens.length === 1
        ? totalChegou
        : o.esvaziar
          ? saldo
          : null
    if (cl === null)
      throw new ErroRegra(
        'Com mais de uma origem, informe quanto saiu de cada uma, ou marque "esvaziar".',
        'litros',
      )
    const perda = o.esvaziar ? saldo - cl : o.perda ? paraCentilitros(o.perda) : 0
    if (perda < 0)
      throw new ErroRegra(
        `Saíram ${litrosBr(cl)} L do recipiente ${nomes.get(o.recipienteId) ?? ''}, que tinha ${litrosBr(saldo)} L.`,
        'litros',
      )
    return { recipienteId: o.recipienteId, loteId, cl, perda, esvaziar: o.esvaziar }
  })
  const totalSaiu = saidas.reduce((t, o) => t + o.cl, 0)
  if (totalSaiu !== totalChegou)
    throw new ErroRegra(
      `Saíram ${litrosBr(totalSaiu)} L das origens e chegaram ${litrosBr(totalChegou)} L aos destinos: os totais precisam fechar. A diferença vai como borra na origem.`,
      'litros',
    )

  const codigos = await codigosDeLotes(ctx, [...lotesOrigem, ...saldosDestino.map((x) => x.loteId)])
  const partes = await partesAtuais(ctx, [...idsOrigem, ...idsDestino])
  const vazia: Composicao = { componentes: [], chaptalizado: false }
  const vem = misturar(
    saidas.map((o) => ({
      centilitros: o.cl,
      composicao: partes.get(o.recipienteId)?.composicao ?? vazia,
    })),
  )

  const lancamentos: Lancamento[] = []
  const genealogia: LigacaoGenealogia[] = []
  const lotesNovos: LoteNovo[] = []
  const linhas: LinhaOperacao[] = []
  const avisos: Aviso[] = []
  const encerrar = new Set<string>()
  const projetosDestino: Array<string | null> = []
  let ordem = 0
  for (const o of saidas) {
    ordem += 1
    linhas.push({
      ordem,
      papel: 'origem',
      recipienteId: o.recipienteId,
      lote: { id: o.loteId },
      centilitros: o.cl,
      esvaziarOrigem: o.esvaziar,
    })
    lancamentos.push({
      recipienteId: o.recipienteId,
      lote: { id: o.loteId },
      centilitros: -o.cl,
      tipo: tipoSaida,
      linha: ordem,
    })
    if (o.perda > 0) {
      ordem += 1
      linhas.push({
        ordem,
        papel: 'perda',
        recipienteId: o.recipienteId,
        lote: { id: o.loteId },
        centilitros: o.perda,
        motivoPerda: 'borra',
      })
      lancamentos.push({
        recipienteId: o.recipienteId,
        lote: { id: o.loteId },
        centilitros: -o.perda,
        tipo: 'perda',
        linha: ordem,
      })
    }
  }

  let houveMistura = false
  const pesos = saidas.map((o) => o.cl)
  for (const [n, x] of d.destinos.entries()) {
    ordem += 1
    const nome = nomes.get(x.recipienteId) ?? ''
    const atual = saldosDestino.find((y) => y.recipienteId === x.recipienteId)
    // No atesto, o padrão é o lote da barrica: o vinho de outro lote se incorpora a ele.
    const alvo: RefLote = x.lote ?? { id: atesto && atual ? atual.loteId : lotesOrigem[0]! }
    if ('id' in alvo && !lotesOrigem.includes(alvo.id) && alvo.id !== atual?.loteId)
      throw new ErroRegra(
        `No ${nome}, o vinho forma um lote novo ou se incorpora a um lote da operação ou ao que já está no recipiente.`,
        'mistura',
      )
    const doDestino = repartir(chegou[n]!, pesos)
    const porLote = new Map<string, number>()
    saidas.forEach((o, j) => porLote.set(o.loteId, (porLote.get(o.loteId) ?? 0) + doDestino[j]!))
    const mistura = !!atual && !lotesOrigem.includes(atual.loteId)
    if (mistura) houveMistura = true

    // Projeto do lote de destino; os outros projetos que contribuem podem se encerrar.
    const contribuem = new Set([
      ...[...porLote.entries()].filter(([, cl]) => cl > 0).map(([id]) => lote(id).projetoId),
      ...(atual ? [lote(atual.loteId).projetoId] : []),
    ])
    let projetoDestino: string | null
    if ('id' in alvo) projetoDestino = lote(alvo.id).projetoId
    else if (contribuem.size === 1) projetoDestino = [...contribuem][0]!
    else if (!corte)
      throw new ErroRegra(
        `No ${nome}, o lote novo juntaria vinhos de projetos diferentes. Registre um corte: ele forma o projeto novo.`,
        'projetos',
      )
    else if (!opcoes.projetoNovo)
      throw new ErroRegra(
        'Os vinhos são de projetos diferentes: o lote novo forma um projeto novo. Informe o nome dele.',
        'projeto_novo',
      )
    else projetoDestino = null
    projetosDestino.push(projetoDestino)
    for (const p of contribuem) if (p !== projetoDestino) encerrar.add(p)

    if (tipo === 'trasfega' && mistura && !opcoes.eCorte) {
      if (!mesmaComposicao(vem, partes.get(x.recipienteId)!.composicao))
        avisos.push({
          codigo: `corte:${x.recipienteId}`,
          mensagem: `No ${nome}, os lotes têm composições diferentes (variedade ou safra): se for um corte, marque "registrar como corte".`,
        })
    }
    if ('novo' in alvo && !lotesNovos.some((l) => l.chave === alvo.novo)) {
      lotesNovos.push({
        chave: alvo.novo,
        projetoId: projetoDestino,
        titularId,
        origem: corte || (mistura && opcoes.eCorte) ? 'corte' : 'divisao',
        etapa: lote(lotesOrigem[0]!).etapa,
      })
    }
    // Atesto: a evaporação sai da barrica antes de o vinho entrar, e a barrica volta a encher.
    const evaporacao = atesto
      ? x.evaporacao !== null && x.evaporacao !== undefined
        ? paraCentilitros(x.evaporacao)
        : chegou[n]!
      : 0
    if (evaporacao > 0) {
      if (!atual || evaporacao > atual.cl)
        throw new ErroRegra(
          `A evaporação do ${nome} passa do que há nele${atual ? ` (${litrosBr(atual.cl)} L)` : ''}.`,
          'evaporacao',
        )
      linhas.push({
        ordem,
        papel: 'perda',
        recipienteId: x.recipienteId,
        lote: { id: atual.loteId },
        centilitros: evaporacao,
        motivoPerda: 'evaporacao',
      })
      lancamentos.push({
        recipienteId: x.recipienteId,
        lote: { id: atual.loteId },
        centilitros: -evaporacao,
        tipo: 'evaporacao',
        linha: ordem,
      })
      ordem += 1
    }
    const antes = genealogia.length
    tratarLoteNoDestino(
      x.recipienteId,
      alvo,
      saldosDestino.map((y) =>
        y.recipienteId === x.recipienteId ? { ...y, cl: y.cl - evaporacao } : y,
      ),
      lancamentos,
      genealogia,
      codigos,
    )
    if (corte) for (const g of genealogia.slice(antes)) g.tipo = 'corte'
    doDestino.forEach((cl, j) => {
      if (cl <= 0) return
      lancamentos.push({
        recipienteId: x.recipienteId,
        lote: alvo,
        centilitros: cl,
        tipo: tipoEntrada,
        linha: ordem,
        composicao: { recipienteId: saidas[j]!.recipienteId },
      })
    })
    for (const [loteId, cl] of porLote) {
      if ('id' in alvo && alvo.id === loteId) continue
      genealogia.push({
        origem: { id: loteId },
        destino: alvo,
        centilitros: cl,
        tipo: corte
          ? 'corte'
          : 'novo' in alvo
            ? mistura
              ? 'lote_novo'
              : 'divisao'
            : 'incorporacao',
      })
    }
    linhas.push({
      ordem,
      papel: 'destino',
      recipienteId: x.recipienteId,
      lote: alvo,
      centilitros: chegou[n]!,
      mistura:
        'id' in alvo && lotesOrigem.length === 1 && alvo.id === lotesOrigem[0]
          ? null
          : 'novo' in alvo
            ? 'lote_novo'
            : 'incorporar',
    })
  }

  // Projetos de destino abertos; a operação fica no projeto do primeiro destino (ou no novo).
  const existentes = [...new Set(projetosDestino.filter((p): p is string => !!p))]
  const abertos = await Promise.all(existentes.map((p) => carregarProjeto(ctx, p, estab)))
  const projetoId = projetosDestino[0] ?? null
  const projetoOp = abertos.find((p) => p.id === projetoId) ?? null
  if (projetoId) await conferirEtapaPlano(ctx, d.planoEtapaId, projetoId)
  else if (d.planoEtapaId)
    throw new ErroRegra('A etapa do plano é de um projeto que já existe.', 'plano_etapa')

  // O projeto novo nasce do projeto que mais contribuiu, com o enólogo dele.
  let projetoNovo: NonNullable<Montada['plano']['projetoNovo']> | undefined
  if (projetosDestino.includes(null)) {
    const porProjeto = new Map<string, number>()
    for (const o of saidas) {
      const p = lote(o.loteId).projetoId
      porProjeto.set(p, (porProjeto.get(p) ?? 0) + o.cl)
    }
    const origemId = [...porProjeto.entries()].sort((a, b) => b[1] - a[1])[0]![0]
    const [origem] = await ctx.tx
      .select({ enologoId: s.projeto.enologoId, cor: s.projeto.cor })
      .from(s.projeto)
      .where(eq(s.projeto.id, origemId))
    projetoNovo = {
      nome: opcoes.projetoNovo!.nome,
      cor: opcoes.projetoNovo!.cor ?? origem?.cor ?? null,
      enologoId: d.responsavelId ?? origem?.enologoId ?? null,
      origemId,
    }
  }

  return {
    cientes: d.cientes,
    rascunhoId: d.rascunhoId ?? null,
    insumos: { lista: d.insumos, localEstoqueId: d.localEstoqueId, padrao: idsDestino },
    plano: {
      tipo,
      estabelecimentoId: estab,
      executadoEm,
      projetoId,
      responsavelId: d.responsavelId ?? projetoOp?.enologoId ?? projetoNovo?.enologoId ?? null,
      executadoPorId: d.executadoPorId ?? null,
      planoEtapaId: d.planoEtapaId ?? null,
      observacao: d.observacao ?? null,
      eCorte: corte || (opcoes.eCorte && houveMistura),
      dados: {
        metodo: d.metodo ?? null,
        borra: deCentilitros(saidas.reduce((t, o) => t + o.perda, 0)),
        ...(atesto && {
          evaporacao: deCentilitros(
            lancamentos
              .filter((l) => l.tipo === 'evaporacao')
              .reduce((t, l) => t - l.centilitros, 0),
          ),
        }),
      },
      linhas,
      lancamentos,
      genealogia,
      lotesNovos,
      avisos,
      projetoNovo,
      encerrarProjetos: [...encerrar],
    },
  }
}

/** Trasfega (cantina.md, Trasfega e corte): o mesmo lote, de recipiente para recipiente. */
export async function planoTrasfega(ctx: ContextoEmpresa, corpo: unknown): Promise<Montada> {
  const d = esquemaTrasfega.parse(corpo)
  return montarMistura(ctx, 'trasfega', d, { eCorte: d.eCorte })
}

/** Atesto em lote, com a evaporação de cada barrica (cantina.md, Atesto em lote). */
export async function planoAtesto(ctx: ContextoEmpresa, corpo: unknown): Promise<Montada> {
  const d = esquemaAtesto.parse(corpo)
  return montarMistura(ctx, 'atesto', d, { eCorte: false })
}

/** Corte (cantina.md, Trasfega e corte): mistura de lotes diferentes. */
export async function planoCorte(ctx: ContextoEmpresa, corpo: unknown): Promise<Montada> {
  const d = esquemaCorte.parse(corpo)
  return montarMistura(ctx, 'corte', d, { eCorte: true, projetoNovo: d.projetoNovo })
}

// Perda -----------------------------------------------------------------------------------------

/** Perda avulsa com motivo (cantina.md, Operações: perda). A composição não muda (5.3). */
export async function planoPerda(ctx: ContextoEmpresa, corpo: unknown): Promise<Montada> {
  const estab = ctx.exigirEstabelecimento()
  const d = esquemaPerda.parse(corpo)
  const executadoEm = dataExecucao(d.executadoEm)
  await conferirPessoas(ctx, [d.responsavelId, d.executadoPorId])
  for (const m of new Set(d.itens.map((i) => i.motivo)))
    await conferirOpcao(ctx, 'motivo_perda', m, 'Motivo de perda')

  const ids = d.itens.map((i) => i.recipienteId)
  const nomes = await codigosDeRecipientes(ctx, ids)
  const naData = await saldosNaData(ctx, ids, executadoEm)
  const linhas: LinhaOperacao[] = []
  const lancamentos: Lancamento[] = []
  for (const [n, i] of d.itens.entries()) {
    const parte = naData.find((x) => x.recipienteId === i.recipienteId)
    if (!parte)
      throw new ErroRegra(
        `O recipiente ${nomes.get(i.recipienteId) ?? ''} está vazio na data da execução.`,
        'vazio',
      )
    const cl = i.esvaziar ? parte.cl : paraCentilitros(i.litros!)
    linhas.push({
      ordem: n + 1,
      papel: 'perda',
      recipienteId: i.recipienteId,
      lote: { id: parte.loteId },
      centilitros: cl,
      motivoPerda: i.motivo,
      esvaziarOrigem: i.esvaziar,
    })
    lancamentos.push({
      recipienteId: i.recipienteId,
      lote: { id: parte.loteId },
      centilitros: -cl,
      tipo: 'perda',
      linha: n + 1,
    })
  }
  const loteIds = [...new Set(naData.map((x) => x.loteId))]
  const projetos = loteIds.length
    ? [
        ...new Set(
          (
            await ctx.tx
              .select({ projetoId: s.lote.projetoId })
              .from(s.lote)
              .where(inArray(s.lote.id, loteIds))
          ).map((l) => l.projetoId),
        ),
      ]
    : []
  const projetoId = projetos.length === 1 ? projetos[0]! : null
  if (projetoId) await conferirEtapaPlano(ctx, d.planoEtapaId, projetoId)
  else if (d.planoEtapaId)
    throw new ErroRegra('A etapa do plano é de um só projeto.', 'plano_etapa')

  return {
    cientes: d.cientes,
    rascunhoId: d.rascunhoId ?? null,
    insumos: { lista: d.insumos, localEstoqueId: d.localEstoqueId, padrao: [] },
    plano: {
      tipo: 'perda',
      estabelecimentoId: estab,
      executadoEm,
      projetoId,
      responsavelId: d.responsavelId ?? null,
      executadoPorId: d.executadoPorId ?? null,
      planoEtapaId: d.planoEtapaId ?? null,
      observacao: d.observacao ?? null,
      dados: { motivos: [...new Set(d.itens.map((i) => i.motivo))] },
      linhas,
      lancamentos,
    },
  }
}
