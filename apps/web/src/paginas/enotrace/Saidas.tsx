// EnoTrace › Saídas (cantina.md, Saídas de produto): venda, degustação e cortesia, quebra e avaria,
// consumo interno, doação (lista configurável), manual ou pela nota de venda; a baixa por lote pela
// estratégia da empresa; devolução ao lote de origem; e o recolhimento ("quem recebeu o lote X").
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarDecimal } from '@vinicycle/shared';
import { Plus, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { BotaoIcone } from '@/componentes/AcoesLinha';
import { PedirMotivo } from '@/componentes/PedirMotivo';
import { Botao } from '@/componentes/ui/botao';
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao';
import { Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos';
import { Pagina } from '@/layout/Estrutura';
import { api, ErroApi } from '@/lib/api';
import { nomeNaLista, useReferencia } from '@/lib/referencia';
import { fusoAtivo, pode, useSessao } from '@/lib/sessao';
import { formatarDataHora } from '@/lib/utils';
import { useLocais } from './Estoque';
import { agora, doCampo } from './operacoes/comum';

const F = 'enotrace.saidas';

const mensagem = (e: unknown) =>
  e instanceof ErroApi && e.campos.length
    ? `${e.message} ${e.campos.map((c) => c.mensagem).join(' ')}`
    : (e as Error).message;
const un = (v: string) => formatarDecimal(v, Number(v) % 1 ? 3 : 0);

const ESTRATEGIAS: Record<string, string> = {
  documento: 'lote da nota',
  escolha: 'lote escolhido',
  mais_antigo: 'mais antigo primeiro',
  sem_lote: 'sem lote',
};

// Lista ------------------------------------------------------------------------------------------

interface LinhaSaida {
  id: string;
  tipo: string;
  origem: 'manual' | 'xml';
  executadoEm: string;
  documento: string | null;
  destinatario: string | null;
  situacao: 'lancada' | 'estornada';
  itens: string | null;
}

export function ListaSaidas() {
  const navegar = useNavigate();
  const { data: s } = useSessao();
  const { data: ref } = useReferencia();
  const fuso = fusoAtivo(s);
  const [tipo, setTipo] = useState('');
  const q = useQuery({
    queryKey: ['saidas', tipo],
    queryFn: () => api.get<LinhaSaida[]>(`/api/saidas${tipo ? `?tipo=${tipo}` : ''}`),
  });
  return (
    <Pagina
      titulo="Saídas"
      trilha={['EnoTrace']}
      acoes={
        <div className="flex gap-2">
          <Botao variante="secundario" onClick={() => navegar('/enotrace/saidas/notas')}>
            Notas de venda
          </Botao>
          {pode(s, F, 'criar') && (
            <Botao onClick={() => navegar('/enotrace/saidas/nova')}>
              <Plus /> Nova saída
            </Botao>
          )}
        </div>
      }
    >
      <p className="text-sm text-muted-foreground">
        Venda e outras saídas de vinho engarrafado, com o lote de cada garrafa. Vendas de qualquer
        emissor entram pelo XML da nota (Notas de venda).
      </p>
      <Selecao
        aria-label="Tipo"
        className="w-56"
        value={tipo}
        onChange={(e) => setTipo(e.target.value)}
      >
        <option value="">Todos os tipos</option>
        {(ref?.listas.tipo_saida ?? []).map((o) => (
          <option key={o.codigo} value={o.codigo}>
            {o.nome}
          </option>
        ))}
      </Selecao>
      <Cartao>
        <CorpoCartao className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className="px-5 py-2 font-medium">Data</th>
                <th className="py-2 pr-4 font-medium">Tipo</th>
                <th className="py-2 pr-4 font-medium">Destinatário</th>
                <th className="py-2 pr-4 font-medium">Itens</th>
                <th className="py-2 pr-5 font-medium">Documento</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.map((x) => (
                <tr
                  key={x.id}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
                  onClick={() => navegar(`/enotrace/saidas/${x.id}`)}
                >
                  <td className="px-5 py-2">
                    <Link className="underline" to={`/enotrace/saidas/${x.id}`}>
                      {formatarDataHora(x.executadoEm, fuso)}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">
                    {nomeNaLista(ref, 'tipo_saida', x.tipo)}
                    {x.situacao === 'estornada' && (
                      <Etiqueta tom="neutro" className="ml-2">
                        Estornada
                      </Etiqueta>
                    )}
                  </td>
                  <td className="py-2 pr-4">{x.destinatario ?? 'Não identificado'}</td>
                  <td className="py-2 pr-4">{x.itens}</td>
                  <td className="py-2 pr-5">
                    {x.documento ?? '—'}
                    {x.origem === 'xml' && <span className="text-muted-foreground"> · XML</span>}
                  </td>
                </tr>
              ))}
              {q.data && !q.data.length && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-muted-foreground">
                    Nenhuma saída.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CorpoCartao>
      </Cartao>
    </Pagina>
  );
}

// Nova saída -------------------------------------------------------------------------------------

interface Disponivel {
  itemId: string;
  item: string;
  saldo: string;
  lotes: Array<{ id: string; codigo: string; saldo: string }>;
}

interface PreviaSaida {
  bloqueios: string[];
  avisos: Array<{ codigo: string; mensagem: string }>;
  baixas: Array<{ itemId: string; lote: string | null; quantidade: string; estrategia: string }>;
}

export function NovaSaida() {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const { data: ref } = useReferencia();
  const locais = useLocais();
  const [d, setD] = useState({
    tipo: 'venda',
    executadoEm: agora(),
    localId: '',
    documento: '',
    destinatarioDocumento: '',
    destinatarioNome: '',
    motivo: '',
    titularId: '',
    pessoaId: '',
    itens: [{ itemId: '', quantidade: '', loteItemId: '' }],
  });
  const clientes = useQuery({
    queryKey: ['pessoas-opcoes', 'cliente_vinificacao'],
    queryFn: () =>
      api.get<Array<{ id: string; nome: string }>>('/api/pessoas/opcoes?papel=cliente_vinificacao'),
  });
  const pessoas = useQuery({
    queryKey: ['pessoas-opcoes', 'todas'],
    queryFn: () => api.get<Array<{ id: string; nome: string }>>('/api/pessoas/opcoes'),
  });
  const doTitular = d.tipo === 'devolucao_titular' || d.tipo === 'entrega_ordem_titular';
  const [previa, setPrevia] = useState<PreviaSaida | null>(null);
  const [cientes, setCientes] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const set = (p: Partial<typeof d>) => {
    setPrevia(null);
    setCientes([]);
    setD({ ...d, ...p });
  };
  const setItem = (n: number, p: Partial<(typeof d.itens)[number]>) =>
    set({ itens: d.itens.map((x, j) => (j === n ? { ...x, ...p } : x)) });
  const disponivel = useQuery({
    queryKey: ['saidas-disponivel', d.localId, d.titularId, d.tipo],
    queryFn: () =>
      api.get<Disponivel[]>(
        `/api/saidas/disponivel?local=${d.localId}${d.titularId ? `&titular=${d.titularId}` : ''}${
          d.tipo === 'devolucao_titular' && d.titularId ? '&insumos=sim' : ''
        }`,
      ),
    enabled: !!d.localId,
  });
  const corpo = () => ({
    ...d,
    executadoEm: doCampo(d.executadoEm),
    destinatarioDocumento: d.destinatarioDocumento.replace(/\D/g, ''),
    titularId: d.titularId || null,
    pessoaId: d.pessoaId || null,
    itens: d.itens
      .filter((i) => i.itemId)
      .map((i) => ({
        itemId: i.itemId,
        quantidade: i.quantidade.replace(',', '.'),
        loteItemId: i.loteItemId || null,
      })),
    cientes,
  });
  async function executar(acao: () => Promise<void>) {
    setErro(null);
    try {
      await acao();
    } catch (e) {
      setErro(mensagem(e));
    }
  }
  const podeLancar =
    !!previa && !previa.bloqueios.length && previa.avisos.every((a) => cientes.includes(a.codigo));
  const tipos = (ref?.listas.tipo_saida ?? []).filter((o) => o.codigo !== 'transferencia');
  return (
    <Pagina titulo="Nova saída" trilha={['EnoTrace', 'Saídas']}>
      <Cartao>
        <CabecalhoCartao titulo="Saída" />
        <CorpoCartao className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Tipo" id="sd-tipo" obrigatorio ajuda="A lista se configura em Catálogos.">
            <Selecao id="sd-tipo" value={d.tipo} onChange={(e) => set({ tipo: e.target.value })}>
              {tipos.map((o) => (
                <option key={o.codigo} value={o.codigo}>
                  {o.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Data e hora" id="sd-data" obrigatorio>
            <Entrada
              id="sd-data"
              type="datetime-local"
              value={d.executadoEm}
              onChange={(e) => set({ executadoEm: e.target.value })}
            />
          </Campo>
          <Campo rotulo="Sai de" id="sd-local" obrigatorio>
            <Selecao
              id="sd-local"
              value={d.localId}
              onChange={(e) => set({ localId: e.target.value })}
            >
              <option value="">Escolha</option>
              {locais.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Documento" id="sd-doc" ajuda="Número da nota ou do cupom, se houver.">
            <Entrada
              id="sd-doc"
              value={d.documento}
              onChange={(e) => set({ documento: e.target.value })}
            />
          </Campo>
          <Campo
            rotulo="Destinatário"
            id="sd-dest"
            ajuda="Vazio = consumidor não identificado. É dado da saída, não vira cadastro (LGPD)."
          >
            <Entrada
              id="sd-dest"
              value={d.destinatarioNome}
              onChange={(e) => set({ destinatarioNome: e.target.value })}
            />
          </Campo>
          <Campo rotulo="CPF ou CNPJ do destinatário" id="sd-docdest">
            <Entrada
              id="sd-docdest"
              inputMode="numeric"
              value={d.destinatarioDocumento}
              onChange={(e) => set({ destinatarioDocumento: e.target.value.replace(/\D/g, '') })}
            />
          </Campo>
          <Campo
            rotulo="Dono do produto"
            id="sd-titular"
            ajuda="Vinificação para terceiros: a baixa usa só os lotes deste titular."
          >
            <Selecao
              id="sd-titular"
              value={d.titularId}
              onChange={(e) =>
                set({
                  titularId: e.target.value,
                  itens: d.itens.map((i) => ({ ...i, loteItemId: '' })),
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
          {doTitular && (
            <Campo
              rotulo={d.tipo === 'devolucao_titular' ? 'Entregue a' : 'Comprador do titular'}
              id="sd-pessoa"
              ajuda="Pessoa cadastrada que recebe."
            >
              <Selecao
                id="sd-pessoa"
                value={d.pessoaId}
                onChange={(e) => set({ pessoaId: e.target.value })}
              >
                <option value="">Escolha</option>
                {pessoas.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
          )}
          <Campo rotulo="Motivo" id="sd-motivo" className="sm:col-span-2">
            <Entrada
              id="sd-motivo"
              value={d.motivo}
              placeholder="Ex.: concurso, visita da imprensa, garrafa quebrada"
              onChange={(e) => set({ motivo: e.target.value })}
            />
          </Campo>
        </CorpoCartao>
      </Cartao>
      <Cartao>
        <CabecalhoCartao
          titulo="Produtos"
          descricao="Sem lote escolhido, a saída segue a estratégia da empresa (Configurações › Parâmetros)."
        />
        <CorpoCartao className="flex flex-col gap-3">
          {!d.localId && (
            <p className="text-sm text-muted-foreground">Escolha o local para ver os produtos.</p>
          )}
          {d.localId &&
            d.itens.map((i, n) => {
              const prod = disponivel.data?.find((x) => x.itemId === i.itemId);
              return (
                <div key={n} className="grid items-end gap-2 sm:grid-cols-[1fr_9rem_12rem_auto]">
                  <Campo rotulo="Produto" id={`sd-item-${n}`}>
                    <Selecao
                      id={`sd-item-${n}`}
                      value={i.itemId}
                      onChange={(e) => setItem(n, { itemId: e.target.value, loteItemId: '' })}
                    >
                      <option value="">Escolha</option>
                      {disponivel.data?.map((x) => (
                        <option key={x.itemId} value={x.itemId}>
                          {x.item} · {un(x.saldo)} no local
                        </option>
                      ))}
                    </Selecao>
                  </Campo>
                  <Campo rotulo="Quantidade" id={`sd-q-${n}`}>
                    <Entrada
                      id={`sd-q-${n}`}
                      inputMode="numeric"
                      className="text-right"
                      value={i.quantidade}
                      onChange={(e) =>
                        setItem(n, { quantidade: e.target.value.replace(/[^\d,]/g, '') })
                      }
                    />
                  </Campo>
                  <Campo rotulo="Lote" id={`sd-lote-${n}`}>
                    <Selecao
                      id={`sd-lote-${n}`}
                      value={i.loteItemId}
                      onChange={(e) => setItem(n, { loteItemId: e.target.value })}
                    >
                      <option value="">Pela estratégia</option>
                      {prod?.lotes.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.codigo} · {un(l.saldo)}
                        </option>
                      ))}
                    </Selecao>
                  </Campo>
                  <Botao
                    variante="fantasma"
                    tamanho="icone"
                    aria-label="Remover produto"
                    disabled={d.itens.length === 1}
                    onClick={() => set({ itens: d.itens.filter((_, j) => j !== n) })}
                  >
                    <Trash2 />
                  </Botao>
                </div>
              );
            })}
          {d.localId && (
            <div>
              <Botao
                variante="secundario"
                tamanho="pequeno"
                onClick={() =>
                  set({ itens: [...d.itens, { itemId: '', quantidade: '', loteItemId: '' }] })
                }
              >
                <Plus /> Produto
              </Botao>
            </div>
          )}
        </CorpoCartao>
      </Cartao>
      {previa && (
        <Cartao>
          <CabecalhoCartao titulo="Prévia" descricao="De qual lote sai cada produto." />
          <CorpoCartao className="flex flex-col gap-2 text-sm">
            {previa.bloqueios.map((b) => (
              <Aviso key={b} tom="erro">
                {b}
              </Aviso>
            ))}
            {previa.baixas.map((b, n) => (
              <p key={n}>
                {disponivel.data?.find((x) => x.itemId === b.itemId)?.item}: {un(b.quantidade)}{' '}
                {b.lote ? `do lote ${b.lote}` : 'sem lote'}{' '}
                <span className="text-muted-foreground">({ESTRATEGIAS[b.estrategia]})</span>
              </p>
            ))}
            {previa.avisos.map((a) => (
              <Aviso key={a.codigo}>
                {a.mensagem}
                <Caixa
                  rotulo="Estou ciente"
                  checked={cientes.includes(a.codigo)}
                  onChange={(e) =>
                    setCientes(
                      e.target.checked
                        ? [...cientes, a.codigo]
                        : cientes.filter((c) => c !== a.codigo),
                    )
                  }
                />
              </Aviso>
            ))}
          </CorpoCartao>
        </Cartao>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Botao
          variante="secundario"
          onClick={() =>
            executar(async () => {
              setPrevia(await api.post<PreviaSaida>('/api/saidas/previa', corpo()));
              setCientes([]);
            })
          }
        >
          Ver prévia
        </Botao>
        <Botao
          disabled={!podeLancar}
          onClick={() =>
            executar(async () => {
              const r = await api.post<{ id: string }>('/api/saidas', corpo());
              await qc.invalidateQueries({ queryKey: ['saidas'] });
              navegar(`/enotrace/saidas/${r.id}`);
            })
          }
        >
          Lançar saída
        </Botao>
      </div>
    </Pagina>
  );
}

// Ficha ------------------------------------------------------------------------------------------

interface FichaSaida {
  id: string;
  tipo: string;
  origem: 'manual' | 'xml';
  nfeId: string | null;
  executadoEm: string;
  documento: string | null;
  destinatarioDocumento: string | null;
  destinatarioNome: string | null;
  pessoa: string | null;
  titular: string | null;
  motivo: string | null;
  situacao: 'lancada' | 'estornada';
  motivoEstorno: string | null;
  baixas: Array<{
    id: string;
    item: string;
    unidade: string;
    quantidade: string;
    estrategia: string;
    lote: string | null;
    local: string;
    localId: string;
    devolvido: string;
  }>;
  devolucoes: Array<{
    id: string;
    executadoEm: string;
    documento: string | null;
    motivo: string | null;
    itens: Array<{
      item: string;
      quantidade: string;
      lote: string | null;
      local: string;
      avariada: boolean;
    }>;
  }>;
}

export function FichaSaida() {
  const { id = '' } = useParams();
  const { data: s } = useSessao();
  const { data: ref } = useReferencia();
  const fuso = fusoAtivo(s);
  const qc = useQueryClient();
  const [estornando, setEstornando] = useState(false);
  const [devolvendo, setDevolvendo] = useState(false);
  const q = useQuery({
    queryKey: ['saida', id],
    queryFn: () => api.get<FichaSaida>(`/api/saidas/${id}`),
  });
  if (!q.data)
    return (
      <p className="text-sm text-muted-foreground">
        {q.isError ? (q.error as Error).message : 'Carregando…'}
      </p>
    );
  const sa = q.data;
  const atualizar = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['saida', id] }),
      qc.invalidateQueries({ queryKey: ['saidas'] }),
    ]);
  const lancada = sa.situacao === 'lancada';
  return (
    <Pagina
      titulo={`${nomeNaLista(ref, 'tipo_saida', sa.tipo)} · ${formatarDataHora(sa.executadoEm, fuso)}`}
      trilha={['EnoTrace', 'Saídas']}
      acoes={
        lancada && (
          <div className="flex gap-2">
            {pode(s, F, 'criar') && (
              <Botao variante="secundario" onClick={() => setDevolvendo(true)}>
                Devolução
              </Botao>
            )}
            {pode(s, F, 'estornar') && (
              <BotaoIcone rotulo="Estornar a saída" contorno aoClicar={() => setEstornando(true)}>
                <Undo2 />
              </BotaoIcone>
            )}
          </div>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <Etiqueta tom={lancada ? 'sucesso' : 'neutro'}>
          {lancada ? 'Lançada' : 'Estornada'}
        </Etiqueta>
        <span>
          {sa.destinatarioNome ?? sa.pessoa ?? 'Consumidor não identificado'}
          {sa.destinatarioDocumento && ` · ${sa.destinatarioDocumento}`}
        </span>
        {sa.titular && <span>produto de {sa.titular}</span>}
        {sa.documento && <span>documento {sa.documento}</span>}
        {sa.nfeId && (
          <Link className="underline" to={`/enotrace/saidas/notas/${sa.nfeId}`}>
            nota importada
          </Link>
        )}
      </div>
      {sa.motivo && <p className="text-sm">Motivo: {sa.motivo}</p>}
      {sa.motivoEstorno && <Aviso tom="info">Estornada: {sa.motivoEstorno}</Aviso>}
      {devolvendo && (
        <Devolucao
          saida={sa}
          aoFechar={() => setDevolvendo(false)}
          aoConfirmar={async () => {
            setDevolvendo(false);
            await atualizar();
          }}
        />
      )}
      <Cartao>
        <CabecalhoCartao titulo="Baixas por lote" />
        <CorpoCartao className="flex flex-col gap-1 text-sm">
          {sa.baixas.map((b) => (
            <p key={b.id}>
              {b.item}: <strong>{un(b.quantidade)}</strong>{' '}
              {b.lote ? `do lote ${b.lote}` : 'sem lote'} em {b.local}{' '}
              <span className="text-muted-foreground">
                ({ESTRATEGIAS[b.estrategia]}
                {Number(b.devolvido) > 0 && `; voltaram ${un(b.devolvido)}`})
              </span>
            </p>
          ))}
        </CorpoCartao>
      </Cartao>
      {sa.devolucoes.length > 0 && (
        <Cartao>
          <CabecalhoCartao titulo="Devoluções" />
          <CorpoCartao className="flex flex-col gap-2 text-sm">
            {sa.devolucoes.map((d) => (
              <div key={d.id}>
                <p>
                  {formatarDataHora(d.executadoEm, fuso)}
                  {d.documento && ` · ${d.documento}`}
                  {d.motivo && ` · ${d.motivo}`}
                </p>
                <p className="text-muted-foreground">
                  {d.itens
                    .map(
                      (i) =>
                        `${i.item}: ${un(i.quantidade)}${i.lote ? ` do lote ${i.lote}` : ''} para ${i.local}${i.avariada ? ' (avariadas)' : ''}`,
                    )
                    .join(' · ')}
                </p>
              </div>
            ))}
          </CorpoCartao>
        </Cartao>
      )}
      <PedirMotivo
        aberto={estornando}
        aoMudar={setEstornando}
        titulo="Estornar a saída"
        descricao="As garrafas voltam ao estoque, nos mesmos lotes, com a data original. Saída com devolução não se estorna."
        rotuloBotao="Estornar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/saidas/${id}/estorno`, { motivo });
          setEstornando(false);
          await atualizar();
        }}
      />
    </Pagina>
  );
}

function Devolucao({
  saida,
  aoFechar,
  aoConfirmar,
}: {
  saida: FichaSaida;
  aoFechar: () => void;
  aoConfirmar: () => Promise<unknown>;
}) {
  const locais = useLocais();
  const [executadoEm, setExecutadoEm] = useState(agora());
  const [documento, setDocumento] = useState('');
  const [motivo, setMotivo] = useState('');
  const [linhas, setLinhas] = useState(() =>
    saida.baixas.map((b) => ({
      baixaId: b.id,
      quantidade: '',
      localId: b.localId,
      avariada: false,
    })),
  );
  const [erro, setErro] = useState<string | null>(null);
  const set = (n: number, p: Partial<(typeof linhas)[number]>) =>
    setLinhas(linhas.map((l, j) => (j === n ? { ...l, ...p } : l)));
  return (
    <Cartao>
      <CabecalhoCartao
        titulo="Devolução"
        descricao="As garrafas voltam ao mesmo lote. As que não servem para venda vão para um local de avariadas."
      />
      <CorpoCartao className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo rotulo="Data e hora" id="dv-data">
            <Entrada
              id="dv-data"
              type="datetime-local"
              value={executadoEm}
              onChange={(e) => setExecutadoEm(e.target.value)}
            />
          </Campo>
          <Campo rotulo="Documento" id="dv-doc" ajuda="Nota de devolução, se houver.">
            <Entrada id="dv-doc" value={documento} onChange={(e) => setDocumento(e.target.value)} />
          </Campo>
          <Campo rotulo="Motivo" id="dv-mot">
            <Entrada id="dv-mot" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </Campo>
        </div>
        {saida.baixas.map((b, n) => {
          const resta = Number(b.quantidade) - Number(b.devolvido);
          return (
            <div key={b.id} className="grid items-end gap-2 sm:grid-cols-[1fr_8rem_12rem_auto]">
              <p className="text-sm">
                {b.item} {b.lote ? `· ${b.lote}` : '· sem lote'}{' '}
                <span className="text-muted-foreground">(até {un(String(resta))})</span>
              </p>
              <Campo rotulo="Voltam" id={`dv-q-${n}`}>
                <Entrada
                  id={`dv-q-${n}`}
                  inputMode="numeric"
                  className="text-right"
                  disabled={resta <= 0}
                  value={linhas[n]!.quantidade}
                  onChange={(e) => set(n, { quantidade: e.target.value.replace(/[^\d,]/g, '') })}
                />
              </Campo>
              <Campo rotulo="Para" id={`dv-l-${n}`}>
                <Selecao
                  id={`dv-l-${n}`}
                  value={linhas[n]!.localId}
                  onChange={(e) => set(n, { localId: e.target.value })}
                >
                  {locais.data?.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Caixa
                rotulo="Avariada"
                checked={linhas[n]!.avariada}
                onChange={(e) => set(n, { avariada: e.target.checked })}
              />
            </div>
          );
        })}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <div className="flex gap-2">
          <Botao
            onClick={async () => {
              setErro(null);
              try {
                await api.post(`/api/saidas/${saida.id}/devolucao`, {
                  executadoEm: doCampo(executadoEm),
                  documento,
                  motivo,
                  itens: linhas
                    .filter((l) => Number(l.quantidade.replace(',', '.')) > 0)
                    .map((l) => ({ ...l, quantidade: l.quantidade.replace(',', '.') })),
                });
                await aoConfirmar();
              } catch (e) {
                setErro(mensagem(e));
              }
            }}
          >
            Lançar devolução
          </Botao>
          <Botao variante="fantasma" onClick={aoFechar}>
            Fechar
          </Botao>
        </div>
      </CorpoCartao>
    </Cartao>
  );
}

// Recolhimento -----------------------------------------------------------------------------------

export function RecolhimentoLote() {
  const { id = '' } = useParams();
  const { data: s } = useSessao();
  const { data: ref } = useReferencia();
  const fuso = fusoAtivo(s);
  const q = useQuery({
    queryKey: ['recolhimento', id],
    queryFn: () =>
      api.get<{
        codigo: string;
        saidasSemLote: number;
        destinos: Array<{
          saidaId: string;
          executadoEm: string;
          tipo: string;
          documento: string | null;
          destinatario: string | null;
          destinatarioDocumento: string | null;
          item: string;
          quantidade: string;
          devolvido: string;
        }>;
      }>(`/api/lotes-comerciais/${id}/destinos`),
  });
  if (!q.data) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const r = q.data;
  const total = r.destinos.reduce((t, x) => t + Number(x.quantidade) - Number(x.devolvido), 0);
  return (
    <Pagina titulo={`Quem recebeu o lote ${r.codigo}`} trilha={['EnoTrace', 'Lotes comerciais']}>
      <p className="text-sm text-muted-foreground">
        Relatório de recolhimento (recall): as saídas do lote, com o destinatário e o que voltou.
        Dados de compradores seguem a LGPD (P21).
      </p>
      {r.saidasSemLote > 0 && (
        <Aviso>
          Houve {r.saidasSemLote} {r.saidasSemLote === 1 ? 'saída' : 'saídas'} do mesmo produto sem
          lote desde o envase: essas garrafas podem ser deste lote.
        </Aviso>
      )}
      <Cartao>
        <CabecalhoCartao
          titulo={`${formatarDecimal(String(total), 0)} garrafas fora da vinícola`}
        />
        <CorpoCartao className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className="px-5 py-2 font-medium">Data</th>
                <th className="py-2 pr-4 font-medium">Tipo</th>
                <th className="py-2 pr-4 font-medium">Destinatário</th>
                <th className="py-2 pr-4 font-medium">Produto</th>
                <th className="py-2 pr-5 text-right font-medium">Quantidade</th>
              </tr>
            </thead>
            <tbody>
              {r.destinos.map((x, n) => (
                <tr key={n} className="border-b last:border-0">
                  <td className="px-5 py-2">
                    <Link className="underline" to={`/enotrace/saidas/${x.saidaId}`}>
                      {formatarDataHora(x.executadoEm, fuso)}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{nomeNaLista(ref, 'tipo_saida', x.tipo)}</td>
                  <td className="py-2 pr-4">
                    {x.destinatario ?? 'Consumidor não identificado'}
                    {x.destinatarioDocumento && (
                      <span className="text-muted-foreground"> · {x.destinatarioDocumento}</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">{x.item}</td>
                  <td className="py-2 pr-5 text-right">
                    {un(x.quantidade)}
                    {Number(x.devolvido) > 0 && (
                      <span className="text-muted-foreground"> (voltaram {un(x.devolvido)})</span>
                    )}
                  </td>
                </tr>
              ))}
              {!r.destinos.length && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-muted-foreground">
                    Nenhuma saída deste lote.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CorpoCartao>
      </Cartao>
    </Pagina>
  );
}
