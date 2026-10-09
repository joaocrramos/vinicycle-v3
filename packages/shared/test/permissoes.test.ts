import { describe, expect, it } from 'vitest'
import { FUNCIONALIDADES, gradeDoModelo } from '../src/permissoes'

const tem = (g: ReturnType<typeof gradeDoModelo>, f: string, a: string) =>
  g.some((x) => x.funcionalidade === f && x.acao === a)

describe('grade inicial dos perfis-modelo (P27)', () => {
  it('códigos de funcionalidade são únicos', () => {
    const codigos = FUNCIONALIDADES.map((f) => f.codigo)
    expect(new Set(codigos).size).toBe(codigos.length)
  })
  it('cantineiro lança operações, mas não estorna', () => {
    const g = gradeDoModelo('CANTINEIRO')
    expect(tem(g, 'enotrace.operacoes', 'criar')).toBe(true)
    expect(tem(g, 'enotrace.operacoes', 'confirmar')).toBe(true)
    expect(tem(g, 'enotrace.operacoes', 'estornar')).toBe(false)
    expect(tem(g, 'enotrace.reabrir_periodo', 'reabrir_periodo')).toBe(false)
  })
  it('enólogo estorna operações; RT reabre período', () => {
    expect(tem(gradeDoModelo('ENOLOGO'), 'enotrace.operacoes', 'estornar')).toBe(true)
    expect(tem(gradeDoModelo('RT'), 'enotrace.reabrir_periodo', 'reabrir_periodo')).toBe(true)
  })
  it('nenhum modelo recebe configurações nem usuários', () => {
    for (const p of ['RT', 'ENOLOGO', 'CANTINEIRO', 'AGRONOMO', 'FINANCEIRO'] as const) {
      const g = gradeDoModelo(p)
      expect(g.some((x) => x.funcionalidade.startsWith('gestao.config.'))).toBe(false)
    }
  })
  it('financeiro vê faturas da assinatura e não vê operações', () => {
    const g = gradeDoModelo('FINANCEIRO')
    expect(tem(g, 'gestao.assinatura', 'visualizar')).toBe(true)
    expect(tem(g, 'enotrace.operacoes', 'visualizar')).toBe(false)
  })
  it('cantineiro lança evidências do autocontrole, mas só vê documentos', () => {
    const g = gradeDoModelo('CANTINEIRO')
    expect(tem(g, 'gestao.autocontrole', 'criar')).toBe(true)
    expect(tem(g, 'gestao.documentos', 'criar')).toBe(false)
    expect(tem(g, 'gestao.documentos', 'visualizar')).toBe(true)
  })
})
