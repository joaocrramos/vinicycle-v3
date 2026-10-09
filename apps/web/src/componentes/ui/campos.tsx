import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const base =
  'w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground disabled:opacity-60 aria-invalid:border-destructive';

export function Entrada({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(base, 'h-9', className)} {...props} />;
}

export function AreaTexto({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(base, 'min-h-20', className)} {...props} />;
}

export function Selecao({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(base, 'h-9 pr-8', className)} {...props} />;
}

export function Rotulo({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('text-sm font-medium', className)} {...props} />;
}

export function Caixa({
  className,
  rotulo,
  ...props
}: ComponentProps<'input'> & { rotulo: ReactNode }) {
  return (
    <label className={cn('inline-flex items-center gap-2 text-sm', className)}>
      <input type="checkbox" className="size-4 accent-[var(--primaria)]" {...props} />
      {rotulo}
    </label>
  );
}

/** Rótulo, campo, ajuda e erro (P2: o erro aparece ao sair do campo). */
export function Campo({
  rotulo,
  erro,
  ajuda,
  obrigatorio,
  children,
  className,
  id,
}: {
  rotulo: ReactNode;
  erro?: string;
  ajuda?: ReactNode;
  obrigatorio?: boolean;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Rotulo htmlFor={id}>
        {rotulo}
        {obrigatorio && <span className="text-destructive"> *</span>}
      </Rotulo>
      {children}
      {erro ? (
        <p role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      ) : ajuda ? (
        <p className="text-xs text-muted-foreground">{ajuda}</p>
      ) : null}
    </div>
  );
}
