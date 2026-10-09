// Painel da assinatura (administracao.md, Planos, adicionais e assinaturas; ambiente-cliente.md,
// Configurações › Assinatura): o mesmo na ficha do cliente (Administração) e para o Master.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  descontoEntrada,
  type FormaPagamento,
  formatarMoeda,
  MODULOS,
  DIAS_VENCIMENTO,
  INTERVALO_MUDANCA_VENCIMENTO_DIAS,
  NOMES_FORMA_PAGAMENTO,
  NOMES_PERIODICIDADE,
  paraCentavos,
  PERIODICIDADES,
  type Periodicidade,
  type TipoAdicional,
} from '@vinicycle/shared'
import { Ban, Pencil } from 'lucide-react'
import { useState } from 'react'
import { api } from '@/lib/api'
import { useFormulario } from '@/lib/formulario'
import { formatarData } from '@/lib/utils'
import { CampoNumero } from './campos-especiais'
import { AcoesLinha, BotaoIcone } from './AcoesLinha'
import { PedirMotivo } from './PedirMotivo'
import { Botao } from './ui/botao'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from './ui/cartao'
import { AreaTexto, Campo, Entrada, Selecao } from './ui/campos'
import { Dialogo } from './ui/dialogo'

export interface ResumoAssinatura {
  id: string
  plano: { id: string; nome: string; formasPagamento: FormaPagamento[] }
  periodicidade: Periodicidade
  valorContratado: string
  valorRecorrente: string
  inicio: string
  emTeste: boolean
  fimTeste: string | null
  cicloInicio: string | null
  cicloFim: string | null
  proximaRenovacao: string
  diaVencimento: number
  /** A partir desta data o Master muda o dia de novo; vazia se já pode. */
  diaVencimentoLivreEm: string | null
  formaPagamento: FormaPagamento | null
  itens: Array<{
    id: string
    adicionalId: string
    nome: string
    tipo: TipoAdicional
    tipoNome: string
    quantidade: number
    quantidadePorUnidade: number
    valorUnitario: string
    inicio: string
  }>
  mudancas: Array<{
    id: string
    tipo: 'plano' | 'periodicidade' | 'adicional_inclusao' | 'adicional_retirada' | 'reajuste'
    plano: string | null
    periodicidade: Periodicidade | null
    adicional: string | null
    quantidade: number | null
    efeitoEm: string
    situacao: 'agendada' | 'aplicada'
    valorProporcional: string | null
    valorNovo: string | null
    motivo: string | null
    origem: 'plataforma' | 'master'
    criadoEm: string
  }>
  descontos: Array<{
    id: string
    tipo: 'percentual' | 'valor'
    valor: string
    motivo: string | null
    inicio: string
    fim: string | null
  }>
  limites: {
    estabelecimentos: number | null
    usuarios: number | null
    armazenamentoGb: number | null
    mensagensWhatsapp: number
    mensagensSms: number
    modulos: string[]
  }
  uso: {
    estabelecimentos: number
    usuarios: number
    armazenamentoBytes: number
    mensagensWhatsapp: number
    mensagensSms: number
  }
  excessos: string[]
}

interface Opcao {
  id: string
  nome: string
  descricao: string | null
  precos: Partial<Record<Periodicidade, string>>
}
interface Opcoes {
  planos: Opcao[]
  adicionais: Array<Opcao & { tipo: TipoAdicional; quantidadePorUnidade: number }>
}

interface ResultadoMudanca {
  situacao: 'aplicada' | 'agendada'
  efeitoEm: string
  valorProporcional: string | null
  aviso: string | null
}

const moeda = (v: string | null | undefined) => formatarMoeda(paraCentavos(v))
const ciclo = (p: Periodicidade) => NOMES_PERIODICIDADE[p].toLowerCase()

function descreverMudanca(m: ResumoAssinatura['mudancas'][number]): string {
  switch (m.tipo) {
    case 'plano':
      return `Plano ${m.plano}`
    case 'periodicidade':
      return `Ciclo ${m.periodicidade ? ciclo(m.periodicidade) : ''}`
    case 'adicional_inclusao':
      return `Inclusão: ${m.quantidade} × ${m.adicional}`
    case 'adicional_retirada':
      return `Retirada: ${m.quantidade} × ${m.adicional}`
    case 'reajuste':
      return `Reajuste do plano para ${m.valorNovo ? moeda(m.valorNovo) : 'o preço de tabela'}${m.motivo ? ` (${m.motivo})` : ''}`
  }
}

function textoResultado(r: ResultadoMudanca): string {
  const partes =
    r.situacao === 'aplicada'
      ? [
          'Mudança aplicada.',
          r.valorProporcional && Number(r.valorProporcional) > 0
            ? `O proporcional de ${moeda(r.valorProporcional)} entra na próxima fatura.`
            : '',
        ]
      : [`Mudança agendada para ${formatarData(r.efeitoEm)} (renovação), sem reembolso.`]
  return [...partes, r.aviso ?? ''].filter(Boolean).join(' ')
}

function LinhaUso({ rotulo, uso, limite }: { rotulo: string; uso: string; limite: string | null }) {
  return (
    <p className="flex justify-between gap-2">
      <span>{rotulo}</span>
      <span>{limite === null ? `${uso} (sem limite)` : `${uso} de ${limite}`}</span>
    </p>
  )
}

const gb = (bytes: number) =>
  `${(bytes / 1024 ** 3).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} GB`

export function PainelAssinatura({
  url,
  opcoesUrl,
  podeMudar,
  plataforma,
}: {
  /** Base das rotas: a ficha do cliente na Administração, ou /api/assinatura. */
  url: string
  opcoesUrl: 'plataforma' | 'cliente'
  podeMudar: boolean
  plataforma: boolean
}) {
  const qc = useQueryClient()
  const chave = ['assinatura', url]
  const q = useQuery({ queryKey: chave, queryFn: () => api.get<ResumoAssinatura>(url) })
  const opcoes = useQuery({
    queryKey: ['assinatura-opcoes', opcoesUrl],
    enabled: podeMudar,
    queryFn: async (): Promise<Opcoes> => {
      if (opcoesUrl === 'cliente') return api.get<Opcoes>('/api/assinatura/opcoes')
      const [planos, adicionais] = await Promise.all([
        api.get<Opcoes['planos']>('/api/plataforma/planos'),
        api.get<Opcoes['adicionais']>('/api/plataforma/adicionais'),
      ])
      return { planos, adicionais }
    },
  })
  const [dialogo, setDialogo] = useState<
    | null
    | { tipo: 'plano' | 'periodicidade' | 'adicional' | 'cobranca' | 'desconto' | 'reajuste' }
    | { tipo: 'editarDesconto'; desconto: ResumoAssinatura['descontos'][number] }
    | { tipo: 'retirar'; item: ResumoAssinatura['itens'][number] }
  >(null)
  const [inativarDesconto, setInativarDesconto] = useState<string | null>(null)
  const [contratar, setContratar] = useState(false)
  const [mensagem, setMensagem] = useState<{
    tom: 'sucesso' | 'erro' | 'alerta'
    texto: string
  } | null>(null)
  const recarregar = () => qc.invalidateQueries({ queryKey: ['assinatura'] })
  const enviar = async (caminho: string, corpo: unknown) => {
    try {
      const r = await api.post<ResultadoMudanca | { ok: true }>(`${url}/${caminho}`, corpo)
      setMensagem(
        'situacao' in r
          ? { tom: r.aviso ? 'alerta' : 'sucesso', texto: textoResultado(r) }
          : { tom: 'sucesso', texto: 'Feito.' },
      )
      setDialogo(null)
      await recarregar()
    } catch (e) {
      setMensagem({ tom: 'erro', texto: (e as Error).message })
      setDialogo(null)
    }
  }

  if (!q.data) {
    return (
      <p className="text-sm text-muted-foreground">
        {q.isError ? (q.error as Error).message : 'Carregando a assinatura…'}
      </p>
    )
  }
  const a = q.data
  const agendadas = a.mudancas.filter((m) => m.situacao === 'agendada')
  const aplicadas = a.mudancas.filter((m) => m.situacao === 'aplicada')

  return (
    <div className="flex flex-col gap-5">
      {mensagem && <Aviso tom={mensagem.tom}>{mensagem.texto}</Aviso>}
      {a.excessos.length > 0 && (
        <Aviso tom="alerta">
          O uso passou dos limites da assinatura: {a.excessos.join('; ')}. O que passou não cresce
          mais até ajustar ou contratar adicionais.
        </Aviso>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao>
          <CabecalhoCartao
            titulo={`Plano ${a.plano.nome}`}
            descricao={
              a.emTeste
                ? `Em teste até ${formatarData(a.fimTeste)}`
                : a.cicloInicio
                  ? `Ciclo atual: ${formatarData(a.cicloInicio)} a ${formatarData(a.cicloFim)}`
                  : undefined
            }
          />
          <CorpoCartao className="flex flex-col gap-1 text-sm">
            <p>
              Ciclo {ciclo(a.periodicidade)} · plano {moeda(a.valorContratado)} (preço contratado)
            </p>
            <p>
              Total por ciclo, com os adicionais: <strong>{moeda(a.valorRecorrente)}</strong>
              {a.descontos.length > 0 && ', antes dos descontos'}
            </p>
            <p>
              Próxima renovação: {formatarData(a.proximaRenovacao)} · vencimento no dia{' '}
              {a.diaVencimento}
              {a.formaPagamento && ` · ${NOMES_FORMA_PAGAMENTO[a.formaPagamento]}`}
            </p>
            {podeMudar && (
              <div className="mt-2 flex flex-wrap gap-2">
                {a.emTeste && (
                  <Botao tamanho="pequeno" onClick={() => setContratar(true)}>
                    Contratar agora
                  </Botao>
                )}
                <Botao
                  variante="secundario"
                  tamanho="pequeno"
                  onClick={() => setDialogo({ tipo: 'plano' })}
                >
                  Mudar de plano
                </Botao>
                <Botao
                  variante="secundario"
                  tamanho="pequeno"
                  onClick={() => setDialogo({ tipo: 'periodicidade' })}
                >
                  Mudar o ciclo
                </Botao>
                <Botao
                  variante="secundario"
                  tamanho="pequeno"
                  onClick={() => setDialogo({ tipo: 'cobranca' })}
                >
                  Vencimento e forma
                </Botao>
                {plataforma && !a.emTeste && (
                  <Botao
                    variante="secundario"
                    tamanho="pequeno"
                    onClick={() => setDialogo({ tipo: 'reajuste' })}
                  >
                    Reajustar preço
                  </Botao>
                )}
              </div>
            )}
          </CorpoCartao>
        </Cartao>
        <Cartao>
          <CabecalhoCartao titulo="Uso e limites" descricao="Limite = plano + adicionais." />
          <CorpoCartao className="flex flex-col gap-1 text-sm">
            <LinhaUso
              rotulo="Estabelecimentos ativos"
              uso={String(a.uso.estabelecimentos)}
              limite={
                a.limites.estabelecimentos === null ? null : String(a.limites.estabelecimentos)
              }
            />
            <LinhaUso
              rotulo="Usuários (com convites pendentes)"
              uso={String(a.uso.usuarios)}
              limite={a.limites.usuarios === null ? null : String(a.limites.usuarios)}
            />
            <LinhaUso
              rotulo="Anexos"
              uso={gb(a.uso.armazenamentoBytes)}
              limite={a.limites.armazenamentoGb === null ? null : `${a.limites.armazenamentoGb} GB`}
            />
            {(a.limites.mensagensWhatsapp > 0 || a.uso.mensagensWhatsapp > 0) && (
              <LinhaUso
                rotulo="WhatsApp no mês"
                uso={String(a.uso.mensagensWhatsapp)}
                limite={String(a.limites.mensagensWhatsapp)}
              />
            )}
            {(a.limites.mensagensSms > 0 || a.uso.mensagensSms > 0) && (
              <LinhaUso
                rotulo="SMS no mês"
                uso={String(a.uso.mensagensSms)}
                limite={String(a.limites.mensagensSms)}
              />
            )}
            <p className="text-muted-foreground">
              Módulos:{' '}
              {a.limites.modulos
                .map((c) => MODULOS.find((m) => m.codigo === c)?.nome ?? c)
                .join(', ')}
            </p>
          </CorpoCartao>
        </Cartao>
        <Cartao>
          <CabecalhoCartao
            titulo="Adicionais"
            acoes={
              podeMudar && (
                <Botao
                  variante="secundario"
                  tamanho="pequeno"
                  onClick={() => setDialogo({ tipo: 'adicional' })}
                >
                  Incluir
                </Botao>
              )
            }
          />
          <CorpoCartao className="flex flex-col gap-2 text-sm">
            {!a.itens.length && <p className="text-muted-foreground">Nenhum adicional.</p>}
            {a.itens.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {i.quantidade} × {i.nome} ({i.tipoNome}) · {moeda(i.valorUnitario)} cada · desde{' '}
                  {formatarData(i.inicio)}
                </span>
                {podeMudar && (
                  <Botao
                    variante="secundario"
                    tamanho="pequeno"
                    onClick={() => setDialogo({ tipo: 'retirar', item: i })}
                  >
                    Retirar
                  </Botao>
                )}
              </div>
            ))}
          </CorpoCartao>
        </Cartao>
        <Cartao>
          <CabecalhoCartao
            titulo="Descontos"
            acoes={
              plataforma &&
              podeMudar && (
                <Botao
                  variante="secundario"
                  tamanho="pequeno"
                  onClick={() => setDialogo({ tipo: 'desconto' })}
                >
                  Novo desconto
                </Botao>
              )
            }
          />
          <CorpoCartao className="flex flex-col gap-2 text-sm">
            {!a.descontos.length && <p className="text-muted-foreground">Nenhum desconto.</p>}
            {a.descontos.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {d.tipo === 'percentual'
                    ? `${Number(d.valor).toLocaleString('pt-BR')}%`
                    : `${moeda(d.valor)} por fatura`}{' '}
                  · de {formatarData(d.inicio)} {d.fim ? `a ${formatarData(d.fim)}` : 'em diante'}
                  {d.motivo && ` · ${d.motivo}`}
                </span>
                {plataforma && podeMudar && (
                  <AcoesLinha>
                    <BotaoIcone
                      rotulo="Editar o desconto"
                      aoClicar={() => setDialogo({ tipo: 'editarDesconto', desconto: d })}
                    >
                      <Pencil />
                    </BotaoIcone>
                    <BotaoIcone
                      rotulo="Encerrar o desconto"
                      aoClicar={() => setInativarDesconto(d.id)}
                    >
                      <Ban className="text-destructive" />
                    </BotaoIcone>
                  </AcoesLinha>
                )}
              </div>
            ))}
          </CorpoCartao>
        </Cartao>
      </div>
      <Cartao>
        <CabecalhoCartao
          titulo="Mudanças"
          descricao="O que aumenta vale na hora, com o proporcional na próxima fatura. O que diminui vale na renovação, sem reembolso."
        />
        <CorpoCartao className="flex flex-col gap-2 text-sm">
          {!a.mudancas.length && <p className="text-muted-foreground">Nenhuma mudança.</p>}
          {agendadas.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <Etiqueta tom="alerta">Agendada</Etiqueta> {descreverMudanca(m)} · vale em{' '}
                {formatarData(m.efeitoEm)}
                {m.origem === 'plataforma' ? ' · pela plataforma' : ''}
              </span>
              {podeMudar && (plataforma || m.tipo !== 'reajuste') && (
                <Botao
                  variante="secundario"
                  tamanho="pequeno"
                  onClick={() => enviar(`mudancas/${m.id}/cancelar`, {})}
                >
                  Cancelar
                </Botao>
              )}
            </div>
          ))}
          {aplicadas.map((m) => (
            <p key={m.id}>
              {formatarData(m.efeitoEm)} · {descreverMudanca(m)}
              {m.valorProporcional && ` · proporcional de ${moeda(m.valorProporcional)}`}
              {m.origem === 'plataforma' ? ' · pela plataforma' : ' · pelo Master'}
            </p>
          ))}
        </CorpoCartao>
      </Cartao>

      {dialogo?.tipo === 'plano' && (
        <EscolherPlano
          a={a}
          opcoes={opcoes.data?.planos ?? []}
          aoFechar={() => setDialogo(null)}
          aoEnviar={(planoId) => enviar('plano', { planoId })}
        />
      )}
      {dialogo?.tipo === 'periodicidade' && (
        <EscolherCiclo
          a={a}
          aoFechar={() => setDialogo(null)}
          aoEnviar={(periodicidade) => enviar('periodicidade', { periodicidade })}
        />
      )}
      {dialogo?.tipo === 'adicional' && (
        <IncluirAdicional
          a={a}
          opcoes={opcoes.data?.adicionais ?? []}
          aoFechar={() => setDialogo(null)}
          aoEnviar={(adicionalId, quantidade) => enviar('adicionais', { adicionalId, quantidade })}
        />
      )}
      {dialogo?.tipo === 'retirar' && (
        <RetirarAdicional
          a={a}
          item={dialogo.item}
          aoFechar={() => setDialogo(null)}
          aoEnviar={(quantidade) => enviar(`adicionais/${dialogo.item.id}/retirar`, { quantidade })}
        />
      )}
      {dialogo?.tipo === 'cobranca' && (
        <Cobranca
          a={a}
          url={url}
          plataforma={plataforma}
          aoFechar={() => setDialogo(null)}
          aoSalvar={recarregar}
        />
      )}
      {dialogo?.tipo === 'desconto' && (
        <NovoDesconto
          url={url.replace(/\/assinatura$/, '/descontos')}
          aoFechar={() => setDialogo(null)}
          aoSalvar={recarregar}
        />
      )}
      {dialogo?.tipo === 'editarDesconto' && (
        <NovoDesconto
          url={url.replace(/\/assinatura$/, '/descontos')}
          desconto={dialogo.desconto}
          aoFechar={() => setDialogo(null)}
          aoSalvar={recarregar}
        />
      )}
      {dialogo?.tipo === 'reajuste' && (
        <Reajuste
          a={a}
          aoFechar={() => setDialogo(null)}
          aoEnviar={(corpo) => enviar('reajuste', corpo)}
        />
      )}
      <Dialogo
        aberto={contratar}
        aoMudar={setContratar}
        titulo="Contratar a assinatura"
        descricao={`O primeiro ciclo ${ciclo(a.periodicidade)} começa hoje, com o preço do dia do plano ${a.plano.nome}, e a primeira fatura sai na hora.`}
        rodape={
          <Rodape
            aoFechar={() => setContratar(false)}
            rotulo="Contratar"
            aoConfirmar={async () => {
              setContratar(false)
              await enviar('contratar', {})
              await qc.invalidateQueries({ queryKey: ['faturas'] })
            }}
          />
        }
      />
      <PedirMotivo
        aberto={!!inativarDesconto}
        aoMudar={(x) => !x && setInativarDesconto(null)}
        titulo="Encerrar desconto"
        descricao="As próximas faturas saem sem ele. As já emitidas não mudam."
        rotuloBotao="Encerrar"
        aoConfirmar={async (motivo) => {
          await api.post(
            `${url.replace(/\/assinatura$/, '/descontos')}/${inativarDesconto}/inativar`,
            {
              motivo,
            },
          )
          await recarregar()
        }}
      />
    </div>
  )
}

function Rodape({
  aoFechar,
  aoConfirmar,
  desabilitado,
  rotulo = 'Confirmar',
}: {
  aoFechar: () => void
  aoConfirmar: () => void
  desabilitado?: boolean
  rotulo?: string
}) {
  return (
    <>
      <Botao variante="secundario" onClick={aoFechar}>
        Cancelar
      </Botao>
      <Botao disabled={desabilitado} onClick={aoConfirmar}>
        {rotulo}
      </Botao>
    </>
  )
}

function EscolherPlano({
  a,
  opcoes,
  aoFechar,
  aoEnviar,
}: {
  a: ResumoAssinatura
  opcoes: Opcao[]
  aoFechar: () => void
  aoEnviar: (planoId: string) => void
}) {
  const [planoId, setPlanoId] = useState('')
  const escolhido = opcoes.find((p) => p.id === planoId)
  const preco = escolhido?.precos[a.periodicidade]
  const maior = preco !== undefined && paraCentavos(preco) >= paraCentavos(a.valorContratado)
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo="Mudar de plano"
      descricao={`Preço no ciclo ${ciclo(a.periodicidade)}. Hoje: ${a.plano.nome}, ${moeda(a.valorContratado)}.`}
      rodape={
        <Rodape aoFechar={aoFechar} aoConfirmar={() => aoEnviar(planoId)} desabilitado={!preco} />
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <Campo rotulo="Novo plano" id="mudar-plano">
          <Selecao id="mudar-plano" value={planoId} onChange={(e) => setPlanoId(e.target.value)}>
            <option value="">Escolha</option>
            {opcoes
              .filter((p) => p.id !== a.plano.id)
              .map((p) => (
                <option key={p.id} value={p.id} disabled={!p.precos[a.periodicidade]}>
                  {p.nome} ·{' '}
                  {p.precos[a.periodicidade]
                    ? moeda(p.precos[a.periodicidade])
                    : `não vendido no ciclo ${ciclo(a.periodicidade)}`}
                </option>
              ))}
          </Selecao>
        </Campo>
        {escolhido?.descricao && <p className="text-muted-foreground">{escolhido.descricao}</p>}
        {preco !== undefined &&
          (a.emTeste ? (
            <Aviso tom="info">No teste, a troca vale na hora e sem cobrança.</Aviso>
          ) : maior ? (
            <Aviso tom="info">
              Vale agora. A diferença dos dias que faltam no ciclo entra na próxima fatura.
            </Aviso>
          ) : (
            <Aviso tom="info">
              O plano menor vale na renovação ({formatarData(a.proximaRenovacao)}), sem abatimento
              nem reembolso. Até lá, tudo continua como está.
            </Aviso>
          ))}
      </div>
    </Dialogo>
  )
}

function EscolherCiclo({
  a,
  aoFechar,
  aoEnviar,
}: {
  a: ResumoAssinatura
  aoFechar: () => void
  aoEnviar: (p: Periodicidade) => void
}) {
  const [p, setP] = useState<Periodicidade | ''>('')
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo="Mudar o ciclo de cobrança"
      descricao={
        a.emTeste
          ? 'No teste, o ciclo muda na hora.'
          : `O ciclo novo começa na renovação (${formatarData(a.proximaRenovacao)}), com o preço do dia.`
      }
      rodape={<Rodape aoFechar={aoFechar} aoConfirmar={() => p && aoEnviar(p)} desabilitado={!p} />}
    >
      <Campo rotulo="Ciclo" id="mudar-ciclo">
        <Selecao id="mudar-ciclo" value={p} onChange={(e) => setP(e.target.value as Periodicidade)}>
          <option value="">Escolha</option>
          {PERIODICIDADES.filter((x) => x !== a.periodicidade).map((x) => (
            <option key={x} value={x}>
              {NOMES_PERIODICIDADE[x]}
            </option>
          ))}
        </Selecao>
      </Campo>
    </Dialogo>
  )
}

function IncluirAdicional({
  a,
  opcoes,
  aoFechar,
  aoEnviar,
}: {
  a: ResumoAssinatura
  opcoes: Opcoes['adicionais']
  aoFechar: () => void
  aoEnviar: (adicionalId: string, quantidade: number) => void
}) {
  const [id, setId] = useState('')
  const [quantidade, setQuantidade] = useState(1)
  const escolhido = opcoes.find((x) => x.id === id)
  const preco = escolhido?.precos[a.periodicidade]
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo="Incluir adicional"
      descricao={
        a.emTeste
          ? 'No teste, o adicional vale na hora e sem cobrança.'
          : 'Vale na hora. O proporcional dos dias que faltam no ciclo entra na próxima fatura.'
      }
      rodape={
        <Rodape
          aoFechar={aoFechar}
          aoConfirmar={() => aoEnviar(id, escolhido?.tipo === 'modulo' ? 1 : quantidade)}
          desabilitado={!preco || quantidade < 1}
        />
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="Adicional" id="incluir-adicional" className="sm:col-span-2">
          <Selecao id="incluir-adicional" value={id} onChange={(e) => setId(e.target.value)}>
            <option value="">Escolha</option>
            {opcoes.map((x) => (
              <option key={x.id} value={x.id} disabled={!x.precos[a.periodicidade]}>
                {x.nome} ·{' '}
                {x.precos[a.periodicidade]
                  ? `${moeda(x.precos[a.periodicidade])} por unidade`
                  : `não vendido no ciclo ${ciclo(a.periodicidade)}`}
              </option>
            ))}
          </Selecao>
        </Campo>
        {escolhido?.tipo !== 'modulo' && (
          <Campo rotulo="Quantidade" id="incluir-qtd">
            <Entrada
              id="incluir-qtd"
              type="number"
              min={1}
              value={quantidade}
              onChange={(e) => setQuantidade(Math.max(1, Number(e.target.value) || 1))}
            />
          </Campo>
        )}
        {preco && (
          <p className="text-sm sm:col-span-3">
            Total por ciclo:{' '}
            <strong>
              {formatarMoeda(paraCentavos(preco) * (escolhido?.tipo === 'modulo' ? 1 : quantidade))}
            </strong>
          </p>
        )}
      </div>
    </Dialogo>
  )
}

function RetirarAdicional({
  a,
  item,
  aoFechar,
  aoEnviar,
}: {
  a: ResumoAssinatura
  item: ResumoAssinatura['itens'][number]
  aoFechar: () => void
  aoEnviar: (quantidade: number) => void
}) {
  const [quantidade, setQuantidade] = useState(item.quantidade)
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo={`Retirar ${item.nome}`}
      descricao={
        a.emTeste
          ? 'No teste, a retirada vale na hora.'
          : `A retirada vale na renovação (${formatarData(a.proximaRenovacao)}), sem reembolso. Até lá, o adicional continua valendo.`
      }
      rodape={
        <Rodape aoFechar={aoFechar} aoConfirmar={() => aoEnviar(quantidade)} rotulo="Retirar" />
      }
    >
      {item.quantidade > 1 && (
        <Campo rotulo={`Quantas unidades (de ${item.quantidade})`} id="retirar-qtd">
          <Entrada
            id="retirar-qtd"
            type="number"
            min={1}
            max={item.quantidade}
            value={quantidade}
            onChange={(e) =>
              setQuantidade(Math.min(item.quantidade, Math.max(1, Number(e.target.value) || 1)))
            }
          />
        </Campo>
      )}
    </Dialogo>
  )
}

function Cobranca({
  a,
  url,
  plataforma,
  aoFechar,
  aoSalvar,
}: {
  a: ResumoAssinatura
  url: string
  plataforma: boolean
  aoFechar: () => void
  aoSalvar: () => void
}) {
  // O Master muda o dia uma vez a cada 90 dias; a Administração, quando precisar.
  const diaTravado = !plataforma && !!a.diaVencimentoLivreEm
  const dias: number[] = [...DIAS_VENCIMENTO]
  // O dia de antes da lista continua valendo até ser trocado.
  if (!dias.includes(a.diaVencimento)) dias.unshift(a.diaVencimento)
  const [dia, setDia] = useState(a.diaVencimento)
  const [forma, setForma] = useState<FormaPagamento | ''>(a.formaPagamento ?? '')
  const [erro, setErro] = useState<string | null>(null)
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo="Vencimento e forma de pagamento"
      descricao="Valem para as faturas emitidas daqui em diante; a já emitida mantém o vencimento. A fatura vence no primeiro dia escolhido a partir do início do ciclo."
      rodape={
        <Rodape
          aoFechar={aoFechar}
          rotulo="Salvar"
          aoConfirmar={async () => {
            try {
              await api.put(`${url}/cobranca`, {
                diaVencimento: dia,
                formaPagamento: forma || null,
              })
              aoSalvar()
              aoFechar()
            } catch (e) {
              setErro((e as Error).message)
            }
          }}
        />
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {erro && (
          <Aviso tom="erro" className="sm:col-span-2">
            {erro}
          </Aviso>
        )}
        <Campo
          rotulo="Dia do vencimento"
          id="cob-dia"
          ajuda={
            diaTravado
              ? `O dia muda uma vez a cada ${INTERVALO_MUDANCA_VENCIMENTO_DIAS} dias: liberado de novo em ${formatarData(a.diaVencimentoLivreEm)}.`
              : `30 = último dia em fevereiro.${plataforma ? '' : ` Depois de mudar, o dia só muda de novo em ${INTERVALO_MUDANCA_VENCIMENTO_DIAS} dias.`}`
          }
        >
          <Selecao
            id="cob-dia"
            value={dia}
            disabled={diaTravado}
            onChange={(e) => setDia(Number(e.target.value))}
          >
            {dias.map((d) => (
              <option key={d} value={d}>
                Dia {d}
                {DIAS_VENCIMENTO.includes(d as never) ? '' : ' (atual, fora da lista)'}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Forma de pagamento" id="cob-forma">
          <Selecao
            id="cob-forma"
            value={forma}
            onChange={(e) => setForma(e.target.value as FormaPagamento)}
          >
            <option value="">Não definida</option>
            {a.plano.formasPagamento.map((f) => (
              <option key={f} value={f}>
                {NOMES_FORMA_PAGAMENTO[f]}
              </option>
            ))}
          </Selecao>
        </Campo>
      </div>
    </Dialogo>
  )
}

function NovoDesconto({
  url,
  desconto,
  aoFechar,
  aoSalvar,
}: {
  url: string
  desconto?: ResumoAssinatura['descontos'][number]
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const form = useFormulario(descontoEntrada, {
    tipo: desconto?.tipo ?? 'percentual',
    valor: desconto?.valor ?? '',
    motivo: desconto?.motivo ?? '',
    inicio: desconto?.inicio ?? new Date().toISOString().slice(0, 10),
    fim: desconto?.fim ?? '',
  })
  const v = form.valores
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo={desconto ? 'Editar desconto' : 'Novo desconto'}
      descricao="Vale para as faturas dos ciclos que começam dentro da validade; as já emitidas não mudam. O motivo fica só na plataforma."
      rodape={
        <Rodape
          aoFechar={aoFechar}
          rotulo="Salvar"
          aoConfirmar={async () => {
            const d = form.validar()
            if (!d) return
            try {
              if (desconto) await api.put(`${url}/${desconto.id}`, d)
              else await api.post(url, d)
              aoSalvar()
              aoFechar()
            } catch (e) {
              form.erroDaApi(e)
            }
          }}
        />
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {form.erroGeral && (
          <Aviso tom="erro" className="sm:col-span-2">
            {form.erroGeral}
          </Aviso>
        )}
        <Campo rotulo="Tipo" id="desc-tipo">
          <Selecao
            id="desc-tipo"
            value={v.tipo}
            onChange={(e) => form.definir('tipo', e.target.value)}
          >
            <option value="percentual">Percentual</option>
            <option value="valor">Valor por fatura</option>
          </Selecao>
        </Campo>
        <Campo rotulo="Desconto" id="desc-valor" erro={form.erro('valor')} obrigatorio>
          <CampoNumero
            id="desc-valor"
            casas={2}
            unidade={v.tipo === 'percentual' ? '%' : 'R$'}
            valor={v.valor}
            aoMudar={(x) => form.definir('valor', x ?? '')}
          />
        </Campo>
        <Campo rotulo="Início" id="desc-inicio" erro={form.erro('inicio')}>
          <Entrada
            id="desc-inicio"
            type="date"
            value={v.inicio}
            onChange={(e) => form.definir('inicio', e.target.value)}
          />
        </Campo>
        <Campo rotulo="Validade" id="desc-fim" erro={form.erro('fim')} ajuda="Vazio = sem fim.">
          <Entrada
            id="desc-fim"
            type="date"
            value={v.fim ?? ''}
            onChange={(e) => form.definir('fim', e.target.value)}
          />
        </Campo>
        <Campo
          rotulo="Motivo"
          id="desc-motivo"
          erro={form.erro('motivo')}
          obrigatorio
          className="sm:col-span-2"
        >
          <AreaTexto
            id="desc-motivo"
            value={v.motivo}
            onChange={(e) => form.definir('motivo', e.target.value)}
          />
        </Campo>
      </div>
    </Dialogo>
  )
}

function Reajuste({
  a,
  aoFechar,
  aoEnviar,
}: {
  a: ResumoAssinatura
  aoFechar: () => void
  aoEnviar: (corpo: { modo: 'tabela' | 'valor'; valor: string | null; motivo: string }) => void
}) {
  const [modo, setModo] = useState<'tabela' | 'valor'>('tabela')
  const [valor, setValor] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo="Reajustar o preço contratado"
      descricao={`Hoje: ${moeda(a.valorContratado)} no ciclo ${ciclo(a.periodicidade)}. O preço novo vale na renovação (${formatarData(a.proximaRenovacao)}); o cliente vê o reajuste agendado. Os adicionais não mudam.`}
      rodape={
        <Rodape
          aoFechar={aoFechar}
          rotulo="Agendar"
          desabilitado={motivo.trim().length < 3 || (modo === 'valor' && !valor)}
          aoConfirmar={() => aoEnviar({ modo, valor: modo === 'valor' ? valor : null, motivo })}
        />
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Novo preço" id="reaj-modo">
          <Selecao
            id="reaj-modo"
            value={modo}
            onChange={(e) => setModo(e.target.value as 'tabela' | 'valor')}
          >
            <option value="tabela">Preço de tabela do plano na renovação</option>
            <option value="valor">Valor digitado</option>
          </Selecao>
        </Campo>
        {modo === 'valor' && (
          <Campo rotulo="Valor por ciclo" id="reaj-valor">
            <CampoNumero id="reaj-valor" casas={2} unidade="R$" valor={valor} aoMudar={setValor} />
          </Campo>
        )}
        <Campo rotulo="Motivo" id="reaj-motivo" obrigatorio className="sm:col-span-2">
          <AreaTexto id="reaj-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Campo>
      </div>
    </Dialogo>
  )
}
