// EnoTrace › Selos numerados (cantina.md, Engarrafamento, Selos de indicação geográfica; 04,
// roteiro do ciclo 9): faixas recebidas, números usados e perdidos por produção e os disponíveis.
// A entrada é por faixa (do nº X ao Y, série opcional); nenhum número se repete.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { BotaoIcone } from '@/componentes/AcoesLinha'
import { PedirMotivo } from '@/componentes/PedirMotivo'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao'
import { Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { Dialogo } from '@/componentes/ui/dialogo'
import { Pagina } from '@/layout/Estrutura'
import { api, ErroApi } from '@/lib/api'
import { fusoAtivo, pode, useSessao } from '@/lib/sessao'
import { formatarData, formatarDataHora } from '@/lib/utils'
import { useLocais } from './Estoque'

interface Faixa {
  inicio: number
  fim: number
}
interface ItemSelo {
  id: string
  nome: string
  series: Array<{
    serie: string
    recebidas: number
    usados: number
    perdidos: number
    disponiveis: Faixa[]
    totalDisponivel: number
  }>
  faixas: Array<
    Faixa & {
      id: string
      serie: string
      recebidaEm: string
      documento: string | null
      estornada: boolean
    }
  >
  usos: Array<
    Faixa & {
      serie: string
      tipo: 'usado' | 'perdido'
      ordemId: string
      lote: string | null
      data: string
    }
  >
}

const N = (n: number) => n.toLocaleString('pt-BR')
export const textoFaixa = (f: Faixa) =>
  f.inicio === f.fim ? N(f.inicio) : `${N(f.inicio)} a ${N(f.fim)}`
const msg = (e: unknown) => (e instanceof ErroApi ? e.message : (e as Error).message)

export function PaginaSelos() {
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['selos'], queryFn: () => api.get<ItemSelo[]>('/api/selos') })
  const locais = useLocais()
  const [estornando, setEstornando] = useState<string | null>(null)
  const [nova, setNova] = useState({
    itemId: '',
    serie: '',
    inicio: '',
    fim: '',
    localId: '',
    documento: '',
  })
  const [erro, setErro] = useState<string | null>(null)
  const itens = q.data ?? []
  const podeCriar = pode(s, 'enotrace.estoque', 'criar')
  const quantos =
    Number(nova.fim) >= Number(nova.inicio) && nova.inicio && nova.fim
      ? Number(nova.fim) - Number(nova.inicio) + 1
      : 0
  return (
    <Pagina titulo="Selos numerados" trilha={['EnoTrace', 'Envase e estoque']}>
      <p className="text-sm text-muted-foreground">
        Selos de indicação geográfica e outros itens numerados. A entrada é pela faixa recebida (do
        nº X ao Y), e cada produção do engarrafamento registra as faixas usadas e os números
        perdidos. Nenhum número se repete. Cadastre o selo em Cadastros › Insumos e embalagens ›
        Selos.
      </p>
      {q.data && !itens.length && (
        <Aviso tom="info">
          Nenhum item numerado.{' '}
          <Link className="underline" to="/enotrace/itens/selos">
            Cadastre o selo
          </Link>
          .
        </Aviso>
      )}
      {podeCriar && itens.length > 0 && (
        <Cartao>
          <CabecalhoCartao titulo="Receber uma faixa" />
          <CorpoCartao className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo rotulo="Selo" id="sf-item">
                <Selecao
                  id="sf-item"
                  value={nova.itemId}
                  onChange={(e) => setNova({ ...nova, itemId: e.target.value })}
                >
                  <option value="">Escolha</option>
                  {itens.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nome}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Campo rotulo="Série (opcional)" id="sf-serie">
                <Entrada
                  id="sf-serie"
                  value={nova.serie}
                  onChange={(e) => setNova({ ...nova, serie: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Local" id="sf-local">
                <Selecao
                  id="sf-local"
                  value={nova.localId}
                  onChange={(e) => setNova({ ...nova, localId: e.target.value })}
                >
                  <option value="">Escolha</option>
                  {locais.data?.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Campo rotulo="Do número" id="sf-inicio">
                <Entrada
                  id="sf-inicio"
                  inputMode="numeric"
                  value={nova.inicio}
                  onChange={(e) => setNova({ ...nova, inicio: e.target.value.replace(/\D/g, '') })}
                />
              </Campo>
              <Campo
                rotulo="Ao número"
                id="sf-fim"
                ajuda={quantos ? `${N(quantos)} selos` : undefined}
              >
                <Entrada
                  id="sf-fim"
                  inputMode="numeric"
                  value={nova.fim}
                  onChange={(e) => setNova({ ...nova, fim: e.target.value.replace(/\D/g, '') })}
                />
              </Campo>
              <Campo rotulo="Documento (nota)" id="sf-doc">
                <Entrada
                  id="sf-doc"
                  value={nova.documento}
                  onChange={(e) => setNova({ ...nova, documento: e.target.value })}
                />
              </Campo>
            </div>
            {erro && <Aviso tom="erro">{erro}</Aviso>}
            <div>
              <Botao
                disabled={!nova.itemId || !nova.localId || !quantos}
                onClick={async () => {
                  setErro(null)
                  try {
                    await api.post('/api/selos/faixas', {
                      itemId: nova.itemId,
                      serie: nova.serie,
                      inicio: Number(nova.inicio),
                      fim: Number(nova.fim),
                      localId: nova.localId,
                      recebidaEm: new Date().toISOString(),
                      documento: nova.documento || null,
                    })
                    setNova({ ...nova, inicio: '', fim: '', documento: '' })
                    await qc.invalidateQueries({ queryKey: ['selos'] })
                  } catch (e) {
                    setErro(msg(e))
                  }
                }}
              >
                Receber
              </Botao>
            </div>
          </CorpoCartao>
        </Cartao>
      )}
      {itens.map((i) => (
        <Cartao key={i.id}>
          <CabecalhoCartao titulo={i.nome} />
          <CorpoCartao className="flex flex-col gap-4 text-sm">
            {i.series.map((x) => (
              <div key={x.serie} className="flex flex-col gap-1">
                <p className="font-medium">
                  {x.serie ? `Série ${x.serie}` : 'Sem série'}: {N(x.totalDisponivel)} disponíveis
                </p>
                <p className="text-muted-foreground">
                  Recebidos {N(x.recebidas)} · usados {N(x.usados)} · perdidos {N(x.perdidos)}
                </p>
                <p>
                  Disponíveis:{' '}
                  {x.disponiveis.length ? x.disponiveis.map(textoFaixa).join('; ') : 'nenhum'}
                </p>
              </div>
            ))}
            {!i.series.length && <p className="text-muted-foreground">Nenhuma faixa recebida.</p>}
            {i.faixas.length > 0 && (
              <div>
                <p className="mb-1 font-medium">Faixas recebidas</p>
                <ul className="flex flex-col gap-1">
                  {i.faixas.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-2">
                      <span className={f.estornada ? 'text-muted-foreground line-through' : ''}>
                        {f.serie && `${f.serie} `}
                        {textoFaixa(f)} · {formatarDataHora(f.recebidaEm, fuso)}
                        {f.documento && ` · ${f.documento}`}
                      </span>
                      {f.estornada ? (
                        <Etiqueta>Estornada</Etiqueta>
                      ) : (
                        pode(s, 'enotrace.estoque', 'estornar') && (
                          <BotaoIcone
                            rotulo="Estornar a faixa"
                            aoClicar={() => setEstornando(f.id)}
                          >
                            <Undo2 />
                          </BotaoIcone>
                        )
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {i.usos.length > 0 && (
              <div>
                <p className="mb-1 font-medium">Usados e perdidos</p>
                <ul className="flex flex-col gap-1">
                  {i.usos.map((u, n) => (
                    <li key={n}>
                      {u.serie && `${u.serie} `}
                      {textoFaixa(u)} · {u.tipo === 'usado' ? 'usados' : 'perdidos'} ·{' '}
                      {formatarData(u.data)} ·{' '}
                      <Link className="underline" to={`/enotrace/engarrafamento/${u.ordemId}`}>
                        {u.lote ?? 'ordem'}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CorpoCartao>
        </Cartao>
      ))}
      <PedirMotivo
        aberto={!!estornando}
        aoMudar={(v) => !v && setEstornando(null)}
        titulo="Estornar a faixa"
        descricao="A entrada sai do estoque e os números deixam de valer. Só se estorna faixa sem número usado ou perdido."
        rotuloBotao="Estornar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/selos/faixas/${estornando}/estornar`, { motivo })
          setEstornando(null)
          await qc.invalidateQueries({ queryKey: ['selos'] })
        }}
      />
    </Pagina>
  )
}

/** Na produção do engarrafamento: as faixas usadas e os números perdidos de cada selo. */
export function DialogoSelosProducao({
  producaoId,
  aoFechar,
}: {
  producaoId: string | null
  aoFechar: () => void
}) {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['selos-producao', producaoId],
    queryFn: () =>
      api.get<{
        materiais: Array<{ item_id: string; nome: string; real: string }>
        usos: Array<Faixa & { itemId: string; serie: string; tipo: 'usado' | 'perdido' }>
      }>(`/api/engarrafamento/producoes/${producaoId}/selos`),
    enabled: !!producaoId,
  })
  const selos = useQuery({ queryKey: ['selos'], queryFn: () => api.get<ItemSelo[]>('/api/selos') })
  const [itemId, setItemId] = useState('')
  const [serie, setSerie] = useState('')
  const [usados, setUsados] = useState<Array<{ inicio: string; fim: string }>>([
    { inicio: '', fim: '' },
  ])
  const [perdidos, setPerdidos] = useState('')
  const [resultado, setResultado] = useState<{
    tom: 'erro' | 'sucesso' | 'alerta'
    texto: string
  } | null>(null)
  const opcoes = q.data?.materiais.length
    ? q.data.materiais.map((m) => ({ id: m.item_id, nome: m.nome, real: m.real }))
    : (selos.data ?? []).map((x) => ({ id: x.id, nome: x.nome, real: null as string | null }))
  const item = itemId || opcoes[0]?.id || ''
  const disponiveis = selos.data
    ?.find((x) => x.id === item)
    ?.series.find((x) => x.serie === serie)?.disponiveis
  const jaRegistrados = q.data?.usos.filter((u) => u.itemId === item) ?? []
  return (
    <Dialogo
      aberto={!!producaoId}
      aoMudar={(v) => {
        if (!v) {
          setResultado(null)
          aoFechar()
        }
      }}
      largo
      titulo="Selos da produção"
      descricao="As faixas coladas nas garrafas e os números perdidos (rasgados, colados errado). Salvar substitui o que já estava registrado para este selo e série."
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Fechar
          </Botao>
          <Botao
            disabled={!item}
            onClick={async () => {
              setResultado(null)
              try {
                const r = await api.put<{ total: number; aviso: string | null }>(
                  `/api/engarrafamento/producoes/${producaoId}/selos`,
                  {
                    itemId: item,
                    serie,
                    usados: usados
                      .filter((u) => u.inicio && u.fim)
                      .map((u) => ({ inicio: Number(u.inicio), fim: Number(u.fim) })),
                    perdidos: perdidos
                      .split(/[^\d]+/)
                      .filter(Boolean)
                      .map(Number),
                  },
                )
                setResultado(
                  r.aviso
                    ? { tom: 'alerta', texto: r.aviso }
                    : { tom: 'sucesso', texto: `${N(r.total)} selos registrados.` },
                )
                await qc.invalidateQueries({ queryKey: ['selos-producao', producaoId] })
                await qc.invalidateQueries({ queryKey: ['selos'] })
              } catch (e) {
                setResultado({ tom: 'erro', texto: msg(e) })
              }
            }}
          >
            Salvar
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Selo" id="sp-item">
            <Selecao id="sp-item" value={item} onChange={(e) => setItemId(e.target.value)}>
              {opcoes.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                  {o.real ? ` (${N(Number(o.real))} baixados)` : ''}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Série" id="sp-serie">
            <Entrada id="sp-serie" value={serie} onChange={(e) => setSerie(e.target.value)} />
          </Campo>
        </div>
        {disponiveis && (
          <p className="text-muted-foreground">
            Disponíveis: {disponiveis.length ? disponiveis.map(textoFaixa).join('; ') : 'nenhum'}
          </p>
        )}
        {jaRegistrados.length > 0 && (
          <p>
            Já registrados:{' '}
            {jaRegistrados
              .map((u) => `${u.serie ? `${u.serie} ` : ''}${textoFaixa(u)} (${u.tipo})`)
              .join('; ')}
          </p>
        )}
        <p className="font-medium">Faixas usadas</p>
        {usados.map((u, n) => (
          <div key={n} className="flex items-center gap-2">
            <Entrada
              aria-label="Do número"
              inputMode="numeric"
              className="w-36"
              value={u.inicio}
              onChange={(e) =>
                setUsados(
                  usados.map((x, j) =>
                    j === n ? { ...x, inicio: e.target.value.replace(/\D/g, '') } : x,
                  ),
                )
              }
            />
            <span>a</span>
            <Entrada
              aria-label="Ao número"
              inputMode="numeric"
              className="w-36"
              value={u.fim}
              onChange={(e) =>
                setUsados(
                  usados.map((x, j) =>
                    j === n ? { ...x, fim: e.target.value.replace(/\D/g, '') } : x,
                  ),
                )
              }
            />
            {usados.length > 1 && (
              <Botao
                variante="fantasma"
                tamanho="icone"
                aria-label="Tirar a faixa"
                onClick={() => setUsados(usados.filter((_, j) => j !== n))}
              >
                <Trash2 />
              </Botao>
            )}
          </div>
        ))}
        <div>
          <Botao
            variante="secundario"
            onClick={() => setUsados([...usados, { inicio: '', fim: '' }])}
          >
            <Plus /> Faixa
          </Botao>
        </div>
        <Campo rotulo="Números perdidos (separe por vírgula)" id="sp-perdidos">
          <Entrada
            id="sp-perdidos"
            value={perdidos}
            onChange={(e) => setPerdidos(e.target.value)}
          />
        </Campo>
        {resultado && <Aviso tom={resultado.tom}>{resultado.texto}</Aviso>}
      </div>
    </Dialogo>
  )
}
