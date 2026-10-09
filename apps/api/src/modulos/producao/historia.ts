// Relatório de história do lote (cantina.md, Lote comercial, "Relatório de história"): a partir do
// lote comercial, de um lote de produção ou do projeto, a história completa do vinho para a
// fiscalização e o recolhimento: uvas de origem, operações e recipientes, insumos aplicados,
// análises e laudos, cortes e genealogia, envases e saídas. Os lotes de produção de origem entram
// pela genealogia (03-modelo-de-dados.md, seção 5, Raízes e folhas).
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ErroNaoEncontrado } from '../../nucleo/erros';
import { type ContextoEmpresa, naEmpresa } from '../../nucleo/requisicao';

const lista = (ids: string[]) => sql.raw(`(${ids.map((x) => `'${x}'`).join(',')})`);

/** Lotes de produção do ponto de partida e todos os de origem, subindo pela genealogia. */
async function lotesDaHistoria(ctx: ContextoEmpresa, inicio: string[]): Promise<string[]> {
  if (!inicio.length) return [];
  const r = await ctx.tx.execute<{ id: string }>(sql`
    with recursive ancestrais(id) as (
      select l.id from lote l where l.id in ${lista(inicio)}
      union
      select g.origem_lote_id from genealogia g join ancestrais a on a.id = g.destino_lote_id
      where not g.estornada
    ) select id from ancestrais`);
  return r.rows.map((x) => x.id);
}

export async function historia(
  ctx: ContextoEmpresa,
  partida: { lote?: string; loteComercial?: string; projeto?: string },
) {
  const e = ctx.empresaId;
  let titulo = '';
  let inicio: string[] = [];
  let comerciais: string[] = [];
  if (partida.loteComercial) {
    const [lc] = (
      await ctx.tx.execute<{ id: string; codigo: string; produto: string | null }>(sql`
        select lc.id, lc.codigo, p.nome as produto from lote_comercial lc left join produto p on p.id = lc.produto_id
        where lc.id = ${partida.loteComercial} and lc.empresa_id = ${e}`)
    ).rows;
    if (!lc) throw new ErroNaoEncontrado('Lote comercial não encontrado.');
    titulo = `Lote comercial ${lc.codigo}${lc.produto ? ` · ${lc.produto}` : ''}`;
    comerciais = [lc.id];
    inicio = (
      await ctx.tx.execute<{ lote_id: string }>(
        sql`select lote_id from lote_comercial_origem where lote_comercial_id = ${lc.id}`,
      )
    ).rows.map((x) => x.lote_id);
  } else if (partida.lote) {
    const [l] = (
      await ctx.tx.execute<{ id: string; codigo: string }>(
        sql`select id, codigo from lote where id = ${partida.lote} and empresa_id = ${e}`,
      )
    ).rows;
    if (!l) throw new ErroNaoEncontrado('Lote não encontrado.');
    titulo = `Lote de produção ${l.codigo}`;
    inicio = [l.id];
  } else if (partida.projeto) {
    const [p] = (
      await ctx.tx.execute<{ id: string; codigo: string; nome: string }>(
        sql`select id, codigo, nome from projeto where id = ${partida.projeto} and empresa_id = ${e}`,
      )
    ).rows;
    if (!p) throw new ErroNaoEncontrado('Projeto não encontrado.');
    titulo = `Projeto ${p.codigo} · ${p.nome}`;
    inicio = (
      await ctx.tx.execute<{ id: string }>(sql`select id from lote where projeto_id = ${p.id}`)
    ).rows.map((x) => x.id);
  }
  const lotes = await lotesDaHistoria(ctx, inicio);
  if (!comerciais.length && lotes.length)
    comerciais = (
      await ctx.tx.execute<{ lote_comercial_id: string }>(
        sql`select distinct lote_comercial_id from lote_comercial_origem where lote_id in ${lista(lotes)}`,
      )
    ).rows.map((x) => x.lote_comercial_id);
  const vazio = { rows: [] as Array<Record<string, unknown>> };

  const lotesInfo = lotes.length
    ? await ctx.tx.execute<Record<string, unknown>>(sql`
        select l.id, l.codigo, l.origem, l.situacao, l.safra, p.codigo as projeto, p.nome as "projetoNome", p.id as "projetoId",
          coalesce((select f.nome from pessoa pe join ficha f on f.id = pe.ficha_id where pe.id = l.titular_id), 'própria') as titular,
          coalesce((select sum(m.litros) from movimento_volume m where m.lote_id = l.id), 0)::text as saldo
        from lote l join projeto p on p.id = l.projeto_id
        where l.id in ${lista(lotes)} order by l.codigo`)
    : vazio;
  const uvas = lotes.length
    ? await ctx.tx.execute<Record<string, unknown>>(sql`
        select r.id as "romaneioId", r.codigo as romaneio, r.chegada_em as "chegadaEm", v.nome as variedade, ri.safra,
          ri.data_colheita as "dataColheita", ri.brix, ri.organica,
          coalesce((select f.nome from pessoa pe join ficha f on f.id = pe.ficha_id where pe.id = r.fornecedor_id), 'vinhedo próprio') as produtor,
          (select pr.nome || ' › ' || pa.nome from parcela pa join propriedade pr on pr.id = pa.propriedade_id where pa.id = ri.parcela_id) as parcela,
          l.codigo as lote, (-sum(mu.kg))::text as kg
        from movimento_uva mu join romaneio_item ri on ri.id = mu.item_id join romaneio r on r.id = ri.romaneio_id
          join variedade v on v.id = ri.variedade_id join lote l on l.id = mu.lote_id
          join operacao o on o.id = mu.operacao_id
        where mu.lote_id in ${lista(lotes)} and o.situacao = 'confirmada' and o.tipo <> 'estorno'
        group by r.id, r.codigo, r.chegada_em, v.nome, ri.safra, ri.data_colheita, ri.brix, ri.organica, r.fornecedor_id, ri.parcela_id, l.codigo
        order by r.chegada_em`)
    : vazio;
  const operacoes = lotes.length
    ? await ctx.tx.execute<Record<string, unknown>>(sql`
        select o.id, o.codigo, o.tipo, o.executado_em as "executadoEm", o.situacao,
          (select string_agg(distinct rc.codigo, ', ') from movimento_volume m join recipiente rc on rc.id = m.recipiente_id
             where m.operacao_id = o.id and m.lote_id in ${lista(lotes)}) as recipientes,
          (select sum(m.litros)::text from movimento_volume m where m.operacao_id = o.id and m.lote_id in ${lista(lotes)}) as litros,
          (select f.nome from pessoa pe join ficha f on f.id = pe.ficha_id where pe.id = o.responsavel_id) as responsavel
        from operacao o
        where o.empresa_id = ${e} and o.situacao in ('confirmada', 'estornada') and o.tipo <> 'estorno'
          and (exists (select 1 from movimento_volume m where m.operacao_id = o.id and m.lote_id in ${lista(lotes)})
            or exists (select 1 from operacao_insumo x where x.operacao_id = o.id and x.lote_id in ${lista(lotes)}))
        order by o.executado_em, o.lancado_em`)
    : vazio;
  const insumos = lotes.length
    ? await ctx.tx.execute<Record<string, unknown>>(sql`
        select o.codigo as operacao, o.executado_em as "executadoEm", coalesce(i.nome, x.descricao) as insumo,
          li.codigo as "loteInsumo", x.dose::text as dose, x.unidade, x.quantidade::text as quantidade,
          i.unidade_base as "unidadeBase", rc.codigo as recipiente, l.codigo as lote
        from operacao_insumo x join operacao o on o.id = x.operacao_id and o.situacao = 'confirmada'
          left join item_estoque i on i.id = x.item_id left join lote_item li on li.id = x.lote_item_id
          join recipiente rc on rc.id = x.recipiente_id join lote l on l.id = x.lote_id
        where x.lote_id in ${lista(lotes)} order by o.executado_em`)
    : vazio;
  const analises = lotes.length
    ? await ctx.tx.execute<Record<string, unknown>>(sql`
        select a.id, a.amostra_em as "amostraEm", a.tipo, a.documento, l.codigo as lote,
          (select f.nome from pessoa pe join ficha f on f.id = pe.ficha_id where pe.id = a.laboratorio_id) as laboratorio,
          (select string_agg(p.nome || ' ' || replace(trim(to_char(r.valor, 'FM999990.0999')), '.', ',') || case when p.unidade_padrao is null or p.unidade_padrao = 'pH' then '' else ' ' || p.unidade_padrao end || case when r.fora_faixa then ' (fora da faixa)' else '' end, '; ' order by p.ordem)
             from analise_resultado r join parametro_analise p on p.id = r.parametro_id where r.analise_id = a.id) as resultados
        from analise a join lote l on l.id = a.lote_id
        where a.lote_id in ${lista(lotes)} order by a.amostra_em`)
    : vazio;
  const genealogia = lotes.length
    ? await ctx.tx.execute<Record<string, unknown>>(sql`
        select g.tipo, g.litros::text as litros, lo.codigo as origem, ld.codigo as destino, o.codigo as operacao, o.executado_em as "executadoEm"
        from genealogia g join lote lo on lo.id = g.origem_lote_id join lote ld on ld.id = g.destino_lote_id
          join operacao o on o.id = g.operacao_id
        where not g.estornada and (g.origem_lote_id in ${lista(lotes)} or g.destino_lote_id in ${lista(lotes)})
        order by o.executado_em`)
    : vazio;
  const envases = comerciais.length
    ? await ctx.tx.execute<Record<string, unknown>>(sql`
        select lc.id, lc.codigo, lc.litros::text as litros, lc.primeiro_envase as "primeiroEnvase", lc.ultimo_envase as "ultimoEnvase",
          lc.composicao, lc.chaptalizado, pr.nome as produto, lc.origem,
          (select coalesce(sum(m.quantidade), 0)::text from movimento_estoque m join lote_item li on li.id = m.lote_item_id
             where li.codigo = lc.codigo and li.estabelecimento_id = lc.estabelecimento_id) as saldo
        from lote_comercial lc left join produto pr on pr.id = lc.produto_id
        where lc.id in ${lista(comerciais)} order by lc.codigo`)
    : vazio;
  const saidas = comerciais.length
    ? await ctx.tx.execute<Record<string, unknown>>(sql`
        select sa.id, sa.executado_em as "executadoEm", sa.tipo, sa.documento, lc.codigo as "loteComercial",
          coalesce(sa.destinatario_nome, 'consumidor não identificado') as destinatario, i.nome as item,
          b.quantidade::text as quantidade,
          (select coalesce(sum(di.quantidade), 0)::text from devolucao_item di where di.baixa_id = b.id) as devolvido
        from saida_baixa b join saida_item si on si.id = b.saida_item_id join saida sa on sa.id = si.saida_id
          join item_estoque i on i.id = si.item_id join lote_item li on li.id = b.lote_item_id
          join lote_comercial lc on lc.codigo = li.codigo and lc.estabelecimento_id = li.estabelecimento_id
        where lc.id in ${lista(comerciais)} and sa.situacao = 'lancada'
        order by sa.executado_em`)
    : vazio;
  return {
    titulo,
    geradoEm: new Date().toISOString(),
    lotes: lotesInfo.rows,
    uvas: uvas.rows,
    operacoes: operacoes.rows,
    insumos: insumos.rows,
    analises: analises.rows,
    genealogia: genealogia.rows,
    envases: envases.rows,
    saidas: saidas.rows,
  };
}

export async function rotasHistoria(app: FastifyInstance): Promise<void> {
  const { db } = app.deps;
  app.get('/api/historia', async (req) =>
    naEmpresa(db, req, ['enotrace.projetos', 'visualizar'], async (ctx) => {
      const q = z
        .object({
          lote: z.uuid().optional(),
          loteComercial: z.uuid().optional(),
          projeto: z.uuid().optional(),
        })
        .refine((x) => !!(x.lote || x.loteComercial || x.projeto), 'Escolha o lote ou o projeto')
        .parse(req.query);
      return historia(ctx, q);
    }),
  );
}
