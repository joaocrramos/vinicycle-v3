// Configurações › Perfis e permissões (P27): a grade em matriz telas × ações. O Master aparece
// bloqueado, porque tem acesso a tudo.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ACOES, type Acao, dadosPerfil, MODULOS, NOMES_ACOES } from '@vinicycle/shared'
import { Lock, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { AcoesLinha } from '@/componentes/AcoesLinha'
import { Historico } from '@/componentes/Historico'
import { PedirMotivo } from '@/componentes/PedirMotivo'
import { Aba, Abas, ConteudoAba, ListaAbas } from '@/componentes/ui/abas'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, Cartao, Etiqueta } from '@/componentes/ui/cartao'
import { Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { Dialogo } from '@/componentes/ui/dialogo'
import { Pagina } from '@/layout/Estrutura'
import { api } from '@/lib/api'
import { useFormulario } from '@/lib/formulario'
import { fusoAtivo, useSessao } from '@/lib/sessao'

interface Perfil {
  id: string
  nome: string
  descricao: string | null
  eMaster: boolean
  modelo: boolean
  ativo: boolean
  versao: number
  usuarios: number
}

function NovoPerfil({ perfis, aoFechar }: { perfis: Perfil[]; aoFechar: () => void }) {
  const navegar = useNavigate()
  const qc = useQueryClient()
  const form = useFormulario(dadosPerfil, { nome: '', descricao: '', copiarDe: undefined })
  return (
    <Dialogo
      aberto
      aoMudar={(v) => !v && aoFechar()}
      titulo="Novo perfil"
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
                const r = await api.post<{ id: string }>('/api/perfis', d)
                await qc.invalidateQueries({ queryKey: ['perfis'] })
                navegar(`/config/perfis/${r.id}`)
              } catch (e) {
                form.erroDaApi(e)
              }
            }}
          >
            Criar
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {form.erroGeral && <Aviso tom="erro">{form.erroGeral}</Aviso>}
        <Campo rotulo="Nome" id="nome" erro={form.erro('nome')} obrigatorio>
          <Entrada
            id="nome"
            value={form.valores.nome}
            onChange={(e) => form.definir('nome', e.target.value)}
            onBlur={() => form.tocar('nome')}
          />
        </Campo>
        <Campo rotulo="Descrição" id="descricao">
          <Entrada
            id="descricao"
            value={form.valores.descricao ?? ''}
            onChange={(e) => form.definir('descricao', e.target.value)}
          />
        </Campo>
        <Campo
          rotulo="Começar com a grade de"
          id="copiar"
          ajuda="Opcional: copia as permissões de um perfil existente."
        >
          <Selecao
            id="copiar"
            value={form.valores.copiarDe ?? ''}
            onChange={(e) => form.definir('copiarDe', e.target.value || undefined)}
          >
            <option value="">Grade vazia</option>
            {perfis
              .filter((p) => !p.eMaster)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
          </Selecao>
        </Campo>
      </div>
    </Dialogo>
  )
}

export function ListaPerfis() {
  const navegar = useNavigate()
  const [novo, setNovo] = useState(false)
  const q = useQuery({ queryKey: ['perfis'], queryFn: () => api.get<Perfil[]>('/api/perfis') })
  return (
    <Pagina
      titulo="Perfis e permissões"
      trilha={['Configurações']}
      acoes={
        <Botao onClick={() => setNovo(true)}>
          <Plus /> Novo perfil
        </Botao>
      }
    >
      <p className="text-sm text-muted-foreground">
        Cada perfil tem uma grade de permissões. Sem permissão marcada, a ação é negada. A mudança
        vale na próxima ação de quem usa o perfil.
      </p>
      <Cartao>
        <ul className="divide-y">
          {q.data?.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 px-5 py-3 text-left hover:bg-muted/50"
                onClick={() => navegar(`/config/perfis/${p.id}`)}
              >
                <span>
                  <span className="flex items-center gap-2 font-medium">
                    {p.eMaster && <Lock className="size-4" aria-label="bloqueado" />}
                    {p.nome}
                    {!p.ativo && <Etiqueta>Inativo</Etiqueta>}
                  </span>
                  {p.descricao && (
                    <span className="block text-sm text-muted-foreground">{p.descricao}</span>
                  )}
                </span>
                <span className="text-sm text-muted-foreground">
                  {p.usuarios} {p.usuarios === 1 ? 'usuário' : 'usuários'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Cartao>
      {novo && q.data && <NovoPerfil perfis={q.data} aoFechar={() => setNovo(false)} />}
    </Pagina>
  )
}

interface Funcionalidade {
  codigo: string
  nome: string
  modulo: string
  acoes: Acao[]
}

export function GradePerfil() {
  const { id = '' } = useParams()
  const { data: s } = useSessao()
  const qc = useQueryClient()
  const perfil = useQuery({
    queryKey: ['perfil', id],
    queryFn: () => api.get<Perfil & { permissoes: string[] }>(`/api/perfis/${id}`),
  })
  const funcs = useQuery({
    queryKey: ['funcionalidades'],
    queryFn: () => api.get<Funcionalidade[]>('/api/perfis/funcionalidades'),
  })
  const [marcadas, setMarcadas] = useState<Set<string> | null>(null)
  const [nome, setNome] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState<{ tom: 'sucesso' | 'erro'; texto: string } | null>(null)
  const [inativar, setInativar] = useState(false)

  if (!perfil.data || !funcs.data)
    return <p className="text-sm text-muted-foreground">Carregando…</p>
  const p = perfil.data
  const atual = marcadas ?? new Set(p.permissoes)
  const acoesUsadas = ACOES.filter((a) => funcs.data.some((f) => f.acoes.includes(a)))
  const alternar = (chave: string) => {
    const novo = new Set(atual)
    if (novo.has(chave)) novo.delete(chave)
    else novo.add(chave)
    setMarcadas(novo)
  }
  const alterado = marcadas !== null || (nome !== null && nome !== p.nome)
  const recarregar = async () => {
    await qc.invalidateQueries({ queryKey: ['perfil', id] })
    await qc.invalidateQueries({ queryKey: ['perfis'] })
    await qc.invalidateQueries({ queryKey: ['historico', 'perfil', id] })
  }

  async function salvar() {
    setMensagem(null)
    try {
      let versao = p.versao
      if (nome !== null && nome !== p.nome) {
        await api.put(`/api/perfis/${id}`, { nome, descricao: p.descricao, versao })
        versao += 1
      }
      if (marcadas) {
        await api.put(`/api/perfis/${id}/grade`, {
          versao,
          permissoes: [...marcadas].map((x) => {
            const [funcionalidade, acao] = x.split(':')
            return { funcionalidade, acao }
          }),
        })
      }
      setMarcadas(null)
      setNome(null)
      setMensagem({
        tom: 'sucesso',
        texto: 'Perfil salvo. A mudança já vale para quem usa este perfil.',
      })
      await recarregar()
    } catch (e) {
      setMensagem({ tom: 'erro', texto: (e as Error).message })
    }
  }

  const porModulo = MODULOS.map((m) => ({
    ...m,
    funcs: funcs.data.filter((f) => f.modulo === m.codigo),
  })).filter((m) => m.funcs.length)

  return (
    <Pagina
      titulo={p.nome}
      trilha={['Configurações', 'Perfis e permissões']}
      acoes={
        !p.eMaster && (
          <>
            <AcoesLinha
              contorno
              ativo={p.ativo}
              aoInativar={() => setInativar(true)}
              aoReativar={async () => {
                await api.post(`/api/perfis/${id}/reativar`)
                await recarregar()
              }}
            />
            <Botao disabled={!alterado} onClick={() => void salvar()}>
              Salvar
            </Botao>
          </>
        )
      }
    >
      {mensagem && <Aviso tom={mensagem.tom}>{mensagem.texto}</Aviso>}
      {p.eMaster && (
        <Aviso tom="info">
          O Master tem acesso a tudo no âmbito da empresa. A grade dele não é editável (P27).
        </Aviso>
      )}
      <Abas defaultValue="grade">
        <ListaAbas>
          <Aba value="grade">Grade</Aba>
          <Aba value="historico">Histórico</Aba>
        </ListaAbas>
        <ConteudoAba value="grade" className="flex flex-col gap-4">
          {!p.eMaster && (
            <Campo rotulo="Nome do perfil" id="nome" className="max-w-sm">
              <Entrada id="nome" value={nome ?? p.nome} onChange={(e) => setNome(e.target.value)} />
            </Campo>
          )}
          <p className="text-sm text-muted-foreground">
            Usuários, perfis, assinatura e exportação completa dos dados são exclusivos do Master e
            não aparecem na grade.
          </p>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Tela
                  </th>
                  {acoesUsadas.map((a) => (
                    <th
                      key={a}
                      scope="col"
                      className="px-2 py-2 text-center text-xs font-medium whitespace-nowrap"
                    >
                      {NOMES_ACOES[a]}
                    </th>
                  ))}
                </tr>
              </thead>
              {porModulo.map((m) => (
                <tbody key={m.codigo}>
                  <tr className="border-t bg-muted/30">
                    <th
                      colSpan={acoesUsadas.length + 1}
                      scope="rowgroup"
                      className="px-3 py-1.5 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                    >
                      {m.nome === m.funcao ? m.nome : `${m.nome} · ${m.funcao}`}
                    </th>
                  </tr>
                  {m.funcs.map((f) => (
                    <tr key={f.codigo} className="border-t">
                      <th scope="row" className="px-3 py-1.5 text-left font-normal">
                        {f.nome.replace('Configurações: ', 'Config.: ')}
                      </th>
                      {acoesUsadas.map((a) => {
                        const chave = `${f.codigo}:${a}`
                        return (
                          <td key={a} className="px-2 py-1.5 text-center">
                            {f.acoes.includes(a) ? (
                              <input
                                type="checkbox"
                                className="size-4 accent-[var(--primaria)]"
                                aria-label={`${NOMES_ACOES[a]} em ${f.nome}`}
                                checked={p.eMaster || atual.has(chave)}
                                disabled={p.eMaster}
                                onChange={() => alternar(chave)}
                              />
                            ) : null}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </ConteudoAba>
        <ConteudoAba value="historico">
          <Historico entidade="perfil" registroId={id} fuso={fusoAtivo(s)} />
        </ConteudoAba>
      </Abas>
      <PedirMotivo
        aberto={inativar}
        aoMudar={setInativar}
        titulo={`Inativar o perfil ${p.nome}`}
        descricao="Só é possível quando nenhum usuário ou convite usa o perfil."
        rotuloBotao="Inativar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/perfis/${id}/inativar`, { motivo })
          await recarregar()
        }}
      />
    </Pagina>
  )
}
