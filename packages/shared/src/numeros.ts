// Campos numéricos e de valor (P3).
//
// Os valores trafegam como texto decimal com ponto ("1234.56"), nunca como ponto flutuante.
// Moeda trafega em centavos inteiros. A exibição usa o padrão pt-BR ("1.234,56").

/** Casas decimais por grandeza (P3, P17). */
export const CASAS_DECIMAIS = {
  moeda: 2,
  litros: 2,
  quilos: 2,
  brix: 2,
  ph: 2,
  densidade: 4,
  so2: 1,
  inteiro: 0,
} as const

export type Grandeza = keyof typeof CASAS_DECIMAIS

/**
 * Converte os dígitos digitados num decimal com as casas pedidas, preenchendo da direita para a
 * esquerda (P3): com 2 casas, "123456" vira "1234.56". O sinal "-" em qualquer posição torna o
 * valor negativo quando `permitirNegativo` for verdadeiro.
 */
export function digitosParaDecimal(
  entrada: string,
  casas: number,
  permitirNegativo = false,
): string | null {
  const negativo = permitirNegativo && entrada.includes('-')
  const digitos = entrada.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  if (digitos === '') return null
  const preenchido = digitos.padStart(casas + 1, '0')
  const inteiro = preenchido.slice(0, preenchido.length - casas)
  const fracao = casas > 0 ? preenchido.slice(-casas) : ''
  const texto = casas > 0 ? `${inteiro}.${fracao}` : inteiro
  const zero = /^0+(\.0+)?$/.test(texto)
  return negativo && !zero ? `-${texto}` : texto
}

/** Formata um decimal ("1234.5") em pt-BR com as casas pedidas ("1.234,50"). */
export function formatarDecimal(valor: string | null | undefined, casas: number): string {
  if (valor === null || valor === undefined || valor === '') return ''
  const negativo = valor.startsWith('-')
  const [inteiroBruto = '0', fracaoBruta = ''] = valor.replace('-', '').split('.')
  const fracao = fracaoBruta.padEnd(casas, '0').slice(0, casas)
  const inteiro = inteiroBruto.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const texto = casas > 0 ? `${inteiro},${fracao}` : inteiro
  return negativo ? `-${texto}` : texto
}

/** Centavos inteiros para exibição com símbolo ("R$ 1.234,56"). */
export function formatarMoeda(centavos: number, simbolo = 'R$'): string {
  const negativo = centavos < 0
  const abs = Math.abs(centavos)
  const texto = formatarDecimal(`${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`, 2)
  return `${negativo ? '-' : ''}${simbolo} ${texto}`
}

/** Valida que o texto é um decimal com no máximo `casas` casas. */
export function decimalValido(valor: string, casas: number): boolean {
  const re = casas > 0 ? new RegExp(`^-?\\d+(\\.\\d{1,${casas}})?$`) : /^-?\d+$/
  return re.test(valor)
}
