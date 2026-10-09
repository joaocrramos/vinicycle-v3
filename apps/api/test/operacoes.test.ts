// Desengace e prensagem (cantina.md; 03-modelo-de-dados.md, 4.2 e 5.2): litros estimados pelo
// rendimento padrão, repartição por item, prensagem com frações, ajuste e rendimento real.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fichaPj, montar } from './apoio';
import { cantina as cenario } from './cantina';

let t: Awaited<ReturnType<typeof montar>>;
beforeAll(async () => {
  t = await montar();
});
afterAll(async () => {
  await t.fechar();
});

const agora = () => new Date().toISOString();

describe('desengace', () => {
  it('litros estimados pelo rendimento padrão; lote novo com etapa; uva baixada', async () => {
    const c = await cenario(t);
    await c.master.put('/api/cantina/rendimentos', {
      itens: [{ variedadeId: c.malbec, litrosPorKg: '0.7000' }],
    });
    const t1 = await c.recipiente('T1', '5000.00');
    const [item] = await c.romaneio([[c.malbec, '1000']]);
    const corpo = {
      executadoEm: agora(),
      projetoId: c.projeto,
      consumos: [{ itemId: item, kg: '1000' }],
      destinos: [{ recipienteId: t1, lote: { novo: 'A' } }],
    };
    const previa = (await c.master.post('/api/operacoes/desengace/previa', corpo)).corpo;
    expect(previa.bloqueios).toEqual([]);
    expect(previa.recipientes[0].depois.litros).toBe('700.00');
    expect(previa.recipientes[0].depois.composicao.componentes[0]).toMatchObject({
      variedadeId: c.malbec,
      safra: 2026,
      fracao: 1,
    });

    const r = await c.master.post('/api/operacoes/desengace', corpo);
    expect(r.status).toBe(200);
    expect(r.corpo.codigo).toMatch(/^OP-2026-0000\d$/);
    const l = await c.lote(t1);
    expect(l).toMatchObject({ codigo: '2026.01-001', volume: '700.00' });
    expect((await c.master.get('/api/romaneios/uva-a-processar')).corpo).toEqual([]);
    const op = (await c.master.get(`/api/operacoes/${r.corpo.operacaoId}`)).corpo;
    expect(op.movimentos).toMatchObject([
      { recipiente: 'T1', litros: '700.00', estimado: true, tipo: 'entrada_mosto' },
    ]);
    expect(op.uva).toMatchObject([{ kg: '1000.0', litros: '700.00' }]);
  });

  it('sem rendimento pede a estimativa; dois destinos com repartição por item', async () => {
    const c = await cenario(t);
    const t1 = await c.recipiente('T1', '5000.00');
    const t2 = await c.recipiente('T2', '5000.00');
    const [m, cs] = await c.romaneio([
      [c.malbec, '1000'],
      [c.cabernet, '500'],
    ]);
    const base = {
      executadoEm: agora(),
      projetoId: c.projeto,
      consumos: [
        { itemId: m, kg: '1000' },
        { itemId: cs, kg: '500' },
      ],
      destinos: [
        { recipienteId: t1, lote: { novo: 'A' } },
        { recipienteId: t2, lote: { novo: 'B' } },
      ],
      reparticao: [
        { itemId: m, recipienteId: t1, kg: '600' },
        { itemId: m, recipienteId: t2, kg: '400' },
        { itemId: cs, recipienteId: t2, kg: '500' },
      ],
    };
    expect((await c.master.post('/api/operacoes/desengace', base)).corpo.codigo).toBe(
      'sem_rendimento',
    );
    await c.master.put('/api/cantina/rendimentos', {
      itens: [
        { variedadeId: c.malbec, litrosPorKg: '0.7000' },
        { variedadeId: null, litrosPorKg: '0.6500' },
      ],
    });
    const errada = { ...base, reparticao: base.reparticao.slice(1) };
    expect((await c.master.post('/api/operacoes/desengace', errada)).corpo.codigo).toBe(
      'reparticao',
    );
    const r = await c.master.post('/api/operacoes/desengace', base);
    expect(r.status).toBe(200);
    expect((await c.lote(t1)).volume).toBe('420.00');
    const p = (
      await c.master.post('/api/operacoes/desengace/previa', {
        ...base,
        consumos: [],
      })
    ).status;
    expect(p).toBe(400);
    const l2 = await c.lote(t2);
    expect(l2.volume).toBe('605.00');
  });

  it('uvas de donos diferentes não vão juntas', async () => {
    const c = await cenario(t);
    const t1 = await c.recipiente('T1', '5000.00');
    const cliente = (
      await c.master.post('/api/pessoas', {
        ficha: fichaPj('Cliente'),
        papeis: ['cliente_vinificacao'],
      })
    ).corpo.id;
    const [a] = await c.romaneio([[c.malbec, '500']]);
    const [b] = await c.romaneio([[c.malbec, '500']], cliente);
    const r = await c.master.post('/api/operacoes/desengace', {
      executadoEm: agora(),
      projetoId: c.projeto,
      consumos: [
        { itemId: a, kg: '500' },
        { itemId: b, kg: '500' },
      ],
      destinos: [{ recipienteId: t1, lote: { novo: 'A' }, litros: '700' }],
    });
    expect(r.corpo.codigo).toBe('titulares');
  });
});

describe('prensagem', () => {
  it('da massa: ajuste para o medido, fração em lote novo, rendimento e alerta de 4/5', async () => {
    const c = await cenario(t);
    await c.master.put('/api/cantina/rendimentos', {
      itens: [{ variedadeId: null, litrosPorKg: '0.7000' }],
    });
    const t1 = await c.recipiente('T1', '5000.00');
    const t2 = await c.recipiente('T2', '5000.00');
    const [item] = await c.romaneio([[c.malbec, '1000']]);
    await c.master.post('/api/operacoes/desengace', {
      executadoEm: agora(),
      projetoId: c.projeto,
      consumos: [{ itemId: item, kg: '1000' }],
      destinos: [{ recipienteId: t1, lote: { novo: 'A' } }],
    });
    const loteA = await c.lote(t1);
    const prensa = (flor: string, prensa1: string, cientes: string[] = []) =>
      c.master.post('/api/operacoes/prensagem', {
        executadoEm: agora(),
        origemRecipienteId: t1,
        fracoes: [
          { fracao: 'flor', litros: flor, recipienteId: t1 },
          { fracao: 'prensa_1', litros: prensa1, recipienteId: t2, lote: { novo: 'B' } },
        ],
        cientes,
      });
    // 900 L de 1000 kg passam de 4/5: alerta com a fonte, e só confirma com ciente.
    const alto = await prensa('750', '150');
    expect(alto.corpo.codigo).toBe('ciente_pendente');
    expect(alto.corpo.detalhes.avisos[0].fonte).toBe('Decreto 12.709/2025, art. 93');
    const r = await prensa('500', '150');
    expect(r.status).toBe(200);
    const op = (await c.master.get(`/api/operacoes/${r.corpo.operacaoId}`)).corpo;
    expect(
      op.movimentos
        .map((m: { recipiente: string; tipo: string; litros: string }) => [
          m.recipiente,
          m.tipo,
          m.litros,
        ])
        .sort(),
    ).toEqual(
      [
        ['T1', 'ajuste_prensagem', '-50.00'],
        ['T1', 'saida_prensagem', '-150.00'],
        ['T2', 'entrada_prensagem', '150.00'],
      ].sort(),
    );
    expect(op.genealogia).toMatchObject([
      { origem: loteA.codigo, litros: '150.00', tipo: 'divisao' },
    ]);
    const a = await c.lote(t1);
    expect(a).toMatchObject({ volume: '500.00', rendimentoReal: '0.6500' });
    expect((await c.lote(t2)).volume).toBe('150.00');
  });

  it('direta da uva: litros medidos e rendimento no lote', async () => {
    const c = await cenario(t);
    const t3 = await c.recipiente('T3', '5000.00');
    const [item] = await c.romaneio([[c.cabernet, '500']]);
    const r = await c.master.post('/api/operacoes/prensagem', {
      executadoEm: agora(),
      projetoId: c.projeto,
      consumos: [{ itemId: item, kg: '500' }],
      fracoes: [{ fracao: 'flor', litros: '380', recipienteId: t3, lote: { novo: 'A' } }],
    });
    expect(r.status).toBe(200);
    expect(await c.lote(t3)).toMatchObject({ volume: '380.00', rendimentoReal: '0.7600' });
    const op = (await c.master.get(`/api/operacoes/${r.corpo.operacaoId}`)).corpo;
    expect(op.movimentos[0]).toMatchObject({ estimado: false, tipo: 'entrada_prensagem' });
    const lista = (await c.master.get(`/api/operacoes?projeto=${c.projeto}`)).corpo;
    expect(lista.itens[0]).toMatchObject({ tipo: 'prensagem', recipientes: ['T3'], kg: '500.0' });
  });
});

describe('rascunho', () => {
  it('salva pela metade sem mexer em volume; retoma, confirma com o mesmo id ou descarta', async () => {
    const c = await cenario(t);
    await c.master.put('/api/cantina/rendimentos', {
      itens: [{ variedadeId: null, litrosPorKg: '0.7000' }],
    });
    const t1 = await c.recipiente('T1', '5000.00');
    const [item] = await c.romaneio([[c.malbec, '1000']]);
    const novo = await c.master.post('/api/operacoes/rascunhos', {
      tipo: 'desengace',
      projetoId: c.projeto,
      formulario: { consumos: { [item!]: '1000' } },
    });
    expect(novo.status).toBe(200);
    const id = novo.corpo.id as string;
    let ficha = (await c.master.get(`/api/operacoes/${id}`)).corpo;
    expect(ficha).toMatchObject({ situacao: 'rascunho', codigo: null, versao: 1 });
    expect(ficha.formulario).toEqual({ consumos: { [item!]: '1000' } });
    // Não mexe em volume nem na uva; fica fora da lista das lançadas.
    expect((await c.master.get('/api/romaneios/uva-a-processar')).corpo).toHaveLength(1);
    expect((await c.master.get(`/api/operacoes?projeto=${c.projeto}`)).corpo.total).toBe(0);
    expect(
      (await c.master.get(`/api/operacoes?situacao=rascunho&projeto=${c.projeto}`)).corpo.itens,
    ).toMatchObject([{ id, tipo: 'desengace', situacao: 'rascunho' }]);

    const editar = (versao: number) =>
      c.master.put(`/api/operacoes/rascunhos/${id}`, {
        tipo: 'desengace',
        projetoId: c.projeto,
        formulario: { consumos: { [item!]: '1000' }, destino: t1 },
        versao,
      });
    expect((await editar(1)).status).toBe(200);
    expect((await editar(1)).corpo.codigo).toBe('conflito');
    ficha = (await c.master.get(`/api/operacoes/${id}`)).corpo;
    expect(ficha.formulario.destino).toBe(t1);

    const corpo = {
      executadoEm: agora(),
      projetoId: c.projeto,
      consumos: [{ itemId: item, kg: '1000' }],
      destinos: [{ recipienteId: t1, lote: { novo: 'A' } }],
      rascunhoId: id,
    };
    const ok = await c.master.post('/api/operacoes/desengace', corpo);
    expect(ok.status).toBe(200);
    expect(ok.corpo.operacaoId).toBe(id);
    ficha = (await c.master.get(`/api/operacoes/${id}`)).corpo;
    expect(ficha).toMatchObject({ situacao: 'confirmada', formulario: null });
    expect(ficha.codigo).toMatch(/^OP-2026-/);
    expect((await c.lote(t1)).volume).toBe('700.00');
    // Confirmado, não se confirma de novo, não se edita nem se descarta.
    expect((await c.master.post('/api/operacoes/desengace', corpo)).corpo.codigo).toBe('rascunho');
    expect((await editar(2)).corpo.codigo).toBe('confirmada');
    expect((await c.master.post(`/api/operacoes/rascunhos/${id}/descartar`)).corpo.codigo).toBe(
      'confirmada',
    );

    const outro = (
      await c.master.post('/api/operacoes/rascunhos', { tipo: 'prensagem', formulario: {} })
    ).corpo.id;
    expect((await c.master.post(`/api/operacoes/rascunhos/${outro}/descartar`)).status).toBe(200);
    expect((await c.master.get(`/api/operacoes/${outro}`)).status).toBe(404);
  });
});

describe('estorno', () => {
  it('exige estornar antes os dependentes; volta volume, uva, lote, genealogia e rendimento', async () => {
    const c = await cenario(t);
    await c.master.put('/api/cantina/rendimentos', {
      itens: [{ variedadeId: null, litrosPorKg: '0.7000' }],
    });
    const t1 = await c.recipiente('T1', '5000.00');
    const t2 = await c.recipiente('T2', '5000.00');
    const [item] = await c.romaneio([[c.malbec, '1000']]);
    const d = await c.master.post('/api/operacoes/desengace', {
      executadoEm: agora(),
      projetoId: c.projeto,
      consumos: [{ itemId: item, kg: '1000' }],
      destinos: [{ recipienteId: t1, lote: { novo: 'A' } }],
    });
    const loteA = await c.lote(t1);
    const p = await c.master.post('/api/operacoes/prensagem', {
      executadoEm: agora(),
      origemRecipienteId: t1,
      fracoes: [
        { fracao: 'flor', litros: '500', recipienteId: t1 },
        { fracao: 'prensa_1', litros: '150', recipienteId: t2, lote: { novo: 'B' } },
      ],
    });
    expect(p.status).toBe(200);
    const loteB = await c.lote(t2);

    // O desengace tem a prensagem como dependente.
    const previa = (await c.master.get(`/api/operacoes/${d.corpo.operacaoId}/estorno`)).corpo;
    expect(previa.dependentes).toMatchObject([{ codigo: p.corpo.codigo, tipo: 'prensagem' }]);
    const bloqueado = await c.master.post(`/api/operacoes/${d.corpo.operacaoId}/estorno`, {
      motivo: 'Lançado no tanque errado',
    });
    expect(bloqueado.corpo.codigo).toBe('dependentes');
    expect(
      (await c.master.post(`/api/operacoes/${p.corpo.operacaoId}/estorno`, { motivo: '' })).corpo
        .codigo,
    ).toBe('validacao');

    // Estorno da prensagem: T1 volta à estimativa, T2 esvazia, lote B sem saldo.
    const pp = (await c.master.get(`/api/operacoes/${p.corpo.operacaoId}/estorno`)).corpo;
    expect(pp.bloqueios).toEqual([]);
    expect(pp.recipientes.find((r: { recipiente: string }) => r.recipiente === 'T1')).toMatchObject(
      { antes: '500.00', depois: '700.00' },
    );
    const e1 = await c.master.post(`/api/operacoes/${p.corpo.operacaoId}/estorno`, {
      motivo: 'Frações trocadas',
    });
    expect(e1.status).toBe(200);
    expect(e1.corpo.codigo).toMatch(/^OP-2026-/);
    const fichaP = (await c.master.get(`/api/operacoes/${p.corpo.operacaoId}`)).corpo;
    expect(fichaP).toMatchObject({
      situacao: 'estornada',
      estornadaPor: { codigo: e1.corpo.codigo, motivo: 'Frações trocadas' },
    });
    const fichaE = (await c.master.get(`/api/operacoes/${e1.corpo.operacaoId}`)).corpo;
    expect(fichaE).toMatchObject({ tipo: 'estorno', estornoDe: { codigo: p.corpo.codigo } });
    expect(fichaE.movimentos.every((m: { tipo: string }) => m.tipo === 'estorno')).toBe(true);
    const a = (await c.master.get(`/api/lotes/${loteA.id}`)).corpo;
    expect(a).toMatchObject({ volume: '700.00', rendimentoReal: null, genealogia: [] });
    expect((await c.master.get(`/api/lotes/${loteB.id}`)).corpo).toMatchObject({
      volume: '0.00',
      situacao: 'sem_saldo',
    });
    const conteudo = (await c.master.get(`/api/recipientes/${t1}/conteudo`)).corpo;
    expect(conteudo.composicao.componentes[0]).toMatchObject({ variedadeId: c.malbec });

    // Agora o desengace se estorna: T1 vazio e a uva volta a processar.
    const e2 = await c.master.post(`/api/operacoes/${d.corpo.operacaoId}/estorno`, {
      motivo: 'Lançado no tanque errado',
    });
    expect(e2.status).toBe(200);
    expect((await c.master.get(`/api/recipientes/${t1}/conteudo`)).corpo.volume).toBe('0.00');
    const uva = (await c.master.get('/api/romaneios/uva-a-processar')).corpo;
    expect(uva).toMatchObject([{ itemId: item, saldoKg: '1000.0' }]);
    expect((await c.master.get(`/api/lotes/${loteA.id}`)).corpo.uva).toEqual([]);

    // Estornada não se estorna de novo; o estorno não se estorna.
    expect(
      (await c.master.post(`/api/operacoes/${d.corpo.operacaoId}/estorno`, { motivo: 'De novo' }))
        .corpo.codigo,
    ).toBe('estorno');
    expect(
      (await c.master.post(`/api/operacoes/${e2.corpo.operacaoId}/estorno`, { motivo: 'Desfazer' }))
        .corpo.codigo,
    ).toBe('estorno');
    const lista = (await c.master.get(`/api/operacoes?projeto=${c.projeto}`)).corpo.itens as Array<{
      tipo: string;
      situacao: string;
    }>;
    expect(lista.map((o) => `${o.tipo}:${o.situacao}`).sort()).toEqual(
      [
        'desengace:estornada',
        'estorno:confirmada',
        'estorno:confirmada',
        'prensagem:estornada',
      ].sort(),
    );
  });

  it('a composição volta à versão anterior e vale para as operações seguintes', async () => {
    const c = await cenario(t);
    await c.master.put('/api/cantina/rendimentos', {
      itens: [{ variedadeId: null, litrosPorKg: '0.7000' }],
    });
    const t1 = await c.recipiente('T1', '5000.00');
    const [m] = await c.romaneio([[c.malbec, '1000']]);
    const [cs, cs2] = await c.romaneio([
      [c.cabernet, '1000'],
      [c.cabernet, '500'],
    ]);
    const desengace = (itemId: string, kg: string, lote: object) =>
      c.master.post('/api/operacoes/desengace', {
        executadoEm: agora(),
        projetoId: c.projeto,
        consumos: [{ itemId, kg }],
        destinos: [{ recipienteId: t1, lote }],
      });
    expect((await desengace(m!, '1000', { novo: 'A' })).status).toBe(200);
    const loteA = (await c.lote(t1)).id;
    const segundo = await desengace(cs!, '1000', { id: loteA });
    expect(segundo.status).toBe(200);
    const fracao = async (variedadeId: string) => {
      const comp = (await c.master.get(`/api/recipientes/${t1}/conteudo`)).corpo.composicao
        .componentes as Array<{ variedadeId: string; fracao: number }>;
      return comp.filter((x) => x.variedadeId === variedadeId).reduce((t, x) => t + x.fracao, 0);
    };
    expect(await fracao(c.cabernet)).toBeCloseTo(0.5, 6);

    expect(
      (
        await c.master.post(`/api/operacoes/${segundo.corpo.operacaoId}/estorno`, {
          motivo: 'Uva errada',
        })
      ).status,
    ).toBe(200);
    expect(await fracao(c.malbec)).toBe(1);

    // A próxima incorporação parte da composição restaurada: 700 L Malbec + 350 L Cabernet.
    expect((await desengace(cs2!, '500', { id: loteA })).status).toBe(200);
    expect(await fracao(c.cabernet)).toBeCloseTo(350 / 1050, 6);
  });
});

describe('estorno do romaneio', () => {
  it('só sem uva processada; a uva sai do saldo a processar', async () => {
    const c = await cenario(t);
    await c.master.put('/api/cantina/rendimentos', {
      itens: [{ variedadeId: null, litrosPorKg: '0.7000' }],
    });
    const t1 = await c.recipiente('T1', '5000.00');
    const [item] = await c.romaneio([[c.malbec, '1000']]);
    const rom = (await c.master.get('/api/romaneios?situacao=confirmado')).corpo.itens[0].id;
    const d = await c.master.post('/api/operacoes/desengace', {
      executadoEm: agora(),
      projetoId: c.projeto,
      consumos: [{ itemId: item, kg: '400' }],
      destinos: [{ recipienteId: t1, lote: { novo: 'A' } }],
    });
    const estornar = () =>
      c.master.post(`/api/romaneios/${rom}/estorno`, { motivo: 'Pesagem errada' });
    const bloqueado = await estornar();
    expect(bloqueado.corpo.codigo).toBe('dependentes');
    expect(bloqueado.corpo.detalhes.dependentes).toMatchObject([{ codigo: d.corpo.codigo }]);
    await c.master.post(`/api/operacoes/${d.corpo.operacaoId}/estorno`, { motivo: 'Refazer' });
    expect((await estornar()).status).toBe(200);
    expect((await c.master.get(`/api/romaneios/${rom}`)).corpo).toMatchObject({
      situacao: 'estornado',
      motivoEstorno: 'Pesagem errada',
    });
    expect((await c.master.get('/api/romaneios/uva-a-processar')).corpo).toEqual([]);
    expect((await estornar()).corpo.codigo).toBe('estorno');
  });
});
