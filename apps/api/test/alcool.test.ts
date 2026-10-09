// Livro de álcool etílico (04, roteiro do ciclo 9, bloco 2): entradas e usos do período, alerta
// "comunicar ao MAPA" e o registro da comunicação; a entrada estornada não se comunica.
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

describe('livro de álcool etílico', () => {
  it('entradas, usos, alerta e comunicação', async () => {
    const c = await cantina(t);
    const m = c.master;
    const local = (
      await m.post('/api/locais', {
        nome: 'Almoxarifado',
        uso: 'estoque',
        moduloEstoque: 'ENOTRACE',
      })
    ).corpo.id;
    const tipos = (await m.get('/api/catalogos/tipo_insumo?tamanho=0')).corpo.itens as Array<{
      id: string;
      nome: string;
    }>;
    const criado = (
      await m.post('/api/itens-estoque', {
        tipo: 'insumo',
        nome: 'Álcool vínico 96%',
        unidadeBase: 'L',
        controlaLote: true,
        eAlcoolEtilico: true,
        insumo: { tipoInsumoId: tipos.find((x) => x.nome === 'Álcool etílico')!.id },
      })
    ).corpo;
    expect(criado.id, JSON.stringify(criado)).toBeTruthy();
    const alcool = criado.id as string;
    const agora = new Date().toISOString();
    const entrar = async (q: string, lote: string) =>
      (
        await m.post('/api/estoque/entradas', {
          executadoEm: agora,
          localId: local,
          documento: 'NF 77',
          itens: [{ itemId: alcool, quantidade: q, lote: { codigo: lote } }],
        })
      ).corpo;
    await entrar('100', 'AL1');
    const errada = await entrar('50', 'AL2');
    await m.post(`/api/estoque/grupos/${errada.grupoId}/estorno`, { motivo: 'Digitada errada' });
    const lotes = (await m.get(`/api/estoque/lotes?item=${alcool}`)).corpo as Array<{
      id: string;
      codigo: string;
    }>;
    const descarte = await m.post('/api/estoque/ajustes', {
      executadoEm: agora,
      tipo: 'descarte',
      localId: local,
      itemId: alcool,
      loteItemId: lotes.find((l) => l.codigo === 'AL1')!.id,
      quantidade: '-5',
      motivo: 'Vazamento',
    });
    expect(descarte.status, JSON.stringify(descarte.corpo)).toBe(200);

    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia' }).format(new Date());
    const livro = (await m.get(`/api/alcool?de=${hoje}&ate=${hoje}`)).corpo;
    expect(livro.itens).toMatchObject([
      { nome: 'Álcool vínico 96%', unidade: 'L', inicial: '0.000', final: '95.000' },
    ]);
    expect(livro.entradas).toMatchObject([
      {
        lote: 'AL1',
        quantidade: '100.000',
        documento: 'NF 77',
        comunicar: true,
        comunicacao: null,
      },
      { lote: 'AL2', quantidade: '50.000', estornado: true, comunicar: false },
    ]);
    expect(livro.usos.map((u: { tipo: string }) => u.tipo)).toEqual(['estorno', 'descarte']);

    // Só a entrada válida pede comunicação; registrada, o alerta some.
    const alertas = async () =>
      (
        (await m.get('/api/alertas?atualizar=sim')).corpo as Array<{
          tipo: string;
          mensagem: string;
        }>
      )
        .filter((a) => a.tipo === 'alcool')
        .map((a) => a.mensagem);
    expect(await alertas()).toEqual([
      expect.stringContaining('Entrada de 100 L de Álcool vínico 96%'),
    ]);
    const ent = livro.entradas[0].id;
    expect(
      (
        await m.post(`/api/alcool/entradas/${livro.entradas[1].id}/comunicacao`, {
          comunicadaEm: hoje,
        })
      ).status,
    ).toBe(200);
    const r = await m.post(`/api/alcool/entradas/${ent}/comunicacao`, {
      comunicadaEm: hoje,
      protocolo: 'SEI 123',
    });
    expect(r.status).toBe(200);
    expect(
      (await m.post(`/api/alcool/entradas/${ent}/comunicacao`, { comunicadaEm: hoje })).corpo
        .codigo,
    ).toBe('comunicada');
    expect(await alertas()).toEqual([]);
    expect(
      (await m.get(`/api/alcool?de=${hoje}&ate=${hoje}`)).corpo.entradas[0].comunicacao,
    ).toEqual({
      em: hoje,
      protocolo: 'SEI 123',
    });
  });
});
