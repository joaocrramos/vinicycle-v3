// Fechamento mensal (cantina.md, Declarações e fechamento): lista de conferência (pendência de
// estoque impede; o resto pede ciente), relatório do mês, trava dos lançamentos no mês fechado
// (operações, estoque, estorno) e reabertura com motivo.
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

describe('fechamento mensal', () => {
  it('conferência, relatório, trava e reabertura', async () => {
    const c = await cantina(t);
    const m = c.master;
    // Dia 15 do mês passado, ao meio-dia de Brasília.
    const hoje = new Date();
    const ano = hoje.getUTCMonth() === 0 ? hoje.getUTCFullYear() - 1 : hoje.getUTCFullYear();
    const mes = hoje.getUTCMonth() === 0 ? 12 : hoje.getUTCMonth();
    const noMes = (dia: number) =>
      `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}T12:00:00-03:00`;

    await m.put('/api/cantina/rendimentos', {
      itens: [{ variedadeId: null, litrosPorKg: '0.7000' }],
    });
    const t1 = await c.recipiente('T1', '5000.00');
    const [item] = await c.romaneio([[c.malbec, '1000']]);
    const des = await m.post('/api/operacoes/desengace', {
      executadoEm: noMes(16),
      projetoId: c.projeto,
      consumos: [{ itemId: item, kg: '1000' }],
      destinos: [{ recipienteId: t1, lote: { novo: 'A' } }],
    });
    expect(des.status).toBe(200);
    const alm = (
      await m.post('/api/locais', {
        nome: 'Almoxarifado',
        uso: 'estoque',
        moduloEstoque: 'ENOTRACE',
      })
    ).corpo.id as string;
    const so2 = (
      await m.post('/api/itens-estoque', {
        tipo: 'insumo',
        nome: 'Metabissulfito',
        unidadeBase: 'g',
        insumo: {
          tipoInsumoId: (
            (await m.get('/api/catalogos/tipo_insumo?tamanho=0')).corpo.itens as Array<{
              id: string;
              nome: string;
            }>
          ).find((x) => x.nome === 'Leveduras')!.id,
        },
      })
    ).corpo.id as string;
    await m.post('/api/estoque/ajustes', {
      executadoEm: noMes(17),
      tipo: 'ajuste_inventario',
      localId: alm,
      itemId: so2,
      quantidade: '-100',
      motivo: 'Teste',
    });
    await m.post('/api/operacoes/rascunhos', {
      tipo: 'perda',
      executadoEm: noMes(18),
      formulario: { itens: [] },
    });

    // Conferência: a pendência impede; o mês corrente não fecha.
    const f = (await m.get(`/api/fechamentos/${ano}/${mes}`)).corpo;
    expect(f.situacao).toBe('aberto');
    const n = (codigo: string) =>
      f.conferencia.find((x: { codigo: string }) => x.codigo === codigo).n;
    expect(n('pendencias')).toBe(1);
    expect(n('rascunhos')).toBe(1);
    expect(f.relatorio.granel).toMatchObject({
      inicial: '0.00',
      entradas: '700.00',
      final: '700.00',
    });
    expect((await m.post(`/api/fechamentos/${ano}/${mes}/fechar`, {})).corpo.codigo).toBe(
      'pendencia_estoque',
    );
    const atual = new Date();
    expect(
      (
        await m.post(
          `/api/fechamentos/${atual.getUTCFullYear()}/${atual.getUTCMonth() + 1}/fechar`,
          {},
        )
      ).corpo.codigo,
    ).toBe('mes_aberto');

    // Resolvida a pendência, o rascunho pede ciente.
    await m.post('/api/estoque/entradas', {
      executadoEm: noMes(19),
      localId: alm,
      itens: [{ itemId: so2, quantidade: '200' }],
    });
    expect((await m.post(`/api/fechamentos/${ano}/${mes}/fechar`, {})).corpo.codigo).toBe(
      'ciente_pendente',
    );
    const fechou = await m.post(`/api/fechamentos/${ano}/${mes}/fechar`, {
      cientes: ['fechamento:rascunhos'],
    });
    expect(fechou.status).toBe(200);
    const lista = (await m.get(`/api/fechamentos?ano=${ano}`)).corpo as Array<{
      mes: number;
      situacao: string;
    }>;
    expect(lista.find((x) => x.mes === mes)!.situacao).toBe('fechado');

    // Trava: estoque, operação e estorno com data no mês fechado.
    const ent = await m.post('/api/estoque/entradas', {
      executadoEm: noMes(20),
      localId: alm,
      itens: [{ itemId: so2, quantidade: '1' }],
    });
    expect(ent.corpo.codigo).toBe('periodo_fechado');
    const perda = await m.post('/api/operacoes/perda/previa', {
      executadoEm: noMes(21),
      itens: [{ recipienteId: t1, litros: '1.00', motivo: 'vazamento' }],
    });
    expect(perda.corpo.bloqueios[0]).toMatch(/está fechado/);
    const est = await m.post(`/api/operacoes/${des.corpo.operacaoId}/estorno`, { motivo: 'teste' });
    expect(est.corpo.codigo).toBe('periodo_fechado');
    // O mês fechado mostra o instantâneo.
    expect((await m.get(`/api/fechamentos/${ano}/${mes}`)).corpo.situacao).toBe('fechado');

    // Reabrir com motivo libera.
    expect(
      (await m.post(`/api/fechamentos/${ano}/${mes}/reabrir`, { motivo: 'Nota lançada atrasada' }))
        .status,
    ).toBe(200);
    expect(
      (
        await m.post('/api/estoque/entradas', {
          executadoEm: noMes(20),
          localId: alm,
          itens: [{ itemId: so2, quantidade: '1' }],
        })
      ).status,
    ).toBe(200);
  });
});
