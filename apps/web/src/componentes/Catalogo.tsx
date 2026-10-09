// Catálogo global com itens próprios (P8): lista os globais e os da empresa; a empresa cria,
// edita e inativa só os seus. Um componente para todos os catálogos simples. Na Administração
// (`plataforma`), lista e mantém só os globais, inclusive as listas oficiais.
import { useQueryClient } from '@tanstack/react-query'
import {
  type Catalogo as TipoCatalogo,
  esquemaDoCatalogo,
  esquemaDoCatalogoPlataforma,
  funcionalidadeDoCatalogo,
  listaOficial,
} from '@vinicycle/shared'
import { Lock, Plus } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { api } from '@/lib/api'
import { useFormulario } from '@/lib/formulario'
import { type Referencia, useReferencia } from '@/lib/referencia'
import { pode, useSessao } from '@/lib/sessao'
import { AcoesLinha, colunaAcoes } from './AcoesLinha'
import { PedirMotivo } from './PedirMotivo'
import { type Coluna, TabelaDados } from './TabelaDados'
import { Botao } from './ui/botao'
import { Aviso, Etiqueta } from './ui/cartao'
import { Caixa, Campo, Entrada, Selecao } from './ui/campos'
import { Dialogo } from './ui/dialogo'

export type ItemCatalogo = {
  id: string
  nome: string
  global: boolean
  ativo: boolean
  versao: number
  emUso: boolean
} & Record<string, unknown>

export interface CampoCatalogo {
  nome: string
  rotulo: string
  tipo: 'booleano' | 'selecao' | 'multipla' | 'numeros' | 'textos' | 'numero' | 'texto'
  opcoes?: (ref: Referencia | undefined) => Array<{ valor: string; nome: string }>
  ajuda?: string
  padrao?: unknown
}

export interface ConfigCatalogo {
  catalogo: TipoCatalogo
  campos: CampoCatalogo[]
  colunas?: Coluna<ItemCatalogo>[]
  filtrosExtras?: (f: Record<string, string>, definir: (k: string, v: string) => void) => ReactNode
  acoesLinha?: (item: ItemCatalogo, recarregar: () => void) => ReactNode
  descricao?: string
}

function Formulario({
  config,
  url,
  plataforma,
  item,
  aoFechar,
}: {
  config: ConfigCatalogo
  url: string
  plataforma: boolean
  item: ItemCatalogo | null
  aoFechar: () => void
}) {
  const qc = useQueryClient()
  const { data: ref } = useReferencia()
  const inicial: Record<string, unknown> = { nome: item?.nome ?? '' }
  for (const c of config.campos)
    inicial[c.nome] =
      item?.[c.nome] ??
      c.padrao ??
      (c.tipo === 'booleano'
        ? false
        : c.tipo === 'multipla' || c.tipo === 'numeros' || c.tipo === 'textos'
          ? []
          : '')
  const form = useFormulario(
    plataforma ? esquemaDoCatalogoPlataforma(config.catalogo) : esquemaDoCatalogo(config.catalogo),
    inicial,
  )
  const v = form.valores as Record<string, unknown>
  const somenteLeitura = !!item?.global

  async function salvar() {
    const d = form.validar()
    if (!d) return
    try {
      if (item) await api.put(`${url}/${item.id}`, { ...d, versao: item.versao })
      else await api.post(url, d)
      await qc.invalidateQueries({ queryKey: ['lista', url] })
      await qc.invalidateQueries({ queryKey: ['referencia'] })
      aoFechar()
    } catch (e) {
      form.erroDaApi(e)
    }
  }

  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo={item ? item.nome : 'Novo item'}
      descricao={somenteLeitura ? 'Item do catálogo global, mantido pela plataforma.' : undefined}
      rodape={
        !somenteLeitura && (
          <>
            <Botao variante="secundario" onClick={aoFechar}>
              Cancelar
            </Botao>
            <Botao onClick={() => void salvar()}>Salvar</Botao>
          </>
        )
      }
    >
      <fieldset disabled={somenteLeitura} className="flex flex-col gap-4">
        {form.erroGeral && <Aviso tom="erro">{form.erroGeral}</Aviso>}
        <Campo rotulo="Nome" id="cat-nome" erro={form.erro('nome')} obrigatorio>
          <Entrada
            id="cat-nome"
            autoFocus
            value={String(v.nome ?? '')}
            onChange={(e) => form.definir('nome', e.target.value)}
            onBlur={() => form.tocar('nome')}
          />
        </Campo>
        {config.campos.map((c) => {
          const id = `cat-${c.nome}`
          const valor = v[c.nome]
          if (c.tipo === 'booleano') {
            return (
              <Caixa
                key={c.nome}
                rotulo={c.rotulo}
                checked={!!valor}
                onChange={(e) => form.definir(c.nome, e.target.checked)}
              />
            )
          }
          if (c.tipo === 'selecao') {
            return (
              <Campo
                key={c.nome}
                rotulo={c.rotulo}
                id={id}
                erro={form.erro(c.nome)}
                ajuda={c.ajuda}
              >
                <Selecao
                  id={id}
                  value={String(valor ?? '')}
                  onChange={(e) => form.definir(c.nome, e.target.value)}
                >
                  <option value="">Escolha</option>
                  {c.opcoes?.(ref).map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.nome}
                    </option>
                  ))}
                </Selecao>
              </Campo>
            )
          }
          if (c.tipo === 'multipla') {
            const lista = (valor as string[]) ?? []
            return (
              <fieldset key={c.nome}>
                <legend className="mb-2 text-sm font-medium">{c.rotulo}</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {c.opcoes?.(ref).map((o) => (
                    <Caixa
                      key={o.valor}
                      rotulo={o.nome}
                      checked={lista.includes(o.valor)}
                      onChange={(e) =>
                        form.definir(
                          c.nome,
                          e.target.checked
                            ? [...lista, o.valor]
                            : lista.filter((x) => x !== o.valor),
                        )
                      }
                    />
                  ))}
                </div>
                {form.erro(c.nome) && (
                  <p className="mt-1 text-xs text-destructive">{form.erro(c.nome)}</p>
                )}
              </fieldset>
            )
          }
          if (c.tipo === 'texto') {
            return (
              <Campo
                key={c.nome}
                rotulo={c.rotulo}
                id={id}
                erro={form.erro(c.nome)}
                ajuda={c.ajuda}
              >
                <Entrada
                  id={id}
                  value={String(valor ?? '')}
                  onChange={(e) => form.definir(c.nome, e.target.value)}
                />
              </Campo>
            )
          }
          if (c.tipo === 'numero') {
            return (
              <Campo
                key={c.nome}
                rotulo={c.rotulo}
                id={id}
                erro={form.erro(c.nome)}
                ajuda={c.ajuda}
              >
                <Entrada
                  id={id}
                  type="number"
                  inputMode="numeric"
                  value={String(valor ?? '')}
                  onChange={(e) =>
                    form.definir(c.nome, e.target.value === '' ? undefined : Number(e.target.value))
                  }
                />
              </Campo>
            )
          }
          // Listas de números ou textos, separadas por vírgula.
          const texto = ((valor as unknown[]) ?? []).join(', ')
          return (
            <Campo
              key={c.nome}
              rotulo={c.rotulo}
              id={id}
              erro={form.erro(c.nome)}
              ajuda={c.ajuda ?? 'Separe com vírgulas.'}
            >
              <Entrada
                id={id}
                defaultValue={texto}
                onBlur={(e) => {
                  const partes = e.target.value
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean)
                  form.definir(
                    c.nome,
                    c.tipo === 'numeros'
                      ? partes.map(Number).filter((n) => !Number.isNaN(n))
                      : partes,
                  )
                  form.tocar(c.nome)
                }}
              />
            </Campo>
          )
        })}
      </fieldset>
    </Dialogo>
  )
}

export function Catalogo({
  config,
  plataforma = false,
}: {
  config: ConfigCatalogo
  plataforma?: boolean
}) {
  const { data: s } = useSessao()
  const qc = useQueryClient()
  const [editando, setEditando] = useState<ItemCatalogo | 'novo' | null>(null)
  const [inativar, setInativar] = useState<ItemCatalogo | null>(null)
  const func = plataforma ? 'plataforma.catalogos' : funcionalidadeDoCatalogo(config.catalogo)
  // Na Administração, a lista oficial também se altera.
  const oficial = !plataforma && listaOficial(config.catalogo)
  const url = plataforma
    ? `/api/plataforma/catalogos/${config.catalogo}`
    : `/api/catalogos/${config.catalogo}`
  const recarregar = () => void qc.invalidateQueries({ queryKey: ['lista', url] })

  return (
    <div className="flex flex-col gap-3">
      {config.descricao && <p className="text-sm text-muted-foreground">{config.descricao}</p>}
      {oficial && (
        <Aviso tom="info">Lista oficial, mantida pela plataforma conforme as normas.</Aviso>
      )}
      {plataforma && (
        <Aviso tom="info">
          Itens globais: valem para todas as empresas. Os itens próprios de cada empresa não
          aparecem aqui.
        </Aviso>
      )}
      <TabelaDados
        key={config.catalogo}
        tabela={`${plataforma ? 'plataforma.' : ''}catalogo.${config.catalogo}`}
        url={url}
        ordemPadrao={{ campo: 'nome', direcao: 'asc' }}
        filtrosIniciais={
          plataforma ? { situacao: 'ativos' } : { situacao: 'ativos', origem: 'todos' }
        }
        podeExportar={pode(s, func, 'exportar')}
        aoClicar={(i) => setEditando(i)}
        acoes={
          !oficial &&
          pode(s, func, 'criar') && (
            <Botao onClick={() => setEditando('novo')}>
              <Plus /> Novo
            </Botao>
          )
        }
        filtros={(f, definir) => (
          <>
            {config.filtrosExtras?.(f, definir)}
            {!plataforma && (
              <Selecao
                aria-label="Origem"
                className="w-36"
                value={f.origem ?? 'todos'}
                onChange={(e) => definir('origem', e.target.value)}
              >
                <option value="todos">Globais e próprios</option>
                <option value="globais">Só globais</option>
                <option value="proprios">Só próprios</option>
              </Selecao>
            )}
            <Selecao
              aria-label="Situação"
              className="w-32"
              value={f.situacao ?? 'ativos'}
              onChange={(e) => definir('situacao', e.target.value)}
            >
              <option value="ativos">Ativos</option>
              <option value="inativos">Inativos</option>
              <option value="todos">Todos</option>
            </Selecao>
          </>
        )}
        colunas={[
          {
            id: 'nome',
            titulo: 'Nome',
            ordenavel: true,
            celula: (i) => i.nome,
            exportar: (i) => i.nome,
          },
          ...(config.colunas ?? []),
          // A variedade já mostra o código oficial, que é o código dela.
          ...(plataforma && config.catalogo === 'variedade'
            ? []
            : plataforma
              ? [
                  {
                    id: 'codigo',
                    titulo: 'Código',
                    celula: (i: ItemCatalogo) => (
                      <span className="font-mono text-xs">{String(i.codigo ?? '')}</span>
                    ),
                    exportar: (i: ItemCatalogo) => i.codigo as string,
                  },
                ]
              : [
                  {
                    id: 'origem',
                    titulo: 'Origem',
                    celula: (i: ItemCatalogo) =>
                      i.global ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Lock className="size-3.5" /> Global
                        </span>
                      ) : (
                        <Etiqueta tom="primario">Próprio</Etiqueta>
                      ),
                    exportar: (i: ItemCatalogo) => (i.global ? 'Global' : 'Próprio'),
                  },
                ]),
          {
            id: 'situacao',
            titulo: 'Situação',
            celula: (i) => (
              <Etiqueta tom={i.ativo ? 'sucesso' : 'neutro'}>
                {i.ativo ? 'Ativo' : 'Inativo'}
              </Etiqueta>
            ),
            exportar: (i) => (i.ativo ? 'Ativo' : 'Inativo'),
          },
          colunaAcoes<ItemCatalogo>((i) => {
            const proprio = !i.global
            const podeInativar = proprio && pode(s, func, 'inativar')
            return (
              <AcoesLinha
                ativo={i.ativo}
                aoEditar={proprio && pode(s, func, 'editar') ? () => setEditando(i) : undefined}
                aoInativar={podeInativar ? () => setInativar(i) : undefined}
                aoReativar={
                  podeInativar
                    ? async () => {
                        await api.post(`${url}/${i.id}/reativar`)
                        recarregar()
                      }
                    : undefined
                }
              >
                {config.acoesLinha?.(i, recarregar)}
              </AcoesLinha>
            )
          }),
        ]}
      />
      {editando && (
        <Formulario
          config={config}
          url={url}
          plataforma={plataforma}
          item={editando === 'novo' ? null : editando}
          aoFechar={() => setEditando(null)}
        />
      )}
      <PedirMotivo
        aberto={!!inativar}
        aoMudar={(x) => !x && setInativar(null)}
        titulo={`Inativar ${inativar?.nome ?? ''}`}
        descricao={`O item deixa de ser oferecido em registros novos${plataforma ? ' em todas as empresas' : ''}; os registros antigos continuam com ele (P26).`}
        rotuloBotao="Inativar"
        aoConfirmar={async (motivo) => {
          await api.post(`${url}/${inativar!.id}/inativar`, { motivo })
          recarregar()
        }}
      />
    </div>
  )
}
