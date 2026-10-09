import { DropdownMenu } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const Menu = DropdownMenu.Root;
export const GatilhoMenu = DropdownMenu.Trigger;

export function ConteudoMenu({ className, ...props }: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        sideOffset={6}
        align="end"
        className={cn(
          'z-50 min-w-56 rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
          className,
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  );
}

export function ItemMenu({
  className,
  icone,
  ...props
}: ComponentProps<typeof DropdownMenu.Item> & { icone?: ReactNode }) {
  return (
    <DropdownMenu.Item
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[highlighted]:bg-muted [&_svg]:size-4',
        className,
      )}
      {...props}
    >
      {icone}
      {props.children}
    </DropdownMenu.Item>
  );
}

export function SeparadorMenu() {
  return <DropdownMenu.Separator className="my-1 h-px bg-border" />;
}

export function RotuloMenu({ className, ...props }: ComponentProps<typeof DropdownMenu.Label>) {
  return (
    <DropdownMenu.Label
      className={cn('px-2 py-1.5 text-xs text-muted-foreground', className)}
      {...props}
    />
  );
}
