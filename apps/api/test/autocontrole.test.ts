// Autocontrole (04, roteiro do ciclo 8, bloco 1): programa pelo modelo da norma, controle próprio,
// evidência manual e automática (higienização), prazo, alerta, anulação e permissões.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { somarPeriodo } from '../src/modulos/autocontrole';
import { montar } from './apoio';
import { cantina } from './cantina';

let t: Awaited<ReturnType<typeof montar>>;
beforeAll(async () => {
  t = await montar();
});
afterAll(async () => {
  await t.fechar();
});

const dia = (n: number) => {
  const d = new Date(Date.now() + n * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia' }).format(d);
};

describe('autocontrole', () => {
  it('soma a periodicidade no calendário', () => {
    expect(somarPeriodo('2027-01-31', 1, 'mes')).toBe('2027-02-28');
    expect(somarPeriodo('2028-01-31', 1, 'mes')).toBe('2028-02-29');
    expect(somarPeriodo('2027-03-10', 6, 'mes')).toBe('2027-09-10');
    expect(somarPeriodo('2027-03-10', 2, 'semana')).toBe('2027-03-24');
    expect(somarPeriodo('2027-12-30', 3, 'dia')).toBe('2028-01-02');
    expect(somarPeriodo('2028-02-29', 1, 'ano')).toBe('2029-02-28');
  });

  it('programa, evidências, prazo e alerta', async () => {
    const c = await cantina(t);
    const m = c.master;
    const vazio = (await m.get('/api/autocontrole')).corpo;
    expect(vazio.controles).toEqual([]);
    expect(vazio.modelo).toHaveLength(10);

    // Programa inicial pelo modelo: dez controles, totalmente editáveis.
    expect((await m.post('/api/autocontrole/modelo', {})).corpo).toEqual({ incluidos: 10 });
    expect((await m.post('/api/autocontrole/modelo', {})).corpo).toEqual({ incluidos: 0 });
    const lista = (await m.get('/api/autocontrole')).corpo.controles as Array<{
      id: string;
      codigoModelo: string;
      situacao: string;
      proxima: string | null;
    }>;
    expect(lista).toHaveLength(10);
    const pragas = lista.find((x) => x.codigoModelo === 'pragas')!;
    expect(pragas).toMatchObject({ situacao: 'em_dia' });
    expect(lista.find((x) => x.codigoModelo === 'reclamacoes')).toMatchObject({
      situacao: 'sob_demanda',
      proxima: null,
    });

    // Controle próprio, a cada 2 dias; evidência de 10 dias atrás: atrasado e com alerta.
    const proprio = (
      await m.post('/api/autocontrole', {
        nome: 'Limpeza da prensa',
        periodicidadeQuantidade: 2,
        periodicidadeUnidade: 'dia',
      })
    ).corpo.id as string;
    expect(
      (
        await m.post('/api/autocontrole', {
          nome: 'Errado',
          periodicidadeQuantidade: 2,
          periodicidadeUnidade: null,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await m.post(`/api/autocontrole/${proprio}/evidencias`, {
          realizadaEm: dia(1),
          descricao: 'Futuro',
        })
      ).corpo.codigo,
    ).toBe('data');
    await m.post(`/api/autocontrole/${proprio}/evidencias`, {
      realizadaEm: dia(-10),
      descricao: 'Lavada com água quente',
    });
    let f = (await m.get(`/api/autocontrole/${proprio}`)).corpo;
    expect(f).toMatchObject({ ultima: dia(-10), proxima: dia(-8), situacao: 'atrasado' });
    const alertas = (await m.get('/api/alertas?atualizar=sim')).corpo as Array<{
      tipo: string;
      mensagem: string;
    }>;
    expect(alertas.filter((a) => a.tipo === 'autocontrole').map((a) => a.mensagem)).toEqual([
      `Autocontrole: Limpeza da prensa atrasado desde ${dia(-8).split('-').reverse().join('/')}.`,
    ]);

    // Evidência de hoje: em dia; anulada, volta a atrasar.
    const hoje = (
      await m.post(`/api/autocontrole/${proprio}/evidencias`, {
        realizadaEm: dia(0),
        descricao: 'Lavada',
      })
    ).corpo.id as string;
    expect((await m.get(`/api/autocontrole/${proprio}`)).corpo.situacao).toBe('vence_logo');
    expect(
      (
        await m.post(`/api/autocontrole/${proprio}/evidencias/${hoje}/anular`, {
          motivo: 'Lançada no controle errado',
        })
      ).status,
    ).toBe(200);
    f = (await m.get(`/api/autocontrole/${proprio}`)).corpo;
    expect(f.situacao).toBe('atrasado');
    expect(f.evidencias[0]).toMatchObject({ motivoAnulacao: 'Lançada no controle errado' });

    // Mudar a periodicidade para "sob demanda" tira o prazo; inativar tira da conta.
    await m.put(`/api/autocontrole/${proprio}`, {
      nome: 'Limpeza da prensa',
      periodicidadeQuantidade: null,
      periodicidadeUnidade: null,
    });
    expect((await m.get(`/api/autocontrole/${proprio}`)).corpo.situacao).toBe('sob_demanda');
    await m.post(`/api/autocontrole/${proprio}/inativar`, { motivo: 'Prensa vendida' });
    expect((await m.get(`/api/autocontrole/${proprio}`)).corpo.situacao).toBe('inativo');

    // Evidência automática: a higienização lançada na cantina.
    const higienizacao = lista.find((x) => x.codigoModelo === 'higienizacao')!.id;
    const t1 = await c.recipiente('T1', '1000.00');
    const op = await m.post('/api/operacoes/higienizacao', {
      executadoEm: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      tipoHigienizacao: 'higienizacao',
      recipientes: [t1],
      produto: 'Ácido peracético',
    });
    expect(op.status).toBe(200);
    f = (await m.get(`/api/autocontrole/${higienizacao}`)).corpo;
    expect(f.ultima).toBe(dia(-2));
    expect(f.automaticas[0].descricao).toContain('T1');
    await m.post(`/api/operacoes/${op.corpo.operacaoId}/estorno`, { motivo: 'Errado' });
    expect((await m.get(`/api/autocontrole/${higienizacao}`)).corpo.ultima).toBeNull();
  });
});
