// Relatórios agendados (04, roteiro do ciclo 8, bloco 4): agendar, enviar agora, a tarefa de fundo
// envia os devidos com as permissões do usuário e reagenda para as 7h do fuso.
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { processarFila } from '../src/nucleo/email'
import { processarAgendados } from '../src/modulos/relatorios-agendados'
import { montar } from './apoio'
import { cantina } from './cantina'

let t: Awaited<ReturnType<typeof montar>>
beforeAll(async () => {
  t = await montar()
})
afterAll(async () => {
  await t.fechar()
})

const silencio = { error: () => {} }

describe('relatórios agendados', () => {
  it('agenda, envia agora e a tarefa envia os devidos', async () => {
    const c = await cantina(t)
    const m = c.master
    await c.recipiente('T1', '1000.00')
    const disp = (await m.get('/api/relatorios-agendados')).corpo
    expect(disp).toMatchObject({ itens: [], disponiveis: ['alertas', 'mes', 'painel', 'estoque'] })

    const novo = await m.post('/api/relatorios-agendados', {
      relatorio: 'painel',
      frequencia: 'semanal',
      estabelecimentoId: c.estab,
    })
    expect(novo.status).toBe(200)
    expect(
      (
        await m.post('/api/relatorios-agendados', {
          relatorio: 'painel',
          frequencia: 'diaria',
          estabelecimentoId: c.estab,
        })
      ).corpo.codigo,
    ).toBe('duplicado')
    const lista = (await m.get('/api/relatorios-agendados')).corpo.itens
    // Próximo envio: segunda-feira às 7h da Bahia (10h UTC).
    const proximo = new Date(lista[0].proximoEnvio)
    expect(proximo.getUTCDay()).toBe(1)
    expect(proximo.getUTCHours()).toBe(10)
    expect(proximo.getTime()).toBeGreaterThan(Date.now())

    // Enviar agora, para conferir.
    const agora = await m.post(`/api/relatorios-agendados/${novo.corpo.id}/enviar`)
    expect(agora.status).toBe(200)
    await processarFila(t.db, t.correio, t.config.EMAIL_REMETENTE, silencio)
    const email = [...t.correio.enviados].reverse().find((x) => x.para === agora.corpo.para)!
    expect(email.assunto).toContain('Painel da cantina')
    expect(email.texto).toContain('Nada a relatar.')
    expect(email.texto).toContain('http://localhost:5173/enotrace/painel')

    // A tarefa de fundo: o devido sai e volta para a semana seguinte.
    await m.post('/api/relatorios-agendados', {
      relatorio: 'alertas',
      frequencia: 'diaria',
      estabelecimentoId: c.estab,
    })
    await t.dbDono.execute(
      sql`update relatorio_agendado set proximo_envio = now() - interval '1 hour' where usuario_id = (select usuario_id from relatorio_agendado where id = ${novo.corpo.id})`,
    )
    const antes = t.correio.enviados.length
    expect(await processarAgendados(t.db, 'http://localhost:5173', silencio)).toBe(2)
    await processarFila(t.db, t.correio, t.config.EMAIL_REMETENTE, silencio)
    const novos = t.correio.enviados.slice(antes).map((x) => x.assunto)
    expect(novos).toHaveLength(2)
    expect(novos.some((a) => a.includes('Resumo dos alertas abertos'))).toBe(true)
    const depois = (await m.get('/api/relatorios-agendados')).corpo.itens as Array<{
      proximoEnvio: string
      ultimoEnvio: string | null
      ultimoAviso: string | null
    }>
    for (const x of depois) {
      expect(new Date(x.proximoEnvio).getTime()).toBeGreaterThan(Date.now())
      expect(x.ultimoEnvio).toBeTruthy()
      expect(x.ultimoAviso).toBeNull()
    }
    expect(await processarAgendados(t.db, 'http://localhost:5173', silencio)).toBe(0)

    // Pausar e excluir; quem não vê a tela não agenda.
    await m.put(`/api/relatorios-agendados/${novo.corpo.id}`, {
      frequencia: 'mensal',
      ativo: false,
    })
    expect((await m.get('/api/relatorios-agendados')).corpo.itens[0]).toMatchObject({
      frequencia: 'mensal',
      ativo: false,
    })
    await m.post(`/api/relatorios-agendados/${novo.corpo.id}/excluir`)
    expect((await m.get('/api/relatorios-agendados')).corpo.itens).toHaveLength(1)
    const cantineiro = (await t.convidar(m, 'Cantineiro', [c.estab])).cliente
    expect(
      (
        await cantineiro.post('/api/relatorios-agendados', {
          relatorio: 'mes',
          frequencia: 'mensal',
          estabelecimentoId: c.estab,
        })
      ).status,
    ).toBe(403)
  })
})
