import { X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Dialogo({
  aberto,
  aoMudar,
  titulo,
  descricao,
  children,
  rodape,
  largo,
}: {
  aberto: boolean
  aoMudar: (v: boolean) => void
  titulo: ReactNode
  descricao?: ReactNode
  children?: ReactNode
  rodape?: ReactNode
  largo?: boolean
}) {
  return (
    <Dialog.Root open={aberto} onOpenChange={aoMudar}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-card shadow-lg',
            largo ? 'max-w-3xl' : 'max-w-lg',
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
            <div>
              <Dialog.Title className="font-semibold">{titulo}</Dialog.Title>
              {descricao ? (
                <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                  {descricao}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{titulo}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="rounded p-1 hover:bg-muted" aria-label="Fechar">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          {children && <div className="overflow-y-auto px-5 py-4">{children}</div>}
          {rodape && <div className="flex justify-end gap-2 border-t px-5 py-3">{rodape}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
