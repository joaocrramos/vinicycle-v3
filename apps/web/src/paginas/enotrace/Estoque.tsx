// EnoTrace › Estoque (ambiente-cliente.md, Estoque; 03-modelo-de-dados.md, 2.4): saldos por item,
// ficha com saldo por local e por lote, movimentos e pendências; entrada manual (com o número da
// nota), transferência entre locais, ajuste e descarte, e estorno de cada lançamento.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  formatarDecimal,
  MOTIVOS_TITULARIDADE,
  NOMES_TIPO_ITEM,
  SITUACOES_VALIDADE,
} from '@vinicycle/shared'
import { Plus, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BotaoIcone } from '@/componentes/AcoesLinha'
import { CampoNumero } from '@/componentes/campos-especiais'
import { PedirMotivo } from '@/componentes/PedirMotivo'
import { TabelaDados } from '@/componentes/TabelaDados'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao'
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { Dialogo } from '@/componentes/ui/dialogo'
import { Pagina } from '@/layout/Estrutura'
import { api, ErroApi } from '@/lib/api'
import { fusoAtivo, pode, useSessao } from '@/lib/sessao'
import { formatarData, formatarDataHora } from '@/lib/utils'
import { agora, doCampo } from './operacoes/comum'

const F = 'enotrace.estoque'

type TipoItem = keyof typeof NOMES_TIPO_ITEM
type SituacaoValidade = keyof typeof SITUACOES_VALIDADE

const TOM_VALIDADE: Record<SituacaoValidade, 'neutro' | 'sucesso' | 'alerta' | 'erro'> = {
  sem_validade: 'neutro',
  valido: 'sucesso',
  vencendo: 'alerta',
  vencido: 'erro',
}

const qtd = (v: string | number, unidade: string) => `${formatarDecimal(String(v), 3)} ${unidade}`

const mensagem = (e: unknown) =>
  e instanceof ErroApi && e.campos.length
    ? `${e.message} ${e.campos.map((c) => c.mensagem).join(' ')}`
    : (e as Error).message

export function useLocais() {
  return useQuery({
    queryKey: ['estoque-locais'],
    queryFn: () =>
      api.get<Array<{ id: string; nome: string; externo: boolean }>>('/api/estoque/locais'),
  })
}

export interface ItemOpcao {
  id: string
  nome: string
  tipo: TipoItem
  unidadeBase: string
  controlaLote: boolean
  controlaValidade: boolean
}

export function useItens() {
  return useQuery({
    queryKey: ['itens-estoque-ativos'],
    queryFn: async () =>
      (await api.get<{ itens: ItemOpcao[] }>('/api/itens-estoque?tamanho=0')).itens,
  })
}

interface LoteOpcao {
  id: string
  codigo: string
  validade: string | null
  situacao: SituacaoValidade
  saldo: string
  titularId: string | null
  titular: string | null
}

export function useLotes(itemId: string, localId?: string) {
  return useQuery({
    queryKey: ['estoque-lotes', itemId, localId],
    queryFn: () =>
      api.get<LoteOpcao[]>(
        `/api/estoque/lotes?item=${itemId}${localId ? `&local=${localId}` : ''}`,
      ),
    enabled: !!itemId,
  })
}

/** Avisos de saldo negativo depois de um lançamento: a pendência fica aberta. */
function AvisosSaldo({ avisos }: { avisos: Array<{ codigo: string; mensagem: string }> }) {
  return avisos.map((a) => (
    <Aviso key={a.codigo} tom="alerta">
      {a.mensagem}
    </Aviso>
  ))
}

// Lista -----------------------------------------------------------------------------------------

interface LinhaEstoque {
  id: string
  tipo: TipoItem
  nome: string
  unidade: string
  estoqueMinimo: string | null
  saldo: string
  saldoTerceiros: string
  lotesVencendo: number
  pendencia: boolean
}

export function ListaEstoque() {
  const navegar = useNavigate()
  const { data: s } = useSessao()
  const pendencias = useQuery({
    queryKey: ['estoque-pendencias'],
    queryFn: () => api.get<unknown[]>('/api/estoque/pendencias'),
  })
  return (
    <Pagina
      titulo="Estoque"
      trilha={['EnoTrace']}
      acoes={
        pode(s, F, 'criar') && (
          <div className="flex gap-2">
            <Botao variante="secundario" onClick={() => navegar('/enotrace/estoque/notas')}>
              Notas de entrada
            </Botao>
            <Botao variante="secundario" onClick={() => navegar('/enotrace/estoque/transferencia')}>
              Transferência
            </Botao>
            <Botao variante="secundario" onClick={() => navegar('/enotrace/estoque/titularidade')}>
              Titularidade
            </Botao>
            <Botao onClick={() => navegar('/enotrace/estoque/entrada')}>
              <Plus /> Entrada
            </Botao>
          </div>
        )
      }
    >
      {!!pendencias.data?.length && (
        <Aviso tom="alerta">
          {pendencias.data.length === 1
            ? 'Há 1 item com saldo negativo.'
            : `Há ${pendencias.data.length} itens com saldo negativo.`}{' '}
          A pendência se resolve com a entrada da nota ou com um ajuste, antes do fechamento do mês.
        </Aviso>
      )}
      <TabelaDados
        tabela="estoque"
        url="/api/estoque"
        ordemPadrao={{ campo: 'nome', direcao: 'asc' }}
        filtrosIniciais={{ situacao: 'todos' }}
        filtros={(f, definir) => (
          <Selecao
            aria-label="Situação"
            className="w-52"
            value={f.situacao ?? 'todos'}
            onChange={(e) => definir('situacao', e.target.value)}
          >
            <option value="todos">Todos os itens ativos</option>
            <option value="com_saldo">Com saldo</option>
            <option value="abaixo_minimo">Abaixo do mínimo</option>
            <option value="vencendo">Com lote vencendo</option>
            <option value="pendencia">Com saldo negativo</option>
          </Selecao>
        )}
        aoClicar={(i) => navegar(`/enotrace/estoque/${i.id}`)}
        podeExportar={pode(s, F, 'exportar')}
        colunas={[
          {
            id: 'nome',
            titulo: 'Item',
            ordenavel: true,
            celula: (i) => (
              <span className="flex flex-wrap items-center gap-2">
                <strong>{i.nome}</strong>
                {i.pendencia && <Etiqueta tom="erro">Saldo negativo</Etiqueta>}
                {i.lotesVencendo > 0 && (
                  <Etiqueta tom="alerta">
                    {i.lotesVencendo === 1
                      ? '1 lote vencendo'
                      : `${i.lotesVencendo} lotes vencendo`}
                  </Etiqueta>
                )}
              </span>
            ),
            exportar: (i) => i.nome,
          },
          {
            id: 'tipo',
            titulo: 'Tipo',
            ordenavel: true,
            celula: (i) => NOMES_TIPO_ITEM[i.tipo],
            exportar: (i) => NOMES_TIPO_ITEM[i.tipo],
          },
          {
            id: 'saldo',
            titulo: 'Saldo',
            ordenavel: true,
            className: 'text-right',
            celula: (i) => (
              <span
                className={
                  Number(i.saldo) < 0
                    ? 'text-destructive'
                    : i.estoqueMinimo &&
                        Number(i.saldo) - Number(i.saldoTerceiros) < Number(i.estoqueMinimo)
                      ? 'text-amber-600'
                      : ''
                }
              >
                {qtd(i.saldo, i.unidade)}
                {Number(i.saldoTerceiros) !== 0 && (
                  <span className="block text-xs text-muted-foreground">
                    {qtd(i.saldoTerceiros, i.unidade)} de clientes
                  </span>
                )}
              </span>
            ),
            exportar: (i) => i.saldo,
          },
          {
            id: 'minimo',
            titulo: 'Mínimo',
            className: 'text-right',
            celula: (i) => (i.estoqueMinimo ? qtd(i.estoqueMinimo, i.unidade) : '—'),
            exportar: (i) => i.estoqueMinimo,
          },
        ]}
      />
    </Pagina>
  )
}

// Ficha -----------------------------------------------------------------------------------------

interface FichaItem {
  id: string
  nome: string
  tipo: TipoItem
  unidade: string
  estoqueMinimo: string | null
  controlaLote: boolean
  saldo: string
  porLocal: Array<{ localId: string; local: string; saldo: string }>
  lotes: Array<{
    id: string
    codigo: string
    fabricacao: string | null
    validade: string | null
    situacao: SituacaoValidade
    saldo: string
    titular: string | null
    locais: Array<{ localId: string; local: string; saldo: string }>
  }>
  movimentos: Array<{
    id: string
    grupoId: string
    executadoEm: string
    tipo: string
    nomeTipo: string
    quantidade: string
    local: string
    lote: string | null
    motivo: string | null
    documento: string | null
    operacaoId: string | null
    operacao: string | null
    estornado: boolean
  }>
  pendencias: Array<{
    id: string
    local: string
    executadoEm: string
    saldoApurado: string
    situacao: 'aberta' | 'resolvida'
    resolvidaEm: string | null
  }>
}

export function FichaEstoque() {
  const { id = '' } = useParams()
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  const qc = useQueryClient()
  const [ajuste, setAjuste] = useState(false)
  const [estorno, setEstorno] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<Array<{ codigo: string; mensagem: string }>>([])
  const [usos, setUsos] = useState<{ id: string; codigo: string } | null>(null)
  const q = useQuery({
    queryKey: ['estoque-item', id],
    queryFn: () => api.get<FichaItem>(`/api/estoque/itens/${id}`),
  })
  if (!q.data)
    return (
      <p className="text-sm text-muted-foreground">
        {q.isError ? (q.error as Error).message : 'Carregando…'}
      </p>
    )
  const i = q.data
  const atualizar = () =>
    Promise.all(
      [['estoque-item', id], ['lista'], ['estoque-pendencias'], ['estoque-lotes']].map((queryKey) =>
        qc.invalidateQueries({ queryKey }),
      ),
    )
  return (
    <Pagina
      titulo={i.nome}
      trilha={['EnoTrace', 'Estoque']}
      acoes={
        pode(s, F, 'editar') && (
          <Botao variante="secundario" onClick={() => setAjuste(true)}>
            Ajuste ou descarte
          </Botao>
        )
      }
    >
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>{NOMES_TIPO_ITEM[i.tipo]}</span>
        <span>· saldo {qtd(i.saldo, i.unidade)}</span>
        {i.estoqueMinimo && <span>· mínimo {qtd(i.estoqueMinimo, i.unidade)}</span>}
      </p>
      <AvisosSaldo avisos={avisos} />
      {i.pendencias
        .filter((p) => p.situacao === 'aberta')
        .map((p) => (
          <Aviso key={p.id} tom="erro">
            Saldo negativo em {p.local} desde {formatarDataHora(p.executadoEm, fuso)} (
            {qtd(p.saldoApurado, i.unidade)}). Lance a entrada da nota ou um ajuste antes do
            fechamento do mês.
          </Aviso>
        ))}
      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao>
          <CabecalhoCartao titulo="Saldo por local" />
          <CorpoCartao>
            <ul className="flex flex-col gap-1 text-sm">
              {i.porLocal.map((l) => (
                <li key={l.localId} className="flex justify-between">
                  <span>{l.local}</span>
                  <span className={Number(l.saldo) < 0 ? 'text-destructive' : ''}>
                    {qtd(l.saldo, i.unidade)}
                  </span>
                </li>
              ))}
              {!i.porLocal.length && <li className="text-muted-foreground">Sem saldo.</li>}
            </ul>
          </CorpoCartao>
        </Cartao>
        {i.lotes.length > 0 && (
          <Cartao>
            <CabecalhoCartao titulo="Lotes do fabricante" />
            <CorpoCartao>
              <ul className="flex flex-col gap-2 text-sm">
                {i.lotes.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <strong>{l.codigo}</strong>
                      {l.titular && <Etiqueta tom="primario">de {l.titular}</Etiqueta>}
                      {l.validade && <span>validade {formatarData(l.validade)}</span>}
                      <Etiqueta tom={TOM_VALIDADE[l.situacao]}>
                        {SITUACOES_VALIDADE[l.situacao]}
                      </Etiqueta>
                    </span>
                    <span className="flex items-center gap-2">
                      {qtd(l.saldo, i.unidade)}
                      <Botao variante="fantasma" tamanho="pequeno" onClick={() => setUsos(l)}>
                        Onde entrou
                      </Botao>
                    </span>
                  </li>
                ))}
              </ul>
            </CorpoCartao>
          </Cartao>
        )}
      </div>
      <Cartao>
        <CabecalhoCartao
          titulo="Movimentos"
          descricao="Do mais recente para o mais antigo. Um lançamento errado se estorna, com a data original."
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="px-5 py-2 font-medium">Execução</th>
                <th className="py-2 pr-3 font-medium">Movimento</th>
                <th className="py-2 pr-3 font-medium">Local</th>
                <th className="py-2 pr-3 font-medium">Lote</th>
                <th className="py-2 pr-3 text-right font-medium">Quantidade</th>
                <th className="py-2 pr-5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {i.movimentos.map((m) => (
                <tr key={m.id}>
                  <td className="px-5 py-2">{formatarDataHora(m.executadoEm, fuso)}</td>
                  <td className="py-2 pr-3">
                    {m.nomeTipo}
                    {m.operacaoId && (
                      <>
                        {' '}
                        <Link className="underline" to={`/enotrace/operacoes/${m.operacaoId}`}>
                          {m.operacao}
                        </Link>
                      </>
                    )}
                    {(m.documento || m.motivo) && (
                      <span className="block text-xs text-muted-foreground">
                        {[m.documento && `nota ${m.documento}`, m.motivo]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}
                    {m.estornado && (
                      <Etiqueta className="ml-1" tom="erro">
                        estornado
                      </Etiqueta>
                    )}
                  </td>
                  <td className="py-2 pr-3">{m.local}</td>
                  <td className="py-2 pr-3">{m.lote ?? '—'}</td>
                  <td
                    className={`py-2 pr-3 text-right ${Number(m.quantidade) < 0 ? 'text-destructive' : ''}`}
                  >
                    {qtd(m.quantidade, i.unidade)}
                  </td>
                  <td className="py-2 pr-5 text-right">
                    {!m.estornado &&
                      !m.operacaoId &&
                      m.tipo !== 'estorno' &&
                      pode(s, F, 'estornar') && (
                        <BotaoIcone
                          rotulo="Estornar o lançamento"
                          aoClicar={() => setEstorno(m.grupoId)}
                        >
                          <Undo2 />
                        </BotaoIcone>
                      )}
                  </td>
                </tr>
              ))}
              {!i.movimentos.length && (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-muted-foreground">
                    Nenhum movimento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Cartao>
      {usos && <DialogoUsos lote={usos} aoFechar={() => setUsos(null)} />}
      {ajuste && (
        <DialogoAjuste
          item={i}
          aoFechar={() => setAjuste(false)}
          aoLancar={async (r) => {
            setAvisos(r)
            setAjuste(false)
            await atualizar()
          }}
        />
      )}
      <PedirMotivo
        aberto={!!estorno}
        aoMudar={(v) => !v && setEstorno(null)}
        titulo="Estornar o lançamento"
        descricao="Todos os movimentos lançados juntos (a entrada inteira, a transferência…) recebem lançamentos inversos, com a data original."
        rotuloBotao="Estornar"
        aoConfirmar={async (motivo) => {
          const r = await api.post<{ avisos: Array<{ codigo: string; mensagem: string }> }>(
            `/api/estoque/grupos/${estorno}/estorno`,
            { motivo },
          )
          setAvisos(r.avisos)
          await atualizar()
        }}
      />
    </Pagina>
  )
}

/**
 * Consulta inversa: em quais lotes de vinho entrou este lote de insumo (cantina.md, Adição de
 * insumo). Serve ao recolhimento.
 */
function DialogoUsos({
  lote,
  aoFechar,
}: {
  lote: { id: string; codigo: string }
  aoFechar: () => void
}) {
  const { data: s } = useSessao()
  const q = useQuery({
    queryKey: ['estoque-usos', lote.id],
    queryFn: () =>
      api.get<
        Array<{
          operacaoId: string
          operacao: string
          executadoEm: string
          recipiente: string
          loteId: string
          lote: string
          dose: string
          unidade: string
        }>
      >(`/api/estoque/lotes/${lote.id}/usos`),
  })
  return (
    <Dialogo
      aberto
      largo
      aoMudar={(v) => !v && aoFechar()}
      titulo={`Onde entrou o lote ${lote.codigo}`}
      descricao="Os lotes de vinho que receberam este lote de insumo, nas operações confirmadas."
    >
      <ul className="flex flex-col gap-1 text-sm">
        {q.data?.map((u) => (
          <li key={`${u.operacaoId}${u.recipiente}`}>
            {formatarDataHora(u.executadoEm, fusoAtivo(s))} ·{' '}
            <Link
              className="underline"
              to={`/enotrace/operacoes/${u.operacaoId}`}
              onClick={aoFechar}
            >
              {u.operacao}
            </Link>{' '}
            · {u.recipiente} ·{' '}
            <Link className="underline" to={`/enotrace/lotes/${u.loteId}`} onClick={aoFechar}>
              lote {u.lote}
            </Link>{' '}
            · {formatarDecimal(u.dose, 2)} {u.unidade}
          </li>
        ))}
        {q.data && !q.data.length && (
          <li className="text-muted-foreground">Ainda não entrou em nenhum vinho.</li>
        )}
      </ul>
    </Dialogo>
  )
}

function DialogoAjuste({
  item,
  aoFechar,
  aoLancar,
}: {
  item: FichaItem
  aoFechar: () => void
  aoLancar: (avisos: Array<{ codigo: string; mensagem: string }>) => Promise<void>
}) {
  const locais = useLocais()
  const [d, setD] = useState({
    tipo: 'ajuste_inventario' as 'ajuste_inventario' | 'descarte',
    executadoEm: agora(),
    localId: item.porLocal[0]?.localId ?? '',
    loteItemId: '',
    quantidade: null as string | null,
    motivo: '',
  })
  const lotes = useLotes(item.controlaLote ? item.id : '', d.localId)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  return (
    <Dialogo
      aberto
      aoMudar={(v) => !v && aoFechar()}
      titulo={`Ajuste ou descarte · ${item.nome}`}
      descricao="O ajuste lança a diferença contada (para mais ou para menos); o descarte tira itens vencidos, avariados ou inutilizados."
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            disabled={enviando}
            onClick={async () => {
              setEnviando(true)
              setErro(null)
              try {
                const r = await api.post<{ avisos: Array<{ codigo: string; mensagem: string }> }>(
                  '/api/estoque/ajustes',
                  {
                    ...d,
                    itemId: item.id,
                    executadoEm: doCampo(d.executadoEm),
                    loteItemId: d.loteItemId || null,
                    quantidade: d.quantidade ?? '0',
                  },
                )
                await aoLancar(r.avisos)
              } catch (e) {
                setErro(mensagem(e))
              } finally {
                setEnviando(false)
              }
            }}
          >
            Lançar
          </Botao>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {erro && (
          <Aviso tom="erro" className="sm:col-span-2">
            {erro}
          </Aviso>
        )}
        <Campo rotulo="Lançamento" id="aj-tipo">
          <Selecao
            id="aj-tipo"
            value={d.tipo}
            onChange={(e) => setD({ ...d, tipo: e.target.value as typeof d.tipo })}
          >
            <option value="ajuste_inventario">Ajuste de inventário</option>
            <option value="descarte">Descarte</option>
          </Selecao>
        </Campo>
        <Campo rotulo="Execução" id="aj-data">
          <Entrada
            id="aj-data"
            type="datetime-local"
            value={d.executadoEm}
            onChange={(e) => setD({ ...d, executadoEm: e.target.value })}
          />
        </Campo>
        <Campo rotulo="Local" id="aj-local">
          <Selecao
            id="aj-local"
            value={d.localId}
            onChange={(e) => setD({ ...d, localId: e.target.value })}
          >
            <option value="">Escolha</option>
            {locais.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        {item.controlaLote && (
          <Campo rotulo="Lote" id="aj-lote">
            <Selecao
              id="aj-lote"
              value={d.loteItemId}
              onChange={(e) => setD({ ...d, loteItemId: e.target.value })}
            >
              <option value="">Escolha</option>
              {lotes.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codigo} · {qtd(l.saldo, item.unidade)}
                </option>
              ))}
            </Selecao>
          </Campo>
        )}
        <Campo
          rotulo={d.tipo === 'descarte' ? 'Quantidade descartada' : 'Diferença'}
          id="aj-qtd"
          ajuda={d.tipo === 'descarte' ? undefined : 'Negativa quando falta.'}
        >
          <CampoNumero
            id="aj-qtd"
            casas={3}
            unidade={item.unidade}
            permitirNegativo={d.tipo === 'ajuste_inventario'}
            valor={d.quantidade}
            aoMudar={(v) => setD({ ...d, quantidade: v })}
          />
        </Campo>
        <Campo rotulo="Motivo" id="aj-motivo" obrigatorio className="sm:col-span-2">
          <AreaTexto
            id="aj-motivo"
            value={d.motivo}
            onChange={(e) => setD({ ...d, motivo: e.target.value })}
          />
        </Campo>
      </div>
    </Dialogo>
  )
}

// Entrada ---------------------------------------------------------------------------------------

interface LinhaEntrada {
  itemId: string
  quantidade: string | null
  lote: string
  fabricacao: string
  validade: string
}

const linhaVazia = (): LinhaEntrada => ({
  itemId: '',
  quantidade: null,
  lote: '',
  fabricacao: '',
  validade: '',
})

export function EntradaEstoque() {
  const navegar = useNavigate()
  const qc = useQueryClient()
  const locais = useLocais()
  const itens = useItens()
  const [d, setD] = useState({
    executadoEm: agora(),
    localId: '',
    documento: '',
    observacao: '',
    titularId: '',
    itens: [linhaVazia()],
  })
  const clientes = useQuery({
    queryKey: ['pessoas-opcoes', 'cliente_vinificacao'],
    queryFn: () =>
      api.get<Array<{ id: string; nome: string }>>('/api/pessoas/opcoes?papel=cliente_vinificacao'),
  })
  const [erro, setErro] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<Array<{ codigo: string; mensagem: string }>>([])
  const [enviando, setEnviando] = useState(false)
  const localId = d.localId || (locais.data?.length === 1 ? locais.data[0]!.id : '')
  const setLinha = (n: number, p: Partial<LinhaEntrada>) =>
    setD({ ...d, itens: d.itens.map((x, j) => (j === n ? { ...x, ...p } : x)) })
  return (
    <Pagina titulo="Entrada no estoque" trilha={['EnoTrace', 'Estoque']}>
      <p className="text-sm text-muted-foreground">
        Entrada manual, com o número da nota. A importação do XML da NF-e chega no próximo ciclo.
        Itens que controlam lote pedem o lote do fabricante; o mesmo código reaproveita o lote.
      </p>
      {locais.data && !locais.data.length && (
        <Aviso tom="alerta">
          Cadastre um local de estoque do EnoTrace em Configurações › Locais.
        </Aviso>
      )}
      <Cartao>
        <CorpoCartao className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Execução" id="en-data" obrigatorio>
            <Entrada
              id="en-data"
              type="datetime-local"
              value={d.executadoEm}
              onChange={(e) => setD({ ...d, executadoEm: e.target.value })}
            />
          </Campo>
          <Campo rotulo="Local" id="en-local" obrigatorio>
            <Selecao
              id="en-local"
              value={localId}
              onChange={(e) => setD({ ...d, localId: e.target.value })}
            >
              <option value="">Escolha</option>
              {locais.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Número da nota" id="en-doc">
            <Entrada
              id="en-doc"
              value={d.documento}
              onChange={(e) => setD({ ...d, documento: e.target.value })}
            />
          </Campo>
          <Campo rotulo="Observação" id="en-obs">
            <Entrada
              id="en-obs"
              value={d.observacao}
              onChange={(e) => setD({ ...d, observacao: e.target.value })}
            />
          </Campo>
          <Campo
            rotulo="Dono"
            id="en-titular"
            ajuda="Insumo trazido pelo cliente de vinificação: fica fora do estoque próprio e entra com lote."
          >
            <Selecao
              id="en-titular"
              value={d.titularId}
              onChange={(e) => setD({ ...d, titularId: e.target.value })}
            >
              <option value="">A própria empresa</option>
              {clientes.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
        </CorpoCartao>
      </Cartao>
      <Cartao>
        <CabecalhoCartao titulo="Itens" />
        <CorpoCartao className="flex flex-col gap-4">
          {d.itens.map((l, n) => {
            const item = itens.data?.find((x) => x.id === l.itemId)
            return (
              <div key={n} className="flex flex-col gap-2 border-b pb-4 last:border-0 last:pb-0">
                <div className="grid items-end gap-2 sm:grid-cols-[1fr_12rem_auto]">
                  <Campo rotulo="Item" id={`en-item-${n}`}>
                    <Selecao
                      id={`en-item-${n}`}
                      value={l.itemId}
                      onChange={(e) => setLinha(n, { itemId: e.target.value })}
                    >
                      <option value="">Escolha</option>
                      {itens.data?.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.nome} ({NOMES_TIPO_ITEM[x.tipo].toLowerCase()})
                        </option>
                      ))}
                    </Selecao>
                  </Campo>
                  <Campo rotulo="Quantidade" id={`en-q-${n}`}>
                    <CampoNumero
                      id={`en-q-${n}`}
                      casas={3}
                      unidade={item?.unidadeBase}
                      valor={l.quantidade}
                      aoMudar={(v) => setLinha(n, { quantidade: v })}
                    />
                  </Campo>
                  <Botao
                    variante="fantasma"
                    tamanho="icone"
                    aria-label="Remover item"
                    disabled={d.itens.length === 1}
                    onClick={() => setD({ ...d, itens: d.itens.filter((_, j) => j !== n) })}
                  >
                    <Trash2 />
                  </Botao>
                </div>
                {(item?.controlaLote || !!d.titularId) && (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Campo rotulo="Lote do fabricante" id={`en-lote-${n}`} obrigatorio>
                      <Entrada
                        id={`en-lote-${n}`}
                        value={l.lote}
                        onChange={(e) => setLinha(n, { lote: e.target.value })}
                      />
                    </Campo>
                    <Campo rotulo="Fabricação" id={`en-fab-${n}`}>
                      <Entrada
                        id={`en-fab-${n}`}
                        type="date"
                        value={l.fabricacao}
                        onChange={(e) => setLinha(n, { fabricacao: e.target.value })}
                      />
                    </Campo>
                    <Campo
                      rotulo="Validade"
                      id={`en-val-${n}`}
                      obrigatorio={!!item?.controlaValidade}
                    >
                      <Entrada
                        id={`en-val-${n}`}
                        type="date"
                        value={l.validade}
                        onChange={(e) => setLinha(n, { validade: e.target.value })}
                      />
                    </Campo>
                  </div>
                )}
              </div>
            )
          })}
          <div>
            <Botao
              variante="secundario"
              tamanho="pequeno"
              onClick={() => setD({ ...d, itens: [...d.itens, linhaVazia()] })}
            >
              <Plus /> Item
            </Botao>
          </div>
        </CorpoCartao>
      </Cartao>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <AvisosSaldo avisos={avisos} />
      <div className="flex gap-2 border-t pt-4">
        <Botao
          disabled={enviando}
          onClick={async () => {
            setEnviando(true)
            setErro(null)
            try {
              const r = await api.post<{ avisos: Array<{ codigo: string; mensagem: string }> }>(
                '/api/estoque/entradas',
                {
                  executadoEm: doCampo(d.executadoEm),
                  localId,
                  documento: d.documento || null,
                  observacao: d.observacao || null,
                  titularId: d.titularId || null,
                  itens: d.itens.map((l) => ({
                    itemId: l.itemId,
                    quantidade: l.quantidade ?? '0',
                    lote: l.lote
                      ? { codigo: l.lote, fabricacao: l.fabricacao, validade: l.validade }
                      : null,
                  })),
                },
              )
              await qc.invalidateQueries({ queryKey: ['lista'] })
              await qc.invalidateQueries({ queryKey: ['estoque-pendencias'] })
              if (r.avisos.length) setAvisos(r.avisos)
              else navegar('/enotrace/estoque')
            } catch (e) {
              setErro(mensagem(e))
            } finally {
              setEnviando(false)
            }
          }}
        >
          Lançar entrada
        </Botao>
        <Botao variante="secundario" onClick={() => navegar('/enotrace/estoque')}>
          Voltar
        </Botao>
      </div>
    </Pagina>
  )
}

// Transferência ---------------------------------------------------------------------------------

interface LinhaTransferencia {
  itemId: string
  loteItemId: string
  quantidade: string | null
}

function LinhaDeTransferencia({
  l,
  n,
  origem,
  itens,
  set,
  remover,
}: {
  l: LinhaTransferencia
  n: number
  origem: string
  itens: ItemOpcao[]
  set: (p: Partial<LinhaTransferencia>) => void
  remover?: () => void
}) {
  const item = itens.find((x) => x.id === l.itemId)
  const lotes = useLotes(item?.controlaLote ? l.itemId : '', origem)
  return (
    <div className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_12rem_auto]">
      <Campo rotulo="Item" id={`tr-item-${n}`}>
        <Selecao
          id={`tr-item-${n}`}
          value={l.itemId}
          onChange={(e) => set({ itemId: e.target.value, loteItemId: '' })}
        >
          <option value="">Escolha</option>
          {itens.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nome}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Campo rotulo="Lote" id={`tr-lote-${n}`}>
        {item?.controlaLote ? (
          <Selecao
            id={`tr-lote-${n}`}
            value={l.loteItemId}
            onChange={(e) => set({ loteItemId: e.target.value })}
          >
            <option value="">Escolha</option>
            {lotes.data
              ?.filter((x) => Number(x.saldo) > 0)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.codigo} · {qtd(x.saldo, item.unidadeBase)}
                </option>
              ))}
          </Selecao>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">não controla lote</p>
        )}
      </Campo>
      <Campo rotulo="Quantidade" id={`tr-q-${n}`}>
        <CampoNumero
          id={`tr-q-${n}`}
          casas={3}
          unidade={item?.unidadeBase}
          valor={l.quantidade}
          aoMudar={(v) => set({ quantidade: v })}
        />
      </Campo>
      <Botao
        variante="fantasma"
        tamanho="icone"
        aria-label="Remover item"
        disabled={!remover}
        onClick={remover}
      >
        <Trash2 />
      </Botao>
    </div>
  )
}

export function TransferenciaEstoque() {
  const navegar = useNavigate()
  const qc = useQueryClient()
  const locais = useLocais()
  const itens = useItens()
  const [d, setD] = useState({
    executadoEm: agora(),
    origemLocalId: '',
    destinoLocalId: '',
    itens: [{ itemId: '', loteItemId: '', quantidade: null }] as LinhaTransferencia[],
  })
  const [erro, setErro] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<Array<{ codigo: string; mensagem: string }>>([])
  return (
    <Pagina titulo="Transferência entre locais" trilha={['EnoTrace', 'Estoque']}>
      <Cartao>
        <CorpoCartao className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Execução" id="tf-data">
            <Entrada
              id="tf-data"
              type="datetime-local"
              value={d.executadoEm}
              onChange={(e) => setD({ ...d, executadoEm: e.target.value })}
            />
          </Campo>
          {(['origemLocalId', 'destinoLocalId'] as const).map((campo) => (
            <Campo
              key={campo}
              rotulo={campo === 'origemLocalId' ? 'De' : 'Para'}
              id={`tf-${campo}`}
              obrigatorio
            >
              <Selecao
                id={`tf-${campo}`}
                value={d[campo]}
                onChange={(e) => setD({ ...d, [campo]: e.target.value })}
              >
                <option value="">Escolha</option>
                {locais.data?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
          ))}
        </CorpoCartao>
      </Cartao>
      <Cartao>
        <CabecalhoCartao titulo="Itens" />
        <CorpoCartao className="flex flex-col gap-3">
          {d.itens.map((l, n) => (
            <LinhaDeTransferencia
              key={n}
              l={l}
              n={n}
              origem={d.origemLocalId}
              itens={itens.data ?? []}
              set={(p) =>
                setD({ ...d, itens: d.itens.map((x, j) => (j === n ? { ...x, ...p } : x)) })
              }
              remover={
                d.itens.length > 1
                  ? () => setD({ ...d, itens: d.itens.filter((_, j) => j !== n) })
                  : undefined
              }
            />
          ))}
          <div>
            <Botao
              variante="secundario"
              tamanho="pequeno"
              onClick={() =>
                setD({
                  ...d,
                  itens: [...d.itens, { itemId: '', loteItemId: '', quantidade: null }],
                })
              }
            >
              <Plus /> Item
            </Botao>
          </div>
        </CorpoCartao>
      </Cartao>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <AvisosSaldo avisos={avisos} />
      <div className="flex gap-2 border-t pt-4">
        <Botao
          onClick={async () => {
            setErro(null)
            try {
              const r = await api.post<{ avisos: Array<{ codigo: string; mensagem: string }> }>(
                '/api/estoque/transferencias',
                {
                  ...d,
                  executadoEm: doCampo(d.executadoEm),
                  itens: d.itens.map((l) => ({
                    ...l,
                    loteItemId: l.loteItemId || null,
                    quantidade: l.quantidade ?? '0',
                  })),
                },
              )
              await qc.invalidateQueries({ queryKey: ['lista'] })
              if (r.avisos.length) setAvisos(r.avisos)
              else navegar('/enotrace/estoque')
            } catch (e) {
              setErro(mensagem(e))
            }
          }}
        >
          Transferir
        </Botao>
        <Botao variante="secundario" onClick={() => navegar('/enotrace/estoque')}>
          Voltar
        </Botao>
      </div>
    </Pagina>
  )
}

// Transferência de titularidade -----------------------------------------------------------------

interface LinhaTitularidade {
  itemId: string
  loteItemId: string
  quantidade: string | null
}

/**
 * Transferência de titularidade no estoque (cantina.md, Pagamento em produto; 04, roteiro do ciclo
 * 10, bloco 2): o lote passa a outro titular com o mesmo código, o impresso na garrafa.
 */
export function TitularidadeEstoque() {
  const navegar = useNavigate()
  const qc = useQueryClient()
  const locais = useLocais()
  const itens = useItens()
  const clientes = useQuery({
    queryKey: ['pessoas-opcoes', 'cliente_vinificacao'],
    queryFn: () =>
      api.get<Array<{ id: string; nome: string }>>('/api/pessoas/opcoes?papel=cliente_vinificacao'),
  })
  const contratos = useQuery({
    queryKey: ['contratos-opcoes'],
    queryFn: async () =>
      (
        await api.get<{
          itens: Array<{
            id: string
            numero: string | null
            contraparteId: string
            contraparte: string
          }>
        }>('/api/contratos-terceirizacao?tamanho=0')
      ).itens,
  })
  const [d, setD] = useState({
    executadoEm: agora(),
    localId: '',
    paraTitularId: '',
    motivo: 'pagamento_servico' as keyof typeof MOTIVOS_TITULARIDADE,
    contratoId: '',
    observacao: '',
    itens: [{ itemId: '', loteItemId: '', quantidade: null }] as LinhaTitularidade[],
  })
  const [erro, setErro] = useState<string | null>(null)
  const comLote = (itens.data ?? []).filter((x) => x.controlaLote)
  return (
    <Pagina titulo="Transferência de titularidade" trilha={['EnoTrace', 'Estoque']}>
      <p className="text-sm text-muted-foreground">
        Garrafas (ou outro item com lote) que passam a ser de outro titular: compra ou venda,
        pagamento do serviço em produto. O lote mantém o código impresso na garrafa.
      </p>
      <Cartao>
        <CorpoCartao className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Execução" id="tt-data">
            <Entrada
              id="tt-data"
              type="datetime-local"
              value={d.executadoEm}
              onChange={(e) => setD({ ...d, executadoEm: e.target.value })}
            />
          </Campo>
          <Campo rotulo="Local" id="tt-local" obrigatorio>
            <Selecao
              id="tt-local"
              value={d.localId}
              onChange={(e) => setD({ ...d, localId: e.target.value })}
            >
              <option value="">Escolha</option>
              {locais.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Motivo" id="tt-motivo" obrigatorio>
            <Selecao
              id="tt-motivo"
              value={d.motivo}
              onChange={(e) => setD({ ...d, motivo: e.target.value as typeof d.motivo })}
            >
              {Object.entries(MOTIVOS_TITULARIDADE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Novo titular" id="tt-para">
            <Selecao
              id="tt-para"
              value={d.paraTitularId}
              onChange={(e) => setD({ ...d, paraTitularId: e.target.value })}
            >
              <option value="">A própria empresa</option>
              {clientes.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Contrato" id="tt-contrato">
            <Selecao
              id="tt-contrato"
              value={d.contratoId}
              onChange={(e) => setD({ ...d, contratoId: e.target.value })}
            >
              <option value="">Sem contrato</option>
              {contratos.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.contraparte}
                  {c.numero ? ` · ${c.numero}` : ''}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Observação" id="tt-obs">
            <Entrada
              id="tt-obs"
              value={d.observacao}
              onChange={(e) => setD({ ...d, observacao: e.target.value })}
            />
          </Campo>
        </CorpoCartao>
      </Cartao>
      <Cartao>
        <CabecalhoCartao titulo="Itens" />
        <CorpoCartao className="flex flex-col gap-3">
          {d.itens.map((l, n) => (
            <LinhaDeTitularidade
              key={n}
              l={l}
              n={n}
              local={d.localId}
              para={d.paraTitularId || null}
              itens={comLote}
              set={(p) =>
                setD({ ...d, itens: d.itens.map((x, j) => (j === n ? { ...x, ...p } : x)) })
              }
              remover={
                d.itens.length > 1
                  ? () => setD({ ...d, itens: d.itens.filter((_, j) => j !== n) })
                  : undefined
              }
            />
          ))}
          <div>
            <Botao
              variante="secundario"
              tamanho="pequeno"
              onClick={() =>
                setD({
                  ...d,
                  itens: [...d.itens, { itemId: '', loteItemId: '', quantidade: null }],
                })
              }
            >
              <Plus /> Item
            </Botao>
          </div>
        </CorpoCartao>
      </Cartao>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <div className="flex gap-2 border-t pt-4">
        <Botao
          onClick={async () => {
            setErro(null)
            try {
              await api.post('/api/estoque/titularidade', {
                ...d,
                executadoEm: doCampo(d.executadoEm),
                paraTitularId: d.paraTitularId || null,
                contratoId: d.contratoId || null,
                itens: d.itens.map((l) => ({ ...l, quantidade: l.quantidade ?? '0' })),
              })
              await qc.invalidateQueries({ queryKey: ['lista'] })
              await qc.invalidateQueries({ queryKey: ['estoque-lotes'] })
              navegar('/enotrace/estoque')
            } catch (e) {
              setErro(mensagem(e))
            }
          }}
        >
          Transferir
        </Botao>
        <Botao variante="secundario" onClick={() => navegar('/enotrace/estoque')}>
          Voltar
        </Botao>
      </div>
    </Pagina>
  )
}

function LinhaDeTitularidade({
  l,
  n,
  local,
  para,
  itens,
  set,
  remover,
}: {
  l: LinhaTitularidade
  n: number
  local: string
  para: string | null
  itens: ItemOpcao[]
  set: (p: Partial<LinhaTitularidade>) => void
  remover?: () => void
}) {
  const item = itens.find((x) => x.id === l.itemId)
  const lotes = useLotes(l.itemId, local || undefined)
  return (
    <div className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_12rem_auto]">
      <Campo rotulo="Item" id={`tt-item-${n}`}>
        <Selecao
          id={`tt-item-${n}`}
          value={l.itemId}
          onChange={(e) => set({ itemId: e.target.value, loteItemId: '' })}
        >
          <option value="">Escolha</option>
          {itens.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nome}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Campo rotulo="Lote (titular atual)" id={`tt-lote-${n}`}>
        <Selecao
          id={`tt-lote-${n}`}
          value={l.loteItemId}
          onChange={(e) => set({ loteItemId: e.target.value })}
        >
          <option value="">Escolha</option>
          {lotes.data
            ?.filter((x) => Number(x.saldo) > 0 && (x.titularId ?? null) !== para)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.codigo} · {x.titular ?? 'própria empresa'} ·{' '}
                {qtd(x.saldo, item?.unidadeBase ?? '')}
              </option>
            ))}
        </Selecao>
      </Campo>
      <Campo rotulo="Quantidade" id={`tt-q-${n}`}>
        <CampoNumero
          id={`tt-q-${n}`}
          casas={item?.tipo === 'produto_acabado' ? 0 : 3}
          unidade={item?.unidadeBase}
          valor={l.quantidade}
          aoMudar={(v) => set({ quantidade: v })}
        />
      </Campo>
      <Botao
        variante="fantasma"
        tamanho="icone"
        aria-label="Remover item"
        disabled={!remover}
        onClick={remover}
      >
        <Trash2 />
      </Botao>
    </div>
  )
}
