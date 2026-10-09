// Módulos, funcionalidades e grade de permissões (P25, P27).
//
// Este catálogo é a fonte das tabelas `modulo` e `funcionalidade` (carregadas pelo script de
// dados de referência) e da grade inicial dos perfis-modelo. A API verifica as permissões no
// servidor em toda requisição; a interface usa o mesmo catálogo só para esconder o que não pode.

export const ACOES = [
  'visualizar',
  'criar',
  'editar',
  'inativar',
  'confirmar',
  'estornar',
  'exportar',
  'importar',
  'reabrir_periodo',
  'aprovar',
] as const;

export type Acao = (typeof ACOES)[number];

export const NOMES_ACOES: Record<Acao, string> = {
  visualizar: 'Visualizar',
  criar: 'Criar',
  editar: 'Editar',
  inativar: 'Inativar',
  confirmar: 'Confirmar',
  estornar: 'Estornar',
  exportar: 'Exportar',
  importar: 'Importar',
  reabrir_periodo: 'Reabrir período',
  aprovar: 'Aprovar',
};

export const MODULOS = [
  { codigo: 'GESTAO', nome: 'Gestão', funcao: 'Gestão', situacao: 'disponivel', ordem: 1 },
  { codigo: 'ENOTRACE', nome: 'EnoTrace', funcao: 'Enologia', situacao: 'disponivel', ordem: 2 },
  { codigo: 'VITITRACK', nome: 'VitiTrack', funcao: 'Campo', situacao: 'em_breve', ordem: 3 },
  { codigo: 'ENOTUR', nome: 'EnoTur', funcao: 'Enoturismo', situacao: 'em_breve', ordem: 4 },
  { codigo: 'ENOMESA', nome: 'EnoMesa', funcao: 'Gastronomia', situacao: 'em_breve', ordem: 5 },
] as const;

export type CodigoModulo = (typeof MODULOS)[number]['codigo'];

/** Gestão está em todos os planos (ambiente-cliente.md, Módulos). */
export const MODULO_SEMPRE_PRESENTE: CodigoModulo = 'GESTAO';

/** Áreas da grade inicial dos perfis-modelo (P27). */
export type AreaGrade =
  | 'inicio'
  | 'projetos'
  | 'recepcao'
  | 'operacoes'
  | 'ajuste_inventario'
  | 'laboratorio'
  | 'engarrafamento'
  | 'estoque'
  | 'saidas'
  | 'fechamento'
  | 'reabrir_periodo'
  | 'pessoas'
  | 'documentos'
  | 'autocontrole'
  | 'autocontrole_programa'
  | 'aprovacoes'
  | 'cadastros_cantina'
  | 'relatorios'
  | 'configuracoes'
  | 'faturas';

export interface Funcionalidade {
  codigo: string;
  nome: string;
  /** Vazio nas funcionalidades da plataforma. */
  modulo: CodigoModulo | null;
  escopo: 'empresa' | 'plataforma';
  acoes: readonly Acao[];
  /** Só o Master; não aparece na grade dos demais perfis (P27). */
  somenteMaster?: boolean;
  area?: AreaGrade;
  ordem: number;
}

const CRUD = ['visualizar', 'criar', 'editar', 'inativar', 'exportar'] as const;
const LANCAMENTO = [
  'visualizar',
  'criar',
  'editar',
  'confirmar',
  'estornar',
  'exportar',
  'aprovar',
] as const;

let ordem = 0;
function f(
  codigo: string,
  nome: string,
  modulo: CodigoModulo | null,
  acoes: readonly Acao[],
  extra: Partial<Pick<Funcionalidade, 'somenteMaster' | 'area'>> = {},
): Funcionalidade {
  ordem += 10;
  return {
    codigo,
    nome,
    modulo,
    escopo: modulo ? 'empresa' : 'plataforma',
    acoes,
    ordem,
    ...extra,
  };
}

export const FUNCIONALIDADES: readonly Funcionalidade[] = [
  // Gestão (bloco comum)
  f('gestao.inicio', 'Início', 'GESTAO', ['visualizar'], { area: 'inicio' }),
  f('gestao.pessoas', 'Pessoas', 'GESTAO', [...CRUD, 'importar'], { area: 'pessoas' }),
  f('gestao.documentos', 'Documentos', 'GESTAO', [...CRUD, 'aprovar'], { area: 'documentos' }),
  // Evidências: lançar (criar) e anular (estornar). O programa (os controles) é outra linha da grade.
  f('gestao.autocontrole', 'Autocontrole', 'GESTAO', [...CRUD, 'estornar'], {
    area: 'autocontrole',
  }),
  f(
    'gestao.autocontrole_programa',
    'Programa de autocontrole',
    'GESTAO',
    ['visualizar', 'criar', 'editar', 'inativar'],
    { area: 'autocontrole_programa' },
  ),
  f('gestao.diario', 'Diário', 'GESTAO', ['visualizar', 'criar', 'editar', 'inativar'], {
    area: 'inicio',
  }),
  f('gestao.relatorios', 'Relatórios', 'GESTAO', ['visualizar', 'exportar'], {
    area: 'relatorios',
  }),
  // Ver: os próprios pedidos; aprovar: os pedidos dos outros (P27, Fluxo de aprovação).
  f('gestao.aprovacoes', 'Aprovações', 'GESTAO', ['visualizar', 'aprovar'], {
    area: 'aprovacoes',
  }),
  f('gestao.config.empresa', 'Configurações: empresa', 'GESTAO', ['visualizar', 'editar'], {
    area: 'configuracoes',
  }),
  f('gestao.config.estabelecimentos', 'Configurações: estabelecimentos', 'GESTAO', CRUD, {
    area: 'configuracoes',
  }),
  f('gestao.config.locais', 'Configurações: locais', 'GESTAO', CRUD, { area: 'configuracoes' }),
  f('gestao.config.usuarios', 'Configurações: usuários', 'GESTAO', CRUD, { somenteMaster: true }),
  f('gestao.config.perfis', 'Configurações: perfis e permissões', 'GESTAO', CRUD, {
    somenteMaster: true,
  }),
  f('gestao.config.parametros', 'Configurações: parâmetros', 'GESTAO', ['visualizar', 'editar'], {
    area: 'configuracoes',
  }),
  f(
    'gestao.config.notificacoes',
    'Configurações: notificações',
    'GESTAO',
    ['visualizar', 'editar'],
    {
      area: 'configuracoes',
    },
  ),
  f('gestao.config.integracoes', 'Configurações: integrações', 'GESTAO', ['visualizar', 'editar'], {
    area: 'configuracoes',
  }),
  f('gestao.config.auditoria', 'Configurações: auditoria', 'GESTAO', ['visualizar', 'exportar'], {
    area: 'configuracoes',
  }),
  f('gestao.config.exportar_dados', 'Configurações: exportar dados', 'GESTAO', ['exportar'], {
    somenteMaster: true,
  }),
  f('gestao.assinatura', 'Assinatura e faturas', 'GESTAO', ['visualizar'], { area: 'faturas' }),

  // EnoTrace (cantina)
  f('enotrace.painel', 'Painel da cantina', 'ENOTRACE', ['visualizar'], { area: 'projetos' }),
  f('enotrace.projetos', 'Projetos de vinho', 'ENOTRACE', [...CRUD, 'aprovar'], {
    area: 'projetos',
  }),
  f('enotrace.recepcao', 'Recepção de uva', 'ENOTRACE', [...LANCAMENTO, 'importar'], {
    area: 'recepcao',
  }),
  f('enotrace.operacoes', 'Operações', 'ENOTRACE', LANCAMENTO, { area: 'operacoes' }),
  // Ajuste de inventário da cantina: permissão específica (cantina.md, Operações; P27).
  f('enotrace.ajuste_inventario', 'Ajuste de inventário', 'ENOTRACE', ['confirmar'], {
    area: 'ajuste_inventario',
  }),
  f('enotrace.laboratorio', 'Laboratório', 'ENOTRACE', [...CRUD, 'importar'], {
    area: 'laboratorio',
  }),
  f('enotrace.engarrafamento', 'Engarrafamento', 'ENOTRACE', LANCAMENTO, {
    area: 'engarrafamento',
  }),
  f('enotrace.estoque', 'Estoque', 'ENOTRACE', [...LANCAMENTO, 'inativar', 'importar'], {
    area: 'estoque',
  }),
  f('enotrace.saidas', 'Saídas', 'ENOTRACE', [...LANCAMENTO, 'importar'], { area: 'saidas' }),
  f('enotrace.declaracoes', 'Fechamento e declarações', 'ENOTRACE', LANCAMENTO, {
    area: 'fechamento',
  }),
  f('enotrace.reabrir_periodo', 'Reabrir período', 'ENOTRACE', ['reabrir_periodo', 'aprovar'], {
    area: 'reabrir_periodo',
  }),
  f('enotrace.relatorios', 'Relatórios da cantina', 'ENOTRACE', ['visualizar', 'exportar'], {
    area: 'relatorios',
  }),
  f('enotrace.cadastros', 'Cadastros da cantina', 'ENOTRACE', [...CRUD, 'importar'], {
    area: 'cadastros_cantina',
  }),

  // Plataforma (administracao.md, Mapa de telas)
  f('plataforma.painel', 'Painel', null, ['visualizar']),
  f('plataforma.clientes', 'Clientes', null, CRUD),
  f('plataforma.planos', 'Planos', null, CRUD),
  f('plataforma.faturas', 'Faturas e recebimentos', null, [
    'visualizar',
    'criar',
    'editar',
    'estornar',
    'exportar',
  ]),
  f('plataforma.usuarios', 'Usuários', null, ['visualizar', 'editar', 'exportar']),
  f('plataforma.equipe', 'Equipe da plataforma', null, CRUD),
  f('plataforma.perfis', 'Perfis', null, CRUD),
  f('plataforma.catalogos', 'Catálogos globais', null, [...CRUD, 'importar']),
  f('plataforma.regras', 'Regras regulatórias', null, CRUD),
  f('plataforma.termos', 'Termos e privacidade', null, ['visualizar', 'criar', 'editar']),
  f('plataforma.auditoria', 'Auditoria', null, ['visualizar', 'exportar']),
  f('plataforma.envios', 'Envios', null, ['visualizar', 'editar']),
  f('plataforma.suporte', 'Suporte (chamados)', null, ['visualizar', 'editar', 'exportar']),
  f('plataforma.integracoes', 'Integrações (pagamento e mensagens)', null, [
    'visualizar',
    'criar',
    'editar',
  ]),
  f('plataforma.personificacao', 'Personificação', null, ['criar']),
  f('plataforma.troca_master', 'Troca do Master pelo suporte', null, ['criar']),
  f('plataforma.manutencao', 'Manutenção', null, ['visualizar', 'criar', 'exportar']),
  f('plataforma.configuracoes', 'Configurações da plataforma', null, ['visualizar', 'editar']),
];

export function buscarFuncionalidade(codigo: string): Funcionalidade | undefined {
  return FUNCIONALIDADES.find((x) => x.codigo === codigo);
}

// Grade inicial dos perfis-modelo (P27, Decidido em 03/10/2026).
// Legenda: '-' sem acesso; 'V' ver; 'E' ver e lançar; '*' lançar e também confirmar,
// estornar ou aprovar.
type Nivel = '-' | 'V' | 'E' | '*';

export const PERFIS_MODELO = [
  { codigo: 'MASTER', nome: 'Master', eMaster: true },
  { codigo: 'RT', nome: 'Responsável Técnico', eMaster: false },
  { codigo: 'ENOLOGO', nome: 'Enólogo', eMaster: false },
  { codigo: 'CANTINEIRO', nome: 'Cantineiro', eMaster: false },
  { codigo: 'AGRONOMO', nome: 'Agrônomo', eMaster: false },
  { codigo: 'FINANCEIRO', nome: 'Financeiro / Administrativo', eMaster: false },
] as const;

export type CodigoPerfilModelo = (typeof PERFIS_MODELO)[number]['codigo'];

const GRADE_MODELO: Record<AreaGrade, Record<Exclude<CodigoPerfilModelo, 'MASTER'>, Nivel>> = {
  inicio: { RT: 'E', ENOLOGO: 'E', CANTINEIRO: 'E', AGRONOMO: 'E', FINANCEIRO: 'E' },
  projetos: { RT: 'V', ENOLOGO: '*', CANTINEIRO: 'V', AGRONOMO: 'V', FINANCEIRO: '-' },
  recepcao: { RT: 'V', ENOLOGO: 'E', CANTINEIRO: 'E', AGRONOMO: 'E', FINANCEIRO: 'V' },
  operacoes: { RT: 'V', ENOLOGO: '*', CANTINEIRO: 'E', AGRONOMO: '-', FINANCEIRO: '-' },
  ajuste_inventario: { RT: '*', ENOLOGO: '*', CANTINEIRO: '-', AGRONOMO: '-', FINANCEIRO: '-' },
  laboratorio: { RT: 'V', ENOLOGO: 'E', CANTINEIRO: 'E', AGRONOMO: 'V', FINANCEIRO: '-' },
  engarrafamento: { RT: 'V', ENOLOGO: '*', CANTINEIRO: 'E', AGRONOMO: '-', FINANCEIRO: 'V' },
  estoque: { RT: 'V', ENOLOGO: 'E', CANTINEIRO: 'E', AGRONOMO: '-', FINANCEIRO: 'E' },
  saidas: { RT: 'V', ENOLOGO: 'V', CANTINEIRO: '-', AGRONOMO: '-', FINANCEIRO: 'E' },
  fechamento: { RT: '*', ENOLOGO: 'V', CANTINEIRO: '-', AGRONOMO: '-', FINANCEIRO: 'V' },
  reabrir_periodo: { RT: '*', ENOLOGO: '-', CANTINEIRO: '-', AGRONOMO: '-', FINANCEIRO: '-' },
  pessoas: { RT: 'V', ENOLOGO: 'E', CANTINEIRO: 'V', AGRONOMO: 'E', FINANCEIRO: 'E' },
  documentos: { RT: '*', ENOLOGO: 'V', CANTINEIRO: 'V', AGRONOMO: '-', FINANCEIRO: 'V' },
  autocontrole: { RT: '*', ENOLOGO: 'V', CANTINEIRO: 'E', AGRONOMO: '-', FINANCEIRO: 'V' },
  // Aprovar e o programa de autocontrole: o Master atribui a quem quiser (04/10/2026, ponto 21).
  aprovacoes: { RT: 'V', ENOLOGO: 'V', CANTINEIRO: 'V', AGRONOMO: 'V', FINANCEIRO: 'V' },
  autocontrole_programa: {
    RT: '-',
    ENOLOGO: '-',
    CANTINEIRO: '-',
    AGRONOMO: '-',
    FINANCEIRO: '-',
  },
  cadastros_cantina: { RT: 'V', ENOLOGO: 'E', CANTINEIRO: 'V', AGRONOMO: 'V', FINANCEIRO: 'V' },
  relatorios: { RT: 'E', ENOLOGO: 'E', CANTINEIRO: 'V', AGRONOMO: 'V', FINANCEIRO: 'E' },
  configuracoes: { RT: '-', ENOLOGO: '-', CANTINEIRO: '-', AGRONOMO: '-', FINANCEIRO: '-' },
  faturas: { RT: '-', ENOLOGO: '-', CANTINEIRO: '-', AGRONOMO: '-', FINANCEIRO: 'V' },
};

const ACOES_POR_NIVEL: Record<Nivel, readonly Acao[]> = {
  '-': [],
  V: ['visualizar'],
  // "Lançar" grava o registro (inclusive confirmar); estorno, aprovação e reabertura ficam
  // no nível '*' (P27: o cantineiro lança operações, mas não estorna).
  E: ['visualizar', 'criar', 'editar', 'inativar', 'confirmar', 'importar', 'exportar'],
  '*': [
    'visualizar',
    'criar',
    'editar',
    'inativar',
    'confirmar',
    'importar',
    'exportar',
    'estornar',
    'aprovar',
    'reabrir_periodo',
  ],
};

/**
 * Grade inicial de um perfil-modelo: pares (funcionalidade, ação). O Master não tem grade, porque
 * tem tudo (P27). Exportar só vale para quem tem pelo menos "E" em "Relatórios e exportação".
 */
export function gradeDoModelo(
  perfil: Exclude<CodigoPerfilModelo, 'MASTER'>,
): Array<{ funcionalidade: string; acao: Acao }> {
  const exporta =
    GRADE_MODELO.relatorios[perfil] !== 'V' && GRADE_MODELO.relatorios[perfil] !== '-';
  const grade: Array<{ funcionalidade: string; acao: Acao }> = [];
  for (const func of FUNCIONALIDADES) {
    if (func.escopo !== 'empresa' || func.somenteMaster || !func.area) continue;
    const nivel = GRADE_MODELO[func.area][perfil];
    for (const acao of ACOES_POR_NIVEL[nivel]) {
      if (!func.acoes.includes(acao)) continue;
      if (acao === 'exportar' && !exporta && func.area !== 'relatorios') continue;
      grade.push({ funcionalidade: func.codigo, acao });
    }
  }
  return grade;
}
