// EnoTrace › Terceiros › Produção em terceiro, o "vinho cigano" (cantina.md, Produção em terceiro;
// 04, roteiro do ciclo 10, bloco 5). Lado de quem contrata: a remessa à cantina (uva, mosto ou vinho
// a granel, insumos e embalagens) e os retornos, parciais, com as perdas informadas pela cantina.
// O granel sai pela saída de granel "remessa a terceiro" e volta por uma entrada de granel "retorno
// de terceiro", criada aqui; as garrafas entram no estoque com o lote comercial informado pela
// cantina; os insumos vão para o local externo da cantina, onde fica o saldo em poder do terceiro.
import {
  remessaTerceiro as esquemaRemessa,
  retornoTerceiro as esquemaRetorno,
} from '@vinicycle/shared'
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../db/schema'
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros'
import { exigirMesAberto } from '../nucleo/periodo'
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao'
import { lancarEstoque, type MovimentoNovo, obterLote } from './estoque'
import { carregarProjeto, dataExecucao } from './producao/apoio'
import { planoEntradaGranel } from './producao/granel'
import { confirmar } from './producao/motor'
import { estornarOperacao } from './producao/operacoes'

const F = 'enotrace.operacoes'
const paraMil = (q: string | number) => Math.round(Number(q) * 1000)
const deMil = (m: number) => (m / 1000).toFixed(3)
const kgBr = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

async function conferirCantina(ctx: ContextoEmpresa, cantinaId: string) {
  const [p] = await ctx.tx
    .select({ id: s.pessoaPapel.id })
    .from(s.pessoaPapel)
    .where(
      and(
        eq(s.pessoaPapel.pessoaId, cantinaId),
        eq(s.pessoaPapel.empresaId, ctx.empresaId),
        eq(s.pessoaPapel.papel, 'cantina_prestadora'),
        eq(s.pessoaPapel.ativo, true),
      ),
    )
  if (!p)
    throw new ErroRegra(
      'A cantina precisa ter o papel de cantina prestadora de serviço (Gestão › Pessoas).',
      'cantinaId',
    )
}

/** Local externo (a cantina) deste estabelecimento, no estoque do EnoTrace. */
async function conferirLocalExterno(ctx: ContextoEmpresa, localId: string, estab: string) {
  const [l] = await ctx.tx
    .select({ externo: s.local.externo, estab: s.local.estabelecimentoId, nome: s.local.nome })
    .from(s.local)
    .where(and(eq(s.local.id, localId), eq(s.local.empresaId, ctx.empresaId)))
  if (!l || l.estab !== estab) throw new ErroRegra('Local inválido.', 'local')
  if (!l.externo)
    throw new ErroRegra(
      `O local ${l.nome} não é externo. Cadastre a cantina como local externo (Configurações › Locais).`,
      'local_externo',
    )
}

/** Kg da uva do romaneio ainda sem destino: o líquido menos o processado e o remetido. */
async function saldoUvaDoItem(ctx: ContextoEmpresa, itemId: string) {
  const [r] = (
    await ctx.tx.execute<{ saldo: string; variedade: string; estab: string; situacao: string }>(sql`
      select coalesce((select sum(p.bruto_kg - p.tara_kg) from pesagem p where p.item_id = ri.id), 0)
        - coalesce((select -sum(m.kg) from movimento_uva m where m.item_id = ri.id), 0)
        - coalesce((select sum(x.kg) from remessa_terceiro_item x join remessa_terceiro rt on rt.id = x.remessa_id
            where x.romaneio_item_id = ri.id and rt.situacao = 'lancada'), 0) as saldo,
        ri.variedade_id as variedade, r.estabelecimento_id as estab, r.situacao
      from romaneio_item ri join romaneio r on r.id = ri.romaneio_id
      where ri.id = ${itemId} and ri.empresa_id = ${ctx.empresaId}`)
  ).rows
  return r
}

export async function rotasProducaoTerceiro(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  // Remessas -------------------------------------------------------------------------------------

  app.post('/api/terceiros/remessas', async (req) =>
    naEmpresa(db, req, [F, 'confirmar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const d = esquemaRemessa.parse(req.body)
      const executadoEm = dataExecucao(d.executadoEm)
      await exigirMesAberto(ctx.tx, estab, executadoEm)
      const projeto = await carregarProjeto(ctx, d.projetoId, estab)
      await conferirCantina(ctx, d.cantinaId)
      if (d.contratoId) {
        const [c] = await ctx.tx
          .select({
            sentido: s.contratoTerceirizacao.sentido,
            contraparte: s.contratoTerceirizacao.contraparteId,
          })
          .from(s.contratoTerceirizacao)
          .where(
            and(
              eq(s.contratoTerceirizacao.id, d.contratoId),
              eq(s.contratoTerceirizacao.empresaId, ctx.empresaId),
            ),
          )
        if (!c || c.sentido !== 'contratamos' || c.contraparte !== d.cantinaId)
          throw new ErroRegra('O contrato escolhido não é com esta cantina.', 'contratoId')
      }

      const itens: Array<typeof s.remessaTerceiroItem.$inferInsert> = []
      const movimentos: MovimentoNovo[] = []
      const pedidoRomaneio = new Map<string, number>()
      for (const [n, i] of d.itens.entries()) {
        const base = { empresaId: ctx.empresaId, remessaId: '', ordem: n + 1, tipo: i.tipo }
        if (i.tipo === 'uva') {
          const [v] = await ctx.tx
            .select({ id: s.variedade.id })
            .from(s.variedade)
            .where(
              and(
                eq(s.variedade.id, i.variedadeId),
                or(isNull(s.variedade.empresaId), eq(s.variedade.empresaId, ctx.empresaId)),
              ),
            )
          if (!v) throw new ErroRegra('Variedade inválida.', 'variedade')
          if (i.origemUva === 'parcela') {
            if (!i.parcelaId) throw new ErroRegra('Escolha a parcela.', 'parcela')
            const [pa] = await ctx.tx
              .select({ dono: s.propriedade.donoId })
              .from(s.parcela)
              .innerJoin(s.propriedade, eq(s.propriedade.id, s.parcela.propriedadeId))
              .where(and(eq(s.parcela.id, i.parcelaId), eq(s.parcela.empresaId, ctx.empresaId)))
            if (!pa || pa.dono !== null)
              throw new ErroRegra('A parcela precisa ser do vinhedo próprio.', 'parcela')
          } else if (i.origemUva === 'romaneio') {
            if (!i.romaneioItemId) throw new ErroRegra('Escolha a uva do romaneio.', 'romaneio')
            const r = await saldoUvaDoItem(ctx, i.romaneioItemId)
            if (!r || r.estab !== estab || r.situacao !== 'confirmado')
              throw new ErroRegra('Uva de romaneio inválida.', 'romaneio')
            if (r.variedade !== i.variedadeId)
              throw new ErroRegra('A variedade não é a do item do romaneio.', 'variedade')
            const pedido = (pedidoRomaneio.get(i.romaneioItemId) ?? 0) + Number(i.kg)
            pedidoRomaneio.set(i.romaneioItemId, pedido)
            if (pedido > Number(r.saldo) + 0.05)
              throw new ErroRegra(
                `O item do romaneio tem ${kgBr(Number(r.saldo))} kg sem destino.`,
                'kg',
              )
          } else {
            if (!i.fornecedorId) throw new ErroRegra('Escolha o fornecedor.', 'fornecedor')
            const [pe] = await ctx.tx
              .select({ id: s.pessoa.id })
              .from(s.pessoa)
              .where(and(eq(s.pessoa.id, i.fornecedorId), eq(s.pessoa.empresaId, ctx.empresaId)))
            if (!pe) throw new ErroRegra('Fornecedor inválido.', 'fornecedor')
          }
          itens.push({
            ...base,
            variedadeId: i.variedadeId,
            safra: i.safra ?? null,
            kg: i.kg,
            origemUva: i.origemUva,
            parcelaId: i.origemUva === 'parcela' ? i.parcelaId : null,
            romaneioItemId: i.origemUva === 'romaneio' ? i.romaneioItemId : null,
            fornecedorId: i.origemUva === 'fornecedor' ? i.fornecedorId : null,
          })
        } else if (i.tipo === 'granel') {
          const [o] = (
            await ctx.tx.execute<{
              tipo: string
              situacao: string
              estab: string
              granel: string | null
              litros: string
              projetos: string[]
              usada: boolean
            }>(sql`
              select o.tipo, o.situacao, o.estabelecimento_id as estab, g.tipo as granel,
                coalesce(-(select sum(m.litros) from movimento_volume m where m.operacao_id = o.id), 0)::text as litros,
                coalesce((select array_agg(distinct l.projeto_id) from movimento_volume m join lote l on l.id = m.lote_id where m.operacao_id = o.id), '{}') as projetos,
                exists (select 1 from remessa_terceiro_item x join remessa_terceiro r on r.id = x.remessa_id
                  where x.operacao_id = o.id and r.situacao = 'lancada') as usada
              from operacao o left join operacao_granel g on g.operacao_id = o.id
              where o.id = ${i.operacaoId} and o.empresa_id = ${ctx.empresaId}`)
          ).rows
          if (!o || o.estab !== estab || o.tipo !== 'saida_granel' || o.situacao !== 'confirmada')
            throw new ErroRegra('Escolha uma saída de granel confirmada.', 'operacao')
          if (o.granel !== 'remessa_terceiro')
            throw new ErroRegra(
              'A saída de granel precisa ser do tipo "remessa a terceiro".',
              'operacao',
            )
          if (o.usada)
            throw new ErroRegra('Esta saída de granel já está em outra remessa.', 'operacao')
          if (o.projetos.some((p) => p !== projeto.id))
            throw new ErroRegra('A saída de granel é de outro projeto.', 'operacao')
          itens.push({ ...base, operacaoId: i.operacaoId, litros: o.litros })
        } else {
          await conferirLocalExterno(ctx, i.localDestinoId, estab)
          const doc = d.nfNumero ?? null
          movimentos.push(
            {
              localId: i.localOrigemId,
              itemId: i.itemId,
              loteItemId: i.loteItemId,
              quantidade: deMil(-paraMil(i.quantidade)),
              tipo: 'transferencia',
              documento: doc,
            },
            {
              localId: i.localDestinoId,
              itemId: i.itemId,
              loteItemId: i.loteItemId,
              quantidade: deMil(paraMil(i.quantidade)),
              tipo: 'transferencia',
              documento: doc,
            },
          )
          itens.push({
            ...base,
            itemId: i.itemId,
            loteItemId: i.loteItemId,
            quantidade: deMil(paraMil(i.quantidade)),
            localDestinoId: i.localDestinoId,
          })
        }
      }
      const estoque = movimentos.length
        ? await lancarEstoque(ctx, { estabelecimentoId: estab, executadoEm, movimentos })
        : null
      const [r] = await ctx.tx
        .insert(s.remessaTerceiro)
        .values({
          empresaId: ctx.empresaId,
          estabelecimentoId: estab,
          projetoId: projeto.id,
          cantinaId: d.cantinaId,
          contratoId: d.contratoId,
          executadoEm,
          nfNumero: d.nfNumero,
          nfChave: d.nfChave,
          grupoEstoqueId: estoque?.grupoId ?? null,
          observacao: d.observacao,
          criadoPor: ctx.usuarioId,
        })
        .returning({ id: s.remessaTerceiro.id })
      await ctx.tx
        .insert(s.remessaTerceiroItem)
        .values(itens.map((x) => ({ ...x, remessaId: r!.id })))
      await ctx.auditar({
        acao: 'criar',
        entidade: 'remessa_terceiro',
        registroId: r!.id,
        dados: { projetoId: projeto.id, cantinaId: d.cantinaId, itens: itens.length },
      })
      return { id: r!.id, avisos: estoque?.avisos ?? [] }
    }),
  )

  const carregarRemessa = async (ctx: ContextoEmpresa, id: string) => {
    const [r] = await ctx.tx
      .select()
      .from(s.remessaTerceiro)
      .where(and(eq(s.remessaTerceiro.id, id), eq(s.remessaTerceiro.empresaId, ctx.empresaId)))
    if (!r || !(await ctx.estabelecimentosPermitidos()).includes(r.estabelecimentoId))
      throw new ErroNaoEncontrado('Remessa não encontrada.')
    return r
  }

  /** Desfaz os movimentos de estoque de um grupo, com a data original (P13). */
  const estornarGrupo = async (
    ctx: ContextoEmpresa,
    estab: string,
    grupoId: string | null,
    motivo: string,
  ) => {
    if (!grupoId) return
    const movs = await ctx.tx
      .select()
      .from(s.movimentoEstoque)
      .where(eq(s.movimentoEstoque.grupoId, grupoId))
    if (!movs.length) return
    await lancarEstoque(ctx, {
      estabelecimentoId: estab,
      executadoEm: movs[0]!.executadoEm,
      movimentos: movs.map((m) => ({
        localId: m.localId,
        itemId: m.itemId,
        loteItemId: m.loteItemId,
        quantidade: deMil(-paraMil(m.quantidade)),
        tipo: 'estorno' as const,
        motivo,
        documento: m.documento,
        estornoDeId: m.id,
      })),
    })
  }

  app.post<{ Params: { id: string } }>('/api/terceiros/remessas/:id/estorno', async (req) =>
    naEmpresa(db, req, [F, 'estornar'], async (ctx) => {
      const r = await carregarRemessa(ctx, z.uuid().parse(req.params.id))
      const { motivo } = z.object({ motivo: z.string().trim().min(3).max(500) }).parse(req.body)
      if (r.situacao !== 'lancada') throw new ErroRegra('A remessa já foi estornada.', 'situacao')
      const [ret] = await ctx.tx
        .select({ id: s.retornoTerceiro.id })
        .from(s.retornoTerceiro)
        .where(
          and(eq(s.retornoTerceiro.remessaId, r.id), eq(s.retornoTerceiro.situacao, 'lancada')),
        )
        .limit(1)
      if (ret)
        throw new ErroRegra('A remessa tem retorno lançado: estorne o retorno antes.', 'retorno')
      await estornarGrupo(ctx, r.estabelecimentoId, r.grupoEstoqueId, motivo)
      await ctx.tx
        .update(s.remessaTerceiro)
        .set({ situacao: 'estornada', motivoEstorno: motivo })
        .where(eq(s.remessaTerceiro.id, r.id))
      await ctx.auditar({
        acao: 'estornar',
        entidade: 'remessa_terceiro',
        registroId: r.id,
        motivo,
      })
      return { ok: true }
    }),
  )

  app.post<{ Params: { id: string } }>('/api/terceiros/remessas/:id/concluir', async (req) =>
    naEmpresa(db, req, [F, 'confirmar'], async (ctx) => {
      const r = await carregarRemessa(ctx, z.uuid().parse(req.params.id))
      const { concluida } = z.object({ concluida: z.boolean() }).parse(req.body)
      await ctx.tx
        .update(s.remessaTerceiro)
        .set({ concluidaEm: concluida ? sql`now()` : null })
        .where(eq(s.remessaTerceiro.id, r.id))
      await ctx.auditar({
        acao: 'editar',
        entidade: 'remessa_terceiro',
        registroId: r.id,
        dados: { concluida },
      })
      return { ok: true }
    }),
  )

  /** Resumo das remessas: o enviado, o que voltou, as perdas informadas e o rendimento. */
  const resumos = async (ctx: ContextoEmpresa, filtro: ReturnType<typeof sql>) => {
    const estabs = await ctx.estabelecimentosPermitidos()
    if (!estabs.length) return []
    const r = await ctx.tx.execute<Record<string, unknown>>(sql`
      select r.id, r.executado_em as "executadoEm", r.nf_numero as "nfNumero", r.situacao,
        r.concluida_em as "concluidaEm", r.projeto_id as "projetoId",
        (select p.codigo || ' · ' || p.nome from projeto p where p.id = r.projeto_id) as projeto,
        r.cantina_id as "cantinaId",
        (select f.nome from pessoa pe join ficha f on f.id = pe.ficha_id where pe.id = r.cantina_id) as cantina,
        coalesce((select sum(x.kg) from remessa_terceiro_item x where x.remessa_id = r.id and x.tipo = 'uva'), 0)::text as "kgUva",
        coalesce((select sum(x.litros) from remessa_terceiro_item x where x.remessa_id = r.id and x.tipo = 'granel'), 0)::text as "litrosGranel",
        coalesce((select sum(y.litros) from retorno_terceiro t join retorno_terceiro_item y on y.retorno_id = t.id
          where t.remessa_id = r.id and t.situacao = 'lancada' and y.tipo in ('granel', 'engarrafado')), 0)::text as "litrosRetornados",
        coalesce((select sum(t.perdas_informadas) from retorno_terceiro t where t.remessa_id = r.id and t.situacao = 'lancada'), 0)::text as "perdasInformadas",
        (select count(*)::int from retorno_terceiro t where t.remessa_id = r.id and t.situacao = 'lancada') as "numeroRetornos"
      from remessa_terceiro r
      where r.empresa_id = ${ctx.empresaId} and r.estabelecimento_id in ${sql.raw(`(${estabs.map((x) => `'${x}'`).join(',')})`)}
        ${filtro}
      order by r.executado_em desc`)
    return r.rows.map((x) => {
      const kg = Number(x.kgUva)
      const ret = Number(x.litrosRetornados)
      return {
        ...x,
        rendimento: kg > 0 && ret > 0 ? (ret / kg).toFixed(3) : null,
        andamento:
          x.situacao === 'estornada'
            ? 'estornada'
            : x.concluidaEm
              ? 'concluida'
              : Number(x.numeroRetornos) > 0
                ? 'retorno_parcial'
                : 'aguardando',
      }
    })
  }

  app.get('/api/terceiros/remessas', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const q = z.object({ projetoId: z.uuid().optional() }).parse(req.query)
      return resumos(ctx, q.projetoId ? sql`and r.projeto_id = ${q.projetoId}` : sql``)
    }),
  )

  app.get<{ Params: { id: string } }>('/api/terceiros/remessas/:id', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const r = await carregarRemessa(ctx, z.uuid().parse(req.params.id))
      const [resumo] = await resumos(ctx, sql`and r.id = ${r.id}`)
      const itens = await ctx.tx.execute<Record<string, unknown>>(sql`
        select x.tipo, x.kg::text as kg, x.safra, x.origem_uva as "origemUva", x.litros::text as litros,
          x.quantidade::text as quantidade, x.operacao_id as "operacaoId",
          v.nome as variedade, v.codigo_oficial as "codigoOficial",
          (select pr.nome || ' › ' || pa.nome from parcela pa join propriedade pr on pr.id = pa.propriedade_id where pa.id = x.parcela_id) as parcela,
          (select ro.codigo from romaneio_item ri join romaneio ro on ro.id = ri.romaneio_id where ri.id = x.romaneio_item_id) as romaneio,
          (select f.nome from pessoa pe join ficha f on f.id = pe.ficha_id where pe.id = x.fornecedor_id) as fornecedor,
          (select o.codigo from operacao o where o.id = x.operacao_id) as operacao,
          i.nome as item, i.unidade_base as unidade, li.codigo as lote, lo.nome as local,
          (select coalesce(sum(m.quantidade), 0)::text from movimento_estoque m where m.local_id = x.local_destino_id and m.item_id = x.item_id) as "emPoder"
        from remessa_terceiro_item x left join variedade v on v.id = x.variedade_id
          left join item_estoque i on i.id = x.item_id left join lote_item li on li.id = x.lote_item_id
          left join local lo on lo.id = x.local_destino_id
        where x.remessa_id = ${r.id} order by x.ordem`)
      const retornos = await ctx.tx.execute<Record<string, unknown>>(sql`
        select t.id, t.executado_em as "executadoEm", t.nf_numero as "nfNumero", t.glt,
          t.perdas_informadas::text as "perdasInformadas", t.situacao, t.motivo_estorno as "motivoEstorno",
          coalesce((select json_agg(json_build_object('tipo', y.tipo, 'litros', y.litros, 'garrafas', y.garrafas,
            'quantidade', y.quantidade, 'operacaoId', y.operacao_id,
            'operacao', (select o.codigo from operacao o where o.id = y.operacao_id),
            'lote', (select lc.codigo from lote_comercial lc where lc.id = y.lote_comercial_id),
            'produto', (select p.nome || ' ' || f.volume_ml || ' mL' from produto_formato f join produto p on p.id = f.produto_id where f.id = y.formato_id),
            'item', (select i.nome from item_estoque i where i.id = y.item_id)) order by y.ordem)
            from retorno_terceiro_item y where y.retorno_id = t.id), '[]') as itens
        from retorno_terceiro t where t.remessa_id = ${r.id} order by t.executado_em`)
      return {
        ...resumo,
        observacao: r.observacao,
        nfChave: r.nfChave,
        contratoId: r.contratoId,
        motivoEstorno: r.motivoEstorno,
        itens: itens.rows,
        retornos: retornos.rows,
      }
    }),
  )

  /** Composição sugerida para o vinho que volta: as variedades da uva remetida, pelos kg. */
  app.get<{ Params: { id: string } }>('/api/terceiros/remessas/:id/composicao', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const r = await carregarRemessa(ctx, z.uuid().parse(req.params.id))
      return composicaoDaRemessa(ctx, r.id)
    }),
  )

  // Saídas de granel "remessa a terceiro" do projeto ainda sem remessa, para ligar.
  app.get('/api/terceiros/granel-para-remessa', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const { projetoId } = z.object({ projetoId: z.uuid() }).parse(req.query)
      const r = await ctx.tx.execute<{
        id: string
        codigo: string
        executadoEm: string
        litros: string
      }>(sql`
        select o.id, o.codigo, o.executado_em as "executadoEm",
          (-(select sum(m.litros) from movimento_volume m where m.operacao_id = o.id))::text as litros
        from operacao o join operacao_granel g on g.operacao_id = o.id
        where o.estabelecimento_id = ${estab} and o.tipo = 'saida_granel' and o.situacao = 'confirmada'
          and g.tipo = 'remessa_terceiro'
          and exists (select 1 from movimento_volume m join lote l on l.id = m.lote_id where m.operacao_id = o.id and l.projeto_id = ${projetoId})
          and not exists (select 1 from remessa_terceiro_item x join remessa_terceiro rt on rt.id = x.remessa_id
            where x.operacao_id = o.id and rt.situacao = 'lancada')
        order by o.executado_em desc`)
      return r.rows
    }),
  )

  // Retornos -------------------------------------------------------------------------------------

  app.post('/api/terceiros/retornos', async (req) =>
    naEmpresa(db, req, [F, 'confirmar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const d = esquemaRetorno.parse(req.body)
      const executadoEm = dataExecucao(d.executadoEm)
      await exigirMesAberto(ctx.tx, estab, executadoEm)
      const projeto = await carregarProjeto(ctx, d.projetoId, estab)
      await conferirCantina(ctx, d.cantinaId)
      if (d.remessaId) {
        const r = await carregarRemessa(ctx, d.remessaId)
        if (r.situacao !== 'lancada') throw new ErroRegra('A remessa foi estornada.', 'remessa')
        if (r.projetoId !== projeto.id || r.cantinaId !== d.cantinaId)
          throw new ErroRegra('A remessa é de outro projeto ou de outra cantina.', 'remessa')
      }
      const sugerida = d.remessaId ? await composicaoDaRemessa(ctx, d.remessaId) : []

      const itens: Array<typeof s.retornoTerceiroItem.$inferInsert> = []
      const movimentos: MovimentoNovo[] = []
      for (const [n, i] of d.itens.entries()) {
        const base = { empresaId: ctx.empresaId, retornoId: '', ordem: n + 1, tipo: i.tipo }
        if (i.tipo === 'granel') {
          // Entrada de granel "retorno de terceiro" (o motor confere e grava, motor.ts).
          const m = await planoEntradaGranel(ctx, {
            executadoEm: executadoEm.toISOString(),
            tipoGranel: 'retorno_terceiro',
            projetoId: projeto.id,
            remetenteId: d.cantinaId,
            notaNumero: d.nfNumero,
            notaChave: d.nfChave,
            glt: d.glt,
            observacao: d.observacao,
            composicao: i.composicao.length ? i.composicao : sugerida,
            destinos: [{ recipienteId: i.recipienteId, litros: i.litros, lote: i.lote }],
            cientes: d.cientes,
          })
          const op = await confirmar(ctx, m.plano, d.cientes)
          itens.push({ ...base, operacaoId: op.operacaoId, litros: i.litros })
        } else if (i.tipo === 'engarrafado') {
          const [f] = await ctx.tx
            .select({
              id: s.produtoFormato.id,
              produtoId: s.produtoFormato.produtoId,
              itemId: s.produtoFormato.itemEstoqueId,
              volumeMl: s.produtoFormato.volumeMl,
              titularId: s.produto.titularId,
            })
            .from(s.produtoFormato)
            .innerJoin(s.produto, eq(s.produto.id, s.produtoFormato.produtoId))
            .where(
              and(
                eq(s.produtoFormato.id, i.formatoId),
                eq(s.produtoFormato.empresaId, ctx.empresaId),
              ),
            )
          if (!f) throw new ErroRegra('Formato inválido.', 'formato')
          if (f.titularId)
            throw new ErroRegra(
              'O produto é de um cliente de vinificação, não da empresa.',
              'produto',
            )
          const litros = ((i.garrafas * f.volumeMl) / 1000).toFixed(2)
          // O mesmo lote comercial pode voltar em retornos parciais.
          const [existente] = await ctx.tx
            .select()
            .from(s.loteComercial)
            .where(
              and(
                eq(s.loteComercial.estabelecimentoId, estab),
                eq(s.loteComercial.codigo, i.loteComercial),
              ),
            )
          let loteComercialId: string
          if (existente) {
            if (existente.origem !== 'retorno_terceiro' || existente.produtoId !== f.produtoId)
              throw new ErroRegra(
                `O lote ${i.loteComercial} já existe para outro produto ou origem.`,
                'loteComercial',
              )
            loteComercialId = existente.id
            await ctx.tx
              .update(s.loteComercial)
              .set({ litros: sql`${s.loteComercial.litros} + ${litros}::numeric` })
              .where(eq(s.loteComercial.id, existente.id))
          } else {
            const [lc] = await ctx.tx
              .insert(s.loteComercial)
              .values({
                empresaId: ctx.empresaId,
                estabelecimentoId: estab,
                codigo: i.loteComercial,
                projetoId: projeto.id,
                produtoId: f.produtoId,
                litros,
                origem: 'retorno_terceiro',
                criadoPor: ctx.usuarioId,
              })
              .returning({ id: s.loteComercial.id })
            loteComercialId = lc!.id
          }
          movimentos.push({
            localId: i.localId,
            itemId: f.itemId,
            loteItemId: await obterLote(
              ctx,
              estab,
              f.itemId,
              { codigo: i.loteComercial },
              'retorno_terceiro',
            ),
            quantidade: String(i.garrafas),
            tipo: 'entrada',
            documento: d.nfNumero,
          })
          itens.push({
            ...base,
            produtoId: f.produtoId,
            formatoId: f.id,
            garrafas: i.garrafas,
            loteComercialId,
            litros,
          })
        } else {
          await conferirLocalExterno(ctx, i.localId, estab)
          movimentos.push({
            localId: i.localId,
            itemId: i.itemId,
            loteItemId: i.loteItemId,
            quantidade: deMil(-paraMil(i.quantidade)),
            tipo: 'consumo_envase',
            documento: d.nfNumero,
          })
          itens.push({
            ...base,
            itemId: i.itemId,
            loteItemId: i.loteItemId,
            quantidade: deMil(paraMil(i.quantidade)),
            localId: i.localId,
          })
        }
      }
      const estoque = movimentos.length
        ? await lancarEstoque(ctx, { estabelecimentoId: estab, executadoEm, movimentos })
        : null
      const [r] = await ctx.tx
        .insert(s.retornoTerceiro)
        .values({
          empresaId: ctx.empresaId,
          estabelecimentoId: estab,
          projetoId: projeto.id,
          cantinaId: d.cantinaId,
          remessaId: d.remessaId,
          executadoEm,
          nfNumero: d.nfNumero,
          nfChave: d.nfChave,
          glt: d.glt,
          perdasInformadas: d.perdasInformadas,
          grupoEstoqueId: estoque?.grupoId ?? null,
          observacao: d.observacao,
          criadoPor: ctx.usuarioId,
        })
        .returning({ id: s.retornoTerceiro.id })
      await ctx.tx
        .insert(s.retornoTerceiroItem)
        .values(itens.map((x) => ({ ...x, retornoId: r!.id })))
      await ctx.auditar({
        acao: 'criar',
        entidade: 'retorno_terceiro',
        registroId: r!.id,
        dados: { projetoId: projeto.id, remessaId: d.remessaId, itens: itens.length },
      })
      return { id: r!.id, avisos: estoque?.avisos ?? [] }
    }),
  )

  app.get('/api/terceiros/retornos', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const q = z.object({ projetoId: z.uuid().optional() }).parse(req.query)
      const r = await ctx.tx.execute<Record<string, unknown>>(sql`
        select t.id, t.executado_em as "executadoEm", t.nf_numero as "nfNumero", t.situacao, t.remessa_id as "remessaId",
          (select p.codigo || ' · ' || p.nome from projeto p where p.id = t.projeto_id) as projeto,
          (select f.nome from pessoa pe join ficha f on f.id = pe.ficha_id where pe.id = t.cantina_id) as cantina,
          coalesce((select sum(y.litros) from retorno_terceiro_item y where y.retorno_id = t.id and y.tipo in ('granel', 'engarrafado')), 0)::text as litros
        from retorno_terceiro t where t.estabelecimento_id = ${estab}
          ${q.projetoId ? sql`and t.projeto_id = ${q.projetoId}` : sql``}
        order by t.executado_em desc`)
      return r.rows
    }),
  )

  app.post<{ Params: { id: string } }>('/api/terceiros/retornos/:id/estorno', async (req) =>
    naEmpresa(db, req, [F, 'estornar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const { motivo } = z.object({ motivo: z.string().trim().min(3).max(500) }).parse(req.body)
      const [t] = await ctx.tx
        .select()
        .from(s.retornoTerceiro)
        .where(and(eq(s.retornoTerceiro.id, id), eq(s.retornoTerceiro.empresaId, ctx.empresaId)))
      if (!t || !(await ctx.estabelecimentosPermitidos()).includes(t.estabelecimentoId))
        throw new ErroNaoEncontrado('Retorno não encontrado.')
      if (t.situacao !== 'lancada') throw new ErroRegra('O retorno já foi estornado.', 'situacao')
      const itens = await ctx.tx
        .select()
        .from(s.retornoTerceiroItem)
        .where(eq(s.retornoTerceiroItem.retornoId, t.id))
        .orderBy(asc(s.retornoTerceiroItem.ordem))
      for (const i of itens.filter((x) => x.operacaoId))
        await estornarOperacao(ctx, i.operacaoId!, motivo)
      await estornarGrupo(ctx, t.estabelecimentoId, t.grupoEstoqueId, motivo)
      for (const i of itens.filter((x) => x.loteComercialId && x.litros))
        await ctx.tx
          .update(s.loteComercial)
          .set({ litros: sql`greatest(${s.loteComercial.litros} - ${i.litros}::numeric, 0)` })
          .where(eq(s.loteComercial.id, i.loteComercialId!))
      await ctx.tx
        .update(s.retornoTerceiro)
        .set({ situacao: 'estornada', motivoEstorno: motivo })
        .where(eq(s.retornoTerceiro.id, t.id))
      await ctx.auditar({
        acao: 'estornar',
        entidade: 'retorno_terceiro',
        registroId: t.id,
        motivo,
      })
      return { ok: true }
    }),
  )
}

/** Variedades e % da uva remetida (pelos kg), para a composição do vinho que volta. */
export async function composicaoDaRemessa(ctx: ContextoEmpresa, remessaId: string) {
  const r = await ctx.tx.execute<{ variedade_id: string; safra: number | null; kg: string }>(sql`
    select variedade_id, safra, sum(kg)::text as kg from remessa_terceiro_item
    where remessa_id = ${remessaId} and tipo = 'uva' group by variedade_id, safra order by sum(kg) desc`)
  const total = r.rows.reduce((t, x) => t + Number(x.kg), 0)
  if (!total) return []
  const linhas = r.rows.map((x) => ({
    variedadeId: x.variedade_id,
    safra: x.safra,
    percentual: Math.round((Number(x.kg) / total) * 10000) / 100,
  }))
  // Fecha 100% na maior parcela.
  const soma = linhas.reduce((t, x) => t + x.percentual, 0)
  linhas[0]!.percentual = Math.round((linhas[0]!.percentual + 100 - soma) * 100) / 100
  return linhas.map((x) => ({ ...x, percentual: x.percentual.toFixed(2) }))
}
