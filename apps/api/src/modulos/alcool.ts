// EnoTrace › Livro de álcool etílico (cantina.md, Fermentação, chaptalização, álcool e atesto;
// Lei 7.678/1988, art. 29, §3º): entradas e usos do álcool etílico (os itens marcados "é álcool
// etílico" no cadastro), lidos do livro de estoque; cada entrada pede a comunicação ao MAPA, que se
// registra à mão (data e protocolo). Entrada sem comunicação gera alerta (P20).
import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../db/schema'
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros'
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao'

const F = 'enotrace.estoque'

/** Tipos de entrada que se comunicam (a carga inicial é saldo, não entrada nova). */
export const ENTRADAS_ALCOOL = ['entrada', 'entrada_nfe', 'devolucao']

/** Entradas de álcool ainda não comunicadas (para o alerta). */
export async function entradasSemComunicacao(ctx: ContextoEmpresa) {
  return (
    await ctx.tx.execute<{
      id: string
      estab: string
      item: string
      quantidade: string
      unidade: string
      data: string
    }>(sql`
      select m.id, m.estabelecimento_id as estab, i.nome as item, m.quantidade::text as quantidade,
        i.unidade_base as unidade, (m.executado_em at time zone e.fuso)::date::text as data
      from movimento_estoque m join item_estoque i on i.id = m.item_id
        join estabelecimento e on e.id = m.estabelecimento_id
      where m.empresa_id = ${ctx.empresaId} and i.e_alcool_etilico and m.quantidade > 0
        and m.tipo in (${sql.join(
          ENTRADAS_ALCOOL.map((x) => sql`${x}`),
          sql`, `,
        )})
        and not exists (select 1 from movimento_estoque x where x.estorno_de_id = m.id)
        and not exists (select 1 from comunicacao_alcool c where c.movimento_id = m.id)`)
  ).rows
}

export async function rotasAlcool(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  /** O livro do período: saldos, entradas (com a comunicação) e usos. */
  app.get('/api/alcool', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const q = z.object({ de: z.iso.date(), ate: z.iso.date() }).parse(req.query)
      const limites = sql`(${q.de}::date::timestamp at time zone e.fuso)`
      const fim = sql`((${q.ate}::date + 1)::timestamp at time zone e.fuso)`
      const itens = await ctx.tx.execute<{
        id: string
        nome: string
        unidade: string
        inicial: string
        final: string
      }>(sql`
        select i.id, i.nome, i.unidade_base as unidade,
          coalesce(sum(m.quantidade) filter (where m.executado_em < ${limites}), 0)::numeric(14, 3)::text as inicial,
          coalesce(sum(m.quantidade) filter (where m.executado_em < ${fim}), 0)::numeric(14, 3)::text as final
        from item_estoque i cross join estabelecimento e
          left join movimento_estoque m on m.item_id = i.id and m.estabelecimento_id = e.id
        where e.id = ${estab} and i.empresa_id = ${ctx.empresaId} and i.e_alcool_etilico
        group by i.id, i.nome, i.unidade_base order by i.nome`)
      const movs = await ctx.tx.execute<{
        id: string
        data: string
        item: string
        unidade: string
        lote: string | null
        quantidade: string
        tipo: string
        tipo_original: string | null
        documento: string | null
        nota: string | null
        emitente: string | null
        operacao_id: string | null
        operacao: string | null
        motivo: string | null
        estornado: boolean
        comunicada_em: string | null
        protocolo: string | null
      }>(sql`
        select m.id, (m.executado_em at time zone e.fuso)::text as data, i.nome as item,
          i.unidade_base as unidade, li.codigo as lote, m.quantidade::text as quantidade, m.tipo,
          o.tipo as tipo_original, m.documento, n.numero as nota, n.emitente_nome as emitente,
          m.operacao_id, op.codigo as operacao, m.motivo,
          exists (select 1 from movimento_estoque x where x.estorno_de_id = m.id) as estornado,
          c.comunicada_em::text as comunicada_em, c.protocolo
        from movimento_estoque m join item_estoque i on i.id = m.item_id
          join estabelecimento e on e.id = m.estabelecimento_id
          left join lote_item li on li.id = m.lote_item_id
          left join nfe n on n.id = m.nfe_id
          left join operacao op on op.id = m.operacao_id
          left join movimento_estoque o on o.id = m.estorno_de_id
          left join comunicacao_alcool c on c.movimento_id = m.id
        where m.estabelecimento_id = ${estab} and i.e_alcool_etilico
          and m.executado_em >= ${limites} and m.executado_em < ${fim}
        order by m.executado_em, m.lancado_em`)
      const linha = (m: (typeof movs.rows)[number]) => ({
        id: m.id,
        data: m.data,
        item: m.item,
        unidade: m.unidade,
        lote: m.lote,
        quantidade: m.quantidade,
        tipo: m.tipo,
        estornoDe: m.tipo_original,
        documento: m.nota ?? m.documento,
        emitente: m.emitente,
        operacaoId: m.operacao_id,
        operacao: m.operacao,
        motivo: m.motivo,
        estornado: m.estornado,
      })
      return {
        itens: itens.rows,
        entradas: movs.rows
          .filter((m) => Number(m.quantidade) > 0 && m.tipo !== 'estorno')
          .map((m) => ({
            ...linha(m),
            comunicar: ENTRADAS_ALCOOL.includes(m.tipo) && !m.estornado,
            comunicacao: m.comunicada_em ? { em: m.comunicada_em, protocolo: m.protocolo } : null,
          })),
        usos: movs.rows.filter((m) => Number(m.quantidade) < 0 || m.tipo === 'estorno').map(linha),
      }
    }),
  )

  /** Registra a comunicação de uma entrada ao MAPA. */
  app.post<{ Params: { id: string } }>('/api/alcool/entradas/:id/comunicacao', async (req) =>
    naEmpresa(db, req, [F, 'confirmar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const id = z.uuid().parse(req.params.id)
      const d = z
        .object({
          comunicadaEm: z.iso.date('Informe a data'),
          protocolo: z.string().trim().max(100).nullable().optional(),
          observacao: z.string().trim().max(500).nullable().optional(),
        })
        .parse(req.body)
      const [m] = (
        await ctx.tx.execute<{
          estab: string
          tipo: string
          quantidade: string
          alcool: boolean
        }>(sql`
          select m.estabelecimento_id as estab, m.tipo, m.quantidade::text as quantidade, i.e_alcool_etilico as alcool
          from movimento_estoque m join item_estoque i on i.id = m.item_id
          where m.id = ${id} and m.empresa_id = ${ctx.empresaId}`)
      ).rows
      if (!m || m.estab !== estab || !m.alcool)
        throw new ErroNaoEncontrado('Entrada de álcool não encontrada.')
      if (!ENTRADAS_ALCOOL.includes(m.tipo) || Number(m.quantidade) <= 0)
        throw new ErroRegra('Só as entradas de álcool se comunicam.', 'tipo')
      const [ja] = (
        await ctx.tx.execute<{ id: string }>(
          sql`select id from comunicacao_alcool where movimento_id = ${id}`,
        )
      ).rows
      if (ja) throw new ErroRegra('Esta entrada já tem a comunicação registrada.', 'comunicada')
      const [c] = await ctx.tx
        .insert(s.comunicacaoAlcool)
        .values({
          empresaId: ctx.empresaId,
          estabelecimentoId: estab,
          movimentoId: id,
          comunicadaEm: d.comunicadaEm,
          protocolo: d.protocolo ?? null,
          observacao: d.observacao ?? null,
          criadoPor: ctx.usuarioId,
        })
        .returning({ id: s.comunicacaoAlcool.id })
      await ctx.auditar({
        acao: 'comunicar',
        entidade: 'comunicacao_alcool',
        registroId: c!.id,
        dados: { movimento: id, ...d },
      })
      return { id: c!.id }
    }),
  )
}
