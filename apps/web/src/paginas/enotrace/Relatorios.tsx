// EnoTrace › Relatórios da cantina. Por ora, a evaporação por barrica e período (cantina.md,
// Atesto em lote: "o relatório de evaporação mostra a perda de cada barrica por período").
import { useQuery } from '@tanstack/react-query'
import { formatarDecimal } from '@vinicycle/shared'
import { useState } from 'react'
import { Link } from 'react-router'
import { CabecalhoCartao, Cartao, CorpoCartao } from '@/componentes/ui/cartao'
import { Campo, Entrada } from '@/componentes/ui/campos'
import { Pagina } from '@/layout/Estrutura'
import { api } from '@/lib/api'
import { litros } from './Projetos'

interface LinhaEvaporacao {
  recipienteId: string
  recipiente: string
  tipo: string
  capacidade: string
  evaporacao: string
  atestos: number
  percentual: number
}

const hoje = () => new Intl.DateTimeFormat('en-CA').format(new Date())

function Evaporacao() {
  const [de, setDe] = useState(() => `${hoje().slice(0, 4)}-01-01`)
  const [ate, setAte] = useState(hoje)
  const q = useQuery({
    queryKey: ['relatorio-evaporacao', de, ate],
    queryFn: () => api.get<LinhaEvaporacao[]>(`/api/relatorios/evaporacao?de=${de}&ate=${ate}`),
    enabled: !!de && !!ate,
  })
  const total = (q.data ?? []).reduce((t, l) => t + Number(l.evaporacao), 0)
  return (
    <Cartao>
      <CabecalhoCartao
        titulo="Evaporação por recipiente"
        descricao="A evaporação lançada nos atestos, pela data da execução. Operações estornadas não entram."
      />
      <CorpoCartao className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-[12rem_12rem]">
          <Campo rotulo="De" id="ev-de">
            <Entrada id="ev-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </Campo>
          <Campo rotulo="Até" id="ev-ate">
            <Entrada id="ev-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </Campo>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Recipiente</th>
                <th className="py-2 pr-3 font-medium">Tipo</th>
                <th className="py-2 pr-3 text-right font-medium">Capacidade</th>
                <th className="py-2 pr-3 text-right font-medium">Atestos</th>
                <th className="py-2 pr-3 text-right font-medium">Evaporação</th>
                <th className="py-2 text-right font-medium">% da capacidade</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {q.data?.map((l) => (
                <tr key={l.recipienteId}>
                  <td className="py-2 pr-3 font-medium">
                    <Link className="underline" to={`/enotrace/recipientes/${l.recipienteId}`}>
                      {l.recipiente}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">{l.tipo}</td>
                  <td className="py-2 pr-3 text-right">{litros(l.capacidade)}</td>
                  <td className="py-2 pr-3 text-right">{l.atestos}</td>
                  <td className="py-2 pr-3 text-right">{litros(l.evaporacao)}</td>
                  <td className="py-2 text-right">
                    {formatarDecimal(l.percentual.toFixed(2), 2)}%
                  </td>
                </tr>
              ))}
              {q.data && !q.data.length && (
                <tr>
                  <td colSpan={6} className="py-6 text-muted-foreground">
                    Nenhuma evaporação no período.
                  </td>
                </tr>
              )}
            </tbody>
            {!!q.data?.length && (
              <tfoot>
                <tr className="border-t font-medium">
                  <td className="py-2 pr-3" colSpan={4}>
                    Total
                  </td>
                  <td className="py-2 pr-3 text-right">{litros(total.toFixed(2))}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {q.isError && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      </CorpoCartao>
    </Cartao>
  )
}

export function RelatoriosCantina() {
  return (
    <Pagina titulo="Relatórios da cantina" trilha={['EnoTrace']}>
      <Evaporacao />
    </Pagina>
  )
}
