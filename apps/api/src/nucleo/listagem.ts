// Listagens com ordenação, filtro e paginação no servidor (P4).
import {
  type ConsultaListagem,
  LIMITE_TUDO,
  type RespostaListagem,
  TAMANHO_TUDO,
} from '@vinicycle/shared';
import { type AnyColumn, asc, desc, or, type SQL, sql } from 'drizzle-orm';

/** Busca por texto sem diferenciar maiúsculas nem acentos. */
export function buscaTexto(
  busca: string | undefined,
  colunas: Array<AnyColumn | SQL>,
): SQL | undefined {
  const termo = busca?.trim();
  if (!termo) return undefined;
  const padrao = `%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return or(...colunas.map((c) => sql`unaccent(${c}::text) ilike unaccent(${padrao})`));
}

export async function listar<T>(opcoes: {
  consulta: ConsultaListagem;
  /** Colunas ordenáveis, pelo nome usado na interface. */
  ordenaveis: Record<string, AnyColumn | SQL>;
  /** Campo principal da tabela (P4: cada tabela abre ordenada por ele). */
  ordemPadrao: { campo: string; direcao: 'asc' | 'desc' };
  contar: () => Promise<number>;
  buscar: (o: { ordem: SQL[]; limite: number; deslocamento: number }) => Promise<T[]>;
}): Promise<RespostaListagem<T>> {
  const { consulta, ordenaveis, ordemPadrao } = opcoes;
  const campo = consulta.ordem && ordenaveis[consulta.ordem] ? consulta.ordem : ordemPadrao.campo;
  const direcao =
    consulta.ordem && ordenaveis[consulta.ordem]
      ? (consulta.direcao ?? 'asc')
      : ordemPadrao.direcao;
  const coluna = ordenaveis[campo]!;
  const ordem = [direcao === 'desc' ? desc(coluna) : asc(coluna)];
  const limite = consulta.tamanho === TAMANHO_TUDO ? LIMITE_TUDO : consulta.tamanho;
  const deslocamento =
    consulta.tamanho === TAMANHO_TUDO ? 0 : (consulta.pagina - 1) * consulta.tamanho;
  const [total, itens] = await Promise.all([
    opcoes.contar(),
    opcoes.buscar({ ordem, limite, deslocamento }),
  ]);
  return { itens, total, pagina: consulta.pagina, tamanho: consulta.tamanho };
}
