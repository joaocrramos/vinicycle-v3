// EnoTrace › Projetos de vinho (cantina.md, Projeto de vinho): lista, criação, ficha em abas,
// plano (previsto × executado) e modelos de plano com dias relativos.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type Composicao,
  dadosProjeto,
  formatarDecimal,
  SITUACOES_PROJETO,
  type SituacaoProjeto,
  TIPOS_OPERACAO,
  type TipoOperacao,
} from '@vinicycle/shared'
import { Plus, Trash2, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AcoesLinha } from '@/componentes/AcoesLinha'
import { Anexos } from '@/componentes/Anexos'
import { CampoNumero } from '@/componentes/campos-especiais'
import { Historico } from '@/componentes/Historico'
import { PedirMotivo } from '@/componentes/PedirMotivo'
import { type Coluna, TabelaDados } from '@/componentes/TabelaDados'
import { Aba, Abas, ConteudoAba, ListaAbas } from '@/componentes/ui/abas'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao'
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { Dialogo } from '@/componentes/ui/dialogo'
import { NotasDoDiario } from '@/paginas/gestao/Diario'
import { SimuladorCorte } from './Simulador'
import { Pagina } from '@/layout/Estrutura'
import { api } from '@/lib/api'
import { useFormulario } from '@/lib/formulario'
import { useReferencia } from '@/lib/referencia'
import { fusoAtivo, pode, useSessao } from '@/lib/sessao'
import { formatarData, formatarDataHora } from '@/lib/utils'
import { CartaoRotulo, OperacoesDe, type Rotulo } from './Lotes'
import { ResumoComposicao } from './operacoes/comum'

const F = 'enotrace.projetos'

const TOM_SITUACAO: Record<SituacaoProjeto, 'neutro' | 'sucesso' | 'alerta' | 'primario'> = {
  planejado: 'neutro',
  em_producao: 'primario',
  pronto_envase: 'alerta',
  envase_planejado: 'alerta',
  engarrafado: 'sucesso',
  encerrado: 'neutro',
  cancelado: 'neutro',
}

/** Operações que se planejam (sem estorno nem abertura de saldo). */
const TIPOS_PLANO = (Object.keys(TIPOS_OPERACAO) as TipoOperacao[]).filter(
  (t) => !['estorno', 'abertura_saldo'].includes(t),
)

export const litros = (v: string | number | null | undefined) =>
  `${formatarDecimal(String(v ?? 0), 2)} L`

export function useEnologos() {
  return useQuery({
    queryKey: ['enologos'],
    queryFn: async () => {
      const [a, b] = await Promise.all([
        api.get<Array<{ id: string; nome: string }>>(
          '/api/pessoas/opcoes?papel=responsavel_tecnico',
        ),
        api.get<Array<{ id: string; nome: string }>>('/api/pessoas/opcoes?papel=funcionario'),
      ])
      const vistos = new Set<string>()
      return [...a, ...b]
        .filter((p) => !vistos.has(p.id) && vistos.add(p.id))
        .sort((x, y) => x.nome.localeCompare(y.nome))
    },
  })
}

export function useVariedadesEmUso() {
  return useQuery({
    queryKey: ['variedades-em-uso'],
    queryFn: async () =>
      (
        await api.get<{ itens: Array<{ id: string; nome: string }> }>(
          '/api/catalogos/variedade?emUso=sim&tamanho=0',
        )
      ).itens,
  })
}

// Lista ----------------------------------------------------------------------------------------

interface LinhaProjeto {
  id: string
  codigo: string
  nome: string
  safraPrevista: number
  cicloPrevisto: string | null
  denominacao: string
  situacao: SituacaoProjeto
  volume: string
  etapas: string[]
  enologo: string | null
}

export function ListaProjetos() {
  const navegar = useNavigate()
  const { data: s } = useSessao()
  const colunas: Coluna<LinhaProjeto>[] = [
    {
      id: 'codigo',
      titulo: 'Código',
      ordenavel: true,
      celula: (p) => <strong>{p.codigo}</strong>,
      exportar: (p) => p.codigo,
    },
    {
      id: 'nome',
      titulo: 'Projeto',
      ordenavel: true,
      celula: (p) => (
        <span>
          {p.nome}
          {p.denominacao && (
            <span className="block text-xs text-muted-foreground">{p.denominacao}</span>
          )}
        </span>
      ),
      exportar: (p) => p.nome,
    },
    {
      id: 'safra',
      titulo: 'Safra',
      ordenavel: true,
      celula: (p) => `${p.safraPrevista}${p.cicloPrevisto ? `.${p.cicloPrevisto}` : ''}`,
      exportar: (p) => p.safraPrevista,
    },
    {
      id: 'etapas',
      titulo: 'Etapas dos lotes',
      celula: (p) => p.etapas.join(', ') || '—',
      exportar: (p) => p.etapas.join(', '),
    },
    {
      id: 'volume',
      titulo: 'Volume',
      className: 'text-right',
      celula: (p) => litros(p.volume),
      exportar: (p) => p.volume,
    },
    {
      id: 'enologo',
      titulo: 'Enólogo',
      celula: (p) => p.enologo ?? '—',
      exportar: (p) => p.enologo,
    },
    {
      id: 'situacao',
      titulo: 'Situação',
      ordenavel: true,
      celula: (p) => (
        <Etiqueta tom={TOM_SITUACAO[p.situacao]}>{SITUACOES_PROJETO[p.situacao]}</Etiqueta>
      ),
      exportar: (p) => SITUACOES_PROJETO[p.situacao],
    },
  ]

  return (
    <Pagina
      titulo="Projetos de vinho"
      trilha={['EnoTrace']}
      acoes={
        <div className="flex gap-2">
          <Botao variante="secundario" comoFilho>
            <Link to="/enotrace/modelos-plano">Modelos de plano</Link>
          </Botao>
          {pode(s, F, 'criar') && (
            <Botao onClick={() => navegar('/enotrace/projetos/novo')}>
              <Plus /> Novo projeto
            </Botao>
          )}
        </div>
      }
    >
      <p className="text-sm text-muted-foreground">
        O projeto é o vinho que se pretende fazer: recebe as uvas, contém os lotes e termina no
        engarrafamento.
      </p>
      <TabelaDados
        tabela="projetos"
        url="/api/projetos"
        ordemPadrao={{ campo: 'codigo', direcao: 'desc' }}
        filtrosIniciais={{ situacao: 'abertos' }}
        aoClicar={(p) => navegar(`/enotrace/projetos/${p.id}`)}
        podeExportar={pode(s, F, 'exportar')}
        filtros={(f, definir) => (
          <Selecao
            aria-label="Situação"
            className="w-44"
            value={f.situacao ?? 'abertos'}
            onChange={(e) => definir('situacao', e.target.value)}
          >
            <option value="abertos">Em aberto</option>
            {Object.entries(SITUACOES_PROJETO).map(([k, n]) => (
              <option key={k} value={k}>
                {n}
              </option>
            ))}
            <option value="todos">Todos</option>
          </Selecao>
        )}
        colunas={colunas}
      />
    </Pagina>
  )
}

// Formulário -----------------------------------------------------------------------------------

export const PROJETO_VAZIO = {
  nome: '',
  safraPrevista: new Date().getFullYear(),
  cicloPrevisto: null as string | null,
  classeProdutoId: null as string | null,
  cor: null as string | null,
  teorAcucar: null as string | null,
  metodoEspumante: null as string | null,
  teorAlcoolicoPretendido: null as string | null,
  volumePrevistoLitros: null as string | null,
  kgPrevistos: null as string | null,
  enologoId: null as string | null,
  variedades: [] as string[],
  observacoes: '',
  versao: undefined as number | undefined,
}

/** Campos do projeto; `rapido` mostra só o essencial (criação dentro da recepção). */
export function CamposProjeto({
  form,
  rapido,
}: {
  form: ReturnType<typeof useFormulario<typeof dadosProjeto, typeof PROJETO_VAZIO>>
  rapido?: boolean
}) {
  const { data: ref } = useReferencia()
  const enologos = useEnologos()
  const variedades = useVariedadesEmUso()
  const ciclos = useQuery({
    queryKey: ['parametros', '/api/cantina/ciclos'],
    queryFn: () => api.get<Array<{ numero: string; nome: string }>>('/api/cantina/ciclos'),
  })
  const v = form.valores
  const classe = ref?.classesProduto.find((c) => c.id === v.classeProdutoId)
  const lista = (nome: string) =>
    (ref?.listas[nome] ?? []).map((o) => (
      <option key={o.codigo} value={o.codigo}>
        {o.nome}
      </option>
    ))
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo rotulo="Nome" id="prj-nome" erro={form.erro('nome')} obrigatorio>
        <Entrada
          id="prj-nome"
          placeholder="Grenache 2026"
          value={v.nome}
          onChange={(e) => form.definir('nome', e.target.value)}
        />
      </Campo>
      <div className="grid grid-cols-2 gap-4">
        <Campo rotulo="Safra" id="prj-safra" erro={form.erro('safraPrevista')} obrigatorio>
          <Entrada
            id="prj-safra"
            inputMode="numeric"
            value={v.safraPrevista || ''}
            onChange={(e) =>
              form.definir('safraPrevista', Number(e.target.value.replace(/\D/g, '').slice(0, 4)))
            }
          />
        </Campo>
        <Campo
          rotulo="Ciclo"
          id="prj-ciclo"
          ajuda={ciclos.data?.length ? undefined : 'Um ciclo só.'}
        >
          <Selecao
            id="prj-ciclo"
            disabled={!ciclos.data?.length}
            value={v.cicloPrevisto ?? ''}
            onChange={(e) => form.definir('cicloPrevisto', e.target.value || null)}
          >
            <option value="">—</option>
            {ciclos.data?.map((c) => (
              <option key={c.numero} value={c.numero}>
                {c.numero} {c.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
      </div>
      <Campo rotulo="Classe" id="prj-classe" ajuda={classe?.fonte}>
        <Selecao
          id="prj-classe"
          value={v.classeProdutoId ?? ''}
          onChange={(e) => form.definir('classeProdutoId', e.target.value || null)}
        >
          <option value="">Escolha</option>
          {ref?.classesProduto.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Selecao>
      </Campo>
      <div className="grid grid-cols-2 gap-4">
        <Campo rotulo="Cor" id="prj-cor">
          <Selecao
            id="prj-cor"
            value={v.cor ?? ''}
            onChange={(e) => form.definir('cor', e.target.value || null)}
          >
            <option value="">—</option>
            {lista('cor_vinho')}
          </Selecao>
        </Campo>
        <Campo rotulo="Açúcar" id="prj-acucar">
          <Selecao
            id="prj-acucar"
            value={v.teorAcucar ?? ''}
            onChange={(e) => form.definir('teorAcucar', e.target.value || null)}
          >
            <option value="">—</option>
            {lista('teor_acucar')}
          </Selecao>
        </Campo>
      </div>
      {classe?.exigeMetodoEspumante && (
        <Campo rotulo="Método do espumante" id="prj-metodo">
          <Selecao
            id="prj-metodo"
            value={v.metodoEspumante ?? ''}
            onChange={(e) => form.definir('metodoEspumante', e.target.value || null)}
          >
            <option value="">Escolha</option>
            {lista('metodo_espumante')}
          </Selecao>
        </Campo>
      )}
      {!rapido && (
        <>
          <Campo rotulo="Teor alcoólico pretendido" id="prj-teor">
            <CampoNumero
              id="prj-teor"
              casas={1}
              unidade="% vol"
              valor={v.teorAlcoolicoPretendido}
              aoMudar={(x) => form.definir('teorAlcoolicoPretendido', x)}
            />
          </Campo>
          <div className="grid grid-cols-2 gap-4">
            <Campo rotulo="Volume previsto" id="prj-volume">
              <CampoNumero
                id="prj-volume"
                casas={2}
                unidade="L"
                valor={v.volumePrevistoLitros}
                aoMudar={(x) => form.definir('volumePrevistoLitros', x)}
              />
            </Campo>
            <Campo rotulo="Uva prevista" id="prj-kg">
              <CampoNumero
                id="prj-kg"
                casas={1}
                unidade="kg"
                valor={v.kgPrevistos}
                aoMudar={(x) => form.definir('kgPrevistos', x)}
              />
            </Campo>
          </div>
          <Campo
            rotulo="Enólogo responsável"
            id="prj-enologo"
            ajuda="Funcionário ou responsável técnico cadastrado em Pessoas."
          >
            <Selecao
              id="prj-enologo"
              value={v.enologoId ?? ''}
              onChange={(e) => form.definir('enologoId', e.target.value || null)}
            >
              <option value="">—</option>
              {enologos.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo
            rotulo="Variedades previstas"
            id="prj-variedades"
            ajuda="Sem percentual: o real é calculado pelos litros de cada origem."
          >
            <div className="flex flex-col gap-2">
              <Selecao
                id="prj-variedades"
                value=""
                onChange={(e) =>
                  e.target.value &&
                  form.definir('variedades', [...new Set([...v.variedades, e.target.value])])
                }
              >
                <option value="">Incluir variedade</option>
                {variedades.data
                  ?.filter((x) => !v.variedades.includes(x.id))
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nome}
                    </option>
                  ))}
              </Selecao>
              <div className="flex flex-wrap gap-1">
                {v.variedades.map((id) => (
                  <Etiqueta key={id} tom="primario">
                    {variedades.data?.find((x) => x.id === id)?.nome ?? '…'}
                    <button
                      type="button"
                      className="ml-1 cursor-pointer"
                      aria-label="Remover variedade"
                      onClick={() =>
                        form.definir(
                          'variedades',
                          v.variedades.filter((x) => x !== id),
                        )
                      }
                    >
                      <X className="size-3" />
                    </button>
                  </Etiqueta>
                ))}
              </div>
            </div>
          </Campo>
          <Campo rotulo="Observações" id="prj-obs" className="sm:col-span-2">
            <AreaTexto
              id="prj-obs"
              value={v.observacoes ?? ''}
              onChange={(e) => form.definir('observacoes', e.target.value)}
            />
          </Campo>
        </>
      )}
    </div>
  )
}

export function NovoProjeto() {
  const navegar = useNavigate()
  const form = useFormulario(dadosProjeto, PROJETO_VAZIO)
  return (
    <Pagina titulo="Novo projeto" trilha={['EnoTrace', 'Projetos de vinho']}>
      <Cartao>
        <CorpoCartao>
          <form
            noValidate
            className="flex flex-col gap-5"
            onSubmit={async (ev: FormEvent) => {
              ev.preventDefault()
              const d = form.validar()
              if (!d) return
              try {
                const r = await api.post<{ id: string }>('/api/projetos', d)
                navegar(`/enotrace/projetos/${r.id}`, { replace: true })
              } catch (e) {
                form.erroDaApi(e)
              }
            }}
          >
            {form.erroGeral && <Aviso tom="erro">{form.erroGeral}</Aviso>}
            <CamposProjeto form={form} />
            <p className="text-sm text-muted-foreground">
              O código (PRJ-safra-número) é dado ao salvar.
            </p>
            <div>
              <Botao type="submit">Salvar</Botao>
            </div>
          </form>
        </CorpoCartao>
      </Cartao>
    </Pagina>
  )
}

// Ficha ----------------------------------------------------------------------------------------

interface EtapaPlano {
  id: string
  tipoOperacao: TipoOperacao
  dataPrevista: string
  recipienteId: string | null
  recipiente: string | null
  observacao: string | null
  insumos: Array<{ itemEstoqueId: string; item: string; dose: string; unidade: string }>
  executadas: Array<{ id: string; codigo: string; executadoEm: string }>
}

interface Projeto {
  id: string
  codigo: string
  nome: string
  safraPrevista: number
  cicloPrevisto: string | null
  classeProdutoId: string | null
  cor: string | null
  teorAcucar: string | null
  metodoEspumante: string | null
  teorAlcoolicoPretendido: string | null
  volumePrevistoLitros: string | null
  kgPrevistos: string | null
  enologoId: string | null
  observacoes: string | null
  situacao: SituacaoProjeto
  situacaoDesde: string
  versao: number
  projetoOrigem: { id: string; codigo: string; nome: string } | null
  incorporadoAo: { id: string; codigo: string; nome: string } | null
  denominacao: string
  volume: string
  variedades: Array<{ id: string; nome: string }>
  lotes: Array<{
    id: string
    codigo: string
    etapa: string | null
    situacao: string
    titular: string | null
    rendimentoReal: string | null
    volume: string
    recipientes: Array<{ id: string; codigo: string; litros: string }>
  }>
  plano: EtapaPlano[]
}

function DialogoEtapa({
  projetoId,
  etapa,
  aoFechar,
}: {
  projetoId: string
  etapa: EtapaPlano | null
  aoFechar: () => void
}) {
  const qc = useQueryClient()
  const recipientes = useQuery({
    queryKey: ['recipientes-opcoes'],
    queryFn: async () =>
      (
        await api.get<{ itens: Array<{ id: string; codigo: string; tipo: string }> }>(
          '/api/recipientes?tamanho=0',
        )
      ).itens,
  })
  const insumos = useQuery({
    queryKey: ['insumos-opcoes'],
    queryFn: async () =>
      (
        await api.get<{ itens: Array<{ id: string; nome: string }> }>(
          '/api/itens-estoque?tamanho=0&tipo=insumo',
        )
      ).itens,
  })
  const [d, setD] = useState({
    tipoOperacao: etapa?.tipoOperacao ?? ('desengace' as TipoOperacao),
    dataPrevista: etapa?.dataPrevista ?? new Date().toISOString().slice(0, 10),
    recipienteId: etapa?.recipienteId ?? '',
    observacao: etapa?.observacao ?? '',
    insumos: (etapa?.insumos ?? []).map((i) => ({
      itemEstoqueId: i.itemEstoqueId,
      dose: i.dose as string | null,
      unidade: i.unidade,
    })),
  })
  const [erro, setErro] = useState<string | null>(null)
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo={etapa ? 'Etapa do plano' : 'Nova etapa do plano'}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            onClick={async () => {
              setErro(null)
              const corpo = {
                ...d,
                recipienteId: d.recipienteId || null,
                insumos: d.insumos.filter((i) => i.itemEstoqueId),
              }
              try {
                if (etapa) await api.put(`/api/projetos/${projetoId}/plano/${etapa.id}`, corpo)
                else await api.post(`/api/projetos/${projetoId}/plano`, corpo)
                await qc.invalidateQueries({ queryKey: ['projeto', projetoId] })
                aoFechar()
              } catch (e) {
                setErro((e as Error).message)
              }
            }}
          >
            Salvar
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Operação" id="etp-tipo">
            <Selecao
              id="etp-tipo"
              value={d.tipoOperacao}
              onChange={(e) => setD({ ...d, tipoOperacao: e.target.value as TipoOperacao })}
            >
              {TIPOS_PLANO.map((t) => (
                <option key={t} value={t}>
                  {TIPOS_OPERACAO[t]}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Data prevista" id="etp-data">
            <Entrada
              id="etp-data"
              type="date"
              value={d.dataPrevista}
              onChange={(e) => setD({ ...d, dataPrevista: e.target.value })}
            />
          </Campo>
          <Campo rotulo="Recipiente previsto" id="etp-recipiente">
            <Selecao
              id="etp-recipiente"
              value={d.recipienteId}
              onChange={(e) => setD({ ...d, recipienteId: e.target.value })}
            >
              <option value="">—</option>
              {recipientes.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.codigo} ({r.tipo})
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Observação" id="etp-obs">
            <Entrada
              id="etp-obs"
              value={d.observacao}
              onChange={(e) => setD({ ...d, observacao: e.target.value })}
            />
          </Campo>
        </div>
        <p className="text-sm font-medium">Insumos com dose prevista</p>
        {d.insumos.map((i, n) => (
          <div key={n} className="grid items-end gap-2 sm:grid-cols-[1fr_8rem_6rem_auto]">
            <Campo rotulo="Insumo" id={`etp-ins-${n}`}>
              <Selecao
                id={`etp-ins-${n}`}
                value={i.itemEstoqueId}
                onChange={(e) =>
                  setD({
                    ...d,
                    insumos: d.insumos.map((x, j) =>
                      j === n ? { ...x, itemEstoqueId: e.target.value } : x,
                    ),
                  })
                }
              >
                <option value="">Escolha</option>
                {insumos.data?.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Dose" id={`etp-dose-${n}`}>
              <CampoNumero
                id={`etp-dose-${n}`}
                casas={2}
                valor={i.dose}
                aoMudar={(x) =>
                  setD({
                    ...d,
                    insumos: d.insumos.map((y, j) => (j === n ? { ...y, dose: x } : y)),
                  })
                }
              />
            </Campo>
            <Campo rotulo="Unidade" id={`etp-un-${n}`}>
              <Entrada
                id={`etp-un-${n}`}
                value={i.unidade}
                onChange={(e) =>
                  setD({
                    ...d,
                    insumos: d.insumos.map((y, j) =>
                      j === n ? { ...y, unidade: e.target.value } : y,
                    ),
                  })
                }
              />
            </Campo>
            <Botao
              variante="fantasma"
              tamanho="icone"
              aria-label="Remover insumo"
              onClick={() => setD({ ...d, insumos: d.insumos.filter((_, j) => j !== n) })}
            >
              <Trash2 />
            </Botao>
          </div>
        ))}
        <div>
          <Botao
            variante="secundario"
            tamanho="pequeno"
            onClick={() =>
              setD({
                ...d,
                insumos: [...d.insumos, { itemEstoqueId: '', dose: null, unidade: 'g/hL' }],
              })
            }
          >
            <Plus /> Insumo
          </Botao>
        </div>
      </div>
    </Dialogo>
  )
}

function AbaPlano({ p, podeEditar }: { p: Projeto; podeEditar: boolean }) {
  const qc = useQueryClient()
  const [etapa, setEtapa] = useState<EtapaPlano | 'nova' | null>(null)
  const [aplicar, setAplicar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const hoje = new Date().toISOString().slice(0, 10)
  return (
    <div className="flex flex-col gap-3">
      {podeEditar && (
        <div className="flex flex-wrap gap-2">
          <Botao onClick={() => setEtapa('nova')}>
            <Plus /> Etapa
          </Botao>
          <Botao variante="secundario" onClick={() => setAplicar(true)}>
            Aplicar modelo de plano
          </Botao>
        </div>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Cartao>
        <ul className="divide-y">
          {p.plano.map((e) => {
            const atrasada = !e.executadas.length && e.dataPrevista < hoje
            return (
              <li
                key={e.id}
                className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm"
              >
                <button
                  type="button"
                  className="flex-1 cursor-pointer text-left"
                  disabled={!podeEditar}
                  onClick={() => setEtapa(e)}
                >
                  <span className="font-medium">{TIPOS_OPERACAO[e.tipoOperacao]}</span>{' '}
                  <span className="text-muted-foreground">
                    · {formatarData(e.dataPrevista)}
                    {e.recipiente && ` · ${e.recipiente}`}
                  </span>
                  {e.insumos.length > 0 && (
                    <span className="block text-xs text-muted-foreground">
                      {e.insumos
                        .map((i) => `${i.item} ${formatarDecimal(i.dose, 2)} ${i.unidade}`)
                        .join('; ')}
                    </span>
                  )}
                  {e.observacao && (
                    <span className="block text-xs text-muted-foreground">{e.observacao}</span>
                  )}
                </button>
                <span className="flex items-center gap-2">
                  {e.executadas.length ? (
                    <Etiqueta tom="sucesso">
                      Executada: {e.executadas.map((x) => x.codigo).join(', ')}
                    </Etiqueta>
                  ) : atrasada ? (
                    <Etiqueta tom="alerta">Atrasada</Etiqueta>
                  ) : (
                    <Etiqueta>Prevista</Etiqueta>
                  )}
                  {podeEditar && !e.executadas.length && (
                    <Botao
                      variante="fantasma"
                      tamanho="icone"
                      aria-label="Tirar etapa do plano"
                      onClick={async () => {
                        try {
                          await api.post(`/api/projetos/${p.id}/plano/${e.id}/excluir`)
                          await qc.invalidateQueries({ queryKey: ['projeto', p.id] })
                        } catch (x) {
                          setErro((x as Error).message)
                        }
                      }}
                    >
                      <Trash2 />
                    </Botao>
                  )}
                </span>
              </li>
            )
          })}
          {!p.plano.length && (
            <li className="px-5 py-6 text-sm text-muted-foreground">
              Sem plano. Inclua etapas ou aplique um modelo (dia 0 = desengace).
            </li>
          )}
        </ul>
      </Cartao>
      {etapa && (
        <DialogoEtapa
          projetoId={p.id}
          etapa={etapa === 'nova' ? null : etapa}
          aoFechar={() => setEtapa(null)}
        />
      )}
      {aplicar && <AplicarModelo projetoId={p.id} aoFechar={() => setAplicar(false)} />}
    </div>
  )
}

function AplicarModelo({ projetoId, aoFechar }: { projetoId: string; aoFechar: () => void }) {
  const qc = useQueryClient()
  const modelos = useQuery({
    queryKey: ['modelos-plano'],
    queryFn: () => api.get<ModeloPlano[]>('/api/modelos-plano'),
  })
  const [modeloId, setModeloId] = useState('')
  const [dia0, setDia0] = useState(new Date().toISOString().slice(0, 10))
  const [erro, setErro] = useState<string | null>(null)
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo="Aplicar modelo de plano"
      descricao="As etapas do modelo entram no plano com as datas contadas a partir do dia 0 (desengace)."
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            disabled={!modeloId}
            onClick={async () => {
              try {
                await api.post(`/api/projetos/${projetoId}/plano/modelo`, {
                  modeloId,
                  dataDia0: dia0,
                })
                await qc.invalidateQueries({ queryKey: ['projeto', projetoId] })
                aoFechar()
              } catch (e) {
                setErro((e as Error).message)
              }
            }}
          >
            Aplicar
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <Campo
          rotulo="Modelo"
          id="apl-modelo"
          ajuda={
            modelos.data && !modelos.data.length
              ? 'Cadastre um modelo em Projetos › Modelos de plano.'
              : undefined
          }
        >
          <Selecao id="apl-modelo" value={modeloId} onChange={(e) => setModeloId(e.target.value)}>
            <option value="">Escolha</option>
            {modelos.data
              ?.filter((m) => m.ativo)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome} ({m.etapas.length} etapas)
                </option>
              ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Data do dia 0" id="apl-dia0">
          <Entrada
            id="apl-dia0"
            type="date"
            value={dia0}
            onChange={(e) => setDia0(e.target.value)}
          />
        </Campo>
      </div>
    </Dialogo>
  )
}

function AbaResumo({ p, podeEditar }: { p: Projeto; podeEditar: boolean }) {
  const qc = useQueryClient()
  const composicao = useQuery({
    queryKey: ['projeto-composicao', p.id, p.volume],
    queryFn: () =>
      api.get<{ composicao: Composicao; rotulo: Rotulo }>(`/api/projetos/${p.id}/composicao`),
  })
  const { data: ref } = useReferencia()
  const etapas = ref?.listas.etapa_producao ?? []
  const nomeEtapa = (c: string | null) => etapas.find((e) => e.codigo === c)?.nome ?? c ?? '—'
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Cartao>
          <CorpoCartao>
            <p className="text-xs text-muted-foreground">Volume atual</p>
            <p className="text-2xl font-semibold">{litros(p.volume)}</p>
          </CorpoCartao>
        </Cartao>
        <Cartao>
          <CorpoCartao>
            <p className="text-xs text-muted-foreground">Lotes</p>
            <p className="text-2xl font-semibold">
              {p.lotes.filter((l) => l.situacao === 'ativo').length}
            </p>
          </CorpoCartao>
        </Cartao>
        <Cartao>
          <CorpoCartao>
            <p className="text-xs text-muted-foreground">Variedades previstas</p>
            <p className="text-sm">{p.variedades.map((v) => v.nome).join(', ') || '—'}</p>
          </CorpoCartao>
        </Cartao>
      </div>
      {composicao.data && Number(p.volume) > 0 && (
        <>
          <Cartao>
            <CabecalhoCartao
              titulo="Composição real"
              descricao="Calculada pelos litros de cada origem; safra e ciclo reais saem dela."
            />
            <CorpoCartao className="text-sm">
              <ResumoComposicao c={composicao.data.composicao} />
            </CorpoCartao>
          </Cartao>
          <CartaoRotulo rotulo={composicao.data.rotulo} />
        </>
      )}
      <Cartao>
        <CabecalhoCartao
          titulo="Lotes de produção"
          descricao="Cada lote tem a sua etapa, mudada pelo enólogo."
        />
        <ul className="divide-y">
          {p.lotes.map((l) => (
            <li
              key={l.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
            >
              <span>
                <Link className="font-semibold underline" to={`/enotrace/lotes/${l.id}`}>
                  {l.codigo}
                </Link>{' '}
                <span className="text-muted-foreground">
                  · {litros(l.volume)}
                  {l.recipientes.length > 0 &&
                    ` em ${l.recipientes.map((r) => r.codigo).join(', ')}`}
                  {l.titular && ` · titular ${l.titular}`}
                  {l.rendimentoReal && ` · rendimento ${formatarDecimal(l.rendimentoReal, 2)} L/kg`}
                </span>
              </span>
              {podeEditar && l.situacao === 'ativo' ? (
                <Selecao
                  aria-label={`Etapa do lote ${l.codigo}`}
                  className="w-48"
                  value={l.etapa ?? ''}
                  onChange={async (e) => {
                    await api.post(`/api/lotes/${l.id}/etapa`, { etapa: e.target.value })
                    await qc.invalidateQueries({ queryKey: ['projeto', p.id] })
                  }}
                >
                  <option value="" disabled>
                    Etapa
                  </option>
                  {etapas.map((e) => (
                    <option key={e.codigo} value={e.codigo}>
                      {e.nome}
                    </option>
                  ))}
                </Selecao>
              ) : (
                <Etiqueta>{l.situacao === 'ativo' ? nomeEtapa(l.etapa) : 'Sem saldo'}</Etiqueta>
              )}
            </li>
          ))}
          {!p.lotes.length && (
            <li className="px-5 py-6 text-sm text-muted-foreground">
              Os lotes nascem no desengace ou na prensagem da uva recebida.
            </li>
          )}
        </ul>
      </Cartao>
    </div>
  )
}

function AbaDados({
  p,
  podeEditar,
  aoSalvar,
}: {
  p: Projeto
  podeEditar: boolean
  aoSalvar: () => Promise<void>
}) {
  const inicial: typeof PROJETO_VAZIO = {
    nome: p.nome,
    safraPrevista: p.safraPrevista,
    cicloPrevisto: p.cicloPrevisto,
    classeProdutoId: p.classeProdutoId,
    cor: p.cor,
    teorAcucar: p.teorAcucar,
    metodoEspumante: p.metodoEspumante,
    teorAlcoolicoPretendido: p.teorAlcoolicoPretendido,
    volumePrevistoLitros: p.volumePrevistoLitros,
    kgPrevistos: p.kgPrevistos,
    enologoId: p.enologoId,
    variedades: p.variedades.map((v) => v.id),
    observacoes: p.observacoes ?? '',
    versao: p.versao,
  }
  const form = useFormulario(dadosProjeto, inicial)
  return (
    <Cartao>
      <CorpoCartao>
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={async (ev: FormEvent) => {
            ev.preventDefault()
            const d = form.validar()
            if (!d) return
            try {
              await api.put(`/api/projetos/${p.id}`, d)
              await aoSalvar()
            } catch (e) {
              form.erroDaApi(e)
            }
          }}
        >
          {form.erroGeral && <Aviso tom="erro">{form.erroGeral}</Aviso>}
          <fieldset disabled={!podeEditar || p.situacao === 'cancelado'}>
            <CamposProjeto form={form} />
          </fieldset>
          {podeEditar && p.situacao !== 'cancelado' && (
            <div>
              <Botao type="submit">Salvar</Botao>
            </div>
          )}
        </form>
      </CorpoCartao>
    </Cartao>
  )
}

export function FichaProjeto() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const { data: s } = useSessao()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['projeto', id],
    queryFn: () => api.get<Projeto>(`/api/projetos/${id}`),
  })
  const [motivo, setMotivo] = useState<'cancelado' | 'encerrado' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const podeEditar = pode(s, F, 'editar')
  if (!q.data)
    return (
      <p className="text-sm text-muted-foreground">
        {q.isError ? (q.error as Error).message : 'Carregando…'}
      </p>
    )
  const p = q.data
  const recarregar = async () => {
    await qc.invalidateQueries({ queryKey: ['projeto', id] })
  }
  const mudar = async (situacao: string, m?: string) => {
    setErro(null)
    try {
      await api.post(`/api/projetos/${id}/situacao`, { situacao, motivo: m })
      await recarregar()
    } catch (e) {
      setErro((e as Error).message)
    }
  }
  const aberto = !['encerrado', 'cancelado'].includes(p.situacao)
  return (
    <Pagina
      titulo={`${p.codigo} · ${p.nome}`}
      trilha={['EnoTrace', 'Projetos de vinho']}
      acoes={
        podeEditar &&
        aberto && (
          <div className="flex flex-wrap gap-2">
            {p.situacao === 'em_producao' && (
              <Botao variante="secundario" onClick={() => mudar('pronto_envase')}>
                Pronto para envase
              </Botao>
            )}
            {p.situacao === 'pronto_envase' && (
              <Botao variante="secundario" onClick={() => mudar('em_producao')}>
                Voltar para produção
              </Botao>
            )}
            {['pronto_envase', 'envase_planejado'].includes(p.situacao) && (
              <Botao onClick={() => navegar(`/enotrace/engarrafamento/nova?projeto=${p.id}`)}>
                Planejar envase
              </Botao>
            )}
            <Botao
              variante="secundario"
              onClick={() => setMotivo(p.situacao === 'planejado' ? 'cancelado' : 'encerrado')}
            >
              {p.situacao === 'planejado' ? 'Cancelar projeto' : 'Encerrar'}
            </Botao>
          </div>
        )
      }
    >
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Etiqueta tom={TOM_SITUACAO[p.situacao]}>{SITUACOES_PROJETO[p.situacao]}</Etiqueta>
        {p.denominacao && <span>{p.denominacao}</span>}
        <span>
          · safra {p.safraPrevista}
          {p.cicloPrevisto && `.${p.cicloPrevisto}`}
        </span>
        <span>
          ·{' '}
          <Link className="underline" to={`/enotrace/historia?projeto=${p.id}`}>
            história do projeto
          </Link>
        </span>
        {p.projetoOrigem && (
          <span>
            · projeto de origem{' '}
            <Link className="underline" to={`/enotrace/projetos/${p.projetoOrigem.id}`}>
              {p.projetoOrigem.codigo} · {p.projetoOrigem.nome}
            </Link>
          </span>
        )}
        {p.incorporadoAo && (
          <span>
            · incorporado ao projeto{' '}
            <Link className="underline" to={`/enotrace/projetos/${p.incorporadoAo.id}`}>
              {p.incorporadoAo.codigo} · {p.incorporadoAo.nome}
            </Link>
          </span>
        )}
      </p>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Abas defaultValue="resumo">
        <ListaAbas>
          <Aba value="resumo">Resumo</Aba>
          <Aba value="dados">Dados</Aba>
          <Aba value="plano">Plano</Aba>
          <Aba value="recepcoes">Recepções</Aba>
          <Aba value="operacoes">Operações</Aba>
          <Aba value="simulacoes">Simulações de corte</Aba>
          <Aba value="diario">Diário</Aba>
          <Aba value="anexos">Anexos</Aba>
          <Aba value="historico">Histórico</Aba>
        </ListaAbas>
        <ConteudoAba value="resumo">
          <AbaResumo p={p} podeEditar={podeEditar} />
        </ConteudoAba>
        <ConteudoAba value="dados">
          <AbaDados key={p.versao} p={p} podeEditar={podeEditar} aoSalvar={recarregar} />
        </ConteudoAba>
        <ConteudoAba value="plano">
          <AbaPlano p={p} podeEditar={podeEditar && aberto} />
        </ConteudoAba>
        <ConteudoAba value="recepcoes">
          <TabelaRomaneiosProjeto
            projetoId={id}
            fuso={fusoAtivo(s)}
            aoClicar={(rId) => navegar(`/enotrace/recepcao/${rId}`)}
          />
        </ConteudoAba>
        <ConteudoAba value="operacoes">
          <OperacoesDe
            filtro={`projeto=${id}`}
            aoClicar={(o) => navegar(`/enotrace/operacoes/${o}`)}
          />
        </ConteudoAba>
        <ConteudoAba value="simulacoes">
          <SimuladorCorte projetoId={id} />
        </ConteudoAba>
        <ConteudoAba value="diario">
          <NotasDoDiario
            filtro={{ projeto: id }}
            vinculo={{ projetoId: id }}
            titulo="Notas do diário"
          />
        </ConteudoAba>
        <ConteudoAba value="anexos">
          <Anexos entidade="projeto" registroId={id} podeAlterar={podeEditar} fuso={fusoAtivo(s)} />
        </ConteudoAba>
        <ConteudoAba value="historico">
          <Historico entidade="projeto" registroId={id} fuso={fusoAtivo(s)} />
        </ConteudoAba>
      </Abas>
      <PedirMotivo
        aberto={!!motivo}
        aoMudar={(x) => !x && setMotivo(null)}
        titulo={motivo === 'cancelado' ? `Cancelar ${p.codigo}` : `Encerrar ${p.codigo}`}
        descricao={
          motivo === 'cancelado'
            ? 'Só projeto sem nenhum movimento pode ser cancelado. Ele não é apagado.'
            : 'Encerre depois que todo o vinho tiver sido engarrafado ou cortado.'
        }
        rotuloBotao={motivo === 'cancelado' ? 'Cancelar projeto' : 'Encerrar'}
        aoConfirmar={(m) => mudar(motivo!, m)}
      />
    </Pagina>
  )
}

interface LinhaRomaneioProjeto {
  id: string
  codigo: string | null
  chegadaEm: string
  variedades: string[]
  kg: string
  aProcessar: string
}

function TabelaRomaneiosProjeto({
  projetoId,
  fuso,
  aoClicar,
}: {
  projetoId: string
  fuso: string
  aoClicar: (id: string) => void
}) {
  const colunas: Coluna<LinhaRomaneioProjeto>[] = [
    { id: 'codigo', titulo: 'Romaneio', celula: (r) => r.codigo ?? 'Rascunho' },
    {
      id: 'chegadaEm',
      titulo: 'Chegada',
      ordenavel: true,
      celula: (r) => formatarDataHora(r.chegadaEm, fuso),
    },
    { id: 'variedades', titulo: 'Variedades', celula: (r) => r.variedades.join(', ') },
    {
      id: 'kg',
      titulo: 'Peso',
      className: 'text-right',
      celula: (r) => `${formatarDecimal(r.kg, 1)} kg`,
    },
    {
      id: 'aProcessar',
      titulo: 'A processar',
      className: 'text-right',
      celula: (r) => `${formatarDecimal(r.aProcessar, 1)} kg`,
    },
  ]
  return (
    <TabelaDados
      tabela="romaneios-projeto"
      url={`/api/romaneios?projeto=${projetoId}`}
      ordemPadrao={{ campo: 'chegadaEm', direcao: 'desc' }}
      aoClicar={(r) => aoClicar(r.id)}
      colunas={colunas}
    />
  )
}

// Modelos de plano -----------------------------------------------------------------------------

interface ModeloPlano {
  id: string
  nome: string
  descricao: string | null
  ativo: boolean
  versao: number
  etapas: Array<{
    tipoOperacao: TipoOperacao
    diaRelativo: number
    observacao: string | null
    insumos: Array<{ itemEstoqueId: string; item: string; dose: string; unidade: string }>
  }>
}

function DialogoModelo({ modelo, aoFechar }: { modelo: ModeloPlano | null; aoFechar: () => void }) {
  const qc = useQueryClient()
  const [nome, setNome] = useState(modelo?.nome ?? '')
  const [descricao, setDescricao] = useState(modelo?.descricao ?? '')
  const [etapas, setEtapas] = useState(
    (modelo?.etapas ?? []).map((e) => ({
      tipoOperacao: e.tipoOperacao,
      diaRelativo: e.diaRelativo,
      observacao: e.observacao ?? '',
      insumos: e.insumos.map((i) => ({
        itemEstoqueId: i.itemEstoqueId,
        dose: i.dose,
        unidade: i.unidade,
      })),
    })),
  )
  const [erro, setErro] = useState<string | null>(null)
  const muda = (n: number, parcial: Partial<(typeof etapas)[number]>) =>
    setEtapas(etapas.map((e, j) => (j === n ? { ...e, ...parcial } : e)))
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo={modelo ? modelo.nome : 'Novo modelo de plano'}
      descricao="Dias contados a partir do dia 0 (desengace). Os insumos com dose do modelo são editados no plano de cada projeto."
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            onClick={async () => {
              setErro(null)
              const corpo = { nome, descricao, etapas, versao: modelo?.versao }
              try {
                if (modelo) await api.put(`/api/modelos-plano/${modelo.id}`, corpo)
                else await api.post('/api/modelos-plano', corpo)
                await qc.invalidateQueries({ queryKey: ['modelos-plano'] })
                aoFechar()
              } catch (e) {
                setErro((e as Error).message)
              }
            }}
          >
            Salvar
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <Campo rotulo="Nome" id="mod-nome" obrigatorio>
          <Entrada
            id="mod-nome"
            placeholder="Tinto de guarda padrão"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </Campo>
        <Campo rotulo="Descrição" id="mod-desc">
          <Entrada id="mod-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </Campo>
        {etapas.map((e, n) => (
          <div key={n} className="grid items-end gap-2 sm:grid-cols-[6rem_1fr_1fr_auto]">
            <Campo rotulo="Dia" id={`mod-dia-${n}`}>
              <Entrada
                id={`mod-dia-${n}`}
                inputMode="numeric"
                value={e.diaRelativo}
                onChange={(x) =>
                  muda(n, { diaRelativo: Number(x.target.value.replace(/[^\d-]/g, '')) || 0 })
                }
              />
            </Campo>
            <Campo rotulo="Operação" id={`mod-tipo-${n}`}>
              <Selecao
                id={`mod-tipo-${n}`}
                value={e.tipoOperacao}
                onChange={(x) => muda(n, { tipoOperacao: x.target.value as TipoOperacao })}
              >
                {TIPOS_PLANO.map((t) => (
                  <option key={t} value={t}>
                    {TIPOS_OPERACAO[t]}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Observação" id={`mod-obs-${n}`}>
              <Entrada
                id={`mod-obs-${n}`}
                value={e.observacao}
                onChange={(x) => muda(n, { observacao: x.target.value })}
              />
            </Campo>
            <Botao
              variante="fantasma"
              tamanho="icone"
              aria-label="Remover etapa"
              onClick={() => setEtapas(etapas.filter((_, j) => j !== n))}
            >
              <Trash2 />
            </Botao>
          </div>
        ))}
        <div>
          <Botao
            variante="secundario"
            tamanho="pequeno"
            onClick={() =>
              setEtapas([
                ...etapas,
                {
                  tipoOperacao: 'trasfega',
                  diaRelativo: (etapas.at(-1)?.diaRelativo ?? 0) + 7,
                  observacao: '',
                  insumos: [],
                },
              ])
            }
          >
            <Plus /> Etapa
          </Botao>
        </div>
      </div>
    </Dialogo>
  )
}

export function PaginaModelosPlano() {
  const { data: s } = useSessao()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['modelos-plano'],
    queryFn: () => api.get<ModeloPlano[]>('/api/modelos-plano'),
  })
  const [editando, setEditando] = useState<ModeloPlano | 'novo' | null>(null)
  const [inativar, setInativar] = useState<ModeloPlano | null>(null)
  return (
    <Pagina
      titulo="Modelos de plano"
      trilha={['EnoTrace', 'Projetos de vinho']}
      acoes={
        pode(s, F, 'criar') && (
          <Botao onClick={() => setEditando('novo')}>
            <Plus /> Novo modelo
          </Botao>
        )
      }
    >
      <p className="text-sm text-muted-foreground">
        Roteiros reutilizáveis com datas relativas: dia 0 = desengace, dia 21 = 1ª trasfega… Ao
        aplicar num projeto, informe a data do dia 0.
      </p>
      {q.data?.map((m) => (
        <Cartao key={m.id}>
          <CabecalhoCartao
            titulo={
              <span className="flex items-center gap-2">
                {m.nome} {!m.ativo && <Etiqueta>Inativo</Etiqueta>}
              </span>
            }
            descricao={m.descricao ?? undefined}
            acoes={
              pode(s, F, 'editar') && (
                <AcoesLinha
                  ativo={m.ativo}
                  aoEditar={() => setEditando(m)}
                  aoInativar={() => setInativar(m)}
                  aoReativar={async () => {
                    await api.post(`/api/modelos-plano/${m.id}/reativar`)
                    await qc.invalidateQueries({ queryKey: ['modelos-plano'] })
                  }}
                />
              )
            }
          />
          <CorpoCartao className="text-sm">
            {m.etapas.length ? (
              <ol className="flex flex-col gap-1">
                {m.etapas.map((e, n) => (
                  <li key={n}>
                    <span className="inline-block w-16 text-muted-foreground">
                      dia {e.diaRelativo}
                    </span>
                    {TIPOS_OPERACAO[e.tipoOperacao]}
                    {e.observacao && (
                      <span className="text-muted-foreground"> · {e.observacao}</span>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted-foreground">Sem etapas.</p>
            )}
          </CorpoCartao>
        </Cartao>
      ))}
      {q.data && !q.data.length && (
        <p className="text-sm text-muted-foreground">Nenhum modelo ainda.</p>
      )}
      {editando && (
        <DialogoModelo
          modelo={editando === 'novo' ? null : editando}
          aoFechar={() => setEditando(null)}
        />
      )}
      <PedirMotivo
        aberto={!!inativar}
        aoMudar={(x) => !x && setInativar(null)}
        titulo={`Inativar ${inativar?.nome ?? ''}`}
        rotuloBotao="Inativar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/modelos-plano/${inativar!.id}/inativar`, { motivo })
          await qc.invalidateQueries({ queryKey: ['modelos-plano'] })
        }}
      />
    </Pagina>
  )
}
