// Telas fora da sessão: entrar, esqueci a senha, redefinir a senha, confirmar o e-mail novo (P10).
import { entrar, esqueciSenha, redefinirSenha, SENHA_MINIMO } from '@vinicycle/shared'
import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, Cartao, CorpoCartao } from '@/componentes/ui/cartao'
import { Campo, Entrada } from '@/componentes/ui/campos'
import { api } from '@/lib/api'
import { useFormulario } from '@/lib/formulario'
import { type EstadoSessao, useAtualizarSessao } from '@/lib/sessao'

export function TelaPublica({
  titulo,
  children,
  largo,
}: {
  titulo: string
  children: ReactNode
  largo?: boolean
}) {
  useEffect(() => {
    document.title = `${titulo} · ViniCycle`
  }, [titulo])
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex items-center gap-2 text-xl font-semibold text-primary">
        <img src="/icone.svg" alt="" className="size-9" /> ViniCycle
      </div>
      <Cartao className={largo ? 'w-full max-w-3xl' : 'w-full max-w-sm'}>
        <CorpoCartao className="flex flex-col gap-4">
          <h1 className="text-lg font-semibold">{titulo}</h1>
          {children}
        </CorpoCartao>
      </Cartao>
    </div>
  )
}

export function Entrar() {
  const navegar = useNavigate()
  const [params] = useSearchParams()
  const atualizar = useAtualizarSessao()
  const form = useFormulario(entrar, { email: '', senha: '' })
  const [enviando, setEnviando] = useState(false)

  async function enviar(ev: FormEvent) {
    ev.preventDefault()
    const dados = form.validar()
    if (!dados) return
    setEnviando(true)
    try {
      const s = await api.post<EstadoSessao>('/api/auth/entrar', dados)
      atualizar(s)
      const volta = params.get('volta')
      navegar(volta?.startsWith('/') && !volta.startsWith('//') ? volta : '/')
    } catch (e) {
      form.erroDaApi(e)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <TelaPublica titulo="Entrar">
      <form className="flex flex-col gap-4" onSubmit={enviar} noValidate>
        {form.erroGeral && <Aviso tom="erro">{form.erroGeral}</Aviso>}
        <Campo rotulo="E-mail" erro={form.erro('email')} id="email">
          <Entrada
            id="email"
            type="email"
            autoComplete="username"
            placeholder="nome@exemplo.com.br"
            value={form.valores.email}
            onChange={(e) => form.definir('email', e.target.value)}
            onBlur={() => form.tocar('email')}
            autoFocus
          />
        </Campo>
        <Campo rotulo="Senha" erro={form.erro('senha')} id="senha">
          <Entrada
            id="senha"
            type="password"
            autoComplete="current-password"
            value={form.valores.senha}
            onChange={(e) => form.definir('senha', e.target.value)}
            onBlur={() => form.tocar('senha')}
          />
        </Campo>
        <Botao type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </Botao>
        <Link to="/esqueci-senha" className="text-center text-sm text-primary hover:underline">
          Esqueci minha senha
        </Link>
        <Link to="/suporte" className="text-center text-sm text-muted-foreground hover:underline">
          Não consegue entrar? Fale com o suporte
        </Link>
      </form>
    </TelaPublica>
  )
}

export function EsqueciSenha() {
  const form = useFormulario(esqueciSenha, { email: '' })
  const [enviado, setEnviado] = useState(false)
  return (
    <TelaPublica titulo="Esqueci minha senha">
      {enviado ? (
        <Aviso tom="sucesso">
          Se o e-mail tiver cadastro, você vai receber um link para definir uma nova senha. O link
          vale por 1 hora.
        </Aviso>
      ) : (
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={async (ev) => {
            ev.preventDefault()
            const d = form.validar()
            if (!d) return
            try {
              await api.post('/api/auth/senha/esqueci', d)
              setEnviado(true)
            } catch (e) {
              form.erroDaApi(e)
            }
          }}
        >
          <p className="text-sm text-muted-foreground">
            Informe o seu e-mail. Enviaremos um link para definir uma nova senha.
          </p>
          {form.erroGeral && <Aviso tom="erro">{form.erroGeral}</Aviso>}
          <Campo rotulo="E-mail" erro={form.erro('email')} id="email">
            <Entrada
              id="email"
              type="email"
              placeholder="nome@exemplo.com.br"
              value={form.valores.email}
              onChange={(e) => form.definir('email', e.target.value)}
              onBlur={() => form.tocar('email')}
              autoFocus
            />
          </Campo>
          <Botao type="submit">Enviar link</Botao>
        </form>
      )}
      <Link to="/entrar" className="text-center text-sm text-primary hover:underline">
        Voltar para a entrada
      </Link>
    </TelaPublica>
  )
}

export function RedefinirSenha() {
  const [params] = useSearchParams()
  const form = useFormulario(redefinirSenha, { token: params.get('token') ?? '', senha: '' })
  const [confirmacao, setConfirmacao] = useState('')
  const [pronto, setPronto] = useState(false)
  return (
    <TelaPublica titulo="Definir nova senha">
      {pronto ? (
        <>
          <Aviso tom="sucesso">Senha definida. As outras sessões abertas foram encerradas.</Aviso>
          <Botao comoFilho>
            <Link to="/entrar">Entrar</Link>
          </Botao>
        </>
      ) : (
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={async (ev) => {
            ev.preventDefault()
            const d = form.validar()
            if (!d) return
            if (d.senha !== confirmacao) return form.erroDaApi(new Error('As senhas não conferem.'))
            try {
              await api.post('/api/auth/senha/redefinir', d)
              setPronto(true)
            } catch (e) {
              form.erroDaApi(e)
            }
          }}
        >
          {form.erroGeral && <Aviso tom="erro">{form.erroGeral}</Aviso>}
          <Campo
            rotulo="Nova senha"
            erro={form.erro('senha')}
            id="senha"
            ajuda={`Pelo menos ${SENHA_MINIMO} caracteres. Uma frase fácil de lembrar é uma boa senha.`}
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
          <Campo
            rotulo="Repita a senha"
            id="confirmacao"
            erro={
              confirmacao && confirmacao !== form.valores.senha
                ? 'As senhas não conferem.'
                : undefined
            }
          >
            <Entrada
              id="confirmacao"
              type="password"
              autoComplete="new-password"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
            />
          </Campo>
          <Botao type="submit">Salvar senha</Botao>
        </form>
      )}
    </TelaPublica>
  )
}

/**
 * Confirmação do e-mail novo (P10). Confirma com um clique, não ao abrir: leitores de e-mail
 * costumam abrir os links sozinhos.
 */
export function ConfirmarEmail() {
  const [params] = useSearchParams()
  const qc = useQueryClient()
  const [novo, setNovo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  return (
    <TelaPublica titulo="Confirmar e-mail">
      {novo ? (
        <>
          <Aviso tom="sucesso">
            Pronto. O seu e-mail de acesso agora é <strong>{novo}</strong>.
          </Aviso>
          <Botao comoFilho>
            <Link to="/">Continuar</Link>
          </Botao>
        </>
      ) : (
        <>
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <p className="text-sm">
            Confirme para passar a usar este endereço como e-mail de acesso.
          </p>
          <Botao
            onClick={async () => {
              setErro(null)
              try {
                const r = await api.post<{ email: string }>('/api/eu/email/confirmar', {
                  token: params.get('token') ?? '',
                })
                setNovo(r.email)
                await qc.invalidateQueries()
              } catch (e) {
                setErro((e as Error).message)
              }
            }}
          >
            Confirmar o novo e-mail
          </Botao>
        </>
      )}
    </TelaPublica>
  )
}
