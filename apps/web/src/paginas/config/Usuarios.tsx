// Configurações › Usuários (P8, P12, P27). Só o Master.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { novoConvite } from '@vinicycle/shared'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { AcoesLinha, colunaAcoes } from '@/componentes/AcoesLinha'
import { PedirMotivo } from '@/componentes/PedirMotivo'
import { TabelaDados } from '@/componentes/TabelaDados'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, CabecalhoCartao, Cartao, Etiqueta } from '@/componentes/ui/cartao'
import { Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { Dialogo } from '@/componentes/ui/dialogo'
import { Pagina } from '@/layout/Estrutura'
import { api } from '@/lib/api'
import { useFormulario } from '@/lib/formulario'
import { fusoAtivo, useSessao } from '@/lib/sessao'
import { formatarDataHora } from '@/lib/utils'

interface Vinculo {
  id: string
  usuarioId: string
  nome: string
  email: string
  perfilId: string
  perfil: string
  eMaster: boolean
  ativo: boolean
  ultimoAcessoEm: string | null
  versao: number
  estabelecimentos: string[]
}
interface Convite {
  id: string
  email: string
  perfil: string
  situacao: 'pendente' | 'expirado'
  enviadoEm: string
  expiraEm: string
  reenvios: number
}
interface Perfil {
  id: string
  nome: string
  eMaster: boolean
  ativo: boolean
}

function EscolhaEstabelecimentos({
  valor,
  aoMudar,
}: {
  valor: string[]
  aoMudar: (v: string[]) => void
}) {
  const { data: s } = useSessao()
  const lista = s?.empresa?.estabelecimentos ?? []
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">Estabelecimentos permitidos</legend>
      <p className="mb-2 text-xs text-muted-foreground">
        Sem nenhum marcado, a pessoa acessa todos (P12).
      </p>
      <div className="flex flex-col gap-1.5">
        {lista.map((e) => (
          <Caixa
            key={e.id}
            rotulo={e.nome}
            checked={valor.includes(e.id)}
            onChange={(ev) =>
              aoMudar(ev.target.checked ? [...valor, e.id] : valor.filter((x) => x !== e.id))
            }
          />
        ))}
      </div>
    </fieldset>
  )
}

function Convidar({ perfis, aoFechar }: { perfis: Perfil[]; aoFechar: () => void }) {
  const qc = useQueryClient()
  const form = useFormulario(novoConvite, { email: '', perfilId: '', estabelecimentos: [] })
  return (
    <Dialogo
      aberto
      aoMudar={(v) => !v && aoFechar()}
      titulo="Convidar usuário"
      descricao="A pessoa recebe um link por e-mail, válido por 7 dias, para preencher os dados e definir a senha."
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
                await api.post('/api/usuarios/convites', d)
                await qc.invalidateQueries({ queryKey: ['convites'] })
                aoFechar()
              } catch (e) {
                form.erroDaApi(e)
              }
            }}
          >
            Enviar convite
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {form.erroGeral && <Aviso tom="erro">{form.erroGeral}</Aviso>}
        <Campo rotulo="E-mail" id="email" erro={form.erro('email')} obrigatorio>
          <Entrada
            id="email"
            type="email"
            placeholder="nome@exemplo.com.br"
            value={form.valores.email}
            onChange={(e) => form.definir('email', e.target.value)}
            onBlur={() => form.tocar('email')}
          />
        </Campo>
        <Campo rotulo="Perfil" id="perfil" erro={form.erro('perfilId')} obrigatorio>
          <Selecao
            id="perfil"
            value={form.valores.perfilId}
            onChange={(e) => form.definir('perfilId', e.target.value)}
          >
            <option value="">Escolha</option>
            {perfis
              .filter((p) => !p.eMaster && p.ativo)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
          </Selecao>
        </Campo>
        <EscolhaEstabelecimentos
          valor={form.valores.estabelecimentos ?? []}
          aoMudar={(v) => form.definir('estabelecimentos', v)}
        />
      </div>
    </Dialogo>
  )
}

function Editar({ v, perfis, aoFechar }: { v: Vinculo; perfis: Perfil[]; aoFechar: () => void }) {
  const qc = useQueryClient()
  const { data: s } = useSessao()
  const [perfilId, setPerfilId] = useState(v.perfilId)
  const [estabs, setEstabs] = useState(v.estabelecimentos)
  const [erro, setErro] = useState<string | null>(null)
  const [inativar, setInativar] = useState(false)
  const [bastao, setBastao] = useState(false)
  const proprio = v.usuarioId === s?.usuario.id
  const souMaster = !!s?.empresa?.eMaster
  const bloqueado = proprio || v.eMaster
  const recarregar = () => qc.invalidateQueries({ queryKey: ['lista', '/api/usuarios'] })
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo={v.nome}
      descricao={v.email}
      rodape={
        <>
          {!bloqueado &&
            (v.ativo ? (
              <Botao variante="secundario" className="mr-auto" onClick={() => setInativar(true)}>
                Inativar acesso
              </Botao>
            ) : (
              <Botao
                variante="secundario"
                className="mr-auto"
                onClick={async () => {
                  try {
                    await api.post(`/api/usuarios/${v.id}/reativar`)
                    await recarregar()
                    aoFechar()
                  } catch (e) {
                    setErro((e as Error).message)
                  }
                }}
              >
                Reativar acesso
              </Botao>
            ))}
          {souMaster && !bloqueado && v.ativo && (
            <Botao variante="secundario" onClick={() => setBastao(true)}>
              Passar o bastão
            </Botao>
          )}
          <Botao variante="secundario" onClick={aoFechar}>
            Fechar
          </Botao>
          {!bloqueado && (
            <Botao
              onClick={async () => {
                try {
                  await api.put(`/api/usuarios/${v.id}`, {
                    perfilId,
                    estabelecimentos: estabs,
                    versao: v.versao,
                  })
                  await recarregar()
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
      <div className="flex flex-col gap-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {proprio && <Aviso tom="info">Ninguém altera o próprio perfil (P27).</Aviso>}
        {v.eMaster && !proprio && (
          <Aviso tom="info">O Master só muda pela passagem de bastão.</Aviso>
        )}
        <Campo rotulo="Perfil" id="perfil">
          <Selecao
            id="perfil"
            disabled={bloqueado}
            value={perfilId}
            onChange={(e) => setPerfilId(e.target.value)}
          >
            {perfis
              .filter((p) => (p.ativo && !p.eMaster) || p.id === v.perfilId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
          </Selecao>
        </Campo>
        {!v.eMaster && (
          <EscolhaEstabelecimentos valor={estabs} aoMudar={bloqueado ? () => {} : setEstabs} />
        )}
      </div>
      <PedirMotivo
        aberto={inativar}
        aoMudar={setInativar}
        titulo={`Inativar o acesso de ${v.nome}`}
        descricao="A pessoa perde o acesso a esta empresa na hora. O cadastro e o histórico ficam guardados."
        rotuloBotao="Inativar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/usuarios/${v.id}/inativar`, { motivo })
          await recarregar()
          aoFechar()
        }}
      />
      {bastao && (
        <PassarBastao
          v={v}
          perfis={perfis}
          aoFechar={() => {
            setBastao(false)
            aoFechar()
          }}
        />
      )}
    </Dialogo>
  )
}

interface PedidoBastao {
  id: string
  escolhido: string
  escolhidoEmail: string
  perfilAnterior: string | null
  iniciadoPor: 'master' | 'suporte'
  expiraEm: string
}

/** Passagem de bastão (administracao.md): o Master escolhe o perfil que passa a ter. */
function PassarBastao({
  v,
  perfis,
  aoFechar,
}: {
  v: Vinculo
  perfis: Perfil[]
  aoFechar: () => void
}) {
  const qc = useQueryClient()
  const [perfilId, setPerfilId] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo={`Passar o bastão para ${v.nome}`}
      descricao="Toda empresa tem um só Master. Nada muda até a pessoa aceitar, pelo e-mail, em até 48 horas. Você pode cancelar antes disso."
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            disabled={!perfilId}
            onClick={async () => {
              try {
                await api.post(`/api/usuarios/${v.id}/bastao`, { perfilAnteriorId: perfilId })
                await qc.invalidateQueries({ queryKey: ['bastao'] })
                aoFechar()
              } catch (e) {
                setErro((e as Error).message)
              }
            }}
          >
            Enviar o pedido
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <Campo
          rotulo="O seu perfil depois da troca"
          id="perfil-anterior"
          ajuda="Quando a pessoa aceitar, você deixa de ser Master e passa a este perfil."
        >
          <Selecao
            id="perfil-anterior"
            value={perfilId}
            onChange={(e) => setPerfilId(e.target.value)}
          >
            <option value="">Escolha</option>
            {perfis
              .filter((p) => p.ativo && !p.eMaster)
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

function BastaoPendente({ fuso }: { fuso: string }) {
  const qc = useQueryClient()
  const [erro, setErro] = useState<string | null>(null)
  const q = useQuery({
    queryKey: ['bastao'],
    queryFn: () => api.get<PedidoBastao | null>('/api/usuarios/bastao'),
  })
  if (!q.data) return null
  const p = q.data
  return (
    <Aviso tom="alerta">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>
          {p.iniciadoPor === 'suporte' ? 'O suporte designou' : 'Passagem de bastão para'}{' '}
          <strong>{p.escolhido}</strong>
          {p.iniciadoPor === 'suporte' && ' como novo Master'}, aguardando o aceite até{' '}
          {formatarDataHora(p.expiraEm, fuso)}.
          {p.perfilAnterior && ` Depois da troca, o seu perfil será ${p.perfilAnterior}.`}
        </span>
        {p.iniciadoPor === 'master' && (
          <Botao
            variante="secundario"
            tamanho="pequeno"
            onClick={async () => {
              try {
                await api.post('/api/usuarios/bastao/cancelar')
                await qc.invalidateQueries({ queryKey: ['bastao'] })
              } catch (e) {
                setErro((e as Error).message)
              }
            }}
          >
            Cancelar o pedido
          </Botao>
        )}
      </div>
      {erro && <p className="mt-1 text-destructive">{erro}</p>}
    </Aviso>
  )
}

export function PaginaUsuarios() {
  const { data: s } = useSessao()
  const qc = useQueryClient()
  const perfis = useQuery({
    queryKey: ['perfis'],
    queryFn: () => api.get<Perfil[]>('/api/perfis'),
  })
  const convites = useQuery({
    queryKey: ['convites'],
    queryFn: () => api.get<Convite[]>('/api/usuarios/convites'),
  })
  const [convidar, setConvidar] = useState(false)
  const [editando, setEditando] = useState<Vinculo | null>(null)
  const [cancelar, setCancelar] = useState<Convite | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [inativar, setInativar] = useState<Vinculo | null>(null)
  const fuso = fusoAtivo(s)
  return (
    <Pagina
      titulo="Usuários"
      trilha={['Configurações']}
      acoes={
        <Botao onClick={() => setConvidar(true)}>
          <Plus /> Convidar
        </Botao>
      }
    >
      {aviso && <Aviso tom="sucesso">{aviso}</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <BastaoPendente fuso={fuso} />
      {!!convites.data?.length && (
        <Cartao>
          <CabecalhoCartao titulo="Convites pendentes" />
          <ul className="divide-y">
            {convites.data.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">{c.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.perfil} · enviado em {formatarDataHora(c.enviadoEm, fuso)} ·{' '}
                    {c.situacao === 'expirado' ? (
                      <Etiqueta tom="alerta">expirado</Etiqueta>
                    ) : (
                      `vale até ${formatarDataHora(c.expiraEm, fuso)}`
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Botao
                    variante="secundario"
                    tamanho="pequeno"
                    onClick={async () => {
                      await api.post(`/api/usuarios/convites/${c.id}/reenviar`)
                      setAviso(`Convite reenviado para ${c.email}.`)
                      await qc.invalidateQueries({ queryKey: ['convites'] })
                    }}
                  >
                    Reenviar
                  </Botao>
                  <Botao variante="fantasma" tamanho="pequeno" onClick={() => setCancelar(c)}>
                    Cancelar
                  </Botao>
                </div>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
      <TabelaDados<Vinculo>
        tabela="usuarios"
        url="/api/usuarios"
        ordemPadrao={{ campo: 'nome', direcao: 'asc' }}
        filtrosIniciais={{ situacao: 'ativos' }}
        aoClicar={(v) => setEditando(v)}
        filtros={(f, definir) => (
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
        )}
        colunas={[
          {
            id: 'nome',
            titulo: 'Nome',
            ordenavel: true,
            celula: (v) => (
              <span className="flex items-center gap-2">
                {v.nome} {v.eMaster && <Etiqueta tom="primario">Master</Etiqueta>}
              </span>
            ),
            exportar: (v) => v.nome,
          },
          {
            id: 'email',
            titulo: 'E-mail',
            ordenavel: true,
            celula: (v) => v.email,
            exportar: (v) => v.email,
          },
          {
            id: 'perfil',
            titulo: 'Perfil',
            ordenavel: true,
            celula: (v) => v.perfil,
            exportar: (v) => v.perfil,
          },
          {
            id: 'estabelecimentos',
            titulo: 'Estabelecimentos',
            celula: (v) =>
              v.estabelecimentos.length
                ? v.estabelecimentos
                    .map((id) => s?.empresa?.estabelecimentos.find((e) => e.id === id)?.nome ?? '—')
                    .join(', ')
                : 'Todos',
          },
          {
            id: 'ultimoAcessoEm',
            titulo: 'Último acesso',
            ordenavel: true,
            celula: (v) => formatarDataHora(v.ultimoAcessoEm, fuso) || '—',
            exportar: (v) => v.ultimoAcessoEm,
          },
          {
            id: 'ativo',
            titulo: 'Situação',
            celula: (v) => (
              <Etiqueta tom={v.ativo ? 'sucesso' : 'neutro'}>
                {v.ativo ? 'Ativo' : 'Inativo'}
              </Etiqueta>
            ),
          },
          colunaAcoes<Vinculo>((v) => {
            const bloqueado = v.usuarioId === s?.usuario.id || v.eMaster
            return (
              <AcoesLinha
                ativo={v.ativo}
                aoEditar={bloqueado ? undefined : () => setEditando(v)}
                aoInativar={bloqueado ? undefined : () => setInativar(v)}
                aoReativar={
                  bloqueado
                    ? undefined
                    : async () => {
                        setErro(null)
                        try {
                          await api.post(`/api/usuarios/${v.id}/reativar`)
                          await qc.invalidateQueries({ queryKey: ['lista', '/api/usuarios'] })
                        } catch (e) {
                          setErro((e as Error).message)
                        }
                      }
                }
              />
            )
          }),
        ]}
      />
      {convidar && perfis.data && (
        <Convidar perfis={perfis.data} aoFechar={() => setConvidar(false)} />
      )}
      {editando && perfis.data && (
        <Editar v={editando} perfis={perfis.data} aoFechar={() => setEditando(null)} />
      )}
      <PedirMotivo
        aberto={!!inativar}
        aoMudar={(x) => !x && setInativar(null)}
        titulo={`Inativar o acesso de ${inativar?.nome ?? ''}`}
        descricao="A pessoa perde o acesso a esta empresa na hora. O cadastro e o histórico ficam guardados."
        rotuloBotao="Inativar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/usuarios/${inativar!.id}/inativar`, { motivo })
          await qc.invalidateQueries({ queryKey: ['lista', '/api/usuarios'] })
        }}
      />
      <PedirMotivo
        aberto={!!cancelar}
        aoMudar={(v) => !v && setCancelar(null)}
        titulo={`Cancelar o convite de ${cancelar?.email ?? ''}`}
        rotuloBotao="Cancelar convite"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/usuarios/convites/${cancelar!.id}/cancelar`, { motivo })
          await qc.invalidateQueries({ queryKey: ['convites'] })
        }}
      />
    </Pagina>
  )
}
