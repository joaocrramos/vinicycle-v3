// EnoTrace › Terceiros › Produção em terceiro, o "vinho cigano" (cantina.md, Produção em terceiro;
// 04, roteiro do ciclo 10, bloco 5): remessas à cantina (uva, granel, insumos e embalagens) e os
// retornos parciais, com as perdas informadas pela cantina e o que ainda está com ela.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatarDecimal, ORIGENS_UVA_REMESSA } from '@vinicycle/shared'
import { Plus, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BotaoIcone } from '@/componentes/AcoesLinha'
import { Anexos } from '@/componentes/Anexos'
import { CampoNumero } from '@/componentes/campos-especiais'
import { PedirMotivo } from '@/componentes/PedirMotivo'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao'
import { Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { Pagina } from '@/layout/Estrutura'
import { api, ErroApi } from '@/lib/api'
import { fusoAtivo, pode, useSessao } from '@/lib/sessao'
import { formatarDataHora } from '@/lib/utils'
import { useItens, useLocais, useLotes } from './Estoque'
import {
  agora,
  chaveRef,
  daChave,
  doCampo,
  LETRAS,
  type RefLote,
  useProjetos,
  useRecipientes,
} from './operacoes/comum'
import { useVariedadesEmUso } from './Projetos'

const F = 'enotrace.operacoes'
const L = (v: string | number | null | undefined) => `${formatarDecimal(String(v ?? 0), 2)} L`
const ANDAMENTO: Record<string, { rotulo: string; tom: 'sucesso' | 'alerta' | 'neutro' | 'erro' }> =
  {
    aguardando: { rotulo: 'Aguardando retorno', tom: 'alerta' },
    retorno_parcial: { rotulo: 'Retorno parcial', tom: 'alerta' },
    concluida: { rotulo: 'Concluída', tom: 'sucesso' },
    estornada: { rotulo: 'Estornada', tom: 'neutro' },
  }

interface Resumo {
  id: string
  executadoEm: string
  nfNumero: string | null
  projetoId: string
  projeto: string
  cantinaId: string
  cantina: string
  kgUva: string
  litrosGranel: string
  litrosRetornados: string
  perdasInformadas: string
  numeroRetornos: number
  rendimento: string | null
  andamento: keyof typeof ANDAMENTO
  situacao: 'lancada' | 'estornada'
}

function useCantinas() {
  return useQuery({
    queryKey: ['pessoas-opcoes', 'cantina_prestadora'],
    queryFn: () =>
      api.get<Array<{ id: string; nome: string }>>('/api/pessoas/opcoes?papel=cantina_prestadora'),
  })
}

const mensagem = (e: unknown) =>
  e instanceof ErroApi && e.campos.length
    ? `${e.message} ${e.campos.map((c) => c.mensagem).join(' ')}`
    : (e as Error).message

export function ListaRemessas() {
  const navegar = useNavigate()
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  const lista = useQuery({
    queryKey: ['remessas-terceiro'],
    queryFn: () => api.get<Resumo[]>('/api/terceiros/remessas'),
  })
  return (
    <Pagina
      titulo="Produção em terceiro"
      trilha={['EnoTrace', 'Terceiros']}
      acoes={
        pode(s, F, 'confirmar') && (
          <Botao onClick={() => navegar('/enotrace/terceiros/remessas/nova')}>
            <Plus /> Nova remessa
          </Botao>
        )
      }
    >
      <p className="text-sm text-muted-foreground">
        Vinho elaborado em outra cantina ("entrega simples"): a uva, o granel e os insumos
        remetidos, e os retornos do vinho pronto, a granel ou engarrafado, com as perdas informadas
        pela cantina.
      </p>
      <Cartao>
        <ul className="divide-y">
          {lista.data?.map((r) => (
            <li key={r.id}>
              <Link
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-muted/50"
                to={`/enotrace/terceiros/remessas/${r.id}`}
              >
                <span>
                  <strong>{r.cantina}</strong> · {r.projeto}
                  <span className="block text-xs text-muted-foreground">
                    {formatarDataHora(r.executadoEm, fuso)}
                    {r.nfNumero && ` · nota ${r.nfNumero}`} · uva {formatarDecimal(r.kgUva, 1)} kg ·
                    granel {L(r.litrosGranel)} · voltaram {L(r.litrosRetornados)}
                  </span>
                </span>
                <Etiqueta tom={ANDAMENTO[r.andamento]?.tom}>
                  {ANDAMENTO[r.andamento]?.rotulo}
                </Etiqueta>
              </Link>
            </li>
          ))}
          {lista.data && !lista.data.length && (
            <li className="px-5 py-6 text-sm text-muted-foreground">Nenhuma remessa.</li>
          )}
        </ul>
      </Cartao>
    </Pagina>
  )
}

// Nova remessa ------------------------------------------------------------------------------------

interface ItemRemessa {
  tipo: 'uva' | 'granel' | 'insumo'
  variedadeId: string
  safra: string
  kg: string | null
  origemUva: 'parcela' | 'romaneio' | 'fornecedor'
  parcelaId: string
  romaneioItemId: string
  fornecedorId: string
  operacaoId: string
  itemId: string
  loteItemId: string
  quantidade: string | null
  localOrigemId: string
  localDestinoId: string
}
const itemVazio = (tipo: ItemRemessa['tipo']): ItemRemessa => ({
  tipo,
  variedadeId: '',
  safra: String(new Date().getFullYear()),
  kg: null,
  origemUva: 'parcela',
  parcelaId: '',
  romaneioItemId: '',
  fornecedorId: '',
  operacaoId: '',
  itemId: '',
  loteItemId: '',
  quantidade: null,
  localOrigemId: '',
  localDestinoId: '',
})

function LinhaRemessa({
  i,
  n,
  projetoId,
  set,
  remover,
}: {
  i: ItemRemessa
  n: number
  projetoId: string
  set: (p: Partial<ItemRemessa>) => void
  remover: () => void
}) {
  const variedades = useVariedadesEmUso()
  const itens = useItens()
  const locais = useLocais()
  const lotes = useLotes(i.tipo === 'insumo' ? i.itemId : '', i.localOrigemId || undefined)
  const propriedades = useQuery({
    queryKey: ['propriedades-opcoes', ''],
    queryFn: () =>
      api.get<Array<{ id: string; nome: string; parcelas: Array<{ id: string; nome: string }> }>>(
        '/api/propriedades/opcoes',
      ),
    enabled: i.tipo === 'uva' && i.origemUva === 'parcela',
  })
  const uvas = useQuery({
    queryKey: ['uva-a-processar'],
    queryFn: () =>
      api.get<
        Array<{
          itemId: string
          romaneio: string
          variedadeId: string
          variedade: string
          liquidoKg: string
          consumidoKg: string
        }>
      >('/api/romaneios/uva-a-processar'),
    enabled: i.tipo === 'uva' && i.origemUva === 'romaneio',
  })
  const fornecedores = useQuery({
    queryKey: ['pessoas-opcoes', 'produtor_uva'],
    queryFn: () =>
      api.get<Array<{ id: string; nome: string }>>('/api/pessoas/opcoes?papel=produtor_uva'),
    enabled: i.tipo === 'uva' && i.origemUva === 'fornecedor',
  })
  const saidas = useQuery({
    queryKey: ['granel-para-remessa', projetoId],
    queryFn: () =>
      api.get<Array<{ id: string; codigo: string; executadoEm: string; litros: string }>>(
        `/api/terceiros/granel-para-remessa?projetoId=${projetoId}`,
      ),
    enabled: i.tipo === 'granel' && !!projetoId,
  })
  const titulo = { uva: 'Uva', granel: 'Mosto ou vinho a granel', insumo: 'Insumo ou embalagem' }[
    i.tipo
  ]
  return (
    <div className="flex flex-col gap-3 border-b pb-4">
      <div className="flex items-center justify-between">
        <strong className="text-sm">
          {n + 1}. {titulo}
        </strong>
        <Botao variante="fantasma" tamanho="icone" aria-label="Remover item" onClick={remover}>
          <Trash2 />
        </Botao>
      </div>
      {i.tipo === 'uva' && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Campo rotulo="Origem" id={`rm-orig-${n}`}>
            <Selecao
              id={`rm-orig-${n}`}
              value={i.origemUva}
              onChange={(e) => set({ origemUva: e.target.value as ItemRemessa['origemUva'] })}
            >
              {Object.entries(ORIGENS_UVA_REMESSA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Selecao>
          </Campo>
          {i.origemUva === 'romaneio' ? (
            <Campo rotulo="Uva do romaneio" id={`rm-rom-${n}`} className="sm:col-span-2">
              <Selecao
                id={`rm-rom-${n}`}
                value={i.romaneioItemId}
                onChange={(e) => {
                  const u = uvas.data?.find((x) => x.itemId === e.target.value)
                  set({ romaneioItemId: e.target.value, variedadeId: u?.variedadeId ?? '' })
                }}
              >
                <option value="">Escolha</option>
                {uvas.data?.map((u) => (
                  <option key={u.itemId} value={u.itemId}>
                    {u.romaneio} · {u.variedade} ·{' '}
                    {formatarDecimal(String(Number(u.liquidoKg) - Number(u.consumidoKg)), 1)} kg
                  </option>
                ))}
              </Selecao>
            </Campo>
          ) : (
            <>
              <Campo rotulo="Variedade" id={`rm-var-${n}`}>
                <Selecao
                  id={`rm-var-${n}`}
                  value={i.variedadeId}
                  onChange={(e) => set({ variedadeId: e.target.value })}
                >
                  <option value="">Escolha</option>
                  {variedades.data?.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nome}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              {i.origemUva === 'parcela' ? (
                <Campo rotulo="Parcela" id={`rm-par-${n}`}>
                  <Selecao
                    id={`rm-par-${n}`}
                    value={i.parcelaId}
                    onChange={(e) => set({ parcelaId: e.target.value })}
                  >
                    <option value="">Escolha</option>
                    {propriedades.data?.flatMap((p) =>
                      p.parcelas.map((pa) => (
                        <option key={pa.id} value={pa.id}>
                          {p.nome} › {pa.nome}
                        </option>
                      )),
                    )}
                  </Selecao>
                </Campo>
              ) : (
                <Campo rotulo="Fornecedor" id={`rm-for-${n}`}>
                  <Selecao
                    id={`rm-for-${n}`}
                    value={i.fornecedorId}
                    onChange={(e) => set({ fornecedorId: e.target.value })}
                  >
                    <option value="">Escolha</option>
                    {fornecedores.data?.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
              )}
            </>
          )}
          <Campo rotulo="Safra" id={`rm-saf-${n}`}>
            <Entrada
              id={`rm-saf-${n}`}
              inputMode="numeric"
              value={i.safra}
              onChange={(e) => set({ safra: e.target.value.replace(/\D/g, '').slice(0, 4) })}
            />
          </Campo>
          <Campo rotulo="Peso" id={`rm-kg-${n}`}>
            <CampoNumero
              id={`rm-kg-${n}`}
              casas={1}
              unidade="kg"
              valor={i.kg}
              aoMudar={(v) => set({ kg: v })}
            />
          </Campo>
        </div>
      )}
      {i.tipo === 'granel' && (
        <Campo
          rotulo="Saída de granel (remessa a terceiro)"
          id={`rm-gr-${n}`}
          ajuda="Registre antes a saída de granel do tipo remessa a terceiro, com a GLT, em Operações."
        >
          <Selecao
            id={`rm-gr-${n}`}
            value={i.operacaoId}
            onChange={(e) => set({ operacaoId: e.target.value })}
          >
            <option value="">{projetoId ? 'Escolha' : 'Escolha o projeto primeiro'}</option>
            {saidas.data?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.codigo} · {L(o.litros)}
              </option>
            ))}
          </Selecao>
        </Campo>
      )}
      {i.tipo === 'insumo' && (
        <div className="grid gap-3 sm:grid-cols-5">
          <Campo rotulo="Item" id={`rm-it-${n}`}>
            <Selecao
              id={`rm-it-${n}`}
              value={i.itemId}
              onChange={(e) => set({ itemId: e.target.value, loteItemId: '' })}
            >
              <option value="">Escolha</option>
              {itens.data?.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Sai de" id={`rm-lo-${n}`}>
            <Selecao
              id={`rm-lo-${n}`}
              value={i.localOrigemId}
              onChange={(e) => set({ localOrigemId: e.target.value })}
            >
              <option value="">Escolha</option>
              {locais.data
                ?.filter((l) => !l.externo)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Lote" id={`rm-lt-${n}`}>
            <Selecao
              id={`rm-lt-${n}`}
              value={i.loteItemId}
              onChange={(e) => set({ loteItemId: e.target.value })}
            >
              <option value="">Sem lote</option>
              {lotes.data
                ?.filter((l) => Number(l.saldo) > 0)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo}
                  </option>
                ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Quantidade" id={`rm-q-${n}`}>
            <CampoNumero
              id={`rm-q-${n}`}
              casas={3}
              valor={i.quantidade}
              aoMudar={(v) => set({ quantidade: v })}
            />
          </Campo>
          <Campo
            rotulo="Vai para (local da cantina)"
            id={`rm-ld-${n}`}
            ajuda="Local externo (Configurações › Locais)."
          >
            <Selecao
              id={`rm-ld-${n}`}
              value={i.localDestinoId}
              onChange={(e) => set({ localDestinoId: e.target.value })}
            >
              <option value="">Escolha</option>
              {locais.data
                ?.filter((l) => l.externo)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
            </Selecao>
          </Campo>
        </div>
      )}
    </div>
  )
}

export function NovaRemessa() {
  const navegar = useNavigate()
  const qc = useQueryClient()
  const projetos = useProjetos()
  const cantinas = useCantinas()
  const [d, setD] = useState({
    executadoEm: agora(),
    projetoId: '',
    cantinaId: '',
    contratoId: '',
    nfNumero: '',
    nfChave: '',
    observacao: '',
    itens: [itemVazio('uva')] as ItemRemessa[],
  })
  const [erro, setErro] = useState<string | null>(null)
  const contratos = useQuery({
    queryKey: ['contratos-cantina', d.cantinaId],
    queryFn: async () =>
      (
        await api.get<{
          itens: Array<{ id: string; numero: string | null; vigenciaInicio: string }>
        }>(
          `/api/contratos-terceirizacao?tamanho=0&sentido=contratamos&contraparteId=${d.cantinaId}`,
        )
      ).itens,
    enabled: !!d.cantinaId,
  })
  const setItem = (n: number, p: Partial<ItemRemessa>) =>
    setD({ ...d, itens: d.itens.map((x, j) => (j === n ? { ...x, ...p } : x)) })
  return (
    <Pagina titulo="Nova remessa" trilha={['EnoTrace', 'Terceiros', 'Produção em terceiro']}>
      <Cartao>
        <CabecalhoCartao titulo="Remessa" />
        <CorpoCartao className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Data e hora" id="rm-data" obrigatorio>
            <Entrada
              id="rm-data"
              type="datetime-local"
              value={d.executadoEm}
              onChange={(e) => setD({ ...d, executadoEm: e.target.value })}
            />
          </Campo>
          <Campo rotulo="Projeto" id="rm-proj" obrigatorio>
            <Selecao
              id="rm-proj"
              value={d.projetoId}
              onChange={(e) => setD({ ...d, projetoId: e.target.value })}
            >
              <option value="">Escolha</option>
              {projetos.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} · {p.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo
            rotulo="Cantina"
            id="rm-cantina"
            obrigatorio
            ajuda="Pessoa com o papel de cantina prestadora de serviço."
          >
            <Selecao
              id="rm-cantina"
              value={d.cantinaId}
              onChange={(e) => setD({ ...d, cantinaId: e.target.value, contratoId: '' })}
            >
              <option value="">Escolha</option>
              {cantinas.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Contrato" id="rm-contrato">
            <Selecao
              id="rm-contrato"
              value={d.contratoId}
              onChange={(e) => setD({ ...d, contratoId: e.target.value })}
            >
              <option value="">Sem contrato</option>
              {contratos.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.numero ?? `Desde ${c.vigenciaInicio.split('-').reverse().join('/')}`}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Nota de remessa" id="rm-nf">
            <Entrada
              id="rm-nf"
              value={d.nfNumero}
              onChange={(e) => setD({ ...d, nfNumero: e.target.value })}
            />
          </Campo>
          <Campo rotulo="Chave da nota" id="rm-chave">
            <Entrada
              id="rm-chave"
              inputMode="numeric"
              value={d.nfChave}
              onChange={(e) => setD({ ...d, nfChave: e.target.value.replace(/\D/g, '') })}
            />
          </Campo>
        </CorpoCartao>
      </Cartao>
      <Cartao>
        <CabecalhoCartao titulo="Itens" />
        <CorpoCartao className="flex flex-col gap-4">
          {d.itens.map((i, n) => (
            <LinhaRemessa
              key={n}
              i={i}
              n={n}
              projetoId={d.projetoId}
              set={(p) => setItem(n, p)}
              remover={() => setD({ ...d, itens: d.itens.filter((_, j) => j !== n) })}
            />
          ))}
          <div className="flex flex-wrap gap-2">
            {(['uva', 'granel', 'insumo'] as const).map((tipo) => (
              <Botao
                key={tipo}
                variante="secundario"
                tamanho="pequeno"
                onClick={() => setD({ ...d, itens: [...d.itens, itemVazio(tipo)] })}
              >
                <Plus /> {{ uva: 'Uva', granel: 'Granel', insumo: 'Insumo ou embalagem' }[tipo]}
              </Botao>
            ))}
          </div>
        </CorpoCartao>
      </Cartao>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <div className="flex gap-2 border-t pt-4">
        <Botao
          onClick={async () => {
            setErro(null)
            try {
              const r = await api.post<{ id: string }>('/api/terceiros/remessas', {
                executadoEm: doCampo(d.executadoEm),
                projetoId: d.projetoId,
                cantinaId: d.cantinaId,
                contratoId: d.contratoId || null,
                nfNumero: d.nfNumero,
                nfChave: d.nfChave,
                observacao: d.observacao,
                itens: d.itens.map((i) =>
                  i.tipo === 'uva'
                    ? {
                        tipo: 'uva',
                        variedadeId: i.variedadeId,
                        safra: i.safra ? Number(i.safra) : null,
                        kg: i.kg ?? '0',
                        origemUva: i.origemUva,
                        parcelaId: i.parcelaId || null,
                        romaneioItemId: i.romaneioItemId || null,
                        fornecedorId: i.fornecedorId || null,
                      }
                    : i.tipo === 'granel'
                      ? { tipo: 'granel', operacaoId: i.operacaoId }
                      : {
                          tipo: 'insumo',
                          itemId: i.itemId,
                          loteItemId: i.loteItemId || null,
                          quantidade: i.quantidade ?? '0',
                          localOrigemId: i.localOrigemId,
                          localDestinoId: i.localDestinoId,
                        },
                ),
              })
              await qc.invalidateQueries({ queryKey: ['remessas-terceiro'] })
              navegar(`/enotrace/terceiros/remessas/${r.id}`)
            } catch (e) {
              setErro(mensagem(e))
            }
          }}
        >
          Lançar remessa
        </Botao>
        <Botao variante="secundario" onClick={() => navegar('/enotrace/terceiros/remessas')}>
          Voltar
        </Botao>
      </div>
    </Pagina>
  )
}

// Ficha da remessa ---------------------------------------------------------------------------------

interface ItemFicha {
  tipo: 'uva' | 'granel' | 'insumo'
  kg: string | null
  safra: number | null
  origemUva: keyof typeof ORIGENS_UVA_REMESSA | null
  litros: string | null
  quantidade: string | null
  operacaoId: string | null
  operacao: string | null
  variedade: string | null
  parcela: string | null
  romaneio: string | null
  fornecedor: string | null
  item: string | null
  unidade: string | null
  lote: string | null
  local: string | null
  emPoder: string | null
}
interface Retorno {
  id: string
  executadoEm: string
  nfNumero: string | null
  glt: string | null
  perdasInformadas: string | null
  situacao: 'lancada' | 'estornada'
  motivoEstorno: string | null
  itens: Array<{
    tipo: 'granel' | 'engarrafado' | 'insumo_consumido'
    litros: number | null
    garrafas: number | null
    quantidade: number | null
    operacaoId: string | null
    operacao: string | null
    lote: string | null
    produto: string | null
    item: string | null
  }>
}
type Ficha = Resumo & {
  observacao: string | null
  motivoEstorno: string | null
  itens: ItemFicha[]
  retornos: Retorno[]
}

export function FichaRemessa() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const qc = useQueryClient()
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  const [estornar, setEstornar] = useState(false)
  const [estornarRetorno, setEstornarRetorno] = useState<string | null>(null)
  const q = useQuery({
    queryKey: ['remessa-terceiro', id],
    queryFn: () => api.get<Ficha>(`/api/terceiros/remessas/${id}`),
  })
  if (!q.data)
    return (
      <p className="text-sm text-muted-foreground">
        {q.isError ? (q.error as Error).message : 'Carregando…'}
      </p>
    )
  const r = q.data
  const recarregar = () => qc.invalidateQueries({ queryKey: ['remessa-terceiro', id] })
  const lancada = r.situacao === 'lancada'
  return (
    <Pagina
      titulo={`Remessa para ${r.cantina}`}
      trilha={['EnoTrace', 'Terceiros', 'Produção em terceiro']}
      acoes={
        lancada &&
        pode(s, F, 'confirmar') && (
          <div className="flex flex-wrap gap-2">
            <Botao onClick={() => navegar(`/enotrace/terceiros/remessas/${id}/retorno`)}>
              <Plus /> Retorno
            </Botao>
            <Botao
              variante="secundario"
              onClick={async () => {
                await api.post(`/api/terceiros/remessas/${id}/concluir`, {
                  concluida: r.andamento !== 'concluida',
                })
                await recarregar()
              }}
            >
              {r.andamento === 'concluida' ? 'Reabrir' : 'Marcar como concluída'}
            </Botao>
            {pode(s, F, 'estornar') && (
              <BotaoIcone rotulo="Estornar a remessa" contorno aoClicar={() => setEstornar(true)}>
                <Undo2 />
              </BotaoIcone>
            )}
          </div>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <Etiqueta tom={ANDAMENTO[r.andamento]?.tom}>{ANDAMENTO[r.andamento]?.rotulo}</Etiqueta>
        <span>{formatarDataHora(r.executadoEm, fuso)}</span>
        <Link className="underline" to={`/enotrace/projetos/${r.projetoId}`}>
          {r.projeto}
        </Link>
        {r.nfNumero && <span>nota {r.nfNumero}</span>}
      </div>
      {r.motivoEstorno && <Aviso tom="info">Estornada: {r.motivoEstorno}</Aviso>}
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Uva enviada', `${formatarDecimal(r.kgUva, 1)} kg`],
          ['Granel enviado', L(r.litrosGranel)],
          ['Voltou', L(r.litrosRetornados)],
          [
            'Perdas informadas',
            `${L(r.perdasInformadas)}${r.rendimento ? ` · rendimento ${formatarDecimal(r.rendimento, 3)} L/kg` : ''}`,
          ],
        ].map(([k, v]) => (
          <Cartao key={k}>
            <CorpoCartao>
              <p className="text-xs text-muted-foreground">{k}</p>
              <p className="text-lg font-semibold">{v}</p>
            </CorpoCartao>
          </Cartao>
        ))}
      </div>
      <Cartao>
        <CabecalhoCartao titulo="O que foi enviado" />
        <CorpoCartao className="text-sm">
          <ul className="flex flex-col gap-2">
            {r.itens.map((i, n) => (
              <li key={n}>
                {i.tipo === 'uva' && (
                  <>
                    Uva {i.variedade} {i.safra ?? ''}: {formatarDecimal(i.kg, 1)} kg ·{' '}
                    {i.origemUva ? ORIGENS_UVA_REMESSA[i.origemUva] : ''}
                    {i.parcela && ` · ${i.parcela}`}
                    {i.romaneio && ` · ${i.romaneio}`}
                    {i.fornecedor && ` · ${i.fornecedor}`}
                  </>
                )}
                {i.tipo === 'granel' && (
                  <>
                    Granel: {L(i.litros)} ·{' '}
                    <Link className="underline" to={`/enotrace/operacoes/${i.operacaoId}`}>
                      {i.operacao}
                    </Link>
                  </>
                )}
                {i.tipo === 'insumo' && (
                  <>
                    {i.item}
                    {i.lote && ` (lote ${i.lote})`}: {formatarDecimal(i.quantidade, 3)} {i.unidade}{' '}
                    para {i.local} · em poder da cantina hoje: {formatarDecimal(i.emPoder, 3)}{' '}
                    {i.unidade}
                  </>
                )}
              </li>
            ))}
          </ul>
        </CorpoCartao>
      </Cartao>
      <h2 className="text-base font-semibold">Retornos ({r.retornos.length})</h2>
      {r.retornos.map((t) => (
        <Cartao key={t.id}>
          <CabecalhoCartao
            titulo={`${formatarDataHora(t.executadoEm, fuso)}${t.nfNumero ? ` · nota ${t.nfNumero}` : ''}`}
            descricao={[
              t.glt && `GLT ${t.glt}`,
              t.perdasInformadas && `perdas informadas ${L(t.perdasInformadas)}`,
              t.situacao === 'estornada' && `estornado: ${t.motivoEstorno}`,
            ]
              .filter(Boolean)
              .join(' · ')}
            acoes={
              t.situacao === 'lancada' &&
              pode(s, F, 'estornar') && (
                <BotaoIcone rotulo="Estornar o retorno" aoClicar={() => setEstornarRetorno(t.id)}>
                  <Undo2 />
                </BotaoIcone>
              )
            }
          />
          <CorpoCartao className="flex flex-col gap-3 text-sm">
            <ul className="flex flex-col gap-1">
              {t.itens.map((y, n) => (
                <li key={n}>
                  {y.tipo === 'granel' && (
                    <>
                      Granel {L(y.litros)} ·{' '}
                      <Link className="underline" to={`/enotrace/operacoes/${y.operacaoId}`}>
                        {y.operacao}
                      </Link>
                    </>
                  )}
                  {y.tipo === 'engarrafado' &&
                    `${y.produto}: ${y.garrafas} garrafas, lote ${y.lote} (${L(y.litros)})`}
                  {y.tipo === 'insumo_consumido' &&
                    `${y.item} consumido pela cantina: ${formatarDecimal(String(y.quantidade), 3)}`}
                </li>
              ))}
            </ul>
            <details>
              <summary className="cursor-pointer text-muted-foreground">
                Anexos (dossiê da cantina, notas)
              </summary>
              <Anexos
                entidade="retorno_terceiro"
                registroId={t.id}
                podeAlterar={pode(s, F, 'confirmar')}
                fuso={fuso}
              />
            </details>
          </CorpoCartao>
        </Cartao>
      ))}
      <PedirMotivo
        aberto={estornar}
        aoMudar={setEstornar}
        titulo="Estornar a remessa"
        descricao="Os insumos voltam ao local de origem. A saída de granel se estorna em Operações."
        rotuloBotao="Estornar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/terceiros/remessas/${id}/estorno`, { motivo })
          await recarregar()
        }}
      />
      <PedirMotivo
        aberto={!!estornarRetorno}
        aoMudar={(x) => !x && setEstornarRetorno(null)}
        titulo="Estornar o retorno"
        descricao="A entrada de granel e as garrafas que voltaram são desfeitas."
        rotuloBotao="Estornar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/terceiros/retornos/${estornarRetorno}/estorno`, { motivo })
          await recarregar()
        }}
      />
    </Pagina>
  )
}

// Novo retorno ------------------------------------------------------------------------------------

interface ItemRetorno {
  tipo: 'granel' | 'engarrafado' | 'insumo_consumido'
  recipienteId: string
  litros: string | null
  lote: RefLote | null
  formatoId: string
  garrafas: string
  loteComercial: string
  localId: string
  itemId: string
  loteItemId: string
  quantidade: string | null
}
const retornoVazio = (tipo: ItemRetorno['tipo']): ItemRetorno => ({
  tipo,
  recipienteId: '',
  litros: null,
  lote: { novo: 'A' },
  formatoId: '',
  garrafas: '',
  loteComercial: '',
  localId: '',
  itemId: '',
  loteItemId: '',
  quantidade: null,
})

export function NovoRetorno() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const qc = useQueryClient()
  const recipientes = useRecipientes()
  const locais = useLocais()
  const itens = useItens()
  const remessa = useQuery({
    queryKey: ['remessa-terceiro', id],
    queryFn: () => api.get<Ficha>(`/api/terceiros/remessas/${id}`),
  })
  const composicao = useQuery({
    queryKey: ['remessa-composicao', id],
    queryFn: () =>
      api.get<Array<{ variedadeId: string; safra: number | null; percentual: string }>>(
        `/api/terceiros/remessas/${id}/composicao`,
      ),
  })
  const variedades = useVariedadesEmUso()
  const formatos = useQuery({
    queryKey: ['formatos-proprios'],
    queryFn: async () => {
      const produtos = (
        await api.get<{ itens: Array<{ id: string; nome: string }> }>('/api/produtos?tamanho=0')
      ).itens
      const fichas = await Promise.all(
        produtos.map((p) =>
          api.get<{
            titularId: string | null
            formatos: Array<{ id: string; volumeMl: number; ativo: boolean }>
          }>(`/api/produtos/${p.id}`),
        ),
      )
      return produtos.flatMap((p, n) =>
        fichas[n]!.titularId
          ? []
          : fichas[n]!.formatos.filter((f) => f.ativo).map((f) => ({
              id: f.id,
              nome: `${p.nome} ${f.volumeMl} mL`,
            })),
      )
    },
  })
  const [d, setD] = useState({
    executadoEm: agora(),
    nfNumero: '',
    nfChave: '',
    glt: '',
    perdasInformadas: null as string | null,
    observacao: '',
    itens: [retornoVazio('granel')] as ItemRetorno[],
  })
  const [erro, setErro] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<Array<{ codigo: string; mensagem: string }>>([])
  const [cientes, setCientes] = useState<string[]>([])
  const setItem = (n: number, p: Partial<ItemRetorno>) =>
    setD({ ...d, itens: d.itens.map((x, j) => (j === n ? { ...x, ...p } : x)) })
  if (!remessa.data) return <p className="text-sm text-muted-foreground">Carregando…</p>
  const r = remessa.data
  const nomeVar = (v: string) => variedades.data?.find((x) => x.id === v)?.nome ?? 'variedade'
  return (
    <Pagina
      titulo={`Retorno de ${r.cantina}`}
      trilha={['EnoTrace', 'Terceiros', 'Produção em terceiro']}
    >
      <p className="text-sm text-muted-foreground">
        Registro único da chegada; a remessa pode ter vários retornos parciais. A granel, o vinho
        entra num recipiente por uma entrada de granel "retorno de terceiro"; engarrafado, entra no
        estoque com o lote comercial informado pela cantina.
      </p>
      <Cartao>
        <CorpoCartao className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Data e hora" id="rt-data" obrigatorio>
            <Entrada
              id="rt-data"
              type="datetime-local"
              value={d.executadoEm}
              onChange={(e) => setD({ ...d, executadoEm: e.target.value })}
            />
          </Campo>
          <Campo rotulo="Nota de retorno" id="rt-nf">
            <Entrada
              id="rt-nf"
              value={d.nfNumero}
              onChange={(e) => setD({ ...d, nfNumero: e.target.value })}
            />
          </Campo>
          <Campo rotulo="Chave da nota" id="rt-chave">
            <Entrada
              id="rt-chave"
              inputMode="numeric"
              value={d.nfChave}
              onChange={(e) => setD({ ...d, nfChave: e.target.value.replace(/\D/g, '') })}
            />
          </Campo>
          <Campo rotulo="GLT (granel)" id="rt-glt">
            <Entrada
              id="rt-glt"
              value={d.glt}
              onChange={(e) => setD({ ...d, glt: e.target.value })}
            />
          </Campo>
          <Campo rotulo="Perdas informadas pela cantina" id="rt-perdas">
            <CampoNumero
              id="rt-perdas"
              casas={2}
              unidade="L"
              valor={d.perdasInformadas}
              aoMudar={(v) => setD({ ...d, perdasInformadas: v })}
            />
          </Campo>
        </CorpoCartao>
      </Cartao>
      <Cartao>
        <CabecalhoCartao titulo="O que voltou" />
        <CorpoCartao className="flex flex-col gap-4">
          {d.itens.map((i, n) => (
            <div key={n} className="flex flex-col gap-3 border-b pb-4">
              <div className="flex items-center justify-between">
                <strong className="text-sm">
                  {n + 1}.{' '}
                  {
                    {
                      granel: 'A granel',
                      engarrafado: 'Engarrafado',
                      insumo_consumido: 'Insumo consumido pela cantina',
                    }[i.tipo]
                  }
                </strong>
                <Botao
                  variante="fantasma"
                  tamanho="icone"
                  aria-label="Remover item"
                  onClick={() => setD({ ...d, itens: d.itens.filter((_, j) => j !== n) })}
                >
                  <Trash2 />
                </Botao>
              </div>
              {i.tipo === 'granel' && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Campo rotulo="Recipiente" id={`rt-rec-${n}`}>
                    <Selecao
                      id={`rt-rec-${n}`}
                      value={i.recipienteId}
                      onChange={(e) => setItem(n, { recipienteId: e.target.value })}
                    >
                      <option value="">Escolha</option>
                      {recipientes.data
                        ?.filter(
                          (x) => !x.lote || (!x.lote.titularId && x.lote.projetoId === r.projetoId),
                        )
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.codigo} · {formatarDecimal(x.volume, 2)} L
                            {x.lote ? ` · ${x.lote.codigo}` : ''}
                          </option>
                        ))}
                    </Selecao>
                  </Campo>
                  <Campo rotulo="Litros" id={`rt-l-${n}`}>
                    <CampoNumero
                      id={`rt-l-${n}`}
                      casas={2}
                      unidade="L"
                      valor={i.litros}
                      aoMudar={(v) => setItem(n, { litros: v })}
                    />
                  </Campo>
                  <Campo rotulo="Lote" id={`rt-lote-${n}`}>
                    <Selecao
                      id={`rt-lote-${n}`}
                      value={chaveRef(i.lote)}
                      onChange={(e) => setItem(n, { lote: daChave(e.target.value) })}
                    >
                      {(() => {
                        const rec = recipientes.data?.find((x) => x.id === i.recipienteId)
                        return rec?.lote ? (
                          <option value={`id:${rec.lote.id}`}>
                            Incorporar ao lote {rec.lote.codigo}
                          </option>
                        ) : null
                      })()}
                      {LETRAS.map((l) => (
                        <option key={l} value={`novo:${l}`}>
                          Lote novo {l}
                        </option>
                      ))}
                    </Selecao>
                  </Campo>
                  <p className="text-xs text-muted-foreground sm:col-span-3">
                    Composição:{' '}
                    {composicao.data?.length
                      ? composicao.data
                          .map(
                            (c) =>
                              `${nomeVar(c.variedadeId)} ${c.safra ?? ''} ${formatarDecimal(c.percentual, 2)}%`,
                          )
                          .join(' · ')
                      : 'não informada (a remessa não tem uva)'}{' '}
                    (sugerida pela uva remetida; corrija depois por análise se preciso).
                  </p>
                </div>
              )}
              {i.tipo === 'engarrafado' && (
                <div className="grid gap-3 sm:grid-cols-4">
                  <Campo rotulo="Produto e formato" id={`rt-f-${n}`}>
                    <Selecao
                      id={`rt-f-${n}`}
                      value={i.formatoId}
                      onChange={(e) => setItem(n, { formatoId: e.target.value })}
                    >
                      <option value="">Escolha</option>
                      {formatos.data?.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome}
                        </option>
                      ))}
                    </Selecao>
                  </Campo>
                  <Campo rotulo="Garrafas" id={`rt-g-${n}`}>
                    <Entrada
                      id={`rt-g-${n}`}
                      inputMode="numeric"
                      value={i.garrafas}
                      onChange={(e) => setItem(n, { garrafas: e.target.value.replace(/\D/g, '') })}
                    />
                  </Campo>
                  <Campo rotulo="Lote comercial da cantina" id={`rt-lc-${n}`}>
                    <Entrada
                      id={`rt-lc-${n}`}
                      value={i.loteComercial}
                      onChange={(e) => setItem(n, { loteComercial: e.target.value })}
                    />
                  </Campo>
                  <Campo rotulo="Entra em" id={`rt-loc-${n}`}>
                    <Selecao
                      id={`rt-loc-${n}`}
                      value={i.localId}
                      onChange={(e) => setItem(n, { localId: e.target.value })}
                    >
                      <option value="">Escolha</option>
                      {locais.data
                        ?.filter((l) => !l.externo)
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.nome}
                          </option>
                        ))}
                    </Selecao>
                  </Campo>
                </div>
              )}
              {i.tipo === 'insumo_consumido' && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Campo rotulo="Item" id={`rt-it-${n}`}>
                    <Selecao
                      id={`rt-it-${n}`}
                      value={i.itemId}
                      onChange={(e) => setItem(n, { itemId: e.target.value })}
                    >
                      <option value="">Escolha</option>
                      {itens.data?.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.nome}
                        </option>
                      ))}
                    </Selecao>
                  </Campo>
                  <Campo rotulo="Quantidade" id={`rt-q-${n}`}>
                    <CampoNumero
                      id={`rt-q-${n}`}
                      casas={3}
                      valor={i.quantidade}
                      aoMudar={(v) => setItem(n, { quantidade: v })}
                    />
                  </Campo>
                  <Campo rotulo="Local da cantina" id={`rt-ext-${n}`}>
                    <Selecao
                      id={`rt-ext-${n}`}
                      value={i.localId}
                      onChange={(e) => setItem(n, { localId: e.target.value })}
                    >
                      <option value="">Escolha</option>
                      {locais.data
                        ?.filter((l) => l.externo)
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.nome}
                          </option>
                        ))}
                    </Selecao>
                  </Campo>
                </div>
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {(['granel', 'engarrafado', 'insumo_consumido'] as const).map((tipo) => (
              <Botao
                key={tipo}
                variante="secundario"
                tamanho="pequeno"
                onClick={() => setD({ ...d, itens: [...d.itens, retornoVazio(tipo)] })}
              >
                <Plus />{' '}
                {
                  {
                    granel: 'Granel',
                    engarrafado: 'Engarrafado',
                    insumo_consumido: 'Insumo consumido',
                  }[tipo]
                }
              </Botao>
            ))}
          </div>
        </CorpoCartao>
      </Cartao>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {avisos.map((a) => (
        <Caixa
          key={a.codigo}
          rotulo={`Ciente: ${a.mensagem}`}
          checked={cientes.includes(a.codigo)}
          onChange={(e) =>
            setCientes(
              e.target.checked ? [...cientes, a.codigo] : cientes.filter((c) => c !== a.codigo),
            )
          }
        />
      ))}
      <div className="flex gap-2 border-t pt-4">
        <Botao
          onClick={async () => {
            setErro(null)
            try {
              await api.post('/api/terceiros/retornos', {
                executadoEm: doCampo(d.executadoEm),
                projetoId: r.projetoId,
                cantinaId: r.cantinaId,
                remessaId: id,
                nfNumero: d.nfNumero,
                nfChave: d.nfChave,
                glt: d.glt,
                perdasInformadas: d.perdasInformadas,
                observacao: d.observacao,
                cientes,
                itens: d.itens.map((i) =>
                  i.tipo === 'granel'
                    ? {
                        tipo: 'granel',
                        recipienteId: i.recipienteId,
                        litros: i.litros ?? '0',
                        lote: i.lote,
                      }
                    : i.tipo === 'engarrafado'
                      ? {
                          tipo: 'engarrafado',
                          formatoId: i.formatoId,
                          garrafas: Number(i.garrafas || 0),
                          loteComercial: i.loteComercial,
                          localId: i.localId,
                        }
                      : {
                          tipo: 'insumo_consumido',
                          itemId: i.itemId,
                          quantidade: i.quantidade ?? '0',
                          localId: i.localId,
                        },
                ),
              })
              await qc.invalidateQueries({ queryKey: ['remessa-terceiro', id] })
              await qc.invalidateQueries({ queryKey: ['remessas-terceiro'] })
              navegar(`/enotrace/terceiros/remessas/${id}`)
            } catch (e) {
              if (e instanceof ErroApi && e.codigo === 'ciente_pendente') {
                const det = e.detalhes as { avisos?: Array<{ codigo: string; mensagem: string }> }
                setAvisos(det?.avisos ?? [])
                setErro('Confirme que está ciente dos avisos e lance de novo.')
              } else setErro(mensagem(e))
            }
          }}
        >
          Lançar retorno
        </Botao>
        <Botao variante="secundario" onClick={() => navegar(`/enotrace/terceiros/remessas/${id}`)}>
          Voltar
        </Botao>
      </div>
    </Pagina>
  )
}
