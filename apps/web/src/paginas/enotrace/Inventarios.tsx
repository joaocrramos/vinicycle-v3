// EnoTrace › Inventário da cantina (cantina.md, Inventário): a contagem lista os recipientes com o
// volume do livro na hora da contagem; o cantineiro digita o medido; a confirmação lança de uma vez
// os ajustes das diferenças, com motivo, numa operação "ajuste de inventário" (P27).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatarDecimal } from '@vinicycle/shared'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { CampoNumero } from '@/componentes/campos-especiais'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao'
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { Dialogo } from '@/componentes/ui/dialogo'
import { Pagina } from '@/layout/Estrutura'
import { api, ErroApi } from '@/lib/api'
import { fusoAtivo, pode, useSessao } from '@/lib/sessao'
import { formatarDataHora } from '@/lib/utils'
import { agora, doCampo, MostrarPrevia, type Previa, paraCampo } from './operacoes/comum'
import { litros } from './Projetos'
import { useLocaisRecipientes } from './Recipientes'

const F = 'enotrace.operacoes'

interface Resumo {
  id: string
  contadoEm: string
  situacao: 'rascunho' | 'confirmado'
  local: string | null
  operacaoId: string | null
  operacao: string | null
  operacaoSituacao: string | null
  recipientes: number
  contados: number
  observacao: string | null
}

interface Item {
  recipienteId: string
  codigo: string
  tipo: string
  local: string
  capacidade: string
  situacao: string
  lote: { id: string; codigo: string } | null
  volumeLivro: string
  volumeMedido: string | null
  diferenca: string | null
  motivo: string | null
}

interface Inventario extends Omit<Resumo, 'recipientes' | 'contados'> {
  versao: number
  percentual: number
  confirmadoEm: string | null
  confirmadoPor: string | null
  itens: Item[]
}

const mensagem = (e: unknown) =>
  e instanceof ErroApi && e.campos.length
    ? `${e.message} ${e.campos.map((c) => c.mensagem).join(' ')}`
    : (e as Error).message

const centilitros = (v: string | null) => (v === null ? null : Math.round(Number(v) * 100))

function Diferenca({ livro, medido }: { livro: string; medido: string | null }) {
  const m = centilitros(medido)
  if (m === null) return <span className="text-muted-foreground">—</span>
  const d = m - centilitros(livro)!
  if (d === 0) return <span className="text-muted-foreground">0</span>
  return (
    <span className={d < 0 ? 'text-destructive' : 'text-success'}>
      {d > 0 ? '+' : '−'}
      {formatarDecimal((Math.abs(d) / 100).toFixed(2), 2)} L
    </span>
  )
}

// Nova contagem ----------------------------------------------------------------------------------

function DialogoNovo({ aoFechar }: { aoFechar: () => void }) {
  const navegar = useNavigate()
  const locais = useLocaisRecipientes()
  const [d, setD] = useState({ contadoEm: agora(), localId: '' })
  const [erro, setErro] = useState<string | null>(null)
  return (
    <Dialogo
      aberto
      aoMudar={(v) => !v && aoFechar()}
      titulo="Nova contagem"
      descricao="A lista traz os recipientes com o volume do livro na hora da contagem."
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            onClick={async () => {
              setErro(null)
              try {
                const r = await api.post<{ id: string }>('/api/inventarios', {
                  contadoEm: doCampo(d.contadoEm),
                  localId: d.localId || null,
                })
                navegar(`/enotrace/inventarios/${r.id}`)
              } catch (e) {
                setErro(mensagem(e))
              }
            }}
          >
            Começar
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
        <Campo rotulo="Contagem" id="inv-data">
          <Entrada
            id="inv-data"
            type="datetime-local"
            value={d.contadoEm}
            onChange={(e) => setD({ ...d, contadoEm: e.target.value })}
          />
        </Campo>
        <Campo rotulo="Local" id="inv-local">
          <Selecao
            id="inv-local"
            value={d.localId}
            onChange={(e) => setD({ ...d, localId: e.target.value })}
          >
            <option value="">Todos os locais</option>
            {locais.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
      </div>
    </Dialogo>
  )
}

// Lista ------------------------------------------------------------------------------------------

export function ListaInventarios() {
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  const [novo, setNovo] = useState(false)
  const q = useQuery({
    queryKey: ['inventarios'],
    queryFn: () => api.get<Resumo[]>('/api/inventarios'),
  })
  return (
    <Pagina
      titulo="Inventário da cantina"
      trilha={['EnoTrace']}
      acoes={
        pode(s, F, 'criar') && (
          <Botao onClick={() => setNovo(true)}>
            <Plus /> Nova contagem
          </Botao>
        )
      }
    >
      <p className="text-sm text-muted-foreground">
        Conte os recipientes, digite o volume medido e confirme: as diferenças viram ajustes de
        inventário, de uma vez, numa operação que pode ser estornada.
      </p>
      <Cartao>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="px-5 py-2 font-medium">Contagem</th>
                <th className="py-2 pr-3 font-medium">Local</th>
                <th className="py-2 pr-3 text-right font-medium">Contados</th>
                <th className="py-2 pr-3 font-medium">Ajuste</th>
                <th className="py-2 pr-5 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {q.data?.map((i) => (
                <tr key={i.id}>
                  <td className="px-5 py-2">
                    <Link className="underline" to={`/enotrace/inventarios/${i.id}`}>
                      {formatarDataHora(i.contadoEm, fuso)}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">{i.local ?? 'Todos'}</td>
                  <td className="py-2 pr-3 text-right">
                    {i.contados} de {i.recipientes}
                  </td>
                  <td className="py-2 pr-3">
                    {i.operacaoId ? (
                      <Link className="underline" to={`/enotrace/operacoes/${i.operacaoId}`}>
                        {i.operacao}
                      </Link>
                    ) : i.situacao === 'confirmado' ? (
                      'Sem diferenças'
                    ) : (
                      '—'
                    )}
                    {i.operacaoSituacao === 'estornada' && (
                      <Etiqueta className="ml-2">Estornado</Etiqueta>
                    )}
                  </td>
                  <td className="py-2 pr-5">
                    {i.situacao === 'confirmado' ? (
                      <Etiqueta tom="sucesso">Confirmado</Etiqueta>
                    ) : (
                      <Etiqueta tom="alerta">Em contagem</Etiqueta>
                    )}
                  </td>
                </tr>
              ))}
              {q.data && !q.data.length && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-muted-foreground">
                    Nenhuma contagem.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Cartao>
      {novo && <DialogoNovo aoFechar={() => setNovo(false)} />}
    </Pagina>
  )
}

// Ficha ------------------------------------------------------------------------------------------

export function FichaInventario() {
  const { id = '' } = useParams()
  const q = useQuery({
    queryKey: ['inventario', id],
    queryFn: () => api.get<Inventario>(`/api/inventarios/${id}`),
  })
  if (!q.data)
    return (
      <p className="text-sm text-muted-foreground">
        {q.isError ? (q.error as Error).message : 'Carregando…'}
      </p>
    )
  // Confirmado, o formulário recomeça com o que ficou gravado.
  return <Contagem key={`${q.data.id}:${q.data.situacao}`} inv={q.data} />
}

function Contagem({ inv }: { inv: Inventario }) {
  const id = inv.id
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  const qc = useQueryClient()
  const navegar = useNavigate()
  const [form, setForm] = useState(() => ({
    contadoEm: paraCampo(inv.contadoEm),
    observacao: inv.observacao ?? '',
    itens: Object.fromEntries(
      inv.itens.map((i) => [
        i.recipienteId,
        { volumeMedido: i.volumeMedido, motivo: i.motivo ?? '' },
      ]),
    ) as Record<string, { volumeMedido: string | null; motivo: string }>,
  }))
  const [motivoTodos, setMotivoTodos] = useState('')
  const [previa, setPrevia] = useState<(Previa & { semDiferencas: boolean }) | null>(null)
  const [cientes, setCientes] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [salvo, setSalvo] = useState(true)

  const resumo = useMemo(() => {
    let contados = 0
    let comDiferenca = 0
    for (const i of inv.itens) {
      const m = form.itens[i.recipienteId]?.volumeMedido ?? null
      if (m === null) continue
      contados += 1
      if (centilitros(m) !== centilitros(i.volumeLivro)) comDiferenca += 1
    }
    return { contados, comDiferenca }
  }, [inv, form])

  const rascunho = inv.situacao === 'rascunho'
  const podeEditar = rascunho && pode(s, F, 'editar')
  const mudarItem = (rid: string, v: Partial<{ volumeMedido: string | null; motivo: string }>) => {
    setForm({ ...form, itens: { ...form.itens, [rid]: { ...form.itens[rid]!, ...v } } })
    setPrevia(null)
    setSalvo(false)
  }

  const salvar = async () => {
    const r = await api.put<{ versao: number }>(`/api/inventarios/${id}`, {
      versao: inv.versao,
      contadoEm: doCampo(form.contadoEm),
      observacao: form.observacao || null,
      itens: inv.itens.map((i) => ({
        recipienteId: i.recipienteId,
        volumeMedido: form.itens[i.recipienteId]?.volumeMedido ?? null,
        motivo: form.itens[i.recipienteId]?.motivo || null,
      })),
    })
    await qc.invalidateQueries({ queryKey: ['inventario', id] })
    setSalvo(true)
    return r
  }
  const acao = async (fn: () => Promise<void>) => {
    setErro(null)
    setOcupado(true)
    try {
      await fn()
    } catch (e) {
      setErro(mensagem(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Pagina
      titulo={`Inventário de ${formatarDataHora(inv.contadoEm, fuso)}`}
      trilha={['EnoTrace', 'Inventário da cantina']}
      acoes={
        rascunho ? (
          <Etiqueta tom="alerta">Em contagem</Etiqueta>
        ) : (
          <Etiqueta tom="sucesso">Confirmado</Etiqueta>
        )
      }
    >
      <p className="text-sm text-muted-foreground">
        {inv.local ? `Local ${inv.local}` : 'Todos os locais'}
        {inv.operacaoId && (
          <>
            {' · ajuste '}
            <Link className="underline" to={`/enotrace/operacoes/${inv.operacaoId}`}>
              {inv.operacao}
            </Link>
            {inv.operacaoSituacao === 'estornada' && ' (estornado)'}
          </>
        )}
        {inv.confirmadoEm &&
          ` · confirmado em ${formatarDataHora(inv.confirmadoEm, fuso)}${inv.confirmadoPor ? ` por ${inv.confirmadoPor}` : ''}`}
        {!inv.operacaoId && !rascunho && ' · sem diferenças'}
      </p>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {rascunho && (
        <Cartao>
          <CorpoCartao className="grid gap-3 sm:grid-cols-3">
            <Campo rotulo="Contagem" id="inv-data">
              <Entrada
                id="inv-data"
                type="datetime-local"
                disabled={!podeEditar}
                value={form.contadoEm}
                onChange={(e) => {
                  setForm({ ...form, contadoEm: e.target.value })
                  setPrevia(null)
                  setSalvo(false)
                }}
              />
            </Campo>
            <Campo
              rotulo="Motivo para as diferenças sem motivo"
              id="inv-motivo-todos"
              className="sm:col-span-2"
            >
              <div className="flex gap-2">
                <Entrada
                  id="inv-motivo-todos"
                  value={motivoTodos}
                  disabled={!podeEditar}
                  placeholder="Ex.: medição com régua"
                  onChange={(e) => setMotivoTodos(e.target.value)}
                />
                <Botao
                  variante="secundario"
                  disabled={!podeEditar || !motivoTodos.trim()}
                  onClick={() => {
                    const itens = { ...form.itens }
                    for (const i of inv.itens) {
                      const f = itens[i.recipienteId]!
                      if (
                        f.volumeMedido !== null &&
                        centilitros(f.volumeMedido) !== centilitros(i.volumeLivro) &&
                        !f.motivo
                      )
                        itens[i.recipienteId] = { ...f, motivo: motivoTodos.trim() }
                    }
                    setForm({ ...form, itens })
                    setSalvo(false)
                  }}
                >
                  Aplicar
                </Botao>
              </div>
            </Campo>
            <Campo rotulo="Observação" id="inv-obs" className="sm:col-span-3">
              <AreaTexto
                id="inv-obs"
                rows={2}
                disabled={!podeEditar}
                value={form.observacao}
                onChange={(e) => {
                  setForm({ ...form, observacao: e.target.value })
                  setSalvo(false)
                }}
              />
            </Campo>
          </CorpoCartao>
        </Cartao>
      )}
      <Cartao>
        <CabecalhoCartao
          titulo="Recipientes"
          descricao={
            rascunho
              ? `${resumo.contados} de ${inv.itens.length} contados; ${resumo.comDiferenca} com diferença. Deixe vazio o que não foi contado. Diferença acima de ${inv.percentual.toLocaleString('pt-BR')}% do livro pede “ciente”.`
              : 'Livro e lote na hora da contagem, gravados na confirmação.'
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="px-5 py-2 font-medium">Recipiente</th>
                <th className="py-2 pr-3 font-medium">Lote</th>
                <th className="py-2 pr-3 text-right font-medium">Livro</th>
                <th className="py-2 pr-3 font-medium">Medido</th>
                <th className="py-2 pr-3 text-right font-medium">Diferença</th>
                <th className="py-2 pr-5 font-medium">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {inv.itens.map((i) => {
                const f = form.itens[i.recipienteId]!
                return (
                  <tr key={i.recipienteId}>
                    <td className="px-5 py-2 font-medium">
                      {i.codigo}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {i.tipo} · {i.local} · cap. {litros(i.capacidade)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {i.lote ? (
                        <Link className="underline" to={`/enotrace/lotes/${i.lote.id}`}>
                          {i.lote.codigo}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">vazio</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      {litros(i.volumeLivro)}
                    </td>
                    <td className="w-36 py-2 pr-3">
                      {podeEditar ? (
                        <CampoNumero
                          aria-label={`Medido no ${i.codigo}`}
                          casas={2}
                          unidade="L"
                          valor={f.volumeMedido}
                          aoMudar={(v) => mudarItem(i.recipienteId, { volumeMedido: v })}
                        />
                      ) : f.volumeMedido === null ? (
                        <span className="text-muted-foreground">não contado</span>
                      ) : (
                        litros(f.volumeMedido)
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      <Diferenca livro={i.volumeLivro} medido={f.volumeMedido} />
                    </td>
                    <td className="py-2 pr-5">
                      {podeEditar ? (
                        <Entrada
                          aria-label={`Motivo no ${i.codigo}`}
                          value={f.motivo}
                          onChange={(e) => mudarItem(i.recipienteId, { motivo: e.target.value })}
                        />
                      ) : (
                        (f.motivo ?? '')
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Cartao>
      {previa && !previa.semDiferencas && (
        <MostrarPrevia previa={previa} cientes={cientes} setCientes={setCientes} />
      )}
      {previa?.semDiferencas && (
        <Aviso tom="sucesso">
          Nenhuma diferença: a confirmação registra o inventário, sem operação de ajuste.
        </Aviso>
      )}
      {rascunho && (
        <div className="flex flex-wrap justify-between gap-2">
          <Botao
            variante="secundario"
            disabled={ocupado || !podeEditar}
            onClick={() =>
              acao(async () => {
                if (!window.confirm('Descartar esta contagem?')) return
                await api.post(`/api/inventarios/${id}/descartar`)
                await qc.invalidateQueries({ queryKey: ['inventarios'] })
                navegar('/enotrace/inventarios')
              })
            }
          >
            Descartar
          </Botao>
          <div className="flex flex-wrap gap-2">
            <Botao
              variante="secundario"
              disabled={ocupado || !podeEditar || salvo}
              onClick={() => acao(async () => void (await salvar()))}
            >
              Salvar contagem
            </Botao>
            <Botao
              variante="secundario"
              disabled={ocupado || !podeEditar}
              onClick={() =>
                acao(async () => {
                  if (!salvo) await salvar()
                  setPrevia(await api.post(`/api/inventarios/${id}/previa`))
                  setCientes([])
                })
              }
            >
              Prévia dos ajustes
            </Botao>
            {pode(s, F, 'confirmar') && (
              <Botao
                disabled={ocupado || !previa || !salvo || previa.bloqueios.length > 0}
                onClick={() =>
                  acao(async () => {
                    await api.post(`/api/inventarios/${id}/confirmar`, { cientes })
                    await qc.invalidateQueries({ queryKey: ['inventario', id] })
                    await qc.invalidateQueries({ queryKey: ['inventarios'] })
                    await qc.invalidateQueries({ queryKey: ['recipientes-saldo'] })
                    setPrevia(null)
                  })
                }
              >
                Confirmar
              </Botao>
            )}
          </div>
        </div>
      )}
      {rascunho && !pode(s, 'enotrace.ajuste_inventario', 'confirmar') && (
        <p className="text-xs text-muted-foreground">
          Com diferenças, a confirmação exige a permissão de ajuste de inventário (por padrão, do
          enólogo e do RT). Salve a contagem para quem tem a permissão confirmar.
        </p>
      )}
    </Pagina>
  )
}
