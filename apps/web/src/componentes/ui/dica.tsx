import { Tooltip } from 'radix-ui'
import type { ReactNode } from 'react'

/** Dica que aparece ao passar o mouse ou ao focar pelo teclado (botões só com ícone). */
export function Dica({ texto, children }: { texto: string; children: ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            sideOffset={4}
            className="z-50 rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md"
          >
            {texto}
            <Tooltip.Arrow className="fill-foreground" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
