// EnoTrace › Operações: transferência de titularidade a granel (cantina.md, Mistura entre titulares;
// Pagamento em produto; 04, roteiro do ciclo 10, bloco 2). Total no próprio recipiente ou parcial
// para outro recipiente, vazio ou com vinho do novo titular.
import { useQuery } from '@tanstack/react-query';
import { MOTIVOS_TITULARIDADE } from '@vinicycle/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CampoNumero } from '@/componentes/campos-especiais';
import { Botao } from '@/componentes/ui/botao';
import { CabecalhoCartao, Cartao, CorpoCartao } from '@/componentes/ui/cartao';
import { Caixa, Campo, Selecao } from '@/componentes/ui/campos';
import { Pagina } from '@/layout/Estrutura';
import { api } from '@/lib/api';
import { litros } from '../Projetos';
import {
  agora,
  Cabecalho,
  ComRascunho,
  chaveRef,
  daChave,
  doCampo,
  LETRAS,
  type Rascunho,
  type RecipienteSaldo,
  type RefLote,
  recipienteDaUrl,
  Rodape,
  useEnvio,
  useLotesDoProjeto,
  useRecipientes,
} from './comum';

const rotulo = (r: RecipienteSaldo) =>
  `${r.codigo} · ${litros(r.volume)} de ${litros(r.capacidadeLitros)}${
    r.lote ? ` · ${r.lote.codigo} (${r.lote.titular ?? 'própria empresa'})` : ''
  }`;

interface Item {
  origemId: string;
  todo: boolean;
  litros: string | null;
  /** Vazio = o próprio recipiente. */
  destinoId: string;
  lote: RefLote | null;
}

export function PaginaTitularidade() {
  return <ComRascunho>{(r) => <Titularidade rascunho={r} />}</ComRascunho>;
}

function Titularidade({ rascunho }: { rascunho: Rascunho | null }) {
  const recipientes = useRecipientes();
  const envio = useEnvio('titularidade', rascunho);
  const clientes = useQuery({
    queryKey: ['pessoas-opcoes', 'cliente_vinificacao'],
    queryFn: () =>
      api.get<Array<{ id: string; nome: string }>>('/api/pessoas/opcoes?papel=cliente_vinificacao'),
  });
  const contratos = useQuery({
    queryKey: ['contratos-opcoes'],
    queryFn: async () =>
      (
        await api.get<{
          itens: Array<{
            id: string;
            numero: string | null;
            contraparteId: string;
            contraparte: string;
          }>;
        }>('/api/contratos-terceirizacao?tamanho=0')
      ).itens,
  });
  const [d, setD] = useState(() => ({
    executadoEm: agora(),
    responsavelId: '',
    planoEtapaId: '',
    observacao: '',
    motivo: 'pagamento_servico' as keyof typeof MOTIVOS_TITULARIDADE,
    contratoId: '',
    paraTitularId: '',
    itens: [
      { origemId: recipienteDaUrl(), todo: true, litros: null, destinoId: '', lote: { novo: 'A' } },
    ] as Item[],
    ...rascunho?.formulario,
  }));
  const set = (p: Partial<typeof d>) => {
    envio.limpar();
    setD({ ...d, ...p });
  };
  const setItem = (n: number, p: Partial<Item>) =>
    set({ itens: d.itens.map((x, j) => (j === n ? { ...x, ...p } : x)) });
  const rec = (id: string) => recipientes.data?.find((r) => r.id === id);
  const origem = rec(d.itens[0]?.origemId ?? '');
  const projetoId = origem?.lote?.projetoId ?? '';
  const de = origem?.lote ? (origem.lote.titularId ?? null) : undefined;
  const para = d.paraTitularId || null;
  const projeto = useLotesDoProjeto(projetoId);
  const lotesDoPara = (projeto.data?.lotes ?? []).filter(
    (l) => l.situacao === 'ativo' && (l.titularId ?? null) === para,
  );
  const contratosDasPartes = (contratos.data ?? []).filter(
    (c) => c.contraparteId === de || c.contraparteId === para,
  );
  const usados = new Set(d.itens.flatMap((i) => [i.origemId, i.destinoId]).filter(Boolean));
  const corpo = () => ({
    executadoEm: doCampo(d.executadoEm),
    responsavelId: d.responsavelId || null,
    observacao: d.observacao,
    motivo: d.motivo,
    contratoId: d.contratoId || null,
    paraTitularId: para,
    itens: d.itens.map((i) => ({
      origemId: i.origemId,
      litros: i.todo ? null : i.litros,
      destinoId: i.destinoId || null,
      lote: i.lote,
    })),
  });
  return (
    <Pagina titulo="Transferência de titularidade" trilha={['EnoTrace', 'Operações']}>
      <p className="text-sm text-muted-foreground">
        O vinho passa a ser de outro titular: compra ou venda do vinho, pagamento do serviço em
        produto. Todo o saldo fica no próprio recipiente; uma parte vai para outro recipiente, vazio
        ou com vinho do novo titular (dois titulares no mesmo recipiente não se misturam).
      </p>
      <Cartao>
        <CabecalhoCartao titulo="Operação" />
        <CorpoCartao className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Motivo" id="ti-motivo" obrigatorio>
            <Selecao
              id="ti-motivo"
              value={d.motivo}
              onChange={(e) => set({ motivo: e.target.value as typeof d.motivo })}
            >
              {Object.entries(MOTIVOS_TITULARIDADE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo
            rotulo="Novo titular"
            id="ti-para"
            ajuda={
              de !== undefined
                ? `Hoje o vinho é de ${origem?.lote?.titular ?? 'própria empresa'}.`
                : undefined
            }
          >
            <Selecao
              id="ti-para"
              value={d.paraTitularId}
              onChange={(e) =>
                set({
                  paraTitularId: e.target.value,
                  itens: d.itens.map((i) => ({ ...i, lote: { novo: 'A' } })),
                })
              }
            >
              <option value="">A própria empresa</option>
              {clientes.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo
            rotulo="Contrato"
            id="ti-contrato"
            ajuda={
              d.motivo === 'pagamento_servico'
                ? 'O contrato soma o pagamento em produto já transferido.'
                : 'Opcional.'
            }
          >
            <Selecao
              id="ti-contrato"
              value={d.contratoId}
              onChange={(e) => set({ contratoId: e.target.value })}
            >
              <option value="">Sem contrato</option>
              {contratosDasPartes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.contraparte}
                  {c.numero ? ` · ${c.numero}` : ''}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Cabecalho d={d} set={set} projetoId={projetoId} tipo="titularidade" />
        </CorpoCartao>
      </Cartao>
      <Cartao>
        <CabecalhoCartao titulo="Recipientes" />
        <CorpoCartao className="flex flex-col gap-4">
          {d.itens.map((i, n) => {
            const destino = i.destinoId ? rec(i.destinoId) : undefined;
            const destinoDoPara =
              destino?.lote && (destino.lote.titularId ?? null) === para ? destino.lote : null;
            return (
              <div key={n} className="grid items-end gap-2 border-b pb-4 sm:grid-cols-2">
                <Campo rotulo="Recipiente de origem" id={`ti-orig-${n}`}>
                  <Selecao
                    id={`ti-orig-${n}`}
                    value={i.origemId}
                    onChange={(e) => setItem(n, { origemId: e.target.value })}
                  >
                    <option value="">Escolha</option>
                    {recipientes.data
                      ?.filter((r) => r.id === i.origemId || (!!r.lote && !usados.has(r.id)))
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {rotulo(r)}
                        </option>
                      ))}
                  </Selecao>
                </Campo>
                <Campo rotulo="Litros" id={`ti-l-${n}`}>
                  {i.todo ? (
                    <p className="py-2 text-sm text-muted-foreground">todo o saldo</p>
                  ) : (
                    <CampoNumero
                      id={`ti-l-${n}`}
                      casas={2}
                      unidade="L"
                      valor={i.litros}
                      aoMudar={(v) => setItem(n, { litros: v })}
                    />
                  )}
                </Campo>
                <Campo
                  rotulo="Destino"
                  id={`ti-dest-${n}`}
                  ajuda="Uma parte só vai para outro recipiente."
                >
                  <Selecao
                    id={`ti-dest-${n}`}
                    value={i.destinoId}
                    onChange={(e) =>
                      setItem(n, {
                        destinoId: e.target.value,
                        todo: e.target.value ? i.todo : true,
                        lote: { novo: 'A' },
                      })
                    }
                  >
                    <option value="">O próprio recipiente (todo o saldo)</option>
                    {recipientes.data
                      ?.filter(
                        (r) =>
                          r.id === i.destinoId ||
                          (!usados.has(r.id) && (!r.lote || (r.lote.titularId ?? null) === para)),
                      )
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {rotulo(r)}
                        </option>
                      ))}
                  </Selecao>
                </Campo>
                <Campo rotulo="Lote do novo titular" id={`ti-lote-${n}`}>
                  <Selecao
                    id={`ti-lote-${n}`}
                    value={chaveRef(i.lote)}
                    onChange={(e) => setItem(n, { lote: daChave(e.target.value) })}
                  >
                    {destinoDoPara && (
                      <option value={`id:${destinoDoPara.id}`}>
                        Incorporar ao lote {destinoDoPara.codigo}
                      </option>
                    )}
                    {LETRAS.map((l) => (
                      <option key={l} value={`novo:${l}`}>
                        Lote novo {l}
                      </option>
                    ))}
                    {!destino?.lote &&
                      lotesDoPara.map((l) => (
                        <option key={l.id} value={`id:${l.id}`}>
                          Mesmo lote {l.codigo}
                        </option>
                      ))}
                  </Selecao>
                </Campo>
                <div className="flex items-center justify-between sm:col-span-2">
                  <Caixa
                    rotulo="Todo o saldo"
                    checked={i.todo}
                    disabled={!i.destinoId}
                    onChange={(e) => setItem(n, { todo: e.target.checked })}
                  />
                  <Botao
                    variante="fantasma"
                    tamanho="icone"
                    aria-label="Remover recipiente"
                    disabled={d.itens.length === 1}
                    onClick={() => set({ itens: d.itens.filter((_, j) => j !== n) })}
                  >
                    <Trash2 />
                  </Botao>
                </div>
              </div>
            );
          })}
          <div>
            <Botao
              variante="secundario"
              tamanho="pequeno"
              onClick={() =>
                set({
                  itens: [
                    ...d.itens,
                    { origemId: '', todo: true, litros: null, destinoId: '', lote: { novo: 'A' } },
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
