// Entrada, senha, sessões e segundo fator (P10, P14, P21).
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as s from '../src/db/schema'
import { codigoTotp, conferirTotp, decifrar } from '../src/nucleo/seguranca'
import { montar, SENHA } from './apoio'

let t: Awaited<ReturnType<typeof montar>>
beforeAll(async () => {
  t = await montar()
})
afterAll(async () => {
  await t.fechar()
})

describe('entrada', () => {
  it('entra, lê a sessão e sai', async () => {
    const { emailMaster } = await t.empresaComMaster()
    const c = t.cliente()
    expect((await c.get('/api/auth/sessao')).status).toBe(401)
    const r = await c.post('/api/auth/entrar', { email: emailMaster.toUpperCase(), senha: SENHA })
    expect(r.status).toBe(200)
    expect(r.corpo.usuario.email).toBe(emailMaster)
    expect(c.cookie).toMatch(/^vinicycle_sessao=/)
    expect((await c.post('/api/auth/sair')).status).toBe(200)
    // O cookie antigo não vale mais.

    await t.app
      .inject({ method: 'GET', url: '/api/auth/sessao', headers: { cookie: c.cookie } })
      .then((x) => {
        expect(x.statusCode).toBe(401)
      })
  })

  it('cinco erros seguidos bloqueiam a conta por 15 minutos (P21)', async () => {
    const { emailMaster } = await t.empresaComMaster()
    const c = t.cliente()
    for (let i = 0; i < 5; i++) {
      const r = await c.post('/api/auth/entrar', { email: emailMaster, senha: 'errada-errada' })
      expect(r.status).toBe(401)
    }
    const certa = await c.post('/api/auth/entrar', { email: emailMaster, senha: SENHA })
    expect(certa.status).toBe(401)
    expect(certa.corpo.mensagem).toMatch(/bloqueada/)
    const [u] = await t.dbDono.select().from(s.usuario).where(eq(s.usuario.email, emailMaster))
    const falhas = await t.dbDono
      .select()
      .from(s.auditoria)
      .where(and(eq(s.auditoria.registroId, u!.id), eq(s.auditoria.acao, 'login_falha')))
    expect(falhas).toHaveLength(5)
  })

  it('e-mail desconhecido recebe a mesma resposta', async () => {
    const r = await t
      .cliente()
      .post('/api/auth/entrar', { email: 'ninguem@teste.vinicycle.com', senha: 'qualquer-coisa' })
    expect(r.status).toBe(401)
    expect(r.corpo.mensagem).toBe('E-mail ou senha incorretos.')
  })

  it('pedido de outra origem é recusado (CSRF)', async () => {
    const r = await t.app.inject({
      method: 'POST',
      url: '/api/auth/entrar',
      headers: {
        origin: 'https://site-malicioso.com',
        'x-vinicycle': '1',
        'content-type': 'application/json',
      },
      payload: '{}',
    })
    expect(r.statusCode).toBe(403)
    const semCabecalho = await t.app.inject({ method: 'POST', url: '/api/auth/sair' })
    expect(semCabecalho.statusCode).toBe(403)
  })
})

describe('senha', () => {
  it('"esqueci minha senha" troca a senha e encerra as sessões (P10)', async () => {
    const { emailMaster, master } = await t.empresaComMaster()
    expect((await t.cliente().post('/api/auth/senha/esqueci', { email: emailMaster })).status).toBe(
      200,
    )
    const link = await t.ultimoLink(emailMaster)
    const token = new URL(link).searchParams.get('token')!
    const curta = await t.cliente().post('/api/auth/senha/redefinir', { token, senha: 'curta' })
    expect(curta.status).toBe(400)
    const nova = 'nova-senha-segura-456'
    expect(
      (await t.cliente().post('/api/auth/senha/redefinir', { token, senha: nova })).status,
    ).toBe(200)
    expect(
      (await t.cliente().post('/api/auth/senha/redefinir', { token, senha: nova })).status,
    ).toBe(422)
    expect((await master.get('/api/auth/sessao')).status).toBe(401)
    expect(
      (await t.cliente().post('/api/auth/entrar', { email: emailMaster, senha: nova })).status,
    ).toBe(200)
  })

  it('troca com sessão aberta usa código no e-mail e mantém só a sessão atual', async () => {
    const { emailMaster, master } = await t.empresaComMaster()
    const outra = t.cliente()
    await outra.post('/api/auth/entrar', { email: emailMaster, senha: SENHA })
    expect((await master.post('/api/eu/senha/codigo')).status).toBe(200)
    const codigo = await t.ultimoCodigo(emailMaster)
    const errado = codigo === '000000' ? '111111' : '000000'
    expect(
      (await master.post('/api/eu/senha', { codigo: errado, senha: 'outra-senha-boa-1' })).status,
    ).toBe(400)
    expect(
      (await master.post('/api/eu/senha', { codigo, senha: 'outra-senha-boa-1' })).status,
    ).toBe(200)
    expect((await master.get('/api/auth/sessao')).status).toBe(200)
    expect((await outra.get('/api/auth/sessao')).status).toBe(401)
  })
})

describe('administrador inicial', () => {
  it('a criação da base cria admin@vinicycle.com, sem senha, e não o duplica', async () => {
    const { carregarReferencia, ADMIN_INICIAL } = await import('../src/db/referencia')
    await carregarReferencia(t.dbDono)
    const contas = await t.dbDono
      .select()
      .from(s.usuario)
      .where(eq(s.usuario.email, ADMIN_INICIAL.email))
    expect(contas).toHaveLength(1)
    expect(contas[0]!.senhaHash).toBeNull()
    const [membro] = await t.dbDono
      .select()
      .from(s.equipeMembro)
      .where(eq(s.equipeMembro.usuarioId, contas[0]!.id))
    expect(membro?.ativo).toBe(true)
    // A senha é definida por "Esqueci minha senha".
    expect(
      (await t.cliente().post('/api/auth/senha/esqueci', { email: ADMIN_INICIAL.email })).status,
    ).toBe(200)
    expect(await t.ultimoLink(ADMIN_INICIAL.email)).toContain('/redefinir-senha?token=')
  })
})

describe('segundo fator (P21)', () => {
  it('a Administração exige o segundo fator', async () => {
    const { cliente: adm, usuarioId } = await t.admin()
    expect((await adm.get('/api/plataforma/empresas')).status).toBe(200)
    // Nova sessão sem o código: barrada.
    const [u] = await t.dbDono.select().from(s.usuario).where(eq(s.usuario.id, usuarioId))
    const c = t.cliente()
    await c.post('/api/auth/entrar', { email: u!.email, senha: SENHA })
    const r = await c.get('/api/plataforma/empresas')
    expect(r.status).toBe(403)
    expect(r.corpo.codigo).toBe('segundo_fator')
    expect((await c.post('/api/auth/segundo-fator/conferir', { codigo: '000000' })).status).toBe(
      400,
    )
    const segredo = decifrar(t.config.CHAVE_CIFRA, u!.totpSegredoCifrado!)
    expect(
      (await c.post('/api/auth/segundo-fator/conferir', { codigo: codigoTotp(segredo) })).status,
    ).toBe(200)
    expect((await c.get('/api/plataforma/empresas')).status).toBe(200)
  })

  it('usuário de empresa não entra na Administração', async () => {
    const { master } = await t.empresaComMaster()
    expect((await master.get('/api/plataforma/empresas')).status).toBe(403)
  })

  it('configuração do segundo fator', async () => {
    const { master, emailMaster } = await t.empresaComMaster()
    const ini = await master.post('/api/auth/segundo-fator/iniciar')
    expect(ini.status).toBe(200)
    expect(ini.corpo.uri).toContain('otpauth://totp/')
    expect(ini.corpo.qrSvg).toContain('<svg')
    expect(
      (
        await master.post('/api/auth/segundo-fator/ativar', {
          codigo: codigoTotp(ini.corpo.segredo),
        })
      ).status,
    ).toBe(200)
    const [u] = await t.dbDono.select().from(s.usuario).where(eq(s.usuario.email, emailMaster))
    expect(u!.totpAtivoEm).not.toBeNull()
    // O segredo fica cifrado no banco.
    expect(u!.totpSegredoCifrado).not.toContain(ini.corpo.segredo)
  })

  it('TOTP confere com o vetor da RFC 6238', () => {
    // Segredo "12345678901234567890" em base32; instante 59 s → 94287082 (8 dígitos), 287082 com 6.
    const segredo = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
    expect(codigoTotp(segredo, 59_000)).toBe('287082')
    expect(conferirTotp(segredo, '287082', 59_000)).toBe(true)
    expect(conferirTotp(segredo, '287083', 59_000)).toBe(false)
  })
})

describe('sessões e anexos', () => {
  it('o usuário vê e encerra as próprias sessões (P10)', async () => {
    const { emailMaster, master } = await t.empresaComMaster()
    const outra = t.cliente()
    await outra.post('/api/auth/entrar', { email: emailMaster, senha: SENHA })
    const lista = await master.get('/api/eu/sessoes')
    expect(lista.corpo).toHaveLength(2)
    const alvo = lista.corpo.find((x: { atual: boolean }) => !x.atual)
    expect((await master.post(`/api/eu/sessoes/${alvo.id}/encerrar`)).status).toBe(200)
    expect((await outra.get('/api/auth/sessao')).status).toBe(401)
  })

  it('anexa, lista, baixa e remove (P15)', async () => {
    const { master } = await t.empresaComMaster()
    const estab = await t.criarEstabelecimento(master)
    const corpo = Buffer.concat([
      Buffer.from(
        '--x\r\nContent-Disposition: form-data; name="entidade"\r\n\r\nestabelecimento\r\n',
      ),
      Buffer.from(`--x\r\nContent-Disposition: form-data; name="registroId"\r\n\r\n${estab}\r\n`),
      Buffer.from('--x\r\nContent-Disposition: form-data; name="categoria"\r\n\r\ncertificado\r\n'),
      Buffer.from(
        '--x\r\nContent-Disposition: form-data; name="arquivo"; filename="registro MAPA.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4 teste\r\n--x--\r\n',
      ),
    ])
    const enviar = () =>
      t.app.inject({
        method: 'POST',
        url: '/api/anexos',
        headers: {
          cookie: master.cookie,
          'x-vinicycle': '1',
          'content-type': 'multipart/form-data; boundary=x',
        },
        payload: corpo,
      })
    const r = await enviar()
    expect(r.statusCode).toBe(200)
    expect((await enviar()).statusCode).toBe(422)
    const lista = await master.get(`/api/anexos?entidade=estabelecimento&registroId=${estab}`)
    expect(lista.corpo).toHaveLength(1)
    expect(lista.corpo[0].nomeOriginal).toBe('registro MAPA.pdf')
    const baixa = await t.app.inject({
      method: 'GET',
      url: `/api/anexos/${lista.corpo[0].id}/arquivo`,
      headers: { cookie: master.cookie },
    })
    expect(baixa.body).toBe('%PDF-1.4 teste')
    const [a] = await t.dbDono.select().from(s.anexo).where(eq(s.anexo.registroId, estab))
    expect(a!.caminho).toBe(`${a!.empresaId}/${estab}/estabelecimento/${estab}/${a!.id}`)
    expect(
      (await master.post(`/api/anexos/${a!.id}/inativar`, { motivo: 'Enviado por engano' })).status,
    ).toBe(200)
    expect(
      (await master.get(`/api/anexos?entidade=estabelecimento&registroId=${estab}`)).corpo,
    ).toHaveLength(0)
    const hist = await master.get(`/api/historico/estabelecimento/${estab}`)
    expect(hist.corpo.map((h: { acao: string }) => h.acao).slice(0, 2)).toEqual([
      'remover_anexo',
      'anexar',
    ])
  })
})
