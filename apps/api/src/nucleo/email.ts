// Envio de e-mails (02-arquitetura.md: camada própria, provedor trocável; P20).
// A mensagem entra na fila (`envio`) dentro da transação de negócio; uma tarefa de fundo envia.
// Se a transação falhar, o e-mail não sai.
import { and, eq, lte, sql } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'
import { emContexto, type Db, type Tx } from '../db/cliente'
import { envio, envioTentativa, modeloMensagemVersao } from '../db/schema'
import { montar } from './modelos-email'
import { preencherModelo } from '@vinicycle/shared'

export interface Mensagem {
  para: string
  assunto: string
  texto: string
  html: string
  /** Para os modelos editáveis: os parágrafos, o botão e as variáveis do texto padrão. */
  paragrafos?: string[]
  botao?: { texto: string; link: string }
  variaveis?: Record<string, string>
}

export interface ProvedorEmail {
  nome: string
  enviar(remetente: string, m: Mensagem): Promise<{ id?: string }>
}

export function provedorConsole(log: Pick<FastifyBaseLogger, 'info'>): ProvedorEmail {
  return {
    nome: 'console',
    async enviar(_remetente, m) {
      log.info({ para: m.para, assunto: m.assunto, texto: m.texto }, 'E-mail (console)')
      return {}
    },
  }
}

/** Guarda as mensagens em memória (testes). */
export function provedorMemoria(): ProvedorEmail & { enviados: Mensagem[] } {
  const enviados: Mensagem[] = []
  return {
    nome: 'memoria',
    enviados,
    async enviar(_remetente, m) {
      enviados.push(m)
      return {}
    },
  }
}

export function provedorResend(chave: string): ProvedorEmail {
  return {
    nome: 'resend',
    async enviar(remetente, m) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: remetente,
          to: [m.para],
          subject: m.assunto,
          text: m.texto,
          html: m.html,
        }),
      })
      const corpo = (await r.json().catch(() => ({}))) as { id?: string; message?: string }
      if (!r.ok) throw new Error(`Resend ${r.status}: ${corpo.message ?? 'erro'}`)
      return { id: corpo.id }
    },
  }
}

export async function enfileirarEmail(
  tx: Tx,
  dados: Mensagem & {
    modelo: string
    origem: string
    origemId?: string
    empresaId?: string | null
  },
): Promise<void> {
  // Modelo editado pela Administração: troca o texto padrão, com as mesmas variáveis e botão.
  let m: Mensagem = dados
  if (dados.variaveis) {
    const [v] = await tx
      .select()
      .from(modeloMensagemVersao)
      .where(
        and(eq(modeloMensagemVersao.codigo, dados.modelo), eq(modeloMensagemVersao.ativa, true)),
      )
    if (v) {
      const vars = dados.variaveis
      m = montar(
        dados.para,
        preencherModelo(v.assunto, vars),
        preencherModelo(v.corpo, vars)
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .filter(Boolean),
        dados.botao,
      )
    }
  }
  // Sem "returning": quem enfileira não lê a fila (RLS).
  await tx.insert(envio).values({
    canal: 'email',
    destinatario: dados.para,
    modelo: dados.modelo,
    assunto: m.assunto,
    corpoTexto: m.texto,
    corpoHtml: m.html,
    origem: dados.origem,
    origemId: dados.origemId ?? null,
    empresaId: dados.empresaId ?? null,
  })
}

const MAX_TENTATIVAS = 6

/** Processa a fila uma vez. Devolve quantas mensagens tentou enviar. */
export async function processarFila(
  db: Db,
  provedor: ProvedorEmail,
  remetente: string,
  log: Pick<FastifyBaseLogger, 'error'>,
): Promise<number> {
  return emContexto(db, { sistema: true }, async (tx) => {
    const pendentes = await tx
      .select()
      .from(envio)
      .where(
        and(
          eq(envio.canal, 'email'),
          eq(envio.situacao, 'pendente'),
          lte(envio.proximaTentativaEm, sql`now()`),
        ),
      )
      .orderBy(envio.proximaTentativaEm)
      .limit(20)
      .for('update', { skipLocked: true })
    for (const e of pendentes) {
      const tentativas = e.tentativas + 1
      try {
        const r = await provedor.enviar(remetente, {
          para: e.destinatario,
          assunto: e.assunto ?? '',
          texto: e.corpoTexto,
          html: e.corpoHtml ?? e.corpoTexto,
        })
        await tx
          .update(envio)
          .set({
            situacao: 'enviado',
            tentativas,
            enviadoEm: sql`now()`,
            provedor: provedor.nome,
            ultimoErro: null,
          })
          .where(eq(envio.id, e.id))
        await tx.insert(envioTentativa).values({ envioId: e.id, sucesso: true, resposta: r })
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : String(erro)
        log.error({ envio: e.id, erro: mensagem }, 'Falha no envio de e-mail')
        // Nova tentativa com espera crescente: 1, 2, 4, 8, 16 minutos.
        const espera = 60_000 * 2 ** (tentativas - 1)
        await tx
          .update(envio)
          .set({
            situacao: tentativas >= MAX_TENTATIVAS ? 'falhou' : 'pendente',
            tentativas,
            ultimoErro: mensagem.slice(0, 1000),
            provedor: provedor.nome,
            proximaTentativaEm: new Date(Date.now() + espera),
          })
          .where(eq(envio.id, e.id))
        await tx
          .insert(envioTentativa)
          .values({ envioId: e.id, sucesso: false, resposta: { erro: mensagem } })
      }
    }
    return pendentes.length
  })
}

/** Tarefa de fundo: confere a fila a cada poucos segundos. */
export function iniciarTarefaEnvio(
  db: Db,
  provedor: ProvedorEmail,
  remetente: string,
  log: Pick<FastifyBaseLogger, 'error'>,
  intervaloMs = 5000,
): () => void {
  let parar = false
  let timer: NodeJS.Timeout | undefined
  const ciclo = async () => {
    try {
      await processarFila(db, provedor, remetente, log)
    } catch (e) {
      log.error({ erro: e }, 'Falha ao processar a fila de envios')
    }
    if (!parar) timer = setTimeout(ciclo, intervaloMs)
  }
  timer = setTimeout(ciclo, 1000)
  return () => {
    parar = true
    clearTimeout(timer)
  }
}
