// EnoTrace › Carga inicial (cantina.md, Carga inicial; P23): o saldo de abertura por planilha CSV,
// com modelo para baixar, conferência linha a linha antes de gravar (tudo ou nada), histórico das
// cargas com o arquivo e estorno.
import { Undo2 } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { BotaoIcone } from '@/componentes/AcoesLinha'
import { PedirMotivo } from '@/componentes/PedirMotivo'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao'
import { Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { Pagina } from '@/layout/Estrutura'
import { api, ErroApi } from '@/lib/api'
import { fusoAtivo, useSessao } from '@/lib/sessao'
import { formatarDataHora } from '@/lib/utils'

const TIPOS = {
  saldo_granel: {
    nome: 'Granel (vinho e mosto nos recipientes)',
    ajuda:
      'Uma linha por variedade de cada recipiente; os litros vão na primeira linha do recipiente. Projeto pelo código ou pelo nome (o que não existe é criado). A coluna "lote" agrupa recipientes do mesmo lote (vazio = um lote por projeto). O recipiente precisa estar vazio.',
  },
  saldo_garrafas: {
    nome: 'Garrafas (produto acabado)',
    ajuda:
      'Produto pelo nome e formato em mL (cadastrados em Produtos), o lote comercial do contrarrótulo, o local de estoque e as garrafas.',
  },
  saldo_itens: {
    nome: 'Insumos e embalagens',
    ajuda:
      'Item pelo nome (cadastrado em Insumos e embalagens), local de estoque, lote e validade (quando houver) e a quantidade na unidade do item.',
  },
} as const
type Tipo = keyof typeof TIPOS

interface Resultado {
  linhas: number
  erros: Array<{ linha: number; mensagem: string }>
  resumo: Record<string, number>
}

const NOMES_RESUMO: Record<string, string> = {
  recipientes: 'recipientes',
  lotes: 'lotes',
  projetosNovos: 'projetos novos',
  litros: 'litros',
  linhas: 'linhas',
  garrafas: 'garrafas',
}

const dataPadrao = () => `${new Date().getFullYear() - 1}-12-31T23:59`

export function PaginaCargaInicial() {
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  const qc = useQueryClient()
  const [tipo, setTipo] = useState<Tipo>('saldo_granel')
  const [data, setData] = useState(dataPadrao)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aplicada, setAplicada] = useState<string | null>(null)
  const [estornando, setEstornando] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const historico = useQuery({
    queryKey: ['carga-inicial'],
    queryFn: () =>
      api.get<
        Array<{
          id: string
          tipo: Tipo
          dataSaldo: string
          nomeArquivo: string
          linhas: number
          situacao: 'aplicada' | 'estornada'
          operacaoId: string | null
          criadoEm: string
          motivoEstorno: string | null
        }>
      >('/api/carga-inicial'),
  })
  const limpar = () => {
    setResultado(null)
    setErro(null)
    setAplicada(null)
  }
  async function enviar(aplicar: boolean) {
    if (!arquivo) return
    setErro(null)
    setEnviando(true)
    const dados = new FormData()
    dados.set('arquivo', arquivo)
    const url = `/api/carga-inicial${aplicar ? '' : '/validar'}?tipo=${tipo}&data=${encodeURIComponent(new Date(data).toISOString())}`
    try {
      const r = await api.post<Resultado>(url, dados)
      setResultado(r)
      if (aplicar) {
        setAplicada(`Carga aplicada: ${r.linhas} linhas.`)
        setArquivo(null)
        await qc.invalidateQueries({ queryKey: ['carga-inicial'] })
      }
    } catch (e) {
      const detalhes = e instanceof ErroApi ? (e.detalhes as { erros?: Resultado['erros'] }) : null
      if (detalhes?.erros) setResultado({ linhas: 0, erros: detalhes.erros, resumo: {} })
      setErro((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }
  const semErros = !!resultado && !resultado.erros.length
  return (
    <Pagina titulo="Carga inicial" trilha={['Configurações', 'Conta e dados']}>
      <p className="text-sm text-muted-foreground">
        O saldo de abertura numa data (ex.: 31/12/2025): o vinho nos recipientes, as garrafas e os
        insumos. A planilha é conferida linha a linha antes de gravar; com qualquer erro, nada entra
        (P23). Tudo fica marcado como carga inicial.
      </p>
      <Cartao>
        <CabecalhoCartao titulo="Nova carga" />
        <CorpoCartao className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="O que carregar" id="ci-tipo">
              <Selecao
                id="ci-tipo"
                value={tipo}
                onChange={(e) => {
                  setTipo(e.target.value as Tipo)
                  limpar()
                }}
              >
                {Object.entries(TIPOS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Data do saldo" id="ci-data" ajuda="O saldo entra com esta data e hora.">
              <Entrada
                id="ci-data"
                type="datetime-local"
                value={data}
                onChange={(e) => {
                  setData(e.target.value)
                  limpar()
                }}
              />
            </Campo>
          </div>
          <p className="text-sm text-muted-foreground">{TIPOS[tipo].ajuda}</p>
          <div className="flex flex-wrap items-center gap-3">
            <a className="text-sm underline" href={`/api/carga-inicial/modelo/${tipo}`} download>
              Baixar o modelo (CSV)
            </a>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
              {arquivo ? arquivo.name : 'Escolher a planilha'}
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  setArquivo(e.target.files?.[0] ?? null)
                  e.target.value = ''
                  limpar()
                }}
              />
            </label>
          </div>
          {resultado && resultado.erros.length > 0 && (
            <Aviso tom="erro">
              <p className="font-medium">
                {resultado.erros.length} {resultado.erros.length === 1 ? 'erro' : 'erros'}: nada foi
                gravado.
              </p>
              <ul className="mt-1 list-disc pl-5">
                {resultado.erros.slice(0, 50).map((e, n) => (
                  <li key={n}>
                    {e.linha ? `Linha ${e.linha}: ` : ''}
                    {e.mensagem}
                  </li>
                ))}
              </ul>
            </Aviso>
          )}
          {semErros && !aplicada && (
            <Aviso tom="sucesso">
              Planilha conferida: {resultado!.linhas} linhas, sem erros.{' '}
              {Object.entries(resultado!.resumo)
                .map(([k, v]) => `${v.toLocaleString('pt-BR')} ${NOMES_RESUMO[k] ?? k}`)
                .join(', ')}
              .
            </Aviso>
          )}
          {aplicada && <Aviso tom="sucesso">{aplicada}</Aviso>}
          {erro && !resultado?.erros.length && <Aviso tom="erro">{erro}</Aviso>}
          <div className="flex gap-2">
            <Botao
              variante="secundario"
              disabled={!arquivo || enviando}
              onClick={() => void enviar(false)}
            >
              Conferir a planilha
            </Botao>
            <Botao disabled={!arquivo || !semErros || enviando} onClick={() => void enviar(true)}>
              Aplicar a carga
            </Botao>
          </div>
        </CorpoCartao>
      </Cartao>
      <Cartao>
        <CabecalhoCartao titulo="Cargas feitas" />
        <CorpoCartao className="flex flex-col divide-y p-0 text-sm">
          {historico.data?.map((h) => (
            <div key={h.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p>
                  {TIPOS[h.tipo].nome} · saldo de {formatarDataHora(h.dataSaldo, fuso)} · {h.linhas}{' '}
                  linhas
                </p>
                <p className="text-muted-foreground">
                  {h.nomeArquivo} · {formatarDataHora(h.criadoEm, fuso)}
                  {h.operacaoId && (
                    <>
                      {' · '}
                      <Link className="underline" to={`/enotrace/operacoes/${h.operacaoId}`}>
                        operação
                      </Link>
                    </>
                  )}
                  {h.motivoEstorno && ` · estornada: ${h.motivoEstorno}`}
                </p>
              </div>
              <Etiqueta tom={h.situacao === 'aplicada' ? 'sucesso' : 'neutro'}>
                {h.situacao === 'aplicada' ? 'Aplicada' : 'Estornada'}
              </Etiqueta>
              {h.situacao === 'aplicada' && (
                <BotaoIcone rotulo="Estornar a carga" aoClicar={() => setEstornando(h.id)}>
                  <Undo2 />
                </BotaoIcone>
              )}
            </div>
          ))}
          {historico.data && !historico.data.length && (
            <p className="px-5 py-6 text-center text-muted-foreground">Nenhuma carga.</p>
          )}
        </CorpoCartao>
      </Cartao>
      <PedirMotivo
        aberto={!!estornando}
        aoMudar={(v) => !v && setEstornando(null)}
        titulo="Estornar a carga"
        descricao="Desfaz a carga inteira. Se já houver movimento depois dela nos mesmos recipientes ou itens, estorne-os antes."
        rotuloBotao="Estornar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/carga-inicial/${estornando}/estorno`, { motivo })
          setEstornando(null)
          await qc.invalidateQueries({ queryKey: ['carga-inicial'] })
        }}
      />
    </Pagina>
  )
}
