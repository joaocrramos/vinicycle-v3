// EnoTrace › Vinhedos: propriedades vitícolas e parcelas, próprias ou do produtor de uva (cantina.md,
// Recepção, Origem). Cadastro mínimo em 2026; o resto fica para o VitiTrack.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatarDecimal } from '@vinicycle/shared'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { AcoesLinha, colunaAcoes } from '@/componentes/AcoesLinha'
import { CampoNumero } from '@/componentes/campos-especiais'
import { PedirMotivo } from '@/componentes/PedirMotivo'
import { TabelaDados } from '@/componentes/TabelaDados'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, Etiqueta } from '@/componentes/ui/cartao'
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { Dialogo } from '@/componentes/ui/dialogo'
import { Pagina } from '@/layout/Estrutura'
import { api } from '@/lib/api'
import { pode, useSessao } from '@/lib/sessao'
import { useVariedadesEmUso } from './Projetos'

const F = 'enotrace.cadastros'

interface Linha {
  id: string
  nome: string
  dono: string | null
  numeroSivibe: string | null
  municipio: string | null
  uf: string | null
  parcelas: number
  areaHa: string | null
  ativo: boolean
}

interface Parcela {
  id?: string
  nome: string
  variedadeId: string | null
  areaHa: string | null
  ativo: boolean
}

interface Propriedade {
  id: string
  nome: string
  donoId: string | null
  numeroSivibe: string | null
  municipio: string | null
  uf: string | null
  codigoIbge: string | null
  observacoes: string | null
  versao: number
  parcelas: Parcela[]
}

function DialogoPropriedade({ id, aoFechar }: { id: string | null; aoFechar: () => void }) {
  const atual = useQuery({
    queryKey: ['propriedade', id],
    queryFn: () => api.get<Propriedade>(`/api/propriedades/${id}`),
    enabled: !!id,
  })
  if (id && !atual.data) return null
  return <Corpo p={atual.data ?? null} aoFechar={aoFechar} />
}

function Corpo({ p, aoFechar }: { p: Propriedade | null; aoFechar: () => void }) {
  const qc = useQueryClient()
  const { data: s } = useSessao()
  const variedades = useVariedadesEmUso()
  const produtores = useQuery({
    queryKey: ['pessoas-opcoes', 'produtor_uva'],
    queryFn: () =>
      api.get<Array<{ id: string; nome: string }>>('/api/pessoas/opcoes?papel=produtor_uva'),
  })
  const [d, setD] = useState({
    nome: p?.nome ?? '',
    donoId: p?.donoId ?? '',
    numeroSivibe: p?.numeroSivibe ?? '',
    municipio: p?.municipio ?? '',
    uf: p?.uf ?? '',
    observacoes: p?.observacoes ?? '',
    parcelas: p?.parcelas ?? ([] as Parcela[]),
  })
  const [erro, setErro] = useState<string | null>(null)
  const podeEditar = pode(s, F, p ? 'editar' : 'criar')
  const muda = (n: number, parcial: Partial<Parcela>) =>
    setD({ ...d, parcelas: d.parcelas.map((x, j) => (j === n ? { ...x, ...parcial } : x)) })
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo={p ? p.nome : 'Nova propriedade'}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            {podeEditar ? 'Cancelar' : 'Fechar'}
          </Botao>
          {podeEditar && (
            <Botao
              onClick={async () => {
                setErro(null)
                const corpo = { ...d, versao: p?.versao }
                try {
                  if (p) await api.put(`/api/propriedades/${p.id}`, corpo)
                  else await api.post('/api/propriedades', corpo)
                  await qc.invalidateQueries({ queryKey: ['lista', '/api/propriedades'] })
                  await qc.invalidateQueries({ queryKey: ['propriedade', p?.id] })
                  aoFechar()
                } catch (e) {
                  setErro((e as Error).message)
                }
              }}
            >
              Salvar
            </Botao>
          )}
        </>
      }
    >
      <fieldset disabled={!podeEditar} className="flex flex-col gap-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Nome" id="prop-nome" obrigatorio>
            <Entrada
              id="prop-nome"
              value={d.nome}
              onChange={(e) => setD({ ...d, nome: e.target.value })}
            />
          </Campo>
          <Campo
            rotulo="Dono"
            id="prop-dono"
            ajuda="Vazio = a própria vinícola. Produtor: pessoa com o papel de produtor de uva."
          >
            <Selecao
              id="prop-dono"
              value={d.donoId}
              onChange={(e) => setD({ ...d, donoId: e.target.value })}
            >
              <option value="">A própria vinícola</option>
              {produtores.data?.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Número no SIVIBE" id="prop-sivibe">
            <Entrada
              id="prop-sivibe"
              value={d.numeroSivibe}
              onChange={(e) => setD({ ...d, numeroSivibe: e.target.value })}
            />
          </Campo>
          <div className="grid grid-cols-[1fr_5rem] gap-4">
            <Campo rotulo="Município" id="prop-municipio">
              <Entrada
                id="prop-municipio"
                value={d.municipio}
                onChange={(e) => setD({ ...d, municipio: e.target.value })}
              />
            </Campo>
            <Campo rotulo="UF" id="prop-uf">
              <Entrada
                id="prop-uf"
                maxLength={2}
                value={d.uf}
                onChange={(e) =>
                  setD({ ...d, uf: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })
                }
              />
            </Campo>
          </div>
        </div>
        <p className="text-sm font-medium">Parcelas</p>
        {d.parcelas.map((x, n) => (
          <div
            key={x.id ?? `nova-${n}`}
            className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_8rem_auto]"
          >
            <Campo rotulo="Nome" id={`parc-nome-${n}`}>
              <Entrada
                id={`parc-nome-${n}`}
                value={x.nome}
                onChange={(e) => muda(n, { nome: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Variedade" id={`parc-var-${n}`}>
              <Selecao
                id={`parc-var-${n}`}
                value={x.variedadeId ?? ''}
                onChange={(e) => muda(n, { variedadeId: e.target.value || null })}
              >
                <option value="">—</option>
                {variedades.data?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Área" id={`parc-area-${n}`}>
              <CampoNumero
                id={`parc-area-${n}`}
                casas={2}
                unidade="ha"
                valor={x.areaHa}
                aoMudar={(v) => muda(n, { areaHa: v })}
              />
            </Campo>
            <Botao
              variante="fantasma"
              tamanho="icone"
              aria-label="Remover parcela"
              onClick={() => setD({ ...d, parcelas: d.parcelas.filter((_, j) => j !== n) })}
            >
              <Trash2 />
            </Botao>
          </div>
        ))}
        {podeEditar && (
          <div>
            <Botao
              variante="secundario"
              tamanho="pequeno"
              onClick={() =>
                setD({
                  ...d,
                  parcelas: [
                    ...d.parcelas,
                    { nome: '', variedadeId: null, areaHa: null, ativo: true },
                  ],
                })
              }
            >
              <Plus /> Parcela
            </Botao>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Parcela retirada da lista fica inativa: a recepção que a usou continua com ela.
        </p>
        <Campo rotulo="Observações" id="prop-obs">
          <AreaTexto
            id="prop-obs"
            value={d.observacoes}
            onChange={(e) => setD({ ...d, observacoes: e.target.value })}
          />
        </Campo>
      </fieldset>
    </Dialogo>
  )
}

export function PaginaVinhedos() {
  const { data: s } = useSessao()
  const qc = useQueryClient()
  const [aberto, setAberto] = useState<string | 'nova' | null>(null)
  const [inativar, setInativar] = useState<Linha | null>(null)
  const podeInativar = pode(s, F, 'inativar')
  return (
    <Pagina
      titulo="Vinhedos"
      trilha={['EnoTrace', 'Cadastros']}
      acoes={
        pode(s, F, 'criar') && (
          <Botao onClick={() => setAberto('nova')}>
            <Plus /> Nova propriedade
          </Botao>
        )
      }
    >
      <p className="text-sm text-muted-foreground">
        Propriedades e parcelas, próprias ou dos produtores de uva. A recepção usa a parcela e o
        número do SIVIBE da origem da uva.
      </p>
      <TabelaDados<Linha>
        tabela="propriedades"
        url="/api/propriedades"
        ordemPadrao={{ campo: 'nome', direcao: 'asc' }}
        filtrosIniciais={{ situacao: 'ativos' }}
        aoClicar={(p) => setAberto(p.id)}
        podeExportar={pode(s, F, 'exportar')}
        colunas={[
          {
            id: 'nome',
            titulo: 'Propriedade',
            ordenavel: true,
            celula: (p) => p.nome,
            exportar: (p) => p.nome,
          },
          {
            id: 'dono',
            titulo: 'Dono',
            celula: (p) => p.dono ?? 'A própria vinícola',
            exportar: (p) => p.dono ?? '',
          },
          {
            id: 'sivibe',
            titulo: 'SIVIBE',
            celula: (p) => p.numeroSivibe ?? '—',
            exportar: (p) => p.numeroSivibe,
          },
          {
            id: 'municipio',
            titulo: 'Município',
            ordenavel: true,
            celula: (p) => [p.municipio, p.uf].filter(Boolean).join(' / ') || '—',
            exportar: (p) => p.municipio,
          },
          {
            id: 'parcelas',
            titulo: 'Parcelas',
            className: 'text-right',
            celula: (p) =>
              `${p.parcelas}${p.areaHa ? ` · ${formatarDecimal(p.areaHa, 2)} ha` : ''}`,
            exportar: (p) => p.parcelas,
          },
          {
            id: 'situacao',
            titulo: 'Situação',
            celula: (p) => (
              <Etiqueta tom={p.ativo ? 'sucesso' : 'neutro'}>
                {p.ativo ? 'Ativa' : 'Inativa'}
              </Etiqueta>
            ),
          },
          colunaAcoes<Linha>((p) => (
            <AcoesLinha
              ativo={p.ativo}
              aoEditar={pode(s, F, 'editar') ? () => setAberto(p.id) : undefined}
              aoInativar={podeInativar ? () => setInativar(p) : undefined}
              aoReativar={
                podeInativar
                  ? async () => {
                      await api.post(`/api/propriedades/${p.id}/reativar`)
                      await qc.invalidateQueries({ queryKey: ['lista', '/api/propriedades'] })
                    }
                  : undefined
              }
            />
          )),
        ]}
      />
      {aberto && (
        <DialogoPropriedade
          id={aberto === 'nova' ? null : aberto}
          aoFechar={() => setAberto(null)}
        />
      )}
      <PedirMotivo
        aberto={!!inativar}
        aoMudar={(x) => !x && setInativar(null)}
        titulo={`Inativar ${inativar?.nome ?? ''}`}
        rotuloBotao="Inativar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/propriedades/${inativar!.id}/inativar`, { motivo })
          await qc.invalidateQueries({ queryKey: ['lista', '/api/propriedades'] })
        }}
      />
    </Pagina>
  )
}
