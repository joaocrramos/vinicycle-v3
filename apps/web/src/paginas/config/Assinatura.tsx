// Configurações › Assinatura (ambiente-cliente.md): plano, adicionais, uso × limites e mudanças.
// Todos com a permissão veem; só o Master muda (P25).
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { PainelAssinatura } from '@/componentes/Assinatura'
import { DetalheFatura, type LinhaFatura, ListaFaturas } from '@/componentes/Faturas'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao } from '@/componentes/ui/cartao'
import { api } from '@/lib/api'
import { BotaoExportar } from './Exportar'
import { Pagina } from '@/layout/Estrutura'
import { useSessao } from '@/lib/sessao'

export function PaginaAssinatura() {
  const { data: s } = useSessao()
  const eMaster = !!s?.empresa?.eMaster
  const faturas = useQuery({
    queryKey: ['faturas', 'cliente'],
    queryFn: () => api.get<LinhaFatura[]>('/api/faturas'),
  })
  const [aberta, setAberta] = useState<string | null>(null)
  return (
    <Pagina titulo="Assinatura" trilha={['Configurações']}>
      {s?.empresa?.situacao === 'bloqueado' && eMaster && (
        <Aviso tom="erro">
          <span className="flex flex-wrap items-center justify-between gap-3">
            Empresa bloqueada: regularize as faturas em aberto abaixo. Os dados podem ser exportados
            a qualquer momento.
            <BotaoExportar />
          </span>
        </Aviso>
      )}
      {!eMaster && (
        <Aviso tom="info">Só o Master muda o plano, o ciclo e os adicionais da assinatura.</Aviso>
      )}
      <PainelAssinatura
        url="/api/assinatura"
        opcoesUrl="cliente"
        podeMudar={eMaster}
        plataforma={false}
      />
      <Cartao>
        <CabecalhoCartao
          titulo="Faturas"
          descricao="Clique numa fatura para ver os itens e os pagamentos."
        />
        <CorpoCartao>
          <ListaFaturas faturas={faturas.data ?? []} aoAbrir={setAberta} />
        </CorpoCartao>
      </Cartao>
      {aberta && <DetalheFatura id={aberta} plataforma={false} aoFechar={() => setAberta(null)} />}
    </Pagina>
  )
}
