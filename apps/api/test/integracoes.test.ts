// Integração de pagamentos (ciclo 12, bloco 1): Asaas simulado, cobrança, aviso e nota de serviço.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { definirBuscarProvedor, processarIntegracoes } from '../src/modulos/integracoes'
import { hoje } from '../src/modulos/planos'
import { montar } from './apoio'

let t: Awaited<ReturnType<typeof montar>>
const silencio = { error: () => {} }
const chamadas: Array<{ metodo: string; caminho: string; corpo: unknown; chave: string | null }> =
  []
let seq = 0
const notaPorPagamento = new Map<string, number>()

beforeAll(async () => {
  t = await montar()
  // Asaas simulado: responde ao que o adaptador pede.
  definirBuscarProvedor(async (url, init) => {
    const u = new URL(url)
    const caminho = u.pathname.replace(/^\/v3/, '') + u.search
    const corpo = init?.body ? JSON.parse(String(init.body)) : null
    const chave = (init?.headers as Record<string, string>)?.access_token ?? null
    chamadas.push({ metodo: init?.method ?? 'GET', caminho, corpo, chave })
    const json = (x: unknown, status = 200) =>
      new Response(JSON.stringify(x), { status, headers: { 'content-type': 'application/json' } })
    if (chave !== 'chave-sandbox') return json({ errors: [{ description: 'Chave inválida' }] }, 401)
    if (caminho.startsWith('/customers?')) return json({ data: [] })
    if (caminho === '/customers') return json({ id: `cus_${++seq}` })
    if (caminho === '/payments')
      return json({ id: `pay_${++seq}`, invoiceUrl: `https://sandbox.asaas.com/i/${seq}` })
    if (caminho.endsWith('/pixQrCode')) return json({ payload: '00020126PIX' })
    if (caminho === '/invoices') {
      const id = ++seq
      notaPorPagamento.set((corpo as { payment: string }).payment, id)
      return json({ id: `inv_${id}` })
    }
    if (init?.method === 'DELETE') return json({ deleted: true })
    return json({}, 404)
  })
})
afterAll(async () => {
  await t.fechar()
})

async function integracaoAsaas() {
  const { cliente: adm } = await t.admin()
  const r = await adm.post('/api/plataforma/integracoes', {
    nome: 'Asaas sandbox',
    adaptador: 'asaas',
    ambiente: 'teste',
    chave: 'chave-sandbox',
    formas: ['pix', 'boleto', 'cartao_credito'],
    nfse: {
      ativa: true,
      codigoServico: '1.03',
      descricao: 'Licença de uso de software',
      aliquotaIss: '2',
    },
    ativo: true,
  })
  if (r.status !== 200) throw new Error(JSON.stringify(r.corpo))
  const token = (await adm.get(`/api/plataforma/integracoes/${r.corpo.id}/token`)).corpo.token
  return { adm, id: r.corpo.id as string, token: token as string }
}

async function avisar(id: string, token: string | null, corpo: unknown) {
  return t.app.inject({
    method: 'POST',
    url: `/api/avisos/${id}`,
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'asaas-access-token': token } : {}),
    },
    payload: JSON.stringify(corpo),
  })
}

/** A tarefa trabalha em lotes: roda até a cobrança desta fatura sair. */
async function ateCobrar(
  master: { get: (u: string) => Promise<{ corpo: { pagamento: unknown } }> },
  faturaId: string,
) {
  for (let i = 0; i < 20; i++) {
    await processarIntegracoes(t.db, t.config.CHAVE_CIFRA, silencio)
    const f = (await master.get(`/api/faturas/${faturaId}`)).corpo
    if (f.pagamento) return f
  }
  throw new Error('A cobrança não saiu')
}

describe('pagamentos pelo provedor', () => {
  let integ: Awaited<ReturnType<typeof integracaoAsaas>>
  beforeAll(async () => {
    integ = await integracaoAsaas()
  })
  afterAll(async () => {
    const { adm, id } = integ
    const lista = (await adm.get('/api/plataforma/integracoes')).corpo
    const i = lista.find((x: { id: string }) => x.id === id)
    await adm.put(`/api/plataforma/integracoes/${id}`, { ...i, chave: null, ativo: false })
  })

  it('a chave não volta para a tela; o teste de conexão usa a chave', async () => {
    const lista = (await integ.adm.get('/api/plataforma/integracoes')).corpo
    const i = lista.find((x: { id: string }) => x.id === integ.id)
    expect(i).toMatchObject({
      chaveConfigurada: true,
      urlAviso: `http://localhost:5173/api/avisos/${integ.id}`,
    })
    expect(JSON.stringify(lista)).not.toContain('chave-sandbox')
    expect(integ.token.length).toBeGreaterThanOrEqual(32)
    expect(
      (await integ.adm.post(`/api/plataforma/integracoes/${integ.id}/testar`, {})).corpo.ok,
    ).toBe(true)
  })

  it('cria a cobrança, recebe o pagamento uma vez, emite a nota e acompanha o estorno', async () => {
    const { master } = await t.empresaComMaster({ inicio: hoje() })
    const fatura = (await master.get('/api/faturas')).corpo[0]
    const f = await ateCobrar(master, fatura.id)
    expect(f.pagamento).toMatchObject({ situacao: 'ativa' })
    const pagamento = chamadas.find(
      (c) =>
        c.caminho === '/payments' &&
        (c.corpo as { externalReference: string }).externalReference === fatura.id,
    )!
    expect(pagamento.corpo).toMatchObject({ billingType: 'UNDEFINED', value: 300 })
    const link = (f.pagamento as { link: string }).link
    const idExterno = `pay_${link.split('/i/')[1]}`

    // Sem token, token errado: recusado.
    const evento = {
      id: `evt_${Math.random()}`,
      event: 'PAYMENT_RECEIVED',
      dateCreated: `${hoje()} 10:00:00`,
      payment: {
        object: 'payment',
        id: idExterno,
        value: 300,
        billingType: 'PIX',
        paymentDate: hoje(),
      },
    }
    expect((await avisar(integ.id, null, evento)).statusCode).toBe(401)
    expect((await avisar(integ.id, 'x'.repeat(43), evento)).statusCode).toBe(401)
    expect((await avisar(integ.id, integ.token, evento)).statusCode).toBe(200)
    const repetido = await avisar(integ.id, integ.token, evento)
    expect(JSON.parse(repetido.body)).toMatchObject({ repetido: true })
    let visto = (await master.get(`/api/faturas/${fatura.id}`)).corpo
    expect(visto).toMatchObject({ situacao: 'paga', recebido: '300.00' })
    expect(visto.recebimentos).toHaveLength(1)
    expect(visto.recebimentos[0]).toMatchObject({ origem: 'provedor', forma: 'pix' })

    // A nota de serviço é pedida ao provedor e chega pelo aviso.
    await processarIntegracoes(t.db, t.config.CHAVE_CIFRA, silencio)
    const pedido = chamadas.find(
      (c) => c.caminho === '/invoices' && (c.corpo as { payment: string }).payment === idExterno,
    )!
    expect(pedido.corpo).toMatchObject({ municipalServiceCode: '1.03', value: 300 })
    const notaId = `inv_${notaPorPagamento.get(idExterno)}`
    await avisar(integ.id, integ.token, {
      id: `evt_${Math.random()}`,
      event: 'INVOICE_AUTHORIZED',
      invoice: {
        id: notaId,
        number: '2027001',
        pdfUrl: 'https://asaas/nota.pdf',
        payment: idExterno,
      },
    })
    visto = (await master.get(`/api/faturas/${fatura.id}`)).corpo
    expect(visto.nota).toMatchObject({
      situacao: 'emitida',
      numero: '2027001',
      linkPdf: 'https://asaas/nota.pdf',
    })

    await avisar(integ.id, integ.token, {
      id: `evt_${Math.random()}`,
      event: 'PAYMENT_REFUNDED',
      payment: { id: idExterno, value: 300 },
    })
    visto = (await master.get(`/api/faturas/${fatura.id}`)).corpo
    expect(visto.saldo).toBe('300.00')
    expect(visto.recebimentos[0].motivoEstorno).toContain('PAYMENT_REFUNDED')
  })

  it('fatura cancelada cancela a cobrança no provedor', async () => {
    const { master, adm } = await t.empresaComMaster({ inicio: hoje() })
    const fatura = (await master.get('/api/faturas')).corpo[0]
    const f = await ateCobrar(master, fatura.id)
    const idExterno = `pay_${(f.pagamento as { link: string }).link.split('/i/')[1]}`
    await adm.post(`/api/plataforma/faturas/${fatura.id}/cancelar`, { motivo: 'Cortesia' })
    await processarIntegracoes(t.db, t.config.CHAVE_CIFRA, silencio)
    expect(
      chamadas.some((c) => c.metodo === 'DELETE' && c.caminho === `/payments/${idExterno}`),
    ).toBe(true)
  })
})
