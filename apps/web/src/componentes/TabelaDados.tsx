// Componente único de listagem (P4): ordenação pelo título da coluna, busca e filtros acima,
// paginação (10, 20, 50, 100, Tudo) com o total, tudo feito no servidor. Lembra, por usuário e
// por tabela, a última ordenação, os filtros e o tamanho de página; exporta o resultado filtrado.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { type RespostaListagem, TAMANHO_TUDO, TAMANHOS_PAGINA } from '@vinicycle/shared'
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Search } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, query } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Botao } from './ui/botao'
import { Entrada, Selecao } from './ui/campos'

export interface Coluna<T> {
  id: string
  titulo: string
  ordenavel?: boolean
  celula: (item: T) => ReactNode
  /** Texto exportado; sem ele, a coluna não vai para o arquivo. */
  exportar?: (item: T) => string | number | null | undefined
  className?: string
}

interface Estado {
  pagina: number
  tamanho: number
  ordem: string | null
  direcao: 'asc' | 'desc' | null
  busca: string
  filtros: Record<string, string>
}

function csv(linhas: Array<Array<string | number | null | undefined>>): string {
  const celula = (v: string | number | null | undefined) => {
    const t = v === null || v === undefined ? '' : String(v)
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  // Ponto e vírgula e BOM: o Excel em português abre direto, com acentos.
  return '﻿' + linhas.map((l) => l.map(celula).join(';')).join('\r\n')
}

export function TabelaDados<T extends { id: string }>({
  tabela,
  url,
  colunas,
  ordemPadrao,
  filtros: renderFiltros,
  filtrosIniciais = {},
  aoClicar,
  acoes,
  vazio,
  nomeArquivo,
  podeExportar = true,
}: {
  /** Identificador para lembrar as preferências. */
  tabela: string
  url: string
  colunas: Coluna<T>[]
  ordemPadrao: { campo: string; direcao: 'asc' | 'desc' }
  filtros?: (valores: Record<string, string>, definir: (k: string, v: string) => void) => ReactNode
  filtrosIniciais?: Record<string, string>
  aoClicar?: (item: T) => void
  acoes?: ReactNode
  vazio?: ReactNode
  nomeArquivo?: string
  podeExportar?: boolean
}) {
  const { t } = useTranslation()
  const [estado, setEstado] = useState<Estado>({
    pagina: 1,
    tamanho: 10,
    ordem: null,
    direcao: null,
    busca: '',
    filtros: filtrosIniciais,
  })
  const [busca, setBusca] = useState('')
  const [carregouPreferencia, setCarregouPreferencia] = useState(false)
  const salvar = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    let ativo = true
    api
      .get<{
        ordem: string | null
        direcao: 'asc' | 'desc' | null
        tamanho: number
        filtros: Record<string, string>
      } | null>(`/api/preferencias-listagem/${tabela}`)
      .then((p) => {
        if (!ativo || !p) return
        const { busca: b = '', ...filtros } = p.filtros ?? {}
        setEstado((e) => ({
          ...e,
          ordem: p.ordem,
          direcao: p.direcao,
          tamanho: p.tamanho,
          busca: b,
          filtros: { ...e.filtros, ...filtros },
        }))
        setBusca(b)
      })
      .catch(() => {})
      .finally(() => ativo && setCarregouPreferencia(true))
    return () => {
      ativo = false
    }
  }, [tabela])

  useEffect(() => {
    if (!carregouPreferencia) return
    clearTimeout(salvar.current)
    salvar.current = setTimeout(() => {
      void api
        .put(`/api/preferencias-listagem/${tabela}`, {
          ordem: estado.ordem,
          direcao: estado.direcao,
          tamanho: estado.tamanho,
          filtros: { ...estado.filtros, busca: estado.busca },
        })
        .catch(() => {})
    }, 800)
  }, [tabela, estado, carregouPreferencia])

  // A busca vai ao servidor depois de uma pausa na digitação.
  useEffect(() => {
    const id = setTimeout(
      () => setEstado((e) => (e.busca === busca ? e : { ...e, busca, pagina: 1 })),
      300,
    )
    return () => clearTimeout(id)
  }, [busca])

  const parametros = {
    pagina: estado.pagina,
    tamanho: estado.tamanho,
    ordem: estado.ordem ?? undefined,
    direcao: estado.direcao ?? undefined,
    busca: estado.busca,
    ...estado.filtros,
  }
  const q = useQuery({
    queryKey: ['lista', url, parametros],
    queryFn: () => api.get<RespostaListagem<T>>(url + query(parametros)),
    enabled: carregouPreferencia,
    placeholderData: keepPreviousData,
  })

  const ordemAtual = estado.ordem ?? ordemPadrao.campo
  const direcaoAtual = estado.ordem ? (estado.direcao ?? 'asc') : ordemPadrao.direcao
  const ordenar = (id: string) =>
    setEstado((e) => ({
      ...e,
      pagina: 1,
      ordem: id,
      direcao: ordemAtual === id && direcaoAtual === 'asc' ? 'desc' : 'asc',
    }))

  const total = q.data?.total ?? 0
  const paginas =
    estado.tamanho === TAMANHO_TUDO ? 1 : Math.max(1, Math.ceil(total / estado.tamanho))

  async function exportar() {
    const tudo = await api.get<RespostaListagem<T>>(
      url + query({ ...parametros, pagina: 1, tamanho: TAMANHO_TUDO }),
    )
    await api.post('/api/exportacoes', { tabela, registros: tudo.itens.length })
    const cols = colunas.filter((c) => c.exportar)
    const conteudo = csv([
      cols.map((c) => c.titulo),
      ...tudo.itens.map((i) => cols.map((c) => c.exportar!(i))),
    ])
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }))
    link.download = `${nomeArquivo ?? tabela}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Entrada
            type="search"
            aria-label={t('acoes.buscar')}
            placeholder={`${t('acoes.buscar')}…`}
            className="pl-9"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        {renderFiltros?.(estado.filtros, (k, v) =>
          setEstado((e) => ({ ...e, pagina: 1, filtros: { ...e.filtros, [k]: v } })),
        )}
        {podeExportar && (
          <Botao variante="secundario" onClick={() => void exportar()} disabled={!total}>
            <Download /> {t('acoes.exportar')}
          </Botao>
        )}
        {acoes}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left">
            <tr>
              {colunas.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className={cn('px-3 py-2 font-medium whitespace-nowrap', c.className)}
                >
                  {c.ordenavel ? (
                    <button
                      type="button"
                      className="inline-flex cursor-pointer items-center gap-1 hover:text-primary"
                      onClick={() => ordenar(c.id)}
                    >
                      {c.titulo}
                      {ordemAtual === c.id ? (
                        direcaoAtual === 'asc' ? (
                          <ArrowUp className="size-3.5" aria-label="crescente" />
                        ) : (
                          <ArrowDown className="size-3.5" aria-label="decrescente" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3.5 opacity-40" />
                      )}
                    </button>
                  ) : (
                    c.titulo
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {q.isLoading || !carregouPreferencia ? (
              <tr>
                <td
                  colSpan={colunas.length}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  {t('tabela.carregando')}
                </td>
              </tr>
            ) : q.isError ? (
              <tr>
                <td colSpan={colunas.length} className="px-3 py-8 text-center text-destructive">
                  {(q.error as Error).message}
                </td>
              </tr>
            ) : q.data?.itens.length ? (
              q.data.itens.map((item) => (
                <tr
                  key={item.id}
                  className={cn('border-t', aoClicar && 'cursor-pointer hover:bg-muted/50')}
                  onClick={aoClicar ? () => aoClicar(item) : undefined}
                >
                  {colunas.map((c) => (
                    <td key={c.id} className={cn('px-3 py-2', c.className)}>
                      {c.celula(item)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={colunas.length}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  {vazio ?? t('tabela.nenhum')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{t('tabela.total', { count: total })}</span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2">
            {t('tabela.porPagina')}
            <Selecao
              className="w-20"
              value={estado.tamanho}
              onChange={(e) =>
                setEstado((s) => ({ ...s, pagina: 1, tamanho: Number(e.target.value) }))
              }
            >
              {TAMANHOS_PAGINA.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value={TAMANHO_TUDO}>{t('tabela.tudo')}</option>
            </Selecao>
          </label>
          <Botao
            variante="secundario"
            tamanho="pequeno"
            disabled={estado.pagina <= 1}
            onClick={() => setEstado((s) => ({ ...s, pagina: s.pagina - 1 }))}
          >
            {t('tabela.anterior')}
          </Botao>
          <span>{t('tabela.pagina', { pagina: estado.pagina, total: paginas })}</span>
          <Botao
            variante="secundario"
            tamanho="pequeno"
            disabled={estado.pagina >= paginas}
            onClick={() => setEstado((s) => ({ ...s, pagina: s.pagina + 1 }))}
          >
            {t('tabela.proxima')}
          </Botao>
        </div>
      </div>
    </div>
  )
}
