// Carga do saldo de abertura (cantina.md, Carga inicial; P23): validação linha a linha sem gravar,
// tudo ou nada, granel com composição e projeto novo, garrafas com lote comercial, insumos com lote
// e validade, e estorno.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { montar } from './apoio'
import { cantina } from './cantina'

let t: Awaited<ReturnType<typeof montar>>
beforeAll(async () => {
  t = await montar()
})
afterAll(async () => {
  await t.fechar()
})

const DATA = '2025-12-31T23:59:00-03:00'

describe('carga inicial', () => {
  it('granel, garrafas e insumos; erros por linha; estorno', async () => {
    const c = await cantina(t)
    const m = c.master
    const enviar = (rota: string, tipo: string, csv: string) =>
      t.app.inject({
        method: 'POST',
        url: `/api/carga-inicial${rota}?tipo=${tipo}&data=${encodeURIComponent(DATA)}`,
        headers: {
          cookie: m.cookie,
          'x-vinicycle': '1',
          'content-type': 'multipart/form-data; boundary=x',
        },
        payload: Buffer.from(
          `--x\r\nContent-Disposition: form-data; name="arquivo"; filename="carga.csv"\r\nContent-Type: text/csv\r\n\r\n${csv}\r\n--x--\r\n`,
        ),
      })
    const t1 = await c.recipiente('T1', '5000.00')
    await c.recipiente('B1', '225.00', 'Barrica')

    // Modelo para baixar.
    const modelo = await t.app.inject({
      method: 'GET',
      url: '/api/carga-inicial/modelo/saldo_granel',
      headers: { cookie: m.cookie },
    })
    expect(modelo.body).toMatch(
      /recipiente;projeto;lote;litros;variedade;safra;percentual;organica/,
    )

    // Erros por linha, nada gravado.
    const ruim = JSON.parse(
      (
        await enviar(
          '/validar',
          'saldo_granel',
          'recipiente;projeto;lote;litros;variedade;safra;percentual;organica\r\nT9;Tinto 2025;A;100;Malbec;2025;100;não\r\nT1;Tinto 2025;A;3000;Malbec;2025;60;\r\nT1;Tinto 2025;A;;Uva Inventada;2025;40;',
        )
      ).body,
    )
    expect(ruim.erros.map((e: { linha: number }) => e.linha)).toEqual([2, 4])
    expect(ruim.erros[0].mensagem).toMatch(/Recipiente "T9"/)

    const granel =
      'recipiente;projeto;lote;litros;variedade;safra;percentual;organica\n' +
      'T1;Tinto 2025;A;3.000,00;Malbec;2025;60;não\n' +
      'T1;Tinto 2025;A;;Cabernet Sauvignon;2025;40;não\n' +
      'B1;Tinto 2025;A;225;Malbec;2025;100;sim\n'
    const v = JSON.parse((await enviar('/validar', 'saldo_granel', granel)).body)
    expect(v).toMatchObject({
      erros: [],
      resumo: { recipientes: 2, lotes: 1, projetosNovos: 1, litros: 3225 },
    })
    const g = await enviar('', 'saldo_granel', granel)
    expect(g.statusCode).toBe(200)
    const conteudo = (await m.get(`/api/recipientes/${t1}/conteudo`)).corpo
    expect(conteudo.volume).toBe('3000.00')
    expect(conteudo.lote.codigo).toMatch(/^2025/)
    const projetos = (await m.get('/api/projetos?tamanho=0')).corpo.itens as Array<{
      nome: string
    }>
    expect(projetos.map((p) => p.nome)).toContain('Tinto 2025')

    // Insumos: lote e validade; item que controla lote sem lote é erro.
    const alm = (
      await m.post('/api/locais', {
        nome: 'Almoxarifado',
        uso: 'estoque',
        moduloEstoque: 'ENOTRACE',
      })
    ).corpo.id as string
    const tipos = (await m.get('/api/catalogos/tipo_insumo?tamanho=0')).corpo.itens as Array<{
      id: string
      nome: string
    }>
    const lev = (
      await m.post('/api/itens-estoque', {
        tipo: 'insumo',
        nome: 'Levedura EC1118',
        unidadeBase: 'g',
        controlaLote: true,
        insumo: { tipoInsumoId: tipos.find((x) => x.nome === 'Leveduras')!.id },
      })
    ).corpo.id as string
    const semLote = await enviar(
      '',
      'saldo_itens',
      'item;local;lote;validade;quantidade\nLevedura EC1118;Almoxarifado;;;500',
    )
    expect(JSON.parse(semLote.body).codigo).toBe('planilha')
    const itens = await enviar(
      '',
      'saldo_itens',
      'item;local;lote;validade;quantidade\nLevedura EC1118;Almoxarifado;L25A;31/12/2027;500,5',
    )
    expect(itens.statusCode).toBe(200)
    const ficha = (await m.get(`/api/estoque/itens/${lev}`)).corpo
    expect(ficha.saldo).toBe('500.500')
    expect(ficha.lotes).toMatchObject([{ codigo: 'L25A', validade: '2027-12-31' }])
    void alm

    // Garrafas: lote comercial de carga inicial.
    const marca = (await m.post('/api/marcas', { nome: 'Sertão' })).corpo.id
    const ref = (await m.get('/api/referencia')).corpo
    const produto = (
      await m.post('/api/produtos', {
        nome: 'Syrah Reserva',
        marcaId: marca,
        classeProdutoId: ref.classesProduto.find(
          (x: { codigo: string }) => x.codigo === 'vinho_fino',
        ).id,
        cor: 'tinto',
        teorAcucar: 'seco',
      })
    ).corpo.id
    await m.post(`/api/produtos/${produto}/formatos`, { volumeMl: 750 })
    const garrafas = await enviar(
      '',
      'saldo_garrafas',
      'produto;formato_ml;lote_comercial;local;quantidade;data_envase\nSyrah Reserva;750;L25-0012;Almoxarifado;480;15/09/2025',
    )
    expect(garrafas.statusCode).toBe(200)
    const lotes = (await m.get('/api/lotes-comerciais')).corpo
    expect(lotes).toMatchObject([{ codigo: 'L25-0012', produto: 'Syrah Reserva' }])

    // Lista e estorno: o granel volta a zero; os insumos com movimento posterior não estornam.
    const lista = (await m.get('/api/carga-inicial')).corpo as Array<{ id: string; tipo: string }>
    expect(lista.map((l) => l.tipo).sort()).toEqual([
      'saldo_garrafas',
      'saldo_granel',
      'saldo_itens',
    ])
    const idGranel = lista.find((l) => l.tipo === 'saldo_granel')!.id
    expect(
      (await m.post(`/api/carga-inicial/${idGranel}/estorno`, { motivo: 'Planilha errada' }))
        .status,
    ).toBe(200)
    expect((await m.get(`/api/recipientes/${t1}/conteudo`)).corpo.volume).toBe('0.00')
    await m.post('/api/estoque/ajustes', {
      executadoEm: new Date().toISOString(),
      tipo: 'descarte',
      localId: alm,
      itemId: lev,
      loteItemId: ficha.lotes[0].id,
      quantidade: '10',
      motivo: 'Teste',
    })
    const idItens = lista.find((l) => l.tipo === 'saldo_itens')!.id
    expect(
      (await m.post(`/api/carga-inicial/${idItens}/estorno`, { motivo: 'teste' })).corpo.codigo,
    ).toBe('dependentes')
  })
})
