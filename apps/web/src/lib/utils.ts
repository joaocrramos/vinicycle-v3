import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...entradas: ClassValue[]): string {
  return twMerge(clsx(entradas))
}

/** Data-hora em UTC exibida no fuso do estabelecimento (P18). */
export function formatarDataHora(
  valor: string | Date | null | undefined,
  fuso = 'America/Sao_Paulo',
): string {
  if (!valor) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: fuso,
  }).format(new Date(valor))
}

/** Data pura ("AAAA-MM-DD") sem conversão de fuso (P18). */
export function formatarData(valor: string | null | undefined): string {
  if (!valor) return ''
  const [a, m, d] = valor.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  return (
    (partes[0]?.[0] ?? '') + (partes.length > 1 ? (partes.at(-1)?.[0] ?? '') : '')
  ).toUpperCase()
}
