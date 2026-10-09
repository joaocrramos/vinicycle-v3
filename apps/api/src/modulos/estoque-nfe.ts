// EnoTrace › Estoque › Notas de entrada (ambiente-cliente.md, Entrada por NF-e; P11) e Saídas ›
// Notas de venda (cantina.md, Saídas de produto): o XML da nota vira uma conferência. Cada item da nota vai a um item do estoque (sugerido pela
// associação memorizada do mesmo emitente e código), com a conversão para a unidade base, o local,
// o lote e a validade (do grupo de rastreabilidade do XML), ou é descartado da importação. Lançar
// gera as entradas (compra) ou a saída com a baixa por lote (venda, NF-e ou NFC-e); o estorno desfaz
// a nota inteira e a devolve à conferência.
import { conferenciaNfe, estornoOperacao, lancamentoNfe } from '@vinicycle/shared';
import { and, asc, desc, eq, inArray, notExists, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as s from '../db/schema';
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros';
import { lerNfe } from '../nucleo/nfe';
import { type Aviso, exigirCientes, gravarOcorrencias } from '../nucleo/regras';
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao';
import { lancarEstoque, type MovimentoNovo, obterLote } from './estoque';
import { avisoDestinatario, emitenteDaNota, gravarNota, memorizarAssociacao } from './notas';
import { estornarSaida, lancarSaida, previaSaida, type SaidaNova } from './saidas';

type TipoUso = 'compra' | 'venda';

/** Rotas de cada tipo de nota: as de compra no estoque, as de venda nas saídas. */
const CONFIG = {
  compra: { prefixo: '/api/estoque/notas', F: 'enotrace.estoque', sentido: 'entrada' },
  venda: { prefixo: '/api/saidas/notas', F: 'enotrace.saidas', sentido: 'saida' },
} as const;

/** Quantidade na unidade base: a da nota × a conversão, com 3 casas. */
const quantidadeBase = (quantidade: string, conversao: string) =>
  (Math.round(Number(quantidade) * Number(conversao) * 1000) / 1000).toFixed(3);

async function carregarNota(ctx: ContextoEmpresa, id: string, tipoUso: TipoUso, travar = false) {
  const q = ctx.tx
    .select()
    .from(s.nfe)
    .where(and(eq(s.nfe.id, id), eq(s.nfe.empresaId, ctx.empresaId), eq(s.nfe.tipoUso, tipoUso)));
  const [n] = travar ? await q.for('update') : await q;
  if (!n || n.estabelecimentoId !== ctx.exigirEstabelecimento())
    throw new ErroNaoEncontrado('Nota não encontrada.');
  return n;
}

async function itensDaNota(ctx: ContextoEmpresa, nfeId: string) {
  return ctx.tx
    .select({
      id: s.nfeItem.id,
      numeroItem: s.nfeItem.numeroItem,
      codigo: s.nfeItem.codigoEmitente,
      descricao: s.nfeItem.descricao,
      quantidade: s.nfeItem.quantidade,
      unidade: s.nfeItem.unidade,
      valor: s.nfeItem.valor,
      lote: s.nfeItem.loteNota,
      fabricacao: s.nfeItem.fabricacaoNota,
      validade: s.nfeItem.validadeNota,
      itemEstoqueId: s.nfeItem.itemEstoqueId,
      conversao: s.nfeItem.conversao,
      localId: s.nfeItem.localId,
      descartado: s.nfeItem.descartado,
      item: s.itemEstoque.nome,
      unidadeBase: s.itemEstoque.unidadeBase,
      controlaLote: s.itemEstoque.controlaLote,
      controlaValidade: s.itemEstoque.controlaValidade,
      local: s.local.nome,
    })
    .from(s.nfeItem)
    .leftJoin(s.itemEstoque, eq(s.itemEstoque.id, s.nfeItem.itemEstoqueId))
    .leftJoin(s.local, eq(s.local.id, s.nfeItem.localId))
    .where(eq(s.nfeItem.nfeId, nfeId))
    .orderBy(asc(s.nfeItem.numeroItem));
}

/**
 * Monta as entradas da nota conferida: item sem associação e não descartado impede lançar; lote
 * vencido pede "ciente" (P29). O lote existente com o mesmo código é usado (o insumo consumido antes
 * da nota chegar, 03-modelo-de-dados.md, 2.4, Lote de item).
 */
async function montarEntradas(
  ctx: ContextoEmpresa,
  nota: typeof s.nfe.$inferSelect,
  executadoEm: Date,
  gravar: boolean,
) {
  const itens = await itensDaNota(ctx, nota.id);
  const bloqueios: string[] = [];
  const avisos: Aviso[] = [];
  const movimentos: MovimentoNovo[] = [];
  const hoje = executadoEm.toISOString().slice(0, 10);
  for (const i of itens) {
    if (i.descartado) continue;
    const nome = `Item ${i.numeroItem} (${i.descricao})`;
    if (!i.itemEstoqueId || !i.conversao || !i.localId) {
      bloqueios.push(`${nome}: associe a um item do estoque, com conversão e local, ou descarte.`);
      continue;
    }
    if (i.controlaLote && !i.lote) {
      bloqueios.push(`${nome}: ${i.item} controla lote; informe o lote.`);
      continue;
    }
    if (i.validade && i.validade < hoje)
      avisos.push({
        codigo: `nfe_vencido:${i.id}`,
        mensagem: `${nome}: o lote ${i.lote ?? ''} está vencido (validade ${i.validade.split('-').reverse().join('/')}).`,
      });
    const loteItemId =
      i.lote && gravar
        ? await obterLote(
            ctx,
            nota.estabelecimentoId,
            i.itemEstoqueId,
            { codigo: i.lote, fabricacao: i.fabricacao, validade: i.validade },
            'nfe',
          )
        : null;
    movimentos.push({
      localId: i.localId,
      itemId: i.itemEstoqueId,
      loteItemId,
      quantidade: quantidadeBase(i.quantidade, i.conversao),
      tipo: 'entrada_nfe',
      documento: `NF-e ${nota.numero}${nota.serie ? `/${nota.serie}` : ''}`,
      nfeId: nota.id,
    });
  }
  if (!itens.some((i) => !i.descartado))
    bloqueios.push('Todos os itens foram descartados: descarte a nota inteira.');
  return { itens, bloqueios, avisos, movimentos };
}

/** Monta a saída da nota de venda conferida: cada item associado a um produto acabado. */
async function montarSaida(
  ctx: ContextoEmpresa,
  nota: typeof s.nfe.$inferSelect,
  executadoEm: Date,
): Promise<{
  itens: Awaited<ReturnType<typeof itensDaNota>>;
  bloqueios: string[];
  saida: SaidaNova;
}> {
  const itens = await itensDaNota(ctx, nota.id);
  const bloqueios: string[] = [];
  const saida: SaidaNova = {
    estabelecimentoId: nota.estabelecimentoId,
    tipo: 'venda',
    origem: 'xml',
    executadoEm,
    nfeId: nota.id,
    documento: `NF-e ${nota.numero}${nota.serie ? `/${nota.serie}` : ''}`,
    destinatarioDocumento: nota.destinatarioDocumento,
    destinatarioNome: nota.destinatarioNome,
    itens: [],
  };
  for (const i of itens) {
    if (i.descartado) continue;
    if (!i.itemEstoqueId || !i.conversao || !i.localId) {
      bloqueios.push(
        `Item ${i.numeroItem} (${i.descricao}): associe a um produto, com conversão e local, ou descarte.`,
      );
      continue;
    }
    saida.itens.push({
      itemId: i.itemEstoqueId,
      quantidade: quantidadeBase(i.quantidade, i.conversao),
      localId: i.localId,
      loteCodigo: i.lote,
      codigoDocumento: i.codigo,
      nfeItemId: i.id,
    });
  }
  if (!itens.some((i) => !i.descartado))
    bloqueios.push('Todos os itens foram descartados: descarte a nota inteira.');
  return { itens, bloqueios, saida };
}

export async function rotasEstoqueNfe(app: FastifyInstance): Promise<void> {
  rotasNotas(app, 'compra');
  rotasNotas(app, 'venda');
}

function rotasNotas(app: FastifyInstance, tipoUso: TipoUso): void {
  const { db, armazenamento } = app.deps;
  const { prefixo, F, sentido } = CONFIG[tipoUso];

  /** Importa o XML da nota de compra e abre a conferência, com as associações memorizadas. */
  app.post(`${prefixo}/importar-xml`, async (req) => {
    const arquivo = await req.file();
    if (!arquivo) throw new ErroRegra('Envie o XML da nota.', 'arquivo');
    const conteudo = await arquivo.toBuffer();
    if (arquivo.file.truncated) throw new ErroRegra('Arquivo grande demais.', 'arquivo_grande');
    const lida = lerNfe(conteudo.toString('utf8'));
    return naEmpresa(db, req, [F, 'importar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento();
      // Duplicidade: a chave de acesso impede importar a mesma nota duas vezes (P11).
      const [existente] = await ctx.tx
        .select({ id: s.nfe.id, tipoUso: s.nfe.tipoUso, estab: s.nfe.estabelecimentoId })
        .from(s.nfe)
        .where(and(eq(s.nfe.empresaId, ctx.empresaId), eq(s.nfe.chave, lida.chave)));
      if (existente) {
        if (existente.tipoUso !== tipoUso || existente.estab !== estab)
          throw new ErroRegra(
            existente.tipoUso === 'uva'
              ? 'Esta nota já foi importada na recepção da uva.'
              : 'Esta nota já foi importada.',
            'nfe_usada',
          );
        return { id: existente.id, existente: true, avisos: [] };
      }
      const avisos: string[] = [];
      if (tipoUso === 'venda') {
        // A nota de venda é emitida pela vinícola; o destinatário é quem comprou (P21).
        const nossos = (
          await ctx.tx.execute<{ documento: string | null }>(sql`
            select f.documento from ficha f where f.id in (
              (select ficha_id from empresa where id = ${ctx.empresaId}),
              (select ficha_id from estabelecimento where id = ${estab}))`)
        ).rows.map((d) => d.documento);
        if (!nossos.includes(lida.emitente.documento))
          avisos.push(`O emitente da nota (${lida.emitente.nome}) não é esta vinícola.`);
        const id = await gravarNota(ctx, armazenamento, {
          estabelecimentoId: estab,
          lida,
          arquivo: { nome: arquivo.filename, conteudo },
          tipoUso: 'venda',
          emitenteId: null,
          emitenteNovo: false,
        });
        await ctx.tx.execute(sql`
          update nfe_item i set item_estoque_id = a.item_estoque_id, conversao = a.conversao,
            local_id = a.local_id, descartado = a.descartar
          from associacao_item a
          where i.nfe_id = ${id} and a.empresa_id = i.empresa_id and a.pessoa_id is null
            and a.codigo_emitente = i.codigo_emitente and a.sentido = 'saida'
            and (a.item_estoque_id is not null or a.descartar is not null)`);
        return { id, existente: false, avisos };
      }
      const destinatario = await avisoDestinatario(ctx, estab, lida);
      if (destinatario) avisos.push(destinatario);
      const emitente = await emitenteDaNota(ctx, lida, 'fornecedor');
      if (emitente.aviso) avisos.push(emitente.aviso);
      const id = await gravarNota(ctx, armazenamento, {
        estabelecimentoId: estab,
        lida,
        arquivo: { nome: arquivo.filename, conteudo },
        tipoUso: 'compra',
        emitenteId: emitente.id,
        emitenteNovo: emitente.novo,
      });
      // Associação memorizada do mesmo emitente e código (P11): item, conversão, local, descarte.
      if (emitente.id) {
        await ctx.tx.execute(sql`
          update nfe_item i set item_estoque_id = a.item_estoque_id, conversao = a.conversao,
            local_id = a.local_id, descartado = a.descartar
          from associacao_item a
          where i.nfe_id = ${id} and a.empresa_id = i.empresa_id and a.pessoa_id = ${emitente.id}
            and a.codigo_emitente = i.codigo_emitente and a.sentido = 'entrada'
            and (a.item_estoque_id is not null or a.descartar is not null)`);
      }
      const outros = lida.itens.filter((i) => i.outrosLotes.length);
      for (const i of outros)
        avisos.push(
          `O item ${i.numero} traz mais de um lote na nota (${[i.lote, ...i.outrosLotes].join(', ')}); entra pelo primeiro, ajuste se preciso.`,
        );
      return { id, existente: false, avisos };
    });
  });

  app.get(prefixo, async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento();
      const { situacao } = z
        .object({
          situacao: z.enum(['em_conferencia', 'lancada', 'descartada', 'todas']).default('todas'),
        })
        .parse(req.query);
      return ctx.tx
        .select({
          id: s.nfe.id,
          numero: s.nfe.numero,
          serie: s.nfe.serie,
          emissao: s.nfe.emissao,
          emitente: s.nfe.emitenteNome,
          destinatario: s.nfe.destinatarioNome,
          situacao: s.nfe.situacao,
          itens: sql<number>`(select count(*)::int from nfe_item i where i.nfe_id = nfe.id)`,
          pendentes: sql<number>`(select count(*)::int from nfe_item i where i.nfe_id = nfe.id and i.descartado is null and (i.item_estoque_id is null or i.conversao is null or i.local_id is null))`,
        })
        .from(s.nfe)
        .where(
          and(
            eq(s.nfe.estabelecimentoId, estab),
            eq(s.nfe.tipoUso, tipoUso),
            situacao === 'todas' ? undefined : eq(s.nfe.situacao, situacao),
          ),
        )
        .orderBy(desc(s.nfe.emissao))
        .limit(500);
    }),
  );

  app.get<{ Params: { id: string } }>(`${prefixo}/:id`, async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const n = await carregarNota(ctx, z.uuid().parse(req.params.id), tipoUso);
      const movimentos = await ctx.tx
        .select({
          id: s.movimentoEstoque.id,
          item: s.itemEstoque.nome,
          unidade: s.itemEstoque.unidadeBase,
          local: s.local.nome,
          lote: s.loteItem.codigo,
          quantidade: s.movimentoEstoque.quantidade,
          tipo: s.movimentoEstoque.tipo,
          executadoEm: s.movimentoEstoque.executadoEm,
          motivo: s.movimentoEstoque.motivo,
        })
        .from(s.movimentoEstoque)
        .innerJoin(s.itemEstoque, eq(s.itemEstoque.id, s.movimentoEstoque.itemId))
        .innerJoin(s.local, eq(s.local.id, s.movimentoEstoque.localId))
        .leftJoin(s.loteItem, eq(s.loteItem.id, s.movimentoEstoque.loteItemId))
        .where(eq(s.movimentoEstoque.nfeId, n.id))
        .orderBy(asc(s.movimentoEstoque.lancadoEm), asc(s.movimentoEstoque.id));
      return {
        id: n.id,
        chave: n.chave,
        numero: n.numero,
        serie: n.serie,
        emissao: n.emissao,
        emitenteId: n.emitenteId,
        emitente: n.emitenteNome,
        emitenteDocumento: n.emitenteDocumento,
        destinatario: n.destinatarioNome,
        situacao: n.situacao,
        anexoId: n.anexoId,
        versao: n.versao,
        itens: await itensDaNota(ctx, n.id),
        movimentos,
        saidaId:
          (
            await ctx.tx
              .select({ id: s.saida.id })
              .from(s.saida)
              .where(and(eq(s.saida.nfeId, n.id), eq(s.saida.situacao, 'lancada')))
          )[0]?.id ?? null,
      };
    }),
  );

  /** Salva a conferência: associação, conversão, local, lote e validade, ou o descarte. */
  app.put<{ Params: { id: string } }>(`${prefixo}/:id`, async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const n = await carregarNota(ctx, z.uuid().parse(req.params.id), tipoUso, true);
      if (n.situacao !== 'em_conferencia')
        throw new ErroRegra('A nota não está em conferência.', 'situacao');
      const d = conferenciaNfe.parse(req.body);
      const ids = (
        await ctx.tx.select({ id: s.nfeItem.id }).from(s.nfeItem).where(eq(s.nfeItem.nfeId, n.id))
      ).map((x) => x.id);
      if (d.itens.some((i) => !ids.includes(i.id)))
        throw new ErroRegra('Item da nota inválido.', 'nfe_item');
      const itensEstoque = [...new Set(d.itens.flatMap((i) => i.itemEstoqueId ?? []))];
      if (itensEstoque.length) {
        const ok = await ctx.tx
          .select({ id: s.itemEstoque.id, tipo: s.itemEstoque.tipo })
          .from(s.itemEstoque)
          .where(
            and(
              inArray(s.itemEstoque.id, itensEstoque),
              eq(s.itemEstoque.empresaId, ctx.empresaId),
            ),
          );
        if (ok.length !== itensEstoque.length) throw new ErroRegra('Item inválido.', 'item');
        if (tipoUso === 'venda' && ok.some((x) => x.tipo !== 'produto_acabado'))
          throw new ErroRegra('Na nota de venda, associe cada item a um produto acabado.', 'item');
      }
      const locais = [...new Set(d.itens.flatMap((i) => i.localId ?? []))];
      if (locais.length) {
        const ok = await ctx.tx
          .select({ id: s.local.id })
          .from(s.local)
          .where(
            and(inArray(s.local.id, locais), eq(s.local.estabelecimentoId, n.estabelecimentoId)),
          );
        if (ok.length !== locais.length) throw new ErroRegra('Local inválido.', 'local');
      }
      for (const i of d.itens) {
        await ctx.tx
          .update(s.nfeItem)
          .set({
            itemEstoqueId: i.descartado ? null : (i.itemEstoqueId ?? null),
            conversao: i.descartado ? null : (i.conversao ?? null),
            localId: i.descartado ? null : (i.localId ?? null),
            loteNota: i.lote ?? null,
            fabricacaoNota: i.fabricacao ?? null,
            validadeNota: i.validade ?? null,
            descartado: i.descartado ?? null,
          })
          .where(eq(s.nfeItem.id, i.id));
      }
      await ctx.tx
        .update(s.nfe)
        .set({
          versao: sql`${s.nfe.versao} + 1`,
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
        })
        .where(eq(s.nfe.id, n.id));
      return { ok: true };
    }),
  );

  app.post<{ Params: { id: string } }>(`${prefixo}/:id/previa`, async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const n = await carregarNota(ctx, z.uuid().parse(req.params.id), tipoUso);
      const d = lancamentoNfe.parse(req.body);
      if (tipoUso === 'venda') {
        const m = await montarSaida(ctx, n, new Date(d.executadoEm));
        if (m.bloqueios.length)
          return { bloqueios: m.bloqueios, avisos: [], entradas: 0, baixas: [] };
        const p = await previaSaida(ctx, m.saida);
        return { ...p, entradas: m.saida.itens.length };
      }
      const m = await montarEntradas(ctx, n, new Date(d.executadoEm), false);
      return { bloqueios: m.bloqueios, avisos: m.avisos, entradas: m.movimentos.length };
    }),
  );

  /** Lança a nota conferida: as entradas no estoque e a associação memorizada (P11). */
  app.post<{ Params: { id: string } }>(`${prefixo}/:id/lancar`, async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const n = await carregarNota(ctx, z.uuid().parse(req.params.id), tipoUso, true);
      if (n.situacao !== 'em_conferencia')
        throw new ErroRegra('A nota não está em conferência.', 'situacao');
      const d = lancamentoNfe.parse(req.body);
      const executadoEm = new Date(d.executadoEm);
      if (executadoEm.getTime() > Date.now() + 5 * 60_000)
        throw new ErroRegra('A data da entrada não pode ser no futuro.', 'data_futura');
      if (tipoUso === 'venda') {
        const v = await montarSaida(ctx, n, executadoEm);
        if (v.bloqueios.length) throw new ErroRegra(v.bloqueios[0]!, 'nfe_pendente');
        const r = await lancarSaida(ctx, v.saida, d.cientes);
        await ctx.tx
          .update(s.nfe)
          .set({
            situacao: 'lancada',
            versao: sql`${s.nfe.versao} + 1`,
            atualizadoEm: sql`now()`,
            atualizadoPor: ctx.usuarioId,
          })
          .where(eq(s.nfe.id, n.id));
        for (const i of v.itens)
          await memorizarAssociacao(
            ctx,
            { pessoaId: null, codigo: i.codigo, sentido },
            {
              itemEstoqueId: i.descartado ? null : i.itemEstoqueId,
              conversao: i.descartado ? null : i.conversao,
              localId: i.descartado ? null : i.localId,
              descartar: i.descartado,
            },
          );
        await ctx.auditar({
          acao: 'lancar',
          entidade: 'nfe',
          registroId: n.id,
          dados: { numero: n.numero, saida: r.id },
        });
        return r;
      }
      const m = await montarEntradas(ctx, n, executadoEm, false);
      if (m.bloqueios.length) throw new ErroRegra(m.bloqueios[0]!, 'nfe_pendente');
      exigirCientes(m.avisos, d.cientes);
      const { movimentos } = await montarEntradas(ctx, n, executadoEm, true);
      const r = await lancarEstoque(ctx, {
        estabelecimentoId: n.estabelecimentoId,
        executadoEm,
        movimentos,
      });
      await ctx.tx
        .update(s.nfe)
        .set({
          situacao: 'lancada',
          versao: sql`${s.nfe.versao} + 1`,
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
        })
        .where(eq(s.nfe.id, n.id));
      if (n.emitenteId) {
        for (const i of m.itens) {
          const valores = {
            itemEstoqueId: i.descartado ? null : i.itemEstoqueId,
            conversao: i.descartado ? null : i.conversao,
            localId: i.descartado ? null : i.localId,
            descartar: i.descartado,
          };
          await memorizarAssociacao(
            ctx,
            { pessoaId: n.emitenteId, codigo: i.codigo, sentido },
            valores,
          );
        }
      }
      await gravarOcorrencias(
        ctx,
        { entidade: 'nfe', registroId: n.id, estabelecimentoId: n.estabelecimentoId },
        m.avisos,
      );
      await ctx.auditar({
        acao: 'lancar',
        entidade: 'nfe',
        registroId: n.id,
        dados: {
          numero: n.numero,
          entradas: movimentos.length,
          descartados: m.itens.filter((i) => i.descartado).map((i) => i.descricao),
        },
      });
      return { ...r, avisos: [...m.avisos, ...r.avisos] };
    }),
  );

  /** Estorno da nota inteira: entradas inversas com a data original; a nota volta à conferência. */
  app.post<{ Params: { id: string } }>(`${prefixo}/:id/estorno`, async (req) =>
    naEmpresa(db, req, [F, 'estornar'], async (ctx) => {
      const n = await carregarNota(ctx, z.uuid().parse(req.params.id), tipoUso, true);
      if (n.situacao !== 'lancada') throw new ErroRegra('A nota não foi lançada.', 'situacao');
      const { motivo } = estornoOperacao.parse(req.body);
      if (tipoUso === 'venda') {
        const [sa] = await ctx.tx
          .select({ id: s.saida.id })
          .from(s.saida)
          .where(and(eq(s.saida.nfeId, n.id), eq(s.saida.situacao, 'lancada')));
        if (!sa) throw new ErroRegra('A saída da nota não foi encontrada.', 'saida');
        return estornarSaida(ctx, sa.id, motivo);
      }
      const estorno = ctx.tx
        .select({ id: sql`1` })
        .from(sql`movimento_estoque e`)
        .where(sql`e.estorno_de_id = movimento_estoque.id`);
      const movs = await ctx.tx
        .select()
        .from(s.movimentoEstoque)
        .where(
          and(
            eq(s.movimentoEstoque.nfeId, n.id),
            eq(s.movimentoEstoque.tipo, 'entrada_nfe'),
            notExists(estorno),
          ),
        );
      const r = await lancarEstoque(ctx, {
        estabelecimentoId: n.estabelecimentoId,
        executadoEm: movs[0]?.executadoEm ?? new Date(),
        movimentos: movs.map((m) => ({
          localId: m.localId,
          itemId: m.itemId,
          loteItemId: m.loteItemId,
          quantidade: `-${m.quantidade}`,
          tipo: 'estorno' as const,
          motivo,
          documento: m.documento,
          nfeId: n.id,
          estornoDeId: m.id,
        })),
      });
      await ctx.tx
        .update(s.nfe)
        .set({
          situacao: 'em_conferencia',
          versao: sql`${s.nfe.versao} + 1`,
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
        })
        .where(eq(s.nfe.id, n.id));
      await ctx.auditar({
        acao: 'estornar',
        entidade: 'nfe',
        registroId: n.id,
        motivo,
        dados: { numero: n.numero, entradas: movs.length },
      });
      return r;
    }),
  );

  /** Nota que não entra no estoque (serviço, uso imediato): descartada, com motivo; reabre-se. */
  app.post<{ Params: { id: string } }>(`${prefixo}/:id/descartar`, async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const n = await carregarNota(ctx, z.uuid().parse(req.params.id), tipoUso, true);
      if (n.situacao !== 'em_conferencia')
        throw new ErroRegra('Só a nota em conferência se descarta.', 'situacao');
      const { motivo } = estornoOperacao.parse(req.body);
      await ctx.tx
        .update(s.nfe)
        .set({ situacao: 'descartada', atualizadoEm: sql`now()`, atualizadoPor: ctx.usuarioId })
        .where(eq(s.nfe.id, n.id));
      await ctx.auditar({ acao: 'descartar', entidade: 'nfe', registroId: n.id, motivo });
      return { ok: true };
    }),
  );

  app.post<{ Params: { id: string } }>(`${prefixo}/:id/reabrir`, async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const n = await carregarNota(ctx, z.uuid().parse(req.params.id), tipoUso, true);
      if (n.situacao !== 'descartada')
        throw new ErroRegra('Só a nota descartada se reabre.', 'situacao');
      await ctx.tx
        .update(s.nfe)
        .set({ situacao: 'em_conferencia', atualizadoEm: sql`now()`, atualizadoPor: ctx.usuarioId })
        .where(eq(s.nfe.id, n.id));
      await ctx.auditar({ acao: 'reabrir', entidade: 'nfe', registroId: n.id });
      return { ok: true };
    }),
  );
}
