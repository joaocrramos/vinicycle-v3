// EnoTrace › Laboratório (cantina.md, Análises e Laboratório): análises internas e laudos, com os
// parâmetros que a empresa mede, a unidade escolhida (convertida para a padrão) e o "fora da
// faixa"; pedidos de análise externa (coletada → enviada → laudo recebido); as análises do lote,
// com a curva de cada parâmetro.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { daUnidadePadrao, formatarDecimal, SITUACOES_AMOSTRA } from '@vinicycle/shared'
import { Plus, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Anexos } from '@/componentes/Anexos'
import { CampoNumero } from '@/componentes/campos-especiais'
import { PedirMotivo } from '@/componentes/PedirMotivo'
import { Aba, Abas, ConteudoAba, ListaAbas } from '@/componentes/ui/abas'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao'
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { Dialogo } from '@/componentes/ui/dialogo'
import { Pagina } from '@/layout/Estrutura'
import { api, ErroApi } from '@/lib/api'
import { fusoAtivo, pode, useSessao } from '@/lib/sessao'
import { formatarData, formatarDataHora } from '@/lib/utils'
import { Curva } from './Fermentacoes'
import { agora, doCampo, paraCampo, useRecipientes } from './operacoes/comum'
import { litros } from './Projetos'

const F = 'enotrace.laboratorio'

interface Parametro {
  id: string
  codigo: string
  nome: string
  unidadePadrao: string
  unidadesAceitas: string[]
  unidadePreferida: string | null
  casas: number
  minimo: string | null
  maximo: string | null
}

interface Resultado {
  parametroId: string
  codigo: string
  nome: string
  unidadePadrao: string
  casas: number
  valor: string
  valorDigitado: string | null
  unidadeDigitada: string | null
  foraFaixa: boolean
}

export interface Analise {
  id: string
  tipo: 'interna' | 'laudo'
  amostraEm: string
  loteId: string
  lote: string
  recipienteId: string | null
  recipiente: string | null
  laboratorioId: string | null
  laboratorio: string | null
  amostraId: string | null
  amostra: string | null
  documento: string | null
  observacao: string | null
  versao: number
  resultados: Resultado[]
}

interface Amostra {
  id: string
  codigo: string
  loteId: string
  lote: string
  recipiente: string | null
  coletadaEm: string
  enviadaEm: string | null
  laboratorioId: string
  laboratorio: string
  prazo: string | null
  situacao: keyof typeof SITUACOES_AMOSTRA
  atrasada: boolean
  analiseId: string | null
}

interface Laboratorio {
  id: string
  nome: string
  credenciamento: string | null
  validade: string | null
  prazoDias: number | null
}

const mensagem = (e: unknown) =>
  e instanceof ErroApi && e.campos.length
    ? `${e.message} ${e.campos.map((c) => c.mensagem).join(' ')}`
    : (e as Error).message

export function useParametrosLab() {
  return useQuery({
    queryKey: ['laboratorio-parametros'],
    queryFn: () => api.get<Parametro[]>('/api/laboratorio/parametros'),
  })
}

function useLaboratorios() {
  return useQuery({
    queryKey: ['laboratorios'],
    queryFn: () => api.get<Laboratorio[]>('/api/laboratorios'),
  })
}

/** Valor na unidade preferida da empresa (ou na padrão), com as casas do parâmetro. */
export function useValorExibido() {
  const params = useParametrosLab()
  return (r: Resultado) => {
    const p = params.data?.find((x) => x.id === r.parametroId)
    const unidade = p?.unidadePreferida ?? r.unidadePadrao
    const v = daUnidadePadrao(
      { codigo: r.codigo, unidadePadrao: r.unidadePadrao },
      Number(r.valor),
      unidade,
    )
    const casas = unidade === r.unidadePadrao ? r.casas : 2
    return v === null
      ? `${formatarDecimal(Number(r.valor).toFixed(r.casas), r.casas)} ${r.unidadePadrao}`
      : `${formatarDecimal(v.toFixed(casas), casas)} ${unidade}`
  }
}

function ResumoResultados({ a }: { a: Analise }) {
  const exibir = useValorExibido()
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {a.resultados.map((r) => (
        <span key={r.parametroId} className={r.foraFaixa ? 'text-warning' : undefined}>
          {r.nome} {exibir(r)}
          {r.foraFaixa && (
            <TriangleAlert className="ml-0.5 inline size-3.5" aria-label="fora da faixa" />
          )}
        </span>
      ))}
    </span>
  )
}

// Formulário da análise ---------------------------------------------------------------------------

interface Inicial {
  analise?: Analise
  tipo?: 'interna' | 'laudo'
  recipienteId?: string
  loteId?: string
  amostra?: Amostra
}

export function DialogoAnalise({
  inicial,
  aoFechar,
}: {
  inicial: Inicial
  aoFechar: (id?: string) => void
}) {
  const qc = useQueryClient()
  const params = useParametrosLab()
  const labs = useLaboratorios()
  const recipientes = useRecipientes()
  const a = inicial.analise
  const [d, setD] = useState(() => ({
    tipo: a?.tipo ?? (inicial.amostra ? 'laudo' : (inicial.tipo ?? 'interna')),
    amostraEm: a
      ? paraCampo(a.amostraEm)
      : inicial.amostra
        ? paraCampo(inicial.amostra.coletadaEm)
        : agora(),
    recipienteId: a?.recipienteId ?? inicial.recipienteId ?? '',
    laboratorioId: a?.laboratorioId ?? inicial.amostra?.laboratorioId ?? '',
    documento: a?.documento ?? '',
    observacao: a?.observacao ?? '',
    valores: Object.fromEntries(
      (a?.resultados ?? []).map((r) => [
        r.parametroId,
        {
          valor: r.valorDigitado ?? r.valor,
          unidade: r.unidadeDigitada ?? r.unidadePadrao,
        },
      ]),
    ) as Record<string, { valor: string | null; unidade: string }>,
  }))
  const [erro, setErro] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const fixo = !!a || !!inicial.amostra || !!inicial.loteId
  const loteId = a?.loteId ?? inicial.amostra?.loteId ?? inicial.loteId ?? null
  const unidade = (p: Parametro) =>
    d.valores[p.id]?.unidade ?? p.unidadePreferida ?? p.unidadePadrao
  const salvar = async () => {
    setErro(null)
    const resultados = (params.data ?? [])
      .filter((p) => d.valores[p.id]?.valor)
      .map((p) => ({ parametroId: p.id, valor: d.valores[p.id]!.valor, unidade: unidade(p) }))
    const corpo = {
      tipo: d.tipo,
      amostraEm: doCampo(d.amostraEm),
      recipienteId: fixo ? null : d.recipienteId || null,
      loteId,
      laboratorioId: d.tipo === 'laudo' ? d.laboratorioId || null : null,
      amostraId: inicial.amostra?.id ?? null,
      documento: d.documento || null,
      observacao: d.observacao || null,
      resultados,
      versao: a?.versao,
    }
    try {
      const r = a
        ? await api.put<{ avisos: string[] }>(`/api/analises/${a.id}`, corpo)
        : await api.post<{ id: string; avisos: string[] }>('/api/analises', corpo)
      await qc.invalidateQueries({ queryKey: ['analises'] })
      await qc.invalidateQueries({ queryKey: ['amostras'] })
      if (a) await qc.invalidateQueries({ queryKey: ['analise', a.id] })
      if (r.avisos.length) {
        setAvisos(r.avisos)
        return
      }
      aoFechar('id' in r ? (r.id as string) : undefined)
    } catch (e) {
      setErro(mensagem(e))
    }
  }
  return (
    <Dialogo
      aberto
      aoMudar={(v) => !v && aoFechar()}
      titulo={
        a
          ? 'Corrigir análise'
          : inicial.amostra
            ? `Laudo da amostra ${inicial.amostra.codigo}`
            : 'Nova análise'
      }
      descricao="Deixe vazio o que não foi medido. Fora da faixa fica marcado; não impede."
      rodape={
        avisos.length ? (
          <Botao onClick={() => aoFechar()}>Entendi</Botao>
        ) : (
          <>
            <Botao variante="secundario" onClick={() => aoFechar()}>
              Cancelar
            </Botao>
            <Botao onClick={salvar}>{a ? 'Salvar' : 'Registrar'}</Botao>
          </>
        )
      }
    >
      {avisos.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Aviso tom="sucesso">Análise registrada.</Aviso>
          {avisos.map((x) => (
            <Aviso key={x} tom="alerta">
              {x}
            </Aviso>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {erro && (
            <Aviso tom="erro" className="sm:col-span-2">
              {erro}
            </Aviso>
          )}
          {!a && !inicial.amostra && (
            <Campo rotulo="Tipo" id="an-tipo">
              <Selecao
                id="an-tipo"
                value={d.tipo}
                onChange={(e) => setD({ ...d, tipo: e.target.value as 'interna' | 'laudo' })}
              >
                <option value="interna">Análise interna</option>
                <option value="laudo">Laudo de laboratório externo</option>
              </Selecao>
            </Campo>
          )}
          <Campo rotulo="Amostra" id="an-data">
            <Entrada
              id="an-data"
              type="datetime-local"
              value={d.amostraEm}
              onChange={(e) => setD({ ...d, amostraEm: e.target.value })}
            />
          </Campo>
          {!fixo && (
            <Campo rotulo="Recipiente" id="an-rec">
              <Selecao
                id="an-rec"
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
          )}
          {d.tipo === 'laudo' && (
            <>
              <Campo rotulo="Laboratório" id="an-lab">
                <Selecao
                  id="an-lab"
                  value={d.laboratorioId}
                  onChange={(e) => setD({ ...d, laboratorioId: e.target.value })}
                >
                  <option value="">—</option>
                  {labs.data?.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Campo rotulo="Número do laudo" id="an-doc">
                <Entrada
                  id="an-doc"
                  value={d.documento}
                  onChange={(e) => setD({ ...d, documento: e.target.value })}
                />
              </Campo>
            </>
          )}
          <div className="flex flex-col gap-2 sm:col-span-2">
            {params.data && !params.data.length && (
              <Aviso tom="alerta">
                Nenhum parâmetro marcado. Marque as análises que a vinícola faz em Parâmetros
                técnicos › Análises.
              </Aviso>
            )}
            {params.data?.map((p) => (
              <div key={p.id} className="grid grid-cols-[1fr_9rem_7rem] items-center gap-2">
                <span className="text-sm">
                  {p.nome}
                  {(p.minimo || p.maximo) && (
                    <span className="block text-xs text-muted-foreground">
                      faixa {p.minimo ? formatarDecimal(p.minimo, p.casas) : '…'} a{' '}
                      {p.maximo ? formatarDecimal(p.maximo, p.casas) : '…'} {p.unidadePadrao}
                    </span>
                  )}
                </span>
                <CampoNumero
                  aria-label={p.nome}
                  casas={unidade(p) === p.unidadePadrao ? p.casas : 2}
                  valor={d.valores[p.id]?.valor ?? null}
                  aoMudar={(v) =>
                    setD({
                      ...d,
                      valores: { ...d.valores, [p.id]: { valor: v, unidade: unidade(p) } },
                    })
                  }
                />
                {p.unidadesAceitas.length > 1 ? (
                  <Selecao
                    aria-label={`Unidade de ${p.nome}`}
                    value={unidade(p)}
                    onChange={(e) =>
                      setD({
                        ...d,
                        valores: {
                          ...d.valores,
                          [p.id]: {
                            valor: d.valores[p.id]?.valor ?? null,
                            unidade: e.target.value,
                          },
                        },
                      })
                    }
                  >
                    {p.unidadesAceitas.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </Selecao>
                ) : (
                  <span className="text-sm text-muted-foreground">{p.unidadePadrao}</span>
                )}
              </div>
            ))}
          </div>
          <Campo rotulo="Observação" id="an-obs" className="sm:col-span-2">
            <AreaTexto
              id="an-obs"
              rows={2}
              value={d.observacao}
              onChange={(e) => setD({ ...d, observacao: e.target.value })}
            />
          </Campo>
        </div>
      )}
    </Dialogo>
  )
}

// Pedido de análise externa ----------------------------------------------------------------------

function DialogoAmostra({ aoFechar }: { aoFechar: () => void }) {
  const qc = useQueryClient()
  const labs = useLaboratorios()
  const recipientes = useRecipientes()
  const [d, setD] = useState({
    coletadaEm: agora(),
    recipienteId: '',
    laboratorioId: '',
    prazo: '',
  })
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<{ codigo: string; avisos: string[] } | null>(null)
  return (
    <Dialogo
      aberto
      aoMudar={(v) => !v && aoFechar()}
      titulo="Pedido de análise externa"
      descricao="A amostra ganha um código para a etiqueta. Sem prazo, vale o prazo médio do laboratório."
      rodape={
        feito ? (
          <Botao onClick={aoFechar}>Fechar</Botao>
        ) : (
          <>
            <Botao variante="secundario" onClick={aoFechar}>
              Cancelar
            </Botao>
            <Botao
              onClick={async () => {
                setErro(null)
                try {
                  const r = await api.post<{ codigo: string; avisos: string[] }>('/api/amostras', {
                    coletadaEm: doCampo(d.coletadaEm),
                    recipienteId: d.recipienteId || null,
                    laboratorioId: d.laboratorioId || null,
                    prazo: d.prazo || null,
                  })
                  await qc.invalidateQueries({ queryKey: ['amostras'] })
                  setFeito(r)
                } catch (e) {
                  setErro(mensagem(e))
                }
              }}
            >
              Registrar
            </Botao>
          </>
        )
      }
    >
      {feito ? (
        <div className="flex flex-col gap-2">
          <Aviso tom="sucesso">
            Amostra <strong>{feito.codigo}</strong> registrada. Escreva o código na etiqueta do
            frasco.
          </Aviso>
          {feito.avisos.map((x) => (
            <Aviso key={x} tom="alerta">
              {x}
            </Aviso>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {erro && (
            <Aviso tom="erro" className="sm:col-span-2">
              {erro}
            </Aviso>
          )}
          <Campo rotulo="Coleta" id="am-data">
            <Entrada
              id="am-data"
              type="datetime-local"
              value={d.coletadaEm}
              onChange={(e) => setD({ ...d, coletadaEm: e.target.value })}
            />
          </Campo>
          <Campo rotulo="Recipiente" id="am-rec">
            <Selecao
              id="am-rec"
              value={d.recipienteId}
              onChange={(e) => setD({ ...d, recipienteId: e.target.value })}
            >
              <option value="">Escolha</option>
              {recipientes.data
                ?.filter((r) => !!r.lote)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.codigo} · {r.lote!.codigo}
                  </option>
                ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Laboratório" id="am-lab">
            <Selecao
              id="am-lab"
              value={d.laboratorioId}
              onChange={(e) => setD({ ...d, laboratorioId: e.target.value })}
            >
              <option value="">Escolha</option>
              {labs.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Prazo do laudo" id="am-prazo">
            <Entrada
              id="am-prazo"
              type="date"
              value={d.prazo}
              onChange={(e) => setD({ ...d, prazo: e.target.value })}
            />
          </Campo>
          {labs.data && !labs.data.length && (
            <Aviso tom="alerta" className="sm:col-span-2">
              Cadastre o laboratório em Pessoas, com o papel “Laboratório” e o credenciamento MAPA.
            </Aviso>
          )}
        </div>
      )}
    </Dialogo>
  )
}

// Listas -----------------------------------------------------------------------------------------

function TabelaAnalises({ analises, comLote }: { analises: Analise[]; comLote: boolean }) {
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="px-5 py-2 font-medium">Amostra</th>
            {comLote && <th className="py-2 pr-3 font-medium">Lote</th>}
            <th className="py-2 pr-3 font-medium">Origem</th>
            <th className="py-2 pr-5 font-medium">Resultados</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {analises.map((a) => (
            <tr key={a.id}>
              <td className="px-5 py-2 whitespace-nowrap">
                <Link className="underline" to={`/enotrace/laboratorio/analises/${a.id}`}>
                  {formatarDataHora(a.amostraEm, fuso)}
                </Link>
              </td>
              {comLote && (
                <td className="py-2 pr-3 whitespace-nowrap">
                  <Link className="underline" to={`/enotrace/lotes/${a.loteId}`}>
                    {a.lote}
                  </Link>
                  {a.recipiente && <span className="text-muted-foreground"> · {a.recipiente}</span>}
                </td>
              )}
              <td className="py-2 pr-3">
                {a.tipo === 'laudo'
                  ? `Laudo${a.laboratorio ? ` · ${a.laboratorio}` : ''}`
                  : 'Interna'}
              </td>
              <td className="py-2 pr-5">
                <ResumoResultados a={a} />
              </td>
            </tr>
          ))}
          {!analises.length && (
            <tr>
              <td colSpan={comLote ? 4 : 3} className="px-5 py-6 text-muted-foreground">
                Nenhuma análise.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function TabelaAmostras({ aoLaudo }: { aoLaudo: (a: Amostra) => void }) {
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  const qc = useQueryClient()
  const [situacao, setSituacao] = useState<'abertas' | 'todas'>('abertas')
  const [cancelar, setCancelar] = useState<Amostra | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const q = useQuery({
    queryKey: ['amostras', situacao],
    queryFn: () => api.get<Amostra[]>(`/api/amostras?situacao=${situacao}`),
  })
  const podeEditar = pode(s, F, 'editar')
  return (
    <div className="flex flex-col gap-3">
      <Selecao
        aria-label="Situação"
        className="w-48"
        value={situacao}
        onChange={(e) => setSituacao(e.target.value as typeof situacao)}
      >
        <option value="abertas">Em aberto</option>
        <option value="todas">Todos</option>
      </Selecao>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Cartao>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="px-5 py-2 font-medium">Amostra</th>
                <th className="py-2 pr-3 font-medium">Lote</th>
                <th className="py-2 pr-3 font-medium">Laboratório</th>
                <th className="py-2 pr-3 font-medium">Coleta</th>
                <th className="py-2 pr-3 font-medium">Prazo</th>
                <th className="py-2 pr-3 font-medium">Situação</th>
                <th className="py-2 pr-5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {q.data?.map((a) => (
                <tr key={a.id}>
                  <td className="px-5 py-2 font-medium whitespace-nowrap">{a.codigo}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <Link className="underline" to={`/enotrace/lotes/${a.loteId}`}>
                      {a.lote}
                    </Link>
                    {a.recipiente && (
                      <span className="text-muted-foreground"> · {a.recipiente}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">{a.laboratorio}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {formatarDataHora(a.coletadaEm, fuso)}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {a.prazo ? formatarData(a.prazo) : '—'}
                  </td>
                  <td className="py-2 pr-3">
                    {a.atrasada ? (
                      <Etiqueta tom="alerta">Laudo atrasado</Etiqueta>
                    ) : (
                      <Etiqueta tom={a.situacao === 'laudo_recebido' ? 'sucesso' : 'neutro'}>
                        {SITUACOES_AMOSTRA[a.situacao]}
                      </Etiqueta>
                    )}
                  </td>
                  <td className="py-2 pr-5">
                    <span className="flex justify-end gap-2">
                      {a.situacao === 'coletada' && podeEditar && (
                        <Botao
                          variante="secundario"
                          tamanho="pequeno"
                          onClick={async () => {
                            setErro(null)
                            try {
                              await api.post(`/api/amostras/${a.id}/enviar`, {
                                enviadaEm: new Date().toISOString(),
                              })
                              await qc.invalidateQueries({ queryKey: ['amostras'] })
                            } catch (e) {
                              setErro(mensagem(e))
                            }
                          }}
                        >
                          Enviada
                        </Botao>
                      )}
                      {(a.situacao === 'coletada' || a.situacao === 'enviada') && (
                        <>
                          {pode(s, F, 'criar') && (
                            <Botao tamanho="pequeno" onClick={() => aoLaudo(a)}>
                              Laudo
                            </Botao>
                          )}
                          {podeEditar && (
                            <Botao
                              variante="fantasma"
                              tamanho="pequeno"
                              onClick={() => setCancelar(a)}
                            >
                              Cancelar
                            </Botao>
                          )}
                        </>
                      )}
                      {a.analiseId && (
                        <Link
                          className="text-sm underline"
                          to={`/enotrace/laboratorio/analises/${a.analiseId}`}
                        >
                          Ver laudo
                        </Link>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
              {q.data && !q.data.length && (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-muted-foreground">
                    Nenhum pedido.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Cartao>
      <PedirMotivo
        aberto={!!cancelar}
        aoMudar={(v) => !v && setCancelar(null)}
        titulo={`Cancelar a amostra ${cancelar?.codigo ?? ''}`}
        rotuloBotao="Cancelar amostra"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/amostras/${cancelar!.id}/cancelar`, { motivo })
          await qc.invalidateQueries({ queryKey: ['amostras'] })
          setCancelar(null)
        }}
      />
    </div>
  )
}

export function PaginaLaboratorio() {
  const { aba = 'analises' } = useParams()
  const navegar = useNavigate()
  const { data: s } = useSessao()
  const [tipo, setTipo] = useState('')
  const [dialogo, setDialogo] = useState<Inicial | null>(null)
  const [pedido, setPedido] = useState(false)
  const q = useQuery({
    queryKey: ['analises', tipo],
    queryFn: () => api.get<Analise[]>(`/api/analises${tipo ? `?tipo=${tipo}` : ''}`),
  })
  const podeCriar = pode(s, F, 'criar')
  return (
    <Pagina
      titulo="Laboratório"
      trilha={['EnoTrace']}
      acoes={
        podeCriar && (
          <div className="flex gap-2">
            <Botao variante="secundario" onClick={() => setPedido(true)}>
              Pedido ao laboratório
            </Botao>
            <Botao onClick={() => setDialogo({})}>
              <Plus /> Nova análise
            </Botao>
          </div>
        )
      }
    >
      <Abas value={aba} onValueChange={(v) => navegar(`/enotrace/laboratorio/${v}`)}>
        <ListaAbas>
          <Aba value="analises">Análises</Aba>
          <Aba value="pedidos">Pedidos ao laboratório</Aba>
        </ListaAbas>
        <ConteudoAba value="analises" className="flex flex-col gap-3">
          <Selecao
            aria-label="Tipo"
            className="w-56"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
          >
            <option value="">Internas e laudos</option>
            <option value="interna">Análises internas</option>
            <option value="laudo">Laudos</option>
          </Selecao>
          <Cartao>{q.data && <TabelaAnalises analises={q.data} comLote />}</Cartao>
        </ConteudoAba>
        <ConteudoAba value="pedidos">
          <TabelaAmostras aoLaudo={(a) => setDialogo({ amostra: a })} />
        </ConteudoAba>
      </Abas>
      {dialogo && (
        <DialogoAnalise
          inicial={dialogo}
          aoFechar={(id) => {
            setDialogo(null)
            if (id) navegar(`/enotrace/laboratorio/analises/${id}`)
          }}
        />
      )}
      {pedido && <DialogoAmostra aoFechar={() => setPedido(false)} />}
    </Pagina>
  )
}

// Ficha da análise --------------------------------------------------------------------------------

export function FichaAnalise() {
  const { id = '' } = useParams()
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  const navegar = useNavigate()
  const exibir = useValorExibido()
  const [editar, setEditar] = useState(false)
  const [excluir, setExcluir] = useState(false)
  const q = useQuery({
    queryKey: ['analise', id],
    queryFn: () => api.get<Analise>(`/api/analises/${id}`),
  })
  if (!q.data)
    return (
      <p className="text-sm text-muted-foreground">
        {q.isError ? (q.error as Error).message : 'Carregando…'}
      </p>
    )
  const a = q.data
  return (
    <Pagina
      titulo={`${a.tipo === 'laudo' ? 'Laudo' : 'Análise interna'} de ${formatarDataHora(a.amostraEm, fuso)}`}
      trilha={['EnoTrace', 'Laboratório']}
      acoes={
        <div className="flex gap-2">
          {pode(s, F, 'editar') && (
            <Botao variante="secundario" onClick={() => setEditar(true)}>
              Corrigir
            </Botao>
          )}
          {pode(s, F, 'inativar') && (
            <Botao variante="fantasma" onClick={() => setExcluir(true)}>
              Excluir
            </Botao>
          )}
        </div>
      }
    >
      <p className="text-sm text-muted-foreground">
        <Link className="underline" to={`/enotrace/lotes/${a.loteId}`}>
          Lote {a.lote}
        </Link>
        {a.recipiente && ` · ${a.recipiente}`}
        {a.laboratorio && ` · ${a.laboratorio}`}
        {a.documento && ` · laudo ${a.documento}`}
        {a.amostra && ` · amostra ${a.amostra}`}
      </p>
      <Cartao>
        <CabecalhoCartao titulo="Resultados" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="px-5 py-2 font-medium">Parâmetro</th>
                <th className="py-2 pr-3 text-right font-medium">Valor</th>
                <th className="py-2 pr-5 font-medium">Como foi digitado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {a.resultados.map((r) => (
                <tr key={r.parametroId}>
                  <td className="px-5 py-2">
                    {r.nome}
                    {r.foraFaixa && (
                      <Etiqueta tom="alerta" className="ml-2">
                        Fora da faixa
                      </Etiqueta>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">{exibir(r)}</td>
                  <td className="py-2 pr-5 text-muted-foreground">
                    {r.valorDigitado
                      ? `${r.valorDigitado.replace('.', ',')} ${r.unidadeDigitada ?? ''}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
      {a.observacao && (
        <Cartao>
          <CorpoCartao className="text-sm">{a.observacao}</CorpoCartao>
        </Cartao>
      )}
      <Cartao>
        <CabecalhoCartao
          titulo="Laudo e anexos"
          descricao="O PDF do laudo fica guardado aqui (P15)."
        />
        <CorpoCartao>
          <Anexos
            entidade="analise"
            registroId={a.id}
            podeAlterar={pode(s, F, 'editar')}
            fuso={fuso}
          />
        </CorpoCartao>
      </Cartao>
      {editar && <DialogoAnalise inicial={{ analise: a }} aoFechar={() => setEditar(false)} />}
      <PedirMotivo
        aberto={excluir}
        aoMudar={setExcluir}
        titulo="Excluir a análise"
        descricao="Para análise lançada por engano. Fica registrado na auditoria."
        rotuloBotao="Excluir"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/analises/${a.id}/excluir`, { motivo })
          navegar('/enotrace/laboratorio')
        }}
      />
    </Pagina>
  )
}

// Análises do lote ----------------------------------------------------------------------------------

/** Na ficha do lote: as análises e a curva de cada parâmetro com duas leituras ou mais. */
export function AnalisesDoLote({ loteId }: { loteId: string }) {
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  const params = useParametrosLab()
  const [nova, setNova] = useState(false)
  const q = useQuery({
    queryKey: ['analises', 'lote', loteId],
    queryFn: () => api.get<Analise[]>(`/api/analises?lote=${loteId}`),
  })
  if (!q.data) return <p className="text-sm text-muted-foreground">Carregando…</p>
  const series = new Map<
    string,
    { nome: string; unidade: string; casas: number; pontos: Array<{ em: string; valor: number }> }
  >()
  for (const a of [...q.data].reverse())
    for (const r of a.resultados) {
      const p = params.data?.find((x) => x.id === r.parametroId)
      const unidade = p?.unidadePreferida ?? r.unidadePadrao
      const v =
        daUnidadePadrao(
          { codigo: r.codigo, unidadePadrao: r.unidadePadrao },
          Number(r.valor),
          unidade,
        ) ?? Number(r.valor)
      const serie = series.get(r.parametroId) ?? {
        nome: r.nome,
        unidade,
        casas: unidade === r.unidadePadrao ? r.casas : 2,
        pontos: [],
      }
      serie.pontos.push({ em: a.amostraEm, valor: v })
      series.set(r.parametroId, serie)
    }
  return (
    <div className="flex flex-col gap-4">
      {pode(s, F, 'criar') && (
        <div>
          <Botao variante="secundario" onClick={() => setNova(true)}>
            <Plus /> Nova análise
          </Botao>
        </div>
      )}
      <Cartao>
        <TabelaAnalises analises={q.data} comLote={false} />
      </Cartao>
      <div className="grid gap-4 lg:grid-cols-2">
        {[...series.values()]
          .filter((x) => x.pontos.length >= 2)
          .map((x) => (
            <Curva
              key={x.nome}
              titulo={x.nome}
              unidade={x.unidade}
              casas={x.casas}
              pontos={x.pontos}
              fuso={fuso}
            />
          ))}
      </div>
      {nova && <DialogoAnalise inicial={{ loteId }} aoFechar={() => setNova(false)} />}
    </div>
  )
}
