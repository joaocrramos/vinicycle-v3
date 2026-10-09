// Canais de mensagem além do e-mail (P20; decidido em 04/10/2026, pendência 25): WhatsApp pela
// Meta e SMS com provedor a definir. Mesma ideia da camada de pagamentos: uma interface, um
// adaptador por provedor.
//
// WhatsApp (API oficial da Meta, "Cloud API"): a mensagem iniciada pela empresa precisa de um modelo
// aprovado pela Meta. O ViniCycle usa um modelo com uma variável no corpo ({{1}}) e põe nela o texto
// do aviso. Conferir a versão da API e o modelo na ativação (pendência 27).
import type { Buscar } from './pagamentos'
import { ErroProvedor } from './pagamentos'

export interface ProvedorMensagem {
  canal: 'whatsapp' | 'sms'
  nome: string
  enviar(m: { para: string; texto: string }): Promise<{ id: string | null }>
  testarConexao(): Promise<void>
}

const VERSAO_GRAPH = 'v21.0'

export function provedorMetaWhatsapp(d: {
  token: string
  numeroId: string
  modelo: string
  idioma: string
  buscar?: Buscar
}): ProvedorMensagem {
  const buscar = d.buscar ?? fetch
  const base = `https://graph.facebook.com/${VERSAO_GRAPH}/${d.numeroId}`
  async function chamar(metodo: string, caminho: string, corpo?: unknown) {
    let r: Response
    try {
      r = await buscar(`${base}${caminho}`, {
        method: metodo,
        headers: { Authorization: `Bearer ${d.token}`, 'Content-Type': 'application/json' },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(20_000),
      })
    } catch (e) {
      throw new ErroProvedor(`Meta sem resposta: ${(e as Error).message}`)
    }
    const json = (await r.json().catch(() => ({}))) as {
      error?: { message?: string }
      messages?: Array<{ id: string }>
    }
    if (!r.ok)
      throw new ErroProvedor(`Meta ${r.status}: ${json.error?.message ?? 'erro'}`, r.status)
    return json
  }
  return {
    canal: 'whatsapp',
    nome: 'meta',
    async testarConexao() {
      await chamar('GET', '')
    },
    async enviar(m) {
      // A variável do modelo não aceita quebra de linha nem mais de quatro espaços seguidos.
      const texto = m.texto
        .replace(/\s*\n+\s*/g, ' · ')
        .replace(/ {4,}/g, ' ')
        .slice(0, 1000)
      const r = await chamar('POST', '/messages', {
        messaging_product: 'whatsapp',
        to: m.para,
        type: 'template',
        template: {
          name: d.modelo,
          language: { code: d.idioma },
          components: [{ type: 'body', parameters: [{ type: 'text', text: texto }] }],
        },
      })
      return { id: r.messages?.[0]?.id ?? null }
    },
  }
}

/**
 * Telefone no formato internacional, só dígitos (ex.: 5574999998888). Número brasileiro sem o país
 * ganha o 55. Curto demais = sem telefone.
 */
export function telefoneInternacional(valor: string | null | undefined): string | null {
  if (!valor) return null
  const d = valor.replace(/\D/g, '').replace(/^0+/, '')
  if (d.length === 10 || d.length === 11) return `55${d}`
  if (d.length >= 12 && d.length <= 15) return d
  return null
}
