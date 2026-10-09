// EnoTrace › Operações: transferência de titularidade a granel (cantina.md, Mistura entre titulares;
// Pagamento em produto; 04, roteiro do ciclo 10, bloco 2). Os litros passam do lote de um titular
// para um lote de outro, do mesmo projeto, com genealogia: a compra do vinho do cliente, a venda ao
// cliente, o pagamento do serviço em produto. Total no próprio recipiente, ou parcial para outro
// recipiente, vazio ou com vinho do novo titular. Parcial no mesmo recipiente deixaria dois
// titulares juntos: bloqueado (P29, integridade). O motor confere e grava (motor.ts).
import { deCentilitros, paraCentilitros, titularidade as esquema } from '@vinicycle/shared'
import { and, eq, inArray, sql } from 'drizzle-orm'
import * as s from '../../db/schema'
import { ErroRegra } from '../../nucleo/erros'
import type { ContextoEmpresa } from '../../nucleo/requisicao'
import {
  codigosDeLotes,
  conferirLoteExistente,
  conferirPessoas,
  dataExecucao,
  type Montada,
  saldosNaData,
  saldosPorLote,
  tratarLoteNoDestino,
} from './apoio'
import type { Lancamento, LigacaoGenealogia, LinhaOperacao, LoteNovo, PlanoOperacao } from './motor'

const litrosBr = (cl: number) => deCentilitros(cl).replace('.', ',')

/** O contrato da transferência é com um dos dois titulares (a própria empresa é a outra parte). */
export async function conferirContratoTitularidade(
  ctx: ContextoEmpresa,
  contratoId: string | null | undefined,
  de: string | null,
  para: string | null,
) {
  if (!contratoId) return
  const [c] = await ctx.tx
    .select({ contraparte: s.contratoTerceirizacao.contraparteId })
    .from(s.contratoTerceirizacao)
    .where(
      and(
        eq(s.contratoTerceirizacao.id, contratoId),
        eq(s.contratoTerceirizacao.empresaId, ctx.empresaId),
      ),
    )
  if (!c || (c.contraparte !== de && c.contraparte !== para))
    throw new ErroRegra('O contrato escolhido não é com um dos titulares.', 'contratoId')
}

export async function planoTitularidade(ctx: ContextoEmpresa, corpo: unknown): Promise<Montada> {
  const estab = ctx.exigirEstabelecimento()
  const d = esquema.parse(corpo)
  const executadoEm = dataExecucao(d.executadoEm)
  const para = d.paraTitularId ?? null
  await conferirPessoas(ctx, [d.responsavelId, d.executadoPorId, para])

  const idsOrigem = [...new Set(d.itens.map((i) => i.origemId))]
  const destinos = d.itens.map((i) => i.destinoId ?? i.origemId)
  if (new Set(destinos).size !== destinos.length)
    throw new ErroRegra('Cada recipiente de destino aparece uma vez só.', 'destino')
  if (
    d.itens.some(
      (i) => i.destinoId && i.destinoId !== i.origemId && idsOrigem.includes(i.destinoId),
    )
  )
    throw new ErroRegra('Um recipiente de origem não pode ser destino de outra linha.', 'destino')
  const idsDestino = [
    ...new Set(
      d.itens.flatMap((i) => (i.destinoId && i.destinoId !== i.origemId ? [i.destinoId] : [])),
    ),
  ]
  const recipientes = await ctx.tx
    .select({
      id: s.recipiente.id,
      codigo: s.recipiente.codigo,
      estab: s.recipiente.estabelecimentoId,
    })
    .from(s.recipiente)
    .where(
      and(
        inArray(s.recipiente.id, [...idsOrigem, ...idsDestino]),
        eq(s.recipiente.empresaId, ctx.empresaId),
      ),
    )
  if (
    recipientes.length !== new Set([...idsOrigem, ...idsDestino]).size ||
    recipientes.some((r) => r.estab !== estab)
  )
    throw new ErroRegra('Recipiente inválido.', 'recipiente')
  const nome = (id: string) => recipientes.find((r) => r.id === id)?.codigo ?? ''

  // Lote de cada origem, na data da execução.
  const naData = await saldosNaData(ctx, idsOrigem, executadoEm)
  for (const id of idsOrigem)
    if (!naData.some((x) => x.recipienteId === id))
      throw new ErroRegra(
        `O recipiente ${nome(id)} está vazio na data da execução.`,
        'origem_vazia',
      )
  const saldosDestino = await saldosPorLote(ctx, idsDestino)
  const loteIds = [...new Set([...naData, ...saldosDestino].map((x) => x.loteId))]
  const lotes = await ctx.tx
    .select({
      id: s.lote.id,
      projetoId: s.lote.projetoId,
      titularId: s.lote.titularId,
      etapa: s.lote.etapa,
    })
    .from(s.lote)
    .where(inArray(s.lote.id, loteIds))
  const lote = (id: string) => lotes.find((l) => l.id === id)!
  const lotesOrigem = [...new Set(naData.map((x) => x.loteId))]
  const de = lote(lotesOrigem[0]!).titularId
  if (lotesOrigem.some((id) => lote(id).titularId !== de))
    throw new ErroRegra(
      'As origens têm titulares diferentes: transfira um titular por vez.',
      'titulares',
    )
  if (de === para)
    throw new ErroRegra('O vinho já é deste titular: escolha outro novo titular.', 'paraTitularId')
  const projetos = [...new Set(lotesOrigem.map((id) => lote(id).projetoId))]
  if (projetos.length > 1)
    throw new ErroRegra(
      'As origens são de projetos diferentes: transfira um projeto por vez.',
      'projetos',
    )
  const projetoId = projetos[0]!
  await conferirContratoTitularidade(ctx, d.contratoId, de, para)

  // O destino já com vinho precisa ser do novo titular (integridade: um titular por recipiente).
  for (const x of saldosDestino)
    if (lote(x.loteId).titularId !== para)
      throw new ErroRegra(
        `O recipiente ${nome(x.recipienteId)} tem vinho de outro titular. Escolha um recipiente vazio ou com vinho do novo titular.`,
        'destino',
      )

  const codigos = await codigosDeLotes(ctx, loteIds)
  const lancamentos: Lancamento[] = []
  const genealogia: LigacaoGenealogia[] = []
  const lotesNovos: LoteNovo[] = []
  const linhas: LinhaOperacao[] = []
  let ordem = 0
  let total = 0
  for (const item of d.itens) {
    const parte = naData.find((x) => x.recipienteId === item.origemId)!
    const destinoId = item.destinoId ?? item.origemId
    const mesmo = destinoId === item.origemId
    const cl = item.litros ? paraCentilitros(item.litros) : parte.cl
    if (cl <= 0) throw new ErroRegra('Volume inválido.', 'litros')
    if (cl > parte.cl)
      throw new ErroRegra(
        `O recipiente ${nome(item.origemId)} tem ${litrosBr(parte.cl)} L na data da execução.`,
        'litros',
      )
    if (mesmo && cl !== parte.cl)
      throw new ErroRegra(
        `No ${nome(item.origemId)}, a transferência parcial deixaria dois titulares no mesmo recipiente. Escolha outro recipiente de destino ou transfira todo o saldo.`,
        'parcial',
      )
    const alvo = item.lote
    if ('id' in alvo) await conferirLoteExistente(ctx, alvo.id, projetoId, para)
    else if (!lotesNovos.some((l) => l.chave === alvo.novo))
      lotesNovos.push({
        chave: alvo.novo,
        projetoId,
        titularId: para,
        origem: 'titularidade',
        etapa: lote(parte.loteId).etapa,
      })
    total += cl
    ordem += 1
    linhas.push({
      ordem,
      papel: 'origem',
      recipienteId: item.origemId,
      lote: { id: parte.loteId },
      centilitros: cl,
      esvaziarOrigem: cl === parte.cl,
    })
    lancamentos.push({
      recipienteId: item.origemId,
      lote: { id: parte.loteId },
      centilitros: -cl,
      tipo: 'saida_titularidade',
      linha: ordem,
    })
    ordem += 1
    if (!mesmo)
      tratarLoteNoDestino(destinoId, alvo, saldosDestino, lancamentos, genealogia, codigos)
    lancamentos.push({
      recipienteId: destinoId,
      lote: alvo,
      centilitros: cl,
      tipo: 'entrada_titularidade',
      linha: ordem,
      composicao: { recipienteId: item.origemId },
    })
    genealogia.push({
      origem: { id: parte.loteId },
      destino: alvo,
      centilitros: cl,
      tipo: 'titularidade',
    })
    linhas.push({
      ordem,
      papel: 'destino',
      recipienteId: destinoId,
      lote: alvo,
      centilitros: cl,
      mistura: 'novo' in alvo ? 'lote_novo' : 'incorporar',
    })
  }

  const plano: PlanoOperacao = {
    tipo: 'titularidade',
    estabelecimentoId: estab,
    executadoEm,
    projetoId,
    responsavelId: d.responsavelId ?? null,
    executadoPorId: d.executadoPorId ?? null,
    observacao: d.observacao ?? null,
    dados: {
      motivo: d.motivo,
      contratoId: d.contratoId ?? null,
      deTitularId: de,
      paraTitularId: para,
      litros: deCentilitros(total),
    },
    linhas,
    lancamentos,
    genealogia,
    lotesNovos,
  }
  return { plano, cientes: d.cientes, rascunhoId: d.rascunhoId ?? null }
}

/** Registro da transferência confirmada, para o contrato e a conta do cliente. */
export async function registrarTitularidade(
  ctx: ContextoEmpresa,
  operacaoId: string,
  plano: PlanoOperacao,
) {
  const dados = plano.dados as {
    motivo: (typeof s.transferenciaTitularidade.$inferInsert)['motivo']
    contratoId: string | null
    deTitularId: string | null
    paraTitularId: string | null
    litros: string
  }
  await ctx.tx.insert(s.transferenciaTitularidade).values({
    empresaId: ctx.empresaId,
    estabelecimentoId: plano.estabelecimentoId,
    forma: 'granel',
    executadoEm: plano.executadoEm,
    motivo: dados.motivo,
    contratoId: dados.contratoId,
    deTitularId: dados.deTitularId,
    paraTitularId: dados.paraTitularId,
    operacaoId,
    litros: dados.litros,
    observacao: plano.observacao ?? null,
    criadoPor: ctx.usuarioId,
  })
}

/** A transferência da operação, para a ficha: titulares, motivo e contrato. */
export async function titularidadeDaOperacao(ctx: ContextoEmpresa, operacaoId: string) {
  const r = await ctx.tx.execute<{
    motivo: string
    de: string | null
    para: string | null
    contratoId: string | null
    contrato: string | null
    litros: string
  }>(sql`
    select t.motivo, t.litros::text as litros, t.contrato_id as "contratoId",
      (select f.nome from pessoa p join ficha f on f.id = p.ficha_id where p.id = t.de_titular_id) as de,
      (select f.nome from pessoa p join ficha f on f.id = p.ficha_id where p.id = t.para_titular_id) as para,
      (select coalesce(c.numero, f.nome) from contrato_terceirizacao c join pessoa p on p.id = c.contraparte_id join ficha f on f.id = p.ficha_id where c.id = t.contrato_id) as contrato
    from transferencia_titularidade t
    where t.operacao_id = ${operacaoId} and t.empresa_id = ${ctx.empresaId}`)
  return r.rows[0] ?? null
}
