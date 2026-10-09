// EnoTrace › Recepção da uva (cantina.md, Recepção): romaneio em rascunho enquanto a uva é pesada;
// na confirmação ganha o código ROM e não se edita mais (P13). Alertas legais pedem "ciente" (P29).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { dadosProjeto, formatarDecimal } from '@vinicycle/shared'
import { Plus, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { BotaoIcone } from '@/componentes/AcoesLinha'
import { Anexos } from '@/componentes/Anexos'
import { CampoNumero } from '@/componentes/campos-especiais'
import { Historico } from '@/componentes/Historico'
import { PedirMotivo } from '@/componentes/PedirMotivo'
import { type Coluna, TabelaDados } from '@/componentes/TabelaDados'
import { Aba, Abas, ConteudoAba, ListaAbas } from '@/componentes/ui/abas'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao'
import { AreaTexto, Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { Dialogo } from '@/componentes/ui/dialogo'
import { Pagina } from '@/layout/Estrutura'
import { api, ErroApi } from '@/lib/api'
import { useFormulario } from '@/lib/formulario'
import { fusoAtivo, pode, useSessao } from '@/lib/sessao'
import { formatarData, formatarDataHora } from '@/lib/utils'
import { CamposProjeto, PROJETO_VAZIO, useVariedadesEmUso } from './Projetos'

const F = 'enotrace.recepcao'
const kg = (v: string | number | null | undefined) => `${formatarDecimal(String(v ?? 0), 1)} kg`

/** ISO → valor do campo datetime-local (hora local do navegador). */
const paraCampo = (iso: string) => {
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
const doCampo = (valor: string) => new Date(valor).toISOString()
const agora = () => paraCampo(new Date().toISOString())

// Lista ----------------------------------------------------------------------------------------

interface Linha {
  id: string
  codigo: string | null
  chegadaEm: string
  situacao: 'rascunho' | 'confirmado' | 'estornado'
  origem: 'vinhedo_proprio' | 'fornecedor'
  projeto: string
  fornecedor: string | null
  variedades: string[]
  kg: string
  aProcessar: string
}

export function ListaRecepcao() {
  const navegar = useNavigate()
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  const colunas: Coluna<Linha>[] = [
    {
      id: 'codigo',
      titulo: 'Romaneio',
      ordenavel: true,
      celula: (r) =>
        r.codigo ? <strong>{r.codigo}</strong> : <Etiqueta tom="alerta">Rascunho</Etiqueta>,
      exportar: (r) => r.codigo ?? 'Rascunho',
    },
    {
      id: 'chegadaEm',
      titulo: 'Chegada',
      ordenavel: true,
      celula: (r) => formatarDataHora(r.chegadaEm, fuso),
      exportar: (r) => r.chegadaEm,
    },
    {
      id: 'projeto',
      titulo: 'Projeto',
      celula: (r) => r.projeto,
      exportar: (r) => r.projeto,
    },
    {
      id: 'origem',
      titulo: 'Origem',
      celula: (r) =>
        r.origem === 'vinhedo_proprio' ? 'Vinhedo próprio' : (r.fornecedor ?? 'Fornecedor'),
      exportar: (r) => r.fornecedor ?? 'Vinhedo próprio',
    },
    {
      id: 'variedades',
      titulo: 'Variedades',
      celula: (r) => r.variedades.join(', '),
      exportar: (r) => r.variedades.join(', '),
    },
    {
      id: 'kg',
      titulo: 'Peso líquido',
      className: 'text-right',
      celula: (r) => kg(r.kg),
      exportar: (r) => r.kg,
    },
    {
      id: 'aProcessar',
      titulo: 'A processar',
      className: 'text-right',
      celula: (r) => (r.situacao === 'confirmado' ? kg(r.aProcessar) : '—'),
      exportar: (r) => r.aProcessar,
    },
  ]
  return (
    <Pagina
      titulo="Recepção da uva"
      trilha={['EnoTrace']}
      acoes={
        pode(s, F, 'criar') && (
          <Botao onClick={() => navegar('/enotrace/recepcao/nova')}>
            <Plus /> Nova recepção
          </Botao>
        )
      }
    >
      <p className="text-sm text-muted-foreground">
        Cada carga é um romaneio, com as variedades e as pesagens. Fica em rascunho até a
        confirmação.
      </p>
      <TabelaDados
        tabela="romaneios"
        url="/api/romaneios"
        ordemPadrao={{ campo: 'chegadaEm', direcao: 'desc' }}
        filtrosIniciais={{ situacao: 'todos' }}
        aoClicar={(r) => navegar(`/enotrace/recepcao/${r.id}`)}
        podeExportar={pode(s, F, 'exportar')}
        filtros={(f, definir) => (
          <Selecao
            aria-label="Situação"
            className="w-44"
            value={f.situacao ?? 'todos'}
            onChange={(e) => definir('situacao', e.target.value)}
          >
            <option value="todos">Todos</option>
            <option value="rascunho">Rascunhos</option>
            <option value="confirmado">Confirmados</option>
            <option value="a_processar">Com uva a processar</option>
            <option value="estornado">Estornados</option>
          </Selecao>
        )}
        colunas={colunas}
      />
    </Pagina>
  )
}

// Formulário (rascunho) ------------------------------------------------------------------------

interface PesagemForm {
  pesadoEm: string
  brutoKg: string | null
  taraKg: string | null
}

interface ItemForm {
  nfeItemId?: string | null
  variedadeId: string
  parcelaId: string
  dataColheita: string
  ciclo: string
  brix: string | null
  ph: string | null
  acidezTotal: string | null
  sanidade: string | null
  temperatura: string | null
  organica: boolean
  candidataIp: boolean
  dataPoda: string
  observacoes: string
  pesagens: PesagemForm[]
}

interface Romaneio {
  id: string
  codigo: string | null
  situacao: 'rascunho' | 'confirmado' | 'estornado'
  chegadaEm: string
  projetoId: string
  projeto: string
  origem: 'vinhedo_proprio' | 'fornecedor'
  fornecedorId: string | null
  fornecedor: string | null
  donoUvaId: string | null
  donoUva: string | null
  contratoId: string | null
  contrato: string | null
  nfNumero: string | null
  nfSerie: string | null
  nfEmissao: string | null
  nfeId: string | null
  nfChave: string | null
  transportadorId: string | null
  transportador: string | null
  placa: string | null
  caixas: number | null
  observacoes: string | null
  confirmadoEm: string | null
  estornadoEm: string | null
  motivoEstorno: string | null
  versao: number
  itens: Array<
    Omit<ItemForm, 'pesagens' | 'parcelaId' | 'ciclo' | 'dataPoda' | 'observacoes'> & {
      id: string
      variedade: string
      nfeItemId: string | null
      parcelaId: string | null
      parcela: string | null
      ciclo: string | null
      safra: number
      dataPoda: string | null
      observacoes: string | null
      liquidoKg: string
      consumidoKg: string
      saldoKg: string
      pesagens: Array<{ pesadoEm: string; brutoKg: string; taraKg: string }>
    }
  >
}

const itemVazio = (): ItemForm => ({
  variedadeId: '',
  parcelaId: '',
  dataColheita: new Date().toISOString().slice(0, 10),
  ciclo: '',
  brix: null,
  ph: null,
  acidezTotal: null,
  sanidade: null,
  temperatura: null,
  organica: false,
  candidataIp: false,
  dataPoda: '',
  observacoes: '',
  pesagens: [{ pesadoEm: agora(), brutoKg: null, taraKg: null }],
})

function useOpcoesPessoa(papel: string) {
  return useQuery({
    queryKey: ['pessoas-opcoes', papel],
    queryFn: () =>
      api.get<Array<{ id: string; nome: string }>>(`/api/pessoas/opcoes?papel=${papel}`),
  })
}

function ProjetoRapido({
  aoCriar,
  aoFechar,
}: {
  aoCriar: (id: string) => void
  aoFechar: () => void
}) {
  const qc = useQueryClient()
  const form = useFormulario(dadosProjeto, PROJETO_VAZIO)
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo="Novo projeto"
      descricao="Nome, safra e produto; o resto se completa depois na ficha do projeto."
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            onClick={async () => {
              const d = form.validar()
              if (!d) return
              try {
                const r = await api.post<{ id: string }>('/api/projetos', d)
                await qc.invalidateQueries({ queryKey: ['projetos-opcoes'] })
                aoCriar(r.id)
              } catch (e) {
                form.erroDaApi(e)
              }
            }}
          >
            Criar projeto
          </Botao>
        </>
      }
    >
      {form.erroGeral && <Aviso tom="erro">{form.erroGeral}</Aviso>}
      <CamposProjeto form={form} rapido />
    </Dialogo>
  )
}

function FormularioRomaneio({ atual }: { atual: Romaneio | null }) {
  const navegar = useNavigate()
  const qc = useQueryClient()
  const { data: s } = useSessao()
  const variedades = useVariedadesEmUso()
  const produtores = useOpcoesPessoa('produtor_uva')
  const clientes = useOpcoesPessoa('cliente_vinificacao')
  const transportadores = useOpcoesPessoa('transportador')
  const projetos = useQuery({
    queryKey: ['projetos-opcoes'],
    queryFn: () =>
      api.get<Array<{ id: string; codigo: string; nome: string }>>('/api/projetos/opcoes'),
  })
  const ciclos = useQuery({
    queryKey: ['parametros', '/api/cantina/ciclos'],
    queryFn: () => api.get<Array<{ numero: string; nome: string }>>('/api/cantina/ciclos'),
  })
  const [d, setD] = useState({
    chegadaEm: atual ? paraCampo(atual.chegadaEm) : agora(),
    projetoId: atual?.projetoId ?? '',
    origem: atual?.origem ?? ('fornecedor' as 'vinhedo_proprio' | 'fornecedor'),
    fornecedorId: atual?.fornecedorId ?? '',
    donoUvaId: atual?.donoUvaId ?? '',
    contratoId: atual?.contratoId ?? '',
    nfNumero: atual?.nfNumero ?? '',
    nfSerie: atual?.nfSerie ?? '',
    nfEmissao: atual?.nfEmissao ?? '',
    nfChave: atual?.nfChave ?? '',
    nfeId: atual?.nfeId ?? null,
    transportadorId: atual?.transportadorId ?? '',
    placa: atual?.placa ?? '',
    caixas: atual?.caixas ?? null,
    observacoes: atual?.observacoes ?? '',
    itens: atual
      ? atual.itens.map<ItemForm>((i) => ({
          nfeItemId: i.nfeItemId ?? null,
          variedadeId: i.variedadeId,
          parcelaId: i.parcelaId ?? '',
          dataColheita: i.dataColheita,
          ciclo: i.ciclo ?? '',
          brix: i.brix,
          ph: i.ph,
          acidezTotal: i.acidezTotal,
          sanidade: i.sanidade,
          temperatura: i.temperatura,
          organica: i.organica,
          candidataIp: i.candidataIp,
          dataPoda: i.dataPoda ?? '',
          observacoes: i.observacoes ?? '',
          pesagens: i.pesagens.map((p) => ({
            pesadoEm: paraCampo(p.pesadoEm),
            brutoKg: p.brutoKg,
            taraKg: p.taraKg,
          })),
        }))
      : [itemVazio()],
  })
  // Contratos de terceirização vigentes com o dono da uva na chegada; o mais recente vem escolhido.
  const dataChegada = d.chegadaEm.slice(0, 10)
  const contratos = useQuery({
    queryKey: ['contratos-vigentes', d.donoUvaId, dataChegada],
    queryFn: () =>
      api.get<Array<{ id: string; numero: string | null; vigenciaInicio: string }>>(
        `/api/contratos-terceirizacao/vigentes?contraparteId=${d.donoUvaId}&data=${dataChegada}`,
      ),
    enabled: !!d.donoUvaId && /^\d{4}-\d{2}-\d{2}$/.test(dataChegada),
  })
  async function mudarDono(donoUvaId: string) {
    setD((x) => ({ ...x, donoUvaId, contratoId: '' }))
    if (!donoUvaId) return
    const lista = await qc.fetchQuery({
      queryKey: ['contratos-vigentes', donoUvaId, dataChegada],
      queryFn: () =>
        api.get<Array<{ id: string; numero: string | null; vigenciaInicio: string }>>(
          `/api/contratos-terceirizacao/vigentes?contraparteId=${donoUvaId}&data=${dataChegada}`,
        ),
    })
    setD((x) => (x.donoUvaId === donoUvaId ? { ...x, contratoId: lista[0]?.id ?? '' } : x))
  }
  const donoParcelas = d.origem === 'vinhedo_proprio' ? '' : d.fornecedorId
  const propriedades = useQuery({
    queryKey: ['propriedades-opcoes', donoParcelas],
    queryFn: () =>
      api.get<
        Array<{
          id: string
          nome: string
          parcelas: Array<{ id: string; nome: string; variedadeId: string | null }>
        }>
      >(`/api/propriedades/opcoes${donoParcelas ? `?donoId=${donoParcelas}` : ''}`),
    enabled: d.origem === 'vinhedo_proprio' || !!d.fornecedorId,
  })
  const [erro, setErro] = useState<string | null>(null)
  const [avisosNota, setAvisosNota] = useState<string[]>([])
  const [projetoRapido, setProjetoRapido] = useState(false)

  /** Lê o XML da nota e pré-preenche a carga (P11, "Nota da uva"). */
  async function importarXml(arquivo: File) {
    setErro(null)
    const dados = new FormData()
    dados.set('arquivo', arquivo)
    try {
      const r = await api.post<{
        nfeId: string
        nfNumero: string
        nfSerie: string | null
        nfEmissao: string
        nfChave: string
        fornecedor: { id: string | null; nome: string; novo: boolean }
        itens: Array<{
          nfeItemId: string
          descricao: string
          kg: string | null
          variedadeId: string | null
        }>
        avisos: string[]
      }>('/api/romaneios/importar-xml', dados)
      await qc.invalidateQueries({ queryKey: ['pessoas-opcoes', 'produtor_uva'] })
      setAvisosNota([
        ...(r.fornecedor.novo
          ? [
              `${r.fornecedor.nome} foi cadastrado como produtor de uva; complete o número do SIVIBE em Pessoas.`,
            ]
          : []),
        ...r.avisos,
      ])
      setD({
        ...d,
        nfeId: r.nfeId,
        nfNumero: r.nfNumero,
        nfSerie: r.nfSerie ?? '',
        nfEmissao: r.nfEmissao,
        nfChave: r.nfChave,
        origem: 'fornecedor',
        fornecedorId: r.fornecedor.id ?? '',
        itens: r.itens.map((i) => ({
          ...itemVazio(),
          nfeItemId: i.nfeItemId,
          variedadeId: i.variedadeId ?? '',
          observacoes: i.descricao,
          // O peso da nota é o declarado; a balança da vinícola confirma ou corrige.
          pesagens: [{ pesadoEm: agora(), brutoKg: i.kg, taraKg: null }],
        })),
      })
    } catch (e) {
      setErro((e as Error).message)
    }
  }
  const muda = (n: number, parcial: Partial<ItemForm>) =>
    setD({ ...d, itens: d.itens.map((x, j) => (j === n ? { ...x, ...parcial } : x)) })
  const mudaPesagem = (n: number, p: number, parcial: Partial<PesagemForm>) =>
    muda(n, { pesagens: d.itens[n]!.pesagens.map((x, j) => (j === p ? { ...x, ...parcial } : x)) })

  const corpo = () => ({
    ...d,
    chegadaEm: doCampo(d.chegadaEm),
    fornecedorId: d.origem === 'fornecedor' ? d.fornecedorId : null,
    versao: atual?.versao,
    itens: d.itens.map((i) => ({
      ...i,
      pesagens: i.pesagens
        .filter((p) => p.brutoKg)
        .map((p) => ({
          pesadoEm: doCampo(p.pesadoEm),
          brutoKg: p.brutoKg,
          taraKg: p.taraKg ?? '0',
        })),
    })),
  })

  async function salvar(): Promise<string | null> {
    setErro(null)
    try {
      if (atual) {
        await api.put(`/api/romaneios/${atual.id}`, corpo())
        await qc.invalidateQueries({ queryKey: ['romaneio', atual.id] })
        return atual.id
      }
      const r = await api.post<{ id: string }>('/api/romaneios', corpo())
      return r.id
    } catch (e) {
      setErro(
        e instanceof ErroApi && e.campos?.length
          ? `${e.message} ${e.campos.map((c) => c.mensagem).join(' ')}`
          : (e as Error).message,
      )
      return null
    }
  }

  const variedadeNome = (id: string) => variedades.data?.find((v) => v.id === id)?.nome
  const parcelas = (propriedades.data ?? []).flatMap((p) =>
    p.parcelas.map((x) => ({ ...x, propriedade: p.nome })),
  )

  return (
    <div className="flex flex-col gap-5">
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {avisosNota.map((a) => (
        <Aviso key={a} tom="alerta">
          {a}
        </Aviso>
      ))}
      {d.nfeId && (
        <Aviso tom="info">
          Preenchido pela nota {d.nfNumero}. Confira as variedades e as pesagens antes de confirmar.
        </Aviso>
      )}
      <Cartao>
        <CabecalhoCartao
          titulo="Carga"
          acoes={
            !d.nfeId &&
            pode(s, F, 'importar') && (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                Importar XML da nota
                <input
                  type="file"
                  accept=".xml,text/xml,application/xml"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) void importarXml(f)
                  }}
                />
              </label>
            )
          }
        />
        <CorpoCartao className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo rotulo="Chegada" id="rom-chegada" obrigatorio>
            <Entrada
              id="rom-chegada"
              type="datetime-local"
              value={d.chegadaEm}
              onChange={(e) => setD({ ...d, chegadaEm: e.target.value })}
            />
          </Campo>
          <Campo rotulo="Projeto" id="rom-projeto" obrigatorio>
            <div className="flex gap-2">
              <Selecao
                id="rom-projeto"
                value={d.projetoId}
                onChange={(e) => setD({ ...d, projetoId: e.target.value })}
              >
                <option value="">Escolha</option>
                {projetos.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo} · {p.nome}
                  </option>
                ))}
              </Selecao>
              {pode(s, 'enotrace.projetos', 'criar') && (
                <Botao
                  variante="secundario"
                  tamanho="icone"
                  aria-label="Novo projeto"
                  onClick={() => setProjetoRapido(true)}
                >
                  <Plus />
                </Botao>
              )}
            </div>
          </Campo>
          <Campo rotulo="Origem" id="rom-origem">
            <Selecao
              id="rom-origem"
              value={d.origem}
              onChange={(e) => setD({ ...d, origem: e.target.value as typeof d.origem })}
            >
              <option value="fornecedor">Fornecedor (uva comprada)</option>
              <option value="vinhedo_proprio">Vinhedo próprio</option>
            </Selecao>
          </Campo>
          {d.origem === 'fornecedor' && (
            <Campo
              rotulo="Fornecedor"
              id="rom-fornecedor"
              obrigatorio
              ajuda="Pessoa com o papel de produtor de uva, com o número do SIVIBE."
            >
              <Selecao
                id="rom-fornecedor"
                value={d.fornecedorId}
                onChange={(e) => setD({ ...d, fornecedorId: e.target.value })}
              >
                <option value="">Escolha</option>
                {produtores.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
          )}
          <Campo
            rotulo="Dono da uva"
            id="rom-dono"
            ajuda="Só na vinificação para terceiro: o vinho será do cliente."
          >
            <Selecao id="rom-dono" value={d.donoUvaId} onChange={(e) => mudarDono(e.target.value)}>
              <option value="">A própria vinícola</option>
              {clientes.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          {d.donoUvaId && (
            <Campo
              rotulo="Contrato de terceirização"
              id="rom-contrato"
              ajuda={
                contratos.data && !contratos.data.length
                  ? 'Nenhum contrato vigente com o dono da uva na data. A confirmação pede "ciente".'
                  : 'Contratos vigentes com o dono da uva na data da chegada.'
              }
            >
              <Selecao
                id="rom-contrato"
                value={d.contratoId}
                onChange={(e) => setD({ ...d, contratoId: e.target.value })}
              >
                <option value="">Sem contrato</option>
                {contratos.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.numero ?? `Desde ${formatarData(c.vigenciaInicio)}`}
                  </option>
                ))}
                {atual?.contratoId &&
                  atual.contratoId === d.contratoId &&
                  !contratos.data?.some((c) => c.id === atual.contratoId) && (
                    <option value={atual.contratoId}>{atual.contrato}</option>
                  )}
              </Selecao>
            </Campo>
          )}
        </CorpoCartao>
      </Cartao>

      <Cartao>
        <CabecalhoCartao
          titulo="Nota fiscal e transporte"
          descricao="Quando a uva é comprada ou vem de terceiro. O transporte é opcional (exigido no RS)."
        />
        <CorpoCartao className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo rotulo="Número da nota" id="rom-nf">
            <Entrada
              id="rom-nf"
              inputMode="numeric"
              value={d.nfNumero}
              onChange={(e) => setD({ ...d, nfNumero: e.target.value })}
            />
          </Campo>
          <Campo rotulo="Série" id="rom-serie">
            <Entrada
              id="rom-serie"
              value={d.nfSerie}
              onChange={(e) => setD({ ...d, nfSerie: e.target.value })}
            />
          </Campo>
          <Campo rotulo="Emissão" id="rom-emissao">
            <Entrada
              id="rom-emissao"
              type="date"
              value={d.nfEmissao}
              onChange={(e) => setD({ ...d, nfEmissao: e.target.value })}
            />
          </Campo>
          <Campo rotulo="Chave de acesso" id="rom-chave">
            <Entrada
              id="rom-chave"
              inputMode="numeric"
              maxLength={44}
              value={d.nfChave}
              onChange={(e) => setD({ ...d, nfChave: e.target.value.replace(/\D/g, '') })}
            />
          </Campo>
          <Campo rotulo="Transportador" id="rom-transportador">
            <Selecao
              id="rom-transportador"
              value={d.transportadorId}
              onChange={(e) => setD({ ...d, transportadorId: e.target.value })}
            >
              <option value="">—</option>
              {transportadores.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Placa" id="rom-placa">
            <Entrada
              id="rom-placa"
              value={d.placa}
              onChange={(e) => setD({ ...d, placa: e.target.value.toUpperCase() })}
            />
          </Campo>
          <Campo rotulo="Caixas" id="rom-caixas">
            <Entrada
              id="rom-caixas"
              inputMode="numeric"
              value={d.caixas ?? ''}
              onChange={(e) =>
                setD({
                  ...d,
                  caixas: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null,
                })
              }
            />
          </Campo>
        </CorpoCartao>
      </Cartao>

      {d.itens.map((i, n) => {
        const liquido = i.pesagens.reduce(
          (t, p) => t + (Number(p.brutoKg ?? 0) - Number(p.taraKg ?? 0)),
          0,
        )
        return (
          <Cartao key={n}>
            <CabecalhoCartao
              titulo={variedadeNome(i.variedadeId) ?? `Variedade ${n + 1}`}
              descricao={`Peso líquido: ${kg(liquido.toFixed(1))}`}
              acoes={
                d.itens.length > 1 && (
                  <Botao
                    variante="fantasma"
                    tamanho="pequeno"
                    onClick={() => setD({ ...d, itens: d.itens.filter((_, j) => j !== n) })}
                  >
                    <Trash2 /> Remover
                  </Botao>
                )
              }
            />
            <CorpoCartao className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Campo rotulo="Variedade" id={`it-var-${n}`} obrigatorio>
                  <Selecao
                    id={`it-var-${n}`}
                    value={i.variedadeId}
                    onChange={(e) => muda(n, { variedadeId: e.target.value })}
                  >
                    <option value="">Escolha</option>
                    {variedades.data?.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.nome}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
                <Campo
                  rotulo="Parcela"
                  id={`it-parc-${n}`}
                  ajuda={parcelas.length ? undefined : 'Cadastre em Vinhedos.'}
                >
                  <Selecao
                    id={`it-parc-${n}`}
                    value={i.parcelaId}
                    onChange={(e) => muda(n, { parcelaId: e.target.value })}
                  >
                    <option value="">—</option>
                    {parcelas.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.propriedade} · {x.nome}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
                <Campo
                  rotulo="Colheita"
                  id={`it-colheita-${n}`}
                  obrigatorio
                  ajuda="A safra vem do ano da colheita."
                >
                  <Entrada
                    id={`it-colheita-${n}`}
                    type="date"
                    value={i.dataColheita}
                    onChange={(e) => muda(n, { dataColheita: e.target.value })}
                  />
                </Campo>
                <Campo rotulo="Ciclo" id={`it-ciclo-${n}`}>
                  <Selecao
                    id={`it-ciclo-${n}`}
                    disabled={!ciclos.data?.length}
                    value={i.ciclo}
                    onChange={(e) => muda(n, { ciclo: e.target.value })}
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
              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <Campo rotulo="°Brix" id={`it-brix-${n}`} ajuda="Obrigatório para confirmar.">
                  <CampoNumero
                    id={`it-brix-${n}`}
                    casas={2}
                    valor={i.brix}
                    aoMudar={(v) => muda(n, { brix: v })}
                  />
                </Campo>
                <Campo rotulo="pH" id={`it-ph-${n}`}>
                  <CampoNumero
                    id={`it-ph-${n}`}
                    casas={2}
                    valor={i.ph}
                    aoMudar={(v) => muda(n, { ph: v })}
                  />
                </Campo>
                <Campo rotulo="Acidez total" id={`it-acidez-${n}`}>
                  <CampoNumero
                    id={`it-acidez-${n}`}
                    casas={2}
                    unidade="g/L"
                    valor={i.acidezTotal}
                    aoMudar={(v) => muda(n, { acidezTotal: v })}
                  />
                </Campo>
                <Campo rotulo="Sanidade" id={`it-sanidade-${n}`} ajuda="% de podridão">
                  <CampoNumero
                    id={`it-sanidade-${n}`}
                    casas={2}
                    unidade="%"
                    valor={i.sanidade}
                    aoMudar={(v) => muda(n, { sanidade: v })}
                  />
                </Campo>
                <Campo rotulo="Temperatura" id={`it-temp-${n}`}>
                  <CampoNumero
                    id={`it-temp-${n}`}
                    casas={1}
                    unidade="°C"
                    valor={i.temperatura}
                    aoMudar={(v) => muda(n, { temperatura: v })}
                  />
                </Campo>
              </div>
              <div className="flex flex-wrap gap-6">
                <Caixa
                  rotulo="Uva orgânica"
                  checked={i.organica}
                  onChange={(e) => muda(n, { organica: e.target.checked })}
                />
                <Caixa
                  rotulo="Candidata à IP"
                  checked={i.candidataIp}
                  onChange={(e) => muda(n, { candidataIp: e.target.checked })}
                />
              </div>
              <p className="text-sm font-medium">Pesagens</p>
              {i.pesagens.map((p, pi) => (
                <div
                  key={pi}
                  className="grid items-end gap-2 sm:grid-cols-[14rem_1fr_1fr_8rem_auto]"
                >
                  <Campo rotulo="Data e hora" id={`pes-data-${n}-${pi}`}>
                    <Entrada
                      id={`pes-data-${n}-${pi}`}
                      type="datetime-local"
                      value={p.pesadoEm}
                      onChange={(e) => mudaPesagem(n, pi, { pesadoEm: e.target.value })}
                    />
                  </Campo>
                  <Campo rotulo="Bruto" id={`pes-bruto-${n}-${pi}`}>
                    <CampoNumero
                      id={`pes-bruto-${n}-${pi}`}
                      casas={1}
                      unidade="kg"
                      valor={p.brutoKg}
                      aoMudar={(v) => mudaPesagem(n, pi, { brutoKg: v })}
                    />
                  </Campo>
                  <Campo rotulo="Tara" id={`pes-tara-${n}-${pi}`}>
                    <CampoNumero
                      id={`pes-tara-${n}-${pi}`}
                      casas={1}
                      unidade="kg"
                      valor={p.taraKg}
                      aoMudar={(v) => mudaPesagem(n, pi, { taraKg: v })}
                    />
                  </Campo>
                  <p className="pb-2 text-right text-sm">
                    {kg((Number(p.brutoKg ?? 0) - Number(p.taraKg ?? 0)).toFixed(1))}
                  </p>
                  <Botao
                    variante="fantasma"
                    tamanho="icone"
                    aria-label="Remover pesagem"
                    onClick={() => muda(n, { pesagens: i.pesagens.filter((_, j) => j !== pi) })}
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
                    muda(n, {
                      pesagens: [...i.pesagens, { pesadoEm: agora(), brutoKg: null, taraKg: null }],
                    })
                  }
                >
                  <Plus /> Pesagem
                </Botao>
              </div>
            </CorpoCartao>
          </Cartao>
        )
      })}
      <div className="flex flex-wrap gap-2">
        <Botao
          variante="secundario"
          onClick={() => setD({ ...d, itens: [...d.itens, itemVazio()] })}
        >
          <Plus /> Variedade
        </Botao>
      </div>
      <Campo rotulo="Observações" id="rom-obs">
        <AreaTexto
          id="rom-obs"
          value={d.observacoes}
          onChange={(e) => setD({ ...d, observacoes: e.target.value })}
        />
      </Campo>
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Botao
          variante="secundario"
          onClick={async () => {
            const id = await salvar()
            if (id && !atual) navegar(`/enotrace/recepcao/${id}`, { replace: true })
          }}
        >
          Salvar rascunho
        </Botao>
        {pode(s, F, 'confirmar') && (
          <Botao
            onClick={async () => {
              const id = await salvar()
              // A página do rascunho (recarregada com a versão nova) abre a confirmação.
              if (id) navegar(`/enotrace/recepcao/${id}?confirmar=1`, { replace: true })
            }}
          >
            Confirmar recepção
          </Botao>
        )}
        {atual && (
          <Botao
            variante="fantasma"
            className="ml-auto"
            onClick={async () => {
              if (!window.confirm('Descartar este rascunho?')) return
              await api.post(`/api/romaneios/${atual.id}/descartar`)
              navegar('/enotrace/recepcao', { replace: true })
            }}
          >
            Descartar rascunho
          </Botao>
        )}
      </div>
      {projetoRapido && (
        <ProjetoRapido
          aoFechar={() => setProjetoRapido(false)}
          aoCriar={(id) => {
            setD({ ...d, projetoId: id })
            setProjetoRapido(false)
          }}
        />
      )}
    </div>
  )
}

/** Prévia da confirmação: o que falta (bloqueia) e os avisos que pedem "ciente" (P29). */
function Confirmar({
  id,
  aoFechar,
  aoConfirmar,
}: {
  id: string
  aoFechar: () => void
  aoConfirmar: () => void
}) {
  const q = useQuery({
    queryKey: ['romaneio-previa', id],
    queryFn: () =>
      api.get<{
        bloqueios: string[]
        avisos: Array<{ codigo: string; mensagem: string; fonte?: string }>
      }>(`/api/romaneios/${id}/previa`),
  })
  const [cientes, setCientes] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const p = q.data
  const pode = !!p && !p.bloqueios.length && p.avisos.every((a) => cientes.includes(a.codigo))
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo="Confirmar a recepção"
      descricao="Depois de confirmado, o romaneio ganha o código e não se edita mais; correções, só por estorno."
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao
            disabled={!pode}
            onClick={async () => {
              try {
                await api.post(`/api/romaneios/${id}/confirmar`, { cientes })
                aoConfirmar()
              } catch (e) {
                setErro((e as Error).message)
              }
            }}
          >
            Confirmar
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {!p && <p className="text-sm text-muted-foreground">Conferindo…</p>}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {p?.bloqueios.map((b) => (
          <Aviso key={b} tom="erro">
            {b}
          </Aviso>
        ))}
        {p?.avisos.map((a) => (
          <Aviso key={a.codigo} tom="alerta">
            <p>
              {a.mensagem} {a.fonte && <span className="text-xs">({a.fonte})</span>}
            </p>
            <Caixa
              rotulo="Estou ciente"
              checked={cientes.includes(a.codigo)}
              onChange={(e) =>
                setCientes(
                  e.target.checked ? [...cientes, a.codigo] : cientes.filter((c) => c !== a.codigo),
                )
              }
            />
          </Aviso>
        ))}
        {p && !p.bloqueios.length && !p.avisos.length && (
          <p className="text-sm">Tudo certo para confirmar.</p>
        )}
      </div>
    </Dialogo>
  )
}

export function NovaRecepcao() {
  return (
    <Pagina titulo="Nova recepção" trilha={['EnoTrace', 'Recepção da uva']}>
      <FormularioRomaneio atual={null} />
    </Pagina>
  )
}

// Ficha ------------------------------------------------------------------------------------------

export function FichaRecepcao() {
  const { id = '' } = useParams()
  const [busca, setBusca] = useSearchParams()
  const qc = useQueryClient()
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  const [estornando, setEstornando] = useState(false)
  const q = useQuery({
    queryKey: ['romaneio', id],
    queryFn: () => api.get<Romaneio>(`/api/romaneios/${id}`),
  })
  if (!q.data)
    return (
      <p className="text-sm text-muted-foreground">
        {q.isError ? (q.error as Error).message : 'Carregando…'}
      </p>
    )
  const r = q.data
  if (r.situacao === 'rascunho') {
    return (
      <Pagina titulo="Recepção em rascunho" trilha={['EnoTrace', 'Recepção da uva']}>
        <FormularioRomaneio key={r.versao} atual={r} />
        {busca.get('confirmar') === '1' && (
          <Confirmar
            id={r.id}
            aoFechar={() => setBusca({}, { replace: true })}
            aoConfirmar={async () => {
              setBusca({}, { replace: true })
              await qc.invalidateQueries({ queryKey: ['romaneio', r.id] })
            }}
          />
        )}
      </Pagina>
    )
  }
  const total = r.itens.reduce((t, i) => t + Number(i.liquidoKg), 0)
  const saldo = r.itens.reduce((t, i) => t + Number(i.saldoKg), 0)
  return (
    <Pagina
      titulo={`Romaneio ${r.codigo}`}
      trilha={['EnoTrace', 'Recepção da uva']}
      acoes={
        r.situacao === 'confirmado' &&
        pode(s, F, 'estornar') && (
          <BotaoIcone rotulo="Estornar o romaneio" contorno aoClicar={() => setEstornando(true)}>
            <Undo2 />
          </BotaoIcone>
        )
      }
    >
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {r.situacao === 'estornado' ? (
          <Etiqueta tom="erro">Estornado</Etiqueta>
        ) : (
          <Etiqueta tom="sucesso">Confirmado</Etiqueta>
        )}
        <span>chegada {formatarDataHora(r.chegadaEm, fuso)}</span>
        <span>· {kg(total.toFixed(1))}</span>
        {r.situacao === 'confirmado' && <span>· a processar {kg(saldo.toFixed(1))}</span>}
      </p>
      {r.situacao === 'estornado' && r.estornadoEm && (
        <Aviso tom="erro">
          Estornado em {formatarDataHora(r.estornadoEm, fuso)}. Motivo: {r.motivoEstorno}
        </Aviso>
      )}
      <PedirMotivo
        aberto={estornando}
        aoMudar={setEstornando}
        titulo={`Estornar o romaneio ${r.codigo}`}
        descricao="Só sem uva processada: se a uva já foi para um recipiente, estorne antes a operação. A nota, se houver, volta à conferência para o romaneio certo."
        rotuloBotao="Estornar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/romaneios/${r.id}/estorno`, { motivo })
          await Promise.all(
            [['romaneio', r.id], ['lista'], ['uva-a-processar']].map((queryKey) =>
              qc.invalidateQueries({ queryKey }),
            ),
          )
        }}
      />
      <Abas defaultValue="dados">
        <ListaAbas>
          <Aba value="dados">Dados</Aba>
          <Aba value="anexos">Anexos</Aba>
          <Aba value="historico">Histórico</Aba>
        </ListaAbas>
        <ConteudoAba value="dados" className="flex flex-col gap-4">
          <Cartao>
            <CorpoCartao className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <p>
                Projeto:{' '}
                <Link className="underline" to={`/enotrace/projetos/${r.projetoId}`}>
                  {r.projeto}
                </Link>
              </p>
              <p>Origem: {r.origem === 'vinhedo_proprio' ? 'Vinhedo próprio' : r.fornecedor}</p>
              {r.donoUva && <p>Dono da uva: {r.donoUva}</p>}
              {r.contratoId && (
                <p>
                  Contrato:{' '}
                  <Link className="underline" to={`/enotrace/contratos/${r.contratoId}`}>
                    {r.contrato}
                  </Link>
                </p>
              )}
              {r.nfNumero && (
                <p>
                  Nota {r.nfNumero}
                  {r.nfSerie && `/${r.nfSerie}`}
                  {r.nfEmissao && ` de ${formatarData(r.nfEmissao)}`}
                </p>
              )}
              {r.transportador && (
                <p>
                  Transporte:{' '}
                  {[r.transportador, r.placa, r.caixas && `${r.caixas} caixas`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              {r.observacoes && <p className="sm:col-span-2">{r.observacoes}</p>}
            </CorpoCartao>
          </Cartao>
          {r.itens.map((i) => (
            <Cartao key={i.id}>
              <CabecalhoCartao
                titulo={i.variedade}
                descricao={`Safra ${i.safra}${i.ciclo ? `.${i.ciclo}` : ''} · colheita ${formatarData(i.dataColheita)}${i.parcela ? ` · ${i.parcela}` : ''}`}
                acoes={
                  r.situacao === 'estornado' ? undefined : Number(i.saldoKg) > 0 ? (
                    <Etiqueta tom="alerta">A processar: {kg(i.saldoKg)}</Etiqueta>
                  ) : (
                    <Etiqueta tom="sucesso">Processada</Etiqueta>
                  )
                }
              />
              <CorpoCartao className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                <p>Peso líquido: {kg(i.liquidoKg)}</p>
                <p>°Brix: {i.brix ? formatarDecimal(i.brix, 2) : '—'}</p>
                {i.ph && <p>pH: {formatarDecimal(i.ph, 2)}</p>}
                {i.acidezTotal && <p>Acidez total: {formatarDecimal(i.acidezTotal, 2)} g/L</p>}
                {i.sanidade && <p>Sanidade: {formatarDecimal(i.sanidade, 2)}% de podridão</p>}
                {i.temperatura && <p>Temperatura: {formatarDecimal(i.temperatura, 1)} °C</p>}
                {(i.organica || i.candidataIp) && (
                  <p>
                    {[i.organica && 'Orgânica', i.candidataIp && 'Candidata à IP']
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                <p className="sm:col-span-3 text-muted-foreground">
                  Pesagens:{' '}
                  {i.pesagens
                    .map(
                      (p) =>
                        `${formatarDataHora(p.pesadoEm, fuso)} ${kg(p.brutoKg)} − ${kg(p.taraKg)}`,
                    )
                    .join('; ')}
                </p>
              </CorpoCartao>
            </Cartao>
          ))}
        </ConteudoAba>
        <ConteudoAba value="anexos">
          <Anexos
            entidade="romaneio"
            registroId={id}
            podeAlterar={pode(s, F, 'editar')}
            fuso={fuso}
          />
        </ConteudoAba>
        <ConteudoAba value="historico">
          <Historico entidade="romaneio" registroId={id} fuso={fuso} />
        </ConteudoAba>
      </Abas>
    </Pagina>
  )
}
