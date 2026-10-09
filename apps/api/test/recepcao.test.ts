// Recepção da uva (cantina.md, Recepção): rascunho, pesagens, confirmação com código, alerta do
// SIVIBE com ciente e uva a processar.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fichaPj, montar } from './apoio'

let t: Awaited<ReturnType<typeof montar>>
beforeAll(async () => {
  t = await montar()
})
afterAll(async () => {
  await t.fechar()
})

async function cantina() {
  const r = await t.empresaComMaster()
  const estab = await t.criarEstabelecimento(r.master)
  await r.master.post('/api/auth/contexto', { estabelecimentoId: estab })
  const projeto = (
    await r.master.post('/api/projetos', { nome: 'Syrah 2026', safraPrevista: 2026 })
  ).corpo.id as string
  const syrah = (
    await r.master.get('/api/catalogos/variedade?tamanho=0&busca=malbec')
  ).corpo.itens.find((v: { nome: string }) => v.nome === 'Malbec').id as string
  const grenache = (await r.master.get('/api/catalogos/variedade?tamanho=0&busca=grenache')).corpo
    .itens[0].id as string
  return { ...r, projeto, syrah, grenache }
}

const pesagem = (bruto: string, tara: string) => ({
  pesadoEm: '2026-02-10T09:00:00-03:00',
  brutoKg: bruto,
  taraKg: tara,
})

describe('recepção da uva', () => {
  it('rascunho, confirmação com código e ciente do SIVIBE', async () => {
    const c = await cantina()
    const fornecedor = await c.master.post('/api/pessoas', {
      ficha: fichaPj('Viticultor Sem Cadastro'),
      papeis: ['produtor_uva'],
    })
    const base = {
      chegadaEm: '2026-02-10T08:30:00-03:00',
      projetoId: c.projeto,
      origem: 'fornecedor',
      fornecedorId: fornecedor.corpo.id,
      nfNumero: '1234',
      itens: [
        {
          variedadeId: c.syrah,
          dataColheita: '2026-02-09',
          pesagens: [pesagem('3500', '1500'), pesagem('2800', '1300')],
        },
        { variedadeId: c.grenache, dataColheita: '2026-02-09', brix: '22.80', pesagens: [] },
      ],
    }
    const r = await c.master.post('/api/romaneios', base)
    expect(r.status).toBe(200)
    const lista = await c.master.get('/api/romaneios')
    expect(lista.corpo.itens[0]).toMatchObject({
      codigo: null,
      situacao: 'rascunho',
      kg: '3500.0',
    })

    const previa = (await c.master.get(`/api/romaneios/${r.corpo.id}/previa`)).corpo
    expect(previa.bloqueios).toEqual([
      'Informe o °Brix de Malbec.',
      'Inclua a pesagem de Grenache.',
    ])
    expect(previa.avisos[0].mensagem).toMatch(/sem número no SIVIBE/)
    expect(previa.avisos[0].fonte).toBe('Decreto 12.709/2025, art. 203, V')

    const ficha = (await c.master.get(`/api/romaneios/${r.corpo.id}`)).corpo
    const ed = await c.master.put(`/api/romaneios/${r.corpo.id}`, {
      ...base,
      versao: ficha.versao,
      itens: [
        { ...base.itens[0], brix: '23.50' },
        { ...base.itens[1], pesagens: [pesagem('1800', '800')] },
      ],
    })
    expect(ed.status).toBe(200)

    const sem = await c.master.post(`/api/romaneios/${r.corpo.id}/confirmar`, {})
    expect(sem.corpo.codigo).toBe('ciente_pendente')
    const ok = await c.master.post(`/api/romaneios/${r.corpo.id}/confirmar`, {
      cientes: [sem.corpo.detalhes.avisos[0].codigo],
    })
    expect(ok.corpo).toEqual({ codigo: 'ROM-2026-0001' })
    expect((await c.master.get(`/api/projetos/${c.projeto}`)).corpo.situacao).toBe('em_producao')
    expect((await c.master.put(`/api/romaneios/${r.corpo.id}`, base)).corpo.codigo).toBe(
      'confirmado',
    )

    const uva = (await c.master.get('/api/romaneios/uva-a-processar')).corpo
    expect(
      uva.map((u: { variedade: string; saldoKg: string; safra: number }) => [
        u.variedade,
        u.saldoKg,
        u.safra,
      ]),
    ).toEqual([
      ['Malbec', '3500.0', 2026],
      ['Grenache', '1000.0', 2026],
    ])
    const hist = (await c.master.get(`/api/historico/romaneio/${r.corpo.id}`)).corpo
    expect(hist.map((h: { acao: string }) => h.acao)).toContain('confirmar')
  })

  it('produtor regular não gera aviso; parcela de outro dono e rascunho descartado', async () => {
    const c = await cantina()
    const regular = await c.master.post('/api/pessoas', {
      ficha: fichaPj('Viticultor Regular'),
      papeis: ['produtor_uva'],
      produtorUva: {
        numeroSivibe: '987654',
        situacaoCadastro: 'regular',
        declaracaoAnoAnterior: true,
      },
    })
    const propria = await c.master.post('/api/propriedades', {
      nome: 'Fazenda Própria',
      parcelas: [{ nome: 'P1', variedadeId: c.syrah }],
    })
    const parcela = (await c.master.get(`/api/propriedades/${propria.corpo.id}`)).corpo.parcelas[0]
      .id
    const base = {
      chegadaEm: '2026-02-11T08:30:00-03:00',
      projetoId: c.projeto,
      origem: 'fornecedor',
      fornecedorId: regular.corpo.id,
      itens: [
        {
          variedadeId: c.syrah,
          parcelaId: parcela,
          dataColheita: '2026-02-11',
          brix: '23',
          pesagens: [pesagem('2000', '1000')],
        },
      ],
    }
    expect((await c.master.post('/api/romaneios', base)).corpo.codigo).toBe('parcela')
    const r = await c.master.post('/api/romaneios', {
      ...base,
      itens: [{ ...base.itens[0], parcelaId: null }],
    })
    expect((await c.master.get(`/api/romaneios/${r.corpo.id}/previa`)).corpo).toEqual({
      bloqueios: [],
      avisos: [],
    })
    const proprio = await c.master.post('/api/romaneios', {
      ...base,
      origem: 'vinhedo_proprio',
      fornecedorId: null,
    })
    expect(proprio.status).toBe(200)
    expect((await c.master.post(`/api/romaneios/${proprio.corpo.id}/descartar`)).status).toBe(200)
    expect((await c.master.get(`/api/romaneios/${proprio.corpo.id}`)).status).toBe(404)
  })
})
