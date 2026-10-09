// Gestão › Documentos (gestao.md, Documentos).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  dadosDocumento,
  dadosEtiqueta,
  NOMES_SITUACAO_VENCIMENTO,
  novoDocumento,
  SITUACOES_VENCIMENTO,
  versaoDocumento,
} from '@vinicycle/shared'
import { Plus, Tag, Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AcoesLinha, colunaAcoes } from '@/componentes/AcoesLinha'
import { Anexos } from '@/componentes/Anexos'
import { Catalogo, type ConfigCatalogo } from '@/componentes/Catalogo'
import { Historico } from '@/componentes/Historico'
import { PedirMotivo } from '@/componentes/PedirMotivo'
import { TabelaDados } from '@/componentes/TabelaDados'
import { Aba, Abas, ConteudoAba, ListaAbas } from '@/componentes/ui/abas'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao'
import { AreaTexto, Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { Dialogo } from '@/componentes/ui/dialogo'
import { Pagina } from '@/layout/Estrutura'
import { api } from '@/lib/api'
import { type Formulario, useFormulario } from '@/lib/formulario'
import { fusoAtivo, pode, useSessao } from '@/lib/sessao'
import { formatarData } from '@/lib/utils'

type SituacaoVenc = (typeof SITUACOES_VENCIMENTO)[number]
const TOM: Record<SituacaoVenc, 'sucesso' | 'alerta' | 'erro' | 'neutro'> = {
  em_dia: 'sucesso',
  vencendo: 'alerta',
  vencido: 'erro',
  sem_vencimento: 'neutro',
}

interface Linha {
  id: string
  titulo: string
  tipo: string
  orgaoEmissor: string | null
  estabelecimento: string | null
  numero: string | null
  vencimento: string | null
  situacaoVencimento: SituacaoVenc
  responsavel: string | null
  etiquetas: Array<{ id: string; nome: string; cor: string | null }>
  ativo: boolean
}

interface Opcao {
  id: string
  nome: string
}

function useTipos() {
  return useQuery({
    queryKey: ['tipos-documento'],
    queryFn: async () =>
      (
        await api.get<{ itens: Array<Opcao & { temVencimento: boolean }> }>(
          '/api/catalogos/tipo_documento?tamanho=0',
        )
      ).itens,
  })
}
function useEtiquetas() {
  return useQuery({
    queryKey: ['etiquetas'],
    queryFn: () =>
      api.get<Array<Opcao & { cor: string | null; documentos: number }>>('/api/etiquetas'),
  })
}

function MarcaEtiqueta({ nome, cor }: { nome: string; cor: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
      <span className="size-2 rounded-full" style={{ background: cor ?? 'var(--texto-suave)' }} />
      {nome}
    </span>
  )
}

export function ListaDocumentos() {
  const navegar = useNavigate()
  const { data: s } = useSessao()
  const qc = useQueryClient()
  const [inativar, setInativar] = useState<Linha | null>(null)
  const podeInativar = pode(s, 'gestao.documentos', 'inativar')
  const tipos = useTipos()
  const etiquetas = useEtiquetas()
  return (
    <Pagina
      titulo="Documentos"
      trilha={['Gestão']}
      acoes={
        <>
          <Botao comoFilho variante="secundario">
            <Link to="/gestao/documentos/etiquetas">
              <Tag /> Etiquetas
            </Link>
          </Botao>
          <Botao comoFilho variante="secundario">
            <Link to="/gestao/documentos/tipos">Tipos</Link>
          </Botao>
          {pode(s, 'gestao.autocontrole', 'visualizar') && (
            <Botao comoFilho variante="secundario">
              <Link to="/gestao/autocontrole">Autocontrole</Link>
            </Botao>
          )}
          {pode(s, 'gestao.documentos', 'criar') && (
            <Botao onClick={() => navegar('/gestao/documentos/novo')}>
              <Plus /> Novo documento
            </Botao>
          )}
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        Registros MAPA, licenças, alvarás, laudos, certificados e contratos, com vencimento. Os
        avisos por e-mail antes do vencimento chegam com a central de alertas.
      </p>
      <TabelaDados
        tabela="documentos"
        url="/api/documentos"
        ordemPadrao={{ campo: 'vencimento', direcao: 'asc' }}
        filtrosIniciais={{ situacao: 'ativos' }}
        podeExportar={pode(s, 'gestao.documentos', 'exportar')}
        aoClicar={(d) => navegar(`/gestao/documentos/${d.id}`)}
        filtros={(f, definir) => (
          <>
            <Selecao
              aria-label="Vencimento"
              className="w-40"
              value={f.vencimento ?? ''}
              onChange={(e) => definir('vencimento', e.target.value)}
            >
              <option value="">Qualquer vencimento</option>
              {SITUACOES_VENCIMENTO.map((x) => (
                <option key={x} value={x}>
                  {NOMES_SITUACAO_VENCIMENTO[x]}
                </option>
              ))}
            </Selecao>
            <Selecao
              aria-label="Tipo"
              className="w-52"
              value={f.tipo ?? ''}
              onChange={(e) => definir('tipo', e.target.value)}
            >
              <option value="">Todos os tipos</option>
              {tipos.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </Selecao>
            {!!etiquetas.data?.length && (
              <Selecao
                aria-label="Etiqueta"
                className="w-40"
                value={f.etiqueta ?? ''}
                onChange={(e) => definir('etiqueta', e.target.value)}
              >
                <option value="">Todas as etiquetas</option>
                {etiquetas.data.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </Selecao>
            )}
          </>
        )}
        colunas={[
          {
            id: 'vencimento',
            titulo: 'Vencimento',
            ordenavel: true,
            celula: (d) => (
              <span className="flex flex-col gap-1">
                {formatarData(d.vencimento) || '—'}
                <Etiqueta tom={TOM[d.situacaoVencimento]}>
                  {NOMES_SITUACAO_VENCIMENTO[d.situacaoVencimento]}
                </Etiqueta>
              </span>
            ),
            exportar: (d) => d.vencimento,
          },
          {
            id: 'titulo',
            titulo: 'Documento',
            ordenavel: true,
            celula: (d) => (
              <span>
                {d.titulo}
                <span className="block text-xs text-muted-foreground">
                  {[d.numero, d.orgaoEmissor].filter(Boolean).join(' · ')}
                </span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {d.etiquetas.map((e) => (
                    <MarcaEtiqueta key={e.id} nome={e.nome} cor={e.cor} />
                  ))}
                </span>
              </span>
            ),
            exportar: (d) => d.titulo,
          },
          {
            id: 'tipo',
            titulo: 'Tipo',
            ordenavel: true,
            celula: (d) => d.tipo,
            exportar: (d) => d.tipo,
          },
          {
            id: 'estabelecimento',
            titulo: 'Onde',
            celula: (d) => d.estabelecimento ?? 'Empresa toda',
            exportar: (d) => d.estabelecimento ?? 'Empresa toda',
          },
          {
            id: 'responsavel',
            titulo: 'Responsável',
            celula: (d) => d.responsavel ?? '—',
            exportar: (d) => d.responsavel,
          },
          colunaAcoes<Linha>((d) => (
            <AcoesLinha
              ativo={d.ativo}
              aoEditar={
                pode(s, 'gestao.documentos', 'editar')
                  ? () => navegar(`/gestao/documentos/${d.id}`)
                  : undefined
              }
              aoInativar={podeInativar ? () => setInativar(d) : undefined}
              aoReativar={
                podeInativar
                  ? async () => {
                      await api.post(`/api/documentos/${d.id}/reativar`)
                      await qc.invalidateQueries({ queryKey: ['lista', '/api/documentos'] })
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
        titulo={`Inativar ${inativar?.titulo ?? ''}`}
        rotuloBotao="Inativar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/documentos/${inativar!.id}/inativar`, { motivo })
          await qc.invalidateQueries({ queryKey: ['lista', '/api/documentos'] })
        }}
      />
    </Pagina>
  )
}

function CamposVersao({ form, prefixo }: { form: Formulario; prefixo: string }) {
  const c = (x: string) => (prefixo ? `${prefixo}.${x}` : x)
  const v = (x: string) => (form.valor(c(x)) as string | null) ?? ''
  const campo = (x: string, rotulo: string, tipo = 'text') => (
    <Campo rotulo={rotulo} id={c(x)} erro={form.erro(c(x))}>
      <Entrada
        id={c(x)}
        type={tipo}
        value={v(x)}
        onChange={(e) => form.definir(c(x), e.target.value || null)}
        onBlur={() => form.tocar(c(x))}
      />
    </Campo>
  )
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {campo('numero', 'Número')}
      {campo('emissao', 'Emissão', 'date')}
      {campo('vencimento', 'Vencimento', 'date')}
      {campo('assinadoPor', 'Assinado por')}
      {campo('assinadoEm', 'Assinado em', 'date')}
      <Campo rotulo="Observações da versão" id={c('observacoes')} className="sm:col-span-3">
        <AreaTexto
          id={c('observacoes')}
          value={v('observacoes')}
          onChange={(e) => form.definir(c('observacoes'), e.target.value || null)}
        />
      </Campo>
    </div>
  )
}

function CamposDocumento({ form }: { form: Formulario }) {
  const { data: s } = useSessao()
  const tipos = useTipos()
  const etiquetas = useEtiquetas()
  const responsaveis = useQuery({
    queryKey: ['responsaveis'],
    queryFn: () => api.get<Opcao[]>('/api/documentos/responsaveis'),
  })
  const v = (x: string) => (form.valor(x) as string | null) ?? ''
  const marcadas = (form.valor('etiquetas') as string[]) ?? []
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Tipo" id="tipoDocumentoId" erro={form.erro('tipoDocumentoId')} obrigatorio>
          <Selecao
            id="tipoDocumentoId"
            value={v('tipoDocumentoId')}
            onChange={(e) => form.definir('tipoDocumentoId', e.target.value)}
          >
            <option value="">Escolha</option>
            {tipos.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Título" id="titulo" erro={form.erro('titulo')} obrigatorio>
          <Entrada
            id="titulo"
            value={v('titulo')}
            onChange={(e) => form.definir('titulo', e.target.value)}
            onBlur={() => form.tocar('titulo')}
          />
        </Campo>
        <Campo rotulo="Órgão emissor" id="orgaoEmissor">
          <Entrada
            id="orgaoEmissor"
            placeholder="MAPA, INEMA, Prefeitura…"
            value={v('orgaoEmissor')}
            onChange={(e) => form.definir('orgaoEmissor', e.target.value || null)}
          />
        </Campo>
        <Campo
          rotulo="Onde vale"
          id="estabelecimentoId"
          ajuda="Documento regulatório fica no estabelecimento (P12)."
        >
          <Selecao
            id="estabelecimentoId"
            value={v('estabelecimentoId')}
            onChange={(e) => form.definir('estabelecimentoId', e.target.value || null)}
          >
            <option value="">Empresa toda</option>
            {s?.empresa?.estabelecimentos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Responsável pela renovação" id="responsavelId">
          <Selecao
            id="responsavelId"
            value={v('responsavelId')}
            onChange={(e) => form.definir('responsavelId', e.target.value || null)}
          >
            <option value="">Ninguém</option>
            {responsaveis.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Módulo" id="modulo">
          <Selecao
            id="modulo"
            value={v('modulo')}
            onChange={(e) => form.definir('modulo', e.target.value || null)}
          >
            <option value="">Nenhum</option>
            {s?.empresa?.modulos
              .filter((m) => m !== 'GESTAO')
              .map((m) => (
                <option key={m} value={m}>
                  {m === 'ENOTRACE' ? 'EnoTrace · Enologia' : m}
                </option>
              ))}
          </Selecao>
        </Campo>
      </div>
      {!!etiquetas.data?.length && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Etiquetas</legend>
          <div className="flex flex-wrap gap-4">
            {etiquetas.data.map((e) => (
              <Caixa
                key={e.id}
                rotulo={<MarcaEtiqueta nome={e.nome} cor={e.cor} />}
                checked={marcadas.includes(e.id)}
                onChange={(ev) =>
                  form.definir(
                    'etiquetas',
                    ev.target.checked ? [...marcadas, e.id] : marcadas.filter((x) => x !== e.id),
                  )
                }
              />
            ))}
          </div>
        </fieldset>
      )}
      <Campo rotulo="Observações" id="observacoes">
        <AreaTexto
          id="observacoes"
          value={v('observacoes')}
          onChange={(e) => form.definir('observacoes', e.target.value || null)}
        />
      </Campo>
    </div>
  )
}

export function NovoDocumento() {
  const navegar = useNavigate()
  const form = useFormulario(novoDocumento, {
    tipoDocumentoId: '',
    titulo: '',
    estabelecimentoId: null,
    responsavelId: null,
    modulo: null,
    orgaoEmissor: '',
    observacoes: '',
    etiquetas: [],
    primeiraVersao: {
      numero: '',
      emissao: '',
      vencimento: '',
      assinadoPor: '',
      assinadoEm: '',
      observacoes: '',
    },
  })
  async function enviar(ev: FormEvent) {
    ev.preventDefault()
    const d = form.validar()
    if (!d) return
    try {
      const r = await api.post<{ id: string }>('/api/documentos', d)
      navegar(`/gestao/documentos/${r.id}`, { replace: true })
    } catch (e) {
      form.erroDaApi(e)
    }
  }
  return (
    <Pagina titulo="Novo documento" trilha={['Gestão', 'Documentos']}>
      <form onSubmit={enviar} noValidate className="flex flex-col gap-5">
        {form.erroGeral && <Aviso tom="erro">{form.erroGeral}</Aviso>}
        <Cartao>
          <CabecalhoCartao titulo="Documento" />
          <CorpoCartao>
            <CamposDocumento form={form} />
          </CorpoCartao>
        </Cartao>
        <Cartao>
          <CabecalhoCartao
            titulo="Emissão atual"
            descricao="Ao renovar, o documento ganha uma versão nova e esta passa a substituída."
          />
          <CorpoCartao>
            <CamposVersao form={form} prefixo="primeiraVersao" />
          </CorpoCartao>
        </Cartao>
        <div>
          <Botao type="submit">Salvar</Botao>
        </div>
      </form>
    </Pagina>
  )
}

interface Versao {
  id: string
  numero: string | null
  emissao: string | null
  vencimento: string | null
  situacao: 'vigente' | 'substituida'
  assinadoPor: string | null
  assinadoEm: string | null
  observacoes: string | null
}

function DialogoVersao({
  documentoId,
  versao,
  aoFechar,
}: {
  documentoId: string
  versao: Versao | null
  aoFechar: () => void
}) {
  const qc = useQueryClient()
  const form = useFormulario(versaoDocumento, {
    numero: versao?.numero ?? '',
    emissao: versao?.emissao ?? '',
    vencimento: versao?.vencimento ?? '',
    assinadoPor: versao?.assinadoPor ?? '',
    assinadoEm: versao?.assinadoEm ?? '',
    observacoes: versao?.observacoes ?? '',
  })
  return (
    <Dialogo
      aberto
      largo
      aoMudar={(x) => !x && aoFechar()}
      titulo={versao ? 'Corrigir a versão vigente' : 'Renovar documento'}
      descricao={
        versao
          ? 'Use para corrigir um dado digitado errado. A correção fica no histórico.'
          : 'A versão atual passa a substituída e fica guardada.'
      }
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
                if (versao) await api.put(`/api/documentos/${documentoId}/versoes/${versao.id}`, d)
                else await api.post(`/api/documentos/${documentoId}/versoes`, d)
                await qc.invalidateQueries({ queryKey: ['documento', documentoId] })
                await qc.invalidateQueries({ queryKey: ['historico', 'documento', documentoId] })
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
      {form.erroGeral && <Aviso tom="erro">{form.erroGeral}</Aviso>}
      <CamposVersao form={form} prefixo="" />
    </Dialogo>
  )
}

type DocCompleto = {
  id: string
  ativo: boolean
  versao: number
  tipoDocumentoId: string
  titulo: string
  estabelecimentoId: string | null
  modulo: string | null
  orgaoEmissor: string | null
  responsavelId: string | null
  observacoes: string | null
  etiquetas: string[]
  versoes: Versao[]
}

function FormularioDocumento({ d, podeEditar }: { d: DocCompleto; podeEditar: boolean }) {
  const qc = useQueryClient()
  const form = useFormulario(dadosDocumento, d)
  const [salvo, setSalvo] = useState(false)
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={async (ev) => {
        ev.preventDefault()
        setSalvo(false)
        const dados = form.validar()
        if (!dados) return
        try {
          await api.put(`/api/documentos/${d.id}`, dados)
          setSalvo(true)
          await qc.invalidateQueries({ queryKey: ['documento', d.id] })
          await qc.invalidateQueries({ queryKey: ['historico', 'documento', d.id] })
        } catch (e) {
          form.erroDaApi(e)
        }
      }}
    >
      {form.erroGeral && <Aviso tom="erro">{form.erroGeral}</Aviso>}
      {salvo && <Aviso tom="sucesso">Dados salvos.</Aviso>}
      <fieldset disabled={!podeEditar}>
        <CamposDocumento form={form} />
      </fieldset>
      {podeEditar && (
        <div>
          <Botao type="submit">Salvar</Botao>
        </div>
      )}
    </form>
  )
}

export function FichaDocumento() {
  const { id = '' } = useParams()
  const { data: s } = useSessao()
  const qc = useQueryClient()
  const [dialogo, setDialogo] = useState<Versao | 'nova' | null>(null)
  const [inativar, setInativar] = useState(false)
  const q = useQuery({
    queryKey: ['documento', id],
    queryFn: () => api.get<DocCompleto>(`/api/documentos/${id}`),
  })
  const podeEditar = pode(s, 'gestao.documentos', 'editar')
  if (!q.data)
    return (
      <p className="text-sm text-muted-foreground">
        {q.isError ? (q.error as Error).message : 'Carregando…'}
      </p>
    )
  const d = q.data
  const vigente = d.versoes.find((v) => v.situacao === 'vigente')
  return (
    <Pagina
      titulo={d.titulo}
      trilha={['Gestão', 'Documentos']}
      acoes={
        <>
          {podeEditar && (
            <Botao onClick={() => setDialogo('nova')}>
              <Plus /> Renovar
            </Botao>
          )}
          {pode(s, 'gestao.documentos', 'inativar') && (
            <AcoesLinha
              contorno
              ativo={d.ativo}
              aoInativar={() => setInativar(true)}
              aoReativar={async () => {
                await api.post(`/api/documentos/${id}/reativar`)
                await qc.invalidateQueries({ queryKey: ['documento', id] })
              }}
            />
          )}
        </>
      }
    >
      {!d.ativo && <Aviso tom="alerta">Documento inativo.</Aviso>}
      <Abas defaultValue="versoes">
        <ListaAbas>
          <Aba value="versoes">Versões</Aba>
          <Aba value="dados">Dados</Aba>
          <Aba value="historico">Histórico</Aba>
        </ListaAbas>
        <ConteudoAba value="versoes" className="flex flex-col gap-4">
          {d.versoes.map((v) => (
            <Cartao key={v.id}>
              <CabecalhoCartao
                titulo={
                  <span className="flex items-center gap-2">
                    {v.numero || 'Sem número'}
                    <Etiqueta tom={v.situacao === 'vigente' ? 'primario' : 'neutro'}>
                      {v.situacao === 'vigente' ? 'Vigente' : 'Substituída'}
                    </Etiqueta>
                  </span>
                }
                descricao={[
                  v.emissao && `emissão ${formatarData(v.emissao)}`,
                  v.vencimento ? `vencimento ${formatarData(v.vencimento)}` : 'sem vencimento',
                  v.assinadoPor &&
                    `assinado por ${v.assinadoPor}${v.assinadoEm ? ` em ${formatarData(v.assinadoEm)}` : ''}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                acoes={
                  v === vigente &&
                  podeEditar && (
                    <Botao variante="secundario" tamanho="pequeno" onClick={() => setDialogo(v)}>
                      Corrigir
                    </Botao>
                  )
                }
              />
              <CorpoCartao>
                {v.observacoes && <p className="mb-3 text-sm">{v.observacoes}</p>}
                <Anexos
                  entidade="documento_versao"
                  registroId={v.id}
                  podeAlterar={podeEditar && v === vigente}
                  fuso={fusoAtivo(s)}
                />
              </CorpoCartao>
            </Cartao>
          ))}
        </ConteudoAba>
        <ConteudoAba value="dados">
          <Cartao>
            <CorpoCartao>
              <FormularioDocumento key={d.versao} d={d} podeEditar={podeEditar} />
            </CorpoCartao>
          </Cartao>
        </ConteudoAba>
        <ConteudoAba value="historico">
          <Historico entidade="documento" registroId={id} fuso={fusoAtivo(s)} />
        </ConteudoAba>
      </Abas>
      {dialogo && (
        <DialogoVersao
          documentoId={id}
          versao={dialogo === 'nova' ? null : dialogo}
          aoFechar={() => setDialogo(null)}
        />
      )}
      <PedirMotivo
        aberto={inativar}
        aoMudar={setInativar}
        titulo={`Inativar ${d.titulo}`}
        rotuloBotao="Inativar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/documentos/${id}/inativar`, { motivo })
          await qc.invalidateQueries({ queryKey: ['documento', id] })
        }}
      />
    </Pagina>
  )
}

export function EtiquetasDocumentos() {
  const { data: s } = useSessao()
  const qc = useQueryClient()
  const q = useEtiquetas()
  const form = useFormulario(dadosEtiqueta, { nome: '', cor: '#6b1f3a' })
  const [excluir, setExcluir] = useState<Opcao | null>(null)
  const recarregar = () => qc.invalidateQueries({ queryKey: ['etiquetas'] })
  return (
    <Pagina titulo="Etiquetas" trilha={['Gestão', 'Documentos']}>
      {pode(s, 'gestao.documentos', 'criar') && (
        <form
          className="flex flex-wrap items-end gap-2"
          noValidate
          onSubmit={async (ev) => {
            ev.preventDefault()
            const d = form.validar()
            if (!d) return
            try {
              await api.post('/api/etiquetas', d)
              form.setValores({ nome: '', cor: d.cor ?? '#6b1f3a' })
              await recarregar()
            } catch (e) {
              form.erroDaApi(e)
            }
          }}
        >
          <Campo
            rotulo="Nova etiqueta"
            id="etq-nome"
            erro={form.erro('nome') ?? form.erroGeral ?? undefined}
          >
            <Entrada
              id="etq-nome"
              value={form.valores.nome}
              onChange={(e) => form.definir('nome', e.target.value)}
            />
          </Campo>
          <input
            aria-label="Cor"
            type="color"
            className="h-9 w-12 cursor-pointer rounded border bg-card"
            value={form.valores.cor ?? '#6b1f3a'}
            onChange={(e) => form.definir('cor', e.target.value)}
          />
          <Botao type="submit">
            <Plus /> Incluir
          </Botao>
        </form>
      )}
      <Cartao>
        <ul className="divide-y">
          {q.data?.map((e) => (
            <li key={e.id} className="flex items-center justify-between px-5 py-3 text-sm">
              <MarcaEtiqueta nome={e.nome} cor={e.cor} />
              <span className="flex items-center gap-3 text-muted-foreground">
                {e.documentos} {e.documentos === 1 ? 'documento' : 'documentos'}
                {pode(s, 'gestao.documentos', 'inativar') && (
                  <Botao
                    variante="fantasma"
                    tamanho="icone"
                    aria-label={`Excluir ${e.nome}`}
                    onClick={() => setExcluir(e)}
                  >
                    <Trash2 />
                  </Botao>
                )}
              </span>
            </li>
          ))}
          {!q.data?.length && (
            <li className="px-5 py-6 text-sm text-muted-foreground">Nenhuma etiqueta.</li>
          )}
        </ul>
      </Cartao>
      <PedirMotivo
        aberto={!!excluir}
        aoMudar={(x) => !x && setExcluir(null)}
        titulo={`Excluir a etiqueta ${excluir?.nome ?? ''}`}
        descricao="A etiqueta sai dos documentos que a usam. Os documentos continuam como estão."
        rotuloBotao="Excluir"
        aoConfirmar={async () => {
          await api.post(`/api/etiquetas/${excluir!.id}/excluir`)
          await recarregar()
        }}
      />
    </Pagina>
  )
}

/** Também na Administração › Catálogos. */
export const CONFIG_TIPOS_DOCUMENTO: ConfigCatalogo = {
  catalogo: 'tipo_documento',
  campos: [
    { nome: 'temVencimento', rotulo: 'Tem vencimento', tipo: 'booleano', padrao: true },
    {
      nome: 'avisosDias',
      rotulo: 'Avisos antes do vencimento (dias)',
      tipo: 'numeros',
      padrao: [60, 30, 7],
      ajuda: 'Ex.: 60, 30, 7. Separe com vírgulas.',
    },
  ],
  colunas: [
    {
      id: 'temVencimento',
      titulo: 'Vencimento',
      celula: (i) => (i.temVencimento ? 'Sim' : 'Não'),
    },
    {
      id: 'avisosDias',
      titulo: 'Avisos (dias)',
      celula: (i) => ((i.avisosDias as number[]) ?? []).join(', '),
    },
  ],
}

export function TiposDocumento() {
  return (
    <Pagina titulo="Tipos de documento" trilha={['Gestão', 'Documentos']}>
      <Catalogo config={CONFIG_TIPOS_DOCUMENTO} />
    </Pagina>
  )
}
