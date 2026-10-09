// Vinificação para terceiros e "vinho cigano" (cantina.md, Vinificação para terceiros e em
// terceiros; 03-modelo-de-dados.md, 2.5, Terceirização; 04, roteiro do ciclo 10). O contrato segue a
// IN MAPA 72/2018 (arts. 14, 25, 27, 28 e 30); o tratamento fiscal fica para a fase fiscal
// (FISCAL.md). Fontes conferidas em pesquisa/2026-10-elaboracao-por-terceiros.md.
import { z } from 'zod';
import { formatarDocumento } from './documentos';

const chaves = <T extends Record<string, string>>(o: T) =>
  Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

/** Quem presta o serviço: a própria empresa (vinificação para terceiro) ou a contraparte. */
export const SENTIDOS_CONTRATO = {
  prestamos: 'Prestamos o serviço (vinificação para terceiro)',
  contratamos: 'Contratamos o serviço (produção em terceiro)',
} as const;
export type SentidoContrato = keyof typeof SENTIDOS_CONTRATO;
export const CHAVES_SENTIDO_CONTRATO = chaves(SENTIDOS_CONTRATO);

/** Atividades contratadas (IN MAPA 72/2018, art. 25, §§4º e 6º). */
export const ATIVIDADES_CONTRATO = {
  elaboracao: 'Elaboração',
  padronizacao: 'Padronização',
  envase: 'Envase',
  guarda: 'Guarda',
} as const;
export type AtividadeContrato = keyof typeof ATIVIDADES_CONTRATO;
export const CHAVES_ATIVIDADE_CONTRATO = chaves(ATIVIDADES_CONTRATO);

/**
 * Quem tem o registro do produto: o contratante ("unidade central", IN 72, arts. 14 e 30) ou a
 * cantina que produz, com a marca do cliente (cantina.md, Quem registra o produto).
 */
export const REGISTROS_PRODUTO = {
  contratante: 'O contratante (unidade central)',
  cantina: 'A cantina que produz, com a marca do cliente',
} as const;
export type RegistroProduto = keyof typeof REGISTROS_PRODUTO;
export const CHAVES_REGISTRO_PRODUTO = chaves(REGISTROS_PRODUTO);

/** Formas do texto do rótulo; o texto montado é editável no contrato. */
export const FORMAS_TEXTO_ROTULO = {
  produzido_para: '"Produzido por [cantina] para [cliente]"',
  responsabilidade_produzido:
    '"Produzido e envasilhado sob responsabilidade de" + unidade central (IN 72, art. 28)',
  responsabilidade_padronizado:
    '"Padronizado e envasilhado sob responsabilidade de" + unidade central (IN 72, art. 28)',
  cantina_produtora: 'A cantina como produtora e o cliente como dono da marca',
} as const;
export type FormaTextoRotulo = keyof typeof FORMAS_TEXTO_ROTULO;
export const CHAVES_FORMA_TEXTO_ROTULO = chaves(FORMAS_TEXTO_ROTULO);

/** Perda tolerada no contrato: percentual do volume ou rendimento mínimo (L/kg). */
export const TIPOS_PERDA_TOLERADA = {
  percentual: '% do volume',
  rendimento_minimo: 'rendimento mínimo (L/kg)',
} as const;
export const CHAVES_TIPO_PERDA_TOLERADA = chaves(TIPOS_PERDA_TOLERADA);

/** Pagamento em produto: percentual do vinho pronto, litros ou garrafas. */
export const UNIDADES_PAGAMENTO_PRODUTO = {
  percentual: '% do vinho pronto',
  litro: 'litros',
  garrafa: 'garrafas',
} as const;
export const CHAVES_UNIDADE_PAGAMENTO_PRODUTO = chaves(UNIDADES_PAGAMENTO_PRODUTO);

/** Motivo da transferência de titularidade (cantina.md, Mistura entre titulares; Pagamento em produto). */
export const MOTIVOS_TITULARIDADE = {
  compra_venda: 'Compra ou venda do vinho',
  pagamento_servico: 'Pagamento do serviço em produto',
  outro: 'Outro',
} as const;
export type MotivoTitularidade = keyof typeof MOTIVOS_TITULARIDADE;
export const CHAVES_MOTIVO_TITULARIDADE = chaves(MOTIVOS_TITULARIDADE);

/** Forma da transferência: vinho no recipiente ou garrafas (e outros itens) no estoque. */
export const FORMAS_TITULARIDADE = ['granel', 'estoque'] as const;

const textoOpc = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);
const decimal = (casas: number, mensagem: string) =>
  z.string().regex(new RegExp(`^\\d+(\\.\\d{1,${casas}})?$`), mensagem);
const decimalOpc = (casas: number, mensagem: string) =>
  decimal(casas, mensagem)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null))
    .transform((v) => v ?? null);
const opcional = <T extends [string, ...string[]]>(valores: T) =>
  z
    .enum(valores)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null))
    .transform((v) => v ?? null);
const dataOpc = z.iso
  .date()
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null))
  .transform((v) => v ?? null);

/** Item de preço, só registrado (cobrança fica para a parte comercial e a fiscal). */
export const precoContrato = z.object({
  descricao: z.string().trim().min(1, 'Descreva o item').max(120),
  valor: decimal(2, 'Valor inválido'),
  /** Livre: por litro, por garrafa, por mês, total… */
  unidade: z.string().trim().min(1, 'Informe a unidade').max(40),
});

export const dadosContrato = z
  .object({
    sentido: z.enum(CHAVES_SENTIDO_CONTRATO, 'Escolha o sentido'),
    numero: textoOpc(60),
    atividades: z
      .array(z.enum(CHAVES_ATIVIDADE_CONTRATO))
      .min(1, 'Escolha ao menos uma atividade')
      .max(4),
    contraparteId: z.uuid('Escolha a contraparte'),
    /** Estabelecimento da empresa no contrato (quem produz ou quem recebe o vinho). */
    estabelecimentoId: z.uuid('Escolha o estabelecimento'),
    registroMapaContraparte: textoOpc(60),
    registroMapaContraparteValidade: dataOpc,
    registroProduto: z.enum(CHAVES_REGISTRO_PRODUTO, 'Escolha quem tem o registro do produto'),
    vigenciaInicio: z.iso.date('Informe o início da vigência'),
    vigenciaFim: dataOpc,
    precos: z.array(precoContrato).max(30).default([]),
    insumosCantina: textoOpc(2000),
    insumosCliente: textoOpc(2000),
    perdaToleradaTipo: opcional(CHAVES_TIPO_PERDA_TOLERADA),
    perdaToleradaValor: decimalOpc(4, 'Valor inválido'),
    pagamentoDinheiro: z.boolean().default(true),
    pagamentoProdutoValor: decimalOpc(4, 'Valor inválido'),
    pagamentoProdutoUnidade: opcional(CHAVES_UNIDADE_PAGAMENTO_PRODUTO),
    /** Identifica quem elaborou no código do lote comercial (IN 72, art. 28, §2º). */
    prefixoLote: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{1,6}$/, 'Até 6 letras ou números')
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null))
      .transform((v) => v ?? null),
    formaTexto: z.enum(CHAVES_FORMA_TEXTO_ROTULO).default('produzido_para'),
    /** Texto do rótulo editado; vazio = o montado pelo sistema. */
    textoRotulo: textoOpc(500),
    comunicadoSipeagroEm: dataOpc,
    protocoloSipeagro: textoOpc(60),
    documentoId: z
      .uuid()
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
    marcas: z.array(z.uuid()).max(100).default([]),
    produtos: z.array(z.uuid()).max(500).default([]),
    observacoes: textoOpc(4000),
    versao: z.number().int().optional(),
  })
  .superRefine((d, c) => {
    const erro = (campo: string, message: string) =>
      c.addIssue({ code: 'custom', path: [campo], message });
    if (d.vigenciaFim && d.vigenciaFim < d.vigenciaInicio)
      erro('vigenciaFim', 'O fim da vigência é anterior ao início');
    if ((d.perdaToleradaTipo === null) !== (d.perdaToleradaValor === null))
      erro(
        d.perdaToleradaTipo === null ? 'perdaToleradaTipo' : 'perdaToleradaValor',
        'Informe o tipo e o valor da perda tolerada',
      );
    if (d.perdaToleradaTipo === 'percentual' && Number(d.perdaToleradaValor) > 100)
      erro('perdaToleradaValor', 'O percentual vai até 100');
    if ((d.pagamentoProdutoValor === null) !== (d.pagamentoProdutoUnidade === null))
      erro(
        d.pagamentoProdutoValor === null ? 'pagamentoProdutoValor' : 'pagamentoProdutoUnidade',
        'Informe quanto e em que unidade',
      );
    if (d.pagamentoProdutoUnidade === 'percentual' && Number(d.pagamentoProdutoValor) > 100)
      erro('pagamentoProdutoValor', 'O percentual vai até 100');
    if (!d.pagamentoDinheiro && !d.pagamentoProdutoUnidade)
      erro('pagamentoDinheiro', 'Escolha ao menos uma forma de pagamento');
    if (!d.comunicadoSipeagroEm && d.protocoloSipeagro)
      erro('comunicadoSipeagroEm', 'Informe a data da comunicação');
  });
export type DadosContrato = z.infer<typeof dadosContrato>;

export interface ParteRotulo {
  nome: string;
  tipoDocumento: 'cpf' | 'cnpj' | 'outro' | null;
  documento: string | null;
  /** Endereço em uma linha, para as formas "sob responsabilidade de". */
  endereco?: string | null;
}

function comDocumento(p: ParteRotulo): string {
  if (!p.documento) return p.nome;
  const rotulo = p.tipoDocumento === 'cpf' ? 'CPF' : p.tipoDocumento === 'cnpj' ? 'CNPJ' : 'doc.';
  const valor =
    p.tipoDocumento === 'cpf' || p.tipoDocumento === 'cnpj'
      ? formatarDocumento(p.tipoDocumento, p.documento)
      : p.documento;
  return `${p.nome}, ${rotulo} ${valor}`;
}

const comEndereco = (p: ParteRotulo) => (p.endereco ? `${p.nome}, ${p.endereco}` : p.nome);

/**
 * Texto do rótulo na elaboração por terceiro, montado a partir do contrato (cantina.md, Rótulo;
 * IN MAPA 72/2018, art. 28). A cantina é quem produz; a unidade central é quem tem o registro do
 * produto (o contratante, ou a própria cantina quando o registro é dela). O texto é editável no
 * contrato, porque a base das expressões é um decreto revogado (Decreto 8.198/2014).
 */
export function textoRotuloTerceirizacao(
  forma: FormaTextoRotulo,
  partes: { cantina: ParteRotulo; cliente: ParteRotulo; unidadeCentral: ParteRotulo },
): string {
  const { cantina, cliente, unidadeCentral } = partes;
  switch (forma) {
    case 'produzido_para':
      return `Produzido por ${comDocumento(cantina)}, para ${comDocumento(cliente)}`;
    case 'responsabilidade_produzido':
      return `Produzido e envasilhado sob responsabilidade de ${comEndereco(unidadeCentral)}`;
    case 'responsabilidade_padronizado':
      return `Padronizado e envasilhado sob responsabilidade de ${comEndereco(unidadeCentral)}`;
    case 'cantina_produtora':
      return `Produzido e envasilhado por ${comDocumento(cantina)}. Marca de propriedade de ${comDocumento(cliente)}`;
  }
}

/** Contrato vigente na data (ISO): início ≤ data e sem fim ou fim ≥ data. */
export function contratoVigente(
  c: { vigenciaInicio: string; vigenciaFim: string | null },
  data: string,
): boolean {
  return c.vigenciaInicio <= data && (!c.vigenciaFim || c.vigenciaFim >= data);
}

const uuidOpcional = z
  .uuid()
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null))
  .transform((v) => v ?? null);

/**
 * Transferência de titularidade no estoque (garrafas e outros itens com lote): o lote passa a ser
 * de outro titular, com o mesmo código (o impresso na garrafa).
 */
export const titularidadeEstoque = z.object({
  executadoEm: z.iso.datetime({ offset: true, message: 'Informe data e hora' }),
  localId: z.uuid('Escolha o local'),
  /** Novo titular; vazio = a própria empresa. */
  paraTitularId: uuidOpcional,
  motivo: z.enum(CHAVES_MOTIVO_TITULARIDADE, 'Escolha o motivo'),
  contratoId: uuidOpcional,
  observacao: textoOpc(2000),
  itens: z
    .array(
      z.object({
        itemId: z.uuid('Escolha o item'),
        loteItemId: z.uuid('Escolha o lote'),
        quantidade: decimal(3, 'Quantidade inválida').refine(
          (v) => Number(v) > 0,
          'Quantidade inválida',
        ),
      }),
    )
    .min(1, 'Inclua ao menos um item')
    .max(50),
});

const litrosOpcionais = decimalOpc(2, 'Volume inválido');
const datahora = z.iso.datetime({ offset: true, message: 'Informe data e hora' });
const chaveNfe = z
  .string()
  .regex(/^\d{44}$/, 'A chave tem 44 dígitos')
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null))
  .transform((v) => v ?? null);

/** Origem da uva remetida à cantina (produção em terceiro, entrega simples). */
export const ORIGENS_UVA_REMESSA = {
  parcela: 'Vinhedo próprio (parcela)',
  romaneio: 'Uva já recebida (romaneio)',
  fornecedor: 'Fornecedor que entregou direto na cantina',
} as const;

/**
 * Remessa para terceiro ("vinho cigano", 04, roteiro do ciclo 10, bloco 5): uva, mosto ou vinho a
 * granel (pela saída de granel "remessa a terceiro") e insumos e embalagens (para o local externo
 * da cantina).
 */
export const remessaTerceiro = z.object({
  executadoEm: datahora,
  projetoId: z.uuid('Escolha o projeto'),
  cantinaId: z.uuid('Escolha a cantina'),
  contratoId: uuidOpcional,
  nfNumero: textoOpc(20),
  nfChave: chaveNfe,
  observacao: textoOpc(2000),
  itens: z
    .array(
      z.discriminatedUnion('tipo', [
        z.object({
          tipo: z.literal('uva'),
          variedadeId: z.uuid('Escolha a variedade'),
          safra: z.number().int().min(1900).max(2200).nullable().optional(),
          kg: decimal(1, 'Peso inválido').refine((v) => Number(v) > 0, 'Peso inválido'),
          origemUva: z.enum(['parcela', 'romaneio', 'fornecedor']),
          parcelaId: uuidOpcional,
          romaneioItemId: uuidOpcional,
          fornecedorId: uuidOpcional,
        }),
        z.object({ tipo: z.literal('granel'), operacaoId: z.uuid('Escolha a saída de granel') }),
        z.object({
          tipo: z.literal('insumo'),
          itemId: z.uuid('Escolha o item'),
          loteItemId: uuidOpcional,
          quantidade: decimal(3, 'Quantidade inválida').refine(
            (v) => Number(v) > 0,
            'Quantidade inválida',
          ),
          localOrigemId: z.uuid('Escolha o local de origem'),
          localDestinoId: z.uuid('Escolha o local da cantina'),
        }),
      ]),
    )
    .min(1, 'Inclua ao menos um item')
    .max(50),
});

/** Retorno de terceiro: registro único da chegada; vários retornos parciais por remessa. */
export const retornoTerceiro = z.object({
  executadoEm: datahora,
  projetoId: z.uuid('Escolha o projeto'),
  cantinaId: z.uuid('Escolha a cantina'),
  remessaId: uuidOpcional,
  nfNumero: textoOpc(20),
  nfChave: chaveNfe,
  glt: textoOpc(60),
  perdasInformadas: litrosOpcionais,
  observacao: textoOpc(2000),
  cientes: z.array(z.string().max(200)).max(50).default([]),
  itens: z
    .array(
      z.discriminatedUnion('tipo', [
        z.object({
          tipo: z.literal('granel'),
          recipienteId: z.uuid('Escolha o recipiente'),
          litros: decimal(2, 'Volume inválido').refine((v) => Number(v) > 0, 'Volume inválido'),
          lote: z.union([
            z.object({ id: z.uuid() }),
            z.object({ novo: z.string().regex(/^[A-Z]$/, 'Use uma letra (A, B…)') }),
          ]),
          /** Variedades e % do vinho que voltou; vazia = sugerida pela remessa ou "não informada". */
          composicao: z
            .array(
              z.object({
                variedadeId: z.uuid(),
                safra: z.number().int().nullable().optional(),
                percentual: decimal(2, 'Percentual inválido'),
              }),
            )
            .max(30)
            .default([]),
        }),
        z.object({
          tipo: z.literal('engarrafado'),
          formatoId: z.uuid('Escolha o formato'),
          garrafas: z.number().int().min(1, 'Informe as garrafas').max(10_000_000),
          /** Lote comercial informado pela cantina (o do contrarrótulo). */
          loteComercial: z.string().trim().min(1, 'Informe o lote').max(40),
          localId: z.uuid('Escolha o local'),
        }),
        z.object({
          tipo: z.literal('insumo_consumido'),
          itemId: z.uuid('Escolha o item'),
          loteItemId: uuidOpcional,
          quantidade: decimal(3, 'Quantidade inválida').refine(
            (v) => Number(v) > 0,
            'Quantidade inválida',
          ),
          localId: z.uuid('Escolha o local da cantina'),
        }),
      ]),
    )
    .min(1, 'Inclua ao menos um item')
    .max(50),
});
