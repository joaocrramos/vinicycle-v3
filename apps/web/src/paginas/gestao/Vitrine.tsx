// Conheça e contrate (ambiente-cliente.md, Módulos): os módulos que a empresa ainda não tem, fora
// do menu de trabalho. O Master contrata o módulo avulso na hora; qualquer usuário registra
// interesse, que chega à plataforma como oportunidade.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  formatarMoeda,
  NOMES_PERIODICIDADE,
  paraCentavos,
  type Periodicidade,
} from '@vinicycle/shared'
import { useState } from 'react'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao'
import { Pagina } from '@/layout/Estrutura'
import { api } from '@/lib/api'
import { useAtualizarSessao, type EstadoSessao, useSessao } from '@/lib/sessao'

interface ModuloVitrine {
  codigo: string
  nome: string
  funcao: string
  situacao: 'disponivel' | 'em_breve'
  avulso: { id: string; preco: string } | null
  periodicidade: Periodicidade | null
  interesse: boolean
}

const DESCRICOES: Record<string, string> = {
  VITITRACK: 'Viticultura: vinhedos, talhões, manejo, maturação e colheita.',
  ENOTRACE:
    'Cantina: projetos, recepção, lotes, recipientes, operações, laboratório e declarações.',
  ENOTUR: 'Enoturismo: experiências, agenda, reservas e visitantes.',
  ENOMESA: 'Gastronomia: cardápio, reservas de mesa, eventos e harmonização.',
}

export function PaginaVitrine() {
  const qc = useQueryClient()
  const { data: s } = useSessao()
  const atualizar = useAtualizarSessao()
  const q = useQuery({
    queryKey: ['vitrine'],
    queryFn: () => api.get<ModuloVitrine[]>('/api/vitrine'),
  })
  const [mensagem, setMensagem] = useState<{ tom: 'sucesso' | 'erro'; texto: string } | null>(null)
  const eMaster = !!s?.empresa?.eMaster
  const recarregar = () => qc.invalidateQueries({ queryKey: ['vitrine'] })
  return (
    <Pagina titulo="Conheça e contrate" trilha={['Gestão']}>
      <p className="text-sm text-muted-foreground">
        Os módulos que a empresa ainda não tem. Os disponíveis podem ser contratados como módulo
        avulso; nos que estão chegando, registre o interesse e a equipe do ViniCycle entra em
        contato.
      </p>
      {mensagem && <Aviso tom={mensagem.tom}>{mensagem.texto}</Aviso>}
      {q.data && !q.data.length && (
        <Aviso tom="info">A empresa já tem todos os módulos do ViniCycle.</Aviso>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        {q.data?.map((m) => (
          <Cartao key={m.codigo}>
            <CabecalhoCartao
              titulo={`${m.nome} · ${m.funcao}`}
              descricao={DESCRICOES[m.codigo]}
              acoes={m.situacao === 'em_breve' && <Etiqueta>Em breve</Etiqueta>}
            />
            <CorpoCartao className="flex flex-wrap items-center gap-3 text-sm">
              {m.avulso && m.periodicidade && (
                <span>
                  {formatarMoeda(paraCentavos(m.avulso.preco))} por ciclo{' '}
                  {NOMES_PERIODICIDADE[m.periodicidade].toLowerCase()}
                </span>
              )}
              {m.avulso && eMaster && (
                <Botao
                  tamanho="pequeno"
                  onClick={async () => {
                    try {
                      await api.post('/api/assinatura/adicionais', {
                        adicionalId: m.avulso!.id,
                        quantidade: 1,
                      })
                      setMensagem({
                        tom: 'sucesso',
                        texto: `${m.nome} contratado. O proporcional do ciclo entra na próxima fatura.`,
                      })
                      atualizar(await api.get<EstadoSessao>('/api/auth/sessao'))
                      await recarregar()
                    } catch (e) {
                      setMensagem({ tom: 'erro', texto: (e as Error).message })
                    }
                  }}
                >
                  Contratar
                </Botao>
              )}
              {m.interesse ? (
                <span className="text-muted-foreground">Interesse registrado</span>
              ) : (
                <Botao
                  variante="secundario"
                  tamanho="pequeno"
                  onClick={async () => {
                    try {
                      await api.post(`/api/vitrine/${m.codigo}/interesse`, {})
                      setMensagem({
                        tom: 'sucesso',
                        texto: `Interesse em ${m.nome} registrado. A equipe do ViniCycle vai entrar em contato.`,
                      })
                      await recarregar()
                    } catch (e) {
                      setMensagem({ tom: 'erro', texto: (e as Error).message })
                    }
                  }}
                >
                  Tenho interesse
                </Botao>
              )}
            </CorpoCartao>
          </Cartao>
        ))}
      </div>
    </Pagina>
  )
}
