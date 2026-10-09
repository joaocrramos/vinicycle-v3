// Relatórios agendados por e-mail (03-modelo-de-dados.md, 2.2; 04, roteiro do ciclo 8; P20, P27):
// cada usuário escolhe o relatório, o estabelecimento e a frequência (às 7h do fuso do
// estabelecimento). A tarefa de fundo monta o relatório com as permissões do usuário no momento do
// envio e põe o e-mail na fila (nucleo/email.ts). O e-mail leva o resumo e o link para a tela.
import {
  CANAIS_MENSAGEM,
  CHAVES_FREQUENCIA_ENVIO,
  CHAVES_RELATORIO_AGENDAVEL,
  type FrequenciaEnvio,
  formatarDecimal,
  RELATORIOS_AGENDAVEIS,
  NOMES_CANAL,
  type RelatorioAgendavel,
} from '@vinicycle/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { emContexto, type Db } from '../db/cliente';
import * as s from '../db/schema';
import { enfileirarEmail } from '../nucleo/email';
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros';
import { pode } from '../nucleo/permissoes';
import { comoUsuario, type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao';
import { varrerAlertas, visiveis } from './alertas';
import { enfileirarMensagem } from './mensagens';
import { limites, relatorio as relatorioDoMes } from './fechamento';

const TIPOS_ESTOQUE = ['estoque_minimo', 'validade', 'saldo_negativo'];

/** Próximo envio depois de agora, às 7h do fuso do estabelecimento. */
function proximoEnvio(frequencia: FrequenciaEnvio) {
  const local = sql`(now() at time zone e.fuso)`;
  const base =
    frequencia === 'diaria'
      ? sql`date_trunc('day', ${local}) + interval '1 day'`
      : frequencia === 'semanal'
        ? sql`date_trunc('week', ${local}) + interval '7 days'`
        : frequencia === 'quinzenal'
          ? sql`date_trunc('week', ${local}) + interval '14 days'`
          : sql`date_trunc('month', ${local}) + interval '1 month'`;
  return sql`((${base} + interval '7 hours') at time zone e.fuso)`;
}

const esc = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Conteudo {
  titulo: string;
  linhas: string[];
  vazio: boolean;
}

/** Monta o relatório com as permissões do usuário; nada se ele não vê mais a tela. */
async function montar(
  ctx: ContextoEmpresa,
  relatorio: RelatorioAgendavel,
  estab: string,
): Promise<Conteudo | { semPermissao: true }> {
  const def = RELATORIOS_AGENDAVEIS[relatorio];
  if (!pode(ctx.acesso, def.funcionalidade, 'visualizar')) return { semPermissao: true };
  if (relatorio === 'alertas' || relatorio === 'estoque') {
    await varrerAlertas(ctx);
    const todos = (await visiveis(ctx, 'aberto')).filter(
      (a) =>
        (!a.estabelecimentoId || a.estabelecimentoId === estab) &&
        (relatorio === 'alertas' || TIPOS_ESTOQUE.includes(a.tipo)),
    );
    const marca = { critico: '[crítico] ', atencao: '', info: '' } as Record<string, string>;
    return {
      titulo: def.nome,
      linhas: todos.map((a) => `${marca[a.gravidade] ?? ''}${a.mensagem}`),
      vazio: !todos.length,
    };
  }
  if (relatorio === 'mes') {
    const [d] = (
      await ctx.tx.execute<{ ano: number; mes: number }>(sql`
        select extract(year from m)::int as ano, extract(month from m)::int as mes
        from (select date_trunc('month', now() at time zone fuso) - interval '1 month' as m
          from estabelecimento where id = ${estab}) x`)
    ).rows;
    const { inicio, fim } = await limites(ctx, estab, d!.ano, d!.mes);
    const r = await relatorioDoMes(ctx, estab, inicio, fim);
    const g = r.granel;
    const L = (v: string) => `${formatarDecimal(v, 2)} L`;
    return {
      titulo: `Relatório de ${String(d!.mes).padStart(2, '0')}/${d!.ano}`,
      linhas: [
        `Granel: inicial ${L(g.inicial)}; entradas ${L(g.entradas)}; saídas ${L(g.saidas)}; ajustes ${L(g.ajustes)}; final ${L(g.final)}.`,
        ...r.produtos.map(
          (p) =>
            `${p.item}: inicial ${p.inicial}; entradas ${p.entradas}; saídas ${p.saidas}; final ${p.final} garrafas.`,
        ),
      ],
      vazio: false,
    };
  }
  // Painel: o vinho em cada recipiente.
  const p = await ctx.tx.execute<{
    codigo: string;
    capacidade: string;
    litros: string;
    lote: string | null;
    projeto: string | null;
  }>(sql`
    select r.codigo, r.capacidade_litros::text as capacidade, sum(m.litros)::text as litros,
      (array_agg(l.codigo order by l.codigo))[1] as lote, (array_agg(pr.nome order by l.codigo))[1] as projeto
    from movimento_volume m join recipiente r on r.id = m.recipiente_id
      join lote l on l.id = m.lote_id join projeto pr on pr.id = l.projeto_id
    where m.estabelecimento_id = ${estab}
    group by r.id, r.codigo, r.capacidade_litros having sum(m.litros) > 0
    order by r.codigo`);
  const total = p.rows.reduce((t, x) => t + Number(x.litros), 0);
  return {
    titulo: def.nome,
    linhas: [
      `Total a granel: ${formatarDecimal(total.toFixed(2), 2)} L em ${p.rows.length} recipientes.`,
      ...p.rows.map(
        (x) =>
          `${x.codigo}: ${formatarDecimal(x.litros, 2)} L de ${formatarDecimal(x.capacidade, 2)} L${x.lote ? ` · ${x.lote}` : ''}${x.projeto ? ` (${x.projeto})` : ''}`,
      ),
    ],
    vazio: !p.rows.length,
  };
}

/** Põe o e-mail do relatório na fila; devolve o aviso quando não sai. */
async function enviar(
  ctx: ContextoEmpresa,
  a: {
    id: string;
    relatorio: RelatorioAgendavel;
    estabelecimentoId: string;
    canal?: 'email' | 'whatsapp' | 'sms';
  },
  email: string,
  urlAplicacao: string,
): Promise<string | null> {
  const c = await montar(ctx, a.relatorio, a.estabelecimentoId);
  if ('semPermissao' in c) return 'Sem a permissão da tela deste relatório.';
  const [e] = (
    await ctx.tx.execute<{ nome: string }>(sql`
      select coalesce(f.nome_fantasia, f.nome) as nome from estabelecimento es join ficha f on f.id = es.ficha_id
      where es.id = ${a.estabelecimentoId}`)
  ).rows;
  const link = `${urlAplicacao.replace(/\/$/, '')}${RELATORIOS_AGENDAVEIS[a.relatorio].link}`;
  const corpo = c.vazio ? ['Nada a relatar.'] : c.linhas;
  // WhatsApp ou SMS: um resumo curto com o link; sem franquia, telefone ou canal, vai por e-mail.
  if (a.canal && a.canal !== 'email') {
    const texto = `ViniCycle · ${c.titulo} · ${e?.nome ?? ''}: ${corpo.slice(0, 5).join('; ')}${corpo.length > 5 ? ` e mais ${corpo.length - 5}` : ''}. ${link}`;
    const r = await enfileirarMensagem(ctx.tx, {
      empresaId: ctx.empresaId,
      usuarioId: ctx.usuarioId,
      canal: a.canal,
      texto,
      modelo: `relatorio_${a.relatorio}`,
      origem: 'relatorio_agendado',
      origemId: a.id,
    });
    if (r === 'enfileirada') return null;
    await enviarPorEmail(ctx, a, email, c.titulo, e?.nome ?? '', corpo, link);
    return {
      sem_integracao: `${NOMES_CANAL[a.canal]} ainda não está ativo na plataforma: enviado por e-mail.`,
      sem_telefone: `Sem telefone com ${NOMES_CANAL[a.canal]} no seu cadastro: enviado por e-mail.`,
      sem_franquia: `A franquia de ${NOMES_CANAL[a.canal]} da empresa acabou ou não foi contratada: enviado por e-mail.`,
    }[r];
  }
  await enviarPorEmail(ctx, a, email, c.titulo, e?.nome ?? '', corpo, link);
  return null;
}

async function enviarPorEmail(
  ctx: ContextoEmpresa,
  a: { id: string; relatorio: RelatorioAgendavel },
  email: string,
  titulo: string,
  estabelecimento: string,
  corpo: string[],
  link: string,
): Promise<void> {
  const c = { titulo };
  const e = { nome: estabelecimento };
  await enfileirarEmail(ctx.tx, {
    para: email,
    assunto: `ViniCycle · ${c.titulo} · ${e?.nome ?? ''}`,
    texto: `${c.titulo} — ${e?.nome ?? ''}\n\n${corpo.map((l) => `- ${l}`).join('\n')}\n\nVer no sistema: ${link}\n\nPara mudar ou parar este envio: Preferências › Relatórios por e-mail.`,
    html: `<p><strong>${esc(c.titulo)}</strong> — ${esc(e?.nome ?? '')}</p><ul>${corpo.map((l) => `<li>${esc(l)}</li>`).join('')}</ul><p><a href="${esc(link)}">Ver no sistema</a></p><p style="color:#666;font-size:12px">Para mudar ou parar este envio: Preferências › Relatórios por e-mail.</p>`,
    modelo: `relatorio_${a.relatorio}`,
    origem: 'relatorio_agendado',
    origemId: a.id,
    empresaId: ctx.empresaId,
  });
}

/** Processa os envios vencidos uma vez; devolve quantos tentou. */
export async function processarAgendados(
  db: Db,
  urlAplicacao: string,
  log: Pick<FastifyBaseLogger, 'error'>,
): Promise<number> {
  // A tarefa só lê quem está devido (política "tarefa"); o resto é no contexto de cada usuário.
  const devidos = await emContexto(db, { sistema: true }, (tx) =>
    tx.execute<{
      id: string;
      empresa_id: string;
      usuario_id: string;
      estabelecimento_id: string;
      relatorio: RelatorioAgendavel;
      frequencia: FrequenciaEnvio;
      canal: 'email' | 'whatsapp' | 'sms';
    }>(sql`
      select id, empresa_id, usuario_id, estabelecimento_id, relatorio, frequencia, canal
      from relatorio_agendado where ativo and proximo_envio <= now()
      order by proximo_envio limit 50`),
  );
  const reagendar = (aviso: string | null, id: string, frequencia: FrequenciaEnvio) => sql`
    update relatorio_agendado a set proximo_envio = ${proximoEnvio(frequencia)},
      ultimo_envio = case when ${aviso === null} then now() else a.ultimo_envio end,
      ultimo_aviso = ${aviso}
    from estabelecimento e where e.id = a.estabelecimento_id and a.id = ${id}`;
  for (const a of devidos.rows) {
    try {
      const feito = await comoUsuario(
        db,
        {
          usuarioId: a.usuario_id,
          email: '',
          empresaId: a.empresa_id,
          estabelecimentoId: a.estabelecimento_id,
        },
        async (ctx) => {
          const [u] = await ctx.tx
            .select({ email: s.usuario.email })
            .from(s.usuario)
            .where(eq(s.usuario.id, ctx.usuarioId));
          const aviso = await enviar(
            ctx,
            {
              id: a.id,
              relatorio: a.relatorio,
              estabelecimentoId: a.estabelecimento_id,
              canal: a.canal,
            },
            u!.email,
            urlAplicacao,
          );
          await ctx.tx.execute(reagendar(aviso, a.id, a.frequencia));
          return true;
        },
      );
      if (!feito)
        await emContexto(db, { usuarioId: a.usuario_id, empresaId: a.empresa_id }, (tx) =>
          tx.execute(reagendar('Sem acesso à empresa ou ao estabelecimento.', a.id, a.frequencia)),
        );
    } catch (e) {
      log.error({ erro: e, agendado: a.id }, 'Falha no relatório agendado');
    }
  }
  return devidos.rows.length;
}

/** Tarefa de fundo: confere os envios devidos a cada poucos minutos. */
export function iniciarTarefaRelatorios(
  db: Db,
  urlAplicacao: string,
  log: Pick<FastifyBaseLogger, 'error'>,
  intervaloMs = 5 * 60_000,
): () => void {
  let parar = false;
  let timer: NodeJS.Timeout | undefined;
  const ciclo = async () => {
    try {
      await processarAgendados(db, urlAplicacao, log);
    } catch (e) {
      log.error({ erro: e }, 'Falha ao processar os relatórios agendados');
    }
    if (!parar) timer = setTimeout(ciclo, intervaloMs);
  };
  timer = setTimeout(ciclo, 30_000);
  return () => {
    parar = true;
    clearTimeout(timer);
  };
}

export async function rotasRelatoriosAgendados(app: FastifyInstance): Promise<void> {
  const { db, config } = app.deps;

  async function meu(ctx: ContextoEmpresa, id: string) {
    const [a] = await ctx.tx
      .select()
      .from(s.relatorioAgendado)
      .where(
        and(
          eq(s.relatorioAgendado.id, id),
          eq(s.relatorioAgendado.usuarioId, ctx.usuarioId),
          eq(s.relatorioAgendado.empresaId, ctx.empresaId),
        ),
      );
    if (!a) throw new ErroNaoEncontrado('Envio não encontrado.');
    return a;
  }

  /** Os envios do usuário nesta empresa, e os relatórios que ele pode agendar. */
  app.get('/api/relatorios-agendados', async (req) =>
    naEmpresa(db, req, null, async (ctx) => {
      const r = await ctx.tx.execute<{
        id: string;
        relatorio: RelatorioAgendavel;
        frequencia: FrequenciaEnvio;
        estabelecimento_id: string;
        estabelecimento: string;
        proximo_envio: string;
        ultimo_envio: string | null;
        ultimo_aviso: string | null;
        ativo: boolean;
        canal: 'email' | 'whatsapp' | 'sms';
      }>(sql`
        select a.id, a.relatorio, a.frequencia, a.canal, a.estabelecimento_id, a.proximo_envio::text as proximo_envio,
          a.ultimo_envio::text as ultimo_envio, a.ultimo_aviso, a.ativo,
          (select coalesce(f.nome_fantasia, f.nome) from estabelecimento es join ficha f on f.id = es.ficha_id where es.id = a.estabelecimento_id) as estabelecimento
        from relatorio_agendado a
        where a.usuario_id = ${ctx.usuarioId} and a.empresa_id = ${ctx.empresaId}
        order by a.criado_em`);
      return {
        disponiveis: CHAVES_RELATORIO_AGENDAVEL.filter((k) =>
          pode(ctx.acesso, RELATORIOS_AGENDAVEIS[k].funcionalidade, 'visualizar'),
        ),
        itens: r.rows.map((x) => ({
          id: x.id,
          relatorio: x.relatorio,
          nome: RELATORIOS_AGENDAVEIS[x.relatorio].nome,
          frequencia: x.frequencia,
          estabelecimentoId: x.estabelecimento_id,
          estabelecimento: x.estabelecimento,
          proximoEnvio: x.proximo_envio,
          ultimoEnvio: x.ultimo_envio,
          ultimoAviso: x.ultimo_aviso,
          ativo: x.ativo,
          canal: x.canal,
        })),
      };
    }),
  );

  app.post('/api/relatorios-agendados', async (req) =>
    naEmpresa(db, req, null, async (ctx) => {
      const d = z
        .object({
          relatorio: z.enum(CHAVES_RELATORIO_AGENDAVEL),
          frequencia: z.enum(CHAVES_FREQUENCIA_ENVIO),
          estabelecimentoId: z.uuid(),
          canal: z.enum(CANAIS_MENSAGEM).default('email'),
        })
        .parse(req.body);
      ctx.exigir(RELATORIOS_AGENDAVEIS[d.relatorio].funcionalidade, 'visualizar');
      if (!(await ctx.estabelecimentosPermitidos()).includes(d.estabelecimentoId))
        throw new ErroRegra('Estabelecimento fora do seu acesso.', 'estabelecimento');
      const [ja] = await ctx.tx
        .select({ id: s.relatorioAgendado.id })
        .from(s.relatorioAgendado)
        .where(
          and(
            eq(s.relatorioAgendado.usuarioId, ctx.usuarioId),
            eq(s.relatorioAgendado.estabelecimentoId, d.estabelecimentoId),
            eq(s.relatorioAgendado.relatorio, d.relatorio),
          ),
        );
      if (ja)
        throw new ErroRegra(
          'Você já recebe este relatório deste estabelecimento: mude a frequência.',
          'duplicado',
        );
      const [r] = (
        await ctx.tx.execute<{ id: string }>(sql`
          insert into relatorio_agendado (empresa_id, usuario_id, estabelecimento_id, relatorio, frequencia, canal, proximo_envio, criado_por)
          select ${ctx.empresaId}, ${ctx.usuarioId}, e.id, ${d.relatorio}, ${d.frequencia}, ${d.canal}, ${proximoEnvio(d.frequencia)}, ${ctx.usuarioId}
          from estabelecimento e where e.id = ${d.estabelecimentoId}
          returning id`)
      ).rows;
      return { id: r!.id };
    }),
  );

  app.put<{ Params: { id: string } }>('/api/relatorios-agendados/:id', async (req) =>
    naEmpresa(db, req, null, async (ctx) => {
      const a = await meu(ctx, z.uuid().parse(req.params.id));
      const d = z
        .object({
          frequencia: z.enum(CHAVES_FREQUENCIA_ENVIO),
          ativo: z.boolean(),
          canal: z.enum(CANAIS_MENSAGEM).optional(),
        })
        .parse(req.body);
      await ctx.tx.execute(sql`
        update relatorio_agendado a set frequencia = ${d.frequencia}, ativo = ${d.ativo},
          canal = coalesce(${d.canal ?? null}, a.canal),
          proximo_envio = ${proximoEnvio(d.frequencia)}
        from estabelecimento e where e.id = a.estabelecimento_id and a.id = ${a.id}`);
      return { ok: true };
    }),
  );

  app.post<{ Params: { id: string } }>('/api/relatorios-agendados/:id/excluir', async (req) =>
    naEmpresa(db, req, null, async (ctx) => {
      const a = await meu(ctx, z.uuid().parse(req.params.id));
      await ctx.tx.delete(s.relatorioAgendado).where(eq(s.relatorioAgendado.id, a.id));
      return { ok: true };
    }),
  );

  /** Envia agora, para conferir (não muda o próximo envio). */
  app.post<{ Params: { id: string } }>('/api/relatorios-agendados/:id/enviar', async (req) =>
    naEmpresa(db, req, null, async (ctx) => {
      const a = await meu(ctx, z.uuid().parse(req.params.id));
      const aviso = await enviar(ctx, a, ctx.sessao.email, config.URL_APLICACAO);
      if (aviso?.startsWith('Sem a permissão')) throw new ErroRegra(aviso, 'sem_permissao');
      if (aviso) return { ok: true, para: ctx.sessao.email, aviso };
      return { ok: true, para: ctx.sessao.email };
    }),
  );
}
