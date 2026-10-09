// Declarações (04, roteiro do ciclo 7): números da declaração anual, apoio ao SIVIBE, entrega com
// protocolo, trava do ano declarado e retificação.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fichaPj, montar } from './apoio';
import { cantina } from './cantina';

let t: Awaited<ReturnType<typeof montar>>;
beforeAll(async () => {
  t = await montar();
});
afterAll(async () => {
  await t.fechar();
});

describe('declarações', () => {
  it('declaração anual: produção, estorno pelo tipo original e avisos; SIVIBE', async () => {
    const c = await cantina(t);
    const m = c.master;
    const t1 = await c.recipiente('T1', '5000.00');
    const t3 = await c.recipiente('T3', '5000.00');
    await m.put('/api/cantina/rendimentos', {
      itens: [{ variedadeId: null, litrosPorKg: '0.7000' }],
    });
    const [malbec, cabernet] = await c.romaneio([
      [c.malbec, '1000'],
      [c.cabernet, '500'],
    ]);
    const desengace = (itemId: string, kg: string, recipienteId: string) =>
      m.post('/api/operacoes/desengace', {
        executadoEm: '2026-02-11T10:00:00-03:00',
        projetoId: c.projeto,
        consumos: [{ itemId, kg }],
        destinos: [{ recipienteId, lote: { novo: recipienteId === t1 ? 'A' : 'B' } }],
      });
    expect((await desengace(malbec!, '1000', t1)).status).toBe(200);
    const segundo = await desengace(cabernet!, '500', t3);
    expect(segundo.status).toBe(200);
    expect(
      (await m.post(`/api/operacoes/${segundo.corpo.operacaoId}/estorno`, { motivo: 'teste' }))
        .status,
    ).toBe(200);

    // Fornecedor sem número no SIVIBE.
    const fornecedor = (
      await m.post('/api/pessoas', { ficha: fichaPj('Viticultor X'), papeis: ['produtor_uva'] })
    ).corpo.id;
    const r = await m.post('/api/romaneios', {
      chegadaEm: '2026-03-01T08:00:00-03:00',
      projetoId: c.projeto,
      origem: 'fornecedor',
      fornecedorId: fornecedor,
      nfNumero: '55',
      itens: [
        {
          variedadeId: c.malbec,
          dataColheita: '2026-03-01',
          brix: '22',
          pesagens: [{ pesadoEm: '2026-03-01T08:00:00-03:00', brutoKg: '1800', taraKg: '1000' }],
        },
      ],
    });
    const avisos = (await m.get(`/api/romaneios/${r.corpo.id}/previa`)).corpo.avisos as Array<{
      codigo: string;
    }>;
    await m.post(`/api/romaneios/${r.corpo.id}/confirmar`, {
      cientes: avisos.map((a) => a.codigo),
    });

    const d = (await m.get('/api/declaracoes/2026/anual_mapa')).corpo;
    expect(d).toMatchObject({ terminou: false, registro: null, instantaneo: false });
    expect(d.numeros.granel).toEqual([
      {
        titularId: null,
        titular: null,
        classe: null,
        cor: 'Tinto',
        litros: {
          inicial: '0.00',
          producao: '700.00',
          entradas: '0.00',
          engarrafado: '0.00',
          saidas: '0.00',
          perdas: '0.00',
          ajustes: '0.00',
          internos: '0.00',
          final: '700.00',
        },
      },
    ]);
    expect(d.numeros.totais).toMatchObject([
      { titularId: null, granel: { inicial: '0.00', producao: '700.00', final: '700.00' } },
    ]);
    const codigos = d.numeros.avisos.map((a: { codigo: string }) => a.codigo);
    expect(codigos).toEqual(['declaracao:meses_abertos', 'declaracao:sem_classe']);

    const cedo = await m.post('/api/declaracoes/2026/anual_mapa/declarar', { protocolo: '1' });
    expect(cedo.corpo.codigo).toBe('ano_aberto');

    const sv = (await m.get('/api/declaracoes/2026/sivibe')).corpo.numeros;
    expect(sv.propria).toMatchObject([
      { propriedade: null, variedade: 'Cabernet Sauvignon', kg: '500.0' },
      { propriedade: null, variedade: 'Malbec', kg: '1000.0' },
    ]);
    expect(sv.compradas).toMatchObject([
      { nome: 'Viticultor X', variedade: 'Malbec', kg: '800.0', notas: ['55'], numeroSivibe: null },
    ]);
    expect(sv.avisos.map((a: { codigo: string }) => a.codigo)).toEqual([
      'sivibe:produtor',
      'sivibe:parcela',
    ]);
  });

  it('entrega com protocolo, ano travado e retificação', async () => {
    const c = await cantina(t);
    const m = c.master;
    await c.recipiente('T3', '5000.00');
    const csv =
      'recipiente;projeto;lote;litros;variedade;safra;percentual;organica\nT3;Malbec 2024;A;1000;Malbec;2024;100;não';
    const carga = await t.app.inject({
      method: 'POST',
      url: `/api/carga-inicial?tipo=saldo_granel&data=${encodeURIComponent('2025-06-01T10:00:00-03:00')}`,
      headers: {
        cookie: m.cookie,
        'x-vinicycle': '1',
        'content-type': 'multipart/form-data; boundary=x',
      },
      payload: Buffer.from(
        `--x\r\nContent-Disposition: form-data; name="arquivo"; filename="c.csv"\r\nContent-Type: text/csv\r\n\r\n${csv}\r\n--x--\r\n`,
      ),
    });
    expect(carga.statusCode, carga.body).toBe(200);
    const cargaId = (await m.get('/api/carga-inicial')).corpo[0].id;

    const antes = (await m.get('/api/declaracoes/2025/anual_mapa')).corpo;
    expect(antes.terminou).toBe(true);
    expect(antes.numeros.granel[0].litros).toMatchObject({
      inicial: '0.00',
      producao: '0.00',
      entradas: '1000.00',
      final: '1000.00',
    });

    const sem = await m.post('/api/declaracoes/2025/anual_mapa/declarar', { protocolo: 'P-1' });
    expect(sem.corpo.codigo).toBe('ciente_pendente');
    const cientes = antes.numeros.avisos.map((a: { codigo: string }) => a.codigo);
    expect(
      (await m.post('/api/declaracoes/2025/anual_mapa/declarar', { protocolo: 'P-1', cientes }))
        .status,
    ).toBe(200);
    const dep = (await m.get('/api/declaracoes/2025/anual_mapa')).corpo;
    expect(dep).toMatchObject({
      instantaneo: true,
      registro: { situacao: 'declarada', protocolo: 'P-1' },
    });
    expect(
      (await m.post('/api/declaracoes/2025/anual_mapa/declarar', { protocolo: 'P-2', cientes }))
        .corpo.codigo,
    ).toBe('declarada');

    // Ano declarado travado: o estorno da carga (data em 2025) não passa.
    const travado = await m.post(`/api/carga-inicial/${cargaId}/estorno`, { motivo: 'erro' });
    expect(travado.corpo).toMatchObject({ codigo: 'periodo_fechado' });
    expect(travado.corpo.mensagem).toContain('2025 já foi declarado');

    // Retificação: abre (destrava), corrige, conclui com o novo protocolo.
    expect(
      (await m.post('/api/declaracoes/2025/anual_mapa/retificacao', { motivo: 'carga errada' }))
        .status,
    ).toBe(200);
    expect((await m.post(`/api/carga-inicial/${cargaId}/estorno`, { motivo: 'erro' })).status).toBe(
      200,
    );
    const ret = (await m.get('/api/declaracoes/2025/anual_mapa')).corpo;
    expect(ret).toMatchObject({ instantaneo: false, registro: { situacao: 'em_retificacao' } });
    expect(ret.numeros.granel).toEqual([]);
    expect(
      (
        await m.post('/api/declaracoes/2025/anual_mapa/retificacao/concluir', {
          protocolo: 'P-2',
          cientes: ret.numeros.avisos.map((a: { codigo: string }) => a.codigo),
        })
      ).status,
    ).toBe(200);
    const fim = (await m.get('/api/declaracoes/2025/anual_mapa')).corpo;
    expect(fim).toMatchObject({
      instantaneo: true,
      registro: { situacao: 'retificada', protocolo: 'P-2' },
      retificacoes: [{ motivo: 'carga errada', protocoloAnterior: 'P-1', protocolo: 'P-2' }],
    });
    expect((await m.get('/api/declaracoes')).corpo).toMatchObject([
      { tipo: 'anual_mapa', ano: 2025, situacao: 'retificada' },
    ]);
  });
});
