// Entrar ou cadastrar a partir de um link (convite ou passagem de bastão): quem já tem cadastro
// confirma a senha (P8); quem não tem preenche os dados (P2), cria a senha e aceita os termos (P21).
import { aceitarConvite, fichaEntrada, SENHA_MINIMO, senhaNova } from '@vinicycle/shared'
import { type ReactNode, useState } from 'react'
import { z } from 'zod'
import { FICHA_VAZIA_PF, FichaCadastral } from '@/componentes/FichaCadastral'
import { Botao } from '@/componentes/ui/botao'
import { Aviso } from '@/componentes/ui/cartao'
import { Caixa, Campo, Entrada } from '@/componentes/ui/campos'
import { useFormulario } from '@/lib/formulario'

export interface Termo {
  id: string
  tipo: string
  versao: string
  texto: string
}

const novoUsuario = z
  .object({
    ficha: fichaEntrada,
    senha: senhaNova,
    confirmacao: z.string(),
    aceiteTermos: z.literal(true, 'Aceite os termos para continuar'),
  })
  .refine((d) => d.senha === d.confirmacao, {
    path: ['confirmacao'],
    message: 'As senhas não conferem',
  })

export function EntrarOuCadastrar({
  usuarioExiste,
  termos,
  resumo,
  rotulo,
  aoEnviar,
}: {
  usuarioExiste: boolean
  termos: Termo[]
  resumo: ReactNode
  /** Texto do botão (ex.: "Aceitar o convite"). */
  rotulo: string
  aoEnviar: (corpo: unknown) => Promise<void>
}) {
  const [enviando, setEnviando] = useState(false)
  const existente = useFormulario(aceitarConvite, { senha: '' })
  const novo = useFormulario(novoUsuario, {
    ficha: { ...FICHA_VAZIA_PF, contatos: [] },
    senha: '',
    confirmacao: '',
    aceiteTermos: false as unknown as true,
  })

  async function enviar(corpo: unknown, form: { erroDaApi: (e: unknown) => void }) {
    setEnviando(true)
    try {
      await aoEnviar(corpo)
    } catch (e) {
      form.erroDaApi(e)
    } finally {
      setEnviando(false)
    }
  }

  if (usuarioExiste) {
    return (
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault()
          const d = existente.validar()
          if (d) void enviar(d, existente)
        }}
      >
        {resumo}
        <p className="text-sm text-muted-foreground">
          Você já tem cadastro no ViniCycle. Confirme a sua senha para continuar.
        </p>
        {existente.erroGeral && <Aviso tom="erro">{existente.erroGeral}</Aviso>}
        <Campo rotulo="Senha" id="senha" erro={existente.erro('senha')}>
          <Entrada
            id="senha"
            type="password"
            autoComplete="current-password"
            value={existente.valores.senha}
            onChange={(e) => existente.definir('senha', e.target.value)}
          />
        </Campo>
        <Botao type="submit" disabled={enviando}>
          {rotulo}
        </Botao>
      </form>
    )
  }

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault()
        const d = novo.validar()
        if (d) void enviar({ ficha: d.ficha, senha: d.senha, aceiteTermos: true }, novo)
      }}
    >
      {resumo}
      {novo.erroGeral && <Aviso tom="erro">{novo.erroGeral}</Aviso>}
      <h2 className="font-semibold">Seus dados</h2>
      <FichaCadastral form={novo} tiposPermitidos={['fisica']} simples />
      <h2 className="font-semibold">Senha</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          rotulo="Senha"
          id="senha"
          erro={novo.erro('senha')}
          ajuda={`Pelo menos ${SENHA_MINIMO} caracteres.`}
          obrigatorio
        >
          <Entrada
            id="senha"
            type="password"
            autoComplete="new-password"
            value={novo.valores.senha}
            onChange={(e) => novo.definir('senha', e.target.value)}
            onBlur={() => novo.tocar('senha')}
          />
        </Campo>
        <Campo rotulo="Repita a senha" id="confirmacao" erro={novo.erro('confirmacao')} obrigatorio>
          <Entrada
            id="confirmacao"
            type="password"
            autoComplete="new-password"
            value={novo.valores.confirmacao}
            onChange={(e) => novo.definir('confirmacao', e.target.value)}
            onBlur={() => novo.tocar('confirmacao')}
          />
        </Campo>
      </div>
      <h2 className="font-semibold">Termos</h2>
      {termos.map((t) => (
        <details key={t.id} className="rounded-md border p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            {t.tipo === 'termos_uso' ? 'Termos de uso' : 'Política de privacidade'} (versão{' '}
            {t.versao})
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{t.texto}</p>
        </details>
      ))}
      <div>
        <Caixa
          rotulo="Li e aceito os termos de uso e a política de privacidade."
          checked={!!novo.valores.aceiteTermos}
          onChange={(e) => novo.definir('aceiteTermos', e.target.checked)}
        />
        {novo.erro('aceiteTermos') && (
          <p className="mt-1 text-xs text-destructive">{novo.erro('aceiteTermos')}</p>
        )}
      </div>
      <Botao type="submit" disabled={enviando}>
        {enviando ? 'Enviando…' : rotulo}
      </Botao>
    </form>
  )
}
