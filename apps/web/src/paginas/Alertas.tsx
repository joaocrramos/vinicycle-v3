// Central de alertas (P20): abertos e resolvidos, com filtro por tipo, link para o registro e
// "marcar como lido". Os alertas se resolvem sozinhos quando a causa some.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { type Alerta, COR_GRAVIDADE } from '@/componentes/SinoAlertas'
import { Botao } from '@/componentes/ui/botao'
import { Cartao, CorpoCartao } from '@/componentes/ui/cartao'
import { Selecao } from '@/componentes/ui/campos'
import { Pagina } from '@/layout/Estrutura'
import { api } from '@/lib/api'
import { fusoAtivo, useSessao } from '@/lib/sessao'
import { cn, formatarDataHora } from '@/lib/utils'

const GRAVIDADES = { critico: 'Crítico', atencao: 'Atenção', info: 'Informação' } as const

export function PaginaAlertas() {
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  const qc = useQueryClient()
  const [situacao, setSituacao] = useState<'aberto' | 'resolvido'>('aberto')
  const [tipo, setTipo] = useState('')
  const q = useQuery({
    queryKey: ['alertas', situacao],
    queryFn: () => api.get<Alerta[]>(`/api/alertas?situacao=${situacao}`),
  })
  const tipos = [...new Map((q.data ?? []).map((a) => [a.tipo, a.nomeTipo])).entries()]
  const lista = (q.data ?? []).filter((a) => !tipo || a.tipo === tipo)
  const atualizar = async (forcar: boolean) => {
    if (forcar) await api.get('/api/alertas?atualizar=sim')
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['alertas'] }),
      qc.invalidateQueries({ queryKey: ['alertas-resumo'] }),
    ])
  }
  const marcar = async (ids: string[]) => {
    await api.post('/api/alertas/lidos', { ids })
    await atualizar(false)
  }
  return (
    <Pagina
      titulo="Alertas"
      acoes={
        <div className="flex gap-2">
          <Botao variante="secundario" onClick={() => void atualizar(true)}>
            Atualizar agora
          </Botao>
          {situacao === 'aberto' && (
            <Botao variante="secundario" onClick={() => void marcar([])}>
              Marcar todos como lidos
            </Botao>
          )}
        </div>
      }
    >
      <p className="text-sm text-muted-foreground">
        Vencimentos, validades, estoque, laudos, higienização, granel sem GLT, fermentações, plano e
        prazos. Cada alerta some sozinho quando a causa é resolvida. Você vê os das telas a que tem
        acesso.
      </p>
      <div className="flex flex-wrap gap-2">
        <Selecao
          aria-label="Situação"
          className="w-44"
          value={situacao}
          onChange={(e) => setSituacao(e.target.value as typeof situacao)}
        >
          <option value="aberto">Abertos</option>
          <option value="resolvido">Resolvidos</option>
        </Selecao>
        <Selecao
          aria-label="Tipo"
          className="w-56"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
        >
          <option value="">Todos os tipos</option>
          {tipos.map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Selecao>
      </div>
      <Cartao>
        <CorpoCartao className="flex flex-col divide-y p-0">
          {lista.map((a) => (
            <div key={a.id} className="flex flex-wrap items-start gap-3 px-5 py-3 text-sm">
              <span
                className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', COR_GRAVIDADE[a.gravidade])}
                title={GRAVIDADES[a.gravidade]}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  {a.nomeTipo} · {GRAVIDADES[a.gravidade]}
                  {a.estabelecimento && ` · ${a.estabelecimento}`} · desde{' '}
                  {formatarDataHora(a.abertoEm, fuso)}
                  {a.resolvidoEm && ` · resolvido em ${formatarDataHora(a.resolvidoEm, fuso)}`}
                </p>
                <p className={cn(!a.lido && situacao === 'aberto' && 'font-medium')}>
                  {a.link ? (
                    <Link className="underline" to={a.link} onClick={() => void marcar([a.id])}>
                      {a.mensagem}
                    </Link>
                  ) : (
                    a.mensagem
                  )}
                </p>
              </div>
              {situacao === 'aberto' && !a.lido && (
                <Botao variante="fantasma" tamanho="pequeno" onClick={() => void marcar([a.id])}>
                  Lido
                </Botao>
              )}
            </div>
          ))}
          {q.data && !lista.length && (
            <p className="px-5 py-6 text-center text-sm text-muted-foreground">
              {situacao === 'aberto' ? 'Nenhum alerta aberto.' : 'Nenhum alerta resolvido.'}
            </p>
          )}
          {q.isLoading && <p className="px-5 py-6 text-sm text-muted-foreground">Carregando…</p>}
        </CorpoCartao>
      </Cartao>
    </Pagina>
  )
}
