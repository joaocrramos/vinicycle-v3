// EnoTrace › Painel da cantina (cantina.md, Recipientes: painel): ocupação de cada recipiente, com
// lote, volume, % da capacidade, etapa, dias no recipiente e situação; filtros por local, tipo e
// situação; fermentações em andamento; atalhos para as operações. Tudo vem do livro (seção 4).
import { useQuery } from '@tanstack/react-query'
import {
  type Composicao,
  formatarDecimal,
  NOMES_SITUACAO_RECIPIENTE,
  type SITUACOES_RECIPIENTE,
} from '@vinicycle/shared'
import { MoreHorizontal, Snowflake } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Botao } from '@/componentes/ui/botao'
import { Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao'
import { Entrada, Selecao } from '@/componentes/ui/campos'
import { ConteudoMenu, GatilhoMenu, ItemMenu, Menu, SeparadorMenu } from '@/componentes/ui/menu'
import { Pagina } from '@/layout/Estrutura'
import { api } from '@/lib/api'
import { nomeNaLista, useReferencia } from '@/lib/referencia'
import { pode, useSessao } from '@/lib/sessao'
import { ResumoComposicao } from './operacoes/comum'
import { litros } from './Projetos'

type Situacao = (typeof SITUACOES_RECIPIENTE)[number]
const TOM: Record<Situacao, 'sucesso' | 'alerta' | 'erro' | 'neutro'> = {
  ativo: 'sucesso',
  aguardando_higienizacao: 'alerta',
  manutencao: 'erro',
  inativo: 'neutro',
}
const FERMENTACAO = { alcoolica: 'FA', malolatica: 'FML' } as Record<string, string>

interface Linha {
  id: string
  codigo: string
  tipo: string
  tipoRecipienteId: string
  eBarrica: boolean
  local: string
  localId: string
  capacidade: string
  possuiFrio: boolean
  situacao: Situacao
  motivoSituacao: string | null
  volume: string
  lote: { id: string; codigo: string; etapa: string | null; projeto: string } | null
  desde: string | null
  composicao: Composicao | null
  fermentacoes: Array<{ id: string; tipo: string; inicioEm: string }>
  ultimaHigienizacao: string | null
  higienizacaoVencida: boolean
}

const dias = (desde: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(desde).getTime()) / 86400_000))
const pct = (volume: string, capacidade: string) =>
  Number(capacidade) > 0 ? (Number(volume) / Number(capacidade)) * 100 : 0
const pctBr = (v: number) => `${formatarDecimal(v.toFixed(0), 0)}%`

/** Ocupação: trilho discreto e a parte cheia na cor primária, com a ponta arredondada. */
function Ocupacao({ volume, capacidade }: { volume: string; capacidade: string }) {
  const p = Math.min(100, pct(volume, capacidade))
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p)}
      aria-label="Ocupação"
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${p}%` }} />
    </div>
  )
}

function Resumo({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe?: string }) {
  return (
    <Cartao>
      <CorpoCartao className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{titulo}</span>
        <span className="text-2xl font-semibold tabular-nums">{valor}</span>
        {detalhe && <span className="text-xs text-muted-foreground">{detalhe}</span>}
      </CorpoCartao>
    </Cartao>
  )
}

function Atalhos({ r }: { r: Linha }) {
  const navegar = useNavigate()
  const { data: s } = useSessao()
  const ir = (tipo: string) => navegar(`/enotrace/operacoes/${tipo}?recipiente=${r.id}`)
  const lanca = pode(s, 'enotrace.operacoes', 'criar')
  return (
    <Menu>
      <GatilhoMenu asChild>
        <Botao variante="fantasma" tamanho="icone" aria-label={`Atalhos do ${r.codigo}`}>
          <MoreHorizontal />
        </Botao>
      </GatilhoMenu>
      <ConteudoMenu align="end">
        {lanca && r.lote && (
          <>
            <ItemMenu onSelect={() => ir('trasfega')}>Trasfega</ItemMenu>
            {r.eBarrica && <ItemMenu onSelect={() => ir('atesto')}>Atesto</ItemMenu>}
            <ItemMenu onSelect={() => ir('adicao_insumo')}>Adição de insumo</ItemMenu>
            <ItemMenu onSelect={() => ir('tratamento')}>Tratamento</ItemMenu>
            <ItemMenu onSelect={() => ir('perda')}>Perda</ItemMenu>
          </>
        )}
        {lanca && (
          <ItemMenu onSelect={() => ir('higienizacao')}>
            {r.lote ? 'Manutenção' : 'Higienização / manutenção'}
          </ItemMenu>
        )}
        {lanca && <SeparadorMenu />}
        <ItemMenu onSelect={() => navegar(`/enotrace/recipientes/${r.id}`)}>
          Ficha do recipiente
        </ItemMenu>
        {r.lote && (
          <ItemMenu onSelect={() => navegar(`/enotrace/lotes/${r.lote!.id}`)}>
            Ficha do lote
          </ItemMenu>
        )}
      </ConteudoMenu>
    </Menu>
  )
}

function CartaoRecipiente({ r }: { r: Linha }) {
  const { data: ref } = useReferencia()
  const p = pct(r.volume, r.capacidade)
  return (
    <Cartao>
      <CorpoCartao className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link className="font-semibold underline" to={`/enotrace/recipientes/${r.id}`}>
              {r.codigo}
            </Link>
            <span className="block truncate text-xs text-muted-foreground">
              {r.tipo} · {r.local}
              {r.possuiFrio && <Snowflake className="ml-1 inline size-3" aria-label="Com frio" />}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {r.situacao !== 'ativo' && (
              <Etiqueta tom={TOM[r.situacao]} title={r.motivoSituacao ?? undefined}>
                {NOMES_SITUACAO_RECIPIENTE[r.situacao]}
              </Etiqueta>
            )}
            <Atalhos r={r} />
          </div>
        </div>
        <Ocupacao volume={r.volume} capacidade={r.capacidade} />
        <p className="text-sm tabular-nums">
          {litros(r.volume)}{' '}
          <span className="text-muted-foreground">de {litros(r.capacidade)}</span> · {pctBr(p)}
        </p>
        {r.lote ? (
          <div className="flex flex-col gap-1 text-sm">
            <p>
              <Link className="underline" to={`/enotrace/lotes/${r.lote.id}`}>
                Lote {r.lote.codigo}
              </Link>
              {r.lote.etapa && (
                <span className="text-muted-foreground">
                  {' '}
                  · {nomeNaLista(ref, 'etapa_producao', r.lote.etapa)}
                </span>
              )}
              {r.desde && (
                <span className="text-muted-foreground">
                  {' '}
                  · {dias(r.desde) === 1 ? '1 dia' : `${dias(r.desde)} dias`} aqui
                </span>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">{r.lote.projeto}</p>
            {r.composicao && (
              <p className="text-xs">
                <ResumoComposicao c={r.composicao} />
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Vazio</p>
        )}
        {(r.fermentacoes.length > 0 || r.higienizacaoVencida) && (
          <div className="flex flex-wrap gap-1">
            {r.fermentacoes.map((f) => (
              <Link key={f.id} to={`/enotrace/fermentacoes/${f.id}`}>
                <Etiqueta tom="primario">
                  {FERMENTACAO[f.tipo] ?? f.tipo} em andamento · {dias(f.inicioEm)} d
                </Etiqueta>
              </Link>
            ))}
            {r.higienizacaoVencida && <Etiqueta tom="alerta">Higienização vencida</Etiqueta>}
          </div>
        )}
      </CorpoCartao>
    </Cartao>
  )
}

export function PaginaPainel() {
  const q = useQuery({
    queryKey: ['painel-recipientes'],
    queryFn: () => api.get<Linha[]>('/api/painel/recipientes'),
  })
  const [f, setF] = useState({ local: '', tipo: '', situacao: '', ocupacao: '', busca: '' })
  const todos = useMemo(() => q.data ?? [], [q.data])
  const locais = [...new Map(todos.map((r) => [r.localId, r.local])).entries()]
  const tipos = [...new Map(todos.map((r) => [r.tipoRecipienteId, r.tipo])).entries()]
  const lista = todos.filter(
    (r) =>
      (!f.local || r.localId === f.local) &&
      (!f.tipo || r.tipoRecipienteId === f.tipo) &&
      (!f.situacao || r.situacao === f.situacao) &&
      (!f.ocupacao || (f.ocupacao === 'cheios') === !!r.lote) &&
      (!f.busca ||
        `${r.codigo} ${r.lote?.codigo ?? ''} ${r.lote?.projeto ?? ''}`
          .toLowerCase()
          .includes(f.busca.toLowerCase())),
  )
  const volume = lista.reduce((t, r) => t + Number(r.volume), 0)
  const capacidade = lista.reduce((t, r) => t + Number(r.capacidade), 0)
  const cheios = lista.filter((r) => r.lote).length
  const aguardando = lista.filter((r) => r.situacao === 'aguardando_higienizacao').length
  const fermentando = lista.reduce((t, r) => t + r.fermentacoes.length, 0)
  return (
    <Pagina titulo="Painel da cantina" trilha={['EnoTrace']}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Resumo
          titulo="Ocupação"
          valor={capacidade ? pctBr((volume / capacidade) * 100) : '—'}
          detalhe={`${litros(volume.toFixed(2))} de ${litros(capacidade.toFixed(2))}`}
        />
        <Resumo titulo="Com vinho" valor={`${cheios} de ${lista.length}`} detalhe="recipientes" />
        <Resumo titulo="Aguardando higienização" valor={String(aguardando)} detalhe="recipientes" />
        <Resumo titulo="Fermentações" valor={String(fermentando)} detalhe="em andamento" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Entrada
          aria-label="Buscar"
          placeholder="Recipiente, lote ou projeto"
          className="w-full sm:w-60"
          value={f.busca}
          onChange={(e) => setF({ ...f, busca: e.target.value })}
        />
        <Selecao
          aria-label="Local"
          className="w-full sm:w-44"
          value={f.local}
          onChange={(e) => setF({ ...f, local: e.target.value })}
        >
          <option value="">Todos os locais</option>
          {locais.map(([id, nome]) => (
            <option key={id} value={id}>
              {nome}
            </option>
          ))}
        </Selecao>
        <Selecao
          aria-label="Tipo"
          className="w-full sm:w-44"
          value={f.tipo}
          onChange={(e) => setF({ ...f, tipo: e.target.value })}
        >
          <option value="">Todos os tipos</option>
          {tipos.map(([id, nome]) => (
            <option key={id} value={id}>
              {nome}
            </option>
          ))}
        </Selecao>
        <Selecao
          aria-label="Situação"
          className="w-full sm:w-52"
          value={f.situacao}
          onChange={(e) => setF({ ...f, situacao: e.target.value })}
        >
          <option value="">Todas as situações</option>
          {Object.entries(NOMES_SITUACAO_RECIPIENTE).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Selecao>
        <Selecao
          aria-label="Ocupação"
          className="w-full sm:w-40"
          value={f.ocupacao}
          onChange={(e) => setF({ ...f, ocupacao: e.target.value })}
        >
          <option value="">Cheios e vazios</option>
          <option value="cheios">Com vinho</option>
          <option value="vazios">Vazios</option>
        </Selecao>
      </div>
      {q.isError && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((r) => (
          <CartaoRecipiente key={r.id} r={r} />
        ))}
      </div>
      {q.data && !lista.length && (
        <p className="text-sm text-muted-foreground">
          {todos.length ? 'Nenhum recipiente com esses filtros.' : 'Nenhum recipiente cadastrado.'}
        </p>
      )}
    </Pagina>
  )
}
