// Gestão › Pessoas (P2; gestao.md): cadastro único com papéis.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  dadosPessoa,
  formatarDocumento,
  NOMES_PAPEL,
  NOMES_SITUACAO_SIVIBE,
  SITUACOES_SIVIBE,
  type CodigoPapel,
} from '@vinicycle/shared'
import { Plus, Trash2 } from 'lucide-react'
import { type FormEvent, type ReactNode, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AcoesLinha, colunaAcoes } from '@/componentes/AcoesLinha'
import { Anexos } from '@/componentes/Anexos'
import { CampoTelefone } from '@/componentes/campos-especiais'
import { FICHA_VAZIA_PJ, FichaCadastral } from '@/componentes/FichaCadastral'
import { Historico } from '@/componentes/Historico'
import { PedirMotivo } from '@/componentes/PedirMotivo'
import { TabelaDados } from '@/componentes/TabelaDados'
import { Aba, Abas, ConteudoAba, ListaAbas } from '@/componentes/ui/abas'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao'
import { AreaTexto, Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { Pagina } from '@/layout/Estrutura'
import { api } from '@/lib/api'
import { type Formulario, useFormulario } from '@/lib/formulario'
import { useReferencia } from '@/lib/referencia'
import { fusoAtivo, pode, useSessao } from '@/lib/sessao'
import { formatarTelefone } from '@vinicycle/shared'

interface Linha {
  id: string
  nome: string
  nomeFantasia: string | null
  tipoPessoa: string
  documento: string | null
  ativo: boolean
  papeis: CodigoPapel[]
  municipio: string | null
  email: string | null
  telefone: string | null
}

function documentoFormatado(tipo: string, doc: string | null) {
  if (!doc) return '—'
  return tipo === 'fisica'
    ? formatarDocumento('cpf', doc)
    : tipo === 'juridica'
      ? formatarDocumento('cnpj', doc)
      : doc
}

export function ListaPessoas() {
  const navegar = useNavigate()
  const { data: s } = useSessao()
  const qc = useQueryClient()
  const [inativar, setInativar] = useState<Linha | null>(null)
  const podeInativar = pode(s, 'gestao.pessoas', 'inativar')
  const { data: ref } = useReferencia()
  return (
    <Pagina
      titulo="Pessoas"
      trilha={['Gestão']}
      acoes={
        <>
          <Botao comoFilho variante="secundario">
            <Link to="/gestao/listas/cargo">Cargos</Link>
          </Botao>
          <Botao comoFilho variante="secundario">
            <Link to="/gestao/listas/categoria_fornecimento">Categorias de fornecimento</Link>
          </Botao>
          {pode(s, 'gestao.pessoas', 'criar') && (
            <Botao onClick={() => navegar('/gestao/pessoas/nova')}>
              <Plus /> Nova pessoa
            </Botao>
          )}
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        Clientes, fornecedores, produtores de uva, funcionários, laboratórios, responsáveis
        técnicos… Quem tem mais de um papel é cadastrado uma vez só.
      </p>
      <TabelaDados
        tabela="pessoas"
        url="/api/pessoas"
        ordemPadrao={{ campo: 'nome', direcao: 'asc' }}
        filtrosIniciais={{ situacao: 'ativos' }}
        podeExportar={pode(s, 'gestao.pessoas', 'exportar')}
        aoClicar={(p) => navegar(`/gestao/pessoas/${p.id}`)}
        filtros={(f, definir) => (
          <>
            <Selecao
              aria-label="Papel"
              className="w-52"
              value={f.papel ?? ''}
              onChange={(e) => definir('papel', e.target.value)}
            >
              <option value="">Todos os papéis</option>
              {ref?.papeis.map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {p.nome}
                </option>
              ))}
            </Selecao>
            <Selecao
              aria-label="Situação"
              className="w-32"
              value={f.situacao ?? 'ativos'}
              onChange={(e) => definir('situacao', e.target.value)}
            >
              <option value="ativos">Ativas</option>
              <option value="inativos">Inativas</option>
              <option value="todos">Todas</option>
            </Selecao>
          </>
        )}
        colunas={[
          {
            id: 'nome',
            titulo: 'Nome',
            ordenavel: true,
            celula: (p) => (
              <span>
                {p.nome}
                {p.nomeFantasia && (
                  <span className="block text-xs text-muted-foreground">{p.nomeFantasia}</span>
                )}
              </span>
            ),
            exportar: (p) => p.nome,
          },
          {
            id: 'documento',
            titulo: 'CPF/CNPJ',
            ordenavel: true,
            celula: (p) => documentoFormatado(p.tipoPessoa, p.documento),
            exportar: (p) => p.documento,
          },
          {
            id: 'papeis',
            titulo: 'Papéis',
            celula: (p) => (
              <div className="flex flex-wrap gap-1">
                {p.papeis.map((x) => (
                  <Etiqueta key={x} tom="primario">
                    {NOMES_PAPEL[x]}
                  </Etiqueta>
                ))}
              </div>
            ),
            exportar: (p) => p.papeis.map((x) => NOMES_PAPEL[x]).join(', '),
          },
          {
            id: 'municipio',
            titulo: 'Município',
            celula: (p) => p.municipio ?? '—',
            exportar: (p) => p.municipio,
          },
          {
            id: 'contato',
            titulo: 'Contato',
            celula: (p) => (
              <span className="text-xs">
                {p.email}
                {p.telefone && <span className="block">{formatarTelefone(p.telefone)}</span>}
              </span>
            ),
            exportar: (p) => [p.email, p.telefone].filter(Boolean).join(' '),
          },
          {
            id: 'ativo',
            titulo: 'Situação',
            celula: (p) => (
              <Etiqueta tom={p.ativo ? 'sucesso' : 'neutro'}>
                {p.ativo ? 'Ativa' : 'Inativa'}
              </Etiqueta>
            ),
          },
          colunaAcoes<Linha>((p) => (
            <AcoesLinha
              ativo={p.ativo}
              aoEditar={
                pode(s, 'gestao.pessoas', 'editar')
                  ? () => navegar(`/gestao/pessoas/${p.id}`)
                  : undefined
              }
              aoInativar={podeInativar ? () => setInativar(p) : undefined}
              aoReativar={
                podeInativar
                  ? async () => {
                      await api.post(`/api/pessoas/${p.id}/reativar`)
                      await qc.invalidateQueries({ queryKey: ['lista', '/api/pessoas'] })
                    }
                  : undefined
              }
            />
          )),
        ]}
      />
      <PedirMotivo
        aberto={!!inativar}
        aoMudar={(x) => !x && setInativar(null)}
        titulo={`Inativar ${inativar?.nome ?? ''}`}
        descricao="A pessoa deixa de aparecer em registros novos; os antigos continuam com ela (P26)."
        rotuloBotao="Inativar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/pessoas/${inativar!.id}/inativar`, { motivo })
          await qc.invalidateQueries({ queryKey: ['lista', '/api/pessoas'] })
        }}
      />
    </Pagina>
  )
}

const VAZIA = {
  ficha: { ...FICHA_VAZIA_PJ },
  papeis: [] as CodigoPapel[],
  cliente: { condicoesComerciais: '' },
  fornecedor: { categorias: [] as string[] },
  produtorUva: {
    numeroSivibe: '',
    situacaoCadastro: 'nao_verificado',
    declaracaoAnoAnterior: null as boolean | null,
    conferidoEm: '',
  },
  funcionario: { cargo: '', situacao: 'ativo' },
  laboratorio: {
    credenciamentoMapa: '',
    credenciamentoValidade: '',
    prazoMedioLaudoDias: null as number | null,
  },
  rt: { conselho: '', numeroRegistro: '', artNumero: '', artValidade: '' },
  fabricante: { marcas: [] as string[] },
  transportador: { placas: [] as string[] },
  contatos: [] as Array<{ nome: string; cargo: string; emails: string[]; telefones: string[] }>,
  versao: undefined as number | undefined,
}

/** Lista de textos com incluir e remover (marcas, placas). */
function ListaTextos({
  valores,
  aoMudar,
  rotulo,
  placeholder,
}: {
  valores: string[]
  aoMudar: (v: string[]) => void
  rotulo: string
  placeholder: string
}) {
  const [novo, setNovo] = useState('')
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{rotulo}</span>
      <div className="flex flex-wrap gap-2">
        {valores.map((v, i) => (
          <span
            key={v + i}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm"
          >
            {v}
            <button
              type="button"
              aria-label={`Remover ${v}`}
              className="cursor-pointer"
              onClick={() => aoMudar(valores.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-3.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Entrada
          className="max-w-xs"
          placeholder={placeholder}
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && novo.trim()) {
              e.preventDefault()
              aoMudar([...valores, novo.trim()])
              setNovo('')
            }
          }}
        />
        <Botao
          variante="secundario"
          disabled={!novo.trim()}
          onClick={() => {
            aoMudar([...valores, novo.trim()])
            setNovo('')
          }}
        >
          Incluir
        </Botao>
      </div>
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-md border p-4">
      <legend className="px-1 text-sm font-semibold">{titulo}</legend>
      {children}
    </fieldset>
  )
}

function CamposPapeis({ form }: { form: Formulario }) {
  const { data: ref } = useReferencia()
  const papeis = (form.valor('papeis') as CodigoPapel[]) ?? []
  const tem = (p: CodigoPapel) => papeis.includes(p)
  const valor = (c: string) => (form.valor(c) as string | null) ?? ''
  const texto = (c: string, props: Record<string, unknown> = {}) => (
    <Entrada
      id={c}
      value={valor(c)}
      onChange={(e) => form.definir(c, e.target.value || null)}
      onBlur={() => form.tocar(c)}
      {...props}
    />
  )
  const lista = (nome: string) => ref?.listas[nome] ?? []
  const pj = form.valor('ficha.tipoPessoa') === 'juridica'
  const contatos = (form.valor('contatos') as typeof VAZIA.contatos) ?? []

  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Papéis</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {ref?.papeis.map((p) => (
            <Caixa
              key={p.codigo}
              rotulo={p.nome}
              checked={tem(p.codigo as CodigoPapel)}
              onChange={(e) =>
                form.definir(
                  'papeis',
                  e.target.checked ? [...papeis, p.codigo] : papeis.filter((x) => x !== p.codigo),
                )
              }
            />
          ))}
        </div>
        {form.erro('papeis') && (
          <p className="mt-1 text-xs text-destructive">{form.erro('papeis')}</p>
        )}
      </fieldset>

      {tem('produtor_uva') && (
        <Secao titulo="Produtor de uva">
          <div className="grid gap-4 sm:grid-cols-4">
            <Campo rotulo="Número no SIVIBE" id="produtorUva.numeroSivibe">
              {texto('produtorUva.numeroSivibe')}
            </Campo>
            <Campo
              rotulo="Situação do cadastro vitícola"
              id="produtorUva.situacaoCadastro"
              ajuda="Irregular gera alerta na recepção (Decreto 12.709/2025, art. 203)."
            >
              <Selecao
                id="produtorUva.situacaoCadastro"
                value={valor('produtorUva.situacaoCadastro')}
                onChange={(e) => form.definir('produtorUva.situacaoCadastro', e.target.value)}
              >
                {SITUACOES_SIVIBE.map((x) => (
                  <option key={x} value={x}>
                    {NOMES_SITUACAO_SIVIBE[x]}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Declaração do ano anterior" id="produtorUva.declaracaoAnoAnterior">
              <Selecao
                id="produtorUva.declaracaoAnoAnterior"
                value={
                  form.valor('produtorUva.declaracaoAnoAnterior') === null ||
                  form.valor('produtorUva.declaracaoAnoAnterior') === undefined
                    ? ''
                    : form.valor('produtorUva.declaracaoAnoAnterior')
                      ? 'sim'
                      : 'nao'
                }
                onChange={(e) =>
                  form.definir(
                    'produtorUva.declaracaoAnoAnterior',
                    e.target.value === '' ? null : e.target.value === 'sim',
                  )
                }
              >
                <option value="">Não verificado</option>
                <option value="sim">Entregue</option>
                <option value="nao">Não entregue</option>
              </Selecao>
            </Campo>
            <Campo rotulo="Conferido em" id="produtorUva.conferidoEm">
              {texto('produtorUva.conferidoEm', { type: 'date' })}
            </Campo>
          </div>
          <p className="text-xs text-muted-foreground">
            As propriedades e parcelas do produtor entram com a recepção da uva, no ciclo 3.
          </p>
        </Secao>
      )}

      {tem('fornecedor') && (
        <Secao titulo="Fornecedor">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {lista('categoria_fornecimento').map((o) => {
              const atuais = (form.valor('fornecedor.categorias') as string[]) ?? []
              return (
                <Caixa
                  key={o.codigo}
                  rotulo={o.nome}
                  checked={atuais.includes(o.codigo)}
                  onChange={(e) =>
                    form.definir(
                      'fornecedor.categorias',
                      e.target.checked
                        ? [...atuais, o.codigo]
                        : atuais.filter((x) => x !== o.codigo),
                    )
                  }
                />
              )
            })}
          </div>
        </Secao>
      )}

      {tem('fabricante') && (
        <Secao titulo="Fabricante">
          <ListaTextos
            rotulo="Marcas (usadas no cadastro de insumos)"
            placeholder="Nome da marca"
            valores={(form.valor('fabricante.marcas') as string[]) ?? []}
            aoMudar={(v) => form.definir('fabricante.marcas', v)}
          />
        </Secao>
      )}

      {tem('cliente') && (
        <Secao titulo="Cliente">
          <Campo rotulo="Condições comerciais" id="cliente.condicoesComerciais">
            <AreaTexto
              id="cliente.condicoesComerciais"
              value={valor('cliente.condicoesComerciais')}
              onChange={(e) => form.definir('cliente.condicoesComerciais', e.target.value)}
            />
          </Campo>
        </Secao>
      )}

      {tem('funcionario') && (
        <Secao titulo="Funcionário">
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Cargo" id="funcionario.cargo">
              <Selecao
                id="funcionario.cargo"
                value={valor('funcionario.cargo')}
                onChange={(e) => form.definir('funcionario.cargo', e.target.value || null)}
              >
                <option value="">Escolha</option>
                {lista('cargo').map((o) => (
                  <option key={o.codigo} value={o.codigo}>
                    {o.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Situação" id="funcionario.situacao">
              <Selecao
                id="funcionario.situacao"
                value={valor('funcionario.situacao') || 'ativo'}
                onChange={(e) => form.definir('funcionario.situacao', e.target.value)}
              >
                <option value="ativo">Ativo</option>
                <option value="afastado">Afastado</option>
                <option value="desligado">Desligado</option>
              </Selecao>
            </Campo>
          </div>
          <p className="text-xs text-muted-foreground">
            O funcionário aparece em "executado por" nas operações, mesmo sem acesso ao sistema.
          </p>
        </Secao>
      )}

      {tem('transportador') && (
        <Secao titulo="Transportador">
          <ListaTextos
            rotulo="Placas"
            placeholder="ABC1D23"
            valores={(form.valor('transportador.placas') as string[]) ?? []}
            aoMudar={(v) => form.definir('transportador.placas', v)}
          />
          {form.erro('transportador.placas.0') && (
            <p className="text-xs text-destructive">{form.erro('transportador.placas.0')}</p>
          )}
        </Secao>
      )}

      {tem('laboratorio') && (
        <Secao titulo="Laboratório">
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Credenciamento no MAPA" id="laboratorio.credenciamentoMapa">
              {texto('laboratorio.credenciamentoMapa')}
            </Campo>
            <Campo rotulo="Validade do credenciamento" id="laboratorio.credenciamentoValidade">
              {texto('laboratorio.credenciamentoValidade', { type: 'date' })}
            </Campo>
            <Campo rotulo="Prazo médio do laudo (dias)" id="laboratorio.prazoMedioLaudoDias">
              <Entrada
                id="laboratorio.prazoMedioLaudoDias"
                type="number"
                min={0}
                value={(form.valor('laboratorio.prazoMedioLaudoDias') as number | null) ?? ''}
                onChange={(e) =>
                  form.definir(
                    'laboratorio.prazoMedioLaudoDias',
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
              />
            </Campo>
          </div>
        </Secao>
      )}

      {tem('responsavel_tecnico') && (
        <Secao titulo="Responsável técnico">
          <div className="grid gap-4 sm:grid-cols-4">
            <Campo rotulo="Conselho" id="rt.conselho">
              <Selecao
                id="rt.conselho"
                value={valor('rt.conselho')}
                onChange={(e) => form.definir('rt.conselho', e.target.value || null)}
              >
                <option value="">Escolha</option>
                {lista('conselho_profissional').map((o) => (
                  <option key={o.codigo} value={o.codigo}>
                    {o.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Número de registro" id="rt.numeroRegistro">
              {texto('rt.numeroRegistro')}
            </Campo>
            <Campo rotulo="ART/AFT" id="rt.artNumero">
              {texto('rt.artNumero')}
            </Campo>
            <Campo rotulo="Validade da ART/AFT" id="rt.artValidade">
              {texto('rt.artValidade', { type: 'date' })}
            </Campo>
          </div>
        </Secao>
      )}

      {pj && (
        <Secao titulo="Pessoas de contato">
          {contatos.map((ct, i) => (
            <div key={i} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
              <Campo rotulo="Nome" id={`contatos.${i}.nome`} erro={form.erro(`contatos.${i}.nome`)}>
                <Entrada
                  id={`contatos.${i}.nome`}
                  value={ct.nome}
                  onChange={(e) => form.definir(`contatos.${i}.nome`, e.target.value)}
                />
              </Campo>
              <Campo rotulo="Cargo" id={`contatos.${i}.cargo`}>
                <Entrada
                  id={`contatos.${i}.cargo`}
                  value={ct.cargo ?? ''}
                  onChange={(e) => form.definir(`contatos.${i}.cargo`, e.target.value)}
                />
              </Campo>
              <Campo
                rotulo="E-mail"
                id={`contatos.${i}.email`}
                erro={form.erro(`contatos.${i}.emails.0`)}
              >
                <Entrada
                  id={`contatos.${i}.email`}
                  type="email"
                  value={ct.emails[0] ?? ''}
                  onChange={(e) =>
                    form.definir(`contatos.${i}.emails`, e.target.value ? [e.target.value] : [])
                  }
                />
              </Campo>
              <Campo rotulo="Telefone" id={`contatos.${i}.tel`}>
                <CampoTelefone
                  id={`contatos.${i}.tel`}
                  valor={ct.telefones[0] ?? ''}
                  aoMudar={(v) => form.definir(`contatos.${i}.telefones`, v ? [v] : [])}
                />
              </Campo>
              <Botao
                variante="fantasma"
                tamanho="icone"
                aria-label="Remover contato"
                onClick={() =>
                  form.definir(
                    'contatos',
                    contatos.filter((_, j) => j !== i),
                  )
                }
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
                form.definir('contatos', [
                  ...contatos,
                  { nome: '', cargo: '', emails: [], telefones: [] },
                ])
              }
            >
              <Plus /> Pessoa de contato
            </Botao>
          </div>
        </Secao>
      )}
    </div>
  )
}

function FormularioPessoa({
  inicial,
  aoSalvar,
  somenteLeitura,
}: {
  inicial: typeof VAZIA
  aoSalvar: (d: unknown) => Promise<void>
  somenteLeitura?: boolean
}) {
  const form = useFormulario(dadosPessoa, inicial)
  const [enviando, setEnviando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  async function enviar(ev: FormEvent) {
    ev.preventDefault()
    setSalvo(false)
    const d = form.validar()
    if (!d) return
    setEnviando(true)
    try {
      await aoSalvar(d)
      setSalvo(true)
    } catch (e) {
      form.erroDaApi(e)
    } finally {
      setEnviando(false)
    }
  }
  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-6">
      {form.erroGeral && <Aviso tom="erro">{form.erroGeral}</Aviso>}
      {salvo && <Aviso tom="sucesso">Dados salvos.</Aviso>}
      <fieldset disabled={somenteLeitura} className="flex flex-col gap-6">
        <FichaCadastral
          form={form}
          documentoObrigatorio
          tiposPermitidos={['juridica', 'fisica', 'estrangeira']}
        />
        <CamposPapeis form={form} />
      </fieldset>
      {!somenteLeitura && (
        <div>
          <Botao type="submit" disabled={enviando}>
            {enviando ? 'Salvando…' : 'Salvar'}
          </Botao>
        </div>
      )}
    </form>
  )
}

/** Mistura os dados lidos com os vazios, para todos os campos existirem no formulário. */
function comVazios(p: Partial<typeof VAZIA>): typeof VAZIA {
  const r = { ...VAZIA } as Record<string, unknown>
  for (const [k, v] of Object.entries(p)) {
    const base = r[k]
    r[k] =
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      base &&
      typeof base === 'object' &&
      !Array.isArray(base)
        ? { ...base, ...v }
        : (v ?? base)
  }
  return r as typeof VAZIA
}

export function NovaPessoa() {
  const navegar = useNavigate()
  return (
    <Pagina titulo="Nova pessoa" trilha={['Gestão', 'Pessoas']}>
      <Cartao>
        <CorpoCartao>
          <FormularioPessoa
            inicial={VAZIA}
            aoSalvar={async (d) => {
              const r = await api.post<{ id: string }>('/api/pessoas', d)
              navegar(`/gestao/pessoas/${r.id}`, { replace: true })
            }}
          />
        </CorpoCartao>
      </Cartao>
    </Pagina>
  )
}

export function FichaPessoa() {
  const { id = '' } = useParams()
  const { data: s } = useSessao()
  const qc = useQueryClient()
  const [inativar, setInativar] = useState(false)
  const q = useQuery({
    queryKey: ['pessoa', id],
    queryFn: () =>
      api.get<
        typeof VAZIA & { id: string; ativo: boolean; versao: number; ficha: { nome: string } }
      >(`/api/pessoas/${id}`),
  })
  const podeEditar = pode(s, 'gestao.pessoas', 'editar')
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>
  if (q.isError) return <Aviso tom="erro">{(q.error as Error).message}</Aviso>
  const p = q.data!
  const recarregar = async () => {
    await qc.invalidateQueries({ queryKey: ['pessoa', id] })
    await qc.invalidateQueries({ queryKey: ['historico', 'pessoa', id] })
  }
  return (
    <Pagina
      titulo={p.ficha.nome}
      trilha={['Gestão', 'Pessoas']}
      acoes={
        pode(s, 'gestao.pessoas', 'inativar') && (
          <AcoesLinha
            contorno
            ativo={p.ativo}
            aoInativar={() => setInativar(true)}
            aoReativar={async () => {
              await api.post(`/api/pessoas/${id}/reativar`)
              await recarregar()
            }}
          />
        )
      }
    >
      {!p.ativo && <Aviso tom="alerta">Pessoa inativa: não aparece em registros novos.</Aviso>}
      <Abas defaultValue="dados">
        <ListaAbas>
          <Aba value="dados">Dados</Aba>
          <Aba value="anexos">Anexos</Aba>
          <Aba value="historico">Histórico</Aba>
        </ListaAbas>
        <ConteudoAba value="dados">
          <Cartao>
            <CabecalhoCartao
              titulo={p.papeis.map((x) => NOMES_PAPEL[x]).join(' · ') || 'Sem papel'}
            />
            <CorpoCartao>
              <FormularioPessoa
                key={p.versao}
                inicial={comVazios(p)}
                somenteLeitura={!podeEditar}
                aoSalvar={async (d) => {
                  await api.put(`/api/pessoas/${id}`, d)
                  await recarregar()
                }}
              />
            </CorpoCartao>
          </Cartao>
        </ConteudoAba>
        <ConteudoAba value="anexos">
          <Anexos entidade="pessoa" registroId={id} podeAlterar={podeEditar} fuso={fusoAtivo(s)} />
        </ConteudoAba>
        <ConteudoAba value="historico">
          <Historico entidade="pessoa" registroId={id} fuso={fusoAtivo(s)} />
        </ConteudoAba>
      </Abas>
      <PedirMotivo
        aberto={inativar}
        aoMudar={setInativar}
        titulo={`Inativar ${p.ficha.nome}`}
        descricao="A pessoa deixa de aparecer em registros novos; os antigos continuam com ela (P26)."
        rotuloBotao="Inativar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/pessoas/${id}/inativar`, { motivo })
          await recarregar()
        }}
      />
    </Pagina>
  )
}
