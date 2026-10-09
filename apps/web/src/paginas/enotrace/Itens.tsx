// EnoTrace › Insumos e embalagens (ambiente-cliente.md, Cadastros; estoque comum). Os saldos
// e movimentos chegam no ciclo 5; aqui fica o cadastro dos itens.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { dadosItemEstoque, formatarDecimal, NOMES_TIPO_ITEM } from '@vinicycle/shared'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { AcoesLinha, colunaAcoes } from '@/componentes/AcoesLinha'
import { Historico } from '@/componentes/Historico'
import { PedirMotivo } from '@/componentes/PedirMotivo'
import { CampoNumero } from '@/componentes/campos-especiais'
import { TabelaDados } from '@/componentes/TabelaDados'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, Etiqueta } from '@/componentes/ui/cartao'
import { AreaTexto, Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { Dialogo } from '@/componentes/ui/dialogo'
import { Pagina } from '@/layout/Estrutura'
import { api } from '@/lib/api'
import { useFormulario } from '@/lib/formulario'
import { useReferencia } from '@/lib/referencia'
import { fusoAtivo, pode, useSessao } from '@/lib/sessao'

type Tipo = 'insumo' | 'embalagem' | 'selo' | 'produto_acabado'

interface Linha {
  id: string
  tipo: Tipo
  nome: string
  codigoInterno: string | null
  unidadeBase: string
  estoqueMinimo: string | null
  tipoInsumo: string | null
  nomeComercial: string | null
  marca: string | null
  fabricante: string | null
  ativo: boolean
}

interface TipoInsumo {
  id: string
  nome: string
  unidades: string[]
  apresentacoes: string[]
}

const INSUMO_VAZIO = {
  tipoInsumoId: '',
  nomeComercial: '',
  marca: '',
  fabricanteId: '',
  apresentacao: '',
  teorSo2: null as string | null,
}

const VAZIO = {
  tipo: 'insumo' as 'insumo' | 'embalagem' | 'selo' | 'outro',
  nome: '',
  codigoInterno: '',
  unidadeBase: '',
  estoqueMinimo: null as string | null,
  controlaLote: false,
  controlaValidade: false,
  eAlcoolEtilico: false,
  controlaNumeracao: false,
  observacoes: '',
  // Só o insumo tem este bloco; na embalagem ele fica fora do envio.
  insumo: undefined as typeof INSUMO_VAZIO | undefined,
  versao: undefined as number | undefined,
}

function Formulario({
  id,
  tipo,
  aoFechar,
}: {
  id: string | null
  tipo: 'insumo' | 'embalagem' | 'selo'
  aoFechar: () => void
}) {
  const qc = useQueryClient()
  const { data: s } = useSessao()
  const { data: ref } = useReferencia()
  const atual = useQuery({
    queryKey: ['item', id],
    queryFn: () => api.get<Omit<typeof VAZIO, 'tipo'> & { tipo: Tipo }>(`/api/itens-estoque/${id}`),
    enabled: !!id,
  })
  const tipos = useQuery({
    queryKey: ['tipos-insumo'],
    queryFn: async () =>
      (await api.get<{ itens: TipoInsumo[] }>('/api/catalogos/tipo_insumo?tamanho=0')).itens,
  })
  const fabricantes = useQuery({
    queryKey: ['pessoas-opcoes', 'fabricante'],
    queryFn: () =>
      api.get<Array<{ id: string; nome: string }>>('/api/pessoas/opcoes?papel=fabricante'),
  })
  if (id && !atual.data) return null
  const inicial = atual.data
    ? {
        ...VAZIO,
        ...atual.data,
        insumo: atual.data.insumo ? { ...INSUMO_VAZIO, ...atual.data.insumo } : undefined,
      }
    : {
        ...VAZIO,
        tipo,
        unidadeBase: tipo === 'embalagem' || tipo === 'selo' ? 'un' : '',
        controlaNumeracao: tipo === 'selo',
        insumo: tipo === 'insumo' ? INSUMO_VAZIO : undefined,
      }
  return (
    <Corpo
      id={id}
      inicial={inicial as typeof VAZIO}
      tipos={tipos.data ?? []}
      fabricantes={fabricantes.data ?? []}
      unidades={ref?.unidades ?? []}
      apresentacoes={ref?.listas.apresentacao_insumo ?? []}
      podeEditar={
        pode(s, 'enotrace.cadastros', id ? 'editar' : 'criar') &&
        atual.data?.tipo !== 'produto_acabado'
      }
      fuso={fusoAtivo(s)}
      aoSalvar={async () => {
        await qc.invalidateQueries({ queryKey: ['lista', '/api/itens-estoque'] })
        await qc.invalidateQueries({ queryKey: ['item', id] })
        aoFechar()
      }}
      aoFechar={aoFechar}
    />
  )
}

function Corpo({
  id,
  inicial,
  tipos,
  fabricantes,
  unidades,
  apresentacoes,
  podeEditar,
  fuso,
  aoSalvar,
  aoFechar,
}: {
  id: string | null
  inicial: typeof VAZIO
  tipos: TipoInsumo[]
  fabricantes: Array<{ id: string; nome: string }>
  unidades: Array<{ simbolo: string; nome: string; grandeza: string }>
  apresentacoes: Array<{ codigo: string; nome: string }>
  podeEditar: boolean
  fuso: string
  aoSalvar: () => Promise<void>
  aoFechar: () => void
}) {
  const form = useFormulario(dadosItemEstoque, inicial)
  const [aba, setAba] = useState<'dados' | 'historico'>('dados')
  const v = form.valores as typeof VAZIO
  const tipoInsumo = tipos.find((t) => t.id === v.insumo?.tipoInsumoId)
  const unidadesPermitidas =
    v.tipo === 'insumo' && tipoInsumo?.unidades.length
      ? unidades.filter((u) => tipoInsumo.unidades.includes(u.simbolo))
      : unidades.filter((u) => ['massa', 'volume', 'contagem'].includes(u.grandeza))
  const apresentacoesPermitidas = tipoInsumo?.apresentacoes.length
    ? apresentacoes.filter((a) => tipoInsumo.apresentacoes.includes(a.codigo))
    : apresentacoes
  const casasUnidade = v.unidadeBase === 'un' ? 0 : 3
  return (
    <Dialogo
      aberto
      largo
      aoMudar={(x) => !x && aoFechar()}
      titulo={
        id
          ? v.nome
          : v.tipo === 'insumo'
            ? 'Novo insumo'
            : v.tipo === 'selo'
              ? 'Novo selo'
              : 'Nova embalagem'
      }
      rodape={
        aba === 'dados' &&
        podeEditar && (
          <>
            <Botao variante="secundario" onClick={aoFechar}>
              Cancelar
            </Botao>
            <Botao
              onClick={async () => {
                const d = form.validar()
                if (!d) return
                try {
                  if (id) await api.put(`/api/itens-estoque/${id}`, d)
                  else await api.post('/api/itens-estoque', d)
                  await aoSalvar()
                } catch (e) {
                  form.erroDaApi(e)
                }
              }}
            >
              Salvar
            </Botao>
          </>
        )
      }
    >
      {id && (
        <div className="mb-4 flex gap-2">
          <Botao
            tamanho="pequeno"
            variante={aba === 'dados' ? 'primario' : 'secundario'}
            onClick={() => setAba('dados')}
          >
            Dados
          </Botao>
          <Botao
            tamanho="pequeno"
            variante={aba === 'historico' ? 'primario' : 'secundario'}
            onClick={() => setAba('historico')}
          >
            Histórico
          </Botao>
        </div>
      )}
      {aba === 'historico' && id ? (
        <Historico entidade="item_estoque" registroId={id} fuso={fuso} />
      ) : (
        <fieldset disabled={!podeEditar} className="flex flex-col gap-4">
          {form.erroGeral && <Aviso tom="erro">{form.erroGeral}</Aviso>}
          {v.tipo === 'insumo' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo
                rotulo="Tipo de insumo"
                id="tipoInsumoId"
                erro={form.erro('insumo.tipoInsumoId')}
                obrigatorio
              >
                <Selecao
                  id="tipoInsumoId"
                  value={v.insumo?.tipoInsumoId}
                  onChange={(e) => {
                    form.definir('insumo.tipoInsumoId', e.target.value)
                    const t = tipos.find((x) => x.id === e.target.value)
                    if (t?.unidades.length && !t.unidades.includes(v.unidadeBase))
                      form.definir('unidadeBase', t.unidades[0])
                  }}
                >
                  <option value="">Escolha</option>
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Campo rotulo="Apresentação" id="apresentacao">
                <Selecao
                  id="apresentacao"
                  value={v.insumo?.apresentacao ?? ''}
                  onChange={(e) => form.definir('insumo.apresentacao', e.target.value || null)}
                >
                  <option value="">Não informada</option>
                  {apresentacoesPermitidas.map((a) => (
                    <option key={a.codigo} value={a.codigo}>
                      {a.nome}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Campo
                rotulo="Teor de SO₂"
                id="teor-so2"
                ajuda="Para somar o SO₂ adicionado (limite de 300 mg/L, IN Anvisa 211/2023). Metabissulfito de potássio: cerca de 57%."
              >
                <CampoNumero
                  id="teor-so2"
                  casas={2}
                  unidade="%"
                  valor={v.insumo?.teorSo2 ?? null}
                  aoMudar={(x) => form.definir('insumo.teorSo2', x)}
                />
              </Campo>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Nome" id="nome" erro={form.erro('nome')} obrigatorio>
              <Entrada
                id="nome"
                autoFocus={!id}
                value={v.nome}
                onChange={(e) => form.definir('nome', e.target.value)}
                onBlur={() => form.tocar('nome')}
              />
            </Campo>
            <Campo rotulo="Código interno" id="codigoInterno">
              <Entrada
                id="codigoInterno"
                value={v.codigoInterno ?? ''}
                onChange={(e) => form.definir('codigoInterno', e.target.value)}
              />
            </Campo>
            {v.tipo === 'insumo' && (
              <>
                <Campo rotulo="Nome comercial" id="nomeComercial">
                  <Entrada
                    id="nomeComercial"
                    value={v.insumo?.nomeComercial ?? ''}
                    onChange={(e) => form.definir('insumo.nomeComercial', e.target.value)}
                  />
                </Campo>
                <Campo
                  rotulo="Fabricante"
                  id="fabricanteId"
                  erro={form.erro('insumo.fabricanteId')}
                  ajuda="Pessoa com o papel de fabricante."
                >
                  <Selecao
                    id="fabricanteId"
                    value={v.insumo?.fabricanteId ?? ''}
                    onChange={(e) => form.definir('insumo.fabricanteId', e.target.value || null)}
                  >
                    <option value="">Não informado</option>
                    {fabricantes.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
                <Campo rotulo="Marca" id="marca">
                  <Entrada
                    id="marca"
                    value={v.insumo?.marca ?? ''}
                    onChange={(e) => form.definir('insumo.marca', e.target.value)}
                  />
                </Campo>
              </>
            )}
            <Campo
              rotulo="Unidade base"
              id="unidadeBase"
              erro={form.erro('unidadeBase')}
              obrigatorio
              ajuda="O saldo do estoque é contado nesta unidade."
            >
              <Selecao
                id="unidadeBase"
                value={v.unidadeBase}
                onChange={(e) => form.definir('unidadeBase', e.target.value)}
              >
                <option value="">Escolha</option>
                {unidadesPermitidas.map((u) => (
                  <option key={u.simbolo} value={u.simbolo}>
                    {u.simbolo} · {u.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo
              rotulo="Estoque mínimo"
              id="estoqueMinimo"
              ajuda="Abaixo dele, a central de alertas avisa (ciclo 6)."
            >
              <CampoNumero
                id="estoqueMinimo"
                casas={casasUnidade}
                unidade={v.unidadeBase || undefined}
                valor={v.estoqueMinimo}
                aoMudar={(x) => form.definir('estoqueMinimo', x)}
              />
            </Campo>
          </div>
          <div className="flex flex-wrap gap-5">
            <Caixa
              rotulo="Controla lote"
              checked={v.controlaLote}
              onChange={(e) => form.definir('controlaLote', e.target.checked)}
            />
            <Caixa
              rotulo="Controla validade"
              checked={v.controlaValidade}
              onChange={(e) => form.definir('controlaValidade', e.target.checked)}
            />
            {v.tipo === 'insumo' && (
              <Caixa
                rotulo="É álcool etílico (entrada comunicada ao MAPA)"
                checked={v.eAlcoolEtilico}
                onChange={(e) => form.definir('eAlcoolEtilico', e.target.checked)}
              />
            )}
            {v.tipo !== 'insumo' && (
              <Caixa
                rotulo="Controla numeração (entra por faixa, em Estoque › Selos)"
                checked={v.tipo === 'selo' || v.controlaNumeracao}
                disabled={v.tipo === 'selo'}
                onChange={(e) => form.definir('controlaNumeracao', e.target.checked)}
              />
            )}
          </div>
          <Campo rotulo="Observações" id="observacoes">
            <AreaTexto
              id="observacoes"
              value={v.observacoes ?? ''}
              onChange={(e) => form.definir('observacoes', e.target.value)}
            />
          </Campo>
        </fieldset>
      )}
    </Dialogo>
  )
}

export function PaginaItens() {
  const { tipo = 'insumos' } = useParams()
  const navegar = useNavigate()
  const { data: s } = useSessao()
  const qc = useQueryClient()
  const t: Tipo =
    tipo === 'embalagens'
      ? 'embalagem'
      : tipo === 'selos'
        ? 'selo'
        : tipo === 'acabados'
          ? 'produto_acabado'
          : 'insumo'
  const [aberto, setAberto] = useState<string | 'novo' | null>(null)
  const [inativar, setInativar] = useState<Linha | null>(null)
  const podeInativar = pode(s, 'enotrace.cadastros', 'inativar')
  return (
    <Pagina
      titulo={
        t === 'insumo'
          ? 'Insumos'
          : t === 'embalagem'
            ? 'Embalagens'
            : t === 'selo'
              ? 'Selos'
              : 'Produto acabado'
      }
      trilha={['EnoTrace', 'Cadastros']}
      acoes={
        t !== 'produto_acabado' &&
        pode(s, 'enotrace.cadastros', 'criar') && (
          <Botao onClick={() => setAberto('novo')}>
            <Plus />{' '}
            {t === 'insumo' ? 'Novo insumo' : t === 'selo' ? 'Novo selo' : 'Nova embalagem'}
          </Botao>
        )
      }
    >
      <div className="flex gap-2">
        {(['insumos', 'embalagens', 'selos', 'acabados'] as const).map((x) => (
          <Botao
            key={x}
            tamanho="pequeno"
            variante={tipo === x ? 'primario' : 'secundario'}
            onClick={() => navegar(`/enotrace/itens/${x}`)}
          >
            {x === 'insumos'
              ? 'Insumos'
              : x === 'embalagens'
                ? 'Embalagens'
                : x === 'selos'
                  ? 'Selos'
                  : 'Produto acabado'}
          </Botao>
        ))}
      </div>
      {t === 'produto_acabado' && (
        <p className="text-sm text-muted-foreground">
          Os itens de produto acabado nascem dos formatos de cada produto (EnoTrace › Produtos).
        </p>
      )}
      <TabelaDados
        key={t}
        tabela={`itens.${t}`}
        url={`/api/itens-estoque`}
        ordemPadrao={{ campo: 'nome', direcao: 'asc' }}
        filtrosIniciais={{ tipo: t, situacao: 'ativos' }}
        podeExportar={pode(s, 'enotrace.cadastros', 'exportar')}
        aoClicar={(i) => t !== 'produto_acabado' && setAberto(i.id)}
        filtros={(f, definir) => (
          <Selecao
            aria-label="Situação"
            className="w-32"
            value={f.situacao ?? 'ativos'}
            onChange={(e) => definir('situacao', e.target.value)}
          >
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
            <option value="todos">Todos</option>
          </Selecao>
        )}
        colunas={[
          {
            id: 'nome',
            titulo: 'Nome',
            ordenavel: true,
            celula: (i) => (
              <span>
                {i.nome}
                {(i.nomeComercial || i.marca) && (
                  <span className="block text-xs text-muted-foreground">
                    {[i.nomeComercial, i.marca, i.fabricante].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
            ),
            exportar: (i) => i.nome,
          },
          ...(t === 'insumo'
            ? [
                {
                  id: 'tipoInsumo',
                  titulo: 'Tipo',
                  ordenavel: true,
                  celula: (i: Linha) => i.tipoInsumo ?? '—',
                  exportar: (i: Linha) => i.tipoInsumo,
                },
              ]
            : []),
          {
            id: 'unidadeBase',
            titulo: 'Unidade',
            celula: (i) => i.unidadeBase,
            exportar: (i) => i.unidadeBase,
          },
          {
            id: 'estoqueMinimo',
            titulo: 'Estoque mínimo',
            className: 'text-right',
            celula: (i) =>
              i.estoqueMinimo
                ? `${formatarDecimal(i.estoqueMinimo, i.unidadeBase === 'un' ? 0 : 3)} ${i.unidadeBase}`
                : '—',
            exportar: (i) => i.estoqueMinimo,
          },
          {
            id: 'situacao',
            titulo: 'Situação',
            celula: (i) => (
              <Etiqueta tom={i.ativo ? 'sucesso' : 'neutro'}>
                {i.ativo ? 'Ativo' : 'Inativo'}
              </Etiqueta>
            ),
          },
          ...(t !== 'produto_acabado'
            ? [
                colunaAcoes<Linha>((i) => (
                  <AcoesLinha
                    ativo={i.ativo}
                    aoEditar={
                      pode(s, 'enotrace.cadastros', 'editar') ? () => setAberto(i.id) : undefined
                    }
                    aoInativar={podeInativar ? () => setInativar(i) : undefined}
                    aoReativar={
                      podeInativar
                        ? async () => {
                            await api.post(`/api/itens-estoque/${i.id}/reativar`)
                            await qc.invalidateQueries({
                              queryKey: ['lista', '/api/itens-estoque'],
                            })
                          }
                        : undefined
                    }
                  />
                )),
              ]
            : []),
        ]}
      />
      {aberto && t !== 'produto_acabado' && (
        <Formulario
          id={aberto === 'novo' ? null : aberto}
          tipo={t}
          aoFechar={() => setAberto(null)}
        />
      )}
      <PedirMotivo
        aberto={!!inativar}
        aoMudar={(x) => !x && setInativar(null)}
        titulo={`Inativar ${inativar?.nome ?? ''}`}
        rotuloBotao="Inativar"
        descricao={
          NOMES_TIPO_ITEM[inativar?.tipo ?? 'insumo'] +
          ' deixa de ser oferecido em registros novos (P26).'
        }
        aoConfirmar={async (motivo) => {
          await api.post(`/api/itens-estoque/${inativar!.id}/inativar`, { motivo })
          await qc.invalidateQueries({ queryKey: ['lista', '/api/itens-estoque'] })
        }}
      />
    </Pagina>
  )
}
