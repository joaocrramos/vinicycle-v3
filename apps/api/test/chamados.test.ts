// Suporte: chamados (ciclo 12, bloco 3).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { processarFila } from '../src/nucleo/email'
import { montar } from './apoio'

let t: Awaited<ReturnType<typeof montar>>
const silencio = { error: () => {} }
beforeAll(async () => {
  t = await montar()
})
afterAll(async () => {
  await t.fechar()
})

async function emails(para: string) {
  while ((await processarFila(t.db, t.correio, t.config.EMAIL_REMETENTE, silencio)) > 0);
  return t.correio.enviados.filter((m) => m.para === para)
}

const chamado = (extra: Record<string, unknown> = {}) => ({
  assunto: 'Não consigo fechar o mês',
  categoria: 'Erro no sistema',
  prioridade: 'alta',
  descricao: 'Ao fechar setembro aparece um erro de saldo.',
  ...extra,
})

describe('chamados', () => {
  it('cliente abre, a equipe é avisada, responde e a nota interna não aparece ao cliente', async () => {
    const { master, emailMaster } = await t.empresaComMaster()
    const { cliente: adm, email: emailAdm } = await t.admin()
    const r = await master.post('/api/chamados', chamado())
    expect(r.status).toBe(200)
    expect(
      (await emails(emailAdm)).some((m) =>
        m.assunto.startsWith(`Chamado ${r.corpo.numero} (Alta)`),
      ),
    ).toBe(true)

    const fila = (await adm.get('/api/plataforma/chamados?situacao=abertos&tamanho=100')).corpo
      .itens
    const meu = fila.find((x: { id: string }) => x.id === r.corpo.id)
    expect(meu).toMatchObject({ situacao: 'aberto', semaforo: 'verde', prioridade: 'alta' })

    await adm.post(`/api/plataforma/chamados/${r.corpo.id}/mensagens`, {
      texto: 'Verificar o estoque de rolhas.',
      interna: true,
    })
    await adm.post(`/api/plataforma/chamados/${r.corpo.id}/mensagens`, {
      texto: 'Olá! Pode enviar a tela do erro?',
      interna: false,
    })
    const resposta = (await emails(emailMaster)).find((m) =>
      m.assunto.startsWith(`Resposta ao chamado ${r.corpo.numero}`),
    )
    expect(resposta?.texto).toContain('Pode enviar a tela do erro?')

    const visto = (await master.get(`/api/chamados/${r.corpo.id}`)).corpo
    expect(visto.situacao).toBe('em_atendimento')
    expect(visto.mensagens.map((m: { texto: string }) => m.texto)).toEqual([
      'Ao fechar setembro aparece um erro de saldo.',
      'Olá! Pode enviar a tela do erro?',
    ])
    const naEquipe = (await adm.get(`/api/plataforma/chamados/${r.corpo.id}`)).corpo
    expect(naEquipe.mensagens).toHaveLength(3)
    expect(naEquipe.semaforo).toBe('respondido')

    // Aguardando o cliente: a resposta dele devolve o chamado à equipe.
    await adm.post(`/api/plataforma/chamados/${r.corpo.id}/situacao`, {
      situacao: 'aguardando_cliente',
    })
    await master.post(`/api/chamados/${r.corpo.id}/mensagens`, { texto: 'Segue em anexo.' })
    expect((await master.get(`/api/chamados/${r.corpo.id}`)).corpo.situacao).toBe('em_atendimento')
    expect((await master.post(`/api/chamados/${r.corpo.id}/fechar`, {})).status).toBe(200)
    expect(
      (await master.post(`/api/chamados/${r.corpo.id}/mensagens`, { texto: 'mais' })).status,
    ).toBe(422)
  })

  it('cada usuário vê os seus; o Master vê os da empresa; outra empresa não vê', async () => {
    const { master } = await t.empresaComMaster()
    const { cliente: enologo } = await t.convidar(master, 'Enólogo')
    const doMaster = (await master.post('/api/chamados', chamado())).corpo.id
    const doEnologo = (await enologo.post('/api/chamados', chamado({ prioridade: 'baixa' }))).corpo
      .id
    expect((await master.get('/api/chamados')).corpo.map((c: { id: string }) => c.id)).toEqual(
      expect.arrayContaining([doMaster, doEnologo]),
    )
    expect((await enologo.get('/api/chamados')).corpo.map((c: { id: string }) => c.id)).toEqual([
      doEnologo,
    ])
    expect((await enologo.get(`/api/chamados/${doMaster}`)).status).toBe(404)
    const outra = await t.empresaComMaster()
    expect((await outra.master.get(`/api/chamados/${doMaster}`)).status).toBe(404)
  })

  it('página pública: liga ao cliente pelo CNPJ e confirma por e-mail', async () => {
    const { empresaId, adm } = await t.empresaComMaster()
    const ficha = (await adm.get(`/api/plataforma/empresas/${empresaId}`)).corpo.ficha
    const publico = t.cliente()
    const r = await publico.post('/api/suporte/publico', {
      nome: 'José',
      email: 'jose@exemplo.com.br',
      cnpj: ficha.documento,
      assunto: 'Esqueci quem é o Master',
      descricao: 'O Master saiu da empresa e ninguém consegue entrar.',
    })
    expect(r.status).toBe(200)
    expect((await emails('jose@exemplo.com.br'))[0]!.assunto).toBe(
      `Recebemos o seu chamado ${r.corpo.numero}`,
    )
    const lista = (await adm.get(`/api/plataforma/chamados?empresaId=${empresaId}`)).corpo.itens
    expect(lista[0]).toMatchObject({ origem: 'publico', solicitante: 'José' })

    const desconhecido = await publico.post('/api/suporte/publico', {
      nome: 'Ana',
      email: 'ana@exemplo.com.br',
      cnpj: '11.111.111/0001-91',
      assunto: 'Quero conhecer',
      descricao: 'Gostaria de uma demonstração do sistema.',
    })
    expect(desconhecido.status).toBe(200)
  })

  it('prazo por plano e por cliente; anexo do cliente aberto pela equipe; resumo', async () => {
    const { master, empresaId, adm } = await t.empresaComMaster()
    await adm.put('/api/plataforma/chamados-prazos', {
      planoId: null,
      empresaId,
      horas: { urgente: 2 },
    })
    const r = await master.post('/api/chamados', chamado({ prioridade: 'urgente' }))
    const c = (await adm.get(`/api/plataforma/chamados/${r.corpo.id}`)).corpo
    const horas = (new Date(c.prazoEm).getTime() - new Date(c.criadoEm).getTime()) / 3_600_000
    expect(Math.round(horas)).toBe(2)

    const corpo = Buffer.concat([
      Buffer.from(
        '--x\r\nContent-Disposition: form-data; name="arquivo"; filename="erro.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4 erro\r\n--x--\r\n',
      ),
    ])
    const up = await t.app.inject({
      method: 'POST',
      url: `/api/chamados/${r.corpo.id}/anexos`,
      headers: {
        cookie: master.cookie,
        'x-vinicycle': '1',
        'content-type': 'multipart/form-data; boundary=x',
      },
      payload: corpo,
    })
    expect(up.statusCode).toBe(200)
    const anexo = (await adm.get(`/api/plataforma/chamados/${r.corpo.id}`)).corpo.anexos[0]
    const arq = await t.app.inject({
      method: 'GET',
      url: `/api/plataforma/chamados/${r.corpo.id}/anexos/${anexo.id}`,
      headers: { cookie: adm.cookie },
    })
    expect(arq.body).toContain('%PDF-1.4 erro')

    const resumo = (await adm.get('/api/plataforma/chamados-resumo')).corpo
    expect(
      resumo.find((x: { categoria: string }) => x.categoria === 'Erro no sistema').total,
    ).toBeGreaterThan(0)
  })
})
