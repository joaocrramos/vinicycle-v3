// Produção da cantina: domínios e o cálculo da composição (03-modelo-de-dados.md, seções 4 e 5;
// cantina.md). O cálculo é puro: a API grava, a interface mostra a prévia com a mesma conta.

// Domínios ---------------------------------------------------------------------------------------

/** Tipos de operação (03-modelo-de-dados.md, 2.5, Operação). */
export const TIPOS_OPERACAO = {
  desengace: 'Desengace / esmagamento',
  prensagem: 'Prensagem',
  fermentacao: 'Fermentação',
  chaptalizacao: 'Chaptalização',
  trasfega: 'Trasfega',
  atesto: 'Atesto',
  corte: 'Corte',
  tratamento: 'Tratamento',
  adicao_insumo: 'Adição de insumo',
  perda: 'Perda',
  titularidade: 'Transferência de titularidade',
  ajuste_inventario: 'Ajuste de inventário',
  engarrafamento: 'Engarrafamento',
  tiragem: 'Tiragem',
  estagio_espumante: 'Estágio de espumante',
  entrada_granel: 'Entrada de granel',
  saida_granel: 'Saída de granel',
  higienizacao: 'Higienização / manutenção',
  abertura_saldo: 'Abertura de saldo',
  estorno: 'Estorno',
} as const
export type TipoOperacao = keyof typeof TIPOS_OPERACAO
export const CHAVES_TIPO_OPERACAO = Object.keys(TIPOS_OPERACAO) as [TipoOperacao, ...TipoOperacao[]]

export const SITUACOES_OPERACAO = ['rascunho', 'confirmada', 'estornada'] as const
export const PAPEIS_LINHA = ['origem', 'destino', 'perda', 'ajuste'] as const
export const DECISOES_MISTURA = ['incorporar', 'lote_novo'] as const

/** Tipos de lançamento do livro de volumes (03-modelo-de-dados.md, 4.1). */
export const TIPOS_MOVIMENTO = {
  entrada_mosto: 'Entrada de mosto',
  ajuste_prensagem: 'Ajuste de prensagem',
  saida_prensagem: 'Saída de prensagem',
  entrada_prensagem: 'Entrada de prensagem',
  saida_trasfega: 'Saída de trasfega',
  entrada_trasfega: 'Entrada de trasfega',
  saida_atesto: 'Saída de atesto',
  entrada_atesto: 'Entrada de atesto',
  evaporacao: 'Evaporação',
  saida_corte: 'Saída de corte',
  entrada_corte: 'Entrada de corte',
  perda: 'Perda',
  ajuste_inventario: 'Ajuste de inventário',
  saida_titularidade: 'Saída de titularidade',
  entrada_titularidade: 'Entrada de titularidade',
  engarrafamento: 'Engarrafamento',
  tiragem: 'Tiragem',
  entrada_granel: 'Entrada de granel',
  saida_granel: 'Saída de granel',
  abertura_saldo: 'Abertura de saldo',
  estorno: 'Estorno',
} as const
export type TipoMovimento = keyof typeof TIPOS_MOVIMENTO
export const CHAVES_TIPO_MOVIMENTO = Object.keys(TIPOS_MOVIMENTO) as [
  TipoMovimento,
  ...TipoMovimento[],
]

export const SITUACOES_PROJETO = {
  planejado: 'Planejado',
  em_producao: 'Em produção',
  pronto_envase: 'Pronto para envase',
  envase_planejado: 'Envase planejado',
  engarrafado: 'Engarrafado',
  encerrado: 'Encerrado',
  cancelado: 'Cancelado',
} as const
export type SituacaoProjeto = keyof typeof SITUACOES_PROJETO
export const CHAVES_SITUACAO_PROJETO = Object.keys(SITUACOES_PROJETO) as [
  SituacaoProjeto,
  ...SituacaoProjeto[],
]

export const SITUACOES_LOTE = ['ativo', 'sem_saldo'] as const
export const TIPOS_LOTE = ['propria', 'terceiro'] as const
export const ORIGENS_LOTE = [
  'recepcao',
  'corte',
  'divisao',
  'granel',
  'retorno_terceiro',
  'titularidade',
  'carga_inicial',
] as const
export const TIPOS_GENEALOGIA = [
  'incorporacao',
  'corte',
  'lote_novo',
  'divisao',
  'titularidade',
] as const

export const ORIGENS_COMPONENTE = {
  propria: 'Própria',
  comprada: 'Comprada',
  granel: 'Granel',
  nao_informada: 'Não informada',
} as const
export type OrigemComponente = keyof typeof ORIGENS_COMPONENTE
export const CHAVES_ORIGEM_COMPONENTE = Object.keys(ORIGENS_COMPONENTE) as [
  OrigemComponente,
  ...OrigemComponente[],
]

/**
 * Granel (cantina.md, Granel e GLT; 03-modelo-de-dados.md, 2.5, Granel): o tipo da entrada e da
 * saída e a embalagem do transporte.
 */
export const TIPOS_ENTRADA_GRANEL = {
  compra: 'Compra',
  recebido_cliente: 'Recebido do cliente para elaboração ou envase',
  retorno_terceiro: 'Retorno de terceiro',
  outra: 'Outra',
} as const
export const CHAVES_TIPO_ENTRADA_GRANEL = Object.keys(TIPOS_ENTRADA_GRANEL) as [
  keyof typeof TIPOS_ENTRADA_GRANEL,
  ...(keyof typeof TIPOS_ENTRADA_GRANEL)[],
]
export const TIPOS_SAIDA_GRANEL = {
  venda: 'Venda',
  remessa_terceiro: 'Remessa a terceiro',
  devolucao_titular: 'Devolução ao titular',
  outra: 'Outra',
} as const
export const CHAVES_TIPO_SAIDA_GRANEL = Object.keys(TIPOS_SAIDA_GRANEL) as [
  keyof typeof TIPOS_SAIDA_GRANEL,
  ...(keyof typeof TIPOS_SAIDA_GRANEL)[],
]
export const EMBALAGENS_GRANEL = {
  carro_tanque: 'Carro-tanque',
  tambor: 'Tambor',
  barril: 'Barril',
  outra: 'Outra',
} as const
export const CHAVES_EMBALAGEM_GRANEL = Object.keys(EMBALAGENS_GRANEL) as [
  keyof typeof EMBALAGENS_GRANEL,
  ...(keyof typeof EMBALAGENS_GRANEL)[],
]

export const SITUACOES_ROMANEIO = ['rascunho', 'confirmado', 'estornado'] as const
export const ORIGENS_ROMANEIO = {
  vinhedo_proprio: 'Vinhedo próprio',
  fornecedor: 'Fornecedor',
} as const

// Números ----------------------------------------------------------------------------------------

/** Litros com 2 casas viram centilitros inteiros: somas exatas, sem ponto flutuante. */
export function paraCentilitros(litros: string | number): number {
  return Math.round(Number(litros) * 100)
}

export function deCentilitros(cl: number): string {
  const sinal = cl < 0 ? '-' : ''
  const abs = Math.abs(cl)
  return `${sinal}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

// Composição -------------------------------------------------------------------------------------

/** Uma fatia da composição (03-modelo-de-dados.md, 2.5, Componente da composição). */
export interface Componente {
  variedadeId: string | null
  safra: number | null
  ciclo: string | null
  origem: OrigemComponente
  organica: boolean
  candidataIp: boolean
  /** Fração de 0 a 1, com 8 casas. */
  fracao: number
}

export interface Composicao {
  componentes: Componente[]
  chaptalizado: boolean
  /** SO₂ adicionado acumulado, em mg/L: viaja com os litros (decidido em 03/10/2026, ciclo 4). */
  so2?: number
}

export const COMPOSICAO_VAZIA: Composicao = { componentes: [], chaptalizado: false }

const chave = (c: Omit<Componente, 'fracao'>) =>
  [c.variedadeId ?? '', c.safra ?? '', c.ciclo ?? '', c.origem, c.organica, c.candidataIp].join('|')

const CASAS_FRACAO = 1e8

/** Frações com 8 casas e soma exatamente 1; a diferença do arredondamento vai no maior (5.1). */
export function normalizar(componentes: Componente[]): Componente[] {
  const juntos = new Map<string, Componente>()
  for (const c of componentes) {
    if (c.fracao <= 0) continue
    const k = chave(c)
    const atual = juntos.get(k)
    if (atual) atual.fracao += c.fracao
    else juntos.set(k, { ...c })
  }
  const lista = [...juntos.values()]
  const total = lista.reduce((s, c) => s + c.fracao, 0)
  if (!lista.length || total <= 0) return []
  const inteiros = lista.map((c) => Math.round((c.fracao / total) * CASAS_FRACAO))
  const soma = inteiros.reduce((s, n) => s + n, 0)
  let maior = 0
  inteiros.forEach((n, i) => {
    if (n > inteiros[maior]!) maior = i
  })
  inteiros[maior]! += CASAS_FRACAO - soma
  return lista
    .map((c, i) => ({ ...c, fracao: inteiros[i]! / CASAS_FRACAO }))
    .filter((c) => c.fracao > 0)
    .sort((a, b) => b.fracao - a.fracao)
}

/**
 * Média ponderada pelos litros (5.4): composição nova = Σ litros × composição ÷ Σ litros.
 * Serve para o recipiente que recebe vinho (o saldo que ficou entra como uma das partes) e para a
 * composição do lote (as partes são os recipientes). A chaptalização e o SO₂ adicionado viajam com
 * os litros (5.1).
 */
export function misturar(
  partes: Array<{ centilitros: number; composicao: Composicao }>,
): Composicao {
  const validas = partes.filter((p) => p.centilitros > 0 && p.composicao.componentes.length)
  const total = validas.reduce((s, p) => s + p.centilitros, 0)
  if (!total) return { ...COMPOSICAO_VAZIA }
  const componentes = validas.flatMap((p) =>
    p.composicao.componentes.map((c) => ({ ...c, fracao: (c.fracao * p.centilitros) / total })),
  )
  const so2 = validas.reduce((s, p) => s + (p.composicao.so2 ?? 0) * p.centilitros, 0) / total
  return {
    componentes: normalizar(componentes),
    chaptalizado: partes.some((p) => p.centilitros > 0 && p.composicao.chaptalizado),
    so2: Math.round(so2 * 100) / 100,
  }
}

/**
 * Safra e ciclo do código de um lote novo: os que têm mais litros na composição de nascimento;
 * em empate, o mais recente (03-modelo-de-dados.md, 1.8 e 6.2).
 */
export function safraCicloPredominante(
  c: Composicao,
): { safra: number; ciclo: string | null } | null {
  const somas = new Map<string, { safra: number; ciclo: string | null; fracao: number }>()
  for (const x of c.componentes) {
    if (x.safra === null) continue
    const k = `${x.safra}|${x.ciclo ?? ''}`
    const atual = somas.get(k) ?? { safra: x.safra, ciclo: x.ciclo, fracao: 0 }
    atual.fracao += x.fracao
    somas.set(k, atual)
  }
  const ordenadas = [...somas.values()].sort(
    (a, b) =>
      b.fracao - a.fracao || b.safra - a.safra || (b.ciclo ?? '').localeCompare(a.ciclo ?? ''),
  )
  const primeira = ordenadas[0]
  return primeira ? { safra: primeira.safra, ciclo: primeira.ciclo } : null
}

/** Soma das frações por variedade (para a prévia e o rótulo). */
export function porVariedade(c: Composicao): Array<{ variedadeId: string | null; fracao: number }> {
  const somas = new Map<string | null, number>()
  for (const x of c.componentes)
    somas.set(x.variedadeId, (somas.get(x.variedadeId) ?? 0) + x.fracao)
  return [...somas.entries()]
    .map(([variedadeId, fracao]) => ({ variedadeId, fracao }))
    .sort((a, b) => b.fracao - a.fracao)
}

/** Soma das frações por safra (para o rótulo: safra ≥ 85%, IN MAPA 14/2018, art. 28). */
export function porSafra(c: Composicao): Array<{ safra: number | null; fracao: number }> {
  const somas = new Map<number | null, number>()
  for (const x of c.componentes) somas.set(x.safra, (somas.get(x.safra) ?? 0) + x.fracao)
  return [...somas.entries()]
    .map(([safra, fracao]) => ({ safra, fracao }))
    .sort((a, b) => b.fracao - a.fracao)
}

/** Safra pela data da colheita (cantina.md, Dados de cada item): o ano da colheita. */
export function safraDaColheita(dataColheita: string): number {
  return Number(dataColheita.slice(0, 4))
}

// Insumos ----------------------------------------------------------------------------------------

/** Unidades da dose: concentração (pelo volume tratado) ou quantidade total. */
export const UNIDADES_DOSE = [
  'g/hL',
  'mg/L',
  'g/L',
  'mL/hL',
  'g',
  'kg',
  'mg',
  'mL',
  'L',
  'un',
] as const
export type UnidadeDose = (typeof UNIDADES_DOSE)[number]

const MASSA: Record<string, number> = { mg: 0.001, g: 1, kg: 1000, t: 1_000_000 }
const VOLUME: Record<string, number> = { mL: 0.001, L: 1, hL: 100 }

/**
 * Quantidade total aplicada, na unidade base do item (g, kg, mL, L, un…): a dose vezes o volume
 * tratado, quando é concentração, ou a própria dose. Sem conversão possível, devolve null.
 */
export function quantidadeAplicada(
  dose: number,
  unidade: UnidadeDose,
  volumeLitros: number,
  unidadeBase: string,
): number | null {
  // Na unidade da grandeza: gramas (massa) ou litros (volume).
  let grandeza: 'massa' | 'volume' | 'un'
  let valor: number
  if (unidade === 'g/hL') [grandeza, valor] = ['massa', (dose * volumeLitros) / 100]
  else if (unidade === 'mg/L') [grandeza, valor] = ['massa', (dose * volumeLitros) / 1000]
  else if (unidade === 'g/L') [grandeza, valor] = ['massa', dose * volumeLitros]
  else if (unidade === 'mL/hL') [grandeza, valor] = ['volume', (dose * volumeLitros) / 100_000]
  else if (unidade === 'un') [grandeza, valor] = ['un', dose]
  else if (unidade in MASSA) [grandeza, valor] = ['massa', dose * MASSA[unidade]!]
  else [grandeza, valor] = ['volume', dose * VOLUME[unidade]!]
  if (grandeza === 'un') return unidadeBase === 'un' ? valor : null
  const tabela = grandeza === 'massa' ? MASSA : VOLUME
  const fator = tabela[unidadeBase]
  return fator ? valor / fator : null
}

/**
 * SO₂ que a adição põe no vinho, em mg/L: a quantidade (na unidade base) vezes o teor de SO₂ do
 * insumo (% em massa; nas soluções, g por 100 mL), dividida pelo volume tratado.
 */
export function so2Adicionado(
  quantidadeBase: number,
  unidadeBase: string,
  teorPercentual: number,
  volumeLitros: number,
): number {
  if (!volumeLitros) return 0
  const gramas =
    unidadeBase in MASSA
      ? quantidadeBase * MASSA[unidadeBase]!
      : unidadeBase in VOLUME
        ? quantidadeBase * VOLUME[unidadeBase]! * 1000
        : 0
  return Math.round(((gramas * teorPercentual) / 100 / volumeLitros) * 1000 * 100) / 100
}
