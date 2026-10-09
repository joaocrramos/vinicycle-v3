// Simulador de corte (cantina.md, Trasfega e corte; 04, roteiro do ciclo 9): na ficha do projeto, o
// enólogo testa proporções em % sobre um volume ou direto em litros e vê a composição e o que o
// rótulo pode declarar, sem mexer no volume. Salva, aprova e abre o corte já preenchido.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatarDecimal } from '@vinicycle/shared'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao'
import { Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { api, ErroApi } from '@/lib/api'
import { fusoAtivo, pode, useSessao } from '@/lib/sessao'
import { formatarDataHora } from '@/lib/utils'
import { useRecipientes } from './operacoes/comum'

type Modo = 'percentual' | 'litros'
interface Linha {
  recipienteId: string
  valor: string
}
interface Resultado {
  itens: Array<{
    recipienteId: string
    recipiente: string
    lote: string
    projeto: string
    saldo: string
    litros: string
    percentual: number
  }>
  totalLitros: string
  chaptalizado: boolean
  organica: number
  safras: Array<{ safra: number | null; percentual: number }>
  rotulo: {
    varietal: Array<{
      abrangencia: string
      minimo: number
      variedades: Array<{ nome: string; percentual: number; pode: boolean }>
    }>
    safra: { minimo: number; safras: Array<{ safra: number | null; pode: boolean }> } | null
  }
  avisos: string[]
  projetos: number
}
interface Salva {
  id: string
  nome: string
  modo: Modo
  volumeLitros: string | null
  itens: Linha[]
  resultado: Resultado
  situacao: 'rascunho' | 'aprovada'
  criadoEm: string
  autor: string | null
}

const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`

export function SimuladorCorte({ projetoId }: { projetoId: string }) {
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  const qc = useQueryClient()
  const navegar = useNavigate()
  const recipientes = useRecipientes()
  const [modo, setModo] = useState<Modo>('percentual')
  const [volume, setVolume] = useState('')
  const [linhas, setLinhas] = useState<Linha[]>([
    { recipienteId: '', valor: '' },
    { recipienteId: '', valor: '' },
  ])
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const podeCriar = pode(s, 'enotrace.operacoes', 'criar')
  const validas = linhas.filter((l) => l.recipienteId && Number(l.valor.replace(',', '.')) > 0)
  const corpo = {
    modo,
    volume: modo === 'percentual' ? volume.replace(',', '.') : null,
    itens: validas.map((l) => ({ ...l, valor: l.valor.replace(',', '.') })),
  }
  const pronto = validas.length > 0 && (modo === 'litros' || Number(corpo.volume) > 0)
  const previa = useQuery({
    queryKey: ['simulacao-previa', corpo],
    queryFn: () => api.post<Resultado>('/api/simulacoes-corte/previa', corpo),
    enabled: pronto,
    retry: false,
  })
  const salvas = useQuery({
    queryKey: ['simulacoes', projetoId],
    queryFn: () => api.get<Salva[]>(`/api/projetos/${projetoId}/simulacoes`),
  })
  const comVinho = recipientes.data?.filter((r) => Number(r.volume) > 0) ?? []
  const setLinha = (n: number, p: Partial<Linha>) =>
    setLinhas(linhas.map((l, i) => (i === n ? { ...l, ...p } : l)))
  const executar = async (f: () => Promise<unknown>) => {
    setErro(null)
    try {
      await f()
      await qc.invalidateQueries({ queryKey: ['simulacoes', projetoId] })
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : (e as Error).message)
    }
  }
  const r = previa.data
  return (
    <div className="flex flex-col gap-4">
      <Cartao>
        <CabecalhoCartao
          titulo="Simulador de corte"
          descricao="Teste proporções sem mexer no volume: a composição e o que o rótulo pode declarar aparecem na hora. Escolha os recipientes com vinho de qualquer projeto do estabelecimento."
        />
        <CorpoCartao className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <Campo rotulo="Como informar" id="sim-modo">
              <Selecao
                id="sim-modo"
                className="w-56"
                value={modo}
                onChange={(e) => setModo(e.target.value as Modo)}
              >
                <option value="percentual">Em % sobre um volume</option>
                <option value="litros">Direto em litros</option>
              </Selecao>
            </Campo>
            {modo === 'percentual' && (
              <Campo rotulo="Volume desejado (L)" id="sim-volume">
                <Entrada
                  id="sim-volume"
                  inputMode="decimal"
                  className="w-40"
                  value={volume}
                  onChange={(e) => setVolume(e.target.value)}
                />
              </Campo>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {linhas.map((l, n) => (
              <div key={n} className="flex flex-wrap items-center gap-2">
                <Selecao
                  aria-label="Recipiente"
                  className="w-72"
                  value={l.recipienteId}
                  onChange={(e) => setLinha(n, { recipienteId: e.target.value })}
                >
                  <option value="">Escolha o recipiente</option>
                  {comVinho.map((x) => (
                    <option
                      key={x.id}
                      value={x.id}
                      disabled={linhas.some((o, j) => j !== n && o.recipienteId === x.id)}
                    >
                      {x.codigo} · {x.lote?.codigo ?? ''} · {formatarDecimal(x.volume, 2)} L
                    </option>
                  ))}
                </Selecao>
                <Entrada
                  aria-label={modo === 'percentual' ? 'Percentual' : 'Litros'}
                  inputMode="decimal"
                  className="w-28"
                  value={l.valor}
                  onChange={(e) => setLinha(n, { valor: e.target.value })}
                />
                <span className="text-sm text-muted-foreground">
                  {modo === 'percentual' ? '%' : 'L'}
                </span>
                {linhas.length > 1 && (
                  <Botao
                    variante="fantasma"
                    tamanho="icone"
                    aria-label="Tirar a linha"
                    onClick={() => setLinhas(linhas.filter((_, i) => i !== n))}
                  >
                    <Trash2 />
                  </Botao>
                )}
              </div>
            ))}
            <div>
              <Botao
                variante="secundario"
                onClick={() => setLinhas([...linhas, { recipienteId: '', valor: '' }])}
              >
                <Plus /> Recipiente
              </Botao>
            </div>
          </div>
          {previa.error && <Aviso tom="erro">{(previa.error as Error).message}</Aviso>}
          {r && (
            <div className="flex flex-col gap-3 text-sm">
              {r.avisos.map((a) => (
                <Aviso key={a}>{a}</Aviso>
              ))}
              <table className="w-full max-w-3xl">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="pb-1 font-medium">Recipiente</th>
                    <th className="pb-1 font-medium">Lote · projeto</th>
                    <th className="pb-1 text-right font-medium">Saldo</th>
                    <th className="pb-1 text-right font-medium">Litros</th>
                    <th className="pb-1 text-right font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {r.itens.map((i) => (
                    <tr key={i.recipienteId} className="border-t">
                      <td className="py-1">{i.recipiente}</td>
                      <td className="py-1">
                        {i.lote} · {i.projeto}
                      </td>
                      <td className="py-1 text-right">{formatarDecimal(i.saldo, 2)} L</td>
                      <td className="py-1 text-right">{formatarDecimal(i.litros, 2)} L</td>
                      <td className="py-1 text-right">{pct(i.percentual)}</td>
                    </tr>
                  ))}
                  <tr className="border-t font-medium">
                    <td className="py-1" colSpan={3}>
                      Total
                    </td>
                    <td className="py-1 text-right">{formatarDecimal(r.totalLitros, 2)} L</td>
                    <td />
                  </tr>
                </tbody>
              </table>
              <Resumo r={r} />
            </div>
          )}
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          {podeCriar && r && (
            <div className="flex flex-wrap items-end gap-2 border-t pt-3">
              <Campo rotulo="Nome da simulação" id="sim-nome">
                <Entrada
                  id="sim-nome"
                  className="w-64"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
              </Campo>
              <Botao
                disabled={nome.trim().length < 2}
                onClick={() =>
                  executar(async () => {
                    await api.post(`/api/projetos/${projetoId}/simulacoes`, { ...corpo, nome })
                    setNome('')
                  })
                }
              >
                Salvar a simulação
              </Botao>
            </div>
          )}
        </CorpoCartao>
      </Cartao>
      <Cartao>
        <CabecalhoCartao titulo="Simulações salvas" />
        <CorpoCartao className="flex flex-col divide-y p-0 text-sm">
          {salvas.data?.map((x) => (
            <div key={x.id} className="flex flex-col gap-2 px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{x.nome}</span>
                <Etiqueta tom={x.situacao === 'aprovada' ? 'sucesso' : 'neutro'}>
                  {x.situacao === 'aprovada' ? 'Aprovada' : 'Rascunho'}
                </Etiqueta>
                <span className="text-muted-foreground">
                  {x.autor} · {formatarDataHora(x.criadoEm, fuso)} ·{' '}
                  {x.modo === 'percentual'
                    ? `${formatarDecimal(x.volumeLitros ?? '0', 2)} L em %`
                    : 'em litros'}
                </span>
                <span className="ml-auto flex flex-wrap gap-1">
                  <Botao
                    variante="secundario"
                    onClick={() => {
                      setModo(x.modo)
                      setVolume(x.volumeLitros ?? '')
                      setLinhas(x.itens.map((i) => ({ ...i })))
                    }}
                  >
                    Abrir no simulador
                  </Botao>
                  {podeCriar && x.situacao === 'rascunho' && (
                    <Botao
                      variante="secundario"
                      onClick={() =>
                        executar(() => api.post(`/api/simulacoes-corte/${x.id}/aprovar`))
                      }
                    >
                      Aprovar
                    </Botao>
                  )}
                  {x.situacao === 'aprovada' && pode(s, 'enotrace.operacoes', 'criar') && (
                    <Botao onClick={() => navegar(`/enotrace/operacoes/corte?simulacao=${x.id}`)}>
                      Fazer o corte
                    </Botao>
                  )}
                  {podeCriar && (
                    <Botao
                      variante="secundario"
                      onClick={() =>
                        executar(() => api.post(`/api/simulacoes-corte/${x.id}/descartar`))
                      }
                    >
                      Descartar
                    </Botao>
                  )}
                </span>
              </div>
              <Resumo r={x.resultado} curto />
            </div>
          ))}
          {salvas.data && !salvas.data.length && (
            <p className="px-5 py-4 text-center text-muted-foreground">Nenhuma simulação salva.</p>
          )}
        </CorpoCartao>
      </Cartao>
    </div>
  )
}

/** Composição por variedade e safra e o que o rótulo pode declarar. */
function Resumo({ r, curto }: { r: Resultado; curto?: boolean }) {
  const [primeira] = r.rotulo.varietal
  return (
    <div className="flex flex-col gap-1">
      {primeira && (
        <p>
          <span className="text-muted-foreground">Variedades: </span>
          {primeira.variedades.map((v) => `${v.nome} ${pct(v.percentual)}`).join(' · ')}
        </p>
      )}
      {r.safras.length > 0 && (
        <p>
          <span className="text-muted-foreground">Safras: </span>
          {r.safras.map((x) => `${x.safra ?? 'sem safra'} ${pct(x.percentual)}`).join(' · ')}
        </p>
      )}
      {!curto && (
        <>
          {r.rotulo.varietal.map((v) => {
            const pode = v.variedades.filter((x) => x.pode)
            return (
              <p key={v.abrangencia}>
                <span className="text-muted-foreground">
                  Rótulo varietal ({v.abrangencia}, mínimo {v.minimo}%):{' '}
                </span>
                {pode.length
                  ? `pode declarar ${pode.map((x) => x.nome).join(', ')}`
                  : 'não pode declarar varietal'}
              </p>
            )
          })}
          {r.rotulo.safra && (
            <p>
              <span className="text-muted-foreground">
                Rótulo com safra (mínimo {r.rotulo.safra.minimo}%):{' '}
              </span>
              {r.rotulo.safra.safras.some((x) => x.pode)
                ? `pode declarar ${r.rotulo.safra.safras
                    .filter((x) => x.pode)
                    .map((x) => x.safra)
                    .join(', ')}`
                : 'não pode declarar safra'}
            </p>
          )}
          {r.chaptalizado && <p>Contém vinho chaptalizado.</p>}
          {r.organica > 0 && <p>Uva orgânica: {pct(r.organica)}.</p>}
          {r.projetos > 1 && (
            <p className="text-muted-foreground">
              Vinhos de projetos diferentes: o corte em lote novo cria um projeto novo.
            </p>
          )}
        </>
      )}
    </div>
  )
}
