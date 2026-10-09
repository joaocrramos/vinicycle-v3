// Transferência de titularidade (04, roteiro do ciclo 10, bloco 2): a granel, parcial para outro
// recipiente e total no próprio recipiente, com genealogia e estorno; no estoque, o lote passa a
// outro titular com o mesmo código; o contrato soma o pagamento em produto.
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

const agora = () => new Date().toISOString();

describe('transferência de titularidade', () => {
  it('granel e estoque, com o contrato', async () => {
    const c = await cantina(t);
    const m = c.master;
    const ok = (r: { status: number; corpo: unknown }) => {
      expect(r.status, JSON.stringify(r.corpo)).toBe(200);
      return r.corpo as Record<string, string>;
    };
    const pessoa = async (nome: string) =>
      ok(await m.post('/api/pessoas', { ficha: fichaPj(nome), papeis: ['cliente_vinificacao'] }))
        .id!;
    const cliente = await pessoa('Vinhos do Vale Ltda');
    const outro = await pessoa('Outro Cliente Ltda');
    const contrato = ok(
      await m.post('/api/contratos-terceirizacao', {
        sentido: 'prestamos',
        atividades: ['elaboracao'],
        contraparteId: cliente,
        estabelecimentoId: c.estab,
        registroProduto: 'cantina',
        vigenciaInicio: '2026-01-01',
        pagamentoDinheiro: true,
        pagamentoProdutoValor: '10',
        pagamentoProdutoUnidade: 'percentual',
      }),
    ).id!;
    const t1 = await c.recipiente('T1', '5000.00');
    const t2 = await c.recipiente('T2', '5000.00');
    const t3 = await c.recipiente('T3', '5000.00');
    const entrada = async (recipienteId: string, titularId: string, litros: string) =>
      ok(
        await m.post('/api/operacoes/entrada_granel', {
          executadoEm: agora(),
          tipoGranel: 'outra',
          projetoId: c.projeto,
          titularId,
          composicao: [{ variedadeId: c.malbec, safra: 2026, percentual: '100' }],
          destinos: [{ recipienteId, litros, lote: { novo: 'A' } }],
          cientes: [`sem_contrato:${titularId}`],
        }),
      );
    await entrada(t1, cliente, '1000.00');
    await entrada(t3, outro, '200.00');
    const conteudo = async (id: string) => (await m.get(`/api/recipientes/${id}/conteudo`)).corpo;
    const loteT1 = (await conteudo(t1)).lote;

    const op = (corpo: Record<string, unknown>) =>
      m.post('/api/operacoes/titularidade', {
        executadoEm: agora(),
        motivo: 'pagamento_servico',
        contratoId: contrato,
        paraTitularId: null,
        ...corpo,
      });

    // Parcial no mesmo recipiente: deixaria dois titulares juntos.
    const parcialMesmo = await op({
      itens: [{ origemId: t1, litros: '300.00', lote: { novo: 'A' } }],
    });
    expect(parcialMesmo.corpo.codigo).toBe('parcial');
    // Destino com vinho de outro titular.
    const destinoOutro = await op({
      itens: [{ origemId: t1, litros: '300.00', destinoId: t3, lote: { novo: 'A' } }],
    });
    expect(destinoOutro.corpo.codigo).toBe('destino');
    // Vinho do outro cliente com o contrato do primeiro.
    const contratoErrado = await op({
      itens: [{ origemId: t3, litros: '100.00', destinoId: t2, lote: { novo: 'A' } }],
    });
    expect(contratoErrado.corpo.codigo).toBe('contratoId');

    // Parcial: 300 L do cliente para a cantina, como pagamento do serviço, no T2.
    const parcial = ok(
      await op({ itens: [{ origemId: t1, litros: '300.00', destinoId: t2, lote: { novo: 'A' } }] }),
    );
    const c1 = await conteudo(t1);
    const c2 = await conteudo(t2);
    expect(c1.volume).toBe('700.00');
    expect(c2.volume).toBe('300.00');
    expect(c2.lote.id).not.toBe(loteT1.id);
    const projeto = (await m.get(`/api/projetos/${c.projeto}`)).corpo;
    const titularDe = (id: string) =>
      projeto.lotes.find((l: { id: string }) => l.id === id).titular as string | null;
    expect(titularDe(loteT1.id)).toBe('Vinhos do Vale Ltda');
    expect(titularDe(c2.lote.id)).toBeNull();
    const ficha = (await m.get(`/api/operacoes/${parcial.operacaoId}`)).corpo;
    expect(ficha.tipo).toBe('titularidade');
    expect(ficha.dados).toMatchObject({ motivo: 'pagamento_servico', deTitularId: cliente });

    // O contrato soma o pagamento em produto.
    let fc = (await m.get(`/api/contratos-terceirizacao/${contrato}`)).corpo;
    expect(fc.transferido).toEqual({ litros: '300.00', garrafas: 0 });

    // Total no próprio recipiente: os 700 L restantes, comprados pela cantina, incorporados ao lote
    // da cantina que está no T2.
    const total = ok(
      await m.post('/api/operacoes/titularidade', {
        executadoEm: agora(),
        motivo: 'compra_venda',
        paraTitularId: null,
        itens: [{ origemId: t1, lote: { id: c2.lote.id } }],
      }),
    );
    const c1b = await conteudo(t1);
    expect(c1b.volume).toBe('700.00');
    expect(c1b.lote.id).toBe(c2.lote.id);
    fc = (await m.get(`/api/contratos-terceirizacao/${contrato}`)).corpo;
    expect(fc.transferido.litros).toBe('300.00');
    const lista = (await m.get(`/api/titularidade?titularId=${cliente}`)).corpo as Array<{
      motivo: string;
      valida: boolean;
    }>;
    expect(lista.map((x) => x.motivo).sort()).toEqual(['compra_venda', 'pagamento_servico']);

    // Estorno da total: o vinho volta ao lote do cliente.
    ok(await m.post(`/api/operacoes/${total.operacaoId}/estorno`, { motivo: 'Lançada errada' }));
    const c1c = await conteudo(t1);
    expect(c1c.lote.id).toBe(loteT1.id);
    expect(c1c.volume).toBe('700.00');
    const lista2 = (await m.get(`/api/titularidade?titularId=${cliente}`)).corpo as Array<{
      motivo: string;
      valida: boolean;
    }>;
    expect(lista2.find((x) => x.motivo === 'compra_venda')!.valida).toBe(false);

    // Estoque: garrafas da cantina vendidas ao cliente e parte devolvida como pagamento.
    const local = ok(
      await m.post('/api/locais', { nome: 'Expedição', uso: 'estoque', moduloEstoque: 'ENOTRACE' }),
    ).id!;
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
    ok(await m.post(`/api/produtos/${produto}/formatos`, { volumeMl: 750 }));
    const item = (await m.get(`/api/produtos/${produto}`)).corpo.formatos[0].itemEstoqueId;
    ok(
      await m.post('/api/estoque/entradas', {
        executadoEm: agora(),
        localId: local,
        itens: [{ itemId: item, quantidade: '120', lote: { codigo: 'L26-0001' } }],
      }),
    );
    const lotesDoItem = async () =>
      (await m.get(`/api/estoque/itens/${item}`)).corpo.lotes as Array<{
        id: string;
        codigo: string;
        saldo: string;
      }>;
    const proprio = (await lotesDoItem())[0]!;
    const demais = await m.post('/api/estoque/titularidade', {
      executadoEm: agora(),
      localId: local,
      paraTitularId: cliente,
      motivo: 'compra_venda',
      itens: [{ itemId: item, loteItemId: proprio.id, quantidade: '200' }],
    });
    expect(demais.corpo.codigo).toBe('quantidade');
    ok(
      await m.post('/api/estoque/titularidade', {
        executadoEm: agora(),
        localId: local,
        paraTitularId: cliente,
        motivo: 'compra_venda',
        itens: [{ itemId: item, loteItemId: proprio.id, quantidade: '120' }],
      }),
    );
    const depois = await lotesDoItem();
    expect(depois.map((l) => l.codigo)).toEqual(['L26-0001', 'L26-0001']);
    const doCliente = depois.find((l) => l.id !== proprio.id)!;
    expect(doCliente.saldo).toMatch(/^120/);
    // O cliente paga com 12 garrafas.
    const pag = ok(
      await m.post('/api/estoque/titularidade', {
        executadoEm: agora(),
        localId: local,
        paraTitularId: null,
        motivo: 'pagamento_servico',
        contratoId: contrato,
        itens: [{ itemId: item, loteItemId: doCliente.id, quantidade: '12' }],
      }),
    );
    // Volta ao lote da cantina com o mesmo código.
    const finais = await lotesDoItem();
    expect(finais).toHaveLength(2);
    expect(finais.find((l) => l.id === proprio.id)!.saldo).toMatch(/^12(\.|$)/);
    fc = (await m.get(`/api/contratos-terceirizacao/${contrato}`)).corpo;
    expect(fc.transferido).toEqual({ litros: '309.00', garrafas: 12 });
    // Estorno do grupo no estoque: deixa de contar.
    ok(await m.post(`/api/estoque/grupos/${pag.grupoId}/estorno`, { motivo: 'Errado' }));
    fc = (await m.get(`/api/contratos-terceirizacao/${contrato}`)).corpo;
    expect(fc.transferido).toEqual({ litros: '300.00', garrafas: 0 });
  });
});
