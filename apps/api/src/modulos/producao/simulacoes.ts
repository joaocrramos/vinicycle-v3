// Simulador de corte (cantina.md, Trasfega e corte, Simulador de corte; 04, roteiro do ciclo 9): o
// enólogo testa proporções (em % sobre um volume desejado ou direto em litros) e vê a composição e
// o que o rótulo pode declarar, sem mexer no volume. As simulações ficam salvas no projeto; a
// aprovada abre o corte já preenchido, com os litros conferidos com os saldos do momento.
import { misturar, paraCentilitros, porSafra } from '@vinicycle/shared';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as s from '../../db/schema';
import { ErroNaoEncontrado, ErroRegra } from '../../nucleo/erros';
import { type ContextoEmpresa, naEmpresa } from '../../nucleo/requisicao';
import { partesComSaldo, rotulo } from './consultas';

const F = 'enotrace.operacoes';

const numero = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, 'Número inválido');

const esquemaSimulacao = z
  .object({
    modo: z.enum(['percentual', 'litros']),
    /** Volume desejado, no modo percentual. */
    volume: numero.nullable().optional(),
    itens: z
      .array(
        z.object({
          recipienteId: z.uuid('Escolha o recipiente'),
          /** % no modo percentual; litros no modo litros. */
          valor: numero,
        }),
      )
      .min(1, 'Escolha ao menos um recipiente')
      .max(30),
  })
  .refine((d) => d.modo === 'litros' || (d.volume && Number(d.volume) > 0), {
    path: ['volume'],
    message: 'Informe o volume desejado',
  })
  .refine((d) => new Set(d.itens.map((i) => i.recipienteId)).size === d.itens.length, {
    path: ['itens'],
    message: 'O mesmo recipiente aparece duas vezes',
  });

/** Litros e % de cada parte, composição resultante, rótulo e avisos (saldo menor que o pedido). */
async function simular(ctx: ContextoEmpresa, estab: string, d: z.infer<typeof esquemaSimulacao>) {
  const ids = d.itens.map((i) => i.recipienteId);
  const partes = await partesComSaldo(ctx, { recipienteIds: ids });
  const recs = await ctx.tx
    .select({ id: s.recipiente.id, codigo: s.recipiente.codigo, e: s.recipiente.estabelecimentoId })
    .from(s.recipiente)
    .where(and(inArray(s.recipiente.id, ids), eq(s.recipiente.empresaId, ctx.empresaId)));
  if (recs.some((r) => r.e !== estab) || recs.length !== ids.length)
    throw new ErroRegra('Recipiente de outro estabelecimento.', 'recipiente');
  const lotes = partes.length
    ? await ctx.tx
        .select({
          id: s.lote.id,
          codigo: s.lote.codigo,
          projeto: s.projeto.nome,
          projetoId: s.lote.projetoId,
          titularId: s.lote.titularId,
        })
        .from(s.lote)
        .innerJoin(s.projeto, eq(s.projeto.id, s.lote.projetoId))
        .where(
          inArray(
            s.lote.id,
            partes.map((p) => p.loteId),
          ),
        )
    : [];
  const somaPct = d.itens.reduce((t, i) => t + Number(i.valor), 0);
  const avisos: string[] = [];
  if (d.modo === 'percentual' && Math.abs(somaPct - 100) > 0.001)
    avisos.push(`As proporções somam ${somaPct.toLocaleString('pt-BR')}%, não 100%.`);
  const itens = d.itens.map((i) => {
    const parte = partes.find((p) => p.recipienteId === i.recipienteId);
    const codigo = recs.find((r) => r.id === i.recipienteId)!.codigo;
    if (!parte) throw new ErroRegra(`O recipiente ${codigo} está vazio.`, 'vazio');
    const cl =
      d.modo === 'litros'
        ? paraCentilitros(i.valor)
        : Math.round((paraCentilitros(d.volume!) * Number(i.valor)) / 100);
    const lote = lotes.find((l) => l.id === parte.loteId)!;
    if (cl > parte.cl)
      avisos.push(
        `${codigo}: pedidos ${(cl / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L, mas há ${(parte.cl / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L.`,
      );
    return { parte, cl, codigo, lote };
  });
  const titulares = new Set(itens.map((i) => i.lote.titularId ?? ''));
  if (titulares.size > 1)
    avisos.push(
      'Lotes de titulares diferentes: o corte é bloqueado. Registre antes a transferência de titularidade.',
    );
  const total = itens.reduce((t, i) => t + i.cl, 0);
  const composicao = misturar(
    itens.map((i) => ({ centilitros: i.cl, composicao: i.parte.composicao })),
  );
  const r = await rotulo(ctx, estab, composicao);
  const pct = (cl: number) => (total ? Number(((cl / total) * 100).toFixed(2)) : 0);
  return {
    itens: itens.map((i) => ({
      recipienteId: i.parte.recipienteId,
      recipiente: i.codigo,
      loteId: i.lote.id,
      lote: i.lote.codigo,
      projeto: i.lote.projeto,
      saldo: (i.parte.cl / 100).toFixed(2),
      litros: (i.cl / 100).toFixed(2),
      percentual: pct(i.cl),
    })),
    totalLitros: (total / 100).toFixed(2),
    chaptalizado: composicao.chaptalizado,
    organica: Number(
      (
        composicao.componentes.filter((c) => c.organica).reduce((t, c) => t + c.fracao, 0) * 100
      ).toFixed(2),
    ),
    safras: porSafra(composicao).map((x) => ({
      safra: x.safra,
      percentual: Number((x.fracao * 100).toFixed(2)),
    })),
    rotulo: r,
    avisos,
    projetos: [...new Set(itens.map((i) => i.lote.projetoId))].length,
  };
}

async function carregar(ctx: ContextoEmpresa, id: string) {
  const [x] = await ctx.tx
    .select()
    .from(s.simulacaoCorte)
    .where(and(eq(s.simulacaoCorte.id, id), eq(s.simulacaoCorte.empresaId, ctx.empresaId)))
    .for('update');
  if (!x || x.estabelecimentoId !== ctx.exigirEstabelecimento())
    throw new ErroNaoEncontrado('Simulação não encontrada.');
  return x;
}

export async function rotasSimulacoes(app: FastifyInstance): Promise<void> {
  const { db } = app.deps;

  /** Prévia: calcula sem gravar. */
  app.post('/api/simulacoes-corte/previa', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) =>
      simular(ctx, ctx.exigirEstabelecimento(), esquemaSimulacao.parse(req.body)),
    ),
  );

  app.get<{ Params: { id: string } }>('/api/projetos/:id/simulacoes', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const projetoId = z.uuid().parse(req.params.id);
      return ctx.tx
        .select({
          id: s.simulacaoCorte.id,
          nome: s.simulacaoCorte.nome,
          modo: s.simulacaoCorte.modo,
          volumeLitros: s.simulacaoCorte.volumeLitros,
          itens: s.simulacaoCorte.itens,
          resultado: s.simulacaoCorte.resultado,
          observacao: s.simulacaoCorte.observacao,
          situacao: s.simulacaoCorte.situacao,
          criadoEm: s.simulacaoCorte.criadoEm,
          autor: sql<string>`(select f.nome from usuario u join ficha f on f.id = u.ficha_id where u.id = simulacao_corte.criado_por)`,
          aprovadaEm: s.simulacaoCorte.aprovadaEm,
        })
        .from(s.simulacaoCorte)
        .where(
          and(
            eq(s.simulacaoCorte.projetoId, projetoId),
            eq(s.simulacaoCorte.empresaId, ctx.empresaId),
            sql`${s.simulacaoCorte.situacao} <> 'descartada'`,
          ),
        )
        .orderBy(desc(s.simulacaoCorte.criadoEm));
    }),
  );

  /** Uma simulação, com os litros recalculados pelos saldos de agora (para abrir o corte). */
  app.get<{ Params: { id: string } }>('/api/simulacoes-corte/:id', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const x = await carregar(ctx, z.uuid().parse(req.params.id));
      const itens = x.itens as Array<{ recipienteId: string; valor: string }>;
      return {
        id: x.id,
        nome: x.nome,
        projetoId: x.projetoId,
        situacao: x.situacao,
        agora: await simular(ctx, x.estabelecimentoId, {
          modo: x.modo,
          volume: x.volumeLitros,
          itens,
        }),
      };
    }),
  );

  app.post<{ Params: { id: string } }>('/api/projetos/:id/simulacoes', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento();
      const projetoId = z.uuid().parse(req.params.id);
      const [p] = await ctx.tx
        .select({ e: s.projeto.estabelecimentoId })
        .from(s.projeto)
        .where(and(eq(s.projeto.id, projetoId), eq(s.projeto.empresaId, ctx.empresaId)));
      if (p?.e !== estab) throw new ErroNaoEncontrado('Projeto não encontrado.');
      const d = esquemaSimulacao
        .and(
          z.object({
            nome: z.string().trim().min(2, 'Dê um nome à simulação').max(80),
            observacao: z.string().trim().max(1000).nullable().optional(),
          }),
        )
        .parse(req.body);
      const resultado = await simular(ctx, estab, d);
      const [x] = await ctx.tx
        .insert(s.simulacaoCorte)
        .values({
          empresaId: ctx.empresaId,
          estabelecimentoId: estab,
          projetoId,
          nome: d.nome,
          modo: d.modo,
          volumeLitros: d.modo === 'percentual' ? d.volume! : null,
          itens: d.itens,
          resultado,
          observacao: d.observacao ?? null,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.simulacaoCorte.id });
      await ctx.auditar({
        acao: 'criar',
        entidade: 'simulacao_corte',
        registroId: x!.id,
        dados: { nome: d.nome, modo: d.modo, volume: d.volume, itens: d.itens },
      });
      return { id: x!.id };
    }),
  );

  for (const [acao, situacao] of [
    ['aprovar', 'aprovada'],
    ['descartar', 'descartada'],
  ] as const)
    app.post<{ Params: { id: string } }>(`/api/simulacoes-corte/:id/${acao}`, async (req) =>
      naEmpresa(db, req, [F, 'criar'], async (ctx) => {
        const x = await carregar(ctx, z.uuid().parse(req.params.id));
        if (x.situacao !== 'rascunho' && !(acao === 'descartar' && x.situacao === 'aprovada'))
          throw new ErroRegra('A simulação já foi decidida.', 'situacao');
        await ctx.tx
          .update(s.simulacaoCorte)
          .set({
            situacao,
            ...(acao === 'aprovar' ? { aprovadaEm: new Date(), aprovadaPor: ctx.usuarioId } : {}),
            atualizadoEm: sql`now()`,
            atualizadoPor: ctx.usuarioId,
          })
          .where(eq(s.simulacaoCorte.id, x.id));
        await ctx.auditar({
          acao,
          entidade: 'simulacao_corte',
          registroId: x.id,
          dados: { nome: x.nome },
        });
        return { ok: true };
      }),
    );
}
