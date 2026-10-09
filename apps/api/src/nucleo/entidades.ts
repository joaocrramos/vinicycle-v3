// Entidades que aceitam anexos (P15) e têm aba Histórico (P14), com a funcionalidade que
// decide quem vê e quem altera cada uma (P27).
import { and, eq } from 'drizzle-orm';
import type { Tx } from '../db/cliente';
import * as s from '../db/schema';
import { ErroConflito, ErroNaoEncontrado, ErroRegra } from './erros';

interface Entidade {
  funcionalidade: string;
  /** Estabelecimento do registro, para o caminho do anexo; vazio = da empresa. */
  localizar(
    tx: Tx,
    empresaId: string,
    id: string,
  ): Promise<{ estabelecimentoId: string | null } | null>;
}

/** Registro da produção, do estabelecimento (P12). */
function daProducao(
  funcionalidade: string,
  tabela:
    | typeof s.projeto
    | typeof s.lote
    | typeof s.romaneio
    | typeof s.operacao
    | typeof s.analise
    | typeof s.amostra,
): Entidade {
  return {
    funcionalidade,
    async localizar(tx, empresaId, id) {
      const [r] = await tx
        .select({ estabelecimentoId: tabela.estabelecimentoId })
        .from(tabela)
        .where(and(eq(tabela.id, id), eq(tabela.empresaId, empresaId)));
      return r ?? null;
    },
  };
}

export const ENTIDADES: Record<string, Entidade> = {
  // Comprovante de pagamento da fatura: anexado pela Administração, visto pelo cliente.
  recebimento: {
    funcionalidade: 'gestao.assinatura',
    async localizar(tx, empresaId, id) {
      const [r] = await tx
        .select({ id: s.recebimento.id })
        .from(s.recebimento)
        .where(and(eq(s.recebimento.id, id), eq(s.recebimento.empresaId, empresaId)));
      return r ? { estabelecimentoId: null } : null;
    },
  },
  projeto: daProducao('enotrace.projetos', s.projeto),
  lote: daProducao('enotrace.projetos', s.lote),
  romaneio: daProducao('enotrace.recepcao', s.romaneio),
  operacao: daProducao('enotrace.operacoes', s.operacao),
  analise: daProducao('enotrace.laboratorio', s.analise),
  amostra: daProducao('enotrace.laboratorio', s.amostra),
  nfe: {
    funcionalidade: 'enotrace.recepcao',
    async localizar(tx, empresaId, id) {
      const [r] = await tx
        .select({ estabelecimentoId: s.nfe.estabelecimentoId })
        .from(s.nfe)
        .where(and(eq(s.nfe.id, id), eq(s.nfe.empresaId, empresaId)));
      return r ?? null;
    },
  },
  importacao: {
    funcionalidade: 'enotrace.estoque',
    async localizar(tx, empresaId, id) {
      const [r] = await tx
        .select({ estabelecimentoId: s.importacao.estabelecimentoId })
        .from(s.importacao)
        .where(and(eq(s.importacao.id, id), eq(s.importacao.empresaId, empresaId)));
      return r ?? null;
    },
  },
  autocontrole_evidencia: {
    funcionalidade: 'gestao.autocontrole',
    async localizar(tx, empresaId, id) {
      const [r] = await tx
        .select({ estabelecimentoId: s.autocontroleControle.estabelecimentoId })
        .from(s.autocontroleEvidencia)
        .innerJoin(
          s.autocontroleControle,
          eq(s.autocontroleControle.id, s.autocontroleEvidencia.controleId),
        )
        .where(
          and(eq(s.autocontroleEvidencia.id, id), eq(s.autocontroleEvidencia.empresaId, empresaId)),
        );
      return r ?? null;
    },
  },
  diario_nota: {
    funcionalidade: 'gestao.diario',
    async localizar(tx, empresaId, id) {
      const [r] = await tx
        .select({ estabelecimentoId: s.diarioNota.estabelecimentoId })
        .from(s.diarioNota)
        .where(and(eq(s.diarioNota.id, id), eq(s.diarioNota.empresaId, empresaId)));
      return r ?? null;
    },
  },
  declaracao: {
    funcionalidade: 'enotrace.declaracoes',
    async localizar(tx, empresaId, id) {
      const [r] = await tx
        .select({ estabelecimentoId: s.declaracao.estabelecimentoId })
        .from(s.declaracao)
        .where(and(eq(s.declaracao.id, id), eq(s.declaracao.empresaId, empresaId)));
      return r ?? null;
    },
  },
  empresa: {
    funcionalidade: 'gestao.config.empresa',
    async localizar(_tx, empresaId, id) {
      return id === empresaId ? { estabelecimentoId: null } : null;
    },
  },
  estabelecimento: {
    funcionalidade: 'gestao.config.estabelecimentos',
    async localizar(tx, empresaId, id) {
      const [r] = await tx
        .select({ id: s.estabelecimento.id })
        .from(s.estabelecimento)
        .where(and(eq(s.estabelecimento.id, id), eq(s.estabelecimento.empresaId, empresaId)));
      return r ? { estabelecimentoId: r.id } : null;
    },
  },
  local: {
    funcionalidade: 'gestao.config.locais',
    async localizar(tx, empresaId, id) {
      const [r] = await tx
        .select({ estabelecimentoId: s.local.estabelecimentoId })
        .from(s.local)
        .where(and(eq(s.local.id, id), eq(s.local.empresaId, empresaId)));
      return r ?? null;
    },
  },
  perfil: {
    funcionalidade: 'gestao.config.perfis',
    async localizar(tx, empresaId, id) {
      const [r] = await tx
        .select({ id: s.perfil.id })
        .from(s.perfil)
        .where(and(eq(s.perfil.id, id), eq(s.perfil.empresaId, empresaId)));
      return r ? { estabelecimentoId: null } : null;
    },
  },
  vinculo: {
    funcionalidade: 'gestao.config.usuarios',
    async localizar(tx, empresaId, id) {
      const [r] = await tx
        .select({ id: s.vinculo.id })
        .from(s.vinculo)
        .where(and(eq(s.vinculo.id, id), eq(s.vinculo.empresaId, empresaId)));
      return r ? { estabelecimentoId: null } : null;
    },
  },
  pessoa: {
    funcionalidade: 'gestao.pessoas',
    async localizar(tx, empresaId, id) {
      const [r] = await tx
        .select({ id: s.pessoa.id })
        .from(s.pessoa)
        .where(and(eq(s.pessoa.id, id), eq(s.pessoa.empresaId, empresaId)));
      return r ? { estabelecimentoId: null } : null;
    },
  },
  documento: {
    funcionalidade: 'gestao.documentos',
    async localizar(tx, empresaId, id) {
      const [r] = await tx
        .select({ estabelecimentoId: s.documento.estabelecimentoId })
        .from(s.documento)
        .where(and(eq(s.documento.id, id), eq(s.documento.empresaId, empresaId)));
      return r ?? null;
    },
  },
  /** Cada emissão ou renovação tem o seu arquivo (gestao.md, Documentos). */
  documento_versao: {
    funcionalidade: 'gestao.documentos',
    async localizar(tx, empresaId, id) {
      const [r] = await tx
        .select({ estabelecimentoId: s.documento.estabelecimentoId })
        .from(s.documentoVersao)
        .innerJoin(s.documento, eq(s.documento.id, s.documentoVersao.documentoId))
        .where(and(eq(s.documentoVersao.id, id), eq(s.documentoVersao.empresaId, empresaId)));
      return r ?? null;
    },
  },
  recipiente: {
    funcionalidade: 'enotrace.cadastros',
    async localizar(tx, empresaId, id) {
      const [r] = await tx
        .select({ estabelecimentoId: s.recipiente.estabelecimentoId })
        .from(s.recipiente)
        .where(and(eq(s.recipiente.id, id), eq(s.recipiente.empresaId, empresaId)));
      return r ?? null;
    },
  },
  item_estoque: {
    funcionalidade: 'enotrace.cadastros',
    async localizar(tx, empresaId, id) {
      const [r] = await tx
        .select({ id: s.itemEstoque.id })
        .from(s.itemEstoque)
        .where(and(eq(s.itemEstoque.id, id), eq(s.itemEstoque.empresaId, empresaId)));
      return r ? { estabelecimentoId: null } : null;
    },
  },
  produto: {
    funcionalidade: 'enotrace.cadastros',
    async localizar(tx, empresaId, id) {
      const [r] = await tx
        .select({ id: s.produto.id })
        .from(s.produto)
        .where(and(eq(s.produto.id, id), eq(s.produto.empresaId, empresaId)));
      return r ? { estabelecimentoId: null } : null;
    },
  },
  remessa_terceiro: {
    funcionalidade: 'enotrace.operacoes',
    async localizar(tx, empresaId, id) {
      const [r] = await tx
        .select({ estabelecimentoId: s.remessaTerceiro.estabelecimentoId })
        .from(s.remessaTerceiro)
        .where(and(eq(s.remessaTerceiro.id, id), eq(s.remessaTerceiro.empresaId, empresaId)));
      return r ?? null;
    },
  },
  retorno_terceiro: {
    funcionalidade: 'enotrace.operacoes',
    async localizar(tx, empresaId, id) {
      const [r] = await tx
        .select({ estabelecimentoId: s.retornoTerceiro.estabelecimentoId })
        .from(s.retornoTerceiro)
        .where(and(eq(s.retornoTerceiro.id, id), eq(s.retornoTerceiro.empresaId, empresaId)));
      return r ?? null;
    },
  },
  contrato_terceirizacao: {
    funcionalidade: 'enotrace.cadastros',
    async localizar(tx, empresaId, id) {
      const [r] = await tx
        .select({ id: s.contratoTerceirizacao.id })
        .from(s.contratoTerceirizacao)
        .where(
          and(eq(s.contratoTerceirizacao.id, id), eq(s.contratoTerceirizacao.empresaId, empresaId)),
        );
      return r ? { estabelecimentoId: null } : null;
    },
  },
  marca: {
    funcionalidade: 'enotrace.cadastros',
    async localizar(tx, empresaId, id) {
      const [r] = await tx
        .select({ id: s.marca.id })
        .from(s.marca)
        .where(and(eq(s.marca.id, id), eq(s.marca.empresaId, empresaId)));
      return r ? { estabelecimentoId: null } : null;
    },
  },
  convite: {
    funcionalidade: 'gestao.config.usuarios',
    async localizar(tx, empresaId, id) {
      const [r] = await tx
        .select({ id: s.convite.id })
        .from(s.convite)
        .where(and(eq(s.convite.id, id), eq(s.convite.empresaId, empresaId)));
      return r ? { estabelecimentoId: null } : null;
    },
  },
};

export function entidade(nome: string): Entidade {
  const e = ENTIDADES[nome];
  if (!e) throw new ErroRegra(`Entidade desconhecida: ${nome}.`, 'entidade');
  return e;
}

export async function localizarRegistro(tx: Tx, empresaId: string, nome: string, id: string) {
  const r = await entidade(nome).localizar(tx, empresaId, id);
  if (!r) throw new ErroNaoEncontrado();
  return r;
}

/** Controle de edição simultânea (03-modelo-de-dados.md, 1.4). */
export function conferirVersao(atual: number, enviada: number | undefined): void {
  if (enviada !== undefined && enviada !== atual) {
    throw new ErroConflito();
  }
}
