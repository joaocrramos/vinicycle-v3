// EnoTrace › Inventário da cantina (cantina.md, Inventário; 03-modelo-de-dados.md, 2.5): a tela
// de contagem lista os recipientes com o volume do livro na hora da contagem; o cantineiro digita o
// medido; a confirmação lança de uma vez os ajustes das diferenças, com motivo, numa operação
// "ajuste de inventário" (P27: permissão específica). A composição não muda (5.3). Diferença acima
// do percentual configurado pede "ciente" (P29); o fluxo de aprovação fica para 2027.
import {
  confirmarInventario,
  contagemInventario,
  deCentilitros,
  novoInventario,
  paraCentilitros,
} from '@vinicycle/shared'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../../db/schema'
import { conferirVersao } from '../../nucleo/entidades'
import { ErroNaoEncontrado, ErroRegra } from '../../nucleo/erros'
import { exigeAprovacao, pedirAprovacao } from '../../nucleo/aprovacoes'
import { type Aviso, exigirCientes } from '../../nucleo/regras'
import { type ContextoEmpresa, naEmpresa } from '../../nucleo/requisicao'
import { lerParametro } from '../parametros'
import { conferirPessoas, dataExecucao, saldosNaData } from './apoio'
import {
  confirmar,
  type Lancamento,
  type LinhaOperacao,
  type PlanoOperacao,
  preparar,
} from './motor'

const F = 'enotrace.operacoes'
const AJUSTE = 'enotrace.ajuste_inventario'

const litrosBr = (cl: number) =>
  (cl / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function carregar(ctx: ContextoEmpresa, id: string, travar = false) {
  const consulta = ctx.tx
    .select()
    .from(s.inventarioCantina)
    .where(and(eq(s.inventarioCantina.id, id), eq(s.inventarioCantina.empresaId, ctx.empresaId)))
  const [i] = travar ? await consulta.for('update') : await consulta
  if (!i || !(await ctx.estabelecimentosPermitidos()).includes(i.estabelecimentoId))
    throw new ErroNaoEncontrado('Inventário não encontrado.')
  return i
}

function exigirRascunho(i: { situacao: string }) {
  if (i.situacao !== 'rascunho')
    throw new ErroRegra(
      'O inventário já foi confirmado: estorne o ajuste, se preciso.',
      'confirmado',
    )
}

/**
 * Linhas da contagem com o recipiente e, no rascunho, o lote e o volume do livro na hora da
 * contagem; no inventário confirmado, os gravados na confirmação.
 */
async function linhas(ctx: ContextoEmpresa, inv: typeof s.inventarioCantina.$inferSelect) {
  const itens = await ctx.tx
    .select({
      recipienteId: s.inventarioCantinaItem.recipienteId,
      codigo: s.recipiente.codigo,
      tipo: s.tipoRecipiente.nome,
      local: s.local.nome,
      capacidade: s.recipiente.capacidadeLitros,
      situacao: s.recipiente.situacao,
      loteId: s.inventarioCantinaItem.loteId,
      volumeLivro: s.inventarioCantinaItem.volumeLivro,
      volumeMedido: s.inventarioCantinaItem.volumeMedido,
      motivo: s.inventarioCantinaItem.motivo,
    })
    .from(s.inventarioCantinaItem)
    .innerJoin(s.recipiente, eq(s.recipiente.id, s.inventarioCantinaItem.recipienteId))
    .innerJoin(s.tipoRecipiente, eq(s.tipoRecipiente.id, s.recipiente.tipoRecipienteId))
    .innerJoin(s.local, eq(s.local.id, s.recipiente.localId))
    .where(eq(s.inventarioCantinaItem.inventarioId, inv.id))
    .orderBy(
      asc(s.local.nome),
      sql`regexp_replace(lower(${s.recipiente.codigo}), '\\d+', lpad(substring(${s.recipiente.codigo} from '\\d+'), 10, '0'))`,
    )
  const naData =
    inv.situacao === 'rascunho'
      ? await saldosNaData(
          ctx,
          itens.map((i) => i.recipienteId),
          inv.contadoEm,
        )
      : []
  const resultado = itens.map((i) => {
    const parte = naData.find((x) => x.recipienteId === i.recipienteId)
    const livroCl =
      inv.situacao === 'rascunho' ? (parte?.cl ?? 0) : paraCentilitros(i.volumeLivro ?? 0)
    const loteId = inv.situacao === 'rascunho' ? (parte?.loteId ?? null) : i.loteId
    const medidoCl = i.volumeMedido === null ? null : paraCentilitros(i.volumeMedido)
    return { ...i, loteId, livroCl, medidoCl }
  })
  const lotes = [...new Set(resultado.flatMap((r) => (r.loteId ? [r.loteId] : [])))]
  const nomes = lotes.length
    ? await ctx.tx
        .select({ id: s.lote.id, codigo: s.lote.codigo, projetoId: s.lote.projetoId })
        .from(s.lote)
        .where(inArray(s.lote.id, lotes))
    : []
  return resultado.map((r) => ({
    ...r,
    lote: nomes.find((n) => n.id === r.loteId) ?? null,
  }))
}

/** O plano da operação de ajuste: uma linha e um lançamento por recipiente com diferença. */
async function montarAjuste(
  ctx: ContextoEmpresa,
  inv: typeof s.inventarioCantina.$inferSelect,
  responsavelId: string | null,
) {
  const lidas = await linhas(ctx, inv)
  const { percentual } = await lerParametro(ctx, 'inventario_cantina')
  const linhasOp: LinhaOperacao[] = []
  const lancamentos: Lancamento[] = []
  const avisos: Aviso[] = []
  const motivos: Record<string, string> = {}
  for (const l of lidas) {
    if (l.medidoCl === null) continue
    const diferenca = l.medidoCl - l.livroCl
    if (diferenca === 0) continue
    if (!l.loteId)
      throw new ErroRegra(
        `O recipiente ${l.codigo} está vazio no livro: lance antes a operação que pôs vinho nele.`,
        'vazio_no_livro',
      )
    if (!l.motivo)
      throw new ErroRegra(`Informe o motivo da diferença no ${l.codigo}.`, 'motivo', {
        recipienteId: l.recipienteId,
      })
    const ordem = linhasOp.length + 1
    linhasOp.push({
      ordem,
      papel: 'ajuste',
      recipienteId: l.recipienteId,
      lote: { id: l.loteId },
      centilitros: diferenca,
      litrosMedidos: l.medidoCl,
    })
    lancamentos.push({
      recipienteId: l.recipienteId,
      lote: { id: l.loteId },
      centilitros: diferenca,
      tipo: 'ajuste_inventario',
      linha: ordem,
    })
    motivos[l.codigo] = l.motivo
    const pct = l.livroCl ? (Math.abs(diferenca) / l.livroCl) * 100 : 100
    if (pct > percentual) {
      avisos.push({
        codigo: `inventario:${l.recipienteId}`,
        mensagem: `Diferença de ${diferenca > 0 ? '+' : '−'}${litrosBr(Math.abs(diferenca))} L no ${l.codigo} (${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do livro), acima de ${percentual.toLocaleString('pt-BR')}%.`,
      })
    }
  }
  const projetos = [
    ...new Set(
      lidas.flatMap((l) =>
        l.lote && linhasOp.some((x) => x.recipienteId === l.recipienteId) ? [l.lote.projetoId] : [],
      ),
    ),
  ]
  const plano: PlanoOperacao = {
    tipo: 'ajuste_inventario',
    estabelecimentoId: inv.estabelecimentoId,
    executadoEm: inv.contadoEm,
    projetoId: projetos.length === 1 ? projetos[0]! : null,
    responsavelId,
    observacao: inv.observacao,
    dados: { inventarioId: inv.id, motivos },
    linhas: linhasOp,
    lancamentos,
    avisos,
  }
  return { plano, lidas }
}

/** Recipientes da contagem: os em uso do estabelecimento (ou do local), mais os inativos com saldo. */
async function recipientesParaContar(ctx: ContextoEmpresa, estab: string, localId: string | null) {
  return ctx.tx
    .select({ id: s.recipiente.id })
    .from(s.recipiente)
    .where(
      and(
        eq(s.recipiente.estabelecimentoId, estab),
        eq(s.recipiente.empresaId, ctx.empresaId),
        localId ? eq(s.recipiente.localId, localId) : undefined,
        sql`(${s.recipiente.situacao} <> 'inativo' or coalesce((select sum(m.litros) from movimento_volume m where m.recipiente_id = recipiente.id), 0) <> 0)`,
      ),
    )
}

export async function rotasInventarios(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  app.get('/api/inventarios', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const q = z
        .object({ situacao: z.enum(['rascunho', 'confirmado', 'todos']).default('todos') })
        .parse(req.query)
      const r = await ctx.tx.execute<{
        id: string
        contadoEm: string
        situacao: string
        local: string | null
        operacaoId: string | null
        operacao: string | null
        operacaoSituacao: string | null
        recipientes: number
        contados: number
        observacao: string | null
      }>(sql`
        select i.id, i.contado_em as "contadoEm", i.situacao, l.nome as local, i.observacao,
          o.id as "operacaoId", o.codigo as operacao, o.situacao as "operacaoSituacao",
          (select count(*)::int from inventario_cantina_item x where x.inventario_id = i.id) as recipientes,
          (select count(*)::int from inventario_cantina_item x where x.inventario_id = i.id and x.volume_medido is not null) as contados
        from inventario_cantina i
          left join local l on l.id = i.local_id
          left join operacao o on o.id = i.operacao_id
        where i.empresa_id = ${ctx.empresaId} and i.estabelecimento_id = ${estab}
          ${q.situacao === 'todos' ? sql`` : sql`and i.situacao = ${q.situacao}`}
        order by i.contado_em desc
        limit 200`)
      return r.rows
    }),
  )

  app.post('/api/inventarios', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const d = novoInventario.parse(req.body)
      const contadoEm = dataExecucao(d.contadoEm)
      if (d.localId) {
        const [l] = await ctx.tx
          .select({ estab: s.local.estabelecimentoId })
          .from(s.local)
          .where(and(eq(s.local.id, d.localId), eq(s.local.empresaId, ctx.empresaId)))
        if (!l || l.estab !== estab) throw new ErroRegra('Local inválido.', 'local')
      }
      const recipientes = await recipientesParaContar(ctx, estab, d.localId ?? null)
      if (!recipientes.length) throw new ErroRegra('Não há recipientes para contar.', 'vazio')
      const [inv] = await ctx.tx
        .insert(s.inventarioCantina)
        .values({
          empresaId: ctx.empresaId,
          estabelecimentoId: estab,
          contadoEm,
          localId: d.localId ?? null,
          observacao: d.observacao ?? null,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.inventarioCantina.id })
      await ctx.tx.insert(s.inventarioCantinaItem).values(
        recipientes.map((r) => ({
          empresaId: ctx.empresaId,
          inventarioId: inv!.id,
          recipienteId: r.id,
        })),
      )
      await ctx.auditar({
        acao: 'criar',
        entidade: 'inventario_cantina',
        registroId: inv!.id,
        dados: { contadoEm: d.contadoEm, recipientes: recipientes.length },
      })
      return { id: inv!.id }
    }),
  )

  app.get<{ Params: { id: string } }>('/api/inventarios/:id', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const inv = await carregar(ctx, z.uuid().parse(req.params.id))
      const itens = await linhas(ctx, inv)
      const [extra] = await ctx.tx
        .execute<{
          local: string | null
          operacao: string | null
          operacaoSituacao: string | null
          confirmadoPor: string | null
        }>(
          sql`
        select (select l.nome from local l where l.id = ${inv.localId}) as local,
          (select o.codigo from operacao o where o.id = ${inv.operacaoId}) as operacao,
          (select o.situacao from operacao o where o.id = ${inv.operacaoId}) as "operacaoSituacao",
          (select f.nome from usuario u join ficha f on f.id = u.ficha_id where u.id = ${inv.confirmadoPor}) as "confirmadoPor"`,
        )
        .then((r) => r.rows)
      const { percentual } = await lerParametro(ctx, 'inventario_cantina')
      return {
        id: inv.id,
        contadoEm: inv.contadoEm,
        situacao: inv.situacao,
        localId: inv.localId,
        observacao: inv.observacao,
        operacaoId: inv.operacaoId,
        confirmadoEm: inv.confirmadoEm,
        versao: inv.versao,
        percentual,
        ...extra,
        itens: itens.map((i) => ({
          recipienteId: i.recipienteId,
          codigo: i.codigo,
          tipo: i.tipo,
          local: i.local,
          capacidade: i.capacidade,
          situacao: i.situacao,
          lote: i.lote ? { id: i.lote.id, codigo: i.lote.codigo } : null,
          volumeLivro: deCentilitros(i.livroCl),
          volumeMedido: i.medidoCl === null ? null : deCentilitros(i.medidoCl),
          diferenca: i.medidoCl === null ? null : deCentilitros(i.medidoCl - i.livroCl),
          motivo: i.motivo,
        })),
      }
    }),
  )

  app.put<{ Params: { id: string } }>('/api/inventarios/:id', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const d = contagemInventario.parse(req.body)
      const inv = await carregar(ctx, id, true)
      exigirRascunho(inv)
      conferirVersao(inv.versao, d.versao)
      for (const i of d.itens) {
        await ctx.tx
          .update(s.inventarioCantinaItem)
          .set({ volumeMedido: i.volumeMedido ?? null, motivo: i.motivo ?? null })
          .where(
            and(
              eq(s.inventarioCantinaItem.inventarioId, id),
              eq(s.inventarioCantinaItem.recipienteId, i.recipienteId),
            ),
          )
      }
      await ctx.tx
        .update(s.inventarioCantina)
        .set({
          contadoEm: dataExecucao(d.contadoEm),
          observacao: d.observacao ?? null,
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.inventarioCantina.versao} + 1`,
        })
        .where(eq(s.inventarioCantina.id, id))
      await ctx.auditar({ acao: 'editar', entidade: 'inventario_cantina', registroId: id })
      return { ok: true, versao: inv.versao + 1 }
    }),
  )

  app.post<{ Params: { id: string } }>('/api/inventarios/:id/descartar', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      exigirRascunho(await carregar(ctx, id, true))
      await ctx.tx.delete(s.inventarioCantina).where(eq(s.inventarioCantina.id, id))
      await ctx.auditar({ acao: 'descartar', entidade: 'inventario_cantina', registroId: id })
      return { ok: true }
    }),
  )

  /** Prévia: os ajustes, volumes antes e depois, avisos e bloqueios, sem gravar. */
  app.post<{ Params: { id: string } }>('/api/inventarios/:id/previa', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const inv = await carregar(ctx, z.uuid().parse(req.params.id))
      exigirRascunho(inv)
      const { plano } = await montarAjuste(ctx, inv, null)
      if (!plano.lancamentos.length)
        return { recipientes: [], perdas: [], avisos: [], bloqueios: [], semDiferencas: true }
      const { previa } = await preparar(ctx, plano, { travar: false })
      return { ...previa, semDiferencas: false }
    }),
  )

  /**
   * Confirma: grava o livro e o lote de cada linha e lança os ajustes numa operação. Sem
   * diferenças, o inventário se confirma sem operação. Com diferenças, exige a permissão de
   * ajuste de inventário (P27). Diferença acima do limite vai para a aprovação, se a empresa exigir.
   */
  app.post<{ Params: { id: string } }>('/api/inventarios/:id/confirmar', async (req) =>
    naEmpresa(db, req, [F, 'confirmar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const d = confirmarInventario.parse(req.body)
      const inv = await carregar(ctx, id, true)
      exigirRascunho(inv)
      await conferirPessoas(ctx, [d.responsavelId])
      const { plano } = await montarAjuste(ctx, inv, d.responsavelId ?? null)
      const acima = (plano.avisos ?? []).filter((a) => a.codigo.startsWith('inventario:'))
      if (plano.lancamentos.length && acima.length && (await exigeAprovacao(ctx, 'inventario'))) {
        // Só vai para a aprovação o que a confirmação conseguiria fazer agora.
        const { previa } = await preparar(ctx, plano, { travar: false })
        if (previa.bloqueios.length) throw new ErroRegra(previa.bloqueios[0]!, 'bloqueio')
        exigirCientes(previa.avisos, d.cientes)
        return pedirAprovacao(ctx, {
          tipo: 'inventario',
          estabelecimentoId: inv.estabelecimentoId,
          entidade: 'inventario_cantina',
          registroId: id,
          resumo: `Ajuste de inventário acima do limite: ${acima.map((a) => a.mensagem).join(' ')}`,
          dados: {
            inventarioId: id,
            versao: inv.versao,
            ajustes: assinatura(plano),
            responsavelId: d.responsavelId ?? null,
            cientes: d.cientes,
          },
        })
      }
      return efetivarInventario(ctx, id, d, {})
    }),
  )
}

/** Os ajustes do plano, para conferir na aprovação que nada mudou desde o pedido. */
function assinatura(plano: PlanoOperacao) {
  return plano.lancamentos.map((l) => `${l.recipienteId}:${l.centilitros}`).join('|')
}

/**
 * Confirma o inventário (direto ou na aprovação do pedido). Na aprovação, a permissão de ajuste é
 * a de quem aprovou, e o inventário e os ajustes têm de ser os do pedido.
 */
export async function efetivarInventario(
  ctx: ContextoEmpresa,
  id: string,
  d: { responsavelId?: string | null; cientes: string[] },
  aprovacao: { versao?: number; ajustes?: string },
) {
  const inv = await carregar(ctx, id, true)
  exigirRascunho(inv)
  if (aprovacao.versao !== undefined && aprovacao.versao !== inv.versao)
    throw new ErroRegra('O inventário foi alterado depois do pedido: peça de novo.', 'mudou')
  const { plano, lidas } = await montarAjuste(ctx, inv, d.responsavelId ?? null)
  if (aprovacao.ajustes !== undefined && aprovacao.ajustes !== assinatura(plano))
    throw new ErroRegra(
      'O livro dos recipientes mudou depois do pedido, e os ajustes não são mais os mesmos: peça de novo.',
      'mudou',
    )
  let operacao: { operacaoId: string; codigo: string } | null = null
  if (plano.lancamentos.length) {
    if (aprovacao.versao === undefined) ctx.exigir(AJUSTE, 'confirmar')
    operacao = await confirmar(ctx, plano, d.cientes)
  }
  for (const l of lidas) {
    await ctx.tx
      .update(s.inventarioCantinaItem)
      .set({ loteId: l.loteId, volumeLivro: deCentilitros(l.livroCl) })
      .where(
        and(
          eq(s.inventarioCantinaItem.inventarioId, id),
          eq(s.inventarioCantinaItem.recipienteId, l.recipienteId),
        ),
      )
  }
  await ctx.tx
    .update(s.inventarioCantina)
    .set({
      situacao: 'confirmado',
      operacaoId: operacao?.operacaoId ?? null,
      confirmadoEm: sql`now()`,
      confirmadoPor: ctx.usuarioId,
      atualizadoEm: sql`now()`,
      atualizadoPor: ctx.usuarioId,
      versao: sql`${s.inventarioCantina.versao} + 1`,
    })
    .where(eq(s.inventarioCantina.id, id))
  await ctx.auditar({
    acao: 'confirmar',
    entidade: 'inventario_cantina',
    registroId: id,
    dados: { operacao: operacao?.codigo ?? null, ajustes: plano.lancamentos.length },
  })
  return {
    ok: true,
    operacaoId: operacao?.operacaoId ?? null,
    codigo: operacao?.codigo ?? null,
  }
}
