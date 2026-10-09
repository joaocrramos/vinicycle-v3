// Menu do avatar: Meu perfil, Segurança e Preferências (P9, P10, P21).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fichaEntrada, SENHA_MINIMO, trocarEmail, trocarSenha } from '@vinicycle/shared'
import { type FormEvent, useState } from 'react'
import { z } from 'zod'
import { FichaCadastral } from '@/componentes/FichaCadastral'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao'
import { Caixa, Campo, Entrada } from '@/componentes/ui/campos'
import { Dialogo } from '@/componentes/ui/dialogo'
import { RelatoriosEmail } from './RelatoriosEmail'
import { Pagina } from '@/layout/Estrutura'
import { api } from '@/lib/api'
import { useFormulario } from '@/lib/formulario'
import { type Preferencias, useSessao } from '@/lib/sessao'
import { aplicarTema, PALETAS } from '@/lib/tema'
import { cn, formatarDataHora } from '@/lib/utils'

interface Eu {
  email: string
  segundoFatorAtivo: boolean
  senhaAlteradaEm: string | null
  ficha: z.input<typeof fichaEntrada>
}

function FormularioPerfil({ eu }: { eu: Eu }) {
  const qc = useQueryClient()
  const form = useFormulario(z.object({ ficha: fichaEntrada }), { ficha: eu.ficha })
  const [salvo, setSalvo] = useState(false)
  const [trocar, setTrocar] = useState(false)
  const [enviado, setEnviado] = useState<string | null>(null)
  async function enviar(ev: FormEvent) {
    ev.preventDefault()
    setSalvo(false)
    const d = form.validar()
    if (!d) return
    try {
      await api.put('/api/eu/ficha', d.ficha)
      setSalvo(true)
      await qc.invalidateQueries({ queryKey: ['sessao'] })
    } catch (e) {
      form.erroDaApi(e)
    }
  }
  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-6">
      {form.erroGeral && <Aviso tom="erro">{form.erroGeral}</Aviso>}
      {salvo && <Aviso tom="sucesso">Dados salvos.</Aviso>}
      <Campo rotulo="E-mail" id="email" ajuda="O e-mail é a sua identidade no ViniCycle.">
        <div className="flex gap-2">
          <Entrada id="email" value={eu.email} disabled />
          <Botao type="button" variante="secundario" onClick={() => setTrocar(true)}>
            Trocar
          </Botao>
        </div>
      </Campo>
      {enviado && (
        <Aviso tom="info">
          Enviamos um link para <strong>{enviado}</strong>. A troca vale quando você confirmar por
          ele, em até 1 hora. Até lá, o e-mail atual continua valendo.
        </Aviso>
      )}
      {trocar && (
        <TrocaDeEmail
          aoFechar={(novo) => {
            setTrocar(false)
            if (novo) setEnviado(novo)
          }}
        />
      )}
      <FichaCadastral form={form} tiposPermitidos={['fisica']} simples />
      <div>
        <Botao type="submit">Salvar</Botao>
      </div>
    </form>
  )
}

/** Troca de e-mail (P10): confirma a senha atual; o novo endereço recebe o link. */
function TrocaDeEmail({ aoFechar }: { aoFechar: (novo?: string) => void }) {
  const form = useFormulario(trocarEmail, { email: '', senha: '' })
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo="Trocar o e-mail"
      descricao="Enviamos um link de confirmação para o endereço novo. O e-mail atual recebe um aviso quando a troca for feita."
      rodape={
        <>
          <Botao variante="secundario" onClick={() => aoFechar()}>
            Cancelar
          </Botao>
          <Botao
            onClick={async () => {
              const d = form.validar()
              if (!d) return
              try {
                await api.post('/api/eu/email', d)
                aoFechar(d.email)
              } catch (e) {
                form.erroDaApi(e)
              }
            }}
          >
            Enviar link
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {form.erroGeral && <Aviso tom="erro">{form.erroGeral}</Aviso>}
        <Campo rotulo="Novo e-mail" id="novo-email" erro={form.erro('email')} obrigatorio>
          <Entrada
            id="novo-email"
            type="email"
            autoComplete="email"
            autoFocus
            value={form.valores.email}
            onChange={(e) => form.definir('email', e.target.value)}
          />
        </Campo>
        <Campo rotulo="Sua senha atual" id="senha-atual" erro={form.erro('senha')} obrigatorio>
          <Entrada
            id="senha-atual"
            type="password"
            autoComplete="current-password"
            value={form.valores.senha}
            onChange={(e) => form.definir('senha', e.target.value)}
          />
        </Campo>
      </div>
    </Dialogo>
  )
}

export function MeuPerfil() {
  const q = useQuery({ queryKey: ['eu'], queryFn: () => api.get<Eu>('/api/eu') })
  return (
    <Pagina titulo="Meu perfil">
      <Cartao>
        <CorpoCartao>{q.data && <FormularioPerfil eu={q.data} />}</CorpoCartao>
      </Cartao>
    </Pagina>
  )
}

const novaSenha = trocarSenha
  .extend({ confirmacao: z.string() })
  .refine((d) => d.senha === d.confirmacao, {
    path: ['confirmacao'],
    message: 'As senhas não conferem',
  })

function TrocaDeSenha() {
  const [codigoEnviado, setCodigoEnviado] = useState(false)
  const [pronto, setPronto] = useState(false)
  const form = useFormulario(novaSenha, { codigo: '', senha: '', confirmacao: '' })
  return (
    <Cartao>
      <CabecalhoCartao
        titulo="Senha"
        descricao="Para trocar a senha, enviamos um código de 6 dígitos para o seu e-mail (P10). As outras sessões abertas são encerradas."
      />
      <CorpoCartao className="flex flex-col gap-4">
        {pronto && <Aviso tom="sucesso">Senha trocada.</Aviso>}
        {form.erroGeral && <Aviso tom="erro">{form.erroGeral}</Aviso>}
        {!codigoEnviado ? (
          <div>
            <Botao
              variante="secundario"
              onClick={async () => {
                try {
                  await api.post('/api/eu/senha/codigo')
                  setCodigoEnviado(true)
                  setPronto(false)
                } catch (e) {
                  form.erroDaApi(e)
                }
              }}
            >
              Enviar código para o meu e-mail
            </Botao>
          </div>
        ) : (
          <form
            className="grid gap-4 sm:grid-cols-3"
            noValidate
            onSubmit={async (ev) => {
              ev.preventDefault()
              const d = form.validar()
              if (!d) return
              try {
                await api.post('/api/eu/senha', { codigo: d.codigo, senha: d.senha })
                setPronto(true)
                setCodigoEnviado(false)
                form.setValores({ codigo: '', senha: '', confirmacao: '' })
              } catch (e) {
                form.erroDaApi(e)
              }
            }}
          >
            <Campo rotulo="Código recebido" id="codigo" erro={form.erro('codigo')}>
              <Entrada
                id="codigo"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={form.valores.codigo}
                onChange={(e) => form.definir('codigo', e.target.value.replace(/\D/g, ''))}
              />
            </Campo>
            <Campo
              rotulo="Nova senha"
              id="senha"
              erro={form.erro('senha')}
              ajuda={`Pelo menos ${SENHA_MINIMO} caracteres.`}
            >
              <Entrada
                id="senha"
                type="password"
                autoComplete="new-password"
                value={form.valores.senha}
                onChange={(e) => form.definir('senha', e.target.value)}
                onBlur={() => form.tocar('senha')}
              />
            </Campo>
            <Campo rotulo="Repita a senha" id="confirmacao" erro={form.erro('confirmacao')}>
              <Entrada
                id="confirmacao"
                type="password"
                autoComplete="new-password"
                value={form.valores.confirmacao}
                onChange={(e) => form.definir('confirmacao', e.target.value)}
                onBlur={() => form.tocar('confirmacao')}
              />
            </Campo>
            <div className="sm:col-span-3">
              <Botao type="submit">Trocar senha</Botao>
            </div>
          </form>
        )}
      </CorpoCartao>
    </Cartao>
  )
}

interface Sessao {
  id: string
  criadaEm: string
  ultimoUsoEm: string
  ip: string | null
  navegador: string | null
  atual: boolean
}

function descreverNavegador(ua: string | null): string {
  if (!ua) return 'Navegador desconhecido'
  const nav = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Navegador'
  const so = /iPhone|iPad/.test(ua)
    ? 'iPhone/iPad'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS/.test(ua)
        ? 'Mac'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : ''
  return so ? `${nav} no ${so}` : nav
}

function Sessoes() {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['sessoes'],
    queryFn: () => api.get<Sessao[]>('/api/eu/sessoes'),
  })
  return (
    <Cartao>
      <CabecalhoCartao
        titulo="Sessões abertas"
        descricao="Aparelhos conectados à sua conta. Encerre os que você não reconhece."
      />
      <ul className="divide-y">
        {q.data?.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
          >
            <div>
              <p className="font-medium">
                {descreverNavegador(s.navegador)}{' '}
                {s.atual && <Etiqueta tom="primario">esta sessão</Etiqueta>}
              </p>
              <p className="text-xs text-muted-foreground">
                IP {s.ip ?? '—'} · entrou em {formatarDataHora(s.criadaEm)} · último uso{' '}
                {formatarDataHora(s.ultimoUsoEm)}
              </p>
            </div>
            {!s.atual && (
              <Botao
                variante="secundario"
                tamanho="pequeno"
                onClick={async () => {
                  await api.post(`/api/eu/sessoes/${s.id}/encerrar`)
                  await qc.invalidateQueries({ queryKey: ['sessoes'] })
                }}
              >
                Encerrar
              </Botao>
            )}
          </li>
        ))}
      </ul>
    </Cartao>
  )
}

export function ConfigurarSegundoFator({ aoConcluir }: { aoConcluir?: () => void }) {
  const [dados, setDados] = useState<{ segredo: string; qrSvg: string } | null>(null)
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)
  if (pronto) return <Aviso tom="sucesso">Segundo fator ativado.</Aviso>
  if (!dados) {
    return (
      <div className="flex flex-col gap-3">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <div>
          <Botao
            onClick={async () => {
              try {
                setDados(await api.post('/api/auth/segundo-fator/iniciar'))
              } catch (e) {
                setErro((e as Error).message)
              }
            }}
          >
            Configurar o aplicativo autenticador
          </Botao>
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        No aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password…), leia
        o QR code ou digite a chave. Depois informe o código de 6 dígitos que aparece.
      </p>
      <div className="flex flex-wrap items-center gap-6">
        <div
          className="size-44 rounded-md bg-white p-2"
          dangerouslySetInnerHTML={{ __html: dados.qrSvg }}
        />
        <p className="text-sm">
          Chave:{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 break-all">
            {dados.segredo.match(/.{1,4}/g)?.join(' ')}
          </code>
        </p>
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (ev) => {
          ev.preventDefault()
          try {
            await api.post('/api/auth/segundo-fator/ativar', { codigo })
            setPronto(true)
            aoConcluir?.()
          } catch (e) {
            setErro((e as Error).message)
          }
        }}
      >
        <Campo rotulo="Código" id="codigo-2f">
          <Entrada
            id="codigo-2f"
            inputMode="numeric"
            maxLength={6}
            className="w-32"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
          />
        </Campo>
        <Botao type="submit">Ativar</Botao>
      </form>
    </div>
  )
}

export function Seguranca() {
  const q = useQuery({ queryKey: ['eu'], queryFn: () => api.get<Eu>('/api/eu') })
  return (
    <Pagina titulo="Segurança">
      <TrocaDeSenha />
      <Cartao>
        <CabecalhoCartao
          titulo="Segundo fator"
          descricao="Código do aplicativo autenticador além da senha. Obrigatório para a equipe da plataforma; opcional para os demais (P21)."
        />
        <CorpoCartao>
          {q.data?.segundoFatorAtivo ? (
            <Aviso tom="sucesso">Segundo fator ativo.</Aviso>
          ) : (
            <ConfigurarSegundoFator aoConcluir={() => void q.refetch()} />
          )}
        </CorpoCartao>
      </Cartao>
      <Sessoes />
    </Pagina>
  )
}

export function PreferenciasUsuario() {
  const { data: s } = useSessao()
  const qc = useQueryClient()
  const p = (s?.usuario.preferencias ?? {}) as Preferencias
  async function mudar(novo: Partial<Preferencias>) {
    const prefs = { ...p, ...novo }
    aplicarTema(prefs)
    await api.put('/api/eu/preferencias', novo)
    await qc.invalidateQueries({ queryKey: ['sessao'] })
  }
  return (
    <Pagina titulo="Preferências">
      <Cartao>
        <CabecalhoCartao
          titulo="Aparência"
          descricao="Vale em qualquer aparelho em que você entrar (P9)."
        />
        <CorpoCartao className="flex flex-col gap-6">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Modo de cor</legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['claro', 'Claro'],
                  ['escuro', 'Escuro'],
                  ['sistema', 'Seguir o sistema'],
                ] as const
              ).map(([v, r]) => (
                <Botao
                  key={v}
                  variante={(p.tema ?? 'sistema') === v ? 'primario' : 'secundario'}
                  onClick={() => void mudar({ tema: v })}
                >
                  {r}
                </Botao>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Paleta</legend>
            <div className="flex flex-wrap gap-3">
              {PALETAS.map((x) => (
                <button
                  key={x.valor}
                  type="button"
                  data-paleta={x.valor}
                  onClick={() => void mudar({ paleta: x.valor })}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm',
                    (p.paleta ?? 'vinho') === x.valor && 'ring-2 ring-ring',
                  )}
                >
                  <span className="size-5 rounded-full bg-primary" />
                  {x.nome}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="text-xs text-muted-foreground">
            Idioma: português do Brasil. Formato de data: dd/mm/aaaa.
          </p>
        </CorpoCartao>
      </Cartao>
      <Cartao>
        <CabecalhoCartao
          titulo="Avisos por WhatsApp e SMS"
          descricao="Além do e-mail e da tela. Vai para o telefone marcado como WhatsApp (ou o principal, no SMS) em Meu perfil, dentro da franquia de mensagens contratada pela empresa; sem franquia, segue só por e-mail."
        />
        <CorpoCartao className="flex flex-col gap-2">
          {(['whatsapp', 'sms'] as const).map((canal) => (
            <Caixa
              key={canal}
              rotulo={canal === 'whatsapp' ? 'WhatsApp' : 'SMS'}
              checked={!!p.canais?.[canal]}
              onChange={(e) =>
                void mudar({
                  canais: {
                    whatsapp: !!p.canais?.whatsapp,
                    sms: !!p.canais?.sms,
                    [canal]: e.target.checked,
                  },
                })
              }
            />
          ))}
          <p className="text-xs text-muted-foreground">
            Hoje: avisos de cobrança para o Master e os relatórios agendados com esse canal.
          </p>
        </CorpoCartao>
      </Cartao>
      <RelatoriosEmail />
    </Pagina>
  )
}
