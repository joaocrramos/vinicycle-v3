// Notas fiscais no estoque (ambiente-cliente.md, Entrada por NF-e; P11): a unidade comercial da nota
// vira a unidade base do item por uma conversão sugerida quando as duas são da mesma grandeza; nos
// outros casos (caixa, fardo…), o usuário informa quantos da base cabem em uma da nota.

/** Unidades comerciais comuns nas notas, na unidade do catálogo. */
const SINONIMOS: Record<string, string> = {
  KG: 'kg',
  KGS: 'kg',
  QUILO: 'kg',
  QUILOS: 'kg',
  KILO: 'kg',
  G: 'g',
  GR: 'g',
  GRS: 'g',
  GRAMA: 'g',
  GRAMAS: 'g',
  MG: 'mg',
  T: 't',
  TON: 't',
  TONELADA: 't',
  L: 'L',
  LT: 'L',
  LTS: 'L',
  LITRO: 'L',
  LITROS: 'L',
  ML: 'mL',
  HL: 'hL',
  UN: 'un',
  UND: 'un',
  UNID: 'un',
  UNIDADE: 'un',
  PC: 'un',
  PCS: 'un',
  PECA: 'un',
  PÇ: 'un',
}

/** Quanto vale cada unidade na menor da sua grandeza (g, mL, un). */
const FATORES: Record<string, { grandeza: string; fator: number }> = {
  mg: { grandeza: 'massa', fator: 0.001 },
  g: { grandeza: 'massa', fator: 1 },
  kg: { grandeza: 'massa', fator: 1000 },
  t: { grandeza: 'massa', fator: 1_000_000 },
  mL: { grandeza: 'volume', fator: 1 },
  L: { grandeza: 'volume', fator: 1000 },
  hL: { grandeza: 'volume', fator: 100_000 },
  un: { grandeza: 'contagem', fator: 1 },
}

/** A unidade da nota no catálogo (KG → kg), ou nada se não for conhecida. */
export function unidadeDaNota(unidade: string): string | null {
  const u = unidade.trim().toUpperCase().replace(/[.\s]/g, '')
  return SINONIMOS[u] ?? null
}

/**
 * Conversão sugerida: quantos da unidade base cabem em uma unidade da nota (1 kg = 1000 g). Sem
 * sugestão quando a unidade da nota é desconhecida ou de outra grandeza.
 */
export function conversaoSugerida(unidadeNota: string, unidadeBase: string): string | null {
  const nota = unidadeDaNota(unidadeNota)
  const a = nota ? FATORES[nota] : undefined
  const b = FATORES[unidadeBase]
  if (!a || !b || a.grandeza !== b.grandeza) return null
  return String(Number((a.fator / b.fator).toFixed(6)))
}
