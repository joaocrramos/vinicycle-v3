// Projetos de vinho (cantina.md, Projeto de vinho): código, situações, plano e modelos de plano.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { montar } from './apoio'

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
  return r
}

const projeto = (nome: string, extra: object = {}) => ({ nome, safraPrevista: 2026, ...extra })

describe('projetos de vinho', () => {
  it('código PRJ pela safra, lista, ficha e edição', async () => {
    const { master } = await cantina()
    const grenache = (await master.get('/api/catalogos/variedade?tamanho=0&busca=grenache')).corpo
      .itens[0].id
    const classes = (await master.get('/api/referencia')).corpo.classesProduto as Array<{
      id: string
      codigo: string
    }>
    const a = await master.post(
      '/api/projetos',
      projeto('Grenache 2026', {
        cicloPrevisto: '01',
        variedades: [grenache],
        classeProdutoId: classes[0]!.id,
        cor: 'tinto',
        teorAcucar: 'seco',
      }),
    )
    expect(a.status).toBe(200)
    expect(a.corpo.codigo).toBe('PRJ-2026-001')
    expect((await master.post('/api/projetos', projeto('Rosé 2026'))).corpo.codigo).toBe(
      'PRJ-2026-002',
    )
    expect(
      (await master.post('/api/projetos', projeto('Tinto 2027', { safraPrevista: 2027 }))).corpo
        .codigo,
    ).toBe('PRJ-2027-001')
    const lista = await master.get('/api/projetos?safra=2026')
    expect(lista.corpo.total).toBe(2)
    expect(lista.corpo.itens[0]).toMatchObject({ situacao: 'planejado', volume: '0' })

    const ficha = await master.get(`/api/projetos/${a.corpo.id}`)
    expect(ficha.corpo).toMatchObject({
      nome: 'Grenache 2026',
      variedades: [{ id: grenache }],
      lotes: [],
    })
    expect(ficha.corpo.denominacao).toContain('Tinto')

    const ed = await master.put(`/api/projetos/${a.corpo.id}`, {
      ...projeto('Grenache Reserva 2026'),
      versao: ficha.corpo.versao,
    })
    expect(ed.status).toBe(200)
    const velho = await master.put(`/api/projetos/${a.corpo.id}`, {
      ...projeto('Outro'),
      versao: ficha.corpo.versao,
    })
    expect(velho.status).toBe(409)
    const ruim = await master.post(
      '/api/projetos',
      projeto('X', { variedades: ['00000000-0000-0000-0000-000000000000'] }),
    )
    expect(ruim.corpo.codigo).toBe('variedade')
  })

  it('situações manuais e cancelamento só sem movimento', async () => {
    const { master } = await cantina()
    const p = (await master.post('/api/projetos', projeto('Teste'))).corpo.id
    const mudar = (situacao: string, motivo?: string) =>
      master.post(`/api/projetos/${p}/situacao`, { situacao, motivo })
    expect((await mudar('pronto_envase')).corpo.codigo).toBe('situacao')
    expect((await mudar('cancelado')).corpo.codigo).toBe('motivo')
    expect((await mudar('cancelado', 'Uva não veio')).status).toBe(200)
    expect((await mudar('encerrado')).corpo.codigo).toBe('situacao')
    const aud = await master.get(`/api/historico/projeto/${p}`)
    expect(aud.corpo.map((x: { acao: string }) => x.acao)).toContain('situacao')
  })

  it('plano com insumo previsto e modelo aplicado pelo dia 0', async () => {
    const { master } = await cantina()
    const p = (await master.post('/api/projetos', projeto('Plano'))).corpo.id
    const tipos = (await master.get('/api/catalogos/tipo_insumo?tamanho=0')).corpo.itens as Array<{
      id: string
      nome: string
    }>
    const levedura = (
      await master.post('/api/itens-estoque', {
        tipo: 'insumo',
        nome: 'Levedura X',
        unidadeBase: 'g',
        insumo: { tipoInsumoId: tipos.find((x) => x.nome === 'Leveduras')!.id },
      })
    ).corpo.id
    const etapa = await master.post(`/api/projetos/${p}/plano`, {
      tipoOperacao: 'desengace',
      dataPrevista: '2026-02-10',
      insumos: [{ itemEstoqueId: levedura, dose: '20', unidade: 'g/hL' }],
    })
    expect(etapa.status).toBe(200)

    const modelo = await master.post('/api/modelos-plano', {
      nome: 'Tinto de guarda padrão',
      etapas: [
        { tipoOperacao: 'prensagem', diaRelativo: 7 },
        {
          tipoOperacao: 'trasfega',
          diaRelativo: 21,
          insumos: [{ itemEstoqueId: levedura, dose: '5', unidade: 'g/hL' }],
        },
      ],
    })
    expect(modelo.status).toBe(200)
    expect(
      (await master.post('/api/modelos-plano', { nome: 'tinto de guarda padrão', etapas: [] }))
        .corpo.codigo,
    ).toBe('nome_duplicado')
    const ap = await master.post(`/api/projetos/${p}/plano/modelo`, {
      modeloId: modelo.corpo.id,
      dataDia0: '2026-02-10',
    })
    expect(ap.corpo.etapas).toBe(2)
    const plano = (await master.get(`/api/projetos/${p}`)).corpo.plano as Array<{
      tipoOperacao: string
      dataPrevista: string
      insumos: unknown[]
    }>
    expect(plano.map((e) => [e.tipoOperacao, e.dataPrevista, e.insumos.length])).toEqual([
      ['desengace', '2026-02-10', 1],
      ['prensagem', '2026-02-17', 0],
      ['trasfega', '2026-03-03', 1],
    ])
    const exc = await master.post(`/api/projetos/${p}/plano/${etapa.corpo.id}/excluir`)
    expect(exc.status).toBe(200)
    expect((await master.get(`/api/projetos/${p}`)).corpo.plano).toHaveLength(2)
  })
})
