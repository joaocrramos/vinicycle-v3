// EnoTrace › Livro de álcool etílico (cantina.md, Fermentação, chaptalização, álcool e atesto;
// Lei 7.678/1988, art. 29, §3º): entradas e usos do período, com os saldos; cada entrada pede a
// comunicação ao MAPA, registrada aqui (data e protocolo). Imprime e sai em CSV.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarDecimal, TIPOS_MOVIMENTO_ESTOQUE } from '@vinicycle/shared';
import { Download, Printer } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Botao } from '@/componentes/ui/botao';
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao';
import { Campo, Entrada } from '@/componentes/ui/campos';
import { Dialogo } from '@/componentes/ui/dialogo';
import { Pagina } from '@/layout/Estrutura';
import { api, ErroApi } from '@/lib/api';
import { baixarCsv } from '@/lib/csv';
import { fusoAtivo, pode, useSessao } from '@/lib/sessao';
import { formatarData, formatarDataHora } from '@/lib/utils';

interface Movimento {
  id: string;
  data: string;
  item: string;
  unidade: string;
  lote: string | null;
  quantidade: string;
  tipo: string;
  estornoDe: string | null;
  documento: string | null;
  emitente: string | null;
  operacaoId: string | null;
  operacao: string | null;
  motivo: string | null;
  estornado: boolean;
}
interface Livro {
  itens: Array<{ id: string; nome: string; unidade: string; inicial: string; final: string }>;
  entradas: Array<
    Movimento & { comunicar: boolean; comunicacao: { em: string; protocolo: string | null } | null }
  >;
  usos: Movimento[];
}

const Q = (v: string, u: string) => `${formatarDecimal(String(Math.abs(Number(v))), 3)} ${u}`;
const tipo = (m: Movimento) =>
  m.estornoDe
    ? `Estorno de ${TIPOS_MOVIMENTO_ESTOQUE[m.estornoDe as keyof typeof TIPOS_MOVIMENTO_ESTOQUE] ?? m.estornoDe}`
    : (TIPOS_MOVIMENTO_ESTOQUE[m.tipo as keyof typeof TIPOS_MOVIMENTO_ESTOQUE] ?? m.tipo);

export function PaginaAlcool() {
  const { data: s } = useSessao();
  const fuso = fusoAtivo(s);
  const qc = useQueryClient();
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(new Date());
  const [de, setDe] = useState(`${hoje.slice(0, 4)}-01-01`);
  const [ate, setAte] = useState(hoje);
  const [comunicando, setComunicando] = useState<Livro['entradas'][number] | null>(null);
  const q = useQuery({
    queryKey: ['alcool', de, ate],
    queryFn: () => api.get<Livro>(`/api/alcool?de=${de}&ate=${ate}`),
    enabled: !!de && !!ate,
  });
  const l = q.data;
  return (
    <Pagina
      titulo="Livro de álcool etílico"
      trilha={['EnoTrace']}
      acoes={
        <Botao variante="secundario" onClick={() => window.print()}>
          <Printer /> Imprimir
        </Botao>
      }
    >
      <p className="text-sm text-muted-foreground print:hidden">
        Entradas e usos do álcool etílico (os itens marcados &quot;é álcool etílico&quot; em Insumos
        e embalagens). Cada entrada é comunicada ao MAPA (Lei 7.678/1988, art. 29, §3º): registre
        aqui quando comunicou; até lá, fica o alerta no sino.
      </p>
      <div className="flex flex-wrap items-end gap-2 print:hidden">
        <Campo rotulo="De" id="alc-de">
          <Entrada id="alc-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </Campo>
        <Campo rotulo="Até" id="alc-ate">
          <Entrada id="alc-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </Campo>
      </div>
      {q.error && <Aviso tom="erro">{(q.error as Error).message}</Aviso>}
      {l && !l.itens.length && (
        <Aviso tom="info">
          Nenhum item marcado como álcool etílico. Marque em{' '}
          <Link className="underline" to="/enotrace/itens">
            Insumos e embalagens
          </Link>
          .
        </Aviso>
      )}
      {l && l.itens.length > 0 && (
        <>
          <Cartao>
            <CabecalhoCartao
              titulo="Saldos"
              descricao={`De ${formatarData(de)} a ${formatarData(ate)}.`}
            />
            <CorpoCartao className="text-sm">
              {l.itens.map((i) => (
                <p key={i.id}>
                  {i.nome}: {Q(i.inicial, i.unidade)} no início, {Q(i.final, i.unidade)} no fim.
                </p>
              ))}
            </CorpoCartao>
          </Cartao>
          <Cartao>
            <CabecalhoCartao
              titulo="Entradas"
              acoes={
                l.entradas.length > 0 && (
                  <Botao
                    variante="secundario"
                    className="print:hidden"
                    onClick={() =>
                      baixarCsv(`alcool-entradas-${de}-${ate}`, [
                        [
                          'Data',
                          'Item',
                          'Lote',
                          'Quantidade',
                          'Unidade',
                          'Documento',
                          'Fornecedor',
                          'Comunicada em',
                          'Protocolo',
                        ],
                        ...l.entradas.map((m) => [
                          m.data.slice(0, 10),
                          m.item,
                          m.lote,
                          m.quantidade,
                          m.unidade,
                          m.documento,
                          m.emitente,
                          m.comunicacao?.em,
                          m.comunicacao?.protocolo,
                        ]),
                      ])
                    }
                  >
                    <Download /> CSV
                  </Botao>
                )
              }
            />
            <CorpoCartao className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 pl-5 font-medium">Data</th>
                    <th className="py-2 pr-4 font-medium">Item · lote</th>
                    <th className="py-2 pr-4 text-right font-medium">Quantidade</th>
                    <th className="py-2 pr-4 font-medium">Documento</th>
                    <th className="py-2 pr-5 font-medium">Comunicação ao MAPA</th>
                  </tr>
                </thead>
                <tbody>
                  {l.entradas.map((m) => (
                    <tr key={m.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 pl-5 whitespace-nowrap">
                        {formatarDataHora(m.data, fuso)}
                      </td>
                      <td className="py-2 pr-4">
                        {m.item}
                        {m.lote && ` · ${m.lote}`}
                        {m.estornado && <span className="text-muted-foreground"> (estornada)</span>}
                      </td>
                      <td className="py-2 pr-4 text-right whitespace-nowrap">
                        {Q(m.quantidade, m.unidade)}
                      </td>
                      <td className="py-2 pr-4">
                        {m.documento ?? '—'}
                        {m.emitente && (
                          <span className="block text-xs text-muted-foreground">{m.emitente}</span>
                        )}
                      </td>
                      <td className="py-2 pr-5">
                        {m.comunicacao ? (
                          <Etiqueta tom="sucesso">
                            {formatarData(m.comunicacao.em)}
                            {m.comunicacao.protocolo && ` · ${m.comunicacao.protocolo}`}
                          </Etiqueta>
                        ) : m.comunicar ? (
                          pode(s, 'enotrace.estoque', 'confirmar') ? (
                            <Botao
                              variante="secundario"
                              className="print:hidden"
                              onClick={() => setComunicando(m)}
                            >
                              Registrar comunicação
                            </Botao>
                          ) : (
                            <Etiqueta tom="alerta">A comunicar</Etiqueta>
                          )
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                  {!l.entradas.length && (
                    <tr>
                      <td colSpan={5} className="px-5 py-4 text-center text-muted-foreground">
                        Nenhuma entrada no período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CorpoCartao>
          </Cartao>
          <Cartao>
            <CabecalhoCartao
              titulo="Usos e outras saídas"
              acoes={
                l.usos.length > 0 && (
                  <Botao
                    variante="secundario"
                    className="print:hidden"
                    onClick={() =>
                      baixarCsv(`alcool-usos-${de}-${ate}`, [
                        [
                          'Data',
                          'Item',
                          'Lote',
                          'Quantidade',
                          'Unidade',
                          'Tipo',
                          'Operação',
                          'Motivo',
                        ],
                        ...l.usos.map((m) => [
                          m.data.slice(0, 10),
                          m.item,
                          m.lote,
                          m.quantidade,
                          m.unidade,
                          tipo(m),
                          m.operacao,
                          m.motivo,
                        ]),
                      ])
                    }
                  >
                    <Download /> CSV
                  </Botao>
                )
              }
            />
            <CorpoCartao className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 pl-5 font-medium">Data</th>
                    <th className="py-2 pr-4 font-medium">Item · lote</th>
                    <th className="py-2 pr-4 text-right font-medium">Quantidade</th>
                    <th className="py-2 pr-5 font-medium">Uso</th>
                  </tr>
                </thead>
                <tbody>
                  {l.usos.map((m) => (
                    <tr key={m.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 pl-5 whitespace-nowrap">
                        {formatarDataHora(m.data, fuso)}
                      </td>
                      <td className="py-2 pr-4">
                        {m.item}
                        {m.lote && ` · ${m.lote}`}
                      </td>
                      <td className="py-2 pr-4 text-right whitespace-nowrap">
                        {Number(m.quantidade) < 0 ? '−' : '+'}
                        {Q(m.quantidade, m.unidade)}
                      </td>
                      <td className="py-2 pr-5">
                        {tipo(m)}
                        {m.operacaoId && (
                          <>
                            {' · '}
                            <Link className="underline" to={`/enotrace/operacoes/${m.operacaoId}`}>
                              {m.operacao}
                            </Link>
                          </>
                        )}
                        {m.motivo && <span className="text-muted-foreground"> · {m.motivo}</span>}
                      </td>
                    </tr>
                  ))}
                  {!l.usos.length && (
                    <tr>
                      <td colSpan={4} className="px-5 py-4 text-center text-muted-foreground">
                        Nenhum uso no período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CorpoCartao>
          </Cartao>
        </>
      )}
      <DialogoComunicacao
        entrada={comunicando}
        hoje={hoje}
        aoFechar={async (salvou) => {
          setComunicando(null);
          if (salvou) {
            await qc.invalidateQueries({ queryKey: ['alcool'] });
            await qc.invalidateQueries({ queryKey: ['alertas'] });
          }
        }}
      />
    </Pagina>
  );
}

function DialogoComunicacao({
  entrada,
  hoje,
  aoFechar,
}: {
  entrada: Livro['entradas'][number] | null;
  hoje: string;
  aoFechar: (salvou: boolean) => void;
}) {
  const [em, setEm] = useState(hoje);
  const [protocolo, setProtocolo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  return (
    <Dialogo
      aberto={!!entrada}
      aoMudar={(v) => !v && aoFechar(false)}
      titulo="Registrar a comunicação ao MAPA"
      descricao={
        entrada
          ? `${entrada.item}${entrada.lote ? ` · ${entrada.lote}` : ''}: ${Q(entrada.quantidade, entrada.unidade)}.`
          : undefined
      }
      rodape={
        <>
          <Botao variante="secundario" onClick={() => aoFechar(false)}>
            Cancelar
          </Botao>
          <Botao
            disabled={!em}
            onClick={async () => {
              setErro(null);
              try {
                await api.post(`/api/alcool/entradas/${entrada!.id}/comunicacao`, {
                  comunicadaEm: em,
                  protocolo: protocolo || null,
                });
                setProtocolo('');
                aoFechar(true);
              } catch (e) {
                setErro(e instanceof ErroApi ? e.message : (e as Error).message);
              }
            }}
          >
            Registrar
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Campo rotulo="Comunicada em" id="com-em">
          <Entrada
            id="com-em"
            type="date"
            max={hoje}
            value={em}
            onChange={(e) => setEm(e.target.value)}
          />
        </Campo>
        <Campo rotulo="Protocolo (opcional)" id="com-protocolo">
          <Entrada
            id="com-protocolo"
            value={protocolo}
            onChange={(e) => setProtocolo(e.target.value)}
          />
        </Campo>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </Dialogo>
  );
}
