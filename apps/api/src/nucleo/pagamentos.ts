// Camada de pagamentos (administracao.md, Integração de pagamentos: camada própria). O sistema fala
// sempre com esta interface; cada provedor é um adaptador. Os avisos do provedor viram eventos
// padrão, e a baixa e a régua usam só eles.
//
// Primeiro adaptador: Asaas (pendência 25). Referência: docs.asaas.com (API v3; aviso com o
// cabeçalho "asaas-access-token" e "id" do evento para não processar duas vezes; nota de serviço
// por POST /v3/invoices ligada à cobrança). Conferir os campos na ativação (pendência 26).
import type { EventoPadrao } from '@vinicycle/shared'
import { timingSafeEqual } from 'node:crypto'

export type Buscar = (url: string, init?: RequestInit) => Promise<Response>

export interface ClienteCobranca {
  nome: string
  documento: string | null
  email: string | null
  telefone: string | null
  referencia: string
}

export interface NovaCobranca {
  clienteId: string
  valor: string
  vencimento: string
  descricao: string
  referencia: string
  /** Vazio = o cliente escolhe na página do provedor. */
  forma: 'pix' | 'boleto' | 'cartao_credito' | null
}

export interface CobrancaCriada {
  id: string
  link: string | null
  pixCopiaCola: string | null
}

export interface NovaNota {
  cobrancaId: string
  valor: string
  data: string
  descricao: string
  codigoServico: string | null
  aliquotaIss: string | null
  referencia: string
}

/** Aviso traduzido para o formato do ViniCycle. */
export interface AvisoPadrao {
  identificador: string
  tipoOriginal: string
  tipo: EventoPadrao
  cobrancaId: string | null
  notaId: string | null
  valor: string | null
  data: string | null
  forma: 'pix' | 'boleto' | 'cartao_credito' | null
  numeroNota: string | null
  linkPdf: string | null
  linkXml: string | null
  erro: string | null
}

export interface ProvedorPagamento {
  nome: string
  testarConexao(): Promise<void>
  garantirCliente(c: ClienteCobranca): Promise<string>
  criarCobranca(c: NovaCobranca): Promise<CobrancaCriada>
  cancelarCobranca(id: string): Promise<void>
  emitirNota(n: NovaNota): Promise<string>
  traduzirAviso(corpo: unknown): AvisoPadrao
}

export class ErroProvedor extends Error {
  constructor(
    mensagem: string,
    readonly status?: number,
  ) {
    super(mensagem)
  }
}

/** Confere o token do aviso sem vazar tempo de comparação. */
export function tokenConfere(recebido: string | undefined, esperado: string): boolean {
  if (!recebido) return false
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

const URL_ASAAS = {
  teste: 'https://api-sandbox.asaas.com/v3',
  producao: 'https://api.asaas.com/v3',
} as const

const FORMA_ASAAS = { pix: 'PIX', boleto: 'BOLETO', cartao_credito: 'CREDIT_CARD' } as const
const FORMA_DO_ASAAS: Record<string, AvisoPadrao['forma']> = {
  PIX: 'pix',
  BOLETO: 'boleto',
  CREDIT_CARD: 'cartao_credito',
}

/** Eventos do Asaas → eventos padrão. O que não interessa à cobrança vira "outro". */
const EVENTOS_ASAAS: Record<string, EventoPadrao> = {
  PAYMENT_RECEIVED: 'pago',
  PAYMENT_CONFIRMED: 'pago',
  PAYMENT_OVERDUE: 'vencido',
  PAYMENT_REFUNDED: 'estornado',
  PAYMENT_RECEIVED_IN_CASH_UNDONE: 'estornado',
  PAYMENT_CHARGEBACK_REQUESTED: 'estornado',
  PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: 'recusado',
  PAYMENT_DELETED: 'cancelado',
  INVOICE_AUTHORIZED: 'nota_emitida',
  INVOICE_ERROR: 'nota_erro',
}

export function provedorAsaas(d: {
  ambiente: 'teste' | 'producao'
  chave: string
  buscar?: Buscar
}): ProvedorPagamento {
  const base = URL_ASAAS[d.ambiente]
  const buscar = d.buscar ?? fetch
  async function chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    let r: Response
    try {
      r = await buscar(`${base}${caminho}`, {
        method: metodo,
        headers: {
          access_token: d.chave,
          'Content-Type': 'application/json',
          'User-Agent': 'ViniCycle',
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(20_000),
      })
    } catch (e) {
      throw new ErroProvedor(`Asaas fora do ar ou sem resposta: ${(e as Error).message}`)
    }
    const texto = await r.text()
    const json = texto ? (JSON.parse(texto) as Record<string, unknown>) : {}
    if (!r.ok) {
      const erros = (json.errors as Array<{ description?: string }> | undefined)
        ?.map((x) => x.description)
        .filter(Boolean)
        .join('; ')
      throw new ErroProvedor(`Asaas ${r.status}: ${erros || 'erro sem descrição'}`, r.status)
    }
    return json as T
  }
  return {
    nome: 'asaas',
    async testarConexao() {
      await chamar('GET', '/customers?limit=1')
    },
    async garantirCliente(c) {
      const existentes = await chamar<{ data: Array<{ id: string }> }>(
        'GET',
        `/customers?externalReference=${encodeURIComponent(c.referencia)}&limit=1`,
      )
      if (existentes.data?.[0]) return existentes.data[0].id
      const r = await chamar<{ id: string }>('POST', '/customers', {
        name: c.nome,
        cpfCnpj: c.documento ?? undefined,
        email: c.email ?? undefined,
        mobilePhone: c.telefone ?? undefined,
        externalReference: c.referencia,
        // Os avisos de cobrança saem pelo ViniCycle (régua), não pelo provedor.
        notificationDisabled: true,
      })
      return r.id
    },
    async criarCobranca(c) {
      const r = await chamar<{ id: string; invoiceUrl?: string }>('POST', '/payments', {
        customer: c.clienteId,
        billingType: c.forma ? FORMA_ASAAS[c.forma] : 'UNDEFINED',
        value: Number(c.valor),
        dueDate: c.vencimento,
        description: c.descricao,
        externalReference: c.referencia,
      })
      let pix: string | null = null
      if (c.forma === 'pix') {
        const q = await chamar<{ payload?: string }>('GET', `/payments/${r.id}/pixQrCode`).catch(
          () => ({ payload: undefined }),
        )
        pix = q.payload ?? null
      }
      return { id: r.id, link: r.invoiceUrl ?? null, pixCopiaCola: pix }
    },
    async cancelarCobranca(id) {
      await chamar('DELETE', `/payments/${id}`)
    },
    async emitirNota(n) {
      const aliquota = n.aliquotaIss ? Number(n.aliquotaIss) : 0
      const r = await chamar<{ id: string }>('POST', '/invoices', {
        payment: n.cobrancaId,
        serviceDescription: n.descricao,
        observations: `Fatura ${n.referencia}`,
        value: Number(n.valor),
        deductions: 0,
        effectiveDate: n.data,
        municipalServiceCode: n.codigoServico ?? undefined,
        municipalServiceName: n.descricao,
        externalReference: n.referencia,
        taxes: { retainIss: false, iss: aliquota, cofins: 0, csll: 0, inss: 0, ir: 0, pis: 0 },
      })
      return r.id
    },
    traduzirAviso(corpo) {
      const c = corpo as {
        id?: string
        event?: string
        dateCreated?: string
        payment?: {
          id?: string
          value?: number
          billingType?: string
          paymentDate?: string | null
          clientPaymentDate?: string | null
          confirmedDate?: string | null
        }
        invoice?: {
          id?: string
          number?: string | null
          pdfUrl?: string | null
          xmlUrl?: string | null
          payment?: string | null
          statusDescription?: string | null
        }
      }
      const evento = c.event ?? 'DESCONHECIDO'
      const p = c.payment
      const nota = c.invoice
      return {
        // Avisos antigos podem vir sem "id": o par evento + recurso identifica.
        identificador: c.id ?? `${evento}:${p?.id ?? nota?.id ?? ''}:${c.dateCreated ?? ''}`,
        tipoOriginal: evento,
        tipo: EVENTOS_ASAAS[evento] ?? 'outro',
        cobrancaId: p?.id ?? nota?.payment ?? null,
        notaId: nota?.id ?? null,
        valor: p?.value !== undefined ? p.value.toFixed(2) : null,
        data: p?.clientPaymentDate ?? p?.paymentDate ?? p?.confirmedDate ?? null,
        forma: p?.billingType ? (FORMA_DO_ASAAS[p.billingType] ?? null) : null,
        numeroNota: nota?.number ?? null,
        linkPdf: nota?.pdfUrl ?? null,
        linkXml: nota?.xmlUrl ?? null,
        erro: evento === 'INVOICE_ERROR' ? (nota?.statusDescription ?? 'Erro na emissão') : null,
      }
    },
  }
}
