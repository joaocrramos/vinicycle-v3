// Dossiê do lote para o cliente (04, roteiro do ciclo 10, bloco 4): só do vinho de cliente; seções
// formatadas guardadas como fotografia; envio por e-mail com o registro.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { processarFila } from '../src/nucleo/email'
import { fichaPj, montar } from './apoio'
import { cantina } from './cantina'

let t: Awaited<ReturnType<typeof montar>>
beforeAll(async () => {
  t = await montar()
})
afterAll(async () => {
  await t.fechar()
})

describe('dossiê do lote', () => {
  it('gera, guarda e envia por e-mail', async () => {
    const c = await cantina(t)
    const m = c.master
    const ok = (r: { status: number; corpo: unknown }) => {
      expect(r.status, JSON.stringify(r.corpo)).toBe(200)
      return r.corpo as Record<string, string>
    }
    const cliente = ok(
      await m.post('/api/pessoas', {
        ficha: fichaPj('Vinhos do Vale Ltda'),
        papeis: ['cliente_vinificacao'],
      }),
    ).id!
    ok(
      await m.post('/api/contratos-terceirizacao', {
        sentido: 'prestamos',
        numero: 'CT-7',
        atividades: ['elaboracao'],
        contraparteId: cliente,
        estabelecimentoId: c.estab,
        registroProduto: 'cantina',
        vigenciaInicio: '2026-01-01',
        pagamentoDinheiro: true,
      }),
    )
    const t1 = await c.recipiente('T1', '5000.00')
    const t2 = await c.recipiente('T2', '5000.00')
    const entrada = (recipienteId: string, titularId: string | null) =>
      m.post('/api/operacoes/entrada_granel', {
        executadoEm: new Date(Date.now() - 3_600_000).toISOString(),
        tipoGranel: titularId ? 'recebido_cliente' : 'compra',
        projetoId: c.projeto,
        titularId,
        notaNumero: '555',
        glt: 'GLT-9',
        composicao: [{ variedadeId: c.malbec, safra: 2026, percentual: '100' }],
        destinos: [{ recipienteId, litros: '800.00', lote: { novo: 'A' } }],
      })
    ok(await entrada(t1, cliente))
    ok(await entrada(t2, null))
    const projeto = (await m.get(`/api/projetos/${c.projeto}`)).corpo
    const loteDe = (id: string) =>
      (projeto.lotes as Array<{ id: string; recipientes: Array<{ id: string }> }>).find((l) =>
        l.recipientes.some((r) => r.id === id),
      )!.id

    // Lote da própria empresa: não tem dossiê.
    expect((await m.post('/api/terceiros/dossies', { loteId: loteDe(t2) })).corpo.codigo).toBe(
      'titular',
    )
    const lotes = (await m.get(`/api/terceiros/lotes-do-cliente?titularId=${cliente}`)).corpo
    expect(lotes.lotes.map((l: { id: string }) => l.id)).toEqual([loteDe(t1)])

    const { id } = ok(await m.post('/api/terceiros/dossies', { loteId: loteDe(t1) }))
    const d = (await m.get(`/api/terceiros/dossies/${id}`)).corpo
    expect(d.emailCliente).toBe('contato@exemplo.com.br')
    const ident = Object.fromEntries(d.conteudo.identificacao as Array<[string, string]>)
    expect(ident.Cliente).toMatch(/^Vinhos do Vale Ltda \(CNPJ /)
    expect(ident.Contrato).toMatch(/^CT-7 · desde 01\/01\/2026/)
    expect(ident['Texto do rótulo']).toMatch(/^Produzido por /)
    const secao = (titulo: string) =>
      (d.conteudo.secoes as Array<{ titulo: string; linhas: string[][] }>).find(
        (x) => x.titulo === titulo,
      )!
    expect(secao('Lotes de produção').linhas).toHaveLength(1)
    expect(secao('Granel recebido e devolvido').linhas[0]).toEqual(
      expect.arrayContaining(['555', 'GLT-9', '800,00']),
    )
    expect(secao('Recipientes').linhas.map((l) => l[0])).toEqual(['T1'])

    // Envio por e-mail, com o registro.
    expect(
      (await m.post(`/api/terceiros/dossies/${id}/enviar`, { para: 'nao-e-email' })).corpo.codigo,
    ).toBe('validacao')
    ok(await m.post(`/api/terceiros/dossies/${id}/enviar`, { para: 'Cliente@Vale.com.br' }))
    await processarFila(t.db, t.correio, t.config.EMAIL_REMETENTE, { error: () => {} })
    const mail = t.correio.enviados.find((x) => x.para === 'cliente@vale.com.br')!
    expect(mail.assunto).toMatch(/^Dossiê · Lote de produção /)
    expect(mail.html).toContain('Granel recebido e devolvido')
    expect(mail.texto).toContain('GLT-9')
    const depois = (await m.get(`/api/terceiros/dossies/${id}`)).corpo
    expect(depois.envios.map((x: { para: string }) => x.para)).toEqual(['cliente@vale.com.br'])
    const lista = (await m.get(`/api/terceiros/dossies?titularId=${cliente}`)).corpo
    expect(lista).toMatchObject([{ id, envios: 1, titular: 'Vinhos do Vale Ltda' }])
  })
})
