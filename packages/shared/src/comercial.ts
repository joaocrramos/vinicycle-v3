// Parte comercial (administracao.md: Planos, adicionais e assinaturas; Faturas; Inadimplência e
// bloqueio; P25). Listas, validações e as contas de ciclo e proporcional, iguais na API e na tela.
import { z } from 'zod'
import { PERIODICIDADES } from './dominios'

export type Periodicidade = (typeof PERIODICIDADES)[number]

export const NOMES_PERIODICIDADE: Record<Periodicidade, string> = {
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
}

export const MESES_PERIODICIDADE: Record<Periodicidade, number> = {
  mensal: 1,
  trimestral: 3,
  semestral: 6,
  anual: 12,
}

/** Formas de pagamento (administracao.md, Recebimentos). */
export const FORMAS_PAGAMENTO = [
  'pix',
  'boleto',
  'cartao_credito',
  'cartao_debito',
  'transferencia',
  'dinheiro',
] as const
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number]
export const NOMES_FORMA_PAGAMENTO: Record<FormaPagamento, string> = {
  pix: 'PIX',
  boleto: 'Boleto',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  transferencia: 'Transferência',
  dinheiro: 'Dinheiro',
}

/** Adicionais vendidos à parte (P25). */
export const TIPOS_ADICIONAL = [
  'usuario',
  'estabelecimento',
  'armazenamento',
  'modulo',
  'mensagens_whatsapp',
  'mensagens_sms',
] as const
export type TipoAdicional = (typeof TIPOS_ADICIONAL)[number]
export const NOMES_TIPO_ADICIONAL: Record<TipoAdicional, string> = {
  usuario: 'Usuário',
  estabelecimento: 'Estabelecimento',
  armazenamento: 'Armazenamento (GB)',
  modulo: 'Módulo avulso',
  mensagens_whatsapp: 'Mensagens de WhatsApp por mês',
  mensagens_sms: 'Mensagens de SMS por mês',
}

export const TIPOS_DESCONTO = ['percentual', 'valor'] as const

export const TIPOS_MUDANCA = [
  'plano',
  'periodicidade',
  'adicional_inclusao',
  'adicional_retirada',
  'reajuste',
] as const
export type TipoMudanca = (typeof TIPOS_MUDANCA)[number]
export const SITUACOES_MUDANCA = ['agendada', 'aplicada', 'cancelada'] as const
export const NOMES_SITUACAO_MUDANCA: Record<(typeof SITUACOES_MUDANCA)[number], string> = {
  agendada: 'Agendada',
  aplicada: 'Aplicada',
  cancelada: 'Cancelada',
}

export const SITUACOES_FATURA = ['aberta', 'paga', 'parcial', 'vencida', 'cancelada'] as const
export type SituacaoFatura = (typeof SITUACOES_FATURA)[number]
export const NOMES_SITUACAO_FATURA: Record<SituacaoFatura, string> = {
  aberta: 'Aberta',
  paga: 'Paga',
  parcial: 'Parcial',
  vencida: 'Vencida',
  cancelada: 'Cancelada',
}

export const ORIGENS_ITEM_FATURA = [
  'plano',
  'adicional',
  'proporcional',
  'desconto',
  'avulso',
] as const

export const ORIGENS_RECEBIMENTO = ['manual', 'provedor'] as const

// ---- Validações ----

const dinheiro = (mensagem = 'Valor inválido') => z.string().regex(/^\d+(\.\d{1,2})?$/, mensagem)
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null)

const precos = z
  .array(z.object({ periodicidade: z.enum(PERIODICIDADES), valor: dinheiro() }))
  .refine(
    (l) => new Set(l.map((p) => p.periodicidade)).size === l.length,
    'Cada periodicidade aparece uma vez',
  )

/** Plano (P25): preço por periodicidade, módulos, limites e formas aceitas. */
export const planoEntrada = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(80),
  descricao: textoOpcional(500),
  modulos: z.array(z.string()).min(1, 'Escolha ao menos um módulo'),
  limiteEstabelecimentos: z.number().int().min(1).nullable(),
  limiteUsuarios: z.number().int().min(1).nullable(),
  limiteArmazenamentoGb: dinheiro('Limite inválido').nullable(),
  formasPagamento: z.array(z.enum(FORMAS_PAGAMENTO)).min(1, 'Escolha ao menos uma forma'),
  precos: precos.refine((l) => l.length > 0, 'Informe ao menos um preço'),
  /** A partir de quando os preços novos valem; assinaturas em vigor não mudam (P25). */
  precosDesde: z.iso.date(),
})
export type PlanoEntrada = z.infer<typeof planoEntrada>

export const adicionalEntrada = z
  .object({
    nome: z.string().trim().min(2, 'Informe o nome').max(80),
    descricao: textoOpcional(500),
    tipo: z.enum(TIPOS_ADICIONAL),
    /** Módulo liberado pelo adicional do tipo "módulo avulso". */
    moduloCodigo: textoOpcional(30),
    /** Quanto cada unidade acrescenta ao limite (ex.: pacote de 10 GB). */
    quantidadePorUnidade: z.number().int().min(1),
    precos: precos.refine((l) => l.length > 0, 'Informe ao menos um preço'),
    precosDesde: z.iso.date(),
  })
  .refine((d) => (d.tipo === 'modulo') === !!d.moduloCodigo, {
    message: 'O módulo avulso precisa do módulo (e só ele)',
    path: ['moduloCodigo'],
  })
export type AdicionalEntrada = z.infer<typeof adicionalEntrada>

// ---- Contas de data (datas puras "AAAA-MM-DD", P18) ----

function partes(data: string): [number, number, number] {
  const [a, m, d] = data.split('-').map(Number)
  return [a!, m!, d!]
}
function texto(a: number, m: number, d: number): string {
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function ultimoDia(a: number, m: number): number {
  return new Date(Date.UTC(a, m, 0)).getUTCDate()
}

export function somarDias(data: string, dias: number): string {
  const [a, m, d] = partes(data)
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}

/** Dias de `de` até `ate` (positivo quando `ate` é depois). */
export function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = partes(de)
  const [a2, m2, d2] = partes(ate)
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000)
}

/**
 * Soma meses mantendo o dia-base: o dia 31 vira o último dia dos meses mais curtos, e volta a 31
 * quando o mês permite (o ciclo não "escorrega").
 */
export function somarMeses(data: string, meses: number, diaBase?: number): string {
  const [a, m, d] = partes(data)
  const total = a * 12 + (m - 1) + meses
  const na = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return texto(na, nm, Math.min(diaBase ?? d, ultimoDia(na, nm)))
}

/** Ciclo de cobrança que começa em `inicio`: último dia incluído. */
export function fimDoCiclo(inicio: string, periodicidade: Periodicidade, diaBase?: number): string {
  return somarDias(somarMeses(inicio, MESES_PERIODICIDADE[periodicidade], diaBase), -1)
}

/** Vencimento da fatura do ciclo: o primeiro dia `diaVencimento` a partir do início do ciclo. */
export function vencimentoDoCiclo(inicio: string, diaVencimento: number): string {
  const [a, m, d] = partes(inicio)
  const nesteMes = texto(a, m, Math.min(diaVencimento, ultimoDia(a, m)))
  if (Math.min(diaVencimento, ultimoDia(a, m)) >= d) return nesteMes
  return somarMeses(texto(a, m, 1), 1, diaVencimento)
}

// ---- Dinheiro (centavos inteiros, P3) ----

export function paraCentavos(valor: string | number | null | undefined): number {
  if (valor === null || valor === undefined || valor === '') return 0
  return Math.round(Number(valor) * 100)
}
export function deCentavos(centavos: number): string {
  const negativo = centavos < 0
  const abs = Math.abs(centavos)
  return `${negativo ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/**
 * Proporcional dos dias restantes do ciclo (administracao.md, Upgrade): a diferença mensal do
 * ciclo × dias restantes (contando o dia da mudança) ÷ dias do ciclo, arredondada ao centavo.
 */
export function proporcional(
  diferencaCentavos: number,
  ciclo: { inicio: string; fim: string },
  data: string,
): number {
  const diasCiclo = diasEntre(ciclo.inicio, ciclo.fim) + 1
  const restantes = Math.max(0, Math.min(diasCiclo, diasEntre(data, ciclo.fim) + 1))
  return Math.round((diferencaCentavos * restantes) / diasCiclo)
}

// ---- Assinatura ----

export const mudarPlanoEntrada = z.object({ planoId: z.uuid() })
export const mudarPeriodicidadeEntrada = z.object({ periodicidade: z.enum(PERIODICIDADES) })
export const incluirAdicionalEntrada = z.object({
  adicionalId: z.uuid(),
  quantidade: z.number().int().min(1, 'Quantidade inválida').max(1000),
})
export const retirarAdicionalEntrada = z.object({
  quantidade: z.number().int().min(1, 'Quantidade inválida'),
})
/** Dias de vencimento oferecidos (05/10/2026). O 30 vence no último dia de fevereiro. */
export const DIAS_VENCIMENTO = [5, 10, 15, 20, 25, 30] as const

export function diaVencimentoValido(dia: number): boolean {
  return (DIAS_VENCIMENTO as readonly number[]).includes(dia)
}

export const MENSAGEM_DIA_VENCIMENTO = `Escolha um destes dias: ${DIAS_VENCIMENTO.join(', ')}.`

/** Dia padrão de um cliente novo: o primeiro da lista a partir do dia do início; depois do 30, o 5. */
export function diaVencimentoPadrao(inicio: string): number {
  const dia = Number(inicio.slice(8, 10))
  return DIAS_VENCIMENTO.find((d) => d >= dia) ?? DIAS_VENCIMENTO[0]
}

/** O Master do cliente muda o dia do vencimento no máximo uma vez neste prazo (05/10/2026). */
export const INTERVALO_MUDANCA_VENCIMENTO_DIAS = 90
export const dadosCobranca = z.object({
  diaVencimento: z.number().int().min(1).max(31),
  formaPagamento: z.enum(FORMAS_PAGAMENTO).nullable(),
})
export const descontoEntrada = z
  .object({
    tipo: z.enum(TIPOS_DESCONTO),
    valor: dinheiro().refine((v) => Number(v) > 0, 'Informe o desconto'),
    motivo: z.string().trim().min(3, 'Informe o motivo').max(500),
    inicio: z.iso.date(),
    fim: z.iso
      .date()
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null))
      .transform((v) => v ?? null),
  })
  .refine((d) => d.tipo !== 'percentual' || Number(d.valor) <= 100, {
    message: 'O percentual vai até 100%',
    path: ['valor'],
  })
  .refine((d) => !d.fim || d.fim >= d.inicio, {
    message: 'A validade termina antes do início',
    path: ['fim'],
  })

// ---- Faturas e recebimentos ----

export const faturaAvulsaEntrada = z.object({
  vencimento: z.iso.date(),
  observacao: textoOpcional(500),
  itens: z
    .array(
      z.object({
        descricao: z.string().trim().min(2, 'Descreva o item').max(200),
        quantidade: z.number().int().min(1),
        valorUnitario: dinheiro().refine((v) => Number(v) > 0, 'Informe o valor'),
      }),
    )
    .min(1, 'Inclua ao menos um item'),
})

/** Baixa manual (administracao.md, Recebimentos). Chega como campos de formulário. */
export const recebimentoEntrada = z.object({
  data: z.iso.date(),
  valor: dinheiro().refine((v) => Number(v) > 0, 'Informe o valor'),
  forma: z.enum(FORMAS_PAGAMENTO),
  referencia: textoOpcional(200),
})

/**
 * Reajuste do preço contratado pela Administração (decidido em 04/10/2026, pendência 25): vale na
 * renovação; "tabela" = o preço do plano no dia da renovação.
 */
export const reajusteEntrada = z
  .object({
    modo: z.enum(['tabela', 'valor']),
    valor: dinheiro()
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null))
      .transform((v) => v ?? null),
    motivo: z.string().trim().min(3, 'Informe o motivo').max(500),
  })
  .refine((d) => d.modo === 'tabela' || d.valor !== null, {
    message: 'Informe o novo preço',
    path: ['valor'],
  })

// ---- Integrações (administracao.md, Integração de pagamentos; P20) ----

export const TIPOS_INTEGRACAO = ['pagamento', 'whatsapp', 'sms'] as const
export type TipoIntegracao = (typeof TIPOS_INTEGRACAO)[number]
export const ADAPTADORES: Record<TipoIntegracao, readonly string[]> = {
  pagamento: ['asaas'],
  whatsapp: ['meta'],
  sms: [],
}
export const NOMES_ADAPTADOR: Record<string, string> = { asaas: 'Asaas', meta: 'Meta (WhatsApp)' }
export const AMBIENTES_INTEGRACAO = ['teste', 'producao'] as const
/** Formas que um provedor de pagamento cobra (as demais ficam na baixa manual). */
export const FORMAS_PROVEDOR = ['pix', 'boleto', 'cartao_credito'] as const

/** Eventos padrão do ViniCycle: a régua e a baixa usam só estes, nunca o formato do provedor. */
export const EVENTOS_PADRAO = [
  'pago',
  'vencido',
  'estornado',
  'recusado',
  'cancelado',
  'nota_emitida',
  'nota_erro',
  'outro',
] as const
export type EventoPadrao = (typeof EVENTOS_PADRAO)[number]

export const SITUACOES_COBRANCA_EXTERNA = [
  'pendente',
  'ativa',
  'paga',
  'cancelar',
  'cancelada',
  'erro',
] as const
export const SITUACOES_NOTA = ['pendente', 'agendada', 'emitida', 'erro', 'cancelada'] as const

export const integracaoPagamentoEntrada = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(80),
  adaptador: z.enum(['asaas']),
  ambiente: z.enum(AMBIENTES_INTEGRACAO),
  /** Só quando muda: a chave nunca volta para a tela. */
  chave: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((v) => v || null),
  formas: z.array(z.enum(FORMAS_PROVEDOR)).min(1, 'Escolha ao menos uma forma'),
  nfse: z.object({
    ativa: z.boolean(),
    codigoServico: textoOpcional(30),
    descricao: textoOpcional(500),
    aliquotaIss: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, 'Alíquota inválida')
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null))
      .transform((v) => v ?? null),
  }),
  ativo: z.boolean(),
})
export type IntegracaoPagamentoEntrada = z.infer<typeof integracaoPagamentoEntrada>

// ---- Mensagens: WhatsApp e SMS (P20; decidido em 04/10/2026, pendência 25) ----

export const CANAIS_MENSAGEM = ['email', 'whatsapp', 'sms'] as const
export type CanalMensagem = (typeof CANAIS_MENSAGEM)[number]
export const NOMES_CANAL: Record<CanalMensagem, string> = {
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
}

/**
 * WhatsApp pela API oficial da Meta: a mensagem que a empresa inicia precisa de um modelo aprovado
 * por ela. O ViniCycle usa um modelo com uma variável no corpo ({{1}}), que recebe o texto do aviso.
 */
export const integracaoWhatsappEntrada = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(80),
  adaptador: z.enum(['meta']),
  /** Identificador do número na Meta (phone number ID). */
  numeroId: z
    .string()
    .trim()
    .regex(/^\d{5,30}$/, 'Identificador do número inválido'),
  modelo: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{1,512}$/, 'Nome do modelo inválido (minúsculas, números e _)'),
  idioma: z.string().trim().min(2).max(10),
  chave: z
    .string()
    .trim()
    .max(1000)
    .nullable()
    .optional()
    .transform((v) => v || null),
  ativo: z.boolean(),
})

/** Preferência de canal de cada usuário para os avisos (P20). */
export const preferenciaCanais = z.object({
  whatsapp: z.boolean(),
  sms: z.boolean(),
})

/** Modelos de mensagem editáveis pela Administração (variáveis entre chaves duplas). */
export const MODELOS_EDITAVEIS = {
  convite: { nome: 'Convite', variaveis: ['empresa', 'quem', 'dias', 'link'] },
  cobranca_teste_fim: {
    nome: 'Fim do teste chegando',
    variaveis: ['empresa', 'dias', 'fim', 'link'],
  },
  cobranca_teste_encerrado: { nome: 'Teste encerrado', variaveis: ['empresa', 'link'] },
  cobranca_vencimento: {
    nome: 'Fatura a vencer',
    variaveis: ['empresa', 'numero', 'valor', 'vencimento', 'dias', 'link'],
  },
  cobranca_vencida: {
    nome: 'Fatura vencida',
    variaveis: ['empresa', 'numero', 'valor', 'vencimento', 'somenteLeituraEm', 'link'],
  },
  cobranca_somente_leitura: {
    nome: 'Somente leitura',
    variaveis: ['empresa', 'numero', 'bloqueioEm', 'link'],
  },
  cobranca_bloqueio: { nome: 'Bloqueio', variaveis: ['empresa', 'numero', 'link'] },
  cobranca_desbloqueio: { nome: 'Liberação', variaveis: ['empresa'] },
  cobranca_limite_renovacao: {
    nome: 'Limites antes da renovação',
    variaveis: ['empresa', 'renovacao', 'excessos', 'link'],
  },
  cobranca_franquia_esgotada: {
    nome: 'Franquia de mensagens esgotada',
    variaveis: ['empresa', 'canal', 'mes', 'link'],
  },
} as const
export type CodigoModeloEditavel = keyof typeof MODELOS_EDITAVEIS

export const versaoModeloEntrada = z.object({
  assunto: z.string().trim().min(3, 'Informe o assunto').max(200),
  corpo: z.string().trim().min(3, 'Informe o texto').max(5000),
})

/** Troca as variáveis {{nome}} pelos valores; variável desconhecida fica em branco. */
export function preencherModelo(texto: string, variaveis: Record<string, string>): string {
  return texto.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_, v: string) => variaveis[v] ?? '')
}

// ---- Suporte: chamados (administracao.md, Suporte; decidido em 03/10/2026) ----

export const PRIORIDADES_CHAMADO = ['baixa', 'normal', 'alta', 'urgente'] as const
export type PrioridadeChamado = (typeof PRIORIDADES_CHAMADO)[number]
export const NOMES_PRIORIDADE: Record<PrioridadeChamado, string> = {
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
}
/** Prazo padrão da primeira resposta, em horas corridas (ajustável por plano ou cliente). */
export const PRAZO_PADRAO_HORAS: Record<PrioridadeChamado, number> = {
  urgente: 4,
  alta: 8,
  normal: 24,
  baixa: 72,
}

export const SITUACOES_CHAMADO = [
  'aberto',
  'em_atendimento',
  'aguardando_cliente',
  'resolvido',
  'fechado',
] as const
export type SituacaoChamado = (typeof SITUACOES_CHAMADO)[number]
export const NOMES_SITUACAO_CHAMADO: Record<SituacaoChamado, string> = {
  aberto: 'Aberto',
  em_atendimento: 'Em atendimento',
  aguardando_cliente: 'Aguardando o cliente',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
}
export const TOM_SITUACAO_CHAMADO: Record<
  SituacaoChamado,
  'primario' | 'alerta' | 'neutro' | 'sucesso'
> = {
  aberto: 'primario',
  em_atendimento: 'alerta',
  aguardando_cliente: 'neutro',
  resolvido: 'sucesso',
  fechado: 'neutro',
}

export const CATEGORIAS_CHAMADO_PADRAO = [
  'Dúvida',
  'Erro no sistema',
  'Sugestão',
  'Financeiro',
  'Acesso',
  'Outro',
]

export const novoChamado = z.object({
  assunto: z.string().trim().min(3, 'Informe o assunto').max(200),
  categoria: z.string().trim().min(2).max(60),
  prioridade: z.enum(PRIORIDADES_CHAMADO),
  descricao: z.string().trim().min(10, 'Descreva com mais detalhes').max(10_000),
})

/** Página pública: quem não consegue entrar (administracao.md, Suporte). */
export const chamadoPublico = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(120),
  email: z.string().trim().toLowerCase().pipe(z.email('E-mail inválido').max(254)),
  cnpj: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .pipe(z.string().regex(/^(\d{11}|\d{14})$/, 'Informe o CNPJ ou o CPF da empresa')),
  assunto: z.string().trim().min(3, 'Informe o assunto').max(200),
  descricao: z.string().trim().min(10, 'Descreva com mais detalhes').max(10_000),
})

export const mensagemChamado = z.object({
  texto: z.string().trim().min(1, 'Escreva a mensagem').max(10_000),
  interna: z.boolean().default(false),
})
