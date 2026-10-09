// EnoTrace › Operações: entrada e saída de granel (cantina.md, Granel e GLT; 03-modelo-de-dados.md,
// 2.5, Granel, e 5.3). A entrada põe vinho de fora num lote novo ou incorporado, com a composição
// informada (origem "granel") ou "não informada"; a saída tira litros para fora. As duas guardam a
// nota, as partes, a GLT e a embalagem; a saída sem GLT pede "ciente" (Decreto 12.709/2025, art.
// 203, IV). O motor confere, calcula a composição e grava (motor.ts).
import {
  type Composicao,
  entradaGranel as esquemaEntrada,
  normalizar,
  paraCentilitros,
  recebimentoGranel,
  saidaGranel as esquemaSaida,
  TIPOS_ENTRADA_GRANEL,
  TIPOS_SAIDA_GRANEL,
} from '@vinicycle/shared'
import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../../db/schema'
import { ErroNaoEncontrado, ErroRegra } from '../../nucleo/erros'
import type { Aviso } from '../../nucleo/regras'
import { type ContextoEmpresa, naEmpresa } from '../../nucleo/requisicao'
import {
  carregarProjeto,
  codigosDeLotes,
  conferirEtapaPlano,
  conferirLoteExistente,
  conferirPessoas,
  dataExecucao,
  fusoDo,
  type Montada,
  saldosNaData,
  saldosPorLote,
  tratarLoteNoDestino,
} from './apoio'
import { avisoContrato } from '../contratos'
import type { Lancamento, LigacaoGenealogia, LinhaOperacao, LoteNovo, RefLote } from './motor'

/** Composição informada na entrada; sem ela, "não informada" (5.3). */
async function composicaoInformada(
  ctx: ContextoEmpresa,
  itens: ReturnType<typeof esquemaEntrada.parse>['composicao'],
): Promise<Composicao> {
  if (!itens.length)
    return {
      componentes: [
        {
          variedadeId: null,
          safra: null,
          ciclo: null,
          origem: 'nao_informada',
          organica: false,
          candidataIp: false,
          fracao: 1,
        },
      ],
      chaptalizado: false,
    }
  const ids = [...new Set(itens.map((i) => i.variedadeId))]
  const achadas = await ctx.tx
    .select({ id: s.variedade.id })
    .from(s.variedade)
    .where(
      and(
        inArray(s.variedade.id, ids),
        or(isNull(s.variedade.empresaId), eq(s.variedade.empresaId, ctx.empresaId)),
      ),
    )
  if (achadas.length !== ids.length) throw new ErroRegra('Variedade inválida.', 'variedade')
  return {
    componentes: normalizar(
      itens.map((i) => ({
        variedadeId: i.variedadeId,
        safra: i.safra ?? null,
        ciclo: i.ciclo ?? null,
        origem: 'granel' as const,
        organica: i.organica,
        candidataIp: false,
        fracao: Number(i.percentual) / 100,
      })),
    ),
    chaptalizado: false,
  }
}

type DocumentoGranel = Pick<
  ReturnType<typeof esquemaSaida.parse>,
  | 'notaNumero'
  | 'notaChave'
  | 'remetenteId'
  | 'destinatarioId'
  | 'transportadorId'
  | 'glt'
  | 'embalagem'
>

const documento = (d: DocumentoGranel) => ({
  notaNumero: d.notaNumero ?? null,
  notaChave: d.notaChave ?? null,
  remetenteId: d.remetenteId ?? null,
  destinatarioId: d.destinatarioId ?? null,
  transportadorId: d.transportadorId ?? null,
  glt: d.glt ?? null,
  embalagem: d.embalagem ?? null,
})

export async function planoEntradaGranel(ctx: ContextoEmpresa, corpo: unknown): Promise<Montada> {
  const estab = ctx.exigirEstabelecimento()
  const d = esquemaEntrada.parse(corpo)
  const executadoEm = dataExecucao(d.executadoEm)
  const projeto = await carregarProjeto(ctx, d.projetoId, estab)
  await conferirPessoas(ctx, [
    d.responsavelId,
    d.executadoPorId,
    d.titularId,
    d.remetenteId,
    d.destinatarioId,
    d.transportadorId,
  ])
  await conferirEtapaPlano(ctx, d.planoEtapaId, projeto.id)
  const composicao = await composicaoInformada(ctx, d.composicao)
  const titularId = d.titularId ?? null
  if (d.tipoGranel === 'recebido_cliente' && !titularId)
    throw new ErroRegra('Informe o titular: o mosto ou vinho é do cliente.', 'titularId')

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
        origem: d.tipoGranel === 'retorno_terceiro' ? 'retorno_terceiro' : 'granel',
      })
    tratarLoteNoDestino(destino.recipienteId, alvo, saldos, lancamentos, genealogia, codigos)
    const cl = paraCentilitros(destino.litros)
    lancamentos.push({
      recipienteId: destino.recipienteId,
      lote: alvo,
      centilitros: cl,
      tipo: 'entrada_granel',
      linha: n + 1,
      composicao: { composicao },
    })
    linhas.push({
      ordem: n + 1,
      papel: 'destino',
      recipienteId: destino.recipienteId,
      lote: alvo,
      centilitros: cl,
      mistura: 'id' in alvo ? 'incorporar' : 'lote_novo',
    })
  }

  // Vinho de terceiro: o contrato de terceirização vigente (P29: sem ele, "ciente").
  const avisos: Aviso[] = []
  const contrato = await avisoContrato(ctx, {
    titularId,
    data: new Intl.DateTimeFormat('en-CA', { timeZone: await fusoDo(ctx, estab) }).format(
      executadoEm,
    ),
  })
  if (contrato) avisos.push(contrato)

  return {
    cientes: d.cientes,
    rascunhoId: d.rascunhoId ?? null,
    insumos: {
      lista: d.insumos,
      localEstoqueId: d.localEstoqueId,
      padrao: recipientes,
    },
    plano: {
      tipo: 'entrada_granel',
      estabelecimentoId: estab,
      executadoEm,
      projetoId: projeto.id,
      responsavelId: d.responsavelId ?? projeto.enologoId,
      executadoPorId: d.executadoPorId ?? null,
      planoEtapaId: d.planoEtapaId ?? null,
      observacao: d.observacao ?? null,
      dados: { tipoGranel: d.tipoGranel, composicaoInformada: d.composicao.length > 0 },
      linhas,
      lancamentos,
      genealogia,
      lotesNovos,
      avisos,
      granel: {
        sentido: 'entrada',
        tipo: d.tipoGranel,
        ...documento(d),
        recebimentoConfirmadoEm: d.recebimentoConfirmadoEm ?? null,
        recebimentoConfirmadoPor: d.recebimentoConfirmadoEm ? ctx.usuarioId : null,
      },
    },
  }
}

export async function planoSaidaGranel(ctx: ContextoEmpresa, corpo: unknown): Promise<Montada> {
  const estab = ctx.exigirEstabelecimento()
  const d = esquemaSaida.parse(corpo)
  const executadoEm = dataExecucao(d.executadoEm)
  await conferirPessoas(ctx, [
    d.responsavelId,
    d.executadoPorId,
    d.remetenteId,
    d.destinatarioId,
    d.transportadorId,
  ])

  const ids = d.itens.map((i) => i.recipienteId)
  const naData = await saldosNaData(ctx, ids, executadoEm)
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
      papel: 'origem',
      recipienteId: i.recipienteId,
      lote: { id: parte.loteId },
      centilitros: cl,
      esvaziarOrigem: i.esvaziar,
    })
    lancamentos.push({
      recipienteId: i.recipienteId,
      lote: { id: parte.loteId },
      centilitros: -cl,
      tipo: 'saida_granel',
      linha: n + 1,
    })
  }

  const loteIds = [
    ...new Set(naData.filter((x) => ids.includes(x.recipienteId)).map((x) => x.loteId)),
  ]
  const lotes = loteIds.length
    ? await ctx.tx
        .select({ projetoId: s.lote.projetoId, titularId: s.lote.titularId })
        .from(s.lote)
        .where(inArray(s.lote.id, loteIds))
    : []
  const projetos = [...new Set(lotes.map((l) => l.projetoId))]
  const projetoId = projetos.length === 1 ? projetos[0]! : null
  if (projetoId) await conferirEtapaPlano(ctx, d.planoEtapaId, projetoId)
  else if (d.planoEtapaId)
    throw new ErroRegra('A etapa do plano é de um só projeto.', 'plano_etapa')

  // Avisos (P29): a lei pede a GLT; a devolução vai ao titular do lote.
  const avisos: Aviso[] = []
  if (!d.glt)
    avisos.push({
      codigo: 'granel_sem_glt',
      mensagem:
        'Saída a granel sem GLT informada. Transportar ou comercializar vinho a granel sem a Guia de Livre Trânsito é infração.',
      fonte:
        'Lei 7.678/1988, art. 2º, §1º; Decreto 12.709/2025, arts. 203, IV, e 235; Portaria MAPA 690/2022',
    })
  if (d.tipoGranel === 'devolucao_titular') {
    const titulares = [...new Set(lotes.map((l) => l.titularId))]
    if (titulares.some((t) => t === null))
      avisos.push({
        codigo: 'granel_devolucao_propria',
        mensagem: 'Devolução ao titular de vinho que é da própria empresa.',
      })
    else if (d.destinatarioId && titulares.some((t) => t !== d.destinatarioId))
      avisos.push({
        codigo: 'granel_devolucao_destinatario',
        mensagem: 'O destinatário não é o titular do lote devolvido.',
      })
  }

  return {
    cientes: d.cientes,
    rascunhoId: d.rascunhoId ?? null,
    insumos: { lista: d.insumos, localEstoqueId: d.localEstoqueId, padrao: [] },
    plano: {
      tipo: 'saida_granel',
      estabelecimentoId: estab,
      executadoEm,
      projetoId,
      responsavelId: d.responsavelId ?? null,
      executadoPorId: d.executadoPorId ?? null,
      planoEtapaId: d.planoEtapaId ?? null,
      observacao: d.observacao ?? null,
      dados: { tipoGranel: d.tipoGranel },
      linhas,
      lancamentos,
      avisos,
      granel: { sentido: 'saida', tipo: d.tipoGranel, ...documento(d) },
    },
  }
}

/** Nomes dos tipos, para a lista e a ficha. */
export const NOMES_TIPO_GRANEL: Record<string, string> = {
  ...TIPOS_ENTRADA_GRANEL,
  ...TIPOS_SAIDA_GRANEL,
}

/** Granel da operação, com os nomes das partes (ficha da operação). */
export async function granelDaOperacao(ctx: ContextoEmpresa, operacaoId: string) {
  const [g] = await ctx.tx
    .select()
    .from(s.operacaoGranel)
    .where(eq(s.operacaoGranel.operacaoId, operacaoId))
  if (!g) return null
  const ids = [g.remetenteId, g.destinatarioId, g.transportadorId].filter((x): x is string => !!x)
  const pessoas = ids.length
    ? new Map(
        (
          await ctx.tx
            .select({ id: s.pessoa.id, nome: s.ficha.nome })
            .from(s.pessoa)
            .innerJoin(s.ficha, eq(s.ficha.id, s.pessoa.fichaId))
            .where(inArray(s.pessoa.id, ids))
        ).map((p) => [p.id, p.nome]),
      )
    : new Map<string, string>()
  const nome = (id: string | null) => (id ? (pessoas.get(id) ?? null) : null)
  return {
    sentido: g.sentido,
    tipo: g.tipo,
    notaNumero: g.notaNumero,
    notaChave: g.notaChave,
    remetente: nome(g.remetenteId),
    destinatario: nome(g.destinatarioId),
    transportador: nome(g.transportadorId),
    glt: g.glt,
    embalagem: g.embalagem,
    recebimentoConfirmadoEm: g.recebimentoConfirmadoEm,
  }
}

export async function rotasGranel(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  // GLT informada depois, na ficha da operação; o alerta da central some (Decreto 12.709/2025,
  // art. 203, IV).
  app.post('/api/operacoes/:id/glt', async (req) =>
    naEmpresa(db, req, ['enotrace.operacoes', 'editar'], async (ctx) => {
      const { id } = z.object({ id: z.uuid() }).parse(req.params)
      const { glt } = z
        .object({ glt: z.string().trim().min(1, 'Informe a GLT').max(40) })
        .parse(req.body)
      const [g] = await ctx.tx
        .select({
          antes: s.operacaoGranel.glt,
          estab: s.operacao.estabelecimentoId,
          situacao: s.operacao.situacao,
        })
        .from(s.operacaoGranel)
        .innerJoin(s.operacao, eq(s.operacao.id, s.operacaoGranel.operacaoId))
        .where(and(eq(s.operacaoGranel.operacaoId, id), eq(s.operacao.empresaId, ctx.empresaId)))
      if (!g || !(await ctx.estabelecimentosPermitidos()).includes(g.estab))
        throw new ErroNaoEncontrado('Operação não encontrada.')
      if (g.situacao !== 'confirmada')
        throw new ErroRegra('A operação não está confirmada.', 'situacao')
      await ctx.tx.update(s.operacaoGranel).set({ glt }).where(eq(s.operacaoGranel.operacaoId, id))
      await ctx.auditar({
        acao: 'informar_glt',
        entidade: 'operacao',
        registroId: id,
        antes: { glt: g.antes },
        depois: { glt },
      })
      return { ok: true }
    }),
  )

  // Confirmação do recebimento (na GLT), marcada ou desmarcada depois da entrada.
  app.post('/api/operacoes/:id/recebimento', async (req) =>
    naEmpresa(db, req, ['enotrace.operacoes', 'editar'], async (ctx) => {
      const { id } = z.object({ id: z.uuid() }).parse(req.params)
      const d = recebimentoGranel.parse(req.body)
      const [g] = await ctx.tx
        .select({
          sentido: s.operacaoGranel.sentido,
          antes: s.operacaoGranel.recebimentoConfirmadoEm,
          estab: s.operacao.estabelecimentoId,
          situacao: s.operacao.situacao,
        })
        .from(s.operacaoGranel)
        .innerJoin(s.operacao, eq(s.operacao.id, s.operacaoGranel.operacaoId))
        .where(and(eq(s.operacaoGranel.operacaoId, id), eq(s.operacao.empresaId, ctx.empresaId)))
      if (!g || !(await ctx.estabelecimentosPermitidos()).includes(g.estab))
        throw new ErroNaoEncontrado('Operação não encontrada.')
      if (g.sentido !== 'entrada')
        throw new ErroRegra('O recebimento se confirma na entrada de granel.', 'sentido')
      if (g.situacao !== 'confirmada')
        throw new ErroRegra('A operação não está confirmada.', 'situacao')
      await ctx.tx
        .update(s.operacaoGranel)
        .set({
          recebimentoConfirmadoEm: d.recebimentoConfirmadoEm,
          recebimentoConfirmadoPor: d.recebimentoConfirmadoEm ? ctx.usuarioId : null,
        })
        .where(eq(s.operacaoGranel.operacaoId, id))
      await ctx.auditar({
        acao: 'recebimento_granel',
        entidade: 'operacao',
        registroId: id,
        antes: { recebimentoConfirmadoEm: g.antes },
        depois: { recebimentoConfirmadoEm: d.recebimentoConfirmadoEm },
      })
      return { ok: true }
    }),
  )
}
