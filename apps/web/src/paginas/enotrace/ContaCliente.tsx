// EnoTrace › Terceiros › Conta do cliente (04, roteiro do ciclo 10, bloco 3): por cliente de
// vinificação e safra, o que a cantina recebeu, elaborou, guarda, devolveu e reteve, com o
// rendimento e as perdas comparados com a perda tolerada do contrato.
import { useQuery } from '@tanstack/react-query';
import { formatarDecimal, UNIDADES_PAGAMENTO_PRODUTO } from '@vinicycle/shared';
import { Link, useSearchParams } from 'react-router';
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao } from '@/componentes/ui/cartao';
import { Campo, Selecao } from '@/componentes/ui/campos';
import { Pagina } from '@/layout/Estrutura';
import { api } from '@/lib/api';

interface Safra {
  safra: number | null;
  uvaKg: string;
  mostoElaborado: string;
  granelRecebido: string;
  perdas: string;
  engarrafado: string;
  devolvidoGranel: string;
  outrasSaidasGranel: string;
  transferidoGranel: string;
  emElaboracao: string;
  rendimento: string | null;
  perdaPercentual: string | null;
  foraDaTolerancia: string | null;
}

interface Conta {
  titularId: string;
  titular: string;
  contrato: null | {
    id: string;
    numero: string | null;
    perdaToleradaTipo: string | null;
    perdaToleradaValor: string | null;
    pagamentoProdutoValor: string | null;
    pagamentoProdutoUnidade: keyof typeof UNIDADES_PAGAMENTO_PRODUTO | null;
  };
  safras: Safra[];
  garrafas: {
    emEstoque: number;
    litrosEmEstoque: string;
    devolvidas: number;
    entreguesPorOrdem: number;
  };
  transferencias: {
    pagamentoLitros: string;
    pagamentoGarrafas: number;
    vendidoLitros: string;
    vendidoGarrafas: number;
    recebidoLitros: string;
    recebidoGarrafas: number;
  };
  insumos: Array<{
    item: string;
    unidade: string;
    recebido: string;
    usado: string;
    devolvido: string;
    saldo: string;
  }>;
  faltaDevolverLitros: string;
}

const L = (v: string) => `${formatarDecimal(v, 2)} L`;
const garrafas = (n: number) => (n ? ` (${n} garrafas)` : '');

function CartaoConta({ c }: { c: Conta }) {
  const tolerada = c.contrato?.perdaToleradaTipo
    ? c.contrato.perdaToleradaTipo === 'percentual'
      ? `perda tolerada de ${formatarDecimal(c.contrato.perdaToleradaValor, 2)}%`
      : `rendimento mínimo de ${formatarDecimal(c.contrato.perdaToleradaValor, 4)} L/kg`
    : 'sem perda tolerada no contrato';
  return (
    <Cartao>
      <CabecalhoCartao
        titulo={c.titular}
        descricao={
          c.contrato
            ? `Contrato ${c.contrato.numero ?? ''} · ${tolerada}`
            : 'Sem contrato de terceirização ativo'
        }
      />
      <CorpoCartao className="flex flex-col gap-4 text-sm">
        <div className="flex flex-wrap gap-4">
          {c.contrato && (
            <Link className="underline" to={`/enotrace/contratos/${c.contrato.id}`}>
              Ver o contrato
            </Link>
          )}
          <Link className="underline" to={`/enotrace/terceiros/dossies?titular=${c.titularId}`}>
            Dossiês do cliente
          </Link>
        </div>
        {c.safras
          .filter((s) => s.foraDaTolerancia)
          .map((s) => (
            <Aviso key={s.safra ?? 'sem'}>
              Safra {s.safra ?? 'sem safra'}: {s.foraDaTolerancia}
            </Aviso>
          ))}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-3">Safra</th>
                <th className="py-1 pr-3 text-right">Uva (kg)</th>
                <th className="py-1 pr-3 text-right">Mosto elaborado</th>
                <th className="py-1 pr-3 text-right">Granel recebido</th>
                <th className="py-1 pr-3 text-right">Rendimento</th>
                <th className="py-1 pr-3 text-right">Perdas</th>
                <th className="py-1 pr-3 text-right">Engarrafado</th>
                <th className="py-1 pr-3 text-right">Devolvido a granel</th>
                <th className="py-1 pr-3 text-right">Transferido</th>
                <th className="py-1 pr-3 text-right">Em elaboração</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {c.safras.map((s) => (
                <tr key={s.safra ?? 'sem'}>
                  <td className="py-1 pr-3">{s.safra ?? '—'}</td>
                  <td className="py-1 pr-3 text-right">{formatarDecimal(s.uvaKg, 1)}</td>
                  <td className="py-1 pr-3 text-right">{L(s.mostoElaborado)}</td>
                  <td className="py-1 pr-3 text-right">{L(s.granelRecebido)}</td>
                  <td className="py-1 pr-3 text-right">
                    {s.rendimento ? `${formatarDecimal(s.rendimento, 3)} L/kg` : '—'}
                  </td>
                  <td className="py-1 pr-3 text-right">
                    {L(s.perdas)}
                    {s.perdaPercentual && ` (${formatarDecimal(s.perdaPercentual, 2)}%)`}
                  </td>
                  <td className="py-1 pr-3 text-right">{L(s.engarrafado)}</td>
                  <td className="py-1 pr-3 text-right">{L(s.devolvidoGranel)}</td>
                  <td className="py-1 pr-3 text-right">{L(s.transferidoGranel)}</td>
                  <td className="py-1 pr-3 text-right">{L(s.emElaboracao)}</td>
                </tr>
              ))}
              {!c.safras.length && (
                <tr>
                  <td colSpan={10} className="py-2 text-muted-foreground">
                    Sem vinho a granel registrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Garrafas</p>
            <p>
              Em estoque: {c.garrafas.emEstoque} ({L(c.garrafas.litrosEmEstoque)})
            </p>
            <p>Devolvidas: {c.garrafas.devolvidas}</p>
            <p>Entregues por ordem do cliente: {c.garrafas.entreguesPorOrdem}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Transferências de titularidade</p>
            <p>
              Retido como pagamento: {L(c.transferencias.pagamentoLitros)}
              {garrafas(c.transferencias.pagamentoGarrafas)}
              {c.contrato?.pagamentoProdutoUnidade &&
                c.contrato.pagamentoProdutoValor &&
                ` · previsto ${formatarDecimal(c.contrato.pagamentoProdutoValor, 2)} ${UNIDADES_PAGAMENTO_PRODUTO[c.contrato.pagamentoProdutoUnidade]}`}
            </p>
            <p>
              Vendido à cantina ou a outros: {L(c.transferencias.vendidoLitros)}
              {garrafas(c.transferencias.vendidoGarrafas)}
            </p>
            <p>
              Recebido de outros: {L(c.transferencias.recebidoLitros)}
              {garrafas(c.transferencias.recebidoGarrafas)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Falta devolver</p>
            <p className="text-lg font-semibold">{L(c.faltaDevolverLitros)}</p>
            <p className="text-xs text-muted-foreground">em elaboração e em garrafas no estoque</p>
          </div>
        </div>
        {c.insumos.length > 0 && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Insumos do cliente</p>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3">Item</th>
                  <th className="py-1 pr-3 text-right">Recebido</th>
                  <th className="py-1 pr-3 text-right">Usado</th>
                  <th className="py-1 pr-3 text-right">Devolvido</th>
                  <th className="py-1 pr-3 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {c.insumos.map((i) => (
                  <tr key={i.item}>
                    <td className="py-1 pr-3">{i.item}</td>
                    {[i.recebido, i.usado, i.devolvido, i.saldo].map((v, n) => (
                      <td key={n} className="py-1 pr-3 text-right">
                        {formatarDecimal(v, 3)} {i.unidade}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CorpoCartao>
    </Cartao>
  );
}

export function PaginaContaCliente() {
  const [busca, setBusca] = useSearchParams();
  const titular = busca.get('titular') ?? '';
  const clientes = useQuery({
    queryKey: ['pessoas-opcoes', 'cliente_vinificacao'],
    queryFn: () =>
      api.get<Array<{ id: string; nome: string }>>('/api/pessoas/opcoes?papel=cliente_vinificacao'),
  });
  const contas = useQuery({
    queryKey: ['contas-clientes', titular],
    queryFn: () =>
      api.get<Conta[]>(`/api/terceiros/contas${titular ? `?titularId=${titular}` : ''}`),
  });
  return (
    <Pagina titulo="Conta do cliente" trilha={['EnoTrace', 'Terceiros']}>
      <p className="text-sm text-muted-foreground">
        Vinificação para terceiros: o que foi recebido, elaborado, guardado, devolvido e retido de
        cada cliente, por safra, com as perdas comparadas com a tolerada no contrato.
      </p>
      <Campo rotulo="Cliente" id="cc-cliente" className="max-w-sm">
        <Selecao
          id="cc-cliente"
          value={titular}
          onChange={(e) => setBusca(e.target.value ? { titular: e.target.value } : {})}
        >
          <option value="">Todos os clientes</option>
          {clientes.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Selecao>
      </Campo>
      {contas.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {contas.data && !contas.data.length && (
        <p className="text-sm text-muted-foreground">
          Nenhum cliente de vinificação com registros.
        </p>
      )}
      {contas.data?.map((c) => (
        <CartaoConta key={c.titularId} c={c} />
      ))}
    </Pagina>
  );
}
