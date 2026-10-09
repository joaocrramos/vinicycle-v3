// EnoTrace › Estoque › Notas de entrada (ambiente-cliente.md, Entrada por NF-e; P11): importar o XML
// da nota de compra, conferir cada item (item do estoque, conversão para a unidade base, local, lote
// e validade, ou descarte), lançar as entradas, estornar a nota inteira. A associação de cada item
// fica memorizada para as próximas notas do mesmo fornecedor.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { conversaoSugerida, formatarDecimal } from '@vinicycle/shared'
import { Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { BotaoIcone } from '@/componentes/AcoesLinha'
import { Anexos } from '@/componentes/Anexos'
import { PedirMotivo } from '@/componentes/PedirMotivo'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao'
import { Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { Pagina } from '@/layout/Estrutura'
import { api, ErroApi } from '@/lib/api'
import { fusoAtivo, pode, useSessao } from '@/lib/sessao'
import { formatarData, formatarDataHora } from '@/lib/utils'
import { useItens, useLocais } from './Estoque'
import { agora, doCampo } from './operacoes/comum'

type TipoNota = 'compra' | 'venda'

const ESTRATEGIAS: Record<string, string> = {
  documento: 'lote da nota',
  escolha: 'lote escolhido',
  mais_antigo: 'mais antigo primeiro',
  sem_lote: 'sem lote',
}

/** Notas de compra (entram no estoque) e de venda (viram saídas, com a baixa por lote). */
const CFG = {
  compra: {
    api: '/api/estoque/notas',
    rota: '/enotrace/estoque/notas',
    F: 'enotrace.estoque',
    titulo: 'Notas de entrada',
    trilha: ['EnoTrace', 'Estoque'],
    parte: 'Fornecedor',
    explicacao:
      'Notas de compra de insumos, embalagens e outros itens. A nota da uva entra pela Recepção. Cada item da nota é associado a um item do estoque (ou descartado) e a escolha fica memorizada para as próximas notas do mesmo fornecedor.',
    lancar: 'Lançar no estoque',
  },
  venda: {
    api: '/api/saidas/notas',
    rota: '/enotrace/saidas/notas',
    F: 'enotrace.saidas',
    titulo: 'Notas de venda',
    trilha: ['EnoTrace', 'Saídas'],
    parte: 'Destinatário',
    explicacao:
      'XML de NF-e ou NFC-e de venda, de qualquer emissor (P29). Cada item da nota é associado a um produto (a caixa com 6 vira 6 garrafas pela conversão); a escolha fica memorizada. O lote sai da nota ou da estratégia da empresa (Configurações › Parâmetros).',
    lancar: 'Lançar a saída',
  },
} as const

const SITUACOES = {
  em_conferencia: { nome: 'Em conferência', tom: 'alerta' },
  lancada: { nome: 'Lançada', tom: 'sucesso' },
  descartada: { nome: 'Descartada', tom: 'neutro' },
  estornada: { nome: 'Estornada', tom: 'neutro' },
} as const
type Situacao = keyof typeof SITUACOES

const mensagem = (e: unknown) =>
  e instanceof ErroApi && e.campos.length
    ? `${e.message} ${e.campos.map((c) => c.mensagem).join(' ')}`
    : (e as Error).message

// Lista ------------------------------------------------------------------------------------------

interface LinhaNota {
  id: string
  numero: string
  serie: string | null
  emissao: string
  emitente: string
  destinatario: string | null
  situacao: Situacao
  itens: number
  pendentes: number
}

export function ListaNotas({ tipo }: { tipo: TipoNota }) {
  const cfg = CFG[tipo]
  const navegar = useNavigate()
  const { data: s } = useSessao()
  const qc = useQueryClient()
  const [situacao, setSituacao] = useState('todas')
  const [erro, setErro] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const notas = useQuery({
    queryKey: ['estoque-notas', situacao],
    queryFn: () => api.get<LinhaNota[]>(`${cfg.api}?situacao=${situacao}`),
  })

  async function importar(arquivo: File) {
    setErro(null)
    setAvisos([])
    const dados = new FormData()
    dados.set('arquivo', arquivo)
    try {
      const r = await api.post<{ id: string; existente: boolean; avisos: string[] }>(
        `${cfg.api}/importar-xml`,
        dados,
      )
      await qc.invalidateQueries({ queryKey: ['estoque-notas'] })
      navegar(`${cfg.rota}/${r.id}`, {
        state: { avisos: r.existente ? ['Esta nota já tinha sido importada.'] : r.avisos },
      })
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  return (
    <Pagina
      titulo={cfg.titulo}
      trilha={[...cfg.trilha]}
      acoes={
        pode(s, cfg.F, 'importar') && (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Importar XML da nota
            <input
              type="file"
              accept=".xml,text/xml,application/xml"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void importar(f)
              }}
            />
          </label>
        )
      }
    >
      <p className="text-sm text-muted-foreground">{cfg.explicacao}</p>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {avisos.map((a) => (
        <Aviso key={a}>{a}</Aviso>
      ))}
      <div className="flex flex-wrap gap-2">
        <Selecao
          aria-label="Situação"
          className="w-48"
          value={situacao}
          onChange={(e) => setSituacao(e.target.value)}
        >
          <option value="todas">Todas</option>
          <option value="em_conferencia">Em conferência</option>
          <option value="lancada">Lançadas</option>
          <option value="descartada">Descartadas</option>
        </Selecao>
      </div>
      <Cartao>
        <CorpoCartao className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className="px-5 py-2 font-medium">Nota</th>
                <th className="py-2 pr-4 font-medium">Emissão</th>
                <th className="py-2 pr-4 font-medium">{cfg.parte}</th>
                <th className="py-2 pr-4 text-right font-medium">Itens</th>
                <th className="py-2 pr-5 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {notas.data?.map((n) => (
                <tr
                  key={n.id}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
                  onClick={() => navegar(`${cfg.rota}/${n.id}`)}
                >
                  <td className="px-5 py-2">
                    <Link className="underline" to={`${cfg.rota}/${n.id}`}>
                      {n.numero}
                      {n.serie ? `/${n.serie}` : ''}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{formatarData(n.emissao.slice(0, 10))}</td>
                  <td className="py-2 pr-4">
                    {tipo === 'venda'
                      ? (n.destinatario ?? 'Consumidor não identificado')
                      : n.emitente}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {n.itens}
                    {n.situacao === 'em_conferencia' && n.pendentes > 0 && (
                      <span className="text-muted-foreground"> ({n.pendentes} a conferir)</span>
                    )}
                  </td>
                  <td className="py-2 pr-5">
                    <Etiqueta tom={SITUACOES[n.situacao].tom}>
                      {SITUACOES[n.situacao].nome}
                    </Etiqueta>
                  </td>
                </tr>
              ))}
              {notas.data && !notas.data.length && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-muted-foreground">
                    Nenhuma nota.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CorpoCartao>
      </Cartao>
    </Pagina>
  )
}

// Ficha ------------------------------------------------------------------------------------------

interface ItemNota {
  id: string
  numeroItem: number
  codigo: string
  descricao: string
  quantidade: string
  unidade: string
  valor: string | null
  lote: string | null
  fabricacao: string | null
  validade: string | null
  itemEstoqueId: string | null
  conversao: string | null
  localId: string | null
  descartado: string | null
  item: string | null
  unidadeBase: string | null
  local: string | null
}

interface Nota {
  id: string
  chave: string
  numero: string
  serie: string | null
  emissao: string
  emitenteId: string | null
  emitente: string
  emitenteDocumento: string
  destinatario: string | null
  situacao: Situacao
  versao: number
  itens: ItemNota[]
  saidaId?: string | null
  movimentos: Array<{
    id: string
    item: string
    unidade: string
    local: string
    lote: string | null
    quantidade: string
    tipo: string
    executadoEm: string
    motivo: string | null
  }>
}

/** Quantidade na unidade base: a da nota × a conversão. */
const naBase = (quantidade: string, conversao: string) =>
  (Math.round(Number(quantidade) * Number(conversao) * 1000) / 1000).toFixed(3)

export function FichaNota({ tipo }: { tipo: TipoNota }) {
  const cfg = CFG[tipo]
  const { id = '' } = useParams()
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  const qc = useQueryClient()
  const [pedido, setPedido] = useState<'descartar' | 'estornar' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const q = useQuery({
    queryKey: ['estoque-nota', id],
    queryFn: () => api.get<Nota>(`${cfg.api}/${id}`),
  })
  const local = useLocation()
  const avisosImportacao = (local.state as { avisos?: string[] } | null)?.avisos ?? []
  if (!q.data)
    return (
      <p className="text-sm text-muted-foreground">
        {q.isError ? (q.error as Error).message : 'Carregando…'}
      </p>
    )
  const n = q.data
  const atualizar = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['estoque-nota', id] }),
      qc.invalidateQueries({ queryKey: ['estoque-notas'] }),
      qc.invalidateQueries({ queryKey: ['estoque'] }),
    ])
  return (
    <Pagina
      titulo={`NF-e ${n.numero}${n.serie ? `/${n.serie}` : ''} · ${tipo === 'venda' ? (n.destinatario ?? 'Consumidor não identificado') : n.emitente}`}
      trilha={[...cfg.trilha, cfg.titulo]}
      acoes={
        <div className="flex gap-2">
          {n.situacao === 'em_conferencia' && pode(s, cfg.F, 'editar') && (
            <Botao variante="fantasma" onClick={() => setPedido('descartar')}>
              Descartar a nota
            </Botao>
          )}
          {n.situacao === 'descartada' && pode(s, cfg.F, 'editar') && (
            <Botao
              variante="secundario"
              onClick={async () => {
                setErro(null)
                try {
                  await api.post(`${cfg.api}/${id}/reabrir`, {})
                  await atualizar()
                } catch (e) {
                  setErro(mensagem(e))
                }
              }}
            >
              Reabrir
            </Botao>
          )}
          {n.situacao === 'lancada' && pode(s, cfg.F, 'estornar') && (
            <BotaoIcone rotulo="Estornar a nota" contorno aoClicar={() => setPedido('estornar')}>
              <Undo2 />
            </BotaoIcone>
          )}
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <Etiqueta tom={SITUACOES[n.situacao].tom}>{SITUACOES[n.situacao].nome}</Etiqueta>
        <span>emissão {formatarDataHora(n.emissao, fuso)}</span>
        <span>
          {n.emitenteId ? (
            <Link className="underline" to={`/gestao/pessoas/${n.emitenteId}`}>
              {n.emitente}
            </Link>
          ) : (
            n.emitente
          )}{' '}
          · {n.emitenteDocumento}
        </span>
        <span className="break-all">chave {n.chave}</span>
      </div>
      {n.saidaId && (
        <p className="text-sm">
          Lançada como{' '}
          <Link className="underline" to={`/enotrace/saidas/${n.saidaId}`}>
            saída
          </Link>
          .
        </p>
      )}
      {avisosImportacao.map((a) => (
        <Aviso key={a}>{a}</Aviso>
      ))}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {n.situacao === 'em_conferencia' ? (
        <Conferencia key={n.versao} nota={n} tipo={tipo} aoMudar={atualizar} />
      ) : (
        <ItensConferidos nota={n} />
      )}
      {n.movimentos.length > 0 && (
        <Cartao>
          <CabecalhoCartao titulo="Lançamentos no estoque" />
          <CorpoCartao className="flex flex-col gap-1 text-sm">
            {n.movimentos.map((m) => (
              <p key={m.id}>
                {formatarDataHora(m.executadoEm, fuso)} · {m.item} · {m.local}
                {m.lote ? ` · lote ${m.lote}` : ''} ·{' '}
                <strong>
                  {formatarDecimal(m.quantidade, 3)} {m.unidade}
                </strong>
                {m.tipo === 'estorno' && (
                  <span className="text-muted-foreground"> · estorno: {m.motivo}</span>
                )}
              </p>
            ))}
          </CorpoCartao>
        </Cartao>
      )}
      <Cartao>
        <CabecalhoCartao titulo="Arquivo da nota" />
        <CorpoCartao>
          <Anexos entidade="nfe" registroId={id} podeAlterar={false} fuso={fuso} />
        </CorpoCartao>
      </Cartao>
      <PedirMotivo
        aberto={pedido !== null}
        aoMudar={(v) => !v && setPedido(null)}
        titulo={
          pedido === 'estornar' ? `Estornar a NF-e ${n.numero}` : `Descartar a NF-e ${n.numero}`
        }
        descricao={
          pedido === 'estornar'
            ? 'As entradas saem do estoque com a data original e a nota volta à conferência.'
            : 'A nota não entra no estoque (ex.: serviço, uso imediato). Pode ser reaberta depois.'
        }
        rotuloBotao={pedido === 'estornar' ? 'Estornar' : 'Descartar'}
        aoConfirmar={async (motivo) => {
          await api.post(`${cfg.api}/${id}/${pedido === 'estornar' ? 'estorno' : 'descartar'}`, {
            motivo,
          })
          setPedido(null)
          await atualizar()
        }}
      />
    </Pagina>
  )
}

function ItensConferidos({ nota }: { nota: Nota }) {
  return (
    <Cartao>
      <CabecalhoCartao titulo="Itens" />
      <CorpoCartao className="flex flex-col gap-2 text-sm">
        {nota.itens.map((i) => (
          <div key={i.id} className="border-b pb-2 last:border-0 last:pb-0">
            <p>
              <span className="text-muted-foreground">{i.numeroItem}.</span> {i.descricao} ·{' '}
              {formatarDecimal(i.quantidade, 3)} {i.unidade}
            </p>
            <p className="text-muted-foreground">
              {i.descartado
                ? `Descartado: ${i.descartado}`
                : i.item
                  ? `→ ${i.item}, ${formatarDecimal(naBase(i.quantidade, i.conversao ?? '0'), 3)} ${i.unidadeBase} em ${i.local ?? '—'}${i.lote ? `, lote ${i.lote}` : ''}${i.validade ? `, validade ${formatarData(i.validade)}` : ''}`
                  : 'Sem associação.'}
            </p>
          </div>
        ))}
      </CorpoCartao>
    </Cartao>
  )
}

interface LinhaConferencia {
  id: string
  itemEstoqueId: string
  conversao: string
  localId: string
  lote: string
  fabricacao: string
  validade: string
  descartar: boolean
  motivo: string
}

interface Previa {
  bloqueios: string[]
  avisos: Array<{ codigo: string; mensagem: string }>
  entradas: number
  baixas?: Array<{ itemId: string; lote: string | null; quantidade: string; estrategia: string }>
}

function Conferencia({
  nota,
  tipo,
  aoMudar,
}: {
  nota: Nota
  tipo: TipoNota
  aoMudar: () => Promise<unknown>
}) {
  const cfg = CFG[tipo]
  const { data: s } = useSessao()
  const todos = useItens()
  // Venda: só produto acabado; compra: os demais itens do estoque.
  const opcoes = todos.data?.filter((x) =>
    tipo === 'venda' ? x.tipo === 'produto_acabado' : x.tipo !== 'produto_acabado',
  )
  const locais = useLocais()
  const [linhas, setLinhas] = useState<LinhaConferencia[]>(() =>
    nota.itens.map((i) => ({
      id: i.id,
      itemEstoqueId: i.itemEstoqueId ?? '',
      conversao: i.conversao ? String(Number(i.conversao)) : '',
      localId: i.localId ?? '',
      lote: i.lote ?? '',
      fabricacao: i.fabricacao ?? '',
      validade: i.validade ?? '',
      descartar: !!i.descartado,
      motivo: i.descartado ?? '',
    })),
  )
  const [executadoEm, setExecutadoEm] = useState(agora())
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [cientes, setCientes] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const podeEditar = pode(s, cfg.F, 'editar')
  const set = (n: number, p: Partial<LinhaConferencia>) => {
    setPrevia(null)
    setSalvo(null)
    setLinhas(linhas.map((l, j) => (j === n ? { ...l, ...p } : l)))
  }
  const corpo = () => ({
    itens: linhas.map((l) => ({
      id: l.id,
      itemEstoqueId: l.descartar ? null : l.itemEstoqueId || null,
      conversao: l.descartar ? null : l.conversao.replace(',', '.') || null,
      localId: l.descartar ? null : l.localId || null,
      lote: l.lote,
      fabricacao: l.fabricacao,
      validade: l.validade,
      descartado: l.descartar ? l.motivo || 'Descartado na conferência' : null,
    })),
  })
  async function executar(acao: () => Promise<void>) {
    setErro(null)
    setEnviando(true)
    try {
      await acao()
    } catch (e) {
      setErro(mensagem(e))
    } finally {
      setEnviando(false)
    }
  }
  const salvar = () => api.put(`${cfg.api}/${nota.id}`, corpo())
  const verPrevia = () =>
    executar(async () => {
      await salvar()
      const p = await api.post<Previa>(`${cfg.api}/${nota.id}/previa`, {
        executadoEm: doCampo(executadoEm),
      })
      setPrevia(p)
      setCientes([])
    })
  const lancar = () =>
    executar(async () => {
      await api.post(`${cfg.api}/${nota.id}/lancar`, {
        executadoEm: doCampo(executadoEm),
        cientes,
      })
      await aoMudar()
    })
  const podeLancar =
    !!previa && !previa.bloqueios.length && previa.avisos.every((a) => cientes.includes(a.codigo))
  return (
    <>
      <Cartao>
        <CabecalhoCartao
          titulo="Conferência"
          descricao="Associe cada item da nota a um item do estoque, com a conversão para a unidade dele e o local; ou descarte o que não entra no estoque (frete, serviço…)."
        />
        <CorpoCartao className="flex flex-col gap-4">
          {nota.itens.map((i, n) => {
            const l = linhas[n]!
            const it = opcoes?.find((x) => x.id === l.itemEstoqueId)
            return (
              <div key={i.id} className="flex flex-col gap-3 border-b pb-4 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <p>
                    <span className="text-muted-foreground">{i.numeroItem}.</span>{' '}
                    <strong>{i.descricao}</strong>{' '}
                    <span className="text-muted-foreground">· código {i.codigo}</span>
                  </p>
                  <p>
                    {formatarDecimal(i.quantidade, 3)} {i.unidade}
                    {i.valor && (
                      <span className="text-muted-foreground">
                        {' '}
                        · R$ {formatarDecimal(i.valor, 2)}
                      </span>
                    )}
                  </p>
                </div>
                <Caixa
                  rotulo="Descartar da importação"
                  checked={l.descartar}
                  disabled={!podeEditar}
                  onChange={(e) => set(n, { descartar: e.target.checked })}
                />
                {l.descartar ? (
                  <Campo rotulo="Motivo" id={`nf-mot-${n}`}>
                    <Entrada
                      id={`nf-mot-${n}`}
                      value={l.motivo}
                      placeholder="Ex.: frete, serviço, item de outro módulo"
                      disabled={!podeEditar}
                      onChange={(e) => set(n, { motivo: e.target.value })}
                    />
                  </Campo>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Campo rotulo="Item do estoque" id={`nf-item-${n}`} className="lg:col-span-2">
                      <Selecao
                        id={`nf-item-${n}`}
                        value={l.itemEstoqueId}
                        disabled={!podeEditar}
                        onChange={(e) => {
                          const novo = opcoes?.find((x) => x.id === e.target.value)
                          set(n, {
                            itemEstoqueId: e.target.value,
                            conversao:
                              (novo && conversaoSugerida(i.unidade, novo.unidadeBase)) ??
                              l.conversao,
                          })
                        }}
                      >
                        <option value="">Escolha</option>
                        {opcoes?.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.nome} ({x.unidadeBase})
                          </option>
                        ))}
                      </Selecao>
                    </Campo>
                    <Campo
                      rotulo={`Conversão (${it?.unidadeBase ?? 'base'} por ${i.unidade})`}
                      id={`nf-conv-${n}`}
                      ajuda={
                        it && l.conversao && Number(l.conversao.replace(',', '.')) > 0
                          ? `Entra: ${formatarDecimal(naBase(i.quantidade, l.conversao.replace(',', '.')), 3)} ${it.unidadeBase}`
                          : 'Quantos da unidade do item cabem em uma da nota.'
                      }
                    >
                      <Entrada
                        id={`nf-conv-${n}`}
                        inputMode="decimal"
                        value={l.conversao}
                        disabled={!podeEditar}
                        onChange={(e) =>
                          set(n, { conversao: e.target.value.replace(/[^\d.,]/g, '') })
                        }
                      />
                    </Campo>
                    <Campo rotulo="Local" id={`nf-local-${n}`}>
                      <Selecao
                        id={`nf-local-${n}`}
                        value={l.localId}
                        disabled={!podeEditar}
                        onChange={(e) => set(n, { localId: e.target.value })}
                      >
                        <option value="">Escolha</option>
                        {locais.data?.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.nome}
                          </option>
                        ))}
                      </Selecao>
                    </Campo>
                    <Campo
                      rotulo="Lote"
                      id={`nf-lote-${n}`}
                      ajuda={it?.controlaLote ? 'Obrigatório: o item controla lote.' : undefined}
                    >
                      <Entrada
                        id={`nf-lote-${n}`}
                        value={l.lote}
                        disabled={!podeEditar}
                        onChange={(e) => set(n, { lote: e.target.value })}
                      />
                    </Campo>
                    <Campo rotulo="Fabricação" id={`nf-fab-${n}`}>
                      <Entrada
                        id={`nf-fab-${n}`}
                        type="date"
                        value={l.fabricacao}
                        disabled={!podeEditar}
                        onChange={(e) => set(n, { fabricacao: e.target.value })}
                      />
                    </Campo>
                    <Campo rotulo="Validade" id={`nf-val-${n}`}>
                      <Entrada
                        id={`nf-val-${n}`}
                        type="date"
                        value={l.validade}
                        disabled={!podeEditar}
                        onChange={(e) => set(n, { validade: e.target.value })}
                      />
                    </Campo>
                  </div>
                )}
              </div>
            )
          })}
        </CorpoCartao>
      </Cartao>
      {previa && (
        <Cartao>
          <CabecalhoCartao
            titulo="Prévia"
            descricao={
              tipo === 'venda'
                ? 'De qual lote sai cada item.'
                : `${previa.entradas} ${previa.entradas === 1 ? 'entrada' : 'entradas'} no estoque.`
            }
          />
          <CorpoCartao className="flex flex-col gap-2">
            {previa.bloqueios.map((b) => (
              <Aviso key={b} tom="erro">
                {b}
              </Aviso>
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
            {previa.baixas?.map((b, n) => (
              <p key={n} className="text-sm">
                {opcoes?.find((x) => x.id === b.itemId)?.nome}: {formatarDecimal(b.quantidade, 0)}{' '}
                {b.lote ? `do lote ${b.lote}` : 'sem lote'}{' '}
                <span className="text-muted-foreground">
                  ({ESTRATEGIAS[b.estrategia] ?? b.estrategia})
                </span>
              </p>
            ))}
            {!previa.bloqueios.length && !previa.avisos.length && (
              <p className="text-sm text-muted-foreground">Tudo conferido.</p>
            )}
          </CorpoCartao>
        </Cartao>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {podeEditar && (
        <div className="flex flex-wrap items-end gap-2 border-t pt-4">
          <Campo rotulo="Entrada no estoque" id="nf-data">
            <Entrada
              id="nf-data"
              type="datetime-local"
              value={executadoEm}
              onChange={(e) => {
                setPrevia(null)
                setExecutadoEm(e.target.value)
              }}
            />
          </Campo>
          <Botao
            variante="secundario"
            disabled={enviando}
            onClick={() =>
              executar(async () => {
                await salvar()
                setSalvo('Conferência salva.')
              })
            }
          >
            Salvar conferência
          </Botao>
          <Botao variante="secundario" disabled={enviando} onClick={verPrevia}>
            Ver prévia
          </Botao>
          {pode(s, cfg.F, 'criar') && (
            <Botao disabled={!podeLancar || enviando} onClick={lancar}>
              {cfg.lancar}
            </Botao>
          )}
          {salvo && <span className="text-sm text-muted-foreground">{salvo}</span>}
        </div>
      )}
    </>
  )
}
