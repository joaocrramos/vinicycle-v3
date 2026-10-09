// Ponto de entrada da API em desenvolvimento e produção.
import { criarApp } from './app'
import { lerConfig } from './config'
import { criarBanco } from './db/cliente'
import { armazenamentoEmDisco } from './nucleo/armazenamento'
import { iniciarTarefaEnvio, provedorConsole, provedorResend } from './nucleo/email'
import { iniciarTarefaCobranca } from './modulos/cobranca'
import { iniciarTarefaIntegracoes } from './modulos/integracoes'
import { iniciarTarefaMensagens } from './modulos/mensagens'
import { iniciarTarefaRelatorios } from './modulos/relatorios-agendados'

const config = lerConfig()
const { pool, db } = criarBanco(config.DATABASE_URL)
const app = await criarApp(
  { config, db, armazenamento: armazenamentoEmDisco(config.ARMAZENAMENTO_DIR) },
  {
    logger:
      config.NODE_ENV === 'development'
        ? {
            level: 'info',
            transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss' } },
          }
        : { level: 'info' },
  },
)
const provedor =
  config.EMAIL_PROVEDOR === 'resend'
    ? provedorResend(config.RESEND_API_KEY!)
    : provedorConsole(app.log)
const pararEnvios = iniciarTarefaEnvio(db, provedor, config.EMAIL_REMETENTE, app.log)
const pararRelatorios = iniciarTarefaRelatorios(db, config.URL_APLICACAO, app.log)
const pararCobranca = iniciarTarefaCobranca(db, config.URL_APLICACAO, app.log)
const pararIntegracoes = iniciarTarefaIntegracoes(db, config.CHAVE_CIFRA, app.log)
const pararMensagens = iniciarTarefaMensagens(db, config.CHAVE_CIFRA, app.log)

for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sinal, async () => {
    pararEnvios()
    pararRelatorios()
    pararCobranca()
    pararIntegracoes()
    pararMensagens()
    await app.close()
    await pool.end()
    process.exit(0)
  })
}

await app.listen({ port: config.PORTA, host: config.HOST })
