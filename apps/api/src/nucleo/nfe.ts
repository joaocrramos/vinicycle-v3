// Leitura do XML da NF-e (modelo 55, leiaute 4.00; P11). Só lê o que o sistema usa: identificação,
// emitente, destinatário e itens. Não calcula imposto (FISCAL.md). Aceita o XML da nota sozinha
// (<NFe>) ou com o protocolo de autorização (<nfeProc>).
import { XMLParser } from 'fast-xml-parser';
import { ErroRegra } from './erros';

export interface EnderecoNfe {
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  municipio: string;
  codigoIbge: string | null;
  uf: string;
  cep: string;
}

export interface NfeLida {
  chave: string;
  numero: string;
  serie: string | null;
  emissao: string;
  /** 0 = entrada, 1 = saída, do ponto de vista do emitente. */
  tipoNf: '0' | '1';
  emitente: {
    documento: string;
    tipoPessoa: 'fisica' | 'juridica';
    nome: string;
    nomeFantasia: string | null;
    inscricaoEstadual: string | null;
    endereco: EnderecoNfe | null;
  };
  destinatario: { documento: string | null; nome: string | null };
  itens: Array<{
    numero: number;
    codigo: string;
    descricao: string;
    quantidade: string;
    unidade: string;
    valor: string | null;
    /** Grupo de rastreabilidade (rastro): o primeiro lote do item, quando houver. */
    lote: string | null;
    fabricacao: string | null;
    validade: string | null;
    /** Outros lotes do mesmo item na nota, para conferência. */
    outrosLotes: string[];
  }>;
}

const leitor = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
  // Tudo como texto: a chave e os códigos perderiam zeros como número.
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (nome) => nome === 'det' || nome === 'rastro',
});

type No = Record<string, unknown>;
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function endereco(e: No | undefined): EnderecoNfe | null {
  if (!e) return null;
  const r = {
    logradouro: texto(e.xLgr) ?? '',
    numero: texto(e.nro) ?? 'S/N',
    complemento: texto(e.xCpl),
    bairro: texto(e.xBairro) ?? '',
    municipio: texto(e.xMun) ?? '',
    codigoIbge: texto(e.cMun),
    uf: texto(e.UF) ?? '',
    cep: texto(e.CEP) ?? '',
  };
  return r.logradouro && r.municipio && r.uf ? r : null;
}

export function lerNfe(xml: string): NfeLida {
  let raiz: No;
  try {
    raiz = leitor.parse(xml) as No;
  } catch {
    throw new ErroRegra('O arquivo não é um XML válido.', 'xml_invalido');
  }
  const nfe = ((raiz.nfeProc as No | undefined)?.NFe ?? raiz.NFe) as No | undefined;
  const inf = nfe?.infNFe as No | undefined;
  if (!inf) throw new ErroRegra('O XML não é de uma NF-e (modelo 55).', 'xml_nao_nfe');
  const chave = String(inf['@Id'] ?? '').replace(/^NFe/, '');
  if (!/^\d{44}$/.test(chave)) throw new ErroRegra('Chave de acesso inválida no XML.', 'xml_chave');
  const ide = inf.ide as No;
  const emit = inf.emit as No;
  const dest = (inf.dest ?? {}) as No;
  const documentoEmit = texto(emit.CNPJ) ?? texto(emit.CPF);
  if (!documentoEmit)
    throw new ErroRegra('O XML não traz o documento do emitente.', 'xml_emitente');
  const emissao =
    texto(ide.dhEmi) ?? (texto(ide.dEmi) ? `${texto(ide.dEmi)}T00:00:00-03:00` : null);
  if (!emissao) throw new ErroRegra('O XML não traz a data de emissão.', 'xml_emissao');
  const det = (inf.det ?? []) as No[];
  return {
    chave,
    numero: texto(ide.nNF) ?? '',
    serie: texto(ide.serie),
    emissao,
    tipoNf: texto(ide.tpNF) === '0' ? '0' : '1',
    emitente: {
      documento: documentoEmit,
      tipoPessoa: texto(emit.CNPJ) ? 'juridica' : 'fisica',
      nome: texto(emit.xNome) ?? documentoEmit,
      nomeFantasia: texto(emit.xFant),
      inscricaoEstadual: texto(emit.IE),
      endereco: endereco(emit.enderEmit as No | undefined),
    },
    destinatario: { documento: texto(dest.CNPJ) ?? texto(dest.CPF), nome: texto(dest.xNome) },
    itens: det.map((d) => {
      const prod = d.prod as No;
      const rastro = (prod.rastro ?? []) as No[];
      const data = (v: unknown) => {
        const t = texto(v);
        return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
      };
      return {
        numero: Number(d['@nItem'] ?? 0),
        codigo: texto(prod.cProd) ?? '',
        descricao: texto(prod.xProd) ?? '',
        quantidade: texto(prod.qCom) ?? '0',
        unidade: texto(prod.uCom) ?? '',
        valor: texto(prod.vProd),
        lote: texto(rastro[0]?.nLote),
        fabricacao: data(rastro[0]?.dFab),
        validade: data(rastro[0]?.dVal),
        outrosLotes: rastro.slice(1).flatMap((r) => texto(r.nLote) ?? []),
      };
    }),
  };
}

/** Quilos de um item de uva, pela unidade comercial da nota; sem unidade de massa, nada. */
export function quilosDoItem(quantidade: string, unidade: string): number | null {
  const u = unidade.trim().toUpperCase().replace(/\./g, '');
  const q = Number(quantidade);
  if (!Number.isFinite(q) || q <= 0) return null;
  if (['KG', 'KGS', 'QUILO', 'QUILOS', 'KILO', 'KILOS'].includes(u)) return q;
  if (['T', 'TON', 'TONELADA', 'TONELADAS'].includes(u)) return q * 1000;
  if (['G', 'GR', 'GRAMA', 'GRAMAS'].includes(u)) return q / 1000;
  return null;
}
