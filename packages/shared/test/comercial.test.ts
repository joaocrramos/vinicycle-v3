import { describe, expect, it } from 'vitest'
import {
  deCentavos,
  diasEntre,
  fimDoCiclo,
  paraCentavos,
  proporcional,
  somarMeses,
  vencimentoDoCiclo,
} from '../src/comercial'

describe('ciclos de cobrança', () => {
  it('soma meses mantendo o dia-base', () => {
    expect(somarMeses('2027-01-31', 1)).toBe('2027-02-28')
    expect(somarMeses('2027-02-28', 1, 31)).toBe('2027-03-31')
    expect(somarMeses('2027-11-15', 3)).toBe('2028-02-15')
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29')
  })

  it('calcula o fim do ciclo pela periodicidade', () => {
    expect(fimDoCiclo('2027-01-01', 'mensal')).toBe('2027-01-31')
    expect(fimDoCiclo('2027-01-15', 'trimestral')).toBe('2027-04-14')
    expect(fimDoCiclo('2027-01-01', 'anual')).toBe('2027-12-31')
    expect(fimDoCiclo('2027-01-31', 'mensal')).toBe('2027-02-27')
    expect(fimDoCiclo('2027-02-28', 'mensal', 31)).toBe('2027-03-30')
  })

  it('vence no primeiro dia escolhido a partir do início do ciclo', () => {
    expect(vencimentoDoCiclo('2027-01-01', 10)).toBe('2027-01-10')
    expect(vencimentoDoCiclo('2027-01-15', 10)).toBe('2027-02-10')
    expect(vencimentoDoCiclo('2027-01-15', 15)).toBe('2027-01-15')
    expect(vencimentoDoCiclo('2027-02-01', 31)).toBe('2027-02-28')
  })

  it('conta dias', () => {
    expect(diasEntre('2027-01-01', '2027-01-31')).toBe(30)
    expect(diasEntre('2027-03-01', '2027-02-28')).toBe(-1)
  })
})

describe('dinheiro e proporcional', () => {
  it('converte centavos', () => {
    expect(paraCentavos('199.90')).toBe(19990)
    expect(paraCentavos('0.29')).toBe(29)
    expect(deCentavos(19990)).toBe('199.90')
    expect(deCentavos(-5)).toBe('-0.05')
  })

  it('cobra os dias restantes do ciclo, contando o dia da mudança', () => {
    const ciclo = { inicio: '2027-01-01', fim: '2027-01-30' }
    expect(proporcional(30000, ciclo, '2027-01-01')).toBe(30000)
    expect(proporcional(30000, ciclo, '2027-01-16')).toBe(15000)
    expect(proporcional(30000, ciclo, '2027-01-30')).toBe(1000)
    expect(proporcional(30000, ciclo, '2027-02-05')).toBe(0)
  })
})
