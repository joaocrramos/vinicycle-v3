// Relatórios agendados (03-modelo-de-dados.md, 2.2, Relatório agendado; 04, roteiro do ciclo 8) ---

export const RELATORIOS_AGENDAVEIS = {
  alertas: {
    nome: 'Resumo dos alertas abertos',
    funcionalidade: 'gestao.inicio',
    link: '/alertas',
  },
  mes: {
    nome: 'Relatório do mês (o mês anterior)',
    funcionalidade: 'enotrace.declaracoes',
    link: '/enotrace/fechamento',
  },
  painel: {
    nome: 'Painel da cantina (volumes por recipiente)',
    funcionalidade: 'enotrace.painel',
    link: '/enotrace/painel',
  },
  estoque: {
    nome: 'Estoque abaixo do mínimo e lotes vencendo',
    funcionalidade: 'enotrace.estoque',
    link: '/enotrace/estoque',
  },
} as const
export type RelatorioAgendavel = keyof typeof RELATORIOS_AGENDAVEIS
export const CHAVES_RELATORIO_AGENDAVEL = Object.keys(RELATORIOS_AGENDAVEIS) as [
  RelatorioAgendavel,
  ...RelatorioAgendavel[],
]

/** Envio às 7h do fuso do estabelecimento: todo dia, às segundas, a cada duas segundas, no dia 1º. */
export const FREQUENCIAS_ENVIO = {
  diaria: 'Todo dia',
  semanal: 'Toda segunda-feira',
  quinzenal: 'A cada duas semanas (segunda-feira)',
  mensal: 'Todo dia 1º',
} as const
export type FrequenciaEnvio = keyof typeof FREQUENCIAS_ENVIO
export const CHAVES_FREQUENCIA_ENVIO = Object.keys(FREQUENCIAS_ENVIO) as [
  FrequenciaEnvio,
  ...FrequenciaEnvio[],
]
