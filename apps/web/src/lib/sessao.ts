// Estado da sessão (usuário, empresa, estabelecimento, módulos e permissões).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Acao } from '@vinicycle/shared'
import { api, ErroApi } from './api'

export interface EstadoSessao {
  usuario: {
    id: string
    email: string
    nome: string
    avatarCor: string | null
    preferencias: Preferencias
  }
  empresas: Array<{ id: string; nome: string; perfil: string; eMaster: boolean }>
  contexto: 'empresa' | 'plataforma'
  personificacao?: null | { usuario: string; empresa: string; expiraEm: string; membro: string }
  empresa: null | {
    id: string
    nome: string
    situacao: string
    corMarca: string | null
    perfil: string
    eMaster: boolean
    modulos: string[]
    permissoes: string[]
    estabelecimentos: Array<{ id: string; nome: string; fuso: string }>
    estabelecimentoId: string | null
    precisaEstabelecimento: boolean
    emTeste: boolean
    fimTeste: string | null
    cobranca: null | {
      numero: number
      vencimento: string
      somenteLeituraEm: string
      bloqueioEm: string
    }
  }
  equipe: null | {
    perfil: string
    segundoFatorConfigurado: boolean
    segundoFatorValido: boolean
    permissoes: string[]
  }
}

export interface Preferencias {
  tema?: 'claro' | 'escuro' | 'sistema'
  paleta?: string
  menuRecolhido?: boolean
  ultimaEmpresaId?: string
  canais?: { whatsapp: boolean; sms: boolean }
}

export const CHAVE_SESSAO = ['sessao']

export function useSessao() {
  return useQuery({
    queryKey: CHAVE_SESSAO,
    queryFn: async () => {
      try {
        return await api.get<EstadoSessao>('/api/auth/sessao')
      } catch (e) {
        if (e instanceof ErroApi && e.status === 401) return null
        throw e
      }
    },
    staleTime: 30_000,
  })
}

export function useAtualizarSessao() {
  const qc = useQueryClient()
  return (s: EstadoSessao | null) => {
    qc.setQueryData(CHAVE_SESSAO, s)
    // Troca de empresa ou estabelecimento: tudo o que foi lido antes deixa de valer.
    void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'sessao' })
  }
}

/** A interface só esconde o que não pode; quem decide é o servidor (P27). */
export function pode(
  sessao: EstadoSessao | null | undefined,
  funcionalidade: string,
  acao: Acao,
): boolean {
  const lista =
    sessao?.contexto === 'plataforma' ? sessao.equipe?.permissoes : sessao?.empresa?.permissoes
  return !!lista?.includes(`${funcionalidade}:${acao}`)
}

export function fusoAtivo(sessao: EstadoSessao | null | undefined): string {
  const e = sessao?.empresa
  return e?.estabelecimentos.find((x) => x.id === e.estabelecimentoId)?.fuso ?? 'America/Sao_Paulo'
}
