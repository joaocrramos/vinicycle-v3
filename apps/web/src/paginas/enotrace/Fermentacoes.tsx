// EnoTrace › Fermentações (cantina.md, Fermentações): as em andamento, com a última leitura e a
// sugestão de fim; início e fim por operação; leituras de densidade e temperatura e as curvas.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatarDecimal } from '@vinicycle/shared'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { CampoNumero } from '@/componentes/campos-especiais'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao'
import { Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { Dialogo } from '@/componentes/ui/dialogo'
import { Pagina } from '@/layout/Estrutura'
import { api, ErroApi } from '@/lib/api'
import { fusoAtivo, pode, useSessao } from '@/lib/sessao'
import { formatarDataHora } from '@/lib/utils'
import { agora, doCampo, useRecipientes } from './operacoes/comum'
import { litros } from './Projetos'

const NOMES = { alcoolica: 'Alcoólica', malolatica: 'Malolática' } as const
type Tipo = keyof typeof NOMES

interface Leitura {
  analiseId: string
  amostraEm: string
  recipiente: string | null
  densidade: string | null
  temperatura: string | null
}

interface Fermentacao {
  id: string
  loteId: string
  lote: string
  tipo: Tipo
  recipientes: string | null
  inicioId: string
  inicioCodigo: string
  inicioEm: string
  fimId: string | null
  fimCodigo: string | null
  fimEm: string | null
  sugereFim: boolean
}

const mensagem = (e: unknown) =>
  e instanceof ErroApi && e.campos.length
    ? `${e.message} ${e.campos.map((c) => c.mensagem).join(' ')}`
    : (e as Error).message

const dias = (desde: string, ate?: string | null) =>
  Math.max(
    0,
    Math.floor(
      ((ate ? new Date(ate) : new Date()).getTime() - new Date(desde).getTime()) / 86400_000,
    ),
  )

// Curva ------------------------------------------------------------------------------------------

/**
 * Uma medida ao longo do tempo: linha de 2 px, marcadores de 8 px, grade discreta e a dica do
 * ponto mais próximo do cursor. Densidade e temperatura ficam em gráficos separados (um eixo só).
 */
export function Curva({
  titulo,
  unidade,
  casas,
  pontos,
  fuso,
}: {
  titulo: string
  unidade: string
  casas: number
  pontos: Array<{ em: string; valor: number }>
  fuso: string
}) {
  const [foco, setFoco] = useState<number | null>(null)
  const L = 640
  const A = 200
  const m = { e: 56, d: 16, t: 12, b: 28 }
  if (pontos.length < 2)
    return (
      <Cartao>
        <CabecalhoCartao titulo={titulo} />
        <CorpoCartao className="text-sm text-muted-foreground">
          A curva aparece com duas leituras ou mais.
        </CorpoCartao>
      </Cartao>
    )
  const xs = pontos.map((p) => new Date(p.em).getTime())
  const ys = pontos.map((p) => p.valor)
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  const folga = (Math.max(...ys) - Math.min(...ys)) * 0.1 || Math.abs(ys[0]!) * 0.01 || 1
  const [y0, y1] = [Math.min(...ys) - folga, Math.max(...ys) + folga]
  const px = (x: number) => m.e + ((x - x0) / (x1 - x0 || 1)) * (L - m.e - m.d)
  const py = (y: number) => m.t + (1 - (y - y0) / (y1 - y0)) * (A - m.t - m.b)
  const grade = [0, 1, 2, 3].map((i) => y0 + ((y1 - y0) * i) / 3)
  const fmt = (v: number) => formatarDecimal(v.toFixed(casas), casas)
  const p = foco === null ? null : pontos[foco]!
  return (
    <Cartao>
      <CabecalhoCartao titulo={titulo} descricao={`Em ${unidade}, pela hora da amostra.`} />
      <CorpoCartao>
        <div className="relative">
          <svg
            viewBox={`0 0 ${L} ${A}`}
            className="h-auto w-full"
            role="img"
            aria-label={`${titulo}: ${pontos.length} leituras, de ${fmt(ys[0]!)} a ${fmt(ys.at(-1)!)} ${unidade}`}
            onMouseLeave={() => setFoco(null)}
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              const x = ((e.clientX - r.left) / r.width) * L
              let melhor = 0
              xs.forEach((v, i) => {
                if (Math.abs(px(v) - x) < Math.abs(px(xs[melhor]!) - x)) melhor = i
              })
              setFoco(melhor)
            }}
          >
            {grade.map((g) => (
              <g key={g}>
                <line
                  x1={m.e}
                  x2={L - m.d}
                  y1={py(g)}
                  y2={py(g)}
                  className="stroke-border"
                  strokeWidth={1}
                />
                <text
                  x={m.e - 8}
                  y={py(g)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-muted-foreground text-[12px]"
                >
                  {fmt(g)}
                </text>
              </g>
            ))}
            {[0, pontos.length - 1].map((i) => (
              <text
                key={i}
                x={px(xs[i]!)}
                y={A - 8}
                textAnchor={i === 0 ? 'start' : 'end'}
                className="fill-muted-foreground text-[12px]"
              >
                {formatarDataHora(pontos[i]!.em, fuso)}
              </text>
            ))}
            <polyline
              fill="none"
              className="stroke-primary"
              strokeWidth={2}
              strokeLinejoin="round"
              points={pontos.map((q, i) => `${px(xs[i]!)},${py(q.valor)}`).join(' ')}
            />
            {foco !== null && (
              <line
                x1={px(xs[foco]!)}
                x2={px(xs[foco]!)}
                y1={m.t}
                y2={A - m.b}
                className="stroke-muted-foreground"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            )}
            {pontos.map((q, i) => (
              <circle
                key={i}
                cx={px(xs[i]!)}
                cy={py(q.valor)}
                r={foco === i ? 5 : 4}
                className="fill-primary stroke-card"
                strokeWidth={2}
              />
            ))}
          </svg>
          {p && (
            <div
              className="pointer-events-none absolute top-0 rounded-md border bg-popover px-2 py-1 text-xs shadow-sm"
              style={{
                left: `${(px(xs[foco!]!) / L) * 100}%`,
                transform: px(xs[foco!]!) > L / 2 ? 'translateX(-105%)' : 'translateX(5%)',
              }}
            >
              <div className="font-medium">
                {fmt(p.valor)} {unidade}
              </div>
              <div className="text-muted-foreground">{formatarDataHora(p.em, fuso)}</div>
            </div>
          )}
        </div>
      </CorpoCartao>
    </Cartao>
  )
}

// Diálogos ---------------------------------------------------------------------------------------

function DialogoLeitura({ f, aoFechar }: { f: Fermentacao; aoFechar: () => void }) {
  const qc = useQueryClient()
  const [d, setD] = useState({
    amostraEm: agora(),
    densidade: null as string | null,
    temperatura: null as string | null,
  })
  const [erro, setErro] = useState<string | null>(null)
  return (
    <Dialogo
      aberto
      aoMudar={(v) => !v && aoFechar()}
      titulo={`Leitura · lote ${f.lote}`}
      descricao="Densidade e temperatura do mosto em fermentação (análise interna)."
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            onClick={async () => {
              setErro(null)
              try {
                await api.post(`/api/fermentacoes/${f.id}/leituras`, {
                  amostraEm: doCampo(d.amostraEm),
                  densidade: d.densidade,
                  temperatura: d.temperatura,
                })
                await qc.invalidateQueries({ queryKey: ['fermentacoes'] })
                await qc.invalidateQueries({ queryKey: ['fermentacao', f.id] })
                aoFechar()
              } catch (e) {
                setErro(mensagem(e))
              }
            }}
          >
            Registrar
          </Botao>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {erro && (
          <Aviso tom="erro" className="sm:col-span-3">
            {erro}
          </Aviso>
        )}
        <Campo rotulo="Amostra" id="lt-data">
          <Entrada
            id="lt-data"
            type="datetime-local"
            value={d.amostraEm}
            onChange={(e) => setD({ ...d, amostraEm: e.target.value })}
          />
        </Campo>
        <Campo rotulo="Densidade" id="lt-dens">
          <CampoNumero
            id="lt-dens"
            casas={4}
            unidade="g/mL"
            valor={d.densidade}
            aoMudar={(v) => setD({ ...d, densidade: v })}
          />
        </Campo>
        <Campo rotulo="Temperatura" id="lt-temp">
          <CampoNumero
            id="lt-temp"
            casas={1}
            unidade="°C"
            valor={d.temperatura}
            aoMudar={(v) => setD({ ...d, temperatura: v })}
          />
        </Campo>
      </div>
    </Dialogo>
  )
}

/** Início (escolhe recipiente e tipo) ou fim (da fermentação dada): uma operação sem volume. */
function DialogoEvento({ fim, aoFechar }: { fim: Fermentacao | null; aoFechar: () => void }) {
  const qc = useQueryClient()
  const recipientes = useRecipientes()
  const [d, setD] = useState({
    executadoEm: agora(),
    recipienteId: '',
    tipoFermentacao: (fim?.tipo ?? 'alcoolica') as Tipo,
  })
  const [erro, setErro] = useState<string | null>(null)
  const doLote = recipientes.data?.find((r) => r.lote?.id === fim?.loteId)
  return (
    <Dialogo
      aberto
      aoMudar={(v) => !v && aoFechar()}
      titulo={
        fim
          ? `Encerrar a fermentação ${NOMES[fim.tipo].toLowerCase()} · lote ${fim.lote}`
          : 'Iniciar fermentação'
      }
      descricao={
        fim
          ? 'Quem confirma o fim é o enólogo. Fica uma operação, que pode ser estornada.'
          : 'Fermentação espontânea é só marcar o início, sem adição de levedura.'
      }
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            onClick={async () => {
              setErro(null)
              try {
                await api.post('/api/operacoes/fermentacao', {
                  executadoEm: doCampo(d.executadoEm),
                  recipienteId: fim ? doLote?.id : d.recipienteId,
                  tipoFermentacao: d.tipoFermentacao,
                  evento: fim ? 'fim' : 'inicio',
                  cientes: [],
                })
                await qc.invalidateQueries({ queryKey: ['fermentacoes'] })
                if (fim) await qc.invalidateQueries({ queryKey: ['fermentacao', fim.id] })
                aoFechar()
              } catch (e) {
                setErro(mensagem(e))
              }
            }}
          >
            {fim ? 'Encerrar' : 'Iniciar'}
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
        {!fim && (
          <>
            <Campo rotulo="Recipiente" id="fe-rec">
              <Selecao
                id="fe-rec"
                value={d.recipienteId}
                onChange={(e) => setD({ ...d, recipienteId: e.target.value })}
              >
                <option value="">Escolha</option>
                {recipientes.data
                  ?.filter((r) => !!r.lote)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.codigo} · {litros(r.volume)} · {r.lote!.codigo}
                    </option>
                  ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Fermentação" id="fe-tipo">
              <Selecao
                id="fe-tipo"
                value={d.tipoFermentacao}
                onChange={(e) => setD({ ...d, tipoFermentacao: e.target.value as Tipo })}
              >
                <option value="alcoolica">Alcoólica</option>
                <option value="malolatica">Malolática</option>
              </Selecao>
            </Campo>
          </>
        )}
        <Campo rotulo="Execução" id="fe-data">
          <Entrada
            id="fe-data"
            type="datetime-local"
            value={d.executadoEm}
            onChange={(e) => setD({ ...d, executadoEm: e.target.value })}
          />
        </Campo>
      </div>
    </Dialogo>
  )
}

// Lista ------------------------------------------------------------------------------------------

export function ListaFermentacoes() {
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  const [situacao, setSituacao] = useState<'em_andamento' | 'todas'>('em_andamento')
  const [leitura, setLeitura] = useState<Fermentacao | null>(null)
  const [evento, setEvento] = useState<{ fim: Fermentacao | null } | null>(null)
  const q = useQuery({
    queryKey: ['fermentacoes', situacao],
    queryFn: () =>
      api.get<Array<Fermentacao & { ultima: Leitura | null; leituras: number }>>(
        `/api/fermentacoes?situacao=${situacao}`,
      ),
  })
  const podeLancar = pode(s, 'enotrace.operacoes', 'confirmar')
  return (
    <Pagina
      titulo="Fermentações"
      trilha={['EnoTrace']}
      acoes={
        podeLancar && (
          <Botao onClick={() => setEvento({ fim: null })}>
            <Plus /> Iniciar fermentação
          </Botao>
        )
      }
    >
      <div>
        <Selecao
          aria-label="Situação"
          className="w-48"
          value={situacao}
          onChange={(e) => setSituacao(e.target.value as typeof situacao)}
        >
          <option value="em_andamento">Em andamento</option>
          <option value="todas">Todas</option>
        </Selecao>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {q.data?.map((f) => (
          <Cartao key={f.id}>
            <CabecalhoCartao
              titulo={
                <Link className="underline" to={`/enotrace/fermentacoes/${f.id}`}>
                  {NOMES[f.tipo]} · lote {f.lote}
                </Link>
              }
              descricao={`${f.recipientes ?? 'sem saldo'} · início ${formatarDataHora(f.inicioEm, fuso)} · ${dias(f.inicioEm, f.fimEm)} dias`}
              acoes={
                f.fimId ? (
                  <Etiqueta tom="sucesso">Terminada</Etiqueta>
                ) : f.sugereFim ? (
                  <Etiqueta tom="alerta">Leituras estáveis: pode ter terminado</Etiqueta>
                ) : (
                  <Etiqueta>Em andamento</Etiqueta>
                )
              }
            />
            <CorpoCartao className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span>
                {f.ultima
                  ? `Última leitura ${formatarDataHora(f.ultima.amostraEm, fuso)}: ${[
                      f.ultima.densidade && `${formatarDecimal(f.ultima.densidade, 4)} g/mL`,
                      f.ultima.temperatura && `${formatarDecimal(f.ultima.temperatura, 1)} °C`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}`
                  : 'Sem leituras.'}
              </span>
              {!f.fimId && (
                <span className="flex gap-2">
                  {pode(s, 'enotrace.laboratorio', 'criar') && (
                    <Botao variante="secundario" tamanho="pequeno" onClick={() => setLeitura(f)}>
                      Leitura
                    </Botao>
                  )}
                  {podeLancar && (
                    <Botao
                      variante="secundario"
                      tamanho="pequeno"
                      onClick={() => setEvento({ fim: f })}
                    >
                      Encerrar
                    </Botao>
                  )}
                </span>
              )}
            </CorpoCartao>
          </Cartao>
        ))}
      </div>
      {q.data && !q.data.length && (
        <p className="text-sm text-muted-foreground">
          {situacao === 'em_andamento'
            ? 'Nenhuma fermentação em andamento.'
            : 'Nenhuma fermentação.'}
        </p>
      )}
      {leitura && <DialogoLeitura f={leitura} aoFechar={() => setLeitura(null)} />}
      {evento && <DialogoEvento fim={evento.fim} aoFechar={() => setEvento(null)} />}
    </Pagina>
  )
}

// Ficha ------------------------------------------------------------------------------------------

export function FichaFermentacao() {
  const { id = '' } = useParams()
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  const [leitura, setLeitura] = useState(false)
  const [encerrar, setEncerrar] = useState(false)
  const q = useQuery({
    queryKey: ['fermentacao', id],
    queryFn: () =>
      api.get<Fermentacao & { leituras: Leitura[]; fimSugeridoEm: string | null }>(
        `/api/fermentacoes/${id}`,
      ),
  })
  if (!q.data)
    return (
      <p className="text-sm text-muted-foreground">
        {q.isError ? (q.error as Error).message : 'Carregando…'}
      </p>
    )
  const f = q.data
  const serie = (k: 'densidade' | 'temperatura') =>
    f.leituras.flatMap((l) => (l[k] === null ? [] : [{ em: l.amostraEm, valor: Number(l[k]) }]))
  return (
    <Pagina
      titulo={`Fermentação ${NOMES[f.tipo].toLowerCase()} · lote ${f.lote}`}
      trilha={['EnoTrace', 'Fermentações']}
      acoes={
        !f.fimId && (
          <div className="flex gap-2">
            {pode(s, 'enotrace.laboratorio', 'criar') && (
              <Botao variante="secundario" onClick={() => setLeitura(true)}>
                Leitura
              </Botao>
            )}
            {pode(s, 'enotrace.operacoes', 'confirmar') && (
              <Botao variante="secundario" onClick={() => setEncerrar(true)}>
                Encerrar
              </Botao>
            )}
          </div>
        )
      }
    >
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          Início{' '}
          <Link className="underline" to={`/enotrace/operacoes/${f.inicioId}`}>
            {f.inicioCodigo}
          </Link>{' '}
          em {formatarDataHora(f.inicioEm, fuso)}
        </span>
        {f.fimId && f.fimEm && (
          <span>
            · fim{' '}
            <Link className="underline" to={`/enotrace/operacoes/${f.fimId}`}>
              {f.fimCodigo}
            </Link>{' '}
            em {formatarDataHora(f.fimEm, fuso)}
          </span>
        )}
        <span>
          ·{' '}
          <Link className="underline" to={`/enotrace/lotes/${f.loteId}`}>
            lote {f.lote}
          </Link>
          {f.recipientes && ` em ${f.recipientes}`}
        </span>
      </p>
      {f.sugereFim && (
        <Aviso tom="alerta">
          As últimas leituras de densidade estão estáveis abaixo do limite configurado: a
          fermentação pode ter terminado. Quem confirma é o enólogo, com <strong>Encerrar</strong>.
        </Aviso>
      )}
      <div className="grid gap-4">
        <Curva
          titulo="Densidade"
          unidade="g/mL"
          casas={4}
          pontos={serie('densidade')}
          fuso={fuso}
        />
        <Curva
          titulo="Temperatura"
          unidade="°C"
          casas={1}
          pontos={serie('temperatura')}
          fuso={fuso}
        />
      </div>
      <Cartao>
        <CabecalhoCartao titulo="Leituras" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="px-5 py-2 font-medium">Amostra</th>
                <th className="py-2 pr-3 text-right font-medium">Densidade</th>
                <th className="py-2 pr-5 text-right font-medium">Temperatura</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {f.leituras.map((l) => (
                <tr key={l.analiseId}>
                  <td className="px-5 py-2">{formatarDataHora(l.amostraEm, fuso)}</td>
                  <td className="py-2 pr-3 text-right">
                    {l.densidade ? `${formatarDecimal(l.densidade, 4)} g/mL` : '—'}
                  </td>
                  <td className="py-2 pr-5 text-right">
                    {l.temperatura ? `${formatarDecimal(l.temperatura, 1)} °C` : '—'}
                  </td>
                </tr>
              ))}
              {!f.leituras.length && (
                <tr>
                  <td colSpan={3} className="px-5 py-6 text-muted-foreground">
                    Nenhuma leitura.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Cartao>
      {leitura && <DialogoLeitura f={f} aoFechar={() => setLeitura(false)} />}
      {encerrar && <DialogoEvento fim={f} aoFechar={() => setEncerrar(false)} />}
    </Pagina>
  )
}
