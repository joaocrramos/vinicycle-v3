/* General utility functions (exposes cn) */
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges multiple class names into a single string
 * @param inputs - Array of class names
 * @returns Merged class names
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
