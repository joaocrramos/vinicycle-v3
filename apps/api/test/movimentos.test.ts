// Trasfega e perda (cantina.md, Trasfega e corte; Regras comuns: esvaziar origem): várias origens e
// destinos, borra, mistura com outro lote, sugestão de corte e perda com motivo.
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

async function cenario() {
  const c = await cantina(t)
  await c.master.put('/api/cantina/rendimentos', {
    itens: [{ variedadeId: null, litrosPorKg: '0.7000' }],
  })
  /** Desengace de uma variedade num recipiente vazio, em lote novo: 0,7 L/kg. */
  const mosto = async (
    variedadeId: string,
    kg: string,
    recipienteId: string,
    projetoId: string = c.projeto,
  ) => {
    const [item] = await c.romaneio([[variedadeId, kg]], null, projetoId)
    const r = await c.master.post('/api/operacoes/desengace', {
      executadoEm: agora(),
      projetoId,
      consumos: [{ itemId: item, kg }],
      destinos: [{ recipienteId, lote: { novo: 'A' } }],
    })
    expect(r.status).toBe(200)
    return (await c.master.get(`/api/recipientes/${recipienteId}/conteudo`)).corpo.lote.id as string
  }
  const conteudo = async (id: string) =>
    (await c.master.get(`/api/recipientes/${id}/conteudo`)).corpo as {
      volume: string
      lote: { id: string; codigo: string } | null
      composicao: { componentes: Array<{ variedadeId: string; fracao: number }> }
    }
  const fracao = async (id: string, variedadeId: string) =>
    (await conteudo(id)).composicao.componentes
      .filter((x) => x.variedadeId === variedadeId)
      .reduce((s, x) => s + x.fracao, 0)
  return { ...c, mosto, conteudo, fracao }
}

describe('trasfega', () => {
  it('esvaziar a origem lança a sobra como borra; o lote e a composição viajam', async () => {
    const c = await cenario()
    const t1 = await c.recipiente('T1', '5000.00')
    const t2 = await c.recipiente('T2', '5000.00')
    const loteA = await c.mosto(c.malbec, '1000', t1)
    const corpo = {
      executadoEm: agora(),
      metodo: 'bomba',
      origens: [{ recipienteId: t1, esvaziar: true }],
      destinos: [{ recipienteId: t2, litros: '650' }],
    }
    const previa = (await c.master.post('/api/operacoes/trasfega/previa', corpo)).corpo
    expect(previa.bloqueios).toEqual([])
    const r = await c.master.post('/api/operacoes/trasfega', corpo)
    expect(r.status).toBe(200)
    expect((await c.conteudo(t1)).volume).toBe('0.00')
    expect(await c.conteudo(t2)).toMatchObject({ volume: '650.00', lote: { id: loteA } })
    expect(await c.fracao(t2, c.malbec)).toBe(1)
    const op = (await c.master.get(`/api/operacoes/${r.corpo.operacaoId}`)).corpo
    expect(op.dados).toMatchObject({ metodo: 'bomba', borra: '50.00' })
    expect(
      op.movimentos.map((m: { recipiente: string; tipo: string; litros: string }) =>
        [m.recipiente, m.tipo, m.litros].join(' '),
      ),
    ).toEqual(
      expect.arrayContaining([
        'T1 saida_trasfega -650.00',
        'T1 perda -50.00',
        'T2 entrada_trasfega 650.00',
      ]),
    )
    expect(op.genealogia).toEqual([])

    // O estorno devolve tudo à origem, borra inclusive.
    const e = await c.master.post(`/api/operacoes/${r.corpo.operacaoId}/estorno`, {
      motivo: 'Tanque errado',
    })
    expect(e.status).toBe(200)
    expect(await c.conteudo(t1)).toMatchObject({ volume: '700.00', lote: { id: loteA } })
    expect(await c.fracao(t1, c.malbec)).toBe(1)
    expect((await c.conteudo(t2)).volume).toBe('0.00')
  })

  it('um tanque enche duas barricas e as barricas voltam juntas para outro tanque', async () => {
    const c = await cenario()
    const t1 = await c.recipiente('T1', '5000.00')
    const b1 = await c.recipiente('B1', '225.00')
    const b2 = await c.recipiente('B2', '225.00')
    const t3 = await c.recipiente('T3', '1000.00')
    const loteA = await c.mosto(c.malbec, '1000', t1)
    const ida = await c.master.post('/api/operacoes/trasfega', {
      executadoEm: agora(),
      origens: [{ recipienteId: t1 }],
      destinos: [
        { recipienteId: b1, litros: '225' },
        { recipienteId: b2, litros: '220' },
      ],
    })
    expect(ida.status).toBe(200)
    expect((await c.conteudo(t1)).volume).toBe('255.00')
    // Mais de uma origem sem litros nem "esvaziar": pede quanto saiu de cada uma.
    const semLitros = await c.master.post('/api/operacoes/trasfega/previa', {
      executadoEm: agora(),
      origens: [{ recipienteId: b1 }, { recipienteId: b2 }],
      destinos: [{ recipienteId: t3, litros: '445' }],
    })
    expect(semLitros.corpo.codigo).toBe('litros')
    // Os totais precisam fechar.
    const naoFecha = await c.master.post('/api/operacoes/trasfega/previa', {
      executadoEm: agora(),
      origens: [
        { recipienteId: b1, esvaziar: true },
        { recipienteId: b2, esvaziar: true },
      ],
      destinos: [{ recipienteId: t3, litros: '440' }],
    })
    expect(naoFecha.corpo.codigo).toBe('litros')
    const volta = await c.master.post('/api/operacoes/trasfega', {
      executadoEm: agora(),
      origens: [
        { recipienteId: b1, esvaziar: true },
        { recipienteId: b2, litros: '215', esvaziar: true },
      ],
      destinos: [{ recipienteId: t3, litros: '440' }],
    })
    expect(volta.status).toBe(200)
    expect(await c.conteudo(t3)).toMatchObject({ volume: '440.00', lote: { id: loteA } })
    expect((await c.conteudo(b2)).volume).toBe('0.00')
    // Origens com lotes diferentes: é corte.
    const t4 = await c.recipiente('T4', '5000.00')
    await c.mosto(c.cabernet, '500', t4)
    const lotes = await c.master.post('/api/operacoes/trasfega/previa', {
      executadoEm: agora(),
      origens: [
        { recipienteId: t3, litros: '100' },
        { recipienteId: t4, litros: '100' },
      ],
      destinos: [{ recipienteId: t1, litros: '200' }],
    })
    expect(lotes.corpo.codigo).toBe('origens')
  })

  it('destino com outro lote: incorporar ou lote novo, com sugestão de corte', async () => {
    const c = await cenario()
    const t1 = await c.recipiente('T1', '5000.00')
    const t2 = await c.recipiente('T2', '5000.00')
    const t3 = await c.recipiente('T3', '5000.00')
    const loteA = await c.mosto(c.malbec, '1000', t1)
    const loteB = await c.mosto(c.cabernet, '500', t2)
    const base = {
      executadoEm: agora(),
      origens: [{ recipienteId: t1, litros: '350' }],
    }
    // Sem escolher, o vinho ficaria em dois lotes no T2.
    const sem = await c.master.post('/api/operacoes/trasfega/previa', {
      ...base,
      destinos: [{ recipienteId: t2, litros: '350' }],
    })
    expect(sem.corpo.codigo).toBe('mistura')
    const incorporar = {
      ...base,
      destinos: [{ recipienteId: t2, litros: '350', lote: { id: loteB } }],
    }
    const previa = (await c.master.post('/api/operacoes/trasfega/previa', incorporar)).corpo
    expect(previa.avisos).toMatchObject([{ codigo: `corte:${t2}` }])
    const r = await c.master.post('/api/operacoes/trasfega', { ...incorporar, eCorte: true })
    expect(r.status).toBe(200)
    expect(await c.conteudo(t2)).toMatchObject({ volume: '700.00', lote: { id: loteB } })
    expect(await c.fracao(t2, c.malbec)).toBeCloseTo(0.5, 6)
    const op = (await c.master.get(`/api/operacoes/${r.corpo.operacaoId}`)).corpo
    expect(op.eCorte).toBe(true)
    expect(op.genealogia).toMatchObject([{ litros: '350.00', tipo: 'incorporacao' }])
    expect((await c.master.get(`/api/lotes/${loteA}`)).corpo.volume).toBe('350.00')

    // Lote novo: o que estava no T3 e o que chega formam um lote só.
    const novo = await c.master.post('/api/operacoes/trasfega', {
      executadoEm: agora(),
      origens: [{ recipienteId: t2, litros: '300' }],
      destinos: [{ recipienteId: t3, litros: '300', lote: { novo: 'A' } }],
    })
    expect(novo.status).toBe(200)
    const t3c = await c.conteudo(t3)
    expect(t3c.lote!.id).not.toBe(loteB)
    expect(t3c.volume).toBe('300.00')
    expect(await c.fracao(t3, c.malbec)).toBeCloseTo(0.5, 6)
  })
})

describe('corte', () => {
  it('lote novo no mesmo projeto: composição, genealogia de corte e o que o rótulo declara', async () => {
    const c = await cenario()
    const t1 = await c.recipiente('T1', '5000.00')
    const t2 = await c.recipiente('T2', '5000.00')
    const t3 = await c.recipiente('T3', '5000.00')
    const loteA = await c.mosto(c.malbec, '1000', t1)
    const loteB = await c.mosto(c.cabernet, '500', t2)
    const corpo = {
      executadoEm: agora(),
      origens: [
        { recipienteId: t1, litros: '400' },
        { recipienteId: t2, litros: '100' },
      ],
      destinos: [{ recipienteId: t3, litros: '500', lote: { novo: 'A' } }],
    }
    const previa = (await c.master.post('/api/operacoes/corte/previa', corpo)).corpo
    expect(previa.bloqueios).toEqual([])
    expect(previa.rotulos).toHaveLength(1)
    const varietal = previa.rotulos[0].rotulo.varietal[0]
    expect(varietal.variedades).toMatchObject([
      { nome: 'Malbec', percentual: 80, pode: true },
      { nome: 'Cabernet Sauvignon', percentual: 20, pode: false },
    ])
    const r = await c.master.post('/api/operacoes/corte', corpo)
    expect(r.status).toBe(200)
    const novo = (await c.conteudo(t3)).lote!.id
    expect(await c.fracao(t3, c.malbec)).toBeCloseTo(0.8, 6)
    const op = (await c.master.get(`/api/operacoes/${r.corpo.operacaoId}`)).corpo
    expect(op).toMatchObject({ tipo: 'corte', eCorte: true, projetoId: c.projeto })
    expect(
      op.genealogia.map((g: { litros: string; tipo: string }) => `${g.tipo} ${g.litros}`).sort(),
    ).toEqual(['corte 100.00', 'corte 400.00'])
    const ficha = (await c.master.get(`/api/lotes/${novo}`)).corpo
    expect(ficha.genealogia.map((g: { loteId: string }) => g.loteId).sort()).toEqual(
      [loteA, loteB].sort(),
    )
  })

  it('entre projetos: lote novo forma projeto novo e encerra os de origem; o estorno desfaz', async () => {
    const c = await cenario()
    const p2 = (
      await c.master.post('/api/projetos', { nome: 'Cabernet 2026', safraPrevista: 2026 })
    ).corpo.id as string
    const t1 = await c.recipiente('T1', '5000.00')
    const t2 = await c.recipiente('T2', '5000.00')
    const t3 = await c.recipiente('T3', '5000.00')
    await c.mosto(c.malbec, '1000', t1)
    await c.mosto(c.cabernet, '500', t2, p2)
    const corpo = {
      executadoEm: agora(),
      origens: [
        { recipienteId: t1, esvaziar: true },
        { recipienteId: t2, esvaziar: true },
      ],
      destinos: [{ recipienteId: t3, litros: '1050', lote: { novo: 'A' } }],
    }
    const semNome = await c.master.post('/api/operacoes/corte/previa', corpo)
    expect(semNome.corpo.codigo).toBe('projeto_novo')
    // A trasfega não forma projeto novo: pede o corte.
    const trasfega = await c.master.post('/api/operacoes/trasfega/previa', {
      executadoEm: agora(),
      origens: [{ recipienteId: t1, litros: '100' }],
      destinos: [{ recipienteId: t2, litros: '100', lote: { novo: 'A' } }],
    })
    expect(trasfega.corpo.codigo).toBe('projetos')

    const r = await c.master.post('/api/operacoes/corte', {
      ...corpo,
      projetoNovo: { nome: 'Corte tinto 2026' },
    })
    expect(r.status).toBe(200)
    const op = (await c.master.get(`/api/operacoes/${r.corpo.operacaoId}`)).corpo
    const novo = (await c.master.get(`/api/projetos/${op.projetoId}`)).corpo
    expect(novo).toMatchObject({
      nome: 'Corte tinto 2026',
      situacao: 'em_producao',
      projetoOrigemId: c.projeto,
      safraPrevista: 2026,
    })
    expect(novo.codigo).toMatch(/^PRJ-2026-/)
    for (const p of [c.projeto, p2]) {
      expect((await c.master.get(`/api/projetos/${p}`)).corpo).toMatchObject({
        situacao: 'encerrado',
        incorporadoAoProjetoId: op.projetoId,
      })
    }

    const e = await c.master.post(`/api/operacoes/${r.corpo.operacaoId}/estorno`, {
      motivo: 'Proporção errada',
    })
    expect(e.status).toBe(200)
    for (const p of [c.projeto, p2]) {
      expect((await c.master.get(`/api/projetos/${p}`)).corpo).toMatchObject({
        situacao: 'em_producao',
        incorporadoAoProjetoId: null,
      })
    }
    expect((await c.master.get(`/api/projetos/${op.projetoId}`)).corpo.situacao).toBe('cancelado')
    expect((await c.conteudo(t1)).volume).toBe('700.00')
  })

  it('incorporar vinho de outro projeto mantém o projeto do destino', async () => {
    const c = await cenario()
    const p2 = (
      await c.master.post('/api/projetos', { nome: 'Cabernet 2026', safraPrevista: 2026 })
    ).corpo.id as string
    const t1 = await c.recipiente('T1', '5000.00')
    const t2 = await c.recipiente('T2', '5000.00')
    await c.mosto(c.malbec, '100', t1, p2)
    const loteB = await c.mosto(c.cabernet, '1000', t2)
    const r = await c.master.post('/api/operacoes/trasfega', {
      executadoEm: agora(),
      eCorte: true,
      origens: [{ recipienteId: t1, esvaziar: true }],
      destinos: [{ recipienteId: t2, litros: '70', lote: { id: loteB } }],
    })
    expect(r.status).toBe(200)
    expect((await c.conteudo(t2)).lote!.id).toBe(loteB)
    expect((await c.master.get(`/api/projetos/${p2}`)).corpo).toMatchObject({
      situacao: 'encerrado',
      incorporadoAoProjetoId: c.projeto,
    })
  })
})

describe('atesto', () => {
  it('uma origem completa várias barricas, com a evaporação de cada uma; relatório', async () => {
    const c = await cenario()
    const t1 = await c.recipiente('T1', '5000.00')
    const t2 = await c.recipiente('T2', '5000.00')
    const b1 = await c.recipiente('B1', '225.00', 'Barrica')
    const b2 = await c.recipiente('B2', '225.00', 'Barrica')
    const loteA = await c.mosto(c.malbec, '1000', t1)
    await c.mosto(c.cabernet, '100', t2)
    await c.master.post('/api/operacoes/trasfega', {
      executadoEm: agora(),
      origens: [{ recipienteId: t1 }],
      destinos: [
        { recipienteId: b1, litros: '225' },
        { recipienteId: b2, litros: '225' },
      ],
    })
    // Sem evaporação, a barrica passaria da capacidade.
    const cheia = await c.master.post('/api/operacoes/atesto/previa', {
      executadoEm: agora(),
      origens: [{ recipienteId: t1 }],
      destinos: [{ recipienteId: b1, litros: '2', evaporacao: '0' }],
    })
    expect(cheia.corpo.bloqueios[0]).toMatch(/capacidade/)
    const corpo = {
      executadoEm: agora(),
      origens: [{ recipienteId: t1 }],
      destinos: [
        { recipienteId: b1, litros: '2' },
        { recipienteId: b2, litros: '3' },
      ],
    }
    const previa = (await c.master.post('/api/operacoes/atesto/previa', corpo)).corpo
    expect(previa.bloqueios).toEqual([])
    expect(previa.perdas).toMatchObject([
      { recipiente: 'B1', litros: '2.00', motivo: 'evaporacao' },
      { recipiente: 'B2', litros: '3.00', motivo: 'evaporacao' },
    ])
    const r = await c.master.post('/api/operacoes/atesto', corpo)
    expect(r.status).toBe(200)
    expect((await c.conteudo(b1)).volume).toBe('225.00')
    expect((await c.conteudo(t1)).volume).toBe('245.00')
    const op = (await c.master.get(`/api/operacoes/${r.corpo.operacaoId}`)).corpo
    expect(op.dados).toMatchObject({ evaporacao: '5.00' })

    // Atesto com outro lote: incorpora ao lote da barrica.
    const outro = await c.master.post('/api/operacoes/atesto', {
      executadoEm: agora(),
      origens: [{ recipienteId: t2 }],
      destinos: [{ recipienteId: b1, litros: '1' }],
    })
    expect(outro.status).toBe(200)
    expect((await c.conteudo(b1)).lote!.id).toBe(loteA)
    expect(await c.fracao(b1, c.cabernet)).toBeCloseTo(1 / 225, 6)

    const hoje = new Intl.DateTimeFormat('en-CA').format(new Date())
    const rel = (await c.master.get(`/api/relatorios/evaporacao?de=${hoje}&ate=${hoje}`)).corpo
    expect(rel).toMatchObject([
      { recipiente: 'B1', evaporacao: '3.00', atestos: 2, percentual: 1.33 },
      { recipiente: 'B2', evaporacao: '3.00', atestos: 1, percentual: 1.33 },
    ])
  })
})

describe('perda', () => {
  it('lança a perda com motivo; esvaziar leva todo o saldo', async () => {
    const c = await cenario()
    const t1 = await c.recipiente('T1', '5000.00')
    const t2 = await c.recipiente('T2', '5000.00')
    await c.mosto(c.malbec, '1000', t1)
    await c.mosto(c.cabernet, '100', t2)
    const invalido = await c.master.post('/api/operacoes/perda/previa', {
      executadoEm: agora(),
      itens: [{ recipienteId: t1, litros: '10', motivo: 'nao_existe' }],
    })
    expect(invalido.corpo.codigo).toBe('motivo_perda')
    const r = await c.master.post('/api/operacoes/perda', {
      executadoEm: agora(),
      itens: [
        { recipienteId: t1, litros: '12.5', motivo: 'vazamento' },
        { recipienteId: t2, esvaziar: true, motivo: 'descarte' },
      ],
    })
    expect(r.status).toBe(200)
    expect((await c.conteudo(t1)).volume).toBe('687.50')
    expect((await c.conteudo(t2)).volume).toBe('0.00')
    expect(await c.fracao(t1, c.malbec)).toBe(1)
    const muito = await c.master.post('/api/operacoes/perda/previa', {
      executadoEm: agora(),
      itens: [{ recipienteId: t1, litros: '700', motivo: 'vazamento' }],
    })
    expect(muito.corpo.bloqueios[0]).toMatch(/negativo/)
  })
})
