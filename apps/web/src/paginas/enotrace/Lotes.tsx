// EnoTrace › Lote de produção: partes por recipiente, composição ponderada, genealogia, uva de
// origem, etapas e o que o rótulo pode declarar (cantina.md, Composição e rótulo; 03-modelo-de-dados.md,
// seções 4 e 5). Também o conteúdo e o livro de um recipiente.
import { useQuery } from '@tanstack/react-query'
import { type Composicao, formatarDecimal, TIPOS_OPERACAO } from '@vinicycle/shared'
import { Link, useNavigate, useParams } from 'react-router'
import { type Coluna, TabelaDados } from '@/componentes/TabelaDados'
import { Botao } from '@/componentes/ui/botao'
import { Aba, Abas, ConteudoAba, ListaAbas } from '@/componentes/ui/abas'
import { CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao'
import { Pagina } from '@/layout/Estrutura'
import { api } from '@/lib/api'
import { useReferencia } from '@/lib/referencia'
import { fusoAtivo, pode, useSessao } from '@/lib/sessao'
import { AnalisesDoLote } from './Laboratorio'
import { formatarDataHora } from '@/lib/utils'
import { ResumoComposicao } from './operacoes/comum'
import { litros } from './Projetos'

export interface Rotulo {
  varietal: Array<{
    abrangencia: string
    minimo: number
    fonte: string
    variedades: Array<{ nome: string; percentual: number; pode: boolean }>
  }>
  safra: null | {
    minimo: number
    fonte: string
    safras: Array<{ safra: number | null; percentual: number; pode: boolean }>
  }
}

const pct = (n: number) => `${formatarDecimal(n.toFixed(2), 2)}%`

/** O que o rótulo pode declarar: informa, não impede (P29). */
export function CartaoRotulo({
  rotulo,
  titulo = 'O que o rótulo pode declarar',
  descricao = 'Pela composição atual e pelas regras em vigor. O sistema informa; a decisão é da vinícola.',
}: {
  rotulo: Rotulo
  titulo?: string
  descricao?: string
}) {
  return (
    <Cartao>
      <CabecalhoCartao titulo={titulo} descricao={descricao} />
      <CorpoCartao className="flex flex-col gap-3 text-sm">
        {rotulo.varietal.map((v) => (
          <div key={v.abrangencia}>
            <p className="font-medium">
              Varietal ({v.abrangencia}: pelo menos {v.minimo}%){' '}
              <span className="text-xs font-normal text-muted-foreground">{v.fonte}</span>
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {v.variedades.map((x) => (
                <Etiqueta key={x.nome} tom={x.pode ? 'sucesso' : 'neutro'}>
                  {x.nome} {pct(x.percentual)} {x.pode ? '· pode' : '· não pode'}
                </Etiqueta>
              ))}
            </div>
          </div>
        ))}
        {rotulo.safra && (
          <div>
            <p className="font-medium">
              Safra (pelo menos {rotulo.safra.minimo}%){' '}
              <span className="text-xs font-normal text-muted-foreground">
                {rotulo.safra.fonte}
              </span>
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {rotulo.safra.safras.map((x) => (
                <Etiqueta key={String(x.safra)} tom={x.pode ? 'sucesso' : 'neutro'}>
                  {x.safra ?? 'Sem safra'} {pct(x.percentual)} {x.pode ? '· pode' : '· não pode'}
                </Etiqueta>
              ))}
            </div>
          </div>
        )}
        {!rotulo.varietal.length && !rotulo.safra && (
          <p className="text-muted-foreground">Sem regras em vigor.</p>
        )}
      </CorpoCartao>
    </Cartao>
  )
}

// Recipiente -----------------------------------------------------------------------------------

interface Conteudo {
  volume: string
  capacidade: string
  lote: {
    id: string
    codigo: string
    etapa: string | null
    projetoId: string
    projeto: string
  } | null
  composicao: Composicao
  movimentos: Array<{
    executadoEm: string
    operacaoId: string
    operacao: string
    nomeOperacao: string
    situacaoOperacao: string
    nomeTipo: string
    lote: string
    litros: string
    estimado: boolean
    saldo: string
  }>
}

/** Conteúdo atual do recipiente e o livro: o volume é a soma dos lançamentos (seção 4). */
export function ConteudoRecipiente({ id }: { id: string }) {
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  const q = useQuery({
    queryKey: ['recipiente-conteudo', id],
    queryFn: () => api.get<Conteudo>(`/api/recipientes/${id}/conteudo`),
  })
  if (!q.data) return <p className="text-sm text-muted-foreground">Carregando…</p>
  const c = q.data
  const ocupacao = Math.min(100, (Number(c.volume) / Number(c.capacidade)) * 100)
  return (
    <div className="flex flex-col gap-4">
      <Cartao>
        <CorpoCartao className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-2xl font-semibold">{litros(c.volume)}</p>
            <p className="text-muted-foreground">
              de {litros(c.capacidade)} ({formatarDecimal(ocupacao.toFixed(1), 1)}%)
            </p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${ocupacao}%` }} />
          </div>
          {c.lote ? (
            <>
              <p>
                Lote{' '}
                <Link className="font-medium underline" to={`/enotrace/lotes/${c.lote.id}`}>
                  {c.lote.codigo}
                </Link>{' '}
                ·{' '}
                <Link className="underline" to={`/enotrace/projetos/${c.lote.projetoId}`}>
                  {c.lote.projeto}
                </Link>
              </p>
              <p>
                Composição: <ResumoComposicao c={c.composicao} />
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">Vazio.</p>
          )}
        </CorpoCartao>
      </Cartao>
      <Cartao>
        <CabecalhoCartao
          titulo="Livro de volumes"
          descricao="Do mais recente para o mais antigo, com o saldo depois de cada lançamento."
        />
        <ul className="divide-y text-sm">
          {c.movimentos.map((m, n) => (
            <li key={n} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2">
              <span>
                {formatarDataHora(m.executadoEm, fuso)} ·{' '}
                <Link className="underline" to={`/enotrace/operacoes/${m.operacaoId}`}>
                  {m.operacao}
                </Link>{' '}
                {m.nomeTipo} · lote {m.lote}
                {m.estimado && <Etiqueta className="ml-2">estimado</Etiqueta>}
                {m.situacaoOperacao === 'estornada' && (
                  <Etiqueta className="ml-2" tom="erro">
                    estornada
                  </Etiqueta>
                )}
              </span>
              <span className="flex gap-4">
                <span className={Number(m.litros) < 0 ? 'text-destructive' : ''}>
                  {litros(m.litros)}
                </span>
                <span className="w-28 text-right text-muted-foreground">{litros(m.saldo)}</span>
              </span>
            </li>
          ))}
          {!c.movimentos.length && (
            <li className="px-5 py-6 text-muted-foreground">Nenhum lançamento.</li>
          )}
        </ul>
      </Cartao>
    </div>
  )
}

// Lote -----------------------------------------------------------------------------------------

interface Lote {
  id: string
  codigo: string
  projetoId: string
  projeto: string
  titular: string | null
  tipo: 'propria' | 'terceiro'
  etapa: string | null
  origem: string
  safra: number | null
  ciclo: string | null
  rendimentoReal: string | null
  situacao: 'ativo' | 'sem_saldo'
  volume: string
  partes: Array<{
    recipienteId: string
    recipiente: string
    litros: string
    composicao: Composicao
  }>
  composicao: Composicao
  genealogia: Array<{
    sentido: 'origem' | 'destino'
    loteId: string
    codigo: string
    litros: string
    tipo: string
    operacao: string
    operacaoId: string
  }>
  uva: Array<{
    romaneio: string
    romaneioId: string
    variedade: string
    kg: string
    fornecedor: string | null
  }>
  etapas: Array<{ etapa: string; desde: string; por: string | null }>
  rotulo: Rotulo
}

const ORIGENS: Record<string, string> = {
  recepcao: 'Recepção da uva',
  corte: 'Corte',
  divisao: 'Divisão',
  granel: 'Granel',
  retorno_terceiro: 'Retorno de terceiro',
  titularidade: 'Transferência de titularidade',
  carga_inicial: 'Carga inicial',
}
const LIGACOES: Record<string, string> = {
  incorporacao: 'incorporação',
  corte: 'corte',
  lote_novo: 'lote novo',
  divisao: 'divisão',
  titularidade: 'transferência de titularidade',
}

export function FichaLote() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const { data: s } = useSessao()
  const { data: ref } = useReferencia()
  const fuso = fusoAtivo(s)
  const q = useQuery({ queryKey: ['lote', id], queryFn: () => api.get<Lote>(`/api/lotes/${id}`) })
  if (!q.data)
    return (
      <p className="text-sm text-muted-foreground">
        {q.isError ? (q.error as Error).message : 'Carregando…'}
      </p>
    )
  const l = q.data
  const nomeEtapa = (c: string | null) =>
    ref?.listas.etapa_producao?.find((e) => e.codigo === c)?.nome ?? c ?? '—'
  const origens = l.genealogia.filter((g) => g.sentido === 'origem')
  const destinos = l.genealogia.filter((g) => g.sentido === 'destino')
  return (
    <Pagina
      titulo={`Lote ${l.codigo}`}
      trilha={['EnoTrace', 'Projetos de vinho']}
      acoes={
        <Botao variante="secundario" onClick={() => navegar(`/enotrace/historia?lote=${l.id}`)}>
          História do lote
        </Botao>
      }
    >
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Etiqueta tom={l.situacao === 'ativo' ? 'primario' : 'neutro'}>
          {l.situacao === 'ativo' ? nomeEtapa(l.etapa) : 'Sem saldo'}
        </Etiqueta>
        <Link className="underline" to={`/enotrace/projetos/${l.projetoId}`}>
          {l.projeto}
        </Link>
        <span>· {litros(l.volume)}</span>
        <span>· {ORIGENS[l.origem] ?? l.origem}</span>
        {l.titular && <span>· titular {l.titular} (vinificação para terceiro)</span>}
        {l.rendimentoReal && <span>· rendimento {formatarDecimal(l.rendimentoReal, 3)} L/kg</span>}
      </p>
      <Abas defaultValue="resumo">
        <ListaAbas>
          <Aba value="resumo">Resumo</Aba>
          <Aba value="genealogia">Genealogia</Aba>
          <Aba value="operacoes">Operações</Aba>
          {pode(s, 'enotrace.laboratorio', 'visualizar') && <Aba value="analises">Análises</Aba>}
        </ListaAbas>
        <ConteudoAba value="resumo" className="flex flex-col gap-4">
          <Cartao>
            <CabecalhoCartao
              titulo="Composição do lote"
              descricao="Média ponderada pelos litros de cada recipiente (composição por recipiente)."
            />
            <CorpoCartao className="flex flex-col gap-2 text-sm">
              <p>
                <ResumoComposicao c={l.composicao} />
              </p>
              {l.partes.map((p) => (
                <p key={p.recipienteId} className="text-muted-foreground">
                  <Link className="underline" to={`/enotrace/recipientes/${p.recipienteId}`}>
                    {p.recipiente}
                  </Link>
                  : {litros(p.litros)} · <ResumoComposicao c={p.composicao} />
                </p>
              ))}
            </CorpoCartao>
          </Cartao>
          <CartaoRotulo rotulo={l.rotulo} />
          {l.etapas.length > 0 && (
            <Cartao>
              <CabecalhoCartao titulo="Etapas" />
              <CorpoCartao className="flex flex-col gap-1 text-sm">
                {l.etapas.map((e, n) => (
                  <p key={n}>
                    {formatarDataHora(e.desde, fuso)} · {nomeEtapa(e.etapa)}
                    {e.por && <span className="text-muted-foreground"> · {e.por}</span>}
                  </p>
                ))}
              </CorpoCartao>
            </Cartao>
          )}
        </ConteudoAba>
        <ConteudoAba value="genealogia" className="flex flex-col gap-4">
          <Cartao>
            <CabecalhoCartao titulo="De onde veio" />
            <CorpoCartao className="flex flex-col gap-1 text-sm">
              {l.uva.map((u) => (
                <p key={`${u.romaneioId}-${u.variedade}`}>
                  <Link className="underline" to={`/enotrace/recepcao/${u.romaneioId}`}>
                    {u.romaneio}
                  </Link>{' '}
                  · {u.variedade}: {formatarDecimal(u.kg, 1)} kg
                  {u.fornecedor && ` · ${u.fornecedor}`}
                </p>
              ))}
              {origens.map((g, n) => (
                <p key={n}>
                  <Link className="underline" to={`/enotrace/lotes/${g.loteId}`}>
                    {g.codigo}
                  </Link>
                  : {litros(g.litros)} ({LIGACOES[g.tipo] ?? g.tipo},{' '}
                  <Link className="underline" to={`/enotrace/operacoes/${g.operacaoId}`}>
                    {g.operacao}
                  </Link>
                  )
                </p>
              ))}
              {!l.uva.length && !origens.length && <p className="text-muted-foreground">—</p>}
            </CorpoCartao>
          </Cartao>
          <Cartao>
            <CabecalhoCartao titulo="Para onde foi" />
            <CorpoCartao className="flex flex-col gap-1 text-sm">
              {destinos.map((g, n) => (
                <p key={n}>
                  <Link className="underline" to={`/enotrace/lotes/${g.loteId}`}>
                    {g.codigo}
                  </Link>
                  : {litros(g.litros)} ({LIGACOES[g.tipo] ?? g.tipo},{' '}
                  <Link className="underline" to={`/enotrace/operacoes/${g.operacaoId}`}>
                    {g.operacao}
                  </Link>
                  )
                </p>
              ))}
              {!destinos.length && (
                <p className="text-muted-foreground">Ainda não saiu vinho deste lote para outro.</p>
              )}
            </CorpoCartao>
          </Cartao>
        </ConteudoAba>
        <ConteudoAba value="operacoes">
          <OperacoesDe
            filtro={`lote=${id}`}
            aoClicar={(o) => navegar(`/enotrace/operacoes/${o}`)}
          />
        </ConteudoAba>
        <ConteudoAba value="analises">
          <AnalisesDoLote loteId={id} />
        </ConteudoAba>
      </Abas>
    </Pagina>
  )
}

interface LinhaOperacaoFiltrada {
  id: string
  codigo: string
  executadoEm: string
  tipo: string
  recipientes: string[]
  lotes: string[]
}

/** Operações filtradas (de um lote, recipiente ou projeto). */
export function OperacoesDe({
  filtro,
  aoClicar,
}: {
  filtro: string
  aoClicar: (id: string) => void
}) {
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  const colunas: Coluna<LinhaOperacaoFiltrada>[] = [
    {
      id: 'codigo',
      titulo: 'Código',
      ordenavel: true,
      celula: (o) => <strong>{o.codigo}</strong>,
    },
    {
      id: 'executadoEm',
      titulo: 'Execução',
      ordenavel: true,
      celula: (o) => formatarDataHora(o.executadoEm, fuso),
    },
    {
      id: 'tipo',
      titulo: 'Operação',
      ordenavel: true,
      celula: (o) => TIPOS_OPERACAO[o.tipo as keyof typeof TIPOS_OPERACAO] ?? o.tipo,
    },
    { id: 'recipientes', titulo: 'Recipientes', celula: (o) => o.recipientes.join(', ') },
    { id: 'lotes', titulo: 'Lotes', celula: (o) => o.lotes.join(', ') },
  ]
  return (
    <TabelaDados
      tabela={`operacoes-${filtro.split('=')[0]}`}
      url={`/api/operacoes?${filtro}`}
      ordemPadrao={{ campo: 'executadoEm', direcao: 'desc' }}
      aoClicar={(o) => aoClicar(o.id)}
      colunas={colunas}
    />
  )
}
