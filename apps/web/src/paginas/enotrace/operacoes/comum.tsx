// Comum às telas de operação da cantina: prévia antes e depois por recipiente (cantina.md, Tela de
// registro em passos), rascunho, cabeçalho (execução, responsável, etapa do plano), seletor de lote
// e resíduos.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type Composicao,
  formatarDecimal,
  porVariedade,
  TIPOS_OPERACAO,
  type TipoOperacao,
} from '@vinicycle/shared';
import { Plus, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { CampoNumero } from '@/componentes/campos-especiais';
import { Botao } from '@/componentes/ui/botao';
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao } from '@/componentes/ui/cartao';
import { AreaTexto, Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos';
import { api, ErroApi } from '@/lib/api';
import { nomeNaLista, useReferencia } from '@/lib/referencia';
import { pode, useSessao } from '@/lib/sessao';
import { CartaoRotulo, type Rotulo } from '../Lotes';
import { litros, useEnologos } from '../Projetos';

export const F = 'enotrace.operacoes';

export const TIPOS_LIGACAO: Record<string, string> = {
  incorporacao: 'incorporação',
  corte: 'corte',
  lote_novo: 'lote novo',
  divisao: 'divisão',
  titularidade: 'transferência de titularidade',
};
export const LETRAS = ['A', 'B', 'C', 'D', 'E'];

export const paraCampo = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
export const agora = () => paraCampo(new Date().toISOString());
/**
 * O campo de execução vai até o minuto. Se o minuto escolhido é o atual, vale o instante atual:
 * senão a operação lançada agora ficaria antes de outra lançada segundos antes, no mesmo minuto.
 */
export const doCampo = (valor: string) => {
  const escolhido = new Date(valor);
  const agora = new Date();
  const diferenca = agora.getTime() - escolhido.getTime();
  return (diferenca >= 0 && diferenca < 60_000 ? agora : escolhido).toISOString();
};

/** Recipiente vindo do atalho do painel (`?recipiente=`), para abrir a operação já com ele. */
export const recipienteDaUrl = () =>
  new URLSearchParams(window.location.search).get('recipiente') ?? '';

// Apoio ----------------------------------------------------------------------------------------

export interface RecipienteSaldo {
  id: string;
  codigo: string;
  tipo: string;
  capacidadeLitros: string;
  situacao: string;
  volume: string;
  lote: {
    id: string;
    codigo: string;
    projetoId: string;
    titularId?: string | null;
    titular?: string | null;
  } | null;
}

export function useRecipientes() {
  return useQuery({
    queryKey: ['recipientes-saldo'],
    queryFn: async () =>
      (await api.get<{ itens: RecipienteSaldo[] }>('/api/recipientes?tamanho=0')).itens,
  });
}

export function useNomesVariedades() {
  return useQuery({
    queryKey: ['variedades-todas'],
    queryFn: async () =>
      new Map(
        (
          await api.get<{ itens: Array<{ id: string; nome: string }> }>(
            '/api/catalogos/variedade?tamanho=0&situacao=todos',
          )
        ).itens.map((v) => [v.id, v.nome]),
      ),
    staleTime: 10 * 60_000,
  });
}

export function useProjetos() {
  return useQuery({
    queryKey: ['projetos-opcoes'],
    queryFn: () =>
      api.get<Array<{ id: string; codigo: string; nome: string }>>('/api/projetos/opcoes'),
  });
}

export interface LoteProjeto {
  id: string;
  codigo: string;
  situacao: string;
  titularId?: string | null;
}

export function useLotesDoProjeto(projetoId: string) {
  return useQuery({
    queryKey: ['projeto', projetoId],
    queryFn: () =>
      api.get<{
        lotes: LoteProjeto[];
        plano: Array<{
          id: string;
          tipoOperacao: TipoOperacao;
          dataPrevista: string;
          executadas: unknown[];
        }>;
        enologoId: string | null;
      }>(`/api/projetos/${projetoId}`),
    enabled: !!projetoId,
  });
}

export function ResumoComposicao({ c }: { c: Composicao }) {
  const nomes = useNomesVariedades();
  const partes = porVariedade(c);
  if (!partes.length) return <span className="text-muted-foreground">—</span>;
  return (
    <span>
      {partes
        .map(
          (p) =>
            `${nomes.data?.get(p.variedadeId ?? '') ?? 'Não informada'} ${formatarDecimal((p.fracao * 100).toFixed(2), 2)}%`,
        )
        .join(' · ')}
      {c.chaptalizado && ' · chaptalizado'}
      {!!c.so2 && ` · SO₂ adicionado ${formatarDecimal(c.so2.toFixed(1), 1)} mg/L`}
    </span>
  );
}

export type RefLote = { id: string } | { novo: string };
export const chaveRef = (r: RefLote | null | undefined) =>
  !r ? '' : 'id' in r ? `id:${r.id}` : `novo:${r.novo}`;
export const daChave = (k: string): RefLote | null =>
  !k ? null : k.startsWith('id:') ? { id: k.slice(3) } : { novo: k.slice(5) };

/** Lote de destino: incorporar ao lote do recipiente, ao de outro recipiente do projeto, ou novo. */
export function SeletorLote({
  id,
  recipiente,
  lotes,
  valor,
  aoMudar,
  permitirMesmo,
  excluir,
}: {
  id: string;
  /** Lote já oferecido como "mesmo lote" (a massa da prensagem). */
  excluir?: string;
  recipiente: RecipienteSaldo | undefined;
  lotes: LoteProjeto[];
  valor: RefLote | null;
  aoMudar: (r: RefLote | null) => void;
  permitirMesmo?: string;
}) {
  return (
    <Selecao id={id} value={chaveRef(valor)} onChange={(e) => aoMudar(daChave(e.target.value))}>
      {permitirMesmo !== undefined && <option value="">{permitirMesmo}</option>}
      {recipiente?.lote && (
        <option value={`id:${recipiente.lote.id}`}>
          Incorporar ao lote {recipiente.lote.codigo}
        </option>
      )}
      {LETRAS.map((l) => (
        <option key={l} value={`novo:${l}`}>
          Lote novo {l}
        </option>
      ))}
      {!recipiente?.lote &&
        lotes
          .filter((l) => l.situacao === 'ativo' && l.id !== excluir)
          .map((l) => (
            <option key={l.id} value={`id:${l.id}`}>
              Mesmo lote {l.codigo}
            </option>
          ))}
    </Selecao>
  );
}

export interface Previa {
  recipientes: Array<{
    recipienteId: string;
    recipiente: string;
    capacidade: string;
    antes: { litros: string; loteId: string | null; composicao: Composicao };
    depois: { litros: string; lote: RefLote | null; composicao: Composicao };
  }>;
  perdas: Array<{
    recipienteId: string;
    recipiente: string;
    litros: string;
    motivo: string | null;
  }>;
  /** Trasfega e corte: composição de cada lote que recebe vinho e o que o rótulo pode declarar. */
  rotulos?: Array<{ lote: string; recipientes: string[]; composicao: Composicao; rotulo: Rotulo }>;
  avisos: Array<{ codigo: string; mensagem: string; fonte?: string }>;
  bloqueios: string[];
  /** Recipientes que esvaziam e passam a "aguardando higienização". */
  higienizar?: Array<{ recipienteId: string; recipiente: string }>;
}

/** Prévia antes de confirmar: volume e composição de cada recipiente, avisos e bloqueios. */
export function MostrarPrevia({
  previa,
  cientes,
  setCientes,
}: {
  previa: Previa;
  cientes: string[];
  setCientes: (c: string[]) => void;
}) {
  const { data: ref } = useReferencia();
  return (
    <Cartao>
      <CabecalhoCartao titulo="Prévia" descricao="Como cada recipiente fica depois da operação." />
      <CorpoCartao className="flex flex-col gap-3">
        {previa.bloqueios.map((b) => (
          <Aviso key={b} tom="erro">
            {b}
          </Aviso>
        ))}
        {previa.recipientes.length === 0 && !previa.bloqueios.length && (
          <p className="text-sm text-muted-foreground">
            Operação sem movimento de volume: nada muda no livro.
          </p>
        )}
        <div className={previa.recipientes.length ? 'overflow-x-auto' : 'hidden'}>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Recipiente</th>
                <th className="py-2 pr-3 font-medium">Antes</th>
                <th className="py-2 pr-3 font-medium">Depois</th>
                <th className="py-2 font-medium">Composição depois</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {previa.recipientes.map((r) => (
                <tr key={r.recipienteId}>
                  <td className="py-2 pr-3 font-medium">
                    {r.recipiente}
                    <span className="block text-xs font-normal text-muted-foreground">
                      cap. {litros(r.capacidade)}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{litros(r.antes.litros)}</td>
                  <td className="py-2 pr-3">
                    {litros(r.depois.litros)}
                    {r.depois.lote && 'novo' in r.depois.lote && (
                      <span className="block text-xs text-muted-foreground">
                        lote novo {r.depois.lote.novo}
                      </span>
                    )}
                  </td>
                  <td className="py-2">
                    <ResumoComposicao c={r.depois.composicao} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {previa.perdas.length > 0 && (
          <p className="text-sm">
            Perdas:{' '}
            {previa.perdas
              .map(
                (p) =>
                  `${p.recipiente} ${litros(p.litros)}${p.motivo ? ` (${nomeNaLista(ref, 'motivo_perda', p.motivo).toLowerCase()})` : ''}`,
              )
              .join('; ')}
          </p>
        )}
        {!!previa.higienizar?.length && (
          <p className="text-sm">
            Ficam vazios e passam a <strong>aguardando higienização</strong>:{' '}
            {previa.higienizar.map((h) => h.recipiente).join(', ')}.
          </p>
        )}
        {previa.rotulos?.map((r) => (
          <CartaoRotulo
            key={r.lote}
            rotulo={r.rotulo}
            titulo={`Lote ${r.lote} (${r.recipientes.join(', ')}): o que o rótulo pode declarar`}
            descricao="Pela composição do lote depois da operação. O sistema informa; não impede."
          />
        ))}
        {previa.avisos.map((a) => (
          <Aviso key={a.codigo} tom="alerta">
            <p>
              {a.mensagem} {a.fonte && <span className="text-xs">({a.fonte})</span>}
            </p>
            <Caixa
              rotulo="Estou ciente"
              checked={cientes.includes(a.codigo)}
              onChange={(e) =>
                setCientes(
                  e.target.checked ? [...cientes, a.codigo] : cientes.filter((c) => c !== a.codigo),
                )
              }
            />
          </Aviso>
        ))}
      </CorpoCartao>
    </Cartao>
  );
}

/** Rascunho carregado: o formulário salvo pela metade (cantina.md, Regras comuns: rascunho). */
export interface Rascunho {
  id: string;
  versao: number;
  formulario: Record<string, unknown>;
}

/**
 * Abre a página da operação vazia ou com o rascunho de `?rascunho=`. O parâmetro é lido uma vez:
 * salvar o primeiro rascunho só troca o endereço, sem recarregar o formulário.
 */
export function ComRascunho({ children }: { children: (r: Rascunho | null) => ReactNode }) {
  const [busca] = useSearchParams();
  const [id] = useState(() => busca.get('rascunho'));
  const q = useQuery({
    queryKey: ['operacao', id],
    queryFn: () =>
      api.get<{ id: string; versao: number; situacao: string; formulario: Rascunho['formulario'] }>(
        `/api/operacoes/${id}`,
      ),
    enabled: !!id,
    staleTime: Infinity,
  });
  if (!id) return children(null);
  if (!q.data)
    return (
      <p className="text-sm text-muted-foreground">
        {q.isError ? (q.error as Error).message : 'Carregando…'}
      </p>
    );
  if (q.data.situacao !== 'rascunho') return <Navigate to={`/enotrace/operacoes/${id}`} replace />;
  return children({ id: q.data.id, versao: q.data.versao, formulario: q.data.formulario });
}

/** Formulário salvo no rascunho: o estado da página, com o cabeçalho que a lista mostra. */
export type Formulario = Record<string, unknown> & {
  executadoEm: string;
  projetoId?: string;
  observacao?: string;
};

/** Prévia, rascunho e confirmação, comuns às operações. */
export function useEnvio(tipo: TipoOperacao, rascunho: Rascunho | null) {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [cientes, setCientes] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [atual, setAtual] = useState(rascunho && { id: rascunho.id, versao: rascunho.versao });
  const mensagem = (e: unknown) =>
    e instanceof ErroApi && e.campos.length
      ? `${e.message} ${e.campos.map((c) => c.mensagem).join(' ')}`
      : (e as Error).message;
  const executar = async (fn: () => Promise<void>) => {
    setErro(null);
    setEnviando(true);
    try {
      await fn();
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setEnviando(false);
    }
  };
  return {
    previa,
    cientes,
    setCientes,
    erro,
    salvo,
    enviando,
    rascunho: atual,
    limpar: () => {
      setPrevia(null);
      setSalvo(null);
    },
    verPrevia: (corpo: unknown) =>
      executar(async () => {
        try {
          setPrevia(await api.post<Previa>(`/api/operacoes/${tipo}/previa`, corpo));
          setCientes([]);
        } catch (e) {
          setPrevia(null);
          throw e;
        }
      }),
    /** Não mexe em volume nem em estoque; a validação completa é na confirmação. */
    salvarRascunho: (f: Formulario) =>
      executar(async () => {
        const corpo = {
          tipo,
          executadoEm: f.executadoEm ? doCampo(f.executadoEm) : null,
          projetoId: f.projetoId || null,
          observacao: f.observacao || null,
          formulario: f,
        };
        if (atual) {
          const r = await api.put<{ versao: number }>(`/api/operacoes/rascunhos/${atual.id}`, {
            ...corpo,
            versao: atual.versao,
          });
          setAtual({ ...atual, versao: r.versao });
        } else {
          const r = await api.post<{ id: string }>('/api/operacoes/rascunhos', corpo);
          setAtual({ id: r.id, versao: 1 });
          navegar(`?rascunho=${r.id}`, { replace: true });
        }
        setSalvo(`Rascunho salvo às ${new Date().toLocaleTimeString('pt-BR').slice(0, 5)}.`);
        await qc.invalidateQueries({ queryKey: ['lista'] });
      }),
    descartar: () =>
      executar(async () => {
        if (!atual || !window.confirm('Descartar este rascunho?')) return;
        await api.post(`/api/operacoes/rascunhos/${atual.id}/descartar`);
        await qc.invalidateQueries({ queryKey: ['lista'] });
        navegar('/enotrace/operacoes', { replace: true });
      }),
    confirmar: (corpo: Record<string, unknown>) =>
      executar(async () => {
        const r = await api.post<{ operacaoId: string }>(`/api/operacoes/${tipo}`, {
          ...corpo,
          cientes,
          rascunhoId: atual?.id ?? null,
        });
        navegar(`/enotrace/operacoes/${r.operacaoId}`, { replace: true });
      }),
  };
}

export function Rodape({
  envio,
  corpo,
  formulario,
}: {
  envio: ReturnType<typeof useEnvio>;
  corpo: () => Record<string, unknown>;
  formulario: () => Formulario;
}) {
  const { data: s } = useSessao();
  const p = envio.previa;
  const podeConfirmar =
    !!p && !p.bloqueios.length && p.avisos.every((a) => envio.cientes.includes(a.codigo));
  return (
    <div className="flex flex-col gap-3">
      {envio.erro && <Aviso tom="erro">{envio.erro}</Aviso>}
      {p && <MostrarPrevia previa={p} cientes={envio.cientes} setCientes={envio.setCientes} />}
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Botao
          variante="secundario"
          disabled={envio.enviando}
          onClick={() => envio.verPrevia(corpo())}
        >
          Ver prévia
        </Botao>
        {pode(s, F, envio.rascunho ? 'editar' : 'criar') && (
          <Botao
            variante="secundario"
            disabled={envio.enviando}
            onClick={() => envio.salvarRascunho(formulario())}
          >
            Salvar rascunho
          </Botao>
        )}
        {pode(s, F, 'confirmar') && (
          <Botao
            disabled={!podeConfirmar || envio.enviando}
            onClick={() => envio.confirmar(corpo())}
          >
            Confirmar operação
          </Botao>
        )}
        {envio.rascunho && pode(s, F, 'editar') && (
          <Botao
            variante="fantasma"
            className="ml-auto"
            disabled={envio.enviando}
            onClick={envio.descartar}
          >
            Descartar rascunho
          </Botao>
        )}
      </div>
      {envio.salvo && <p className="text-sm text-muted-foreground">{envio.salvo}</p>}
      <p className="text-xs text-muted-foreground">
        O rascunho não mexe em volume nem em estoque. Confirmada, a operação não se edita:
        correções, só por estorno.
      </p>
    </div>
  );
}

export function Cabecalho({
  d,
  set,
  projetoId,
  tipo,
}: {
  d: { executadoEm: string; responsavelId: string; planoEtapaId: string; observacao: string };
  set: (p: Partial<typeof d>) => void;
  projetoId: string;
  tipo: TipoOperacao;
}) {
  const enologos = useEnologos();
  const projeto = useLotesDoProjeto(projetoId);
  const etapas = (projeto.data?.plano ?? []).filter(
    (e) => e.tipoOperacao === tipo && !e.executadas.length,
  );
  return (
    <>
      <Campo
        rotulo="Execução"
        id="op-data"
        obrigatorio
        ajuda="Pode ser no passado; a data do lançamento é gravada à parte."
      >
        <Entrada
          id="op-data"
          type="datetime-local"
          value={d.executadoEm}
          onChange={(e) => set({ executadoEm: e.target.value })}
        />
      </Campo>
      <Campo
        rotulo="Responsável"
        id="op-resp"
        ajuda="Enólogo ou RT (IN MAPA 49/2011, art. 6º). Vazio = o enólogo do projeto."
      >
        <Selecao
          id="op-resp"
          value={d.responsavelId}
          onChange={(e) => set({ responsavelId: e.target.value })}
        >
          <option value="">—</option>
          {enologos.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </Selecao>
      </Campo>
      {etapas.length > 0 && (
        <Campo rotulo="Etapa do plano" id="op-etapa">
          <Selecao
            id="op-etapa"
            value={d.planoEtapaId}
            onChange={(e) => set({ planoEtapaId: e.target.value })}
          >
            <option value="">—</option>
            {etapas.map((e) => (
              <option key={e.id} value={e.id}>
                {TIPOS_OPERACAO[e.tipoOperacao]} prevista para{' '}
                {e.dataPrevista.split('-').reverse().join('/')}
              </option>
            ))}
          </Selecao>
        </Campo>
      )}
      <Campo rotulo="Observação" id="op-obs" className="sm:col-span-2">
        <AreaTexto
          id="op-obs"
          value={d.observacao}
          onChange={(e) => set({ observacao: e.target.value })}
        />
      </Campo>
    </>
  );
}

export function Residuos({
  residuos,
  set,
}: {
  residuos: Array<{ tipo: 'engaco' | 'bagaco'; kg: string | null; destino: string }>;
  set: (r: typeof residuos) => void;
}) {
  return (
    <Cartao>
      <CabecalhoCartao
        titulo="Resíduos (opcional)"
        descricao="Engaço e bagaço, para o relatório da licença ambiental."
      />
      <CorpoCartao className="flex flex-col gap-3">
        {residuos.map((r, n) => (
          <div key={n} className="grid items-end gap-2 sm:grid-cols-[10rem_10rem_1fr_auto]">
            <Campo rotulo="Tipo" id={`res-tipo-${n}`}>
              <Selecao
                id={`res-tipo-${n}`}
                value={r.tipo}
                onChange={(e) =>
                  set(
                    residuos.map((x, j) =>
                      j === n ? { ...x, tipo: e.target.value as 'engaco' } : x,
                    ),
                  )
                }
              >
                <option value="engaco">Engaço</option>
                <option value="bagaco">Bagaço</option>
              </Selecao>
            </Campo>
            <Campo rotulo="Peso" id={`res-kg-${n}`}>
              <CampoNumero
                id={`res-kg-${n}`}
                casas={1}
                unidade="kg"
                valor={r.kg}
                aoMudar={(v) => set(residuos.map((x, j) => (j === n ? { ...x, kg: v } : x)))}
              />
            </Campo>
            <Campo rotulo="Destino" id={`res-dest-${n}`}>
              <Entrada
                id={`res-dest-${n}`}
                placeholder="Compostagem, destilação…"
                value={r.destino}
                onChange={(e) =>
                  set(residuos.map((x, j) => (j === n ? { ...x, destino: e.target.value } : x)))
                }
              />
            </Campo>
            <Botao
              variante="fantasma"
              tamanho="icone"
              aria-label="Remover resíduo"
              onClick={() => set(residuos.filter((_, j) => j !== n))}
            >
              <Trash2 />
            </Botao>
          </div>
        ))}
        <div>
          <Botao
            variante="secundario"
            tamanho="pequeno"
            onClick={() => set([...residuos, { tipo: 'engaco', kg: null, destino: '' }])}
          >
            <Plus /> Resíduo
          </Botao>
        </div>
      </CorpoCartao>
    </Cartao>
  );
}
