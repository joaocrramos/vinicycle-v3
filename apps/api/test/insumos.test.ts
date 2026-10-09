// Adição de insumo, SO₂ acumulado, chaptalização e tratamentos (cantina.md, Adição de insumo;
// Chaptalização; Tratamentos): baixa do lote do insumo, consulta inversa, alertas e estorno.
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
const dia = (dias: number) => new Date(Date.now() + dias * 86400_000).toISOString().slice(0, 10);

async function cenario() {
  const c = await cantina(t);
  await c.master.put('/api/cantina/rendimentos', {
    itens: [{ variedadeId: null, litrosPorKg: '0.7000' }],
  });
  const local = (
    await c.master.post('/api/locais', {
      nome: 'Almoxarifado',
      uso: 'estoque',
      moduloEstoque: 'ENOTRACE',
    })
  ).corpo.id as string;
  const tipos = (await c.master.get('/api/catalogos/tipo_insumo?tamanho=0')).corpo.itens as Array<{
    id: string;
    nome: string;
  }>;
  const tipo = (inicio: string) => tipos.find((x) => x.nome.startsWith(inicio))!.id;
  const so2 = (
    await c.master.post('/api/itens-estoque', {
      tipo: 'insumo',
      nome: 'Metabissulfito de potássio',
      unidadeBase: 'g',
      controlaLote: true,
      controlaValidade: true,
      insumo: { tipoInsumoId: tipo('Conservantes'), teorSo2: '57' },
    })
  ).corpo.id as string;
  const entrada = async (itemId: string, quantidade: string, lote: object | null) =>
    (
      await c.master.post('/api/estoque/entradas', {
        executadoEm: agora(),
        localId: local,
        itens: [{ itemId, quantidade, lote }],
      })
    ).corpo;
  await entrada(so2, '1000', { codigo: 'MB1', validade: dia(300) });
  await entrada(so2, '100', { codigo: 'MBV', validade: dia(-5) });
  const lotes = (await c.master.get(`/api/estoque/lotes?item=${so2}`)).corpo as Array<{
    id: string;
    codigo: string;
  }>;
  const mb1 = lotes.find((l) => l.codigo === 'MB1')!.id;
  const mbv = lotes.find((l) => l.codigo === 'MBV')!.id;
  const mosto = async (
    variedadeId: string,
    kg: string,
    recipienteId: string,
    projeto = c.projeto,
  ) => {
    const [item] = await c.romaneio([[variedadeId, kg]], null, projeto);
    const r = await c.master.post('/api/operacoes/desengace', {
      executadoEm: agora(),
      projetoId: projeto,
      consumos: [{ itemId: item, kg }],
      destinos: [{ recipienteId, lote: { novo: 'A' } }],
    });
    expect(r.status).toBe(200);
    return r;
  };
  const conteudo = async (id: string) =>
    (await c.master.get(`/api/recipientes/${id}/conteudo`)).corpo as {
      volume: string;
      composicao: { so2?: number; chaptalizado: boolean };
    };
  const saldo = async (itemId: string) =>
    (await c.master.get(`/api/estoque/itens/${itemId}`)).corpo.saldo as string;
  return { ...c, local, so2, mb1, mbv, mosto, conteudo, saldo, entrada, tipo };
}

describe('adição de insumo', () => {
  it('baixa o lote do insumo, soma o SO₂ na parte, consulta inversa, limite e estorno', async () => {
    const c = await cenario();
    const t1 = await c.recipiente('T1', '5000.00');
    await c.mosto(c.malbec, '1000', t1);
    const adicao = (dose: string, loteItemId = c.mb1, cientes: string[] = []) =>
      c.master.post('/api/operacoes/adicao_insumo', {
        executadoEm: agora(),
        insumos: [{ recipienteId: t1, itemId: c.so2, loteItemId, dose, unidade: 'g/hL' }],
        cientes,
      });
    // 10 g/hL em 700 L = 70 g de metabissulfito; 57% de SO₂ = 57 mg/L.
    const a1 = await adicao('10');
    expect(a1.status).toBe(200);
    expect(await c.saldo(c.so2)).toBe('1030.000');
    expect((await c.conteudo(t1)).composicao.so2).toBe(57);
    const op = (await c.master.get(`/api/operacoes/${a1.corpo.operacaoId}`)).corpo;
    expect(op.insumos).toMatchObject([
      { recipiente: 'T1', loteItem: 'MB1', dose: '10.0000', quantidade: '70.000', so2: '57.00' },
    ]);
    const usos = (await c.master.get(`/api/estoque/lotes/${c.mb1}/usos`)).corpo;
    expect(usos).toMatchObject([{ operacao: op.codigo, recipiente: 'T1' }]);

    // 40 g/hL: 285 mg/L, ainda abaixo; mais 10 g/hL passa de 300 e pede ciente.
    expect((await adicao('40')).status).toBe(200);
    const alto = await adicao('10');
    expect(alto.corpo.codigo).toBe('ciente_pendente');
    expect(alto.corpo.detalhes.avisos[0]).toMatchObject({
      codigo: `so2:${t1}`,
      fonte: expect.stringContaining('IN Anvisa 211/2023'),
    });
    // Lote vencido: aviso.
    const vencido = await adicao('1', c.mbv);
    expect(vencido.corpo.detalhes.avisos.map((a: { codigo: string }) => a.codigo)).toContain(
      `vencido:${c.mbv}`,
    );

    // O estorno devolve o insumo ao estoque e o SO₂ da parte volta ao anterior.
    const ultimas = (await c.master.get(`/api/operacoes?recipiente=${t1}`)).corpo.itens as Array<{
      id: string;
      tipo: string;
    }>;
    const segunda = ultimas.find(
      (o) => o.tipo === 'adicao_insumo' && o.id !== a1.corpo.operacaoId,
    )!;
    expect(
      (await c.master.post(`/api/operacoes/${segunda.id}/estorno`, { motivo: 'Dose errada' }))
        .status,
    ).toBe(200);
    expect((await c.conteudo(t1)).composicao.so2).toBe(57);
    expect(await c.saldo(c.so2)).toBe('1030.000');
  });

  it('o SO₂ viaja com os litros; insumo no desengace; insumo não estocado sem baixa', async () => {
    const c = await cenario();
    const t1 = await c.recipiente('T1', '5000.00');
    const t2 = await c.recipiente('T2', '5000.00');
    const [item] = await c.romaneio([[c.malbec, '1000']]);
    const d = await c.master.post('/api/operacoes/desengace', {
      executadoEm: agora(),
      projetoId: c.projeto,
      consumos: [{ itemId: item, kg: '1000' }],
      destinos: [{ recipienteId: t1, lote: { novo: 'A' } }],
      insumos: [
        { itemId: c.so2, loteItemId: c.mb1, dose: '10', unidade: 'g/hL' },
        { descricao: 'Enzima trazida pelo cliente', dose: '2', unidade: 'g/hL' },
      ],
    });
    expect(d.status).toBe(200);
    expect((await c.conteudo(t1)).composicao.so2).toBe(57);
    expect(await c.saldo(c.so2)).toBe('1030.000');
    await c.mosto(c.malbec, '1000', t2);
    const loteT2 = (await c.master.get(`/api/recipientes/${t2}/conteudo`)).corpo.lote.id;
    // 350 L com 57 mg/L juntam-se a 700 L sem SO₂: 19 mg/L.
    const r = await c.master.post('/api/operacoes/trasfega', {
      executadoEm: agora(),
      origens: [{ recipienteId: t1, litros: '350' }],
      destinos: [{ recipienteId: t2, litros: '350', lote: { id: loteT2 } }],
    });
    expect(r.status).toBe(200);
    expect((await c.conteudo(t2)).composicao.so2).toBe(19);
  });
});

describe('chaptalização', () => {
  it('ganho estimado, alerta pelo limite da classe e a marca de chaptalizado', async () => {
    const c = await cenario();
    const ref = (await c.master.get('/api/referencia')).corpo;
    const fino = ref.classesProduto.find((x: { codigo: string }) => x.codigo === 'vinho_fino').id;
    const projeto = (
      await c.master.post('/api/projetos', {
        nome: 'Fino tinto',
        safraPrevista: 2026,
        cor: 'tinto',
        classeProdutoId: fino,
      })
    ).corpo.id as string;
    const acucar = (
      await c.master.post('/api/itens-estoque', {
        tipo: 'insumo',
        nome: 'Açúcar cristal',
        unidadeBase: 'kg',
        insumo: { tipoInsumoId: c.tipo('Açúcar') },
      })
    ).corpo.id as string;
    await c.entrada(acucar, '50', null);
    const t1 = await c.recipiente('T1', '5000.00');
    await c.mosto(c.malbec, '1000', t1, projeto);
    const chapt = (kg: string, cientes: string[] = []) =>
      c.master.post('/api/operacoes/chaptalizacao', {
        executadoEm: agora(),
        recipienteId: t1,
        itemId: acucar,
        kg,
        cientes,
      });
    // 21 kg em 700 L = 30 g/L, 1,76% vol: passa de 1,5% vol no fino tinto.
    const alto = await chapt('21');
    expect(alto.corpo.codigo).toBe('ciente_pendente');
    expect(alto.corpo.detalhes.avisos[0].fonte).toContain('Decreto 8.198/2014');
    // 14 kg = 20 g/L, 1,18% vol: dentro.
    const ok = await chapt('14');
    expect(ok.status).toBe(200);
    const op = (await c.master.get(`/api/operacoes/${ok.corpo.operacaoId}`)).corpo;
    expect(op.chaptalizacao).toMatchObject({
      acucarKg: '14.000',
      gramasPorLitro: '20.00',
      ganhoEstimado: '1.18',
      regra: 'chaptalizacao_maxima_vinho_fino_tinto',
    });
    expect((await c.conteudo(t1)).composicao.chaptalizado).toBe(true);
    expect(await c.saldo(acucar)).toBe('36.000');

    // Parâmetro da empresa (P29): outro fator e o limite da prática da vinícola.
    expect(
      (
        await c.master.put('/api/parametros/chaptalizacao', {
          acucarPorGrau: 16.5,
          limitePratica: 0.5,
        })
      ).status,
    ).toBe(200);
    expect((await c.master.get('/api/cantina/chaptalizacao')).corpo).toEqual({
      acucarPorGrau: 16.5,
      limitePratica: 0.5,
    });
    // 7 kg em 700 L = 10 g/L ÷ 16,5 = 0,61% vol: dentro do legal, acima da prática.
    const pratica = await chapt('7');
    expect(pratica.corpo.detalhes.avisos.map((a: { codigo: string }) => a.codigo)).toEqual([
      'chaptalizacao:limite_pratica',
    ]);
    const ok2 = await chapt('7', ['chaptalizacao:limite_pratica']);
    expect(
      (await c.master.get(`/api/operacoes/${ok2.corpo.operacaoId}`)).corpo.chaptalizacao
        .ganhoEstimado,
    ).toBe('0.61');
  });
});

describe('tratamento', () => {
  it('parâmetros técnicos do tipo, insumos e perda', async () => {
    const c = await cenario();
    const p = await c.master.post('/api/cantina/parametros-tratamento', {
      tipoTratamento: 'filtracao',
      nome: 'Porosidade',
      unidade: 'µm',
      obrigatorio: true,
    });
    expect(p.status).toBe(200);
    const t1 = await c.recipiente('T1', '5000.00');
    await c.mosto(c.malbec, '1000', t1);
    const base = {
      executadoEm: agora(),
      tipoTratamento: 'filtracao',
      recipientes: [t1],
      perdas: [{ recipienteId: t1, litros: '5', motivo: 'borra' }],
    };
    expect((await c.master.post('/api/operacoes/tratamento/previa', base)).corpo.codigo).toBe(
      'parametro',
    );
    const r = await c.master.post('/api/operacoes/tratamento', {
      ...base,
      parametros: [{ parametroId: p.corpo.id, valor: '0,45' }],
    });
    expect(r.status).toBe(200);
    expect((await c.conteudo(t1)).volume).toBe('695.00');
    const op = (await c.master.get(`/api/operacoes/${r.corpo.operacaoId}`)).corpo;
    expect(op.parametros).toEqual([{ nome: 'Porosidade', unidade: 'µm', valor: '0,45' }]);
    expect(op.dados).toMatchObject({ tipoTratamento: 'filtracao' });
  });
});
