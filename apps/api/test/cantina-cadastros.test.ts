// Cadastros da cantina: recipientes, insumos e embalagens, marcas, produtos e parâmetros técnicos.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { montar } from './apoio'

let t: Awaited<ReturnType<typeof montar>>
beforeAll(async () => {
  t = await montar()
})
afterAll(async () => {
  await t.fechar()
})

async function empresa() {
  const r = await t.empresaComMaster()
  const estab = await t.criarEstabelecimento(r.master)
  await r.master.post('/api/auth/contexto', { estabelecimentoId: estab })
  const adega = await r.master.post('/api/locais', { nome: 'Adega', uso: 'recipientes' })
  const almox = await r.master.post('/api/locais', {
    nome: 'Almoxarifado',
    uso: 'estoque',
    moduloEstoque: 'ENOTRACE',
  })
  const tipos = (await r.master.get('/api/catalogos/tipo_recipiente?tamanho=0')).corpo
    .itens as Array<{ id: string; nome: string }>
  const tipo = (nome: string) => tipos.find((x) => x.nome === nome)!.id
  return { ...r, estab, adega: adega.corpo.id as string, almox: almox.corpo.id as string, tipo }
}

describe('recipientes', () => {
  it('cadastro, código único, local de recipientes e campos de barrica', async () => {
    const { master, adega, almox, tipo } = await empresa()
    const base = {
      tipoRecipienteId: tipo('Tanque de inox'),
      capacidadeLitros: '5000.00',
      localId: adega,
      material: 'inox',
    }
    for (const codigo of ['T10', 'T2', 'T1'])
      expect((await master.post('/api/recipientes', { ...base, codigo })).status).toBe(200)
    expect((await master.post('/api/recipientes', { ...base, codigo: 't1' })).corpo.codigo).toBe(
      'codigo_duplicado',
    )
    expect(
      (await master.post('/api/recipientes', { ...base, codigo: 'T9', localId: almox })).corpo
        .codigo,
    ).toBe('local')
    expect(
      (await master.post('/api/recipientes', { ...base, codigo: 'T8', capacidadeLitros: '0' }))
        .status,
    ).toBe(400)
    const lista = await master.get('/api/recipientes')
    expect(lista.corpo.itens.map((r: { codigo: string }) => r.codigo)).toEqual(['T1', 'T2', 'T10'])
    // Tanoaria só vale para barrica.
    const inox = await master.post('/api/recipientes', {
      ...base,
      codigo: 'T3',
      tanoaria: 'Seguin Moreau',
    })
    expect((await master.get(`/api/recipientes/${inox.corpo.id}`)).corpo.tanoaria).toBeNull()
    const barrica = await master.post('/api/recipientes', {
      ...base,
      codigo: 'B1',
      tipoRecipienteId: tipo('Barrica'),
      capacidadeLitros: '225.00',
      tanoaria: 'Seguin Moreau',
      origemMadeira: 'carvalho_frances',
      tosta: 'media',
      anoPrimeiroUso: 2024,
    })
    expect((await master.get(`/api/recipientes/${barrica.corpo.id}`)).corpo).toMatchObject({
      tanoaria: 'Seguin Moreau',
      anoPrimeiroUso: 2024,
    })
  })

  it('situação com motivo; inativo sai da lista padrão', async () => {
    const { master, adega, tipo } = await empresa()
    const r = await master.post('/api/recipientes', {
      codigo: 'T1',
      tipoRecipienteId: tipo('Tanque de inox'),
      capacidadeLitros: '1000',
      localId: adega,
    })
    expect(
      (await master.post(`/api/recipientes/${r.corpo.id}/situacao`, { situacao: 'manutencao' }))
        .corpo.codigo,
    ).toBe('motivo')
    expect(
      (
        await master.post(`/api/recipientes/${r.corpo.id}/situacao`, {
          situacao: 'manutencao',
          motivo: 'Troca da válvula',
        })
      ).status,
    ).toBe(200)
    expect((await master.get('/api/recipientes')).corpo.itens[0].situacao).toBe('manutencao')
    await master.post(`/api/recipientes/${r.corpo.id}/situacao`, {
      situacao: 'inativo',
      motivo: 'Vendido',
    })
    expect((await master.get('/api/recipientes')).corpo.total).toBe(0)
    expect((await master.get('/api/recipientes?situacao=todos')).corpo.total).toBe(1)
    const hist = await master.get(`/api/historico/recipiente/${r.corpo.id}`)
    expect(hist.corpo.map((h: { acao: string }) => h.acao)).toEqual([
      'situacao',
      'situacao',
      'criar',
    ])
  })
})

describe('insumos e embalagens', () => {
  it('unidade e fabricante conferidos; tipo do item não muda', async () => {
    const { master } = await empresa()
    const tipos = (await master.get('/api/catalogos/tipo_insumo?tamanho=0')).corpo.itens as Array<{
      id: string
      nome: string
    }>
    const levedura = tipos.find((x) => x.nome === 'Leveduras')!.id
    const naoFab = await master.post('/api/pessoas', {
      ficha: { tipoPessoa: 'fisica', nome: 'Zé', documento: '52998224725' },
      papeis: ['cliente'],
    })
    const insumo = (extra: object) => ({
      tipo: 'insumo',
      nome: 'Levedura EC1118',
      unidadeBase: 'g',
      insumo: { tipoInsumoId: levedura, ...extra },
    })
    expect(
      (await master.post('/api/itens-estoque', { ...insumo({}), unidadeBase: 'L' })).corpo.codigo,
    ).toBe('unidade')
    expect(
      (await master.post('/api/itens-estoque', insumo({ fabricanteId: naoFab.corpo.id }))).corpo
        .codigo,
    ).toBe('fabricante')
    const ok = await master.post(
      '/api/itens-estoque',
      insumo({ apresentacao: 'po', marca: 'Lalvin' }),
    )
    expect(ok.status).toBe(200)
    const garrafa = await master.post('/api/itens-estoque', {
      tipo: 'embalagem',
      nome: 'Garrafa Bordalesa 750 mL',
      unidadeBase: 'un',
      estoqueMinimo: '500',
    })
    expect(garrafa.status).toBe(200)
    const atual = await master.get(`/api/itens-estoque/${ok.corpo.id}`)
    expect(
      (await master.put(`/api/itens-estoque/${ok.corpo.id}`, { ...atual.corpo, tipo: 'embalagem' }))
        .corpo.codigo,
    ).toBe('tipo_item')
    expect((await master.get('/api/itens-estoque?tipo=insumo')).corpo.itens[0]).toMatchObject({
      nome: 'Levedura EC1118',
      tipoInsumo: 'Leveduras',
      marca: 'Lalvin',
    })
  })
})

describe('marcas e produtos', () => {
  it('espumante exige método; formato vira produto acabado; ficha de embalagem só com materiais', async () => {
    const { master } = await empresa()
    const marca = await master.post('/api/marcas', { nome: 'Sertão' })
    const ref = await master.get('/api/referencia')
    const classe = (codigo: string) =>
      ref.corpo.classesProduto.find((c: { codigo: string }) => c.codigo === codigo).id
    const sem = await master.post('/api/produtos', {
      nome: 'Espumante Brut',
      marcaId: marca.corpo.id,
      classeProdutoId: classe('espumante_natural'),
      cor: 'branco',
      teorAcucar: 'brut',
    })
    expect(sem.corpo.codigo).toBe('metodo_espumante')
    const corInvalida = await master.post('/api/produtos', {
      nome: 'X',
      marcaId: marca.corpo.id,
      classeProdutoId: classe('vinho_fino'),
      cor: 'azul',
    })
    expect(corInvalida.corpo.codigo).toBe('cor_vinho')
    const p = await master.post('/api/produtos', {
      nome: 'Espumante Brut',
      marcaId: marca.corpo.id,
      classeProdutoId: classe('espumante_natural'),
      cor: 'branco',
      teorAcucar: 'brut',
      metodoEspumante: 'tradicional',
    })
    expect(p.status).toBe(200)
    expect(
      (
        await master.post(`/api/produtos/${p.corpo.id}/rotulos`, {
          versao: '2026',
          teorAlcoolico: '12.0',
          vigenteDesde: '2026-01-01',
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await master.post(`/api/produtos/${p.corpo.id}/rotulos`, {
          versao: '2026',
          teorAlcoolico: '12.5',
          vigenteDesde: '2026-02-01',
        })
      ).status,
    ).toBe(422)
    const f750 = await master.post(`/api/produtos/${p.corpo.id}/formatos`, { volumeMl: 750 })
    await master.post(`/api/produtos/${p.corpo.id}/formatos`, { volumeMl: 1500 })
    expect(
      (await master.post(`/api/produtos/${p.corpo.id}/formatos`, { volumeMl: 750 })).status,
    ).toBe(422)
    const acabados = await master.get('/api/itens-estoque?tipo=produto_acabado')
    expect(acabados.corpo.itens.map((i: { nome: string }) => i.nome)).toEqual([
      'Espumante Brut 1,5 L',
      'Espumante Brut 750 mL',
    ])
    const garrafa = await master.post('/api/itens-estoque', {
      tipo: 'embalagem',
      nome: 'Garrafa espumante',
      unidadeBase: 'un',
    })
    const caixa = await master.post('/api/itens-estoque', {
      tipo: 'embalagem',
      nome: 'Caixa com 6',
      unidadeBase: 'un',
    })
    const ficha = await master.put(`/api/produtos/${p.corpo.id}/formatos/${f750.corpo.id}/ficha`, {
      itens: [
        { itemEstoqueId: garrafa.corpo.id, quantidade: '1' },
        { itemEstoqueId: caixa.corpo.id, quantidade: '0.1667' },
      ],
    })
    expect(ficha.status).toBe(200)
    const acabado = acabados.corpo.itens[0].id
    expect(
      (
        await master.put(`/api/produtos/${p.corpo.id}/formatos/${f750.corpo.id}/ficha`, {
          itens: [{ itemEstoqueId: acabado, quantidade: '1' }],
        })
      ).corpo.codigo,
    ).toBe('item')
    const det = await master.get(`/api/produtos/${p.corpo.id}`)
    expect(det.corpo.denominacao).toBe('Espumante natural Branco Brut')
    expect(det.corpo.formatos[0].ficha.map((x: { item: string }) => x.item)).toEqual([
      'Caixa com 6',
      'Garrafa espumante',
    ])
    // Renomear o produto renomeia os itens de estoque dos formatos.
    await master.put(`/api/produtos/${p.corpo.id}`, {
      ...det.corpo,
      nome: 'Espumante Nature',
      teorAcucar: 'nature',
      versao: det.corpo.versao,
    })
    const depois = await master.get('/api/itens-estoque?tipo=produto_acabado')
    expect(depois.corpo.itens.map((i: { nome: string }) => i.nome)).toEqual([
      'Espumante Nature 1,5 L',
      'Espumante Nature 750 mL',
    ])
  })

  it('dono da marca é a própria empresa ou um cliente de vinificação', async () => {
    const { master } = await empresa()
    const fornecedor = await master.post('/api/pessoas', {
      ficha: { tipoPessoa: 'fisica', nome: 'F', documento: '52998224725' },
      papeis: ['fornecedor'],
    })
    expect(
      (await master.post('/api/marcas', { nome: 'Alheia', donoId: fornecedor.corpo.id })).corpo
        .codigo,
    ).toBe('dono')
    expect((await master.post('/api/marcas', { nome: 'Própria' })).status).toBe(200)
    expect((await master.post('/api/marcas', { nome: 'própria' })).status).toBe(422)
  })
})

describe('parâmetros técnicos', () => {
  it('parâmetros medidos com faixa ideal; rendimento, ciclos e higienização', async () => {
    const a = await empresa()
    const b = await empresa()
    const params = await a.master.get('/api/cantina/parametros-analise')
    const ph = params.corpo.find((p: { nome: string }) => p.nome === 'pH')
    expect(ph.ativo).toBe(false)
    const ruim = await a.master.put('/api/cantina/parametros-analise', {
      parametros: [{ parametroId: ph.parametroId, ativo: true, minimo: '3.9', maximo: '3.2' }],
    })
    expect(ruim.corpo.codigo).toBe('faixa')
    await a.master.put('/api/cantina/parametros-analise', {
      parametros: [{ parametroId: ph.parametroId, ativo: true, minimo: '3.2', maximo: '3.9' }],
    })
    const salvo = (await a.master.get('/api/cantina/parametros-analise')).corpo.find(
      (p: { nome: string }) => p.nome === 'pH',
    )
    expect(salvo).toMatchObject({ ativo: true, minimo: '3.2000', maximo: '3.9000' })

    expect(
      (await a.master.put('/api/cantina/rendimentos', { itens: [{ litrosPorKg: '1.2' }] })).status,
    ).toBe(400)
    expect(
      (
        await a.master.put('/api/cantina/rendimentos', {
          itens: [{ litrosPorKg: '0.70' }, { estilo: 'tinto', litrosPorKg: '0.65' }],
        })
      ).status,
    ).toBe(200)
    expect((await a.master.get('/api/cantina/rendimentos')).corpo).toHaveLength(2)

    await a.master.put('/api/cantina/ciclos', {
      ciclos: [
        { numero: '01', nome: 'Verão' },
        { numero: '02', nome: 'Inverno' },
      ],
    })
    expect(
      (await a.master.get('/api/cantina/ciclos')).corpo.map((c: { nome: string }) => c.nome),
    ).toEqual(['Verão', 'Inverno'])

    const proprioDeB = await b.master.post('/api/catalogos/tipo_recipiente', {
      nome: 'Tanque de B',
    })
    expect(
      (
        await a.master.put('/api/cantina/higienizacao', {
          itens: [{ tipoRecipienteId: proprioDeB.corpo.id, intervaloDias: 30 }],
        })
      ).corpo.codigo,
    ).toBe('tipo_recipiente')
    expect(
      (
        await a.master.put('/api/cantina/higienizacao', {
          itens: [{ tipoRecipienteId: a.tipo('Barrica'), intervaloDias: 30 }],
        })
      ).status,
    ).toBe(200)
  })
})
