// Permissões (P25, P27), conferidas no servidor em toda requisição.
import {
  type Acao,
  buscarFuncionalidade,
  FUNCIONALIDADES,
  MODULO_SEMPRE_PRESENTE,
  NOMES_ACOES,
  type SituacaoEmpresa,
} from '@vinicycle/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/cliente';
import * as s from '../db/schema';
import { ErroPermissao } from './erros';

/** Acesso do usuário na empresa ativa. */
export interface AcessoEmpresa {
  tipo: 'empresa';
  empresaId: string;
  vinculoId: string;
  perfilId: string;
  perfilNome: string;
  eMaster: boolean;
  situacaoEmpresa: SituacaoEmpresa;
  /** Módulos do plano vigente, mais a Gestão. */
  modulos: Set<string>;
  /** "funcionalidade:acao". Vazio para o Master, que tem tudo. */
  permissoes: Set<string>;
  /** Vazio = todos os estabelecimentos ativos (P12). */
  estabelecimentosRestritos: string[];
}

/** Acesso de um membro da equipe na Administração. */
export interface AcessoPlataforma {
  tipo: 'plataforma';
  membroId: string;
  perfilId: string;
  perfilNome: string;
  permissoes: Set<string>;
}

export type Acesso = AcessoEmpresa | AcessoPlataforma;

export async function carregarAcessoEmpresa(
  tx: Tx,
  usuarioId: string,
  empresaId: string,
): Promise<AcessoEmpresa | null> {
  const [v] = await tx
    .select({
      vinculoId: s.vinculo.id,
      perfilId: s.vinculo.perfilId,
      eMaster: s.vinculo.eMaster,
      perfilNome: s.perfil.nome,
      perfilAtivo: s.perfil.ativo,
      situacao: s.empresa.situacao,
    })
    .from(s.vinculo)
    .innerJoin(s.perfil, eq(s.perfil.id, s.vinculo.perfilId))
    .innerJoin(s.empresa, eq(s.empresa.id, s.vinculo.empresaId))
    .where(
      and(
        eq(s.vinculo.usuarioId, usuarioId),
        eq(s.vinculo.empresaId, empresaId),
        eq(s.vinculo.ativo, true),
      ),
    );
  if (!v) return null;

  const modulos = new Set<string>([MODULO_SEMPRE_PRESENTE]);
  const linhasModulo = await tx
    .select({ codigo: s.modulo.codigo })
    .from(s.assinatura)
    .innerJoin(s.planoModulo, eq(s.planoModulo.planoId, s.assinatura.planoId))
    .innerJoin(s.modulo, eq(s.modulo.id, s.planoModulo.moduloId))
    .where(and(eq(s.assinatura.empresaId, empresaId), eq(s.assinatura.situacao, 'vigente')));
  for (const m of linhasModulo) modulos.add(m.codigo);
  // Módulo avulso contratado como adicional (P25), em vigor hoje (mesma data das faturas).
  const hoje = new Date().toISOString().slice(0, 10);
  const avulsos = await tx
    .select({ codigo: s.modulo.codigo })
    .from(s.assinaturaItem)
    .innerJoin(s.assinatura, eq(s.assinatura.id, s.assinaturaItem.assinaturaId))
    .innerJoin(s.adicional, eq(s.adicional.id, s.assinaturaItem.adicionalId))
    .innerJoin(s.modulo, eq(s.modulo.id, s.adicional.moduloId))
    .where(
      and(
        eq(s.assinatura.empresaId, empresaId),
        eq(s.assinatura.situacao, 'vigente'),
        sql`${s.assinaturaItem.inicio} <= ${hoje}`,
        sql`(${s.assinaturaItem.fim} is null or ${s.assinaturaItem.fim} >= ${hoje})`,
      ),
    );
  for (const m of avulsos) modulos.add(m.codigo);

  const permissoes = new Set<string>();
  if (!v.eMaster && v.perfilAtivo) {
    const linhas = await tx
      .select({ codigo: s.funcionalidade.codigo, acao: s.perfilPermissao.acao })
      .from(s.perfilPermissao)
      .innerJoin(s.funcionalidade, eq(s.funcionalidade.id, s.perfilPermissao.funcionalidadeId))
      .where(eq(s.perfilPermissao.perfilId, v.perfilId));
    for (const l of linhas) permissoes.add(`${l.codigo}:${l.acao}`);
  }

  const restritos = await tx
    .select({ id: s.vinculoEstabelecimento.estabelecimentoId })
    .from(s.vinculoEstabelecimento)
    .where(eq(s.vinculoEstabelecimento.vinculoId, v.vinculoId));

  return {
    tipo: 'empresa',
    empresaId,
    vinculoId: v.vinculoId,
    perfilId: v.perfilId,
    perfilNome: v.perfilNome,
    eMaster: v.eMaster,
    situacaoEmpresa: v.situacao,
    modulos,
    permissoes,
    estabelecimentosRestritos: restritos.map((r) => r.id),
  };
}

export async function carregarAcessoPlataforma(
  tx: Tx,
  usuarioId: string,
): Promise<AcessoPlataforma | null> {
  const [m] = await tx
    .select({
      membroId: s.equipeMembro.id,
      perfilId: s.equipeMembro.perfilId,
      perfilNome: s.perfil.nome,
    })
    .from(s.equipeMembro)
    .innerJoin(s.perfil, eq(s.perfil.id, s.equipeMembro.perfilId))
    .where(
      and(
        eq(s.equipeMembro.usuarioId, usuarioId),
        eq(s.equipeMembro.ativo, true),
        eq(s.perfil.ativo, true),
      ),
    );
  if (!m) return null;
  const linhas = await tx
    .select({ codigo: s.funcionalidade.codigo, acao: s.perfilPermissao.acao })
    .from(s.perfilPermissao)
    .innerJoin(s.funcionalidade, eq(s.funcionalidade.id, s.perfilPermissao.funcionalidadeId))
    .where(eq(s.perfilPermissao.perfilId, m.perfilId));
  return {
    tipo: 'plataforma',
    ...m,
    permissoes: new Set(linhas.map((l) => `${l.codigo}:${l.acao}`)),
  };
}

const ACOES_LEITURA: readonly Acao[] = ['visualizar', 'exportar'];

/** O que o Master acessa com a empresa bloqueada (administracao.md, Inadimplência e bloqueio). */
const LIBERADAS_NO_BLOQUEIO = ['gestao.assinatura', 'gestao.config.exportar_dados'];

/**
 * Decide se a ação é permitida. Combina a grade do perfil, os módulos do plano (P25) e a
 * situação da empresa (administracao.md, Inadimplência e bloqueio).
 */
export function motivoNegado(acesso: Acesso, funcionalidade: string, acao: Acao): string | null {
  const f = buscarFuncionalidade(funcionalidade);
  if (!f || !f.acoes.includes(acao)) return 'ação inexistente';
  if (acesso.tipo === 'plataforma') {
    if (f.escopo !== 'plataforma') return 'funcionalidade de empresa';
    return acesso.permissoes.has(`${funcionalidade}:${acao}`) ? null : 'perfil';
  }
  if (f.escopo !== 'empresa') return 'funcionalidade da plataforma';
  if (f.modulo && !acesso.modulos.has(f.modulo)) return 'módulo não contratado';
  if (acesso.situacaoEmpresa === 'inativo') return 'empresa inativa';
  if (acesso.situacaoEmpresa === 'bloqueado' && !acesso.eMaster) return 'empresa bloqueada';
  // Bloqueada, o Master só vê a assinatura (o que está em aberto) e exporta os dados.
  if (acesso.situacaoEmpresa === 'bloqueado' && !LIBERADAS_NO_BLOQUEIO.includes(funcionalidade)) {
    return 'empresa bloqueada';
  }
  const escrita = !ACOES_LEITURA.includes(acao);
  if (escrita && ['somente_leitura', 'bloqueado'].includes(acesso.situacaoEmpresa)) {
    return 'empresa em somente leitura';
  }
  if (acesso.eMaster) return null;
  if (f.somenteMaster) return 'só o Master';
  return acesso.permissoes.has(`${funcionalidade}:${acao}`) ? null : 'perfil';
}

export function pode(acesso: Acesso | null, funcionalidade: string, acao: Acao): boolean {
  return !!acesso && motivoNegado(acesso, funcionalidade, acao) === null;
}

export function exigir(acesso: Acesso | null, funcionalidade: string, acao: Acao): void {
  if (acesso && motivoNegado(acesso, funcionalidade, acao) === null) return;
  const nome = buscarFuncionalidade(funcionalidade)?.nome ?? funcionalidade;
  throw new ErroPermissao(
    funcionalidade,
    acao,
    `Sem permissão para ${NOMES_ACOES[acao].toLowerCase()} em ${nome}.`,
  );
}

/** Lista "funcionalidade:acao" efetiva, para a interface esconder o que não pode (P27). */
export function permissoesEfetivas(acesso: Acesso): string[] {
  const r: string[] = [];
  for (const f of FUNCIONALIDADES) {
    for (const a of f.acoes)
      if (motivoNegado(acesso, f.codigo, a) === null) r.push(`${f.codigo}:${a}`);
  }
  return r;
}
