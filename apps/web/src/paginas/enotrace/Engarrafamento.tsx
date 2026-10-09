// EnoTrace › Engarrafamento (cantina.md, Engarrafamento e Lote comercial): ordens com a previsão de
// garrafas e materiais (e o que falta no estoque), a produção de cada dia no mesmo lote comercial,
// o encerramento e os lotes comerciais com a composição do que foi engarrafado.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type Composicao, formatarDecimal } from '@vinicycle/shared'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { CampoNumero } from '@/componentes/campos-especiais'
import { PedirMotivo } from '@/componentes/PedirMotivo'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao'
import { AreaTexto, Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { DialogoSelosProducao } from './Selos'
import { Pagina } from '@/layout/Estrutura'
import { api, ErroApi } from '@/lib/api'
import { fusoAtivo, pode, useSessao } from '@/lib/sessao'
import { formatarData, formatarDataHora } from '@/lib/utils'
import { useLocais } from './Estoque'
import {
  agora,
  doCampo,
  MostrarPrevia,
  type Previa,
  ResumoComposicao,
  useProjetos,
} from './operacoes/comum'
import { litros } from './Projetos'

const F = 'enotrace.engarrafamento'

const SITUACOES = {
  planejada: { nome: 'Planejada', tom: 'primario' },
  em_execucao: { nome: 'Em execução', tom: 'alerta' },
  encerrada: { nome: 'Encerrada', tom: 'sucesso' },
  cancelada: { nome: 'Cancelada', tom: 'neutro' },
} as const
type Situacao = keyof typeof SITUACOES

const mensagem = (e: unknown) =>
  e instanceof ErroApi && e.campos.length
    ? `${e.message} ${e.campos.map((c) => c.mensagem).join(' ')}`
    : (e as Error).message
const qtd = (v: string, unidade: string) =>
  `${formatarDecimal(v, unidade === 'un' ? 0 : 3)} ${unidade}`

// Lista ------------------------------------------------------------------------------------------

interface LinhaOrdem {
  id: string
  situacao: Situacao
  dataPrevista: string
  projeto: string
  projetoNome: string
  produto: string
  loteComercial: string | null
  previstas: number
  produzidas: number
}

export function ListaOrdens() {
  const navegar = useNavigate()
  const { data: s } = useSessao()
  const [situacao, setSituacao] = useState('abertas')
  const q = useQuery({
    queryKey: ['ordens-engarrafamento', situacao],
    queryFn: () => api.get<LinhaOrdem[]>(`/api/engarrafamento/ordens?situacao=${situacao}`),
  })
  return (
    <Pagina
      titulo="Engarrafamento"
      trilha={['EnoTrace']}
      acoes={
        <div className="flex gap-2">
          <Botao variante="secundario" onClick={() => navegar('/enotrace/engarrafamento/lotes')}>
            Lotes comerciais
          </Botao>
          {pode(s, F, 'criar') && (
            <Botao onClick={() => navegar('/enotrace/engarrafamento/nova')}>
              <Plus /> Nova ordem
            </Botao>
          )}
        </div>
      }
    >
      <p className="text-sm text-muted-foreground">
        Cada ordem gera um lote comercial (o do contrarrótulo). A ordem não reserva estoque; a
        produção de cada dia baixa os litros e os materiais e dá entrada no produto acabado.
      </p>
      <Selecao
        aria-label="Situação"
        className="w-48"
        value={situacao}
        onChange={(e) => setSituacao(e.target.value)}
      >
        <option value="abertas">Abertas</option>
        <option value="todas">Todas</option>
      </Selecao>
      <Cartao>
        <CorpoCartao className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className="px-5 py-2 font-medium">Produto</th>
                <th className="py-2 pr-4 font-medium">Projeto</th>
                <th className="py-2 pr-4 font-medium">Prevista</th>
                <th className="py-2 pr-4 font-medium">Lote comercial</th>
                <th className="py-2 pr-4 text-right font-medium">Garrafas</th>
                <th className="py-2 pr-5 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.map((o) => (
                <tr
                  key={o.id}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
                  onClick={() => navegar(`/enotrace/engarrafamento/${o.id}`)}
                >
                  <td className="px-5 py-2">
                    <Link className="underline" to={`/enotrace/engarrafamento/${o.id}`}>
                      {o.produto}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">
                    {o.projeto} · {o.projetoNome}
                  </td>
                  <td className="py-2 pr-4">{formatarData(o.dataPrevista)}</td>
                  <td className="py-2 pr-4">{o.loteComercial ?? '—'}</td>
                  <td className="py-2 pr-4 text-right">
                    {o.produzidas.toLocaleString('pt-BR')} de {o.previstas.toLocaleString('pt-BR')}
                  </td>
                  <td className="py-2 pr-5">
                    <Etiqueta tom={SITUACOES[o.situacao].tom}>
                      {SITUACOES[o.situacao].nome}
                    </Etiqueta>
                  </td>
                </tr>
              ))}
              {q.data && !q.data.length && (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-muted-foreground">
                    Nenhuma ordem.
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

// Nova ordem e edição -----------------------------------------------------------------------------

interface Produto {
  id: string
  nome: string
  rotulos: Array<{ id: string; versao: string; teorAlcoolico: string; vigenteDesde: string }>
  formatos: Array<{ id: string; volumeMl: number; ativo: boolean; ficha: unknown[] }>
}

interface Previsao {
  perdaPercentual: number
  litrosDisponiveis: string
  litrosNecessarios: string
  recipientes: Array<{ recipienteId: string; codigo: string; lote: string; litros: string }>
  formatos: Array<{ formatoId: string; nome: string; volumeMl: number; garrafas: number }>
  materiais: Array<{
    itemId: string
    nome: string
    unidade: string
    previsto: string
    saldo: string
    falta: string
  }>
  avisos: string[]
}

const nomeVolume = (ml: number) =>
  ml >= 1000 ? `${formatarDecimal(String(ml / 1000), ml % 1000 ? 3 : 1)} L` : `${ml} mL`

function TabelaMateriais({ materiais }: { materiais: Previsao['materiais'] }) {
  if (!materiais.length)
    return (
      <p className="text-sm text-muted-foreground">
        O formato não tem ficha de embalagem (Produtos › formato › ficha).
      </p>
    )
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-muted-foreground">
        <tr>
          <th className="py-1 pr-4 font-medium">Material</th>
          <th className="py-1 pr-4 text-right font-medium">Necessário</th>
          <th className="py-1 pr-4 text-right font-medium">No estoque</th>
          <th className="py-1 text-right font-medium">Falta</th>
        </tr>
      </thead>
      <tbody>
        {materiais.map((m) => (
          <tr key={m.itemId} className="border-t">
            <td className="py-1 pr-4">{m.nome}</td>
            <td className="py-1 pr-4 text-right">{qtd(m.previsto, m.unidade)}</td>
            <td className="py-1 pr-4 text-right">{qtd(m.saldo, m.unidade)}</td>
            <td
              className={`py-1 text-right ${Number(m.falta) > 0 ? 'font-medium text-destructive' : 'text-muted-foreground'}`}
            >
              {Number(m.falta) > 0 ? qtd(m.falta, m.unidade) : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

interface FormOrdem {
  projetoId: string
  produtoId: string
  rotuloId: string
  dataPrevista: string
  engarrafadoPorId: string
  localProdutoId: string
  localMateriaisId: string
  formatos: Record<string, string> // formatoId → garrafas ('' = sugerir)
  recipientes: string[]
  observacao: string
}

export function NovaOrdem() {
  const projeto = new URLSearchParams(window.location.search).get('projeto') ?? ''
  return <FormularioOrdem inicial={{ projetoId: projeto }} />
}

export function EditarOrdem() {
  const { id = '' } = useParams()
  const q = useQuery({
    queryKey: ['ordem-engarrafamento', id],
    queryFn: () => api.get<FichaOrdem>(`/api/engarrafamento/ordens/${id}`),
  })
  if (!q.data) return <p className="text-sm text-muted-foreground">Carregando…</p>
  const o = q.data
  return (
    <FormularioOrdem
      id={id}
      versao={o.versao}
      inicial={{
        projetoId: o.projetoId,
        produtoId: o.produtoId,
        rotuloId: o.rotuloId ?? '',
        dataPrevista: o.dataPrevista,
        engarrafadoPorId: o.engarrafadoPorId ?? '',
        localProdutoId: o.localProdutoId,
        localMateriaisId: o.localMateriaisId,
        formatos: Object.fromEntries(o.formatos.map((f) => [f.formatoId, String(f.previstas)])),
        recipientes: o.origens.map((x) => x.recipienteId),
        observacao: o.observacao ?? '',
      }}
    />
  )
}

function FormularioOrdem({
  id,
  versao,
  inicial,
}: {
  id?: string
  versao?: number
  inicial: Partial<FormOrdem>
}) {
  const navegar = useNavigate()
  const qc = useQueryClient()
  const projetos = useProjetos()
  const locais = useLocais()
  const [d, setD] = useState<FormOrdem>(() => ({
    projetoId: '',
    produtoId: '',
    rotuloId: '',
    dataPrevista: agora().slice(0, 10),
    engarrafadoPorId: '',
    localProdutoId: '',
    localMateriaisId: '',
    formatos: {},
    recipientes: [],
    observacao: '',
    ...inicial,
  }))
  const [erro, setErro] = useState<string | null>(null)
  const set = (p: Partial<FormOrdem>) => setD({ ...d, ...p })
  const produtos = useQuery({
    queryKey: ['produtos-ativos'],
    queryFn: async () =>
      (
        await api.get<{ itens: Array<{ id: string; nome: string; marca: string }> }>(
          '/api/produtos?tamanho=0',
        )
      ).itens,
  })
  const produto = useQuery({
    queryKey: ['produto', d.produtoId],
    queryFn: () => api.get<Produto>(`/api/produtos/${d.produtoId}`),
    enabled: !!d.produtoId,
  })
  const engarrafadoras = useQuery({
    queryKey: ['pessoas-opcoes', 'engarrafadora'],
    queryFn: () =>
      api.get<Array<{ id: string; nome: string }>>('/api/pessoas/opcoes?papel=engarrafadora'),
  })
  const escolhidos = Object.keys(d.formatos)
  const corpoPrevisao = {
    projetoId: d.projetoId,
    produtoId: d.produtoId,
    recipientes: d.recipientes,
    formatos: escolhidos.map((f) => ({
      formatoId: f,
      garrafas: d.formatos[f] ? Number(d.formatos[f]) : null,
    })),
    localMateriaisId: d.localMateriaisId || null,
  }
  const previsao = useQuery({
    queryKey: ['previsao-envase', corpoPrevisao],
    queryFn: () => api.post<Previsao>('/api/engarrafamento/previsao', corpoPrevisao),
    enabled: !!d.projetoId && !!d.produtoId && escolhidos.length > 0,
  })
  const p = previsao.data
  async function salvar() {
    setErro(null)
    const corpo = {
      ...d,
      rotuloId: d.rotuloId || null,
      engarrafadoPorId: d.engarrafadoPorId || null,
      formatos: escolhidos.map((f) => ({
        formatoId: f,
        garrafasPrevistas: Number(
          d.formatos[f] || p?.formatos.find((x) => x.formatoId === f)?.garrafas || 0,
        ),
      })),
      recipientes: d.recipientes.length
        ? d.recipientes
        : (p?.recipientes.map((r) => r.recipienteId) ?? []),
      versao,
    }
    try {
      const r = id
        ? (await api.put(`/api/engarrafamento/ordens/${id}`, corpo), { id })
        : await api.post<{ id: string }>('/api/engarrafamento/ordens', corpo)
      await qc.invalidateQueries({ queryKey: ['ordens-engarrafamento'] })
      await qc.invalidateQueries({ queryKey: ['ordem-engarrafamento', r.id] })
      navegar(`/enotrace/engarrafamento/${r.id}`)
    } catch (e) {
      setErro(mensagem(e))
    }
  }
  return (
    <Pagina
      titulo={id ? 'Editar ordem' : 'Nova ordem de engarrafamento'}
      trilha={['EnoTrace', 'Engarrafamento']}
    >
      <Cartao>
        <CabecalhoCartao titulo="Ordem" />
        <CorpoCartao className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Projeto" id="oe-proj" obrigatorio>
            <Selecao
              id="oe-proj"
              value={d.projetoId}
              onChange={(e) => set({ projetoId: e.target.value, recipientes: [] })}
            >
              <option value="">Escolha</option>
              {projetos.data?.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.codigo} · {x.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Produto" id="oe-prod" obrigatorio>
            <Selecao
              id="oe-prod"
              value={d.produtoId}
              onChange={(e) => set({ produtoId: e.target.value, rotuloId: '', formatos: {} })}
            >
              <option value="">Escolha</option>
              {produtos.data?.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome} · {x.marca}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo
            rotulo="Versão do rótulo"
            id="oe-rot"
            ajuda="Vazio = a vigente na data prevista. O teor declarado é conferido com o laudo."
          >
            <Selecao
              id="oe-rot"
              value={d.rotuloId}
              onChange={(e) => set({ rotuloId: e.target.value })}
            >
              <option value="">Vigente</option>
              {produto.data?.rotulos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.versao} · {formatarDecimal(r.teorAlcoolico, 1)}% vol
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Data prevista" id="oe-data" obrigatorio>
            <Entrada
              id="oe-data"
              type="date"
              value={d.dataPrevista}
              onChange={(e) => set({ dataPrevista: e.target.value })}
            />
          </Campo>
          <Campo rotulo="Engarrafado por" id="oe-por" ajuda="Vazio = a própria vinícola.">
            <Selecao
              id="oe-por"
              value={d.engarrafadoPorId}
              onChange={(e) => set({ engarrafadoPorId: e.target.value })}
            >
              <option value="">A própria vinícola</option>
              {engarrafadoras.data?.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Produto acabado entra em" id="oe-lp" obrigatorio>
            <Selecao
              id="oe-lp"
              value={d.localProdutoId}
              onChange={(e) => set({ localProdutoId: e.target.value })}
            >
              <option value="">Escolha</option>
              {locais.data?.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Materiais saem de" id="oe-lm" obrigatorio>
            <Selecao
              id="oe-lm"
              value={d.localMateriaisId}
              onChange={(e) => set({ localMateriaisId: e.target.value })}
            >
              <option value="">Escolha</option>
              {locais.data?.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Observação" id="oe-obs" className="sm:col-span-2">
            <AreaTexto
              id="oe-obs"
              value={d.observacao}
              onChange={(e) => set({ observacao: e.target.value })}
            />
          </Campo>
        </CorpoCartao>
      </Cartao>
      {produto.data && (
        <Cartao>
          <CabecalhoCartao
            titulo="Formatos"
            descricao="Garrafas vazias: com um só formato, o sistema sugere pelos litros e pela perda média de envase."
          />
          <CorpoCartao className="flex flex-col gap-3">
            {produto.data.formatos
              .filter((f) => f.ativo)
              .map((f) => {
                const marcado = f.id in d.formatos
                const sugerida = p?.formatos.find((x) => x.formatoId === f.id)?.garrafas
                return (
                  <div key={f.id} className="flex flex-wrap items-end gap-3">
                    <Caixa
                      rotulo={nomeVolume(f.volumeMl)}
                      checked={marcado}
                      onChange={(e) => {
                        const formatos = { ...d.formatos }
                        if (e.target.checked) formatos[f.id] = ''
                        else delete formatos[f.id]
                        set({ formatos })
                      }}
                    />
                    {marcado && (
                      <Campo rotulo="Garrafas previstas" id={`oe-g-${f.id}`}>
                        <Entrada
                          id={`oe-g-${f.id}`}
                          inputMode="numeric"
                          className="w-36 text-right"
                          placeholder={sugerida !== undefined ? String(sugerida) : ''}
                          value={d.formatos[f.id]}
                          onChange={(e) =>
                            set({
                              formatos: {
                                ...d.formatos,
                                [f.id]: e.target.value.replace(/\D/g, ''),
                              },
                            })
                          }
                        />
                      </Campo>
                    )}
                    {!f.ficha.length && (
                      <span className="text-xs text-muted-foreground">sem ficha de embalagem</span>
                    )}
                  </div>
                )
              })}
            {!produto.data.formatos.some((f) => f.ativo) && (
              <p className="text-sm text-muted-foreground">
                O produto não tem formato. Cadastre em Produtos.
              </p>
            )}
          </CorpoCartao>
        </Cartao>
      )}
      {p && (
        <>
          <Cartao>
            <CabecalhoCartao
              titulo="Recipientes de origem"
              descricao={`Vinho do projeto: ${litros(p.litrosDisponiveis)}. Para as garrafas previstas, com ${formatarDecimal(String(p.perdaPercentual), 1)}% de perda média: ${litros(p.litrosNecessarios)}.`}
            />
            <CorpoCartao className="grid gap-2 sm:grid-cols-3">
              {p.recipientes.map((r) => (
                <Caixa
                  key={r.recipienteId}
                  rotulo={`${r.codigo} · ${litros(r.litros)} · ${r.lote}`}
                  checked={!d.recipientes.length || d.recipientes.includes(r.recipienteId)}
                  onChange={(e) => {
                    const atuais = d.recipientes.length
                      ? d.recipientes
                      : p.recipientes.map((x) => x.recipienteId)
                    set({
                      recipientes: e.target.checked
                        ? [...atuais, r.recipienteId]
                        : atuais.filter((x) => x !== r.recipienteId),
                    })
                  }}
                />
              ))}
              {!p.recipientes.length && (
                <p className="text-sm text-muted-foreground">
                  O projeto não tem vinho em recipiente.
                </p>
              )}
            </CorpoCartao>
          </Cartao>
          <Cartao>
            <CabecalhoCartao
              titulo="Materiais"
              descricao="Pela ficha de embalagem de cada formato. A ordem não reserva estoque: compre o que falta a tempo."
            />
            <CorpoCartao className="flex flex-col gap-3">
              <TabelaMateriais materiais={p.materiais} />
              {p.avisos.map((a) => (
                <Aviso key={a}>{a}</Aviso>
              ))}
            </CorpoCartao>
          </Cartao>
        </>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <div className="flex gap-2 border-t pt-4">
        <Botao onClick={salvar}>{id ? 'Salvar' : 'Criar ordem'}</Botao>
        <Botao variante="secundario" onClick={() => navegar(-1)}>
          Cancelar
        </Botao>
      </div>
    </Pagina>
  )
}

// Ficha da ordem ---------------------------------------------------------------------------------

interface FichaOrdem {
  id: string
  versao: number
  situacao: Situacao
  projetoId: string
  produtoId: string
  rotuloId: string | null
  dataPrevista: string
  engarrafadoPorId: string | null
  localProdutoId: string
  localMateriaisId: string
  observacao: string | null
  motivoCancelamento: string | null
  projeto: string
  projetoNome: string
  produto: string
  rotulo: string | null
  teorDeclarado: string | null
  engarrafadoPor: string | null
  localProduto: string
  localMateriais: string
  formatos: Array<{
    formatoId: string
    volumeMl: number
    nome: string
    previstas: number
    produzidas: number
  }>
  origens: Array<{ recipienteId: string; codigo: string; litros: string; lote: string | null }>
  producoes: Array<{
    id: string
    operacaoId: string
    codigo: string
    situacao: string
    executadoEm: string
    litrosTirados: string
    litrosEngarrafados: string
    perdaLitros: string
    formatos: Array<{ formatoId: string; garrafas: number }>
    materiais: Array<{ item: string; unidade: string; previsto: string; real: string }> | null
  }>
  loteComercial: {
    codigo: string
    litros: string
    primeiroEnvase: string | null
    ultimoEnvase: string | null
    composicao: Composicao | null
    origens: Array<{ loteId: string; codigo: string; litros: string }>
  } | null
  materiais: Previsao['materiais']
}

export function FichaOrdemEngarrafamento() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  const qc = useQueryClient()
  const [produzindo, setProduzindo] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [selosDe, setSelosDe] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const q = useQuery({
    queryKey: ['ordem-engarrafamento', id],
    queryFn: () => api.get<FichaOrdem>(`/api/engarrafamento/ordens/${id}`),
  })
  if (!q.data)
    return (
      <p className="text-sm text-muted-foreground">
        {q.isError ? (q.error as Error).message : 'Carregando…'}
      </p>
    )
  const o = q.data
  const aberta = o.situacao === 'planejada' || o.situacao === 'em_execucao'
  const atualizar = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['ordem-engarrafamento', id] }),
      qc.invalidateQueries({ queryKey: ['ordens-engarrafamento'] }),
    ])
  const nomeFormato = (f: string) => o.formatos.find((x) => x.formatoId === f)?.nome ?? ''
  return (
    <Pagina
      titulo={`${o.produto}${o.loteComercial ? ` · ${o.loteComercial.codigo}` : ''}`}
      trilha={['EnoTrace', 'Engarrafamento']}
      acoes={
        <div className="flex flex-wrap gap-2">
          {aberta && pode(s, F, 'editar') && (
            <Botao
              variante="secundario"
              onClick={() => navegar(`/enotrace/engarrafamento/${id}/editar`)}
            >
              Editar
            </Botao>
          )}
          {o.situacao === 'em_execucao' && pode(s, F, 'confirmar') && (
            <Botao
              variante="secundario"
              onClick={async () => {
                setErro(null)
                try {
                  await api.post(`/api/engarrafamento/ordens/${id}/encerrar`, {})
                  await atualizar()
                } catch (e) {
                  setErro(mensagem(e))
                }
              }}
            >
              Encerrar
            </Botao>
          )}
          {aberta && pode(s, F, 'editar') && (
            <Botao variante="fantasma" onClick={() => setCancelando(true)}>
              Cancelar ordem
            </Botao>
          )}
          {aberta && pode(s, F, 'confirmar') && !produzindo && (
            <Botao onClick={() => setProduzindo(true)}>
              <Plus /> Produção do dia
            </Botao>
          )}
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <Etiqueta tom={SITUACOES[o.situacao].tom}>{SITUACOES[o.situacao].nome}</Etiqueta>
        <Link className="underline" to={`/enotrace/projetos/${o.projetoId}`}>
          {o.projeto} · {o.projetoNome}
        </Link>
        <span>prevista para {formatarData(o.dataPrevista)}</span>
        {o.rotulo && (
          <span>
            rótulo {o.rotulo} · {formatarDecimal(o.teorDeclarado ?? '0', 1)}% vol declarado
          </span>
        )}
        <span>{o.engarrafadoPor ? `engarrafado por ${o.engarrafadoPor}` : 'envase próprio'}</span>
      </div>
      {o.motivoCancelamento && <Aviso tom="info">Cancelada: {o.motivoCancelamento}</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {produzindo && (
        <ProducaoDoDia
          ordem={o}
          aoFechar={() => setProduzindo(false)}
          aoConfirmar={async () => {
            setProduzindo(false)
            await atualizar()
          }}
        />
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao>
          <CabecalhoCartao titulo="Formatos" />
          <CorpoCartao className="flex flex-col gap-1 text-sm">
            {o.formatos.map((f) => (
              <p key={f.formatoId}>
                {f.nome}:{' '}
                <strong>
                  {f.produzidas.toLocaleString('pt-BR')} de {f.previstas.toLocaleString('pt-BR')}
                </strong>{' '}
                garrafas
              </p>
            ))}
            <p className="text-muted-foreground">
              Produto acabado em {o.localProduto}; materiais de {o.localMateriais}.
            </p>
          </CorpoCartao>
        </Cartao>
        <Cartao>
          <CabecalhoCartao titulo="Recipientes de origem" />
          <CorpoCartao className="flex flex-col gap-1 text-sm">
            {o.origens.map((r) => (
              <p key={r.recipienteId}>
                <Link className="underline" to={`/enotrace/recipientes/${r.recipienteId}`}>
                  {r.codigo}
                </Link>{' '}
                · {litros(r.litros)}
                {r.lote ? ` · ${r.lote}` : ' · sem vinho do projeto'}
              </p>
            ))}
          </CorpoCartao>
        </Cartao>
      </div>
      {o.loteComercial && (
        <Cartao>
          <CabecalhoCartao
            titulo={`Lote comercial ${o.loteComercial.codigo}`}
            descricao="Composição do que foi efetivamente engarrafado, ponderada pelos litros."
          />
          <CorpoCartao className="flex flex-col gap-1 text-sm">
            <p>
              {litros(o.loteComercial.litros)} engarrafados
              {o.loteComercial.primeiroEnvase &&
                ` · envase de ${formatarDataHora(o.loteComercial.primeiroEnvase, fuso)}${o.loteComercial.ultimoEnvase && o.loteComercial.ultimoEnvase !== o.loteComercial.primeiroEnvase ? ` a ${formatarDataHora(o.loteComercial.ultimoEnvase, fuso)}` : ''}`}
            </p>
            {o.loteComercial.composicao && (
              <p>
                <ResumoComposicao c={o.loteComercial.composicao} />
              </p>
            )}
            {o.loteComercial.origens.length > 0 && (
              <p className="text-muted-foreground">
                Lotes de produção:{' '}
                {o.loteComercial.origens.map((l, n) => (
                  <span key={l.loteId}>
                    {n > 0 && ', '}
                    <Link className="underline" to={`/enotrace/lotes/${l.loteId}`}>
                      {l.codigo}
                    </Link>{' '}
                    ({litros(l.litros)})
                  </span>
                ))}
              </p>
            )}
          </CorpoCartao>
        </Cartao>
      )}
      {aberta && (
        <Cartao>
          <CabecalhoCartao
            titulo="Materiais para o que falta engarrafar"
            descricao="Garrafas previstas menos as produzidas, pela ficha de embalagem."
          />
          <CorpoCartao>
            <TabelaMateriais materiais={o.materiais} />
          </CorpoCartao>
        </Cartao>
      )}
      <DialogoSelosProducao producaoId={selosDe} aoFechar={() => setSelosDe(null)} />
      <Cartao>
        <CabecalhoCartao titulo="Produções" />
        <CorpoCartao className="flex flex-col gap-3 text-sm">
          {o.producoes.map((p) => (
            <div key={p.id} className="border-b pb-2 last:border-0 last:pb-0">
              <p>
                <Link className="underline" to={`/enotrace/operacoes/${p.operacaoId}`}>
                  {p.codigo}
                </Link>{' '}
                · {formatarDataHora(p.executadoEm, fuso)}
                {p.situacao === 'estornada' && (
                  <Etiqueta tom="neutro" className="ml-2">
                    Estornada
                  </Etiqueta>
                )}
                {p.situacao === 'confirmada' && pode(s, 'enotrace.engarrafamento', 'confirmar') && (
                  <Botao variante="secundario" className="ml-2" onClick={() => setSelosDe(p.id)}>
                    Selos
                  </Botao>
                )}
              </p>
              <p className="text-muted-foreground">
                {p.formatos
                  .map((f) => `${f.garrafas.toLocaleString('pt-BR')} × ${nomeFormato(f.formatoId)}`)
                  .join(', ')}{' '}
                · {litros(p.litrosTirados)} tirados, perda de {litros(p.perdaLitros)}
              </p>
              {p.materiais && (
                <p className="text-muted-foreground">
                  {p.materiais
                    .map(
                      (m) =>
                        `${m.item}: ${qtd(m.real, m.unidade)}${m.real !== m.previsto ? ` (previsto ${qtd(m.previsto, m.unidade)})` : ''}`,
                    )
                    .join(' · ')}
                </p>
              )}
            </div>
          ))}
          {!o.producoes.length && (
            <p className="text-muted-foreground">
              Nenhuma produção. Cada dia de envase é uma produção, no mesmo lote comercial. A
              produção se estorna pela operação.
            </p>
          )}
        </CorpoCartao>
      </Cartao>
      <PedirMotivo
        aberto={cancelando}
        aoMudar={setCancelando}
        titulo="Cancelar a ordem"
        descricao="Só a ordem sem produção se cancela; com produção, estorne as produções ou encerre."
        rotuloBotao="Cancelar ordem"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/engarrafamento/ordens/${id}/cancelar`, { motivo })
          setCancelando(false)
          await atualizar()
        }}
      />
    </Pagina>
  )
}

interface PreviaProducao extends Previa {
  litrosTirados: string
  litrosEngarrafados: string
  perdaLitros: string
  materiais: Array<{
    itemId: string
    nome: string
    unidade: string
    previsto: string
    real: string
    loteItemId: string | null
  }>
}

function ProducaoDoDia({
  ordem,
  aoFechar,
  aoConfirmar,
}: {
  ordem: FichaOrdem
  aoFechar: () => void
  aoConfirmar: () => Promise<unknown>
}) {
  const [executadoEm, setExecutadoEm] = useState(agora())
  const [tirados, setTirados] = useState<Record<string, string | null>>({})
  const [garrafas, setGarrafas] = useState<Record<string, string>>({})
  const [reais, setReais] = useState<Record<string, string>>({})
  const [previa, setPrevia] = useState<PreviaProducao | null>(null)
  const [cientes, setCientes] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const corpo = () => ({
    executadoEm: doCampo(executadoEm),
    recipientes: ordem.origens
      .filter((r) => tirados[r.recipienteId])
      .map((r) => ({ recipienteId: r.recipienteId, litros: tirados[r.recipienteId] })),
    formatos: ordem.formatos
      .filter((f) => Number(garrafas[f.formatoId]) > 0)
      .map((f) => ({ formatoId: f.formatoId, garrafas: Number(garrafas[f.formatoId]) })),
    materiais: Object.entries(reais)
      .filter(([, v]) => v !== '')
      .map(([itemId, real]) => ({ itemId, real: real.replace(',', '.') })),
    cientes,
  })
  const limpar = () => {
    setPrevia(null)
    setCientes([])
  }
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
  const podeConfirmar =
    !!previa && !previa.bloqueios.length && previa.avisos.every((a) => cientes.includes(a.codigo))
  return (
    <Cartao>
      <CabecalhoCartao
        titulo="Produção do dia"
        descricao="Litros que saíram de cada recipiente e garrafas de cada formato. A perda de vinho é o que saiu e não foi engarrafado."
      />
      <CorpoCartao className="flex flex-col gap-4">
        <Campo rotulo="Execução" id="pd-data" obrigatorio>
          <Entrada
            id="pd-data"
            type="datetime-local"
            className="w-60"
            value={executadoEm}
            onChange={(e) => {
              limpar()
              setExecutadoEm(e.target.value)
            }}
          />
        </Campo>
        <div className="grid gap-3 sm:grid-cols-3">
          {ordem.origens.map((r) => (
            <Campo
              key={r.recipienteId}
              rotulo={`${r.codigo} (${litros(r.litros)})`}
              id={`pd-r-${r.recipienteId}`}
            >
              <CampoNumero
                id={`pd-r-${r.recipienteId}`}
                casas={2}
                unidade="L"
                valor={tirados[r.recipienteId]}
                aoMudar={(v) => {
                  limpar()
                  setTirados({ ...tirados, [r.recipienteId]: v })
                }}
              />
            </Campo>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {ordem.formatos.map((f) => (
            <Campo key={f.formatoId} rotulo={`Garrafas de ${f.nome}`} id={`pd-g-${f.formatoId}`}>
              <Entrada
                id={`pd-g-${f.formatoId}`}
                inputMode="numeric"
                className="text-right"
                value={garrafas[f.formatoId] ?? ''}
                onChange={(e) => {
                  limpar()
                  setGarrafas({ ...garrafas, [f.formatoId]: e.target.value.replace(/\D/g, '') })
                }}
              />
            </Campo>
          ))}
        </div>
        {previa && previa.materiais.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Materiais: previsto pela ficha × real</p>
            {previa.materiais.map((m) => {
              const info = m
              return (
                <div key={m.itemId} className="flex flex-wrap items-end gap-3 text-sm">
                  <span className="w-56">{info.nome}</span>
                  <span className="w-32 text-muted-foreground">
                    previsto {qtd(m.previsto, info.unidade)}
                  </span>
                  <Entrada
                    aria-label={`Real de ${info.nome}`}
                    inputMode="decimal"
                    className="w-32 text-right"
                    value={
                      reais[m.itemId] ?? formatarDecimal(m.real, info.unidade === 'un' ? 0 : 3)
                    }
                    onChange={(e) => {
                      limpar()
                      setReais({ ...reais, [m.itemId]: e.target.value.replace(/[^\d,]/g, '') })
                    }}
                  />
                </div>
              )
            })}
          </div>
        )}
        {previa && (
          <>
            <p className="text-sm">
              Saem {litros(previa.litrosTirados)}; engarrafados {litros(previa.litrosEngarrafados)};
              perda de vinho de <strong>{litros(previa.perdaLitros)}</strong>.
            </p>
            <MostrarPrevia previa={previa} cientes={cientes} setCientes={setCientes} />
          </>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <div className="flex flex-wrap gap-2">
          <Botao
            variante="secundario"
            disabled={enviando}
            onClick={() =>
              executar(async () => {
                setPrevia(
                  await api.post<PreviaProducao>(
                    `/api/engarrafamento/ordens/${ordem.id}/producoes/previa`,
                    corpo(),
                  ),
                )
                setCientes([])
              })
            }
          >
            Ver prévia
          </Botao>
          <Botao
            disabled={!podeConfirmar || enviando}
            onClick={() =>
              executar(async () => {
                await api.post(`/api/engarrafamento/ordens/${ordem.id}/producoes`, corpo())
                await aoConfirmar()
              })
            }
          >
            Confirmar produção
          </Botao>
          <Botao variante="fantasma" onClick={aoFechar}>
            Fechar
          </Botao>
        </div>
      </CorpoCartao>
    </Cartao>
  )
}

// Lotes comerciais -------------------------------------------------------------------------------

export function ListaLotesComerciais() {
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  const q = useQuery({
    queryKey: ['lotes-comerciais'],
    queryFn: () =>
      api.get<
        Array<{
          id: string
          codigo: string
          litros: string
          primeiroEnvase: string | null
          produto: string | null
          projeto: string | null
          ordemId: string | null
          composicao: Composicao | null
        }>
      >('/api/lotes-comerciais'),
  })
  return (
    <Pagina titulo="Lotes comerciais" trilha={['EnoTrace', 'Engarrafamento']}>
      <p className="text-sm text-muted-foreground">
        O lote do contrarrótulo: um por ordem de engarrafamento, com a composição do que foi
        engarrafado.
      </p>
      <Cartao>
        <CorpoCartao className="flex flex-col gap-3 text-sm">
          {q.data?.map((l) => (
            <div key={l.id} className="border-b pb-2 last:border-0 last:pb-0">
              <p>
                {l.ordemId ? (
                  <Link
                    className="font-medium underline"
                    to={`/enotrace/engarrafamento/${l.ordemId}`}
                  >
                    {l.codigo}
                  </Link>
                ) : (
                  <strong>{l.codigo}</strong>
                )}{' '}
                · {l.produto ?? '—'} · {l.projeto ?? '—'} · {litros(l.litros)}
                {l.primeiroEnvase && ` · ${formatarDataHora(l.primeiroEnvase, fuso)}`} ·{' '}
                <Link className="underline" to={`/enotrace/engarrafamento/lotes/${l.id}`}>
                  quem recebeu
                </Link>{' '}
                ·{' '}
                <Link className="underline" to={`/enotrace/historia?loteComercial=${l.id}`}>
                  história
                </Link>
              </p>
              {l.composicao && (
                <p className="text-muted-foreground">
                  <ResumoComposicao c={l.composicao} />
                </p>
              )}
            </div>
          ))}
          {q.data && !q.data.length && (
            <p className="text-muted-foreground">Nenhum lote comercial.</p>
          )}
        </CorpoCartao>
      </Cartao>
    </Pagina>
  )
}
