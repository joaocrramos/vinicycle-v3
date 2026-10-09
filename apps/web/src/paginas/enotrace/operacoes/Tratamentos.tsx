// EnoTrace › Operações: adição de insumo, chaptalização e tratamentos (cantina.md, Adição de insumo;
// Chaptalização; Tratamentos), com a prévia de cada recipiente, os avisos e o "ciente".
import { useQuery } from '@tanstack/react-query';
import { formatarDecimal } from '@vinicycle/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CampoNumero } from '@/componentes/campos-especiais';
import { Botao } from '@/componentes/ui/botao';
import { CabecalhoCartao, Cartao, CorpoCartao } from '@/componentes/ui/cartao';
import { Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos';
import { Pagina } from '@/layout/Estrutura';
import { api } from '@/lib/api';
import { useReferencia } from '@/lib/referencia';
import { litros } from '../Projetos';
import { useItens, useLocais, useLotes } from '../Estoque';
import {
  agora,
  Cabecalho,
  ComRascunho,
  doCampo,
  type Rascunho,
  recipienteDaUrl,
  Rodape,
  useEnvio,
  useRecipientes,
} from './comum';
import { CartaoInsumos, type InsumoLinha, insumosParaApi, insumoVazio } from './insumos';

const comum = () => ({
  executadoEm: agora(),
  responsavelId: '',
  planoEtapaId: '',
  observacao: '',
});

const cabecalhoApi = (d: ReturnType<typeof comum>) => ({
  executadoEm: doCampo(d.executadoEm),
  responsavelId: d.responsavelId || null,
  planoEtapaId: d.planoEtapaId || null,
  observacao: d.observacao,
});

// Adição de insumo ------------------------------------------------------------------------------

export function PaginaAdicao() {
  return <ComRascunho>{(r) => <Adicao rascunho={r} />}</ComRascunho>;
}

function Adicao({ rascunho }: { rascunho: Rascunho | null }) {
  const recipientes = useRecipientes();
  const envio = useEnvio('adicao_insumo', rascunho);
  const [d, setD] = useState(() => ({
    ...comum(),
    insumos: [insumoVazio(recipienteDaUrl())] as InsumoLinha[],
    localEstoqueId: '',
    ...rascunho?.formulario,
  }));
  const set = (p: Partial<typeof d>) => {
    envio.limpar();
    setD({ ...d, ...p });
  };
  const comVinho = (recipientes.data ?? []).filter((r) => !!r.lote);
  const projetoId =
    comVinho.find((r) => d.insumos.some((i) => i.recipienteId === r.id))?.lote?.projetoId ?? '';
  const corpo = () => ({
    ...cabecalhoApi(d),
    insumos: insumosParaApi(d.insumos),
    localEstoqueId: d.localEstoqueId || null,
  });
  return (
    <Pagina titulo="Adição de insumo" trilha={['EnoTrace', 'Operações']}>
      <p className="text-sm text-muted-foreground">
        SO₂, enzimas, leveduras, nutrientes… Cada insumo baixa o lote dele no estoque. O SO₂ soma no
        vinho do recipiente e acompanha os litros nas trasfegas e cortes.
      </p>
      <Cartao>
        <CabecalhoCartao titulo="Operação" />
        <CorpoCartao className="grid gap-4 sm:grid-cols-2">
          <Cabecalho d={d} set={set} projetoId={projetoId} tipo="adicao_insumo" />
        </CorpoCartao>
      </Cartao>
      <CartaoInsumos
        titulo="Insumos"
        insumos={d.insumos}
        set={(insumos) => set({ insumos })}
        recipientes={comVinho.map((r) => ({ id: r.id, codigo: r.codigo }))}
        localEstoqueId={d.localEstoqueId}
        setLocal={(localEstoqueId) => set({ localEstoqueId })}
      />
      <Rodape envio={envio} corpo={corpo} formulario={() => ({ ...d, projetoId })} />
    </Pagina>
  );
}

// Chaptalização ---------------------------------------------------------------------------------

export function PaginaChaptalizacao() {
  return <ComRascunho>{(r) => <Chaptalizacao rascunho={r} />}</ComRascunho>;
}

function Chaptalizacao({ rascunho }: { rascunho: Rascunho | null }) {
  const recipientes = useRecipientes();
  const itens = useItens();
  const locais = useLocais();
  const envio = useEnvio('chaptalizacao', rascunho);
  const chaptalizacao = useQuery({
    queryKey: ['cantina', 'chaptalizacao'],
    queryFn: () =>
      api.get<{ acucarPorGrau: number; limitePratica: number | null }>(
        '/api/cantina/chaptalizacao',
      ),
  });
  const [d, setD] = useState(() => ({
    ...comum(),
    recipienteId: recipienteDaUrl(),
    naoEstocado: false,
    itemId: '',
    descricao: '',
    loteItemId: '',
    modo: 'kg' as 'kg' | 'gL',
    quantidade: null as string | null,
    localEstoqueId: '',
    ...rascunho?.formulario,
  }));
  const set = (p: Partial<typeof d>) => {
    envio.limpar();
    setD({ ...d, ...p });
  };
  const item = itens.data?.find((x) => x.id === d.itemId);
  const lotes = useLotes(item?.controlaLote ? d.itemId : '');
  const recipiente = recipientes.data?.find((r) => r.id === d.recipienteId);
  const volume = Number(recipiente?.volume ?? 0);
  const q = Number(d.quantidade ?? 0);
  const gL = d.modo === 'gL' ? q : volume ? (q * 1000) / volume : 0;
  const fator = chaptalizacao.data?.acucarPorGrau ?? 17;
  const corpo = () => ({
    ...cabecalhoApi(d),
    recipienteId: d.recipienteId,
    itemId: d.naoEstocado ? null : d.itemId || null,
    descricao: d.naoEstocado ? d.descricao : null,
    loteItemId: d.naoEstocado ? null : d.loteItemId || null,
    kg: d.modo === 'kg' ? d.quantidade : null,
    gramasPorLitro: d.modo === 'gL' ? d.quantidade : null,
    localEstoqueId: d.localEstoqueId || null,
  });
  return (
    <Pagina titulo="Chaptalização" trilha={['EnoTrace', 'Operações']}>
      <p className="text-sm text-muted-foreground">
        O ganho de álcool é estimado em 1% vol a cada {formatarDecimal(String(fator), 1)} g/L de
        açúcar (Configurações › Parâmetros). O limite vem da classe e da cor do projeto (regra
        versionada)
        {chaptalizacao.data?.limitePratica
          ? ` e da prática da vinícola (${formatarDecimal(String(chaptalizacao.data.limitePratica), 1)}% vol)`
          : ''}
        ; o lote fica marcado como chaptalizado.
      </p>
      <Cartao>
        <CabecalhoCartao titulo="Operação" />
        <CorpoCartao className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Recipiente" id="ch-rec" obrigatorio>
            <Selecao
              id="ch-rec"
              value={d.recipienteId}
              onChange={(e) => set({ recipienteId: e.target.value })}
            >
              <option value="">Escolha</option>
              {recipientes.data
                ?.filter((r) => !!r.lote)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.codigo} · {litros(r.volume)} · {r.lote!.codigo}
                  </option>
                ))}
            </Selecao>
          </Campo>
          <Cabecalho
            d={d}
            set={set}
            projetoId={recipiente?.lote?.projetoId ?? ''}
            tipo="chaptalizacao"
          />
        </CorpoCartao>
      </Cartao>
      <Cartao>
        <CabecalhoCartao titulo="Açúcar" />
        <CorpoCartao className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Açúcar" id="ch-item" obrigatorio>
            {d.naoEstocado ? (
              <Entrada
                id="ch-item"
                placeholder="Descrição"
                value={d.descricao}
                onChange={(e) => set({ descricao: e.target.value })}
              />
            ) : (
              <Selecao
                id="ch-item"
                value={d.itemId}
                onChange={(e) => set({ itemId: e.target.value, loteItemId: '' })}
              >
                <option value="">Escolha</option>
                {itens.data
                  ?.filter((x) => x.tipo === 'insumo')
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nome}
                    </option>
                  ))}
              </Selecao>
            )}
          </Campo>
          {item?.controlaLote && (
            <Campo rotulo="Lote" id="ch-lote">
              <Selecao
                id="ch-lote"
                value={d.loteItemId}
                onChange={(e) => set({ loteItemId: e.target.value })}
              >
                <option value="">Escolha</option>
                {lotes.data?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo}
                  </option>
                ))}
              </Selecao>
            </Campo>
          )}
          <Campo rotulo="Quantidade" id="ch-q" obrigatorio>
            <div className="flex gap-2">
              <CampoNumero
                id="ch-q"
                casas={d.modo === 'kg' ? 3 : 2}
                valor={d.quantidade}
                aoMudar={(v) => set({ quantidade: v })}
              />
              <Selecao
                aria-label="Unidade"
                className="w-24"
                value={d.modo}
                onChange={(e) => set({ modo: e.target.value as 'kg' | 'gL', quantidade: null })}
              >
                <option value="kg">kg</option>
                <option value="gL">g/L</option>
              </Selecao>
            </div>
          </Campo>
          {(locais.data?.length ?? 0) > 1 && !d.naoEstocado && (
            <Campo rotulo="Local do estoque" id="ch-local">
              <Selecao
                id="ch-local"
                value={d.localEstoqueId}
                onChange={(e) => set({ localEstoqueId: e.target.value })}
              >
                <option value="">Escolha</option>
                {locais.data?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
          )}
          <div className="sm:col-span-2">
            <Caixa
              rotulo="Açúcar não estocado"
              checked={d.naoEstocado}
              onChange={(e) =>
                set({ naoEstocado: e.target.checked, itemId: '', loteItemId: '', descricao: '' })
              }
            />
          </div>
          {volume > 0 && q > 0 && (
            <p className="text-sm sm:col-span-2">
              Em {litros(String(volume))}: {formatarDecimal(gL.toFixed(1), 1)} g/L, ganho estimado
              de {formatarDecimal((gL / fator).toFixed(2), 2)}% vol.
            </p>
          )}
        </CorpoCartao>
      </Cartao>
      <Rodape
        envio={envio}
        corpo={corpo}
        formulario={() => ({ ...d, projetoId: recipiente?.lote?.projetoId ?? '' })}
      />
    </Pagina>
  );
}

// Tratamento ------------------------------------------------------------------------------------

export function PaginaTratamento() {
  return <ComRascunho>{(r) => <Tratamento rascunho={r} />}</ComRascunho>;
}

interface ParametroTratamento {
  id: string;
  tipoTratamento: string;
  nome: string;
  unidade: string | null;
  obrigatorio: boolean;
  ativo: boolean;
}

export function useParametrosTratamento() {
  return useQuery({
    queryKey: ['parametros-tratamento'],
    queryFn: () => api.get<ParametroTratamento[]>('/api/cantina/parametros-tratamento'),
  });
}

function Tratamento({ rascunho }: { rascunho: Rascunho | null }) {
  const recipientes = useRecipientes();
  const { data: ref } = useReferencia();
  const parametros = useParametrosTratamento();
  const envio = useEnvio('tratamento', rascunho);
  const [d, setD] = useState(() => ({
    ...comum(),
    tipoTratamento: '',
    recipientes: (recipienteDaUrl() ? [recipienteDaUrl()] : []) as string[],
    valores: {} as Record<string, string>,
    perdas: [] as Array<{ recipienteId: string; litros: string | null; motivo: string }>,
    insumos: [] as InsumoLinha[],
    localEstoqueId: '',
    ...rascunho?.formulario,
  }));
  const set = (p: Partial<typeof d>) => {
    envio.limpar();
    setD({ ...d, ...p });
  };
  const comVinho = (recipientes.data ?? []).filter((r) => !!r.lote);
  const escolhidos = comVinho.filter((r) => d.recipientes.includes(r.id));
  const doTipo = (parametros.data ?? []).filter(
    (p) => p.ativo && p.tipoTratamento === d.tipoTratamento,
  );
  const projetoId = escolhidos[0]?.lote?.projetoId ?? '';
  const corpo = () => ({
    ...cabecalhoApi(d),
    tipoTratamento: d.tipoTratamento,
    recipientes: d.recipientes,
    perdas: d.perdas
      .filter((p) => p.recipienteId && p.litros)
      .map((p) => ({ ...p, litros: p.litros ?? '0' })),
    parametros: doTipo
      .filter((p) => d.valores[p.id])
      .map((p) => ({ parametroId: p.id, valor: d.valores[p.id]! })),
    insumos: insumosParaApi(d.insumos),
    localEstoqueId: d.localEstoqueId || null,
  });
  return (
    <Pagina titulo="Tratamento" trilha={['EnoTrace', 'Operações']}>
      <p className="text-sm text-muted-foreground">
        Clarificação, filtração, estabilização… com os insumos, as perdas e os parâmetros técnicos
        configurados para o tipo (Parâmetros técnicos › Tratamentos).
      </p>
      <Cartao>
        <CabecalhoCartao titulo="Operação" />
        <CorpoCartao className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Tratamento" id="tt-tipo" obrigatorio>
            <Selecao
              id="tt-tipo"
              value={d.tipoTratamento}
              onChange={(e) => set({ tipoTratamento: e.target.value, valores: {} })}
            >
              <option value="">Escolha</option>
              {(ref?.listas.tipo_tratamento ?? []).map((o) => (
                <option key={o.codigo} value={o.codigo}>
                  {o.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Cabecalho d={d} set={set} projetoId={projetoId} tipo="tratamento" />
        </CorpoCartao>
      </Cartao>
      <Cartao>
        <CabecalhoCartao titulo="Recipientes tratados" />
        <CorpoCartao className="grid gap-2 sm:grid-cols-3">
          {comVinho.map((r) => (
            <Caixa
              key={r.id}
              rotulo={`${r.codigo} · ${litros(r.volume)} · ${r.lote!.codigo}`}
              checked={d.recipientes.includes(r.id)}
              onChange={(e) =>
                set({
                  recipientes: e.target.checked
                    ? [...d.recipientes, r.id]
                    : d.recipientes.filter((x) => x !== r.id),
                })
              }
            />
          ))}
          {!comVinho.length && (
            <p className="text-sm text-muted-foreground">Nenhum recipiente com vinho.</p>
          )}
        </CorpoCartao>
      </Cartao>
      {doTipo.length > 0 && (
        <Cartao>
          <CabecalhoCartao titulo="Parâmetros técnicos" />
          <CorpoCartao className="grid gap-4 sm:grid-cols-3">
            {doTipo.map((p) => (
              <Campo
                key={p.id}
                rotulo={`${p.nome}${p.unidade ? ` (${p.unidade})` : ''}`}
                id={`tt-p-${p.id}`}
                obrigatorio={p.obrigatorio}
              >
                <Entrada
                  id={`tt-p-${p.id}`}
                  value={d.valores[p.id] ?? ''}
                  onChange={(e) => set({ valores: { ...d.valores, [p.id]: e.target.value } })}
                />
              </Campo>
            ))}
          </CorpoCartao>
        </Cartao>
      )}
      <CartaoInsumos
        insumos={d.insumos}
        set={(insumos) => set({ insumos })}
        recipientes={escolhidos.map((r) => ({ id: r.id, codigo: r.codigo }))}
        rotuloTodos="Todos os tratados"
        localEstoqueId={d.localEstoqueId}
        setLocal={(localEstoqueId) => set({ localEstoqueId })}
      />
      <Cartao>
        <CabecalhoCartao titulo="Perdas (opcional)" descricao="Borra, filtração…" />
        <CorpoCartao className="flex flex-col gap-3">
          {d.perdas.map((p, n) => (
            <div key={n} className="grid items-end gap-2 sm:grid-cols-[1fr_12rem_10rem_auto]">
              <Campo rotulo="Recipiente" id={`tt-pr-${n}`}>
                <Selecao
                  id={`tt-pr-${n}`}
                  value={p.recipienteId}
                  onChange={(e) =>
                    set({
                      perdas: d.perdas.map((x, j) =>
                        j === n ? { ...x, recipienteId: e.target.value } : x,
                      ),
                    })
                  }
                >
                  <option value="">Escolha</option>
                  {escolhidos.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.codigo}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Campo rotulo="Motivo" id={`tt-pm-${n}`}>
                <Selecao
                  id={`tt-pm-${n}`}
                  value={p.motivo}
                  onChange={(e) =>
                    set({
                      perdas: d.perdas.map((x, j) =>
                        j === n ? { ...x, motivo: e.target.value } : x,
                      ),
                    })
                  }
                >
                  {(ref?.listas.motivo_perda ?? []).map((o) => (
                    <option key={o.codigo} value={o.codigo}>
                      {o.nome}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Campo rotulo="Litros" id={`tt-pl-${n}`}>
                <CampoNumero
                  id={`tt-pl-${n}`}
                  casas={2}
                  unidade="L"
                  valor={p.litros}
                  aoMudar={(v) =>
                    set({ perdas: d.perdas.map((x, j) => (j === n ? { ...x, litros: v } : x)) })
                  }
                />
              </Campo>
              <Botao
                variante="fantasma"
                tamanho="icone"
                aria-label="Remover perda"
                onClick={() => set({ perdas: d.perdas.filter((_, j) => j !== n) })}
              >
                <Trash2 />
              </Botao>
            </div>
          ))}
          <div>
            <Botao
              variante="secundario"
              tamanho="pequeno"
              onClick={() =>
                set({
                  perdas: [
                    ...d.perdas,
                    { recipienteId: escolhidos[0]?.id ?? '', litros: null, motivo: 'borra' },
                  ],
                })
              }
            >
              <Plus /> Perda
            </Botao>
          </div>
        </CorpoCartao>
      </Cartao>
      <Rodape envio={envio} corpo={corpo} formulario={() => ({ ...d, projetoId })} />
    </Pagina>
  );
}
