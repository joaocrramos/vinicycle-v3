// Fermentações (cantina.md, Fermentações): início e fim por operação, leituras de densidade e
// temperatura, sugestão de fim por leituras estáveis e o estorno do fim.
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
const antes = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

describe('fermentações', () => {
  it('início, leituras, sugestão de fim, fim confirmado e estorno do fim', async () => {
    const c = await cantina(t);
    await c.master.put('/api/cantina/rendimentos', {
      itens: [{ variedadeId: null, litrosPorKg: '0.7000' }],
    });
    const t1 = await c.recipiente('T1', '5000.00');
    const [item] = await c.romaneio([[c.malbec, '1000']]);
    await c.master.post('/api/operacoes/desengace', {
      executadoEm: antes(120),
      projetoId: c.projeto,
      consumos: [{ itemId: item, kg: '1000' }],
      destinos: [{ recipienteId: t1, lote: { novo: 'A' } }],
    });
    const evento = (tipoFermentacao: string, ev: string, executadoEm = agora()) =>
      c.master.post('/api/operacoes/fermentacao', {
        executadoEm,
        recipienteId: t1,
        tipoFermentacao,
        evento: ev,
      });
    expect((await evento('alcoolica', 'fim')).corpo.codigo).toBe('fermentacao');
    const inicio = await evento('alcoolica', 'inicio', antes(100));
    expect(inicio.status).toBe(200);
    expect((await evento('alcoolica', 'inicio')).corpo.codigo).toBe('fermentacao');

    const [f] = (await c.master.get('/api/fermentacoes')).corpo as Array<{
      id: string;
      tipo: string;
      recipientes: string;
      sugereFim: boolean;
    }>;
    expect(f).toMatchObject({ tipo: 'alcoolica', recipientes: 'T1', sugereFim: false });
    const leitura = (min: number, densidade: string | null, temperatura: string | null = '22.5') =>
      c.master.post(`/api/fermentacoes/${f!.id}/leituras`, {
        amostraEm: antes(min),
        densidade,
        temperatura,
      });
    expect((await leitura(110, '1.0900')).corpo.codigo).toBe('leitura');
    for (const [min, d] of [
      [90, '1.0900'],
      [70, '1.0400'],
      [50, '0.9940'],
      [40, '0.9940'],
    ] as const)
      expect((await leitura(min, d)).status).toBe(200);
    expect((await c.master.get(`/api/fermentacoes/${f!.id}`)).corpo.sugereFim).toBe(false);
    await leitura(30, '0.9940', '18.0');
    const detalhe = (await c.master.get(`/api/fermentacoes/${f!.id}`)).corpo;
    expect(detalhe.sugereFim).toBe(true);
    expect(detalhe.leituras).toHaveLength(5);
    expect(detalhe.leituras[4]).toMatchObject({ densidade: '0.9940', temperatura: '18.0000' });
    expect(detalhe.fimSugeridoEm).not.toBeNull();

    // A malolática é independente.
    expect((await evento('malolatica', 'inicio', antes(20))).status).toBe(200);
    const fim = await evento('alcoolica', 'fim', antes(10));
    expect(fim.status).toBe(200);
    expect(
      ((await c.master.get('/api/fermentacoes')).corpo as Array<{ tipo: string }>).map(
        (x) => x.tipo,
      ),
    ).toEqual(['malolatica']);
    expect((await leitura(5, '0.9930')).corpo.codigo).toBe('fermentacao');
    // Estornado o fim, a alcoólica volta a estar em andamento.
    expect(
      (await c.master.post(`/api/operacoes/${fim.corpo.operacaoId}/estorno`, { motivo: 'Cedo' }))
        .status,
    ).toBe(200);
    expect(
      ((await c.master.get('/api/fermentacoes')).corpo as Array<{ tipo: string }>)
        .map((x) => x.tipo)
        .sort(),
    ).toEqual(['alcoolica', 'malolatica']);
  });
});
