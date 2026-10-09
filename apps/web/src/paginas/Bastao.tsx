// Link da passagem de bastão (administracao.md, Master e passagem de bastão): o escolhido aceita
// ou recusa. Com a sessão dele aberta, basta um clique; senão, entra com a senha ou se cadastra.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { EntrarOuCadastrar, type Termo } from '@/componentes/EntrarOuCadastrar';
import { Botao } from '@/componentes/ui/botao';
import { Aviso } from '@/componentes/ui/cartao';
import { api } from '@/lib/api';
import { type EstadoSessao, useAtualizarSessao } from '@/lib/sessao';
import { formatarDataHora } from '@/lib/utils';
import { TelaPublica } from './publicas';

interface Pedido {
  empresa: string;
  /** Vazio quando foi o suporte quem designou. */
  quem: string | null;
  email: string;
  situacao: 'pendente' | 'aceita' | 'recusada' | 'cancelada' | 'expirada';
  expiraEm: string;
  usuarioExiste: boolean;
  sessaoConfere: boolean;
  termos: Termo[];
}

const SITUACOES: Record<Exclude<Pedido['situacao'], 'pendente'>, string> = {
  aceita: 'Este pedido já foi aceito.',
  recusada: 'Este pedido foi recusado.',
  cancelada: 'Este pedido foi cancelado.',
  expirada: 'O prazo para aceitar terminou. Peça ao Master um novo pedido.',
};

export function PaginaBastao() {
  const { token = '' } = useParams();
  const navegar = useNavigate();
  const atualizar = useAtualizarSessao();
  const [recusado, setRecusado] = useState(false);
  const [confirmarRecusa, setConfirmarRecusa] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const q = useQuery({
    queryKey: ['bastao', token],
    queryFn: () => api.get<Pedido>(`/api/bastao/${token}`),
    retry: false,
  });
  const p = q.data;

  const aceitar = async (corpo: unknown) => {
    atualizar(await api.post<EstadoSessao>(`/api/bastao/${token}/aceitar`, corpo));
    navegar('/');
  };

  const recusar = async () => {
    setErro(null);
    setEnviando(true);
    try {
      await api.post(`/api/bastao/${token}/recusar`);
      setRecusado(true);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <TelaPublica
      titulo="Passagem de bastão"
      largo={!!p && !p.usuarioExiste && p.situacao === 'pendente' && !recusado}
    >
      {q.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {q.isError && <Aviso tom="erro">{(q.error as Error).message}</Aviso>}
      {p && (recusado || p.situacao !== 'pendente') && (
        <Aviso tom={recusado ? 'sucesso' : 'alerta'}>
          {recusado
            ? 'Você recusou o pedido. Nada mudou na empresa.'
            : SITUACOES[p.situacao as keyof typeof SITUACOES]}{' '}
          <Link to="/entrar" className="text-primary underline">
            Ir para a entrada
          </Link>
        </Aviso>
      )}
      {p?.situacao === 'pendente' && !recusado && (
        <div className="flex flex-col gap-5">
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          {p.sessaoConfere ? (
            <>
              <Resumo p={p} />
              <Botao
                disabled={enviando}
                onClick={async () => {
                  setErro(null);
                  setEnviando(true);
                  try {
                    await aceitar({});
                  } catch (e) {
                    setErro((e as Error).message);
                    setEnviando(false);
                  }
                }}
              >
                Aceitar e ser o Master
              </Botao>
            </>
          ) : (
            <EntrarOuCadastrar
              usuarioExiste={p.usuarioExiste}
              termos={p.termos}
              rotulo="Aceitar e ser o Master"
              resumo={<Resumo p={p} />}
              aoEnviar={aceitar}
            />
          )}
          <div className="border-t pt-4">
            {confirmarRecusa ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm">
                  Recusar o pedido? O Master continua o mesmo e será avisado.
                </p>
                <div className="flex gap-2">
                  <Botao variante="perigo" disabled={enviando} onClick={recusar}>
                    Recusar
                  </Botao>
                  <Botao variante="secundario" onClick={() => setConfirmarRecusa(false)}>
                    Voltar
                  </Botao>
                </div>
              </div>
            ) : (
              <Botao variante="secundario" onClick={() => setConfirmarRecusa(true)}>
                Não quero ser o Master
              </Botao>
            )}
          </div>
        </div>
      )}
    </TelaPublica>
  );
}

function Resumo({ p }: { p: Pedido }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>
        {p.quem ? (
          <>
            <strong>{p.quem}</strong> quer passar a você o papel de Master de{' '}
            <strong>{p.empresa}</strong>.
          </>
        ) : (
          <>
            O suporte do ViniCycle designou você como Master de <strong>{p.empresa}</strong>.
          </>
        )}{' '}
        E-mail: <strong>{p.email}</strong>.
      </p>
      <p className="text-muted-foreground">
        O Master tem acesso a tudo e cuida dos usuários e das configurações. Nada muda até você
        aceitar. O pedido vale até {formatarDataHora(p.expiraEm)}.
      </p>
    </div>
  );
}
