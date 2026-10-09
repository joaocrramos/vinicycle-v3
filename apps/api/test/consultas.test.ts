// Consultas da cantina: conteúdo e livro do recipiente, ficha do lote com composição ponderada e
// o que o rótulo pode declarar (cantina.md, Composição e rótulo).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { montar } from './apoio'

let t: Awaited<ReturnType<typeof montar>>
beforeAll(async () => {
  t = await montar()
})
afterAll(async () => {
  await t.fechar()
})

describe('consultas', () => {
  it('recipiente, lote e rótulo', async () => {
    const { master } = await t.empresaComMaster()
    const estab = await t.criarEstabelecimento(master)
    await master.post('/api/auth/contexto', { estabelecimentoId: estab })
    const local = (await master.post('/api/locais', { nome: 'Adega', uso: 'recipientes' })).corpo.id
    const tipos = (await master.get('/api/catalogos/tipo_recipiente?tamanho=0')).corpo
      .itens as Array<{ id: string; nome: string }>
    const t1 = (
      await master.post('/api/recipientes', {
        codigo: 'T1',
        tipoRecipienteId: tipos.find((x) => x.nome === 'Tanque de inox')!.id,
        capacidadeLitros: '2000.00',
        localId: local,
      })
    ).corpo.id
    const variedade = async (nome: string) =>
      (
        await master.get(`/api/catalogos/variedade?tamanho=0&busca=${encodeURIComponent(nome)}`)
      ).corpo.itens.find((v: { nome: string }) => v.nome === nome).id as string
    const malbec = await variedade('Malbec')
    const cabernet = await variedade('Cabernet Sauvignon')
    await master.put('/api/cantina/rendimentos', {
      itens: [{ variedadeId: null, litrosPorKg: '0.7000' }],
    })
    const projeto = (
      await master.post('/api/projetos', { nome: 'Corte 2026', safraPrevista: 2026 })
    ).corpo.id
    const rom = await master.post('/api/romaneios', {
      chegadaEm: '2026-02-10T08:00:00-03:00',
      projetoId: projeto,
      origem: 'vinhedo_proprio',
      itens: [
        [malbec, '800'],
        [cabernet, '200'],
      ].map(([variedadeId, kg]) => ({
        variedadeId,
        dataColheita: '2026-02-10',
        brix: '23',
        pesagens: [{ pesadoEm: '2026-02-10T08:00:00-03:00', brutoKg: kg, taraKg: '0' }],
      })),
    })
    await master.post(`/api/romaneios/${rom.corpo.id}/confirmar`, {})
    const itens = (await master.get(`/api/romaneios/${rom.corpo.id}`)).corpo.itens as Array<{
      id: string
    }>
    const op = await master.post('/api/operacoes/desengace', {
      executadoEm: new Date().toISOString(),
      projetoId: projeto,
      consumos: [
        { itemId: itens[0]!.id, kg: '800' },
        { itemId: itens[1]!.id, kg: '200' },
      ],
      destinos: [{ recipienteId: t1, lote: { novo: 'A' } }],
    })
    expect(op.status).toBe(200)

    const conteudo = (await master.get(`/api/recipientes/${t1}/conteudo`)).corpo
    expect(conteudo).toMatchObject({ volume: '700.00', lote: { codigo: '2026.01-001' } })
    expect(conteudo.movimentos[0]).toMatchObject({ saldo: '700.00', operacao: op.corpo.codigo })

    const lote = (await master.get(`/api/lotes/${conteudo.lote.id}`)).corpo
    expect(lote).toMatchObject({
      volume: '700.00',
      etapa: 'desengace',
      partes: [{ recipiente: 'T1', litros: '700.00' }],
    })
    expect(
      lote.uva.map((u: { variedade: string; kg: string }) => [u.variedade, u.kg]).sort(),
    ).toEqual([
      ['Cabernet Sauvignon', '200.0'],
      ['Malbec', '800.0'],
    ])
    expect(lote.rotulo.varietal).toEqual([
      {
        abrangencia: 'Nacional',
        minimo: 75,
        fonte: 'Lei 7.678/1988, art. 41',
        variedades: [
          { nome: 'Malbec', percentual: 80, pode: true },
          { nome: 'Cabernet Sauvignon', percentual: 20, pode: false },
        ],
      },
    ])
    expect(lote.rotulo.safra).toMatchObject({
      minimo: 85,
      safras: [{ safra: 2026, percentual: 100, pode: true }],
    })

    const comp = (await master.get(`/api/projetos/${projeto}/composicao`)).corpo
    expect(comp.rotulo.varietal[0].variedades[0]).toMatchObject({ nome: 'Malbec', percentual: 80 })
    expect((await master.get(`/api/recipientes`)).corpo.itens[0]).toMatchObject({
      volume: '700.00',
      lote: { codigo: '2026.01-001' },
    })
  })
})
