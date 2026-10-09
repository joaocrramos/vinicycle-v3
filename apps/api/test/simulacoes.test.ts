// Simulador de corte (04, roteiro do ciclo 9, bloco 1): em % sobre um volume ou em litros, sem
// mexer no volume; composição e rótulo; aviso de saldo; salvar, aprovar e abrir com os saldos de agora.
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

describe('simulador de corte', () => {
  it('em % e em litros, salvar e aprovar', async () => {
    const c = await cantina(t)
    const m = c.master
    await m.put('/api/cantina/rendimentos', {
      itens: [{ variedadeId: null, litrosPorKg: '0.7000' }],
    })
    const t1 = await c.recipiente('T1', '5000.00')
    const t2 = await c.recipiente('T2', '5000.00')
    const [a, b] = await c.romaneio([
      [c.malbec, '1000'],
      [c.cabernet, '1000'],
    ])
    for (const [item, rec, lote] of [
      [a!, t1, 'A'],
      [b!, t2, 'B'],
    ] as const)
      await m.post('/api/operacoes/desengace', {
        executadoEm: '2026-02-11T10:00:00-03:00',
        projetoId: c.projeto,
        consumos: [{ itemId: item, kg: '1000' }],
        destinos: [{ recipienteId: rec, lote: { novo: lote } }],
      })

    // 80% Malbec + 20% Cabernet para 500 L: 400 + 100 L; varietal Malbec pode (≥ 75%).
    const pct = (
      await m.post('/api/simulacoes-corte/previa', {
        modo: 'percentual',
        volume: '500',
        itens: [
          { recipienteId: t1, valor: '80' },
          { recipienteId: t2, valor: '20' },
        ],
      })
    ).corpo
    expect(pct.itens.map((i: { litros: string }) => i.litros)).toEqual(['400.00', '100.00'])
    expect(pct.totalLitros).toBe('500.00')
    expect(pct.avisos).toEqual([])
    const nacional = pct.rotulo.varietal.find(
      (v: { abrangencia: string }) => v.abrangencia === 'Nacional',
    )
    expect(nacional.variedades).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nome: 'Malbec', percentual: 80, pode: true }),
        expect.objectContaining({ nome: 'Cabernet Sauvignon', percentual: 20, pode: false }),
      ]),
    )

    // Em litros, além do saldo: aviso; o volume não muda.
    const lit = (
      await m.post('/api/simulacoes-corte/previa', {
        modo: 'litros',
        itens: [
          { recipienteId: t1, valor: '800' },
          { recipienteId: t2, valor: '200' },
        ],
      })
    ).corpo
    expect(lit.itens.map((i: { percentual: number }) => i.percentual)).toEqual([80, 20])
    expect(lit.avisos).toHaveLength(1)
    expect(lit.avisos[0]).toContain('T1')
    expect((await c.lote(t1)).volume).toBe('700.00')
    expect(
      (
        await m.post('/api/simulacoes-corte/previa', {
          modo: 'percentual',
          volume: '500',
          itens: [{ recipienteId: t1, valor: '90' }],
        })
      ).corpo.avisos[0],
    ).toContain('somam 90%')

    // Salvar no projeto, aprovar e abrir com os saldos de agora.
    const salva = await m.post(`/api/projetos/${c.projeto}/simulacoes`, {
      nome: 'Malbec 80/20',
      modo: 'percentual',
      volume: '500',
      itens: [
        { recipienteId: t1, valor: '80' },
        { recipienteId: t2, valor: '20' },
      ],
    })
    expect(salva.status).toBe(200)
    const lista = (await m.get(`/api/projetos/${c.projeto}/simulacoes`)).corpo
    expect(lista).toMatchObject([
      { nome: 'Malbec 80/20', situacao: 'rascunho', autor: 'Maria Master' },
    ])
    expect((await m.post(`/api/simulacoes-corte/${salva.corpo.id}/aprovar`)).status).toBe(200)
    expect((await m.post(`/api/simulacoes-corte/${salva.corpo.id}/aprovar`)).corpo.codigo).toBe(
      'situacao',
    )
    const aberta = (await m.get(`/api/simulacoes-corte/${salva.corpo.id}`)).corpo
    expect(aberta).toMatchObject({ situacao: 'aprovada', agora: { totalLitros: '500.00' } })
    await m.post(`/api/simulacoes-corte/${salva.corpo.id}/descartar`)
    expect((await m.get(`/api/projetos/${c.projeto}/simulacoes`)).corpo).toEqual([])
  })
})
