// Laboratório (cantina.md, Análises e Laboratório): análise interna e laudo, conversão de unidade,
// fora da faixa, limite físico, pedido de análise externa (coletada → enviada → laudo recebido),
// credenciamento do laboratório e exclusão.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fichaPj, montar } from './apoio'
import { cantina } from './cantina'

let t: Awaited<ReturnType<typeof montar>>
beforeAll(async () => {
  t = await montar()
})
afterAll(async () => {
  await t.fechar()
})

const antes = (min: number) => new Date(Date.now() - min * 60_000).toISOString()

describe('laboratório', () => {
  it('análises, faixa, conversão, pedido de laudo e credenciamento', async () => {
    const c = await cantina(t)
    await c.master.put('/api/cantina/rendimentos', {
      itens: [{ variedadeId: null, litrosPorKg: '0.7000' }],
    })
    const t1 = await c.recipiente('T1', '5000.00')
    const [item] = await c.romaneio([[c.malbec, '1000']])
    await c.master.post('/api/operacoes/desengace', {
      executadoEm: antes(600),
      projetoId: c.projeto,
      consumos: [{ itemId: item, kg: '1000' }],
      destinos: [{ recipienteId: t1, lote: { novo: 'A' } }],
    })

    // A empresa mede pH e acidez total; faixa do pH de 3,2 a 3,7.
    const todos = (await c.master.get('/api/cantina/parametros-analise')).corpo as Array<{
      parametroId: string
      nome: string
    }>
    const id = (nome: string) => todos.find((p) => p.nome === nome)!.parametroId
    await c.master.put('/api/cantina/parametros-analise', {
      parametros: [
        { parametroId: id('pH'), ativo: true, minimo: '3.2', maximo: '3.7' },
        { parametroId: id('Acidez total'), ativo: true, unidadePreferida: 'g/L' },
      ],
    })
    const params = (await c.master.get('/api/laboratorio/parametros')).corpo as Array<{
      codigo: string
    }>
    expect(params.map((p) => p.codigo)).toEqual(['ph', 'acidez_total'])

    const interna = await c.master.post('/api/analises', {
      tipo: 'interna',
      amostraEm: antes(300),
      recipienteId: t1,
      resultados: [
        { parametroId: id('pH'), valor: '3.85', unidade: 'pH' },
        { parametroId: id('Acidez total'), valor: '6.0', unidade: 'g/L' },
      ],
    })
    expect(interna.status).toBe(200)
    expect(interna.corpo.foraFaixa).toBe(1)
    const lote = (await c.lote(t1)).id
    const [a] = (await c.master.get(`/api/analises?lote=${lote}`)).corpo
    expect(a.recipiente).toBe('T1')
    const acidez = a.resultados.find((r: { codigo: string }) => r.codigo === 'acidez_total')
    expect(acidez).toMatchObject({
      valor: '80.0000',
      valorDigitado: '6.0',
      unidadeDigitada: 'g/L',
    })
    expect(a.resultados.find((r: { codigo: string }) => r.codigo === 'ph').foraFaixa).toBe(true)

    // Valor impossível bloqueia; recipiente vazio na hora da amostra também.
    const ruim = await c.master.post('/api/analises', {
      tipo: 'interna',
      amostraEm: antes(200),
      recipienteId: t1,
      resultados: [{ parametroId: id('pH'), valor: '9', unidade: 'pH' }],
    })
    expect(ruim.corpo.codigo).toBe('valor_impossivel')
    const cedo = await c.master.post('/api/analises', {
      tipo: 'interna',
      amostraEm: antes(900),
      recipienteId: t1,
      resultados: [{ parametroId: id('pH'), valor: '3.5', unidade: 'pH' }],
    })
    expect(cedo.corpo.codigo).toBe('vazio')

    // Pedido ao laboratório: sem credenciamento, aviso; prazo pelo prazo médio.
    const lab = await c.master.post('/api/pessoas', {
      ficha: fichaPj('Laboratório Enológico'),
      papeis: ['laboratorio'],
      laboratorio: { prazoMedioLaudoDias: 5 },
    })
    expect(lab.status).toBe(200)
    const pedido = await c.master.post('/api/amostras', {
      coletadaEm: antes(240),
      recipienteId: t1,
      laboratorioId: lab.corpo.id,
    })
    expect(pedido.status).toBe(200)
    expect(pedido.corpo.codigo).toMatch(/^AM-\d{4}-0001$/)
    expect(pedido.corpo.avisos[0]).toContain('não tem credenciamento')
    let [m] = (await c.master.get('/api/amostras')).corpo
    expect(m).toMatchObject({
      situacao: 'coletada',
      lote: (await c.lote(t1)).codigo,
      atrasada: false,
    })
    expect(m.prazo).toBeTruthy()
    expect(
      (await c.master.post(`/api/amostras/${m.id}/enviar`, { enviadaEm: antes(200) })).status,
    ).toBe(200)

    // O laudo fecha o pedido.
    const laudo = await c.master.post('/api/analises', {
      tipo: 'laudo',
      amostraEm: antes(240),
      recipienteId: t1,
      amostraId: m.id,
      documento: 'L-123',
      resultados: [{ parametroId: id('pH'), valor: '3.5', unidade: 'pH' }],
    })
    expect(laudo.status).toBe(200)
    expect((await c.master.get('/api/amostras')).corpo).toEqual([])
    ;[m] = (await c.master.get('/api/amostras?situacao=todas')).corpo
    expect(m).toMatchObject({ situacao: 'laudo_recebido', analiseId: laudo.corpo.id })
    const doLaudo = (await c.master.get(`/api/analises/${laudo.corpo.id}`)).corpo
    expect(doLaudo).toMatchObject({ laboratorio: 'Laboratório Enológico', amostra: m.codigo })

    // Excluir o laudo devolve o pedido a "enviada".
    expect(
      (await c.master.post(`/api/analises/${laudo.corpo.id}/excluir`, { motivo: 'Lançado errado' }))
        .status,
    ).toBe(200)
    expect((await c.master.get('/api/amostras')).corpo[0].situacao).toBe('enviada')
  })
})
