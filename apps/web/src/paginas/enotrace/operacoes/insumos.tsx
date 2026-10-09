// Insumos aplicados numa operação (cantina.md, Adição de insumo): item e lote do estoque (ou o
// insumo não estocado, com descrição), dose e unidade, volume tratado. O local do estoque de onde
// saem só é pedido quando há mais de um.
import { formatarDecimal, UNIDADES_DOSE, type UnidadeDose } from '@vinicycle/shared'
import { Plus, Trash2 } from 'lucide-react'
import { CampoNumero } from '@/componentes/campos-especiais'
import { Botao } from '@/componentes/ui/botao'
import { CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao'
import { Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { type ItemOpcao, useItens, useLocais, useLotes } from '../Estoque'

export interface InsumoLinha {
  recipienteId: string
  /** "" = insumo não estocado (descrição livre). */
  itemId: string
  naoEstocado: boolean
  descricao: string
  loteItemId: string
  dose: string | null
  unidade: UnidadeDose
  volumeTratado: string | null
}

export const insumoVazio = (recipienteId = ''): InsumoLinha => ({
  recipienteId,
  itemId: '',
  naoEstocado: false,
  descricao: '',
  loteItemId: '',
  dose: null,
  unidade: 'g/hL',
  volumeTratado: null,
})

/** Corpo para a API (comumOperacao.insumos). */
export const insumosParaApi = (lista: InsumoLinha[]) =>
  lista
    .filter((i) => i.itemId || i.descricao)
    .map((i) => ({
      recipienteId: i.recipienteId || null,
      itemId: i.naoEstocado ? null : i.itemId || null,
      descricao: i.naoEstocado ? i.descricao : null,
      loteItemId: i.naoEstocado ? null : i.loteItemId || null,
      dose: i.dose ?? '0',
      unidade: i.unidade,
      volumeTratado: i.volumeTratado,
    }))

function Linha({
  i,
  n,
  itens,
  recipientes,
  rotuloTodos,
  set,
  remover,
}: {
  i: InsumoLinha
  n: number
  itens: ItemOpcao[]
  recipientes: Array<{ id: string; codigo: string }>
  rotuloTodos?: string
  set: (p: Partial<InsumoLinha>) => void
  remover: () => void
}) {
  const item = itens.find((x) => x.id === i.itemId)
  const lotes = useLotes(item?.controlaLote ? i.itemId : '')
  return (
    <div className="flex flex-col gap-2 border-b pb-3 last:border-0 last:pb-0">
      <div className="grid items-end gap-2 sm:grid-cols-[10rem_1fr_1fr_auto]">
        <Campo rotulo="Recipiente" id={`ins-rec-${n}`}>
          <Selecao
            id={`ins-rec-${n}`}
            value={i.recipienteId}
            onChange={(e) => set({ recipienteId: e.target.value })}
          >
            <option value="">{rotuloTodos ?? 'Escolha'}</option>
            {recipientes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.codigo}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Insumo" id={`ins-item-${n}`}>
          {i.naoEstocado ? (
            <Entrada
              id={`ins-item-${n}`}
              placeholder="Descrição do insumo não estocado"
              value={i.descricao}
              onChange={(e) => set({ descricao: e.target.value })}
            />
          ) : (
            <Selecao
              id={`ins-item-${n}`}
              value={i.itemId}
              onChange={(e) => set({ itemId: e.target.value, loteItemId: '' })}
            >
              <option value="">Escolha</option>
              {itens
                .filter((x) => x.tipo === 'insumo')
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nome}
                  </option>
                ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Lote do insumo" id={`ins-lote-${n}`}>
          {item?.controlaLote ? (
            <Selecao
              id={`ins-lote-${n}`}
              value={i.loteItemId}
              onChange={(e) => set({ loteItemId: e.target.value })}
            >
              <option value="">Escolha</option>
              {lotes.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codigo} · {formatarDecimal(l.saldo, 3)} {item.unidadeBase}
                  {l.situacao === 'vencido' ? ' · vencido' : ''}
                </option>
              ))}
            </Selecao>
          ) : (
            <p className="py-2 text-sm text-muted-foreground">
              {i.naoEstocado ? 'sem baixa no estoque' : 'não controla lote'}
            </p>
          )}
        </Campo>
        <Botao variante="fantasma" tamanho="icone" aria-label="Remover insumo" onClick={remover}>
          <Trash2 />
        </Botao>
      </div>
      <div className="grid items-end gap-2 sm:grid-cols-[10rem_8rem_10rem_1fr]">
        <Campo rotulo="Dose" id={`ins-dose-${n}`}>
          <CampoNumero
            id={`ins-dose-${n}`}
            casas={2}
            valor={i.dose}
            aoMudar={(v) => set({ dose: v })}
          />
        </Campo>
        <Campo rotulo="Unidade" id={`ins-un-${n}`}>
          <Selecao
            id={`ins-un-${n}`}
            value={i.unidade}
            onChange={(e) => set({ unidade: e.target.value as UnidadeDose })}
          >
            {UNIDADES_DOSE.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Volume tratado" id={`ins-vol-${n}`}>
          <CampoNumero
            id={`ins-vol-${n}`}
            casas={2}
            unidade="L"
            placeholder="o do recipiente"
            valor={i.volumeTratado}
            aoMudar={(v) => set({ volumeTratado: v })}
          />
        </Campo>
        <div className="flex items-center gap-2 pb-2">
          <Caixa
            rotulo="Não estocado (ex.: trazido pelo cliente)"
            checked={i.naoEstocado}
            onChange={(e) =>
              set({ naoEstocado: e.target.checked, itemId: '', loteItemId: '', descricao: '' })
            }
          />
          {i.naoEstocado && <Etiqueta>sem baixa</Etiqueta>}
        </div>
      </div>
    </div>
  )
}

/**
 * Cartão de insumos de uma operação. Sem recipiente escolhido, o insumo vai para "rotuloTodos"
 * (os destinos da operação); na adição avulsa, o recipiente é obrigatório.
 */
export function CartaoInsumos({
  insumos,
  set,
  recipientes,
  rotuloTodos,
  localEstoqueId,
  setLocal,
  titulo = 'Insumos (opcional)',
}: {
  insumos: InsumoLinha[]
  set: (l: InsumoLinha[]) => void
  recipientes: Array<{ id: string; codigo: string }>
  rotuloTodos?: string
  localEstoqueId: string
  setLocal: (id: string) => void
  titulo?: string
}) {
  const itens = useItens()
  const locais = useLocais()
  return (
    <Cartao>
      <CabecalhoCartao
        titulo={titulo}
        descricao="Baixa o lote do insumo no estoque. A dose em g/hL, mg/L ou g/L é multiplicada pelo volume tratado. O SO₂ soma no vinho, com alerta acima de 300 mg/L."
      />
      <CorpoCartao className="flex flex-col gap-3">
        {(locais.data?.length ?? 0) > 1 && insumos.length > 0 && (
          <Campo rotulo="Local do estoque" id="ins-local" className="sm:max-w-xs">
            <Selecao
              id="ins-local"
              value={localEstoqueId}
              onChange={(e) => setLocal(e.target.value)}
            >
              <option value="">Escolha</option>
              {locais.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
        )}
        {insumos.map((i, n) => (
          <Linha
            key={n}
            i={i}
            n={n}
            itens={itens.data ?? []}
            recipientes={recipientes}
            rotuloTodos={rotuloTodos}
            set={(p) => set(insumos.map((x, j) => (j === n ? { ...x, ...p } : x)))}
            remover={() => set(insumos.filter((_, j) => j !== n))}
          />
        ))}
        <div>
          <Botao
            variante="secundario"
            tamanho="pequeno"
            onClick={() => set([...insumos, insumoVazio()])}
          >
            <Plus /> Insumo
          </Botao>
        </div>
      </CorpoCartao>
    </Cartao>
  )
}
