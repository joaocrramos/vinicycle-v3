// Autocontrole (gestao.md, Autocontrole; Decreto 12.709/2025, arts. 117 a 120): o modelo inicial
// com os controles da norma é só o ponto de partida. O cliente inclui, altera, inativa e muda a
// periodicidade de qualquer controle (P29; decidido pelo João Carlos em 04/10/2026).
import { z } from 'zod';

export const UNIDADES_PERIODICIDADE = {
  dia: 'dia(s)',
  semana: 'semana(s)',
  mes: 'mês(es)',
  ano: 'ano(s)',
} as const;
export type UnidadePeriodicidade = keyof typeof UNIDADES_PERIODICIDADE;
export const CHAVES_UNIDADE_PERIODICIDADE = Object.keys(UNIDADES_PERIODICIDADE) as [
  UnidadePeriodicidade,
  ...UnidadePeriodicidade[],
];

/** Evidência que o próprio sistema registra: a higienização de recipientes e as leituras de temperatura. */
export const EVIDENCIAS_AUTOMATICAS = {
  higienizacao: 'Higienização de recipientes (operações da cantina)',
  temperatura: 'Leituras de temperatura (análises e fermentações)',
} as const;
export type EvidenciaAutomatica = keyof typeof EVIDENCIAS_AUTOMATICAS;
export const CHAVES_EVIDENCIA_AUTOMATICA = Object.keys(EVIDENCIAS_AUTOMATICAS) as [
  EvidenciaAutomatica,
  ...EvidenciaAutomatica[],
];

export interface ModeloControle {
  codigo: string;
  nome: string;
  descricao: string;
  /** Vazio = sob demanda. */
  periodicidade: { quantidade: number; unidade: UnidadePeriodicidade } | null;
  evidenciaAutomatica: EvidenciaAutomatica | null;
}

const FONTE = 'Decreto 12.709/2025, arts. 117 a 120';

/** Controles da norma, com as periodicidades sugeridas (04, roteiro do ciclo 8). */
export const MODELO_AUTOCONTROLE: ModeloControle[] = [
  {
    codigo: 'fornecedores',
    nome: 'Qualificação de fornecedores',
    descricao: `Avaliação dos fornecedores de uva, insumos e embalagens (${FONTE}).`,
    periodicidade: { quantidade: 1, unidade: 'ano' },
    evidenciaAutomatica: null,
  },
  {
    codigo: 'agua',
    nome: 'Potabilidade da água',
    descricao: `Laudo de potabilidade da água usada no processo e na higienização (${FONTE}).`,
    periodicidade: { quantidade: 6, unidade: 'mes' },
    evidenciaAutomatica: null,
  },
  {
    codigo: 'pragas',
    nome: 'Controle de pragas',
    descricao: `Controle integrado de pragas, com o certificado da empresa contratada (${FONTE}).`,
    periodicidade: { quantidade: 1, unidade: 'mes' },
    evidenciaAutomatica: null,
  },
  {
    codigo: 'higienizacao',
    nome: 'Higienização de instalações e recipientes',
    descricao: `Limpeza e sanitização de equipamentos, recipientes e instalações (${FONTE}). As higienizações lançadas na cantina contam como evidência.`,
    periodicidade: { quantidade: 1, unidade: 'mes' },
    evidenciaAutomatica: 'higienizacao',
  },
  {
    codigo: 'manutencao',
    nome: 'Manutenção de equipamentos',
    descricao: `Manutenção preventiva e calibração de equipamentos e instrumentos (${FONTE}).`,
    periodicidade: { quantidade: 1, unidade: 'ano' },
    evidenciaAutomatica: null,
  },
  {
    codigo: 'temperatura',
    nome: 'Controle de temperatura',
    descricao: `Temperatura dos recipientes e dos locais refrigerados, conforme o risco (${FONTE}). As leituras lançadas na cantina contam como evidência.`,
    periodicidade: { quantidade: 1, unidade: 'mes' },
    evidenciaAutomatica: 'temperatura',
  },
  {
    codigo: 'quimicos',
    nome: 'Produtos químicos',
    descricao: `Guarda, identificação e uso de produtos químicos e de limpeza (${FONTE}).`,
    periodicidade: { quantidade: 1, unidade: 'ano' },
    evidenciaAutomatica: null,
  },
  {
    codigo: 'treinamento',
    nome: 'Treinamento da equipe',
    descricao: `Capacitação em boas práticas e higiene (${FONTE}).`,
    periodicidade: { quantidade: 1, unidade: 'ano' },
    evidenciaAutomatica: null,
  },
  {
    codigo: 'reclamacoes',
    nome: 'Reclamações de clientes',
    descricao: `Registro e tratamento das reclamações (${FONTE}).`,
    periodicidade: null,
    evidenciaAutomatica: null,
  },
  {
    codigo: 'recolhimento',
    nome: 'Recolhimento (recall)',
    descricao: `Procedimento de recolhimento e simulação a partir do relatório "Quem recebeu o lote" (${FONTE}).`,
    periodicidade: { quantidade: 1, unidade: 'ano' },
    evidenciaAutomatica: null,
  },
];

export const esquemaControle = z
  .object({
    nome: z.string().trim().min(2, 'Informe o nome').max(120),
    descricao: z.string().trim().max(2000).nullable().optional(),
    /** As duas vazias = sob demanda. */
    periodicidadeQuantidade: z.number().int().min(1, 'Use de 1 a 999').max(999).nullable(),
    periodicidadeUnidade: z.enum(CHAVES_UNIDADE_PERIODICIDADE).nullable(),
    responsavelId: z.uuid().nullable().optional(),
    evidenciaAutomatica: z.enum(CHAVES_EVIDENCIA_AUTOMATICA).nullable().optional(),
  })
  .refine((c) => (c.periodicidadeQuantidade === null) === (c.periodicidadeUnidade === null), {
    message: 'Informe a quantidade e a unidade, ou deixe as duas vazias (sob demanda)',
    path: ['periodicidadeQuantidade'],
  });

export const esquemaEvidencia = z.object({
  realizadaEm: z.iso.date('Informe a data'),
  descricao: z.string().trim().min(2, 'Descreva o que foi feito').max(2000),
});

/** "a cada 6 mês(es)" → "a cada 6 meses"; vazio = sob demanda. */
export function textoPeriodicidade(
  quantidade: number | null,
  unidade: UnidadePeriodicidade | null,
): string {
  if (!quantidade || !unidade) return 'Sob demanda';
  const nomes: Record<UnidadePeriodicidade, [string, string]> = {
    dia: ['dia', 'dias'],
    semana: ['semana', 'semanas'],
    mes: ['mês', 'meses'],
    ano: ['ano', 'anos'],
  };
  const [um, varios] = nomes[unidade];
  return quantidade === 1
    ? `${unidade === 'semana' ? 'Toda' : 'Todo'} ${um}`
    : `A cada ${quantidade} ${varios}`;
}
