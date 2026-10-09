// Listas fechadas usadas no banco (CHECK), na API e na interface.

/** administracao.md, Ficha do cliente; 03-modelo-de-dados.md, divergência 7.8. */
export const SITUACOES_EMPRESA = [
  'teste',
  'ativo',
  'somente_leitura',
  'bloqueado',
  'inativo',
] as const
export type SituacaoEmpresa = (typeof SITUACOES_EMPRESA)[number]

export const NOMES_SITUACAO_EMPRESA: Record<SituacaoEmpresa, string> = {
  teste: 'Em teste',
  ativo: 'Ativo',
  somente_leitura: 'Somente leitura',
  bloqueado: 'Bloqueado',
  inativo: 'Inativo',
}

export const ORIGENS_SITUACAO = [
  'teste',
  'inadimplencia',
  'manual',
  'criacao',
  'contratacao',
  'pagamento',
] as const

export const PERIODICIDADES = ['mensal', 'trimestral', 'semestral', 'anual'] as const

/** Origem da uva do estabelecimento (00-visao-geral.md, Perfil da vinícola). */
export const ORIGENS_UVA = ['propria', 'comprada', 'ambas'] as const
export const NOMES_ORIGEM_UVA: Record<(typeof ORIGENS_UVA)[number], string> = {
  propria: 'Própria',
  comprada: 'Comprada',
  ambas: 'Própria e comprada',
}

/**
 * Atividades registradas no MAPA. O Decreto 12.709/2025 não classifica os estabelecimentos
 * vinícolas; a lista segue a Lei 7.678/1988 (arts. 27 e 31) e a classificação revogada do
 * Decreto 8.198/2014 (pesquisa/2026-10-elaboracao-por-terceiros.md). O cliente marca as suas.
 */
export const ATIVIDADES_MAPA = [
  'produtor',
  'padronizador',
  'engarrafador',
  'atacadista',
  'exportador',
  'importador',
] as const
export const NOMES_ATIVIDADE_MAPA: Record<(typeof ATIVIDADES_MAPA)[number], string> = {
  produtor: 'Produtor (elaborador)',
  padronizador: 'Padronizador',
  engarrafador: 'Engarrafador (envasilhador)',
  atacadista: 'Atacadista',
  exportador: 'Exportador',
  importador: 'Importador',
}

export const FORMAS_REGISTRO = ['planilha', 'papel', 'outro_sistema', 'nenhuma'] as const
export const NOMES_FORMA_REGISTRO: Record<(typeof FORMAS_REGISTRO)[number], string> = {
  planilha: 'Planilha',
  papel: 'Papel',
  outro_sistema: 'Outro sistema',
  nenhuma: 'Ainda não registra',
}

/** Uso do local (03-modelo-de-dados.md, 2.2 Local). */
export const USOS_LOCAL = ['recipientes', 'estoque', 'ambos'] as const
export const NOMES_USO_LOCAL: Record<(typeof USOS_LOCAL)[number], string> = {
  recipientes: 'Recipientes',
  estoque: 'Estoque',
  ambos: 'Recipientes e estoque',
}

/** P15. */
export const CATEGORIAS_ANEXO = [
  'laudo',
  'nota_fiscal',
  'certificado',
  'foto',
  'rotulo',
  'comprovante',
  'contrato',
  'outro',
] as const
export type CategoriaAnexo = (typeof CATEGORIAS_ANEXO)[number]
export const NOMES_CATEGORIA_ANEXO: Record<CategoriaAnexo, string> = {
  laudo: 'Laudo',
  nota_fiscal: 'Nota fiscal',
  certificado: 'Certificado',
  foto: 'Foto',
  rotulo: 'Rótulo',
  contrato: 'Contrato',
  comprovante: 'Comprovante',
  outro: 'Outro',
}

/** Tipos aceitos nos anexos e tamanho máximo por arquivo (P15). */
export const TIPOS_ANEXO_ACEITOS = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'text/plain',
  'text/csv',
  'text/xml',
  'application/xml',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/msword',
] as const
export const TAMANHO_MAXIMO_ANEXO = 25 * 1024 * 1024

export const ESCOPOS_PERFIL = ['plataforma', 'modelo', 'empresa'] as const

export const SITUACOES_CONVITE = ['pendente', 'aceito', 'expirado', 'cancelado'] as const
export type SituacaoConvite = (typeof SITUACOES_CONVITE)[number]

export const TIPOS_TOKEN = [
  'redefinir_senha',
  'trocar_senha',
  'trocar_email',
  'aceite_bastao',
] as const
export type TipoToken = (typeof TIPOS_TOKEN)[number]

export const TIPOS_TERMO = ['termos_uso', 'privacidade'] as const

export const SITUACOES_ENVIO = ['pendente', 'enviado', 'falhou'] as const

/** Fusos do Brasil (P18), com a sugestão por UF. */
export const FUSOS_BRASIL = [
  'America/Noronha',
  'America/Sao_Paulo',
  'America/Bahia',
  'America/Fortaleza',
  'America/Recife',
  'America/Maceio',
  'America/Belem',
  'America/Araguaina',
  'America/Santarem',
  'America/Manaus',
  'America/Cuiaba',
  'America/Campo_Grande',
  'America/Porto_Velho',
  'America/Boa_Vista',
  'America/Rio_Branco',
] as const

export const FUSO_POR_UF: Record<string, (typeof FUSOS_BRASIL)[number]> = {
  AC: 'America/Rio_Branco',
  AL: 'America/Maceio',
  AM: 'America/Manaus',
  AP: 'America/Belem',
  BA: 'America/Bahia',
  CE: 'America/Fortaleza',
  DF: 'America/Sao_Paulo',
  ES: 'America/Sao_Paulo',
  GO: 'America/Sao_Paulo',
  MA: 'America/Fortaleza',
  MG: 'America/Sao_Paulo',
  MS: 'America/Campo_Grande',
  MT: 'America/Cuiaba',
  PA: 'America/Belem',
  PB: 'America/Fortaleza',
  PE: 'America/Recife',
  PI: 'America/Fortaleza',
  PR: 'America/Sao_Paulo',
  RJ: 'America/Sao_Paulo',
  RN: 'America/Fortaleza',
  RO: 'America/Porto_Velho',
  RR: 'America/Boa_Vista',
  RS: 'America/Sao_Paulo',
  SC: 'America/Sao_Paulo',
  SE: 'America/Maceio',
  SP: 'America/Sao_Paulo',
  TO: 'America/Araguaina',
}

/** Formatos de código padrão (cantina.md, Códigos; P19). */
export const FORMATOS_CODIGO_PADRAO = {
  romaneio: 'ROM-{AAAA}-{NNNN}',
  projeto: 'PRJ-{AAAA}-{NNN}',
  lote_producao: '{SAFRA}.{CC}-{NNN}',
  operacao: 'OP-{AAAA}-{NNNNN}',
  lote_comercial: 'L{AA}-{NNNN}',
} as const

// Ciclo 2: catálogos e cadastros.

/** Papéis de pessoa (gestao.md, Pessoas). Só a plataforma cria papéis novos. */
export const PAPEIS = [
  { codigo: 'cliente', nome: 'Cliente' },
  { codigo: 'fornecedor', nome: 'Fornecedor' },
  { codigo: 'fabricante', nome: 'Fabricante' },
  { codigo: 'produtor_uva', nome: 'Produtor de uva' },
  { codigo: 'funcionario', nome: 'Funcionário' },
  { codigo: 'transportador', nome: 'Transportador' },
  { codigo: 'laboratorio', nome: 'Laboratório' },
  { codigo: 'responsavel_tecnico', nome: 'Responsável técnico' },
  { codigo: 'cantina_prestadora', nome: 'Cantina prestadora de serviço' },
  { codigo: 'cliente_vinificacao', nome: 'Cliente de vinificação' },
  { codigo: 'engarrafadora', nome: 'Engarrafadora' },
] as const
export type CodigoPapel = (typeof PAPEIS)[number]['codigo']
export const CODIGOS_PAPEL = PAPEIS.map((p) => p.codigo) as unknown as readonly [
  CodigoPapel,
  ...CodigoPapel[],
]
export const NOMES_PAPEL = Object.fromEntries(PAPEIS.map((p) => [p.codigo, p.nome])) as Record<
  CodigoPapel,
  string
>

/** Variedades (tabela de cultivares do SISDEVIN, 30/03/2023). */
export const TIPOS_UVA = ['vinifera', 'americana_hibrida'] as const
export const NOMES_TIPO_UVA: Record<(typeof TIPOS_UVA)[number], string> = {
  vinifera: 'Vinífera',
  americana_hibrida: 'Americana ou híbrida',
}
export const CORES_UVA = ['tinta', 'branca', 'rosada'] as const
export const NOMES_COR_UVA: Record<(typeof CORES_UVA)[number], string> = {
  tinta: 'Tinta',
  branca: 'Branca',
  rosada: 'Rosada',
}

/** Situação do cadastro vitícola do produtor (SIVIBE). */
export const SITUACOES_SIVIBE = ['regular', 'irregular', 'nao_verificado'] as const
export const NOMES_SITUACAO_SIVIBE: Record<(typeof SITUACOES_SIVIBE)[number], string> = {
  regular: 'Regular',
  irregular: 'Irregular',
  nao_verificado: 'Não verificado',
}

/** Listas simples configuráveis (opcao_lista): catálogo global + itens próprios (P8, P29). */
export const LISTAS = {
  motivo_perda: 'Motivos de perda',
  cargo: 'Cargos',
  fracao_prensa: 'Frações de prensa',
  metodo_trasfega: 'Métodos de trasfega',
  tipo_saida: 'Tipos de saída',
  etapa_producao: 'Etapas de produção',
  metodo_espumante: 'Métodos de espumante',
  estagio_espumante: 'Estágios do espumante na garrafa',
  cor_vinho: 'Cores do vinho',
  teor_acucar: 'Classificação quanto ao açúcar',
  categoria_fornecimento: 'Categorias de fornecimento',
  conselho_profissional: 'Conselhos profissionais',
  material_recipiente: 'Materiais de recipiente',
  origem_madeira: 'Origens da madeira',
  tosta: 'Tostas',
  apresentacao_insumo: 'Apresentações de insumo',
} as const
export type Lista = keyof typeof LISTAS
export const NOMES_LISTAS = Object.keys(LISTAS) as [Lista, ...Lista[]]

/** Listas que só a plataforma define (oficiais): a empresa não cria itens próprios. */
export const LISTAS_OFICIAIS: readonly Lista[] = [
  'cor_vinho',
  'teor_acucar',
  'conselho_profissional',
]

/** Situação do recipiente (cantina.md, Recipientes). */
export const SITUACOES_RECIPIENTE = [
  'ativo',
  'aguardando_higienizacao',
  'manutencao',
  'inativo',
] as const
export const NOMES_SITUACAO_RECIPIENTE: Record<(typeof SITUACOES_RECIPIENTE)[number], string> = {
  ativo: 'Ativo',
  aguardando_higienizacao: 'Aguardando higienização',
  manutencao: 'Em manutenção',
  inativo: 'Inativo',
}

/** Itens de estoque (ambiente-cliente.md, Estoque). */
export const TIPOS_ITEM_ESTOQUE = [
  'insumo',
  'embalagem',
  'produto_acabado',
  'selo',
  'outro',
] as const
export const NOMES_TIPO_ITEM: Record<(typeof TIPOS_ITEM_ESTOQUE)[number], string> = {
  insumo: 'Insumo',
  embalagem: 'Embalagem',
  produto_acabado: 'Produto acabado',
  selo: 'Selo',
  outro: 'Outro',
}

/** Situação de um documento com vencimento (gestao.md, Documentos). */
export const SITUACOES_VENCIMENTO = ['sem_vencimento', 'em_dia', 'vencendo', 'vencido'] as const
export const NOMES_SITUACAO_VENCIMENTO: Record<(typeof SITUACOES_VENCIMENTO)[number], string> = {
  sem_vencimento: 'Sem vencimento',
  em_dia: 'Em dia',
  vencendo: 'Vencendo',
  vencido: 'Vencido',
}

/** Livro do estoque (03-modelo-de-dados.md, 2.4, Movimento de estoque). */
export const TIPOS_MOVIMENTO_ESTOQUE = {
  entrada: 'Entrada',
  entrada_nfe: 'Entrada por NF-e',
  consumo_operacao: 'Consumo em operação',
  consumo_envase: 'Consumo em envase',
  producao: 'Produção',
  saida: 'Saída',
  devolucao: 'Devolução',
  transferencia: 'Transferência entre locais',
  ajuste_inventario: 'Ajuste de inventário',
  descarte: 'Descarte',
  carga_inicial: 'Carga inicial',
  titularidade: 'Transferência de titularidade',
  estorno: 'Estorno',
} as const
export type TipoMovimentoEstoque = keyof typeof TIPOS_MOVIMENTO_ESTOQUE
export const CHAVES_TIPO_MOVIMENTO_ESTOQUE = Object.keys(TIPOS_MOVIMENTO_ESTOQUE) as [
  TipoMovimentoEstoque,
  ...TipoMovimentoEstoque[],
]

/** Origem do lote de item (03-modelo-de-dados.md, 2.4, Lote de item). */
export const ORIGENS_LOTE_ITEM = [
  'entrada',
  'nfe',
  'producao',
  'retorno_terceiro',
  'carga_inicial',
  'consumo',
  'titularidade',
] as const

/** Situação da validade de um lote de item (ambiente-cliente.md, Estoque: validade). */
export const SITUACOES_VALIDADE = {
  sem_validade: 'Sem validade',
  valido: 'Válido',
  vencendo: 'Vencendo',
  vencido: 'Vencido',
} as const
