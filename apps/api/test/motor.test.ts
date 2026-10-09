// Motor das operações (03-modelo-de-dados.md, 4.3, 4.4 e 5): bloqueios, linha do tempo,
// composição por recipiente, numeração, genealogia e "ciente".
import { paraCentilitros, porVariedade, type Composicao } from '@vinicycle/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema';
import { confirmar, type PlanoOperacao } from '../src/modulos/producao/motor';
import { type ContextoEmpresa, naEmpresa } from '../src/nucleo/requisicao';
import { autenticar } from '../src/nucleo/sessoes';
import { fichaPj, montar } from './apoio';

let t: Awaited<ReturnType<typeof montar>>;
beforeAll(async () => {
  t = await montar();
});
afterAll(async () => {
  await t.fechar();
});

const cl = paraCentilitros;
const pct = (c: Composicao, v: string) =>
  Number(((porVariedade(c).find((x) => x.variedadeId === v)?.fracao ?? 0) * 100).toFixed(2));

async function cenario() {
  const { master } = await t.empresaComMaster();
  const estab = await t.criarEstabelecimento(master);
  await master.post('/api/auth/contexto', { estabelecimentoId: estab });
  const local = (await master.post('/api/locais', { nome: 'Adega', uso: 'recipientes' })).corpo.id;
  const tipos = (await master.get('/api/catalogos/tipo_recipiente?tamanho=0')).corpo
    .itens as Array<{
    id: string;
    nome: string;
  }>;
  const variedades = (await master.get('/api/catalogos/variedade?tamanho=0&busca=grenache')).corpo
    .itens as Array<{ id: string }>;
  const syrah = (await master.get('/api/catalogos/variedade?tamanho=0&busca=syrah')).corpo
    .itens as Array<{ id: string }>;
  const recipiente = async (codigo: string, litros: string, tipo = 'Tanque de inox') =>
    (
      await master.post('/api/recipientes', {
        codigo,
        tipoRecipienteId: tipos.find((x) => x.nome === tipo)!.id,
        capacidadeLitros: litros,
        localId: local,
      })
    ).corpo.id as string;
  const token = master.cookie.split('=')[1]!;
  const sessao = (await autenticar(t.db, token))!;
  const req = { sessao, ip: '127.0.0.1', headers: {}, id: 'teste' } as unknown as FastifyRequest;
  const naCantina = <T>(fn: (ctx: ContextoEmpresa) => Promise<T>) => naEmpresa(t.db, req, null, fn);

  const projetoId = await naCantina(async (ctx) => {
    const [p] = await ctx.tx
      .insert(s.projeto)
      .values({
        empresaId: ctx.empresaId,
        estabelecimentoId: estab,
        codigo: `PRJ-TESTE-${Math.random().toString(36).slice(2, 6)}`,
        nome: 'Grenache 2026',
        safraPrevista: 2026,
      })
      .returning({ id: s.projeto.id });
    return p!.id;
  });

  /** Romaneio confirmado com um item e uma pesagem. */
  const uva = (variedadeId: string, kg: number, dataColheita = '2026-02-10', ciclo = '01') =>
    naCantina(async (ctx) => {
      const [r] = await ctx.tx
        .insert(s.romaneio)
        .values({
          empresaId: ctx.empresaId,
          estabelecimentoId: estab,
          codigo: `ROM-${Math.random().toString(36).slice(2, 8)}`,
          chegadaEm: new Date(),
          projetoId,
          origem: 'vinhedo_proprio',
          situacao: 'confirmado',
          confirmadoEm: new Date(),
        })
        .returning({ id: s.romaneio.id });
      const [i] = await ctx.tx
        .insert(s.romaneioItem)
        .values({
          empresaId: ctx.empresaId,
          romaneioId: r!.id,
          ordem: 1,
          variedadeId,
          dataColheita,
          safra: Number(dataColheita.slice(0, 4)),
          ciclo,
          brix: '23.50',
        })
        .returning({ id: s.romaneioItem.id });
      await ctx.tx.insert(s.pesagem).values({
        empresaId: ctx.empresaId,
        itemId: i!.id,
        pesadoEm: new Date(),
        brutoKg: String(kg + 1000),
        taraKg: '1000',
      });
      return { itemId: i!.id, variedadeId, safra: Number(dataColheita.slice(0, 4)), ciclo };
    });

  const composicaoDaUva = (u: { variedadeId: string; safra: number; ciclo: string }) => ({
    componentes: [
      {
        variedadeId: u.variedadeId,
        safra: u.safra,
        ciclo: u.ciclo,
        origem: 'propria' as const,
        organica: false,
        candidataIp: false,
        fracao: 1,
      },
    ],
    chaptalizado: false,
  });

  /** "Desengace" genérico: consome a uva e põe o mosto num lote novo. */
  const desengace = (
    u: { itemId: string; variedadeId: string; safra: number; ciclo: string },
    recipienteId: string,
    kg: number,
    litros: number,
    extra: Partial<PlanoOperacao> = {},
    cientes: string[] = [],
  ) =>
    naCantina((ctx) =>
      confirmar(
        ctx,
        {
          tipo: 'desengace',
          estabelecimentoId: estab,
          executadoEm: new Date(),
          projetoId,
          linhas: [{ ordem: 1, papel: 'destino', recipienteId, lote: { novo: 'a' } }],
          lotesNovos: [{ chave: 'a', projetoId, titularId: null, origem: 'recepcao' }],
          consumos: [
            {
              itemId: u.itemId,
              decikg: kg * 10,
              recipienteId,
              lote: { novo: 'a' },
              centilitros: cl(litros),
              estimado: true,
            },
          ],
          lancamentos: [
            {
              recipienteId,
              lote: { novo: 'a' },
              centilitros: cl(litros),
              tipo: 'entrada_mosto',
              estimado: true,
              linha: 1,
              composicao: { composicao: composicaoDaUva(u) },
            },
          ],
          ...extra,
        },
        cientes,
      ),
    );

  /** Movimento genérico entre recipientes (trasfega, incorporação…), para os exemplos. */
  const mover = (
    tipo: PlanoOperacao['tipo'],
    lancamentos: PlanoOperacao['lancamentos'],
    extra: Partial<PlanoOperacao> = {},
  ) =>
    naCantina((ctx) =>
      confirmar(
        ctx,
        {
          tipo,
          estabelecimentoId: estab,
          executadoEm: new Date(),
          projetoId,
          linhas: [],
          lancamentos,
          ...extra,
        },
        [],
      ),
    );

  const composicaoDe = (recipienteId: string) =>
    naCantina(async (ctx) => {
      const [v] = await ctx.tx
        .select()
        .from(s.composicaoParte)
        .where(eq(s.composicaoParte.recipienteId, recipienteId))
        .orderBy(sql`vigente_desde desc, lancada_em desc, id desc`)
        .limit(1);
      const itens = await ctx.tx
        .select()
        .from(s.composicaoParteItem)
        .where(eq(s.composicaoParteItem.parteId, v!.id));
      return {
        loteId: v!.loteId,
        volume: v!.volumeLitros,
        composicao: {
          chaptalizado: v!.chaptalizado,
          componentes: itens.map((i) => ({ ...i, fracao: Number(i.fracao) })),
        } as Composicao,
      };
    });

  const saldo = (recipienteId: string) =>
    naCantina(async (ctx) => {
      const [r] = await ctx.tx
        .select({ total: sql<string>`coalesce(sum(litros), 0)` })
        .from(s.movimentoVolume)
        .where(eq(s.movimentoVolume.recipienteId, recipienteId));
      return r!.total;
    });

  return {
    master,
    estab,
    projetoId,
    recipiente,
    uva,
    desengace,
    mover,
    composicaoDe,
    saldo,
    naCantina,
    grenache: variedades[0]!.id,
    syrah: syrah[0]!.id,
  };
}

const erroDe = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as {
      codigo: string;
      message: string;
      detalhes?: { avisos?: Array<{ codigo: string }> };
    };
  }
  throw new Error('Era para falhar');
};

describe('motor das operações', () => {
  it('nasce o lote da uva: código pela safra e ciclo, volume pelo livro e saldo de uva', async () => {
    const c = await cenario();
    const t1 = await c.recipiente('T1', '5000.00');
    const u = await c.uva(c.grenache, 1000);
    const r = await c.desengace(u, t1, 1000, 700);
    expect(r.codigo).toMatch(/^OP-\d{4}-00001$/);
    expect(await c.saldo(t1)).toBe('700.00');
    const comp = await c.composicaoDe(t1);
    expect(pct(comp.composicao, c.grenache)).toBe(100);
    const lote = await c.naCantina(async (ctx) => {
      const [l] = await ctx.tx.select().from(s.lote).where(eq(s.lote.id, comp.loteId));
      const [p] = await ctx.tx.select().from(s.projeto).where(eq(s.projeto.id, c.projetoId));
      return { ...l!, projeto: p!.situacao };
    });
    expect(lote).toMatchObject({
      codigo: '2026.01-001',
      safra: 2026,
      ciclo: '01',
      projeto: 'em_producao',
    });
    // A uva já foi toda processada.
    const t2 = await c.recipiente('T2', '5000.00');
    const e = await erroDe(c.desengace(u, t2, 10, 7));
    expect(e.message).toMatch(/0 kg a processar/);
  });

  it('bloqueia capacidade e recipiente em manutenção; aguardando higienização pede ciente', async () => {
    const c = await cenario();
    const b1 = await c.recipiente('B1', '225.00', 'Barrica');
    const u = await c.uva(c.grenache, 1000);
    expect((await erroDe(c.desengace(u, b1, 400, 300))).message).toMatch(/passaria da capacidade/);

    await c.master.post(`/api/recipientes/${b1}/situacao`, {
      situacao: 'manutencao',
      motivo: 'Vazamento na aduela',
    });
    expect((await erroDe(c.desengace(u, b1, 100, 70))).message).toMatch(/em manutenção/);

    await c.master.post(`/api/recipientes/${b1}/situacao`, {
      situacao: 'aguardando_higienizacao',
      motivo: 'Esvaziada',
    });
    const sem = await erroDe(c.desengace(u, b1, 100, 70));
    expect(sem.codigo).toBe('ciente_pendente');
    const aviso = sem.detalhes!.avisos![0]!.codigo;
    const ok = await c.desengace(u, b1, 100, 70, {}, [aviso]);
    const ocorrencias = await c.naCantina((ctx) =>
      ctx.tx
        .select()
        .from(s.ocorrenciaRegra)
        .where(eq(s.ocorrenciaRegra.registroId, ok.operacaoId)),
    );
    expect(ocorrencias).toHaveLength(1);
    expect(ocorrencias[0]!.cienteEm).not.toBeNull();
  });

  it('exemplo 1 do modelo: incorporação muda só a composição do recipiente que recebe', async () => {
    const c = await cenario();
    const t1 = await c.recipiente('T1', '5000.00');
    const b1 = await c.recipiente('B1', '225.00', 'Barrica');
    const t2 = await c.recipiente('T2', '1000.00');
    const g = await c.uva(c.grenache, 1500);
    const sy = await c.uva(c.syrah, 100);
    const a = await c.desengace(g, t1, 1500, 1000);
    const loteA = a.lotes.a!;
    const b = await c.desengace(sy, t2, 100, 70);
    const loteB = b.lotes.a!;

    // Trasfega de 200 L do lote A para a barrica: a composição viaja com os litros.
    await c.mover('trasfega', [
      { recipienteId: t1, lote: { id: loteA }, centilitros: -cl(200), tipo: 'saida_trasfega' },
      {
        recipienteId: b1,
        lote: { id: loteA },
        centilitros: cl(200),
        tipo: 'entrada_trasfega',
        composicao: { recipienteId: t1 },
      },
    ]);
    // Incorporação de 20 L do lote B na barrica.
    await c.mover(
      'corte',
      [
        { recipienteId: t2, lote: { id: loteB }, centilitros: -cl(20), tipo: 'saida_corte' },
        {
          recipienteId: b1,
          lote: { id: loteA },
          centilitros: cl(20),
          tipo: 'entrada_corte',
          composicao: { recipienteId: t2 },
        },
      ],
      {
        genealogia: [
          {
            origem: { id: loteB },
            destino: { id: loteA },
            centilitros: cl(20),
            tipo: 'incorporacao',
          },
        ],
      },
    );
    const compB1 = await c.composicaoDe(b1);
    expect(compB1.volume).toBe('220.00');
    expect(pct(compB1.composicao, c.grenache)).toBe(90.91);
    expect(pct(compB1.composicao, c.syrah)).toBe(9.09);
    expect(pct((await c.composicaoDe(t1)).composicao, c.grenache)).toBe(100);
    const gen = await c.naCantina((ctx) =>
      ctx.tx.select().from(s.genealogia).where(eq(s.genealogia.destinoLoteId, loteA)),
    );
    expect(gen).toMatchObject([{ origemLoteId: loteB, litros: '20.00', tipo: 'incorporacao' }]);
  });

  it('um lote por vez e titulares diferentes não se misturam', async () => {
    const c = await cenario();
    const t1 = await c.recipiente('T1', '5000.00');
    const t2 = await c.recipiente('T2', '5000.00');
    const g = await c.uva(c.grenache, 1000);
    const sy = await c.uva(c.syrah, 1000);
    const loteA = (await c.desengace(g, t1, 1000, 700)).lotes.a!;
    const loteB = (await c.desengace(sy, t2, 1000, 700)).lotes.a!;
    // Lote B entra no T1 sem incorporar nem formar lote novo: dois lotes no recipiente.
    const e = await erroDe(
      c.mover('corte', [
        { recipienteId: t2, lote: { id: loteB }, centilitros: -cl(50), tipo: 'saida_corte' },
        {
          recipienteId: t1,
          lote: { id: loteB },
          centilitros: cl(50),
          tipo: 'entrada_corte',
          composicao: { recipienteId: t2 },
        },
      ]),
    );
    expect(e.message).toMatch(/mais de um lote/);

    // Lote de terceiro incorporado a lote próprio: bloqueado.
    const terceiro = (
      await c.master.post('/api/pessoas', {
        ficha: fichaPj('Cliente da Vinificação'),
        papeis: ['cliente_vinificacao'],
      })
    ).corpo.id as string;
    expect(terceiro).toBeTruthy();
    await c.naCantina((ctx) =>
      ctx.tx
        .update(s.lote)
        .set({ titularId: terceiro, tipo: 'terceiro' })
        .where(eq(s.lote.id, loteB)),
    );
    const mistura = await erroDe(
      c.mover('corte', [
        { recipienteId: t2, lote: { id: loteB }, centilitros: -cl(50), tipo: 'saida_corte' },
        {
          recipienteId: t1,
          lote: { id: loteA },
          centilitros: cl(50),
          tipo: 'entrada_corte',
          composicao: { recipienteId: t2 },
        },
      ]),
    );
    expect(mistura.message).toMatch(/titulares diferentes/);
    void loteA;
  });

  it('data passada: linha do tempo do volume e composição mudada depois bloqueiam', async () => {
    const c = await cenario();
    const t1 = await c.recipiente('T1', '5000.00');
    const t2 = await c.recipiente('T2', '5000.00');
    const g = await c.uva(c.grenache, 1000);
    const loteA = (await c.desengace(g, t1, 1000, 700)).lotes.a!;
    const ontem = new Date(Date.now() - 86_400_000);
    // Ontem o T1 ainda estava vazio: uma saída com data de ontem deixaria o saldo negativo.
    const e = await erroDe(
      c.mover(
        'trasfega',
        [
          { recipienteId: t1, lote: { id: loteA }, centilitros: -cl(100), tipo: 'saida_trasfega' },
          {
            recipienteId: t2,
            lote: { id: loteA },
            centilitros: cl(100),
            tipo: 'entrada_trasfega',
            composicao: { recipienteId: t1 },
          },
        ],
        { executadoEm: ontem },
      ),
    );
    expect(e.message).toMatch(/negativo|posterior/);
  });

  it('exemplo 3 do modelo: corte com lote novo leva a safra predominante no código', async () => {
    const c = await cenario();
    const t1 = await c.recipiente('T1', '5000.00');
    const t2 = await c.recipiente('T2', '5000.00');
    const t3 = await c.recipiente('T3', '5000.00');
    const g = await c.uva(c.grenache, 1000, '2026-02-10', '01');
    const m = await c.uva(c.syrah, 1000, '2025-08-10', '02');
    const loteA = (await c.desengace(g, t1, 1000, 700)).lotes.a!;
    const loteC = (await c.desengace(m, t2, 1000, 700)).lotes.a!;
    const r = await c.mover(
      'corte',
      [
        { recipienteId: t1, lote: { id: loteA }, centilitros: -cl(700), tipo: 'saida_corte' },
        { recipienteId: t2, lote: { id: loteC }, centilitros: -cl(300), tipo: 'saida_corte' },
        {
          recipienteId: t3,
          lote: { novo: 'n' },
          centilitros: cl(700),
          tipo: 'entrada_corte',
          composicao: { recipienteId: t1 },
        },
        {
          recipienteId: t3,
          lote: { novo: 'n' },
          centilitros: cl(300),
          tipo: 'entrada_corte',
          composicao: { recipienteId: t2 },
        },
      ],
      {
        lotesNovos: [{ chave: 'n', projetoId: c.projetoId, titularId: null, origem: 'corte' }],
        genealogia: [
          {
            origem: { id: loteA },
            destino: { novo: 'n' },
            centilitros: cl(700),
            tipo: 'lote_novo',
          },
          {
            origem: { id: loteC },
            destino: { novo: 'n' },
            centilitros: cl(300),
            tipo: 'lote_novo',
          },
        ],
      },
    );
    const lote = await c.naCantina(async (ctx) => {
      const [l] = await ctx.tx.select().from(s.lote).where(eq(s.lote.id, r.lotes.n!));
      const [a] = await ctx.tx
        .select()
        .from(s.lote)
        .where(and(eq(s.lote.id, loteA)));
      return { novo: l!, a: a! };
    });
    expect(lote.novo.codigo).toBe('2026.01-002');
    expect(lote.a.situacao).toBe('sem_saldo');
    const comp = (await c.composicaoDe(t3)).composicao;
    expect(pct(comp, c.grenache)).toBe(70);
    expect(pct(comp, c.syrah)).toBe(30);
  });
});
