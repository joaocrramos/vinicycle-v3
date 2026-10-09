// Relatório de história do lote (cantina.md, Lote comercial): a história completa do vinho, do lote
// comercial (ou do lote de produção, ou do projeto) às uvas de origem, para a fiscalização e o
// recolhimento. Imprime ou salva em PDF pelo navegador.
import { useQuery } from '@tanstack/react-query';
import { type Composicao, formatarDecimal, TIPOS_OPERACAO } from '@vinicycle/shared';
import { Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Botao } from '@/componentes/ui/botao';
import { CabecalhoCartao, Cartao, CorpoCartao } from '@/componentes/ui/cartao';
import { Pagina } from '@/layout/Estrutura';
import { api } from '@/lib/api';
import { nomeNaLista, useReferencia } from '@/lib/referencia';
import { fusoAtivo, useSessao } from '@/lib/sessao';
import { formatarData, formatarDataHora } from '@/lib/utils';
import { ResumoComposicao } from './operacoes/comum';
import { litros } from './Projetos';

type Linha = Record<string, string | number | boolean | null | Composicao>;

interface Historia {
  titulo: string;
  geradoEm: string;
  lotes: Linha[];
  uvas: Linha[];
  operacoes: Linha[];
  insumos: Linha[];
  analises: Linha[];
  genealogia: Linha[];
  envases: Linha[];
  saidas: Linha[];
}

const t = (v: unknown) => (v === null || v === undefined ? '—' : String(v));
const ORIGENS: Record<string, string> = {
  recepcao: 'Recepção da uva',
  corte: 'Corte',
  divisao: 'Divisão',
  granel: 'Entrada de granel',
  retorno_terceiro: 'Retorno de terceiro',
  titularidade: 'Transferência de titularidade',
  carga_inicial: 'Carga inicial',
};

function Secao({
  titulo,
  vazio,
  n,
  children,
}: {
  titulo: string;
  vazio: string;
  n: number;
  children: ReactNode;
}) {
  return (
    <Cartao className="break-inside-avoid print:border-0 print:shadow-none">
      <CabecalhoCartao titulo={`${titulo} (${n})`} />
      <CorpoCartao className="overflow-x-auto text-sm">
        {n ? children : <p className="text-muted-foreground">{vazio}</p>}
      </CorpoCartao>
    </Cartao>
  );
}

function Tabela({ cabecalho, linhas }: { cabecalho: string[]; linhas: ReactNode[][] }) {
  return (
    <table className="w-full">
      <thead className="text-left text-muted-foreground">
        <tr>
          {cabecalho.map((c) => (
            <th key={c} className="py-1 pr-4 font-medium">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((l, n) => (
          <tr key={n} className="border-t align-top">
            {l.map((c, i) => (
              <td key={i} className="py-1 pr-4">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PaginaHistoria() {
  const [params] = useSearchParams();
  const { data: s } = useSessao();
  const { data: ref } = useReferencia();
  const fuso = fusoAtivo(s);
  const q = useQuery({
    queryKey: ['historia', params.toString()],
    queryFn: () => api.get<Historia>(`/api/historia?${params.toString()}`),
  });
  if (!q.data)
    return (
      <p className="text-sm text-muted-foreground">
        {q.isError ? (q.error as Error).message : 'Carregando…'}
      </p>
    );
  const h = q.data;
  const dh = (v: unknown) => (v ? formatarDataHora(String(v), fuso) : '—');
  return (
    <Pagina
      titulo={`História: ${h.titulo}`}
      trilha={['EnoTrace']}
      acoes={
        <Botao variante="secundario" onClick={() => window.print()}>
          <Printer /> Imprimir
        </Botao>
      }
    >
      <p className="text-sm text-muted-foreground">
        Gerado em {dh(h.geradoEm)}. Inclui os lotes de produção de origem (pela genealogia), as
        uvas, as operações, os insumos, as análises, os envases e as saídas.
      </p>
      <Secao titulo="Lotes de produção" vazio="Nenhum lote." n={h.lotes.length}>
        <Tabela
          cabecalho={['Lote', 'Projeto', 'Origem', 'Titular', 'Saldo']}
          linhas={h.lotes.map((l) => [
            <Link key="l" className="underline" to={`/enotrace/lotes/${t(l.id)}`}>
              {t(l.codigo)}
            </Link>,
            `${t(l.projeto)} · ${t(l.projetoNome)}`,
            ORIGENS[String(l.origem)] ?? t(l.origem),
            t(l.titular),
            litros(String(l.saldo)),
          ])}
        />
      </Secao>
      <Secao
        titulo="Uvas de origem"
        vazio="Sem uva recebida nestes lotes (granel ou carga inicial)."
        n={h.uvas.length}
      >
        <Tabela
          cabecalho={[
            'Romaneio',
            'Chegada',
            'Produtor',
            'Parcela',
            'Variedade',
            'Safra',
            'kg',
            'Lote',
          ]}
          linhas={h.uvas.map((u) => [
            <Link key="r" className="underline" to={`/enotrace/recepcao/${t(u.romaneioId)}`}>
              {t(u.romaneio)}
            </Link>,
            dh(u.chegadaEm),
            t(u.produtor),
            t(u.parcela),
            `${t(u.variedade)}${u.organica ? ' (orgânica)' : ''}`,
            t(u.safra),
            formatarDecimal(String(u.kg), 1),
            t(u.lote),
          ])}
        />
      </Secao>
      <Secao titulo="Operações" vazio="Nenhuma operação." n={h.operacoes.length}>
        <Tabela
          cabecalho={['Data', 'Operação', 'Tipo', 'Recipientes', 'Litros dos lotes', 'Responsável']}
          linhas={h.operacoes.map((o) => [
            dh(o.executadoEm),
            <Link key="o" className="underline" to={`/enotrace/operacoes/${t(o.id)}`}>
              {t(o.codigo)}
            </Link>,
            `${TIPOS_OPERACAO[o.tipo as keyof typeof TIPOS_OPERACAO] ?? t(o.tipo)}${o.situacao === 'estornada' ? ' (estornada)' : ''}`,
            t(o.recipientes),
            o.litros ? litros(String(o.litros)) : '—',
            t(o.responsavel),
          ])}
        />
      </Secao>
      <Secao titulo="Insumos aplicados" vazio="Nenhum insumo." n={h.insumos.length}>
        <Tabela
          cabecalho={['Data', 'Operação', 'Insumo', 'Lote do insumo', 'Dose', 'Recipiente', 'Lote']}
          linhas={h.insumos.map((i) => [
            dh(i.executadoEm),
            t(i.operacao),
            t(i.insumo),
            t(i.loteInsumo),
            `${formatarDecimal(String(i.dose), 2)} ${t(i.unidade)}`,
            t(i.recipiente),
            t(i.lote),
          ])}
        />
      </Secao>
      <Secao titulo="Análises e laudos" vazio="Nenhuma análise." n={h.analises.length}>
        <Tabela
          cabecalho={['Amostra', 'Tipo', 'Laboratório', 'Lote', 'Resultados']}
          linhas={h.analises.map((a) => [
            <Link key="a" className="underline" to={`/enotrace/laboratorio/analises/${t(a.id)}`}>
              {dh(a.amostraEm)}
            </Link>,
            a.tipo === 'laudo' ? `Laudo${a.documento ? ` ${t(a.documento)}` : ''}` : 'Interna',
            t(a.laboratorio),
            t(a.lote),
            t(a.resultados),
          ])}
        />
      </Secao>
      <Secao
        titulo="Cortes e genealogia"
        vazio="Sem corte, incorporação ou divisão."
        n={h.genealogia.length}
      >
        <Tabela
          cabecalho={['Data', 'Operação', 'Ligação', 'De', 'Para', 'Litros']}
          linhas={h.genealogia.map((g) => [
            dh(g.executadoEm),
            t(g.operacao),
            t(g.tipo).replace('_', ' '),
            t(g.origem),
            t(g.destino),
            litros(String(g.litros)),
          ])}
        />
      </Secao>
      <Secao
        titulo="Envases (lotes comerciais)"
        vazio="Ainda não engarrafado."
        n={h.envases.length}
      >
        {h.envases.map((e) => (
          <div key={String(e.id)} className="border-b py-2 last:border-0">
            <p>
              <strong>{t(e.codigo)}</strong> · {t(e.produto)} · {litros(String(e.litros))} ·{' '}
              {e.primeiroEnvase
                ? formatarData(String(e.primeiroEnvase).slice(0, 10))
                : 'carga inicial'}{' '}
              · em estoque: {formatarDecimal(String(e.saldo), 0)} garrafas
            </p>
            {e.composicao && (
              <p className="text-muted-foreground">
                <ResumoComposicao c={e.composicao as Composicao} />
              </p>
            )}
          </div>
        ))}
      </Secao>
      <Secao titulo="Saídas (quem recebeu)" vazio="Nenhuma saída destes lotes." n={h.saidas.length}>
        <Tabela
          cabecalho={['Data', 'Tipo', 'Destinatário', 'Lote comercial', 'Produto', 'Quantidade']}
          linhas={h.saidas.map((x) => [
            <Link key="s" className="underline" to={`/enotrace/saidas/${t(x.id)}`}>
              {dh(x.executadoEm)}
            </Link>,
            nomeNaLista(ref, 'tipo_saida', String(x.tipo)),
            t(x.destinatario),
            t(x.loteComercial),
            t(x.item),
            `${formatarDecimal(String(x.quantidade), 0)}${Number(x.devolvido) > 0 ? ` (voltaram ${formatarDecimal(String(x.devolvido), 0)})` : ''}`,
          ])}
        />
      </Secao>
    </Pagina>
  );
}
