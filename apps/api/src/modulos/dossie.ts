// EnoTrace › Terceiros › Dossiês (cantina.md, Dossiê do lote para o cliente; 04, roteiro do ciclo 10,
// bloco 4). O dossiê é como a cantina entrega ao cliente os registros do vinho dele: contrato e texto
// do rótulo, recepção (uva e notas de remessa), granel recebido, operações, análises, insumos e
// doses, rendimento, recipientes, envase, devoluções e transferências. Gerado, fica guardado como
// fotografia (data e autor), já formatado em seções: a tela imprime (PDF pelo navegador) e exporta
// (CSV), e o e-mail leva o mesmo conteúdo no corpo, com o registro de cada envio.
import {
  TIPOS_OPERACAO,
  formatarDecimal,
  formatarDocumento,
  MOTIVOS_TITULARIDADE,
} from '@vinicycle/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as s from '../db/schema';
import { enfileirarEmail } from '../nucleo/email';
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros';
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao';
import { textoDoContrato } from './contratos';
import { historia } from './producao/historia';
import { transferenciaValida } from './titularidade';

export interface SecaoDossie {
  titulo: string;
  cabecalho: string[];
  linhas: string[][];
  vazio: string;
}

export interface ConteudoDossie {
  titulo: string;
  geradoEm: string;
  geradoPor: string | null;
  identificacao: Array<[string, string]>;
  secoes: SecaoDossie[];
}

const lista = (ids: string[]) => sql.raw(`(${ids.map((x) => `'${x}'`).join(',')})`);
const t = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const num = (v: unknown, casas: number) =>
  v === null || v === undefined ? '—' : formatarDecimal(String(v), casas);

function parte(f: { nome: string; tipo: string | null; documento: string | null } | undefined) {
  if (!f) return '—';
  if (!f.documento) return f.nome;
  const doc =
    f.tipo === 'cpf' || f.tipo === 'cnpj' ? formatarDocumento(f.tipo, f.documento) : f.documento;
  return `${f.nome} (${f.tipo === 'cpf' ? 'CPF' : f.tipo === 'cnpj' ? 'CNPJ' : 'doc.'} ${doc})`;
}

/** Monta o dossiê de um lote de produção ou de um lote comercial de cliente. */
export async function montarDossie(
  ctx: ContextoEmpresa,
  partida: { loteId?: string | null; loteComercialId?: string | null },
): Promise<{ titularId: string; estabelecimentoId: string; conteudo: ConteudoDossie }> {
  const e = ctx.empresaId;
  // Titular e estabelecimento do ponto de partida.
  const [p] = partida.loteId
    ? (
        await ctx.tx.execute<{ titular: string | null; estab: string; codigo: string }>(sql`
          select titular_id as titular, estabelecimento_id as estab, codigo from lote
          where id = ${partida.loteId} and empresa_id = ${e}`)
      ).rows
    : (
        await ctx.tx.execute<{ titular: string | null; estab: string; codigo: string }>(sql`
          select titular_id as titular, estabelecimento_id as estab, codigo from lote_comercial
          where id = ${partida.loteComercialId} and empresa_id = ${e}`)
      ).rows;
  if (!p) throw new ErroNaoEncontrado('Lote não encontrado.');
  if (!(await ctx.estabelecimentosPermitidos()).includes(p.estab))
    throw new ErroNaoEncontrado('Lote não encontrado.');
  if (!p.titular)
    throw new ErroRegra(
      'O dossiê é do vinho de um cliente de vinificação: este lote é da própria empresa.',
      'titular',
    );
  const h = await historia(
    ctx,
    partida.loteId ? { lote: partida.loteId } : { loteComercial: partida.loteComercialId! },
  );
  const [estab] = (
    await ctx.tx.execute<{ fuso: string; registro: string | null }>(sql`
      select fuso, registro_mapa as registro from estabelecimento where id = ${p.estab}`)
  ).rows;
  const fuso = estab!.fuso;
  const dh = (v: unknown) =>
    v
      ? new Intl.DateTimeFormat('pt-BR', {
          timeZone: fuso,
          dateStyle: 'short',
          timeStyle: 'short',
        }).format(new Date(String(v)))
      : '—';
  const dia = (v: unknown) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
  const fichas = await ctx.tx.execute<{
    quem: string;
    nome: string;
    tipo: string | null;
    documento: string | null;
  }>(sql`
    select 'cliente' as quem, f.nome, f.tipo_documento as tipo, f.documento
      from pessoa pe join ficha f on f.id = pe.ficha_id where pe.id = ${p.titular}
    union all
    select 'cantina', f.nome, f.tipo_documento, f.documento
      from estabelecimento es join ficha f on f.id = es.ficha_id where es.id = ${p.estab}`);
  const ficha = (q: string) => fichas.rows.find((x) => x.quem === q);
  const lotes = h.lotes.map((l) => String(l.id));
  const [autor] = (
    await ctx.tx.execute<{ nome: string }>(sql`
      select f.nome from usuario u join ficha f on f.id = u.ficha_id where u.id = ${ctx.usuarioId}`)
  ).rows;

  // Contrato vigente com o cliente e o texto do rótulo.
  const [contrato] = await ctx.tx
    .select()
    .from(s.contratoTerceirizacao)
    .where(
      and(
        eq(s.contratoTerceirizacao.empresaId, e),
        eq(s.contratoTerceirizacao.contraparteId, p.titular),
        eq(s.contratoTerceirizacao.sentido, 'prestamos'),
        eq(s.contratoTerceirizacao.ativo, true),
      ),
    )
    .orderBy(desc(s.contratoTerceirizacao.vigenciaInicio))
    .limit(1);

  const vazio = { rows: [] as Array<Record<string, unknown>> };
  const recepcao = lotes.length
    ? await ctx.tx.execute<Record<string, unknown>>(sql`
        select distinct r.codigo, r.chegada_em as chegada, v.nome as variedade, ri.safra,
          (select sum(pe.bruto_kg - pe.tara_kg) from pesagem pe where pe.item_id = ri.id)::text as kg,
          r.nf_numero as nota, r.nf_chave as chave,
          (select coalesce(c.numero, 'sem número') from contrato_terceirizacao c where c.id = r.contrato_id) as contrato
        from movimento_uva mu join romaneio_item ri on ri.id = mu.item_id join romaneio r on r.id = ri.romaneio_id
          join variedade v on v.id = ri.variedade_id join operacao o on o.id = mu.operacao_id
        where mu.lote_id in ${lista(lotes)} and o.situacao = 'confirmada' and o.tipo <> 'estorno'
        order by r.chegada_em`)
    : vazio;
  const granel = lotes.length
    ? await ctx.tx.execute<Record<string, unknown>>(sql`
        select o.codigo, o.executado_em as data, o.tipo as operacao, g.tipo, g.nota_numero as nota, g.glt,
          sum(m.litros)::text as litros
        from movimento_volume m join operacao o on o.id = m.operacao_id join operacao_granel g on g.operacao_id = o.id
        where m.lote_id in ${lista(lotes)} and o.situacao = 'confirmada'
        group by o.id, o.codigo, o.executado_em, o.tipo, g.tipo, g.nota_numero, g.glt
        order by o.executado_em`)
    : vazio;
  const insumos = lotes.length
    ? await ctx.tx.execute<Record<string, unknown>>(sql`
        select o.executado_em as data, o.codigo as operacao, coalesce(i.nome, x.descricao) as insumo,
          li.codigo as lote_insumo, x.dose::text as dose, x.unidade, x.quantidade::text as quantidade,
          i.unidade_base as unidade_base, rc.codigo as recipiente, l.codigo as lote,
          case when x.item_id is null then 'trazido pelo cliente (não estocado)'
            when li.titular_id is not null then 'do cliente' else 'da cantina' end as fornecido
        from operacao_insumo x join operacao o on o.id = x.operacao_id and o.situacao = 'confirmada'
          left join item_estoque i on i.id = x.item_id left join lote_item li on li.id = x.lote_item_id
          join recipiente rc on rc.id = x.recipiente_id join lote l on l.id = x.lote_id
        where x.lote_id in ${lista(lotes)} order by o.executado_em`)
    : vazio;
  const recipientes = lotes.length
    ? await ctx.tx.execute<Record<string, unknown>>(sql`
        select rc.codigo, tr.nome as tipo, rc.capacidade_litros::text as capacidade,
          min(m.executado_em) as desde, max(m.executado_em) as ate
        from movimento_volume m join recipiente rc on rc.id = m.recipiente_id
          left join tipo_recipiente tr on tr.id = rc.tipo_recipiente_id
          join operacao o on o.id = m.operacao_id
        where m.lote_id in ${lista(lotes)} and o.situacao = 'confirmada' and o.tipo <> 'estorno'
        group by rc.codigo, tr.nome, rc.capacidade_litros order by min(m.executado_em)`)
    : vazio;
  const rendimentos = lotes.length
    ? await ctx.tx.execute<Record<string, unknown>>(sql`
        select codigo, rendimento_real::text as rendimento from lote where id in ${lista(lotes)}`)
    : vazio;
  const devolucoesGarrafas = await ctx.tx.execute<Record<string, unknown>>(sql`
    select sa.executado_em as data, sa.tipo, sa.documento, i.nome as item, li.codigo as lote, b.quantidade::text as quantidade,
      coalesce(sa.destinatario_nome, (select f.nome from pessoa pe join ficha f on f.id = pe.ficha_id where pe.id = sa.pessoa_id)) as destinatario
    from saida sa join saida_item si on si.saida_id = sa.id join saida_baixa b on b.saida_item_id = si.id
      join item_estoque i on i.id = si.item_id left join lote_item li on li.id = b.lote_item_id
    where sa.empresa_id = ${e} and sa.situacao = 'lancada' and sa.titular_id = ${p.titular}
      and sa.tipo in ('devolucao_titular', 'entrega_ordem_titular')
      ${h.envases.length ? sql`and li.codigo in ${sql.raw(`(${h.envases.map((x) => `'${String(x.codigo).replace(/'/g, "''")}'`).join(',')})`)}` : sql`and false`}
    order by sa.executado_em`);
  const transferencias = await ctx.tx.execute<Record<string, unknown>>(sql`
    select executado_em as data, forma, motivo, litros::text as litros, garrafas,
      (select f.nome from pessoa pe join ficha f on f.id = pe.ficha_id where pe.id = para_titular_id) as para
    from transferencia_titularidade
    where empresa_id = ${e} and de_titular_id = ${p.titular} and ${transferenciaValida}
      and (operacao_id in (select distinct m.operacao_id from movimento_volume m where m.lote_id in ${lotes.length ? lista(lotes) : sql.raw("('00000000-0000-0000-0000-000000000000')")})
        or forma = 'estoque')
    order by executado_em`);

  const ORIGENS_LOTE: Record<string, string> = {
    recepcao: 'Recepção da uva',
    corte: 'Corte',
    divisao: 'Divisão',
    granel: 'Entrada de granel',
    retorno_terceiro: 'Retorno de terceiro',
    titularidade: 'Transferência de titularidade',
    carga_inicial: 'Carga inicial',
  };
  const tipoOp = (v: unknown) => TIPOS_OPERACAO[v as keyof typeof TIPOS_OPERACAO] ?? t(v);
  const identificacao: Array<[string, string]> = [
    ['Cliente', parte(ficha('cliente'))],
    [
      'Cantina',
      `${parte(ficha('cantina'))}${estab?.registro ? ` · registro MAPA ${estab.registro}` : ''}`,
    ],
    [
      'Contrato',
      contrato
        ? `${contrato.numero ?? 'sem número'} · desde ${dia(contrato.vigenciaInicio)}${contrato.vigenciaFim ? ` até ${dia(contrato.vigenciaFim)}` : ''}`
        : 'sem contrato de terceirização ativo',
    ],
    ['Texto do rótulo', contrato ? await textoDoContrato(ctx, contrato) : '—'],
  ];
  const secoes: SecaoDossie[] = [
    {
      titulo: 'Lotes de produção',
      cabecalho: ['Lote', 'Projeto', 'Origem', 'Titular', 'Rendimento (L/kg)', 'Saldo (L)'],
      linhas: h.lotes.map((l) => [
        t(l.codigo),
        `${t(l.projeto)} · ${t(l.projetoNome)}`,
        ORIGENS_LOTE[String(l.origem)] ?? t(l.origem),
        t(l.titular),
        num(rendimentos.rows.find((r) => r.codigo === l.codigo)?.rendimento, 4),
        num(l.saldo, 2),
      ]),
      vazio: 'Nenhum lote.',
    },
    {
      titulo: 'Recepção da uva',
      cabecalho: ['Romaneio', 'Chegada', 'Variedade', 'Safra', 'kg', 'Nota de remessa', 'Contrato'],
      linhas: recepcao.rows.map((r) => [
        t(r.codigo),
        dh(r.chegada),
        t(r.variedade),
        t(r.safra),
        num(r.kg, 1),
        [r.nota, r.chave].filter(Boolean).join(' · ') || '—',
        t(r.contrato),
      ]),
      vazio: 'Sem uva recebida (o vinho veio a granel ou da carga inicial).',
    },
    {
      titulo: 'Granel recebido e devolvido',
      cabecalho: ['Data', 'Operação', 'Tipo', 'Nota', 'GLT', 'Litros'],
      linhas: granel.rows.map((g) => [
        dh(g.data),
        t(g.codigo),
        `${tipoOp(g.operacao)} · ${t(g.tipo).replace(/_/g, ' ')}`,
        t(g.nota),
        t(g.glt),
        num(g.litros, 2),
      ]),
      vazio: 'Sem entrada ou saída a granel.',
    },
    {
      titulo: 'Operações',
      cabecalho: ['Data', 'Operação', 'Tipo', 'Recipientes', 'Litros dos lotes', 'Responsável'],
      linhas: h.operacoes.map((o) => [
        dh(o.executadoEm),
        t(o.codigo),
        `${tipoOp(o.tipo)}${o.situacao === 'estornada' ? ' (estornada)' : ''}`,
        t(o.recipientes),
        num(o.litros, 2),
        t(o.responsavel),
      ]),
      vazio: 'Nenhuma operação.',
    },
    {
      titulo: 'Análises e laudos',
      cabecalho: ['Amostra', 'Tipo', 'Laboratório', 'Lote', 'Resultados'],
      linhas: h.analises.map((a) => [
        dh(a.amostraEm),
        a.tipo === 'laudo' ? `Laudo${a.documento ? ` ${t(a.documento)}` : ''}` : 'Interna',
        t(a.laboratorio),
        t(a.lote),
        t(a.resultados),
      ]),
      vazio: 'Nenhuma análise.',
    },
    {
      titulo: 'Insumos e doses',
      cabecalho: [
        'Data',
        'Operação',
        'Insumo',
        'Lote do insumo',
        'Dose',
        'Quantidade',
        'Recipiente',
        'Fornecido',
      ],
      linhas: insumos.rows.map((i) => [
        dh(i.data),
        t(i.operacao),
        t(i.insumo),
        t(i.lote_insumo),
        `${num(i.dose, 2)} ${t(i.unidade)}`,
        i.quantidade ? `${num(i.quantidade, 3)} ${t(i.unidade_base)}` : '—',
        t(i.recipiente),
        t(i.fornecido),
      ]),
      vazio: 'Nenhum insumo.',
    },
    {
      titulo: 'Recipientes',
      cabecalho: ['Recipiente', 'Tipo', 'Capacidade (L)', 'Desde', 'Até'],
      linhas: recipientes.rows.map((r) => [
        t(r.codigo),
        t(r.tipo),
        num(r.capacidade, 2),
        dh(r.desde),
        dh(r.ate),
      ]),
      vazio: 'Nenhum recipiente.',
    },
    {
      titulo: 'Cortes e genealogia',
      cabecalho: ['Data', 'Operação', 'Ligação', 'De', 'Para', 'Litros'],
      linhas: h.genealogia.map((g) => [
        dh(g.executadoEm),
        t(g.operacao),
        t(g.tipo).replace(/_/g, ' '),
        t(g.origem),
        t(g.destino),
        num(g.litros, 2),
      ]),
      vazio: 'Sem corte, incorporação ou divisão.',
    },
    {
      titulo: 'Engarrafamento (lotes comerciais)',
      cabecalho: [
        'Lote comercial',
        'Produto',
        'Litros',
        'Primeiro envase',
        'Último envase',
        'Em estoque (garrafas)',
      ],
      linhas: h.envases.map((x) => [
        t(x.codigo),
        t(x.produto),
        num(x.litros, 2),
        dh(x.primeiroEnvase),
        dh(x.ultimoEnvase),
        num(x.saldo, 0),
      ]),
      vazio: 'Ainda não engarrafado.',
    },
    {
      titulo: 'Devoluções e entregas de garrafas',
      cabecalho: ['Data', 'Tipo', 'Destinatário', 'Produto', 'Lote', 'Quantidade', 'Documento'],
      linhas: devolucoesGarrafas.rows.map((x) => [
        dh(x.data),
        x.tipo === 'devolucao_titular' ? 'Devolução ao titular' : 'Entrega por ordem do titular',
        t(x.destinatario),
        t(x.item),
        t(x.lote),
        num(x.quantidade, 0),
        t(x.documento),
      ]),
      vazio: 'Nenhuma devolução ou entrega de garrafas.',
    },
    {
      titulo: 'Transferências de titularidade',
      cabecalho: ['Data', 'Forma', 'Motivo', 'Para', 'Litros', 'Garrafas'],
      linhas: transferencias.rows.map((x) => [
        dh(x.data),
        x.forma === 'granel' ? 'A granel' : 'No estoque',
        MOTIVOS_TITULARIDADE[x.motivo as keyof typeof MOTIVOS_TITULARIDADE] ?? t(x.motivo),
        t(x.para ?? 'a cantina'),
        num(x.litros, 2),
        num(x.garrafas, 0),
      ]),
      vazio: 'Nenhuma transferência.',
    },
  ];
  return {
    titularId: p.titular,
    estabelecimentoId: p.estab,
    conteudo: {
      titulo: `Dossiê · ${h.titulo}`,
      geradoEm: new Date().toISOString(),
      geradoPor: autor?.nome ?? null,
      identificacao,
      secoes,
    },
  };
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** O dossiê em HTML, para o corpo do e-mail. */
export function dossieHtml(c: ConteudoDossie, geradoEm: string): string {
  const tabela = (sec: SecaoDossie) =>
    sec.linhas.length
      ? `<table style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr>${sec.cabecalho.map((h) => `<th style="text-align:left;border-bottom:1px solid #ccc;padding:4px">${esc(h)}</th>`).join('')}</tr></thead><tbody>${sec.linhas.map((l) => `<tr>${l.map((x) => `<td style="border-bottom:1px solid #eee;padding:4px;vertical-align:top">${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      : `<p style="color:#666;font-size:12px">${esc(sec.vazio)}</p>`;
  return `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#222;max-width:900px;margin:auto;padding:24px">
<p style="font-size:20px;font-weight:bold;color:#6b1f3a">ViniCycle</p>
<h1 style="font-size:18px">${esc(c.titulo)}</h1>
<p style="font-size:12px;color:#666">Gerado em ${esc(geradoEm)}${c.geradoPor ? ` por ${esc(c.geradoPor)}` : ''}.</p>
<table style="font-size:13px;margin-bottom:16px">${c.identificacao.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#666">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
${c.secoes.map((sec) => `<h2 style="font-size:15px;margin-top:20px">${esc(sec.titulo)}</h2>${tabela(sec)}`).join('\n')}
</body></html>`;
}

/** O dossiê em texto simples, para o e-mail sem HTML. */
function dossieTexto(c: ConteudoDossie, geradoEm: string): string {
  return [
    c.titulo,
    `Gerado em ${geradoEm}${c.geradoPor ? ` por ${c.geradoPor}` : ''}.`,
    ...c.identificacao.map(([k, v]) => `${k}: ${v}`),
    ...c.secoes.map(
      (sec) =>
        `\n${sec.titulo}\n${sec.linhas.length ? [sec.cabecalho.join(' | '), ...sec.linhas.map((l) => l.join(' | '))].join('\n') : sec.vazio}`,
    ),
    '\nViniCycle',
  ].join('\n');
}

const F = 'enotrace.relatorios';

export async function rotasDossie(app: FastifyInstance): Promise<void> {
  const { db } = app.deps;

  // Lotes de produção e lotes comerciais de um cliente, para escolher o ponto de partida.
  app.get('/api/terceiros/lotes-do-cliente', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const { titularId } = z.object({ titularId: z.uuid() }).parse(req.query);
      const estabs = await ctx.estabelecimentosPermitidos();
      if (!estabs.length) return { lotes: [], comerciais: [] };
      const lotes = await ctx.tx.execute<{
        id: string;
        codigo: string;
        projeto: string;
        saldo: string;
      }>(sql`
        select l.id, l.codigo, p.codigo || ' · ' || p.nome as projeto,
          coalesce((select sum(m.litros) from movimento_volume m where m.lote_id = l.id), 0)::text as saldo
        from lote l join projeto p on p.id = l.projeto_id
        where l.empresa_id = ${ctx.empresaId} and l.titular_id = ${titularId} and l.estabelecimento_id in ${lista(estabs)}
        order by l.codigo desc`);
      const comerciais = await ctx.tx.execute<{
        id: string;
        codigo: string;
        produto: string | null;
      }>(sql`
        select lc.id, lc.codigo, pr.nome as produto from lote_comercial lc left join produto pr on pr.id = lc.produto_id
        where lc.empresa_id = ${ctx.empresaId} and lc.titular_id = ${titularId} and lc.estabelecimento_id in ${lista(estabs)}
        order by lc.codigo desc`);
      return { lotes: lotes.rows, comerciais: comerciais.rows };
    }),
  );

  app.get('/api/terceiros/dossies', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const q = z.object({ titularId: z.uuid().optional() }).parse(req.query);
      const estabs = await ctx.estabelecimentosPermitidos();
      if (!estabs.length) return [];
      const r = await ctx.tx.execute<Record<string, unknown>>(sql`
        select d.id, d.titulo, d.criado_em as "geradoEm", d.titular_id as "titularId",
          (select f.nome from pessoa pe join ficha f on f.id = pe.ficha_id where pe.id = d.titular_id) as titular,
          (select count(*)::int from dossie_envio x where x.dossie_id = d.id) as envios
        from dossie d
        where d.empresa_id = ${ctx.empresaId} and d.estabelecimento_id in ${lista(estabs)}
          ${q.titularId ? sql`and d.titular_id = ${q.titularId}` : sql``}
        order by d.criado_em desc`);
      return r.rows;
    }),
  );

  app.post('/api/terceiros/dossies', async (req) =>
    naEmpresa(db, req, [F, 'exportar'], async (ctx) => {
      const d = z
        .object({ loteId: z.uuid().optional(), loteComercialId: z.uuid().optional() })
        .refine(
          (x) => !!x.loteId !== !!x.loteComercialId,
          'Escolha o lote de produção ou o lote comercial',
        )
        .parse(req.body);
      const m = await montarDossie(ctx, d);
      const [r] = await ctx.tx
        .insert(s.dossie)
        .values({
          empresaId: ctx.empresaId,
          estabelecimentoId: m.estabelecimentoId,
          titularId: m.titularId,
          loteId: d.loteId ?? null,
          loteComercialId: d.loteComercialId ?? null,
          titulo: m.conteudo.titulo,
          conteudo: m.conteudo,
          criadoPor: ctx.usuarioId,
        })
        .returning({ id: s.dossie.id });
      await ctx.auditar({
        acao: 'criar',
        entidade: 'dossie',
        registroId: r!.id,
        dados: { titulo: m.conteudo.titulo },
      });
      return { id: r!.id };
    }),
  );

  const carregar = async (ctx: ContextoEmpresa, id: string) => {
    const [d] = await ctx.tx
      .select()
      .from(s.dossie)
      .where(and(eq(s.dossie.id, id), eq(s.dossie.empresaId, ctx.empresaId)));
    if (!d || !(await ctx.estabelecimentosPermitidos()).includes(d.estabelecimentoId))
      throw new ErroNaoEncontrado('Dossiê não encontrado.');
    return d;
  };

  app.get<{ Params: { id: string } }>('/api/terceiros/dossies/:id', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const d = await carregar(ctx, z.uuid().parse(req.params.id));
      const envios = await ctx.tx.execute<Record<string, unknown>>(sql`
        select x.para, x.criado_em as "enviadoEm",
          (select f.nome from usuario u join ficha f on f.id = u.ficha_id where u.id = x.criado_por) as por
        from dossie_envio x where x.dossie_id = ${d.id} order by x.criado_em desc`);
      // E-mail principal do cliente, para o envio.
      const [email] = (
        await ctx.tx.execute<{ valor: string }>(sql`
          select c.valor from pessoa pe join ficha_contato c on c.ficha_id = pe.ficha_id
          where pe.id = ${d.titularId} and c.tipo = 'email' order by c.principal desc limit 1`)
      ).rows;
      return {
        id: d.id,
        titulo: d.titulo,
        titularId: d.titularId,
        geradoEm: d.criadoEm,
        conteudo: d.conteudo,
        envios: envios.rows,
        emailCliente: email?.valor ?? null,
      };
    }),
  );

  app.post<{ Params: { id: string } }>('/api/terceiros/dossies/:id/enviar', async (req) =>
    naEmpresa(db, req, [F, 'exportar'], async (ctx) => {
      const d = await carregar(ctx, z.uuid().parse(req.params.id));
      const { para } = z
        .object({ para: z.string().trim().toLowerCase().pipe(z.email('E-mail inválido')) })
        .parse(req.body);
      const c = d.conteudo as ConteudoDossie;
      const [estab] = (
        await ctx.tx.execute<{ fuso: string; nome: string }>(sql`
          select es.fuso, f.nome from estabelecimento es join ficha f on f.id = es.ficha_id where es.id = ${d.estabelecimentoId}`)
      ).rows;
      const geradoEm = new Intl.DateTimeFormat('pt-BR', {
        timeZone: estab!.fuso,
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(d.criadoEm);
      await enfileirarEmail(ctx.tx, {
        para,
        assunto: `${c.titulo} — ${estab!.nome}`,
        texto: dossieTexto(c, geradoEm),
        html: dossieHtml(c, geradoEm),
        modelo: 'dossie',
        origem: 'dossie',
        origemId: d.id,
        empresaId: ctx.empresaId,
      });
      await ctx.tx
        .insert(s.dossieEnvio)
        .values({ empresaId: ctx.empresaId, dossieId: d.id, para, criadoPor: ctx.usuarioId });
      await ctx.auditar({
        acao: 'criar',
        entidade: 'dossie_envio',
        registroId: d.id,
        dados: { para },
      });
      return { ok: true };
    }),
  );
}
