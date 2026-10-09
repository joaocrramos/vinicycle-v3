// Importação do XML da nota da uva (P11, "Nota da uva"): cadastro do emitente, kg dos itens,
// duplicidade pela chave e variedade memorizada para o produto do emitente.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gerarCnpj, montar } from './apoio';

let t: Awaited<ReturnType<typeof montar>>;
beforeAll(async () => {
  t = await montar();
});
afterAll(async () => {
  await t.fechar();
});

function xml(d: {
  chave: string;
  numero: string;
  cnpj: string;
  itens: Array<[string, string, string, string]>;
}) {
  const det = d.itens
    .map(
      ([codigo, descricao, qtd, un], i) =>
        `<det nItem="${i + 1}"><prod><cProd>${codigo}</cProd><xProd>${descricao}</xProd><uCom>${un}</uCom><qCom>${qtd}</qCom><vProd>1000.00</vProd></prod></det>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${d.chave}" versao="4.00"><ide><nNF>${d.numero}</nNF><serie>1</serie><dhEmi>2026-02-10T07:00:00-03:00</dhEmi><tpNF>1</tpNF></ide><emit><CNPJ>${d.cnpj}</CNPJ><xNome>Uvas do Vale Ltda</xNome><IE>123456</IE><enderEmit><xLgr>Estrada da Uva</xLgr><nro>10</nro><xBairro>Zona Rural</xBairro><cMun>2907202</cMun><xMun>Casa Nova</xMun><UF>BA</UF><CEP>47300000</CEP></enderEmit></emit><dest><CNPJ>00000000000000</CNPJ><xNome>Outra Vinícola</xNome></dest>${det}</infNFe></NFe></nfeProc>`;
}

const chave = () => Array.from({ length: 44 }, () => Math.floor(Math.random() * 10)).join('');

describe('nota da uva', () => {
  it('importa, cadastra o emitente, confirma e memoriza a variedade', async () => {
    const { master } = await t.empresaComMaster();
    const estab = await t.criarEstabelecimento(master);
    await master.post('/api/auth/contexto', { estabelecimentoId: estab });
    const projeto = (
      await master.post('/api/projetos', { nome: 'Malbec 2026', safraPrevista: 2026 })
    ).corpo.id;
    const malbec = (
      await master.get('/api/catalogos/variedade?tamanho=0&busca=malbec')
    ).corpo.itens.find((v: { nome: string }) => v.nome === 'Malbec').id;
    const cnpj = gerarCnpj();
    const importar = (conteudo: string) =>
      t.app.inject({
        method: 'POST',
        url: '/api/romaneios/importar-xml',
        headers: {
          cookie: master.cookie,
          'x-vinicycle': '1',
          'content-type': 'multipart/form-data; boundary=x',
        },
        payload: Buffer.from(
          `--x\r\nContent-Disposition: form-data; name="arquivo"; filename="nota.xml"\r\nContent-Type: text/xml\r\n\r\n${conteudo}\r\n--x--\r\n`,
        ),
      });

    const primeira = chave();
    const r = await importar(
      xml({
        chave: primeira,
        numero: '123',
        cnpj,
        itens: [
          ['UVA-MB', 'Uva Malbec', '2.5', 'TON'],
          ['CX', 'Caixas', '100', 'UN'],
        ],
      }),
    );
    expect(r.statusCode).toBe(200);
    const d = JSON.parse(r.body);
    expect(d).toMatchObject({
      nfNumero: '123',
      nfSerie: '1',
      nfEmissao: '2026-02-10',
      nfChave: primeira,
      fornecedor: { nome: 'Uvas do Vale Ltda', documento: cnpj, novo: true },
    });
    expect(d.itens.map((i: { kg: string | null }) => i.kg)).toEqual(['2500.0', null]);
    expect(d.avisos.join(' ')).toMatch(/destinatário/);
    expect(d.avisos.join(' ')).toMatch(/Sem peso em kg na nota: Caixas/);
    const produtores = (await master.get('/api/pessoas/opcoes?papel=produtor_uva')).corpo;
    expect(produtores.map((p: { id: string }) => p.id)).toContain(d.fornecedor.id);

    const rom = await master.post('/api/romaneios', {
      chegadaEm: '2026-02-10T08:00:00-03:00',
      projetoId: projeto,
      origem: 'fornecedor',
      fornecedorId: d.fornecedor.id,
      nfeId: d.nfeId,
      nfNumero: d.nfNumero,
      nfSerie: d.nfSerie,
      nfEmissao: d.nfEmissao,
      nfChave: d.nfChave,
      itens: [
        {
          nfeItemId: d.itens[0].nfeItemId,
          variedadeId: malbec,
          dataColheita: '2026-02-09',
          brix: '23',
          pesagens: [{ pesadoEm: '2026-02-10T08:00:00-03:00', brutoKg: '2500', taraKg: '0' }],
        },
      ],
    });
    expect(rom.status).toBe(200);
    // A mesma nota não entra em outro romaneio.
    expect(
      JSON.parse((await importar(xml({ chave: primeira, numero: '123', cnpj, itens: [] }))).body)
        .codigo,
    ).toBe('nfe_usada');
    const previa = (await master.get(`/api/romaneios/${rom.corpo.id}/previa`)).corpo;
    const ok = await master.post(`/api/romaneios/${rom.corpo.id}/confirmar`, {
      cientes: previa.avisos.map((a: { codigo: string }) => a.codigo),
    });
    expect(ok.status).toBe(200);

    // Estornado o romaneio, a nota volta à conferência e pode ir para o romaneio certo.
    expect(
      (await master.post(`/api/romaneios/${rom.corpo.id}/estorno`, { motivo: 'Peso errado' }))
        .status,
    ).toBe(200);
    const denovo = await importar(xml({ chave: primeira, numero: '123', cnpj, itens: [] }));
    expect(denovo.statusCode).toBe(200);
    expect(JSON.parse(denovo.body).nfeId).toBe(d.nfeId);

    // Próxima nota do mesmo produtor: a variedade vem sugerida.
    const segunda = JSON.parse(
      (
        await importar(
          xml({
            chave: chave(),
            numero: '124',
            cnpj,
            itens: [['UVA-MB', 'Uva Malbec', '1800', 'KG']],
          }),
        )
      ).body,
    );
    expect(segunda.fornecedor).toMatchObject({ id: d.fornecedor.id, novo: false });
    expect(segunda.itens[0]).toMatchObject({ kg: '1800.0', variedadeId: malbec });

    expect(JSON.parse((await importar('<xml>não é nota</xml>')).body).codigo).toBe('xml_nao_nfe');
  });
});
