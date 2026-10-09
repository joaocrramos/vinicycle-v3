// EnoTrace › Marcas e Produtos (cantina.md; 03-modelo-de-dados.md, 2.5).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { dadosMarca, dadosProduto, dadosRotulo, formatarDecimal } from '@vinicycle/shared'
import { Plus, Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AcoesLinha, colunaAcoes } from '@/componentes/AcoesLinha'
import { Anexos } from '@/componentes/Anexos'
import { CampoNumero } from '@/componentes/campos-especiais'
import { Historico } from '@/componentes/Historico'
import { PedirMotivo } from '@/componentes/PedirMotivo'
import { TabelaDados } from '@/componentes/TabelaDados'
import { Aba, Abas, ConteudoAba, ListaAbas } from '@/componentes/ui/abas'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao'
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { Dialogo } from '@/componentes/ui/dialogo'
import { Pagina } from '@/layout/Estrutura'
import { api } from '@/lib/api'
import { useFormulario } from '@/lib/formulario'
import { useReferencia } from '@/lib/referencia'
import { fusoAtivo, pode, useSessao } from '@/lib/sessao'
import { formatarData } from '@/lib/utils'

const volume = (ml: number) =>
  ml >= 1000 ? `${formatarDecimal(String(ml / 1000), ml % 1000 ? 1 : 0)} L` : `${ml} mL`

function useClientesVinificacao() {
  return useQuery({
    queryKey: ['pessoas-opcoes', 'cliente_vinificacao'],
    queryFn: () =>
      api.get<Array<{ id: string; nome: string }>>('/api/pessoas/opcoes?papel=cliente_vinificacao'),
  })
}

// Marcas -------------------------------------------------------------------------------------

interface Marca {
  id: string
  nome: string
  donoId: string | null
  dono: string | null
  produtos: number
  ativo: boolean
  versao: number
}

function DialogoMarca({ marca, aoFechar }: { marca: Marca | null; aoFechar: () => void }) {
  const qc = useQueryClient()
  const clientes = useClientesVinificacao()
  const form = useFormulario(dadosMarca, {
    nome: marca?.nome ?? '',
    donoId: marca?.donoId ?? null,
    versao: marca?.versao,
  })
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo={marca ? marca.nome : 'Nova marca'}
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
                if (marca) await api.put(`/api/marcas/${marca.id}`, d)
                else await api.post('/api/marcas', d)
                await qc.invalidateQueries({ queryKey: ['lista', '/api/marcas'] })
                await qc.invalidateQueries({ queryKey: ['marcas-opcoes'] })
                aoFechar()
              } catch (e) {
                form.erroDaApi(e)
              }
            }}
          >
            Salvar
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {form.erroGeral && <Aviso tom="erro">{form.erroGeral}</Aviso>}
        <Campo rotulo="Nome" id="marca-nome" erro={form.erro('nome')} obrigatorio>
          <Entrada
            id="marca-nome"
            autoFocus
            value={form.valores.nome}
            onChange={(e) => form.definir('nome', e.target.value)}
          />
        </Campo>
        <Campo
          rotulo="Dono"
          id="marca-dono"
          ajuda="Na vinificação para terceiros, a marca é do cliente."
        >
          <Selecao
            id="marca-dono"
            value={form.valores.donoId ?? ''}
            onChange={(e) => form.definir('donoId', e.target.value || null)}
          >
            <option value="">A própria empresa</option>
            {clientes.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
      </div>
    </Dialogo>
  )
}

export function PaginaMarcas() {
  const { data: s } = useSessao()
  const qc = useQueryClient()
  const [editando, setEditando] = useState<Marca | 'nova' | null>(null)
  const [inativar, setInativar] = useState<Marca | null>(null)
  const podeInativar = pode(s, 'enotrace.cadastros', 'inativar')
  return (
    <Pagina
      titulo="Marcas"
      trilha={['EnoTrace', 'Cadastros']}
      acoes={
        pode(s, 'enotrace.cadastros', 'criar') && (
          <Botao onClick={() => setEditando('nova')}>
            <Plus /> Nova marca
          </Botao>
        )
      }
    >
      <TabelaDados<Marca>
        tabela="marcas"
        url="/api/marcas"
        ordemPadrao={{ campo: 'nome', direcao: 'asc' }}
        filtrosIniciais={{ situacao: 'ativos' }}
        aoClicar={(m) => setEditando(m)}
        podeExportar={pode(s, 'enotrace.cadastros', 'exportar')}
        colunas={[
          {
            id: 'nome',
            titulo: 'Marca',
            ordenavel: true,
            celula: (m) => m.nome,
            exportar: (m) => m.nome,
          },
          {
            id: 'dono',
            titulo: 'Dono',
            celula: (m) => m.dono ?? 'A própria empresa',
            exportar: (m) => m.dono ?? 'A própria empresa',
          },
          {
            id: 'produtos',
            titulo: 'Produtos',
            className: 'text-right',
            celula: (m) => m.produtos,
            exportar: (m) => m.produtos,
          },
          {
            id: 'situacao',
            titulo: 'Situação',
            celula: (m) => (
              <Etiqueta tom={m.ativo ? 'sucesso' : 'neutro'}>
                {m.ativo ? 'Ativa' : 'Inativa'}
              </Etiqueta>
            ),
          },
          colunaAcoes<Marca>((m) => (
            <AcoesLinha
              ativo={m.ativo}
              aoEditar={pode(s, 'enotrace.cadastros', 'editar') ? () => setEditando(m) : undefined}
              aoInativar={podeInativar ? () => setInativar(m) : undefined}
              aoReativar={
                podeInativar
                  ? async () => {
                      await api.post(`/api/marcas/${m.id}/reativar`)
                      await qc.invalidateQueries({ queryKey: ['lista', '/api/marcas'] })
                    }
                  : undefined
              }
            />
          )),
        ]}
      />
      {editando && (
        <DialogoMarca
          marca={editando === 'nova' ? null : editando}
          aoFechar={() => setEditando(null)}
        />
      )}
      <PedirMotivo
        aberto={!!inativar}
        aoMudar={(x) => !x && setInativar(null)}
        titulo={`Inativar a marca ${inativar?.nome ?? ''}`}
        rotuloBotao="Inativar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/marcas/${inativar!.id}/inativar`, { motivo })
          await qc.invalidateQueries({ queryKey: ['lista', '/api/marcas'] })
        }}
      />
    </Pagina>
  )
}

// Produtos -----------------------------------------------------------------------------------

interface LinhaProduto {
  id: string
  nome: string
  marca: string
  denominacao: string
  registroMapa: string | null
  formatos: number[]
  teorAlcoolico: string | null
  ativo: boolean
}

export function ListaProdutos() {
  const navegar = useNavigate()
  const { data: s } = useSessao()
  const qc = useQueryClient()
  const [inativar, setInativar] = useState<LinhaProduto | null>(null)
  const podeInativar = pode(s, 'enotrace.cadastros', 'inativar')
  return (
    <Pagina
      titulo="Produtos"
      trilha={['EnoTrace', 'Cadastros']}
      acoes={
        pode(s, 'enotrace.cadastros', 'criar') && (
          <Botao onClick={() => navegar('/enotrace/produtos/novo')}>
            <Plus /> Novo produto
          </Botao>
        )
      }
    >
      <p className="text-sm text-muted-foreground">
        Vinhos comerciais: marca, denominação (classe, cor e açúcar), registro no MAPA, rótulos e
        formatos.
      </p>
      <TabelaDados<LinhaProduto>
        tabela="produtos"
        url="/api/produtos"
        ordemPadrao={{ campo: 'nome', direcao: 'asc' }}
        filtrosIniciais={{ situacao: 'ativos' }}
        aoClicar={(p) => navegar(`/enotrace/produtos/${p.id}`)}
        podeExportar={pode(s, 'enotrace.cadastros', 'exportar')}
        colunas={[
          {
            id: 'nome',
            titulo: 'Produto',
            ordenavel: true,
            celula: (p) => (
              <span>
                {p.nome}
                <span className="block text-xs text-muted-foreground">{p.denominacao}</span>
              </span>
            ),
            exportar: (p) => p.nome,
          },
          {
            id: 'marca',
            titulo: 'Marca',
            ordenavel: true,
            celula: (p) => p.marca,
            exportar: (p) => p.marca,
          },
          {
            id: 'teor',
            titulo: 'Teor no rótulo',
            celula: (p) => (p.teorAlcoolico ? `${formatarDecimal(p.teorAlcoolico, 1)}% vol` : '—'),
            exportar: (p) => p.teorAlcoolico,
          },
          {
            id: 'formatos',
            titulo: 'Formatos',
            celula: (p) => p.formatos.map(volume).join(', ') || '—',
            exportar: (p) => p.formatos.join(' '),
          },
          {
            id: 'registroMapa',
            titulo: 'Registro MAPA',
            celula: (p) => p.registroMapa ?? '—',
            exportar: (p) => p.registroMapa,
          },
          {
            id: 'ativo',
            titulo: 'Situação',
            celula: (p) => (
              <Etiqueta tom={p.ativo ? 'sucesso' : 'neutro'}>
                {p.ativo ? 'Ativo' : 'Inativo'}
              </Etiqueta>
            ),
          },
          colunaAcoes<LinhaProduto>((p) => (
            <AcoesLinha
              ativo={p.ativo}
              aoEditar={
                pode(s, 'enotrace.cadastros', 'editar')
                  ? () => navegar(`/enotrace/produtos/${p.id}`)
                  : undefined
              }
              aoInativar={podeInativar ? () => setInativar(p) : undefined}
              aoReativar={
                podeInativar
                  ? async () => {
                      await api.post(`/api/produtos/${p.id}/reativar`)
                      await qc.invalidateQueries({ queryKey: ['lista', '/api/produtos'] })
                    }
                  : undefined
              }
            />
          )),
        ]}
      />
      <PedirMotivo
        aberto={!!inativar}
        aoMudar={(x) => !x && setInativar(null)}
        titulo={`Inativar ${inativar?.nome ?? ''}`}
        rotuloBotao="Inativar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/produtos/${inativar!.id}/inativar`, { motivo })
          await qc.invalidateQueries({ queryKey: ['lista', '/api/produtos'] })
        }}
      />
    </Pagina>
  )
}

const VAZIO = {
  nome: '',
  marcaId: '',
  classeProdutoId: '',
  cor: null as string | null,
  teorAcucar: null as string | null,
  metodoEspumante: null as string | null,
  registroMapa: '',
  titularId: null as string | null,
  observacoes: '',
  versao: undefined as number | undefined,
}

function FormularioProduto({
  inicial,
  aoSalvar,
  somenteLeitura,
}: {
  inicial: typeof VAZIO
  aoSalvar: (d: unknown) => Promise<void>
  somenteLeitura?: boolean
}) {
  const form = useFormulario(dadosProduto, inicial)
  const { data: ref } = useReferencia()
  const clientes = useClientesVinificacao()
  const marcas = useQuery({
    queryKey: ['marcas-opcoes'],
    queryFn: async () => (await api.get<{ itens: Marca[] }>('/api/marcas?tamanho=0')).itens,
  })
  const [salvo, setSalvo] = useState(false)
  const v = form.valores as typeof VAZIO
  const classe = ref?.classesProduto.find((c) => c.id === v.classeProdutoId)
  const lista = (nome: string) =>
    (ref?.listas[nome] ?? []).map((o) => (
      <option key={o.codigo} value={o.codigo}>
        {o.nome}
      </option>
    ))
  const nomeDe = (l: string, c: string | null) => ref?.listas[l]?.find((o) => o.codigo === c)?.nome
  const denominacao = [
    classe?.nome,
    nomeDe('cor_vinho', v.cor),
    nomeDe('teor_acucar', v.teorAcucar),
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={async (ev: FormEvent) => {
        ev.preventDefault()
        setSalvo(false)
        const d = form.validar()
        if (!d) return
        try {
          await aoSalvar(d)
          setSalvo(true)
        } catch (e) {
          form.erroDaApi(e)
        }
      }}
    >
      {form.erroGeral && <Aviso tom="erro">{form.erroGeral}</Aviso>}
      {salvo && <Aviso tom="sucesso">Dados salvos.</Aviso>}
      <fieldset disabled={somenteLeitura} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Nome do produto" id="nome" erro={form.erro('nome')} obrigatorio>
            <Entrada
              id="nome"
              value={v.nome}
              onChange={(e) => form.definir('nome', e.target.value)}
              onBlur={() => form.tocar('nome')}
            />
          </Campo>
          <Campo
            rotulo="Marca"
            id="marcaId"
            erro={form.erro('marcaId')}
            obrigatorio
            ajuda={marcas.data && !marcas.data.length ? 'Cadastre a marca primeiro.' : undefined}
          >
            <Selecao
              id="marcaId"
              value={v.marcaId}
              onChange={(e) => form.definir('marcaId', e.target.value)}
            >
              <option value="">Escolha</option>
              {marcas.data
                ?.filter((m) => m.ativo || m.id === v.marcaId)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                    {m.dono ? ` (${m.dono})` : ''}
                  </option>
                ))}
            </Selecao>
          </Campo>
          <Campo
            rotulo="Classe"
            id="classeProdutoId"
            erro={form.erro('classeProdutoId')}
            obrigatorio
            ajuda={classe?.fonte}
          >
            <Selecao
              id="classeProdutoId"
              value={v.classeProdutoId}
              onChange={(e) => form.definir('classeProdutoId', e.target.value)}
            >
              <option value="">Escolha</option>
              {ref?.classesProduto.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Cor" id="cor">
            <Selecao
              id="cor"
              value={v.cor ?? ''}
              onChange={(e) => form.definir('cor', e.target.value || null)}
            >
              <option value="">Não se aplica</option>
              {lista('cor_vinho')}
            </Selecao>
          </Campo>
          <Campo rotulo="Classificação quanto ao açúcar" id="teorAcucar">
            <Selecao
              id="teorAcucar"
              value={v.teorAcucar ?? ''}
              onChange={(e) => form.definir('teorAcucar', e.target.value || null)}
            >
              <option value="">Não se aplica</option>
              {lista('teor_acucar')}
            </Selecao>
          </Campo>
          {classe?.exigeMetodoEspumante && (
            <Campo
              rotulo="Método do espumante"
              id="metodoEspumante"
              erro={form.erro('metodoEspumante')}
              obrigatorio
            >
              <Selecao
                id="metodoEspumante"
                value={v.metodoEspumante ?? ''}
                onChange={(e) => form.definir('metodoEspumante', e.target.value || null)}
              >
                <option value="">Escolha</option>
                {lista('metodo_espumante')}
              </Selecao>
            </Campo>
          )}
          <Campo rotulo="Registro no MAPA" id="registroMapa">
            <Entrada
              id="registroMapa"
              placeholder="UF 000000-0.000000"
              value={v.registroMapa ?? ''}
              onChange={(e) => form.definir('registroMapa', e.target.value)}
            />
          </Campo>
          <Campo
            rotulo="Titular (vinho de terceiro)"
            id="titularId"
            ajuda="Vazio = vinho da própria empresa."
          >
            <Selecao
              id="titularId"
              value={v.titularId ?? ''}
              onChange={(e) => form.definir('titularId', e.target.value || null)}
            >
              <option value="">A própria empresa</option>
              {clientes.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
        </div>
        {denominacao && (
          <p className="text-sm">
            Denominação: <strong>{denominacao}</strong>{' '}
            <span className="text-muted-foreground">
              (classe, cor e açúcar; Lei 7.678/1988, art. 8º, III; IN MAPA 14/2018, art. 26)
            </span>
          </p>
        )}
        <Campo rotulo="Observações" id="observacoes">
          <AreaTexto
            id="observacoes"
            value={v.observacoes ?? ''}
            onChange={(e) => form.definir('observacoes', e.target.value)}
          />
        </Campo>
      </fieldset>
      {!somenteLeitura && (
        <div>
          <Botao type="submit">Salvar</Botao>
        </div>
      )}
    </form>
  )
}

export function NovoProduto() {
  const navegar = useNavigate()
  return (
    <Pagina titulo="Novo produto" trilha={['EnoTrace', 'Cadastros', 'Produtos']}>
      <Cartao>
        <CorpoCartao>
          <FormularioProduto
            inicial={VAZIO}
            aoSalvar={async (d) => {
              const r = await api.post<{ id: string }>('/api/produtos', d)
              navegar(`/enotrace/produtos/${r.id}`, { replace: true })
            }}
          />
        </CorpoCartao>
      </Cartao>
    </Pagina>
  )
}

interface Rotulo {
  id: string
  versao: string
  teorAlcoolico: string
  urlPagina: string | null
  vigenteDesde: string
  vigenteAte: string | null
  observacoes: string | null
}
interface Formato {
  id: string
  volumeMl: number
  ativo: boolean
  ficha: Array<{ itemEstoqueId: string; item: string; unidade: string; quantidade: string }>
}
type ProdutoCompleto = typeof VAZIO & {
  id: string
  terceirizacao: null | {
    contratoId: string
    sentido: 'prestamos' | 'contratamos'
    registroProduto: 'contratante' | 'cantina'
    texto: string
  }
  ativo: boolean
  versao: number
  denominacao: string
  rotulos: Rotulo[]
  formatos: Formato[]
}

function DialogoRotulo({
  produtoId,
  rotulo,
  aoFechar,
}: {
  produtoId: string
  rotulo: Rotulo | null
  aoFechar: () => void
}) {
  const qc = useQueryClient()
  const form = useFormulario(dadosRotulo, {
    versao: rotulo?.versao ?? '',
    teorAlcoolico: rotulo?.teorAlcoolico ?? '',
    urlPagina: rotulo?.urlPagina ?? '',
    vigenteDesde: rotulo?.vigenteDesde ?? new Date().toISOString().slice(0, 10),
    vigenteAte: rotulo?.vigenteAte ?? '',
    observacoes: rotulo?.observacoes ?? '',
  })
  const v = form.valores
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo={rotulo ? `Rótulo ${rotulo.versao}` : 'Novo rótulo'}
      descricao="Laudo fora de ±0,5% vol do teor declarado alerta no envase (IN MAPA 14/2018, art. 11, §4º). A arte do rótulo vai nos anexos do produto."
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
                if (rotulo) await api.put(`/api/produtos/${produtoId}/rotulos/${rotulo.id}`, d)
                else await api.post(`/api/produtos/${produtoId}/rotulos`, d)
                await qc.invalidateQueries({ queryKey: ['produto', produtoId] })
                aoFechar()
              } catch (e) {
                form.erroDaApi(e)
              }
            }}
          >
            Salvar
          </Botao>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {form.erroGeral && (
          <Aviso tom="erro" className="sm:col-span-2">
            {form.erroGeral}
          </Aviso>
        )}
        <Campo rotulo="Versão" id="rot-versao" erro={form.erro('versao')} obrigatorio>
          <Entrada
            id="rot-versao"
            placeholder="2026, v2…"
            value={v.versao}
            onChange={(e) => form.definir('versao', e.target.value)}
          />
        </Campo>
        <Campo
          rotulo="Teor alcoólico declarado"
          id="rot-teor"
          erro={form.erro('teorAlcoolico')}
          obrigatorio
        >
          <CampoNumero
            id="rot-teor"
            casas={1}
            unidade="% vol"
            valor={v.teorAlcoolico}
            aoMudar={(x) => form.definir('teorAlcoolico', x ?? '')}
          />
        </Campo>
        <Campo rotulo="Vigente desde" id="rot-desde" erro={form.erro('vigenteDesde')} obrigatorio>
          <Entrada
            id="rot-desde"
            type="date"
            value={v.vigenteDesde}
            onChange={(e) => form.definir('vigenteDesde', e.target.value)}
          />
        </Campo>
        <Campo rotulo="Vigente até" id="rot-ate">
          <Entrada
            id="rot-ate"
            type="date"
            value={v.vigenteAte ?? ''}
            onChange={(e) => form.definir('vigenteAte', e.target.value)}
          />
        </Campo>
        <Campo
          rotulo="Página comercial (QR do rótulo)"
          id="rot-url"
          erro={form.erro('urlPagina')}
          className="sm:col-span-2"
        >
          <Entrada
            id="rot-url"
            type="url"
            placeholder="https://"
            value={v.urlPagina ?? ''}
            onChange={(e) => form.definir('urlPagina', e.target.value)}
          />
        </Campo>
      </div>
    </Dialogo>
  )
}

function FichaEmbalagem({
  produtoId,
  formato,
  podeEditar,
}: {
  produtoId: string
  formato: Formato
  podeEditar: boolean
}) {
  const qc = useQueryClient()
  const materiais = useQuery({
    queryKey: ['materiais-embalagem'],
    queryFn: async () =>
      (
        await api.get<{
          itens: Array<{ id: string; nome: string; unidadeBase: string; tipo: string }>
        }>('/api/itens-estoque?tamanho=0')
      ).itens.filter((i) => i.tipo === 'embalagem' || i.tipo === 'outro'),
  })
  const [itens, setItens] = useState(
    formato.ficha.map((f) => ({
      itemEstoqueId: f.itemEstoqueId,
      quantidade: f.quantidade as string | null,
    })),
  )
  const [msg, setMsg] = useState<{ tom: 'sucesso' | 'erro'; texto: string } | null>(null)
  const alterado =
    JSON.stringify(itens) !==
    JSON.stringify(
      formato.ficha.map((f) => ({ itemEstoqueId: f.itemEstoqueId, quantidade: f.quantidade })),
    )
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Materiais por garrafa: base do cálculo de materiais no engarrafamento (ex.: 1 garrafa, 1
        rolha, 0,1667 de caixa com 6).
      </p>
      {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
      {itens.map((it, i) => (
        <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_12rem_auto]">
          <Campo rotulo="Material" id={`mat-${formato.id}-${i}`}>
            <Selecao
              id={`mat-${formato.id}-${i}`}
              disabled={!podeEditar}
              value={it.itemEstoqueId}
              onChange={(e) =>
                setItens(
                  itens.map((x, j) => (j === i ? { ...x, itemEstoqueId: e.target.value } : x)),
                )
              }
            >
              <option value="">Escolha</option>
              {materiais.data?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome} ({m.unidadeBase})
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Por garrafa" id={`qtd-${formato.id}-${i}`}>
            <CampoNumero
              id={`qtd-${formato.id}-${i}`}
              casas={4}
              disabled={!podeEditar}
              valor={it.quantidade}
              aoMudar={(x) =>
                setItens(itens.map((y, j) => (j === i ? { ...y, quantidade: x } : y)))
              }
            />
          </Campo>
          {podeEditar && (
            <Botao
              variante="fantasma"
              tamanho="icone"
              aria-label="Remover material"
              onClick={() => setItens(itens.filter((_, j) => j !== i))}
            >
              <Trash2 />
            </Botao>
          )}
        </div>
      ))}
      {podeEditar && (
        <div className="flex gap-2">
          <Botao
            variante="secundario"
            tamanho="pequeno"
            onClick={() => setItens([...itens, { itemEstoqueId: '', quantidade: null }])}
          >
            <Plus /> Material
          </Botao>
          <Botao
            tamanho="pequeno"
            disabled={!alterado}
            onClick={async () => {
              try {
                await api.put(`/api/produtos/${produtoId}/formatos/${formato.id}/ficha`, {
                  itens: itens.filter((x) => x.itemEstoqueId),
                })
                setMsg({ tom: 'sucesso', texto: 'Ficha de embalagem salva.' })
                await qc.invalidateQueries({ queryKey: ['produto', produtoId] })
              } catch (e) {
                setMsg({ tom: 'erro', texto: (e as Error).message })
              }
            }}
          >
            Salvar ficha
          </Botao>
        </div>
      )}
    </div>
  )
}

export function FichaProduto() {
  const { id = '' } = useParams()
  const { data: s } = useSessao()
  const qc = useQueryClient()
  const [rotulo, setRotulo] = useState<Rotulo | 'novo' | null>(null)
  const [novoFormato, setNovoFormato] = useState<string | null>(null)
  const [erroFormato, setErroFormato] = useState<string | null>(null)
  const [inativar, setInativar] = useState(false)
  const q = useQuery({
    queryKey: ['produto', id],
    queryFn: () => api.get<ProdutoCompleto>(`/api/produtos/${id}`),
  })
  const podeEditar = pode(s, 'enotrace.cadastros', 'editar')
  if (!q.data)
    return (
      <p className="text-sm text-muted-foreground">
        {q.isError ? (q.error as Error).message : 'Carregando…'}
      </p>
    )
  const p = q.data
  const recarregar = () => qc.invalidateQueries({ queryKey: ['produto', id] })
  return (
    <Pagina
      titulo={p.nome}
      trilha={['EnoTrace', 'Cadastros', 'Produtos']}
      acoes={
        pode(s, 'enotrace.cadastros', 'inativar') && (
          <AcoesLinha
            contorno
            ativo={p.ativo}
            aoInativar={() => setInativar(true)}
            aoReativar={async () => {
              await api.post(`/api/produtos/${id}/reativar`)
              await recarregar()
            }}
          />
        )
      }
    >
      <p className="text-sm text-muted-foreground">{p.denominacao}</p>
      {p.terceirizacao && (
        <Aviso tom="info">
          Elaboração por terceiro. Texto do rótulo: <strong>{p.terceirizacao.texto}</strong>.{' '}
          {p.terceirizacao.registroProduto === 'contratante'
            ? 'O registro MAPA do produto é o do contratante (unidade central; IN MAPA 72/2018, art. 30).'
            : 'O registro MAPA do produto é o da cantina que produz.'}{' '}
          <Link className="underline" to={`/enotrace/contratos/${p.terceirizacao.contratoId}`}>
            Ver o contrato
          </Link>
        </Aviso>
      )}
      <Abas defaultValue="dados">
        <ListaAbas>
          <Aba value="dados">Dados</Aba>
          <Aba value="rotulos">Rótulos</Aba>
          <Aba value="formatos">Formatos e embalagem</Aba>
          <Aba value="anexos">Anexos</Aba>
          <Aba value="historico">Histórico</Aba>
        </ListaAbas>
        <ConteudoAba value="dados">
          <Cartao>
            <CorpoCartao>
              <FormularioProduto
                key={p.versao}
                inicial={{ ...VAZIO, ...p }}
                somenteLeitura={!podeEditar}
                aoSalvar={async (d) => {
                  await api.put(`/api/produtos/${id}`, d)
                  await recarregar()
                }}
              />
            </CorpoCartao>
          </Cartao>
        </ConteudoAba>
        <ConteudoAba value="rotulos" className="flex flex-col gap-3">
          {podeEditar && (
            <div>
              <Botao onClick={() => setRotulo('novo')}>
                <Plus /> Novo rótulo
              </Botao>
            </div>
          )}
          <Cartao>
            <ul className="divide-y">
              {p.rotulos.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="flex w-full cursor-pointer flex-wrap justify-between gap-2 px-5 py-3 text-left text-sm hover:bg-muted/50"
                    onClick={() => podeEditar && setRotulo(r)}
                  >
                    <span>
                      <strong>{r.versao}</strong> · {formatarDecimal(r.teorAlcoolico, 1)}% vol
                    </span>
                    <span className="text-muted-foreground">
                      desde {formatarData(r.vigenteDesde)}
                      {r.vigenteAte && ` até ${formatarData(r.vigenteAte)}`}
                    </span>
                  </button>
                </li>
              ))}
              {!p.rotulos.length && (
                <li className="px-5 py-6 text-sm text-muted-foreground">Nenhum rótulo.</li>
              )}
            </ul>
          </Cartao>
        </ConteudoAba>
        <ConteudoAba value="formatos" className="flex flex-col gap-4">
          {podeEditar && (
            <div className="flex flex-wrap items-end gap-2">
              <Campo rotulo="Novo formato (mL)" id="novo-formato" erro={erroFormato ?? undefined}>
                <Selecao
                  id="novo-formato"
                  className="w-48"
                  value={novoFormato ?? ''}
                  onChange={(e) => setNovoFormato(e.target.value)}
                >
                  <option value="">Escolha</option>
                  {[187, 375, 500, 750, 1000, 1500, 3000, 5000]
                    .filter((ml) => !p.formatos.some((f) => f.volumeMl === ml))
                    .map((ml) => (
                      <option key={ml} value={ml}>
                        {volume(ml)}
                      </option>
                    ))}
                </Selecao>
              </Campo>
              <Botao
                disabled={!novoFormato}
                onClick={async () => {
                  setErroFormato(null)
                  try {
                    await api.post(`/api/produtos/${id}/formatos`, {
                      volumeMl: Number(novoFormato),
                    })
                    setNovoFormato(null)
                    await recarregar()
                  } catch (e) {
                    setErroFormato((e as Error).message)
                  }
                }}
              >
                <Plus /> Incluir formato
              </Botao>
            </div>
          )}
          {p.formatos.map((f) => (
            <Cartao key={f.id}>
              <CabecalhoCartao
                titulo={
                  <span className="flex items-center gap-2">
                    {volume(f.volumeMl)} {!f.ativo && <Etiqueta>Inativo</Etiqueta>}
                  </span>
                }
                descricao="Cada formato é um item de estoque de produto acabado."
                acoes={
                  podeEditar && (
                    <AcoesLinha
                      ativo={f.ativo}
                      aoInativar={async () => {
                        await api.post(`/api/produtos/${id}/formatos/${f.id}/inativar`)
                        await recarregar()
                      }}
                      aoReativar={async () => {
                        await api.post(`/api/produtos/${id}/formatos/${f.id}/reativar`)
                        await recarregar()
                      }}
                    />
                  )
                }
              />
              <CorpoCartao>
                <FichaEmbalagem
                  key={f.id}
                  produtoId={id}
                  formato={f}
                  podeEditar={podeEditar && f.ativo}
                />
              </CorpoCartao>
            </Cartao>
          ))}
          {!p.formatos.length && (
            <p className="text-sm text-muted-foreground">
              Nenhum formato. Inclua o volume da garrafa (ex.: 750 mL).
            </p>
          )}
        </ConteudoAba>
        <ConteudoAba value="anexos">
          <Anexos entidade="produto" registroId={id} podeAlterar={podeEditar} fuso={fusoAtivo(s)} />
        </ConteudoAba>
        <ConteudoAba value="historico">
          <Historico entidade="produto" registroId={id} fuso={fusoAtivo(s)} />
        </ConteudoAba>
      </Abas>
      {rotulo && (
        <DialogoRotulo
          produtoId={id}
          rotulo={rotulo === 'novo' ? null : rotulo}
          aoFechar={() => setRotulo(null)}
        />
      )}
      <PedirMotivo
        aberto={inativar}
        aoMudar={setInativar}
        titulo={`Inativar ${p.nome}`}
        rotuloBotao="Inativar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/produtos/${id}/inativar`, { motivo })
          await recarregar()
        }}
      />
    </Pagina>
  )
}
