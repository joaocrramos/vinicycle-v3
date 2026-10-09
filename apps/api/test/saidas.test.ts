// Saídas de produto (cantina.md, Saídas de produto): baixa por lote pela estratégia (mais antigo,
// escolha, lote do documento, sem lote com aviso de recall), saldo de produto acabado nunca
// negativo, devolução ao lote de origem, estorno, relatório de recolhimento e a nota de venda pelo
// XML com a associação memorizada.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gerarCnpj, montar } from './apoio'
import { cantina } from './cantina'

let t: Awaited<ReturnType<typeof montar>>
beforeAll(async () => {
  t = await montar()
})
afterAll(async () => {
  await t.fechar()
})

const agora = () => new Date().toISOString()
const chave = () => Array.from({ length: 44 }, () => Math.floor(Math.random() * 10)).join('')

/** Vinho engarrafado: lote comercial L26-0001 com 100 garrafas e um lote avulso com 50. */
async function cenario() {
  const c = await cantina(t)
  const m = c.master
  await m.put('/api/cantina/rendimentos', {
    itens: [{ variedadeId: null, litrosPorKg: '0.7000' }],
  })
  const t1 = await c.recipiente('T1', '5000.00')
  const [item] = await c.romaneio([[c.malbec, '1000']])
  await m.post('/api/operacoes/desengace', {
    executadoEm: agora(),
    projetoId: c.projeto,
    consumos: [{ itemId: item, kg: '1000' }],
    destinos: [{ recipienteId: t1, lote: { novo: 'A' } }],
  })
  const marca = (await m.post('/api/marcas', { nome: 'Sertão' })).corpo.id
  const ref = (await m.get('/api/referencia')).corpo
  const produto = (
    await m.post('/api/produtos', {
      nome: 'Malbec Reserva',
      marcaId: marca,
      classeProdutoId: ref.classesProduto.find((x: { codigo: string }) => x.codigo === 'vinho_fino')
        .id,
      cor: 'tinto',
      teorAcucar: 'seco',
    })
  ).corpo.id
  const f750 = (await m.post(`/api/produtos/${produto}/formatos`, { volumeMl: 750 })).corpo.id
  const local = async (nome: string) =>
    (await m.post('/api/locais', { nome, uso: 'estoque', moduloEstoque: 'ENOTRACE' })).corpo
      .id as string
  const loja = await local('Loja')
  const avariadas = await local('Avariadas')
  const ordem = (
    await m.post('/api/engarrafamento/ordens', {
      projetoId: c.projeto,
      produtoId: produto,
      dataPrevista: '2026-10-10',
      localProdutoId: loja,
      localMateriaisId: loja,
      formatos: [{ formatoId: f750, garrafasPrevistas: 100 }],
      recipientes: [t1],
    })
  ).corpo.id
  const p = await m.post(`/api/engarrafamento/ordens/${ordem}/producoes`, {
    executadoEm: agora(),
    recipientes: [{ recipienteId: t1, litros: '76.00' }],
    formatos: [{ formatoId: f750, garrafas: 100 }],
  })
  expect(p.corpo.loteComercial).toBe('L26-0001')
  const acabado = (await m.get('/api/itens-estoque?tipo=produto_acabado')).corpo.itens[0].id
  await m.post('/api/estoque/entradas', {
    executadoEm: agora(),
    localId: loja,
    itens: [{ itemId: acabado, quantidade: '50', lote: { codigo: 'L25-0099' } }],
  })
  const lc = (await m.get('/api/lotes-comerciais')).corpo[0].id as string
  const saldo = async () => (await m.get(`/api/estoque/itens/${acabado}`)).corpo
  return { ...c, m, acabado, loja, avariadas, lc, saldo }
}

describe('saídas', () => {
  it('mais antigo primeiro, escolha, saldo, sem lote, devolução, estorno e recolhimento', async () => {
    const c = await cenario()
    const venda = (extra: object) => ({
      tipo: 'venda',
      executadoEm: agora(),
      localId: c.loja,
      documento: '1001',
      destinatarioDocumento: '52998224725',
      destinatarioNome: 'Maria Compradora',
      ...extra,
    })

    // 120 garrafas: 100 do L26-0001 (o mais antigo) e 20 do L25-0099.
    const previa = (
      await c.m.post(
        '/api/saidas/previa',
        venda({ itens: [{ itemId: c.acabado, quantidade: '120' }] }),
      )
    ).corpo
    expect(previa.bloqueios).toEqual([])
    expect(
      previa.baixas.map((b: { lote: string; quantidade: string }) => [b.lote, b.quantidade]),
    ).toEqual([
      ['L26-0001', '100.000'],
      ['L25-0099', '20.000'],
    ])
    const s1 = await c.m.post(
      '/api/saidas',
      venda({ itens: [{ itemId: c.acabado, quantidade: '120' }] }),
    )
    expect(s1.status).toBe(200)
    expect((await c.saldo()).saldo).toBe('30.000')

    // Mais do que há: produto acabado não fica negativo.
    const demais = await c.m.post(
      '/api/saidas',
      venda({ itens: [{ itemId: c.acabado, quantidade: '31' }] }),
    )
    expect(demais.corpo.codigo).toBe('saldo')

    // Escolha do lote: 5 do L25-0099.
    const lote = (await c.saldo()).lotes.find((l: { codigo: string }) => l.codigo === 'L25-0099').id
    const s2 = await c.m.post(
      '/api/saidas',
      venda({
        tipo: 'degustacao',
        destinatarioNome: null,
        destinatarioDocumento: null,
        itens: [{ itemId: c.acabado, quantidade: '5', loteItemId: lote }],
      }),
    )
    expect(s2.status).toBe(200)

    // Sem lote: aviso de recall com ciente.
    await c.m.put('/api/parametros/baixa_saidas', {
      usarLoteDoDocumento: true,
      padrao: 'sem_lote',
    })
    const sem = await c.m.post(
      '/api/saidas',
      venda({ itens: [{ itemId: c.acabado, quantidade: '2' }] }),
    )
    expect(sem.corpo.codigo).toBe('ciente_pendente')
    const s3 = await c.m.post(
      '/api/saidas',
      venda({ itens: [{ itemId: c.acabado, quantidade: '2' }], cientes: ['saida_sem_lote'] }),
    )
    expect(s3.status).toBe(200)
    expect((await c.saldo()).saldo).toBe('23.000')
    await c.m.put('/api/parametros/baixa_saidas', {
      usarLoteDoDocumento: true,
      padrao: 'mais_antigo',
    })

    // Transferência não é saída.
    expect(
      (
        await c.m.post(
          '/api/saidas',
          venda({ tipo: 'transferencia', itens: [{ itemId: c.acabado, quantidade: '1' }] }),
        )
      ).corpo.codigo,
    ).toBe('tipo')

    // Devolução de 3 garrafas do L26-0001 para "Avariadas": voltam ao mesmo lote.
    const f1 = (await c.m.get(`/api/saidas/${s1.corpo.id}`)).corpo
    const baixa = f1.baixas.find((b: { lote: string }) => b.lote === 'L26-0001')
    const dev = await c.m.post(`/api/saidas/${s1.corpo.id}/devolucao`, {
      executadoEm: agora(),
      motivo: 'Garrafas com rolha vazando',
      itens: [{ baixaId: baixa.id, quantidade: '3', localId: c.avariadas, avariada: true }],
    })
    expect(dev.status).toBe(200)
    const demaisDev = await c.m.post(`/api/saidas/${s1.corpo.id}/devolucao`, {
      executadoEm: agora(),
      itens: [{ baixaId: baixa.id, quantidade: '98', localId: c.avariadas }],
    })
    expect(demaisDev.corpo.codigo).toBe('quantidade')
    const ficha = await c.saldo()
    expect(ficha.saldo).toBe('26.000')
    expect(
      ficha.porLocal.map((l: { local: string; saldo: string }) => `${l.local} ${l.saldo}`).sort(),
    ).toEqual(['Avariadas 3.000', 'Loja 23.000'])

    // Saída com devolução não se estorna; a outra, sim.
    expect(
      (await c.m.post(`/api/saidas/${s1.corpo.id}/estorno`, { motivo: 'teste' })).corpo.codigo,
    ).toBe('devolucao')
    expect(
      (await c.m.post(`/api/saidas/${s2.corpo.id}/estorno`, { motivo: 'Lançada errada' })).status,
    ).toBe(200)
    expect((await c.saldo()).saldo).toBe('31.000')

    // Recolhimento do L26-0001: quem recebeu, com o que voltou; e o aviso das saídas sem lote.
    const rec = (await c.m.get(`/api/lotes-comerciais/${c.lc}/destinos`)).corpo
    expect(rec.codigo).toBe('L26-0001')
    expect(rec.destinos).toMatchObject([
      {
        destinatario: 'Maria Compradora',
        destinatarioDocumento: '52998224725',
        quantidade: '100.000',
        devolvido: '3.000',
      },
    ])
    expect(rec.saidasSemLote).toBe(1)
  })

  it('nota de venda: conferência, lote do documento, associação memorizada e estorno', async () => {
    const c = await cenario()
    const importar = (conteudo: string) =>
      t.app.inject({
        method: 'POST',
        url: '/api/saidas/notas/importar-xml',
        headers: {
          cookie: c.m.cookie,
          'x-vinicycle': '1',
          'content-type': 'multipart/form-data; boundary=x',
        },
        payload: Buffer.from(
          `--x\r\nContent-Disposition: form-data; name="arquivo"; filename="venda.xml"\r\nContent-Type: text/xml\r\n\r\n${conteudo}\r\n--x--\r\n`,
        ),
      })
    const xml = (k: string, numero: string) =>
      `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${k}" versao="4.00"><ide><mod>65</mod><nNF>${numero}</nNF><serie>1</serie><dhEmi>2026-10-01T10:00:00-03:00</dhEmi><tpNF>1</tpNF></ide><emit><CNPJ>${gerarCnpj()}</CNPJ><xNome>Vinícola</xNome></emit><dest><CPF>52998224725</CPF><xNome>João Cliente</xNome></dest><det nItem="1"><prod><cProd>MR750-CX</cProd><xProd>Malbec Reserva cx 6</xProd><uCom>CX</uCom><qCom>2</qCom><vProd>600.00</vProd><rastro><nLote>L26-0001</nLote><qLote>12</qLote><dFab>2026-10-01</dFab><dVal>2030-10-01</dVal></rastro></prod></det><det nItem="2"><prod><cProd>SACOLA</cProd><xProd>Sacola</xProd><uCom>UN</uCom><qCom>1</qCom><vProd>5.00</vProd></prod></det></infNFe></NFe></nfeProc>`
    const r = JSON.parse((await importar(xml(chave(), '501'))).body)
    expect(r.avisos.join(' ')).toMatch(/emitente/)
    const n = (await c.m.get(`/api/saidas/notas/${r.id}`)).corpo
    expect(n.destinatario).toBe('João Cliente')
    expect(n.itens[0].lote).toBe('L26-0001')
    // Insumo não serve na nota de venda.
    const embalagem = (
      await c.m.post('/api/itens-estoque', { tipo: 'embalagem', nome: 'Sacola', unidadeBase: 'un' })
    ).corpo.id
    expect(
      (
        await c.m.put(`/api/saidas/notas/${r.id}`, {
          itens: [{ id: n.itens[1].id, itemEstoqueId: embalagem, conversao: '1', localId: c.loja }],
        })
      ).corpo.codigo,
    ).toBe('item')
    await c.m.put(`/api/saidas/notas/${r.id}`, {
      itens: [
        {
          id: n.itens[0].id,
          itemEstoqueId: c.acabado,
          conversao: '6',
          localId: c.loja,
          lote: 'L26-0001',
        },
        { id: n.itens[1].id, descartado: 'Sacola: não é produto' },
      ],
    })
    const previa = (await c.m.post(`/api/saidas/notas/${r.id}/previa`, { executadoEm: agora() }))
      .corpo
    expect(previa.baixas).toMatchObject([
      { lote: 'L26-0001', quantidade: '12.000', estrategia: 'documento' },
    ])
    const l = await c.m.post(`/api/saidas/notas/${r.id}/lancar`, { executadoEm: agora() })
    expect(l.status).toBe(200)
    expect((await c.saldo()).saldo).toBe('138.000')
    const lista = (await c.m.get('/api/saidas')).corpo
    expect(lista[0]).toMatchObject({ tipo: 'venda', origem: 'xml', destinatario: 'João Cliente' })

    // Nota seguinte: associação e descarte memorizados.
    const r2 = JSON.parse((await importar(xml(chave(), '502'))).body)
    const n2 = (await c.m.get(`/api/saidas/notas/${r2.id}`)).corpo
    expect(n2.itens[0]).toMatchObject({
      itemEstoqueId: c.acabado,
      conversao: '6.000000',
      localId: c.loja,
    })
    expect(n2.itens[1].descartado).toBe('Sacola: não é produto')

    // Estorno pela nota: a saída é estornada e a nota volta à conferência.
    expect(
      (await c.m.post(`/api/saidas/notas/${r.id}/estorno`, { motivo: 'Cancelada' })).status,
    ).toBe(200)
    expect((await c.saldo()).saldo).toBe('150.000')
    expect((await c.m.get(`/api/saidas/notas/${r.id}`)).corpo.situacao).toBe('em_conferencia')
  })
})
