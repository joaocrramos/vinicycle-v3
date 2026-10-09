// Gestão › Documentos › Autocontrole (gestao.md, Autocontrole; Decreto 12.709/2025, arts. 117 a 120):
// o programa de controles do estabelecimento, totalmente configurável (P29), e as evidências de cada
// controle. A higienização e as leituras de temperatura da cantina contam sozinhas.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CHAVES_UNIDADE_PERIODICIDADE,
  EVIDENCIAS_AUTOMATICAS,
  type EvidenciaAutomatica,
  textoPeriodicidade,
  UNIDADES_PERIODICIDADE,
  type UnidadePeriodicidade,
} from '@vinicycle/shared'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AcoesLinha } from '@/componentes/AcoesLinha'
import { Anexos } from '@/componentes/Anexos'
import { PedirMotivo } from '@/componentes/PedirMotivo'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao'
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { Dialogo } from '@/componentes/ui/dialogo'
import { Pagina } from '@/layout/Estrutura'
import { api, ErroApi } from '@/lib/api'
import { fusoAtivo, pode, useSessao } from '@/lib/sessao'
import { formatarData } from '@/lib/utils'

type Situacao = 'sob_demanda' | 'em_dia' | 'vence_logo' | 'atrasado' | 'inativo'
interface Controle {
  id: string
  nome: string
  descricao: string | null
  codigoModelo: string | null
  periodicidadeQuantidade: number | null
  periodicidadeUnidade: UnidadePeriodicidade | null
  evidenciaAutomatica: EvidenciaAutomatica | null
  responsavelId: string | null
  responsavel: string | null
  ativo: boolean
  ultima: string | null
  proxima: string | null
  situacao: Situacao
}
interface FichaControle extends Controle {
  evidencias: Array<{
    id: string
    realizadaEm: string
    descricao: string
    por: string | null
    anuladaEm: string | null
    motivoAnulacao: string | null
  }>
  automaticas: Array<{ data: string; descricao: string; link: string }>
}

const SITUACAO: Record<Situacao, { texto: string; tom: 'sucesso' | 'alerta' | 'erro' | 'neutro' }> =
  {
    em_dia: { texto: 'Em dia', tom: 'sucesso' },
    vence_logo: { texto: 'Vence logo', tom: 'alerta' },
    atrasado: { texto: 'Atrasado', tom: 'erro' },
    sob_demanda: { texto: 'Sob demanda', tom: 'neutro' },
    inativo: { texto: 'Inativo', tom: 'neutro' },
  }

const msg = (e: unknown) => (e instanceof ErroApi ? e.message : (e as Error).message)

export function ListaAutocontrole() {
  const { data: s } = useSessao()
  const navegar = useNavigate()
  const qc = useQueryClient()
  const [novo, setNovo] = useState(false)
  const [editando, setEditando] = useState<Controle | null>(null)
  const [inativar, setInativar] = useState<Controle | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const q = useQuery({
    queryKey: ['autocontrole'],
    queryFn: () =>
      api.get<{ controles: Controle[]; modelo: Array<{ codigo: string; nome: string }> }>(
        '/api/autocontrole',
      ),
  })
  const podePrograma = pode(s, 'gestao.autocontrole_programa', 'criar')
  const podeEditar = pode(s, 'gestao.autocontrole_programa', 'editar')
  const podeInativar = pode(s, 'gestao.autocontrole_programa', 'inativar')
  const atualizar = () => qc.invalidateQueries({ queryKey: ['autocontrole'] })
  const d = q.data
  return (
    <Pagina
      titulo="Autocontrole"
      trilha={['Gestão', 'Documentos']}
      acoes={
        podePrograma && (
          <Botao onClick={() => setNovo(true)}>
            <Plus /> Novo controle
          </Botao>
        )
      }
    >
      <p className="text-sm text-muted-foreground">
        O programa de autocontrole do estabelecimento (Decreto 12.709/2025, arts. 117 a 120): cada
        controle com a periodicidade, o responsável e as evidências. Tudo é configurável: inclua,
        altere ou inative controles e mude a periodicidade. A higienização de recipientes e as
        leituras de temperatura lançadas na cantina contam como evidência. Controle atrasado gera
        alerta.
      </p>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {d && d.modelo.length > 0 && podePrograma && (
        <Aviso tom="info">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {d.controles.length
                ? `Controles do modelo da norma que não estão no programa: ${d.modelo.map((m) => m.nome).join(', ')}.`
                : 'O programa ainda está vazio. Comece pelos controles da norma, com as periodicidades sugeridas, e ajuste depois.'}
            </span>
            <Botao
              variante="secundario"
              onClick={async () => {
                setErro(null)
                try {
                  await api.post('/api/autocontrole/modelo', {})
                  await qc.invalidateQueries({ queryKey: ['autocontrole'] })
                } catch (e) {
                  setErro(msg(e))
                }
              }}
            >
              {d.controles.length ? 'Incluir do modelo' : 'Criar o programa pelo modelo'}
            </Botao>
          </div>
        </Aviso>
      )}
      <Cartao>
        <CorpoCartao className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className="py-2 pl-5 pr-4 font-medium">Controle</th>
                <th className="py-2 pr-4 font-medium">Periodicidade</th>
                <th className="py-2 pr-4 font-medium">Responsável</th>
                <th className="py-2 pr-4 font-medium">Última</th>
                <th className="py-2 pr-4 font-medium">Próxima</th>
                <th className="py-2 pr-4 font-medium">Situação</th>
                <th className="w-px py-2 pr-5 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {d?.controles.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
                  onClick={() => navegar(`/gestao/autocontrole/${c.id}`)}
                >
                  <td className="py-2 pl-5 pr-4">
                    <Link to={`/gestao/autocontrole/${c.id}`} className="hover:underline">
                      {c.nome}
                    </Link>
                    {c.evidenciaAutomatica && (
                      <span className="block text-xs text-muted-foreground">
                        evidência automática
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {textoPeriodicidade(c.periodicidadeQuantidade, c.periodicidadeUnidade)}
                  </td>
                  <td className="py-2 pr-4">{c.responsavel ?? '—'}</td>
                  <td className="py-2 pr-4">{c.ultima ? formatarData(c.ultima) : '—'}</td>
                  <td className="py-2 pr-4">{c.proxima ? formatarData(c.proxima) : '—'}</td>
                  <td className="py-2 pr-4">
                    <Etiqueta tom={SITUACAO[c.situacao].tom}>{SITUACAO[c.situacao].texto}</Etiqueta>
                  </td>
                  <td className="whitespace-nowrap py-1 pr-5">
                    <AcoesLinha
                      ativo={c.ativo}
                      aoEditar={podeEditar ? () => setEditando(c) : undefined}
                      aoInativar={podeInativar ? () => setInativar(c) : undefined}
                      aoReativar={
                        podeInativar
                          ? async () => {
                              setErro(null)
                              try {
                                await api.post(`/api/autocontrole/${c.id}/reativar`, {})
                                await atualizar()
                              } catch (e) {
                                setErro(msg(e))
                              }
                            }
                          : undefined
                      }
                    />
                  </td>
                </tr>
              ))}
              {d && !d.controles.length && (
                <tr>
                  <td colSpan={7} className="px-5 py-4 text-center text-muted-foreground">
                    Nenhum controle no programa.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CorpoCartao>
      </Cartao>
      <DialogoControle
        aberto={novo}
        aoMudar={setNovo}
        aoSalvar={async (dados) => {
          const r = await api.post<{ id: string }>('/api/autocontrole', dados)
          await qc.invalidateQueries({ queryKey: ['autocontrole'] })
          navegar(`/gestao/autocontrole/${r.id}`)
        }}
      />
      {editando && (
        <DialogoControle
          key={editando.id}
          aberto
          aoMudar={(x) => !x && setEditando(null)}
          inicial={{
            nome: editando.nome,
            descricao: editando.descricao,
            periodicidadeQuantidade: editando.periodicidadeQuantidade,
            periodicidadeUnidade: editando.periodicidadeUnidade,
            responsavelId: editando.responsavelId,
            evidenciaAutomatica: editando.evidenciaAutomatica,
          }}
          aoSalvar={async (dados) => {
            await api.put(`/api/autocontrole/${editando.id}`, dados)
            await atualizar()
          }}
        />
      )}
      <PedirMotivo
        aberto={!!inativar}
        aoMudar={(x) => !x && setInativar(null)}
        titulo={`Inativar ${inativar?.nome ?? ''}`}
        descricao="Inativo, o controle sai da conta dos prazos e dos alertas. As evidências ficam guardadas."
        rotuloBotao="Inativar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/autocontrole/${inativar!.id}/inativar`, { motivo })
          await atualizar()
        }}
      />
    </Pagina>
  )
}

interface DadosControle {
  nome: string
  descricao: string | null
  periodicidadeQuantidade: number | null
  periodicidadeUnidade: UnidadePeriodicidade | null
  responsavelId: string | null
  evidenciaAutomatica: EvidenciaAutomatica | null
}

/** Incluir ou alterar um controle: nome, descrição, periodicidade, responsável e evidência automática. */
function DialogoControle({
  aberto,
  aoMudar,
  inicial,
  aoSalvar,
}: {
  aberto: boolean
  aoMudar: (v: boolean) => void
  inicial?: DadosControle
  aoSalvar: (d: DadosControle) => Promise<unknown>
}) {
  const vazio: DadosControle = {
    nome: '',
    descricao: null,
    periodicidadeQuantidade: 1,
    periodicidadeUnidade: 'mes',
    responsavelId: null,
    evidenciaAutomatica: null,
  }
  const [d, setD] = useState<DadosControle>(inicial ?? vazio)
  const [erro, setErro] = useState<string | null>(null)
  const responsaveis = useQuery({
    queryKey: ['autocontrole', 'responsaveis'],
    queryFn: () => api.get<Array<{ id: string; nome: string }>>('/api/autocontrole/responsaveis'),
    enabled: aberto,
  })
  const sobDemanda = d.periodicidadeQuantidade === null
  return (
    <Dialogo
      aberto={aberto}
      aoMudar={(v) => {
        aoMudar(v)
        if (!v) {
          setD(inicial ?? vazio)
          setErro(null)
        }
      }}
      titulo={inicial ? 'Alterar o controle' : 'Novo controle'}
      rodape={
        <>
          <Botao variante="secundario" onClick={() => aoMudar(false)}>
            Cancelar
          </Botao>
          <Botao
            disabled={d.nome.trim().length < 2}
            onClick={async () => {
              setErro(null)
              try {
                await aoSalvar(d)
                aoMudar(false)
              } catch (e) {
                setErro(msg(e))
              }
            }}
          >
            Salvar
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Campo rotulo="Nome" id="ac-nome" obrigatorio>
          <Entrada
            id="ac-nome"
            value={d.nome}
            onChange={(e) => setD({ ...d, nome: e.target.value })}
          />
        </Campo>
        <Campo rotulo="Descrição" id="ac-desc">
          <AreaTexto
            id="ac-desc"
            rows={3}
            value={d.descricao ?? ''}
            onChange={(e) => setD({ ...d, descricao: e.target.value || null })}
          />
        </Campo>
        <Campo rotulo="Periodicidade" id="ac-q">
          <div className="flex flex-wrap items-center gap-2">
            <Selecao
              aria-label="Tipo de periodicidade"
              className="w-40"
              value={sobDemanda ? 'demanda' : 'periodo'}
              onChange={(e) =>
                setD(
                  e.target.value === 'demanda'
                    ? { ...d, periodicidadeQuantidade: null, periodicidadeUnidade: null }
                    : { ...d, periodicidadeQuantidade: 1, periodicidadeUnidade: 'mes' },
                )
              }
            >
              <option value="periodo">A cada</option>
              <option value="demanda">Sob demanda</option>
            </Selecao>
            {!sobDemanda && (
              <>
                <Entrada
                  id="ac-q"
                  type="number"
                  min={1}
                  max={999}
                  className="w-24"
                  value={d.periodicidadeQuantidade ?? 1}
                  onChange={(e) =>
                    setD({ ...d, periodicidadeQuantidade: Math.max(1, Number(e.target.value)) })
                  }
                />
                <Selecao
                  aria-label="Unidade"
                  className="w-36"
                  value={d.periodicidadeUnidade ?? 'mes'}
                  onChange={(e) =>
                    setD({ ...d, periodicidadeUnidade: e.target.value as UnidadePeriodicidade })
                  }
                >
                  {CHAVES_UNIDADE_PERIODICIDADE.map((u) => (
                    <option key={u} value={u}>
                      {UNIDADES_PERIODICIDADE[u]}
                    </option>
                  ))}
                </Selecao>
              </>
            )}
          </div>
        </Campo>
        <Campo rotulo="Responsável" id="ac-resp">
          <Selecao
            id="ac-resp"
            value={d.responsavelId ?? ''}
            onChange={(e) => setD({ ...d, responsavelId: e.target.value || null })}
          >
            <option value="">Ninguém em especial</option>
            {responsaveis.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo
          rotulo="Evidência automática"
          id="ac-auto"
          ajuda="O que o sistema já registra conta como execução do controle."
        >
          <Selecao
            id="ac-auto"
            value={d.evidenciaAutomatica ?? ''}
            onChange={(e) =>
              setD({
                ...d,
                evidenciaAutomatica: (e.target.value || null) as EvidenciaAutomatica | null,
              })
            }
          >
            <option value="">Nenhuma (só manual)</option>
            {Object.entries(EVIDENCIAS_AUTOMATICAS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Selecao>
        </Campo>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </Dialogo>
  )
}

export function FichaAutocontrole() {
  const { id } = useParams()
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [inativando, setInativando] = useState(false)
  const [anulando, setAnulando] = useState<string | null>(null)
  const [anexosDe, setAnexosDe] = useState<string | null>(null)
  const [nova, setNova] = useState({ realizadaEm: hoje(fuso), descricao: '' })
  const [erro, setErro] = useState<string | null>(null)
  const q = useQuery({
    queryKey: ['autocontrole', id],
    queryFn: () => api.get<FichaControle>(`/api/autocontrole/${id}`),
  })
  const atualizar = () => qc.invalidateQueries({ queryKey: ['autocontrole'] })
  const c = q.data
  if (q.error) return <Aviso tom="erro">{msg(q.error)}</Aviso>
  if (!c) return null
  const podeEvidencia = c.ativo && pode(s, 'gestao.autocontrole', 'criar')
  return (
    <Pagina
      titulo={c.nome}
      trilha={['Gestão', 'Documentos', 'Autocontrole']}
      acoes={
        <>
          {pode(s, 'gestao.autocontrole_programa', 'editar') && (
            <Botao variante="secundario" onClick={() => setEditando(true)}>
              Alterar
            </Botao>
          )}
          {pode(s, 'gestao.autocontrole_programa', 'inativar') && (
            <AcoesLinha
              contorno
              ativo={c.ativo}
              aoInativar={() => setInativando(true)}
              aoReativar={async () => {
                await api.post(`/api/autocontrole/${c.id}/reativar`, {})
                await atualizar()
              }}
            />
          )}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Etiqueta tom={SITUACAO[c.situacao].tom}>{SITUACAO[c.situacao].texto}</Etiqueta>
        <span>{textoPeriodicidade(c.periodicidadeQuantidade, c.periodicidadeUnidade)}</span>
        <span className="text-muted-foreground">
          Última: {c.ultima ? formatarData(c.ultima) : 'nenhuma'} · Próxima:{' '}
          {c.proxima ? formatarData(c.proxima) : '—'} · Responsável: {c.responsavel ?? '—'}
        </span>
      </div>
      {c.descricao && <p className="text-sm text-muted-foreground">{c.descricao}</p>}
      {podeEvidencia && (
        <Cartao>
          <CabecalhoCartao
            titulo="Registrar evidência"
            descricao="O que foi feito e quando. Depois de registrar, anexe o certificado, a foto ou o laudo."
          />
          <CorpoCartao className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
              <Campo rotulo="Data" id="ev-data">
                <Entrada
                  id="ev-data"
                  type="date"
                  value={nova.realizadaEm}
                  max={hoje(fuso)}
                  onChange={(e) => setNova({ ...nova, realizadaEm: e.target.value })}
                />
              </Campo>
              <Campo rotulo="O que foi feito" id="ev-desc">
                <Entrada
                  id="ev-desc"
                  value={nova.descricao}
                  onChange={(e) => setNova({ ...nova, descricao: e.target.value })}
                />
              </Campo>
            </div>
            {erro && <Aviso tom="erro">{erro}</Aviso>}
            <div>
              <Botao
                disabled={nova.descricao.trim().length < 2 || !nova.realizadaEm}
                onClick={async () => {
                  setErro(null)
                  try {
                    const r = await api.post<{ id: string }>(
                      `/api/autocontrole/${c.id}/evidencias`,
                      nova,
                    )
                    setNova({ realizadaEm: hoje(fuso), descricao: '' })
                    setAnexosDe(r.id)
                    await atualizar()
                  } catch (e) {
                    setErro(msg(e))
                  }
                }}
              >
                Registrar
              </Botao>
            </div>
          </CorpoCartao>
        </Cartao>
      )}
      <Cartao>
        <CabecalhoCartao titulo="Evidências" />
        <CorpoCartao className="flex flex-col divide-y p-0 text-sm">
          {c.evidencias.map((v) => (
            <div key={v.id} className="flex flex-col gap-2 px-5 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium">{formatarData(v.realizadaEm)}</span>
                <span className={v.anuladaEm ? 'line-through text-muted-foreground' : ''}>
                  {v.descricao}
                </span>
                <span className="text-muted-foreground">{v.por}</span>
                <span className="ml-auto flex gap-2">
                  <Botao
                    variante="secundario"
                    onClick={() => setAnexosDe(anexosDe === v.id ? null : v.id)}
                  >
                    Anexos
                  </Botao>
                  {!v.anuladaEm && pode(s, 'gestao.autocontrole', 'estornar') && (
                    <Botao variante="secundario" onClick={() => setAnulando(v.id)}>
                      Anular
                    </Botao>
                  )}
                </span>
              </div>
              {v.anuladaEm && (
                <span className="text-xs text-muted-foreground">Anulada: {v.motivoAnulacao}</span>
              )}
              {anexosDe === v.id && (
                <Anexos
                  entidade="autocontrole_evidencia"
                  registroId={v.id}
                  podeAlterar={pode(s, 'gestao.autocontrole', 'criar')}
                  fuso={fuso}
                />
              )}
            </div>
          ))}
          {!c.evidencias.length && (
            <p className="px-5 py-4 text-center text-muted-foreground">
              Nenhuma evidência registrada à mão.
            </p>
          )}
        </CorpoCartao>
      </Cartao>
      {c.evidenciaAutomatica && (
        <Cartao>
          <CabecalhoCartao
            titulo="Evidências automáticas"
            descricao={`${EVIDENCIAS_AUTOMATICAS[c.evidenciaAutomatica]}: as mais recentes. O estorno da operação tira a evidência.`}
          />
          <CorpoCartao className="flex flex-col divide-y p-0 text-sm">
            {c.automaticas.map((a, i) => (
              <Link
                key={`${a.link}-${i}`}
                to={a.link}
                className="flex gap-3 px-5 py-2 hover:bg-muted/50"
              >
                <span className="font-medium">{formatarData(a.data)}</span>
                <span>{a.descricao}</span>
              </Link>
            ))}
            {!c.automaticas.length && (
              <p className="px-5 py-4 text-center text-muted-foreground">
                Nada registrado na cantina ainda.
              </p>
            )}
          </CorpoCartao>
        </Cartao>
      )}
      <DialogoControle
        key={`${c.id}-${editando}`}
        aberto={editando}
        aoMudar={setEditando}
        inicial={{
          nome: c.nome,
          descricao: c.descricao,
          periodicidadeQuantidade: c.periodicidadeQuantidade,
          periodicidadeUnidade: c.periodicidadeUnidade,
          responsavelId: c.responsavelId,
          evidenciaAutomatica: c.evidenciaAutomatica,
        }}
        aoSalvar={async (d) => {
          await api.put(`/api/autocontrole/${c.id}`, d)
          await atualizar()
        }}
      />
      <PedirMotivo
        aberto={inativando}
        aoMudar={setInativando}
        titulo="Inativar o controle"
        descricao="Inativo, o controle sai da conta dos prazos e dos alertas. As evidências ficam guardadas."
        rotuloBotao="Inativar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/autocontrole/${c.id}/inativar`, { motivo })
          setInativando(false)
          await atualizar()
        }}
      />
      <PedirMotivo
        aberto={!!anulando}
        aoMudar={(v) => !v && setAnulando(null)}
        titulo="Anular a evidência"
        descricao="A evidência anulada fica na lista, riscada, com o motivo; não conta mais para o prazo."
        rotuloBotao="Anular"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/autocontrole/${c.id}/evidencias/${anulando}/anular`, { motivo })
          setAnulando(null)
          await atualizar()
        }}
      />
    </Pagina>
  )
}

function hoje(fuso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(new Date())
}
