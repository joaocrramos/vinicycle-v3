// EnoTrace › Operações: entrada e saída de granel (cantina.md, Granel e GLT). A entrada põe vinho
// de fora num lote novo ou incorporado, com a composição informada ou "não informada"; a saída tira
// litros para fora. As duas guardam nota, partes, GLT e embalagem; a saída sem GLT pede "ciente"
// (Decreto 12.709/2025, art. 203, IV).
import { useQuery } from '@tanstack/react-query'
import {
  EMBALAGENS_GRANEL,
  formatarDecimal,
  TIPOS_ENTRADA_GRANEL,
  TIPOS_SAIDA_GRANEL,
} from '@vinicycle/shared'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { CampoNumero } from '@/componentes/campos-especiais'
import { Botao } from '@/componentes/ui/botao'
import { CabecalhoCartao, Cartao, CorpoCartao } from '@/componentes/ui/cartao'
import { Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { Pagina } from '@/layout/Estrutura'
import { api } from '@/lib/api'
import { litros, useVariedadesEmUso } from '../Projetos'
import {
  agora,
  Cabecalho,
  ComRascunho,
  doCampo,
  type Rascunho,
  type RecipienteSaldo,
  type RefLote,
  recipienteDaUrl,
  Rodape,
  SeletorLote,
  useEnvio,
  useLotesDoProjeto,
  useProjetos,
  useRecipientes,
} from './comum'

const rotuloRecipiente = (r: RecipienteSaldo) =>
  `${r.codigo} · ${litros(r.volume)} de ${litros(r.capacidadeLitros)}${r.lote ? ` · ${r.lote.codigo}` : ''}`

function usePessoas(papel?: string) {
  return useQuery({
    queryKey: ['pessoas-opcoes', papel ?? 'todas'],
    queryFn: () =>
      api.get<Array<{ id: string; nome: string }>>(
        `/api/pessoas/opcoes${papel ? `?papel=${papel}` : ''}`,
      ),
  })
}

interface Documento {
  notaNumero: string
  notaChave: string
  remetenteId: string
  destinatarioId: string
  transportadorId: string
  glt: string
  embalagem: string
}

const DOCUMENTO_VAZIO: Documento = {
  notaNumero: '',
  notaChave: '',
  remetenteId: '',
  destinatarioId: '',
  transportadorId: '',
  glt: '',
  embalagem: '',
}

const documentoParaApi = (d: Documento) => ({
  notaNumero: d.notaNumero,
  notaChave: d.notaChave,
  remetenteId: d.remetenteId || null,
  destinatarioId: d.destinatarioId || null,
  transportadorId: d.transportadorId || null,
  glt: d.glt,
  embalagem: d.embalagem || null,
})

/** Nota, partes, GLT e embalagem: comum à entrada e à saída. */
function CartaoDocumento({
  d,
  set,
  parte,
  children,
}: {
  d: Documento
  set: (p: Partial<Documento>) => void
  /** A outra parte: quem mandou (entrada) ou quem recebe (saída). */
  parte: 'remetenteId' | 'destinatarioId'
  children?: React.ReactNode
}) {
  const pessoas = usePessoas()
  const transportadores = usePessoas('transportador')
  return (
    <Cartao>
      <CabecalhoCartao
        titulo="Nota e transporte"
        descricao="A GLT acompanha o vinho a granel (Lei 7.678/1988, art. 2º, §1º; Decreto 12.709/2025, art. 235; Portaria MAPA 690/2022)."
      />
      <CorpoCartao className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo={parte === 'remetenteId' ? 'Remetente' : 'Destinatário'} id="gr-parte">
          <Selecao
            id="gr-parte"
            value={d[parte]}
            onChange={(e) => set({ [parte]: e.target.value })}
          >
            <option value="">—</option>
            {pessoas.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Transportador" id="gr-transp">
          <Selecao
            id="gr-transp"
            value={d.transportadorId}
            onChange={(e) => set({ transportadorId: e.target.value })}
          >
            <option value="">—</option>
            {transportadores.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Número da nota" id="gr-nf">
          <Entrada
            id="gr-nf"
            value={d.notaNumero}
            onChange={(e) => set({ notaNumero: e.target.value })}
          />
        </Campo>
        <Campo rotulo="Chave da NF-e" id="gr-chave" ajuda="44 dígitos.">
          <Entrada
            id="gr-chave"
            inputMode="numeric"
            maxLength={44}
            value={d.notaChave}
            onChange={(e) => set({ notaChave: e.target.value.replace(/\D/g, '') })}
          />
        </Campo>
        <Campo rotulo="Número da GLT" id="gr-glt">
          <Entrada id="gr-glt" value={d.glt} onChange={(e) => set({ glt: e.target.value })} />
        </Campo>
        <Campo rotulo="Embalagem" id="gr-emb">
          <Selecao
            id="gr-emb"
            value={d.embalagem}
            onChange={(e) => set({ embalagem: e.target.value })}
          >
            <option value="">—</option>
            {Object.entries(EMBALAGENS_GRANEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Selecao>
        </Campo>
        {children}
      </CorpoCartao>
    </Cartao>
  )
}

// Entrada ----------------------------------------------------------------------------------------

export function PaginaEntradaGranel() {
  return <ComRascunho>{(r) => <EntradaGranel rascunho={r} />}</ComRascunho>
}

interface ItemComposicao {
  variedadeId: string
  safra: string
  organica: boolean
  percentual: string | null
}

function EntradaGranel({ rascunho }: { rascunho: Rascunho | null }) {
  const recipientes = useRecipientes()
  const projetos = useProjetos()
  const variedades = useVariedadesEmUso()
  const clientes = usePessoas('cliente_vinificacao')
  const envio = useEnvio('entrada_granel', rascunho)
  const [d, setD] = useState(() => ({
    executadoEm: agora(),
    projetoId: '',
    responsavelId: '',
    planoEtapaId: '',
    observacao: '',
    tipoGranel: 'compra' as keyof typeof TIPOS_ENTRADA_GRANEL,
    titularId: '',
    documento: DOCUMENTO_VAZIO,
    recebimentoConfirmadoEm: '',
    composicao: [] as ItemComposicao[],
    destinos: [
      {
        recipienteId: recipienteDaUrl(),
        lote: { novo: 'A' } as RefLote | null,
        litros: null as string | null,
      },
    ],
    ...rascunho?.formulario,
  }))
  const set = (p: Partial<typeof d>) => {
    envio.limpar()
    setD({ ...d, ...p })
  }
  const setComp = (n: number, p: Partial<ItemComposicao>) =>
    set({ composicao: d.composicao.map((x, j) => (j === n ? { ...x, ...p } : x)) })
  const lotes = useLotesDoProjeto(d.projetoId)
  const soma = d.composicao.reduce((t, c) => t + Number(c.percentual ?? 0), 0)
  const corpo = () => ({
    executadoEm: doCampo(d.executadoEm),
    responsavelId: d.responsavelId || null,
    planoEtapaId: d.planoEtapaId || null,
    observacao: d.observacao,
    tipoGranel: d.tipoGranel,
    projetoId: d.projetoId,
    titularId: d.titularId || null,
    ...documentoParaApi(d.documento),
    recebimentoConfirmadoEm: d.recebimentoConfirmadoEm || null,
    composicao: d.composicao.map((c) => ({
      variedadeId: c.variedadeId,
      safra: c.safra ? Number(c.safra) : null,
      organica: c.organica,
      percentual: c.percentual ?? '',
    })),
    destinos: d.destinos.map((x) => ({
      recipienteId: x.recipienteId,
      litros: x.litros ?? '',
      lote: x.lote,
    })),
  })
  const usados = new Set(d.destinos.map((x) => x.recipienteId))
  return (
    <Pagina titulo="Entrada de granel" trilha={['EnoTrace', 'Operações']}>
      <p className="text-sm text-muted-foreground">
        Vinho que chega de fora: compra, retorno de terceiro ou outra. Entra num lote novo ou
        incorporado a um lote do projeto, com a composição que você informar.
      </p>
      <Cartao>
        <CabecalhoCartao titulo="Operação" />
        <CorpoCartao className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Tipo" id="eg-tipo" obrigatorio>
            <Selecao
              id="eg-tipo"
              value={d.tipoGranel}
              onChange={(e) => set({ tipoGranel: e.target.value as typeof d.tipoGranel })}
            >
              {Object.entries(TIPOS_ENTRADA_GRANEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Projeto" id="eg-proj" obrigatorio>
            <Selecao
              id="eg-proj"
              value={d.projetoId}
              onChange={(e) => set({ projetoId: e.target.value, planoEtapaId: '' })}
            >
              <option value="">Escolha</option>
              {projetos.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} · {p.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo
            rotulo="Titular do vinho"
            id="eg-titular"
            ajuda="Vazio = a própria empresa. Vinho de cliente de vinificação forma lote dele."
          >
            <Selecao
              id="eg-titular"
              value={d.titularId}
              onChange={(e) => set({ titularId: e.target.value })}
            >
              <option value="">A própria empresa</option>
              {clientes.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Cabecalho d={d} set={set} projetoId={d.projetoId} tipo="entrada_granel" />
        </CorpoCartao>
      </Cartao>
      <CartaoDocumento
        d={d.documento}
        set={(p) => set({ documento: { ...d.documento, ...p } })}
        parte="remetenteId"
      >
        <Campo
          rotulo="Recebimento confirmado em"
          id="eg-receb"
          ajuda="Quando a chegada foi confirmada na GLT. Pode marcar depois, na ficha da operação."
        >
          <Entrada
            id="eg-receb"
            type="date"
            value={d.recebimentoConfirmadoEm}
            onChange={(e) => set({ recebimentoConfirmadoEm: e.target.value })}
          />
        </Campo>
      </CartaoDocumento>
      <Cartao>
        <CabecalhoCartao
          titulo="Composição"
          descricao="Variedades, safra e percentual do vinho que chega. Sem composição, o vinho entra como “não informada”. A lista traz as variedades em uso da empresa (Catálogos › Variedades)."
        />
        <CorpoCartao className="flex flex-col gap-3">
          {d.composicao.map((c, n) => (
            <div key={n} className="grid items-end gap-2 sm:grid-cols-[1fr_7rem_9rem_auto_auto]">
              <Campo rotulo="Variedade" id={`eg-var-${n}`}>
                <Selecao
                  id={`eg-var-${n}`}
                  value={c.variedadeId}
                  onChange={(e) => setComp(n, { variedadeId: e.target.value })}
                >
                  <option value="">Escolha</option>
                  {variedades.data?.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nome}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Campo rotulo="Safra" id={`eg-safra-${n}`}>
                <Entrada
                  id={`eg-safra-${n}`}
                  inputMode="numeric"
                  maxLength={4}
                  value={c.safra}
                  onChange={(e) => setComp(n, { safra: e.target.value.replace(/\D/g, '') })}
                />
              </Campo>
              <Campo rotulo="Percentual" id={`eg-pct-${n}`}>
                <CampoNumero
                  id={`eg-pct-${n}`}
                  casas={2}
                  unidade="%"
                  valor={c.percentual}
                  aoMudar={(v) => setComp(n, { percentual: v })}
                />
              </Campo>
              <Caixa
                rotulo="Orgânica"
                checked={c.organica}
                onChange={(e) => setComp(n, { organica: e.target.checked })}
              />
              <Botao
                variante="fantasma"
                tamanho="icone"
                aria-label="Remover variedade"
                onClick={() => set({ composicao: d.composicao.filter((_, j) => j !== n) })}
              >
                <Trash2 />
              </Botao>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-4">
            <Botao
              variante="secundario"
              tamanho="pequeno"
              onClick={() =>
                set({
                  composicao: [
                    ...d.composicao,
                    { variedadeId: '', safra: '', organica: false, percentual: null },
                  ],
                })
              }
            >
              <Plus /> Variedade
            </Botao>
            {d.composicao.length > 0 && (
              <span
                className={
                  Math.abs(soma - 100) < 0.005
                    ? 'text-sm text-muted-foreground'
                    : 'text-sm text-destructive'
                }
              >
                Soma: {formatarDecimal(soma.toFixed(2), 2)}%
              </span>
            )}
          </div>
        </CorpoCartao>
      </Cartao>
      <Cartao>
        <CabecalhoCartao titulo="Recipientes de destino" />
        <CorpoCartao className="flex flex-col gap-3">
          {d.destinos.map((x, n) => {
            const r = recipientes.data?.find((y) => y.id === x.recipienteId)
            const setDestino = (p: Partial<typeof x>) =>
              set({ destinos: d.destinos.map((z, j) => (j === n ? { ...z, ...p } : z)) })
            return (
              <div key={n} className="grid items-end gap-2 sm:grid-cols-[1fr_14rem_10rem_auto]">
                <Campo rotulo="Recipiente" id={`eg-rec-${n}`}>
                  <Selecao
                    id={`eg-rec-${n}`}
                    value={x.recipienteId}
                    onChange={(e) => {
                      const rr = recipientes.data?.find((y) => y.id === e.target.value)
                      setDestino({
                        recipienteId: e.target.value,
                        lote: rr?.lote ? { id: rr.lote.id } : { novo: 'A' },
                      })
                    }}
                  >
                    <option value="">Escolha</option>
                    {recipientes.data
                      ?.filter(
                        (y) =>
                          y.id === x.recipienteId ||
                          (y.situacao !== 'inativo' && !usados.has(y.id)),
                      )
                      .map((y) => (
                        <option key={y.id} value={y.id}>
                          {rotuloRecipiente(y)}
                        </option>
                      ))}
                  </Selecao>
                </Campo>
                <Campo rotulo="Lote" id={`eg-lote-${n}`}>
                  <SeletorLote
                    id={`eg-lote-${n}`}
                    recipiente={r}
                    lotes={lotes.data?.lotes ?? []}
                    valor={x.lote}
                    aoMudar={(lote) => setDestino({ lote })}
                  />
                </Campo>
                <Campo rotulo="Litros" id={`eg-l-${n}`}>
                  <CampoNumero
                    id={`eg-l-${n}`}
                    casas={2}
                    unidade="L"
                    valor={x.litros}
                    aoMudar={(v) => setDestino({ litros: v })}
                  />
                </Campo>
                <Botao
                  variante="fantasma"
                  tamanho="icone"
                  aria-label="Remover destino"
                  disabled={d.destinos.length === 1}
                  onClick={() => set({ destinos: d.destinos.filter((_, j) => j !== n) })}
                >
                  <Trash2 />
                </Botao>
              </div>
            )
          })}
          <div>
            <Botao
              variante="secundario"
              tamanho="pequeno"
              onClick={() =>
                set({
                  destinos: [
                    ...d.destinos,
                    { recipienteId: '', lote: { novo: 'A' }, litros: null },
                  ],
                })
              }
            >
              <Plus /> Recipiente
            </Botao>
          </div>
        </CorpoCartao>
      </Cartao>
      <Rodape envio={envio} corpo={corpo} formulario={() => d} />
    </Pagina>
  )
}

// Saída ------------------------------------------------------------------------------------------

export function PaginaSaidaGranel() {
  return <ComRascunho>{(r) => <SaidaGranel rascunho={r} />}</ComRascunho>
}

interface ItemSaida {
  recipienteId: string
  litros: string | null
  esvaziar: boolean
}

function SaidaGranel({ rascunho }: { rascunho: Rascunho | null }) {
  const recipientes = useRecipientes()
  const envio = useEnvio('saida_granel', rascunho)
  const [d, setD] = useState(() => ({
    executadoEm: agora(),
    responsavelId: '',
    planoEtapaId: '',
    observacao: '',
    tipoGranel: 'venda' as keyof typeof TIPOS_SAIDA_GRANEL,
    documento: DOCUMENTO_VAZIO,
    itens: [{ recipienteId: recipienteDaUrl(), litros: null, esvaziar: false }] as ItemSaida[],
    ...rascunho?.formulario,
  }))
  const set = (p: Partial<typeof d>) => {
    envio.limpar()
    setD({ ...d, ...p })
  }
  const setItem = (n: number, p: Partial<ItemSaida>) =>
    set({ itens: d.itens.map((x, j) => (j === n ? { ...x, ...p } : x)) })
  const projetos = [
    ...new Set(
      d.itens
        .map((i) => recipientes.data?.find((r) => r.id === i.recipienteId)?.lote?.projetoId)
        .filter(Boolean),
    ),
  ]
  const projetoId = projetos.length === 1 ? projetos[0]! : ''
  const corpo = () => ({
    executadoEm: doCampo(d.executadoEm),
    responsavelId: d.responsavelId || null,
    planoEtapaId: d.planoEtapaId || null,
    observacao: d.observacao,
    tipoGranel: d.tipoGranel,
    ...documentoParaApi(d.documento),
    itens: d.itens.map((i) => ({ ...i, litros: i.esvaziar ? null : i.litros })),
  })
  const usados = new Set(d.itens.map((i) => i.recipienteId))
  return (
    <Pagina titulo="Saída de granel" trilha={['EnoTrace', 'Operações']}>
      <p className="text-sm text-muted-foreground">
        Vinho que sai a granel: venda, remessa a terceiro, devolução ao titular ou outra. A
        composição do que fica não muda.
      </p>
      <Cartao>
        <CabecalhoCartao titulo="Operação" />
        <CorpoCartao className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Tipo" id="sg-tipo" obrigatorio>
            <Selecao
              id="sg-tipo"
              value={d.tipoGranel}
              onChange={(e) => set({ tipoGranel: e.target.value as typeof d.tipoGranel })}
            >
              {Object.entries(TIPOS_SAIDA_GRANEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Cabecalho d={d} set={set} projetoId={projetoId} tipo="saida_granel" />
        </CorpoCartao>
      </Cartao>
      <CartaoDocumento
        d={d.documento}
        set={(p) => set({ documento: { ...d.documento, ...p } })}
        parte="destinatarioId"
      />
      <Cartao>
        <CabecalhoCartao titulo="Recipientes" />
        <CorpoCartao className="flex flex-col gap-3">
          {d.itens.map((i, n) => (
            <div key={n} className="grid items-end gap-2 sm:grid-cols-[1fr_12rem_auto]">
              <Campo rotulo="Recipiente" id={`sg-rec-${n}`}>
                <Selecao
                  id={`sg-rec-${n}`}
                  value={i.recipienteId}
                  onChange={(e) => setItem(n, { recipienteId: e.target.value })}
                >
                  <option value="">Escolha</option>
                  {recipientes.data
                    ?.filter((r) => r.id === i.recipienteId || (!!r.lote && !usados.has(r.id)))
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {rotuloRecipiente(r)}
                      </option>
                    ))}
                </Selecao>
              </Campo>
              <Campo rotulo="Litros" id={`sg-l-${n}`}>
                {i.esvaziar ? (
                  <p className="py-2 text-sm text-muted-foreground">todo o saldo</p>
                ) : (
                  <CampoNumero
                    id={`sg-l-${n}`}
                    casas={2}
                    unidade="L"
                    valor={i.litros}
                    aoMudar={(v) => setItem(n, { litros: v })}
                  />
                )}
              </Campo>
              <Botao
                variante="fantasma"
                tamanho="icone"
                aria-label="Remover recipiente"
                disabled={d.itens.length === 1}
                onClick={() => set({ itens: d.itens.filter((_, j) => j !== n) })}
              >
                <Trash2 />
              </Botao>
              <div className="sm:col-span-3">
                <Caixa
                  rotulo="Esvaziar (sai todo o saldo)"
                  checked={i.esvaziar}
                  onChange={(e) => setItem(n, { esvaziar: e.target.checked })}
                />
              </div>
            </div>
          ))}
          <div>
            <Botao
              variante="secundario"
              tamanho="pequeno"
              onClick={() =>
                set({ itens: [...d.itens, { recipienteId: '', litros: null, esvaziar: false }] })
              }
            >
              <Plus /> Recipiente
            </Botao>
          </div>
        </CorpoCartao>
      </Cartao>
      <Rodape envio={envio} corpo={corpo} formulario={() => ({ ...d, projetoId })} />
    </Pagina>
  )
}
