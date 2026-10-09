// Gestão › Aprovações (P27, Fluxo de aprovação; 04, roteiro do ciclo 8): a lista de pendências com
// uma caixa de marcar ao lado de cada uma. Marcou, aprovou: a ação é feita na hora e o pedido sai
// da tela. A recusa pede motivo. Cada um acompanha os próprios pedidos.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { PedirMotivo } from '@/componentes/PedirMotivo';
import { Aba, Abas, ConteudoAba, ListaAbas } from '@/componentes/ui/abas';
import { Botao } from '@/componentes/ui/botao';
import { Aviso, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao';
import { Pagina } from '@/layout/Estrutura';
import { api, ErroApi } from '@/lib/api';
import { fusoAtivo, useSessao } from '@/lib/sessao';
import { formatarDataHora } from '@/lib/utils';

interface Pedido {
  id: string;
  tipo: string;
  nomeTipo: string;
  resumo: string;
  situacao: 'pendente' | 'aprovada' | 'recusada' | 'cancelada' | 'falhou';
  solicitante: string | null;
  solicitadoEm: string;
  meu: boolean;
  podeDecidir: boolean;
  decisor: string | null;
  decididoEm: string | null;
  motivo: string | null;
  erro: string | null;
  visto: boolean;
  link: string;
}
type Escopo = 'pendentes' | 'minhas' | 'historico';

const SITUACAO: Record<
  Pedido['situacao'],
  { texto: string; tom: 'sucesso' | 'alerta' | 'erro' | 'neutro' }
> = {
  pendente: { texto: 'Pendente', tom: 'alerta' },
  aprovada: { texto: 'Aprovado', tom: 'sucesso' },
  recusada: { texto: 'Recusado', tom: 'erro' },
  cancelada: { texto: 'Cancelado', tom: 'neutro' },
  falhou: { texto: 'Aprovado, não feito', tom: 'erro' },
};

export function PaginaAprovacoes() {
  const [aba, setAba] = useState<Escopo>('pendentes');
  return (
    <Pagina titulo="Aprovações" trilha={['Gestão']}>
      <p className="text-sm text-muted-foreground">
        As ações que a empresa sujeitou à aprovação (Configurações › Parâmetros) esperam aqui.
        Marque a caixa para aprovar: a ação é feita na hora. Se algo mudou depois do pedido, ela não
        é feita e quem pediu vê o motivo. Quem pediu não aprova o próprio pedido, exceto o Master.
      </p>
      <Abas value={aba} onValueChange={(v) => setAba(v as Escopo)}>
        <ListaAbas>
          <Aba value="pendentes">Pendentes</Aba>
          <Aba value="minhas">Meus pedidos</Aba>
          <Aba value="historico">Histórico</Aba>
        </ListaAbas>
        {(['pendentes', 'minhas', 'historico'] as const).map((e) => (
          <ConteudoAba key={e} value={e}>
            {aba === e && <Lista escopo={e} />}
          </ConteudoAba>
        ))}
      </Abas>
    </Pagina>
  );
}

function Lista({ escopo }: { escopo: Escopo }) {
  const { data: s } = useSessao();
  const fuso = fusoAtivo(s);
  const qc = useQueryClient();
  const [recusando, setRecusando] = useState<string | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ tom: 'sucesso' | 'erro'; texto: string } | null>(
    null,
  );
  const q = useQuery({
    queryKey: ['aprovacoes', escopo],
    queryFn: () =>
      api.get<{ podeAprovar: boolean; itens: Pedido[] }>(`/api/aprovacoes?escopo=${escopo}`),
  });
  const atualizar = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['aprovacoes'] }),
      qc.invalidateQueries({ queryKey: ['alertas'] }),
    ]);
  const executar = async (f: () => Promise<unknown>) => {
    setResultado(null);
    try {
      await f();
    } catch (e) {
      setResultado({ tom: 'erro', texto: e instanceof ErroApi ? e.message : (e as Error).message });
    }
    await atualizar();
  };
  const itens = q.data?.itens ?? [];
  return (
    <div className="flex flex-col gap-3">
      {resultado && <Aviso tom={resultado.tom}>{resultado.texto}</Aviso>}
      <Cartao>
        <CorpoCartao className="flex flex-col divide-y p-0 text-sm">
          {itens.map((p) => (
            <div key={p.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
              {escopo === 'pendentes' && (
                <input
                  type="checkbox"
                  aria-label={`Aprovar: ${p.resumo}`}
                  className="mt-1 size-5 accent-[var(--primaria)]"
                  disabled={!p.podeDecidir || marcando === p.id}
                  checked={marcando === p.id}
                  title={
                    p.podeDecidir
                      ? 'Marcar = aprovar e fazer agora'
                      : p.meu
                        ? 'Seu pedido: outra pessoa aprova'
                        : 'Sem a permissão de aprovar'
                  }
                  onChange={() => {
                    setMarcando(p.id);
                    void executar(async () => {
                      const r = await api.post<{ situacao: string; erro: string | null }>(
                        `/api/aprovacoes/${p.id}/aprovar`,
                      );
                      setResultado(
                        r.erro
                          ? { tom: 'erro', texto: `Aprovado, mas não foi feito: ${r.erro}` }
                          : { tom: 'sucesso', texto: `Aprovado e feito: ${p.resumo}` },
                      );
                    }).finally(() => setMarcando(null));
                  }}
                />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.nomeTipo}</span>
                  {escopo !== 'pendentes' && (
                    <Etiqueta tom={SITUACAO[p.situacao].tom}>{SITUACAO[p.situacao].texto}</Etiqueta>
                  )}
                  <Link to={p.link} className="text-xs underline">
                    ver
                  </Link>
                </div>
                <span>{p.resumo}</span>
                <span className="text-xs text-muted-foreground">
                  Pedido por {p.meu ? 'você' : (p.solicitante ?? '—')} em{' '}
                  {formatarDataHora(p.solicitadoEm, fuso)}
                  {p.decididoEm &&
                    ` · ${p.situacao === 'cancelada' ? 'cancelado' : 'decidido'} por ${p.decisor ?? '—'} em ${formatarDataHora(p.decididoEm, fuso)}`}
                </span>
                {p.situacao === 'recusada' && (
                  <span className="text-xs text-destructive">Motivo da recusa: {p.motivo}</span>
                )}
                {p.situacao === 'falhou' && (
                  <span className="text-xs text-destructive">Não foi feito: {p.erro}</span>
                )}
              </div>
              <div className="flex gap-2">
                {escopo === 'pendentes' && p.podeDecidir && (
                  <Botao variante="secundario" onClick={() => setRecusando(p.id)}>
                    Recusar
                  </Botao>
                )}
                {p.meu && p.situacao === 'pendente' && (
                  <Botao
                    variante="secundario"
                    onClick={() => executar(() => api.post(`/api/aprovacoes/${p.id}/cancelar`))}
                  >
                    Cancelar o pedido
                  </Botao>
                )}
                {p.meu && (p.situacao === 'recusada' || p.situacao === 'falhou') && !p.visto && (
                  <Botao
                    variante="secundario"
                    onClick={() => executar(() => api.post(`/api/aprovacoes/${p.id}/visto`))}
                  >
                    Ok, visto
                  </Botao>
                )}
              </div>
            </div>
          ))}
          {q.data && !itens.length && (
            <p className="px-5 py-6 text-center text-muted-foreground">
              {escopo === 'pendentes'
                ? 'Nenhum pedido esperando aprovação.'
                : escopo === 'minhas'
                  ? 'Você não fez pedidos.'
                  : 'Nada decidido ainda.'}
            </p>
          )}
        </CorpoCartao>
      </Cartao>
      <PedirMotivo
        aberto={!!recusando}
        aoMudar={(v) => !v && setRecusando(null)}
        titulo="Recusar o pedido"
        descricao="A ação não é feita. Quem pediu vê o motivo."
        rotuloBotao="Recusar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/aprovacoes/${recusando}/recusar`, { motivo });
          setRecusando(null);
          await atualizar();
        }}
      />
    </div>
  );
}
