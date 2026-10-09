// Chamadas à API. Toda alteração leva o cabeçalho da aplicação (proteção contra CSRF).
import { toast } from 'sonner'

export interface ErroCampo {
  caminho: string
  mensagem: string
}

export class ErroApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly campos: ErroCampo[] = [],
    /** Dados do erro de regra (ex.: os erros por linha de uma planilha). */
    readonly detalhes?: unknown,
  ) {
    super(mensagem)
  }
}

async function chamar<T>(metodo: string, url: string, corpo?: unknown): Promise<T> {
  const formulario = corpo instanceof FormData
  const r = await fetch(url, {
    method: metodo,
    credentials: 'same-origin',
    headers: {
      ...(metodo === 'GET' ? {} : { 'x-vinicycle': '1' }),
      ...(corpo !== undefined && !formulario ? { 'content-type': 'application/json' } : {}),
    },
    body: corpo === undefined ? undefined : formulario ? corpo : JSON.stringify(corpo),
  })
  const texto = await r.text()
  const dados = texto ? JSON.parse(texto) : null
  if (!r.ok) {
    throw new ErroApi(
      r.status,
      dados?.codigo ?? 'erro',
      dados?.mensagem ?? 'Não foi possível concluir. Tente de novo.',
      dados?.campos ?? [],
      dados?.detalhes,
    )
  }
  // A ação que a empresa sujeitou à aprovação (P27) não foi feita: avisa onde acompanhar.
  if (dados?.aguardandoAprovacao)
    toast.info(dados.mensagem ?? 'Pedido enviado para aprovação.', {
      description: 'Acompanhe em Gestão › Aprovações.',
      duration: 8000,
    })
  return dados as T
}

export const api = {
  get: <T>(url: string) => chamar<T>('GET', url),
  post: <T>(url: string, corpo: unknown = {}) => chamar<T>('POST', url, corpo),
  put: <T>(url: string, corpo: unknown) => chamar<T>('PUT', url, corpo),
}

/** Monta a query string, ignorando valores vazios. */
export function query(params: Record<string, unknown>): string {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    u.set(k, String(v))
  }
  const s = u.toString()
  return s ? `?${s}` : ''
}
