import { describe, expect, it } from 'vitest'
import { digitosParaDecimal, formatarDecimal, formatarMoeda } from '../src/numeros'

describe('preenchimento da direita para a esquerda (P3)', () => {
  it('123456 com 2 casas vira 1234.56', () => {
    expect(digitosParaDecimal('123456', 2)).toBe('1234.56')
  })
  it('poucos dígitos completam com zeros', () => {
    expect(digitosParaDecimal('5', 2)).toBe('0.05')
    expect(digitosParaDecimal('5', 4)).toBe('0.0005')
  })
  it('ignora máscara já aplicada', () => {
    expect(digitosParaDecimal('1.234,567', 2)).toBe('12345.67')
  })
  it('negativo só quando permitido', () => {
    expect(digitosParaDecimal('-150', 2)).toBe('1.50')
    expect(digitosParaDecimal('-150', 2, true)).toBe('-1.50')
    expect(digitosParaDecimal('-0', 2, true)).toBe('0.00')
  })
  it('vazio vira nulo', () => {
    expect(digitosParaDecimal('', 2)).toBeNull()
  })
})

describe('formatação pt-BR', () => {
  it('separa milhares e usa vírgula', () => {
    expect(formatarDecimal('1234.56', 2)).toBe('1.234,56')
    expect(formatarDecimal('1234567.5', 2)).toBe('1.234.567,50')
    expect(formatarDecimal('0.995', 4)).toBe('0,9950')
    expect(formatarDecimal('-28.5', 1)).toBe('-28,5')
  })
  it('moeda em centavos', () => {
    expect(formatarMoeda(123456)).toBe('R$ 1.234,56')
    expect(formatarMoeda(-5)).toBe('-R$ 0,05')
  })
})
