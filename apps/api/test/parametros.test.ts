// Configurações › Parâmetros: padrão sem valor gravado, validação, permissão e auditoria.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { montar } from './apoio'

let t: Awaited<ReturnType<typeof montar>>
beforeAll(async () => {
  t = await montar()
})
afterAll(async () => {
  await t.fechar()
})

describe('parâmetros da gestão', () => {
  it('sem valor gravado, vale o padrão', async () => {
    const { master } = await t.empresaComMaster()
    const r = await master.get('/api/parametros')
    expect(r.status).toBe(200)
    expect(r.corpo.formatos_codigo).toEqual({
      padrao: true,
      valor: expect.objectContaining({ romaneio: 'ROM-{AAAA}-{NNNN}' }),
    })
    expect(r.corpo.higienizar_ao_esvaziar.valor).toEqual({ ativo: true })
  })

  it('grava, valida e audita; outra empresa não vê', async () => {
    const { master } = await t.empresaComMaster()
    const formatos = (await master.get('/api/parametros')).corpo.formatos_codigo.valor

    const ruim = await master.put('/api/parametros/formatos_codigo', {
      ...formatos,
      romaneio: 'ROM-{NNNN}',
    })
    expect(ruim.status).toBe(400)

    const ok = await master.put('/api/parametros/formatos_codigo', {
      ...formatos,
      romaneio: 'R{AA}/{NNN}',
    })
    expect(ok.status).toBe(200)
    const avisos = await master.put('/api/parametros/avisos_validade', { dias: [7, 45] })
    expect(avisos.status).toBe(200)

    const r = (await master.get('/api/parametros')).corpo
    expect(r.formatos_codigo).toEqual({
      padrao: false,
      valor: { ...formatos, romaneio: 'R{AA}/{NNN}' },
    })
    expect(r.avisos_validade.valor.dias).toEqual([45, 7])

    expect((await master.put('/api/parametros/inexistente', {})).status).toBe(400)

    const aud = await master.get('/api/auditoria?entidade=parametro')
    expect(aud.corpo.total).toBe(2)

    const outra = await t.empresaComMaster()
    expect((await outra.master.get('/api/parametros')).corpo.formatos_codigo.padrao).toBe(true)
  })

  it('sem permissão de editar, não grava', async () => {
    const { master } = await t.empresaComMaster()
    await t.criarEstabelecimento(master)
    const { cliente } = await t.convidar(master, 'Cantineiro')
    const r = await cliente.put('/api/parametros/higienizar_ao_esvaziar', { ativo: false })
    expect(r.status).toBe(403)
  })
})
