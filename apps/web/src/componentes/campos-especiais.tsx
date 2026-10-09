// Campos com máscara e formatação (P2, P3).
import {
  digitosParaDecimal,
  formatarDecimal,
  formatarTelefone,
  mascararDocumento,
  normalizarTelefone,
} from '@vinicycle/shared'
import type { ComponentProps } from 'react'
import { Entrada } from './ui/campos'

type Base = Omit<ComponentProps<'input'>, 'value' | 'onChange'>

export function CampoDocumento({
  tipo,
  valor,
  aoMudar,
  ...props
}: Base & {
  tipo: 'cpf' | 'cnpj'
  valor: string | null | undefined
  aoMudar: (v: string) => void
}) {
  return (
    <Entrada
      inputMode={tipo === 'cpf' ? 'numeric' : 'text'}
      autoCapitalize="characters"
      placeholder={tipo === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00'}
      value={mascararDocumento(tipo, valor ?? '')}
      onChange={(e) => aoMudar(e.target.value.replace(/[^0-9a-zA-Z]/g, '').toUpperCase())}
      {...props}
    />
  )
}

/** Máscara +55 (00) 00000-0000; grava em formato internacional (E.164). */
export function CampoTelefone({
  valor,
  aoMudar,
  ...props
}: Base & { valor: string; aoMudar: (v: string) => void }) {
  const exibido = valor.startsWith('+55') && valor.length >= 12 ? formatarTelefone(valor) : valor
  return (
    <Entrada
      inputMode="tel"
      placeholder="+55 (00) 00000-0000"
      value={exibido}
      onChange={(e) => {
        const d = e.target.value.replace(/\D/g, '')
        const nacional = d.startsWith('55') ? d.slice(2) : d
        aoMudar(nacional.length >= 10 ? normalizarTelefone(nacional) : e.target.value)
      }}
      {...props}
    />
  )
}

export function CampoCep({
  valor,
  aoMudar,
  ...props
}: Base & { valor: string; aoMudar: (v: string) => void }) {
  const d = valor.replace(/\D/g, '').slice(0, 8)
  return (
    <Entrada
      inputMode="numeric"
      placeholder="00000-000"
      value={d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d}
      onChange={(e) => aoMudar(e.target.value.replace(/\D/g, '').slice(0, 8))}
      {...props}
    />
  )
}

/**
 * Número preenchido da direita para a esquerda (P3): com 2 casas, digitar 123456 mostra 1.234,56.
 * O valor trafega como texto decimal ("1234.56"), nunca como ponto flutuante.
 */
export function CampoNumero({
  valor,
  aoMudar,
  casas,
  unidade,
  permitirNegativo,
  ...props
}: Base & {
  valor: string | null | undefined
  aoMudar: (v: string | null) => void
  casas: number
  unidade?: string
  permitirNegativo?: boolean
}) {
  return (
    <div className="relative">
      <Entrada
        inputMode="numeric"
        className={unidade ? 'pr-12 text-right' : 'text-right'}
        placeholder={formatarDecimal('0', casas)}
        value={valor ? formatarDecimal(valor, casas) : ''}
        onChange={(e) => aoMudar(digitosParaDecimal(e.target.value, casas, permitirNegativo))}
        {...props}
      />
      {unidade && (
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
          {unidade}
        </span>
      )}
    </div>
  )
}
