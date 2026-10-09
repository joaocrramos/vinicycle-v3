import { describe, expect, it } from 'vitest'
import { cnpjValido, cpfValido, mascararDocumento } from '../src/documentos'

describe('CPF', () => {
  it('aceita CPF válido com ou sem máscara', () => {
    expect(cpfValido('529.982.247-25')).toBe(true)
    expect(cpfValido('52998224725')).toBe(true)
  })
  it('recusa dígito errado e sequências repetidas', () => {
    expect(cpfValido('529.982.247-24')).toBe(false)
    expect(cpfValido('111.111.111-11')).toBe(false)
    expect(cpfValido('123')).toBe(false)
  })
})

describe('CNPJ', () => {
  it('aceita CNPJ numérico válido', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true)
  })
  it('aceita CNPJ alfanumérico válido (IN RFB 2.229/2024)', () => {
    // Exemplo publicado pela Receita Federal.
    expect(cnpjValido('12.ABC.345/01DE-35')).toBe(true)
    expect(cnpjValido('12abc34501de35')).toBe(true)
  })
  it('recusa dígito errado, letra no DV e repetições', () => {
    expect(cnpjValido('11.222.333/0001-82')).toBe(false)
    expect(cnpjValido('12.ABC.345/01DE-3A')).toBe(false)
    expect(cnpjValido('00.000.000/0000-00')).toBe(false)
  })
})

describe('máscara', () => {
  it('formata CPF parcial e completo', () => {
    expect(mascararDocumento('cpf', '5299')).toBe('529.9')
    expect(mascararDocumento('cpf', '52998224725')).toBe('529.982.247-25')
  })
  it('formata CNPJ alfanumérico', () => {
    expect(mascararDocumento('cnpj', '12abc34501de35')).toBe('12.ABC.345/01DE-35')
    expect(mascararDocumento('cnpj', '11222')).toBe('11.222')
  })
})
