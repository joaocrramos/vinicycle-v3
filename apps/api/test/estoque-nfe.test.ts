// NF-e no estoque (ambiente-cliente.md, Entrada por NF-e; P11): importação do XML com o lote do
// grupo de rastreabilidade, conferência (associação, conversão, local, descarte), lançamento,
// associação memorizada na nota seguinte, estorno da nota inteira e duplicidade pela chave.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gerarCnpj, montar } from './apoio';

let t: Awaited<ReturnType<typeof montar>>;
beforeAll(async () => {
  t = await montar();
});
afterAll(async () => {
  await t.fechar();
});

const agora = () => new Date().toISOString();
const chave = () => Array.from({ length: 44 }, () => Math.floor(Math.random() * 10)).join('');

/** Itens: código, descrição, quantidade, unidade e, se houver, lote e validade. */
function xml(d: {
  chave: string;
  numero: string;
  cnpj: string;
  itens: Array<[string, string, string, string, string?, string?]>;
}) {
  const det = d.itens
    .map(
      ([codigo, descricao, qtd, un, lote, validade], i) =>
        `<det nItem="${i + 1}"><prod><cProd>${codigo}</cProd><xProd>${descricao}</xProd><uCom>${un}</uCom><qCom>${qtd}</qCom><vProd>100.00</vProd>${
          lote
            ? `<rastro><nLote>${lote}</nLote><qLote>${qtd}</qLote><dFab>2026-01-01</dFab><dVal>${validade}</dVal></rastro>`
            : ''
        }</prod></det>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${d.chave}" versao="4.00"><ide><nNF>${d.numero}</nNF><serie>1</serie><dhEmi>2026-09-10T07:00:00-03:00</dhEmi><tpNF>1</tpNF></ide><emit><CNPJ>${d.cnpj}</CNPJ><xNome>Enoquímica Ltda</xNome><IE>123456</IE></emit>${det}</infNFe></NFe></nfeProc>`;
}

describe('NF-e no estoque', () => {
  it('importa, confere, lança, memoriza a associação e estorna', async () => {
    const { master } = await t.empresaComMaster();
    const estab = await t.criarEstabelecimento(master);
    await master.post('/api/auth/contexto', { estabelecimentoId: estab });
    const alm = (
      await master.post('/api/locais', {
        nome: 'Almoxarifado',
        uso: 'estoque',
        moduloEstoque: 'ENOTRACE',
      })
    ).corpo.id as string;
    const tipos = (await master.get('/api/catalogos/tipo_insumo?tamanho=0')).corpo.itens as Array<{
      id: string;
      nome: string;
    }>;
    const lev = (
      await master.post('/api/itens-estoque', {
        tipo: 'insumo',
        nome: 'Levedura EC1118',
        unidadeBase: 'g',
        controlaLote: true,
        controlaValidade: true,
        insumo: { tipoInsumoId: tipos.find((x) => x.nome === 'Leveduras')!.id },
      })
    ).corpo.id as string;
    const cnpj = gerarCnpj();
    const importar = (conteudo: string) =>
      t.app.inject({
        method: 'POST',
        url: '/api/estoque/notas/importar-xml',
        headers: {
          cookie: master.cookie,
          'x-vinicycle': '1',
          'content-type': 'multipart/form-data; boundary=x',
        },
        payload: Buffer.from(
          `--x\r\nContent-Disposition: form-data; name="arquivo"; filename="nota.xml"\r\nContent-Type: text/xml\r\n\r\n${conteudo}\r\n--x--\r\n`,
        ),
      });

    const k1 = chave();
    const nota1 = xml({
      chave: k1,
      numero: '501',
      cnpj,
      itens: [
        ['LEV-01', 'Levedura EC1118 500 g', '2', 'KG', 'L2026A', '2027-12-31'],
        ['FRETE', 'Frete', '1', 'UN'],
      ],
    });
    const r = await importar(nota1);
    expect(r.statusCode).toBe(200);
    const { id } = JSON.parse(r.body);
    const n = (await master.get(`/api/estoque/notas/${id}`)).corpo;
    expect(n).toMatchObject({
      numero: '501',
      situacao: 'em_conferencia',
      emitente: 'Enoquímica Ltda',
    });
    expect(n.itens[0]).toMatchObject({
      lote: 'L2026A',
      validade: '2027-12-31',
      itemEstoqueId: null,
    });

    // Sem conferência, não lança.
    const cedo = await master.post(`/api/estoque/notas/${id}/lancar`, { executadoEm: agora() });
    expect(cedo.corpo.codigo).toBe('nfe_pendente');

    // Conferência: 2 kg da levedura = 2000 g; o frete é descartado.
    const conf = await master.put(`/api/estoque/notas/${id}`, {
      itens: [
        {
          id: n.itens[0].id,
          itemEstoqueId: lev,
          conversao: '1000',
          localId: alm,
          lote: 'L2026A',
          fabricacao: '2026-01-01',
          validade: '2027-12-31',
        },
        { id: n.itens[1].id, descartado: 'Frete: não entra no estoque' },
      ],
    });
    expect(conf.status).toBe(200);
    const l = await master.post(`/api/estoque/notas/${id}/lancar`, { executadoEm: agora() });
    expect(l.status).toBe(200);
    const ficha = (await master.get(`/api/estoque/itens/${lev}`)).corpo;
    expect(ficha.saldo).toBe('2000.000');
    expect(ficha.lotes).toMatchObject([{ codigo: 'L2026A', saldo: '2000.000' }]);
    const lancada = (await master.get(`/api/estoque/notas/${id}`)).corpo;
    expect(lancada.situacao).toBe('lancada');
    expect(lancada.movimentos).toMatchObject([
      { item: 'Levedura EC1118', quantidade: '2000.000', tipo: 'entrada_nfe', lote: 'L2026A' },
    ]);

    // Duplicidade: a mesma chave volta para a mesma nota.
    const de_novo = JSON.parse((await importar(nota1)).body);
    expect(de_novo).toMatchObject({ id, existente: true });

    // A entrada da nota não se estorna pelo grupo, só pela nota.
    const grupo = (await master.get(`/api/estoque/itens/${lev}`)).corpo.movimentos[0].grupoId;
    const g = await master.post(`/api/estoque/grupos/${grupo}/estorno`, { motivo: 'teste' });
    expect(g.corpo.codigo).toBe('nfe');

    // Nota seguinte do mesmo emitente: associação e descarte memorizados.
    const k2 = chave();
    const r2 = JSON.parse(
      (
        await importar(
          xml({
            chave: k2,
            numero: '502',
            cnpj,
            itens: [
              ['LEV-01', 'Levedura EC1118 500 g', '1', 'KG', 'L2026B', '2026-01-31'],
              ['FRETE', 'Frete', '1', 'UN'],
            ],
          }),
        )
      ).body,
    );
    const n2 = (await master.get(`/api/estoque/notas/${r2.id}`)).corpo;
    expect(n2.itens[0]).toMatchObject({
      itemEstoqueId: lev,
      conversao: '1000.000000',
      localId: alm,
    });
    expect(n2.itens[1].descartado).toBe('Frete: não entra no estoque');
    // Lote vencido: pede ciente.
    const previa = (
      await master.post(`/api/estoque/notas/${r2.id}/previa`, { executadoEm: agora() })
    ).corpo;
    expect(previa.bloqueios).toEqual([]);
    expect(previa.avisos.map((a: { codigo: string }) => a.codigo)).toEqual([
      `nfe_vencido:${n2.itens[0].id}`,
    ]);
    const semCiente = await master.post(`/api/estoque/notas/${r2.id}/lancar`, {
      executadoEm: agora(),
    });
    expect(semCiente.corpo.codigo).toBe('ciente_pendente');
    expect(
      (
        await master.post(`/api/estoque/notas/${r2.id}/lancar`, {
          executadoEm: agora(),
          cientes: [`nfe_vencido:${n2.itens[0].id}`],
        })
      ).status,
    ).toBe(200);
    expect((await master.get(`/api/estoque/itens/${lev}`)).corpo.saldo).toBe('3000.000');

    // Estorno da nota inteira: o saldo volta e a nota volta à conferência.
    const e = await master.post(`/api/estoque/notas/${r2.id}/estorno`, {
      motivo: 'Lançada com a quantidade errada',
    });
    expect(e.status).toBe(200);
    expect((await master.get(`/api/estoque/itens/${lev}`)).corpo.saldo).toBe('2000.000');
    expect((await master.get(`/api/estoque/notas/${r2.id}`)).corpo.situacao).toBe('em_conferencia');

    // Descartar a nota inteira e reabrir.
    expect(
      (await master.post(`/api/estoque/notas/${r2.id}/descartar`, { motivo: 'Nota de serviço' }))
        .status,
    ).toBe(200);
    expect(
      (await master.get('/api/estoque/notas?situacao=descartada')).corpo.map(
        (x: { numero: string }) => x.numero,
      ),
    ).toEqual(['502']);
    expect((await master.post(`/api/estoque/notas/${r2.id}/reabrir`, {})).status).toBe(200);
  });
});
