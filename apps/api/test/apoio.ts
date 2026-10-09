// Apoio aos testes: app com e-mail em memória, banco de teste e atalhos dos fluxos.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { criarApp } from '../src/app'
import { lerConfig } from '../src/config'
import { criarBanco } from '../src/db/cliente'
import * as schema from '../src/db/schema'
import { PERFIL_ADMINISTRADOR } from '../src/db/referencia'
import { armazenamentoEmDisco } from '../src/nucleo/armazenamento'
import { consultasPublicas } from '../src/nucleo/consultas-publicas'
import { processarFila, provedorMemoria } from '../src/nucleo/email'
import { cifrar, codigoTotp, gerarHashSenha } from '../src/nucleo/seguranca'
import { and, eq } from 'drizzle-orm'

try {
  process.loadEnvFile('.env')
} catch {
  // Sem .env (ex.: verificação no GitHub): as variáveis vêm do ambiente.
}

export const SENHA = 'senha-de-teste-123'

export function gerarCnpj(): string {
  const base = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('')
  const dv = (b: string, pesos: number[]) => {
    const soma = [...b].reduce((t, c, i) => t + Number(c) * pesos[i]!, 0)
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  const d1 = dv(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = dv(base + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return `${base}${d1}${d2}`
}

export function emailAleatorio(prefixo = 'pessoa'): string {
  return `${prefixo}.${Math.random().toString(36).slice(2, 10)}@teste.vinicycle.com`
}

export function fichaPj(nome: string) {
  return {
    tipoPessoa: 'juridica',
    nome,
    documento: gerarCnpj(),
    enderecos: [
      {
        rotulo: 'principal',
        cep: '48900000',
        logradouro: 'Rodovia BA-210',
        numero: 'km 5',
        municipio: 'Juazeiro',
        codigoIbge: '2918407',
        uf: 'BA',
        principal: true,
      },
    ],
    contatos: [{ tipo: 'email', valor: 'contato@exemplo.com.br', principal: true }],
  }
}

export async function montar() {
  const config = lerConfig({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: process.env.DATABASE_URL_TESTE,
    URL_APLICACAO: 'http://localhost:5173',
    ARMAZENAMENTO_DIR: mkdtempSync(path.join(tmpdir(), 'vinicycle-teste-')),
    EMAIL_PROVEDOR: 'memoria',
  })
  const { pool, db } = criarBanco(config.DATABASE_URL, 5)
  const dono = new pg.Pool({ connectionString: process.env.DATABASE_URL_DONO_TESTE, max: 2 })
  const dbDono = drizzle(dono, { schema })
  const app = await criarApp(
    {
      config,
      db,
      armazenamento: armazenamentoEmDisco(config.ARMAZENAMENTO_DIR),
      // Sem rede nos testes: o ViaCEP responde só um CEP conhecido.
      consultas: consultasPublicas(async (url) => {
        if (url.includes('viacep.com.br/ws/48900000')) {
          return {
            logradouro: 'Rua Teste',
            bairro: 'Centro',
            localidade: 'Juazeiro',
            uf: 'BA',
            ibge: '2918407',
          }
        }
        return null
      }),
    },
    // LOG_TESTE=1 mostra os erros internos da API.
    { logger: process.env.LOG_TESTE ? { level: 'error' } : false },
  )
  const correio = provedorMemoria()
  const silencio = { error: () => {} }

  /** Envia os e-mails da fila e devolve o último link recebido pelo endereço. */
  async function ultimoLink(para: string): Promise<string> {
    // A fila é processada em lotes: esvazia antes de olhar.
    while ((await processarFila(db, correio, config.EMAIL_REMETENTE, silencio)) > 0);
    const m = [...correio.enviados].reverse().find((x) => x.para === para)
    if (!m) throw new Error(`Nenhum e-mail para ${para}`)
    return m.texto.match(/https?:\/\/\S+/)![0]
  }
  async function ultimoCodigo(para: string): Promise<string> {
    // A fila é processada em lotes: esvazia antes de olhar.
    while ((await processarFila(db, correio, config.EMAIL_REMETENTE, silencio)) > 0);
    const m = [...correio.enviados].reverse().find((x) => x.para === para)
    return m!.texto.match(/\b\d{6}\b/)![0]
  }

  /** Cliente HTTP com cookie de sessão. */
  function cliente() {
    let cookie = ''
    const chamar = async (metodo: 'GET' | 'POST' | 'PUT', url: string, corpo?: unknown) => {
      const r = await app.inject({
        method: metodo,
        url,
        headers: {
          cookie,
          ...(metodo === 'GET' ? {} : { 'x-vinicycle': '1', 'content-type': 'application/json' }),
        },
        payload: corpo === undefined ? undefined : JSON.stringify(corpo),
      })
      const sc = r.headers['set-cookie']
      const novo = (Array.isArray(sc) ? sc : sc ? [sc] : [])
        .map((c) => c.split(';')[0]!)
        .find((c) => c.startsWith('vinicycle_sessao='))
      if (novo) cookie = novo
      return { status: r.statusCode, corpo: r.body ? JSON.parse(r.body) : null, bruto: r }
    }
    return {
      get: (url: string) => chamar('GET', url),
      post: (url: string, corpo: unknown = {}) => chamar('POST', url, corpo),
      put: (url: string, corpo: unknown) => chamar('PUT', url, corpo),
      get cookie() {
        return cookie
      },
    }
  }

  /** Administrador da plataforma com segundo fator conferido. */
  async function admin() {
    const email = emailAleatorio('admin')
    const segredo = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
    const [f] = await dbDono
      .insert(schema.ficha)
      .values({ dono: 'usuario', tipoPessoa: 'fisica', nome: 'Admin Teste' })
      .returning()
    const [u] = await dbDono
      .insert(schema.usuario)
      .values({
        email,
        fichaId: f!.id,
        senhaHash: await gerarHashSenha(SENHA),
        totpSegredoCifrado: cifrar(config.CHAVE_CIFRA, segredo),
        totpAtivoEm: new Date(),
      })
      .returning()
    const [perfil] = await dbDono
      .select()
      .from(schema.perfil)
      .where(
        and(eq(schema.perfil.escopo, 'plataforma'), eq(schema.perfil.codigo, PERFIL_ADMINISTRADOR)),
      )
    await dbDono.insert(schema.equipeMembro).values({ usuarioId: u!.id, perfilId: perfil!.id })
    const c = cliente()
    await c.post('/api/auth/entrar', { email, senha: SENHA })
    const r = await c.post('/api/auth/segundo-fator/conferir', { codigo: codigoTotp(segredo) })
    if (r.status !== 200) throw new Error(JSON.stringify(r.corpo))
    return { cliente: c, email, usuarioId: u!.id }
  }

  /** Cria uma empresa pela Administração e devolve o Master já com sessão. */
  async function empresaComMaster(
    opcoes: { emTeste?: boolean; inicio?: string; planoId?: string } = {},
  ) {
    const { cliente: adm } = await admin()
    const planos = await adm.get('/api/plataforma/planos')
    const emailMaster = emailAleatorio('master')
    const nome = `Vinícola ${Math.random().toString(36).slice(2, 7)}`
    const r = await adm.post('/api/plataforma/empresas', {
      ficha: fichaPj(nome),
      emailMaster,
      planoId:
        opcoes.planoId ??
        (planos.corpo.find((p: { nome: string }) => p.nome === 'Completo') ?? planos.corpo[0]).id,
      periodicidade: 'mensal',
      inicio: opcoes.inicio ?? '2026-10-03',
      emTeste: opcoes.emTeste ?? false,
    })
    if (r.status !== 200) throw new Error(JSON.stringify(r.corpo))
    const link = await ultimoLink(emailMaster)
    const token = link.split('/convite/')[1]!
    const master = cliente()
    const aceite = await master.post(`/api/convites/${token}/aceitar`, {
      ficha: { tipoPessoa: 'fisica', nome: 'Maria Master' },
      senha: SENHA,
      aceiteTermos: true,
    })
    if (aceite.status !== 200) throw new Error(JSON.stringify(aceite.corpo))
    return { empresaId: r.corpo.id as string, adm, master, emailMaster, nome }
  }

  async function criarEstabelecimento(c: ReturnType<typeof cliente>, nome = 'Cantina') {
    const r = await c.post('/api/estabelecimentos', {
      ficha: fichaPj(nome),
      fuso: 'America/Bahia',
      atividadesMapa: ['produtor'],
    })
    if (r.status !== 200) throw new Error(JSON.stringify(r.corpo))
    return r.corpo.id as string
  }

  /** Convida e aceita: devolve o cliente do novo usuário. */
  async function convidar(
    master: ReturnType<typeof cliente>,
    perfilCodigoOuId: string,
    estabelecimentos: string[] = [],
  ) {
    let perfilId = perfilCodigoOuId
    if (!/^[0-9a-f-]{36}$/.test(perfilCodigoOuId)) {
      const perfis = await master.get('/api/perfis')
      perfilId = perfis.corpo.find((p: { nome: string }) => p.nome === perfilCodigoOuId).id
    }
    const email = emailAleatorio()
    const r = await master.post('/api/usuarios/convites', { email, perfilId, estabelecimentos })
    if (r.status !== 200) throw new Error(JSON.stringify(r.corpo))
    const token = (await ultimoLink(email)).split('/convite/')[1]!
    const c = cliente()
    const a = await c.post(`/api/convites/${token}/aceitar`, {
      ficha: { tipoPessoa: 'fisica', nome: 'Pessoa Convidada' },
      senha: SENHA,
      aceiteTermos: true,
    })
    if (a.status !== 200) throw new Error(JSON.stringify(a.corpo))
    return { cliente: c, email }
  }

  async function fechar() {
    await app.close()
    await pool.end()
    await dono.end()
  }

  return {
    app,
    config,
    db,
    dbDono,
    correio,
    cliente,
    admin,
    empresaComMaster,
    criarEstabelecimento,
    convidar,
    ultimoLink,
    ultimoCodigo,
    fechar,
  }
}
