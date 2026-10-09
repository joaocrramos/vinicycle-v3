// Selos numerados (04, roteiro do ciclo 9, bloco 4): entrada só por faixa, sem repetição; faixas
// usadas e perdidos na produção do engarrafamento; disponíveis; o estorno da produção devolve.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { subtrair, unir } from '../src/modulos/selos'
import { montar } from './apoio'
import { cantina } from './cantina'

let t: Awaited<ReturnType<typeof montar>>
beforeAll(async () => {
  t = await montar()
})
afterAll(async () => {
  await t.fechar()
})

describe('selos numerados', () => {
  it('faixas: unir e subtrair', () => {
    expect(
      unir([
        { inicio: 5, fim: 9 },
        { inicio: 1, fim: 4 },
        { inicio: 20, fim: 30 },
      ]),
    ).toEqual([
      { inicio: 1, fim: 9 },
      { inicio: 20, fim: 30 },
    ])
    expect(
      subtrair(
        [{ inicio: 1, fim: 100 }],
        [
          { inicio: 1, fim: 10 },
          { inicio: 50, fim: 50 },
        ],
      ),
    ).toEqual([
      { inicio: 11, fim: 49 },
      { inicio: 51, fim: 100 },
    ])
  })

  it('entrada por faixa, uso na produção e estorno', async () => {
    const c = await cantina(t)
    const m = c.master
    const ok = (r: { status: number; corpo: unknown }) => {
      expect(r.status, JSON.stringify(r.corpo)).toBe(200)
      return r.corpo as Record<string, string>
    }
    const local = async (nome: string) =>
      ok(await m.post('/api/locais', { nome, uso: 'estoque', moduloEstoque: 'ENOTRACE' })).id!
    const alm = await local('Almoxarifado')
    const loja = await local('Loja')
    const t3 = await c.recipiente('T3', '5000.00')
    const garrafa = ok(
      await m.post('/api/itens-estoque', { tipo: 'embalagem', nome: 'Garrafa', unidadeBase: 'un' }),
    ).id!
    const selo = ok(
      await m.post('/api/itens-estoque', {
        tipo: 'selo',
        nome: 'Selo IP-VSF',
        unidadeBase: 'un',
        controlaNumeracao: true,
      }),
    ).id!
    // A lista de Cadastros › Selos filtra pelo tipo "selo".
    const lista = ok(await m.get('/api/itens-estoque?tipo=selo')) as unknown as {
      itens: Array<{ id: string }>
    }
    expect(lista.itens.map((i) => i.id)).toEqual([selo])
    const marca = ok(await m.post('/api/marcas', { nome: 'Sertão' })).id!
    const ref = (await m.get('/api/referencia')).corpo
    const produto = ok(
      await m.post('/api/produtos', {
        nome: 'Tinto IP',
        marcaId: marca,
        classeProdutoId: ref.classesProduto.find(
          (x: { codigo: string }) => x.codigo === 'vinho_fino',
        ).id,
        cor: 'tinto',
        teorAcucar: 'seco',
      }),
    ).id!
    const f750 = ok(await m.post(`/api/produtos/${produto}/formatos`, { volumeMl: 750 })).id!
    await m.put(`/api/produtos/${produto}/formatos/${f750}/ficha`, {
      itens: [
        { itemEstoqueId: garrafa, quantidade: '1' },
        { itemEstoqueId: selo, quantidade: '1' },
      ],
    })
    ok(
      await m.post('/api/estoque/entradas', {
        executadoEm: new Date().toISOString(),
        localId: alm,
        itens: [{ itemId: garrafa, quantidade: '500', lote: null }],
      }),
    )

    // Selo numerado não entra pela entrada comum; entra pela faixa, sem repetição.
    expect(
      (
        await m.post('/api/estoque/entradas', {
          executadoEm: new Date().toISOString(),
          localId: alm,
          itens: [{ itemId: selo, quantidade: '10', lote: null }],
        })
      ).corpo.codigo,
    ).toBe('selo_faixa')
    const faixa = (inicio: number, fim: number) =>
      m.post('/api/selos/faixas', {
        itemId: selo,
        serie: 'A',
        inicio,
        fim,
        localId: alm,
        recebidaEm: new Date().toISOString(),
        documento: 'NF 9',
      })
    ok(await faixa(1001, 1500))
    expect((await faixa(1400, 1600)).corpo.codigo).toBe('faixa_repetida')
    const sobra = ok(await faixa(2001, 2010)).id!

    // Vinho por carga inicial, ordem e produção de 100 garrafas.
    const csv =
      'recipiente;projeto;lote;litros;variedade;safra;percentual;organica\nT3;Tinto 2025;A;1000;Malbec;2025;100;não'
    const carga = await t.app.inject({
      method: 'POST',
      url: `/api/carga-inicial?tipo=saldo_granel&data=${encodeURIComponent(new Date(Date.now() - 3_600_000).toISOString())}`,
      headers: {
        cookie: m.cookie,
        'x-vinicycle': '1',
        'content-type': 'multipart/form-data; boundary=x',
      },
      payload: Buffer.from(
        `--x\r\nContent-Disposition: form-data; name="arquivo"; filename="c.csv"\r\nContent-Type: text/csv\r\n\r\n${csv}\r\n--x--\r\n`,
      ),
    })
    expect(carga.statusCode, carga.body).toBe(200)
    const projeto = (
      (await m.get('/api/projetos/opcoes')).corpo as Array<{ id: string; nome: string }>
    ).find((p) => p.nome === 'Tinto 2025')!.id
    await m.post(`/api/projetos/${projeto}/situacao`, { situacao: 'pronto_envase' })
    const ordem = ok(
      await m.post('/api/engarrafamento/ordens', {
        projetoId: projeto,
        produtoId: produto,
        dataPrevista: new Date().toISOString().slice(0, 10),
        localProdutoId: loja,
        localMateriaisId: alm,
        formatos: [{ formatoId: f750, garrafasPrevistas: 100 }],
        recipientes: [t3],
      }),
    ).id!
    const prod = ok(
      await m.post(`/api/engarrafamento/ordens/${ordem}/producoes`, {
        executadoEm: new Date().toISOString(),
        recipientes: [{ recipienteId: t3, litros: '76.00' }],
        formatos: [{ formatoId: f750, garrafas: 100 }],
      }),
    )

    // Usados 1001–1098 e perdidos 1099 e 1100: 100 selos, como a baixa da produção.
    const registrar = (corpo: object) =>
      m.put(`/api/engarrafamento/producoes/${prod.producaoId}/selos`, {
        itemId: selo,
        serie: 'A',
        ...corpo,
      })
    expect(
      (await registrar({ usados: [{ inicio: 1001, fim: 1098 }], perdidos: [1700] })).corpo.codigo,
    ).toBe('nao_recebido')
    expect(
      (await registrar({ usados: [{ inicio: 1001, fim: 1098 }], perdidos: [1050] })).corpo.codigo,
    ).toBe('repetido')
    expect(
      ok(await registrar({ usados: [{ inicio: 1001, fim: 1098 }], perdidos: [1099, 1100] })),
    ).toEqual({ total: 100, aviso: null })
    const materiais = (await m.get(`/api/engarrafamento/producoes/${prod.producaoId}/selos`)).corpo
    expect(materiais.materiais, JSON.stringify(materiais)).toMatchObject([{ real: '100.000' }])
    const comAviso = ok(await registrar({ usados: [{ inicio: 1001, fim: 1090 }], perdidos: [] }))
    expect(comAviso.aviso).toContain('baixou 100')
    ok(await registrar({ usados: [{ inicio: 1001, fim: 1098 }], perdidos: [1099, 1100] }))

    let painel = (await m.get('/api/selos')).corpo[0]
    expect(painel.series).toEqual([
      {
        serie: 'A',
        recebidas: 510,
        usados: 98,
        perdidos: 2,
        disponiveis: [
          { inicio: 1101, fim: 1500 },
          { inicio: 2001, fim: 2010 },
        ],
        totalDisponivel: 410,
      },
    ])
    // Faixa sem uso se estorna; com uso, não.
    ok(await m.post(`/api/selos/faixas/${sobra}/estornar`, { motivo: 'Lançada errada' }))
    const primeira = painel.faixas.find((f: { inicio: number }) => f.inicio === 1001).id
    expect(
      (await m.post(`/api/selos/faixas/${primeira}/estornar`, { motivo: 'Teste' })).corpo.codigo,
    ).toBe('em_uso')

    // O estorno da produção devolve os números.
    ok(await m.post(`/api/operacoes/${prod.operacaoId}/estorno`, { motivo: 'Errada' }))
    painel = (await m.get('/api/selos')).corpo[0]
    expect(painel.series[0]).toMatchObject({
      recebidas: 500,
      usados: 0,
      perdidos: 0,
      totalDisponivel: 500,
    })
  })
})
