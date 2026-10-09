// Ensaio geral (04, roteiro do ciclo 6): o caminho de uma vinícola do saldo de abertura ao
// fechamento do mês, numa empresa nova: carga inicial, recepção, desengace com insumo, análise,
// trasfega, engarrafamento, saída, alertas, fechamento e história do lote.
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

describe('ensaio geral', () => {
  it('do saldo de abertura ao fechamento do mês', async () => {
    const c = await cantina(t)
    const m = c.master
    const hoje = new Date()
    const ano = hoje.getUTCMonth() === 0 ? hoje.getUTCFullYear() - 1 : hoje.getUTCFullYear()
    const mes = hoje.getUTCMonth() === 0 ? 12 : hoje.getUTCMonth()
    const dia = (d: number, h = 10) =>
      `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00-03:00`
    const ok = (r: { status: number; corpo: unknown }) => {
      expect(r.status, JSON.stringify(r.corpo)).toBe(200)
      return r.corpo as Record<string, unknown> & { operacaoId: string; id: string }
    }
    const enviar = (tipo: string, data: string, csv: string) =>
      t.app.inject({
        method: 'POST',
        url: `/api/carga-inicial?tipo=${tipo}&data=${encodeURIComponent(data)}`,
        headers: {
          cookie: m.cookie,
          'x-vinicycle': '1',
          'content-type': 'multipart/form-data; boundary=x',
        },
        payload: Buffer.from(
          `--x\r\nContent-Disposition: form-data; name="arquivo"; filename="c.csv"\r\nContent-Type: text/csv\r\n\r\n${csv}\r\n--x--\r\n`,
        ),
      })

    // Cadastros: locais, recipientes, insumo, embalagens, produto com ficha.
    const local = async (nome: string) =>
      ok(await m.post('/api/locais', { nome, uso: 'estoque', moduloEstoque: 'ENOTRACE' })).id
    const alm = await local('Almoxarifado')
    const loja = await local('Loja')
    const t1 = await c.recipiente('T1', '5000.00')
    const t2 = await c.recipiente('T2', '5000.00')
    const t3 = await c.recipiente('T3', '5000.00')
    const tipos = (await m.get('/api/catalogos/tipo_insumo?tamanho=0')).corpo.itens as Array<{
      id: string
      nome: string
    }>
    const lev = ok(
      await m.post('/api/itens-estoque', {
        tipo: 'insumo',
        nome: 'Levedura EC1118',
        unidadeBase: 'g',
        controlaLote: true,
        insumo: { tipoInsumoId: tipos.find((x) => x.nome === 'Leveduras')!.id },
      }),
    ).id
    const garrafa = ok(
      await m.post('/api/itens-estoque', {
        tipo: 'embalagem',
        nome: 'Garrafa 750',
        unidadeBase: 'un',
      }),
    ).id
    const marca = ok(await m.post('/api/marcas', { nome: 'Sertão' })).id
    const ref = (await m.get('/api/referencia')).corpo
    const produto = ok(
      await m.post('/api/produtos', {
        nome: 'Malbec Jovem',
        marcaId: marca,
        classeProdutoId: ref.classesProduto.find(
          (x: { codigo: string }) => x.codigo === 'vinho_fino',
        ).id,
        cor: 'tinto',
        teorAcucar: 'seco',
      }),
    ).id
    await m.post(`/api/produtos/${produto}/rotulos`, {
      versao: '1',
      teorAlcoolico: '13.0',
      vigenteDesde: '2020-01-01',
    })
    const f750 = ok(await m.post(`/api/produtos/${produto}/formatos`, { volumeMl: 750 })).id
    await m.put(`/api/produtos/${produto}/formatos/${f750}/ficha`, {
      itens: [{ itemEstoqueId: garrafa, quantidade: '1' }],
    })

    // Carga inicial no dia 1: vinho em T3, insumos e garrafas vazias.
    ok(
      await enviar(
        'saldo_granel',
        dia(1, 0),
        'recipiente;projeto;lote;litros;variedade;safra;percentual;organica\nT3;Malbec 2025;A;1000;Malbec;2025;100;não',
      ).then((r) => ({ status: r.statusCode, corpo: JSON.parse(r.body) })),
    )
    ok(
      await enviar(
        'saldo_itens',
        dia(1, 0),
        'item;local;lote;validade;quantidade\nLevedura EC1118;Almoxarifado;LV1;31/12/2030;1000\nGarrafa 750;Almoxarifado;;;500',
      ).then((r) => ({ status: r.statusCode, corpo: JSON.parse(r.body) })),
    )

    expect((await m.get(`/api/recipientes/${t3}/conteudo`)).corpo.volume).toBe('1000.00')

    // Recepção e desengace com levedura (20 g/hL).
    await m.put('/api/cantina/rendimentos', {
      itens: [{ variedadeId: null, litrosPorKg: '0.7000' }],
    })
    const [item] = await c.romaneio([[c.malbec, '1000']])
    const loteLev = (await m.get(`/api/estoque/itens/${lev}`)).corpo.lotes[0].id
    const des = ok(
      await m.post('/api/operacoes/desengace', {
        executadoEm: dia(5),
        projetoId: c.projeto,
        consumos: [{ itemId: item, kg: '1000' }],
        destinos: [{ recipienteId: t1, lote: { novo: 'A' } }],
        insumos: [{ itemId: lev, loteItemId: loteLev, dose: '20', unidade: 'g/hL' }],
        localEstoqueId: alm,
      }),
    )
    expect((await m.get(`/api/estoque/itens/${lev}`)).corpo.saldo).toBe('860.000')

    // Análise e trasfega.
    const lote = await c.lote(t1)
    const todos = (await m.get('/api/cantina/parametros-analise')).corpo as Array<{
      parametroId: string
      nome: string
    }>
    const teor = todos.find((p) => p.nome === 'Graduação alcoólica')!.parametroId
    await m.put('/api/cantina/parametros-analise', {
      parametros: [{ parametroId: teor, ativo: true }],
    })
    ok(
      await m.post('/api/analises', {
        tipo: 'interna',
        amostraEm: dia(10),
        loteId: lote.id,
        resultados: [{ parametroId: teor, valor: '13.2', unidade: '% vol' }],
      }),
    )
    ok(
      await m.post('/api/operacoes/trasfega', {
        executadoEm: dia(12),
        origens: [{ recipienteId: t1, esvaziar: true, perda: null }],
        destinos: [{ recipienteId: t2, litros: '690.00' }],
      }),
    )

    // Engarrafamento: 400 garrafas (300 L) de T2.
    await m.post(`/api/projetos/${c.projeto}/situacao`, { situacao: 'pronto_envase' })
    const ordem = ok(
      await m.post('/api/engarrafamento/ordens', {
        projetoId: c.projeto,
        produtoId: produto,
        dataPrevista: dia(15).slice(0, 10),
        localProdutoId: loja,
        localMateriaisId: alm,
        formatos: [{ formatoId: f750, garrafasPrevistas: 400 }],
        recipientes: [t2],
      }),
    ).id
    const prod = ok(
      await m.post(`/api/engarrafamento/ordens/${ordem}/producoes`, {
        executadoEm: dia(15),
        recipientes: [{ recipienteId: t2, litros: '302.00' }],
        formatos: [{ formatoId: f750, garrafas: 400 }],
      }),
    )
    expect(prod.loteComercial).toMatch(/^L\d{2}-0001$/)
    ok(await m.post(`/api/engarrafamento/ordens/${ordem}/encerrar`, {}))

    // Venda de 24 garrafas.
    const acabado = (await m.get('/api/itens-estoque?tipo=produto_acabado')).corpo.itens[0].id
    ok(
      await m.post('/api/saidas', {
        tipo: 'venda',
        executadoEm: dia(20),
        localId: loja,
        documento: '123',
        destinatarioNome: 'Empório',
        itens: [{ itemId: acabado, quantidade: '24' }],
      }),
    )

    // Fechamento do mês: relatório e trava.
    const f = (await m.get(`/api/fechamentos/${ano}/${mes}`)).corpo
    expect(f.relatorio.granel).toMatchObject({ inicial: '0.00', entradas: '1700.00' })
    expect(Number(f.relatorio.granel.final)).toBeCloseTo(1700 - 10 - 302, 2)
    expect(f.relatorio.produtos).toMatchObject([{ entradas: 400, saidas: -24, final: 376 }])
    ok(await m.post(`/api/fechamentos/${ano}/${mes}/fechar`, { cientes: [] }))
    expect(
      (await m.post(`/api/operacoes/${des.operacaoId}/estorno`, { motivo: 'teste' })).corpo.codigo,
    ).toBe('periodo_fechado')

    // História do lote comercial: uva, operações, insumo, análise, envase e a venda.
    const lc = (await m.get('/api/lotes-comerciais')).corpo[0].id
    const h = (await m.get(`/api/historia?loteComercial=${lc}`)).corpo
    expect(h.uvas).toHaveLength(1)
    expect(h.insumos[0]).toMatchObject({ insumo: 'Levedura EC1118', loteInsumo: 'LV1' })
    expect(h.analises).toHaveLength(1)
    expect(h.operacoes.map((o: { tipo: string }) => o.tipo)).toEqual([
      'desengace',
      'trasfega',
      'engarrafamento',
    ])
    expect(h.saidas).toMatchObject([{ destinatario: 'Empório', quantidade: '24.000' }])
  })
})
