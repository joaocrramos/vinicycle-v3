import { useNavigate } from 'react-router';
import { Botao } from '@/componentes/ui/botao';
import { Aviso } from '@/componentes/ui/cartao';
import { api } from '@/lib/api';
import { type EstadoSessao, useAtualizarSessao } from '@/lib/sessao';
import { TelaPublica } from './publicas';

/** Usuário com vínculo em mais de uma empresa escolhe em qual vai trabalhar (P8). */
export function EscolherEmpresa({ sessao }: { sessao: EstadoSessao }) {
  const atualizar = useAtualizarSessao();
  const navegar = useNavigate();
  return (
    <TelaPublica titulo="Escolha a empresa">
      {sessao.empresas.length === 0 ? (
        <Aviso tom="alerta">
          Você ainda não tem acesso a nenhuma empresa. Peça um convite ao Master da empresa.
        </Aviso>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessao.empresas.map((e) => (
            <li key={e.id}>
              <Botao
                variante="secundario"
                className="h-auto w-full justify-between py-3"
                onClick={async () => {
                  atualizar(
                    await api.post<EstadoSessao>('/api/auth/contexto', { empresaId: e.id }),
                  );
                  navegar('/inicio');
                }}
              >
                <span className="font-medium">{e.nome}</span>
                <span className="text-xs text-muted-foreground">{e.perfil}</span>
              </Botao>
            </li>
          ))}
        </ul>
      )}
      {sessao.equipe && (
        <Botao
          variante="link"
          onClick={async () => {
            atualizar(
              await api.post<EstadoSessao>('/api/auth/contexto', { contexto: 'plataforma' }),
            );
            navegar('/plataforma/clientes');
          }}
        >
          Ir para a Administração da plataforma
        </Botao>
      )}
    </TelaPublica>
  );
}
