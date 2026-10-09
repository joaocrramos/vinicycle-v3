// Estado da sessão que a interface usa para montar a tela: usuário, empresas, empresa e
// estabelecimento ativos, módulos e permissões efetivas (P8, P12, P25, P27).
import { and, asc, eq, inArray } from 'drizzle-orm';
import { definirContexto, emContexto, type Db, type Tx } from '../db/cliente';
import * as s from '../db/schema';
import {
  carregarAcessoEmpresa,
  carregarAcessoPlataforma,
  permissoesEfetivas,
} from '../nucleo/permissoes';
import { SEGUNDO_FATOR_VALIDADE_MS, type SessaoAtiva } from '../nucleo/sessoes';
import { hoje } from './planos';
import { faturaMaisAtrasada, prazosDaRegua } from './regua';

export interface EstadoSessao {
  usuario: {
    id: string;
    email: string;
    nome: string;
    avatarCor: string | null;
    preferencias: unknown;
  };
  empresas: Array<{ id: string; nome: string; perfil: string; eMaster: boolean }>;
  contexto: 'empresa' | 'plataforma';
  empresa: null | {
    id: string;
    nome: string;
    situacao: string;
    corMarca: string | null;
    perfil: string;
    eMaster: boolean;
    modulos: string[];
    permissoes: string[];
    estabelecimentos: Array<{ id: string; nome: string; fuso: string }>;
    estabelecimentoId: string | null;
    /** Sem estabelecimento, a criação dele é obrigatória (administracao.md, Fluxo, passo 4). */
    precisaEstabelecimento: boolean;
    emTeste: boolean;
    fimTeste: string | null;
    /** Fatura vencida mais antiga e os prazos da régua (faixa de aviso). */
    cobranca: null | {
      numero: number;
      vencimento: string;
      somenteLeituraEm: string;
      bloqueioEm: string;
    };
  };
  /** Personificação em curso (P28): a faixa fixa da tela. */
  personificacao: null | { usuario: string; empresa: string; expiraEm: Date; membro: string };
  equipe: null | {
    perfil: string;
    segundoFatorConfigurado: boolean;
    segundoFatorValido: boolean;
    permissoes: string[];
  };
}

/** Estabelecimentos ativos que o vínculo permite (P12), em ordem de nome. */
export async function estabelecimentosDoVinculo(
  tx: Tx,
  empresaId: string,
  restritos: string[],
): Promise<Array<{ id: string; nome: string; fuso: string }>> {
  return tx
    .select({ id: s.estabelecimento.id, nome: s.ficha.nome, fuso: s.estabelecimento.fuso })
    .from(s.estabelecimento)
    .innerJoin(s.ficha, eq(s.ficha.id, s.estabelecimento.fichaId))
    .where(
      and(
        eq(s.estabelecimento.empresaId, empresaId),
        eq(s.estabelecimento.ativo, true),
        restritos.length ? inArray(s.estabelecimento.id, restritos) : undefined,
      ),
    )
    .orderBy(asc(s.ficha.nome));
}

export async function estadoSessao(db: Db, sessao: SessaoAtiva): Promise<EstadoSessao> {
  return emContexto(db, { usuarioId: sessao.usuarioId }, async (tx) => {
    const [u] = await tx
      .select({
        id: s.usuario.id,
        email: s.usuario.email,
        preferencias: s.usuario.preferencias,
        totpAtivoEm: s.usuario.totpAtivoEm,
        nome: s.ficha.nome,
        avatarCor: s.ficha.avatarCor,
      })
      .from(s.usuario)
      .innerJoin(s.ficha, eq(s.ficha.id, s.usuario.fichaId))
      .where(eq(s.usuario.id, sessao.usuarioId));

    const empresas = await tx
      .select({
        id: s.empresa.id,
        nome: s.ficha.nome,
        nomeFantasia: s.ficha.nomeFantasia,
        perfil: s.perfil.nome,
        eMaster: s.vinculo.eMaster,
      })
      .from(s.vinculo)
      .innerJoin(s.empresa, eq(s.empresa.id, s.vinculo.empresaId))
      .innerJoin(s.ficha, eq(s.ficha.id, s.empresa.fichaId))
      .innerJoin(s.perfil, eq(s.perfil.id, s.vinculo.perfilId))
      .where(and(eq(s.vinculo.usuarioId, sessao.usuarioId), eq(s.vinculo.ativo, true)))
      .orderBy(asc(s.ficha.nome));

    let empresa: EstadoSessao['empresa'] = null;
    if (sessao.empresaId) {
      await definirContexto(tx, { usuarioId: sessao.usuarioId, empresaId: sessao.empresaId });
      const acesso = await carregarAcessoEmpresa(tx, sessao.usuarioId, sessao.empresaId);
      if (acesso) {
        const [e] = await tx
          .select({
            nome: s.ficha.nome,
            nomeFantasia: s.ficha.nomeFantasia,
            situacao: s.empresa.situacao,
            corMarca: s.empresa.corMarca,
          })
          .from(s.empresa)
          .innerJoin(s.ficha, eq(s.ficha.id, s.empresa.fichaId))
          .where(eq(s.empresa.id, sessao.empresaId));
        const [assinatura] = await tx
          .select({ emTeste: s.assinatura.emTeste, fimTeste: s.assinatura.fimTeste })
          .from(s.assinatura)
          .where(
            and(eq(s.assinatura.empresaId, sessao.empresaId), eq(s.assinatura.situacao, 'vigente')),
          );
        const estabelecimentos = await estabelecimentosDoVinculo(
          tx,
          sessao.empresaId,
          acesso.estabelecimentosRestritos,
        );
        const [algum] = await tx
          .select({ id: s.estabelecimento.id })
          .from(s.estabelecimento)
          .where(eq(s.estabelecimento.empresaId, sessao.empresaId))
          .limit(1);
        const atrasada = await faturaMaisAtrasada(tx, sessao.empresaId, hoje());
        const [cfg] = await tx.select().from(s.configPlataforma);
        empresa = {
          id: sessao.empresaId,
          nome: e!.nomeFantasia || e!.nome,
          situacao: e!.situacao,
          corMarca: e!.corMarca,
          perfil: acesso.perfilNome,
          eMaster: acesso.eMaster,
          modulos: [...acesso.modulos],
          permissoes: permissoesEfetivas(acesso),
          estabelecimentos,
          estabelecimentoId: estabelecimentos.some((x) => x.id === sessao.estabelecimentoId)
            ? sessao.estabelecimentoId
            : null,
          precisaEstabelecimento: !algum,
          emTeste: assinatura?.emTeste ?? false,
          fimTeste: assinatura?.fimTeste ?? null,
          cobranca: atrasada
            ? {
                numero: atrasada.numero,
                vencimento: atrasada.vencimento,
                ...prazosDaRegua(atrasada.vencimento, {
                  toleranciaDias: cfg?.toleranciaDias ?? 5,
                  somenteLeituraDias: cfg?.somenteLeituraDias ?? 15,
                  avisosTesteDias: [],
                  avisosVencimentoDias: [],
                }),
              }
            : null,
        };
      }
    }

    const plat = await carregarAcessoPlataforma(tx, sessao.usuarioId);
    const fator = sessao.segundoFatorEm?.getTime() ?? 0;

    return {
      usuario: {
        id: u!.id,
        email: u!.email,
        nome: u!.nome,
        avatarCor: u!.avatarCor,
        preferencias: u!.preferencias,
      },
      empresas: empresas.map((x) => ({
        id: x.id,
        nome: x.nomeFantasia || x.nome,
        perfil: x.perfil,
        eMaster: x.eMaster,
      })),
      contexto: sessao.contexto,
      empresa,
      personificacao: sessao.real
        ? {
            usuario: u!.nome,
            empresa: empresa?.nome ?? '',
            expiraEm: sessao.real.expiraEm,
            membro: sessao.real.email,
          }
        : null,
      // Na personificação, nada da Administração: a visão é só a do usuário (P28).
      equipe:
        plat && !sessao.real
          ? {
              perfil: plat.perfilNome,
              segundoFatorConfigurado: !!u!.totpAtivoEm,
              segundoFatorValido: Date.now() - fator <= SEGUNDO_FATOR_VALIDADE_MS,
              permissoes: permissoesEfetivas(plat),
            }
          : null,
    };
  });
}
