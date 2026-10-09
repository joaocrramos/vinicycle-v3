// Painel da cantina e higienização (cantina.md, Recipientes): ocupação de cada recipiente, o
// recipiente que esvazia passa a "aguardando higienização" (parâmetro), a higienização devolve a
// "ativo" e o estorno dela volta à situação de antes.
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

const antes = (min: number) => new Date(Date.now() - min * 60_000).toISOString()

interface Linha {
  id: string
  codigo: string
  situacao: string
  volume: string
  lote: { codigo: string; etapa: string | null } | null
  desde: string | null
  composicao: { componentes: unknown[] } | null
  fermentacoes: Array<{ tipo: string }>
  ultimaHigienizacao: string | null
}

describe('painel e higienização', () => {
  it('esvaziar deixa aguardando higienização; higienizar devolve a ativo; o painel mostra a ocupação', async () => {
    const c = await cantina(t)
    await c.master.put('/api/cantina/rendimentos', {
      itens: [{ variedadeId: null, litrosPorKg: '0.7000' }],
    })
    const t1 = await c.recipiente('T1', '5000.00')
    const t2 = await c.recipiente('T2', '1000.00')
    const [item] = await c.romaneio([[c.malbec, '1000']])
    await c.master.post('/api/operacoes/desengace', {
      executadoEm: antes(120),
      projetoId: c.projeto,
      consumos: [{ itemId: item, kg: '1000' }],
      destinos: [{ recipienteId: t1, lote: { novo: 'A' } }],
    })
    const trasfega = {
      executadoEm: antes(60),
      origens: [{ recipienteId: t1, esvaziar: true }],
      destinos: [{ recipienteId: t2, litros: '690' }],
    }
    const previa = (await c.master.post('/api/operacoes/trasfega/previa', trasfega)).corpo
    expect(previa.higienizar).toEqual([{ recipienteId: t1, recipiente: 'T1' }])
    expect((await c.master.post('/api/operacoes/trasfega', trasfega)).status).toBe(200)
    await c.master.post('/api/operacoes/fermentacao', {
      executadoEm: antes(50),
      recipienteId: t2,
      tipoFermentacao: 'alcoolica',
      evento: 'inicio',
    })

    const painel = async () =>
      new Map(
        ((await c.master.get('/api/painel/recipientes')).corpo as Linha[]).map((l) => [
          l.codigo,
          l,
        ]),
      )
    let p = await painel()
    expect(p.get('T1')).toMatchObject({
      situacao: 'aguardando_higienizacao',
      volume: '0.00',
      lote: null,
    })
    expect(p.get('T2')).toMatchObject({ situacao: 'ativo', volume: '690.00' })
    expect(p.get('T2')!.lote!.codigo).toBeTruthy()
    expect(p.get('T2')!.desde).toBeTruthy()
    expect(p.get('T2')!.composicao!.componentes).toHaveLength(1)
    expect(p.get('T2')!.fermentacoes.map((f) => f.tipo)).toEqual(['alcoolica'])

    // Encher um recipiente aguardando higienização pede "ciente" (P29).
    const volta = {
      executadoEm: antes(40),
      origens: [{ recipienteId: t2, litros: '100' }],
      destinos: [{ recipienteId: t1, litros: '100' }],
    }
    const avisos = (await c.master.post('/api/operacoes/trasfega/previa', volta)).corpo.avisos
    expect(avisos.map((a: { codigo: string }) => a.codigo)).toEqual([`higienizacao:${t1}`])

    // Higienizar com vinho é impossível; vazio, devolve a "ativo".
    const hig = (recipientes: string[]) =>
      c.master.post('/api/operacoes/higienizacao', {
        executadoEm: antes(30),
        tipoHigienizacao: 'higienizacao',
        recipientes,
        produto: 'Ácido peracético',
        dose: '0,2%',
      })
    expect((await hig([t2])).corpo.codigo).toBe('com_vinho')
    const h = await hig([t1])
    expect(h.status).toBe(200)
    p = await painel()
    expect(p.get('T1')).toMatchObject({ situacao: 'ativo' })
    expect(p.get('T1')!.ultimaHigienizacao).toBeTruthy()
    const op = (await c.master.get(`/api/operacoes/${h.corpo.operacaoId}`)).corpo
    expect(op).toMatchObject({ tipo: 'higienizacao', dados: { produto: 'Ácido peracético' } })

    // O estorno volta à situação de antes.
    expect(
      (await c.master.post(`/api/operacoes/${h.corpo.operacaoId}/estorno`, { motivo: 'Errado' }))
        .status,
    ).toBe(200)
    expect((await painel()).get('T1')!.situacao).toBe('aguardando_higienizacao')

    // Parâmetro desligado: esvaziar não muda a situação.
    await c.master.put('/api/parametros/higienizar_ao_esvaziar', { ativo: false })
    const perda = await c.master.post('/api/operacoes/perda', {
      executadoEm: antes(10),
      itens: [{ recipienteId: t2, esvaziar: true, motivo: 'descarte' }],
    })
    expect(perda.status).toBe(200)
    expect((await painel()).get('T2')).toMatchObject({ situacao: 'ativo', volume: '0.00' })
  })
})
