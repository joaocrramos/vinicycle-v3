// Modo de cor e paleta (P9). A escolha fica no perfil do usuário e vale em qualquer aparelho.
import type { Preferencias } from './sessao'

export const PALETAS = [
  { valor: 'vinho', nome: 'Vinho' },
  { valor: 'oliva', nome: 'Oliva' },
  { valor: 'terra', nome: 'Terra' },
  { valor: 'azul', nome: 'Azul' },
  { valor: 'grafite', nome: 'Grafite' },
] as const

const midia = () => window.matchMedia('(prefers-color-scheme: dark)')

export function aplicarTema(p: Preferencias | undefined): void {
  const raiz = document.documentElement
  const tema = p?.tema ?? 'sistema'
  const escuro = tema === 'escuro' || (tema === 'sistema' && midia().matches)
  raiz.classList.toggle('dark', escuro)
  raiz.dataset.paleta = p?.paleta ?? 'vinho'
  try {
    localStorage.setItem('vinicycle.tema', JSON.stringify({ tema, paleta: p?.paleta ?? 'vinho' }))
  } catch {
    // Sem armazenamento local: o tema vem da sessão.
  }
}

/** Antes de a sessão carregar, usa o último tema do aparelho, para não piscar. */
export function aplicarTemaSalvo(): void {
  try {
    const salvo = localStorage.getItem('vinicycle.tema')
    aplicarTema(salvo ? JSON.parse(salvo) : undefined)
  } catch {
    aplicarTema(undefined)
  }
}

export function observarSistema(p: () => Preferencias | undefined): () => void {
  const m = midia()
  const f = () => aplicarTema(p())
  m.addEventListener('change', f)
  return () => m.removeEventListener('change', f)
}
