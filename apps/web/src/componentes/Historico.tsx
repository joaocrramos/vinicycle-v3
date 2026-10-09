// Aba Histórico de cada registro: consulta à auditoria filtrada (P14).
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatarDataHora } from '@/lib/utils'

export interface RegistroAuditoria {
  id: string
  ocorridoEm: string
  usuario: string | null
  acao: string
  entidade: string | null
  diferenca: Record<string, [unknown, unknown]> | null
  dados: Record<string, unknown> | null
  motivo: string | null
}

export const NOMES_ACAO: Record<string, string> = {
  criar: 'Criou',
  editar: 'Alterou',
  inativar: 'Inativou',
  reativar: 'Reativou',
  anexar: 'Anexou arquivo',
  remover_anexo: 'Removeu anexo',
  editar_grade: 'Alterou a grade',
  cancelar: 'Cancelou',
  reenviar: 'Reenviou',
  aceitar: 'Aceitou',
  login: 'Entrou',
  logout: 'Saiu',
  login_falha: 'Errou a senha',
  login_bloqueado: 'Tentou entrar com a conta bloqueada',
  acesso_negado: 'Acesso negado',
  troca_contexto: 'Trocou de empresa ou estabelecimento',
  situacao: 'Mudou a situação',
  exportar: 'Exportou',
  senha_trocada: 'Trocou a senha',
  senha_redefinida: 'Redefiniu a senha',
  senha_esqueci: 'Pediu para redefinir a senha',
  senha_codigo: 'Pediu código para trocar a senha',
  segundo_fator_falha: 'Errou o código do segundo fator',
  encerrar_sessao: 'Encerrou uma sessão',
  email_pedido: 'Pediu a troca de e-mail',
  email_trocado: 'Trocou o e-mail',
  renovar: 'Renovou',
  corrigir_versao: 'Corrigiu a versão',
  excluir: 'Excluiu',
  incluir_rotulo: 'Incluiu rótulo',
  editar_rotulo: 'Alterou rótulo',
  incluir_formato: 'Incluiu formato',
  inativar_formato: 'Inativou formato',
  reativar_formato: 'Reativou formato',
  editar_ficha_embalagem: 'Alterou a ficha de embalagem',
  bastao_pedido: 'Pediu a passagem de bastão',
  bastao_aceito: 'Aceitou ser o Master',
  bastao_recusado: 'Recusou ser o Master',
  bastao_cancelado: 'Cancelou a passagem de bastão',
  conceder_equipe: 'Incluiu na equipe da plataforma',
}

function valor(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'sim' : 'não'
  if (Array.isArray(v))
    return v.length
      ? v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ')
      : '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function Diferencas({ r }: { r: RegistroAuditoria }) {
  return (
    <>
      {r.motivo && <p className="text-sm">Motivo: {r.motivo}</p>}
      {r.diferenca && (
        <dl className="mt-1 grid gap-x-3 gap-y-0.5 text-xs sm:grid-cols-[max-content_1fr]">
          {Object.entries(r.diferenca).map(([campo, [antes, depois]]) => (
            <div key={campo} className="contents">
              <dt className="text-muted-foreground">{campo}</dt>
              <dd className="break-all">
                <span className="line-through opacity-60">{valor(antes)}</span> → {valor(depois)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {r.dados && !r.diferenca && (
        <p className="text-xs break-all text-muted-foreground">{valor(r.dados)}</p>
      )}
    </>
  )
}

export function Historico({
  entidade,
  registroId,
  fuso,
}: {
  entidade: string
  registroId: string
  fuso?: string
}) {
  const q = useQuery({
    queryKey: ['historico', entidade, registroId],
    queryFn: () => api.get<RegistroAuditoria[]>(`/api/historico/${entidade}/${registroId}`),
  })
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>
  if (q.isError) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>
  if (!q.data?.length) return <p className="text-sm text-muted-foreground">Sem registros.</p>
  return (
    <ol className="flex flex-col gap-3">
      {q.data.map((r) => (
        <li key={r.id} className="rounded-md border p-3">
          <p className="text-sm">
            <strong>{NOMES_ACAO[r.acao] ?? r.acao}</strong> · {r.usuario ?? 'Sistema'} ·{' '}
            <span className="text-muted-foreground">{formatarDataHora(r.ocorridoEm, fuso)}</span>
          </p>
          <Diferencas r={r} />
        </li>
      ))}
    </ol>
  )
}
