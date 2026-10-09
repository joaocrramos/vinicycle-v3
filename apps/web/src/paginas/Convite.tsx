// Aceite do convite (administracao.md, Fluxo, passo 3): dados pessoais (P2), senha e aceite dos
// termos (P21). Quem já tem cadastro só confirma a senha (P8).
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { EntrarOuCadastrar, type Termo } from '@/componentes/EntrarOuCadastrar'
import { Aviso } from '@/componentes/ui/cartao'
import { api } from '@/lib/api'
import { type EstadoSessao, useAtualizarSessao } from '@/lib/sessao'
import { TelaPublica } from './publicas'

interface Convite {
  email: string
  empresa: string
  perfil: string
  master: boolean
  situacao: string
  usuarioExiste: boolean
  termos: Termo[]
}

export function PaginaConvite() {
  const { token = '' } = useParams()
  const q = useQuery({
    queryKey: ['convite', token],
    queryFn: () => api.get<Convite>(`/api/convites/${token}`),
    retry: false,
  })
  return (
    <TelaPublica
      titulo="Convite"
      largo={!!q.data && !q.data.usuarioExiste && q.data.situacao === 'pendente'}
    >
      {q.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {q.isError && <Aviso tom="erro">{(q.error as Error).message}</Aviso>}
      {q.data && q.data.situacao !== 'pendente' && (
        <Aviso tom="alerta">
          {q.data.situacao === 'expirado'
            ? 'Este convite expirou. Peça a quem convidou para reenviar.'
            : q.data.situacao === 'aceito'
              ? 'Este convite já foi aceito.'
              : 'Este convite foi cancelado.'}{' '}
          <Link to="/entrar" className="text-primary underline">
            Ir para a entrada
          </Link>
        </Aviso>
      )}
      {q.data?.situacao === 'pendente' && <Aceite token={token} c={q.data} />}
    </TelaPublica>
  )
}

function Aceite({ token, c }: { token: string; c: Convite }) {
  const navegar = useNavigate()
  const atualizar = useAtualizarSessao()
  return (
    <EntrarOuCadastrar
      usuarioExiste={c.usuarioExiste}
      termos={c.termos}
      rotulo="Aceitar o convite"
      resumo={
        <p className="text-sm">
          Você foi convidado para usar o ViniCycle em <strong>{c.empresa}</strong> com o perfil{' '}
          <strong>{c.perfil}</strong>
          {c.master && ' (Master: acesso a tudo, inclusive usuários e configurações)'}. E-mail:{' '}
          <strong>{c.email}</strong>.
        </p>
      }
      aoEnviar={async (corpo) => {
        atualizar(await api.post<EstadoSessao>(`/api/convites/${token}/aceitar`, corpo))
        navegar('/')
      }}
    />
  )
}
