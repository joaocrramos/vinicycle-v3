// EnoTrace › Espumante na garrafa (cantina.md, Espumantes; 04, roteiro do ciclo 9): métodos
// tradicional e ancestral.
// - Tiragem: operação "tiragem" no livro de volumes (o vinho-base sai dos recipientes), com os
//   materiais da tiragem (licor, levedura, tampa) baixados no estoque; forma o lote de garrafas em
//   processo (código TIR, P19).
// - Estágios (lista configurável "estagio_espumante"): data, garrafas perdidas e insumos (ex.: licor
//   de expedição); anulável com motivo.
// - Finalização: as garrafas que sobraram viram produto acabado num lote comercial, como no envase.
// Charmat e Asti seguem como vinho em recipiente (autoclave é recipiente).
import { deCentilitros, misturar, paraCentilitros } from '@vinicycle/shared';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as s from '../../db/schema';
import { ErroNaoEncontrado, ErroRegra } from '../../nucleo/erros';
import { anoNoFuso, proximoCodigo } from '../../nucleo/numeracao';
import { exigirMesAberto } from '../../nucleo/periodo';
import { type ContextoEmpresa, naEmpresa } from '../../nucleo/requisicao';
import { codigoComPrefixo } from '../contratos';
import { lancarEstoque, type MovimentoNovo, obterLote } from '../estoque';
import { conferirOpcao, conferirPessoas, dataExecucao, saldosNaData } from './apoio';
import {
  confirmar,
  type Lancamento,
  type LinhaOperacao,
  partesAtuais,
  type PlanoOperacao,
  preparar,
} from './motor';

const F = 'enotrace.engarrafamento';

const litros = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, 'Litros inválidos');
const quantidade = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/, 'Quantidade inválida');
const material = z.object({
  itemId: z.uuid(),
  loteItemId: z.uuid().nullable().optional(),
  quantidade,
});

const esquemaTiragem = z.object({
  executadoEm: z.string(),
  metodo: z.enum(['tradicional', 'ancestral']),
  recipientes: z
    .array(z.object({ recipienteId: z.uuid(), litros }))
    .min(1, 'Escolha o recipiente do vinho-base')
    .max(20),
  volumeMl: z.number().int().min(50).max(30000),
  garrafas: z.number().int().min(1).max(1_000_000),
  /** Materiais da tiragem (licor de tiragem, levedura, tampa-coroa…), baixados no estoque. */
  materiais: z.array(material).max(30).default([]),
  localEstoqueId: z.uuid().nullable().optional(),
  localId: z.uuid().nullable().optional(),
  responsavelId: z.uuid().nullable().optional(),
  executadoPorId: z.uuid().nullable().optional(),
  observacao: z.string().trim().max(2000).nullable().optional(),
  cientes: z.array(z.string().max(120)).max(50).default([]),
});

/** Monta a operação "tiragem": as linhas de origem, as baixas de volume e de estoque. */
async function montarTiragem(ctx: ContextoEmpresa, corpo: unknown) {
  const estab = ctx.exigirEstabelecimento();
  const d = esquemaTiragem.parse(corpo);
  const executadoEm = dataExecucao(d.executadoEm);
  await conferirPessoas(ctx, [d.responsavelId, d.executadoPorId]);
  const ids = d.recipientes.map((r) => r.recipienteId);
  if (new Set(ids).size !== ids.length)
    throw new ErroRegra('O mesmo recipiente aparece duas vezes.', 'recipiente');
  const naData = await saldosNaData(ctx, ids, executadoEm);
  const lotes = naData.length
    ? await ctx.tx
        .select({ id: s.lote.id, projetoId: s.lote.projetoId, titularId: s.lote.titularId })
        .from(s.lote)
        .where(
          inArray(
            s.lote.id,
            naData.map((x) => x.loteId),
          ),
        )
    : [];
  const nomes = new Map(
    (
      await ctx.tx
        .select({
          id: s.recipiente.id,
          codigo: s.recipiente.codigo,
          e: s.recipiente.estabelecimentoId,
        })
        .from(s.recipiente)
        .where(and(inArray(s.recipiente.id, ids), eq(s.recipiente.empresaId, ctx.empresaId)))
    ).map((r) => [r.id, r]),
  );
  if ([...nomes.values()].some((r) => r.e !== estab) || nomes.size !== ids.length)
    throw new ErroRegra('Recipiente de outro estabelecimento.', 'recipiente');
  const linhas: LinhaOperacao[] = [];
  const lancamentos: Lancamento[] = [];
  let tirados = 0;
  for (const [n, r] of d.recipientes.entries()) {
    const parte = naData.find((x) => x.recipienteId === r.recipienteId);
    if (!parte)
      throw new ErroRegra(
        `${nomes.get(r.recipienteId)?.codigo ?? ''} está vazio na data da tiragem.`,
        'vazio',
      );
    const cl = paraCentilitros(r.litros);
    tirados += cl;
    linhas.push({
      ordem: n + 1,
      papel: 'origem',
      recipienteId: r.recipienteId,
      lote: { id: parte.loteId },
      centilitros: cl,
    });
    lancamentos.push({
      recipienteId: r.recipienteId,
      lote: { id: parte.loteId },
      centilitros: -cl,
      tipo: 'tiragem',
      linha: n + 1,
    });
  }
  const usados = lotes.filter((l) => naData.some((x) => x.loteId === l.id));
  const projetos = [...new Set(usados.map((l) => l.projetoId))];
  if (projetos.length !== 1)
    throw new ErroRegra(
      'A tiragem é de um projeto só: faça antes o corte dos vinhos-base.',
      'projetos',
    );
  if (new Set(usados.map((l) => l.titularId ?? '')).size > 1)
    throw new ErroRegra('Vinhos-base de titulares diferentes.', 'titular');
  const engarrafados = Math.round((d.garrafas * d.volumeMl) / 10);
  if (engarrafados > tirados)
    throw new ErroRegra(
      `As garrafas somam ${deCentilitros(engarrafados).replace('.', ',')} L, mais que os ${deCentilitros(tirados).replace('.', ',')} L tirados dos recipientes.`,
      'garrafas_demais',
    );
  if (d.materiais.length && !d.localEstoqueId)
    throw new ErroRegra('Escolha o local de onde saem os materiais.', 'local');
  const estoque: MovimentoNovo[] = d.materiais
    .filter((m) => Number(m.quantidade) > 0)
    .map((m) => ({
      localId: d.localEstoqueId!,
      itemId: m.itemId,
      loteItemId: m.loteItemId ?? null,
      quantidade: `-${m.quantidade}`,
      tipo: 'consumo_operacao' as const,
    }));
  const plano: PlanoOperacao = {
    tipo: 'tiragem',
    estabelecimentoId: estab,
    executadoEm,
    projetoId: projetos[0]!,
    responsavelId: d.responsavelId ?? null,
    executadoPorId: d.executadoPorId ?? null,
    observacao: d.observacao ?? null,
    dados: {
      metodo: d.metodo,
      volumeMl: d.volumeMl,
      garrafas: d.garrafas,
      perdaLitros: deCentilitros(tirados - engarrafados),
    },
    linhas,
    lancamentos,
    estoque,
  };
  return { d, plano, tirados, engarrafados, titularId: usados[0]?.titularId ?? null };
}

async function carregar(ctx: ContextoEmpresa, id: string, travar = false) {
  const q = ctx.tx
    .select()
    .from(s.espumanteLote)
    .where(and(eq(s.espumanteLote.id, id), eq(s.espumanteLote.empresaId, ctx.empresaId)));
  const [l] = travar ? await q.for('update') : await q;
  if (!l || l.estabelecimentoId !== ctx.exigirEstabelecimento())
    throw new ErroNaoEncontrado('Lote de tiragem não encontrado.');
  return l;
}

/** Garrafas que sobram: as da tiragem menos as perdidas nos estágios não anulados. */
async function garrafasAtuais(ctx: ContextoEmpresa, loteId: string, iniciais: number) {
  const [r] = (
    await ctx.tx.execute<{ perdas: number }>(sql`
      select coalesce(sum(perdas), 0)::int as perdas from espumante_evento
      where lote_id = ${loteId} and anulado_em is null`)
  ).rows;
  return iniciais - r!.perdas;
}

/** Antes do estorno de uma tiragem: só sem estágio registrado e sem finalização. */
export async function antesEstornoTiragem(ctx: ContextoEmpresa, operacaoId: string) {
  const [l] = await ctx.tx
    .select()
    .from(s.espumanteLote)
    .where(eq(s.espumanteLote.operacaoId, operacaoId));
  if (!l) return;
  if (l.situacao === 'finalizado')
    throw new ErroRegra(
      'O lote de tiragem já foi finalizado: não se estorna a tiragem.',
      'espumante',
    );
  const [e] = (
    await ctx.tx.execute<{ n: number }>(sql`
      select count(*)::int as n from espumante_evento where lote_id = ${l.id} and anulado_em is null`)
  ).rows;
  if (e!.n)
    throw new ErroRegra(
      'O lote de tiragem tem estágios registrados: anule-os antes de estornar a tiragem.',
      'espumante',
    );
}

export async function aposEstornoTiragem(ctx: ContextoEmpresa, operacaoId: string) {
  await ctx.tx
    .update(s.espumanteLote)
    .set({ situacao: 'cancelado' })
    .where(eq(s.espumanteLote.operacaoId, operacaoId));
}

export async function rotasEspumantes(app: FastifyInstance): Promise<void> {
  const { db } = app.deps;

  app.post('/api/espumantes/tiragem/previa', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const m = await montarTiragem(ctx, req.body);
      const { previa } = await preparar(ctx, m.plano, { travar: false });
      return {
        ...previa,
        tiradosLitros: deCentilitros(m.tirados),
        garrafasLitros: deCentilitros(m.engarrafados),
        perdaLitros: deCentilitros(m.tirados - m.engarrafados),
      };
    }),
  );

  app.post('/api/espumantes/tiragem', async (req) =>
    naEmpresa(db, req, [F, 'confirmar'], async (ctx) => {
      const m = await montarTiragem(ctx, req.body);
      const partes = await partesAtuais(
        ctx,
        m.d.recipientes.map((r) => r.recipienteId),
      );
      const composicao = misturar(
        m.d.recipientes.map((r) => ({
          centilitros: paraCentilitros(r.litros),
          composicao: partes.get(r.recipienteId)?.composicao ?? {
            componentes: [],
            chaptalizado: false,
          },
        })),
      );
      const op = await confirmar(ctx, m.plano, m.d.cientes);
      const [estab] = await ctx.tx
        .select({ fuso: s.estabelecimento.fuso })
        .from(s.estabelecimento)
        .where(eq(s.estabelecimento.id, m.plano.estabelecimentoId));
      const codigo = await proximoCodigo(ctx, {
        estabelecimentoId: m.plano.estabelecimentoId,
        tipo: 'tiragem',
        ano: anoNoFuso(m.plano.executadoEm, estab!.fuso),
      });
      const [l] = await ctx.tx
        .insert(s.espumanteLote)
        .values({
          empresaId: ctx.empresaId,
          estabelecimentoId: m.plano.estabelecimentoId,
          codigo,
          projetoId: m.plano.projetoId!,
          metodo: m.d.metodo,
          operacaoId: op.operacaoId,
          tiragemEm: m.plano.executadoEm,
          volumeMl: m.d.volumeMl,
          garrafasIniciais: m.d.garrafas,
          litros: deCentilitros(m.engarrafados),
          composicao,
          localId: m.d.localId ?? null,
          observacao: m.d.observacao ?? null,
          criadoPor: ctx.usuarioId,
        })
        .returning({ id: s.espumanteLote.id });
      await ctx.tx
        .update(s.operacao)
        .set({
          dados: sql`coalesce(${s.operacao.dados}, '{}'::jsonb) || ${JSON.stringify({ espumanteLote: codigo })}::jsonb`,
        })
        .where(eq(s.operacao.id, op.operacaoId));
      return { ...op, id: l!.id, loteTiragem: codigo };
    }),
  );

  app.get('/api/espumantes', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento();
      const { situacao } = z
        .object({
          situacao: z
            .enum(['em_processo', 'finalizado', 'cancelado', 'todos'])
            .default('em_processo'),
        })
        .parse(req.query);
      const r = await ctx.tx.execute<Record<string, unknown>>(sql`
        select l.id, l.codigo, l.metodo, l.situacao, l.tiragem_em as "tiragemEm", l.volume_ml as "volumeMl",
          l.garrafas_iniciais as "garrafasIniciais", l.finalizado_em as "finalizadoEm",
          l.garrafas_iniciais - coalesce((select sum(e.perdas) from espumante_evento e where e.lote_id = l.id and e.anulado_em is null), 0)::int as garrafas,
          p.codigo as "projetoCodigo", p.nome as projeto, l.projeto_id as "projetoId",
          (select e.estagio from espumante_evento e where e.lote_id = l.id and e.anulado_em is null order by e.executado_em desc, e.criado_em desc limit 1) as estagio,
          (select e.executado_em from espumante_evento e where e.lote_id = l.id and e.anulado_em is null order by e.executado_em desc, e.criado_em desc limit 1) as "estagioEm",
          (select lc.codigo from lote_comercial lc where lc.id = l.lote_comercial_id) as "loteComercial"
        from espumante_lote l join projeto p on p.id = l.projeto_id
        where l.estabelecimento_id = ${estab} ${situacao === 'todos' ? sql`` : sql`and l.situacao = ${situacao}`}
        order by l.tiragem_em desc`);
      return r.rows;
    }),
  );

  app.get<{ Params: { id: string } }>('/api/espumantes/:id', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const l = await carregar(ctx, z.uuid().parse(req.params.id));
      const eventos = await ctx.tx
        .select({
          id: s.espumanteEvento.id,
          estagio: s.espumanteEvento.estagio,
          nome: sql<string>`(select o.nome from opcao_lista o where o.lista = 'estagio_espumante' and o.codigo = espumante_evento.estagio order by o.empresa_id nulls last limit 1)`,
          executadoEm: s.espumanteEvento.executadoEm,
          perdas: s.espumanteEvento.perdas,
          insumos: s.espumanteEvento.insumos,
          observacao: s.espumanteEvento.observacao,
          anuladoEm: s.espumanteEvento.anuladoEm,
          motivoAnulacao: s.espumanteEvento.motivoAnulacao,
          por: sql<string>`(select f.nome from usuario u join ficha f on f.id = u.ficha_id where u.id = espumante_evento.criado_por)`,
        })
        .from(s.espumanteEvento)
        .where(eq(s.espumanteEvento.loteId, l.id))
        .orderBy(asc(s.espumanteEvento.executadoEm), asc(s.espumanteEvento.criadoEm));
      const [op] = await ctx.tx
        .select({ codigo: s.operacao.codigo, situacao: s.operacao.situacao })
        .from(s.operacao)
        .where(eq(s.operacao.id, l.operacaoId));
      const [p] = await ctx.tx
        .select({ codigo: s.projeto.codigo, nome: s.projeto.nome })
        .from(s.projeto)
        .where(eq(s.projeto.id, l.projetoId));
      const lc = l.loteComercialId
        ? (
            await ctx.tx
              .select({ id: s.loteComercial.id, codigo: s.loteComercial.codigo })
              .from(s.loteComercial)
              .where(eq(s.loteComercial.id, l.loteComercialId))
          )[0]
        : null;
      return {
        ...l,
        garrafas: await garrafasAtuais(ctx, l.id, l.garrafasIniciais),
        operacao: op,
        projeto: p,
        loteComercial: lc ?? null,
        eventos,
      };
    }),
  );

  /** Registra um estágio: data, garrafas perdidas e os insumos (ex.: licor de expedição). */
  app.post<{ Params: { id: string } }>('/api/espumantes/:id/estagios', async (req) =>
    naEmpresa(db, req, [F, 'confirmar'], async (ctx) => {
      const l = await carregar(ctx, z.uuid().parse(req.params.id), true);
      if (l.situacao !== 'em_processo')
        throw new ErroRegra('O lote de tiragem não está em processo.', 'situacao');
      const d = z
        .object({
          estagio: z.string().min(1, 'Escolha o estágio').max(60),
          executadoEm: z.string(),
          perdas: z.number().int().min(0).default(0),
          insumos: z.array(material).max(20).default([]),
          localEstoqueId: z.uuid().nullable().optional(),
          observacao: z.string().trim().max(2000).nullable().optional(),
        })
        .parse(req.body);
      await conferirOpcao(ctx, 'estagio_espumante', d.estagio, 'Estágio');
      const executadoEm = dataExecucao(d.executadoEm);
      if (executadoEm < l.tiragemEm)
        throw new ErroRegra('O estágio não pode ser antes da tiragem.', 'data');
      await exigirMesAberto(ctx.tx, l.estabelecimentoId, executadoEm);
      const atuais = await garrafasAtuais(ctx, l.id, l.garrafasIniciais);
      if (d.perdas > atuais) throw new ErroRegra(`Só há ${atuais} garrafas no lote.`, 'perdas');
      if (d.insumos.length && !d.localEstoqueId)
        throw new ErroRegra('Escolha o local de onde saem os insumos.', 'local');
      const r = d.insumos.length
        ? await lancarEstoque(ctx, {
            estabelecimentoId: l.estabelecimentoId,
            executadoEm,
            movimentos: d.insumos.map((m) => ({
              localId: d.localEstoqueId!,
              itemId: m.itemId,
              loteItemId: m.loteItemId ?? null,
              quantidade: `-${m.quantidade}`,
              tipo: 'consumo_operacao' as const,
              documento: l.codigo,
            })),
          })
        : null;
      const [e] = await ctx.tx
        .insert(s.espumanteEvento)
        .values({
          empresaId: ctx.empresaId,
          loteId: l.id,
          estagio: d.estagio,
          executadoEm,
          perdas: d.perdas,
          grupoEstoque: r?.grupoId ?? null,
          insumos: d.insumos.length ? d.insumos : null,
          observacao: d.observacao ?? null,
          criadoPor: ctx.usuarioId,
        })
        .returning({ id: s.espumanteEvento.id });
      await ctx.auditar({
        acao: 'criar',
        entidade: 'espumante_evento',
        registroId: e!.id,
        dados: { lote: l.codigo, ...d },
      });
      return { id: e!.id, avisos: r?.avisos ?? [] };
    }),
  );

  /** Anula um estágio lançado por engano: devolve as perdas e os insumos ao estoque. */
  app.post<{ Params: { id: string; eventoId: string } }>(
    '/api/espumantes/:id/estagios/:eventoId/anular',
    async (req) =>
      naEmpresa(db, req, [F, 'estornar'], async (ctx) => {
        const l = await carregar(ctx, z.uuid().parse(req.params.id), true);
        if (l.situacao !== 'em_processo')
          throw new ErroRegra('O lote de tiragem não está em processo.', 'situacao');
        const { motivo } = z
          .object({ motivo: z.string().trim().min(3, 'Informe o motivo').max(500) })
          .parse(req.body);
        const [e] = await ctx.tx
          .select()
          .from(s.espumanteEvento)
          .where(
            and(
              eq(s.espumanteEvento.id, z.uuid().parse(req.params.eventoId)),
              eq(s.espumanteEvento.loteId, l.id),
            ),
          )
          .for('update');
        if (!e || e.anuladoEm) throw new ErroNaoEncontrado('Estágio não encontrado ou já anulado.');
        if (e.grupoEstoque) {
          const movs = await ctx.tx
            .select()
            .from(s.movimentoEstoque)
            .where(eq(s.movimentoEstoque.grupoId, e.grupoEstoque));
          await lancarEstoque(ctx, {
            estabelecimentoId: l.estabelecimentoId,
            executadoEm: e.executadoEm,
            movimentos: movs.map((m) => ({
              localId: m.localId,
              itemId: m.itemId,
              loteItemId: m.loteItemId,
              quantidade: (-Number(m.quantidade)).toFixed(3),
              tipo: 'estorno' as const,
              motivo,
              documento: m.documento,
              estornoDeId: m.id,
            })),
          });
        }
        await ctx.tx
          .update(s.espumanteEvento)
          .set({ anuladoEm: new Date(), motivoAnulacao: motivo })
          .where(eq(s.espumanteEvento.id, e.id));
        await ctx.auditar({
          acao: 'anular',
          entidade: 'espumante_evento',
          registroId: e.id,
          motivo,
          dados: { lote: l.codigo },
        });
        return { ok: true };
      }),
  );

  /** Finaliza: as garrafas que sobraram entram como produto acabado num lote comercial. */
  app.post<{ Params: { id: string } }>('/api/espumantes/:id/finalizar', async (req) =>
    naEmpresa(db, req, [F, 'confirmar'], async (ctx) => {
      const l = await carregar(ctx, z.uuid().parse(req.params.id), true);
      if (l.situacao !== 'em_processo')
        throw new ErroRegra('O lote de tiragem não está em processo.', 'situacao');
      const d = z
        .object({
          executadoEm: z.string(),
          produtoId: z.uuid('Escolha o produto'),
          formatoId: z.uuid('Escolha o formato'),
          localId: z.uuid('Escolha o local do produto'),
        })
        .parse(req.body);
      const executadoEm = dataExecucao(d.executadoEm);
      const [f] = await ctx.tx
        .select({
          volumeMl: s.produtoFormato.volumeMl,
          itemId: s.produtoFormato.itemEstoqueId,
          produtoId: s.produtoFormato.produtoId,
        })
        .from(s.produtoFormato)
        .where(
          and(eq(s.produtoFormato.id, d.formatoId), eq(s.produtoFormato.empresaId, ctx.empresaId)),
        );
      if (!f || f.produtoId !== d.produtoId)
        throw new ErroRegra('Formato de outro produto.', 'formato');
      if (f.volumeMl !== l.volumeMl)
        throw new ErroRegra(
          `O formato é de ${f.volumeMl} mL, e as garrafas da tiragem são de ${l.volumeMl} mL.`,
          'formato',
        );
      const garrafas = await garrafasAtuais(ctx, l.id, l.garrafasIniciais);
      if (garrafas <= 0) throw new ErroRegra('Não sobrou garrafa no lote.', 'garrafas');
      const [op] = await ctx.tx
        .select({ titularId: s.lote.titularId })
        .from(s.operacaoLinha)
        .innerJoin(s.lote, eq(s.lote.id, s.operacaoLinha.loteId))
        .where(eq(s.operacaoLinha.operacaoId, l.operacaoId))
        .limit(1);
      const [estab] = await ctx.tx
        .select({ fuso: s.estabelecimento.fuso })
        .from(s.estabelecimento)
        .where(eq(s.estabelecimento.id, l.estabelecimentoId));
      const codigo = await codigoComPrefixo(
        ctx,
        op?.titularId ?? null,
        executadoEm,
        await proximoCodigo(ctx, {
          estabelecimentoId: l.estabelecimentoId,
          tipo: 'lote_comercial',
          ano: anoNoFuso(executadoEm, estab!.fuso),
        }),
      );
      const litrosFinais = deCentilitros(Math.round((garrafas * l.volumeMl) / 10));
      const [lc] = await ctx.tx
        .insert(s.loteComercial)
        .values({
          empresaId: ctx.empresaId,
          estabelecimentoId: l.estabelecimentoId,
          codigo,
          projetoId: l.projetoId,
          produtoId: d.produtoId,
          titularId: op?.titularId ?? null,
          primeiroEnvase: l.tiragemEm,
          ultimoEnvase: executadoEm,
          composicao: l.composicao,
          chaptalizado: !!(l.composicao as { chaptalizado?: boolean }).chaptalizado,
          litros: litrosFinais,
          origem: 'envase',
          criadoPor: ctx.usuarioId,
        })
        .returning({ id: s.loteComercial.id });
      // Lotes de origem (história do lote e recolhimento): os da tiragem, pelos litros.
      const origens = await ctx.tx.execute<{ lote_id: string; litros: string }>(sql`
        select lote_id, sum(litros)::numeric(12, 2)::text as litros from operacao_linha
        where operacao_id = ${l.operacaoId} and papel = 'origem' and lote_id is not null group by lote_id`);
      if (origens.rows.length)
        await ctx.tx.insert(s.loteComercialOrigem).values(
          origens.rows.map((o) => ({
            empresaId: ctx.empresaId,
            loteComercialId: lc!.id,
            loteId: o.lote_id,
            litros: o.litros,
          })),
        );
      const r = await lancarEstoque(ctx, {
        estabelecimentoId: l.estabelecimentoId,
        executadoEm,
        movimentos: [
          {
            localId: d.localId,
            itemId: f.itemId,
            loteItemId: await obterLote(
              ctx,
              l.estabelecimentoId,
              f.itemId,
              { codigo },
              'producao',
              op?.titularId ?? null,
            ),
            quantidade: String(garrafas),
            tipo: 'producao',
            documento: codigo,
          },
        ],
      });
      await ctx.tx
        .update(s.espumanteLote)
        .set({
          situacao: 'finalizado',
          finalizadoEm: executadoEm,
          produtoId: d.produtoId,
          loteComercialId: lc!.id,
          grupoFinalizacao: r.grupoId,
          garrafasFinais: garrafas,
        })
        .where(eq(s.espumanteLote.id, l.id));
      await ctx.auditar({
        acao: 'finalizar',
        entidade: 'espumante_lote',
        registroId: l.id,
        dados: { lote: l.codigo, loteComercial: codigo, garrafas },
      });
      return { loteComercial: codigo, garrafas, avisos: r.avisos };
    }),
  );

  /** Lista de lotes de tiragem por projeto (para a ficha do projeto). */
  app.get<{ Params: { id: string } }>('/api/projetos/:id/espumantes', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) =>
      ctx.tx
        .select({
          id: s.espumanteLote.id,
          codigo: s.espumanteLote.codigo,
          situacao: s.espumanteLote.situacao,
          garrafasIniciais: s.espumanteLote.garrafasIniciais,
          tiragemEm: s.espumanteLote.tiragemEm,
        })
        .from(s.espumanteLote)
        .where(
          and(
            eq(s.espumanteLote.projetoId, z.uuid().parse(req.params.id)),
            eq(s.espumanteLote.empresaId, ctx.empresaId),
          ),
        )
        .orderBy(desc(s.espumanteLote.tiragemEm)),
    ),
  );
}
