// Parte comercial (ciclo 11): planos, adicionais, assinatura, faturas e régua.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fimDoCiclo, somarDias } from '@vinicycle/shared'
import { processarCobranca } from '../src/modulos/cobranca'
import { processarRegua } from '../src/modulos/regua'
import { processarFila } from '../src/nucleo/email'
import { hoje } from '../src/modulos/planos'
import { montar } from './apoio'

let t: Awaited<ReturnType<typeof montar>>
beforeAll(async () => {
  t = await montar()
})
afterAll(async () => {
  await t.fechar()
})

const sufixo = () => Math.random().toString(36).slice(2, 7)

export function dadosPlano(nome: string, extra: Record<string, unknown> = {}) {
  return {
    nome,
    descricao: 'Plano de teste',
    modulos: ['ENOTRACE'],
    limiteEstabelecimentos: 2,
    limiteUsuarios: 5,
    limiteArmazenamentoGb: '10',
    formasPagamento: ['pix', 'boleto'],
    precos: [
      { periodicidade: 'mensal', valor: '300.00' },
      { periodicidade: 'anual', valor: '3000.00' },
    ],
    precosDesde: '2026-01-01',
    ...extra,
  }
}

describe('planos e adicionais', () => {
  it('cria o plano com preços, módulos e formas; a Gestão entra sempre', async () => {
    const { cliente: adm } = await t.admin()
    const nome = `Plano ${sufixo()}`
    const r = await adm.post('/api/plataforma/planos', dadosPlano(nome))
    expect(r.status).toBe(200)
    const lista = await adm.get('/api/plataforma/planos?todos=1')
    const p = lista.corpo.find((x: { id: string }) => x.id === r.corpo.id)
    expect(p).toMatchObject({
      nome,
      modulos: ['GESTAO', 'ENOTRACE'],
      formasPagamento: ['pix', 'boleto'],
      precos: { mensal: '300.00', anual: '3000.00' },
      limiteUsuarios: 5,
    })
    const repetido = await adm.post('/api/plataforma/planos', dadosPlano(nome))
    expect(repetido.status).toBe(422)
  })

  it('preço novo com data futura não muda o vigente; inativo sai da venda', async () => {
    const { cliente: adm } = await t.admin()
    const r = await adm.post('/api/plataforma/planos', dadosPlano(`Plano ${sufixo()}`))
    const id = r.corpo.id
    const futuro = '2099-01-01'
    const e = await adm.put(
      `/api/plataforma/planos/${id}`,
      dadosPlano(`Plano ${sufixo()}`, {
        precos: [
          { periodicidade: 'mensal', valor: '350.00' },
          { periodicidade: 'anual', valor: '3000.00' },
        ],
        precosDesde: futuro,
      }),
    )
    expect(e.status).toBe(200)
    let p = (await adm.get('/api/plataforma/planos?todos=1')).corpo.find(
      (x: { id: string }) => x.id === id,
    )
    expect(p.precos.mensal).toBe('300.00')
    expect(p.precosFuturos).toEqual([
      { periodicidade: 'mensal', valor: '350.00', vigenteDesde: futuro },
    ])

    expect((await adm.post(`/api/plataforma/planos/${id}/inativar`, {})).status).toBe(400)
    expect(
      (await adm.post(`/api/plataforma/planos/${id}/inativar`, { motivo: 'Fora de linha' })).status,
    ).toBe(200)
    const ativos = await adm.get('/api/plataforma/planos')
    expect(ativos.corpo.some((x: { id: string }) => x.id === id)).toBe(false)
    p = (await adm.get('/api/plataforma/planos?todos=1')).corpo.find(
      (x: { id: string }) => x.id === id,
    )
    expect(p).toMatchObject({ ativo: false, motivoInativacao: 'Fora de linha' })
  })

  it('adicional: módulo avulso exige o módulo; o tipo não muda', async () => {
    const { cliente: adm } = await t.admin()
    const base = {
      nome: `Usuário extra ${sufixo()}`,
      tipo: 'usuario',
      quantidadePorUnidade: 1,
      precos: [{ periodicidade: 'mensal', valor: '29.90' }],
      precosDesde: hoje(),
    }
    const u = await adm.post('/api/plataforma/adicionais', base)
    expect(u.status).toBe(200)
    expect((await adm.post('/api/plataforma/adicionais', { ...base, tipo: 'modulo' })).status).toBe(
      400,
    )
    const m = await adm.post('/api/plataforma/adicionais', {
      ...base,
      nome: `VitiTrack avulso ${sufixo()}`,
      tipo: 'modulo',
      moduloCodigo: 'VITITRACK',
    })
    expect(m.status).toBe(200)
    expect(
      (
        await adm.put(`/api/plataforma/adicionais/${u.corpo.id}`, {
          ...base,
          tipo: 'estabelecimento',
        })
      ).status,
    ).toBe(422)
    const lista = await adm.get('/api/plataforma/adicionais')
    expect(lista.corpo.find((x: { id: string }) => x.id === m.corpo.id)).toMatchObject({
      tipo: 'modulo',
      moduloCodigo: 'VITITRACK',
      precos: { mensal: '29.90' },
    })
  })

  it('o cliente não chega aos planos da Administração', async () => {
    const { master } = await t.empresaComMaster()
    expect((await master.get('/api/plataforma/planos')).status).toBe(403)
  })
})

describe('assinatura', () => {
  async function plano(nome: string, mensal: string, extra: Record<string, unknown> = {}) {
    const { cliente: adm } = await t.admin()
    const r = await adm.post(
      '/api/plataforma/planos',
      dadosPlano(`${nome} ${sufixo()}`, {
        precos: [{ periodicidade: 'mensal', valor: mensal }],
        ...extra,
      }),
    )
    if (r.status !== 200) throw new Error(JSON.stringify(r.corpo))
    return r.corpo.id as string
  }
  async function adicional(dados: Record<string, unknown>) {
    const { cliente: adm } = await t.admin()
    const r = await adm.post('/api/plataforma/adicionais', {
      nome: `Adicional ${sufixo()}`,
      quantidadePorUnidade: 1,
      precos: [{ periodicidade: 'mensal', valor: '30.00' }],
      precosDesde: '2026-01-01',
      ...dados,
    })
    if (r.status !== 200) throw new Error(JSON.stringify(r.corpo))
    return r.corpo.id as string
  }

  it('a criação congela o preço e abre o primeiro ciclo', async () => {
    const { master } = await t.empresaComMaster()
    const r = await master.get('/api/assinatura')
    expect(r.status).toBe(200)
    expect(r.corpo).toMatchObject({
      plano: { nome: 'Completo' },
      periodicidade: 'mensal',
      valorContratado: '300.00',
      cicloInicio: '2026-10-03',
      cicloFim: '2026-11-02',
      proximaRenovacao: '2026-11-03',
      // Início no dia 3: o primeiro dia da lista a partir dele.
      diaVencimento: 5,
      descontos: [],
    })
  })

  it('upgrade vale na hora com o proporcional; downgrade fica para a renovação, com aviso', async () => {
    const base = await plano('Base', '200.00', { limiteUsuarios: 1 })
    const maior = await plano('Maior', '500.00')
    const { master, adm, empresaId } = await t.empresaComMaster({ inicio: hoje(), planoId: base })
    // No primeiro dia do ciclo, o proporcional é a diferença inteira.
    const up = await adm.post(`/api/plataforma/empresas/${empresaId}/assinatura/plano`, {
      planoId: maior,
    })
    expect(up.corpo).toMatchObject({ situacao: 'aplicada', valorProporcional: '300.00' })
    let a = (await master.get('/api/assinatura')).corpo
    expect(a.plano.id).toBe(maior)
    expect(a.valorContratado).toBe('500.00')

    // O Master volta ao plano menor: agendado, e o uso (2 usuários) passa do limite dele (1).
    await t.convidar(master, 'Enólogo')
    const down = await master.post('/api/assinatura/plano', { planoId: base })
    expect(down.corpo.situacao).toBe('agendada')
    expect(down.corpo.efeitoEm).toBe(a.proximaRenovacao)
    expect(down.corpo.aviso).toContain('2 usuários')
    a = (await master.get('/api/assinatura')).corpo
    expect(a.plano.id).toBe(maior)
    const agendada = a.mudancas.find((m: { situacao: string }) => m.situacao === 'agendada')
    expect(agendada).toMatchObject({ tipo: 'plano', origem: 'master' })

    const cancelar = await master.post(`/api/assinatura/mudancas/${agendada.id}/cancelar`, {})
    expect(cancelar.status).toBe(200)
    a = (await master.get('/api/assinatura')).corpo
    expect(a.mudancas.some((m: { situacao: string }) => m.situacao === 'agendada')).toBe(false)
  })

  it('adicionais somam ao limite; retirada é agendada; só o Master muda', async () => {
    const usuarios = await adicional({ tipo: 'usuario', quantidadePorUnidade: 1 })
    const viti = await adicional({ tipo: 'modulo', moduloCodigo: 'VITITRACK' })
    const base = await plano('Pequeno', '100.00', { limiteUsuarios: 2 })
    const { master, empresaId, adm } = await t.empresaComMaster({ inicio: hoje(), planoId: base })
    const r = await master.post('/api/assinatura/adicionais', {
      adicionalId: usuarios,
      quantidade: 3,
    })
    expect(r.corpo).toMatchObject({ situacao: 'aplicada', valorProporcional: '90.00' })
    expect(
      (await master.post('/api/assinatura/adicionais', { adicionalId: viti, quantidade: 1 }))
        .status,
    ).toBe(200)
    // O módulo avulso não se contrata duas vezes.
    expect(
      (await master.post('/api/assinatura/adicionais', { adicionalId: viti, quantidade: 1 }))
        .status,
    ).toBe(422)
    let a = (await master.get('/api/assinatura')).corpo
    expect(a.limites.usuarios).toBe(5)
    expect(a.limites.modulos).toContain('VITITRACK')
    expect(a.valorRecorrente).toBe('220.00')

    const item = a.itens.find((i: { adicionalId: string }) => i.adicionalId === usuarios)
    const ret = await master.post(`/api/assinatura/adicionais/${item.id}/retirar`, {
      quantidade: 2,
    })
    expect(ret.corpo.situacao).toBe('agendada')
    a = (await master.get('/api/assinatura')).corpo
    expect(a.limites.usuarios).toBe(5)

    const { cliente: enologo } = await t.convidar(master, 'Enólogo')
    expect((await enologo.post('/api/assinatura/plano', { planoId: base })).status).toBe(403)

    // A Administração vê o mesmo, com o motivo dos descontos.
    const d = await adm.post(`/api/plataforma/empresas/${empresaId}/descontos`, {
      tipo: 'percentual',
      valor: '150',
      motivo: 'Teste',
      inicio: hoje(),
    })
    expect(d.status).toBe(400)
    expect(
      (
        await adm.post(`/api/plataforma/empresas/${empresaId}/descontos`, {
          tipo: 'percentual',
          valor: '100',
          motivo: 'Cliente fundador',
          inicio: hoje(),
        })
      ).status,
    ).toBe(200)
    const vistoPelaPlataforma = (await adm.get(`/api/plataforma/empresas/${empresaId}/assinatura`))
      .corpo
    expect(vistoPelaPlataforma.descontos[0]).toMatchObject({
      valor: '100.00',
      motivo: 'Cliente fundador',
    })
    a = (await master.get('/api/assinatura')).corpo
    expect(a.descontos[0]).toMatchObject({ valor: '100.00', motivo: null })
  })

  it('ciclo novo só com preço; no teste, as mudanças valem na hora', async () => {
    const soMensal = await plano('Só mensal', '120.00')
    const { master } = await t.empresaComMaster({ planoId: soMensal })
    const r = await master.post('/api/assinatura/periodicidade', { periodicidade: 'anual' })
    expect(r.status).toBe(422)
    expect(r.corpo.mensagem ?? r.corpo.message).toContain('não é vendido no ciclo anual')

    const emTeste = await t.empresaComMaster({ emTeste: true })
    const p = await emTeste.master.post('/api/assinatura/periodicidade', {
      periodicidade: 'anual',
    })
    expect(p.corpo).toMatchObject({ situacao: 'aplicada' })
    const a = (await emTeste.master.get('/api/assinatura')).corpo
    expect(a).toMatchObject({
      periodicidade: 'anual',
      valorContratado: '3000.00',
      cicloInicio: null,
    })
  })

  it('dia do vencimento: só os da lista; o Master muda a cada 90 dias, a Administração quando precisar', async () => {
    const { master, adm, empresaId } = await t.empresaComMaster()
    const mudar = (dia: number) =>
      master.put('/api/assinatura/cobranca', { diaVencimento: dia, formaPagamento: null })
    const fora = await mudar(7)
    expect(fora.status).toBe(422)
    expect(fora.corpo.mensagem ?? fora.corpo.message).toContain('5, 10, 15, 20, 25, 30')
    const r = await mudar(15)
    expect(r.status, JSON.stringify(r.corpo)).toBe(200)
    const a = (await master.get('/api/assinatura')).corpo
    expect(a.diaVencimento).toBe(15)
    expect(a.diaVencimentoLivreEm).toBeTruthy()
    const cedo = await mudar(20)
    expect(cedo.status).toBe(422)
    expect(cedo.corpo.mensagem ?? cedo.corpo.message).toContain('uma vez a cada 90 dias')
    // Mudar só a forma, mantendo o dia, não esbarra no prazo.
    expect((await mudar(15)).status).toBe(200)
    const pelaAdm = await adm.put(`/api/plataforma/empresas/${empresaId}/assinatura/cobranca`, {
      diaVencimento: 20,
      formaPagamento: null,
    })
    expect(pelaAdm.status, JSON.stringify(pelaAdm.corpo)).toBe(200)
    const { cliente: enologo } = await t.convidar(master, 'Enólogo')
    const negado = await enologo.put('/api/assinatura/cobranca', {
      diaVencimento: 25,
      formaPagamento: null,
    })
    expect(negado.status).toBe(403)
  })
})

describe('faturas e recebimentos', () => {
  const silencio = { error: () => {} }
  async function plano(mensal: string, extra: Record<string, unknown> = {}) {
    const { cliente: adm } = await t.admin()
    const r = await adm.post(
      '/api/plataforma/planos',
      dadosPlano(`Fat ${sufixo()}`, {
        precos: [{ periodicidade: 'mensal', valor: mensal }],
        ...extra,
      }),
    )
    return r.corpo.id as string
  }
  const faturas = async (c: { get: (u: string) => Promise<{ corpo: unknown }> }) =>
    (await c.get('/api/faturas')).corpo as Array<{
      id: string
      numero: number
      cicloInicio: string
      total: string
      situacao: string
      vencimento: string
    }>

  it('a criação emite a fatura do primeiro ciclo; baixa, saldo e estorno', async () => {
    const { master, adm, empresaId } = await t.empresaComMaster({ inicio: hoje() })
    let lista = await faturas(master)
    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({
      cicloInicio: hoje(),
      total: '300.00',
      situacao: 'aberta',
      vencimento: hoje(),
    })
    const f = (await adm.get(`/api/plataforma/faturas/${lista[0]!.id}`)).corpo
    expect(f.itens).toEqual([expect.objectContaining({ origem: 'plano', valor: '300.00' })])

    const parcial = await adm.post(`/api/plataforma/faturas/${f.id}/recebimentos`, {
      data: hoje(),
      valor: '100.00',
      forma: 'pix',
      referencia: 'E123',
    })
    expect(parcial.corpo.situacao).toBe('parcial')
    const demais = await adm.post(`/api/plataforma/faturas/${f.id}/recebimentos`, {
      data: hoje(),
      valor: '250.00',
      forma: 'pix',
    })
    expect(demais.status).toBe(422)
    const resto = await adm.post(`/api/plataforma/faturas/${f.id}/recebimentos`, {
      data: hoje(),
      valor: '200.00',
      forma: 'boleto',
    })
    expect(resto.corpo.situacao).toBe('paga')
    // Fatura com recebimento não se cancela; o recebimento se estorna.
    expect(
      (await adm.post(`/api/plataforma/faturas/${f.id}/cancelar`, { motivo: 'Teste' })).status,
    ).toBe(422)
    const est = await adm.post(`/api/plataforma/recebimentos/${resto.corpo.id}/estornar`, {
      motivo: 'Lançado em dobro',
    })
    expect(est.status).toBe(200)
    const visto = (await master.get(`/api/faturas/${f.id}`)).corpo
    expect(visto).toMatchObject({ situacao: 'parcial', recebido: '100.00', saldo: '200.00' })
    expect(visto.recebimentos[1]).toMatchObject({ motivoEstorno: 'Lançado em dobro' })
    const naLista = (await master.get('/api/faturas')).corpo.find(
      (x: { id: string }) => x.id === f.id,
    )
    expect(naLista.recebido).toBe('100.00')

    // Outra empresa não vê esta fatura.
    const outra = await t.empresaComMaster()
    expect((await outra.master.get(`/api/faturas/${f.id}`)).status).toBe(404)
    lista = await faturas(outra.master)
    expect(lista.some((x) => x.id === f.id)).toBe(false)
    expect(empresaId).toBeTruthy()
  })

  it('renova o ciclo, emite a próxima com antecedência e aplica o agendado na renovação', async () => {
    const menor = await plano('80.00')
    const { master, empresaId } = await t.empresaComMaster({ inicio: hoje() })
    const fim = fimDoCiclo(hoje(), 'mensal')
    const proximo = somarDias(fim, 1)
    expect(await processarCobranca(t.db, silencio, hoje())).toBeGreaterThanOrEqual(0)
    expect((await faturas(master)).length).toBe(1)

    // Dez dias antes do vencimento do próximo ciclo, a fatura dele sai; uma vez só.
    await processarCobranca(t.db, silencio, somarDias(proximo, -10))
    await processarCobranca(t.db, silencio, somarDias(proximo, -9))
    let lista = await faturas(master)
    expect(lista.filter((f) => f.cicloInicio === proximo)).toHaveLength(1)

    // Com a próxima fatura já emitida, o downgrade fica para a renovação seguinte.
    const down = await master.post('/api/assinatura/plano', { planoId: menor })
    const seguinte = somarDias(fimDoCiclo(proximo, 'mensal', Number(hoje().slice(8, 10))), 1)
    expect(down.corpo).toMatchObject({ situacao: 'agendada', efeitoEm: seguinte })

    await processarCobranca(t.db, silencio, proximo)
    let a = (await master.get('/api/assinatura')).corpo
    expect(a.cicloInicio).toBe(proximo)
    expect(a.valorContratado).toBe('300.00')

    await processarCobranca(t.db, silencio, seguinte)
    a = (await master.get('/api/assinatura')).corpo
    expect(a).toMatchObject({ cicloInicio: seguinte, valorContratado: '80.00' })
    expect(a.plano.id).toBe(menor)
    lista = await faturas(master)
    expect(lista.find((f) => f.cicloInicio === seguinte)?.total).toBe('80.00')
    expect(empresaId).toBeTruthy()
  })

  it('upgrade refaz a fatura futura não paga, com o proporcional; desconto de 100% já nasce paga', async () => {
    const maior = await plano('600.00')
    const { master, adm, empresaId } = await t.empresaComMaster({ inicio: hoje() })
    const proximo = somarDias(fimDoCiclo(hoje(), 'mensal'), 1)
    await processarCobranca(t.db, silencio, somarDias(proximo, -10))
    const antes = (await faturas(master)).find((f) => f.cicloInicio === proximo)!
    expect(antes.total).toBe('300.00')

    const up = await adm.post(`/api/plataforma/empresas/${empresaId}/assinatura/plano`, {
      planoId: maior,
    })
    expect(up.corpo.situacao).toBe('aplicada')
    const lista = await faturas(master)
    expect(lista.find((f) => f.id === antes.id)?.situacao).toBe('cancelada')
    const nova = lista.find((f) => f.cicloInicio === proximo && f.situacao !== 'cancelada')!
    const detalhe = (await master.get(`/api/faturas/${nova.id}`)).corpo
    expect(detalhe.itens.map((i: { origem: string }) => i.origem)).toEqual([
      'plano',
      'proporcional',
    ])
    expect(detalhe.itens[0].valor).toBe('600.00')
    expect(detalhe.itens[1].valor).toBe(up.corpo.valorProporcional)

    // Cliente fundador: 100% de desconto, a fatura sai zerada e paga.
    const fundador = await t.empresaComMaster({ inicio: hoje() })
    await fundador.adm.post(`/api/plataforma/empresas/${fundador.empresaId}/descontos`, {
      tipo: 'percentual',
      valor: '100',
      motivo: 'Cliente fundador',
      inicio: hoje(),
    })
    const p2 = somarDias(fimDoCiclo(hoje(), 'mensal'), 1)
    await processarCobranca(t.db, silencio, somarDias(p2, -10))
    const f2 = (await faturas(fundador.master)).find((f) => f.cicloInicio === p2)!
    expect(f2).toMatchObject({ total: '0.00', situacao: 'paga' })
  })

  it('fatura avulsa e cancelamento; contratação no teste', async () => {
    const { master, adm, empresaId } = await t.empresaComMaster({ emTeste: true })
    expect(await faturas(master)).toHaveLength(0)
    const av = await adm.post(`/api/plataforma/empresas/${empresaId}/faturas`, {
      vencimento: somarDias(hoje(), 5),
      itens: [{ descricao: 'Implantação', quantidade: 1, valorUnitario: '500.00' }],
    })
    expect(av.status).toBe(200)
    expect(
      (await adm.post(`/api/plataforma/faturas/${av.corpo.id}/cancelar`, { motivo: 'Cortesia' }))
        .status,
    ).toBe(200)

    const c = await master.post('/api/assinatura/contratar', {})
    expect(c.status).toBe(200)
    const a = (await master.get('/api/assinatura')).corpo
    expect(a).toMatchObject({ emTeste: false, cicloInicio: hoje() })
    const lista = await faturas(master)
    expect(lista.find((f) => f.id === c.corpo.faturaId)).toMatchObject({ total: '300.00' })
    const sessao = (await master.get('/api/auth/sessao')).corpo
    expect(sessao.empresa.situacao).toBe('ativo')
    expect((await master.post('/api/assinatura/contratar', {})).status).toBe(422)
  })

  it('baixa por formulário, com ou sem comprovante; o cliente baixa o comprovante', async () => {
    const { master, adm } = await t.empresaComMaster({ inicio: hoje() })
    const f = (await faturas(master))[0]!
    const formulario = (campos: Record<string, string>, comArquivo: boolean) => {
      const partes = Object.entries(campos).map(([k, v]) =>
        Buffer.from(`--x\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`),
      )
      if (comArquivo) {
        partes.push(
          Buffer.from(
            '--x\r\nContent-Disposition: form-data; name="comprovante"; filename="pix.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4 pix\r\n',
          ),
        )
      }
      partes.push(Buffer.from('--x--\r\n'))
      return Buffer.concat(partes)
    }
    const enviar = (corpo: Buffer) =>
      t.app.inject({
        method: 'POST',
        url: `/api/plataforma/faturas/${f.id}/recebimentos`,
        headers: {
          cookie: adm.cookie,
          'x-vinicycle': '1',
          'content-type': 'multipart/form-data; boundary=x',
        },
        payload: corpo,
      })
    const sem = await enviar(formulario({ data: hoje(), valor: '100.00', forma: 'pix' }, false))
    expect(sem.statusCode).toBe(200)
    const com = await enviar(
      formulario({ data: hoje(), valor: '200.00', forma: 'pix', referencia: 'E9' }, true),
    )
    expect(com.statusCode).toBe(200)
    const visto = (await master.get(`/api/faturas/${f.id}`)).corpo
    expect(visto.situacao).toBe('paga')
    const comprovante = visto.recebimentos[1].comprovanteId
    expect(comprovante).toBeTruthy()
    const arq = await t.app.inject({
      method: 'GET',
      url: `/api/anexos/${comprovante}/arquivo`,
      headers: { cookie: master.cookie },
    })
    expect(arq.statusCode).toBe(200)
    expect(arq.body).toContain('%PDF-1.4 pix')
  })
})

describe('régua de cobrança e exportação', () => {
  const silencio = { error: () => {} }
  const url = 'http://localhost:5173'
  async function emails(para: string) {
    // A fila é processada em lotes: esvazia antes de olhar.
    while ((await processarFila(t.db, t.correio, t.config.EMAIL_REMETENTE, silencio)) > 0);
    return t.correio.enviados.filter((m) => m.para === para).map((m) => m.assunto)
  }

  it('avisa antes e depois do vencimento, restringe e libera na baixa', async () => {
    const { master, adm, emailMaster, empresaId } = await t.empresaComMaster({ inicio: hoje() })
    const venc = hoje()
    const fatura = (await master.get('/api/faturas')).corpo[0]

    await processarRegua(t.db, url, silencio, somarDias(venc, -3))
    await processarRegua(t.db, url, silencio, somarDias(venc, -3))
    expect((await emails(emailMaster)).filter((a) => a.includes('vence em 3 dia'))).toHaveLength(1)

    await processarRegua(t.db, url, silencio, somarDias(venc, 1))
    expect((await emails(emailMaster)).some((a) => a.includes('vencida'))).toBe(true)
    let sessao = (await master.get('/api/auth/sessao')).corpo
    expect(sessao.empresa.situacao).toBe('ativo')

    await processarRegua(t.db, url, silencio, somarDias(venc, 6))
    sessao = (await master.get('/api/auth/sessao')).corpo
    expect(sessao.empresa.situacao).toBe('somente_leitura')
    expect((await master.post('/api/assinatura/contratar', {})).status).toBe(422)
    expect(
      (
        await master.post('/api/pessoas', {
          ficha: { tipoPessoa: 'fisica', nome: 'Fulano' },
          papeis: [],
        })
      ).status,
    ).toBe(403)

    await processarRegua(t.db, url, silencio, somarDias(venc, 21))
    sessao = (await master.get('/api/auth/sessao')).corpo
    expect(sessao.empresa.situacao).toBe('bloqueado')
    expect((await master.get('/api/assinatura')).status).toBe(200)
    expect((await master.get('/api/pessoas')).status).toBe(403)
    expect((await emails(emailMaster)).some((a) => a.includes('foi bloqueada'))).toBe(true)

    // A baixa libera na hora.
    const r = await adm.post(`/api/plataforma/faturas/${fatura.id}/recebimentos`, {
      data: hoje(),
      valor: '300.00',
      forma: 'pix',
    })
    expect(r.corpo.situacao).toBe('paga')
    sessao = (await master.get('/api/auth/sessao')).corpo
    expect(sessao.empresa.situacao).toBe('ativo')
    expect(sessao.empresa.cobranca).toBeNull()

    // Bloqueio manual não é da régua: continua.
    await adm.post(`/api/plataforma/empresas/${empresaId}/situacao`, {
      situacao: 'bloqueado',
      motivo: 'Pedido do cliente',
    })
    await processarRegua(t.db, url, silencio, hoje())
    sessao = (await master.get('/api/auth/sessao')).corpo
    expect(sessao.empresa.situacao).toBe('bloqueado')
  })

  it('teste: aviso antes do fim e bloqueio sem contratação; contratar libera', async () => {
    const { master, emailMaster } = await t.empresaComMaster({ emTeste: true })
    const a = (await master.get('/api/assinatura')).corpo
    await processarRegua(t.db, url, silencio, somarDias(a.fimTeste, -3))
    expect((await emails(emailMaster)).some((x) => x.includes('termina em 3 dia'))).toBe(true)
    await processarRegua(t.db, url, silencio, somarDias(a.fimTeste, 1))
    let sessao = (await master.get('/api/auth/sessao')).corpo
    expect(sessao.empresa.situacao).toBe('bloqueado')
    expect((await master.post('/api/assinatura/contratar', {})).status).toBe(200)
    sessao = (await master.get('/api/auth/sessao')).corpo
    expect(sessao.empresa.situacao).toBe('ativo')
  })

  it('exportação completa: só o Master, sem segredos', async () => {
    const { master } = await t.empresaComMaster()
    const { cliente: enologo } = await t.convidar(master, 'Enólogo')
    const r = await t.app.inject({
      method: 'GET',
      url: '/api/exportacao/pacote',
      headers: { cookie: master.cookie },
    })
    expect(r.statusCode).toBe(200)
    expect(r.headers['content-type']).toBe('application/zip')
    const bruto = r.rawPayload
    expect(bruto.subarray(0, 2).toString()).toBe('PK')
    const nomes = bruto.toString('latin1')
    expect(nomes).toContain('dados/empresa.csv')
    expect(nomes).toContain('dados/vinculo.csv')
    expect(nomes).toContain('LEIA-ME.txt')
    const negado = await t.app.inject({
      method: 'GET',
      url: '/api/exportacao/pacote',
      headers: { cookie: enologo.cookie },
    })
    expect(negado.statusCode).toBe(403)
  })
})

describe('vitrine e painel da plataforma', () => {
  it('vitrine mostra o que não foi contratado; interesse chega à plataforma uma vez', async () => {
    const { master, adm } = await t.empresaComMaster({ inicio: hoje() })
    const v = (await master.get('/api/vitrine')).corpo
    expect(v.map((m: { codigo: string }) => m.codigo)).toEqual(
      expect.arrayContaining(['VITITRACK', 'ENOTUR', 'ENOMESA']),
    )
    expect(v.some((m: { codigo: string }) => m.codigo === 'ENOTRACE')).toBe(false)
    expect(
      (await master.post('/api/vitrine/ENOTUR/interesse', { observacao: 'Visitas' })).status,
    ).toBe(200)
    expect((await master.post('/api/vitrine/ENOTUR/interesse', {})).status).toBe(200)
    expect((await master.post('/api/vitrine/ENOTRACE/interesse', {})).status).toBe(422)
    const lista = (await adm.get('/api/plataforma/interesses')).corpo.filter(
      (i: { usuario: string; modulo: string }) => i.modulo === 'EnoTur',
    )
    const meu = lista.filter((i: { observacao: string }) => i.observacao === 'Visitas')
    expect(meu).toHaveLength(1)
    expect((await adm.post(`/api/plataforma/interesses/${meu[0].id}/atender`, {})).status).toBe(200)
    expect(
      (await master.get('/api/vitrine')).corpo.find(
        (m: { codigo: string }) => m.codigo === 'ENOTUR',
      ).interesse,
    ).toBe(false)
  })

  it('painel: receita mensal, previsão de 6 meses e prazos da régua editáveis', async () => {
    const { adm } = await t.empresaComMaster({ inicio: hoje() })
    const p = (await adm.get('/api/plataforma/painel')).corpo
    expect(Number(p.receitaMensal)).toBeGreaterThan(0)
    expect(p.previsao).toHaveLength(6)
    expect(p.clientes.porSituacao).toBeTruthy()
    expect(p.maiores.length).toBeGreaterThan(0)
    const c = (await adm.get('/api/plataforma/configuracoes')).corpo
    expect(c).toMatchObject({
      toleranciaDias: 5,
      somenteLeituraDias: 15,
      faturaAntecedenciaDias: 10,
    })
    expect(
      (await adm.put('/api/plataforma/configuracoes', { ...c, toleranciaDias: 7 })).status,
    ).toBe(200)
    expect((await adm.get('/api/plataforma/configuracoes')).corpo.toleranciaDias).toBe(7)
    await adm.put('/api/plataforma/configuracoes', c)
  })
})

describe('reajuste e desconto editável (pendência 25)', () => {
  const silencio = { error: () => {} }
  it('reajuste vale na renovação; o Master não cancela; desconto se edita', async () => {
    const { master, adm, empresaId } = await t.empresaComMaster({ inicio: hoje() })
    const base = `/api/plataforma/empresas/${empresaId}`
    expect(
      (await adm.post(`${base}/assinatura/reajuste`, { modo: 'valor', motivo: 'x' })).status,
    ).toBe(400)
    const r = await adm.post(`${base}/assinatura/reajuste`, {
      modo: 'valor',
      valor: '450.00',
      motivo: 'Fim do preço de lançamento',
    })
    expect(r.corpo.situacao).toBe('agendada')
    let a = (await master.get('/api/assinatura')).corpo
    const m = a.mudancas.find((x: { tipo: string }) => x.tipo === 'reajuste')
    expect(m).toMatchObject({ valorNovo: '450.00', motivo: null, efeitoEm: a.proximaRenovacao })
    expect((await master.post(`/api/assinatura/mudancas/${m.id}/cancelar`, {})).status).toBe(403)

    const d = await adm.post(`${base}/descontos`, {
      tipo: 'percentual',
      valor: '10',
      motivo: 'Negociação',
      inicio: hoje(),
    })
    expect(
      (
        await adm.put(`${base}/descontos/${d.corpo.id}`, {
          tipo: 'valor',
          valor: '50.00',
          motivo: 'Negociação revista',
          inicio: hoje(),
          fim: null,
        })
      ).status,
    ).toBe(200)

    await processarCobranca(t.db, silencio, a.proximaRenovacao)
    a = (await master.get('/api/assinatura')).corpo
    expect(a.valorContratado).toBe('450.00')
    const f = (await master.get('/api/faturas')).corpo.find(
      (x: { cicloInicio: string }) => x.cicloInicio === a.cicloInicio,
    )
    expect(f.total).toBe('400.00')

    const teste = await t.empresaComMaster({ emTeste: true })
    expect(
      (
        await teste.adm.post(`/api/plataforma/empresas/${teste.empresaId}/assinatura/reajuste`, {
          modo: 'tabela',
          motivo: 'Teste',
        })
      ).status,
    ).toBe(422)
  })
})
