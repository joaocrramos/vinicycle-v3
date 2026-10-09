// Diário (04, roteiro do ciclo 8, bloco 3): nota datada com vínculo, filtros, alteração pelo autor
// e por quem tem a permissão, inativação com motivo.
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

describe('diário', () => {
  it('notas com vínculo, filtros, alteração e inativação', async () => {
    const c = await cantina(t)
    const m = c.master
    const t1 = await c.recipiente('T1', '1000.00')
    const prop = await m.post('/api/propriedades', {
      nome: 'Fazenda',
      parcelas: [{ nome: 'P1', variedadeId: c.malbec }],
    })
    const parcela = (await m.get(`/api/propriedades/${prop.corpo.id}`)).corpo.parcelas[0].id

    const nova = (corpo: object) => m.post('/api/diario', corpo)
    expect((await nova({ data: '2026-03-01', texto: 'x' })).status).toBe(400)
    const a = (
      await nova({ data: '2026-03-01', texto: 'Chuva forte na colheita', parcelaId: parcela })
    ).corpo.id
    await nova({
      data: '2026-03-05',
      texto: 'Remontagem vigorosa',
      projetoId: c.projeto,
      recipienteId: t1,
    })
    await nova({ data: '2026-03-10', texto: 'Visita do RT' })

    const todas = (await m.get('/api/diario')).corpo as Array<{ texto: string; editada: boolean }>
    expect(todas.map((n) => n.texto)).toEqual([
      'Visita do RT',
      'Remontagem vigorosa',
      'Chuva forte na colheita',
    ])
    expect(todas[0]!.editada).toBe(false)
    expect((await m.get(`/api/diario?recipiente=${t1}`)).corpo).toMatchObject([
      { texto: 'Remontagem vigorosa', recipiente: { codigo: 'T1' } },
    ])
    expect((await m.get(`/api/diario?propriedade=${prop.corpo.id}`)).corpo).toMatchObject([
      { texto: 'Chuva forte na colheita', parcela: { nome: 'Fazenda · P1' } },
    ])
    expect((await m.get('/api/diario?busca=chuva')).corpo).toHaveLength(1)
    expect((await m.get('/api/diario?de=2026-03-02&ate=2026-03-06')).corpo).toHaveLength(1)

    // O cantineiro escreve as próprias notas; não altera as dos outros.
    const cantineiro = (await t.convidar(m, 'Cantineiro', [c.estab])).cliente
    await cantineiro.post('/api/auth/contexto', { estabelecimentoId: c.estab })
    const dele = (await cantineiro.post('/api/diario', { data: '2026-03-11', texto: 'Limpeza' }))
      .corpo.id
    expect(
      (await cantineiro.put(`/api/diario/${dele}`, { data: '2026-03-11', texto: 'Limpeza geral' }))
        .status,
    ).toBe(200)
    expect((await m.get('/api/diario?busca=geral')).corpo[0].editada).toBe(true)

    // Inativar pede motivo; a nota sai da lista.
    expect((await m.post(`/api/diario/${a}/inativar`, {})).status).toBe(400)
    expect((await m.post(`/api/diario/${a}/inativar`, { motivo: 'Duplicada' })).status).toBe(200)
    expect((await m.get('/api/diario')).corpo).toHaveLength(3)
  })
})
