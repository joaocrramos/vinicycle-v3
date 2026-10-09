// Motor das operações da cantina (03-modelo-de-dados.md, 4.3 a 4.4 e seção 5). Cada operação
// (desengace, prensagem e, no ciclo 4, trasfega, corte…) descreve os lançamentos que quer fazer;
// o motor confere os bloqueios físicos e de integridade, calcula a composição de cada recipiente
// afetado, levanta os avisos que pedem "ciente" (P29) e grava tudo numa transação só.
import {
  type Composicao,
  COMPOSICAO_VAZIA,
  deCentilitros,
  misturar,
  paraCentilitros,
  safraCicloPredominante,
  type SITUACOES_RECIPIENTE,
  type TipoMovimento,
  type TipoOperacao,
  TIPOS_OPERACAO,
} from '@vinicycle/shared'
import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import * as s from '../../db/schema'
import { ErroNaoEncontrado, ErroRegra } from '../../nucleo/erros'
import { anoNoFuso, proximoCodigo } from '../../nucleo/numeracao'
import { exigirMesAberto, mesFechado } from '../../nucleo/periodo'
import { type Aviso, exigirCientes, gravarOcorrencias } from '../../nucleo/regras'
import type { ContextoEmpresa } from '../../nucleo/requisicao'
import { lancarEstoque, type MovimentoNovo } from '../estoque'
import { lerParametro } from '../parametros'

export type { Aviso }

/** Lote já existente (pelo id) ou criado pela operação (pela chave local). */
export type RefLote = { id: string } | { novo: string }

export interface LoteNovo {
  chave: string
  /** Vazio = o projeto novo que a operação cria (corte entre projetos). */
  projetoId: string | null
  /** Vazio = a própria empresa. */
  titularId: string | null
  origem: (typeof s.lote.$inferInsert)['origem']
  etapa?: string | null
}

/** De onde vem a composição dos litros que entram (5.3). Sem ela, os litros não mudam a composição. */
export type OrigemComposicao = { recipienteId: string } | { composicao: Composicao }

export interface Lancamento {
  recipienteId: string
  lote: RefLote
  /** Com sinal: + entra, − sai. */
  centilitros: number
  tipo: TipoMovimento
  estimado?: boolean
  /** Ordem da linha da operação que gerou o lançamento. */
  linha?: number
  composicao?: OrigemComposicao
}

export interface ConsumoUva {
  itemId: string
  /** Décimos de kg (1 casa), positivo: o motor lança negativo. */
  decikg: number
  recipienteId: string
  lote: RefLote
  centilitros: number
  estimado: boolean
}

export interface LigacaoGenealogia {
  origem: RefLote
  destino: RefLote
  centilitros: number
  tipo: (typeof s.genealogia.$inferInsert)['tipo']
}

export interface LinhaOperacao {
  ordem: number
  papel: (typeof s.operacaoLinha.$inferInsert)['papel']
  recipienteId?: string | null
  lote?: RefLote | null
  centilitros?: number | null
  fracaoPrensa?: string | null
  motivoPerda?: string | null
  mistura?: 'incorporar' | 'lote_novo' | null
  esvaziarOrigem?: boolean
  /** Volume medido no inventário (centilitros). */
  litrosMedidos?: number | null
}

/** Insumo aplicado (2.5, Adição de insumo), já com a quantidade e o SO₂ calculados. */
export interface InsumoAplicado {
  recipienteId: string
  /** Lote do recipiente depois da operação (pode ser um lote novo dela). */
  lote: RefLote
  itemId: string | null
  loteItemId: string | null
  descricao: string | null
  dose: string
  unidade: string
  volumeTratado: string
  /** Na unidade base do item; vazio no insumo não estocado. */
  quantidade: string | null
  so2: number | null
  aplicadoEm: Date
  temperatura: string | null
}

export interface PlanoOperacao {
  tipo: TipoOperacao
  estabelecimentoId: string
  executadoEm: Date
  projetoId: string | null
  responsavelId?: string | null
  executadoPorId?: string | null
  planoEtapaId?: string | null
  observacao?: string | null
  eCorte?: boolean
  dados?: Record<string, unknown> | null
  linhas: LinhaOperacao[]
  lancamentos: Lancamento[]
  consumos?: ConsumoUva[]
  genealogia?: LigacaoGenealogia[]
  lotesNovos?: LoteNovo[]
  /** Rendimento real (L/kg) gravado no lote, na prensagem. */
  rendimentos?: Array<{ lote: RefLote; litrosPorKg: string }>
  residuos?: Array<{ tipo: 'engaco' | 'bagaco'; decikg: number; destino: string | null }>
  /** Avisos levantados pela própria operação (ex.: rendimento acima do limite legal). */
  avisos?: Aviso[]
  /**
   * Projeto novo criado na confirmação: lote novo com vinhos de projetos diferentes (cantina.md,
   * Corte entre projetos). Os lotes novos sem projeto e a operação sem projeto vão para ele.
   */
  projetoNovo?: {
    nome: string
    cor: string | null
    enologoId: string | null
    origemId: string | null
  }
  /** Projetos de origem que, sem saldo depois da operação, se encerram "incorporados" ao destino. */
  encerrarProjetos?: string[]
  /** Mudanças na composição sem movimento de volume: SO₂ adicionado (mg/L) e chaptalização. */
  ajustesParte?: Array<{ recipienteId: string; so2?: number; chaptalizar?: boolean }>
  /** Limite de SO₂ total vigente (regra), para avisar quando o acumulado passa dele. */
  limiteSo2?: { maximo: number; regraId: string; fonte: string } | null
  insumos?: InsumoAplicado[]
  /** Baixas de estoque dos insumos; o motor liga cada uma à operação. */
  estoque?: MovimentoNovo[]
  chaptalizacao?: {
    acucarKg: string
    gramasPorLitro: string
    ganhoEstimado: string
    regra: string | null
  }
  parametros?: Array<{ parametroId: string; valor: string }>
  /** Higienização ou manutenção: devolve os recipientes a "ativo" (cantina.md, Recipientes). */
  higienizacao?: {
    tipo: 'higienizacao' | 'manutencao'
    recipientes: string[]
    produto: string | null
    dose: string | null
  }
  /** Entrada ou saída de granel: nota, partes, GLT e embalagem (cantina.md, Granel e GLT). */
  granel?: Omit<typeof s.operacaoGranel.$inferInsert, 'operacaoId' | 'empresaId'>
  /** Início (cria a fermentação) ou fim (liga a operação à fermentação em andamento). */
  fermentacao?: {
    loteId: string
    tipo: 'alcoolica' | 'malolatica'
    evento: 'inicio' | 'fim'
    id?: string
  }
}

export interface ParteAntesDepois {
  recipienteId: string
  recipiente: string
  capacidade: string
  antes: { litros: string; loteId: string | null; composicao: Composicao }
  depois: { litros: string; lote: RefLote | null; composicao: Composicao }
}

export interface Previa {
  recipientes: ParteAntesDepois[]
  /** Perdas lançadas (borra, evaporação…), para conferir antes de confirmar. */
  perdas: Array<{
    recipienteId: string
    recipiente: string
    litros: string
    motivo: string | null
  }>
  avisos: Aviso[]
  bloqueios: string[]
  /** Recipientes que esvaziam e passam a "aguardando higienização" (parâmetro da empresa). */
  higienizar: Array<{ recipienteId: string; recipiente: string }>
}

const chaveLote = (r: RefLote) => ('id' in r ? `id:${r.id}` : `novo:${r.novo}`)

interface Recipiente {
  id: string
  codigo: string
  capacidadeCl: number
  situacao: string
  estabelecimentoId: string
}

interface ParteAtual {
  versaoId: string
  loteId: string
  vigenteDesde: Date
  composicao: Composicao
}

/**
 * Composição vigente de cada recipiente: a última versão (pela data de execução e lançamento).
 * Versões de operação estornada não valem, e as versões gravadas pelo estorno (5.5) são só o
 * registro da volta: a vigente é a última de operação não estornada.
 */
export async function partesAtuais(
  ctx: ContextoEmpresa,
  ids: string[],
): Promise<Map<string, ParteAtual>> {
  const mapa = new Map<string, ParteAtual>()
  if (!ids.length) return mapa
  const versoes = await ctx.tx
    .selectDistinctOn([s.composicaoParte.recipienteId], {
      id: s.composicaoParte.id,
      recipienteId: s.composicaoParte.recipienteId,
      loteId: s.composicaoParte.loteId,
      vigenteDesde: s.composicaoParte.vigenteDesde,
      chaptalizado: s.composicaoParte.chaptalizado,
      so2: s.composicaoParte.so2Adicionado,
    })
    .from(s.composicaoParte)
    .where(
      and(
        inArray(s.composicaoParte.recipienteId, ids),
        eq(s.composicaoParte.eEstorno, false),
        sql`not exists (select 1 from operacao o where o.id = ${s.composicaoParte.operacaoId} and o.situacao = 'estornada')`,
      ),
    )
    .orderBy(
      s.composicaoParte.recipienteId,
      desc(s.composicaoParte.vigenteDesde),
      desc(s.composicaoParte.lancadaEm),
      desc(s.composicaoParte.id),
    )
  const itens = versoes.length
    ? await ctx.tx
        .select()
        .from(s.composicaoParteItem)
        .where(
          inArray(
            s.composicaoParteItem.parteId,
            versoes.map((v) => v.id),
          ),
        )
    : []
  for (const v of versoes) {
    mapa.set(v.recipienteId, {
      versaoId: v.id,
      loteId: v.loteId,
      vigenteDesde: v.vigenteDesde,
      composicao: {
        chaptalizado: v.chaptalizado,
        so2: Number(v.so2),
        componentes: itens
          .filter((i) => i.parteId === v.id)
          .map((i) => ({
            variedadeId: i.variedadeId,
            safra: i.safra,
            ciclo: i.ciclo,
            origem: i.origem,
            organica: i.organica,
            candidataIp: i.candidataIp,
            fracao: Number(i.fracao),
          })),
      },
    })
  }
  return mapa
}

/**
 * Prepara a operação: lê saldos e composições, confere bloqueios e calcula o resultado. Com
 * `travar`, trava os recipientes e os itens de romaneio na ordem dos identificadores (4.4).
 */
export async function preparar(
  ctx: ContextoEmpresa,
  plano: PlanoOperacao,
  opcoes: { travar: boolean },
) {
  const bloqueios: string[] = []
  const avisos: Aviso[] = [...(plano.avisos ?? [])]
  const lancamentos = plano.lancamentos.filter((l) => l.centilitros !== 0)
  // Mês fechado não recebe lançamentos (P13; cantina.md, Declarações e fechamento).
  const fechado = await mesFechado(ctx.tx, plano.estabelecimentoId, plano.executadoEm)
  if (fechado) bloqueios.push(fechado)
  const consumos = plano.consumos ?? []

  // Recipientes envolvidos: os lançados, os que dão composição a outros e os ajustados.
  const ajustes = new Map((plano.ajustesParte ?? []).map((a) => [a.recipienteId, a]))
  const ids = [
    ...new Set([
      ...lancamentos.map((l) => l.recipienteId),
      ...ajustes.keys(),
      ...lancamentos.flatMap((l) =>
        l.composicao && 'recipienteId' in l.composicao ? [l.composicao.recipienteId] : [],
      ),
    ]),
  ].sort()
  const linhasRecipientes = ids.length
    ? await ctx.tx
        .select({
          id: s.recipiente.id,
          codigo: s.recipiente.codigo,
          capacidade: s.recipiente.capacidadeLitros,
          situacao: s.recipiente.situacao,
          estabelecimentoId: s.recipiente.estabelecimentoId,
        })
        .from(s.recipiente)
        .where(and(inArray(s.recipiente.id, ids), eq(s.recipiente.empresaId, ctx.empresaId)))
        .orderBy(asc(s.recipiente.id))
        .for(opcoes.travar ? 'update' : 'share')
    : []
  const recipientes = new Map<string, Recipiente>(
    linhasRecipientes.map((r) => [r.id, { ...r, capacidadeCl: paraCentilitros(r.capacidade) }]),
  )
  for (const id of ids) {
    const r = recipientes.get(id)
    if (!r) throw new ErroRegra('Recipiente não encontrado.', 'recipiente')
    if (r.estabelecimentoId !== plano.estabelecimentoId)
      throw new ErroRegra(`O recipiente ${r.codigo} é de outro estabelecimento.`, 'recipiente')
  }

  // Saldos por recipiente e lote: agora, até a data de execução, e os lançamentos posteriores.
  const saldos = ids.length
    ? await ctx.tx
        .select({
          recipienteId: s.movimentoVolume.recipienteId,
          loteId: s.movimentoVolume.loteId,
          total: sql<string>`sum(${s.movimentoVolume.litros})`,
          ateData: sql<string>`sum(${s.movimentoVolume.litros}) filter (where ${s.movimentoVolume.executadoEm} <= ${plano.executadoEm})`,
        })
        .from(s.movimentoVolume)
        .where(inArray(s.movimentoVolume.recipienteId, ids))
        .groupBy(s.movimentoVolume.recipienteId, s.movimentoVolume.loteId)
    : []
  const posteriores = ids.length
    ? await ctx.tx
        .select({
          recipienteId: s.movimentoVolume.recipienteId,
          litros: s.movimentoVolume.litros,
          executadoEm: s.movimentoVolume.executadoEm,
        })
        .from(s.movimentoVolume)
        .where(
          and(
            inArray(s.movimentoVolume.recipienteId, ids),
            gt(s.movimentoVolume.executadoEm, plano.executadoEm),
          ),
        )
        .orderBy(asc(s.movimentoVolume.executadoEm))
    : []
  const partes = await partesAtuais(ctx, ids)

  const saldoRecipiente = (recipienteId: string) =>
    saldos
      .filter((x) => x.recipienteId === recipienteId)
      .reduce((t, x) => t + paraCentilitros(x.total ?? 0), 0)
  const saldoNaData = (recipienteId: string) =>
    saldos
      .filter((x) => x.recipienteId === recipienteId)
      .reduce((t, x) => t + paraCentilitros(x.ateData ?? 0), 0)

  // Lotes existentes citados: titular e projeto, para conferir a mistura entre titulares.
  const lotesCitados = [
    ...new Set([
      ...lancamentos.flatMap((l) => ('id' in l.lote ? [l.lote.id] : [])),
      ...saldos.map((x) => x.loteId),
    ]),
  ]
  const lotesExistentes = lotesCitados.length
    ? await ctx.tx
        .select({ id: s.lote.id, codigo: s.lote.codigo, titularId: s.lote.titularId })
        .from(s.lote)
        .where(inArray(s.lote.id, lotesCitados))
    : []
  const novos = new Map((plano.lotesNovos ?? []).map((n) => [n.chave, n]))
  const titularDe = (ref: RefLote | string): string | null => {
    const k = typeof ref === 'string' ? ref : chaveLote(ref)
    if (k.startsWith('novo:')) {
      const n = novos.get(k.slice(5))
      if (!n) throw new Error(`Lote novo sem definição: ${k}`)
      return n.titularId
    }
    return lotesExistentes.find((l) => `id:${l.id}` === k)?.titularId ?? null
  }

  const resultado: ParteAntesDepois[] = []
  const higienizar: Previa['higienizar'] = []
  const aoEsvaziar = (await lerParametro(ctx, 'higienizar_ao_esvaziar')).ativo
  const versoesNovas: Array<{
    recipienteId: string
    lote: RefLote
    centilitros: number
    composicao: Composicao
    anteriorId: string | null
  }> = []

  for (const id of ids) {
    const r = recipientes.get(id)!
    const meus = lancamentos.filter((l) => l.recipienteId === id)
    const ajuste = ajustes.get(id)
    if (!meus.length && !ajuste) continue // só deu composição a outro recipiente
    const antesCl = saldoRecipiente(id)
    const delta = meus.reduce((t, l) => t + l.centilitros, 0)
    const depoisCl = antesCl + delta
    const entra = meus.some((l) => l.centilitros > 0)
    if (aoEsvaziar && antesCl > 0 && depoisCl === 0 && r.situacao === 'ativo')
      higienizar.push({ recipienteId: id, recipiente: r.codigo })

    // Bloqueios físicos (4.3).
    if (entra && (r.situacao === 'manutencao' || r.situacao === 'inativo')) {
      bloqueios.push(
        `O recipiente ${r.codigo} está ${r.situacao === 'manutencao' ? 'em manutenção' : 'inativo'} e não pode receber vinho.`,
      )
    }
    if (entra && r.situacao === 'aguardando_higienizacao') {
      avisos.push({
        codigo: `higienizacao:${id}`,
        mensagem: `O recipiente ${r.codigo} está aguardando higienização.`,
      })
    }
    // Linha do tempo: da data de execução em diante, nunca negativo nem acima da capacidade.
    let corrente = saldoNaData(id) + delta
    const confere = (cl: number) => {
      if (cl < 0) return `O recipiente ${r.codigo} ficaria com volume negativo.`
      if (cl > r.capacidadeCl)
        return `O recipiente ${r.codigo} passaria da capacidade (${deCentilitros(r.capacidadeCl).replace('.', ',')} L).`
      return null
    }
    let erro = confere(corrente) ?? confere(depoisCl)
    for (const m of posteriores.filter((x) => x.recipienteId === id)) {
      if (erro) break
      corrente += paraCentilitros(m.litros)
      erro = confere(corrente)
      if (erro) erro += ' Há lançamentos posteriores à data informada.'
    }
    if (erro) bloqueios.push(erro)

    // Um lote por vez: depois da operação, no máximo um lote com saldo no recipiente.
    const porLote = new Map<string, number>()
    for (const x of saldos.filter((y) => y.recipienteId === id))
      porLote.set(`id:${x.loteId}`, paraCentilitros(x.total ?? 0))
    for (const l of meus) {
      const k = chaveLote(l.lote)
      porLote.set(k, (porLote.get(k) ?? 0) + l.centilitros)
    }
    for (const [k, v] of porLote) {
      if (v < 0) bloqueios.push(`O lote ficaria com saldo negativo no recipiente ${r.codigo}.`)
      if (v === 0) porLote.delete(k)
    }
    if (porLote.size > 1) {
      bloqueios.push(
        `O recipiente ${r.codigo} ficaria com mais de um lote. Escolha incorporar ou formar um lote novo.`,
      )
    }
    const loteFinal = [...porLote.keys()][0] ?? null

    // Mistura entre titulares: bloqueada (cantina.md, Mistura entre titulares). A transferência de
    // titularidade troca o dono de propósito; ela mesma confere o destino (titularidade.ts).
    if (loteFinal && plano.tipo !== 'titularidade') {
      const titularFinal = titularDe(loteFinal)
      const titularesQueEntram = meus
        .filter((l) => l.centilitros > 0 && l.composicao && 'recipienteId' in l.composicao)
        .map((l) => {
          const origem = (l.composicao as { recipienteId: string }).recipienteId
          const parteOrigem = partes.get(origem)
          return parteOrigem ? titularDe(`id:${parteOrigem.loteId}`) : titularFinal
        })
      const titularAnterior = [
        ...new Set(
          saldos
            .filter((x) => x.recipienteId === id && paraCentilitros(x.total ?? 0) > 0)
            .map((x) => titularDe(`id:${x.loteId}`)),
        ),
      ]
      if ([...titularesQueEntram, ...titularAnterior].some((t) => t !== titularFinal)) {
        bloqueios.push(
          `Lotes de titulares diferentes não se misturam no recipiente ${r.codigo}. Registre antes uma transferência de titularidade.`,
        )
      }
    }

    // Composição (5.3 e 5.4).
    const atual = partes.get(id)
    const composicaoAntes = antesCl > 0 && atual ? atual.composicao : COMPOSICAO_VAZIA
    const mudaVolume = meus.some((l) => l.centilitros > 0 && l.composicao)
    const loteAntes = atual && antesCl > 0 ? `id:${atual.loteId}` : null
    let composicaoDepois = composicaoAntes
    if (mudaVolume) {
      const saidas = meus.filter((l) => l.centilitros < 0).reduce((t, l) => t + l.centilitros, 0)
      const fica = antesCl + saidas
      const entradas = meus.filter((l) => l.centilitros > 0 && l.composicao)
      // Entrada que vem do próprio recipiente (troca de lote) não é vinho novo.
      const novas = entradas.filter(
        (l) => !('recipienteId' in l.composicao! && l.composicao.recipienteId === id),
      )
      composicaoDepois = misturar([
        { centilitros: Math.max(fica, 0), composicao: composicaoAntes },
        ...novas.map((l) => ({
          centilitros: l.centilitros,
          composicao:
            'composicao' in l.composicao!
              ? l.composicao.composicao
              : (partes.get(l.composicao!.recipienteId)?.composicao ?? COMPOSICAO_VAZIA),
        })),
      ])
    }
    if (depoisCl === 0) composicaoDepois = COMPOSICAO_VAZIA
    // Adição e chaptalização: o SO₂ soma e a marca de chaptalizado passa a valer na parte.
    if (ajuste) {
      if (depoisCl === 0) bloqueios.push(`O recipiente ${r.codigo} está vazio.`)
      composicaoDepois = {
        ...composicaoDepois,
        so2: Math.round(((composicaoDepois.so2 ?? 0) + (ajuste.so2 ?? 0)) * 100) / 100,
        chaptalizado: composicaoDepois.chaptalizado || !!ajuste.chaptalizar,
      }
      const limite = plano.limiteSo2
      if (ajuste.so2 && limite && (composicaoDepois.so2 ?? 0) > limite.maximo) {
        avisos.push({
          codigo: `so2:${id}`,
          mensagem: `O SO₂ adicionado no ${r.codigo} soma ${(composicaoDepois.so2 ?? 0).toLocaleString('pt-BR')} mg/L, acima do limite de ${limite.maximo.toLocaleString('pt-BR')} mg/L de SO₂ total.`,
          regraId: limite.regraId,
          valorApurado: String(composicaoDepois.so2),
          limite: String(limite.maximo),
          fonte: limite.fonte,
        })
      }
    }
    const mudaComposicao = mudaVolume || !!ajuste

    // Data passada que muda composição lida ou gravada depois: bloqueia (5.5, Decidido em 03/10/2026).
    const versaoPosterior = (rid: string) =>
      (partes.get(rid)?.vigenteDesde.getTime() ?? 0) > plano.executadoEm.getTime()
    if ((mudaComposicao || loteFinal !== loteAntes) && versaoPosterior(id)) {
      bloqueios.push(
        `O recipiente ${r.codigo} tem operação posterior à data informada que mudou a sua composição. Estorne-a antes, ou lance com a data de hoje.`,
      )
    }
    for (const l of meus) {
      if (l.composicao && 'recipienteId' in l.composicao && l.composicao.recipienteId !== id) {
        const origem = recipientes.get(l.composicao.recipienteId)!
        if (versaoPosterior(origem.id)) {
          bloqueios.push(
            `O recipiente ${origem.codigo} tem operação posterior à data informada que mudou a sua composição. Estorne-a antes, ou lance com a data de hoje.`,
          )
        }
      }
    }

    const loteDepois = loteFinal
      ? loteFinal.startsWith('id:')
        ? { id: loteFinal.slice(3) }
        : { novo: loteFinal.slice(5) }
      : null
    resultado.push({
      recipienteId: id,
      recipiente: r.codigo,
      capacidade: deCentilitros(r.capacidadeCl),
      antes: {
        litros: deCentilitros(antesCl),
        loteId: atual && antesCl > 0 ? atual.loteId : null,
        composicao: composicaoAntes,
      },
      depois: { litros: deCentilitros(depoisCl), lote: loteDepois, composicao: composicaoDepois },
    })
    // Nova versão quando a composição ou o lote mudam, ou quando o recipiente esvazia (5.1).
    if (mudaComposicao || loteFinal !== loteAntes || (depoisCl === 0 && antesCl > 0)) {
      const loteVersao = loteDepois ?? (atual ? { id: atual.loteId } : null)
      if (loteVersao) {
        versoesNovas.push({
          recipienteId: id,
          lote: loteVersao,
          centilitros: depoisCl,
          composicao: composicaoDepois,
          anteriorId: atual?.versaoId ?? null,
        })
      }
    }
  }

  // Uva a processar: o consumo não passa do saldo do item (4.3).
  const itensIds = [...new Set(consumos.map((c) => c.itemId))].sort()
  if (itensIds.length) {
    const itens = await ctx.tx
      .select({
        id: s.romaneioItem.id,
        liquido: sql<string>`coalesce((select sum(p.bruto_kg - p.tara_kg) from pesagem p where p.item_id = romaneio_item.id), 0)`,
        consumido: sql<string>`coalesce((select -sum(m.kg) from movimento_uva m where m.item_id = romaneio_item.id), 0)`,
        situacao: s.romaneio.situacao,
        romaneio: s.romaneio.codigo,
      })
      .from(s.romaneioItem)
      .innerJoin(s.romaneio, eq(s.romaneio.id, s.romaneioItem.romaneioId))
      .where(inArray(s.romaneioItem.id, itensIds))
      .orderBy(asc(s.romaneioItem.id))
      .for(opcoes.travar ? 'update' : 'share', { of: s.romaneioItem })
    for (const it of itens) {
      if (it.situacao !== 'confirmado')
        bloqueios.push('Só uva de romaneio confirmado pode ser processada.')
      const saldo = Math.round(Number(it.liquido) * 10) - Math.round(Number(it.consumido) * 10)
      const pedido = consumos.filter((c) => c.itemId === it.id).reduce((t, c) => t + c.decikg, 0)
      if (pedido > saldo) {
        bloqueios.push(
          `O romaneio ${it.romaneio} tem ${(saldo / 10).toLocaleString('pt-BR')} kg a processar nesse item; foram pedidos ${(pedido / 10).toLocaleString('pt-BR')} kg.`,
        )
      }
    }
    if (itens.length !== itensIds.length)
      throw new ErroRegra('Item de romaneio não encontrado.', 'item')
  }

  // Baixa dos insumos: saldo negativo de insumo não bloqueia, mas pede "ciente" (2.4).
  if (plano.estoque?.length) {
    const r = await lancarEstoque(ctx, {
      estabelecimentoId: plano.estabelecimentoId,
      executadoEm: plano.executadoEm,
      movimentos: plano.estoque,
      gravar: false,
      travar: opcoes.travar,
    })
    avisos.push(...r.avisos)
  }

  const perdas = lancamentos
    .filter((l) => l.tipo === 'perda' || l.tipo === 'evaporacao')
    .map((l) => ({
      recipienteId: l.recipienteId,
      recipiente: recipientes.get(l.recipienteId)!.codigo,
      litros: deCentilitros(-l.centilitros),
      motivo:
        l.tipo === 'evaporacao'
          ? 'evaporacao'
          : (plano.linhas.find((x) => x.ordem === l.linha)?.motivoPerda ?? null),
    }))

  return {
    previa: {
      recipientes: resultado,
      perdas,
      avisos,
      bloqueios: [...new Set(bloqueios)],
      higienizar,
    } satisfies Previa,
    versoesNovas,
  }
}

const lista = (ids: string[]) =>
  sql.join(
    ids.map((x) => sql`${x}`),
    sql`, `,
  )

/** Situação dos lotes tocados: sem saldo em nenhum recipiente = "sem saldo". */
async function situacaoDosLotes(ctx: ContextoEmpresa, ids: string[]) {
  if (!ids.length) return
  await ctx.tx.execute(sql`
    update lote set situacao = case when coalesce((select sum(m.litros) from movimento_volume m where m.lote_id = lote.id), 0) > 0 then 'ativo' else 'sem_saldo' end
    where lote.id in (${lista(ids)})`)
}

/** Trava o rascunho antes dos recipientes (mesma ordem do estorno: operação, depois recipientes). */
async function travarRascunho(ctx: ContextoEmpresa, id: string, plano: PlanoOperacao) {
  const [r] = await ctx.tx
    .select({
      tipo: s.operacao.tipo,
      situacao: s.operacao.situacao,
      estab: s.operacao.estabelecimentoId,
    })
    .from(s.operacao)
    .where(and(eq(s.operacao.id, id), eq(s.operacao.empresaId, ctx.empresaId)))
    .for('update')
  if (!r || r.estab !== plano.estabelecimentoId)
    throw new ErroRegra('Rascunho não encontrado.', 'rascunho')
  if (r.situacao !== 'rascunho')
    throw new ErroRegra('Este rascunho já foi confirmado ou descartado.', 'rascunho')
  if (r.tipo !== plano.tipo) throw new ErroRegra('O rascunho é de outra operação.', 'rascunho')
}

/**
 * Higienização ou manutenção (cantina.md, Recipientes): grava a linha de cada recipiente com a
 * situação de antes e o devolve a "ativo" (o inativo fica como está). Base: Decreto 12.709/2025,
 * art. 120, IV.
 */
async function higienizar(
  ctx: ContextoEmpresa,
  h: NonNullable<PlanoOperacao['higienizacao']>,
  operacaoId: string,
  codigo: string,
  agora: Date,
) {
  const atuais = await ctx.tx
    .select({ id: s.recipiente.id, situacao: s.recipiente.situacao })
    .from(s.recipiente)
    .where(inArray(s.recipiente.id, [...h.recipientes].sort()))
    .orderBy(asc(s.recipiente.id))
    .for('update')
  const motivo = `${h.tipo === 'higienizacao' ? 'Higienizado' : 'Manutenção registrada'} pela operação ${codigo}.`
  for (const r of atuais) {
    await ctx.tx.insert(s.operacaoHigienizacao).values({
      empresaId: ctx.empresaId,
      operacaoId,
      recipienteId: r.id,
      tipo: h.tipo,
      produto: h.produto,
      dose: h.dose,
      situacaoAnterior: r.situacao,
    })
    if (r.situacao !== 'aguardando_higienizacao' && r.situacao !== 'manutencao') continue
    await ctx.tx
      .update(s.recipiente)
      .set({
        situacao: 'ativo',
        situacaoDesde: agora,
        motivoSituacao: motivo,
        versao: sql`${s.recipiente.versao} + 1`,
      })
      .where(eq(s.recipiente.id, r.id))
    await ctx.auditar({
      acao: 'situacao',
      entidade: 'recipiente',
      registroId: r.id,
      antes: { situacao: r.situacao },
      depois: { situacao: 'ativo' },
      motivo,
    })
  }
}

/**
 * Confirma: confere de novo com os recipientes travados e grava tudo (4.4). Com `rascunhoId`, o
 * rascunho vira a operação confirmada, com o mesmo identificador.
 */
export async function confirmar(
  ctx: ContextoEmpresa,
  plano: PlanoOperacao,
  cientes: string[],
  opcoes: { rascunhoId?: string | null } = {},
): Promise<{ operacaoId: string; codigo: string; lotes: Record<string, string> }> {
  if (opcoes.rascunhoId) await travarRascunho(ctx, opcoes.rascunhoId, plano)
  const { previa, versoesNovas } = await preparar(ctx, plano, { travar: true })
  if (previa.bloqueios.length) {
    throw new ErroRegra(previa.bloqueios[0]!, 'bloqueio', { bloqueios: previa.bloqueios })
  }
  exigirCientes(previa.avisos, cientes)

  const [estab] = await ctx.tx
    .select({ fuso: s.estabelecimento.fuso })
    .from(s.estabelecimento)
    .where(eq(s.estabelecimento.id, plano.estabelecimentoId))
  const ano = anoNoFuso(plano.executadoEm, estab!.fuso)

  // Projeto novo do corte entre projetos: safra e ciclo predominantes nos lotes novos dele.
  let projetoNovoId: string | null = null
  if (plano.projetoNovo) {
    const chaves = new Set((plano.lotesNovos ?? []).filter((n) => !n.projetoId).map((n) => n.chave))
    const composicao = misturar(
      versoesNovas
        .filter((v) => 'novo' in v.lote && chaves.has(v.lote.novo))
        .map((p) => ({ centilitros: p.centilitros, composicao: p.composicao })),
    )
    const predominante = safraCicloPredominante(composicao) ?? { safra: ano, ciclo: null }
    const codigo = await proximoCodigo(ctx, {
      estabelecimentoId: plano.estabelecimentoId,
      tipo: 'projeto',
      ano: predominante.safra,
      ciclo: predominante.ciclo,
    })
    projetoNovoId = uuidv7()
    await ctx.tx.insert(s.projeto).values({
      id: projetoNovoId,
      empresaId: ctx.empresaId,
      estabelecimentoId: plano.estabelecimentoId,
      codigo,
      nome: plano.projetoNovo.nome,
      safraPrevista: predominante.safra,
      cicloPrevisto: predominante.ciclo,
      cor: plano.projetoNovo.cor,
      enologoId: plano.projetoNovo.enologoId,
      projetoOrigemId: plano.projetoNovo.origemId,
      situacao: 'em_producao',
      criadoPor: ctx.usuarioId,
      atualizadoPor: ctx.usuarioId,
    })
    await ctx.auditar({
      acao: 'criar',
      entidade: 'projeto',
      registroId: projetoNovoId,
      dados: { codigo, nome: plano.projetoNovo.nome, origem: 'corte' },
    })
  }
  const projetoDaOperacao = plano.projetoId ?? projetoNovoId

  // Lotes novos: código pela safra e ciclo predominantes na composição de nascimento (1.8).
  const lotes = new Map<string, string>()
  const codigos: Record<string, string> = {}
  for (const n of plano.lotesNovos ?? []) {
    const partesDoLote = versoesNovas.filter((v) => 'novo' in v.lote && v.lote.novo === n.chave)
    const composicao = misturar(
      partesDoLote.map((p) => ({ centilitros: p.centilitros, composicao: p.composicao })),
    )
    const predominante = safraCicloPredominante(composicao) ?? { safra: ano, ciclo: null }
    const codigo = await proximoCodigo(ctx, {
      estabelecimentoId: plano.estabelecimentoId,
      tipo: 'lote_producao',
      ano: predominante.safra,
      ciclo: predominante.ciclo,
    })
    const id = uuidv7()
    lotes.set(n.chave, id)
    codigos[n.chave] = codigo
    await ctx.tx.insert(s.lote).values({
      id,
      empresaId: ctx.empresaId,
      estabelecimentoId: plano.estabelecimentoId,
      codigo,
      projetoId: n.projetoId ?? projetoNovoId!,
      titularId: n.titularId,
      tipo: n.titularId ? 'terceiro' : 'propria',
      etapa: n.etapa ?? null,
      origem: n.origem,
      safra: predominante.safra,
      ciclo: predominante.ciclo,
      criadoPor: ctx.usuarioId,
      atualizadoPor: ctx.usuarioId,
    })
    if (n.etapa) {
      await ctx.tx
        .insert(s.loteEtapa)
        .values({ empresaId: ctx.empresaId, loteId: id, etapa: n.etapa, por: ctx.usuarioId })
    }
  }
  const idLote = (r: RefLote) => ('id' in r ? r.id : lotes.get(r.novo)!)

  const codigo = await proximoCodigo(ctx, {
    estabelecimentoId: plano.estabelecimentoId,
    tipo: 'operacao',
    ano,
  })
  const operacaoId = opcoes.rascunhoId ?? uuidv7()
  const agora = new Date()
  const cabecalho = {
    codigo,
    executadoEm: plano.executadoEm,
    lancadoEm: agora,
    executadoPorId: plano.executadoPorId ?? null,
    responsavelId: plano.responsavelId ?? null,
    projetoId: projetoDaOperacao,
    planoEtapaId: plano.planoEtapaId ?? null,
    eCorte: plano.eCorte ?? false,
    dados: plano.dados ?? null,
    observacao: plano.observacao ?? null,
    situacao: 'confirmada' as const,
    atualizadoPor: ctx.usuarioId,
  }
  if (opcoes.rascunhoId) {
    await ctx.tx
      .update(s.operacao)
      .set({ ...cabecalho, atualizadoEm: agora, versao: sql`${s.operacao.versao} + 1` })
      .where(eq(s.operacao.id, operacaoId))
  } else {
    await ctx.tx.insert(s.operacao).values({
      ...cabecalho,
      id: operacaoId,
      empresaId: ctx.empresaId,
      estabelecimentoId: plano.estabelecimentoId,
      tipo: plano.tipo,
      criadoPor: ctx.usuarioId,
    })
  }
  for (const n of plano.lotesNovos ?? []) {
    await ctx.tx
      .update(s.lote)
      .set({ operacaoOrigemId: operacaoId })
      .where(eq(s.lote.id, lotes.get(n.chave)!))
  }

  const idsLinha = new Map<number, string>()
  for (const l of plano.linhas) {
    const id = uuidv7()
    idsLinha.set(l.ordem, id)
    await ctx.tx.insert(s.operacaoLinha).values({
      id,
      empresaId: ctx.empresaId,
      operacaoId,
      ordem: l.ordem,
      papel: l.papel,
      recipienteId: l.recipienteId ?? null,
      loteId: l.lote ? idLote(l.lote) : null,
      litros:
        l.centilitros === null || l.centilitros === undefined ? null : deCentilitros(l.centilitros),
      fracaoPrensa: l.fracaoPrensa ?? null,
      motivoPerda: l.motivoPerda ?? null,
      mistura: l.mistura ?? null,
      esvaziarOrigem: l.esvaziarOrigem ?? false,
      litrosMedidos:
        l.litrosMedidos === null || l.litrosMedidos === undefined
          ? null
          : deCentilitros(l.litrosMedidos),
    })
  }

  const lancamentos = plano.lancamentos.filter((l) => l.centilitros !== 0)
  if (lancamentos.length) {
    await ctx.tx.insert(s.movimentoVolume).values(
      lancamentos.map((l) => ({
        empresaId: ctx.empresaId,
        estabelecimentoId: plano.estabelecimentoId,
        recipienteId: l.recipienteId,
        loteId: idLote(l.lote),
        litros: deCentilitros(l.centilitros),
        tipo: l.tipo,
        estimado: l.estimado ?? false,
        operacaoId,
        linhaId: l.linha === undefined ? null : (idsLinha.get(l.linha) ?? null),
        executadoEm: plano.executadoEm,
        lancadoEm: agora,
      })),
    )
  }
  if (plano.consumos?.length) {
    await ctx.tx.insert(s.movimentoUva).values(
      plano.consumos.map((c) => ({
        empresaId: ctx.empresaId,
        itemId: c.itemId,
        kg: (-c.decikg / 10).toFixed(1),
        operacaoId,
        loteId: idLote(c.lote),
        recipienteId: c.recipienteId,
        litros: deCentilitros(c.centilitros),
        estimado: c.estimado,
        executadoEm: plano.executadoEm,
        lancadoEm: agora,
      })),
    )
  }
  for (const g of plano.genealogia ?? []) {
    if (g.centilitros <= 0) continue
    await ctx.tx.insert(s.genealogia).values({
      empresaId: ctx.empresaId,
      origemLoteId: idLote(g.origem),
      destinoLoteId: idLote(g.destino),
      litros: deCentilitros(g.centilitros),
      operacaoId,
      tipo: g.tipo,
    })
  }
  for (const v of versoesNovas) {
    const parteId = uuidv7()
    await ctx.tx.insert(s.composicaoParte).values({
      id: parteId,
      empresaId: ctx.empresaId,
      loteId: idLote(v.lote),
      recipienteId: v.recipienteId,
      operacaoId,
      vigenteDesde: plano.executadoEm,
      lancadaEm: agora,
      volumeLitros: deCentilitros(v.centilitros),
      chaptalizado: v.composicao.chaptalizado,
      so2Adicionado: (v.composicao.so2 ?? 0).toFixed(2),
      anteriorId: v.anteriorId,
    })
    if (v.composicao.componentes.length) {
      await ctx.tx.insert(s.composicaoParteItem).values(
        v.composicao.componentes.map((c) => ({
          empresaId: ctx.empresaId,
          parteId,
          variedadeId: c.variedadeId,
          safra: c.safra,
          ciclo: c.ciclo,
          origem: c.origem,
          organica: c.organica,
          candidataIp: c.candidataIp,
          fracao: c.fracao.toFixed(8),
        })),
      )
    }
  }
  for (const r of plano.rendimentos ?? []) {
    await ctx.tx
      .update(s.lote)
      .set({
        rendimentoReal: r.litrosPorKg,
        atualizadoEm: sql`now()`,
        atualizadoPor: ctx.usuarioId,
      })
      .where(eq(s.lote.id, idLote(r.lote)))
  }
  if (plano.insumos?.length) {
    await ctx.tx.insert(s.operacaoInsumo).values(
      plano.insumos.map((i) => ({
        empresaId: ctx.empresaId,
        operacaoId,
        recipienteId: i.recipienteId,
        loteId: idLote(i.lote),
        itemId: i.itemId,
        loteItemId: i.loteItemId,
        descricao: i.descricao,
        dose: i.dose,
        unidade: i.unidade,
        volumeTratado: i.volumeTratado,
        quantidade: i.quantidade,
        so2: i.so2 === null ? null : i.so2.toFixed(2),
        aplicadoEm: i.aplicadoEm,
        temperatura: i.temperatura,
      })),
    )
  }
  if (plano.estoque?.length) {
    await lancarEstoque(ctx, {
      estabelecimentoId: plano.estabelecimentoId,
      executadoEm: plano.executadoEm,
      movimentos: plano.estoque.map((m) => ({ ...m, operacaoId })),
    })
  }
  if (plano.chaptalizacao) {
    await ctx.tx
      .insert(s.operacaoChaptalizacao)
      .values({ operacaoId, empresaId: ctx.empresaId, ...plano.chaptalizacao })
  }
  if (plano.fermentacao?.evento === 'inicio') {
    await ctx.tx.insert(s.fermentacao).values({
      empresaId: ctx.empresaId,
      estabelecimentoId: plano.estabelecimentoId,
      loteId: plano.fermentacao.loteId,
      tipo: plano.fermentacao.tipo,
      operacaoInicioId: operacaoId,
      criadoPor: ctx.usuarioId,
    })
  } else if (plano.fermentacao?.id) {
    await ctx.tx
      .update(s.fermentacao)
      .set({ operacaoFimId: operacaoId })
      .where(eq(s.fermentacao.id, plano.fermentacao.id))
  }
  if (plano.parametros?.length) {
    await ctx.tx
      .insert(s.operacaoParametro)
      .values(plano.parametros.map((p) => ({ ...p, empresaId: ctx.empresaId, operacaoId })))
  }
  if (plano.granel) {
    await ctx.tx
      .insert(s.operacaoGranel)
      .values({ ...plano.granel, operacaoId, empresaId: ctx.empresaId })
  }
  for (const r of plano.residuos ?? []) {
    await ctx.tx.insert(s.operacaoResiduo).values({
      empresaId: ctx.empresaId,
      operacaoId,
      tipo: r.tipo,
      kg: (r.decikg / 10).toFixed(1),
      destino: r.destino,
    })
  }

  // Recipiente que esvazia fica aguardando higienização (cantina.md, Recipientes; P29: a empresa
  // desliga em Configurações › Parâmetros). O estorno que devolve vinho não muda a situação.
  for (const h of previa.higienizar) {
    await ctx.tx
      .update(s.recipiente)
      .set({
        situacao: 'aguardando_higienizacao',
        situacaoDesde: agora,
        motivoSituacao: `Esvaziado pela operação ${codigo}.`,
        versao: sql`${s.recipiente.versao} + 1`,
      })
      .where(and(eq(s.recipiente.id, h.recipienteId), eq(s.recipiente.situacao, 'ativo')))
    await ctx.auditar({
      acao: 'situacao',
      entidade: 'recipiente',
      registroId: h.recipienteId,
      antes: { situacao: 'ativo' },
      depois: { situacao: 'aguardando_higienizacao' },
      motivo: `Esvaziado pela operação ${codigo}.`,
    })
  }
  if (plano.higienizacao) await higienizar(ctx, plano.higienizacao, operacaoId, codigo, agora)

  await situacaoDosLotes(ctx, [...new Set(lancamentos.map((l) => idLote(l.lote)))])
  // Projetos de origem sem saldo: encerrados como "incorporados" ao destino (cantina.md, Corte
  // entre projetos). A operação guarda quais encerrou e qual criou, para o estorno desfazer.
  const encerrados: string[] = []
  for (const id of new Set(plano.encerrarProjetos ?? [])) {
    if (!projetoDaOperacao || id === projetoDaOperacao) continue
    const r = await ctx.tx.execute<{ id: string }>(sql`
      update projeto set situacao = 'encerrado', situacao_desde = now(), incorporado_ao_projeto_id = ${projetoDaOperacao},
        atualizado_em = now(), atualizado_por = ${ctx.usuarioId}
      where id = ${id} and situacao not in ('encerrado', 'cancelado')
        and coalesce((select sum(m.litros) from movimento_volume m join lote l on l.id = m.lote_id where l.projeto_id = ${id}), 0) = 0
      returning id`)
    encerrados.push(...r.rows.map((x) => x.id))
  }
  if (encerrados.length || projetoNovoId) {
    await ctx.tx
      .update(s.operacao)
      .set({
        dados: sql`coalesce(${s.operacao.dados}, '{}'::jsonb) || ${JSON.stringify({
          projetoCriado: projetoNovoId,
          projetosEncerrados: encerrados,
        })}::jsonb`,
      })
      .where(eq(s.operacao.id, operacaoId))
  }

  // O projeto sai de "planejado" na primeira operação (cantina.md, Situações do projeto).
  if (plano.projetoId) {
    await ctx.tx
      .update(s.projeto)
      .set({ situacao: 'em_producao', situacaoDesde: sql`now()` })
      .where(and(eq(s.projeto.id, plano.projetoId), eq(s.projeto.situacao, 'planejado')))
  }

  // "Ciente" de cada aviso, auditado (P29).
  await gravarOcorrencias(
    ctx,
    { entidade: 'operacao', registroId: operacaoId, estabelecimentoId: plano.estabelecimentoId },
    previa.avisos,
  )
  await ctx.auditar({
    acao: 'confirmar',
    entidade: 'operacao',
    registroId: operacaoId,
    dados: {
      codigo,
      tipo: TIPOS_OPERACAO[plano.tipo],
      lotesNovos: Object.values(codigos),
      avisos: previa.avisos.map((a) => a.mensagem),
    },
  })
  return {
    operacaoId,
    codigo,
    lotes: Object.fromEntries([...lotes.entries()].map(([k, v]) => [k, v])),
  }
}

// Estorno (03-modelo-de-dados.md, 4.5 e 5.5) ----------------------------------------------------

export type Dependente = {
  id: string
  codigo: string
  tipo: string
  executadoEm: string
}

interface OperacaoEstornavel {
  id: string
  codigo: string | null
  tipo: string
  situacao: string
  estabelecimentoId: string
  projetoId: string | null
  executadoEm: Date
  lancadoEm: Date | null
}

async function carregarEstornavel(ctx: ContextoEmpresa, id: string, travar: boolean) {
  const consulta = ctx.tx
    .select({
      id: s.operacao.id,
      codigo: s.operacao.codigo,
      tipo: s.operacao.tipo,
      situacao: s.operacao.situacao,
      estabelecimentoId: s.operacao.estabelecimentoId,
      projetoId: s.operacao.projetoId,
      executadoEm: s.operacao.executadoEm,
      lancadoEm: s.operacao.lancadoEm,
    })
    .from(s.operacao)
    .where(and(eq(s.operacao.id, id), eq(s.operacao.empresaId, ctx.empresaId)))
  const [op] = travar ? await consulta.for('update') : await consulta
  if (!op || !(await ctx.estabelecimentosPermitidos()).includes(op.estabelecimentoId))
    throw new ErroNaoEncontrado('Operação não encontrada.')
  if (op.tipo === 'estorno')
    throw new ErroRegra('O estorno não se estorna: lance a operação de novo.', 'estorno')
  if (op.situacao === 'estornada') throw new ErroRegra('Esta operação já foi estornada.', 'estorno')
  if (op.situacao !== 'confirmada')
    throw new ErroRegra('Só operação confirmada se estorna; o rascunho se descarta.', 'estorno')
  return op as OperacaoEstornavel
}

/**
 * Operações confirmadas, não estornadas, que tocaram os mesmos recipientes ou lotes e foram
 * lançadas depois ou têm data de execução posterior: precisam ser estornadas antes, da mais nova
 * para a mais antiga (4.5; cantina.md, Estorno de operação com dependentes).
 */
export async function dependentes(
  ctx: ContextoEmpresa,
  op: Pick<OperacaoEstornavel, 'id' | 'executadoEm' | 'lancadoEm'>,
): Promise<Dependente[]> {
  const r = await ctx.tx.execute<Dependente>(sql`
    with tocados as (
      select recipiente_id, lote_id from movimento_volume where operacao_id = ${op.id}
      union
      select recipiente_id, lote_id from operacao_linha where operacao_id = ${op.id}
    )
    select o.id, o.codigo, o.tipo, o.executado_em as "executadoEm"
    from operacao o
    where o.empresa_id = ${ctx.empresaId} and o.id <> ${op.id}
      and o.situacao = 'confirmada' and o.tipo <> 'estorno'
      and (o.lancado_em > ${op.lancadoEm} or o.executado_em > ${op.executadoEm})
      and exists (
        select 1 from (
          select recipiente_id, lote_id from movimento_volume where operacao_id = o.id
          union all
          select recipiente_id, lote_id from operacao_linha where operacao_id = o.id
        ) x
        where x.recipiente_id in (select recipiente_id from tocados)
           or x.lote_id in (select lote_id from tocados)
      )
    order by o.lancado_em desc, o.executado_em desc`)
  return r.rows
}

/** O que o estorno faria: dependentes, volumes antes e depois e bloqueios. */
async function avaliarEstorno(ctx: ContextoEmpresa, op: OperacaoEstornavel, travar: boolean) {
  const movimentos = await ctx.tx
    .select()
    .from(s.movimentoVolume)
    .where(eq(s.movimentoVolume.operacaoId, op.id))
  const ids = [
    ...new Set([
      ...movimentos.map((m) => m.recipienteId),
      ...(
        await ctx.tx
          .select({ id: s.composicaoParte.recipienteId })
          .from(s.composicaoParte)
          .where(eq(s.composicaoParte.operacaoId, op.id))
      ).map((x) => x.id),
    ]),
  ].sort()
  const recipientes = ids.length
    ? await ctx.tx
        .select({
          id: s.recipiente.id,
          codigo: s.recipiente.codigo,
          capacidade: s.recipiente.capacidadeLitros,
        })
        .from(s.recipiente)
        .where(inArray(s.recipiente.id, ids))
        .orderBy(asc(s.recipiente.id))
        .for(travar ? 'update' : 'share')
    : []
  const itens = [
    ...new Set(
      (
        await ctx.tx
          .select({ itemId: s.movimentoUva.itemId })
          .from(s.movimentoUva)
          .where(eq(s.movimentoUva.operacaoId, op.id))
      ).map((x) => x.itemId),
    ),
  ].sort()
  if (itens.length) {
    await ctx.tx
      .select({ id: s.romaneioItem.id })
      .from(s.romaneioItem)
      .where(inArray(s.romaneioItem.id, itens))
      .orderBy(asc(s.romaneioItem.id))
      .for(travar ? 'update' : 'share')
  }

  const deps = await dependentes(ctx, op)
  const saldos = ids.length
    ? await ctx.tx
        .select({
          recipienteId: s.movimentoVolume.recipienteId,
          loteId: s.movimentoVolume.loteId,
          total: sql<string>`sum(${s.movimentoVolume.litros})`,
        })
        .from(s.movimentoVolume)
        .where(inArray(s.movimentoVolume.recipienteId, ids))
        .groupBy(s.movimentoVolume.recipienteId, s.movimentoVolume.loteId)
    : []
  const bloqueios: string[] = []
  if (deps.length) {
    bloqueios.push(
      `Estorne antes as operações posteriores, da mais nova para a mais antiga: ${deps.map((d) => d.codigo).join(', ')}.`,
    )
  }
  const volumes = recipientes.map((r) => {
    const antes = saldos
      .filter((x) => x.recipienteId === r.id)
      .reduce((t, x) => t + paraCentilitros(x.total), 0)
    const delta = movimentos
      .filter((m) => m.recipienteId === r.id)
      .reduce((t, m) => t + paraCentilitros(m.litros), 0)
    const depois = antes - delta
    // Sem dependentes, a operação é a última nesses recipientes: basta conferir o saldo final.
    if (depois < 0) bloqueios.push(`O recipiente ${r.codigo} ficaria com volume negativo.`)
    if (depois > paraCentilitros(r.capacidade))
      bloqueios.push(
        `O recipiente ${r.codigo} passaria da capacidade (${String(r.capacidade).replace('.', ',')} L).`,
      )
    for (const x of saldos.filter((y) => y.recipienteId === r.id)) {
      const doLote = movimentos
        .filter((m) => m.recipienteId === r.id && m.loteId === x.loteId)
        .reduce((t, m) => t + paraCentilitros(m.litros), 0)
      if (paraCentilitros(x.total) - doLote < 0)
        bloqueios.push(`O lote ficaria com saldo negativo no recipiente ${r.codigo}.`)
    }
    return {
      recipienteId: r.id,
      recipiente: r.codigo,
      capacidade: r.capacidade,
      antes: deCentilitros(antes),
      depois: deCentilitros(depois),
    }
  })
  return { movimentos, volumes, dependentes: deps, bloqueios: [...new Set(bloqueios)] }
}

export async function previaEstorno(ctx: ContextoEmpresa, operacaoId: string) {
  const op = await carregarEstornavel(ctx, operacaoId, false)
  const { volumes, dependentes: deps, bloqueios } = await avaliarEstorno(ctx, op, false)
  return { codigo: op.codigo, recipientes: volumes, dependentes: deps, bloqueios }
}

/**
 * Estorna: lançamentos inversos com a data original, uva de volta ao saldo a processar,
 * genealogia marcada, composição de cada recipiente de volta à versão anterior (4.5 e 5.5). A
 * operação original passa a "estornada" e o estorno é uma operação própria, com motivo (P13).
 */
export async function estornar(
  ctx: ContextoEmpresa,
  operacaoId: string,
  motivo: string,
): Promise<{ operacaoId: string; codigo: string }> {
  const op = await carregarEstornavel(ctx, operacaoId, true)
  // O estorno leva a data da operação: em mês fechado, reabra antes (P13).
  await exigirMesAberto(ctx.tx, op.estabelecimentoId, op.executadoEm)
  const { movimentos, bloqueios, dependentes: deps } = await avaliarEstorno(ctx, op, true)
  if (bloqueios.length)
    throw new ErroRegra(bloqueios[0]!, deps.length ? 'dependentes' : 'bloqueio', {
      bloqueios,
      dependentes: deps,
    })

  const [estab] = await ctx.tx
    .select({ fuso: s.estabelecimento.fuso })
    .from(s.estabelecimento)
    .where(eq(s.estabelecimento.id, op.estabelecimentoId))
  const codigo = await proximoCodigo(ctx, {
    estabelecimentoId: op.estabelecimentoId,
    tipo: 'operacao',
    ano: anoNoFuso(op.executadoEm, estab!.fuso),
  })
  const estornoId = uuidv7()
  const agora = new Date()
  await ctx.tx.insert(s.operacao).values({
    id: estornoId,
    empresaId: ctx.empresaId,
    estabelecimentoId: op.estabelecimentoId,
    codigo,
    tipo: 'estorno',
    executadoEm: op.executadoEm,
    lancadoEm: agora,
    projetoId: op.projetoId,
    situacao: 'confirmada',
    estornoDeId: op.id,
    motivo,
    criadoPor: ctx.usuarioId,
    atualizadoPor: ctx.usuarioId,
  })
  await ctx.tx
    .update(s.operacao)
    .set({
      situacao: 'estornada',
      atualizadoEm: agora,
      atualizadoPor: ctx.usuarioId,
      versao: sql`${s.operacao.versao} + 1`,
    })
    .where(eq(s.operacao.id, op.id))

  // Lançamentos inversos, com a data de execução original (4.5).
  if (movimentos.length) {
    await ctx.tx.insert(s.movimentoVolume).values(
      movimentos.map((m) => ({
        empresaId: ctx.empresaId,
        estabelecimentoId: m.estabelecimentoId,
        recipienteId: m.recipienteId,
        loteId: m.loteId,
        litros: deCentilitros(-paraCentilitros(m.litros)),
        tipo: 'estorno',
        estimado: m.estimado,
        operacaoId: estornoId,
        executadoEm: m.executadoEm,
        lancadoEm: agora,
        estornoDeId: m.id,
      })),
    )
  }
  const uva = await ctx.tx.select().from(s.movimentoUva).where(eq(s.movimentoUva.operacaoId, op.id))
  if (uva.length) {
    await ctx.tx.insert(s.movimentoUva).values(
      uva.map((m) => ({
        empresaId: ctx.empresaId,
        itemId: m.itemId,
        kg: (-Number(m.kg)).toFixed(1),
        operacaoId: estornoId,
        loteId: m.loteId,
        recipienteId: m.recipienteId,
        litros: deCentilitros(-paraCentilitros(m.litros)),
        estimado: m.estimado,
        executadoEm: m.executadoEm,
        lancadoEm: agora,
        estornoDeId: m.id,
      })),
    )
  }
  await ctx.tx
    .update(s.genealogia)
    .set({ estornada: true })
    .where(eq(s.genealogia.operacaoId, op.id))

  // Insumos: a baixa volta ao estoque, ligada ao estorno.
  const baixas = await ctx.tx
    .select()
    .from(s.movimentoEstoque)
    .where(eq(s.movimentoEstoque.operacaoId, op.id))
  if (baixas.length) {
    await lancarEstoque(ctx, {
      estabelecimentoId: op.estabelecimentoId,
      executadoEm: op.executadoEm,
      movimentos: baixas.map((m) => ({
        localId: m.localId,
        itemId: m.itemId,
        loteItemId: m.loteItemId,
        quantidade: (-Number(m.quantidade)).toFixed(3),
        tipo: 'estorno' as const,
        motivo,
        operacaoId: estornoId,
        estornoDeId: m.id,
      })),
    })
  }

  // Composição: cada recipiente ganha uma versão igual à anterior à operação (5.5). Se a
  // operação criou a parte, a parte fica sem saldo e se encerra.
  const versoes = await ctx.tx
    .select()
    .from(s.composicaoParte)
    .where(eq(s.composicaoParte.operacaoId, op.id))
  const anteriores = versoes.flatMap((v) => (v.anteriorId ? [v.anteriorId] : []))
  const [partesAnteriores, itensAnteriores] = anteriores.length
    ? await Promise.all([
        ctx.tx.select().from(s.composicaoParte).where(inArray(s.composicaoParte.id, anteriores)),
        ctx.tx
          .select()
          .from(s.composicaoParteItem)
          .where(inArray(s.composicaoParteItem.parteId, anteriores)),
      ])
    : [[], []]
  for (const v of versoes) {
    const anterior = partesAnteriores.find((p) => p.id === v.anteriorId)
    const [saldo] = await ctx.tx
      .select({ total: sql<string>`coalesce(sum(${s.movimentoVolume.litros}), 0)` })
      .from(s.movimentoVolume)
      .where(eq(s.movimentoVolume.recipienteId, v.recipienteId))
    const parteId = uuidv7()
    await ctx.tx.insert(s.composicaoParte).values({
      id: parteId,
      empresaId: ctx.empresaId,
      loteId: anterior?.loteId ?? v.loteId,
      recipienteId: v.recipienteId,
      operacaoId: estornoId,
      vigenteDesde: op.executadoEm,
      lancadaEm: agora,
      volumeLitros: anterior ? saldo!.total : '0',
      chaptalizado: anterior?.chaptalizado ?? false,
      so2Adicionado: anterior?.so2Adicionado ?? '0',
      anteriorId: v.id,
      eEstorno: true,
    })
    const itens = itensAnteriores.filter((i) => anterior && i.parteId === anterior.id)
    if (itens.length) {
      await ctx.tx
        .insert(s.composicaoParteItem)
        .values(itens.map(({ id: _id, parteId: _parte, ...i }) => ({ ...i, parteId })))
    }
  }

  // Rendimento real: volta ao da última prensagem não estornada do lote (ou fica vazio).
  const lotes = [...new Set(movimentos.map((m) => m.loteId))]
  if (op.tipo === 'prensagem' && lotes.length) {
    await ctx.tx.execute(sql`
      update lote set rendimento_real = (
        select (o.dados->>'rendimento')::numeric from operacao o
        where o.tipo = 'prensagem' and o.situacao = 'confirmada' and o.dados->>'rendimento' is not null
          and exists (select 1 from movimento_volume m where m.operacao_id = o.id and m.lote_id = lote.id)
        order by o.executado_em desc, o.lancado_em desc limit 1)
      where lote.id in (${lista(lotes)})`)
  }
  await situacaoDosLotes(ctx, lotes)

  // Higienização estornada: o recipiente que ela devolveu a "ativo" volta à situação de antes.
  const higienizados = await ctx.tx
    .select()
    .from(s.operacaoHigienizacao)
    .where(eq(s.operacaoHigienizacao.operacaoId, op.id))
  for (const h of higienizados) {
    if (h.situacaoAnterior === 'ativo') continue
    const r = await ctx.tx
      .update(s.recipiente)
      .set({
        situacao: h.situacaoAnterior as (typeof SITUACOES_RECIPIENTE)[number],
        situacaoDesde: agora,
        motivoSituacao: `Estorno da operação ${op.codigo}: ${motivo}`,
        versao: sql`${s.recipiente.versao} + 1`,
      })
      .where(and(eq(s.recipiente.id, h.recipienteId), eq(s.recipiente.situacao, 'ativo')))
      .returning({ id: s.recipiente.id })
    if (r.length)
      await ctx.auditar({
        acao: 'situacao',
        entidade: 'recipiente',
        registroId: h.recipienteId,
        antes: { situacao: 'ativo' },
        depois: { situacao: h.situacaoAnterior },
        motivo: `Estorno da operação ${op.codigo}.`,
      })
  }

  // Projetos: os encerrados pela operação reabrem; o criado por ela fica cancelado, sem saldo.
  const [{ dados } = { dados: null }] = await ctx.tx
    .select({ dados: s.operacao.dados })
    .from(s.operacao)
    .where(eq(s.operacao.id, op.id))
  const projetos = (dados ?? {}) as {
    projetoCriado?: string | null
    projetosEncerrados?: string[]
  }
  if (projetos.projetosEncerrados?.length) {
    await ctx.tx
      .update(s.projeto)
      .set({
        situacao: 'em_producao',
        situacaoDesde: sql`now()`,
        incorporadoAoProjetoId: null,
        atualizadoPor: ctx.usuarioId,
      })
      .where(inArray(s.projeto.id, projetos.projetosEncerrados))
  }
  if (projetos.projetoCriado) {
    await ctx.tx
      .update(s.projeto)
      .set({ situacao: 'cancelado', situacaoDesde: sql`now()`, atualizadoPor: ctx.usuarioId })
      .where(eq(s.projeto.id, projetos.projetoCriado))
  }

  await ctx.auditar({
    acao: 'estornar',
    entidade: 'operacao',
    registroId: op.id,
    dados: { codigo: op.codigo, estorno: codigo, motivo },
  })
  return { operacaoId: estornoId, codigo }
}
