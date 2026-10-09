// Planilha CSV para baixar (P23): ponto e vírgula e vírgula decimal, como o Excel em português abre.
export type CelulaCsv = string | number | null | undefined

const NUMERO = /^-?\d+(\.\d+)?$/

function celula(v: CelulaCsv): string {
  if (v === null || v === undefined) return ''
  const t = typeof v === 'number' ? String(v) : v
  const x = NUMERO.test(t) ? t.replace('.', ',') : t
  return /[;"\n\r]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x
}

export function textoCsv(linhas: CelulaCsv[][]): string {
  return linhas.map((l) => l.map(celula).join(';')).join('\r\n')
}

export function baixarCsv(nome: string, linhas: CelulaCsv[][]): void {
  const blob = new Blob(['﻿', textoCsv(linhas)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome.endsWith('.csv') ? nome : `${nome}.csv`
  document.body.append(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
