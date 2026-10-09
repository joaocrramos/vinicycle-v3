// Parâmetros simples da empresa (gestao.md, Configurações): uma chave, um valor validado. Os
// parâmetros que têm tela própria (listas, parâmetros técnicos, tipos de documento) não entram
// aqui; os do laboratório, das aprovações e dos bloqueios chegam com o ciclo que os usa.
import { z } from 'zod';

// Formatos de código (P19) ----------------------------------------------------------------------

/** Marcadores aceitos num formato de código. */
export const MARCADORES_CODIGO = {
  '{AAAA}': 'ano com 4 dígitos',
  '{AA}': 'ano com 2 dígitos',
  '{CC}': 'ciclo da safra (01, 02…)',
  '{NNN}': 'sequência; cada N é um dígito (de 2 a 8)',
} as const;

const MARCADOR = /\{(AAAA|AA|CC|N{2,8})\}/g;

/** Confere o formato: só marcadores conhecidos, uma sequência e o ano (a sequência recomeça a cada ano). */
export function erroDoFormatoCodigo(formato: string): string | null {
  const resto = formato.replace(MARCADOR, '');
  if (/[{}]/.test(resto)) return 'Há um marcador desconhecido. Use {AAAA}, {AA}, {CC} ou {NNN}.';
  if (!/^[A-Za-z0-9.\-/_ ]*$/.test(resto))
    return 'Use só letras, números, espaço e os sinais . - / _ fora dos marcadores.';
  const sequencias = formato.match(/\{N{2,8}\}/g) ?? [];
  if (sequencias.length !== 1) return 'Inclua uma sequência, como {NNNN}.';
  if (!/\{AAAA\}|\{AA\}/.test(formato))
    return 'Inclua o ano ({AAAA} ou {AA}): a sequência recomeça a cada ano.';
  return null;
}

/** Monta o código. Sem ciclos configurados, {CC} vale 01. */
export function montarCodigo(
  formato: string,
  dados: { ano: number; numero: number; ciclo?: string | null },
): string {
  return formato.replace(MARCADOR, (_, m: string) => {
    if (m === 'AAAA') return String(dados.ano);
    if (m === 'AA') return String(dados.ano % 100).padStart(2, '0');
    if (m === 'CC') return dados.ciclo ?? '01';
    return String(dados.numero).padStart(m.length, '0');
  });
}

const formatoCodigo = z
  .string()
  .trim()
  .min(1, 'Informe o formato')
  .max(40)
  .superRefine((v, ctx) => {
    const erro = erroDoFormatoCodigo(v);
    if (erro) ctx.addIssue({ code: 'custom', message: erro });
  });

export const TIPOS_CODIGO = {
  romaneio: { nome: 'Romaneio', padrao: 'ROM-{AAAA}-{NNNN}' },
  projeto: { nome: 'Projeto de vinho', padrao: 'PRJ-{AAAA}-{NNN}' },
  lote_producao: { nome: 'Lote de produção (interno)', padrao: '{AAAA}.{CC}-{NNN}' },
  operacao: { nome: 'Operação', padrao: 'OP-{AAAA}-{NNNNN}' },
  lote_comercial: { nome: 'Lote comercial (contrarrótulo)', padrao: 'L{AA}-{NNNN}' },
  tiragem: { nome: 'Lote de tiragem (espumante na garrafa)', padrao: 'TIR-{AAAA}-{NNN}' },
  amostra: { nome: 'Amostra para laboratório', padrao: 'AM-{AAAA}-{NNNN}' },
} as const;
export type TipoCodigo = keyof typeof TIPOS_CODIGO;

// Estratégia de baixa nas saídas (cantina.md, Saídas) -------------------------------------------

export const ESTRATEGIAS_BAIXA = {
  mais_antigo: 'Mais antigo primeiro',
  escolha: 'Escolha na conferência',
  sem_lote: 'Sem lote',
} as const;

// Registro ---------------------------------------------------------------------------------------

export const PARAMETROS = {
  formatos_codigo: {
    titulo: 'Formatos de código',
    fonte: 'P19',
    esquema: z.object(
      Object.fromEntries(Object.keys(TIPOS_CODIGO).map((k) => [k, formatoCodigo])) as Record<
        TipoCodigo,
        typeof formatoCodigo
      >,
    ),
    padrao: Object.fromEntries(
      Object.entries(TIPOS_CODIGO).map(([k, v]) => [k, v.padrao]),
    ) as Record<TipoCodigo, string>,
  },
  baixa_saidas: {
    titulo: 'De qual lote sai cada garrafa',
    fonte: 'cantina.md, Saídas',
    esquema: z.object({
      usarLoteDoDocumento: z.boolean(),
      padrao: z.enum(Object.keys(ESTRATEGIAS_BAIXA) as [keyof typeof ESTRATEGIAS_BAIXA]),
    }),
    padrao: { usarLoteDoDocumento: true, padrao: 'mais_antigo' as keyof typeof ESTRATEGIAS_BAIXA },
  },
  higienizar_ao_esvaziar: {
    titulo: 'Recipiente vazio fica aguardando higienização',
    fonte: 'cantina.md, Recipientes',
    esquema: z.object({ ativo: z.boolean() }),
    padrao: { ativo: true },
  },
  fim_fermentacao: {
    titulo: 'Sugestão de fim da fermentação alcoólica',
    fonte: 'cantina.md, Fermentações',
    esquema: z.object({
      leituras: z.number().int().min(2, 'Use de 2 a 10 leituras').max(10, 'Use de 2 a 10 leituras'),
      densidadeMaxima: z
        .number()
        .min(0.98, 'Use de 0,9800 a 1,0100')
        .max(1.01, 'Use de 0,9800 a 1,0100'),
    }),
    padrao: { leituras: 3, densidadeMaxima: 0.995 },
  },
  inventario_cantina: {
    titulo: 'Diferença do inventário da cantina que pede atenção',
    fonte: 'cantina.md, Inventário',
    esquema: z.object({
      percentual: z.number().min(0.1, 'Use de 0,1% a 20%').max(20, 'Use de 0,1% a 20%'),
    }),
    padrao: { percentual: 2 },
  },
  avisos_validade: {
    titulo: 'Antecedência dos avisos de validade',
    fonte: 'P20',
    esquema: z.object({
      dias: z
        .array(z.number().int().min(1, 'Use de 1 a 365 dias').max(365, 'Use de 1 a 365 dias'))
        .min(1, 'Informe ao menos um aviso')
        .max(3, 'No máximo três avisos')
        .refine((d) => new Set(d).size === d.length, 'Há dias repetidos'),
    }),
    padrao: { dias: [60, 30, 7] },
  },
  envase: {
    titulo: 'Envase',
    fonte: 'cantina.md, Engarrafamento; IN MAPA 14/2018, art. 11, §4º',
    esquema: z.object({
      /** Perda média de vinho no envase, para prever as garrafas. */
      perdaPercentual: z.number().min(0, 'Use de 0% a 20%').max(20, 'Use de 0% a 20%'),
      /** Laudo com teor alcoólico fora de ±0,5% vol do rótulo: bloqueia em vez de alertar. */
      bloquearLaudo: z.boolean(),
    }),
    padrao: { perdaPercentual: 1, bloquearLaudo: false },
  },
  chaptalizacao: {
    titulo: 'Chaptalização',
    fonte: 'cantina.md, Chaptalização; P29',
    esquema: z.object({
      /** Açúcar que dá 1% vol de álcool, para o ganho estimado. */
      acucarPorGrau: z.number().min(15, 'Use de 15 a 20 g/L').max(20, 'Use de 15 a 20 g/L'),
      /** Limite da prática da vinícola (alerta com "ciente"), além do limite legal. Vazio = sem. */
      limitePratica: z
        .number()
        .min(0.1, 'Use de 0,1% a 5% vol')
        .max(5, 'Use de 0,1% a 5% vol')
        .nullable(),
    }),
    padrao: { acucarPorGrau: 17, limitePratica: null },
  },
  aprovacoes: {
    titulo: 'Ações que exigem aprovação',
    fonte: 'P27, Fluxo de aprovação',
    esquema: z.object({
      inventario: z.boolean(),
      estorno: z.boolean(),
      reabertura: z.boolean(),
      retificacao: z.boolean(),
    }),
    padrao: { inventario: false, estorno: false, reabertura: false, retificacao: false },
  },
} as const;

/** Ações que a empresa pode sujeitar à aprovação (P27; 04, roteiro do ciclo 8). */
export const TIPOS_APROVACAO = {
  inventario: 'Ajuste de inventário acima do limite',
  estorno: 'Estorno de operação',
  reabertura: 'Reabertura de mês',
  retificacao: 'Retificação de declaração',
} as const;
export type TipoAprovacao = keyof typeof TIPOS_APROVACAO;
export const CHAVES_TIPO_APROVACAO = Object.keys(TIPOS_APROVACAO) as [
  TipoAprovacao,
  ...TipoAprovacao[],
];
export const SITUACOES_APROVACAO = {
  pendente: 'Pendente',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
  cancelada: 'Cancelada',
  falhou: 'Aprovada, mas não foi feita',
} as const;
export type SituacaoAprovacao = keyof typeof SITUACOES_APROVACAO;
export const CHAVES_SITUACAO_APROVACAO = Object.keys(SITUACOES_APROVACAO) as [
  SituacaoAprovacao,
  ...SituacaoAprovacao[],
];

export type ChaveParametro = keyof typeof PARAMETROS;
export type ValorParametro<C extends ChaveParametro> = z.output<(typeof PARAMETROS)[C]['esquema']>;
export const CHAVES_PARAMETRO = Object.keys(PARAMETROS) as [ChaveParametro, ...ChaveParametro[]];
