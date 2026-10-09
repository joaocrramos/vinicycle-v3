// EnoTrace › Espumante na garrafa (cantina.md, Espumantes; 04, roteiro do ciclo 9): tradicional e
// ancestral. A tiragem tira o vinho-base do recipiente para as garrafas em processo; cada estágio
// registra a data, as garrafas perdidas e os insumos; no fim, as garrafas viram produto acabado num
// lote comercial. Charmat e Asti seguem como vinho em recipiente (autoclave).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarDecimal } from '@vinicycle/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { PedirMotivo } from '@/componentes/PedirMotivo';
import { Aba, Abas, ListaAbas } from '@/componentes/ui/abas';
import { Botao } from '@/componentes/ui/botao';
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao';
import { Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos';
import { Pagina } from '@/layout/Estrutura';
import { api, ErroApi } from '@/lib/api';
import { nomeNaLista, useReferencia } from '@/lib/referencia';
import { fusoAtivo, pode, useSessao } from '@/lib/sessao';
import { formatarDataHora } from '@/lib/utils';
import { useItens, useLocais, useLotes } from './Estoque';
import { useRecipientes } from './operacoes/comum';

const F = 'enotrace.engarrafamento';
const METODOS = { tradicional: 'Tradicional (champenoise)', ancestral: 'Ancestral (pét-nat)' };
const SITUACAO: Record<string, { texto: string; tom: 'sucesso' | 'alerta' | 'neutro' }> = {
  em_processo: { texto: 'Em processo', tom: 'alerta' },
  finalizado: { texto: 'Finalizado', tom: 'sucesso' },
  cancelado: { texto: 'Cancelado', tom: 'neutro' },
};
const msg = (e: unknown) => (e instanceof ErroApi ? e.message : (e as Error).message);
const agoraLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const paraIso = (v: string) => new Date(v).toISOString();
const N = (n: number) => n.toLocaleString('pt-BR');

interface Material {
  itemId: string;
  loteItemId: string;
  quantidade: string;
}

/** Linhas de materiais ou insumos baixados no estoque, com o lote quando o item controla lote. */
function Materiais({
  linhas,
  mudar,
  localId,
  tipos,
}: {
  linhas: Material[];
  mudar: (l: Material[]) => void;
  localId: string;
  tipos: string[];
}) {
  const itens = useItens();
  const opcoes = itens.data?.filter((i) => tipos.includes(i.tipo)) ?? [];
  return (
    <div className="flex flex-col gap-2">
      {linhas.map((l, n) => (
        <LinhaMaterial
          key={n}
          linha={l}
          localId={localId}
          opcoes={opcoes}
          mudar={(p) => mudar(linhas.map((x, j) => (j === n ? { ...x, ...p } : x)))}
          tirar={() => mudar(linhas.filter((_, j) => j !== n))}
        />
      ))}
      <div>
        <Botao
          variante="secundario"
          onClick={() => mudar([...linhas, { itemId: '', loteItemId: '', quantidade: '' }])}
        >
          <Plus /> Item
        </Botao>
      </div>
    </div>
  );
}

function LinhaMaterial({
  linha,
  localId,
  opcoes,
  mudar,
  tirar,
}: {
  linha: Material;
  localId: string;
  opcoes: Array<{ id: string; nome: string; unidadeBase: string; controlaLote: boolean }>;
  mudar: (p: Partial<Material>) => void;
  tirar: () => void;
}) {
  const item = opcoes.find((o) => o.id === linha.itemId);
  const lotes = useLotes(item?.controlaLote ? item.id : '', localId || undefined);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Selecao
        aria-label="Item"
        className="w-64"
        value={linha.itemId}
        onChange={(e) => mudar({ itemId: e.target.value, loteItemId: '' })}
      >
        <option value="">Escolha o item</option>
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))}
      </Selecao>
      {item?.controlaLote && (
        <Selecao
          aria-label="Lote"
          className="w-44"
          value={linha.loteItemId}
          onChange={(e) => mudar({ loteItemId: e.target.value })}
        >
          <option value="">Lote</option>
          {lotes.data?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.codigo} ({formatarDecimal(l.saldo, 3)})
            </option>
          ))}
        </Selecao>
      )}
      <Entrada
        aria-label="Quantidade"
        inputMode="decimal"
        className="w-28"
        value={linha.quantidade}
        onChange={(e) => mudar({ quantidade: e.target.value })}
      />
      <span className="text-sm text-muted-foreground">{item?.unidadeBase}</span>
      <Botao variante="fantasma" tamanho="icone" aria-label="Tirar" onClick={tirar}>
        <Trash2 />
      </Botao>
    </div>
  );
}

const materiaisApi = (linhas: Material[]) =>
  linhas
    .filter((l) => l.itemId && Number(l.quantidade.replace(',', '.')) > 0)
    .map((l) => ({
      itemId: l.itemId,
      loteItemId: l.loteItemId || null,
      quantidade: l.quantidade.replace(',', '.'),
    }));

export function ListaEspumantes() {
  const { data: s } = useSessao();
  const fuso = fusoAtivo(s);
  const navegar = useNavigate();
  const { data: ref } = useReferencia();
  const [situacao, setSituacao] = useState('em_processo');
  const q = useQuery({
    queryKey: ['espumantes', situacao],
    queryFn: () =>
      api.get<
        Array<{
          id: string;
          codigo: string;
          metodo: keyof typeof METODOS;
          situacao: string;
          tiragemEm: string;
          garrafas: number;
          garrafasIniciais: number;
          volumeMl: number;
          projeto: string;
          projetoCodigo: string;
          estagio: string | null;
          loteComercial: string | null;
        }>
      >(`/api/espumantes?situacao=${situacao}`),
  });
  return (
    <Pagina
      titulo="Espumante na garrafa"
      trilha={['EnoTrace', 'Envase e estoque']}
      acoes={
        pode(s, F, 'confirmar') && (
          <Botao onClick={() => navegar('/enotrace/espumantes/tiragem')}>
            <Plus /> Nova tiragem
          </Botao>
        )
      }
    >
      <p className="text-sm text-muted-foreground">
        Método tradicional e ancestral: as garrafas em processo, da tiragem ao produto acabado. O
        Charmat e o Asti seguem como vinho em recipiente (autoclave). Os estágios vêm da lista
        &quot;Estágios do espumante na garrafa&quot; (Cadastros › Catálogos).
      </p>
      <Abas value={situacao} onValueChange={setSituacao}>
        <ListaAbas>
          <Aba value="em_processo">Em processo</Aba>
          <Aba value="finalizado">Finalizados</Aba>
          <Aba value="todos">Todos</Aba>
        </ListaAbas>
      </Abas>
      <Cartao>
        <CorpoCartao className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 pl-5 font-medium">Lote</th>
                <th className="py-2 pr-4 font-medium">Projeto</th>
                <th className="py-2 pr-4 font-medium">Tiragem</th>
                <th className="py-2 pr-4 text-right font-medium">Garrafas</th>
                <th className="py-2 pr-4 font-medium">Estágio</th>
                <th className="py-2 pr-5 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.map((l) => (
                <tr
                  key={l.id}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
                  onClick={() => navegar(`/enotrace/espumantes/${l.id}`)}
                >
                  <td className="py-2 pr-4 pl-5">
                    <Link to={`/enotrace/espumantes/${l.id}`} className="hover:underline">
                      {l.codigo}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{METODOS[l.metodo]}</span>
                  </td>
                  <td className="py-2 pr-4">
                    {l.projetoCodigo} · {l.projeto}
                  </td>
                  <td className="py-2 pr-4">{formatarDataHora(l.tiragemEm, fuso)}</td>
                  <td className="py-2 pr-4 text-right">
                    {N(l.garrafas)} × {l.volumeMl} mL
                  </td>
                  <td className="py-2 pr-4">
                    {l.estagio ? nomeNaLista(ref, 'estagio_espumante', l.estagio) : 'Tiragem'}
                  </td>
                  <td className="py-2 pr-5">
                    <Etiqueta tom={SITUACAO[l.situacao]?.tom}>
                      {SITUACAO[l.situacao]?.texto}
                    </Etiqueta>
                    {l.loteComercial && <span className="ml-2 text-xs">{l.loteComercial}</span>}
                  </td>
                </tr>
              ))}
              {q.data && !q.data.length && (
                <tr>
                  <td colSpan={6} className="px-5 py-4 text-center text-muted-foreground">
                    Nenhum lote de tiragem.
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

export function NovaTiragem() {
  const navegar = useNavigate();
  const recipientes = useRecipientes();
  const locais = useLocais();
  const [d, setD] = useState({
    executadoEm: agoraLocal(),
    metodo: 'tradicional' as keyof typeof METODOS,
    recipientes: [{ recipienteId: '', litros: '' }],
    volumeMl: '750',
    garrafas: '',
    materiais: [] as Material[],
    localEstoqueId: '',
    observacao: '',
  });
  const [previa, setPrevia] = useState<{
    tiradosLitros: string;
    garrafasLitros: string;
    perdaLitros: string;
    avisos: Array<{ codigo: string; mensagem: string }>;
    bloqueios: string[];
  } | null>(null);
  const [cientes, setCientes] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const set = (p: Partial<typeof d>) => {
    setPrevia(null);
    setD({ ...d, ...p });
  };
  const corpo = () => ({
    executadoEm: paraIso(d.executadoEm),
    metodo: d.metodo,
    recipientes: d.recipientes
      .filter((r) => r.recipienteId && r.litros)
      .map((r) => ({ recipienteId: r.recipienteId, litros: r.litros.replace(',', '.') })),
    volumeMl: Number(d.volumeMl),
    garrafas: Number(d.garrafas),
    materiais: materiaisApi(d.materiais),
    localEstoqueId: d.localEstoqueId || null,
    observacao: d.observacao || null,
    cientes,
  });
  const comVinho = recipientes.data?.filter((r) => Number(r.volume) > 0) ?? [];
  return (
    <Pagina titulo="Nova tiragem" trilha={['EnoTrace', 'Espumante na garrafa']}>
      <p className="text-sm text-muted-foreground">
        O vinho-base sai do recipiente para as garrafas em processo. Os materiais da tiragem (licor
        de tiragem, levedura, tampa-coroa) saem do estoque.
      </p>
      <Cartao>
        <CorpoCartao className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Método" id="ti-metodo">
            <Selecao
              id="ti-metodo"
              value={d.metodo}
              onChange={(e) => set({ metodo: e.target.value as keyof typeof METODOS })}
            >
              {Object.entries(METODOS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Data e hora" id="ti-data">
            <Entrada
              id="ti-data"
              type="datetime-local"
              value={d.executadoEm}
              onChange={(e) => set({ executadoEm: e.target.value })}
            />
          </Campo>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <p className="text-sm font-medium">Vinho-base (recipientes e litros tirados)</p>
            {d.recipientes.map((r, n) => (
              <div key={n} className="flex flex-wrap items-center gap-2">
                <Selecao
                  aria-label="Recipiente"
                  className="w-72"
                  value={r.recipienteId}
                  onChange={(e) =>
                    set({
                      recipientes: d.recipientes.map((x, j) =>
                        j === n ? { ...x, recipienteId: e.target.value } : x,
                      ),
                    })
                  }
                >
                  <option value="">Escolha o recipiente</option>
                  {comVinho.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.codigo} · {x.lote?.codigo ?? ''} · {formatarDecimal(x.volume, 2)} L
                    </option>
                  ))}
                </Selecao>
                <Entrada
                  aria-label="Litros"
                  inputMode="decimal"
                  className="w-32"
                  value={r.litros}
                  onChange={(e) =>
                    set({
                      recipientes: d.recipientes.map((x, j) =>
                        j === n ? { ...x, litros: e.target.value } : x,
                      ),
                    })
                  }
                />
                <span className="text-sm text-muted-foreground">L</span>
                {d.recipientes.length > 1 && (
                  <Botao
                    variante="fantasma"
                    tamanho="icone"
                    aria-label="Tirar"
                    onClick={() => set({ recipientes: d.recipientes.filter((_, j) => j !== n) })}
                  >
                    <Trash2 />
                  </Botao>
                )}
              </div>
            ))}
            <div>
              <Botao
                variante="secundario"
                onClick={() =>
                  set({ recipientes: [...d.recipientes, { recipienteId: '', litros: '' }] })
                }
              >
                <Plus /> Recipiente
              </Botao>
            </div>
          </div>
          <Campo rotulo="Garrafa (mL)" id="ti-ml">
            <Entrada
              id="ti-ml"
              inputMode="numeric"
              value={d.volumeMl}
              onChange={(e) => set({ volumeMl: e.target.value.replace(/\D/g, '') })}
            />
          </Campo>
          <Campo rotulo="Garrafas" id="ti-garrafas">
            <Entrada
              id="ti-garrafas"
              inputMode="numeric"
              value={d.garrafas}
              onChange={(e) => set({ garrafas: e.target.value.replace(/\D/g, '') })}
            />
          </Campo>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <p className="text-sm font-medium">Materiais da tiragem (opcional)</p>
            {d.materiais.length > 0 && (
              <Campo rotulo="Local de onde saem" id="ti-local">
                <Selecao
                  id="ti-local"
                  className="w-64"
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
            <Materiais
              linhas={d.materiais}
              mudar={(materiais) => set({ materiais })}
              localId={d.localEstoqueId}
              tipos={['insumo', 'embalagem', 'outro']}
            />
          </div>
          <Campo rotulo="Observação" id="ti-obs" className="sm:col-span-2">
            <Entrada
              id="ti-obs"
              value={d.observacao}
              onChange={(e) => set({ observacao: e.target.value })}
            />
          </Campo>
        </CorpoCartao>
      </Cartao>
      {previa && (
        <Cartao>
          <CorpoCartao className="flex flex-col gap-2 text-sm">
            <p>
              Tirados {formatarDecimal(previa.tiradosLitros, 2)} L; nas garrafas{' '}
              {formatarDecimal(previa.garrafasLitros, 2)} L; perda{' '}
              {formatarDecimal(previa.perdaLitros, 2)} L.
            </p>
            {previa.bloqueios.map((b) => (
              <Aviso key={b} tom="erro">
                {b}
              </Aviso>
            ))}
            {previa.avisos.map((a) => (
              <div key={a.codigo} className="flex flex-wrap items-center gap-3">
                <span className="flex-1">{a.mensagem}</span>
                <Caixa
                  rotulo="Estou ciente"
                  checked={cientes.includes(a.codigo)}
                  onChange={(e) =>
                    setCientes(
                      e.target.checked
                        ? [...cientes, a.codigo]
                        : cientes.filter((x) => x !== a.codigo),
                    )
                  }
                />
              </div>
            ))}
          </CorpoCartao>
        </Cartao>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <div className="flex gap-2">
        <Botao
          variante="secundario"
          onClick={async () => {
            setErro(null);
            try {
              setPrevia(await api.post('/api/espumantes/tiragem/previa', corpo()));
            } catch (e) {
              setErro(msg(e));
            }
          }}
        >
          Prévia
        </Botao>
        <Botao
          disabled={
            !previa ||
            previa.bloqueios.length > 0 ||
            previa.avisos.some((a) => !cientes.includes(a.codigo))
          }
          onClick={async () => {
            setErro(null);
            try {
              const r = await api.post<{ id: string }>('/api/espumantes/tiragem', corpo());
              navegar(`/enotrace/espumantes/${r.id}`);
            } catch (e) {
              setErro(msg(e));
            }
          }}
        >
          Confirmar a tiragem
        </Botao>
      </div>
    </Pagina>
  );
}

interface Lote {
  id: string;
  codigo: string;
  metodo: keyof typeof METODOS;
  situacao: string;
  tiragemEm: string;
  volumeMl: number;
  garrafasIniciais: number;
  garrafas: number;
  litros: string;
  garrafasFinais: number | null;
  finalizadoEm: string | null;
  observacao: string | null;
  operacaoId: string;
  operacao: { codigo: string; situacao: string };
  projetoId: string;
  projeto: { codigo: string; nome: string };
  loteComercial: { id: string; codigo: string } | null;
  eventos: Array<{
    id: string;
    estagio: string;
    nome: string | null;
    executadoEm: string;
    perdas: number;
    insumos: Array<{ itemId: string; quantidade: string }> | null;
    observacao: string | null;
    anuladoEm: string | null;
    motivoAnulacao: string | null;
    por: string | null;
  }>;
}

export function FichaEspumante() {
  const { id = '' } = useParams();
  const { data: s } = useSessao();
  const fuso = fusoAtivo(s);
  const qc = useQueryClient();
  const { data: ref } = useReferencia();
  const locais = useLocais();
  const itens = useItens();
  const q = useQuery({
    queryKey: ['espumante', id],
    queryFn: () => api.get<Lote>(`/api/espumantes/${id}`),
  });
  const [estagio, setEstagio] = useState({
    estagio: '',
    executadoEm: agoraLocal(),
    perdas: '',
    insumos: [] as Material[],
    localEstoqueId: '',
    observacao: '',
  });
  const [fim, setFim] = useState({
    executadoEm: agoraLocal(),
    produtoId: '',
    formatoId: '',
    localId: '',
  });
  const [anulando, setAnulando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const produtos = useQuery({
    queryKey: ['produtos-ativos'],
    queryFn: async () =>
      (
        await api.get<{ itens: Array<{ id: string; nome: string; marca: string }> }>(
          '/api/produtos?tamanho=0',
        )
      ).itens,
  });
  const produto = useQuery({
    queryKey: ['produto', fim.produtoId],
    queryFn: () =>
      api.get<{ formatos: Array<{ id: string; volumeMl: number; ativo: boolean }> }>(
        `/api/produtos/${fim.produtoId}`,
      ),
    enabled: !!fim.produtoId,
  });
  const atualizar = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['espumante', id] }),
      qc.invalidateQueries({ queryKey: ['espumantes'] }),
    ]);
  const executar = async (f: () => Promise<unknown>, okTexto?: string) => {
    setErro(null);
    setOkMsg(null);
    try {
      await f();
      if (okTexto) setOkMsg(okTexto);
      await atualizar();
    } catch (e) {
      setErro(msg(e));
    }
  };
  const l = q.data;
  if (q.error) return <Aviso tom="erro">{msg(q.error)}</Aviso>;
  if (!l) return null;
  const emProcesso = l.situacao === 'em_processo';
  const podeLancar = pode(s, F, 'confirmar');
  const nomeItem = (itemId: string) => itens.data?.find((i) => i.id === itemId)?.nome ?? '';
  const formatos = produto.data?.formatos.filter((f) => f.ativo && f.volumeMl === l.volumeMl) ?? [];
  return (
    <Pagina titulo={l.codigo} trilha={['EnoTrace', 'Espumante na garrafa']}>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Etiqueta tom={SITUACAO[l.situacao]?.tom}>{SITUACAO[l.situacao]?.texto}</Etiqueta>
        <span>{METODOS[l.metodo]}</span>
        <Link className="underline" to={`/enotrace/projetos/${l.projetoId}`}>
          {l.projeto.codigo} · {l.projeto.nome}
        </Link>
        <span className="text-muted-foreground">
          tiragem{' '}
          <Link className="underline" to={`/enotrace/operacoes/${l.operacaoId}`}>
            {l.operacao.codigo}
          </Link>{' '}
          em {formatarDataHora(l.tiragemEm, fuso)}
        </span>
      </div>
      <Cartao>
        <CorpoCartao className="grid gap-2 text-sm sm:grid-cols-3">
          <p>
            Garrafas na tiragem: <strong>{N(l.garrafasIniciais)}</strong> × {l.volumeMl} mL
          </p>
          <p>
            Garrafas agora: <strong>{N(l.garrafas)}</strong> (
            {formatarDecimal(((l.garrafas * l.volumeMl) / 1000).toFixed(2), 2)} L)
          </p>
          <p>Perdidas: {N(l.garrafasIniciais - l.garrafas)}</p>
          {l.loteComercial && (
            <p className="sm:col-span-3">
              Finalizado em {formatarDataHora(l.finalizadoEm!, fuso)}: {N(l.garrafasFinais ?? 0)}{' '}
              garrafas no lote comercial{' '}
              <Link
                className="underline"
                to={`/enotrace/historia?loteComercial=${l.loteComercial.id}`}
              >
                {l.loteComercial.codigo}
              </Link>
              .
            </p>
          )}
        </CorpoCartao>
      </Cartao>
      <Cartao>
        <CabecalhoCartao titulo="Estágios" />
        <CorpoCartao className="flex flex-col divide-y p-0 text-sm">
          {l.eventos.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-2">
              <span className="font-medium">{formatarDataHora(e.executadoEm, fuso)}</span>
              <span className={e.anuladoEm ? 'text-muted-foreground line-through' : ''}>
                {e.nome ?? e.estagio}
                {e.perdas > 0 && ` · ${N(e.perdas)} perdidas`}
                {e.insumos?.length
                  ? ` · ${e.insumos.map((i) => `${nomeItem(i.itemId)} ${formatarDecimal(i.quantidade, 3)}`).join(', ')}`
                  : ''}
                {e.observacao && ` · ${e.observacao}`}
              </span>
              <span className="text-muted-foreground">{e.por}</span>
              {e.anuladoEm && (
                <span className="text-xs text-muted-foreground">Anulado: {e.motivoAnulacao}</span>
              )}
              {!e.anuladoEm && emProcesso && pode(s, F, 'estornar') && (
                <Botao variante="secundario" className="ml-auto" onClick={() => setAnulando(e.id)}>
                  Anular
                </Botao>
              )}
            </div>
          ))}
          {!l.eventos.length && (
            <p className="px-5 py-4 text-center text-muted-foreground">
              Nenhum estágio registrado depois da tiragem.
            </p>
          )}
        </CorpoCartao>
      </Cartao>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {okMsg && <Aviso tom="sucesso">{okMsg}</Aviso>}
      {emProcesso && podeLancar && (
        <Cartao>
          <CabecalhoCartao
            titulo="Registrar estágio"
            descricao="Data, garrafas perdidas (quebradas) e os insumos usados, como o licor de expedição."
          />
          <CorpoCartao className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo rotulo="Estágio" id="es-estagio">
                <Selecao
                  id="es-estagio"
                  value={estagio.estagio}
                  onChange={(e) => setEstagio({ ...estagio, estagio: e.target.value })}
                >
                  <option value="">Escolha</option>
                  {ref?.listas.estagio_espumante?.map((o) => (
                    <option key={o.codigo} value={o.codigo}>
                      {o.nome}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Campo rotulo="Data e hora" id="es-data">
                <Entrada
                  id="es-data"
                  type="datetime-local"
                  value={estagio.executadoEm}
                  onChange={(e) => setEstagio({ ...estagio, executadoEm: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Garrafas perdidas" id="es-perdas">
                <Entrada
                  id="es-perdas"
                  inputMode="numeric"
                  value={estagio.perdas}
                  onChange={(e) =>
                    setEstagio({ ...estagio, perdas: e.target.value.replace(/\D/g, '') })
                  }
                />
              </Campo>
            </div>
            <p className="text-sm font-medium">Insumos (opcional)</p>
            {estagio.insumos.length > 0 && (
              <Selecao
                aria-label="Local de onde saem"
                className="w-64"
                value={estagio.localEstoqueId}
                onChange={(e) => setEstagio({ ...estagio, localEstoqueId: e.target.value })}
              >
                <option value="">Local de onde saem</option>
                {locais.data?.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nome}
                  </option>
                ))}
              </Selecao>
            )}
            <Materiais
              linhas={estagio.insumos}
              mudar={(insumos) => setEstagio({ ...estagio, insumos })}
              localId={estagio.localEstoqueId}
              tipos={['insumo', 'embalagem', 'outro']}
            />
            <Campo rotulo="Observação" id="es-obs">
              <Entrada
                id="es-obs"
                value={estagio.observacao}
                onChange={(e) => setEstagio({ ...estagio, observacao: e.target.value })}
              />
            </Campo>
            <div>
              <Botao
                disabled={!estagio.estagio}
                onClick={() =>
                  executar(async () => {
                    await api.post(`/api/espumantes/${l.id}/estagios`, {
                      estagio: estagio.estagio,
                      executadoEm: paraIso(estagio.executadoEm),
                      perdas: Number(estagio.perdas || 0),
                      insumos: materiaisApi(estagio.insumos),
                      localEstoqueId: estagio.localEstoqueId || null,
                      observacao: estagio.observacao || null,
                    });
                    setEstagio({ ...estagio, perdas: '', insumos: [], observacao: '' });
                  }, 'Estágio registrado.')
                }
              >
                Registrar
              </Botao>
            </div>
          </CorpoCartao>
        </Cartao>
      )}
      {emProcesso && podeLancar && (
        <Cartao>
          <CabecalhoCartao
            titulo="Finalizar"
            descricao={`As ${N(l.garrafas)} garrafas viram produto acabado num lote comercial. O formato precisa ser de ${l.volumeMl} mL.`}
          />
          <CorpoCartao className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Produto" id="fi-produto">
                <Selecao
                  id="fi-produto"
                  value={fim.produtoId}
                  onChange={(e) => setFim({ ...fim, produtoId: e.target.value, formatoId: '' })}
                >
                  <option value="">Escolha</option>
                  {produtos.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome} · {p.marca}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Campo
                rotulo="Formato"
                id="fi-formato"
                ajuda={
                  fim.produtoId && !formatos.length
                    ? `O produto não tem formato de ${l.volumeMl} mL.`
                    : undefined
                }
              >
                <Selecao
                  id="fi-formato"
                  value={fim.formatoId}
                  onChange={(e) => setFim({ ...fim, formatoId: e.target.value })}
                >
                  <option value="">Escolha</option>
                  {formatos.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.volumeMl} mL
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Campo rotulo="Local do produto" id="fi-local">
                <Selecao
                  id="fi-local"
                  value={fim.localId}
                  onChange={(e) => setFim({ ...fim, localId: e.target.value })}
                >
                  <option value="">Escolha</option>
                  {locais.data?.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nome}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Campo rotulo="Data e hora" id="fi-data">
                <Entrada
                  id="fi-data"
                  type="datetime-local"
                  value={fim.executadoEm}
                  onChange={(e) => setFim({ ...fim, executadoEm: e.target.value })}
                />
              </Campo>
            </div>
            <div>
              <Botao
                disabled={!fim.formatoId || !fim.localId}
                onClick={() =>
                  executar(async () => {
                    const r = await api.post<{ loteComercial: string; garrafas: number }>(
                      `/api/espumantes/${l.id}/finalizar`,
                      { ...fim, executadoEm: paraIso(fim.executadoEm) },
                    );
                    setOkMsg(`${N(r.garrafas)} garrafas no lote comercial ${r.loteComercial}.`);
                  })
                }
              >
                Finalizar
              </Botao>
            </div>
          </CorpoCartao>
        </Cartao>
      )}
      <PedirMotivo
        aberto={!!anulando}
        aoMudar={(v) => !v && setAnulando(null)}
        titulo="Anular o estágio"
        descricao="As garrafas perdidas voltam à conta, e os insumos voltam ao estoque."
        rotuloBotao="Anular"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/espumantes/${l.id}/estagios/${anulando}/anular`, { motivo });
          setAnulando(null);
          await atualizar();
        }}
      />
    </Pagina>
  );
}
