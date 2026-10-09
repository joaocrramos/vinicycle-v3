// Produção em terceiro, o "vinho cigano" (04, roteiro do ciclo 10, bloco 5): remessa de uva, granel
// e insumos; retornos parciais com as perdas informadas; resumo da remessa; SIVIBE e declaração.
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

const antes = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

describe('produção em terceiro', () => {
  it('remessa, retornos parciais, resumo, SIVIBE e declaração', async () => {
    const c = await cantina(t);
    const m = c.master;
    const ok = (r: { status: number; corpo: unknown }) => {
      expect(r.status, JSON.stringify(r.corpo)).toBe(200);
      return r.corpo as Record<string, string>;
    };
    const pessoa = async (nome: string, papeis: string[]) =>
      ok(await m.post('/api/pessoas', { ficha: fichaPj(nome), papeis })).id!;
    const cantinaX = await pessoa('Cantina X Ltda', ['cantina_prestadora']);
    const fornecedor = await pessoa('Viticultor Y', ['produtor_uva']);
    const local = async (nome: string, externo = false) =>
      ok(await m.post('/api/locais', { nome, uso: 'estoque', moduloEstoque: 'ENOTRACE', externo }))
        .id!;
    const alm = await local('Almoxarifado');
    const loja = await local('Expedição');
    const naCantina = await local('Cantina X', true);
    const garrafa = ok(
      await m.post('/api/itens-estoque', {
        tipo: 'embalagem',
        nome: 'Garrafa 750',
        unidadeBase: 'un',
      }),
    ).id!;
    ok(
      await m.post('/api/estoque/entradas', {
        executadoEm: antes(120),
        localId: alm,
        itens: [{ itemId: garrafa, quantidade: '500', lote: null }],
      }),
    );
    const [itemRomaneio] = await c.romaneio([[c.malbec, '2000']]);
    // Vinho próprio e a saída a granel para a cantina (remessa a terceiro).
    const t1 = await c.recipiente('T1', '5000.00');
    const t2 = await c.recipiente('T2', '5000.00');
    ok(
      await m.post('/api/operacoes/entrada_granel', {
        executadoEm: antes(110),
        tipoGranel: 'compra',
        projetoId: c.projeto,
        composicao: [{ variedadeId: c.malbec, safra: 2026, percentual: '100' }],
        destinos: [{ recipienteId: t1, litros: '500.00', lote: { novo: 'A' } }],
      }),
    );
    const saida = ok(
      await m.post('/api/operacoes/saida_granel', {
        executadoEm: antes(100),
        tipoGranel: 'remessa_terceiro',
        destinatarioId: cantinaX,
        glt: 'GLT-1',
        itens: [{ recipienteId: t1, litros: '200.00' }],
      }),
    ).operacaoId!;
    expect(
      (await m.get(`/api/terceiros/granel-para-remessa?projetoId=${c.projeto}`)).corpo.map(
        (x: { id: string }) => x.id,
      ),
    ).toEqual([saida]);

    const remessa = (itens: unknown[]) =>
      m.post('/api/terceiros/remessas', {
        executadoEm: antes(90),
        projetoId: c.projeto,
        cantinaId: cantinaX,
        nfNumero: '901',
        itens,
      });
    // Mais uva do que o romaneio tem sem destino.
    expect(
      (
        await remessa([
          {
            tipo: 'uva',
            variedadeId: c.malbec,
            kg: '2500',
            origemUva: 'romaneio',
            romaneioItemId: itemRomaneio,
          },
        ])
      ).corpo.codigo,
    ).toBe('kg');
    // O destino dos insumos precisa ser um local externo.
    expect(
      (
        await remessa([
          {
            tipo: 'insumo',
            itemId: garrafa,
            quantidade: '10',
            localOrigemId: alm,
            localDestinoId: loja,
          },
        ])
      ).corpo.codigo,
    ).toBe('local_externo');
    const rem = ok(
      await remessa([
        {
          tipo: 'uva',
          variedadeId: c.malbec,
          safra: 2026,
          kg: '1500',
          origemUva: 'romaneio',
          romaneioItemId: itemRomaneio,
        },
        {
          tipo: 'uva',
          variedadeId: c.cabernet,
          safra: 2026,
          kg: '300',
          origemUva: 'fornecedor',
          fornecedorId: fornecedor,
        },
        { tipo: 'granel', operacaoId: saida },
        {
          tipo: 'insumo',
          itemId: garrafa,
          quantidade: '400',
          localOrigemId: alm,
          localDestinoId: naCantina,
        },
      ]),
    ).id!;
    // A uva remetida sai do saldo do romaneio.
    const aProcessar = (await m.get('/api/romaneios/uva-a-processar')).corpo as Array<{
      itemId: string;
      liquidoKg: string;
      consumidoKg: string;
    }>;
    const linha = aProcessar.find((x) => x.itemId === itemRomaneio)!;
    expect(Number(linha.liquidoKg) - Number(linha.consumidoKg)).toBe(500);
    expect((await m.get(`/api/terceiros/remessas/${rem}/composicao`)).corpo).toEqual([
      { variedadeId: c.malbec, safra: 2026, percentual: '83.33' },
      { variedadeId: c.cabernet, safra: 2026, percentual: '16.67' },
    ]);

    // Retorno parcial a granel, com a composição sugerida pela remessa e as perdas informadas.
    const ret1 = ok(
      await m.post('/api/terceiros/retornos', {
        executadoEm: antes(60),
        projetoId: c.projeto,
        cantinaId: cantinaX,
        remessaId: rem,
        nfNumero: '77',
        glt: 'GLT-2',
        perdasInformadas: '50',
        itens: [{ tipo: 'granel', recipienteId: t2, litros: '600.00', lote: { novo: 'A' } }],
      }),
    ).id!;
    const conteudo = (await m.get(`/api/recipientes/${t2}/conteudo`)).corpo;
    expect(conteudo.volume).toBe('600.00');
    // Segundo retorno: garrafas com o lote da cantina e o consumo das garrafas remetidas.
    const marca = ok(await m.post('/api/marcas', { nome: 'Sertão' })).id!;
    const ref = (await m.get('/api/referencia')).corpo;
    const produto = ok(
      await m.post('/api/produtos', {
        nome: 'Tinto',
        marcaId: marca,
        classeProdutoId: ref.classesProduto.find(
          (x: { codigo: string }) => x.codigo === 'vinho_fino',
        ).id,
        cor: 'tinto',
      }),
    ).id!;
    const f750 = ok(await m.post(`/api/produtos/${produto}/formatos`, { volumeMl: 750 })).id!;
    ok(
      await m.post('/api/terceiros/retornos', {
        executadoEm: antes(30),
        projetoId: c.projeto,
        cantinaId: cantinaX,
        remessaId: rem,
        nfNumero: '78',
        itens: [
          {
            tipo: 'engarrafado',
            formatoId: f750,
            garrafas: 800,
            loteComercial: 'CX-L26-01',
            localId: loja,
          },
          { tipo: 'insumo_consumido', itemId: garrafa, quantidade: '390', localId: naCantina },
        ],
      }),
    );

    let r = (await m.get(`/api/terceiros/remessas/${rem}`)).corpo;
    expect(r).toMatchObject({
      kgUva: '1800.0',
      litrosGranel: '200.00',
      litrosRetornados: '1200.00',
      perdasInformadas: '50.00',
      rendimento: '0.667',
      andamento: 'retorno_parcial',
      numeroRetornos: 2,
    });
    const insumo = (r.itens as Array<{ tipo: string; emPoder: string }>).find(
      (x) => x.tipo === 'insumo',
    )!;
    expect(insumo.emPoder).toBe('10.000');
    ok(await m.post(`/api/terceiros/remessas/${rem}/concluir`, { concluida: true }));
    r = (await m.get(`/api/terceiros/remessas/${rem}`)).corpo;
    expect(r.andamento).toBe('concluida');

    // SIVIBE: uva enviada para processamento por terceiros; declaração: retornos de terceiro.
    const ano = new Date().getFullYear();
    const sv = (await m.get(`/api/declaracoes/${ano}/sivibe`)).corpo.numeros;
    expect(sv.enviadas).toEqual([
      expect.objectContaining({
        cantina: 'Cantina X Ltda',
        variedade: 'Cabernet Sauvignon',
        kg: '300.0',
        notas: ['901'],
      }),
      expect.objectContaining({
        cantina: 'Cantina X Ltda',
        variedade: 'Malbec',
        kg: '1500.0',
        origem: 'romaneio',
      }),
    ]);
    const an = (await m.get(`/api/declaracoes/${ano}/anual_mapa`)).corpo.numeros;
    expect(an.retornosTerceiro).toEqual({
      granelLitros: '600.00',
      engarrafadoLitros: '600.00',
      garrafas: 800,
    });

    // Estornos: a remessa só depois dos retornos; o retorno desfaz a entrada de granel.
    expect(
      (await m.post(`/api/terceiros/remessas/${rem}/estorno`, { motivo: 'Lançada errada' })).corpo
        .codigo,
    ).toBe('retorno');
    ok(await m.post(`/api/terceiros/retornos/${ret1}/estorno`, { motivo: 'Lançado errado' }));
    expect((await m.get(`/api/recipientes/${t2}/conteudo`)).corpo.volume).toBe('0.00');
    r = (await m.get(`/api/terceiros/remessas/${rem}`)).corpo;
    expect(r.litrosRetornados).toBe('600.00');
  });
});
