// Cobrança (administracao.md, Faturas e contas a receber): renovação do ciclo com as mudanças
// agendadas, fatura de cada ciclo (plano, adicionais, proporcionais e descontos), fatura avulsa,
// baixa manual com comprovante e estorno. A tarefa de fundo roda no contexto da plataforma.
import {
  consultaListagem,
  deCentavos,
  type FormaPagamento,
  faturaAvulsaEntrada,
  fimDoCiclo,
  formatarMoeda,
  motivo,
  NOMES_PERIODICIDADE,
  paraCentavos,
  type Periodicidade,
  recebimentoEntrada,
  somarDias,
  TIPOS_ANEXO_ACEITOS,
  vencimentoDoCiclo,
} from '@vinicycle/shared'
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { createHash } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { z } from 'zod'
import { emContexto, type Db, type Tx } from '../db/cliente'
import * as s from '../db/schema'
import { chaveAnexo } from '../nucleo/armazenamento'
import { ErroNaoEncontrado, ErroPermissao, ErroRegra } from '../nucleo/erros'
import { buscaTexto, listar } from '../nucleo/listagem'
import { naEmpresa, naPlataforma } from '../nucleo/requisicao'
import {
  type Agente,
  type Assinatura,
  assinaturaVigente,
  comoPlataforma,
  reduzirItem,
} from './assinaturas'
import { hoje, precoDoAdicional, precoDoPlano } from './planos'
import { pedirCancelamentoExterno } from './integracoes'
import { aplicarRegua, processarRegua } from './regua'

const fmt = (d: string | null) => (d ? d.split('-').reverse().join('/') : '')

/** Como a assinatura fica a partir de `inicio`, com as mudanças agendadas até essa data. */
export async function estadoNaRenovacao(tx: Tx, a: Assinatura, inicio: string) {
  const agendadas = await tx
    .select()
    .from(s.assinaturaMudanca)
    .where(
      and(
        eq(s.assinaturaMudanca.assinaturaId, a.id),
        eq(s.assinaturaMudanca.situacao, 'agendada'),
        lte(s.assinaturaMudanca.efeitoEm, inicio),
      ),
    )
    .orderBy(asc(s.assinaturaMudanca.criadoEm))
  const mPlano = agendadas.filter((m) => m.tipo === 'plano').at(-1)
  const mCiclo = agendadas.filter((m) => m.tipo === 'periodicidade').at(-1)
  const mReajuste = agendadas.filter((m) => m.tipo === 'reajuste').at(-1)
  const planoId = mPlano?.planoId ?? a.planoId
  const periodicidade = (mCiclo?.periodicidade ?? a.periodicidade) as Periodicidade
  let valorPlano = a.valorContratado
  if (mReajuste?.valorNovo) {
    valorPlano = mReajuste.valorNovo
  } else if (mPlano || mCiclo || mReajuste) {
    // Contrato novo ou reajuste à tabela: o preço do dia da renovação. Sem preço, fica o que valia.
    valorPlano = (await precoDoPlano(tx, planoId, periodicidade, inicio)) ?? a.valorContratado
  }
  const [plano] = await tx
    .select({ nome: s.plano.nome })
    .from(s.plano)
    .where(eq(s.plano.id, planoId))
  const linhas = await tx
    .select({
      item: s.assinaturaItem,
      nome: s.adicional.nome,
    })
    .from(s.assinaturaItem)
    .innerJoin(s.adicional, eq(s.adicional.id, s.assinaturaItem.adicionalId))
    .where(
      and(
        eq(s.assinaturaItem.assinaturaId, a.id),
        lte(s.assinaturaItem.inicio, inicio),
        or(isNull(s.assinaturaItem.fim), gte(s.assinaturaItem.fim, inicio)),
      ),
    )
    .orderBy(asc(s.assinaturaItem.inicio))
  const itens = []
  for (const l of linhas) {
    const retirada = agendadas
      .filter((m) => m.tipo === 'adicional_retirada' && m.assinaturaItemId === l.item.id)
      .reduce((t, m) => t + (m.quantidade ?? 0), 0)
    const quantidade = l.item.quantidade - retirada
    const valorUnitario = mCiclo
      ? ((await precoDoAdicional(tx, l.item.adicionalId, periodicidade, inicio)) ??
        l.item.valorUnitario)
      : l.item.valorUnitario
    itens.push({ item: l.item, nome: l.nome, quantidade, retirada, valorUnitario })
  }
  return {
    planoId,
    planoNome: plano!.nome,
    periodicidade,
    valorPlano,
    itens: itens.filter((i) => i.quantidade > 0),
    todosItens: itens,
    agendadas,
  }
}

/** Avança o ciclo enquanto a data passou do fim, aplicando o que estava agendado. */
export async function renovar(tx: Tx, a: Assinatura, data: string): Promise<Assinatura> {
  let atual = a
  while (atual.cicloFim && atual.cicloFim < data) {
    const inicio = somarDias(atual.cicloFim, 1)
    const e = await estadoNaRenovacao(tx, atual, inicio)
    for (const i of e.todosItens) {
      if (i.retirada > 0) await reduzirItem(tx, i.item, i.retirada, atual.cicloFim, null)
      if (i.valorUnitario !== i.item.valorUnitario && i.quantidade > 0) {
        await tx
          .update(s.assinaturaItem)
          .set({ valorUnitario: i.valorUnitario, atualizadoEm: sql`now()` })
          .where(eq(s.assinaturaItem.id, i.item.id))
      }
    }
    if (e.agendadas.length) {
      await tx
        .update(s.assinaturaMudanca)
        .set({ situacao: 'aplicada', aplicadaEm: sql`now()` })
        .where(
          inArray(
            s.assinaturaMudanca.id,
            e.agendadas.map((m) => m.id),
          ),
        )
    }
    const [novo] = await tx
      .update(s.assinatura)
      .set({
        planoId: e.planoId,
        periodicidade: e.periodicidade,
        valorContratado: e.valorPlano,
        cicloInicio: inicio,
        cicloFim: fimDoCiclo(inicio, e.periodicidade, atual.diaBase ?? undefined),
        atualizadoEm: sql`now()`,
        versao: sql`${s.assinatura.versao} + 1`,
      })
      .where(eq(s.assinatura.id, atual.id))
      .returning()
    atual = novo!
  }
  return atual
}

/** Recalcula a situação pela soma dos recebimentos não estornados e pelo vencimento. */
export async function atualizarSituacaoFatura(
  tx: Tx,
  faturaId: string,
  data = hoje(),
): Promise<string> {
  const [f] = await tx.select().from(s.fatura).where(eq(s.fatura.id, faturaId))
  if (!f) throw new ErroNaoEncontrado('Fatura não encontrada.')
  if (f.situacao === 'cancelada') return f.situacao
  const [{ pago }] = (await tx
    .select({ pago: sql<string>`coalesce(sum(${s.recebimento.valor}), 0)::text` })
    .from(s.recebimento)
    .where(and(eq(s.recebimento.faturaId, f.id), isNull(s.recebimento.estornadoEm)))) as [
    { pago: string },
  ]
  const total = paraCentavos(f.total)
  const recebido = paraCentavos(pago)
  const situacao =
    recebido >= total
      ? 'paga'
      : f.vencimento < data
        ? 'vencida'
        : recebido > 0
          ? 'parcial'
          : 'aberta'
  if (situacao !== f.situacao) {
    await tx
      .update(s.fatura)
      .set({ situacao, atualizadoEm: sql`now()`, versao: sql`${s.fatura.versao} + 1` })
      .where(eq(s.fatura.id, f.id))
  }
  return situacao
}

interface ItemNovo {
  descricao: string
  origem: 'plano' | 'adicional' | 'proporcional' | 'desconto' | 'avulso'
  quantidade: number
  valorUnitario: number
}

async function gravarFatura(
  tx: Tx,
  dados: {
    empresaId: string
    assinaturaId: string | null
    ciclo: { inicio: string; fim: string } | null
    emissao: string
    vencimento: string
    observacao?: string | null
    usuarioId: string | null
  },
  itens: ItemNovo[],
): Promise<string> {
  const total = Math.max(
    0,
    itens.reduce((t, i) => t + i.quantidade * i.valorUnitario, 0),
  )
  const [f] = await tx
    .insert(s.fatura)
    .values({
      empresaId: dados.empresaId,
      assinaturaId: dados.assinaturaId,
      cicloInicio: dados.ciclo?.inicio ?? null,
      cicloFim: dados.ciclo?.fim ?? null,
      emissao: dados.emissao,
      vencimento: dados.vencimento,
      total: deCentavos(total),
      situacao: 'aberta',
      observacao: dados.observacao ?? null,
      criadoPor: dados.usuarioId,
      atualizadoPor: dados.usuarioId,
    })
    .returning({ id: s.fatura.id })
  await tx.insert(s.faturaItem).values(
    itens.map((i, n) => ({
      faturaId: f!.id,
      empresaId: dados.empresaId,
      ordem: n + 1,
      descricao: i.descricao,
      origem: i.origem,
      quantidade: i.quantidade,
      valorUnitario: deCentavos(i.valorUnitario),
      valor: deCentavos(i.quantidade * i.valorUnitario),
    })),
  )
  await atualizarSituacaoFatura(tx, f!.id, dados.emissao)
  return f!.id
}

/**
 * Fatura do ciclo: plano e adicionais como ficam no ciclo, os proporcionais ainda não cobrados e os
 * descontos válidos no início do ciclo. Uma por ciclo; total zero já nasce paga.
 */
export async function gerarFaturaDoCiclo(
  tx: Tx,
  a: Assinatura,
  inicio: string,
  data: string,
  usuarioId: string | null = null,
): Promise<string | null> {
  const [existe] = await tx
    .select({ id: s.fatura.id })
    .from(s.fatura)
    .where(
      and(
        eq(s.fatura.assinaturaId, a.id),
        eq(s.fatura.cicloInicio, inicio),
        sql`${s.fatura.situacao} <> 'cancelada'`,
      ),
    )
  if (existe) return null
  // No ciclo atual nada agendado se aplica (vale na renovação); no próximo, o que estiver agendado.
  const e = await estadoNaRenovacao(tx, a, inicio)
  const fim =
    inicio === a.cicloInicio
      ? a.cicloFim!
      : fimDoCiclo(inicio, e.periodicidade, a.diaBase ?? undefined)
  const periodo = `${fmt(inicio)} a ${fmt(fim)}`
  const itens: ItemNovo[] = [
    {
      descricao: `Plano ${e.planoNome}, ciclo ${NOMES_PERIODICIDADE[e.periodicidade].toLowerCase()} (${periodo})`,
      origem: 'plano',
      quantidade: 1,
      valorUnitario: paraCentavos(e.valorPlano),
    },
    ...e.itens.map((i) => ({
      descricao: i.nome,
      origem: 'adicional' as const,
      quantidade: i.quantidade,
      valorUnitario: paraCentavos(i.valorUnitario),
    })),
  ]
  const recorrente = itens.reduce((t, i) => t + i.quantidade * i.valorUnitario, 0)
  const proporcionais = await tx
    .select({
      id: s.assinaturaMudanca.id,
      tipo: s.assinaturaMudanca.tipo,
      valor: s.assinaturaMudanca.valorProporcional,
      efeitoEm: s.assinaturaMudanca.efeitoEm,
      quantidade: s.assinaturaMudanca.quantidade,
      adicional: s.adicional.nome,
      plano: s.plano.nome,
    })
    .from(s.assinaturaMudanca)
    .leftJoin(s.adicional, eq(s.adicional.id, s.assinaturaMudanca.adicionalId))
    .leftJoin(s.plano, eq(s.plano.id, s.assinaturaMudanca.planoId))
    .where(
      and(
        eq(s.assinaturaMudanca.assinaturaId, a.id),
        eq(s.assinaturaMudanca.situacao, 'aplicada'),
        isNull(s.assinaturaMudanca.faturaId),
        sql`${s.assinaturaMudanca.valorProporcional} > 0`,
      ),
    )
    .orderBy(asc(s.assinaturaMudanca.criadoEm))
  for (const p of proporcionais) {
    itens.push({
      descricao:
        p.tipo === 'plano'
          ? `Proporcional da troca para o plano ${p.plano} em ${fmt(p.efeitoEm)}`
          : `Proporcional de ${p.quantidade} × ${p.adicional} desde ${fmt(p.efeitoEm)}`,
      origem: 'proporcional',
      quantidade: 1,
      valorUnitario: paraCentavos(p.valor),
    })
  }
  const descontos = await tx
    .select()
    .from(s.desconto)
    .where(
      and(
        eq(s.desconto.empresaId, a.empresaId),
        eq(s.desconto.ativo, true),
        lte(s.desconto.inicio, inicio),
        or(isNull(s.desconto.fim), gte(s.desconto.fim, inicio)),
      ),
    )
    .orderBy(asc(s.desconto.inicio))
  // O desconto vale sobre o plano e os adicionais do ciclo, e nunca deixa a fatura negativa.
  let restante = recorrente
  for (const d of descontos) {
    const bruto =
      d.tipo === 'percentual'
        ? Math.round((recorrente * Number(d.valor)) / 100)
        : paraCentavos(d.valor)
    const valor = Math.min(bruto, restante)
    if (valor <= 0) continue
    restante -= valor
    itens.push({
      descricao:
        d.tipo === 'percentual'
          ? `Desconto de ${Number(d.valor).toLocaleString('pt-BR')}%`
          : `Desconto de ${formatarMoeda(paraCentavos(d.valor))}`,
      origem: 'desconto',
      quantidade: 1,
      valorUnitario: -valor,
    })
  }
  const id = await gravarFatura(
    tx,
    {
      empresaId: a.empresaId,
      assinaturaId: a.id,
      ciclo: { inicio, fim },
      emissao: data,
      vencimento: vencimentoDoCiclo(inicio, a.diaVencimento),
      usuarioId,
    },
    itens,
  )
  if (proporcionais.length) {
    await tx
      .update(s.assinaturaMudanca)
      .set({ faturaId: id })
      .where(
        inArray(
          s.assinaturaMudanca.id,
          proporcionais.map((p) => p.id),
        ),
      )
  }
  return id
}

/**
 * Depois de uma mudança que vale na hora: a fatura do próximo ciclo já emitida e sem pagamento é
 * cancelada e emitida de novo, já com o plano novo e o proporcional.
 */
export async function recalcularFaturaFutura(
  tx: Tx,
  a: Assinatura,
  usuarioId: string | null,
  data = hoje(),
): Promise<void> {
  if (!a.cicloFim) return
  const [atual] = await tx.select().from(s.assinatura).where(eq(s.assinatura.id, a.id))
  const futuras = await tx
    .select({ id: s.fatura.id, cicloInicio: s.fatura.cicloInicio })
    .from(s.fatura)
    .where(
      and(
        eq(s.fatura.assinaturaId, a.id),
        sql`${s.fatura.cicloInicio} > ${data}`,
        inArray(s.fatura.situacao, ['aberta', 'vencida']),
        sql`not exists (select 1 from recebimento r where r.fatura_id = fatura.id and r.estornado_em is null)`,
      ),
    )
  for (const f of futuras) {
    await tx
      .update(s.fatura)
      .set({
        situacao: 'cancelada',
        canceladaEm: sql`now()`,
        canceladaPor: usuarioId,
        motivoCancelamento: 'Recalculada: a assinatura mudou.',
      })
      .where(eq(s.fatura.id, f.id))
    await pedirCancelamentoExterno(tx, f.id)
    // Os proporcionais que ela cobrava voltam a ficar pendentes.
    await tx
      .update(s.assinaturaMudanca)
      .set({ faturaId: null })
      .where(eq(s.assinaturaMudanca.faturaId, f.id))
    await gerarFaturaDoCiclo(tx, atual!, f.cicloInicio!, data, usuarioId)
  }
}

/** Um passo da cobrança de uma assinatura: renova, emite a fatura do ciclo e a do próximo. */
export async function processarAssinatura(
  tx: Tx,
  a: Assinatura,
  data: string,
  antecedenciaDias: number,
): Promise<number> {
  if (a.emTeste || !a.cicloFim || a.situacao !== 'vigente') return 0
  const atual = await renovar(tx, a, data)
  let n = 0
  if (await gerarFaturaDoCiclo(tx, atual, atual.cicloInicio!, data)) n++
  const proximo = somarDias(atual.cicloFim!, 1)
  if (somarDias(vencimentoDoCiclo(proximo, atual.diaVencimento), -antecedenciaDias) <= data) {
    if (await gerarFaturaDoCiclo(tx, atual, proximo, data)) n++
  }
  // Faturas que venceram mudam de situação.
  const abertas = await tx
    .select({ id: s.fatura.id })
    .from(s.fatura)
    .where(
      and(
        eq(s.fatura.empresaId, a.empresaId),
        inArray(s.fatura.situacao, ['aberta', 'parcial']),
        sql`${s.fatura.vencimento} < ${data}`,
      ),
    )
  for (const f of abertas) await atualizarSituacaoFatura(tx, f.id, data)
  return n
}

/** A tarefa de cobrança: cada assinatura na sua transação, para um erro não parar as outras. */
export async function processarCobranca(
  db: Db,
  log: Pick<FastifyBaseLogger, 'error'>,
  data = hoje(),
): Promise<number> {
  const assinaturas = await emContexto(db, { plataforma: true }, async (tx) => {
    const [cfg] = await tx.select().from(s.configPlataforma)
    const lista = await tx
      .select({ id: s.assinatura.id })
      .from(s.assinatura)
      .where(and(eq(s.assinatura.situacao, 'vigente'), eq(s.assinatura.emTeste, false)))
    return { antecedencia: cfg?.faturaAntecedenciaDias ?? 10, ids: lista.map((l) => l.id) }
  })
  let n = 0
  for (const id of assinaturas.ids) {
    try {
      n += await emContexto(db, { plataforma: true }, async (tx) => {
        const [a] = await tx
          .select()
          .from(s.assinatura)
          .where(eq(s.assinatura.id, id))
          .for('update')
        return a ? processarAssinatura(tx, a, data, assinaturas.antecedencia) : 0
      })
    } catch (e) {
      log.error({ erro: e, assinatura: id }, 'Falha na cobrança da assinatura')
    }
  }
  return n
}

/** Tarefa de fundo: cobrança (renovação e faturas) e, em seguida, a régua. */
export function iniciarTarefaCobranca(
  db: Db,
  url: string,
  log: Pick<FastifyBaseLogger, 'error'>,
  intervaloMs = 60 * 60_000,
): () => void {
  let parar = false
  let timer: NodeJS.Timeout | undefined
  const ciclo = async () => {
    try {
      await processarCobranca(db, log)
      await processarRegua(db, url, log)
    } catch (e) {
      log.error({ erro: e }, 'Falha na tarefa de cobrança')
    }
    if (!parar) timer = setTimeout(ciclo, intervaloMs)
  }
  timer = setTimeout(ciclo, 45_000)
  return () => {
    parar = true
    clearTimeout(timer)
  }
}

/**
 * Contratação ao fim do teste (ou durante ele): o primeiro ciclo começa hoje, com o preço do dia, e
 * a primeira fatura sai na hora. A empresa volta a ativa, mesmo que o teste já tenha bloqueado.
 */
export async function contratar(c: Agente, a: Assinatura, data = hoje()): Promise<string | null> {
  if (!a.emTeste) throw new ErroRegra('A assinatura já está contratada.', 'contratada')
  const valor = await precoDoPlano(c.tx, a.planoId, a.periodicidade as Periodicidade, data)
  if (valor === null) {
    throw new ErroRegra('O plano não é vendido neste ciclo. Mude o plano ou o ciclo.', 'sem_preco')
  }
  const itens = await c.tx
    .select()
    .from(s.assinaturaItem)
    .where(and(eq(s.assinaturaItem.assinaturaId, a.id), isNull(s.assinaturaItem.fim)))
  for (const i of itens) {
    const p = await precoDoAdicional(c.tx, i.adicionalId, a.periodicidade as Periodicidade, data)
    if (p !== null) {
      await c.tx
        .update(s.assinaturaItem)
        .set({ valorUnitario: p })
        .where(eq(s.assinaturaItem.id, i.id))
    }
  }
  const dia = Number(data.slice(8, 10))
  const [nova] = await c.tx
    .update(s.assinatura)
    .set({
      emTeste: false,
      valorContratado: valor,
      cicloInicio: data,
      cicloFim: fimDoCiclo(data, a.periodicidade as Periodicidade, dia),
      diaBase: dia,
      atualizadoEm: sql`now()`,
      atualizadoPor: c.usuarioId,
      versao: sql`${s.assinatura.versao} + 1`,
    })
    .where(eq(s.assinatura.id, a.id))
    .returning()
  const [e] = await c.tx
    .select({ situacao: s.empresa.situacao })
    .from(s.empresa)
    .where(eq(s.empresa.id, a.empresaId))
  if (e && ['teste', 'bloqueado'].includes(e.situacao)) {
    await c.tx
      .update(s.empresa)
      .set({ situacao: 'ativo', atualizadoEm: sql`now()`, versao: sql`${s.empresa.versao} + 1` })
      .where(eq(s.empresa.id, a.empresaId))
    await c.tx.insert(s.empresaSituacao).values({
      empresaId: a.empresaId,
      situacao: 'ativo',
      origem: 'contratacao',
      motivo: 'Assinatura contratada',
      criadoPor: c.usuarioId,
    })
  }
  const faturaId = await gerarFaturaDoCiclo(c.tx, nova!, data, data, c.usuarioId)
  await c.auditar({
    acao: 'contratar',
    entidade: 'assinatura',
    registroId: a.id,
    empresaId: a.empresaId,
    depois: { valor, cicloInicio: data, faturaId },
  })
  return faturaId
}

/** Fatura com itens e recebimentos, para a Administração e para o cliente. */
export async function lerFatura(tx: Tx, id: string, empresaId?: string) {
  const [f] = await tx
    .select({
      fatura: s.fatura,
      cliente: s.ficha.nome,
      nomeFantasia: s.ficha.nomeFantasia,
    })
    .from(s.fatura)
    .innerJoin(s.empresa, eq(s.empresa.id, s.fatura.empresaId))
    .innerJoin(s.ficha, eq(s.ficha.id, s.empresa.fichaId))
    .where(and(eq(s.fatura.id, id), empresaId ? eq(s.fatura.empresaId, empresaId) : undefined))
  if (!f) throw new ErroNaoEncontrado('Fatura não encontrada.')
  const itens = await tx
    .select()
    .from(s.faturaItem)
    .where(eq(s.faturaItem.faturaId, id))
    .orderBy(s.faturaItem.ordem)
  const recebimentos = await tx
    .select({
      id: s.recebimento.id,
      data: s.recebimento.data,
      valor: s.recebimento.valor,
      forma: s.recebimento.forma,
      referencia: s.recebimento.referencia,
      origem: s.recebimento.origem,
      estornadoEm: s.recebimento.estornadoEm,
      motivoEstorno: s.recebimento.motivoEstorno,
      criadoEm: s.recebimento.criadoEm,
      comprovanteId: sql<string | null>`(select a.id from anexo a
        where a.entidade = 'recebimento' and a.registro_id = recebimento.id and a.ativo
        order by a.criado_em desc limit 1)`,
    })
    .from(s.recebimento)
    .where(eq(s.recebimento.faturaId, id))
    .orderBy(asc(s.recebimento.criadoEm))
  const recebido = recebimentos
    .filter((r) => !r.estornadoEm)
    .reduce((t, r) => t + paraCentavos(r.valor), 0)
  const [cobranca] = await tx
    .select({
      link: s.cobrancaExterna.link,
      pixCopiaCola: s.cobrancaExterna.pixCopiaCola,
      situacao: s.cobrancaExterna.situacao,
    })
    .from(s.cobrancaExterna)
    .where(
      and(
        eq(s.cobrancaExterna.faturaId, id),
        inArray(s.cobrancaExterna.situacao, ['ativa', 'paga']),
      ),
    )
  const [nota] = await tx
    .select({
      numero: s.notaServico.numero,
      situacao: s.notaServico.situacao,
      linkPdf: s.notaServico.linkPdf,
    })
    .from(s.notaServico)
    .where(and(eq(s.notaServico.faturaId, id), sql`${s.notaServico.situacao} <> 'cancelada'`))
  return {
    ...f.fatura,
    cliente: f.nomeFantasia || f.cliente,
    pagamento: cobranca ?? null,
    nota: nota ?? null,
    itens: itens.map((i) => ({
      id: i.id,
      descricao: i.descricao,
      origem: i.origem,
      quantidade: i.quantidade,
      valorUnitario: i.valorUnitario,
      valor: i.valor,
    })),
    recebimentos,
    recebido: deCentavos(recebido),
    saldo: deCentavos(Math.max(0, paraCentavos(f.fatura.total) - recebido)),
  }
}

const colunasLista = {
  id: s.fatura.id,
  numero: s.fatura.numero,
  empresaId: s.fatura.empresaId,
  cliente: sql<string>`coalesce(nullif(${s.ficha.nomeFantasia}, ''), ${s.ficha.nome})`,
  cicloInicio: s.fatura.cicloInicio,
  cicloFim: s.fatura.cicloFim,
  emissao: s.fatura.emissao,
  vencimento: s.fatura.vencimento,
  total: s.fatura.total,
  situacao: s.fatura.situacao,
  recebido: sql<string>`(select coalesce(sum(r.valor), 0) from recebimento r
    where r.fatura_id = fatura.id and r.estornado_em is null)::text`,
}

export async function rotasCobranca(app: FastifyInstance): Promise<void> {
  const { db, armazenamento, config } = app.deps
  const F = 'plataforma.faturas'
  // Pagamento, estorno ou cancelamento: a situação da empresa acompanha na hora.
  const acompanhar = (tx: Tx, empresaId: string, usuarioId: string | null) =>
    aplicarRegua(tx, empresaId, {
      data: hoje(),
      url: config.URL_APLICACAO,
      lembretes: false,
      usuarioId,
    })

  app.get('/api/plataforma/faturas', async (req) =>
    naPlataforma(db, req, [F, 'visualizar'], async ({ tx }) => {
      const c = consultaListagem
        .extend({
          situacao: z.enum(['aberta', 'paga', 'parcial', 'vencida', 'cancelada']).optional(),
          empresaId: z.uuid().optional(),
        })
        .parse(req.query)
      const filtro = and(
        buscaTexto(c.busca, [s.ficha.nome, s.ficha.nomeFantasia, sql`${s.fatura.numero}::text`]),
        c.situacao ? eq(s.fatura.situacao, c.situacao) : undefined,
        c.empresaId ? eq(s.fatura.empresaId, c.empresaId) : undefined,
      )
      const base = () =>
        tx
          .select(colunasLista)
          .from(s.fatura)
          .innerJoin(s.empresa, eq(s.empresa.id, s.fatura.empresaId))
          .innerJoin(s.ficha, eq(s.ficha.id, s.empresa.fichaId))
          .where(filtro)
      return listar({
        consulta: c,
        ordenaveis: {
          numero: s.fatura.numero,
          vencimento: s.fatura.vencimento,
          total: s.fatura.total,
          situacao: s.fatura.situacao,
          cliente: s.ficha.nome,
        },
        ordemPadrao: { campo: 'vencimento', direcao: 'desc' },
        contar: async () =>
          (
            await tx
              .select({ n: sql<number>`count(*)::int` })
              .from(s.fatura)
              .innerJoin(s.empresa, eq(s.empresa.id, s.fatura.empresaId))
              .innerJoin(s.ficha, eq(s.ficha.id, s.empresa.fichaId))
              .where(filtro)
          )[0]!.n,
        buscar: ({ ordem, limite, deslocamento }) =>
          base()
            .orderBy(...ordem)
            .limit(limite)
            .offset(deslocamento),
      })
    }),
  )

  app.get<{ Params: { id: string } }>('/api/plataforma/faturas/:id', async (req) =>
    naPlataforma(db, req, [F, 'visualizar'], async ({ tx }) =>
      lerFatura(tx, z.uuid().parse(req.params.id)),
    ),
  )

  app.post<{ Params: { id: string } }>('/api/plataforma/empresas/:id/faturas', async (req) =>
    naPlataforma(db, req, [F, 'criar'], async ({ tx, usuarioId, auditar }) => {
      const empresaId = z.uuid().parse(req.params.id)
      const d = faturaAvulsaEntrada.parse(req.body)
      const id = await gravarFatura(
        tx,
        {
          empresaId,
          assinaturaId: null,
          ciclo: null,
          emissao: hoje(),
          vencimento: d.vencimento,
          observacao: d.observacao,
          usuarioId,
        },
        d.itens.map((i) => ({
          descricao: i.descricao,
          origem: 'avulso',
          quantidade: i.quantidade,
          valorUnitario: paraCentavos(i.valorUnitario),
        })),
      )
      await auditar({ acao: 'criar', entidade: 'fatura', registroId: id, empresaId, depois: d })
      return { id }
    }),
  )

  app.post<{ Params: { id: string } }>('/api/plataforma/faturas/:id/cancelar', async (req) =>
    naPlataforma(db, req, [F, 'editar'], async ({ tx, usuarioId, auditar }) => {
      const id = z.uuid().parse(req.params.id)
      const m = motivo.parse(req.body).motivo
      const f = await lerFatura(tx, id)
      if (f.situacao === 'cancelada') return { ok: true }
      if (paraCentavos(f.recebido) > 0) {
        throw new ErroRegra(
          'A fatura tem recebimentos. Estorne-os antes de cancelar.',
          'fatura_com_recebimento',
        )
      }
      await tx
        .update(s.fatura)
        .set({
          situacao: 'cancelada',
          canceladaEm: sql`now()`,
          canceladaPor: usuarioId,
          motivoCancelamento: m,
          atualizadoEm: sql`now()`,
          atualizadoPor: usuarioId,
        })
        .where(eq(s.fatura.id, id))
      // Proporcionais cobrados por ela voltam para a próxima fatura.
      await tx
        .update(s.assinaturaMudanca)
        .set({ faturaId: null })
        .where(eq(s.assinaturaMudanca.faturaId, id))
      await pedirCancelamentoExterno(tx, id)
      await auditar({
        acao: 'cancelar',
        entidade: 'fatura',
        registroId: id,
        empresaId: f.empresaId,
        motivo: m,
      })
      await acompanhar(tx, f.empresaId, usuarioId)
      return { ok: true }
    }),
  )

  // Baixa manual: data, valor, forma, referência e comprovante (P15).
  app.post<{ Params: { id: string } }>('/api/plataforma/faturas/:id/recebimentos', async (req) => {
    const faturaId = z.uuid().parse(req.params.id)
    let campos: Record<string, string>
    let arquivo: { nome: string; tipo: string; conteudo: Buffer } | null = null
    if (req.isMultipart()) {
      // O comprovante é opcional: lê todas as partes, com ou sem arquivo.
      campos = {}
      for await (const parte of req.parts()) {
        if (parte.type === 'file') {
          const conteudo = await parte.toBuffer()
          if (!parte.filename || !conteudo.length) continue
          if (parte.file.truncated)
            throw new ErroRegra('Arquivo acima do tamanho máximo (25 MB).', 'arquivo_grande')
          if (!(TIPOS_ANEXO_ACEITOS as readonly string[]).includes(parte.mimetype))
            throw new ErroRegra('Tipo de arquivo não aceito.', 'tipo_arquivo')
          arquivo = { nome: parte.filename, tipo: parte.mimetype, conteudo }
        } else {
          campos[parte.fieldname] = String(parte.value)
        }
      }
    } else {
      campos = req.body as Record<string, string>
    }
    const d = recebimentoEntrada.parse(campos)
    return naPlataforma(db, req, [F, 'editar'], async ({ tx, usuarioId, auditar }) => {
      const f = await lerFatura(tx, faturaId)
      if (f.situacao === 'cancelada') throw new ErroRegra('A fatura está cancelada.', 'cancelada')
      if (paraCentavos(d.valor) > paraCentavos(f.saldo)) {
        throw new ErroRegra(
          `O valor passa do saldo da fatura (${formatarMoeda(paraCentavos(f.saldo))}).`,
          'valor',
        )
      }
      const [r] = await tx
        .insert(s.recebimento)
        .values({
          faturaId,
          empresaId: f.empresaId,
          data: d.data,
          valor: d.valor,
          forma: d.forma as FormaPagamento,
          referencia: d.referencia,
          origem: 'manual',
          criadoPor: usuarioId,
        })
        .returning({ id: s.recebimento.id })
      if (arquivo) {
        const anexoId = uuidv7()
        const caminho = chaveAnexo({
          empresaId: f.empresaId,
          estabelecimentoId: null,
          entidade: 'recebimento',
          registroId: r!.id,
          anexoId,
        })
        await armazenamento.gravar(caminho, arquivo.conteudo)
        await tx.insert(s.anexo).values({
          id: anexoId,
          empresaId: f.empresaId,
          entidade: 'recebimento',
          registroId: r!.id,
          categoria: 'comprovante',
          nomeOriginal: arquivo.nome.slice(0, 255),
          tipoMime: arquivo.tipo,
          tamanhoBytes: arquivo.conteudo.length,
          hashSha256: createHash('sha256').update(arquivo.conteudo).digest('hex'),
          caminho,
          descricao: `Comprovante do recebimento da fatura ${f.numero}`,
          criadoPor: usuarioId,
        })
      }
      const situacao = await atualizarSituacaoFatura(tx, faturaId)
      // Paga por fora do provedor: a cobrança lá deixa de valer.
      if (situacao === 'paga') await pedirCancelamentoExterno(tx, faturaId)
      await auditar({
        acao: 'receber',
        entidade: 'fatura',
        registroId: faturaId,
        empresaId: f.empresaId,
        depois: { ...d, situacao },
      })
      await acompanhar(tx, f.empresaId, usuarioId)
      return { id: r!.id, situacao }
    })
  })

  app.post<{ Params: { id: string } }>('/api/plataforma/recebimentos/:id/estornar', async (req) =>
    naPlataforma(db, req, [F, 'estornar'], async ({ tx, usuarioId, auditar }) => {
      const id = z.uuid().parse(req.params.id)
      const m = motivo.parse(req.body).motivo
      const [r] = await tx
        .update(s.recebimento)
        .set({ estornadoEm: sql`now()`, estornadoPor: usuarioId, motivoEstorno: m })
        .where(and(eq(s.recebimento.id, id), isNull(s.recebimento.estornadoEm)))
        .returning()
      if (!r) throw new ErroNaoEncontrado('Recebimento não encontrado ou já estornado.')
      const situacao = await atualizarSituacaoFatura(tx, r.faturaId)
      await auditar({
        acao: 'estornar_recebimento',
        entidade: 'fatura',
        registroId: r.faturaId,
        empresaId: r.empresaId,
        dados: { recebimentoId: id, valor: r.valor, situacao },
        motivo: m,
      })
      await acompanhar(tx, r.empresaId, usuarioId)
      return { ok: true }
    }),
  )

  app.get<{ Params: { id: string } }>('/api/plataforma/anexos/:id/arquivo', async (req, reply) => {
    const a = await naPlataforma(db, req, [F, 'visualizar'], async ({ tx }) => {
      const [a] = await tx
        .select()
        .from(s.anexo)
        .where(eq(s.anexo.id, z.uuid().parse(req.params.id)))
      if (!a || a.entidade !== 'recebimento') throw new ErroNaoEncontrado('Anexo não encontrado.')
      return a
    })
    reply
      .header('Content-Type', a.tipoMime)
      .header(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(a.nomeOriginal)}`,
      )
      .header('X-Content-Type-Options', 'nosniff')
    return reply.send(await armazenamento.ler(a.caminho))
  })

  app.post<{ Params: { id: string } }>(
    '/api/plataforma/empresas/:id/assinatura/contratar',
    async (req) =>
      naPlataforma(db, req, ['plataforma.clientes', 'editar'], async (ctx) => {
        const a = await assinaturaVigente(ctx.tx, z.uuid().parse(req.params.id))
        const faturaId = await contratar(
          { tx: ctx.tx, usuarioId: ctx.usuarioId, origem: 'plataforma', auditar: ctx.auditar },
          a,
        )
        return { faturaId }
      }),
  )

  // ---- Cliente ----

  app.get('/api/faturas', async (req) =>
    naEmpresa(db, req, ['gestao.assinatura', 'visualizar'], async (ctx) =>
      ctx.tx
        .select(colunasLista)
        .from(s.fatura)
        .innerJoin(s.empresa, eq(s.empresa.id, s.fatura.empresaId))
        .innerJoin(s.ficha, eq(s.ficha.id, s.empresa.fichaId))
        .where(eq(s.fatura.empresaId, ctx.empresaId))
        .orderBy(desc(s.fatura.vencimento), desc(s.fatura.numero))
        .limit(200),
    ),
  )

  app.get<{ Params: { id: string } }>('/api/faturas/:id', async (req) =>
    naEmpresa(db, req, ['gestao.assinatura', 'visualizar'], async (ctx) =>
      lerFatura(ctx.tx, z.uuid().parse(req.params.id), ctx.empresaId),
    ),
  )

  app.post('/api/assinatura/contratar', async (req) =>
    naEmpresa(db, req, ['gestao.assinatura', 'visualizar'], async (ctx) => {
      if (!ctx.acesso.eMaster) {
        throw new ErroPermissao('gestao.assinatura', 'editar', 'Só o Master contrata a assinatura.')
      }
      const a = await assinaturaVigente(ctx.tx, ctx.empresaId)
      await comoPlataforma(ctx.tx, ctx.usuarioId, ctx.empresaId)
      const faturaId = await contratar(
        { tx: ctx.tx, usuarioId: ctx.usuarioId, origem: 'master', auditar: ctx.auditar },
        a,
      )
      return { faturaId }
    }),
  )
}
