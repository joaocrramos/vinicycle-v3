// Engarrafamento (cantina.md, Engarrafamento e Lote comercial; 03-modelo-de-dados.md, 5.6):
// previsão com materiais e faltas, ordem com formatos e recipientes, produção do dia com a baixa dos
// litros e dos materiais e a entrada do produto acabado no lote comercial, aviso do laudo fora do
// rótulo, estorno da produção e encerramento.
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

describe('engarrafamento', () => {
  it('previsão, ordem, produção do dia, lote comercial, laudo, estorno e encerramento', async () => {
    const c = await cantina(t)
    const m = c.master
    await m.put('/api/cantina/rendimentos', {
      itens: [{ variedadeId: null, litrosPorKg: '0.7000' }],
    })
    const t1 = await c.recipiente('T1', '5000.00')
    const [item] = await c.romaneio([[c.malbec, '1000']])
    expect(
      (
        await m.post('/api/operacoes/desengace', {
          executadoEm: agora(),
          projetoId: c.projeto,
          consumos: [{ itemId: item, kg: '1000' }],
          destinos: [{ recipienteId: t1, lote: { novo: 'A' } }],
        })
      ).status,
    ).toBe(200)
    const lote = await c.lote(t1) // 700 L

    // Produto, rótulo (13% vol), formato 750 mL e ficha: garrafa, rolha e caixa com 6.
    const marca = (await m.post('/api/marcas', { nome: 'Sertão' })).corpo.id
    const ref = (await m.get('/api/referencia')).corpo
    const classe = ref.classesProduto.find((x: { codigo: string }) => x.codigo === 'vinho_fino').id
    const produto = (
      await m.post('/api/produtos', {
        nome: 'Malbec Reserva',
        marcaId: marca,
        classeProdutoId: classe,
        cor: 'tinto',
        teorAcucar: 'seco',
      })
    ).corpo.id
    await m.post(`/api/produtos/${produto}/rotulos`, {
      versao: '2026',
      teorAlcoolico: '13.0',
      vigenteDesde: '2026-01-01',
    })
    const f750 = (await m.post(`/api/produtos/${produto}/formatos`, { volumeMl: 750 })).corpo.id
    const embalagem = async (nome: string) =>
      (await m.post('/api/itens-estoque', { tipo: 'embalagem', nome, unidadeBase: 'un' })).corpo
        .id as string
    const garrafa = await embalagem('Garrafa bordalesa')
    const rolha = await embalagem('Rolha natural')
    const caixa = await embalagem('Caixa com 6')
    await m.put(`/api/produtos/${produto}/formatos/${f750}/ficha`, {
      itens: [
        { itemEstoqueId: garrafa, quantidade: '1' },
        { itemEstoqueId: rolha, quantidade: '1' },
        { itemEstoqueId: caixa, quantidade: '0.1667' },
      ],
    })
    const local = async (nome: string) =>
      (await m.post('/api/locais', { nome, uso: 'estoque', moduloEstoque: 'ENOTRACE' })).corpo
        .id as string
    const alm = await local('Almoxarifado')
    const exp = await local('Expedição')
    // Há garrafas e rolhas para 900; caixas, nenhuma.
    await m.post('/api/estoque/entradas', {
      executadoEm: agora(),
      localId: alm,
      itens: [
        { itemId: garrafa, quantidade: '900' },
        { itemId: rolha, quantidade: '900' },
      ],
    })

    // Previsão: 700 L com 1% de perda média = 924 garrafas; faltam garrafas, rolhas e caixas.
    const prev = (
      await m.post('/api/engarrafamento/previsao', {
        projetoId: c.projeto,
        produtoId: produto,
        formatos: [{ formatoId: f750 }],
        localMateriaisId: alm,
      })
    ).corpo
    expect(prev.litrosDisponiveis).toBe('700.00')
    expect(prev.formatos[0].garrafas).toBe(924)
    expect(
      prev.materiais.map((x: { nome: string; previsto: string; falta: string }) => [
        x.nome,
        x.previsto,
        x.falta,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ['Garrafa bordalesa', '924.000', '24.000'],
        ['Rolha natural', '924.000', '24.000'],
        ['Caixa com 6', '155.000', '155.000'],
      ]),
    )

    // Ordem: projeto passa a "envase planejado".
    const ordem = await m.post('/api/engarrafamento/ordens', {
      projetoId: c.projeto,
      produtoId: produto,
      dataPrevista: '2026-10-10',
      localProdutoId: exp,
      localMateriaisId: alm,
      formatos: [{ formatoId: f750, garrafasPrevistas: 900 }],
      recipientes: [t1],
    })
    expect(ordem.status).toBe(200)
    const id = ordem.corpo.id
    expect((await m.get(`/api/projetos/${c.projeto}`)).corpo.situacao).toBe('envase_planejado')

    // Laudo com 13,8% vol: fora de ±0,5% vol do rótulo, pede ciente.
    const todos = (await m.get('/api/cantina/parametros-analise')).corpo as Array<{
      parametroId: string
      nome: string
    }>
    const teor = todos.find((p) => p.nome === 'Graduação alcoólica')!.parametroId
    await m.put('/api/cantina/parametros-analise', {
      parametros: [{ parametroId: teor, ativo: true }],
    })
    const analise = await m.post('/api/analises', {
      tipo: 'interna',
      amostraEm: new Date(Date.now() - 3600_000).toISOString(),
      loteId: lote.id,
      resultados: [{ parametroId: teor, valor: '13.8', unidade: '% vol' }],
    })
    expect(analise.status).toBe(200)

    // Produção do dia: 300 L tirados, 396 garrafas (297 L), 3 L de perda; caixas: 66, real 67.
    const dia = {
      executadoEm: agora(),
      recipientes: [{ recipienteId: t1, litros: '300.00' }],
      formatos: [{ formatoId: f750, garrafas: 396 }],
      materiais: [{ itemId: caixa, real: '67' }],
    }
    const previa = (await m.post(`/api/engarrafamento/ordens/${id}/producoes/previa`, dia)).corpo
    expect(previa).toMatchObject({
      litrosTirados: '300.00',
      litrosEngarrafados: '297.00',
      perdaLitros: '3.00',
    })
    expect(previa.recipientes[0]).toMatchObject({ depois: { litros: '400.00' } })
    const codigos = previa.avisos.map((a: { codigo: string }) => a.codigo)
    expect(codigos).toContain(`laudo_teor:${lote.codigo}`)
    // A caixa fica negativa: aviso de estoque, aceito com pendência (P29).
    expect(codigos.some((x: string) => x.startsWith('estoque:'))).toBe(true)
    const demais = await m.post(`/api/engarrafamento/ordens/${id}/producoes/previa`, {
      ...dia,
      formatos: [{ formatoId: f750, garrafas: 500 }],
    })
    expect(demais.corpo.codigo).toBe('garrafas_demais')

    const p1 = await m.post(`/api/engarrafamento/ordens/${id}/producoes`, {
      ...dia,
      cientes: codigos,
    })
    expect(p1.status).toBe(200)
    expect(p1.corpo.loteComercial).toMatch(/^L26-0001$/)
    expect((await m.get(`/api/recipientes/${t1}/conteudo`)).corpo.volume).toBe('400.00')
    const acabado = (await m.get('/api/itens-estoque?tipo=produto_acabado')).corpo.itens[0].id
    const fichaAcabado = (await m.get(`/api/estoque/itens/${acabado}`)).corpo
    expect(fichaAcabado.saldo).toBe('396.000')
    expect(fichaAcabado.lotes).toMatchObject([{ codigo: 'L26-0001', saldo: '396.000' }])
    expect((await m.get(`/api/estoque/itens/${garrafa}`)).corpo.saldo).toBe('504.000')
    expect((await m.get(`/api/estoque/itens/${caixa}`)).corpo.saldo).toBe('-67.000')

    // Ficha da ordem: em execução, lote comercial com a composição e o lote de origem.
    const f = (await m.get(`/api/engarrafamento/ordens/${id}`)).corpo
    expect(f.situacao).toBe('em_execucao')
    expect(f.formatos[0]).toMatchObject({ previstas: 900, produzidas: 396 })
    expect(f.loteComercial).toMatchObject({ codigo: 'L26-0001', litros: '297.00' })
    expect(f.loteComercial.composicao.componentes).toMatchObject([
      { variedadeId: c.malbec, fracao: 1 },
    ])
    expect(f.loteComercial.origens).toMatchObject([{ codigo: lote.codigo, litros: '300.00' }])

    // Segundo dia, no mesmo lote comercial; depois estorno dele.
    const p2 = await m.post(`/api/engarrafamento/ordens/${id}/producoes`, {
      ...dia,
      recipientes: [{ recipienteId: t1, litros: '100.00' }],
      formatos: [{ formatoId: f750, garrafas: 132 }],
      materiais: [],
      cientes: codigos,
    })
    expect(p2.status).toBe(200)
    expect(p2.corpo.loteComercial).toBe('L26-0001')
    expect((await m.get(`/api/engarrafamento/ordens/${id}`)).corpo.loteComercial.litros).toBe(
      '396.00',
    )
    const est = await m.post(`/api/operacoes/${p2.corpo.operacaoId}/estorno`, {
      motivo: 'Lançado em dobro',
    })
    expect(est.status).toBe(200)
    expect((await m.get(`/api/recipientes/${t1}/conteudo`)).corpo.volume).toBe('400.00')
    const depois = (await m.get(`/api/engarrafamento/ordens/${id}`)).corpo
    expect(depois.loteComercial.litros).toBe('297.00')
    expect(depois.formatos[0].produzidas).toBe(396)

    // Não cancela com produção; encerra.
    expect(
      (await m.post(`/api/engarrafamento/ordens/${id}/cancelar`, { motivo: 'teste' })).corpo.codigo,
    ).toBe('producao')
    expect((await m.post(`/api/engarrafamento/ordens/${id}/encerrar`, {})).status).toBe(200)
    // O projeto ainda tem vinho: sai do "envase planejado".
    expect((await m.get(`/api/projetos/${c.projeto}`)).corpo.situacao).toBe('pronto_envase')
    const lista = (await m.get('/api/lotes-comerciais')).corpo
    expect(lista).toMatchObject([{ codigo: 'L26-0001', produto: 'Malbec Reserva' }])
  })
})
