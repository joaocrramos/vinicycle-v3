// Central de alertas (P20): alertas calculados dos dados, um por chave, que se resolvem sozinhos
// quando a causa some; leitura por usuário; GLT informada depois resolve o alerta do granel.
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

const agora = () => new Date().toISOString();

describe('central de alertas', () => {
  it('abre, deduplica, resolve sozinho e marca como lido', async () => {
    const c = await cantina(t);
    const m = c.master;
    const alm = (
      await m.post('/api/locais', {
        nome: 'Almoxarifado',
        uso: 'estoque',
        moduloEstoque: 'ENOTRACE',
      })
    ).corpo.id as string;
    const tipos = (await m.get('/api/catalogos/tipo_insumo?tamanho=0')).corpo.itens as Array<{
      id: string;
      nome: string;
    }>;
    const item = async (nome: string, extra: object) =>
      (
        await m.post('/api/itens-estoque', {
          tipo: 'insumo',
          nome,
          unidadeBase: 'g',
          insumo: { tipoInsumoId: tipos.find((x) => x.nome === 'Leveduras')!.id },
          ...extra,
        })
      ).corpo.id as string;
    const lev = await item('Levedura EC1118', {
      controlaLote: true,
      controlaValidade: true,
      estoqueMinimo: '1000',
    });
    const so2 = await item('Metabissulfito', {});
    const vence = new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10);
    await m.post('/api/estoque/entradas', {
      executadoEm: agora(),
      localId: alm,
      itens: [{ itemId: lev, quantidade: '500', lote: { codigo: 'L1', validade: vence } }],
    });
    // Saldo negativo de insumo: pendência.
    await m.post('/api/estoque/ajustes', {
      executadoEm: agora(),
      tipo: 'ajuste_inventario',
      localId: alm,
      itemId: so2,
      quantidade: '-200',
      motivo: 'Teste do alerta',
    });
    // Saída de granel sem GLT.
    const t1 = await c.recipiente('T1', '5000.00');
    await m.post('/api/operacoes/entrada_granel', {
      executadoEm: agora(),
      tipoGranel: 'compra',
      projetoId: c.projeto,
      glt: 'G1',
      destinos: [{ recipienteId: t1, litros: '500.00', lote: { novo: 'A' } }],
    });
    const saida = await m.post('/api/operacoes/saida_granel', {
      executadoEm: agora(),
      tipoGranel: 'venda',
      itens: [{ recipienteId: t1, litros: '100.00' }],
      cientes: ['granel_sem_glt'],
    });
    expect(saida.status).toBe(200);

    const lista = async () =>
      (await m.get('/api/alertas?atualizar=sim')).corpo as Array<{
        id: string;
        tipo: string;
        gravidade: string;
        mensagem: string;
        link: string;
        lido: boolean;
      }>;
    const a1 = await lista();
    const tipos1 = a1.map((a) => a.tipo).sort();
    expect(tipos1).toEqual(['estoque_minimo', 'granel_glt', 'saldo_negativo', 'validade']);
    // Os críticos primeiro.
    expect(a1[0]!.gravidade).toBe('critico');
    expect(a1.find((a) => a.tipo === 'validade')!.mensagem).toMatch(
      /Levedura EC1118, lote L1: vence em/,
    );
    expect(a1.find((a) => a.tipo === 'granel_glt')!.link).toBe(
      `/enotrace/operacoes/${saida.corpo.operacaoId}`,
    );

    // Nova varredura não duplica.
    expect((await lista()).length).toBe(4);
    expect((await m.get('/api/alertas/resumo')).corpo).toMatchObject({ abertos: 4, naoLidos: 4 });

    // Lido por este usuário.
    await m.post('/api/alertas/lidos', { ids: [a1[0]!.id] });
    expect((await m.get('/api/alertas/resumo')).corpo.naoLidos).toBe(3);
    await m.post('/api/alertas/lidos', { ids: [] });
    expect((await m.get('/api/alertas/resumo')).corpo.naoLidos).toBe(0);

    // A causa some, o alerta se resolve: GLT informada, entrada que cobre o negativo e o mínimo.
    await m.post(`/api/operacoes/${saida.corpo.operacaoId}/glt`, { glt: 'GLT-99' });
    await m.post('/api/estoque/entradas', {
      executadoEm: agora(),
      localId: alm,
      itens: [
        { itemId: so2, quantidade: '300' },
        { itemId: lev, quantidade: '600', lote: { codigo: 'L2' } },
      ],
    });
    expect((await lista()).map((a) => a.tipo)).toEqual(['validade']);
    const resolvidos = (await m.get('/api/alertas?situacao=resolvido')).corpo as Array<{
      tipo: string;
    }>;
    expect(resolvidos.map((a) => a.tipo).sort()).toEqual([
      'estoque_minimo',
      'granel_glt',
      'saldo_negativo',
    ]);
  });
});
