// Catálogos fixos usados nos formulários (unidades, classes, IGs, papéis e listas simples).
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useSessao } from './sessao';

export interface Referencia {
  unidades: Array<{ simbolo: string; nome: string; grandeza: string; casas: number }>;
  classesProduto: Array<{
    id: string;
    codigo: string;
    nome: string;
    categoria: string;
    exigeMetodoEspumante: boolean;
    fonte: string;
  }>;
  igs: Array<{ id: string; codigo: string; nome: string; tipo: string; municipiosIbge: string[] }>;
  papeis: Array<{ codigo: string; nome: string }>;
  listas: Record<string, Array<{ codigo: string; nome: string }>>;
}

export function useReferencia() {
  const { data: s } = useSessao();
  const plataforma = s?.contexto === 'plataforma';
  return useQuery({
    queryKey: ['referencia', plataforma],
    queryFn: () =>
      api.get<Referencia>(plataforma ? '/api/plataforma/referencia' : '/api/referencia'),
    staleTime: 5 * 60_000,
  });
}

/** Nome de um item de lista pelo código (ex.: cor do vinho). */
export function nomeNaLista(
  ref: Referencia | undefined,
  lista: string,
  codigo: string | null | undefined,
): string {
  if (!codigo) return '';
  return ref?.listas[lista]?.find((o) => o.codigo === codigo)?.nome ?? codigo;
}
