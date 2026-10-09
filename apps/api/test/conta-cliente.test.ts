// Devolução, conta do cliente e insumos do cliente (04, roteiro do ciclo 10, bloco 3): granel
// recebido do cliente, prefixo do contrato no lote comercial, garrafas do titular fora da venda
// própria, devolução e entrega por ordem do titular, insumos do cliente e a perda tolerada.
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

describe('conta do cliente', () => {
  it('granel do cliente, garrafas, devolução, insumos e perda tolerada', async () => {
    const c = await cantina(t);
    const m = c.master;
    const ok = (r: { status: number; corpo: unknown }) => {
      expect(r.status, JSON.stringify(r.corpo)).toBe(200);
      return r.corpo as Record<string, string>;
    };
    const pessoa = async (nome: string, papeis: string[]) =>
      ok(await m.post('/api/pessoas', { ficha: fichaPj(nome), papeis })).id!;
    const cliente = await pessoa('Vinhos do Vale Ltda', ['cliente_vinificacao']);
    const comprador = await pessoa('Empório do Cliente', ['cliente']);
    ok(
      await m.post('/api/contratos-terceirizacao', {
        sentido: 'prestamos',
        atividades: ['elaboracao', 'envase'],
        contraparteId: cliente,
        estabelecimentoId: c.estab,
        registroProduto: 'cantina',
        vigenciaInicio: '2026-01-01',
        perdaToleradaTipo: 'percentual',
        perdaToleradaValor: '2',
        pagamentoDinheiro: true,
        prefixoLote: 'VC',
      }),
    );
    const t1 = await c.recipiente('T1', '5000.00');
    const t2 = await c.recipiente('T2', '5000.00');
    const granel = (corpo: Record<string, unknown>) =>
      m.post('/api/operacoes/entrada_granel', {
        executadoEm: new Date(Date.now() - 3_600_000).toISOString(),
        tipoGranel: 'recebido_cliente',
        projetoId: c.projeto,
        composicao: [{ variedadeId: c.malbec, safra: 2026, percentual: '100' }],
        ...corpo,
      });

    // Recebido do cliente: exige o titular.
    expect(
      (await granel({ destinos: [{ recipienteId: t1, litros: '1000.00', lote: { novo: 'A' } }] }))
        .corpo.codigo,
    ).toBe('titularId');
    ok(
      await granel({
        titularId: cliente,
        destinos: [{ recipienteId: t1, litros: '1000.00', lote: { novo: 'A' } }],
      }),
    );
    ok(
      await granel({
        tipoGranel: 'compra',
        destinos: [{ recipienteId: t2, litros: '500.00', lote: { novo: 'A' } }],
      }),
    );
    // 50 L de perda no vinho do cliente: 5%, acima dos 2% tolerados.
    ok(
      await m.post('/api/operacoes/perda', {
        executadoEm: new Date(Date.now() - 3_000_000).toISOString(),
        itens: [{ recipienteId: t1, litros: '50.00', motivo: 'vazamento' }],
      }),
    );

    // Insumo do cliente: entra com lote, fica separado; usado no vinho próprio pede "ciente".
    const local = ok(
      await m.post('/api/locais', {
        nome: 'Almoxarifado',
        uso: 'estoque',
        moduloEstoque: 'ENOTRACE',
      }),
    ).id!;
    const loja = ok(
      await m.post('/api/locais', { nome: 'Expedição', uso: 'estoque', moduloEstoque: 'ENOTRACE' }),
    ).id!;
    const tipos = (await m.get('/api/catalogos/tipo_insumo?tamanho=0')).corpo.itens as Array<{
      id: string;
      nome: string;
    }>;
    const levedura = ok(
      await m.post('/api/itens-estoque', {
        tipo: 'insumo',
        nome: 'Levedura',
        unidadeBase: 'g',
        controlaLote: true,
        insumo: { tipoInsumoId: tipos[0]!.id },
      }),
    ).id!;
    const entrada = (corpo: Record<string, unknown>) =>
      m.post('/api/estoque/entradas', {
        executadoEm: new Date(Date.now() - 3_000_000).toISOString(),
        localId: local,
        titularId: cliente,
        ...corpo,
      });
    expect(
      (await entrada({ itens: [{ itemId: levedura, quantidade: '1000', lote: null }] })).corpo
        .codigo,
    ).toBe('lote');
    ok(
      await entrada({ itens: [{ itemId: levedura, quantidade: '1000', lote: { codigo: 'LV1' } }] }),
    );
    const loteLev = (
      (await m.get(`/api/estoque/lotes?item=${levedura}`)).corpo as Array<{
        id: string;
        titular: string | null;
      }>
    )[0]!;
    expect(loteLev.titular).toBe('Vinhos do Vale Ltda');
    const adicao = (recipienteId: string, cientes: string[] = []) =>
      m.post('/api/operacoes/adicao_insumo', {
        executadoEm: new Date(Date.now() - 2_400_000).toISOString(),
        localEstoqueId: local,
        insumos: [
          { recipienteId, itemId: levedura, loteItemId: loteLev.id, dose: '20', unidade: 'g/hL' },
        ],
        cientes,
      });
    const outroTitular = await adicao(t2);
    expect(outroTitular.status).toBe(422);
    expect(JSON.stringify(outroTitular.corpo)).toContain('insumo_outro_titular');
    // 20 g/hL em 950 L = 190 g, no vinho do próprio cliente: sem aviso.
    ok(await adicao(t1));

    // Engarrafamento do vinho do cliente: o lote comercial leva o prefixo do contrato e as garrafas
    // ficam com o titular.
    const marca = ok(await m.post('/api/marcas', { nome: 'Vale', donoId: cliente })).id!;
    const ref = (await m.get('/api/referencia')).corpo;
    const produto = ok(
      await m.post('/api/produtos', {
        nome: 'Vale Tinto',
        marcaId: marca,
        classeProdutoId: ref.classesProduto.find(
          (x: { codigo: string }) => x.codigo === 'vinho_fino',
        ).id,
        cor: 'tinto',
        titularId: cliente,
      }),
    ).id!;
    const f750 = ok(await m.post(`/api/produtos/${produto}/formatos`, { volumeMl: 750 })).id!;
    const item = (await m.get(`/api/produtos/${produto}`)).corpo.formatos[0].itemEstoqueId;
    await m.post(`/api/projetos/${c.projeto}/situacao`, { situacao: 'pronto_envase' });
    const ordem = ok(
      await m.post('/api/engarrafamento/ordens', {
        projetoId: c.projeto,
        produtoId: produto,
        dataPrevista: new Date().toISOString().slice(0, 10),
        localProdutoId: loja,
        localMateriaisId: local,
        formatos: [{ formatoId: f750, garrafasPrevistas: 100 }],
        recipientes: [t1],
      }),
    ).id!;
    ok(
      await m.post(`/api/engarrafamento/ordens/${ordem}/producoes`, {
        executadoEm: new Date(Date.now() - 1_800_000).toISOString(),
        recipientes: [{ recipienteId: t1, litros: '75.00' }],
        formatos: [{ formatoId: f750, garrafas: 100 }],
      }),
    );
    const lotesGarrafa = (await m.get(`/api/estoque/itens/${item}`)).corpo.lotes as Array<{
      id: string;
      codigo: string;
      titular: string | null;
    }>;
    expect(lotesGarrafa).toHaveLength(1);
    expect(lotesGarrafa[0]!.codigo).toMatch(/^VC-L26-/);
    expect(lotesGarrafa[0]!.titular).toBe('Vinhos do Vale Ltda');

    // Venda própria não baixa garrafas do cliente.
    const saida = (corpo: Record<string, unknown>) => ({
      executadoEm: agora(),
      localId: loja,
      itens: [{ itemId: item, quantidade: '40' }],
      ...corpo,
    });
    expect((await m.post('/api/saidas', saida({ tipo: 'venda' }))).corpo.codigo).toBe('saldo');
    // Devolução ao titular entregue a outra pessoa: "ciente".
    const previa = (
      await m.post(
        '/api/saidas/previa',
        saida({ tipo: 'devolucao_titular', titularId: cliente, pessoaId: comprador }),
      )
    ).corpo;
    expect(previa.avisos.map((a: { codigo: string }) => a.codigo)).toEqual([
      'saida_devolucao_destinatario',
    ]);
    ok(
      await m.post(
        '/api/saidas',
        saida({ tipo: 'devolucao_titular', titularId: cliente, pessoaId: cliente }),
      ),
    );
    // Entrega por ordem do titular: exige o titular; ao comprador dele, sem aviso.
    expect(
      (await m.post('/api/saidas', saida({ tipo: 'entrega_ordem_titular', pessoaId: comprador })))
        .corpo.codigo,
    ).toBe('saldo');
    ok(
      await m.post(
        '/api/saidas',
        saida({
          tipo: 'entrega_ordem_titular',
          titularId: cliente,
          pessoaId: comprador,
          itens: [{ itemId: item, quantidade: '10' }],
        }),
      ),
    );
    // Sobra da levedura devolvida ao cliente (saída de insumo só na devolução ao titular).
    ok(
      await m.post('/api/saidas', {
        tipo: 'devolucao_titular',
        titularId: cliente,
        pessoaId: cliente,
        executadoEm: agora(),
        localId: local,
        itens: [{ itemId: levedura, quantidade: '800' }],
      }),
    );

    // Conta do cliente.
    const [conta] = (await m.get(`/api/terceiros/contas?titularId=${cliente}`)).corpo as Array<
      Record<string, unknown>
    >;
    const sf = (conta!.safras as Array<Record<string, string>>)[0]!;
    expect(sf).toMatchObject({
      safra: 2026,
      granelRecebido: '1000.00',
      perdas: '50.00',
      perdaPercentual: '5.00',
      engarrafado: '75.00',
      emElaboracao: '875.00',
    });
    expect(sf.foraDaTolerancia).toMatch(/Perda de 5,00%, acima da tolerada de 2%/);
    expect(conta!.garrafas).toEqual({
      emEstoque: 50,
      litrosEmEstoque: '37.50',
      devolvidas: 40,
      entreguesPorOrdem: 10,
    });
    expect(conta!.insumos).toEqual([
      {
        item: 'Levedura',
        unidade: 'g',
        recebido: '1000.000',
        usado: '190.000',
        devolvido: '800.000',
        saldo: '10.000',
      },
    ]);
    expect(conta!.faltaDevolverLitros).toBe('912.50');

    // Alerta da perda acima da tolerada.
    const alertas = (await m.get('/api/alertas?atualizar=sim')).corpo as Array<{
      mensagem: string;
      link: string;
    }>;
    expect(
      alertas.some((a) => /Vinhos do Vale Ltda, safra 2026: Perda de 5,00%/.test(a.mensagem)),
    ).toBe(true);

    // O estoque próprio fica separado do do cliente.
    const lista = (await m.get('/api/estoque?tamanho=0')).corpo.itens as Array<{
      id: string;
      saldo: string;
      saldoTerceiros: string;
    }>;
    expect(lista.find((x) => x.id === item)).toMatchObject({ saldoTerceiros: '50.000' });
  });
});
