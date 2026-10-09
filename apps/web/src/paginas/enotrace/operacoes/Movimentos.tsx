// EnoTrace › Operações: trasfega, corte, atesto e perda (cantina.md, Trasfega e corte; Operações; Regras comuns:
// esvaziar origem), com a prévia de cada recipiente antes e depois.
import { useQuery } from '@tanstack/react-query';
import { formatarDecimal } from '@vinicycle/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { CampoNumero } from '@/componentes/campos-especiais';
import { Botao } from '@/componentes/ui/botao';
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao } from '@/componentes/ui/cartao';
import { Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos';
import { Pagina } from '@/layout/Estrutura';
import { api } from '@/lib/api';
import { useReferencia } from '@/lib/referencia';
import { litros } from '../Projetos';
import {
  agora,
  Cabecalho,
  chaveRef,
  ComRascunho,
  daChave,
  doCampo,
  LETRAS,
  type Rascunho,
  type RecipienteSaldo,
  type RefLote,
  recipienteDaUrl,
  Rodape,
  useEnvio,
  useRecipientes,
} from './comum';
import { CartaoInsumos, type InsumoLinha, insumosParaApi } from './insumos';

const rotuloRecipiente = (r: RecipienteSaldo) =>
  `${r.codigo} · ${litros(r.volume)} de ${litros(r.capacidadeLitros)}${r.lote ? ` · ${r.lote.codigo}` : ''}`;

// Trasfega e corte ------------------------------------------------------------------------------

export function PaginaTrasfega() {
  return <ComRascunho>{(r) => <Mistura corte={false} rascunho={r} />}</ComRascunho>;
}

export function PaginaCorte() {
  return (
    <ComRascunho>{(r) => (r ? <Mistura corte rascunho={r} /> : <CorteDaSimulacao />)}</ComRascunho>
  );
}

/** Corte aberto a partir de uma simulação (`?simulacao=`): os litros pelos saldos de agora. */
function CorteDaSimulacao() {
  const [busca] = useSearchParams();
  const [id] = useState(() => busca.get('simulacao'));
  const q = useQuery({
    queryKey: ['simulacao', id],
    queryFn: () =>
      api.get<{
        nome: string;
        agora: {
          totalLitros: string;
          itens: Array<{ recipienteId: string; litros: string }>;
        };
      }>(`/api/simulacoes-corte/${id}`),
    enabled: !!id,
    staleTime: Infinity,
  });
  if (!id) return <Mistura corte rascunho={null} />;
  if (!q.data)
    return (
      <p className="text-sm text-muted-foreground">
        {q.isError ? (q.error as Error).message : 'Carregando…'}
      </p>
    );
  const a = q.data.agora;
  return (
    <Mistura
      corte
      rascunho={null}
      inicial={{
        observacao: `Simulação: ${q.data.nome}`,
        origens: a.itens.map((i) => ({
          recipienteId: i.recipienteId,
          litros: i.litros,
          esvaziar: false,
          perda: null,
        })),
        destinos: [{ recipienteId: '', litros: a.totalLitros, lote: { novo: 'A' } }],
      }}
    />
  );
}

interface Origem {
  recipienteId: string;
  litros: string | null;
  esvaziar: boolean;
  perda: string | null;
}
interface Destino {
  recipienteId: string;
  litros: string | null;
  /** Vazio = o mesmo lote das origens (só na trasfega). */
  lote: RefLote | null;
}

/**
 * Trasfega (o mesmo lote) e corte (lotes diferentes, cantina.md, Trasfega e corte): origens com o
 * que saiu e a borra, destinos com o que chegou e o lote de cada um.
 */

function Mistura({
  corte,
  rascunho,
  inicial,
}: {
  corte: boolean;
  rascunho: Rascunho | null;
  inicial?: { observacao: string; origens: Origem[]; destinos: Destino[] };
}) {
  const recipientes = useRecipientes();
  const { data: ref } = useReferencia();
  const envio = useEnvio(corte ? 'corte' : 'trasfega', rascunho);
  const [d, setD] = useState(() => ({
    executadoEm: agora(),
    responsavelId: '',
    planoEtapaId: '',
    observacao: '',
    metodo: '',
    eCorte: false,
    projetoNovo: '',
    insumos: [] as InsumoLinha[],
    localEstoqueId: '',
    origens: [
      { recipienteId: recipienteDaUrl(), litros: null, esvaziar: false, perda: null },
    ] as Origem[],
    destinos: [{ recipienteId: '', litros: null, lote: corte ? { novo: 'A' } : null }] as Destino[],
    ...inicial,
    ...rascunho?.formulario,
  }));
  const set = (p: Partial<typeof d>) => {
    envio.limpar();
    setD({ ...d, ...p });
  };
  const rec = (id: string) => recipientes.data?.find((r) => r.id === id);
  const lotesOrigem = [
    ...new Map(
      d.origens.flatMap((o) => {
        const l = rec(o.recipienteId)?.lote;
        return l ? [[l.id, l] as const] : [];
      }),
    ).values(),
  ];
  const loteOrigem = lotesOrigem[0] ?? null;
  const usados = new Set([...d.origens, ...d.destinos].map((x) => x.recipienteId));
  const mistura =
    !corte &&
    d.destinos.some((x) => {
      const l = rec(x.recipienteId)?.lote;
      return !!l && !!loteOrigem && l.id !== loteOrigem.id;
    });
  // Lote novo com vinhos de projetos diferentes forma um projeto novo (cantina.md, Corte).
  const precisaProjeto =
    corte &&
    d.destinos.some((x) => {
      if (!x.lote || !('novo' in x.lote)) return false;
      const destino = rec(x.recipienteId)?.lote;
      return (
        new Set([...lotesOrigem, ...(destino ? [destino] : [])].map((l) => l.projetoId)).size > 1
      );
    });
  const projetoId = precisaProjeto ? '' : (loteOrigem?.projetoId ?? '');
  const totalDestinos = d.destinos.reduce((t, x) => t + Number(x.litros ?? 0), 0);
  const setOrigem = (n: number, p: Partial<Origem>) =>
    set({ origens: d.origens.map((o, j) => (j === n ? { ...o, ...p } : o)) });
  const setDestino = (n: number, p: Partial<Destino>) =>
    set({ destinos: d.destinos.map((o, j) => (j === n ? { ...o, ...p } : o)) });
  const corpo = () => ({
    executadoEm: doCampo(d.executadoEm),
    responsavelId: d.responsavelId || null,
    planoEtapaId: d.planoEtapaId || null,
    observacao: d.observacao,
    metodo: d.metodo || null,
    eCorte: mistura && d.eCorte,
    projetoNovo: precisaProjeto ? { nome: d.projetoNovo } : null,
    insumos: insumosParaApi(d.insumos),
    localEstoqueId: d.localEstoqueId || null,
    origens: d.origens.map((o) => ({
      recipienteId: o.recipienteId,
      litros: o.litros,
      esvaziar: o.esvaziar,
      perda: o.esvaziar ? null : o.perda,
    })),
    destinos: d.destinos.map((x) => ({ ...x, litros: x.litros ?? '0' })),
  });
  const opcoes = (filtro: (r: RecipienteSaldo) => boolean, atual: string) =>
    recipientes.data
      ?.filter((r) => r.id === atual || (filtro(r) && !usados.has(r.id)))
      .map((r) => (
        <option key={r.id} value={r.id}>
          {rotuloRecipiente(r)}
        </option>
      ));

  return (
    <Pagina titulo={corte ? 'Corte' : 'Trasfega'} trilha={['EnoTrace', 'Operações']}>
      <p className="text-sm text-muted-foreground">
        {corte
          ? 'Mistura de lotes diferentes. Cada destino recebe a mistura das origens, na proporção do que saiu de cada uma, e incorpora a um lote existente ou forma lote novo. A prévia mostra a composição e o que o rótulo pode declarar.'
          : 'O vinho de um lote passa de recipiente para recipiente. Com mais de uma origem, cada destino recebe a mistura delas, e a composição viaja com os litros. A borra fica na origem como perda.'}
      </p>
      <Cartao>
        <CabecalhoCartao titulo="Operação" />
        <CorpoCartao className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Método" id="tr-metodo">
            <Selecao
              id="tr-metodo"
              value={d.metodo}
              onChange={(e) => set({ metodo: e.target.value })}
            >
              <option value="">—</option>
              {(ref?.listas.metodo_trasfega ?? []).map((o) => (
                <option key={o.codigo} value={o.codigo}>
                  {o.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Cabecalho d={d} set={set} projetoId={projetoId} tipo={corte ? 'corte' : 'trasfega'} />
        </CorpoCartao>
      </Cartao>

      <Cartao>
        <CabecalhoCartao
          titulo="Origens"
          descricao={
            d.origens.length > 1
              ? 'Informe quanto saiu de cada origem, ou marque "esvaziar" (sai todo o saldo).'
              : 'Litros vazios = o total dos destinos. "Esvaziar" lança a sobra como borra.'
          }
        />
        <CorpoCartao className="flex flex-col gap-3">
          {d.origens.map((o, n) => (
            <div key={n} className="grid items-end gap-2 sm:grid-cols-[1fr_10rem_10rem_auto]">
              <Campo rotulo="Recipiente" id={`or-rec-${n}`}>
                <Selecao
                  id={`or-rec-${n}`}
                  value={o.recipienteId}
                  onChange={(e) => setOrigem(n, { recipienteId: e.target.value })}
                >
                  <option value="">Escolha</option>
                  {opcoes(
                    (r) => !!r.lote && (corte || !loteOrigem || r.lote.id === loteOrigem.id),
                    o.recipienteId,
                  )}
                </Selecao>
              </Campo>
              <Campo rotulo="Saiu" id={`or-l-${n}`}>
                <CampoNumero
                  id={`or-l-${n}`}
                  casas={2}
                  unidade="L"
                  valor={o.litros}
                  aoMudar={(v) => setOrigem(n, { litros: v })}
                />
              </Campo>
              <Campo rotulo="Borra" id={`or-p-${n}`}>
                {o.esvaziar ? (
                  <p className="py-2 text-sm text-muted-foreground">calculada</p>
                ) : (
                  <CampoNumero
                    id={`or-p-${n}`}
                    casas={2}
                    unidade="L"
                    valor={o.perda}
                    aoMudar={(v) => setOrigem(n, { perda: v })}
                  />
                )}
              </Campo>
              <Botao
                variante="fantasma"
                tamanho="icone"
                aria-label="Remover origem"
                disabled={d.origens.length === 1}
                onClick={() => set({ origens: d.origens.filter((_, j) => j !== n) })}
              >
                <Trash2 />
              </Botao>
              <div className="sm:col-span-4">
                <Caixa
                  rotulo="Esvaziar (a sobra vai como borra)"
                  checked={o.esvaziar}
                  onChange={(e) => setOrigem(n, { esvaziar: e.target.checked })}
                />
              </div>
            </div>
          ))}
          <div>
            <Botao
              variante="secundario"
              tamanho="pequeno"
              onClick={() =>
                set({
                  origens: [
                    ...d.origens,
                    { recipienteId: '', litros: null, esvaziar: false, perda: null },
                  ],
                })
              }
            >
              <Plus /> Origem
            </Botao>
          </div>
        </CorpoCartao>
      </Cartao>

      <Cartao>
        <CabecalhoCartao
          titulo="Destinos"
          descricao={`Os litros que chegaram em cada recipiente. Total: ${formatarDecimal(totalDestinos.toFixed(2), 2)} L.`}
        />
        <CorpoCartao className="flex flex-col gap-3">
          {d.destinos.map((x, n) => {
            const r = rec(x.recipienteId);
            const outro = r?.lote && loteOrigem && r.lote.id !== loteOrigem.id ? r.lote : null;
            return (
              <div key={n} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_10rem_auto]">
                <Campo rotulo="Recipiente" id={`ds-rec-${n}`}>
                  <Selecao
                    id={`ds-rec-${n}`}
                    value={x.recipienteId}
                    onChange={(e) => {
                      const novo = rec(e.target.value);
                      const lote = corte
                        ? novo?.lote
                          ? { id: novo.lote.id }
                          : { novo: 'A' }
                        : novo?.lote && loteOrigem && novo.lote.id !== loteOrigem.id
                          ? { id: novo.lote.id }
                          : null;
                      setDestino(n, { recipienteId: e.target.value, lote });
                    }}
                  >
                    <option value="">Escolha</option>
                    {opcoes((y) => y.situacao !== 'inativo', x.recipienteId)}
                  </Selecao>
                </Campo>
                <Campo rotulo="Lote" id={`ds-lote-${n}`}>
                  <Selecao
                    id={`ds-lote-${n}`}
                    value={chaveRef(x.lote)}
                    onChange={(e) => setDestino(n, { lote: daChave(e.target.value) })}
                  >
                    {corte ? (
                      // Incorporar ao lote do destino ou, num destino vazio, a um lote das origens.
                      (r?.lote ? [r.lote] : lotesOrigem).map((l) => (
                        <option key={l.id} value={`id:${l.id}`}>
                          Incorporar ao lote {l.codigo}
                        </option>
                      ))
                    ) : outro ? (
                      <option value={`id:${outro.id}`}>Incorporar ao lote {outro.codigo}</option>
                    ) : (
                      <option value="">
                        Mesmo lote{loteOrigem ? ` ${loteOrigem.codigo}` : ''}
                      </option>
                    )}
                    {LETRAS.map((l) => (
                      <option key={l} value={`novo:${l}`}>
                        Lote novo {l}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
                <Campo rotulo="Chegou" id={`ds-l-${n}`}>
                  <CampoNumero
                    id={`ds-l-${n}`}
                    casas={2}
                    unidade="L"
                    valor={x.litros}
                    aoMudar={(v) => setDestino(n, { litros: v })}
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
          <div>
            <Botao
              variante="secundario"
              tamanho="pequeno"
              onClick={() =>
                set({
                  destinos: [
                    ...d.destinos,
                    {
                      recipienteId: '',
                      litros: null,
                      lote: corte ? { novo: LETRAS[d.destinos.length] ?? 'E' } : null,
                    },
                  ],
                })
              }
            >
              <Plus /> Destino
            </Botao>
          </div>
          {precisaProjeto && (
            <Aviso tom="info">
              <p>
                Os vinhos são de projetos diferentes: o lote novo forma um projeto novo, com o
                código na sequência. Os projetos de origem que ficarem sem saldo se encerram como
                &quot;incorporados&quot; a ele.
              </p>
              <Campo rotulo="Nome do projeto novo" id="cr-projeto" obrigatorio>
                <Entrada
                  id="cr-projeto"
                  value={d.projetoNovo}
                  onChange={(e) => set({ projetoNovo: e.target.value })}
                />
              </Campo>
            </Aviso>
          )}
          {mistura && (
            <Aviso tom="info">
              <p>
                Um destino já tem outro lote: é uma mistura. Quem diz se é corte é o enólogo; juntar
                lotes iguais (mesma uva e safra) não é corte.
              </p>
              <Caixa
                rotulo="Registrar como corte"
                checked={d.eCorte}
                onChange={(e) => set({ eCorte: e.target.checked })}
              />
            </Aviso>
          )}
        </CorpoCartao>
      </Cartao>
      <CartaoInsumos
        insumos={d.insumos}
        set={(insumos) => set({ insumos })}
        recipientes={d.destinos.flatMap((x) => {
          const r = rec(x.recipienteId);
          return r ? [{ id: r.id, codigo: r.codigo }] : [];
        })}
        rotuloTodos="Todos os destinos"
        localEstoqueId={d.localEstoqueId}
        setLocal={(localEstoqueId) => set({ localEstoqueId })}
      />
      <Rodape envio={envio} corpo={corpo} formulario={() => ({ ...d, projetoId })} />
    </Pagina>
  );
}

// Atesto ----------------------------------------------------------------------------------------

export function PaginaAtesto() {
  return <ComRascunho>{(r) => <Atesto rascunho={r} />}</ComRascunho>;
}

interface Barrica {
  recipienteId: string;
  litros: string | null;
  /** Vazio = igual aos litros repostos. */
  evaporacao: string | null;
  /** Vazio = o lote da barrica. */
  lote: RefLote | null;
}

/**
 * Atesto em lote (cantina.md, Atesto em lote): uma origem completa várias barricas. A evaporação
 * de cada barrica é, por padrão, igual aos litros repostos; o enólogo corrige antes de confirmar.
 */
function Atesto({ rascunho }: { rascunho: Rascunho | null }) {
  const recipientes = useRecipientes();
  const envio = useEnvio('atesto', rascunho);
  const [d, setD] = useState(() => ({
    executadoEm: agora(),
    responsavelId: '',
    planoEtapaId: '',
    observacao: '',
    origemId: '',
    barricas: [
      { recipienteId: recipienteDaUrl(), litros: null, evaporacao: null, lote: null },
    ] as Barrica[],
    insumos: [] as InsumoLinha[],
    localEstoqueId: '',
    ...rascunho?.formulario,
  }));
  const set = (p: Partial<typeof d>) => {
    envio.limpar();
    setD({ ...d, ...p });
  };
  const rec = (id: string) => recipientes.data?.find((r) => r.id === id);
  const loteOrigem = rec(d.origemId)?.lote ?? null;
  const usados = new Set([d.origemId, ...d.barricas.map((b) => b.recipienteId)]);
  const setBarrica = (n: number, p: Partial<Barrica>) =>
    set({ barricas: d.barricas.map((b, j) => (j === n ? { ...b, ...p } : b)) });
  const doMesmoLote = (recipientes.data ?? []).filter(
    (r) => !!loteOrigem && r.lote?.id === loteOrigem.id && !usados.has(r.id),
  );
  const total = d.barricas.reduce((t, b) => t + Number(b.litros ?? 0), 0);
  const corpo = () => ({
    executadoEm: doCampo(d.executadoEm),
    responsavelId: d.responsavelId || null,
    planoEtapaId: d.planoEtapaId || null,
    observacao: d.observacao,
    origens: [{ recipienteId: d.origemId, esvaziar: false }],
    destinos: d.barricas
      .filter((b) => b.recipienteId)
      .map((b) => ({ ...b, litros: b.litros ?? '0' })),
    insumos: insumosParaApi(d.insumos),
    localEstoqueId: d.localEstoqueId || null,
  });
  return (
    <Pagina titulo="Atesto" trilha={['EnoTrace', 'Operações']}>
      <p className="text-sm text-muted-foreground">
        Uma origem completa várias barricas. Em cada barrica, a evaporação é lançada igual aos
        litros repostos, e a barrica volta ao volume cheio; corrija se for o caso.
      </p>
      <Cartao>
        <CabecalhoCartao titulo="Operação" />
        <CorpoCartao className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Origem" id="at-origem" obrigatorio>
            <Selecao
              id="at-origem"
              value={d.origemId}
              onChange={(e) => set({ origemId: e.target.value })}
            >
              <option value="">Escolha</option>
              {recipientes.data
                ?.filter((r) => !!r.lote && (r.id === d.origemId || !usados.has(r.id)))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {rotuloRecipiente(r)}
                  </option>
                ))}
            </Selecao>
          </Campo>
          <Cabecalho d={d} set={set} projetoId={loteOrigem?.projetoId ?? ''} tipo="atesto" />
        </CorpoCartao>
      </Cartao>
      <Cartao>
        <CabecalhoCartao
          titulo="Barricas"
          descricao={`Litros repostos em cada uma. Total: ${formatarDecimal(total.toFixed(2), 2)} L.`}
        />
        <CorpoCartao className="flex flex-col gap-3">
          {d.barricas.map((b, n) => {
            const r = rec(b.recipienteId);
            const outro = r?.lote && loteOrigem && r.lote.id !== loteOrigem.id ? r.lote : null;
            return (
              <div key={n} className="grid items-end gap-2 sm:grid-cols-[1fr_12rem_9rem_9rem_auto]">
                <Campo rotulo="Barrica" id={`at-rec-${n}`}>
                  <Selecao
                    id={`at-rec-${n}`}
                    value={b.recipienteId}
                    onChange={(e) => setBarrica(n, { recipienteId: e.target.value, lote: null })}
                  >
                    <option value="">Escolha</option>
                    {recipientes.data
                      ?.filter(
                        (y) =>
                          y.id === b.recipienteId ||
                          (y.situacao !== 'inativo' && !usados.has(y.id)),
                      )
                      .map((y) => (
                        <option key={y.id} value={y.id}>
                          {rotuloRecipiente(y)}
                        </option>
                      ))}
                  </Selecao>
                </Campo>
                <Campo rotulo="Lote" id={`at-lote-${n}`}>
                  <Selecao
                    id={`at-lote-${n}`}
                    value={chaveRef(b.lote)}
                    onChange={(e) => setBarrica(n, { lote: daChave(e.target.value) })}
                  >
                    <option value="">
                      {outro
                        ? `Incorporar ao lote ${outro.codigo}`
                        : `Mesmo lote${loteOrigem ? ` ${loteOrigem.codigo}` : ''}`}
                    </option>
                    {LETRAS.map((l) => (
                      <option key={l} value={`novo:${l}`}>
                        Lote novo {l}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
                <Campo rotulo="Repostos" id={`at-l-${n}`}>
                  <CampoNumero
                    id={`at-l-${n}`}
                    casas={2}
                    unidade="L"
                    valor={b.litros}
                    aoMudar={(v) => setBarrica(n, { litros: v })}
                  />
                </Campo>
                <Campo rotulo="Evaporação" id={`at-ev-${n}`}>
                  <CampoNumero
                    id={`at-ev-${n}`}
                    casas={2}
                    unidade="L"
                    placeholder="= repostos"
                    valor={b.evaporacao}
                    aoMudar={(v) => setBarrica(n, { evaporacao: v })}
                  />
                </Campo>
                <Botao
                  variante="fantasma"
                  tamanho="icone"
                  aria-label="Remover barrica"
                  disabled={d.barricas.length === 1}
                  onClick={() => set({ barricas: d.barricas.filter((_, j) => j !== n) })}
                >
                  <Trash2 />
                </Botao>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <Botao
              variante="secundario"
              tamanho="pequeno"
              onClick={() =>
                set({
                  barricas: [
                    ...d.barricas,
                    { recipienteId: '', litros: null, evaporacao: null, lote: null },
                  ],
                })
              }
            >
              <Plus /> Barrica
            </Botao>
            {doMesmoLote.length > 0 && (
              <Botao
                variante="secundario"
                tamanho="pequeno"
                onClick={() =>
                  set({
                    barricas: [
                      ...d.barricas.filter((b) => b.recipienteId),
                      ...doMesmoLote.map((r) => ({
                        recipienteId: r.id,
                        litros: null,
                        evaporacao: null,
                        lote: null,
                      })),
                    ],
                  })
                }
              >
                <Plus /> Todas do lote {loteOrigem?.codigo} ({doMesmoLote.length})
              </Botao>
            )}
          </div>
        </CorpoCartao>
      </Cartao>
      <CartaoInsumos
        insumos={d.insumos}
        set={(insumos) => set({ insumos })}
        recipientes={d.barricas.flatMap((b) => {
          const r = rec(b.recipienteId);
          return r ? [{ id: r.id, codigo: r.codigo }] : [];
        })}
        rotuloTodos="Todas as barricas"
        localEstoqueId={d.localEstoqueId}
        setLocal={(localEstoqueId) => set({ localEstoqueId })}
      />
      <Rodape
        envio={envio}
        corpo={corpo}
        formulario={() => ({ ...d, projetoId: loteOrigem?.projetoId ?? '' })}
      />
    </Pagina>
  );
}

// Perda -----------------------------------------------------------------------------------------

export function PaginaPerda() {
  return <ComRascunho>{(r) => <Perda rascunho={r} />}</ComRascunho>;
}

interface ItemPerda {
  recipienteId: string;
  litros: string | null;
  esvaziar: boolean;
  motivo: string;
}

function Perda({ rascunho }: { rascunho: Rascunho | null }) {
  const recipientes = useRecipientes();
  const { data: ref } = useReferencia();
  const envio = useEnvio('perda', rascunho);
  const [d, setD] = useState(() => ({
    executadoEm: agora(),
    responsavelId: '',
    planoEtapaId: '',
    observacao: '',
    itens: [
      { recipienteId: recipienteDaUrl(), litros: null, esvaziar: false, motivo: '' },
    ] as ItemPerda[],
    ...rascunho?.formulario,
  }));
  const set = (p: Partial<typeof d>) => {
    envio.limpar();
    setD({ ...d, ...p });
  };
  const setItem = (n: number, p: Partial<ItemPerda>) =>
    set({ itens: d.itens.map((x, j) => (j === n ? { ...x, ...p } : x)) });
  const projetos = [
    ...new Set(
      d.itens
        .map((i) => recipientes.data?.find((r) => r.id === i.recipienteId)?.lote?.projetoId)
        .filter(Boolean),
    ),
  ];
  const projetoId = projetos.length === 1 ? projetos[0]! : '';
  const corpo = () => ({
    executadoEm: doCampo(d.executadoEm),
    responsavelId: d.responsavelId || null,
    planoEtapaId: d.planoEtapaId || null,
    observacao: d.observacao,
    itens: d.itens.map((i) => ({ ...i, litros: i.esvaziar ? null : i.litros })),
  });
  const usados = new Set(d.itens.map((i) => i.recipienteId));
  return (
    <Pagina titulo="Perda" trilha={['EnoTrace', 'Operações']}>
      <p className="text-sm text-muted-foreground">
        Vazamento, descarte, amostra… Os motivos se configuram em Catálogos. A composição não muda.
      </p>
      <Cartao>
        <CabecalhoCartao titulo="Operação" />
        <CorpoCartao className="grid gap-4 sm:grid-cols-2">
          <Cabecalho d={d} set={set} projetoId={projetoId} tipo="perda" />
        </CorpoCartao>
      </Cartao>
      <Cartao>
        <CabecalhoCartao titulo="Recipientes" />
        <CorpoCartao className="flex flex-col gap-3">
          {d.itens.map((i, n) => (
            <div key={n} className="grid items-end gap-2 sm:grid-cols-[1fr_12rem_10rem_auto]">
              <Campo rotulo="Recipiente" id={`pd-rec-${n}`}>
                <Selecao
                  id={`pd-rec-${n}`}
                  value={i.recipienteId}
                  onChange={(e) => setItem(n, { recipienteId: e.target.value })}
                >
                  <option value="">Escolha</option>
                  {recipientes.data
                    ?.filter((r) => r.id === i.recipienteId || (!!r.lote && !usados.has(r.id)))
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {rotuloRecipiente(r)}
                      </option>
                    ))}
                </Selecao>
              </Campo>
              <Campo rotulo="Motivo" id={`pd-mot-${n}`}>
                <Selecao
                  id={`pd-mot-${n}`}
                  value={i.motivo}
                  onChange={(e) => setItem(n, { motivo: e.target.value })}
                >
                  <option value="">Escolha</option>
                  {(ref?.listas.motivo_perda ?? []).map((o) => (
                    <option key={o.codigo} value={o.codigo}>
                      {o.nome}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Campo rotulo="Litros" id={`pd-l-${n}`}>
                {i.esvaziar ? (
                  <p className="py-2 text-sm text-muted-foreground">todo o saldo</p>
                ) : (
                  <CampoNumero
                    id={`pd-l-${n}`}
                    casas={2}
                    unidade="L"
                    valor={i.litros}
                    aoMudar={(v) => setItem(n, { litros: v })}
                  />
                )}
              </Campo>
              <Botao
                variante="fantasma"
                tamanho="icone"
                aria-label="Remover recipiente"
                disabled={d.itens.length === 1}
                onClick={() => set({ itens: d.itens.filter((_, j) => j !== n) })}
              >
                <Trash2 />
              </Botao>
              <div className="sm:col-span-4">
                <Caixa
                  rotulo="Esvaziar (perde todo o saldo)"
                  checked={i.esvaziar}
                  onChange={(e) => setItem(n, { esvaziar: e.target.checked })}
                />
              </div>
            </div>
          ))}
          <div>
            <Botao
              variante="secundario"
              tamanho="pequeno"
              onClick={() =>
                set({
                  itens: [
                    ...d.itens,
                    { recipienteId: '', litros: null, esvaziar: false, motivo: '' },
                  ],
                })
              }
            >
              <Plus /> Recipiente
            </Botao>
          </div>
        </CorpoCartao>
      </Cartao>
      <Rodape envio={envio} corpo={corpo} formulario={() => ({ ...d, projetoId })} />
    </Pagina>
  );
}
