// Administração › Suporte (administracao.md, Suporte): a fila dos chamados com o semáforo do prazo
// da primeira resposta, a conversa (com notas internas), a situação, os prazos por plano ou
// cliente e o resumo por categoria e por prazo.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  NOMES_PRIORIDADE,
  NOMES_SITUACAO_CHAMADO,
  PRIORIDADES_CHAMADO,
  type PrioridadeChamado,
  SITUACOES_CHAMADO,
  type SituacaoChamado,
} from '@vinicycle/shared'
import { CircleAlert, CircleCheck, Clock } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { TabelaDados } from '@/componentes/TabelaDados'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao } from '@/componentes/ui/cartao'
import { AreaTexto, Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { Dialogo } from '@/componentes/ui/dialogo'
import { Pagina } from '@/layout/Estrutura'
import { api } from '@/lib/api'
import { pode, useSessao } from '@/lib/sessao'
import { formatarDataHora } from '@/lib/utils'
import { type Conversa, EtiquetaSituacaoChamado, Mensagens } from '../Suporte'

type Semaforo = 'respondido' | 'verde' | 'amarelo' | 'vermelho'
interface LinhaChamado {
  id: string
  numero: number
  empresaId: string | null
  cliente: string | null
  solicitante: string
  origem: 'sistema' | 'publico'
  assunto: string
  categoria: string
  prioridade: PrioridadeChamado
  situacao: SituacaoChamado
  criadoEm: string
  prazoEm: string
  semaforo: Semaforo
}

/** Estado com ícone e texto, nunca só a cor. */
function Prazo({ semaforo, prazoEm }: { semaforo: Semaforo; prazoEm: string }) {
  const m = {
    respondido: { icone: <CircleCheck className="size-4 text-success" />, texto: 'Respondido' },
    verde: {
      icone: <Clock className="size-4 text-success" />,
      texto: `Até ${formatarDataHora(prazoEm)}`,
    },
    amarelo: {
      icone: <Clock className="size-4 text-warning" />,
      texto: `Perto: ${formatarDataHora(prazoEm)}`,
    },
    vermelho: {
      icone: <CircleAlert className="size-4 text-destructive" />,
      texto: `Atrasado desde ${formatarDataHora(prazoEm)}`,
    },
  }[semaforo]
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {m.icone}
      {m.texto}
    </span>
  )
}

function DetalheEquipe({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const { data: s } = useSessao()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['chamado-equipe', id],
    queryFn: () =>
      api.get<
        Conversa & {
          empresaId: string | null
          cliente: string | null
          origem: 'sistema' | 'publico'
          documentoInformado: string | null
          prazoEm: string
          semaforo: Semaforo
        }
      >(`/api/plataforma/chamados/${id}`),
  })
  const categorias = useQuery({
    queryKey: ['config-plataforma'],
    queryFn: () => api.get<{ chamadoCategorias: string[] }>('/api/plataforma/configuracoes'),
    enabled: pode(s, 'plataforma.configuracoes', 'visualizar'),
  })
  const [texto, setTexto] = useState('')
  const [interna, setInterna] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const podeEditar = pode(s, 'plataforma.suporte', 'editar')
  const recarregar = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['chamado-equipe', id] }),
      qc.invalidateQueries({ queryKey: ['lista'] }),
    ])
  const executar = async (f: () => Promise<unknown>) => {
    setErro(null)
    try {
      await f()
      await recarregar()
    } catch (e) {
      setErro((e as Error).message)
    }
  }
  const c = q.data
  return (
    <Dialogo
      aberto
      largo
      aoMudar={(x) => !x && aoFechar()}
      titulo={c ? `Chamado ${c.numero}: ${c.assunto}` : 'Chamado'}
      descricao={
        c && (
          <>
            {c.cliente ? (
              <Link className="underline" to={`/plataforma/clientes/${c.empresaId}`}>
                {c.cliente}
              </Link>
            ) : (
              `Sem cliente identificado${c.documentoInformado ? ` (documento ${c.documentoInformado})` : ''}`
            )}{' '}
            · {c.solicitanteNome} ({c.solicitanteEmail}) ·{' '}
            {c.origem === 'publico' ? 'página pública' : 'pelo sistema'}
          </>
        )
      }
    >
      {!c ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="flex flex-col gap-4 text-sm">
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <div className="flex flex-wrap items-end gap-3">
            <Campo rotulo="Situação" id="eq-sit">
              <Selecao
                id="eq-sit"
                disabled={!podeEditar}
                value={c.situacao}
                onChange={(e) =>
                  executar(() =>
                    api.post(`/api/plataforma/chamados/${id}/situacao`, {
                      situacao: e.target.value,
                    }),
                  )
                }
              >
                {SITUACOES_CHAMADO.map((x) => (
                  <option key={x} value={x}>
                    {NOMES_SITUACAO_CHAMADO[x]}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Prioridade" id="eq-pri">
              <Selecao
                id="eq-pri"
                disabled={!podeEditar}
                value={c.prioridade}
                onChange={(e) =>
                  executar(() =>
                    api.put(`/api/plataforma/chamados/${id}`, {
                      categoria: c.categoria,
                      prioridade: e.target.value,
                    }),
                  )
                }
              >
                {PRIORIDADES_CHAMADO.map((x) => (
                  <option key={x} value={x}>
                    {NOMES_PRIORIDADE[x]}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Categoria" id="eq-cat">
              <Selecao
                id="eq-cat"
                disabled={!podeEditar}
                value={c.categoria}
                onChange={(e) =>
                  executar(() =>
                    api.put(`/api/plataforma/chamados/${id}`, {
                      categoria: e.target.value,
                      prioridade: c.prioridade,
                    }),
                  )
                }
              >
                {[...new Set([c.categoria, ...(categorias.data?.chamadoCategorias ?? [])])].map(
                  (x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ),
                )}
              </Selecao>
            </Campo>
            <span className="pb-2">
              <Prazo semaforo={c.semaforo} prazoEm={c.prazoEm} />
            </span>
          </div>
          <Mensagens c={c} />
          {c.anexos.length > 0 && (
            <p>
              Anexos:{' '}
              {c.anexos.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && ', '}
                  <a className="underline" href={`/api/plataforma/chamados/${id}/anexos/${a.id}`}>
                    {a.nomeOriginal}
                  </a>
                </span>
              ))}
            </p>
          )}
          {podeEditar && (
            <div className="flex flex-col gap-2 border-t pt-3">
              <AreaTexto
                aria-label="Resposta"
                rows={4}
                placeholder={
                  interna
                    ? 'Nota interna (o cliente não vê)…'
                    : 'Resposta ao cliente (vai também por e-mail)…'
                }
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-4">
                <Botao
                  disabled={!texto.trim()}
                  onClick={() =>
                    executar(async () => {
                      await api.post(`/api/plataforma/chamados/${id}/mensagens`, {
                        texto,
                        interna,
                      })
                      setTexto('')
                    })
                  }
                >
                  {interna ? 'Salvar nota' : 'Responder'}
                </Botao>
                <Caixa
                  rotulo="Nota interna"
                  checked={interna}
                  onChange={(e) => setInterna(e.target.checked)}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </Dialogo>
  )
}

interface Prazos {
  padrao: Record<PrioridadeChamado, number>
  excecoes: Array<{
    id: string
    planoId: string | null
    empresaId: string | null
    prioridade: PrioridadeChamado
    horas: number
    plano: string | null
    cliente: string | null
  }>
}

function DialogoPrazos({ aoFechar }: { aoFechar: () => void }) {
  const qc = useQueryClient()
  const prazos = useQuery({
    queryKey: ['chamados-prazos'],
    queryFn: () => api.get<Prazos>('/api/plataforma/chamados-prazos'),
  })
  const planos = useQuery({
    queryKey: ['planos-plataforma'],
    queryFn: () => api.get<Array<{ id: string; nome: string }>>('/api/plataforma/planos?todos=1'),
  })
  const clientes = useQuery({
    queryKey: ['clientes-curto'],
    queryFn: () =>
      api.get<{ itens: Array<{ id: string; nome: string; nomeFantasia: string | null }> }>(
        '/api/plataforma/empresas?tamanho=100',
      ),
  })
  const [alvo, setAlvo] = useState('')
  const [horas, setHoras] = useState<Partial<Record<PrioridadeChamado, string>>>({})
  const [erro, setErro] = useState<string | null>(null)
  return (
    <Dialogo
      aberto
      largo
      aoMudar={(x) => !x && aoFechar()}
      titulo="Prazo da primeira resposta"
      descricao={`Padrão: ${PRIORIDADES_CHAMADO.map((p) => `${NOMES_PRIORIDADE[p].toLowerCase()} ${prazos.data?.padrao[p] ?? '…'} h`).join(', ')} (horas corridas). Vale o do cliente, senão o do plano, senão o padrão.`}
      rodape={
        <Botao
          disabled={!alvo}
          onClick={async () => {
            const [tipo, id] = alvo.split(':')
            try {
              await api.put('/api/plataforma/chamados-prazos', {
                planoId: tipo === 'plano' ? id : null,
                empresaId: tipo === 'cliente' ? id : null,
                horas: Object.fromEntries(
                  PRIORIDADES_CHAMADO.map((p) => [p, horas[p] ? Number(horas[p]) : null]),
                ),
              })
              await qc.invalidateQueries({ queryKey: ['chamados-prazos'] })
              setAlvo('')
              setHoras({})
            } catch (e) {
              setErro((e as Error).message)
            }
          }}
        >
          Salvar
        </Botao>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {prazos.data?.excecoes.length ? (
          <div>
            {prazos.data.excecoes.map((x) => (
              <p key={x.id}>
                {x.plano ? `Plano ${x.plano}` : x.cliente} ·{' '}
                {NOMES_PRIORIDADE[x.prioridade].toLowerCase()}: {x.horas} h
              </p>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">Nenhuma exceção: vale o padrão para todos.</p>
        )}
        <Campo rotulo="Definir para" id="pz-alvo">
          <Selecao
            id="pz-alvo"
            value={alvo}
            onChange={(e) => {
              setAlvo(e.target.value)
              const [tipo, id] = e.target.value.split(':')
              const atuais =
                prazos.data?.excecoes.filter(
                  (x) => (tipo === 'plano' ? x.planoId : x.empresaId) === id,
                ) ?? []
              setHoras(Object.fromEntries(atuais.map((x) => [x.prioridade, String(x.horas)])))
            }}
          >
            <option value="">Escolha um plano ou um cliente</option>
            <optgroup label="Planos">
              {planos.data?.map((p) => (
                <option key={p.id} value={`plano:${p.id}`}>
                  {p.nome}
                </option>
              ))}
            </optgroup>
            <optgroup label="Clientes">
              {clientes.data?.itens.map((c) => (
                <option key={c.id} value={`cliente:${c.id}`}>
                  {c.nomeFantasia || c.nome}
                </option>
              ))}
            </optgroup>
          </Selecao>
        </Campo>
        {alvo && (
          <div className="grid gap-3 sm:grid-cols-4">
            {PRIORIDADES_CHAMADO.map((p) => (
              <Campo
                key={p}
                rotulo={`${NOMES_PRIORIDADE[p]} (h)`}
                id={`pz-${p}`}
                ajuda="Vazio = padrão"
              >
                <Entrada
                  id={`pz-${p}`}
                  type="number"
                  min={1}
                  value={horas[p] ?? ''}
                  onChange={(e) => setHoras({ ...horas, [p]: e.target.value })}
                />
              </Campo>
            ))}
          </div>
        )}
      </div>
    </Dialogo>
  )
}

export function PaginaSuporte() {
  const { data: s } = useSessao()
  const [params, setParams] = useSearchParams()
  const [prazos, setPrazos] = useState(false)
  const resumo = useQuery({
    queryKey: ['chamados-resumo'],
    queryFn: () =>
      api.get<
        Array<{
          categoria: string
          total: number
          abertos: number
          noPrazo: number
          foraDoPrazo: number
        }>
      >('/api/plataforma/chamados-resumo'),
  })
  const aberto = params.get('chamado')
  return (
    <Pagina
      titulo="Suporte"
      trilha={['Administração']}
      acoes={
        pode(s, 'plataforma.suporte', 'editar') && (
          <Botao variante="secundario" onClick={() => setPrazos(true)}>
            Prazos de atendimento
          </Botao>
        )
      }
    >
      <TabelaDados<LinhaChamado>
        tabela="plataforma.suporte"
        url="/api/plataforma/chamados"
        ordemPadrao={{ campo: 'prazoEm', direcao: 'asc' }}
        filtrosIniciais={{ situacao: 'abertos' }}
        aoClicar={(c) => setParams({ chamado: c.id })}
        podeExportar={pode(s, 'plataforma.suporte', 'exportar')}
        filtros={(f, definir) => (
          <>
            <Selecao
              aria-label="Situação"
              className="w-48"
              value={f.situacao ?? ''}
              onChange={(e) => definir('situacao', e.target.value)}
            >
              <option value="abertos">Em aberto</option>
              <option value="">Todos</option>
              {SITUACOES_CHAMADO.map((x) => (
                <option key={x} value={x}>
                  {NOMES_SITUACAO_CHAMADO[x]}
                </option>
              ))}
            </Selecao>
            <Selecao
              aria-label="Prioridade"
              className="w-36"
              value={f.prioridade ?? ''}
              onChange={(e) => definir('prioridade', e.target.value)}
            >
              <option value="">Prioridades</option>
              {PRIORIDADES_CHAMADO.map((x) => (
                <option key={x} value={x}>
                  {NOMES_PRIORIDADE[x]}
                </option>
              ))}
            </Selecao>
          </>
        )}
        colunas={[
          {
            id: 'numero',
            titulo: 'Nº',
            ordenavel: true,
            celula: (c) => c.numero,
            exportar: (c) => c.numero,
          },
          {
            id: 'assunto',
            titulo: 'Assunto',
            celula: (c) => (
              <span>
                {c.assunto}
                <span className="block text-xs text-muted-foreground">
                  {c.cliente ?? 'sem cliente'} · {c.solicitante} · {c.categoria}
                </span>
              </span>
            ),
            exportar: (c) => c.assunto,
          },
          {
            id: 'prioridade',
            titulo: 'Prioridade',
            ordenavel: true,
            celula: (c) => NOMES_PRIORIDADE[c.prioridade],
            exportar: (c) => c.prioridade,
          },
          {
            id: 'situacao',
            titulo: 'Situação',
            ordenavel: true,
            celula: (c) => <EtiquetaSituacaoChamado situacao={c.situacao} />,
            exportar: (c) => c.situacao,
          },
          {
            id: 'prazoEm',
            titulo: 'Primeira resposta',
            ordenavel: true,
            celula: (c) => <Prazo semaforo={c.semaforo} prazoEm={c.prazoEm} />,
            exportar: (c) => c.semaforo,
          },
        ]}
      />
      <Cartao>
        <CabecalhoCartao
          titulo="Últimos 90 dias"
          descricao="Por categoria, com a primeira resposta dentro ou fora do prazo."
        />
        <CorpoCartao>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Categoria</th>
                <th className="py-1 text-right font-medium">Total</th>
                <th className="py-1 text-right font-medium">Em aberto</th>
                <th className="py-1 text-right font-medium">No prazo</th>
                <th className="py-1 text-right font-medium">Fora do prazo</th>
              </tr>
            </thead>
            <tbody>
              {resumo.data?.map((r) => (
                <tr key={r.categoria} className="border-t">
                  <td className="py-1.5">{r.categoria}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.total}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.abertos}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.noPrazo}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.foraDoPrazo}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {resumo.data && !resumo.data.length && (
            <p className="text-sm text-muted-foreground">Nenhum chamado no período.</p>
          )}
        </CorpoCartao>
      </Cartao>
      {aberto && <DetalheEquipe id={aberto} aoFechar={() => setParams({})} />}
      {prazos && <DialogoPrazos aoFechar={() => setPrazos(false)} />}
    </Pagina>
  )
}
