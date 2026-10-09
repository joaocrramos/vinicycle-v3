// Espumante na garrafa (04, roteiro do ciclo 9, bloco 3): tiragem (sai do recipiente para as
// garrafas em processo), estágios com perdas e licor de expedição, anulação, estorno só sem
// estágio, finalização em lote comercial e a declaração anual com o espumante em elaboração.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { montar } from './apoio';
import { cantina } from './cantina';

let t: Awaited<ReturnType<typeof montar>>;
beforeAll(async () => {
  t = await montar();
});
afterAll(async () => {
  await t.fechar();
});

describe('espumante na garrafa', () => {
  it('tiragem, estágios, finalização e estorno', async () => {
    const c = await cantina(t);
    const m = c.master;
    const ok = (r: { status: number; corpo: unknown }) => {
      expect(r.status, JSON.stringify(r.corpo)).toBe(200);
      return r.corpo as Record<string, string>;
    };
    const local = async (nome: string) =>
      ok(await m.post('/api/locais', { nome, uso: 'estoque', moduloEstoque: 'ENOTRACE' }))
        .id as string;
    const alm = await local('Almoxarifado');
    const loja = await local('Loja');
    const t1 = await c.recipiente('T1', '5000.00');
    const tipos = (await m.get('/api/catalogos/tipo_insumo?tamanho=0')).corpo.itens as Array<{
      id: string;
      nome: string;
    }>;
    const tampa = ok(
      await m.post('/api/itens-estoque', {
        tipo: 'embalagem',
        nome: 'Tampa-coroa',
        unidadeBase: 'un',
      }),
    ).id as string;
    const acucar = ok(
      await m.post('/api/itens-estoque', {
        tipo: 'insumo',
        nome: 'Licor de expedição',
        unidadeBase: 'kg',
        insumo: { tipoInsumoId: tipos.find((x) => x.nome === 'Açúcar (chaptalização)')!.id },
      }),
    ).id as string;
    ok(
      await m.post('/api/estoque/entradas', {
        executadoEm: new Date(Date.now() - 7_200_000).toISOString(),
        localId: alm,
        itens: [
          { itemId: tampa, quantidade: '1000', lote: null },
          { itemId: acucar, quantidade: '50', lote: null },
        ],
      }),
    );
    // Vinho-base: 1.000 L em T1 (carga inicial de uma hora atrás).
    const csv =
      'recipiente;projeto;lote;litros;variedade;safra;percentual;organica\nT1;Base 2025;A;1000;Chardonnay;2025;100;não';
    const carga = await t.app.inject({
      method: 'POST',
      url: `/api/carga-inicial?tipo=saldo_granel&data=${encodeURIComponent(new Date(Date.now() - 3_600_000).toISOString())}`,
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

    // Tiragem: 400 garrafas de 750 mL (300 L) de 302 L tirados; tampas baixadas.
    const corpo = {
      executadoEm: new Date(Date.now() - 1_800_000).toISOString(),
      metodo: 'tradicional',
      recipientes: [{ recipienteId: t1, litros: '302.00' }],
      volumeMl: 750,
      garrafas: 400,
      materiais: [{ itemId: tampa, quantidade: '400' }],
      localEstoqueId: alm,
    };
    expect(
      (await m.post('/api/espumantes/tiragem', { ...corpo, garrafas: 500 })).corpo.codigo,
    ).toBe('garrafas_demais');
    const previa = ok(await m.post('/api/espumantes/tiragem/previa', corpo));
    expect(previa).toMatchObject({
      tiradosLitros: '302.00',
      garrafasLitros: '300.00',
      perdaLitros: '2.00',
    });
    const tir = ok(await m.post('/api/espumantes/tiragem', corpo));
    expect(tir.loteTiragem).toMatch(/^TIR-\d{4}-001$/);
    expect((await m.get(`/api/recipientes/${t1}/conteudo`)).corpo.volume).toBe('698.00');

    // Estágios: repouso, remuage com 5 quebradas, licor de expedição com 2 kg.
    const estagio = (b: object) => m.post(`/api/espumantes/${tir.id}/estagios`, b);
    const agora = new Date().toISOString();
    expect((await estagio({ estagio: 'inexistente', executadoEm: agora })).corpo.codigo).toBe(
      'estagio_espumante',
    );
    ok(await estagio({ estagio: 'repouso_borras', executadoEm: agora }));
    const remuage = ok(await estagio({ estagio: 'remuage', executadoEm: agora, perdas: 5 }));
    ok(
      await estagio({
        estagio: 'licor_expedicao',
        executadoEm: agora,
        perdas: 1,
        insumos: [{ itemId: acucar, quantidade: '2' }],
        localEstoqueId: alm,
      }),
    );
    let lote = ok(await m.get(`/api/espumantes/${tir.id}`));
    expect(lote).toMatchObject({ garrafas: 394, situacao: 'em_processo' });
    expect((await m.get(`/api/estoque/itens/${acucar}`)).corpo.saldo).toBe('48.000');

    // Com estágio, a tiragem não se estorna; anulado o estágio, as perdas voltam.
    expect(
      (await m.post(`/api/operacoes/${tir.operacaoId}/estorno`, { motivo: 'Teste' })).corpo.codigo,
    ).toBe('espumante');
    ok(
      await m.post(`/api/espumantes/${tir.id}/estagios/${remuage.id}/anular`, {
        motivo: 'Contagem errada',
      }),
    );
    lote = ok(await m.get(`/api/espumantes/${tir.id}`));
    expect(lote.garrafas).toBe(399);

    // Declaração do ano: o espumante em elaboração.
    const ano = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia' })
      .format(new Date())
      .slice(0, 4);
    const dec = (await m.get(`/api/declaracoes/${ano}/anual_mapa`)).corpo.numeros;
    expect(dec.emProcesso).toMatchObject({ tiragens: '300.00', perdas: '0.75', final: '299.25' });

    // Finalização: produto espumante de 750 mL; as 399 garrafas entram no lote comercial.
    const marca = ok(await m.post('/api/marcas', { nome: 'Bolhas' })).id as string;
    const ref = (await m.get('/api/referencia')).corpo;
    const produto = ok(
      await m.post('/api/produtos', {
        nome: 'Brut',
        marcaId: marca,
        classeProdutoId: ref.classesProduto.find(
          (x: { codigo: string }) => x.codigo === 'espumante_natural',
        ).id,
        cor: 'branco',
        teorAcucar: 'brut',
        metodoEspumante: 'tradicional',
      }),
    ).id as string;
    const f375 = ok(await m.post(`/api/produtos/${produto}/formatos`, { volumeMl: 375 })).id;
    const f750 = ok(await m.post(`/api/produtos/${produto}/formatos`, { volumeMl: 750 })).id;
    const finalizar = (formatoId: string) =>
      m.post(`/api/espumantes/${tir.id}/finalizar`, {
        executadoEm: new Date().toISOString(),
        produtoId: produto,
        formatoId,
        localId: loja,
      });
    expect((await finalizar(f375!)).corpo.codigo).toBe('formato');
    const fim = ok(await finalizar(f750!));
    expect(fim).toMatchObject({ garrafas: 399 });
    lote = ok(await m.get(`/api/espumantes/${tir.id}`));
    expect(lote).toMatchObject({ situacao: 'finalizado', garrafasFinais: 399 });
    const lc = (await m.get('/api/lotes-comerciais')).corpo.find(
      (x: { codigo: string }) => x.codigo === fim.loteComercial,
    );
    expect(lc).toBeTruthy();
    const h = (await m.get(`/api/historia?loteComercial=${lc.id}`)).corpo;
    expect(h.operacoes.map((o: { tipo: string }) => o.tipo)).toContain('tiragem');
    expect(
      (
        await m.post(`/api/espumantes/${tir.id}/estagios`, {
          estagio: 'remuage',
          executadoEm: agora,
        })
      ).corpo.codigo,
    ).toBe('situacao');
  });
});
