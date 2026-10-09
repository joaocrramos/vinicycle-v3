// Estado de formulário com as mesmas regras (zod) da API. O erro de cada campo aparece depois
// que o usuário sai dele, ou ao tentar salvar (P2).
import { useCallback, useState } from 'react';
import type { z } from 'zod';
import { ErroApi } from './api';

type Caminho = string;

function ler(obj: unknown, caminho: Caminho): unknown {
  return caminho
    .split('.')
    .reduce<unknown>(
      (o, k) => (o === null || o === undefined ? undefined : (o as Record<string, unknown>)[k]),
      obj,
    );
}

function gravar<T>(obj: T, caminho: Caminho, valor: unknown): T {
  const [k, ...resto] = caminho.split('.');
  const chave = k!;
  const atual = obj as unknown as Record<string, unknown> | unknown[];
  const copia = (Array.isArray(atual) ? [...atual] : { ...atual }) as Record<string, unknown>;
  copia[chave] = resto.length
    ? gravar(copia[chave] ?? (/^\d+$/.test(resto[0]!) ? [] : {}), resto.join('.'), valor)
    : valor;
  return copia as T;
}

/**
 * O rascunho (`inicial`) pode estar incompleto ou fora do formato: quem decide se vale é o esquema,
 * na validação.
 */
export function useFormulario<S extends z.ZodType, V = z.input<S>>(esquema: S, inicial: V) {
  const [valores, setValores] = useState<V>(inicial);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [tocados, setTocados] = useState<Set<string>>(new Set());
  const [enviado, setEnviado] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  const calcularErros = useCallback(
    (v: unknown) => {
      const r = esquema.safeParse(v);
      const mapa: Record<string, string> = {};
      if (!r.success) for (const i of r.error.issues) mapa[i.path.join('.')] ??= i.message;
      return mapa;
    },
    [esquema],
  );

  const definir = useCallback(
    (caminho: Caminho, valor: unknown) => {
      setValores((v) => {
        const novo = gravar(v, caminho, valor);
        if (tocados.size || enviado) setErros(calcularErros(novo));
        return novo;
      });
    },
    [calcularErros, tocados, enviado],
  );

  const tocar = useCallback(
    (caminho: Caminho) => {
      setTocados((t) => new Set(t).add(caminho));
      setErros(calcularErros(valores));
    },
    [calcularErros, valores],
  );

  /** Valida tudo; devolve os dados já convertidos pelo esquema, ou null. */
  const validar = useCallback((): z.output<S> | null => {
    setEnviado(true);
    setErroGeral(null);
    const r = esquema.safeParse(valores);
    if (r.success) {
      setErros({});
      return r.data;
    }
    setErros(calcularErros(valores));
    setErroGeral('Confira os campos destacados.');
    return null;
  }, [esquema, valores, calcularErros]);

  /** Mostra o erro da API: nos campos, quando vier por campo; senão, no topo. */
  const erroDaApi = useCallback((e: unknown) => {
    if (e instanceof ErroApi) {
      if (e.campos.length) {
        setEnviado(true);
        setErros(Object.fromEntries(e.campos.map((c) => [c.caminho, c.mensagem])));
      }
      setErroGeral(e.message);
    } else {
      setErroGeral(e instanceof Error ? e.message : 'Não foi possível concluir. Tente de novo.');
    }
  }, []);

  return {
    valores,
    setValores,
    valor: (c: Caminho) => ler(valores, c),
    definir,
    tocar,
    erro: (c: Caminho) => (enviado || tocados.has(c) ? erros[c] : undefined),
    validar,
    erroGeral,
    erroDaApi,
  };
}

/** O que os blocos de formulário reutilizáveis (ex.: ficha P2) precisam. */
export interface Formulario {
  valor(c: string): unknown;
  definir(c: string, v: unknown): void;
  tocar(c: string): void;
  erro(c: string): string | undefined;
}
