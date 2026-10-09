// Configurações › Estabelecimentos (P12) e criação obrigatória no primeiro acesso
// (administracao.md, Fluxo, passo 4).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ATIVIDADES_MAPA,
  dadosEstabelecimento,
  FORMAS_REGISTRO,
  formatarDecimal,
  formatarDocumento,
  FUSO_POR_UF,
  FUSOS_BRASIL,
  NOMES_ATIVIDADE_MAPA,
  NOMES_FORMA_REGISTRO,
  NOMES_ORIGEM_UVA,
  ORIGENS_UVA,
} from '@vinicycle/shared'
import { Plus } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { AcoesLinha, colunaAcoes } from '@/componentes/AcoesLinha'
import { Anexos } from '@/componentes/Anexos'
import { CampoNumero } from '@/componentes/campos-especiais'
import { FICHA_VAZIA_PJ, FichaCadastral } from '@/componentes/FichaCadastral'
import { Historico } from '@/componentes/Historico'
import { PedirMotivo } from '@/componentes/PedirMotivo'
import { TabelaDados } from '@/componentes/TabelaDados'
import { Aba, Abas, ConteudoAba, ListaAbas } from '@/componentes/ui/abas'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao'
import { Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { Pagina } from '@/layout/Estrutura'
import { api } from '@/lib/api'
import { useFormulario } from '@/lib/formulario'
import { useReferencia } from '@/lib/referencia'
import { type EstadoSessao, fusoAtivo, pode, useAtualizarSessao, useSessao } from '@/lib/sessao'
import { formatarData } from '@/lib/utils'

interface Linha {
  id: string
  nome: string
  nomeFantasia: string | null
  tipoPessoa: string
  documento: string | null
  registroMapa: string | null
  registroMapaValidade: string | null
  capacidadeLitros: string | null
  municipio: string | null
  ativo: boolean
}

export function ListaEstabelecimentos() {
  const navegar = useNavigate()
  const { data: s } = useSessao()
  const qc = useQueryClient()
  const [inativar, setInativar] = useState<Linha | null>(null)
  const podeInativar = pode(s, 'gestao.config.estabelecimentos', 'inativar')
  const recarregar = async () => {
    await qc.invalidateQueries({ queryKey: ['lista', '/api/estabelecimentos'] })
    await qc.invalidateQueries({ queryKey: ['sessao'] })
  }
  return (
    <Pagina
      titulo="Estabelecimentos"
      trilha={['Configurações']}
      acoes={
        pode(s, 'gestao.config.estabelecimentos', 'criar') && (
          <Botao onClick={() => navegar('/config/estabelecimentos/novo')}>
            <Plus /> Novo estabelecimento
          </Botao>
        )
      }
    >
      <TabelaDados<Linha>
        tabela="estabelecimentos"
        url="/api/estabelecimentos"
        ordemPadrao={{ campo: 'nome', direcao: 'asc' }}
        filtrosIniciais={{ situacao: 'ativos' }}
        podeExportar={pode(s, 'gestao.config.estabelecimentos', 'exportar')}
        filtros={(f, definir) => (
          <Selecao
            aria-label="Situação"
            className="w-36"
            value={f.situacao ?? 'ativos'}
            onChange={(e) => definir('situacao', e.target.value)}
          >
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
            <option value="todos">Todos</option>
          </Selecao>
        )}
        aoClicar={(e) => navegar(`/config/estabelecimentos/${e.id}`)}
        colunas={[
          {
            id: 'nome',
            titulo: 'Nome',
            ordenavel: true,
            celula: (e) => e.nomeFantasia || e.nome,
            exportar: (e) => e.nome,
          },
          {
            id: 'documento',
            titulo: 'CNPJ/CPF',
            ordenavel: true,
            celula: (e) =>
              e.documento
                ? formatarDocumento(e.tipoPessoa === 'fisica' ? 'cpf' : 'cnpj', e.documento)
                : '—',
            exportar: (e) => e.documento,
          },
          {
            id: 'municipio',
            titulo: 'Município',
            celula: (e) => e.municipio ?? '—',
            exportar: (e) => e.municipio,
          },
          {
            id: 'registroMapa',
            titulo: 'Registro MAPA',
            celula: (e) => e.registroMapa ?? '—',
            exportar: (e) => e.registroMapa,
          },
          {
            id: 'registroMapaValidade',
            titulo: 'Validade do registro',
            ordenavel: true,
            celula: (e) => formatarData(e.registroMapaValidade) || '—',
            exportar: (e) => e.registroMapaValidade,
          },
          {
            id: 'capacidadeLitros',
            titulo: 'Capacidade',
            ordenavel: true,
            className: 'text-right',
            celula: (e) =>
              e.capacidadeLitros ? `${formatarDecimal(e.capacidadeLitros, 2)} L` : '—',
            exportar: (e) => e.capacidadeLitros,
          },
          {
            id: 'ativo',
            titulo: 'Situação',
            celula: (e) => (
              <Etiqueta tom={e.ativo ? 'sucesso' : 'neutro'}>
                {e.ativo ? 'Ativo' : 'Inativo'}
              </Etiqueta>
            ),
          },
          colunaAcoes<Linha>((e) => (
            <AcoesLinha
              ativo={e.ativo}
              aoEditar={
                pode(s, 'gestao.config.estabelecimentos', 'editar')
                  ? () => navegar(`/config/estabelecimentos/${e.id}`)
                  : undefined
              }
              aoInativar={podeInativar ? () => setInativar(e) : undefined}
              aoReativar={
                podeInativar
                  ? async () => {
                      await api.post(`/api/estabelecimentos/${e.id}/reativar`)
                      await recarregar()
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
        titulo={`Inativar ${inativar ? inativar.nomeFantasia || inativar.nome : ''}`}
        descricao="O estabelecimento deixa de aparecer nos registros novos; o que já existe continua guardado."
        rotuloBotao="Inativar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/estabelecimentos/${inativar!.id}/inativar`, { motivo })
          await recarregar()
        }}
      />
    </Pagina>
  )
}

const VAZIO = {
  ficha: {
    ...FICHA_VAZIA_PJ,
    enderecos: [
      {
        rotulo: 'principal',
        cep: '',
        logradouro: '',
        numero: '',
        complemento: '',
        bairro: '',
        municipio: '',
        codigoIbge: null,
        uf: '',
        principal: true,
      },
    ],
  },
  registroMapa: '',
  registroMapaValidade: null as string | null,
  capacidadeLitros: null as string | null,
  fuso: 'America/Sao_Paulo' as (typeof FUSOS_BRASIL)[number],
  origemUva: null as (typeof ORIGENS_UVA)[number] | null,
  atividadesMapa: [] as Array<(typeof ATIVIDADES_MAPA)[number]>,
  temManualBpf: null as boolean | null,
  manualBpfRevisao: null as string | null,
  formaRegistroAtual: null as (typeof FORMAS_REGISTRO)[number] | null,
  responsavelTecnicoId: null as string | null,
  igs: [] as string[],
  produtosElaborados: [] as string[],
  versao: undefined as number | undefined,
}

function FormularioEstabelecimento({
  inicial,
  aoSalvar,
  rotuloBotao,
  somenteLeitura,
}: {
  inicial: typeof VAZIO
  aoSalvar: (d: unknown) => Promise<void>
  rotuloBotao: string
  somenteLeitura?: boolean
}) {
  const form = useFormulario(dadosEstabelecimento, inicial)
  const [enviando, setEnviando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const v = form.valores as typeof VAZIO
  const enderecoPrincipal = v.ficha.enderecos.find((e) => e.principal) ?? v.ficha.enderecos[0]
  const uf = enderecoPrincipal?.uf
  const { data: ref } = useReferencia()
  const rts = useQuery({
    queryKey: ['pessoas-opcoes', 'responsavel_tecnico'],
    queryFn: () =>
      api.get<Array<{ id: string; nome: string }>>('/api/pessoas/opcoes?papel=responsavel_tecnico'),
  })
  // IG cujo território não inclui o município do estabelecimento: alerta, não bloqueia (P29).
  const igsForaDaArea = (ref?.igs ?? []).filter(
    (ig) =>
      v.igs.includes(ig.id) &&
      enderecoPrincipal?.codigoIbge &&
      !ig.municipiosIbge.includes(enderecoPrincipal.codigoIbge),
  )

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
        <FichaCadastral form={form} documentoObrigatorio />
        <h3 className="font-semibold">Dados regulatórios</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Registro no MAPA" id="registroMapa">
            <Entrada
              id="registroMapa"
              value={v.registroMapa ?? ''}
              onChange={(e) => form.definir('registroMapa', e.target.value || null)}
            />
          </Campo>
          <Campo
            rotulo="Validade do registro"
            id="registroMapaValidade"
            erro={form.erro('registroMapaValidade')}
          >
            <Entrada
              id="registroMapaValidade"
              type="date"
              value={v.registroMapaValidade ?? ''}
              onChange={(e) => form.definir('registroMapaValidade', e.target.value || null)}
            />
          </Campo>
          <Campo rotulo="Capacidade de armazenamento" id="capacidadeLitros">
            <CampoNumero
              id="capacidadeLitros"
              casas={2}
              unidade="L"
              valor={v.capacidadeLitros}
              aoMudar={(x) => form.definir('capacidadeLitros', x)}
            />
          </Campo>
          <Campo
            rotulo="Fuso horário"
            id="fuso"
            ajuda={
              uf && FUSO_POR_UF[uf] !== v.fuso
                ? `Sugestão para ${uf}: ${FUSO_POR_UF[uf]}`
                : 'Datas e horas aparecem neste fuso (P18).'
            }
          >
            <Selecao
              id="fuso"
              value={v.fuso}
              onChange={(e) => form.definir('fuso', e.target.value)}
            >
              {FUSOS_BRASIL.map((f) => (
                <option key={f} value={f}>
                  {f.replace('America/', '').replace('_', ' ')}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Origem da uva" id="origemUva">
            <Selecao
              id="origemUva"
              value={v.origemUva ?? ''}
              onChange={(e) => form.definir('origemUva', e.target.value || null)}
            >
              <option value="">Não informada</option>
              {ORIGENS_UVA.map((o) => (
                <option key={o} value={o}>
                  {NOMES_ORIGEM_UVA[o]}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo
            rotulo="Forma atual de registro"
            id="formaRegistroAtual"
            ajuda="Define o roteiro da carga inicial."
          >
            <Selecao
              id="formaRegistroAtual"
              value={v.formaRegistroAtual ?? ''}
              onChange={(e) => form.definir('formaRegistroAtual', e.target.value || null)}
            >
              <option value="">Não informada</option>
              {FORMAS_REGISTRO.map((o) => (
                <option key={o} value={o}>
                  {NOMES_FORMA_REGISTRO[o]}
                </option>
              ))}
            </Selecao>
          </Campo>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Atividades registradas no MAPA</legend>
          <div className="flex flex-wrap gap-4">
            {ATIVIDADES_MAPA.map((a) => (
              <Caixa
                key={a}
                rotulo={NOMES_ATIVIDADE_MAPA[a]}
                checked={v.atividadesMapa.includes(a)}
                onChange={(e) =>
                  form.definir(
                    'atividadesMapa',
                    e.target.checked
                      ? [...v.atividadesMapa, a]
                      : v.atividadesMapa.filter((x) => x !== a),
                  )
                }
              />
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Tem Manual de Boas Práticas?" id="temManualBpf">
            <Selecao
              id="temManualBpf"
              value={v.temManualBpf === null ? '' : v.temManualBpf ? 'sim' : 'nao'}
              onChange={(e) =>
                form.definir(
                  'temManualBpf',
                  e.target.value === '' ? null : e.target.value === 'sim',
                )
              }
            >
              <option value="">Não informado</option>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </Selecao>
          </Campo>
          {v.temManualBpf && (
            <Campo rotulo="Última revisão do manual" id="manualBpfRevisao">
              <Entrada
                id="manualBpfRevisao"
                type="date"
                value={v.manualBpfRevisao ?? ''}
                onChange={(e) => form.definir('manualBpfRevisao', e.target.value || null)}
              />
            </Campo>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo
            rotulo="Responsável técnico"
            id="responsavelTecnicoId"
            erro={form.erro('responsavelTecnicoId')}
            ajuda={
              rts.data && !rts.data.length
                ? 'Cadastre o RT em Pessoas, com o papel de responsável técnico.'
                : undefined
            }
          >
            <Selecao
              id="responsavelTecnicoId"
              value={v.responsavelTecnicoId ?? ''}
              onChange={(e) => form.definir('responsavelTecnicoId', e.target.value || null)}
            >
              <option value="">Não informado</option>
              {rts.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Indicações geográficas usadas</legend>
          <div className="flex flex-wrap gap-4">
            {ref?.igs.map((ig) => (
              <Caixa
                key={ig.id}
                rotulo={`${ig.tipo} ${ig.nome}`}
                checked={v.igs.includes(ig.id)}
                onChange={(e) =>
                  form.definir(
                    'igs',
                    e.target.checked ? [...v.igs, ig.id] : v.igs.filter((x) => x !== ig.id),
                  )
                }
              />
            ))}
          </div>
          {igsForaDaArea.map((ig) => (
            <Aviso key={ig.id} tom="alerta" className="mt-2">
              O município do endereço principal ({enderecoPrincipal?.municipio}) não está na área
              delimitada da {ig.tipo} {ig.nome}. Confira o endereço ou a IG.
            </Aviso>
          ))}
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Produtos elaborados</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {ref?.classesProduto.map((c) => (
              <Caixa
                key={c.codigo}
                rotulo={c.nome}
                checked={v.produtosElaborados.includes(c.codigo)}
                onChange={(e) =>
                  form.definir(
                    'produtosElaborados',
                    e.target.checked
                      ? [...v.produtosElaborados, c.codigo]
                      : v.produtosElaborados.filter((x) => x !== c.codigo),
                  )
                }
              />
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Classificação oficial (Lei 7.678/1988; IN MAPA 14/2018).
          </p>
        </fieldset>
      </fieldset>
      {!somenteLeitura && (
        <div>
          <Botao type="submit" disabled={enviando}>
            {enviando ? 'Salvando…' : rotuloBotao}
          </Botao>
        </div>
      )}
    </form>
  )
}

/** Primeiro acesso: sem estabelecimento, esta tela abre antes de qualquer outra. */
export function CriarPrimeiroEstabelecimento({ sessao }: { sessao: EstadoSessao }) {
  const atualizar = useAtualizarSessao()
  const navegar = useNavigate()
  if (!pode(sessao, 'gestao.config.estabelecimentos', 'criar')) {
    return (
      <Pagina titulo="Aguardando a configuração">
        <Aviso tom="info">
          O Master da empresa ainda não cadastrou o estabelecimento. Assim que ele cadastrar, o
          sistema fica liberado.
        </Aviso>
      </Pagina>
    )
  }
  return (
    <Pagina titulo="Cadastre o seu estabelecimento">
      <Aviso tom="info">
        Antes de começar, cadastre o estabelecimento: a unidade com CNPJ e registro no MAPA onde
        ficam os recipientes, os estoques e os movimentos. Você pode completar os dados depois.
      </Aviso>
      <Cartao>
        <CorpoCartao>
          <FormularioEstabelecimento
            inicial={VAZIO}
            rotuloBotao="Cadastrar e continuar"
            aoSalvar={async (d) => {
              const r = await api.post<{ id: string }>('/api/estabelecimentos', d)
              atualizar(
                await api.post<EstadoSessao>('/api/auth/contexto', { estabelecimentoId: r.id }),
              )
              navegar('/inicio')
            }}
          />
        </CorpoCartao>
      </Cartao>
    </Pagina>
  )
}

export function NovoEstabelecimento() {
  const navegar = useNavigate()
  const qc = useQueryClient()
  return (
    <Pagina titulo="Novo estabelecimento" trilha={['Configurações', 'Estabelecimentos']}>
      <Cartao>
        <CorpoCartao>
          <FormularioEstabelecimento
            inicial={VAZIO}
            rotuloBotao="Cadastrar"
            aoSalvar={async (d) => {
              const r = await api.post<{ id: string }>('/api/estabelecimentos', d)
              await qc.invalidateQueries({ queryKey: ['sessao'] })
              navegar(`/config/estabelecimentos/${r.id}`, { replace: true })
            }}
          />
        </CorpoCartao>
      </Cartao>
    </Pagina>
  )
}

export function FichaEstabelecimento() {
  const { id = '' } = useParams()
  const { data: s } = useSessao()
  const qc = useQueryClient()
  const [inativar, setInativar] = useState(false)
  const q = useQuery({
    queryKey: ['estabelecimento', id],
    queryFn: () =>
      api.get<
        typeof VAZIO & { id: string; ativo: boolean; ficha: typeof VAZIO.ficha & { nome: string } }
      >(`/api/estabelecimentos/${id}`),
  })
  const podeEditar = pode(s, 'gestao.config.estabelecimentos', 'editar')
  const podeInativar = pode(s, 'gestao.config.estabelecimentos', 'inativar')
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>
  if (q.isError) return <Aviso tom="erro">{(q.error as Error).message}</Aviso>
  const e = q.data!
  const recarregar = async () => {
    await qc.invalidateQueries({ queryKey: ['estabelecimento', id] })
    await qc.invalidateQueries({ queryKey: ['historico', 'estabelecimento', id] })
    await qc.invalidateQueries({ queryKey: ['sessao'] })
  }
  return (
    <Pagina
      titulo={e.ficha.nome}
      trilha={['Configurações', 'Estabelecimentos']}
      acoes={
        podeInativar && (
          <AcoesLinha
            contorno
            ativo={e.ativo}
            aoInativar={() => setInativar(true)}
            aoReativar={async () => {
              await api.post(`/api/estabelecimentos/${id}/reativar`)
              await recarregar()
            }}
          />
        )
      }
    >
      {!e.ativo && <Aviso tom="alerta">Estabelecimento inativo.</Aviso>}
      <Abas defaultValue="dados">
        <ListaAbas>
          <Aba value="dados">Dados</Aba>
          <Aba value="anexos">Anexos</Aba>
          <Aba value="historico">Histórico</Aba>
        </ListaAbas>
        <ConteudoAba value="dados">
          <Cartao>
            <CorpoCartao>
              <FormularioEstabelecimento
                key={e.versao}
                inicial={{ ...VAZIO, ...e }}
                rotuloBotao="Salvar"
                somenteLeitura={!podeEditar}
                aoSalvar={async (d) => {
                  await api.put(`/api/estabelecimentos/${id}`, d)
                  await recarregar()
                }}
              />
            </CorpoCartao>
          </Cartao>
        </ConteudoAba>
        <ConteudoAba value="anexos">
          <Anexos
            entidade="estabelecimento"
            registroId={id}
            podeAlterar={podeEditar}
            fuso={fusoAtivo(s)}
          />
        </ConteudoAba>
        <ConteudoAba value="historico">
          <Historico entidade="estabelecimento" registroId={id} fuso={fusoAtivo(s)} />
        </ConteudoAba>
      </Abas>
      <PedirMotivo
        aberto={inativar}
        aoMudar={setInativar}
        titulo="Inativar estabelecimento"
        descricao="O estabelecimento deixa de aparecer nos registros novos; o que já existe continua guardado."
        rotuloBotao="Inativar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/estabelecimentos/${id}/inativar`, { motivo })
          await recarregar()
        }}
      />
    </Pagina>
  )
}
