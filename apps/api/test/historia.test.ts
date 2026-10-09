// Relatório de história do lote (cantina.md, Lote comercial): do lote comercial às uvas de origem,
// passando por operações, insumos, análises, corte e genealogia, envase e saídas.
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

const agora = () => new Date().toISOString()

describe('história do lote', () => {
  it('do lote comercial às uvas, com corte, envase e saída', async () => {
    const c = await cantina(t)
    const m = c.master
    await m.put('/api/cantina/rendimentos', {
      itens: [{ variedadeId: null, litrosPorKg: '0.7000' }],
    })
    const t1 = await c.recipiente('T1', '5000.00')
    const t2 = await c.recipiente('T2', '5000.00')
    const t3 = await c.recipiente('T3', '5000.00')
    for (const [v, r] of [
      [c.malbec, t1],
      [c.cabernet, t2],
    ] as const) {
      const [item] = await c.romaneio([[v, '1000']])
      await m.post('/api/operacoes/desengace', {
        executadoEm: agora(),
        projetoId: c.projeto,
        consumos: [{ itemId: item, kg: '1000' }],
        destinos: [{ recipienteId: r, lote: { novo: 'A' } }],
      })
    }
    // Corte dos dois lotes num lote novo.
    const corte = await m.post('/api/operacoes/corte', {
      executadoEm: agora(),
      origens: [
        { recipienteId: t1, esvaziar: true },
        { recipienteId: t2, esvaziar: true },
      ],
      destinos: [{ recipienteId: t3, litros: '1400.00', lote: { novo: 'A' } }],
      cientes: [],
    })
    expect(corte.status).toBe(200)
    const loteCorte = await c.lote(t3)
    const h = (await m.get(`/api/historia?lote=${loteCorte.id}`)).corpo
    expect(h.titulo).toBe(`Lote de produção ${loteCorte.codigo}`)
    // Três lotes (o do corte e os dois de origem), duas uvas, a genealogia do corte.
    expect(h.lotes).toHaveLength(3)
    expect(h.uvas.map((u: { variedade: string }) => u.variedade).sort()).toEqual([
      'Cabernet Sauvignon',
      'Malbec',
    ])
    expect(h.genealogia.length).toBeGreaterThanOrEqual(2)
    expect(h.operacoes.map((o: { tipo: string }) => o.tipo)).toEqual([
      'desengace',
      'desengace',
      'corte',
    ])
    const projeto = (await m.get(`/api/historia?projeto=${c.projeto}`)).corpo
    expect(projeto.lotes.length).toBeGreaterThanOrEqual(3)
  })
})
