// EnoTrace › Saídas (cantina.md, Saídas de produto): venda, degustação e cortesia, quebra e avaria,
// consumo interno, doação (lista configurável, P29), manual ou pelo XML da nota de venda. A baixa de
// cada item escolhe o lote pela estratégia da empresa (lote do documento, mais antigo primeiro,
// escolha, sem lote); sem lote, o sistema avisa que o recolhimento fica cego. A devolução volta ao
// lote de origem. O relatório de recolhimento responde "quem recebeu o lote X" (P21: o comprador
// é dado da saída, não vira cadastro).
import { devolucaoSaida, estornoOperacao, saidaProduto } from '@vinicycle/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as s from '../db/schema';
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros';
import { type Aviso, exigirCientes, gravarOcorrencias } from '../nucleo/regras';
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao';
import { lancarEstoque, type MovimentoNovo } from './estoque';
import { lerParametro } from './parametros';

const F = 'enotrace.saidas';

const paraMil = (q: string | number) => Math.round(Number(q) * 1000);
const deMil = (m: number) => (m / 1000).toFixed(3);
const qtdBr = (m: number) => (m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

export interface ItemSaidaNovo {
  itemId: string;
  quantidade: string;
  localId: string;
  /** Lote escolhido pelo usuário. */
  loteItemId?: string | null;
  /** Lote informado no documento (grupo de rastreabilidade da nota). */
  loteCodigo?: string | null;
  codigoDocumento?: string | null;
  nfeItemId?: string | null;
}

export interface SaidaNova {
  estabelecimentoId: string;
  tipo: string;
  origem: 'manual' | 'xml';
  executadoEm: Date;
  nfeId?: string | null;
  documento?: string | null;
  destinatarioDocumento?: string | null;
  destinatarioNome?: string | null;
  pessoaId?: string | null;
  /** Dono do produto que sai; vazio = a própria empresa. */
  titularId?: string | null;
  motivo?: string | null;
  itens: ItemSaidaNovo[];
}

/** Tipos de saída da vinificação para terceiros (04, roteiro do ciclo 10, bloco 3). */
const TIPOS_DO_TITULAR = ['devolucao_titular', 'entrega_ordem_titular'];

interface Baixa {
  indice: number;
  loteItemId: string | null;
  localId: string;
  mil: number;
  estrategia: 'documento' | 'escolha' | 'mais_antigo' | 'sem_lote';
}

/**
 * Baixa por lote (cantina.md, De qual lote sai cada garrafa): lote do documento quando a empresa
 * usa e a nota informa; lote escolhido; senão a estratégia padrão. O produto acabado não fica
 * negativo, nem no lote (P29: é vinho).
 */
async function planejarBaixas(ctx: ContextoEmpresa, d: SaidaNova) {
  const { usarLoteDoDocumento, padrao } = await lerParametro(ctx, 'baixa_saidas');
  const ids = [...new Set(d.itens.map((i) => i.itemId))];
  const itens = await ctx.tx
    .select({ id: s.itemEstoque.id, nome: s.itemEstoque.nome, tipo: s.itemEstoque.tipo })
    .from(s.itemEstoque)
    .where(and(inArray(s.itemEstoque.id, ids), eq(s.itemEstoque.empresaId, ctx.empresaId)));
  if (itens.length !== ids.length) throw new ErroRegra('Produto inválido.', 'item');
  const nome = (id: string) => itens.find((i) => i.id === id)!.nome;
  // Insumo e embalagem saem pelo Estoque; a exceção é a devolução ao cliente da sobra dos
  // insumos dele.
  const devolveInsumo = d.tipo === 'devolucao_titular' && !!d.titularId;
  const naoProduto = itens.filter((i) => i.tipo !== 'produto_acabado');
  if (naoProduto.length && !devolveInsumo)
    throw new ErroRegra(
      `${naoProduto.map((i) => i.nome).join(', ')} não é produto acabado: insumos e embalagens saem pelo Estoque (ajuste ou descarte).`,
      'item',
    );

  // Saldo de cada lote em cada local, na ordem do mais antigo.
  const lotes = await ctx.tx.execute<{
    lote_id: string;
    codigo: string;
    item_id: string;
    local_id: string;
    saldo: string;
  }>(sql`
    select l.id as lote_id, l.codigo, l.item_id, m.local_id, sum(m.quantidade)::text as saldo
    from lote_item l join movimento_estoque m on m.lote_item_id = l.id
    where l.item_id in ${sql.raw(`(${ids.map((x) => `'${x}'`).join(',')})`)}
      and l.estabelecimento_id = ${d.estabelecimentoId}
      and l.titular_id is not distinct from ${d.titularId ?? null}::uuid
    group by l.id, l.codigo, l.item_id, m.local_id, l.criado_em
    order by l.criado_em, l.codigo`);
  const disponivel = new Map(
    lotes.rows.map((l) => [`${l.lote_id}|${l.local_id}`, paraMil(l.saldo)]),
  );
  const tirar = (loteId: string, localId: string, mil: number) =>
    disponivel.set(`${loteId}|${localId}`, (disponivel.get(`${loteId}|${localId}`) ?? 0) - mil);

  const baixas: Baixa[] = [];
  const bloqueios: string[] = [];
  const avisos: Aviso[] = [];
  for (const [indice, i] of d.itens.entries()) {
    const mil = paraMil(i.quantidade);
    const lotesDoItem = lotes.rows.filter(
      (l) => l.item_id === i.itemId && l.local_id === i.localId,
    );
    const explicito = i.loteItemId
      ? { id: i.loteItemId, estrategia: 'escolha' as const }
      : i.loteCodigo && usarLoteDoDocumento
        ? {
            id: lotes.rows.find((l) => l.item_id === i.itemId && l.codigo === i.loteCodigo)
              ?.lote_id,
            estrategia: 'documento' as const,
          }
        : null;
    if (explicito) {
      if (!explicito.id) {
        bloqueios.push(`O lote ${i.loteCodigo} da nota não existe para ${nome(i.itemId)}.`);
        continue;
      }
      if (!lotes.rows.some((l) => l.lote_id === explicito.id)) {
        bloqueios.push(
          `O lote escolhido de ${nome(i.itemId)} é de outro titular ou não tem saldo neste estabelecimento.`,
        );
        continue;
      }
      const tem = disponivel.get(`${explicito.id}|${i.localId}`) ?? 0;
      if (tem < mil) {
        const codigo = lotes.rows.find((l) => l.lote_id === explicito.id)?.codigo ?? '';
        bloqueios.push(
          `O lote ${codigo} de ${nome(i.itemId)} tem ${qtdBr(Math.max(tem, 0))} no local; saem ${qtdBr(mil)}.`,
        );
        continue;
      }
      tirar(explicito.id, i.localId, mil);
      baixas.push({
        indice,
        loteItemId: explicito.id,
        localId: i.localId,
        mil,
        estrategia: explicito.estrategia,
      });
      continue;
    }
    if (padrao === 'escolha') {
      bloqueios.push(`Escolha o lote de ${nome(i.itemId)}.`);
      continue;
    }
    if (padrao === 'sem_lote') {
      baixas.push({ indice, loteItemId: null, localId: i.localId, mil, estrategia: 'sem_lote' });
      avisos.push({
        codigo: 'saida_sem_lote',
        mensagem:
          'Saída sem lote: num recolhimento (recall), não será possível saber quem recebeu cada lote.',
      });
      continue;
    }
    // Mais antigo primeiro, repartindo entre lotes quando preciso.
    let falta = mil;
    for (const l of lotesDoItem) {
      const tem = disponivel.get(`${l.lote_id}|${l.local_id}`) ?? 0;
      if (tem <= 0 || falta <= 0) continue;
      const usa = Math.min(tem, falta);
      tirar(l.lote_id, l.local_id, usa);
      baixas.push({
        indice,
        loteItemId: l.lote_id,
        localId: i.localId,
        mil: usa,
        estrategia: 'mais_antigo',
      });
      falta -= usa;
    }
    if (falta > 0)
      bloqueios.push(
        `Saldo insuficiente de ${nome(i.itemId)} no local: faltam ${qtdBr(falta)}. Produto acabado não fica negativo.`,
      );
  }
  // Vinificação para terceiros: devolução e entrega por ordem do titular (cantina.md, Devolução ao
  // titular; P29: avisa, não impede).
  if (d.tipo === 'entrega_ordem_titular' && !d.titularId)
    bloqueios.push('Informe o titular que ordenou a entrega.');
  if (d.tipo === 'devolucao_titular') {
    if (!d.titularId)
      avisos.push({
        codigo: 'saida_devolucao_propria',
        mensagem: 'Devolução ao titular de produto que é da própria empresa.',
      });
    else if (d.pessoaId && d.pessoaId !== d.titularId)
      avisos.push({
        codigo: 'saida_devolucao_destinatario',
        mensagem: 'O destinatário não é o titular do produto devolvido.',
      });
  }
  if (d.titularId && !TIPOS_DO_TITULAR.includes(d.tipo))
    avisos.push({
      codigo: 'saida_produto_terceiro',
      mensagem: 'O produto é de um cliente de vinificação: confira se a saída é por conta dele.',
    });
  return {
    baixas,
    bloqueios,
    avisos: avisos.filter((a, n) => avisos.findIndex((x) => x.codigo === a.codigo) === n),
    codigos: new Map(lotes.rows.map((l) => [l.lote_id, l.codigo])),
  };
}

const movimentosDasBaixas = (d: SaidaNova, baixas: Baixa[]): MovimentoNovo[] =>
  baixas.map((b) => ({
    localId: b.localId,
    itemId: d.itens[b.indice]!.itemId,
    loteItemId: b.loteItemId,
    quantidade: deMil(-b.mil),
    tipo: 'saida' as const,
    documento: d.documento ?? null,
    nfeId: d.nfeId ?? null,
    semLote: !b.loteItemId,
  }));

/** Prévia da saída: as baixas por lote, os avisos e os bloqueios. */
export async function previaSaida(ctx: ContextoEmpresa, d: SaidaNova) {
  const p = await planejarBaixas(ctx, d);
  if (!p.bloqueios.length) {
    const r = await lancarEstoque(ctx, {
      estabelecimentoId: d.estabelecimentoId,
      executadoEm: d.executadoEm,
      movimentos: movimentosDasBaixas(d, p.baixas),
      gravar: false,
    });
    p.avisos.push(...r.avisos);
  }
  return {
    bloqueios: p.bloqueios,
    avisos: p.avisos,
    baixas: p.baixas.map((b) => ({
      itemId: d.itens[b.indice]!.itemId,
      lote: b.loteItemId ? (p.codigos.get(b.loteItemId) ?? null) : null,
      quantidade: deMil(b.mil),
      estrategia: b.estrategia,
    })),
  };
}

/** Lança a saída: movimentos de estoque, itens e baixas; os avisos pedem "ciente" (P29). */
export async function lancarSaida(ctx: ContextoEmpresa, d: SaidaNova, cientes: string[]) {
  if (d.tipo === 'transferencia')
    throw new ErroRegra(
      'Para mover entre locais, use Estoque › Transferência. A transferência entre estabelecimentos fica para depois.',
      'tipo',
    );
  const [tipo] = (
    await ctx.tx.execute(sql`
      select 1 from opcao_lista where lista = 'tipo_saida' and codigo = ${d.tipo}
        and (empresa_id is null or empresa_id = ${ctx.empresaId}) limit 1`)
  ).rows;
  if (!tipo) throw new ErroRegra('Tipo de saída inválido.', 'tipo');
  const p = await planejarBaixas(ctx, d);
  if (p.bloqueios.length) throw new ErroRegra(p.bloqueios[0]!, 'saldo', { bloqueios: p.bloqueios });
  const movimentos = movimentosDasBaixas(d, p.baixas);
  const conferencia = await lancarEstoque(ctx, {
    estabelecimentoId: d.estabelecimentoId,
    executadoEm: d.executadoEm,
    movimentos,
    gravar: false,
  });
  const avisos = [...p.avisos, ...conferencia.avisos];
  exigirCientes(avisos, cientes);
  const r = await lancarEstoque(ctx, {
    estabelecimentoId: d.estabelecimentoId,
    executadoEm: d.executadoEm,
    movimentos,
  });
  const [saida] = await ctx.tx
    .insert(s.saida)
    .values({
      empresaId: ctx.empresaId,
      estabelecimentoId: d.estabelecimentoId,
      tipo: d.tipo,
      origem: d.origem,
      nfeId: d.nfeId ?? null,
      executadoEm: d.executadoEm,
      documento: d.documento ?? null,
      destinatarioDocumento: d.destinatarioDocumento ?? null,
      destinatarioNome: d.destinatarioNome ?? null,
      pessoaId: d.pessoaId ?? null,
      titularId: d.titularId ?? null,
      motivo: d.motivo ?? null,
      grupoId: r.grupoId,
      criadoPor: ctx.usuarioId,
      atualizadoPor: ctx.usuarioId,
    })
    .returning({ id: s.saida.id });
  const itens = await ctx.tx
    .insert(s.saidaItem)
    .values(
      d.itens.map((i) => ({
        empresaId: ctx.empresaId,
        saidaId: saida!.id,
        itemId: i.itemId,
        quantidade: deMil(paraMil(i.quantidade)),
        codigoDocumento: i.codigoDocumento ?? null,
        nfeItemId: i.nfeItemId ?? null,
      })),
    )
    .returning({ id: s.saidaItem.id });
  await ctx.tx.insert(s.saidaBaixa).values(
    p.baixas.map((b, n) => ({
      empresaId: ctx.empresaId,
      saidaItemId: itens[b.indice]!.id,
      loteItemId: b.loteItemId,
      localId: b.localId,
      quantidade: deMil(b.mil),
      estrategia: b.estrategia,
      movimentoId: r.ids[n]!,
    })),
  );
  await gravarOcorrencias(
    ctx,
    { entidade: 'saida', registroId: saida!.id, estabelecimentoId: d.estabelecimentoId },
    avisos,
  );
  await ctx.auditar({
    acao: 'criar',
    entidade: 'saida',
    registroId: saida!.id,
    dados: { tipo: d.tipo, origem: d.origem, documento: d.documento, itens: d.itens.length },
  });
  return { id: saida!.id, avisos: r.avisos };
}

/** Estorno da saída: movimentos inversos com a data original; a nota volta à conferência. */
export async function estornarSaida(ctx: ContextoEmpresa, id: string, motivo: string) {
  const [sa] = await ctx.tx
    .select()
    .from(s.saida)
    .where(and(eq(s.saida.id, id), eq(s.saida.empresaId, ctx.empresaId)))
    .for('update');
  if (!sa || sa.estabelecimentoId !== ctx.exigirEstabelecimento())
    throw new ErroNaoEncontrado('Saída não encontrada.');
  if (sa.situacao !== 'lancada') throw new ErroRegra('A saída já foi estornada.', 'situacao');
  const [dev] = await ctx.tx
    .select({ id: s.devolucao.id })
    .from(s.devolucao)
    .where(eq(s.devolucao.saidaId, sa.id))
    .limit(1);
  if (dev)
    throw new ErroRegra(
      'A saída tem devolução: o estorno desfaria garrafas que já voltaram.',
      'devolucao',
    );
  const movs = await ctx.tx
    .select()
    .from(s.movimentoEstoque)
    .where(eq(s.movimentoEstoque.grupoId, sa.grupoId));
  await lancarEstoque(ctx, {
    estabelecimentoId: sa.estabelecimentoId,
    executadoEm: sa.executadoEm,
    movimentos: movs.map((m) => ({
      localId: m.localId,
      itemId: m.itemId,
      loteItemId: m.loteItemId,
      quantidade: deMil(-paraMil(m.quantidade)),
      tipo: 'estorno' as const,
      motivo,
      documento: m.documento,
      nfeId: m.nfeId,
      estornoDeId: m.id,
      semLote: !m.loteItemId,
    })),
  });
  await ctx.tx
    .update(s.saida)
    .set({
      situacao: 'estornada',
      motivoEstorno: motivo,
      atualizadoEm: sql`now()`,
      atualizadoPor: ctx.usuarioId,
      versao: sql`${s.saida.versao} + 1`,
    })
    .where(eq(s.saida.id, sa.id));
  if (sa.nfeId)
    await ctx.tx
      .update(s.nfe)
      .set({ situacao: 'em_conferencia', atualizadoEm: sql`now()`, atualizadoPor: ctx.usuarioId })
      .where(eq(s.nfe.id, sa.nfeId));
  await ctx.auditar({ acao: 'estornar', entidade: 'saida', registroId: sa.id, motivo });
  return { ok: true };
}

function dataExecucao(iso: string): Date {
  const d = new Date(iso);
  if (d.getTime() > Date.now() + 5 * 60_000)
    throw new ErroRegra('A data da execução não pode ser no futuro.', 'data_futura');
  return d;
}

const doFormulario = (estab: string, d: ReturnType<typeof saidaProduto.parse>): SaidaNova => ({
  estabelecimentoId: estab,
  tipo: d.tipo,
  origem: 'manual',
  executadoEm: dataExecucao(d.executadoEm),
  documento: d.documento ?? null,
  destinatarioDocumento: d.destinatarioDocumento ?? null,
  destinatarioNome: d.destinatarioNome ?? null,
  pessoaId: d.pessoaId ?? null,
  titularId: d.titularId ?? null,
  motivo: d.motivo ?? null,
  itens: d.itens.map((i) => ({
    itemId: i.itemId,
    quantidade: i.quantidade,
    localId: d.localId,
    loteItemId: i.loteItemId ?? null,
  })),
});

export async function rotasSaidas(app: FastifyInstance): Promise<void> {
  const { db } = app.deps;

  app.get('/api/saidas', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento();
      const q = z
        .object({
          tipo: z.string().max(40).optional(),
          situacao: z.enum(['lancada', 'estornada', 'todas']).default('todas'),
        })
        .parse(req.query);
      const r = await ctx.tx.execute<Record<string, unknown>>(sql`
        select sa.id, sa.tipo, sa.origem, sa.executado_em as "executadoEm", sa.documento,
          coalesce(sa.destinatario_nome, (select f.nome from pessoa p join ficha f on f.id = p.ficha_id where p.id = sa.pessoa_id)) as destinatario,
          (select f.nome from pessoa p join ficha f on f.id = p.ficha_id where p.id = sa.titular_id) as titular,
          sa.situacao,
          (select string_agg(i.nome || ' × ' || rtrim(rtrim(si.quantidade::text, '0'), '.'), ', ' order by i.nome)
             from saida_item si join item_estoque i on i.id = si.item_id where si.saida_id = sa.id) as itens
        from saida sa
        where sa.estabelecimento_id = ${estab}
          ${q.tipo ? sql`and sa.tipo = ${q.tipo}` : sql``}
          ${q.situacao === 'todas' ? sql`` : sql`and sa.situacao = ${q.situacao}`}
        order by sa.executado_em desc limit 500`);
      return r.rows;
    }),
  );

  app.post('/api/saidas/previa', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento();
      return previaSaida(ctx, doFormulario(estab, saidaProduto.parse(req.body)));
    }),
  );

  app.post('/api/saidas', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento();
      const d = saidaProduto.parse(req.body);
      return lancarSaida(ctx, doFormulario(estab, d), d.cientes);
    }),
  );

  app.get<{ Params: { id: string } }>('/api/saidas/:id', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id);
      const [sa] = await ctx.tx
        .select()
        .from(s.saida)
        .where(and(eq(s.saida.id, id), eq(s.saida.empresaId, ctx.empresaId)));
      if (!sa || sa.estabelecimentoId !== ctx.exigirEstabelecimento())
        throw new ErroNaoEncontrado('Saída não encontrada.');
      const baixas = await ctx.tx.execute<Record<string, unknown>>(sql`
        select b.id, si.item_id as "itemId", i.nome as item, i.unidade_base as unidade, b.quantidade,
          b.estrategia, l.codigo as lote, lo.nome as local, b.local_id as "localId",
          (select coalesce(sum(di.quantidade), 0)::text from devolucao_item di where di.baixa_id = b.id) as devolvido
        from saida_baixa b join saida_item si on si.id = b.saida_item_id join item_estoque i on i.id = si.item_id
          join local lo on lo.id = b.local_id left join lote_item l on l.id = b.lote_item_id
        where si.saida_id = ${sa.id} order by i.nome, l.codigo`);
      const devolucoes = await ctx.tx.execute<Record<string, unknown>>(sql`
        select d.id, d.executado_em as "executadoEm", d.documento, d.motivo,
          (select json_agg(json_build_object('item', i.nome, 'quantidade', di.quantidade::text, 'lote', l.codigo,
              'local', lo.nome, 'avariada', di.avariada))
             from devolucao_item di join item_estoque i on i.id = di.item_id join local lo on lo.id = di.local_id
               left join lote_item l on l.id = di.lote_item_id where di.devolucao_id = d.id) as itens
        from devolucao d where d.saida_id = ${sa.id} order by d.executado_em`);
      const [pessoa] = sa.pessoaId
        ? (
            await ctx.tx.execute<{ nome: string }>(
              sql`select f.nome from pessoa p join ficha f on f.id = p.ficha_id where p.id = ${sa.pessoaId}`,
            )
          ).rows
        : [];
      const [nota] = sa.nfeId
        ? await ctx.tx
            .select({ numero: s.nfe.numero, serie: s.nfe.serie })
            .from(s.nfe)
            .where(eq(s.nfe.id, sa.nfeId))
        : [];
      const [titular] = sa.titularId
        ? (
            await ctx.tx.execute<{ nome: string }>(
              sql`select f.nome from pessoa p join ficha f on f.id = p.ficha_id where p.id = ${sa.titularId}`,
            )
          ).rows
        : [];
      return {
        ...sa,
        pessoa: pessoa?.nome ?? null,
        titular: titular?.nome ?? null,
        nota: nota ?? null,
        baixas: baixas.rows,
        devolucoes: devolucoes.rows,
      };
    }),
  );

  app.post<{ Params: { id: string } }>('/api/saidas/:id/estorno', async (req) =>
    naEmpresa(db, req, [F, 'estornar'], async (ctx) => {
      const { motivo } = estornoOperacao.parse(req.body);
      return estornarSaida(ctx, z.uuid().parse(req.params.id), motivo);
    }),
  );

  /** Devolução: cada baixa volta ao mesmo lote, no local escolhido (o de venda ou "avariadas"). */
  app.post<{ Params: { id: string } }>('/api/saidas/:id/devolucao', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento();
      const id = z.uuid().parse(req.params.id);
      const d = devolucaoSaida.parse(req.body);
      const [sa] = await ctx.tx
        .select()
        .from(s.saida)
        .where(and(eq(s.saida.id, id), eq(s.saida.empresaId, ctx.empresaId)))
        .for('update');
      if (!sa || sa.estabelecimentoId !== estab)
        throw new ErroNaoEncontrado('Saída não encontrada.');
      if (sa.situacao !== 'lancada') throw new ErroRegra('A saída foi estornada.', 'situacao');
      const baixas = await ctx.tx.execute<{
        id: string;
        item_id: string;
        lote_item_id: string | null;
        quantidade: string;
        devolvido: string;
      }>(sql`
        select b.id, si.item_id, b.lote_item_id, b.quantidade::text,
          (select coalesce(sum(di.quantidade), 0)::text from devolucao_item di where di.baixa_id = b.id) as devolvido
        from saida_baixa b join saida_item si on si.id = b.saida_item_id where si.saida_id = ${sa.id}`);
      const movimentos: MovimentoNovo[] = [];
      for (const i of d.itens) {
        const b = baixas.rows.find((x) => x.id === i.baixaId);
        if (!b) throw new ErroRegra('Item fora da saída.', 'baixa');
        const resta = paraMil(b.quantidade) - paraMil(b.devolvido);
        if (paraMil(i.quantidade) > resta)
          throw new ErroRegra(`Volta mais do que saiu: restam ${qtdBr(resta)}.`, 'quantidade');
        movimentos.push({
          localId: i.localId,
          itemId: b.item_id,
          loteItemId: b.lote_item_id,
          quantidade: deMil(paraMil(i.quantidade)),
          tipo: 'devolucao',
          documento: d.documento ?? sa.documento,
          motivo: d.motivo ?? null,
          semLote: !b.lote_item_id,
        });
      }
      const executadoEm = dataExecucao(d.executadoEm);
      const r = await lancarEstoque(ctx, { estabelecimentoId: estab, executadoEm, movimentos });
      const [dev] = await ctx.tx
        .insert(s.devolucao)
        .values({
          empresaId: ctx.empresaId,
          estabelecimentoId: estab,
          saidaId: sa.id,
          executadoEm,
          documento: d.documento ?? null,
          motivo: d.motivo ?? null,
          grupoId: r.grupoId,
          criadoPor: ctx.usuarioId,
        })
        .returning({ id: s.devolucao.id });
      await ctx.tx.insert(s.devolucaoItem).values(
        d.itens.map((i, n) => ({
          empresaId: ctx.empresaId,
          devolucaoId: dev!.id,
          baixaId: i.baixaId,
          itemId: movimentos[n]!.itemId,
          loteItemId: movimentos[n]!.loteItemId ?? null,
          localId: i.localId,
          quantidade: movimentos[n]!.quantidade,
          avariada: i.avariada,
          movimentoId: r.ids[n]!,
        })),
      );
      await ctx.auditar({
        acao: 'criar',
        entidade: 'devolucao',
        registroId: dev!.id,
        dados: { saidaId: sa.id, itens: d.itens.length },
      });
      return { id: dev!.id };
    }),
  );

  /**
   * Recolhimento (cantina.md, Quem recebeu cada lote): as saídas do lote comercial (todos os
   * formatos), com o destinatário, a quantidade e o que voltou; e quantas saídas do mesmo produto
   * foram sem lote no período do lote.
   */
  app.get<{ Params: { id: string } }>('/api/lotes-comerciais/:id/destinos', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento();
      const [lc] = await ctx.tx
        .select()
        .from(s.loteComercial)
        .where(
          and(
            eq(s.loteComercial.id, z.uuid().parse(req.params.id)),
            eq(s.loteComercial.empresaId, ctx.empresaId),
          ),
        );
      if (!lc || lc.estabelecimentoId !== estab)
        throw new ErroNaoEncontrado('Lote não encontrado.');
      const lotes = await ctx.tx
        .select({ id: s.loteItem.id, itemId: s.loteItem.itemId })
        .from(s.loteItem)
        .where(and(eq(s.loteItem.estabelecimentoId, estab), eq(s.loteItem.codigo, lc.codigo)));
      const ids = lotes.map((l) => l.id);
      const destinos = ids.length
        ? await ctx.tx.execute<Record<string, unknown>>(sql`
            select sa.id as "saidaId", sa.executado_em as "executadoEm", sa.tipo, sa.documento,
              coalesce(sa.destinatario_nome, (select f.nome from pessoa p join ficha f on f.id = p.ficha_id where p.id = sa.pessoa_id)) as destinatario,
              sa.destinatario_documento as "destinatarioDocumento", i.nome as item, b.quantidade::text as quantidade,
              (select coalesce(sum(di.quantidade), 0)::text from devolucao_item di where di.baixa_id = b.id) as devolvido
            from saida_baixa b join saida_item si on si.id = b.saida_item_id join saida sa on sa.id = si.saida_id
              join item_estoque i on i.id = si.item_id
            where b.lote_item_id in ${sql.raw(`(${ids.map((x) => `'${x}'`).join(',')})`)} and sa.situacao = 'lancada'
            order by sa.executado_em`)
        : { rows: [] };
      const itens = [...new Set(lotes.map((l) => l.itemId))];
      const [semLote] = itens.length
        ? (
            await ctx.tx.execute<{ n: number }>(sql`
              select count(distinct sa.id)::int as n from saida_baixa b join saida_item si on si.id = b.saida_item_id
                join saida sa on sa.id = si.saida_id
              where b.lote_item_id is null and sa.situacao = 'lancada'
                and si.item_id in ${sql.raw(`(${itens.map((x) => `'${x}'`).join(',')})`)}
                ${lc.primeiroEnvase ? sql`and sa.executado_em >= ${lc.primeiroEnvase}` : sql``}`)
          ).rows
        : [{ n: 0 }];
      return { codigo: lc.codigo, destinos: destinos.rows, saidasSemLote: semLote?.n ?? 0 };
    }),
  );

  /** Produtos acabados com saldo no local, por lote (para a saída manual). */
  app.get('/api/saidas/disponivel', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento();
      const { local, titular, insumos } = z
        .object({
          local: z.uuid(),
          /** Dono do produto; vazio = a própria empresa. */
          titular: z.uuid().optional(),
          /** Devolução ao titular: também os insumos dele. */
          insumos: z.enum(['sim']).optional(),
        })
        .parse(req.query);
      const r = await ctx.tx.execute<{
        item_id: string;
        item: string;
        lote_id: string | null;
        lote: string | null;
        saldo: string;
      }>(sql`
        select i.id as item_id, i.nome as item, l.id as lote_id, l.codigo as lote, sum(m.quantidade)::text as saldo
        from movimento_estoque m join item_estoque i on i.id = m.item_id left join lote_item l on l.id = m.lote_item_id
        where m.estabelecimento_id = ${estab} and m.local_id = ${local}
          and ${insumos && titular ? sql`true` : sql`i.tipo = 'produto_acabado'`}
          and l.titular_id is not distinct from ${titular ?? null}::uuid
        group by i.id, i.nome, l.id, l.codigo, l.criado_em having sum(m.quantidade) <> 0
        order by i.nome, l.criado_em`);
      const porItem = new Map<
        string,
        {
          itemId: string;
          item: string;
          saldo: number;
          lotes: Array<{ id: string; codigo: string; saldo: string }>;
        }
      >();
      for (const x of r.rows) {
        const atual = porItem.get(x.item_id) ?? {
          itemId: x.item_id,
          item: x.item,
          saldo: 0,
          lotes: [],
        };
        atual.saldo += paraMil(x.saldo);
        if (x.lote_id && paraMil(x.saldo) > 0)
          atual.lotes.push({ id: x.lote_id, codigo: x.lote!, saldo: deMil(paraMil(x.saldo)) });
        porItem.set(x.item_id, atual);
      }
      return [...porItem.values()].map((x) => ({ ...x, saldo: deMil(x.saldo) }));
    }),
  );
}
