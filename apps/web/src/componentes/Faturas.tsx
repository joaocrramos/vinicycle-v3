// Faturas e recebimentos (administracao.md, Faturas e contas a receber): detalhe com itens e
// pagamentos; na Administração, também a baixa manual, o estorno e o cancelamento.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FORMAS_PAGAMENTO,
  type FormaPagamento,
  faturaAvulsaEntrada,
  formatarMoeda,
  NOMES_FORMA_PAGAMENTO,
  NOMES_SITUACAO_FATURA,
  paraCentavos,
  type SituacaoFatura,
} from '@vinicycle/shared'
import { Plus, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { api } from '@/lib/api'
import { useFormulario } from '@/lib/formulario'
import { formatarData, formatarDataHora } from '@/lib/utils'
import { BotaoIcone } from './AcoesLinha'
import { CampoNumero } from './campos-especiais'
import { PedirMotivo } from './PedirMotivo'
import { Botao } from './ui/botao'
import { Aviso, Etiqueta } from './ui/cartao'
import { AreaTexto, Campo, Entrada, Selecao } from './ui/campos'
import { Dialogo } from './ui/dialogo'

export const TOM_FATURA: Record<
  SituacaoFatura,
  'sucesso' | 'alerta' | 'erro' | 'neutro' | 'primario'
> = {
  aberta: 'primario',
  paga: 'sucesso',
  parcial: 'alerta',
  vencida: 'erro',
  cancelada: 'neutro',
}

export interface LinhaFatura {
  id: string
  numero: number
  empresaId: string
  cliente: string
  cicloInicio: string | null
  cicloFim: string | null
  emissao: string
  vencimento: string
  total: string
  situacao: SituacaoFatura
  recebido: string
}

interface Fatura extends Omit<LinhaFatura, 'recebido'> {
  observacao: string | null
  motivoCancelamento: string | null
  canceladaEm: string | null
  itens: Array<{
    id: string
    descricao: string
    origem: string
    quantidade: number
    valorUnitario: string
    valor: string
  }>
  recebimentos: Array<{
    id: string
    data: string
    valor: string
    forma: FormaPagamento
    referencia: string | null
    origem: 'manual' | 'provedor'
    estornadoEm: string | null
    motivoEstorno: string | null
    comprovanteId: string | null
  }>
  recebido: string
  saldo: string
  pagamento: null | { link: string | null; pixCopiaCola: string | null; situacao: string }
  nota: null | { numero: string | null; situacao: string; linkPdf: string | null }
}

const moeda = (v: string | null | undefined) => formatarMoeda(paraCentavos(v))

export function EtiquetaFatura({ situacao }: { situacao: SituacaoFatura }) {
  return <Etiqueta tom={TOM_FATURA[situacao]}>{NOMES_SITUACAO_FATURA[situacao]}</Etiqueta>
}

export function periodoFatura(f: Pick<LinhaFatura, 'cicloInicio' | 'cicloFim'>): string {
  return f.cicloInicio ? `${formatarData(f.cicloInicio)} a ${formatarData(f.cicloFim)}` : 'Avulsa'
}

/** Lista curta (ficha do cliente e Configurações › Assinatura). */
export function ListaFaturas({
  faturas,
  aoAbrir,
}: {
  faturas: LinhaFatura[]
  aoAbrir: (id: string) => void
}) {
  if (!faturas.length) return <p className="text-sm text-muted-foreground">Nenhuma fatura ainda.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1 pr-3 font-medium">Nº</th>
            <th className="py-1 pr-3 font-medium">Período</th>
            <th className="py-1 pr-3 font-medium">Vencimento</th>
            <th className="py-1 pr-3 text-right font-medium">Total</th>
            <th className="py-1 font-medium">Situação</th>
          </tr>
        </thead>
        <tbody>
          {faturas.map((f) => (
            <tr
              key={f.id}
              className="cursor-pointer border-t hover:bg-muted/50"
              onClick={() => aoAbrir(f.id)}
            >
              <td className="py-1.5 pr-3">{f.numero}</td>
              <td className="py-1.5 pr-3">{periodoFatura(f)}</td>
              <td className="py-1.5 pr-3">{formatarData(f.vencimento)}</td>
              <td className="py-1.5 pr-3 text-right">{moeda(f.total)}</td>
              <td className="py-1.5">
                <EtiquetaFatura situacao={f.situacao} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RegistrarRecebimento({
  fatura,
  aoConcluir,
}: {
  fatura: Fatura
  aoConcluir: () => Promise<unknown>
}) {
  const [data, setData] = useState(new Date().toISOString().slice(0, 10))
  const [valor, setValor] = useState<string | null>(fatura.saldo)
  const [forma, setForma] = useState<FormaPagamento>('pix')
  const [referencia, setReferencia] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  return (
    <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
      <p className="font-medium sm:col-span-2">Registrar recebimento</p>
      {erro && (
        <Aviso tom="erro" className="sm:col-span-2">
          {erro}
        </Aviso>
      )}
      <Campo rotulo="Data" id="rec-data">
        <Entrada id="rec-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
      </Campo>
      <Campo rotulo="Valor" id="rec-valor">
        <CampoNumero id="rec-valor" casas={2} unidade="R$" valor={valor} aoMudar={setValor} />
      </Campo>
      <Campo rotulo="Forma" id="rec-forma">
        <Selecao
          id="rec-forma"
          value={forma}
          onChange={(e) => setForma(e.target.value as FormaPagamento)}
        >
          {FORMAS_PAGAMENTO.map((f) => (
            <option key={f} value={f}>
              {NOMES_FORMA_PAGAMENTO[f]}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Campo rotulo="Referência" id="rec-ref" ajuda="Ex.: identificador da transação.">
        <Entrada id="rec-ref" value={referencia} onChange={(e) => setReferencia(e.target.value)} />
      </Campo>
      <Campo rotulo="Comprovante" id="rec-arquivo" className="sm:col-span-2" ajuda="PDF ou imagem.">
        <Entrada
          id="rec-arquivo"
          type="file"
          accept="application/pdf,image/*"
          onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
        />
      </Campo>
      <div className="sm:col-span-2">
        <Botao
          disabled={enviando || !valor}
          onClick={async () => {
            setErro(null)
            setEnviando(true)
            const dados = new FormData()
            // Os campos vão antes do arquivo: o servidor lê na ordem.
            dados.set('data', data)
            dados.set('valor', valor ?? '')
            dados.set('forma', forma)
            if (referencia) dados.set('referencia', referencia)
            if (arquivo) dados.set('comprovante', arquivo)
            try {
              await api.post(`/api/plataforma/faturas/${fatura.id}/recebimentos`, dados)
              await aoConcluir()
            } catch (e) {
              setErro((e as Error).message)
            } finally {
              setEnviando(false)
            }
          }}
        >
          Dar baixa
        </Botao>
      </div>
    </div>
  )
}

export function DetalheFatura({
  id,
  plataforma,
  podeEditar = false,
  podeEstornar = false,
  aoFechar,
}: {
  id: string
  plataforma: boolean
  podeEditar?: boolean
  podeEstornar?: boolean
  aoFechar: () => void
}) {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['fatura', id],
    queryFn: () =>
      api.get<Fatura>(plataforma ? `/api/plataforma/faturas/${id}` : `/api/faturas/${id}`),
  })
  const [estornar, setEstornar] = useState<string | null>(null)
  const [cancelar, setCancelar] = useState(false)
  const [baixa, setBaixa] = useState(false)
  const recarregar = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['fatura', id] }),
      qc.invalidateQueries({ queryKey: ['faturas'] }),
      qc.invalidateQueries({ queryKey: ['assinatura'] }),
      qc.invalidateQueries({ queryKey: ['lista'] }),
    ])
  const f = q.data
  const urlComprovante = (anexoId: string) =>
    plataforma ? `/api/plataforma/anexos/${anexoId}/arquivo` : `/api/anexos/${anexoId}/arquivo`
  return (
    <Dialogo
      aberto
      largo
      aoMudar={(x) => !x && aoFechar()}
      titulo={f ? `Fatura ${f.numero}` : 'Fatura'}
      descricao={f ? `${f.cliente} · ${periodoFatura(f)}` : undefined}
      rodape={
        f &&
        plataforma &&
        podeEditar &&
        f.situacao !== 'cancelada' &&
        paraCentavos(f.recebido) === 0 && (
          <Botao variante="secundario" onClick={() => setCancelar(true)}>
            Cancelar fatura
          </Botao>
        )
      }
    >
      {!f ? (
        <p className="text-sm text-muted-foreground">
          {q.isError ? (q.error as Error).message : 'Carregando…'}
        </p>
      ) : (
        <div className="flex flex-col gap-4 text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span>
              <EtiquetaFatura situacao={f.situacao} />
            </span>
            <span>Emissão: {formatarData(f.emissao)}</span>
            <span>Vencimento: {formatarData(f.vencimento)}</span>
          </div>
          {f.situacao === 'cancelada' && (
            <Aviso tom="info">
              Cancelada em {formatarDataHora(f.canceladaEm)}: {f.motivoCancelamento}
            </Aviso>
          )}
          {f.observacao && <p className="text-muted-foreground">{f.observacao}</p>}
          <table className="w-full">
            <tbody>
              {f.itens.map((i) => (
                <tr key={i.id} className="border-b">
                  <td className="py-1.5 pr-3">
                    {i.quantidade > 1 ? `${i.quantidade} × ` : ''}
                    {i.descricao}
                  </td>
                  <td className="py-1.5 text-right whitespace-nowrap">{moeda(i.valor)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-1.5 pr-3 font-medium">Total</td>
                <td className="py-1.5 text-right font-medium">{moeda(f.total)}</td>
              </tr>
              <tr className="text-muted-foreground">
                <td className="pr-3">Recebido · saldo</td>
                <td className="text-right whitespace-nowrap">
                  {moeda(f.recebido)} · {moeda(f.saldo)}
                </td>
              </tr>
            </tbody>
          </table>
          {f.pagamento?.situacao === 'ativa' && paraCentavos(f.saldo) > 0 && (
            <div className="flex flex-col gap-2 rounded-md border p-3">
              <p className="font-medium">Pagamento</p>
              {f.pagamento.link && (
                <p>
                  <a
                    className="font-medium underline"
                    href={f.pagamento.link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {plataforma ? 'Link de pagamento do cliente' : 'Pagar a fatura'}
                  </a>{' '}
                  <span className="text-muted-foreground">
                    (boleto, PIX ou cartão, na página do provedor)
                  </span>
                </p>
              )}
              {f.pagamento.pixCopiaCola && (
                <div className="flex flex-wrap items-center gap-2">
                  <span>PIX copia e cola:</span>
                  <Entrada
                    readOnly
                    className="flex-1"
                    value={f.pagamento.pixCopiaCola}
                    onFocus={(e) => e.target.select()}
                    aria-label="PIX copia e cola"
                  />
                  <Botao
                    variante="secundario"
                    tamanho="pequeno"
                    onClick={() => void navigator.clipboard?.writeText(f.pagamento!.pixCopiaCola!)}
                  >
                    Copiar
                  </Botao>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                A baixa é automática quando o provedor confirma o pagamento.
              </p>
            </div>
          )}
          {f.nota && (
            <p>
              Nota fiscal de serviço:{' '}
              {f.nota.situacao === 'emitida' ? (
                <>
                  nº {f.nota.numero}
                  {f.nota.linkPdf && (
                    <>
                      {' · '}
                      <a
                        className="underline"
                        href={f.nota.linkPdf}
                        target="_blank"
                        rel="noreferrer"
                      >
                        PDF
                      </a>
                    </>
                  )}
                </>
              ) : f.nota.situacao === 'erro' ? (
                'erro na emissão (a equipe do ViniCycle foi avisada)'
              ) : (
                'em emissão'
              )}
            </p>
          )}
          {f.recebimentos.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="font-medium">Recebimentos</p>
              {f.recebimentos.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b py-1"
                >
                  <span className={r.estornadoEm ? 'text-muted-foreground line-through' : ''}>
                    {formatarData(r.data)} · {moeda(r.valor)} · {NOMES_FORMA_PAGAMENTO[r.forma]}
                    {r.referencia && ` · ${r.referencia}`}
                    {r.origem === 'provedor' && ' · pelo provedor'}
                  </span>
                  <span className="flex items-center gap-2">
                    {r.comprovanteId && (
                      <a className="underline" href={urlComprovante(r.comprovanteId)}>
                        Comprovante
                      </a>
                    )}
                    {r.estornadoEm ? (
                      <span className="text-muted-foreground">Estornado: {r.motivoEstorno}</span>
                    ) : (
                      plataforma &&
                      podeEstornar && (
                        <BotaoIcone
                          rotulo="Estornar o recebimento"
                          aoClicar={() => setEstornar(r.id)}
                        >
                          <Undo2 />
                        </BotaoIcone>
                      )
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
          {plataforma &&
            podeEditar &&
            f.situacao !== 'cancelada' &&
            paraCentavos(f.saldo) > 0 &&
            (baixa ? (
              <RegistrarRecebimento
                fatura={f}
                aoConcluir={async () => {
                  setBaixa(false)
                  await recarregar()
                }}
              />
            ) : (
              <div>
                <Botao onClick={() => setBaixa(true)}>Registrar recebimento</Botao>
              </div>
            ))}
        </div>
      )}
      <PedirMotivo
        aberto={!!estornar}
        aoMudar={(x) => !x && setEstornar(null)}
        titulo="Estornar recebimento"
        descricao="O recebimento fica registrado como estornado, e a fatura volta a ter saldo."
        rotuloBotao="Estornar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/plataforma/recebimentos/${estornar}/estornar`, { motivo })
          await recarregar()
        }}
      />
      <PedirMotivo
        aberto={cancelar}
        aoMudar={setCancelar}
        titulo="Cancelar fatura"
        descricao="A fatura deixa de ser cobrada. Proporcionais que ela cobrava voltam para a próxima."
        rotuloBotao="Cancelar fatura"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/plataforma/faturas/${id}/cancelar`, { motivo })
          await recarregar()
        }}
      />
    </Dialogo>
  )
}

export function NovaFaturaAvulsa({
  empresaId,
  aoFechar,
}: {
  empresaId: string
  aoFechar: () => void
}) {
  const qc = useQueryClient()
  const form = useFormulario(faturaAvulsaEntrada, {
    vencimento: new Date().toISOString().slice(0, 10),
    observacao: '',
    itens: [{ descricao: '', quantidade: 1, valorUnitario: '' }],
  })
  const v = form.valores
  return (
    <Dialogo
      aberto
      largo
      aoMudar={(x) => !x && aoFechar()}
      titulo="Nova fatura avulsa"
      descricao="Cobrança fora do ciclo da assinatura (implantação, treinamento, serviço…)."
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
                await api.post(`/api/plataforma/empresas/${empresaId}/faturas`, d)
                await qc.invalidateQueries({ queryKey: ['faturas'] })
                aoFechar()
              } catch (e) {
                form.erroDaApi(e)
              }
            }}
          >
            Emitir
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {form.erroGeral && <Aviso tom="erro">{form.erroGeral}</Aviso>}
        {v.itens.map((i, n) => (
          <div key={n} className="grid items-end gap-3 sm:grid-cols-[1fr_6rem_9rem_auto]">
            <Campo rotulo="Descrição" id={`av-desc-${n}`} erro={form.erro(`itens.${n}.descricao`)}>
              <Entrada
                id={`av-desc-${n}`}
                value={i.descricao}
                onChange={(e) => form.definir(`itens.${n}.descricao`, e.target.value)}
              />
            </Campo>
            <Campo rotulo="Qtd." id={`av-qtd-${n}`}>
              <Entrada
                id={`av-qtd-${n}`}
                type="number"
                min={1}
                value={i.quantidade}
                onChange={(e) =>
                  form.definir(`itens.${n}.quantidade`, Math.max(1, Number(e.target.value) || 1))
                }
              />
            </Campo>
            <Campo rotulo="Valor" id={`av-valor-${n}`} erro={form.erro(`itens.${n}.valorUnitario`)}>
              <CampoNumero
                id={`av-valor-${n}`}
                casas={2}
                unidade="R$"
                valor={i.valorUnitario}
                aoMudar={(x) => form.definir(`itens.${n}.valorUnitario`, x ?? '')}
              />
            </Campo>
            <Botao
              variante="secundario"
              tamanho="pequeno"
              aria-label="Remover item"
              disabled={v.itens.length === 1}
              onClick={() =>
                form.definir(
                  'itens',
                  v.itens.filter((_, k) => k !== n),
                )
              }
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
              form.definir('itens', [
                ...v.itens,
                { descricao: '', quantidade: 1, valorUnitario: '' },
              ])
            }
          >
            <Plus /> Item
          </Botao>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Vencimento" id="av-venc" erro={form.erro('vencimento')}>
            <Entrada
              id="av-venc"
              type="date"
              value={v.vencimento}
              onChange={(e) => form.definir('vencimento', e.target.value)}
            />
          </Campo>
          <Campo rotulo="Observação" id="av-obs">
            <AreaTexto
              id="av-obs"
              value={v.observacao ?? ''}
              onChange={(e) => form.definir('observacao', e.target.value)}
            />
          </Campo>
        </div>
      </div>
    </Dialogo>
  )
}
