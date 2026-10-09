// Laboratório (cantina.md, Análises e Laboratório): cada parâmetro é guardado na unidade padrão;
// o valor digitado em outra unidade é convertido, e o original fica guardado junto. As fórmulas
// ficam aqui, com a fonte (Claude, 03/10/2026; o João Carlos pode rever, PENDENCIAS.md, ponto 17).

/**
 * Fator para levar à unidade padrão: valor na unidade padrão = valor digitado × fator.
 * - Acidez total em g/L de ácido tartárico: 1 mEq/L = 0,075 g/L (massa equivalente 75 g/Eq).
 * - Acidez volátil em g/L de ácido acético: 1 mEq/L = 0,060 g/L (massa equivalente 60 g/Eq).
 * - Pressão: 1 atm = 1,01325 bar.
 */
export const CONVERSOES_ANALISE: Record<string, Record<string, number>> = {
  acidez_total: { 'g/L': 1 / 0.075 },
  acidez_volatil: { 'g/L': 1 / 0.06 },
  pressao: { bar: 1 / 1.01325 },
};

export const FONTES_CONVERSAO: Record<string, string> = {
  acidez_total: 'g/L em ácido tartárico (1 mEq/L = 0,075 g/L)',
  acidez_volatil: 'g/L em ácido acético (1 mEq/L = 0,060 g/L)',
  pressao: '1 atm = 1,01325 bar',
};

/** Valor na unidade padrão; nulo se a unidade não converte. */
export function paraUnidadePadrao(
  parametro: { codigo: string | null; unidadePadrao: string },
  valor: number,
  unidade: string,
): number | null {
  if (unidade === parametro.unidadePadrao) return valor;
  const fator = parametro.codigo ? CONVERSOES_ANALISE[parametro.codigo]?.[unidade] : undefined;
  return fator === undefined ? null : valor * fator;
}

/** Da unidade padrão para outra (a preferida pela empresa), para exibir. */
export function daUnidadePadrao(
  parametro: { codigo: string | null; unidadePadrao: string },
  valor: number,
  unidade: string,
): number | null {
  if (unidade === parametro.unidadePadrao) return valor;
  const fator = parametro.codigo ? CONVERSOES_ANALISE[parametro.codigo]?.[unidade] : undefined;
  return fator === undefined ? null : valor / fator;
}

export const SITUACOES_AMOSTRA = {
  coletada: 'Coletada',
  enviada: 'Enviada',
  laudo_recebido: 'Laudo recebido',
  cancelada: 'Cancelada',
} as const;
export type SituacaoAmostra = keyof typeof SITUACOES_AMOSTRA;
export const CHAVES_SITUACAO_AMOSTRA = Object.keys(SITUACOES_AMOSTRA) as [
  SituacaoAmostra,
  ...SituacaoAmostra[],
];
