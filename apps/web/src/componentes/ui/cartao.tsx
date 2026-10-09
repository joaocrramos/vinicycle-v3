import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Cartao({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn('rounded-lg border bg-card text-card-foreground shadow-xs', className)}
      {...props}
    />
  );
}

export function CabecalhoCartao({
  titulo,
  descricao,
  acoes,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
      <div>
        <h2 className="font-semibold">{titulo}</h2>
        {descricao && <p className="mt-0.5 text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {acoes && <div className="flex gap-2">{acoes}</div>}
    </div>
  );
}

export function CorpoCartao({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('p-5', className)} {...props} />;
}

export function Etiqueta({
  tom = 'neutro',
  className,
  ...props
}: ComponentProps<'span'> & { tom?: 'neutro' | 'sucesso' | 'alerta' | 'erro' | 'primario' }) {
  const tons = {
    neutro: 'bg-muted text-muted-foreground',
    sucesso: 'bg-success-muted text-success',
    alerta: 'bg-warning-muted text-warning',
    erro: 'bg-destructive-muted text-destructive',
    primario: 'bg-accent text-accent-foreground',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tons[tom],
        className,
      )}
      {...props}
    />
  );
}

export function Aviso({
  tom = 'alerta',
  className,
  ...props
}: ComponentProps<'div'> & { tom?: 'alerta' | 'erro' | 'sucesso' | 'info' }) {
  const tons = {
    alerta: 'border-warning/40 bg-warning-muted text-foreground',
    erro: 'border-destructive/40 bg-destructive-muted text-foreground',
    sucesso: 'border-success/40 bg-success-muted text-foreground',
    info: 'border-primary/30 bg-accent text-accent-foreground',
  };
  return (
    <div
      role={tom === 'erro' ? 'alert' : 'status'}
      className={cn('rounded-md border px-4 py-3 text-sm', tons[tom], className)}
      {...props}
    />
  );
}
