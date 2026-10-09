// Sino da barra superior (ambiente-cliente.md, Barra superior; P20): contador de alertas não lidos,
// painel com os mais recentes, cada um com link para o registro, e "marcar como lidos".
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Botao } from '@/componentes/ui/botao';
import { ConteudoMenu, GatilhoMenu, Menu, SeparadorMenu } from '@/componentes/ui/menu';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface Alerta {
  id: string;
  tipo: string;
  nomeTipo: string;
  gravidade: 'info' | 'atencao' | 'critico';
  mensagem: string;
  link: string | null;
  estabelecimento: string | null;
  abertoEm: string;
  resolvidoEm: string | null;
  lido: boolean;
}

export const COR_GRAVIDADE: Record<Alerta['gravidade'], string> = {
  critico: 'bg-destructive',
  atencao: 'bg-warning',
  info: 'bg-primary',
};

export function SinoAlertas() {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const resumo = useQuery({
    queryKey: ['alertas-resumo'],
    queryFn: () =>
      api.get<{ abertos: number; naoLidos: number; criticos: number }>('/api/alertas/resumo'),
    refetchInterval: 5 * 60_000,
  });
  const lista = useQuery({
    queryKey: ['alertas', 'aberto'],
    queryFn: () => api.get<Alerta[]>('/api/alertas'),
    enabled: aberto,
  });
  const naoLidos = resumo.data?.naoLidos ?? 0;
  const marcar = async (ids: string[]) => {
    await api.post('/api/alertas/lidos', { ids });
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['alertas-resumo'] }),
      qc.invalidateQueries({ queryKey: ['alertas'] }),
    ]);
  };
  return (
    <Menu open={aberto} onOpenChange={setAberto}>
      <GatilhoMenu asChild>
        <Botao
          variante="fantasma"
          tamanho="icone"
          aria-label={naoLidos ? `Alertas: ${naoLidos} não lidos` : 'Alertas'}
          className="relative"
        >
          <Bell />
          {naoLidos > 0 && (
            <span
              className={cn(
                'absolute -top-0.5 -right-0.5 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-semibold text-white',
                resumo.data?.criticos ? 'bg-destructive' : 'bg-primary',
              )}
            >
              {naoLidos > 99 ? '99+' : naoLidos}
            </span>
          )}
        </Botao>
      </GatilhoMenu>
      <ConteudoMenu align="end" className="w-96 max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-medium">Alertas</span>
          {naoLidos > 0 && (
            <button
              type="button"
              className="cursor-pointer text-xs text-muted-foreground underline"
              onClick={() => void marcar([])}
            >
              Marcar todos como lidos
            </button>
          )}
        </div>
        <SeparadorMenu />
        <div className="max-h-96 overflow-y-auto">
          {lista.isLoading && (
            <p className="px-3 py-4 text-sm text-muted-foreground">Carregando…</p>
          )}
          {lista.data?.slice(0, 15).map((a) => (
            <button
              key={a.id}
              type="button"
              className={cn(
                'flex w-full cursor-pointer gap-2 px-3 py-2 text-left text-sm hover:bg-muted',
                a.lido && 'text-muted-foreground',
              )}
              onClick={() => {
                void marcar([a.id]);
                setAberto(false);
                if (a.link) navegar(a.link);
              }}
            >
              <span
                className={cn('mt-1.5 size-2 shrink-0 rounded-full', COR_GRAVIDADE[a.gravidade])}
                aria-hidden
              />
              <span>
                <span className="block text-xs text-muted-foreground">
                  {a.nomeTipo}
                  {a.estabelecimento && ` · ${a.estabelecimento}`}
                </span>
                {a.mensagem}
              </span>
            </button>
          ))}
          {lista.data && !lista.data.length && (
            <p className="px-3 py-4 text-sm text-muted-foreground">Nenhum alerta aberto.</p>
          )}
        </div>
        <SeparadorMenu />
        <button
          type="button"
          className="w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-muted"
          onClick={() => {
            setAberto(false);
            navegar('/alertas');
          }}
        >
          Ver todos os alertas
        </button>
      </ConteudoMenu>
    </Menu>
  );
}
