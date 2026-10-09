// Inventário da cantina (cantina.md, Inventário): contagem com o volume do livro, ajustes das
// diferenças de uma vez numa operação, motivo obrigatório, aviso acima do limite, permissão
// específica (P27) e estorno do ajuste.
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

describe('inventário da cantina', () => {
  it('conta, ajusta as diferenças numa operação e o estorno devolve o livro', async () => {
    const c = await cantina(t)
    await c.master.put('/api/cantina/rendimentos', {
      itens: [{ variedadeId: null, litrosPorKg: '0.7000' }],
    })
    const t1 = await c.recipiente('T1', '5000.00')
    const t2 = await c.recipiente('T2', '5000.00')
    const [item] = await c.romaneio([[c.malbec, '1000']])
    const d = await c.master.post('/api/operacoes/desengace', {
      executadoEm: antes(120),
      projetoId: c.projeto,
      consumos: [{ itemId: item, kg: '1000' }],
      destinos: [{ recipienteId: t1, lote: { novo: 'A' } }],
    })
    expect(d.status).toBe(200)

    // O cantineiro conta e salva; não confirma o ajuste (permissão específica).
    const cantineiro = (await t.convidar(c.master, 'Cantineiro', [c.estab])).cliente
    await cantineiro.post('/api/auth/contexto', { estabelecimentoId: c.estab })
    const novo = await cantineiro.post('/api/inventarios', { contadoEm: antes(60) })
    expect(novo.status).toBe(200)
    const id = novo.corpo.id as string
    let inv = (await cantineiro.get(`/api/inventarios/${id}`)).corpo
    expect(inv.itens.map((i: { codigo: string }) => i.codigo)).toEqual(['T1', 'T2'])
    expect(inv.itens[0]).toMatchObject({ volumeLivro: '700.00', volumeMedido: null })
    expect(inv.itens[0].lote.codigo).toBeTruthy()
    expect(inv.itens[1]).toMatchObject({ volumeLivro: '0.00', lote: null })

    const salvar = (versao: number, itens: unknown[]) =>
      cantineiro.put(`/api/inventarios/${id}`, { versao, contadoEm: inv.contadoEm, itens })
    expect(
      (await salvar(inv.versao, [{ recipienteId: t1, volumeMedido: '650.00', motivo: null }]))
        .status,
    ).toBe(200)
    inv = (await cantineiro.get(`/api/inventarios/${id}`)).corpo
    expect(inv.itens[0]).toMatchObject({ volumeMedido: '650.00', diferenca: '-50.00' })

    // Sem motivo, não há prévia; com motivo, a diferença de 7% pede "ciente" (limite de 2%).
    expect((await cantineiro.post(`/api/inventarios/${id}/previa`, {})).corpo.codigo).toBe('motivo')
    await salvar(inv.versao, [
      { recipienteId: t1, volumeMedido: '650.00', motivo: 'Medição com régua' },
      { recipienteId: t2, volumeMedido: '0', motivo: null },
    ])
    const previa = (await cantineiro.post(`/api/inventarios/${id}/previa`, {})).corpo
    expect(previa.bloqueios).toEqual([])
    expect(previa.recipientes).toHaveLength(1)
    expect(previa.recipientes[0].depois.litros).toBe('650.00')
    expect(previa.avisos.map((a: { codigo: string }) => a.codigo)).toEqual([`inventario:${t1}`])
    expect(
      (await cantineiro.post(`/api/inventarios/${id}/confirmar`, { cientes: [] })).status,
    ).toBe(403)

    // O Master confirma: uma operação de ajuste, composição igual, livro ajustado.
    const sem = await c.master.post(`/api/inventarios/${id}/confirmar`, { cientes: [] })
    expect(sem.corpo.codigo).toBe('ciente_pendente')
    const ok = await c.master.post(`/api/inventarios/${id}/confirmar`, {
      cientes: [`inventario:${t1}`],
    })
    expect(ok.status).toBe(200)
    const op = (await c.master.get(`/api/operacoes/${ok.corpo.operacaoId}`)).corpo
    expect(op.tipo).toBe('ajuste_inventario')
    expect(op.movimentos).toMatchObject([
      { recipiente: 'T1', litros: '-50.00', tipo: 'ajuste_inventario' },
    ])
    expect(op.dados.motivos).toEqual({ T1: 'Medição com régua' })
    expect((await c.lote(t1)).volume).toBe('650.00')
    const conteudo = (await c.master.get(`/api/recipientes/${t1}/conteudo`)).corpo
    expect(conteudo.composicao.componentes).toHaveLength(1)
    inv = (await c.master.get(`/api/inventarios/${id}`)).corpo
    expect(inv).toMatchObject({ situacao: 'confirmado', operacao: ok.corpo.codigo })
    expect(inv.itens[0]).toMatchObject({ volumeLivro: '700.00', diferenca: '-50.00' })
    expect((await salvar(inv.versao, [])).corpo.codigo).toBe('confirmado')

    // Sem diferenças, o cantineiro confirma, e não sai operação.
    const outro = (await cantineiro.post('/api/inventarios', { contadoEm: antes(30) })).corpo.id
    const o = (await cantineiro.get(`/api/inventarios/${outro}`)).corpo
    await cantineiro.put(`/api/inventarios/${outro}`, {
      versao: o.versao,
      contadoEm: o.contadoEm,
      itens: [{ recipienteId: t1, volumeMedido: '650.00' }],
    })
    const r = await cantineiro.post(`/api/inventarios/${outro}/confirmar`, {})
    expect(r.corpo).toMatchObject({ ok: true, operacaoId: null })

    // O estorno do ajuste devolve o livro.
    const e = await c.master.post(`/api/operacoes/${ok.corpo.operacaoId}/estorno`, {
      motivo: 'Régua errada',
    })
    expect(e.status).toBe(200)
    expect((await c.lote(t1)).volume).toBe('700.00')

    // Recipiente vazio no livro com volume medido: lance antes a entrada.
    const ultimo = (await c.master.post('/api/inventarios', { contadoEm: antes(1) })).corpo.id
    const u = (await c.master.get(`/api/inventarios/${ultimo}`)).corpo
    await c.master.put(`/api/inventarios/${ultimo}`, {
      versao: u.versao,
      contadoEm: u.contadoEm,
      itens: [{ recipienteId: t2, volumeMedido: '10.00', motivo: 'Sobra' }],
    })
    expect((await c.master.post(`/api/inventarios/${ultimo}/previa`, {})).corpo.codigo).toBe(
      'vazio_no_livro',
    )
    expect((await c.master.post(`/api/inventarios/${ultimo}/descartar`, {})).status).toBe(200)
    expect((await c.master.get(`/api/inventarios/${ultimo}`)).status).toBe(404)
  })

  it('diferença acima do limite vai para a aprovação, se a empresa exigir (P27)', async () => {
    const c = await cantina(t)
    await c.master.put('/api/cantina/rendimentos', {
      itens: [{ variedadeId: null, litrosPorKg: '0.7000' }],
    })
    const t1 = await c.recipiente('T1', '5000.00')
    const [item] = await c.romaneio([[c.malbec, '1000']])
    await c.master.post('/api/operacoes/desengace', {
      executadoEm: antes(120),
      projetoId: c.projeto,
      consumos: [{ itemId: item, kg: '1000' }],
      destinos: [{ recipienteId: t1, lote: { novo: 'A' } }],
    })
    await c.master.put('/api/parametros/aprovacoes', {
      inventario: true,
      estorno: false,
      reabertura: false,
      retificacao: false,
    })
    // O cantineiro (sem a permissão de ajuste) pede; o pedido guarda a versão do inventário.
    const cantineiro = (await t.convidar(c.master, 'Cantineiro', [c.estab])).cliente
    await cantineiro.post('/api/auth/contexto', { estabelecimentoId: c.estab })
    const contar = async (litros: string) => {
      const id = (await cantineiro.post('/api/inventarios', { contadoEm: antes(60) })).corpo.id
      const inv = (await cantineiro.get(`/api/inventarios/${id}`)).corpo
      await cantineiro.put(`/api/inventarios/${id}`, {
        versao: inv.versao,
        contadoEm: inv.contadoEm,
        itens: [{ recipienteId: t1, volumeMedido: litros, motivo: 'Régua' }],
      })
      return id as string
    }
    const id = await contar('650.00')
    const pedido = (
      await cantineiro.post(`/api/inventarios/${id}/confirmar`, { cientes: [`inventario:${t1}`] })
    ).corpo
    expect(pedido.aguardandoAprovacao).toBe(true)
    expect((await c.master.get(`/api/inventarios/${id}`)).corpo.situacao).toBe('rascunho')
    const ok = (await c.master.post(`/api/aprovacoes/${pedido.solicitacaoId}/aprovar`)).corpo
    expect(ok).toEqual({ situacao: 'aprovada', erro: null })
    expect((await c.master.get(`/api/inventarios/${id}`)).corpo.situacao).toBe('confirmado')
    expect((await c.lote(t1)).volume).toBe('650.00')

    // Inventário alterado depois do pedido: aprovado, mas não feito.
    const outro = await contar('600.00')
    const p2 = (
      await cantineiro.post(`/api/inventarios/${outro}/confirmar`, {
        cientes: [`inventario:${t1}`],
      })
    ).corpo
    const inv = (await cantineiro.get(`/api/inventarios/${outro}`)).corpo
    await cantineiro.put(`/api/inventarios/${outro}`, {
      versao: inv.versao,
      contadoEm: inv.contadoEm,
      itens: [{ recipienteId: t1, volumeMedido: '550.00', motivo: 'Régua' }],
    })
    const falha = (await c.master.post(`/api/aprovacoes/${p2.solicitacaoId}/aprovar`)).corpo
    expect(falha.situacao).toBe('falhou')
    expect(falha.erro).toContain('alterado depois do pedido')
    expect((await c.master.get(`/api/inventarios/${outro}`)).corpo.situacao).toBe('rascunho')
  })
})
