// Granel (cantina.md, Granel e GLT; 03-modelo-de-dados.md, 5.3): entrada com a composição informada
// ou "não informada", em lote novo ou incorporada; saída com nota e partes, aviso sem GLT;
// confirmação do recebimento; estorno.
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

describe('granel', () => {
  it('entrada com composição informada, saída sem GLT pede ciente, recebimento e estorno', async () => {
    const c = await cantina(t);
    const t1 = await c.recipiente('T1', '5000.00');
    const t2 = await c.recipiente('T2', '5000.00');
    const pessoa = async (nome: string, documento: string, papeis: string[]) =>
      (
        await c.master.post('/api/pessoas', {
          ficha: { tipoPessoa: 'fisica', nome, documento },
          papeis,
        })
      ).corpo.id as string;
    const vendedor = await pessoa('Vinícola Vizinha', '52998224725', ['fornecedor']);
    const comprador = await pessoa('Comprador', '11144477735', ['cliente']);

    const entrada = {
      executadoEm: agora(),
      tipoGranel: 'compra',
      projetoId: c.projeto,
      remetenteId: vendedor,
      notaNumero: '123',
      glt: 'GLT-0001',
      embalagem: 'carro_tanque',
      composicao: [
        { variedadeId: c.malbec, safra: 2025, percentual: '60' },
        { variedadeId: c.cabernet, safra: 2025, percentual: '40' },
      ],
      destinos: [{ recipienteId: t1, litros: '1000.00', lote: { novo: 'A' } }],
    };
    // Percentuais que não fecham 100%.
    const ruim = await c.master.post('/api/operacoes/entrada_granel', {
      ...entrada,
      composicao: [{ variedadeId: c.malbec, percentual: '60' }],
    });
    expect(ruim.corpo.codigo).toBe('validacao');

    const e = await c.master.post('/api/operacoes/entrada_granel', entrada);
    expect(e.status).toBe(200);
    const conteudo = (await c.master.get(`/api/recipientes/${t1}/conteudo`)).corpo;
    expect(conteudo.volume).toBe('1000.00');
    expect(conteudo.lote.codigo).toMatch(/^2025/);
    const fr = (v: string) =>
      (
        conteudo.composicao.componentes as Array<{
          variedadeId: string;
          fracao: number;
          origem: string;
        }>
      )
        .filter((x) => x.variedadeId === v)
        .reduce((s, x) => s + x.fracao, 0);
    expect(fr(c.malbec)).toBeCloseTo(0.6);
    expect(fr(c.cabernet)).toBeCloseTo(0.4);
    expect(
      (conteudo.composicao.componentes as Array<{ origem: string }>).every(
        (x) => x.origem === 'granel',
      ),
    ).toBe(true);

    // Ficha: documentos do granel; recebimento confirmado depois.
    const ficha = (await c.master.get(`/api/operacoes/${e.corpo.operacaoId}`)).corpo;
    expect(ficha.granel).toMatchObject({
      sentido: 'entrada',
      tipo: 'compra',
      remetente: 'Vinícola Vizinha',
      glt: 'GLT-0001',
      embalagem: 'carro_tanque',
      recebimentoConfirmadoEm: null,
    });
    const rec = await c.master.post(`/api/operacoes/${e.corpo.operacaoId}/recebimento`, {
      recebimentoConfirmadoEm: '2026-10-03',
    });
    expect(rec.status).toBe(200);
    expect(
      (await c.master.get(`/api/operacoes/${e.corpo.operacaoId}`)).corpo.granel
        .recebimentoConfirmadoEm,
    ).toBe('2026-10-03');

    // Entrada sem composição: "não informada", incorporada ao mesmo lote noutro recipiente.
    const e2 = await c.master.post('/api/operacoes/entrada_granel', {
      executadoEm: agora(),
      tipoGranel: 'outra',
      projetoId: c.projeto,
      destinos: [{ recipienteId: t2, litros: '500.00', lote: { id: conteudo.lote.id } }],
    });
    expect(e2.status).toBe(200);
    const c2 = (await c.master.get(`/api/recipientes/${t2}/conteudo`)).corpo;
    expect(c2.lote.id).toBe(conteudo.lote.id);
    expect(c2.composicao.componentes).toMatchObject([
      { variedadeId: null, origem: 'nao_informada', fracao: 1 },
    ]);

    // Saída: sem GLT, pede ciente; com ciente, sai.
    const saida = {
      executadoEm: agora(),
      tipoGranel: 'venda',
      destinatarioId: comprador,
      notaNumero: '77',
      itens: [{ recipienteId: t1, litros: '300.00' }],
    };
    const previa = (await c.master.post('/api/operacoes/saida_granel/previa', saida)).corpo;
    expect(previa.avisos.map((a: { codigo: string }) => a.codigo)).toContain('granel_sem_glt');
    const sem = await c.master.post('/api/operacoes/saida_granel', saida);
    expect(sem.corpo.codigo).toBe('ciente_pendente');
    const s = await c.master.post('/api/operacoes/saida_granel', {
      ...saida,
      cientes: ['granel_sem_glt'],
    });
    expect(s.status).toBe(200);
    expect((await c.master.get(`/api/recipientes/${t1}/conteudo`)).corpo.volume).toBe('700.00');
    expect(
      (
        await c.master.post(`/api/operacoes/${s.corpo.operacaoId}/recebimento`, {
          recebimentoConfirmadoEm: '2026-10-03',
        })
      ).corpo.codigo,
    ).toBe('sentido');

    // Saída maior que o saldo: impossível.
    const demais = await c.master.post('/api/operacoes/saida_granel/previa', {
      ...saida,
      glt: 'GLT-2',
      itens: [{ recipienteId: t1, litros: '900.00' }],
    });
    expect(demais.corpo.bloqueios.length).toBeGreaterThan(0);

    // Estorno da saída: o vinho volta.
    const est = await c.master.post(`/api/operacoes/${s.corpo.operacaoId}/estorno`, {
      motivo: 'Venda cancelada',
    });
    expect(est.status).toBe(200);
    expect((await c.master.get(`/api/recipientes/${t1}/conteudo`)).corpo.volume).toBe('1000.00');
  });

  it('retorno de terceiro forma lote com essa origem; devolução avisa se o vinho é próprio', async () => {
    const c = await cantina(t);
    const t1 = await c.recipiente('T1', '5000.00');
    const e = await c.master.post('/api/operacoes/entrada_granel', {
      executadoEm: agora(),
      tipoGranel: 'retorno_terceiro',
      projetoId: c.projeto,
      glt: 'G1',
      destinos: [{ recipienteId: t1, litros: '800.00', lote: { novo: 'A' } }],
    });
    expect(e.status).toBe(200);
    const lote = await c.lote(t1);
    const l = (await c.master.get(`/api/lotes/${lote.id}`)).corpo;
    expect(l.origem).toBe('retorno_terceiro');
    const p = (
      await c.master.post('/api/operacoes/saida_granel/previa', {
        executadoEm: agora(),
        tipoGranel: 'devolucao_titular',
        glt: 'G2',
        itens: [{ recipienteId: t1, esvaziar: true }],
      })
    ).corpo;
    expect(p.avisos.map((a: { codigo: string }) => a.codigo)).toEqual(['granel_devolucao_propria']);
    expect(p.recipientes[0]).toMatchObject({ depois: { litros: '0.00' } });
  });
});
