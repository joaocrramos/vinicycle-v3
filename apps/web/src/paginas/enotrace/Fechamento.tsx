// EnoTrace › Fechamento do mês (cantina.md, Declarações e fechamento): os meses do ano, a lista de
// conferência, o relatório do mês (base da declaração mensal, Lei 7.678/1988, art. 31), fechar com
// "ciente" e reabrir com motivo. O relatório se imprime pelo navegador.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarDecimal } from '@vinicycle/shared';
import { Printer } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { PedirMotivo } from '@/componentes/PedirMotivo';
import { Botao } from '@/componentes/ui/botao';
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao';
import { Caixa, Selecao } from '@/componentes/ui/campos';
import { Pagina } from '@/layout/Estrutura';
import { api, ErroApi } from '@/lib/api';
import { fusoAtivo, pode, useSessao } from '@/lib/sessao';
import { formatarDataHora } from '@/lib/utils';
import { litros } from './Projetos';

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];
const GRUPOS: Record<string, string> = {
  entradas: 'Entradas',
  saidas: 'Saídas',
  internos: 'Movimentos internos (líquido)',
  ajustes: 'Ajustes e estornos',
};

interface Mes {
  ano: number;
  mes: number;
  situacao: 'aberto' | 'fechado' | 'reaberto';
  terminou: boolean;
  fechadoEm: string | null;
  reabertoEm: string | null;
  motivoReabertura: string | null;
  conferencia: Array<{
    codigo: string;
    nome: string;
    n: number;
    itens: string[];
    link: string;
    impede: boolean;
  }>;
  relatorio: {
    granel: {
      inicial: string;
      entradas: string;
      saidas: string;
      internos: string;
      ajustes: string;
      final: string;
      porTipo: Array<{ tipo: string; nome: string; grupo: string; litros: string }>;
    };
    produtos: Array<{
      itemId: string;
      item: string;
      inicial: number;
      entradas: number;
      saidas: number;
      ajustes: number;
      internos: number;
      final: number;
      litrosInicial: string | null;
      litrosFinal: string | null;
    }>;
  };
}

const gar = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

export function PaginaFechamento() {
  const { data: s } = useSessao();
  const fuso = fusoAtivo(s);
  const qc = useQueryClient();
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() === 0 ? 12 : hoje.getMonth());
  const [cientes, setCientes] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [reabrindo, setReabrindo] = useState(false);
  const meses = useQuery({
    queryKey: ['fechamentos', ano],
    queryFn: () =>
      api.get<Array<{ mes: number; situacao: Mes['situacao'] }>>(`/api/fechamentos?ano=${ano}`),
  });
  const q = useQuery({
    queryKey: ['fechamento', ano, mes],
    queryFn: () => api.get<Mes>(`/api/fechamentos/${ano}/${mes}`),
  });
  const atualizar = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['fechamentos', ano] }),
      qc.invalidateQueries({ queryKey: ['fechamento', ano, mes] }),
    ]);
  const f = q.data;
  const pendentes = f?.conferencia.filter((c) => !c.impede && c.n > 0) ?? [];
  const impede = f?.conferencia.some((c) => c.impede && c.n > 0);
  const podeFechar =
    !!f &&
    f.situacao !== 'fechado' &&
    f.terminou &&
    !impede &&
    pendentes.every((c) => cientes.includes(`fechamento:${c.codigo}`));
  return (
    <Pagina
      titulo="Fechamento do mês"
      trilha={['EnoTrace']}
      acoes={
        <Botao variante="secundario" onClick={() => window.print()}>
          <Printer /> Imprimir
        </Botao>
      }
    >
      <p className="text-sm text-muted-foreground print:hidden">
        Fechado, o mês não recebe lançamentos com data nele (operações, recepção, estoque, saídas).
        O relatório do mês é a base da declaração mensal (Lei 7.678/1988, art. 31), feita no portal
        do MAPA. Fecha quem tem a permissão de Fechamento; reabrir pede a permissão própria e o
        motivo.
      </p>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Selecao
          aria-label="Ano"
          className="w-28"
          value={ano}
          onChange={(e) => {
            setAno(Number(e.target.value));
            setCientes([]);
          }}
        >
          {[hoje.getFullYear() - 1, hoje.getFullYear(), hoje.getFullYear() + 1].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Selecao>
        <div className="flex flex-wrap gap-1">
          {meses.data?.map((m) => (
            <button
              key={m.mes}
              type="button"
              onClick={() => {
                setMes(m.mes);
                setCientes([]);
                setErro(null);
              }}
              className={`cursor-pointer rounded-md border px-2.5 py-1 text-sm ${m.mes === mes ? 'border-primary bg-accent' : 'hover:bg-muted'}`}
              title={
                m.situacao === 'fechado'
                  ? 'Fechado'
                  : m.situacao === 'reaberto'
                    ? 'Reaberto'
                    : 'Aberto'
              }
            >
              {MESES[m.mes - 1]!.slice(0, 3)}
              {m.situacao === 'fechado' && ' 🔒'}
            </button>
          ))}
        </div>
      </div>
      {f && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">
              {MESES[f.mes - 1]} de {f.ano}
            </h2>
            <Etiqueta
              tom={
                f.situacao === 'fechado'
                  ? 'sucesso'
                  : f.situacao === 'reaberto'
                    ? 'alerta'
                    : 'neutro'
              }
            >
              {f.situacao === 'fechado'
                ? 'Fechado'
                : f.situacao === 'reaberto'
                  ? 'Reaberto'
                  : 'Aberto'}
            </Etiqueta>
            {f.fechadoEm && (
              <span className="text-sm text-muted-foreground">
                fechado em {formatarDataHora(f.fechadoEm, fuso)}
              </span>
            )}
            {f.situacao === 'reaberto' && f.motivoReabertura && (
              <span className="text-sm text-muted-foreground">reaberto: {f.motivoReabertura}</span>
            )}
          </div>
          <Cartao className="print:hidden">
            <CabecalhoCartao
              titulo="Conferência"
              descricao={
                f.situacao === 'fechado'
                  ? 'Como estava ao fechar.'
                  : 'Antes de fechar. A pendência de estoque negativo impede o fechamento; o resto pede "ciente".'
              }
            />
            <CorpoCartao className="flex flex-col gap-2 text-sm">
              {f.conferencia.map((c) => (
                <div key={c.codigo} className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      c.n
                        ? c.impede
                          ? 'font-medium text-destructive'
                          : 'font-medium'
                        : 'text-muted-foreground'
                    }
                  >
                    {c.nome}: {c.n}
                  </span>
                  {c.n > 0 && (
                    <Link className="underline" to={c.link}>
                      ver
                    </Link>
                  )}
                  {c.n > 0 && !c.impede && f.situacao !== 'fechado' && (
                    <Caixa
                      rotulo="Estou ciente"
                      checked={cientes.includes(`fechamento:${c.codigo}`)}
                      onChange={(e) =>
                        setCientes(
                          e.target.checked
                            ? [...cientes, `fechamento:${c.codigo}`]
                            : cientes.filter((x) => x !== `fechamento:${c.codigo}`),
                        )
                      }
                    />
                  )}
                </div>
              ))}
            </CorpoCartao>
          </Cartao>
          <Cartao>
            <CabecalhoCartao titulo="Granel (litros)" descricao="Vinho e mosto nos recipientes." />
            <CorpoCartao className="flex flex-col gap-2 text-sm">
              <div className="grid gap-x-6 gap-y-1 sm:grid-cols-3">
                <p>
                  Estoque inicial: <strong>{litros(f.relatorio.granel.inicial)}</strong>
                </p>
                <p>
                  Entradas: <strong>{litros(f.relatorio.granel.entradas)}</strong>
                </p>
                <p>
                  Saídas: <strong>{litros(f.relatorio.granel.saidas)}</strong>
                </p>
                <p>Internos (líquido): {litros(f.relatorio.granel.internos)}</p>
                <p>Ajustes e estornos: {litros(f.relatorio.granel.ajustes)}</p>
                <p>
                  Estoque final: <strong>{litros(f.relatorio.granel.final)}</strong>
                </p>
              </div>
              {f.relatorio.granel.porTipo.length > 0 && (
                <table className="mt-2 w-full max-w-xl">
                  <tbody>
                    {f.relatorio.granel.porTipo.map((t) => (
                      <tr key={t.tipo} className="border-t">
                        <td className="py-1 pr-4">{t.nome}</td>
                        <td className="py-1 pr-4 text-muted-foreground">{GRUPOS[t.grupo]}</td>
                        <td className="py-1 text-right">{litros(t.litros)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CorpoCartao>
          </Cartao>
          <Cartao>
            <CabecalhoCartao
              titulo="Produto acabado"
              descricao="Por produto e formato, em garrafas (e litros)."
            />
            <CorpoCartao className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2 font-medium">Produto</th>
                    <th className="py-2 pr-4 text-right font-medium">Inicial</th>
                    <th className="py-2 pr-4 text-right font-medium">Entradas</th>
                    <th className="py-2 pr-4 text-right font-medium">Saídas</th>
                    <th className="py-2 pr-4 text-right font-medium">Ajustes</th>
                    <th className="py-2 pr-5 text-right font-medium">Final</th>
                  </tr>
                </thead>
                <tbody>
                  {f.relatorio.produtos.map((p) => (
                    <tr key={p.itemId} className="border-b last:border-0">
                      <td className="px-5 py-2">{p.item}</td>
                      <td className="py-2 pr-4 text-right">{gar(p.inicial)}</td>
                      <td className="py-2 pr-4 text-right">{gar(p.entradas)}</td>
                      <td className="py-2 pr-4 text-right">{gar(p.saidas)}</td>
                      <td className="py-2 pr-4 text-right">{gar(p.ajustes + p.internos)}</td>
                      <td className="py-2 pr-5 text-right">
                        {gar(p.final)}
                        {p.litrosFinal && (
                          <span className="text-muted-foreground">
                            {' '}
                            ({formatarDecimal(p.litrosFinal, 2)} L)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!f.relatorio.produtos.length && (
                    <tr>
                      <td colSpan={6} className="px-5 py-4 text-center text-muted-foreground">
                        Sem produto acabado no mês.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CorpoCartao>
          </Cartao>
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <div className="flex flex-wrap gap-2 border-t pt-4 print:hidden">
            {f.situacao !== 'fechado' && pode(s, 'enotrace.declaracoes', 'confirmar') && (
              <Botao
                disabled={!podeFechar}
                onClick={async () => {
                  setErro(null);
                  try {
                    await api.post(`/api/fechamentos/${ano}/${mes}/fechar`, { cientes });
                    await atualizar();
                  } catch (e) {
                    setErro(e instanceof ErroApi ? e.message : (e as Error).message);
                  }
                }}
              >
                Fechar o mês
              </Botao>
            )}
            {f.situacao !== 'fechado' && !f.terminou && (
              <span className="text-sm text-muted-foreground">O mês ainda não terminou.</span>
            )}
            {f.situacao === 'fechado' && pode(s, 'enotrace.reabrir_periodo', 'reabrir_periodo') && (
              <Botao variante="secundario" onClick={() => setReabrindo(true)}>
                Reabrir o mês
              </Botao>
            )}
          </div>
        </>
      )}
      <PedirMotivo
        aberto={reabrindo}
        aoMudar={setReabrindo}
        titulo="Reabrir o mês"
        descricao="Reaberto, o mês volta a receber lançamentos. Feche de novo depois das correções."
        rotuloBotao="Reabrir"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/fechamentos/${ano}/${mes}/reabrir`, { motivo });
          setReabrindo(false);
          await atualizar();
        }}
      />
    </Pagina>
  );
}
