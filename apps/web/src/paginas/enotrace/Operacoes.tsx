// EnoTrace › Operações: desengace e prensagem (cantina.md, Desengace, esmagamento e prensagem),
// com a prévia de cada recipiente antes e depois (cantina.md, Tela de registro em passos), o
// rascunho e o estorno (cantina.md, Regras comuns das operações) e a lista e a ficha das operações.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EMBALAGENS_GRANEL,
  formatarDecimal,
  MOTIVOS_TITULARIDADE,
  NOMES_SITUACAO_RECIPIENTE,
  TIPOS_ENTRADA_GRANEL,
  TIPOS_OPERACAO,
  TIPOS_SAIDA_GRANEL,
  type TipoOperacao,
} from '@vinicycle/shared';
import { Plus, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { BotaoIcone } from '@/componentes/AcoesLinha';
import { CampoNumero } from '@/componentes/campos-especiais';
import { TabelaDados } from '@/componentes/TabelaDados';
import { Botao } from '@/componentes/ui/botao';
import { ConteudoMenu, GatilhoMenu, ItemMenu, Menu } from '@/componentes/ui/menu';
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao';
import { AreaTexto, Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos';
import { Dialogo } from '@/componentes/ui/dialogo';
import { Pagina } from '@/layout/Estrutura';
import { api } from '@/lib/api';
import { nomeNaLista, useReferencia } from '@/lib/referencia';
import { fusoAtivo, pode, useSessao } from '@/lib/sessao';
import { formatarDataHora } from '@/lib/utils';
import { litros } from './Projetos';
import {
  F,
  TIPOS_LIGACAO,
  LETRAS,
  agora,
  doCampo,
  useRecipientes,
  useProjetos,
  useLotesDoProjeto,
  type RefLote,
  SeletorLote,
  type Rascunho,
  ComRascunho,
  useEnvio,
  Rodape,
  Cabecalho,
  Residuos,
} from './operacoes/comum';
import { CartaoInsumos, type InsumoLinha, insumosParaApi } from './operacoes/insumos';

interface UvaAProcessar {
  itemId: string;
  romaneio: string;
  chegadaEm: string;
  projetoId: string;
  projeto: string;
  variedade: string;
  safra: number;
  ciclo: string | null;
  brix: string | null;
  saldoKg: string;
}

function useUva() {
  return useQuery({
    queryKey: ['uva-a-processar'],
    queryFn: () => api.get<UvaAProcessar[]>('/api/romaneios/uva-a-processar'),
  });
}

function EscolhaUva({
  consumos,
  set,
}: {
  consumos: Record<string, string | null>;
  set: (c: Record<string, string | null>) => void;
}) {
  const { data: s } = useSessao();
  const uva = useUva();
  return (
    <Cartao>
      <CabecalhoCartao
        titulo="Uva a processar"
        descricao="De um ou mais romaneios. Pode processar só parte do peso."
      />
      <CorpoCartao className="flex flex-col gap-2">
        {uva.data?.map((u) => {
          const marcado = u.itemId in consumos;
          return (
            <div key={u.itemId} className="grid items-center gap-3 sm:grid-cols-[1fr_12rem]">
              <Caixa
                rotulo={`${u.romaneio} · ${u.variedade} ${u.safra}${u.ciclo ? `.${u.ciclo}` : ''} · ${formatarDecimal(u.saldoKg, 1)} kg a processar · ${formatarDataHora(u.chegadaEm, fusoAtivo(s))}`}
                checked={marcado}
                onChange={(e) => {
                  const novo = { ...consumos };
                  if (e.target.checked) novo[u.itemId] = u.saldoKg;
                  else delete novo[u.itemId];
                  set(novo);
                }}
              />
              {marcado && (
                <CampoNumero
                  aria-label={`kg de ${u.variedade}`}
                  casas={1}
                  unidade="kg"
                  valor={consumos[u.itemId]}
                  aoMudar={(v) => set({ ...consumos, [u.itemId]: v })}
                />
              )}
            </div>
          );
        })}
        {uva.data && !uva.data.length && (
          <p className="text-sm text-muted-foreground">
            Nenhuma uva a processar. Confirme a recepção em{' '}
            <Link className="underline" to="/enotrace/recepcao">
              Recepção da uva
            </Link>
            .
          </p>
        )}
      </CorpoCartao>
    </Cartao>
  );
}

// Desengace ------------------------------------------------------------------------------------

export function PaginaDesengace() {
  return <ComRascunho>{(r) => <Desengace rascunho={r} />}</ComRascunho>;
}

function Desengace({ rascunho }: { rascunho: Rascunho | null }) {
  const recipientes = useRecipientes();
  const projetos = useProjetos();
  const uva = useUva();
  const envio = useEnvio('desengace', rascunho);
  const [d, setD] = useState(() => ({
    executadoEm: agora(),
    projetoId: '',
    responsavelId: '',
    planoEtapaId: '',
    observacao: '',
    consumos: {} as Record<string, string | null>,
    destinos: [
      { recipienteId: '', lote: { novo: 'A' } as RefLote | null, litros: null as string | null },
    ],
    repartir: false,
    reparticao: {} as Record<string, string | null>, // `${item}|${recipiente}` → kg
    residuos: [] as Array<{ tipo: 'engaco' | 'bagaco'; kg: string | null; destino: string }>,
    insumos: [] as InsumoLinha[],
    localEstoqueId: '',
    ...rascunho?.formulario,
  }));
  const set = (p: Partial<typeof d>) => {
    envio.limpar();
    setD({ ...d, ...p });
  };
  const lotes = useLotesDoProjeto(d.projetoId);
  // O projeto sugerido é o da primeira uva escolhida.
  const projetoSugerido = uva.data?.find((u) => u.itemId in d.consumos)?.projetoId;
  const projetoId = d.projetoId || projetoSugerido || '';
  const corpo = () => ({
    executadoEm: doCampo(d.executadoEm),
    projetoId,
    responsavelId: d.responsavelId || null,
    planoEtapaId: d.planoEtapaId || null,
    observacao: d.observacao,
    consumos: Object.entries(d.consumos).map(([itemId, kg]) => ({ itemId, kg: kg ?? '0' })),
    destinos: d.destinos.map((x) => ({
      recipienteId: x.recipienteId,
      lote: x.lote,
      litros: x.litros,
    })),
    reparticao: d.repartir
      ? Object.entries(d.reparticao)
          .filter(([, kg]) => kg && Number(kg) > 0)
          .map(([k, kg]) => ({ itemId: k.split('|')[0], recipienteId: k.split('|')[1], kg }))
      : [],
    residuos: d.residuos.filter((r) => r.kg).map((r) => ({ ...r, destino: r.destino || null })),
    insumos: insumosParaApi(d.insumos),
    localEstoqueId: d.localEstoqueId || null,
  });
  const escolhidos = (uva.data ?? []).filter((u) => u.itemId in d.consumos);
  return (
    <Pagina titulo="Desengace / esmagamento" trilha={['EnoTrace', 'Operações']}>
      <p className="text-sm text-muted-foreground">
        A uva vai para os recipientes com litros estimados pelo rendimento padrão (Parâmetros
        técnicos) ou pela estimativa digitada. A prensagem mede o volume real.
      </p>
      <EscolhaUva consumos={d.consumos} set={(consumos) => set({ consumos })} />
      <Cartao>
        <CabecalhoCartao titulo="Operação" />
        <CorpoCartao className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Projeto" id="op-projeto" obrigatorio>
            <Selecao
              id="op-projeto"
              value={projetoId}
              onChange={(e) => set({ projetoId: e.target.value })}
            >
              <option value="">Escolha</option>
              {projetos.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} · {p.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Cabecalho d={d} set={set} projetoId={projetoId} tipo="desengace" />
        </CorpoCartao>
      </Cartao>
      <Cartao>
        <CabecalhoCartao
          titulo="Destinos"
          descricao="Litros vazios = calculados pelo rendimento padrão."
        />
        <CorpoCartao className="flex flex-col gap-3">
          {d.destinos.map((x, n) => {
            const r = recipientes.data?.find((y) => y.id === x.recipienteId);
            return (
              <div key={n} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_10rem_auto]">
                <Campo rotulo="Recipiente" id={`dst-rec-${n}`}>
                  <Selecao
                    id={`dst-rec-${n}`}
                    value={x.recipienteId}
                    onChange={(e) => {
                      const rr = recipientes.data?.find((y) => y.id === e.target.value);
                      set({
                        destinos: d.destinos.map((z, j) =>
                          j === n
                            ? {
                                ...z,
                                recipienteId: e.target.value,
                                lote: rr?.lote ? { id: rr.lote.id } : { novo: 'A' },
                              }
                            : z,
                        ),
                      });
                    }}
                  >
                    <option value="">Escolha</option>
                    {recipientes.data
                      ?.filter((y) => y.situacao !== 'inativo')
                      .map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.codigo} · {y.tipo} · {litros(y.volume)} de {litros(y.capacidadeLitros)}
                          {y.lote ? ` · ${y.lote.codigo}` : ''}
                        </option>
                      ))}
                  </Selecao>
                </Campo>
                <Campo rotulo="Lote" id={`dst-lote-${n}`}>
                  <SeletorLote
                    id={`dst-lote-${n}`}
                    recipiente={r}
                    lotes={lotes.data?.lotes ?? []}
                    valor={x.lote}
                    aoMudar={(lote) =>
                      set({ destinos: d.destinos.map((z, j) => (j === n ? { ...z, lote } : z)) })
                    }
                  />
                </Campo>
                <Campo rotulo="Litros estimados" id={`dst-l-${n}`}>
                  <CampoNumero
                    id={`dst-l-${n}`}
                    casas={2}
                    unidade="L"
                    valor={x.litros}
                    aoMudar={(v) =>
                      set({
                        destinos: d.destinos.map((z, j) => (j === n ? { ...z, litros: v } : z)),
                      })
                    }
                  />
                </Campo>
                <Botao
                  variante="fantasma"
                  tamanho="icone"
                  aria-label="Remover destino"
                  disabled={d.destinos.length === 1}
                  onClick={() => set({ destinos: d.destinos.filter((_, j) => j !== n) })}
                >
                  <Trash2 />
                </Botao>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-4">
            <Botao
              variante="secundario"
              tamanho="pequeno"
              onClick={() =>
                set({
                  destinos: [
                    ...d.destinos,
                    {
                      recipienteId: '',
                      lote: { novo: LETRAS[d.destinos.length] ?? 'E' },
                      litros: null,
                    },
                  ],
                })
              }
            >
              <Plus /> Recipiente
            </Botao>
            {d.destinos.length > 1 && (
              <Caixa
                rotulo="Repartir a uva por item"
                checked={d.repartir}
                onChange={(e) => set({ repartir: e.target.checked })}
              />
            )}
          </div>
          {d.repartir && d.destinos.length > 1 && (
            <div className="overflow-x-auto">
              <table className="text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Uva</th>
                    {d.destinos.map((x, n) => (
                      <th key={n} className="py-2 pr-3 font-medium">
                        {recipientes.data?.find((y) => y.id === x.recipienteId)?.codigo ??
                          `Destino ${n + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {escolhidos.map((u) => (
                    <tr key={u.itemId}>
                      <td className="py-1 pr-3">
                        {u.variedade} ({formatarDecimal(d.consumos[u.itemId] ?? '0', 1)} kg)
                      </td>
                      {d.destinos.map((x, n) => (
                        <td key={n} className="py-1 pr-3">
                          <CampoNumero
                            aria-label={`kg de ${u.variedade} no destino ${n + 1}`}
                            className="w-36"
                            casas={1}
                            unidade="kg"
                            valor={d.reparticao[`${u.itemId}|${x.recipienteId}`] ?? null}
                            aoMudar={(v) =>
                              set({
                                reparticao: {
                                  ...d.reparticao,
                                  [`${u.itemId}|${x.recipienteId}`]: v,
                                },
                              })
                            }
                          />
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
      <CartaoInsumos
        insumos={d.insumos}
        set={(insumos) => set({ insumos })}
        recipientes={d.destinos.flatMap((x) => {
          const r = recipientes.data?.find((y) => y.id === x.recipienteId);
          return r ? [{ id: r.id, codigo: r.codigo }] : [];
        })}
        rotuloTodos="Todos os destinos"
        localEstoqueId={d.localEstoqueId}
        setLocal={(localEstoqueId) => set({ localEstoqueId })}
      />
      <Residuos residuos={d.residuos} set={(residuos) => set({ residuos })} />
      <Rodape envio={envio} corpo={corpo} formulario={() => ({ ...d, projetoId })} />
    </Pagina>
  );
}

// Prensagem ------------------------------------------------------------------------------------

export function PaginaPrensagem() {
  return <ComRascunho>{(r) => <Prensagem rascunho={r} />}</ComRascunho>;
}

function Prensagem({ rascunho }: { rascunho: Rascunho | null }) {
  const recipientes = useRecipientes();
  const projetos = useProjetos();
  const { data: ref } = useReferencia();
  const envio = useEnvio('prensagem', rascunho);
  const [d, setD] = useState(() => ({
    modo: 'massa' as 'massa' | 'direta',
    executadoEm: agora(),
    origemRecipienteId: '',
    projetoId: '',
    responsavelId: '',
    planoEtapaId: '',
    observacao: '',
    consumos: {} as Record<string, string | null>,
    fracoes: [
      {
        fracao: 'flor',
        litros: null as string | null,
        recipienteId: '',
        lote: null as RefLote | null,
      },
    ],
    residuos: [] as Array<{ tipo: 'engaco' | 'bagaco'; kg: string | null; destino: string }>,
    ...rascunho?.formulario,
  }));
  const set = (p: Partial<typeof d>) => {
    envio.limpar();
    setD({ ...d, ...p });
  };
  const origem = recipientes.data?.find((r) => r.id === d.origemRecipienteId);
  // Na prensagem da massa, o projeto é o do lote que está no recipiente.
  const projetoId = d.modo === 'massa' ? (origem?.lote?.projetoId ?? '') : d.projetoId;
  const lotes = useLotesDoProjeto(projetoId);
  const total = d.fracoes.reduce((t, f) => t + Number(f.litros ?? 0), 0);
  const corpo = () => ({
    executadoEm: doCampo(d.executadoEm),
    origemRecipienteId: d.modo === 'massa' ? d.origemRecipienteId : null,
    projetoId: d.modo === 'direta' ? d.projetoId : null,
    responsavelId: d.responsavelId || null,
    planoEtapaId: d.planoEtapaId || null,
    observacao: d.observacao,
    consumos:
      d.modo === 'direta'
        ? Object.entries(d.consumos).map(([itemId, kg]) => ({ itemId, kg: kg ?? '0' }))
        : [],
    fracoes: d.fracoes.map((f) => ({ ...f, litros: f.litros ?? '0' })),
    residuos: d.residuos.filter((r) => r.kg).map((r) => ({ ...r, destino: r.destino || null })),
  });
  return (
    <Pagina titulo="Prensagem" trilha={['EnoTrace', 'Operações']}>
      <p className="text-sm text-muted-foreground">
        O volume medido substitui a estimativa do desengace, e o sistema calcula o rendimento real
        (L/kg).
      </p>
      <Cartao>
        <CabecalhoCartao titulo="O que é prensado" />
        <CorpoCartao className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Prensagem" id="pr-modo">
            <Selecao
              id="pr-modo"
              value={d.modo}
              onChange={(e) => set({ modo: e.target.value as 'massa' | 'direta' })}
            >
              <option value="massa">Massa de um recipiente (depois da maceração)</option>
              <option value="direta">Direta da uva (cacho inteiro)</option>
            </Selecao>
          </Campo>
          {d.modo === 'massa' ? (
            <Campo rotulo="Recipiente com a massa" id="pr-origem" obrigatorio>
              <Selecao
                id="pr-origem"
                value={d.origemRecipienteId}
                onChange={(e) => set({ origemRecipienteId: e.target.value })}
              >
                <option value="">Escolha</option>
                {recipientes.data
                  ?.filter((r) => r.lote)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.codigo} · {r.lote!.codigo} · {litros(r.volume)} estimados
                    </option>
                  ))}
              </Selecao>
            </Campo>
          ) : (
            <Campo rotulo="Projeto" id="pr-projeto" obrigatorio>
              <Selecao
                id="pr-projeto"
                value={d.projetoId}
                onChange={(e) => set({ projetoId: e.target.value })}
              >
                <option value="">Escolha</option>
                {projetos.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo} · {p.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
          )}
          <Cabecalho d={d} set={set} projetoId={projetoId} tipo="prensagem" />
        </CorpoCartao>
      </Cartao>
      {d.modo === 'direta' && (
        <EscolhaUva consumos={d.consumos} set={(consumos) => set({ consumos })} />
      )}
      <Cartao>
        <CabecalhoCartao
          titulo="Frações"
          descricao={`Total medido: ${litros(total.toFixed(2))}${origem ? ` (estimado: ${litros(origem.volume)})` : ''}`}
        />
        <CorpoCartao className="flex flex-col gap-3">
          {d.fracoes.map((f, n) => {
            const r = recipientes.data?.find((y) => y.id === f.recipienteId);
            const noProprio = d.modo === 'massa' && f.recipienteId === d.origemRecipienteId;
            return (
              <div key={n} className="grid items-end gap-2 sm:grid-cols-[10rem_10rem_1fr_1fr_auto]">
                <Campo rotulo="Fração" id={`fr-tipo-${n}`}>
                  <Selecao
                    id={`fr-tipo-${n}`}
                    value={f.fracao}
                    onChange={(e) =>
                      set({
                        fracoes: d.fracoes.map((x, j) =>
                          j === n ? { ...x, fracao: e.target.value } : x,
                        ),
                      })
                    }
                  >
                    {(ref?.listas.fracao_prensa ?? []).map((o) => (
                      <option key={o.codigo} value={o.codigo}>
                        {o.nome}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
                <Campo rotulo="Litros medidos" id={`fr-l-${n}`}>
                  <CampoNumero
                    id={`fr-l-${n}`}
                    casas={2}
                    unidade="L"
                    valor={f.litros}
                    aoMudar={(v) =>
                      set({ fracoes: d.fracoes.map((x, j) => (j === n ? { ...x, litros: v } : x)) })
                    }
                  />
                </Campo>
                <Campo rotulo="Destino" id={`fr-rec-${n}`}>
                  <Selecao
                    id={`fr-rec-${n}`}
                    value={f.recipienteId}
                    onChange={(e) =>
                      set({
                        fracoes: d.fracoes.map((x, j) =>
                          j === n
                            ? {
                                ...x,
                                recipienteId: e.target.value,
                                lote: d.modo === 'massa' ? null : { novo: 'A' },
                              }
                            : x,
                        ),
                      })
                    }
                  >
                    <option value="">Escolha</option>
                    {recipientes.data
                      ?.filter((y) => y.situacao !== 'inativo')
                      .map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.codigo} · {litros(y.volume)} de {litros(y.capacidadeLitros)}
                          {y.lote ? ` · ${y.lote.codigo}` : ''}
                        </option>
                      ))}
                  </Selecao>
                </Campo>
                <Campo rotulo="Lote" id={`fr-lote-${n}`}>
                  {noProprio ? (
                    <Entrada
                      id={`fr-lote-${n}`}
                      disabled
                      value={`Mesmo lote ${origem?.lote?.codigo ?? ''}`}
                    />
                  ) : (
                    <SeletorLote
                      id={`fr-lote-${n}`}
                      recipiente={r}
                      lotes={lotes.data?.lotes ?? []}
                      valor={f.lote}
                      permitirMesmo={
                        d.modo === 'massa'
                          ? `Mesmo lote ${origem?.lote?.codigo ?? 'da massa'}`
                          : undefined
                      }
                      aoMudar={(lote) =>
                        set({ fracoes: d.fracoes.map((x, j) => (j === n ? { ...x, lote } : x)) })
                      }
                    />
                  )}
                </Campo>
                <Botao
                  variante="fantasma"
                  tamanho="icone"
                  aria-label="Remover fração"
                  disabled={d.fracoes.length === 1}
                  onClick={() => set({ fracoes: d.fracoes.filter((_, j) => j !== n) })}
                >
                  <Trash2 />
                </Botao>
              </div>
            );
          })}
          <div>
            <Botao
              variante="secundario"
              tamanho="pequeno"
              onClick={() =>
                set({
                  fracoes: [
                    ...d.fracoes,
                    {
                      fracao: 'prensa_1',
                      litros: null,
                      recipienteId: '',
                      lote: d.modo === 'massa' ? null : { novo: 'A' },
                    },
                  ],
                })
              }
            >
              <Plus /> Fração
            </Botao>
          </div>
        </CorpoCartao>
      </Cartao>
      <Residuos residuos={d.residuos} set={(residuos) => set({ residuos })} />
      <Rodape envio={envio} corpo={corpo} formulario={() => ({ ...d, projetoId })} />
    </Pagina>
  );
}

// Lista e ficha --------------------------------------------------------------------------------

interface LinhaOperacao {
  id: string;
  codigo: string | null;
  tipo: TipoOperacao;
  situacao: 'rascunho' | 'confirmada' | 'estornada';
  executadoEm: string;
  lancadoEm: string | null;
  atualizadoEm: string;
  estornoDe: string | null;
  projeto: string | null;
  recipientes: string[];
  lotes: string[];
  kg: string | null;
}

/** Tipos com tela de registro: o rascunho abre de volta nela. */
const COM_TELA: Partial<Record<TipoOperacao, string>> = {
  desengace: '/enotrace/operacoes/desengace',
  prensagem: '/enotrace/operacoes/prensagem',
  trasfega: '/enotrace/operacoes/trasfega',
  corte: '/enotrace/operacoes/corte',
  atesto: '/enotrace/operacoes/atesto',
  adicao_insumo: '/enotrace/operacoes/adicao_insumo',
  chaptalizacao: '/enotrace/operacoes/chaptalizacao',
  tratamento: '/enotrace/operacoes/tratamento',
  perda: '/enotrace/operacoes/perda',
  higienizacao: '/enotrace/operacoes/higienizacao',
  entrada_granel: '/enotrace/operacoes/entrada_granel',
  saida_granel: '/enotrace/operacoes/saida_granel',
  titularidade: '/enotrace/operacoes/titularidade',
};

export function ListaOperacoes() {
  const navegar = useNavigate();
  const { data: s } = useSessao();
  const fuso = fusoAtivo(s);
  return (
    <Pagina
      titulo="Operações"
      trilha={['EnoTrace']}
      acoes={
        pode(s, F, 'criar') && (
          <Menu>
            <GatilhoMenu asChild>
              <Botao>
                <Plus /> Nova operação
              </Botao>
            </GatilhoMenu>
            <ConteudoMenu>
              {Object.entries(COM_TELA).map(([tipo, caminho]) => (
                <ItemMenu key={tipo} onSelect={() => navegar(caminho)}>
                  {TIPOS_OPERACAO[tipo as TipoOperacao]}
                </ItemMenu>
              ))}
            </ConteudoMenu>
          </Menu>
        )
      }
    >
      <TabelaDados<LinhaOperacao>
        tabela="operacoes"
        url="/api/operacoes"
        ordemPadrao={{ campo: 'executadoEm', direcao: 'desc' }}
        filtrosIniciais={{ situacao: 'lancadas' }}
        filtros={(f, definir) => (
          <Selecao
            aria-label="Situação"
            className="w-44"
            value={f.situacao ?? 'lancadas'}
            onChange={(e) => definir('situacao', e.target.value)}
          >
            <option value="lancadas">Lançadas</option>
            <option value="rascunho">Rascunhos</option>
          </Selecao>
        )}
        aoClicar={(o) =>
          navegar(
            o.situacao === 'rascunho' && COM_TELA[o.tipo]
              ? `${COM_TELA[o.tipo]}?rascunho=${o.id}`
              : `/enotrace/operacoes/${o.id}`,
          )
        }
        podeExportar={pode(s, F, 'exportar')}
        colunas={[
          {
            id: 'codigo',
            titulo: 'Código',
            ordenavel: true,
            celula: (o) =>
              o.codigo ? (
                <span className="flex flex-wrap items-center gap-2">
                  <strong className={o.situacao === 'estornada' ? 'line-through' : ''}>
                    {o.codigo}
                  </strong>
                  {o.situacao === 'estornada' && <Etiqueta tom="erro">Estornada</Etiqueta>}
                </span>
              ) : (
                <Etiqueta tom="alerta">Rascunho</Etiqueta>
              ),
            exportar: (o) => o.codigo,
          },
          {
            id: 'tipo',
            titulo: 'Operação',
            ordenavel: true,
            celula: (o) => (o.estornoDe ? `Estorno de ${o.estornoDe}` : TIPOS_OPERACAO[o.tipo]),
            exportar: (o) => (o.estornoDe ? `Estorno de ${o.estornoDe}` : TIPOS_OPERACAO[o.tipo]),
          },
          {
            id: 'executadoEm',
            titulo: 'Execução',
            ordenavel: true,
            celula: (o) => (
              <span>
                {formatarDataHora(o.executadoEm, fuso)}
                <span className="block text-xs text-muted-foreground">
                  {o.lancadoEm
                    ? `lançada ${formatarDataHora(o.lancadoEm, fuso)}`
                    : `salvo ${formatarDataHora(o.atualizadoEm, fuso)}`}
                </span>
              </span>
            ),
            exportar: (o) => o.executadoEm,
          },
          {
            id: 'projeto',
            titulo: 'Projeto',
            celula: (o) => o.projeto ?? '—',
            exportar: (o) => o.projeto,
          },
          {
            id: 'recipientes',
            titulo: 'Recipientes',
            celula: (o) => o.recipientes.join(', '),
            exportar: (o) => o.recipientes.join(', '),
          },
          {
            id: 'lotes',
            titulo: 'Lotes',
            celula: (o) => o.lotes.join(', '),
            exportar: (o) => o.lotes.join(', '),
          },
          {
            id: 'kg',
            titulo: 'Uva',
            className: 'text-right',
            celula: (o) => (o.kg ? `${formatarDecimal(o.kg, 1)} kg` : '—'),
            exportar: (o) => o.kg,
          },
        ]}
      />
    </Pagina>
  );
}

interface Operacao {
  id: string;
  codigo: string;
  tipo: TipoOperacao;
  nomeTipo: string;
  situacao: 'rascunho' | 'confirmada' | 'estornada';
  executadoEm: string;
  lancadoEm: string;
  projetoId: string | null;
  projeto: string | null;
  responsavel: string | null;
  observacao: string | null;
  motivo: string | null;
  eCorte: boolean;
  dados: Record<string, unknown> | null;
  estornadaPor: {
    id: string;
    codigo: string;
    lancadoEm: string;
    motivo: string;
    por: string | null;
  } | null;
  estornoDe: { id: string; codigo: string; nomeTipo: string } | null;
  movimentos: Array<{
    recipiente: string;
    lote: string;
    litros: string;
    nomeTipo: string;
    estimado: boolean;
  }>;
  uva: Array<{
    romaneio: string;
    variedade: string;
    kg: string;
    recipiente: string;
    lote: string;
    litros: string;
  }>;
  genealogia: Array<{ origem: string; destino: string; litros: string; tipo: string }>;
  residuos: Array<{ tipo: string; kg: string; destino: string | null }>;
  ocorrencias: Array<{ mensagem: string; cienteEm: string }>;
  insumos: Array<{
    recipiente: string;
    lote: string;
    item: string | null;
    descricao: string | null;
    loteItem: string | null;
    dose: string;
    unidade: string;
    volumeTratado: string;
    quantidade: string | null;
    unidadeItem: string | null;
    so2: string | null;
  }>;
  chaptalizacao: {
    acucarKg: string;
    gramasPorLitro: string;
    ganhoEstimado: string;
  } | null;
  parametros: Array<{ nome: string; unidade: string | null; valor: string }>;
  higienizacao: Array<{
    recipiente: string;
    recipienteId: string;
    tipo: 'higienizacao' | 'manutencao';
    produto: string | null;
    dose: string | null;
    situacaoAnterior: keyof typeof NOMES_SITUACAO_RECIPIENTE;
  }>;
  granel: Granel | null;
  titularidade: null | {
    motivo: keyof typeof MOTIVOS_TITULARIDADE;
    de: string | null;
    para: string | null;
    contratoId: string | null;
    contrato: string | null;
    litros: string;
  };
}

interface Granel {
  sentido: 'entrada' | 'saida';
  tipo: string;
  notaNumero: string | null;
  notaChave: string | null;
  remetente: string | null;
  destinatario: string | null;
  transportador: string | null;
  glt: string | null;
  embalagem: keyof typeof EMBALAGENS_GRANEL | null;
  recebimentoConfirmadoEm: string | null;
}

/** Nota, partes, GLT e o recebimento confirmado (cantina.md, Granel e GLT). */
function CartaoGranel({ id, g, confirmada }: { id: string; g: Granel; confirmada: boolean }) {
  const { data: s } = useSessao();
  const qc = useQueryClient();
  const [data, setData] = useState(g.recebimentoConfirmadoEm ?? '');
  const [glt, setGlt] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const tipos: Record<string, string> = { ...TIPOS_ENTRADA_GRANEL, ...TIPOS_SAIDA_GRANEL };
  const linhas: Array<[string, string | null]> = [
    ['Tipo', tipos[g.tipo] ?? g.tipo],
    [
      g.sentido === 'entrada' ? 'Remetente' : 'Destinatário',
      g.sentido === 'entrada' ? g.remetente : g.destinatario,
    ],
    ['Transportador', g.transportador],
    ['Nota', [g.notaNumero, g.notaChave].filter(Boolean).join(' · ') || null],
    ['GLT', g.glt],
    ['Embalagem', g.embalagem ? EMBALAGENS_GRANEL[g.embalagem] : null],
  ];
  const salvar = async (valor: string | null) => {
    setErro(null);
    try {
      await api.post(`/api/operacoes/${id}/recebimento`, { recebimentoConfirmadoEm: valor });
      await qc.invalidateQueries({ queryKey: ['operacao', id] });
    } catch (e) {
      setErro((e as Error).message);
    }
  };
  return (
    <Cartao>
      <CabecalhoCartao titulo={g.sentido === 'entrada' ? 'Entrada de granel' : 'Saída de granel'} />
      <CorpoCartao className="flex flex-col gap-3 text-sm">
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[10rem_1fr]">
          {linhas.map(([rotulo, valor]) => (
            <div key={rotulo} className="contents">
              <dt className="text-muted-foreground">{rotulo}</dt>
              <dd>{valor || '—'}</dd>
            </div>
          ))}
        </dl>
        {g.sentido === 'saida' && !g.glt && (
          <Aviso tom="alerta">
            Saída sem GLT informada (Decreto 12.709/2025, art. 203, IV).
            {confirmada && pode(s, F, 'editar') && (
              <span className="mt-2 flex flex-wrap items-end gap-2">
                <Entrada
                  aria-label="Número da GLT"
                  className="w-48"
                  value={glt}
                  onChange={(e) => setGlt(e.target.value)}
                />
                <Botao
                  variante="secundario"
                  tamanho="pequeno"
                  disabled={!glt.trim()}
                  onClick={async () => {
                    setErro(null);
                    try {
                      await api.post(`/api/operacoes/${id}/glt`, { glt });
                      await qc.invalidateQueries({ queryKey: ['operacao', id] });
                      await qc.invalidateQueries({ queryKey: ['alertas-resumo'] });
                    } catch (e) {
                      setErro((e as Error).message);
                    }
                  }}
                >
                  Informar GLT
                </Botao>
              </span>
            )}
          </Aviso>
        )}
        {g.sentido === 'entrada' && (
          <div className="flex flex-wrap items-end gap-2 border-t pt-3">
            {g.recebimentoConfirmadoEm ? (
              <p>
                Recebimento confirmado em {g.recebimentoConfirmadoEm.split('-').reverse().join('/')}
                .
              </p>
            ) : (
              <p className="text-muted-foreground">Recebimento ainda não confirmado na GLT.</p>
            )}
            {confirmada && pode(s, F, 'editar') && (
              <>
                <Entrada
                  type="date"
                  aria-label="Data do recebimento"
                  className="w-44"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
                <Botao
                  variante="secundario"
                  tamanho="pequeno"
                  disabled={!data}
                  onClick={() => salvar(data)}
                >
                  Confirmar recebimento
                </Botao>
                {g.recebimentoConfirmadoEm && (
                  <Botao
                    variante="fantasma"
                    tamanho="pequeno"
                    onClick={() => {
                      setData('');
                      void salvar(null);
                    }}
                  >
                    Desmarcar
                  </Botao>
                )}
              </>
            )}
          </div>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </CorpoCartao>
    </Cartao>
  );
}

interface PreviaEstorno {
  codigo: string;
  recipientes: Array<{ recipienteId: string; recipiente: string; antes: string; depois: string }>;
  dependentes: Array<{ id: string; codigo: string; tipo: TipoOperacao; executadoEm: string }>;
  bloqueios: string[];
}

/**
 * Estorno (03-modelo-de-dados.md, 4.5): mostra antes as operações posteriores que precisam ser
 * estornadas e os volumes que voltam; os lançamentos inversos levam a data original (P13).
 */
function DialogoEstorno({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const qc = useQueryClient();
  const { data: s } = useSessao();
  const fuso = fusoAtivo(s);
  const q = useQuery({
    queryKey: ['estorno', id],
    queryFn: () => api.get<PreviaEstorno>(`/api/operacoes/${id}/estorno`),
  });
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const p = q.data;
  const bloqueado = !p || p.bloqueios.length > 0;
  return (
    <Dialogo
      aberto
      largo
      aoMudar={(v) => !v && aoFechar()}
      titulo={`Estornar ${p?.codigo ?? 'a operação'}`}
      descricao="Os lançamentos inversos levam a data da execução original. A operação continua no histórico, marcada como estornada."
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          {!bloqueado && (
            <Botao
              variante="perigo"
              disabled={enviando}
              onClick={async () => {
                if (motivo.trim().length < 3) return setErro('Informe o motivo.');
                setEnviando(true);
                setErro(null);
                try {
                  await api.post(`/api/operacoes/${id}/estorno`, { motivo: motivo.trim() });
                  await Promise.all(
                    [['operacao', id], ['lista'], ['recipientes-saldo'], ['uva-a-processar']].map(
                      (queryKey) => qc.invalidateQueries({ queryKey }),
                    ),
                  );
                  aoFechar();
                } catch (e) {
                  setErro((e as Error).message);
                  await q.refetch();
                } finally {
                  setEnviando(false);
                }
              }}
            >
              Estornar
            </Botao>
          )}
        </>
      }
    >
      {!p ? (
        <p className="text-sm text-muted-foreground">
          {q.isError ? (q.error as Error).message : 'Carregando…'}
        </p>
      ) : (
        <div className="flex flex-col gap-4 text-sm">
          {p.dependentes.length > 0 && (
            <Aviso tom="erro">
              Antes, estorne as operações posteriores que usaram os mesmos recipientes ou lotes, da
              mais nova para a mais antiga:
              <ul className="mt-2 flex flex-col gap-1">
                {p.dependentes.map((d) => (
                  <li key={d.id}>
                    <Link
                      className="underline"
                      to={`/enotrace/operacoes/${d.id}`}
                      onClick={aoFechar}
                    >
                      {d.codigo}
                    </Link>{' '}
                    · {TIPOS_OPERACAO[d.tipo]} · {formatarDataHora(d.executadoEm, fuso)}
                  </li>
                ))}
              </ul>
            </Aviso>
          )}
          {!p.dependentes.length &&
            p.bloqueios.map((b) => (
              <Aviso key={b} tom="erro">
                {b}
              </Aviso>
            ))}
          {p.recipientes.length > 0 && !p.dependentes.length && (
            <table className="w-full">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 font-medium">Recipiente</th>
                  <th className="py-1 text-right font-medium">Agora</th>
                  <th className="py-1 text-right font-medium">Depois do estorno</th>
                </tr>
              </thead>
              <tbody>
                {p.recipientes.map((r) => (
                  <tr key={r.recipienteId}>
                    <td className="py-1">{r.recipiente}</td>
                    <td className="py-1 text-right">{litros(r.antes)}</td>
                    <td className="py-1 text-right">{litros(r.depois)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!bloqueado && (
            <Campo rotulo="Motivo" id="estorno-motivo" obrigatorio erro={erro ?? undefined}>
              <AreaTexto
                id="estorno-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                autoFocus
              />
            </Campo>
          )}
          {bloqueado && erro && <Aviso tom="erro">{erro}</Aviso>}
        </div>
      )}
    </Dialogo>
  );
}

export function FichaOperacao() {
  const { id = '' } = useParams();
  const { data: s } = useSessao();
  const fuso = fusoAtivo(s);
  const [estornando, setEstornando] = useState(false);
  const { data: ref } = useReferencia();
  const q = useQuery({
    queryKey: ['operacao', id],
    queryFn: () => api.get<Operacao>(`/api/operacoes/${id}`),
  });
  if (!q.data)
    return (
      <p className="text-sm text-muted-foreground">
        {q.isError ? (q.error as Error).message : 'Carregando…'}
      </p>
    );
  const o = q.data;
  if (o.situacao === 'rascunho' && COM_TELA[o.tipo])
    return <Navigate to={`${COM_TELA[o.tipo]}?rascunho=${o.id}`} replace />;
  const podeEstornar =
    o.situacao === 'confirmada' && o.tipo !== 'estorno' && pode(s, F, 'estornar');
  return (
    <Pagina
      titulo={`${o.codigo} · ${o.estornoDe ? `Estorno de ${o.estornoDe.codigo}` : o.nomeTipo}`}
      trilha={['EnoTrace', 'Operações']}
      acoes={
        podeEstornar && (
          <BotaoIcone rotulo="Estornar a operação" contorno aoClicar={() => setEstornando(true)}>
            <Undo2 />
          </BotaoIcone>
        )
      }
    >
      <p className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        {o.situacao === 'estornada' ? (
          <Etiqueta tom="erro">Estornada</Etiqueta>
        ) : (
          <Etiqueta tom="sucesso">Confirmada</Etiqueta>
        )}
        {o.eCorte && <Etiqueta tom="primario">Corte</Etiqueta>}
        <span>execução {formatarDataHora(o.executadoEm, fuso)}</span>
        <span>· lançada {formatarDataHora(o.lancadoEm, fuso)}</span>
        {o.responsavel && <span>· responsável {o.responsavel}</span>}
        {o.projeto && o.projetoId && (
          <span>
            ·{' '}
            <Link className="underline" to={`/enotrace/projetos/${o.projetoId}`}>
              {o.projeto}
            </Link>
          </span>
        )}
      </p>
      {o.estornadaPor && (
        <Aviso tom="erro">
          Estornada por{' '}
          <Link className="underline" to={`/enotrace/operacoes/${o.estornadaPor.id}`}>
            {o.estornadaPor.codigo}
          </Link>{' '}
          em {formatarDataHora(o.estornadaPor.lancadoEm, fuso)}
          {o.estornadaPor.por && `, por ${o.estornadaPor.por}`}. Motivo: {o.estornadaPor.motivo}
        </Aviso>
      )}
      {o.estornoDe && (
        <Aviso tom="info">
          Estorno de{' '}
          <Link className="underline" to={`/enotrace/operacoes/${o.estornoDe.id}`}>
            {o.estornoDe.codigo}
          </Link>{' '}
          ({o.estornoDe.nomeTipo}), com a data da execução original. Motivo: {o.motivo}
        </Aviso>
      )}
      {estornando && <DialogoEstorno id={o.id} aoFechar={() => setEstornando(false)} />}
      {o.ocorrencias.map((x) => (
        <Aviso key={x.mensagem} tom="alerta">
          {x.mensagem} Ciente em {formatarDataHora(x.cienteEm, fuso)}.
        </Aviso>
      ))}
      {o.movimentos.length > 0 && (
        <Cartao>
          <CabecalhoCartao
            titulo="Livro de volumes"
            descricao="O volume dos recipientes é a soma destes lançamentos."
          />
          <CorpoCartao>
            <ul className="flex flex-col gap-1 text-sm">
              {o.movimentos.map((m, n) => (
                <li key={n}>
                  <strong>{m.recipiente}</strong> · lote {m.lote} · {m.nomeTipo}:{' '}
                  <span className={Number(m.litros) < 0 ? 'text-destructive' : ''}>
                    {litros(m.litros)}
                  </span>
                  {m.estimado && <Etiqueta className="ml-2">estimado</Etiqueta>}
                </li>
              ))}
            </ul>
          </CorpoCartao>
        </Cartao>
      )}
      {o.uva.length > 0 && (
        <Cartao>
          <CabecalhoCartao titulo="Uva processada" />
          <CorpoCartao>
            <ul className="flex flex-col gap-1 text-sm">
              {o.uva.map((u, n) => (
                <li key={n}>
                  {u.romaneio} · {u.variedade}: {formatarDecimal(u.kg, 1)} kg → {u.recipiente} (lote{' '}
                  {u.lote}), {litros(u.litros)}
                </li>
              ))}
            </ul>
          </CorpoCartao>
        </Cartao>
      )}
      {o.insumos.length > 0 && (
        <Cartao>
          <CabecalhoCartao titulo="Insumos" />
          <CorpoCartao>
            <ul className="flex flex-col gap-1 text-sm">
              {o.insumos.map((i, n) => (
                <li key={n}>
                  <strong>{i.recipiente}</strong> · {i.item ?? `${i.descricao} (não estocado)`}
                  {i.loteItem && ` · lote ${i.loteItem}`}: {formatarDecimal(i.dose, 2)} {i.unidade}{' '}
                  em {litros(i.volumeTratado)}
                  {i.quantidade && ` = ${formatarDecimal(i.quantidade, 3)} ${i.unidadeItem}`}
                  {i.so2 && ` · SO₂ +${formatarDecimal(i.so2, 1)} mg/L`}
                </li>
              ))}
            </ul>
          </CorpoCartao>
        </Cartao>
      )}
      {o.chaptalizacao && (
        <Cartao>
          <CabecalhoCartao titulo="Chaptalização" />
          <CorpoCartao className="text-sm">
            {formatarDecimal(o.chaptalizacao.acucarKg, 3)} kg de açúcar,{' '}
            {formatarDecimal(o.chaptalizacao.gramasPorLitro, 2)} g/L: ganho estimado de{' '}
            {formatarDecimal(o.chaptalizacao.ganhoEstimado, 2)}% vol.
          </CorpoCartao>
        </Cartao>
      )}
      {o.granel && <CartaoGranel id={o.id} g={o.granel} confirmada={o.situacao === 'confirmada'} />}
      {o.titularidade && (
        <Cartao>
          <CabecalhoCartao titulo="Transferência de titularidade" />
          <CorpoCartao className="grid gap-1 text-sm sm:grid-cols-2">
            <span>De: {o.titularidade.de ?? 'própria empresa'}</span>
            <span>Para: {o.titularidade.para ?? 'própria empresa'}</span>
            <span>Motivo: {MOTIVOS_TITULARIDADE[o.titularidade.motivo]}</span>
            <span>Litros: {formatarDecimal(o.titularidade.litros, 2)} L</span>
            {o.titularidade.contratoId && (
              <span>
                Contrato:{' '}
                <Link className="underline" to={`/enotrace/contratos/${o.titularidade.contratoId}`}>
                  {o.titularidade.contrato}
                </Link>
              </span>
            )}
          </CorpoCartao>
        </Cartao>
      )}
      {o.higienizacao.length > 0 && (
        <Cartao>
          <CabecalhoCartao
            titulo={o.higienizacao[0]!.tipo === 'higienizacao' ? 'Higienização' : 'Manutenção'}
            descricao={
              [o.higienizacao[0]!.produto, o.higienizacao[0]!.dose].filter(Boolean).join(' · ') ||
              'Sem produto informado.'
            }
          />
          <CorpoCartao className="flex flex-col gap-1 text-sm">
            {o.higienizacao.map((h) => (
              <p key={h.recipienteId}>
                <Link className="underline" to={`/enotrace/recipientes/${h.recipienteId}`}>
                  {h.recipiente}
                </Link>
                <span className="text-muted-foreground">
                  {' '}
                  · antes: {NOMES_SITUACAO_RECIPIENTE[h.situacaoAnterior].toLowerCase()}
                </span>
              </p>
            ))}
          </CorpoCartao>
        </Cartao>
      )}
      {(o.parametros.length > 0 || typeof o.dados?.tipoTratamento === 'string') && (
        <Cartao>
          <CabecalhoCartao
            titulo={
              typeof o.dados?.tipoTratamento === 'string'
                ? nomeNaLista(ref, 'tipo_tratamento', o.dados.tipoTratamento)
                : 'Parâmetros técnicos'
            }
          />
          <CorpoCartao>
            <ul className="flex flex-col gap-1 text-sm">
              {o.parametros.map((p) => (
                <li key={p.nome}>
                  {p.nome}: {p.valor}
                  {p.unidade && ` ${p.unidade}`}
                </li>
              ))}
              {!o.parametros.length && (
                <li className="text-muted-foreground">Sem parâmetros técnicos.</li>
              )}
            </ul>
          </CorpoCartao>
        </Cartao>
      )}
      {o.genealogia.length > 0 && (
        <Cartao>
          <CabecalhoCartao titulo="Genealogia" />
          <CorpoCartao>
            <ul className="flex flex-col gap-1 text-sm">
              {o.genealogia.map((g, n) => (
                <li key={n}>
                  {g.origem} → {g.destino}: {litros(g.litros)} ({TIPOS_LIGACAO[g.tipo] ?? g.tipo})
                </li>
              ))}
            </ul>
          </CorpoCartao>
        </Cartao>
      )}
      {typeof o.dados?.inventarioId === 'string' && (
        <Cartao>
          <CorpoCartao className="flex flex-col gap-1 text-sm">
            <p>
              Ajustes do{' '}
              <Link className="underline" to={`/enotrace/inventarios/${o.dados.inventarioId}`}>
                inventário da cantina
              </Link>
              . A composição não muda.
            </p>
            {Object.entries((o.dados.motivos ?? {}) as Record<string, string>).map(([r, m]) => (
              <p key={r}>
                {r}: {m}
              </p>
            ))}
          </CorpoCartao>
        </Cartao>
      )}
      {(o.residuos.length > 0 ||
        !!o.observacao ||
        !!o.dados?.rendimento ||
        !!o.dados?.metodo ||
        Number(o.dados?.borra ?? 0) > 0 ||
        Number(o.dados?.evaporacao ?? 0) > 0) && (
        <Cartao>
          <CorpoCartao className="flex flex-col gap-1 text-sm">
            {typeof o.dados?.metodo === 'string' && (
              <p>Método: {nomeNaLista(ref, 'metodo_trasfega', o.dados.metodo)}</p>
            )}
            {Number(o.dados?.borra ?? 0) > 0 && <p>Borra: {litros(String(o.dados?.borra))}</p>}
            {typeof o.dados?.rendimento === 'string' && (
              <p>Rendimento real: {formatarDecimal(o.dados.rendimento, 3)} L/kg</p>
            )}
            {o.residuos.map((r, n) => (
              <p key={n}>
                {r.tipo === 'engaco' ? 'Engaço' : 'Bagaço'}: {formatarDecimal(r.kg, 1)} kg
                {r.destino && ` · ${r.destino}`}
              </p>
            ))}
            {o.observacao && <p>{o.observacao}</p>}
          </CorpoCartao>
        </Cartao>
      )}
    </Pagina>
  );
}
