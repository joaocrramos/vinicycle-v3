// Administração › Painel (administracao.md, Visão geral): clientes, usuários, receita recorrente,
// faturas, previsão de 6 meses, quem está perto dos limites e as oportunidades da vitrine.
// Indicadores em número e tabela: nada aqui pede gráfico.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatarMoeda,
  NOMES_SITUACAO_EMPRESA,
  paraCentavos,
  SITUACOES_EMPRESA,
} from '@vinicycle/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Botao } from '@/componentes/ui/botao';
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao } from '@/componentes/ui/cartao';
import { Pagina } from '@/layout/Estrutura';
import { api } from '@/lib/api';
import { pode, useSessao } from '@/lib/sessao';
import { formatarData, formatarDataHora } from '@/lib/utils';

interface Painel {
  clientes: { porSituacao: Record<string, number>; novosNoMes: number };
  usuarios: { ativos: number; ultimos30Dias: number };
  receitaMensal: string;
  faturas: Record<string, { quantidade: number; saldo: string }>;
  previsao: Array<{ mes: string; valor: string }>;
  maiores: Array<{ empresaId: string; cliente: string; mensal: string }>;
  pertoDosLimites: Array<{
    empresaId: string;
    cliente: string;
    item: string;
    uso: string;
    limite: string;
  }>;
  emTeste: Array<{ empresaId: string; cliente: string; fimTeste: string | null }>;
  oportunidades: number;
}

interface Interesse {
  id: string;
  empresaId: string;
  cliente: string;
  modulo: string;
  funcao: string;
  usuario: string;
  observacao: string | null;
  criadoEm: string;
}

const moeda = (v: string) => formatarMoeda(paraCentavos(v));
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesAno = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`;

function Indicador({
  rotulo,
  valor,
  detalhe,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
}) {
  return (
    <Cartao>
      <CorpoCartao className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{rotulo}</span>
        <span className="text-2xl font-semibold tabular-nums">{valor}</span>
        {detalhe && <span className="text-xs text-muted-foreground">{detalhe}</span>}
      </CorpoCartao>
    </Cartao>
  );
}

export function PaginaPainel() {
  const { data: s } = useSessao();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['painel-plataforma'],
    queryFn: () => api.get<Painel>('/api/plataforma/painel'),
  });
  const interesses = useQuery({
    queryKey: ['interesses'],
    queryFn: () => api.get<Interesse[]>('/api/plataforma/interesses'),
  });
  if (!q.data) {
    return (
      <Pagina titulo="Painel" trilha={['Administração']}>
        <p className="text-sm text-muted-foreground">
          {q.isError ? (q.error as Error).message : 'Carregando…'}
        </p>
      </Pagina>
    );
  }
  const p = q.data;
  const ativos =
    (p.clientes.porSituacao.ativo ?? 0) + (p.clientes.porSituacao.somente_leitura ?? 0);
  const vencidas = p.faturas.vencida;
  const abertas = [p.faturas.aberta, p.faturas.parcial].filter(Boolean);
  return (
    <Pagina titulo="Painel" trilha={['Administração']}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          rotulo="Receita recorrente mensal"
          valor={moeda(p.receitaMensal)}
          detalhe="Assinaturas contratadas, com descontos"
        />
        <Indicador
          rotulo="Clientes"
          valor={ativos}
          detalhe={`${p.clientes.porSituacao.teste ?? 0} em teste · ${p.clientes.novosNoMes} novo(s) no mês`}
        />
        <Indicador
          rotulo="Usuários"
          valor={p.usuarios.ativos}
          detalhe={`${p.usuarios.ultimos30Dias} entraram nos últimos 30 dias`}
        />
        <Indicador
          rotulo="Faturas vencidas"
          valor={vencidas?.quantidade ?? 0}
          detalhe={vencidas ? `Saldo de ${moeda(vencidas.saldo)}` : 'Nenhuma fatura vencida'}
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao>
          <CabecalhoCartao
            titulo="Previsão da receita mensal"
            descricao="Próximos 6 meses, com as mudanças de plano já agendadas."
          />
          <CorpoCartao>
            <table className="w-full text-sm">
              <tbody>
                {p.previsao.map((x) => (
                  <tr key={x.mes} className="border-b last:border-0">
                    <td className="py-1.5">{mesAno(x.mes)}</td>
                    <td className="py-1.5 text-right tabular-nums">{moeda(x.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CorpoCartao>
        </Cartao>
        <Cartao>
          <CabecalhoCartao titulo="Clientes por situação" />
          <CorpoCartao className="flex flex-col gap-1 text-sm">
            {SITUACOES_EMPRESA.map((x) => (
              <p key={x} className="flex justify-between">
                <span>{NOMES_SITUACAO_EMPRESA[x]}</span>
                <span className="tabular-nums">{p.clientes.porSituacao[x] ?? 0}</span>
              </p>
            ))}
            <p className="mt-2 flex justify-between border-t pt-2">
              <span>Faturas em aberto (a vencer)</span>
              <span className="tabular-nums">
                {abertas.reduce((t, f) => t + f!.quantidade, 0)} ·{' '}
                {moeda(String(abertas.reduce((t, f) => t + Number(f!.saldo), 0)))}
              </span>
            </p>
          </CorpoCartao>
        </Cartao>
        <Cartao>
          <CabecalhoCartao titulo="Maiores clientes" descricao="Pela receita mensal." />
          <CorpoCartao className="flex flex-col gap-1 text-sm">
            {!p.maiores.length && (
              <p className="text-muted-foreground">Nenhuma assinatura contratada.</p>
            )}
            {p.maiores.map((m) => (
              <p key={m.empresaId} className="flex justify-between gap-2">
                <Link
                  className="underline-offset-2 hover:underline"
                  to={`/plataforma/clientes/${m.empresaId}`}
                >
                  {m.cliente}
                </Link>
                <span className="tabular-nums">{moeda(m.mensal)}</span>
              </p>
            ))}
          </CorpoCartao>
        </Cartao>
        <Cartao>
          <CabecalhoCartao
            titulo="Perto dos limites"
            descricao="80% ou mais de algum limite da assinatura."
          />
          <CorpoCartao className="flex flex-col gap-1 text-sm">
            {!p.pertoDosLimites.length && (
              <p className="text-muted-foreground">Ninguém perto dos limites.</p>
            )}
            {p.pertoDosLimites.map((x) => (
              <p key={`${x.empresaId}-${x.item}`} className="flex justify-between gap-2">
                <Link
                  className="underline-offset-2 hover:underline"
                  to={`/plataforma/clientes/${x.empresaId}`}
                >
                  {x.cliente}
                </Link>
                <span>
                  {x.item}: {x.uso} de {x.limite}
                </span>
              </p>
            ))}
          </CorpoCartao>
        </Cartao>
        <Cartao>
          <CabecalhoCartao titulo="Em teste" />
          <CorpoCartao className="flex flex-col gap-1 text-sm">
            {!p.emTeste.length && <p className="text-muted-foreground">Nenhum cliente em teste.</p>}
            {p.emTeste.map((x) => (
              <p key={x.empresaId} className="flex justify-between gap-2">
                <Link
                  className="underline-offset-2 hover:underline"
                  to={`/plataforma/clientes/${x.empresaId}`}
                >
                  {x.cliente}
                </Link>
                <span>até {formatarData(x.fimTeste)}</span>
              </p>
            ))}
          </CorpoCartao>
        </Cartao>
        <Cartao>
          <CabecalhoCartao
            titulo={`Oportunidades (${p.oportunidades})`}
            descricao="Interesses registrados na vitrine Conheça e contrate."
          />
          <CorpoCartao className="flex flex-col gap-2 text-sm">
            {interesses.data && !interesses.data.length && (
              <p className="text-muted-foreground">Nenhuma oportunidade em aberto.</p>
            )}
            {interesses.data?.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <Link
                    className="underline-offset-2 hover:underline"
                    to={`/plataforma/clientes/${i.empresaId}`}
                  >
                    {i.cliente}
                  </Link>{' '}
                  · {i.modulo} · {i.usuario} · {formatarDataHora(i.criadoEm)}
                  {i.observacao && ` · ${i.observacao}`}
                </span>
                {pode(s, 'plataforma.clientes', 'editar') && (
                  <Botao
                    variante="secundario"
                    tamanho="pequeno"
                    onClick={async () => {
                      await api.post(`/api/plataforma/interesses/${i.id}/atender`, {});
                      await qc.invalidateQueries({ queryKey: ['interesses'] });
                      await qc.invalidateQueries({ queryKey: ['painel-plataforma'] });
                    }}
                  >
                    Atendido
                  </Botao>
                )}
              </div>
            ))}
          </CorpoCartao>
        </Cartao>
      </div>
      {p.faturas.vencida && (
        <Aviso tom="alerta">
          Há faturas vencidas. Veja em{' '}
          <Link className="underline" to="/plataforma/faturas">
            Faturas
          </Link>
          .
        </Aviso>
      )}
    </Pagina>
  );
}
