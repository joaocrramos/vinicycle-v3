import { describe, expect, it } from 'vitest'
import { erroDoFormatoCodigo, montarCodigo, PARAMETROS, TIPOS_CODIGO } from '../src/parametros'

describe('formatos de código (P19)', () => {
  it('monta os padrões da cantina', () => {
    const d = { ano: 2026, numero: 42, ciclo: '01' }
    expect(montarCodigo(TIPOS_CODIGO.romaneio.padrao, { ...d, numero: 1 })).toBe('ROM-2026-0001')
    expect(montarCodigo(TIPOS_CODIGO.lote_producao.padrao, d)).toBe('2026.01-042')
    expect(montarCodigo(TIPOS_CODIGO.lote_comercial.padrao, { ...d, numero: 14 })).toBe('L26-0014')
  })

  it('sem ciclo configurado, {CC} vale 01', () => {
    expect(montarCodigo('{AAAA}.{CC}-{NNN}', { ano: 2026, numero: 7 })).toBe('2026.01-007')
  })

  it('número maior que a máscara não é cortado', () => {
    expect(montarCodigo('R{AA}-{NN}', { ano: 2026, numero: 123 })).toBe('R26-123')
  })

  it('exige uma sequência e o ano, e só marcadores conhecidos', () => {
    expect(erroDoFormatoCodigo('ROM-{AAAA}-{NNNN}')).toBeNull()
    expect(erroDoFormatoCodigo('ROM-{AAAA}')).toMatch(/sequência/)
    expect(erroDoFormatoCodigo('ROM-{NNNN}')).toMatch(/ano/)
    expect(erroDoFormatoCodigo('ROM-{AAAA}-{NNN}-{NN}')).toMatch(/sequência/)
    expect(erroDoFormatoCodigo('ROM-{MM}-{AAAA}-{NNN}')).toMatch(/desconhecido/)
    expect(erroDoFormatoCodigo('ROM#{AAAA}-{NNN}')).toMatch(/letras/)
  })

  it('os padrões passam na própria validação', () => {
    expect(
      PARAMETROS.formatos_codigo.esquema.safeParse(PARAMETROS.formatos_codigo.padrao).success,
    ).toBe(true)
  })
})

describe('avisos de validade', () => {
  const e = PARAMETROS.avisos_validade.esquema
  it('de um a três avisos, sem repetição', () => {
    expect(e.safeParse({ dias: [30, 7] }).success).toBe(true)
    expect(e.safeParse({ dias: [] }).success).toBe(false)
    expect(e.safeParse({ dias: [30, 30] }).success).toBe(false)
    expect(e.safeParse({ dias: [90, 60, 30, 7] }).success).toBe(false)
  })
})
