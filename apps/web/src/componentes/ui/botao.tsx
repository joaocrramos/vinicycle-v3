import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const variantesBotao = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer',
  {
    variants: {
      variante: {
        primario: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secundario: 'border bg-card hover:bg-muted',
        fantasma: 'hover:bg-muted',
        perigo: 'bg-destructive text-white hover:bg-destructive/90',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      tamanho: {
        normal: 'h-9 px-4 py-2',
        pequeno: 'h-8 px-3 text-xs',
        icone: 'size-9',
      },
    },
    defaultVariants: { variante: 'primario', tamanho: 'normal' },
  },
)

export function Botao({
  className,
  variante,
  tamanho,
  comoFilho,
  type = 'button',
  ...props
}: ComponentProps<'button'> & VariantProps<typeof variantesBotao> & { comoFilho?: boolean }) {
  const C = comoFilho ? Slot.Root : 'button'
  return (
    <C
      type={comoFilho ? undefined : type}
      className={cn(variantesBotao({ variante, tamanho }), className)}
      {...props}
    />
  )
}
