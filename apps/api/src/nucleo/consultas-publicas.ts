// Busca de CEP e CNPJ em serviços públicos gratuitos (P2), com cadeia de reserva: se um provedor
// falha ou demora, tenta o próximo (decidido em 03/10/2026; 04-plano-de-entregas.md, ciclo 2).
// Os dados só pré-preenchem o formulário; quem confere é o usuário. Nada fica amarrado a um
// provedor (P29): incluir ou trocar é mexer só nesta lista.
import { cnpjValido, limparDocumento, type TipoPessoa, UFS } from '@vinicycle/shared';

export interface Endereco {
  cep: string;
  logradouro: string;
  bairro: string;
  municipio: string;
  uf: string;
  codigoIbge: string | null;
  complemento?: string;
  numero?: string;
}

export interface DadosCnpj {
  tipoPessoa: TipoPessoa;
  nome: string;
  nomeFantasia: string | null;
  situacaoCadastral: string | null;
  endereco: Endereco | null;
  email: string | null;
  telefone: string | null;
  fonte: string;
}

export interface ConsultasPublicas {
  cep(cep: string): Promise<(Endereco & { fonte: string }) | null>;
  cnpj(cnpj: string): Promise<DadosCnpj | null>;
}

type Buscar = (url: string) => Promise<unknown>;

const TEMPO_LIMITE_MS = 4000;

async function buscarJson(url: string): Promise<unknown> {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    headers: { accept: 'application/json', 'user-agent': 'ViniCycle/1.0' },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');

/** Tenta cada provedor na ordem; "não encontrado" (null) também passa para o próximo. */
async function emCadeia<T>(provedores: Array<() => Promise<T | null>>): Promise<T | null> {
  for (const p of provedores) {
    try {
      const r = await p();
      if (r) return r;
    } catch {
      // Provedor fora do ar ou lento: tenta o próximo.
    }
  }
  return null;
}

export function consultasPublicas(buscar: Buscar = buscarJson): ConsultasPublicas {
  const cache = new Map<string, { valor: unknown; ate: number }>();
  const municipiosPorUf = new Map<string, Array<{ nome: string; codigo_ibge: string }>>();

  async function memorizar<T>(chave: string, fn: () => Promise<T | null>): Promise<T | null> {
    const c = cache.get(chave);
    if (c && c.ate > Date.now()) return c.valor as T | null;
    const valor = await fn();
    if (valor) cache.set(chave, { valor, ate: Date.now() + 24 * 3600 * 1000 });
    return valor;
  }

  const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

  /** Código IBGE pelo nome do município, quando o provedor não o informa. */
  async function codigoIbge(uf: string, municipio: string): Promise<string | null> {
    if (!(UFS as readonly string[]).includes(uf)) return null;
    try {
      if (!municipiosPorUf.has(uf)) {
        const lista = (await buscar(
          `https://brasilapi.com.br/api/ibge/municipios/v1/${uf}`,
        )) as Array<{
          nome: string;
          codigo_ibge: string;
        }> | null;
        municipiosPorUf.set(uf, lista ?? []);
      }
      const alvo = semAcento(municipio);
      return municipiosPorUf.get(uf)!.find((m) => semAcento(m.nome) === alvo)?.codigo_ibge ?? null;
    } catch {
      return null;
    }
  }

  async function completar(e: Endereco): Promise<Endereco> {
    return e.codigoIbge ? e : { ...e, codigoIbge: await codigoIbge(e.uf, e.municipio) };
  }

  return {
    async cep(cepBruto) {
      const cep = cepBruto.replace(/\D/g, '');
      if (cep.length !== 8) return null;
      return memorizar(`cep:${cep}`, () =>
        emCadeia<Endereco & { fonte: string }>([
          async () => {
            const r = (await buscar(`https://viacep.com.br/ws/${cep}/json/`)) as Record<
              string,
              unknown
            > | null;
            if (!r || r.erro) return null;
            return {
              cep,
              logradouro: texto(r.logradouro),
              bairro: texto(r.bairro),
              municipio: texto(r.localidade),
              uf: texto(r.uf),
              codigoIbge: texto(r.ibge) || null,
              fonte: 'ViaCEP',
            };
          },
          async () => {
            const r = (await buscar(`https://brasilapi.com.br/api/cep/v2/${cep}`)) as Record<
              string,
              unknown
            > | null;
            if (!r) return null;
            const e = await completar({
              cep,
              logradouro: texto(r.street),
              bairro: texto(r.neighborhood),
              municipio: texto(r.city),
              uf: texto(r.state),
              codigoIbge: null,
            });
            return { ...e, fonte: 'BrasilAPI' };
          },
          async () => {
            const r = (await buscar(`https://opencep.com/v1/${cep}`)) as Record<
              string,
              unknown
            > | null;
            if (!r || r.error) return null;
            return {
              cep,
              logradouro: texto(r.logradouro),
              bairro: texto(r.bairro),
              municipio: texto(r.localidade),
              uf: texto(r.uf),
              codigoIbge: texto(r.ibge) || null,
              fonte: 'OpenCEP',
            };
          },
        ]),
      );
    },

    async cnpj(cnpjBruto) {
      const cnpj = limparDocumento(cnpjBruto);
      if (!cnpjValido(cnpj)) return null;
      return memorizar(`cnpj:${cnpj}`, () =>
        emCadeia<DadosCnpj>([
          async () => {
            const r = (await buscar(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)) as Record<
              string,
              unknown
            > | null;
            if (!r) return null;
            const uf = texto(r.uf);
            return {
              tipoPessoa: 'juridica',
              nome: texto(r.razao_social),
              nomeFantasia: texto(r.nome_fantasia) || null,
              situacaoCadastral: texto(r.descricao_situacao_cadastral) || null,
              endereco: texto(r.cep)
                ? await completar({
                    cep: texto(r.cep).replace(/\D/g, ''),
                    logradouro: [texto(r.descricao_tipo_de_logradouro), texto(r.logradouro)]
                      .filter(Boolean)
                      .join(' '),
                    numero: texto(r.numero),
                    complemento: texto(r.complemento),
                    bairro: texto(r.bairro),
                    municipio: texto(r.municipio),
                    uf,
                    codigoIbge: r.codigo_municipio_ibge ? String(r.codigo_municipio_ibge) : null,
                  })
                : null,
              email: texto(r.email).toLowerCase() || null,
              telefone: texto(r.ddd_telefone_1).replace(/\D/g, '') || null,
              fonte: 'BrasilAPI (Receita Federal)',
            };
          },
          async () => {
            const r = (await buscar(`https://publica.cnpj.ws/cnpj/${cnpj}`)) as Record<
              string,
              unknown
            > | null;
            if (!r) return null;
            const e = (r.estabelecimento ?? {}) as Record<string, unknown>;
            const cidade = (e.cidade ?? {}) as Record<string, unknown>;
            const estado = (e.estado ?? {}) as Record<string, unknown>;
            return {
              tipoPessoa: 'juridica',
              nome: texto(r.razao_social),
              nomeFantasia: texto(e.nome_fantasia) || null,
              situacaoCadastral: texto(e.situacao_cadastral) || null,
              endereco: texto(e.cep)
                ? await completar({
                    cep: texto(e.cep).replace(/\D/g, ''),
                    logradouro: [texto(e.tipo_logradouro), texto(e.logradouro)]
                      .filter(Boolean)
                      .join(' '),
                    numero: texto(e.numero),
                    complemento: texto(e.complemento),
                    bairro: texto(e.bairro),
                    municipio: texto(cidade.nome),
                    uf: texto(estado.sigla),
                    codigoIbge: cidade.ibge_id ? String(cidade.ibge_id) : null,
                  })
                : null,
              email: texto(e.email).toLowerCase() || null,
              telefone: [texto(e.ddd1), texto(e.telefone1)].join('').replace(/\D/g, '') || null,
              fonte: 'CNPJ.ws (Receita Federal)',
            };
          },
        ]),
      );
    },
  };
}
