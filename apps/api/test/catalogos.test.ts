// Catálogos globais com itens próprios (P8) e catálogos fixos de referência.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { carregarCatalogos } from '../src/db/dados/carregar-catalogos'
import { montar } from './apoio'

let t: Awaited<ReturnType<typeof montar>>
beforeAll(async () => {
  t = await montar()
})
afterAll(async () => {
  await t.fechar()
})

async function empresa() {
  const r = await t.empresaComMaster()
  await t.criarEstabelecimento(r.master)
  return r
}

describe('catálogos globais com itens próprios (P8)', () => {
  it('a empresa vê os globais e os seus; outra empresa não vê os dela', async () => {
    const a = await empresa()
    const b = await empresa()
    const globais = await a.master.get('/api/catalogos/tipo_recipiente?tamanho=100')
    expect(globais.corpo.itens.filter((i: { global: boolean }) => i.global)).toHaveLength(9)
    const criado = await a.master.post('/api/catalogos/tipo_recipiente', {
      nome: 'Tanque de polietileno',
    })
    expect(criado.status).toBe(200)
    const deA = await a.master.get('/api/catalogos/tipo_recipiente?origem=proprios')
    expect(deA.corpo.itens.map((i: { nome: string }) => i.nome)).toEqual(['Tanque de polietileno'])
    const deB = await b.master.get('/api/catalogos/tipo_recipiente?origem=proprios')
    expect(deB.corpo.total).toBe(0)
    // B não altera o item de A, nem sabendo o id.
    expect(
      (await b.master.put(`/api/catalogos/tipo_recipiente/${criado.corpo.id}`, { nome: 'X' }))
        .status,
    ).toBe(404)
  })

  it('item global não é alterado pela empresa; nome repetido é recusado', async () => {
    const { master } = await empresa()
    const lista = await master.get('/api/catalogos/tipo_recipiente?busca=barrica')
    const barrica = lista.corpo.itens[0]
    expect(barrica.global).toBe(true)
    const r = await master.put(`/api/catalogos/tipo_recipiente/${barrica.id}`, {
      nome: 'Barrica velha',
      eBarrica: true,
    })
    expect(r.status).toBe(422)
    expect(r.corpo.codigo).toBe('item_global')
    await master.post('/api/catalogos/tipo_recipiente', { nome: 'Cuba' })
    expect(
      (await master.post('/api/catalogos/tipo_recipiente', { nome: 'cuba' })).corpo.codigo,
    ).toBe('nome_duplicado')
  })

  it('listas simples: a empresa acrescenta itens; listas oficiais só a plataforma', async () => {
    const { master } = await empresa()
    const r = await master.post('/api/catalogos/opcao:motivo_perda', {
      nome: 'Derramamento na trasfega',
    })
    expect(r.status).toBe(200)
    const lista = await master.get('/api/catalogos/opcao:motivo_perda?tamanho=100')
    expect(
      lista.corpo.itens.find((i: { nome: string }) => i.nome === 'Derramamento na trasfega').codigo,
    ).toBe('derramamento_na_trasfega')
    expect((await master.post('/api/catalogos/opcao:cor_vinho', { nome: 'Laranja' })).status).toBe(
      422,
    )
    const ref = await master.get('/api/referencia')
    expect(ref.corpo.listas.motivo_perda.map((o: { nome: string }) => o.nome)).toContain(
      'Derramamento na trasfega',
    )
    expect(ref.corpo.unidades.find((u: { simbolo: string }) => u.simbolo === 'g/mL').casas).toBe(4)
    expect(ref.corpo.classesProduto.length).toBeGreaterThanOrEqual(10)
    expect(ref.corpo.igs[0].codigo).toBe('IP_VALE_SAO_FRANCISCO')
  })

  it('variedades: catálogo oficial, variedade própria e as em uso', async () => {
    const { master } = await empresa()
    const syrah = await master.get('/api/catalogos/variedade?busca=1058')
    expect(syrah.corpo.itens[0]).toMatchObject({
      nome: 'Cabernet Sauvignon',
      codigoOficial: '1058',
      cor: 'tinta',
      global: true,
    })
    expect(
      (await master.post(`/api/variedades/${syrah.corpo.itens[0].id}/uso`, { emUso: true })).status,
    ).toBe(200)
    const propria = await master.post('/api/catalogos/variedade', {
      nome: 'Moscatel do Sertão',
      tipo: 'vinifera',
      cor: 'branca',
    })
    expect(propria.status).toBe(200)
    const emUso = await master.get('/api/catalogos/variedade?emUso=sim&tamanho=100')
    expect(emUso.corpo.itens.map((v: { nome: string }) => v.nome).sort()).toEqual([
      'Cabernet Sauvignon',
      'Moscatel do Sertão',
    ])
    const minha = emUso.corpo.itens.find((v: { nome: string }) => v.nome === 'Moscatel do Sertão')
    expect(minha.codigoOficial).toBeNull()
  })

  it('o cantineiro vê os cadastros da cantina, mas não altera (grade inicial, P27)', async () => {
    const { master } = await empresa()
    const { cliente: cantineiro } = await t.convidar(master, 'Cantineiro')
    expect((await cantineiro.get('/api/catalogos/tipo_insumo')).status).toBe(200)
    expect(
      (await cantineiro.post('/api/catalogos/tipo_insumo', { nome: 'Gelo seco', unidades: ['kg'] }))
        .status,
    ).toBe(403)
  })

  it('a Administração mantém os globais, inclusive as listas oficiais', async () => {
    const { master } = await empresa()
    const { cliente: adm } = await t.admin()
    const url = '/api/plataforma/catalogos/opcao:cor_vinho'
    expect((await master.get(url)).status).toBe(403)
    const refAdm = (await adm.get('/api/plataforma/referencia')).corpo
    expect(refAdm.listas.cor_vinho.length).toBeGreaterThan(0)
    const criado = await adm.post(url, { nome: 'Laranja', ordem: 35 })
    expect(criado.status, JSON.stringify(criado.corpo)).toBe(200)
    const lista = (await adm.get(`${url}?busca=laranja`)).corpo
    expect(lista.itens[0]).toMatchObject({ nome: 'Laranja', codigo: 'laranja', versao: 1 })
    let ref = (await master.get('/api/referencia')).corpo
    expect(ref.listas.cor_vinho.map((o: { nome: string }) => o.nome)).toContain('Laranja')
    // A empresa vê o item como global e não o altera.
    const visto = (await master.get('/api/catalogos/opcao:cor_vinho?busca=laranja')).corpo.itens[0]
    expect(visto.global).toBe(true)
    expect(
      (await master.put(`/api/catalogos/opcao:cor_vinho/${visto.id}`, { nome: 'X', ordem: 1 }))
        .status,
    ).toBe(422)
    const editado = await adm.put(`${url}/${criado.corpo.id}`, {
      nome: 'Laranja (curtimenta)',
      ordem: 35,
      versao: 1,
    })
    expect(editado.status, JSON.stringify(editado.corpo)).toBe(200)
    expect((await adm.post(url, { nome: 'laranja (CURTIMENTA)' })).corpo.codigo).toBe(
      'nome_duplicado',
    )
    expect((await adm.post(`${url}/${criado.corpo.id}/inativar`, { motivo: 'Teste' })).status).toBe(
      200,
    )
    ref = (await master.get('/api/referencia')).corpo
    expect(ref.listas.cor_vinho.map((o: { nome: string }) => o.nome)).not.toContain(
      'Laranja (curtimenta)',
    )
    // O item da empresa não aparece nem se altera pela Administração.
    const proprio = await master.post('/api/catalogos/tipo_recipiente', { nome: 'Cuba própria' })
    expect(
      (
        await adm.put(`/api/plataforma/catalogos/tipo_recipiente/${proprio.corpo.id}`, {
          nome: 'Y',
        })
      ).status,
    ).toBe(404)
  })

  it('a carga dos catálogos não desfaz o que a Administração editou', async () => {
    const { cliente: adm } = await t.admin()
    const url = '/api/plataforma/catalogos/tipo_recipiente'
    const ovo = (await adm.get(`${url}?busca=ovo`)).corpo.itens[0]
    expect(
      (await adm.put(`${url}/${ovo.id}`, { nome: 'Ovo de concreto (editado)', versao: ovo.versao }))
        .status,
    ).toBe(200)
    await t.dbDono.transaction((tx) => carregarCatalogos(tx))
    const depois = (await adm.get(`${url}?busca=ovo`)).corpo.itens
    expect(depois.map((i: { nome: string }) => i.nome)).toEqual(['Ovo de concreto (editado)'])
    await adm.put(`${url}/${ovo.id}`, { nome: ovo.nome, versao: ovo.versao + 1 })
  })
})
