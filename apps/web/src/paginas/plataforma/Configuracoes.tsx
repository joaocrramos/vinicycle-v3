// Administração › Configurações da plataforma: prazos do teste e da régua de cobrança
// (administracao.md, Período de teste; Inadimplência e bloqueio).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao } from '@/componentes/ui/cartao'
import { Campo, Entrada } from '@/componentes/ui/campos'
import { Pagina } from '@/layout/Estrutura'
import { api } from '@/lib/api'
import { pode, useSessao } from '@/lib/sessao'

interface Prazos {
  testeDias: number
  avisosTesteDias: number[]
  toleranciaDias: number
  somenteLeituraDias: number
  faturaAntecedenciaDias: number
  avisosVencimentoDias: number[]
  chamadoCategorias: string[]
}

const lista = (t: string) =>
  t
    .split(/[,;\s]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0)

export function PaginaConfiguracoesPlataforma() {
  const q = useQuery({
    queryKey: ['config-plataforma'],
    queryFn: () => api.get<Prazos>('/api/plataforma/configuracoes'),
  })
  if (!q.data)
    return (
      <Pagina titulo="Configurações da plataforma" trilha={['Administração']}>
        <p className="text-sm text-muted-foreground">
          {q.isError ? (q.error as Error).message : 'Carregando…'}
        </p>
      </Pagina>
    )
  return <FormularioPrazos inicial={q.data} />
}

function FormularioPrazos({ inicial }: { inicial: Prazos }) {
  const { data: s } = useSessao()
  const qc = useQueryClient()
  const [v, setV] = useState<Prazos>(inicial)
  const [textos, setTextos] = useState({
    teste: inicial.avisosTesteDias.join(', '),
    vencimento: inicial.avisosVencimentoDias.join(', '),
    categorias: inicial.chamadoCategorias.join(', '),
  })
  const [mensagem, setMensagem] = useState<{ tom: 'sucesso' | 'erro'; texto: string } | null>(null)
  const podeEditar = pode(s, 'plataforma.configuracoes', 'editar')
  const numero = (campo: keyof Prazos, rotulo: string, ajuda?: string) => (
    <Campo rotulo={rotulo} id={`cfg-${campo}`} ajuda={ajuda}>
      <Entrada
        id={`cfg-${campo}`}
        type="number"
        min={0}
        disabled={!podeEditar}
        value={v[campo] as number}
        onChange={(e) => setV({ ...v, [campo]: Number(e.target.value) || 0 })}
      />
    </Campo>
  )
  return (
    <Pagina titulo="Configurações da plataforma" trilha={['Administração']}>
      {mensagem && <Aviso tom={mensagem.tom}>{mensagem.texto}</Aviso>}
      <Cartao>
        <CabecalhoCartao
          titulo="Teste e cobrança"
          descricao="Valem para todos os clientes a partir da próxima rodada da cobrança (de hora em hora)."
        />
        <CorpoCartao className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {numero('testeDias', 'Dias de teste')}
          <Campo
            rotulo="Avisos antes do fim do teste (dias)"
            id="cfg-avisos-teste"
            ajuda="Ex.: 3, 1"
          >
            <Entrada
              id="cfg-avisos-teste"
              disabled={!podeEditar}
              value={textos.teste}
              onChange={(e) => setTextos({ ...textos, teste: e.target.value })}
            />
          </Campo>
          {numero('faturaAntecedenciaDias', 'Fatura sai antes do vencimento (dias)')}
          <Campo
            rotulo="Avisos antes do vencimento (dias)"
            id="cfg-avisos-venc"
            ajuda="0 = no dia. Ex.: 3, 0"
          >
            <Entrada
              id="cfg-avisos-venc"
              disabled={!podeEditar}
              value={textos.vencimento}
              onChange={(e) => setTextos({ ...textos, vencimento: e.target.value })}
            />
          </Campo>
          {numero('toleranciaDias', 'Tolerância depois do vencimento (dias)', 'Tudo funciona.')}
          {numero('somenteLeituraDias', 'Somente leitura antes do bloqueio (dias)')}
          <Campo
            rotulo="Categorias dos chamados"
            id="cfg-categorias"
            className="sm:col-span-2 lg:col-span-3"
            ajuda="Separadas por vírgula."
          >
            <Entrada
              id="cfg-categorias"
              disabled={!podeEditar}
              value={textos.categorias}
              onChange={(e) => setTextos({ ...textos, categorias: e.target.value })}
            />
          </Campo>
          {podeEditar && (
            <div className="sm:col-span-2 lg:col-span-3">
              <Botao
                onClick={async () => {
                  try {
                    await api.put('/api/plataforma/configuracoes', {
                      ...v,
                      avisosTesteDias: lista(textos.teste),
                      avisosVencimentoDias: lista(textos.vencimento),
                      chamadoCategorias: textos.categorias
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean),
                    })
                    await qc.invalidateQueries({ queryKey: ['config-plataforma'] })
                    setMensagem({ tom: 'sucesso', texto: 'Prazos salvos.' })
                  } catch (e) {
                    setMensagem({ tom: 'erro', texto: (e as Error).message })
                  }
                }}
              >
                Salvar
              </Botao>
            </div>
          )}
        </CorpoCartao>
      </Cartao>
    </Pagina>
  )
}
