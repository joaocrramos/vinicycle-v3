// EnoTrace › Recepção da uva (cantina.md, Recepção): romaneio com itens por variedade e várias
// pesagens. Fica em rascunho enquanto a uva é pesada; na confirmação ganha o código ROM-AAAA-NNNN
// (P19) e não se edita mais (P13). Produtor sem cadastro ou irregular no SIVIBE gera alerta com
// "ciente" (P29; Decreto 12.709/2025, art. 203, V).
import {
  confirmacao,
  estornoOperacao,
  consultaListagem,
  dadosRomaneio,
  NOMES_SITUACAO_SIVIBE,
  safraDaColheita,
} from '@vinicycle/shared'
import { and, asc, count, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../../db/schema'
import { conferirVersao } from '../../nucleo/entidades'
import { ErroNaoEncontrado, ErroRegra } from '../../nucleo/erros'
import { buscaTexto, listar } from '../../nucleo/listagem'
import { lerNfe, quilosDoItem } from '../../nucleo/nfe'
import { anoNoFuso, proximoCodigo } from '../../nucleo/numeracao'
import { exigirMesAberto } from '../../nucleo/periodo'
import {
  type Aviso,
  exigirCientes,
  fonteDaRegra,
  gravarOcorrencias,
  regraVigente,
} from '../../nucleo/regras'
import { type ContextoEmpresa, naEmpresa } from '../../nucleo/requisicao'
import { avisoContrato } from '../contratos'
import { avisoDestinatario, emitenteDaNota, gravarNota, memorizarAssociacao } from '../notas'

const F = 'enotrace.recepcao'

const nomePessoa = (coluna: string) =>
  sql<
    string | null
  >`(select f.nome from pessoa p join ficha f on f.id = p.ficha_id where p.id = ${sql.raw(coluna)})`

/** Peso líquido, consumido e saldo a processar do item (cantina.md, Uva a processar). */
const liquidoItem = sql<string>`coalesce((select sum(p.bruto_kg - p.tara_kg) from pesagem p where p.item_id = romaneio_item.id), 0)`
// Processado pela cantina ou remetido a outra cantina (produção em terceiro, ciclo 10).
const consumidoItem = sql<string>`(coalesce((select -sum(m.kg) from movimento_uva m where m.item_id = romaneio_item.id), 0) + coalesce((select sum(x.kg) from remessa_terceiro_item x join remessa_terceiro rt on rt.id = x.remessa_id where x.romaneio_item_id = romaneio_item.id and rt.situacao = 'lancada'), 0))`

async function carregar(ctx: ContextoEmpresa, id: string, travar = false) {
  const consulta = ctx.tx
    .select()
    .from(s.romaneio)
    .where(and(eq(s.romaneio.id, id), eq(s.romaneio.empresaId, ctx.empresaId)))
  const [r] = travar ? await consulta.for('update') : await consulta
  if (!r || !(await ctx.estabelecimentosPermitidos()).includes(r.estabelecimentoId))
    throw new ErroNaoEncontrado('Romaneio não encontrado.')
  return r
}

/** As chaves estrangeiras não passam pela RLS: confere cada referência na empresa (1.2). */
async function conferir(
  ctx: ContextoEmpresa,
  estabelecimentoId: string,
  d: z.output<typeof dadosRomaneio>,
) {
  const [p] = await ctx.tx
    .select({ estab: s.projeto.estabelecimentoId, situacao: s.projeto.situacao })
    .from(s.projeto)
    .where(and(eq(s.projeto.id, d.projetoId), eq(s.projeto.empresaId, ctx.empresaId)))
  if (!p || p.estab !== estabelecimentoId)
    throw new ErroRegra('O projeto precisa ser deste estabelecimento.', 'projeto')
  if (['encerrado', 'cancelado', 'engarrafado'].includes(p.situacao))
    throw new ErroRegra('O projeto não está aberto para receber uva.', 'projeto')
  const pessoas = [d.fornecedorId, d.donoUvaId, d.transportadorId].filter(Boolean) as string[]
  if (pessoas.length) {
    const ok = await ctx.tx
      .select({ id: s.pessoa.id })
      .from(s.pessoa)
      .where(and(inArray(s.pessoa.id, pessoas), eq(s.pessoa.empresaId, ctx.empresaId)))
    if (ok.length !== new Set(pessoas).size) throw new ErroRegra('Pessoa inválida.', 'pessoa')
  }
  if (d.contratoId && d.donoUvaId) {
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
    if (!c || c.sentido !== 'prestamos' || c.contraparte !== d.donoUvaId)
      throw new ErroRegra('O contrato escolhido não é com o dono da uva.', 'contratoId')
  }
  const variedades = [...new Set(d.itens.map((i) => i.variedadeId))]
  const vs = await ctx.tx
    .select({ id: s.variedade.id })
    .from(s.variedade)
    .where(
      and(
        inArray(s.variedade.id, variedades),
        or(isNull(s.variedade.empresaId), eq(s.variedade.empresaId, ctx.empresaId)),
      ),
    )
  if (vs.length !== variedades.length) throw new ErroRegra('Variedade inválida.', 'variedade')
  // Nota importada: do mesmo estabelecimento, e os itens ligados são linhas dela.
  if (d.nfeId) {
    const [n] = await ctx.tx
      .select({ estab: s.nfe.estabelecimentoId, situacao: s.nfe.situacao })
      .from(s.nfe)
      .where(and(eq(s.nfe.id, d.nfeId), eq(s.nfe.empresaId, ctx.empresaId)))
    if (!n || n.estab !== estabelecimentoId) throw new ErroRegra('Nota inválida.', 'nfe')
    if (n.situacao !== 'em_conferencia') throw new ErroRegra('Esta nota já foi lançada.', 'nfe')
  }
  const ligados = d.itens.flatMap((i) => (i.nfeItemId ? [i.nfeItemId] : []))
  if (ligados.length) {
    const ok = d.nfeId
      ? await ctx.tx
          .select({ id: s.nfeItem.id })
          .from(s.nfeItem)
          .where(and(inArray(s.nfeItem.id, ligados), eq(s.nfeItem.nfeId, d.nfeId)))
      : []
    if (ok.length !== new Set(ligados).size)
      throw new ErroRegra('Item da nota inválido.', 'nfe_item')
  }
  // A parcela é do dono da uva: a própria empresa (vinhedo próprio) ou o fornecedor.
  const parcelas = [...new Set(d.itens.flatMap((i) => (i.parcelaId ? [i.parcelaId] : [])))]
  if (parcelas.length) {
    const ps = await ctx.tx
      .select({ id: s.parcela.id, dono: s.propriedade.donoId })
      .from(s.parcela)
      .innerJoin(s.propriedade, eq(s.propriedade.id, s.parcela.propriedadeId))
      .where(and(inArray(s.parcela.id, parcelas), eq(s.parcela.empresaId, ctx.empresaId)))
    const donoEsperado = d.origem === 'vinhedo_proprio' ? null : (d.fornecedorId ?? null)
    if (ps.length !== parcelas.length || ps.some((x) => x.dono !== donoEsperado))
      throw new ErroRegra('A parcela precisa ser do vinhedo de origem da uva.', 'parcela')
  }
}

const cabecalho = (d: z.output<typeof dadosRomaneio>) => ({
  chegadaEm: new Date(d.chegadaEm),
  projetoId: d.projetoId,
  origem: d.origem,
  fornecedorId: d.origem === 'fornecedor' ? (d.fornecedorId ?? null) : null,
  donoUvaId: d.donoUvaId ?? null,
  contratoId: d.donoUvaId ? (d.contratoId ?? null) : null,
  nfeId: d.nfeId ?? null,
  nfNumero: d.nfNumero ?? null,
  nfSerie: d.nfSerie ?? null,
  nfEmissao: d.nfEmissao ?? null,
  nfChave: d.nfChave ?? null,
  transportadorId: d.transportadorId ?? null,
  placa: d.placa ?? null,
  caixas: d.caixas ?? null,
  observacoes: d.observacoes ?? null,
})

/** No rascunho, os itens e as pesagens são regravados: nada aponta para eles ainda. */
async function gravarItens(
  ctx: ContextoEmpresa,
  romaneioId: string,
  d: z.output<typeof dadosRomaneio>,
) {
  await ctx.tx.delete(s.romaneioItem).where(eq(s.romaneioItem.romaneioId, romaneioId))
  for (const [n, i] of d.itens.entries()) {
    const [item] = await ctx.tx
      .insert(s.romaneioItem)
      .values({
        empresaId: ctx.empresaId,
        romaneioId,
        ordem: n + 1,
        nfeItemId: i.nfeItemId ?? null,
        variedadeId: i.variedadeId,
        parcelaId: i.parcelaId ?? null,
        dataColheita: i.dataColheita,
        safra: safraDaColheita(i.dataColheita),
        ciclo: i.ciclo ?? null,
        brix: i.brix ?? null,
        ph: i.ph ?? null,
        acidezTotal: i.acidezTotal ?? null,
        sanidade: i.sanidade ?? null,
        temperatura: i.temperatura ?? null,
        organica: i.organica,
        candidataIp: i.candidataIp,
        dataPoda: i.dataPoda ?? null,
        observacoes: i.observacoes ?? null,
      })
      .returning({ id: s.romaneioItem.id })
    if (i.pesagens.length) {
      await ctx.tx.insert(s.pesagem).values(
        i.pesagens.map((p) => ({
          empresaId: ctx.empresaId,
          itemId: item!.id,
          pesadoEm: new Date(p.pesadoEm),
          brutoKg: p.brutoKg,
          taraKg: p.taraKg,
        })),
      )
    }
  }
}

/** O que falta para confirmar (bloqueia) e os avisos que pedem "ciente". */
async function avaliar(ctx: ContextoEmpresa, r: typeof s.romaneio.$inferSelect) {
  const bloqueios: string[] = []
  const itens = await ctx.tx
    .select({
      ordem: s.romaneioItem.ordem,
      variedade: s.variedade.nome,
      brix: s.romaneioItem.brix,
      liquido: liquidoItem,
    })
    .from(s.romaneioItem)
    .innerJoin(s.variedade, eq(s.variedade.id, s.romaneioItem.variedadeId))
    .where(eq(s.romaneioItem.romaneioId, r.id))
    .orderBy(asc(s.romaneioItem.ordem))
  if (!itens.length) bloqueios.push('Inclua ao menos uma variedade.')
  for (const i of itens) {
    if (i.brix === null) bloqueios.push(`Informe o °Brix de ${i.variedade}.`)
    if (Number(i.liquido) <= 0) bloqueios.push(`Inclua a pesagem de ${i.variedade}.`)
  }

  // Produtor no SIVIBE: o fornecedor e o dono da uva (Decreto 12.709/2025, art. 203, V).
  const avisos: Aviso[] = []
  const [estab] = await ctx.tx
    .select({ fuso: s.estabelecimento.fuso })
    .from(s.estabelecimento)
    .where(eq(s.estabelecimento.id, r.estabelecimentoId))
  const data = new Intl.DateTimeFormat('en-CA', { timeZone: estab!.fuso }).format(r.chegadaEm)
  const regra = await regraVigente(ctx.tx, 'produtor_uva_sivibe', { data })
  const conferidos = [
    ...(r.fornecedorId ? [{ id: r.fornecedorId, papel: 'Fornecedor' }] : []),
    ...(r.donoUvaId && r.donoUvaId !== r.fornecedorId
      ? [{ id: r.donoUvaId, papel: 'Dono da uva' }]
      : []),
  ]
  if (regra) {
    for (const c of conferidos) {
      const [p] = await ctx.tx
        .select({
          nome: sql<string>`(select f.nome from ficha f where f.id = pessoa.ficha_id)`,
          numero: s.pessoaProdutorUva.numeroSivibe,
          situacao: s.pessoaProdutorUva.situacaoCadastro,
          declaracao: s.pessoaProdutorUva.declaracaoAnoAnterior,
        })
        .from(s.pessoa)
        .leftJoin(s.pessoaProdutorUva, eq(s.pessoaProdutorUva.pessoaId, s.pessoa.id))
        .where(eq(s.pessoa.id, c.id))
      const motivo = !p?.numero
        ? 'sem número no SIVIBE'
        : p.situacao === 'irregular'
          ? 'situação irregular no SIVIBE'
          : p.declaracao === false
            ? 'sem a declaração do ano anterior no SIVIBE'
            : p.situacao !== 'regular'
              ? `situação no SIVIBE ${NOMES_SITUACAO_SIVIBE[p.situacao ?? 'nao_verificado'].toLowerCase()}`
              : null
      if (motivo) {
        avisos.push({
          codigo: `sivibe:${c.id}`,
          mensagem: `${c.papel} ${p?.nome ?? ''}: ${motivo}.`,
          regraId: regra.id,
          fonte: fonteDaRegra(regra),
        })
      }
    }
  }
  // Vinificação para terceiro: o contrato de terceirização vigente (P29: sem ele, "ciente").
  const contrato = await avisoContrato(ctx, {
    titularId: r.donoUvaId,
    contratoId: r.contratoId,
    data,
  })
  if (contrato) avisos.push(contrato)
  return { bloqueios, avisos }
}

export async function rotasRecepcao(app: FastifyInstance): Promise<void> {
  const { db, armazenamento } = app.deps

  app.get('/api/romaneios', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const q = consultaListagem
        .extend({
          situacao: z
            .enum(['rascunho', 'confirmado', 'estornado', 'a_processar', 'todos'])
            .default('todos'),
          projeto: z.uuid().optional(),
        })
        .parse(req.query)
      const estabs = ctx.estabelecimentoId
        ? [ctx.estabelecimentoId]
        : await ctx.estabelecimentosPermitidos()
      if (!estabs.length) return { itens: [], total: 0, pagina: 1, tamanho: q.tamanho }
      const aProcessar = sql<string>`coalesce((select sum(coalesce((select sum(p.bruto_kg - p.tara_kg) from pesagem p where p.item_id = i.id), 0) + coalesce((select sum(m.kg) from movimento_uva m where m.item_id = i.id), 0)) from romaneio_item i where i.romaneio_id = romaneio.id), 0)`
      const filtro = and(
        eq(s.romaneio.empresaId, ctx.empresaId),
        inArray(s.romaneio.estabelecimentoId, estabs),
        q.situacao === 'todos'
          ? undefined
          : q.situacao === 'a_processar'
            ? and(eq(s.romaneio.situacao, 'confirmado'), sql`${aProcessar} > 0`)
            : eq(s.romaneio.situacao, q.situacao),
        q.projeto ? eq(s.romaneio.projetoId, q.projeto) : undefined,
        buscaTexto(q.busca, [
          s.romaneio.codigo,
          s.romaneio.nfNumero,
          nomePessoa('romaneio.fornecedor_id'),
        ]),
      )
      return listar({
        consulta: q,
        ordenaveis: { chegadaEm: s.romaneio.chegadaEm, codigo: s.romaneio.codigo },
        ordemPadrao: { campo: 'chegadaEm', direcao: 'desc' },
        contar: async () =>
          (await ctx.tx.select({ n: count() }).from(s.romaneio).where(filtro))[0]!.n,
        buscar: ({ ordem, limite, deslocamento }) =>
          ctx.tx
            .select({
              id: s.romaneio.id,
              codigo: s.romaneio.codigo,
              chegadaEm: s.romaneio.chegadaEm,
              situacao: s.romaneio.situacao,
              origem: s.romaneio.origem,
              projeto: sql<string>`(select p.codigo || ' · ' || p.nome from projeto p where p.id = romaneio.projeto_id)`,
              fornecedor: nomePessoa('romaneio.fornecedor_id'),
              variedades: sql<
                string[]
              >`coalesce((select array_agg(v.nome order by i.ordem) from romaneio_item i join variedade v on v.id = i.variedade_id where i.romaneio_id = romaneio.id), '{}')`,
              kg: sql<string>`coalesce((select sum(p.bruto_kg - p.tara_kg) from pesagem p join romaneio_item i on i.id = p.item_id where i.romaneio_id = romaneio.id), 0)`,
              aProcessar,
            })
            .from(s.romaneio)
            .where(filtro)
            .orderBy(...ordem)
            .limit(limite)
            .offset(deslocamento),
      })
    }),
  )

  app.get<{ Params: { id: string } }>('/api/romaneios/:id', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const r = await carregar(ctx, z.uuid().parse(req.params.id))
      const itens = await ctx.tx
        .select({
          id: s.romaneioItem.id,
          ordem: s.romaneioItem.ordem,
          nfeItemId: s.romaneioItem.nfeItemId,
          variedadeId: s.romaneioItem.variedadeId,
          variedade: s.variedade.nome,
          parcelaId: s.romaneioItem.parcelaId,
          parcela: sql<
            string | null
          >`(select x.nome from parcela x where x.id = romaneio_item.parcela_id)`,
          dataColheita: s.romaneioItem.dataColheita,
          safra: s.romaneioItem.safra,
          ciclo: s.romaneioItem.ciclo,
          brix: s.romaneioItem.brix,
          ph: s.romaneioItem.ph,
          acidezTotal: s.romaneioItem.acidezTotal,
          sanidade: s.romaneioItem.sanidade,
          temperatura: s.romaneioItem.temperatura,
          organica: s.romaneioItem.organica,
          candidataIp: s.romaneioItem.candidataIp,
          dataPoda: s.romaneioItem.dataPoda,
          observacoes: s.romaneioItem.observacoes,
          liquidoKg: liquidoItem,
          consumidoKg: consumidoItem,
        })
        .from(s.romaneioItem)
        .innerJoin(s.variedade, eq(s.variedade.id, s.romaneioItem.variedadeId))
        .where(eq(s.romaneioItem.romaneioId, r.id))
        .orderBy(asc(s.romaneioItem.ordem))
      const pesagens = itens.length
        ? await ctx.tx
            .select({
              itemId: s.pesagem.itemId,
              pesadoEm: s.pesagem.pesadoEm,
              brutoKg: s.pesagem.brutoKg,
              taraKg: s.pesagem.taraKg,
            })
            .from(s.pesagem)
            .where(
              inArray(
                s.pesagem.itemId,
                itens.map((i) => i.id),
              ),
            )
            .orderBy(asc(s.pesagem.pesadoEm))
        : []
      const [nomes] = await ctx.tx
        .select({
          projeto: sql<string>`(select p.codigo || ' · ' || p.nome from projeto p where p.id = romaneio.projeto_id)`,
          fornecedor: nomePessoa('romaneio.fornecedor_id'),
          donoUva: nomePessoa('romaneio.dono_uva_id'),
          transportador: nomePessoa('romaneio.transportador_id'),
          contrato: sql<
            string | null
          >`(select coalesce(c.numero, 'desde ' || to_char(c.vigencia_inicio, 'DD/MM/YYYY')) from contrato_terceirizacao c where c.id = romaneio.contrato_id)`,
        })
        .from(s.romaneio)
        .where(eq(s.romaneio.id, r.id))
      const { empresaId: _e, criadoPor: _c, atualizadoPor: _a, ...resto } = r
      return {
        ...resto,
        ...nomes,
        itens: itens.map((i) => ({
          ...i,
          saldoKg: (Number(i.liquidoKg) - Number(i.consumidoKg)).toFixed(1),
          pesagens: pesagens.filter((p) => p.itemId === i.id),
        })),
      }
    }),
  )

  app.post('/api/romaneios', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const estabelecimentoId = ctx.exigirEstabelecimento()
      const d = dadosRomaneio.parse(req.body)
      await conferir(ctx, estabelecimentoId, d)
      const [r] = await ctx.tx
        .insert(s.romaneio)
        .values({
          ...cabecalho(d),
          empresaId: ctx.empresaId,
          estabelecimentoId,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.romaneio.id })
      await gravarItens(ctx, r!.id, d)
      await ctx.auditar({ acao: 'criar', entidade: 'romaneio', registroId: r!.id, depois: d })
      return { id: r!.id }
    }),
  )

  app.put<{ Params: { id: string } }>('/api/romaneios/:id', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const d = dadosRomaneio.parse(req.body)
      const atual = await carregar(ctx, id, true)
      if (atual.situacao !== 'rascunho')
        throw new ErroRegra(
          'Romaneio confirmado não se edita: estorne e lance de novo.',
          'confirmado',
        )
      conferirVersao(atual.versao, d.versao)
      await conferir(ctx, atual.estabelecimentoId, d)
      await ctx.tx
        .update(s.romaneio)
        .set({
          ...cabecalho(d),
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.romaneio.versao} + 1`,
        })
        .where(eq(s.romaneio.id, id))
      await gravarItens(ctx, id, d)
      await ctx.auditar({ acao: 'editar', entidade: 'romaneio', registroId: id, depois: d })
      return { ok: true }
    }),
  )

  /** O rascunho pode ser descartado; o confirmado, só estornado (cantina.md, Regras comuns). */
  app.post<{ Params: { id: string } }>('/api/romaneios/:id/descartar', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const atual = await carregar(ctx, id, true)
      if (atual.situacao !== 'rascunho')
        throw new ErroRegra('Só o rascunho pode ser descartado.', 'confirmado')
      await ctx.tx.delete(s.romaneio).where(eq(s.romaneio.id, id))
      await ctx.auditar({ acao: 'descartar', entidade: 'romaneio', registroId: id })
      return { ok: true }
    }),
  )

  /**
   * Estorno do romaneio (P13): só sem uva processada; com uva processada, as operações que a
   * consumiram são estornadas antes. A nota volta à conferência, para o romaneio certo.
   */
  app.post<{ Params: { id: string } }>('/api/romaneios/:id/estorno', async (req) =>
    naEmpresa(db, req, [F, 'estornar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const { motivo } = estornoOperacao.parse(req.body)
      const r = await carregar(ctx, id, true)
      if (r.situacao !== 'confirmado')
        throw new ErroRegra(
          r.situacao === 'estornado'
            ? 'Este romaneio já foi estornado.'
            : 'O rascunho não se estorna: descarte-o.',
          'estorno',
        )
      await exigirMesAberto(ctx.tx, r.estabelecimentoId, r.chegadaEm)
      await ctx.tx
        .select({ id: s.romaneioItem.id })
        .from(s.romaneioItem)
        .where(eq(s.romaneioItem.romaneioId, id))
        .orderBy(asc(s.romaneioItem.id))
        .for('update')
      const consumo = await ctx.tx.execute<{ id: string; codigo: string }>(sql`
        select distinct o.id, o.codigo, o.lancado_em from movimento_uva m
          join romaneio_item i on i.id = m.item_id join operacao o on o.id = m.operacao_id
        where i.romaneio_id = ${id} and o.situacao = 'confirmada' and o.tipo <> 'estorno'
        order by o.lancado_em desc`)
      if (consumo.rows.length)
        throw new ErroRegra(
          `A uva deste romaneio já foi processada. Estorne antes: ${consumo.rows.map((o) => o.codigo).join(', ')}.`,
          'dependentes',
          { dependentes: consumo.rows.map(({ id: oid, codigo }) => ({ id: oid, codigo })) },
        )
      await ctx.tx
        .update(s.romaneio)
        .set({
          situacao: 'estornado',
          estornadoEm: sql`now()`,
          estornadoPor: ctx.usuarioId,
          motivoEstorno: motivo,
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.romaneio.versao} + 1`,
        })
        .where(eq(s.romaneio.id, id))
      if (r.nfeId) {
        await ctx.tx
          .update(s.nfe)
          .set({ situacao: 'em_conferencia', atualizadoEm: sql`now()` })
          .where(eq(s.nfe.id, r.nfeId))
      }
      await ctx.auditar({
        acao: 'estornar',
        entidade: 'romaneio',
        registroId: id,
        dados: { codigo: r.codigo, motivo },
      })
      return { ok: true }
    }),
  )

  app.get<{ Params: { id: string } }>('/api/romaneios/:id/previa', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const r = await carregar(ctx, z.uuid().parse(req.params.id))
      return avaliar(ctx, r)
    }),
  )

  app.post<{ Params: { id: string } }>('/api/romaneios/:id/confirmar', async (req) =>
    naEmpresa(db, req, [F, 'confirmar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const { cientes } = confirmacao.parse(req.body ?? {})
      const r = await carregar(ctx, id, true)
      if (r.situacao !== 'rascunho')
        throw new ErroRegra('Este romaneio já foi confirmado.', 'confirmado')
      await exigirMesAberto(ctx.tx, r.estabelecimentoId, r.chegadaEm)
      const { bloqueios, avisos } = await avaliar(ctx, r)
      if (bloqueios.length) throw new ErroRegra(bloqueios[0]!, 'bloqueio', { bloqueios })
      exigirCientes(avisos, cientes)
      const [estab] = await ctx.tx
        .select({ fuso: s.estabelecimento.fuso })
        .from(s.estabelecimento)
        .where(eq(s.estabelecimento.id, r.estabelecimentoId))
      const codigo = await proximoCodigo(ctx, {
        estabelecimentoId: r.estabelecimentoId,
        tipo: 'romaneio',
        ano: anoNoFuso(r.chegadaEm, estab!.fuso),
      })
      await ctx.tx
        .update(s.romaneio)
        .set({
          codigo,
          situacao: 'confirmado',
          confirmadoEm: sql`now()`,
          confirmadoPor: ctx.usuarioId,
          versao: sql`${s.romaneio.versao} + 1`,
        })
        .where(eq(s.romaneio.id, id))
      // A primeira recepção põe o projeto em produção (cantina.md, Situações do projeto).
      await ctx.tx
        .update(s.projeto)
        .set({ situacao: 'em_producao', situacaoDesde: sql`now()` })
        .where(and(eq(s.projeto.id, r.projetoId), eq(s.projeto.situacao, 'planejado')))
      await gravarOcorrencias(
        ctx,
        { entidade: 'romaneio', registroId: id, estabelecimentoId: r.estabelecimentoId },
        avisos,
      )
      // Nota da uva: lançada, e a variedade de cada produto do emitente fica memorizada (P11).
      if (r.nfeId) {
        await ctx.tx
          .update(s.nfe)
          .set({ situacao: 'lancada', atualizadoEm: sql`now()` })
          .where(eq(s.nfe.id, r.nfeId))
        const ligados = await ctx.tx
          .select({
            nfeItemId: s.romaneioItem.nfeItemId,
            variedadeId: s.romaneioItem.variedadeId,
            codigo: s.nfeItem.codigoEmitente,
            emitenteId: s.nfe.emitenteId,
          })
          .from(s.romaneioItem)
          .innerJoin(s.nfeItem, eq(s.nfeItem.id, s.romaneioItem.nfeItemId))
          .innerJoin(s.nfe, eq(s.nfe.id, s.nfeItem.nfeId))
          .where(eq(s.romaneioItem.romaneioId, id))
        for (const l of ligados) {
          await ctx.tx
            .update(s.nfeItem)
            .set({ variedadeId: l.variedadeId })
            .where(eq(s.nfeItem.id, l.nfeItemId!))
          if (!l.emitenteId) continue
          await memorizarAssociacao(
            ctx,
            { pessoaId: l.emitenteId, codigo: l.codigo, sentido: 'entrada' },
            { variedadeId: l.variedadeId },
          )
        }
      }
      await ctx.auditar({
        acao: 'confirmar',
        entidade: 'romaneio',
        registroId: id,
        dados: { codigo, avisos: avisos.map((a) => a.mensagem) },
      })
      return { codigo }
    }),
  )

  /**
   * Importação do XML da nota da uva (P11, "Nota da uva"): guarda a nota e o arquivo, cadastra o
   * emitente como produtor de uva se ainda não existir e devolve o romaneio pré-preenchido.
   */
  app.post('/api/romaneios/importar-xml', async (req) => {
    const arquivo = await req.file()
    if (!arquivo) throw new ErroRegra('Envie o XML da nota.', 'arquivo')
    const conteudo = await arquivo.toBuffer()
    if (arquivo.file.truncated) throw new ErroRegra('Arquivo grande demais.', 'arquivo_grande')
    const lida = lerNfe(conteudo.toString('utf8'))
    return naEmpresa(db, req, [F, 'importar'], async (ctx) => {
      const estabelecimentoId = ctx.exigirEstabelecimento()
      const avisos: string[] = []

      // Duplicidade: a chave de acesso impede importar a mesma nota duas vezes (P11).
      const [existente] = await ctx.tx
        .select({ id: s.nfe.id, situacao: s.nfe.situacao, tipoUso: s.nfe.tipoUso })
        .from(s.nfe)
        .where(and(eq(s.nfe.empresaId, ctx.empresaId), eq(s.nfe.chave, lida.chave)))
      if (existente && existente.tipoUso !== 'uva')
        throw new ErroRegra('Esta nota já foi importada no estoque.', 'nfe_usada')
      if (existente) {
        const [usado] = await ctx.tx
          .select({ id: s.romaneio.id, codigo: s.romaneio.codigo })
          .from(s.romaneio)
          .where(and(eq(s.romaneio.nfeId, existente.id), ne(s.romaneio.situacao, 'estornado')))
        if (usado)
          throw new ErroRegra(
            usado.codigo
              ? `Esta nota já está no romaneio ${usado.codigo}.`
              : 'Esta nota já está num romaneio em rascunho.',
            'nfe_usada',
            { romaneioId: usado.id },
          )
      }

      // O destinatário deveria ser a própria vinícola: só avisa (P29).
      const destinatario = await avisoDestinatario(ctx, estabelecimentoId, lida)
      if (destinatario) avisos.push(destinatario)

      // Emitente: o produtor de uva; cadastrado a partir da nota se ainda não existir (P11).
      const emitente = await emitenteDaNota(ctx, lida, 'produtor_uva')
      if (emitente.aviso) avisos.push(emitente.aviso)
      const emitenteId = emitente.id
      const emitenteNovo = emitente.novo

      // A nota e o XML (anexo, P15).
      const nfeId =
        existente?.id ??
        (await gravarNota(ctx, armazenamento, {
          estabelecimentoId,
          lida,
          arquivo: { nome: arquivo.filename, conteudo },
          tipoUso: 'uva',
          emitenteId,
          emitenteNovo,
        }))

      // Itens com a variedade memorizada para o produto do emitente (P11).
      const itens = await ctx.tx
        .select({
          id: s.nfeItem.id,
          codigo: s.nfeItem.codigoEmitente,
          descricao: s.nfeItem.descricao,
          quantidade: s.nfeItem.quantidade,
          unidade: s.nfeItem.unidade,
          variedadeId: sql<
            string | null
          >`(select a.variedade_id from associacao_item a where a.empresa_id = nfe_item.empresa_id and a.pessoa_id = ${emitenteId} and a.codigo_emitente = nfe_item.codigo_emitente and a.sentido = 'entrada')`,
        })
        .from(s.nfeItem)
        .where(eq(s.nfeItem.nfeId, nfeId))
        .orderBy(asc(s.nfeItem.numeroItem))
      const semPeso = itens.filter((i) => quilosDoItem(i.quantidade, i.unidade) === null)
      if (semPeso.length)
        avisos.push(
          `Sem peso em kg na nota: ${semPeso.map((i) => i.descricao).join(', ')}. Informe a pesagem.`,
        )
      return {
        nfeId,
        nfNumero: lida.numero,
        nfSerie: lida.serie,
        nfEmissao: lida.emissao.slice(0, 10),
        nfChave: lida.chave,
        fornecedor: {
          id: emitenteId,
          nome: lida.emitente.nome,
          documento: lida.emitente.documento,
          novo: emitenteNovo,
        },
        itens: itens.map((i) => ({
          nfeItemId: i.id,
          descricao: i.descricao,
          kg: quilosDoItem(i.quantidade, i.unidade)?.toFixed(1) ?? null,
          variedadeId: i.variedadeId,
        })),
        avisos,
      }
    })
  })

  /** Itens com uva a processar, para o desengace e a prensagem direta (cantina.md). */
  app.get('/api/romaneios/uva-a-processar', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const linhas = await ctx.tx
        .select({
          itemId: s.romaneioItem.id,
          romaneioId: s.romaneio.id,
          romaneio: s.romaneio.codigo,
          chegadaEm: s.romaneio.chegadaEm,
          projetoId: s.romaneio.projetoId,
          projeto: sql<string>`(select p.codigo || ' · ' || p.nome from projeto p where p.id = romaneio.projeto_id)`,
          donoUvaId: s.romaneio.donoUvaId,
          variedadeId: s.romaneioItem.variedadeId,
          variedade: s.variedade.nome,
          safra: s.romaneioItem.safra,
          ciclo: s.romaneioItem.ciclo,
          brix: s.romaneioItem.brix,
          liquidoKg: liquidoItem,
          consumidoKg: consumidoItem,
        })
        .from(s.romaneioItem)
        .innerJoin(s.romaneio, eq(s.romaneio.id, s.romaneioItem.romaneioId))
        .innerJoin(s.variedade, eq(s.variedade.id, s.romaneioItem.variedadeId))
        .where(and(eq(s.romaneio.estabelecimentoId, estab), eq(s.romaneio.situacao, 'confirmado')))
        .orderBy(desc(s.romaneio.chegadaEm), asc(s.romaneioItem.ordem))
      return linhas
        .map((l) => ({ ...l, saldoKg: (Number(l.liquidoKg) - Number(l.consumidoKg)).toFixed(1) }))
        .filter((l) => Number(l.saldoKg) > 0)
    }),
  )
}
