import { useState } from 'react'
import { Botao } from './ui/botao'
import { AreaTexto, Campo } from './ui/campos'
import { Dialogo } from './ui/dialogo'

/** Inativar, cancelar e remover pedem motivo, que fica na auditoria (P14, P26). */
export function PedirMotivo({
  aberto,
  aoMudar,
  titulo,
  descricao,
  rotuloBotao = 'Confirmar',
  aoConfirmar,
}: {
  aberto: boolean
  aoMudar: (v: boolean) => void
  titulo: string
  descricao?: string
  rotuloBotao?: string
  aoConfirmar: (motivo: string) => Promise<unknown>
}) {
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  return (
    <Dialogo
      aberto={aberto}
      aoMudar={(v) => {
        aoMudar(v)
        if (!v) {
          setMotivo('')
          setErro(null)
        }
      }}
      titulo={titulo}
      descricao={descricao}
      rodape={
        <>
          <Botao variante="secundario" onClick={() => aoMudar(false)}>
            Cancelar
          </Botao>
          <Botao
            variante="perigo"
            disabled={enviando}
            onClick={async () => {
              if (motivo.trim().length < 3) return setErro('Informe o motivo.')
              setEnviando(true)
              try {
                await aoConfirmar(motivo.trim())
                setMotivo('')
                aoMudar(false)
              } catch (e) {
                setErro((e as Error).message)
              } finally {
                setEnviando(false)
              }
            }}
          >
            {rotuloBotao}
          </Botao>
        </>
      }
    >
      <Campo rotulo="Motivo" erro={erro ?? undefined} obrigatorio id="motivo">
        <AreaTexto
          id="motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          autoFocus
        />
      </Campo>
    </Dialogo>
  )
}
