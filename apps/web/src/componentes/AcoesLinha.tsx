// Ações por ícone, com a dica ao passar o mouse: a coluna "Ações" dos cadastros e os botões de
// inativar e reativar das fichas. Inativar não apaga: o registro fica guardado e pode ser
// reativado (P26).
import { Ban, Pencil, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Coluna } from './TabelaDados';
import { Botao } from './ui/botao';
import { Dica } from './ui/dica';

/** Botão só com ícone; o nome da ação aparece na dica e vai para o leitor de tela. */
export function BotaoIcone({
  rotulo,
  aoClicar,
  contorno = false,
  desativado = false,
  children,
}: {
  rotulo: string;
  aoClicar: () => void | Promise<void>;
  /** Com borda, ao lado dos botões de texto das fichas. */
  contorno?: boolean;
  desativado?: boolean;
  children: ReactNode;
}) {
  return (
    <Dica texto={rotulo}>
      <Botao
        variante={contorno ? 'secundario' : 'fantasma'}
        tamanho="icone"
        className={contorno ? undefined : 'size-8'}
        aria-label={rotulo}
        disabled={desativado}
        onClick={() => void aoClicar()}
      >
        {children}
      </Botao>
    </Dica>
  );
}

export function AcoesLinha({
  ativo = true,
  aoEditar,
  rotuloEditar = 'Editar',
  aoInativar,
  aoReativar,
  contorno = false,
  children,
}: {
  ativo?: boolean;
  /** Sem ele, o lápis não aparece (ex.: item global, sem permissão). */
  aoEditar?: () => void;
  rotuloEditar?: string;
  /** Sem eles, o ícone de inativar ou reativar não aparece (ex.: sem permissão). */
  aoInativar?: () => void | Promise<void>;
  aoReativar?: () => void | Promise<void>;
  /** Botões com borda (nas fichas). */
  contorno?: boolean;
  /** Ações próprias da tela, antes das comuns. */
  children?: ReactNode;
}) {
  return (
    // A linha inteira abre a ficha; o clique nos ícones não deve chegar a ela.
    <div
      className={`flex items-center justify-end ${contorno ? 'gap-2' : 'gap-0.5'}`}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
      {aoEditar && (
        <BotaoIcone rotulo={rotuloEditar} aoClicar={aoEditar} contorno={contorno}>
          <Pencil />
        </BotaoIcone>
      )}
      {ativo && aoInativar && (
        <BotaoIcone rotulo="Inativar" aoClicar={aoInativar} contorno={contorno}>
          <Ban className="text-destructive" />
        </BotaoIcone>
      )}
      {!ativo && aoReativar && (
        <BotaoIcone rotulo="Reativar" aoClicar={aoReativar} contorno={contorno}>
          <RotateCcw />
        </BotaoIcone>
      )}
    </div>
  );
}

/** Coluna pronta, sempre a última da tabela. */
export function colunaAcoes<T>(celula: (item: T) => ReactNode): Coluna<T> {
  return { id: 'acoes', titulo: 'Ações', className: 'w-px whitespace-nowrap text-right', celula };
}
