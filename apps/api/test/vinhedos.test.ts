// Vinhedos: propriedades e parcelas, próprias ou do produtor (cantina.md, Recepção, Origem).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fichaPj, montar } from './apoio'

let t: Awaited<ReturnType<typeof montar>>
beforeAll(async () => {
  t = await montar()
})
afterAll(async () => {
  await t.fechar()
})

describe('propriedades e parcelas', () => {
  it('própria e do produtor; parcela que sai da lista é inativada', async () => {
    const { master } = await t.empresaComMaster()
    const syrah = (await master.get('/api/catalogos/variedade?tamanho=0&busca=syrah')).corpo
      .itens[0].id
    const propria = await master.post('/api/propriedades', {
      nome: 'Fazenda Sol',
      numeroSivibe: '123456',
      municipio: 'Casa Nova',
      uf: 'BA',
      parcelas: [
        { nome: 'P1', variedadeId: syrah, areaHa: '2.5' },
        { nome: 'P2', areaHa: '1' },
      ],
    })
    expect(propria.status).toBe(200)
    const produtor = await master.post('/api/pessoas', {
      ficha: fichaPj('Viticultor Parceiro'),
      papeis: ['produtor_uva'],
    })
    const dele = await master.post('/api/propriedades', {
      nome: 'Sítio Bom Jesus',
      donoId: produtor.corpo.id,
      parcelas: [{ nome: 'Talhão A', variedadeId: syrah }],
    })
    expect(dele.status).toBe(200)
    expect(
      (await master.post('/api/propriedades', { nome: 'fazenda sol', parcelas: [] })).corpo.codigo,
    ).toBe('nome_duplicado')
    expect(
      (
        await master.post('/api/propriedades', {
          nome: 'X',
          parcelas: [{ nome: 'A' }, { nome: 'a' }],
        })
      ).corpo.codigo,
    ).toBe('parcela_duplicada')

    const minhas = (await master.get('/api/propriedades/opcoes')).corpo
    expect(minhas.map((p: { nome: string }) => p.nome)).toEqual(['Fazenda Sol'])
    expect(minhas[0].parcelas).toHaveLength(2)
    const doProdutor = (await master.get(`/api/propriedades/opcoes?donoId=${produtor.corpo.id}`))
      .corpo
    expect(doProdutor[0].nome).toBe('Sítio Bom Jesus')

    const ficha = (await master.get(`/api/propriedades/${propria.corpo.id}`)).corpo
    const p1 = ficha.parcelas.find((x: { nome: string }) => x.nome === 'P1')
    const ed = await master.put(`/api/propriedades/${propria.corpo.id}`, {
      nome: 'Fazenda Sol',
      versao: ficha.versao,
      parcelas: [{ id: p1.id, nome: 'P1', variedadeId: syrah, areaHa: '3' }],
    })
    expect(ed.status).toBe(200)
    const depois = (await master.get(`/api/propriedades/${propria.corpo.id}`)).corpo.parcelas
    expect(
      depois.map((x: { nome: string; ativo: boolean; areaHa: string }) => [
        x.nome,
        x.ativo,
        x.areaHa,
      ]),
    ).toEqual([
      ['P1', true, '3.0000'],
      ['P2', false, '1.0000'],
    ])
    const lista = await master.get('/api/propriedades')
    expect(lista.corpo.itens.find((x: { nome: string }) => x.nome === 'Fazenda Sol')).toMatchObject(
      {
        parcelas: 1,
        areaHa: '3.0000',
      },
    )
  })
})
