// Transferência de titularidade no estoque e lista das transferências (cantina.md, Mistura entre
// titulares; Pagamento em produto; 04, roteiro do ciclo 10, bloco 2). No estoque, o lote do item
// (garrafas, ou qualquer item com lote) passa a ser de outro titular com o mesmo código, o impresso
// na garrafa, para a rastreabilidade. O estorno é o do grupo de movimentos (Estoque › estorno).
import { titularidadeEstoque } from '@vinicycle/shared'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../db/schema'
import { ErroRegra } from '../nucleo/erros'
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao'
import { lancarEstoque, obterLote } from './estoque'
import { dataExecucao } from './producao/apoio'
import { conferirContratoTitularidade } from './producao/titularidade'

const paraMil = (q: string | number) => Math.round(Number(q) * 1000)

/** Transferência valendo: a operação confirmada ou os movimentos sem estorno. */
export const transferenciaValida = sql`(
  (transferencia_titularidade.operacao_id is not null and exists (select 1 from operacao o where o.id = transferencia_titularidade.operacao_id and o.situacao = 'confirmada'))
  or (transferencia_titularidade.grupo_estoque_id is not null and not exists (select 1 from movimento_estoque m join movimento_estoque e on e.estorno_de_id = m.id where m.grupo_id = transferencia_titularidade.grupo_estoque_id))
)`

/** Total transferido no contrato como pagamento do serviço (litros e garrafas). */
export async function transferidoNoContrato(ctx: ContextoEmpresa, contratoId: string) {
  const [r] = await ctx.tx
    .select({
      litros: sql<string>`coalesce(sum(${s.transferenciaTitularidade.litros}), 0)::numeric(14, 2)::text`,
      garrafas: sql<number>`coalesce(sum(${s.transferenciaTitularidade.garrafas}), 0)::int`,
    })
    .from(s.transferenciaTitularidade)
    .where(
      and(
        eq(s.transferenciaTitularidade.contratoId, contratoId),
        eq(s.transferenciaTitularidade.motivo, 'pagamento_servico'),
        transferenciaValida,
      ),
    )
  return r ?? { litros: '0.00', garrafas: 0 }
}

const nomeTitular = (coluna: string) =>
  sql<
    string | null
  >`(select f.nome from pessoa p join ficha f on f.id = p.ficha_id where p.id = ${sql.raw(coluna)})`

export async function rotasTitularidade(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  app.post('/api/estoque/titularidade', async (req) =>
    naEmpresa(db, req, ['enotrace.estoque', 'criar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const d = titularidadeEstoque.parse(req.body)
      const executadoEm = dataExecucao(d.executadoEm)
      const para = d.paraTitularId
      if (para) {
        const [p] = await ctx.tx
          .select({ id: s.pessoa.id })
          .from(s.pessoa)
          .where(and(eq(s.pessoa.id, para), eq(s.pessoa.empresaId, ctx.empresaId)))
        if (!p) throw new ErroRegra('Titular inválido.', 'paraTitularId')
      }
      const lotes = await ctx.tx
        .select({
          id: s.loteItem.id,
          itemId: s.loteItem.itemId,
          codigo: s.loteItem.codigo,
          fabricacao: s.loteItem.fabricacao,
          validade: s.loteItem.validade,
          titularId: s.loteItem.titularId,
          estab: s.loteItem.estabelecimentoId,
          saldo: sql<string>`coalesce((select sum(m.quantidade) from movimento_estoque m where m.lote_item_id = lote_item.id and m.local_id = ${d.localId}), 0)`,
        })
        .from(s.loteItem)
        .where(
          and(
            inArray(
              s.loteItem.id,
              d.itens.map((i) => i.loteItemId),
            ),
            eq(s.loteItem.empresaId, ctx.empresaId),
          ),
        )
      const lote = (id: string) => lotes.find((l) => l.id === id)
      for (const i of d.itens) {
        const l = lote(i.loteItemId)
        if (!l || l.itemId !== i.itemId || l.estab !== estab)
          throw new ErroRegra('Lote inválido.', 'lote')
      }
      const de = lote(d.itens[0]!.loteItemId)!.titularId
      if (d.itens.some((i) => lote(i.loteItemId)!.titularId !== de))
        throw new ErroRegra(
          'Os lotes têm titulares diferentes: transfira um titular por vez.',
          'titulares',
        )
      if (de === para)
        throw new ErroRegra(
          'O lote já é deste titular: escolha outro novo titular.',
          'paraTitularId',
        )
      // Saldo do lote no local (o saldo do item não muda, então o livro não o confere sozinho).
      const pedido = new Map<string, number>()
      for (const i of d.itens)
        pedido.set(i.loteItemId, (pedido.get(i.loteItemId) ?? 0) + paraMil(i.quantidade))
      for (const [id, q] of pedido) {
        const l = lote(id)!
        if (q > paraMil(l.saldo))
          throw new ErroRegra(
            `O lote ${l.codigo} tem ${Number(l.saldo).toLocaleString('pt-BR')} neste local.`,
            'quantidade',
          )
      }
      await conferirContratoTitularidade(ctx, d.contratoId, de, para)

      const movimentos = []
      for (const i of d.itens) {
        const l = lote(i.loteItemId)!
        const destino = await obterLote(
          ctx,
          estab,
          i.itemId,
          { codigo: l.codigo, fabricacao: l.fabricacao, validade: l.validade },
          'titularidade',
          para,
        )
        movimentos.push(
          {
            localId: d.localId,
            itemId: i.itemId,
            loteItemId: l.id,
            quantidade: `-${i.quantidade}`,
            tipo: 'titularidade' as const,
            documento: l.codigo,
            motivo: d.observacao,
          },
          {
            localId: d.localId,
            itemId: i.itemId,
            loteItemId: destino,
            quantidade: i.quantidade,
            tipo: 'titularidade' as const,
            documento: l.codigo,
            motivo: d.observacao,
          },
        )
      }
      const r = await lancarEstoque(ctx, { estabelecimentoId: estab, executadoEm, movimentos })

      // Garrafas e litros, pelos formatos de produto acabado.
      const formatos = await ctx.tx
        .select({ itemId: s.produtoFormato.itemEstoqueId, volumeMl: s.produtoFormato.volumeMl })
        .from(s.produtoFormato)
        .where(
          and(
            inArray(
              s.produtoFormato.itemEstoqueId,
              d.itens.map((i) => i.itemId),
            ),
            eq(s.produtoFormato.empresaId, ctx.empresaId),
          ),
        )
      let garrafas = 0
      let ml = 0
      for (const i of d.itens) {
        const f = formatos.find((x) => x.itemId === i.itemId)
        if (!f) continue
        garrafas += Math.round(Number(i.quantidade))
        ml += Math.round(Number(i.quantidade)) * f.volumeMl
      }
      const [t] = await ctx.tx
        .insert(s.transferenciaTitularidade)
        .values({
          empresaId: ctx.empresaId,
          estabelecimentoId: estab,
          forma: 'estoque',
          executadoEm,
          motivo: d.motivo,
          contratoId: d.contratoId,
          deTitularId: de,
          paraTitularId: para,
          grupoEstoqueId: r.grupoId,
          litros: (ml / 1000).toFixed(2),
          garrafas,
          observacao: d.observacao,
          criadoPor: ctx.usuarioId,
        })
        .returning({ id: s.transferenciaTitularidade.id })
      await ctx.auditar({
        acao: 'criar',
        entidade: 'transferencia_titularidade',
        registroId: t!.id,
        depois: { ...d, deTitularId: de, grupoEstoqueId: r.grupoId },
      })
      return { id: t!.id, grupoId: r.grupoId, avisos: r.avisos }
    }),
  )

  // Transferências (granel e estoque), as válidas e as estornadas.
  app.get('/api/titularidade', async (req) =>
    naEmpresa(db, req, ['enotrace.operacoes', 'visualizar'], async (ctx) => {
      const q = z
        .object({ contratoId: z.uuid().optional(), titularId: z.uuid().optional() })
        .parse(req.query)
      const t = s.transferenciaTitularidade
      return ctx.tx
        .select({
          id: t.id,
          forma: t.forma,
          executadoEm: t.executadoEm,
          motivo: t.motivo,
          contratoId: t.contratoId,
          deTitularId: t.deTitularId,
          de: nomeTitular('transferencia_titularidade.de_titular_id'),
          paraTitularId: t.paraTitularId,
          para: nomeTitular('transferencia_titularidade.para_titular_id'),
          operacaoId: t.operacaoId,
          grupoEstoqueId: t.grupoEstoqueId,
          litros: t.litros,
          garrafas: t.garrafas,
          valida: sql<boolean>`${transferenciaValida}`,
        })
        .from(t)
        .where(
          and(
            eq(t.empresaId, ctx.empresaId),
            inArray(t.estabelecimentoId, await ctx.estabelecimentosPermitidos()),
            q.contratoId ? eq(t.contratoId, q.contratoId) : undefined,
            q.titularId
              ? sql`(${t.deTitularId} = ${q.titularId} or ${t.paraTitularId} = ${q.titularId})`
              : undefined,
          ),
        )
        .orderBy(sql`${t.executadoEm} desc`)
    }),
  )
}
