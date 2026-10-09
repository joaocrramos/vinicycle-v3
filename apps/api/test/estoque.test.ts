// Estoque de insumos (03-modelo-de-dados.md, 2.4; ambiente-cliente.md, Estoque): entrada manual
// com lote do fabricante, saldo por local, pendência de negativo, ajuste, descarte, transferência
// e estorno.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { montar } from './apoio'

let t: Awaited<ReturnType<typeof montar>>
beforeAll(async () => {
  t = await montar()
})
afterAll(async () => {
  await t.fechar()
})

const agora = () => new Date().toISOString()

async function estoque() {
  const { master } = await t.empresaComMaster()
  const estab = await t.criarEstabelecimento(master)
  await master.post('/api/auth/contexto', { estabelecimentoId: estab })
  const local = async (nome: string, uso = 'estoque') =>
    (
      await master.post('/api/locais', {
        nome,
        uso,
        moduloEstoque: uso === 'recipientes' ? null : 'ENOTRACE',
      })
    ).corpo.id as string
  const tipos = (await master.get('/api/catalogos/tipo_insumo?tamanho=0')).corpo.itens as Array<{
    id: string
    nome: string
  }>
  const item = async (nome: string, extra: object = {}) =>
    (
      await master.post('/api/itens-estoque', {
        tipo: 'insumo',
        nome,
        unidadeBase: 'g',
        insumo: { tipoInsumoId: tipos.find((x) => x.nome === 'Leveduras')!.id },
        ...extra,
      })
    ).corpo.id as string
  const ficha = async (id: string) => (await master.get(`/api/estoque/itens/${id}`)).corpo
  return { master, estab, local, item, ficha }
}

describe('estoque', () => {
  it('entrada com lote do fabricante, saldo por local e situação da validade', async () => {
    const e = await estoque()
    const alm = await e.local('Almoxarifado')
    const recip = await e.local('Adega', 'recipientes')
    const lev = await e.item('Levedura EC1118', { controlaLote: true, controlaValidade: true })
    const vence = new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10)
    const semLote = await e.master.post('/api/estoque/entradas', {
      executadoEm: agora(),
      localId: alm,
      itens: [{ itemId: lev, quantidade: '500' }],
    })
    expect(semLote.corpo.codigo).toBe('lote')
    const localErrado = await e.master.post('/api/estoque/entradas', {
      executadoEm: agora(),
      localId: recip,
      itens: [{ itemId: lev, quantidade: '500', lote: { codigo: 'L1' } }],
    })
    expect(localErrado.corpo.codigo).toBe('local')
    const r = await e.master.post('/api/estoque/entradas', {
      executadoEm: agora(),
      localId: alm,
      documento: '1234',
      itens: [{ itemId: lev, quantidade: '500', lote: { codigo: 'L1', validade: vence } }],
    })
    expect(r.status).toBe(200)
    expect(r.corpo.avisos).toEqual([])
    // O mesmo código reaproveita o lote.
    await e.master.post('/api/estoque/entradas', {
      executadoEm: agora(),
      localId: alm,
      itens: [{ itemId: lev, quantidade: '250.5', lote: { codigo: 'L1' } }],
    })
    const f = await e.ficha(lev)
    expect(f.saldo).toBe('750.500')
    expect(f.lotes).toMatchObject([{ codigo: 'L1', situacao: 'vencendo', saldo: '750.500' }])
    expect(f.movimentos[1]).toMatchObject({ tipo: 'entrada', documento: '1234' })
    const lista = (await e.master.get('/api/estoque?situacao=vencendo')).corpo
    expect(lista.itens).toMatchObject([{ id: lev, saldo: '750.500', lotesVencendo: 1 }])
  })

  it('saldo negativo de insumo gera aviso e pendência, que se resolve com a entrada', async () => {
    const e = await estoque()
    const alm = await e.local('Almoxarifado')
    const so2 = await e.item('Metabissulfito de potássio')
    const desc = await e.master.post('/api/estoque/ajustes', {
      executadoEm: agora(),
      tipo: 'descarte',
      localId: alm,
      itemId: so2,
      quantidade: '100',
      motivo: 'Usado antes da nota chegar',
    })
    expect(desc.status).toBe(200)
    expect(desc.corpo.avisos[0].mensagem).toMatch(/negativo/)
    expect((await e.master.get('/api/estoque/pendencias')).corpo).toMatchObject([
      { itemId: so2, saldoApurado: '-100.000' },
    ])
    await e.master.post('/api/estoque/entradas', {
      executadoEm: agora(),
      localId: alm,
      itens: [{ itemId: so2, quantidade: '1000' }],
    })
    expect((await e.master.get('/api/estoque/pendencias')).corpo).toEqual([])
    expect((await e.ficha(so2)).pendencias).toMatchObject([{ situacao: 'resolvida' }])
  })

  it('transferência entre locais; estorno do lançamento', async () => {
    const e = await estoque()
    const alm = await e.local('Almoxarifado')
    const dep = await e.local('Depósito', 'ambos')
    const bent = await e.item('Bentonite')
    const ent = await e.master.post('/api/estoque/entradas', {
      executadoEm: agora(),
      localId: alm,
      itens: [{ itemId: bent, quantidade: '1000' }],
    })
    const tr = await e.master.post('/api/estoque/transferencias', {
      executadoEm: agora(),
      origemLocalId: alm,
      destinoLocalId: dep,
      itens: [{ itemId: bent, quantidade: '400' }],
    })
    expect(tr.status).toBe(200)
    let f = await e.ficha(bent)
    expect(
      f.porLocal.map((l: { local: string; saldo: string }) => `${l.local} ${l.saldo}`),
    ).toEqual(['Almoxarifado 600.000', 'Depósito 400.000'])
    const est = await e.master.post(`/api/estoque/grupos/${ent.corpo.grupoId}/estorno`, {
      motivo: 'Nota lançada em dobro',
    })
    expect(est.status).toBe(200)
    expect(est.corpo.avisos).toHaveLength(1)
    f = await e.ficha(bent)
    expect(f.saldo).toBe('0.000')
    expect(
      f.porLocal.map((l: { local: string; saldo: string }) => `${l.local} ${l.saldo}`),
    ).toEqual(['Almoxarifado -400.000', 'Depósito 400.000'])
    expect(
      (
        await e.master.post(`/api/estoque/grupos/${ent.corpo.grupoId}/estorno`, {
          motivo: 'De novo',
        })
      ).corpo.codigo,
    ).toBe('estorno')
  })
})
