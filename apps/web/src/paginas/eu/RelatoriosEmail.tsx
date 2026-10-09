// Preferências › Relatórios por e-mail (03-modelo-de-dados.md, 2.2, Relatório agendado; 04, roteiro
// do ciclo 8): o usuário escolhe o relatório, o estabelecimento e a frequência. O envio sai às 7h
// do fuso do estabelecimento, com as permissões que ele tiver no momento (P27).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CHAVES_FREQUENCIA_ENVIO,
  FREQUENCIAS_ENVIO,
  type FrequenciaEnvio,
  RELATORIOS_AGENDAVEIS,
  CANAIS_MENSAGEM,
  type CanalMensagem,
  NOMES_CANAL,
  type RelatorioAgendavel,
} from '@vinicycle/shared'
import { useState } from 'react'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao } from '@/componentes/ui/cartao'
import { Caixa, Selecao } from '@/componentes/ui/campos'
import { api, ErroApi } from '@/lib/api'
import { fusoAtivo, useSessao } from '@/lib/sessao'
import { formatarDataHora } from '@/lib/utils'

interface Agendado {
  id: string
  relatorio: RelatorioAgendavel
  nome: string
  frequencia: FrequenciaEnvio
  estabelecimentoId: string
  estabelecimento: string
  proximoEnvio: string
  ultimoEnvio: string | null
  ultimoAviso: string | null
  ativo: boolean
  canal: CanalMensagem
}

export function RelatoriosEmail() {
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  const qc = useQueryClient()
  const e = s?.empresa
  const q = useQuery({
    queryKey: ['relatorios-agendados'],
    queryFn: () =>
      api.get<{ disponiveis: RelatorioAgendavel[]; itens: Agendado[] }>(
        '/api/relatorios-agendados',
      ),
    enabled: !!e,
    retry: false,
  })
  const [novo, setNovo] = useState<{
    relatorio: RelatorioAgendavel | ''
    frequencia: FrequenciaEnvio
    estabelecimentoId: string
    canal: CanalMensagem
  }>({
    relatorio: '',
    frequencia: 'semanal',
    estabelecimentoId: e?.estabelecimentoId ?? '',
    canal: 'email',
  })
  const [msg, setMsg] = useState<{ tom: 'erro' | 'sucesso'; texto: string } | null>(null)
  if (!e || !q.data) return null
  const executar = async (f: () => Promise<unknown>, ok?: string) => {
    setMsg(null)
    try {
      await f()
      if (ok) setMsg({ tom: 'sucesso', texto: ok })
      await qc.invalidateQueries({ queryKey: ['relatorios-agendados'] })
    } catch (x) {
      setMsg({ tom: 'erro', texto: x instanceof ErroApi ? x.message : (x as Error).message })
    }
  }
  const estabelecimento = novo.estabelecimentoId || e.estabelecimentos[0]?.id || ''
  return (
    <Cartao>
      <CabecalhoCartao
        titulo="Relatórios agendados"
        descricao={`Por e-mail (${s.usuario.email}), WhatsApp ou SMS, às 7h do fuso do estabelecimento. Cada relatório sai com o que você pode ver no sistema naquele momento; sem franquia ou telefone, vai por e-mail.`}
      />
      <CorpoCartao className="flex flex-col gap-4">
        {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
        <div className="flex flex-col divide-y text-sm">
          {q.data.itens.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{a.nome}</span>
                <span className="text-xs text-muted-foreground">
                  {a.estabelecimento} ·{' '}
                  {a.ativo ? `próximo: ${formatarDataHora(a.proximoEnvio, fuso)}` : 'pausado'}
                  {a.ultimoEnvio && ` · último: ${formatarDataHora(a.ultimoEnvio, fuso)}`}
                </span>
                {a.ultimoAviso && (
                  <span className="text-xs text-destructive">Não saiu: {a.ultimoAviso}</span>
                )}
              </div>
              <Selecao
                aria-label="Frequência"
                className="w-64"
                value={a.frequencia}
                onChange={(x) =>
                  executar(() =>
                    api.put(`/api/relatorios-agendados/${a.id}`, {
                      frequencia: x.target.value,
                      ativo: a.ativo,
                    }),
                  )
                }
              >
                {CHAVES_FREQUENCIA_ENVIO.map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCIAS_ENVIO[f]}
                  </option>
                ))}
              </Selecao>
              <Selecao
                aria-label="Canal"
                className="w-36"
                value={a.canal}
                onChange={(x) =>
                  executar(() =>
                    api.put(`/api/relatorios-agendados/${a.id}`, {
                      frequencia: a.frequencia,
                      ativo: a.ativo,
                      canal: x.target.value,
                    }),
                  )
                }
              >
                {CANAIS_MENSAGEM.map((c) => (
                  <option key={c} value={c}>
                    {NOMES_CANAL[c]}
                  </option>
                ))}
              </Selecao>
              <Caixa
                rotulo="Ativo"
                checked={a.ativo}
                onChange={(x) =>
                  executar(() =>
                    api.put(`/api/relatorios-agendados/${a.id}`, {
                      frequencia: a.frequencia,
                      ativo: x.target.checked,
                    }),
                  )
                }
              />
              <Botao
                variante="secundario"
                onClick={() =>
                  executar(async () => {
                    const r = await api.post<{ aviso?: string }>(
                      `/api/relatorios-agendados/${a.id}/enviar`,
                    )
                    setMsg({
                      tom: 'sucesso',
                      texto: r.aviso ?? `Enviado agora (${NOMES_CANAL[a.canal]}).`,
                    })
                  })
                }
              >
                Enviar agora
              </Botao>
              <Botao
                variante="secundario"
                onClick={() =>
                  executar(() => api.post(`/api/relatorios-agendados/${a.id}/excluir`))
                }
              >
                Excluir
              </Botao>
            </div>
          ))}
          {!q.data.itens.length && (
            <p className="py-2 text-muted-foreground">Nenhum relatório agendado.</p>
          )}
        </div>
        {q.data.disponiveis.length > 0 && (
          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            <Selecao
              aria-label="Relatório"
              className="w-72"
              value={novo.relatorio}
              onChange={(x) =>
                setNovo({ ...novo, relatorio: x.target.value as RelatorioAgendavel | '' })
              }
            >
              <option value="">Escolha o relatório</option>
              {q.data.disponiveis.map((r) => (
                <option key={r} value={r}>
                  {RELATORIOS_AGENDAVEIS[r].nome}
                </option>
              ))}
            </Selecao>
            {e.estabelecimentos.length > 1 && (
              <Selecao
                aria-label="Estabelecimento"
                className="w-56"
                value={estabelecimento}
                onChange={(x) => setNovo({ ...novo, estabelecimentoId: x.target.value })}
              >
                {e.estabelecimentos.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nome}
                  </option>
                ))}
              </Selecao>
            )}
            <Selecao
              aria-label="Frequência"
              className="w-64"
              value={novo.frequencia}
              onChange={(x) => setNovo({ ...novo, frequencia: x.target.value as FrequenciaEnvio })}
            >
              {CHAVES_FREQUENCIA_ENVIO.map((f) => (
                <option key={f} value={f}>
                  {FREQUENCIAS_ENVIO[f]}
                </option>
              ))}
            </Selecao>
            <Selecao
              aria-label="Canal"
              className="w-36"
              value={novo.canal}
              onChange={(x) => setNovo({ ...novo, canal: x.target.value as CanalMensagem })}
            >
              {CANAIS_MENSAGEM.map((c) => (
                <option key={c} value={c}>
                  {NOMES_CANAL[c]}
                </option>
              ))}
            </Selecao>
            <Botao
              disabled={!novo.relatorio || !estabelecimento}
              onClick={() =>
                executar(async () => {
                  await api.post('/api/relatorios-agendados', {
                    ...novo,
                    estabelecimentoId: estabelecimento,
                  })
                  setNovo({ ...novo, relatorio: '' })
                })
              }
            >
              Agendar
            </Botao>
          </div>
        )}
      </CorpoCartao>
    </Cartao>
  )
}
