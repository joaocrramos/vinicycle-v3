// Esquemas de entrada usados pela interface e pela API (as mesmas regras nos dois lados).
import { z } from 'zod'
import {
  ATIVIDADES_MAPA,
  CATEGORIAS_ANEXO,
  CODIGOS_PAPEL,
  FORMAS_REGISTRO,
  FUSOS_BRASIL,
  ORIGENS_UVA,
  PERIODICIDADES,
  SITUACOES_RECIPIENTE,
  SITUACOES_SIVIBE,
  USOS_LOCAL,
} from './dominios'
import {
  diaVencimentoValido,
  FORMAS_PAGAMENTO,
  MENSAGEM_DIA_VENCIMENTO,
  preferenciaCanais,
} from './comercial'
import { fichaComDocumento, fichaEntrada } from './ficha'
import {
  CHAVES_EMBALAGEM_GRANEL,
  CHAVES_TIPO_ENTRADA_GRANEL,
  CHAVES_TIPO_OPERACAO,
  CHAVES_TIPO_SAIDA_GRANEL,
  UNIDADES_DOSE,
} from './producao'
import { ACOES, type CodigoModulo } from './permissoes'
import { CHAVES_MOTIVO_TITULARIDADE } from './terceiros'

export const SENHA_MINIMO = 10

export const email = z.string().trim().toLowerCase().pipe(z.email('E-mail inválido').max(254))

export const senhaNova = z
  .string()
  .min(SENHA_MINIMO, `A senha precisa ter pelo menos ${SENHA_MINIMO} caracteres`)
  .max(128, 'A senha pode ter no máximo 128 caracteres')

export const entrar = z.object({ email, senha: z.string().min(1, 'Informe a senha').max(128) })

export const esqueciSenha = z.object({ email })

export const redefinirSenha = z.object({ token: z.string().min(10).max(200), senha: senhaNova })

export const codigoSegundoFator = z.object({
  codigo: z.string().regex(/^\d{6}$/, 'O código tem 6 dígitos'),
})

export const trocarContexto = z.object({
  empresaId: z.uuid().optional(),
  /** null = "Todos" os estabelecimentos permitidos. */
  estabelecimentoId: z.uuid().nullable().optional(),
  contexto: z.enum(['empresa', 'plataforma']).optional(),
})

export const aceitarConvite = z.object({
  /** Só para quem ainda não tem cadastro (P8). */
  ficha: fichaEntrada.optional(),
  senha: z.string().min(1).max(128),
  aceiteTermos: z.boolean().optional(),
})

export const trocarSenha = z.object({
  codigo: z.string().regex(/^\d{6}$/, 'O código tem 6 dígitos'),
  senha: senhaNova,
})

/** Troca de e-mail (P10): confirma a senha atual; o novo endereço recebe o link de confirmação. */
export const trocarEmail = z.object({
  email,
  senha: z.string().min(1, 'Informe a sua senha').max(128),
})

export const confirmarEmail = z.object({ token: z.string().min(20).max(200) })

/** Passagem de bastão (administracao.md): o perfil que o Master atual passa a ter. */
export const passarBastao = z.object({ perfilAnteriorId: z.uuid('Escolha o seu novo perfil') })

/** Troca pelo suporte: o e-mail designado, o perfil do Master anterior (vazio = inativar) e o motivo. */
export const designarMaster = z.object({
  email,
  perfilAnteriorId: z
    .uuid()
    .nullable()
    .or(z.literal('').transform(() => null)),
  motivo: z.string().trim().min(10, 'Descreva o motivo (mínimo de 10 caracteres)').max(500),
})

/** Aceite do bastão: com a sessão do escolhido aberta, a senha é dispensada. */
export const aceitarBastao = aceitarConvite.extend({ senha: z.string().max(128).optional() })

export const preferenciasUsuario = z.object({
  tema: z.enum(['claro', 'escuro', 'sistema']).optional(),
  paleta: z.string().max(30).optional(),
  idioma: z.enum(['pt-BR']).optional(),
  formatoData: z.enum(['dd/mm/aaaa', 'aaaa-mm-dd']).optional(),
  menuRecolhido: z.boolean().optional(),
  /** Avisos também por WhatsApp e SMS, além do e-mail e da tela (P20; ciclo 12). */
  canais: preferenciaCanais.optional(),
})
export type PreferenciasUsuario = z.infer<typeof preferenciasUsuario>

// Empresa (Configurações › Empresa; Administração › Clientes)

const corHex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida')
  .nullable()
  .optional()

export const dadosEmpresa = z.object({
  ficha: fichaComDocumento,
  corMarca: corHex,
  contatoFinanceiroNome: z.string().trim().max(200).nullable().optional(),
  contatoFinanceiroEmail: email
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  contatoFinanceiroTelefone: z.string().trim().max(30).nullable().optional(),
  regimeTributario: z.enum(['simples', 'presumido', 'real']).nullable().optional(),
  versao: z.number().int().optional(),
})

export const novaEmpresa = dadosEmpresa.extend({
  emailMaster: email,
  planoId: z.uuid(),
  periodicidade: z.enum(PERIODICIDADES),
  inicio: z.iso.date(),
  emTeste: z.boolean(),
  /** Vazio = o primeiro dia da lista a partir do dia do início. */
  diaVencimento: z
    .number()
    .int()
    .refine(diaVencimentoValido, MENSAGEM_DIA_VENCIMENTO)
    .nullable()
    .optional(),
  formaPagamento: z.enum(FORMAS_PAGAMENTO).nullable().optional(),
})

// Estabelecimento (P12)

export const dadosEstabelecimento = z.object({
  ficha: fichaComDocumento,
  registroMapa: z.string().trim().max(40).nullable().optional(),
  registroMapaValidade: z.iso.date().nullable().optional(),
  capacidadeLitros: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Capacidade inválida')
    .nullable()
    .optional(),
  fuso: z.enum(FUSOS_BRASIL),
  origemUva: z.enum(ORIGENS_UVA).nullable().optional(),
  atividadesMapa: z.array(z.enum(ATIVIDADES_MAPA)).default([]),
  temManualBpf: z.boolean().nullable().optional(),
  manualBpfRevisao: z.iso.date().nullable().optional(),
  formaRegistroAtual: z.enum(FORMAS_REGISTRO).nullable().optional(),
  /** Pessoa com o papel de responsável técnico (P12). */
  responsavelTecnicoId: z
    .uuid()
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  /** IGs usadas (ids de indicacao_geografica). */
  igs: z.array(z.uuid()).max(20).default([]),
  /** Classes oficiais de produto que o estabelecimento elabora (códigos). */
  produtosElaborados: z.array(z.string().max(40)).max(30).default([]),
  versao: z.number().int().optional(),
})

// Local

const MODULOS_COM_ESTOQUE = [
  'ENOTRACE',
  'VITITRACK',
  'ENOTUR',
  'ENOMESA',
] as const satisfies readonly CodigoModulo[]

export const dadosLocal = z
  .object({
    nome: z.string().trim().min(1, 'Informe o nome').max(100),
    uso: z.enum(USOS_LOCAL),
    moduloEstoque: z.enum(MODULOS_COM_ESTOQUE).nullable().optional(),
    refrigerado: z.boolean().default(false),
    externo: z.boolean().default(false),
    observacoes: z.string().trim().max(2000).nullable().optional(),
    versao: z.number().int().optional(),
  })
  .superRefine((l, ctx) => {
    if (l.uso !== 'recipientes' && !l.moduloEstoque) {
      ctx.addIssue({
        code: 'custom',
        path: ['moduloEstoque'],
        message: 'Informe o módulo do estoque',
      })
    }
  })
  .transform((l) => ({
    ...l,
    moduloEstoque: l.uso === 'recipientes' ? null : (l.moduloEstoque ?? null),
  }))

// Usuários e perfis (P8, P27)

export const novoConvite = z.object({
  email,
  perfilId: z.uuid(),
  estabelecimentos: z.array(z.uuid()).default([]),
})

export const alterarVinculo = z.object({
  perfilId: z.uuid(),
  estabelecimentos: z.array(z.uuid()).default([]),
})

export const motivo = z.object({ motivo: z.string().trim().min(3, 'Informe o motivo').max(500) })

export const dadosPerfil = z.object({
  nome: z.string().trim().min(1, 'Informe o nome').max(80),
  descricao: z.string().trim().max(500).nullable().optional(),
  copiarDe: z.uuid().optional(),
})

export const gradePerfil = z.object({
  permissoes: z
    .array(z.object({ funcionalidade: z.string().max(80), acao: z.enum(ACOES) }))
    .max(2000),
})

// Anexos (P15)

export const novoAnexo = z.object({
  entidade: z.string().regex(/^[a-z_]{2,40}$/),
  registroId: z.uuid(),
  categoria: z.enum(CATEGORIAS_ANEXO),
  descricao: z.string().trim().max(500).optional(),
})

export const filtroAuditoria = z.object({
  usuarioId: z.uuid().optional(),
  entidade: z.string().max(40).optional(),
  acao: z.string().max(60).optional(),
  de: z.iso.date().optional(),
  ate: z.iso.date().optional(),
})

// Pessoas (P2; gestao.md, Pessoas)

/** Placa no padrão antigo (AAA0000) ou Mercosul (AAA0A00). */
export const placa = z
  .string()
  .transform((v) => v.replace(/[^0-9a-zA-Z]/g, '').toUpperCase())
  .refine((v) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(v), 'Placa inválida (ex.: ABC1D23)')

const dataOpcional = z.iso
  .date()
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null))

export const dadosPessoa = z
  .object({
    ficha: fichaEntrada,
    papeis: z.array(z.enum(CODIGOS_PAPEL)).min(1, 'Escolha pelo menos um papel'),
    cliente: z
      .object({ condicoesComerciais: z.string().trim().max(2000).nullable().optional() })
      .optional(),
    fornecedor: z
      .object({ categorias: z.array(z.string().max(40)).max(20).default([]) })
      .optional(),
    produtorUva: z
      .object({
        numeroSivibe: z.string().trim().max(40).nullable().optional(),
        situacaoCadastro: z.enum(SITUACOES_SIVIBE).default('nao_verificado'),
        declaracaoAnoAnterior: z.boolean().nullable().optional(),
        conferidoEm: dataOpcional,
      })
      .optional(),
    funcionario: z
      .object({
        cargo: z.string().max(40).nullable().optional(),
        situacao: z.enum(['ativo', 'afastado', 'desligado']).default('ativo'),
      })
      .optional(),
    laboratorio: z
      .object({
        credenciamentoMapa: z.string().trim().max(60).nullable().optional(),
        credenciamentoValidade: dataOpcional,
        prazoMedioLaudoDias: z.number().int().min(0).max(365).nullable().optional(),
      })
      .optional(),
    rt: z
      .object({
        conselho: z.string().max(40).nullable().optional(),
        numeroRegistro: z.string().trim().max(60).nullable().optional(),
        artNumero: z.string().trim().max(60).nullable().optional(),
        artValidade: dataOpcional,
      })
      .optional(),
    fabricante: z
      .object({ marcas: z.array(z.string().trim().min(1).max(120)).max(50).default([]) })
      .optional(),
    transportador: z.object({ placas: z.array(placa).max(50).default([]) }).optional(),
    contatos: z
      .array(
        z.object({
          nome: z.string().trim().min(1, 'Informe o nome').max(200),
          cargo: z.string().trim().max(100).nullable().optional(),
          emails: z.array(email).max(10).default([]),
          telefones: z.array(z.string().trim().max(30)).max(10).default([]),
        }),
      )
      .max(50)
      .default([]),
    versao: z.number().int().optional(),
  })
  .superRefine((p, ctx) => {
    // Documento obrigatório (gestao.md, Pessoas); o estrangeiro informa o do seu país.
    if (!p.ficha.documento) {
      ctx.addIssue({
        code: 'custom',
        path: ['ficha', 'documento'],
        message: 'Informe o documento',
      })
    }
  })

export type DadosPessoa = z.output<typeof dadosPessoa>

// Documentos (gestao.md, Documentos)

const dataDoc = z.iso
  .date()
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null))

export const versaoDocumento = z
  .object({
    numero: z.string().trim().max(80).nullable().optional(),
    emissao: dataDoc,
    vencimento: dataDoc,
    assinadoPor: z.string().trim().max(200).nullable().optional(),
    assinadoEm: dataDoc,
    observacoes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => !v.emissao || !v.vencimento || v.vencimento >= v.emissao, {
    path: ['vencimento'],
    message: 'O vencimento não pode ser antes da emissão',
  })

export const dadosDocumento = z.object({
  tipoDocumentoId: z.uuid('Escolha o tipo'),
  titulo: z.string().trim().min(1, 'Informe o título').max(200),
  /** Vazio = documento da empresa toda (P12). */
  estabelecimentoId: z
    .uuid()
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  modulo: z
    .string()
    .max(20)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  orgaoEmissor: z.string().trim().max(200).nullable().optional(),
  responsavelId: z
    .uuid()
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  observacoes: z.string().trim().max(4000).nullable().optional(),
  etiquetas: z.array(z.uuid()).max(30).default([]),
  versao: z.number().int().optional(),
})

export const novoDocumento = dadosDocumento.extend({ primeiraVersao: versaoDocumento })

export const dadosEtiqueta = z.object({
  nome: z.string().trim().min(1, 'Informe o nome').max(60),
  cor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
})

// Cadastros da cantina (cantina.md; 03-modelo-de-dados.md, 2.4 e 2.5)

const decimal = (casas: number, mensagem: string) =>
  z.string().regex(new RegExp(`^\\d+(\\.\\d{1,${casas}})?$`), mensagem)
const textoOpc = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null))

export const dadosRecipiente = z.object({
  codigo: z.string().trim().min(1, 'Informe o código').max(30),
  tipoRecipienteId: z.uuid('Escolha o tipo'),
  material: textoOpc(40),
  capacidadeLitros: decimal(2, 'Capacidade inválida').refine(
    (v) => Number(v) > 0,
    'A capacidade precisa ser maior que zero',
  ),
  possuiFrio: z.boolean().default(false),
  localId: z.uuid('Escolha o local'),
  dimensoes: textoOpc(100),
  fabricante: textoOpc(100),
  dataAquisicao: z.iso
    .date()
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  tanoaria: textoOpc(100),
  origemMadeira: textoOpc(40),
  tosta: textoOpc(40),
  anoPrimeiroUso: z.number().int().min(1900).max(2200).nullable().optional(),
  observacoes: textoOpc(2000),
  versao: z.number().int().optional(),
})

export const situacaoRecipiente = z.object({
  situacao: z.enum(SITUACOES_RECIPIENTE),
  motivo: z.string().trim().max(500).nullable().optional(),
})

export const dadosItemEstoque = z
  .object({
    tipo: z.enum(['insumo', 'embalagem', 'selo', 'outro']),
    nome: z.string().trim().min(1, 'Informe o nome').max(200),
    codigoInterno: textoOpc(40),
    unidadeBase: z.string().min(1, 'Escolha a unidade').max(20),
    estoqueMinimo: decimal(3, 'Estoque mínimo inválido')
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
    controlaLote: z.boolean().default(false),
    controlaValidade: z.boolean().default(false),
    eAlcoolEtilico: z.boolean().default(false),
    /** Selo numerado: entra por faixa e registra os números usados (ciclo 9). */
    controlaNumeracao: z.boolean().default(false),
    observacoes: textoOpc(2000),
    insumo: z
      .object({
        tipoInsumoId: z.uuid('Escolha o tipo de insumo'),
        nomeComercial: textoOpc(200),
        marca: textoOpc(120),
        fabricanteId: z
          .uuid()
          .nullable()
          .optional()
          .or(z.literal('').transform(() => null)),
        apresentacao: textoOpc(40),
        /** Teor de SO₂ (%), para somar o SO₂ adicionado nas operações (ciclo 4). */
        teorSo2: decimal(2, 'Teor inválido')
          .refine((v) => Number(v) <= 100, 'Use de 0 a 100%')
          .nullable()
          .optional()
          .or(z.literal('').transform(() => null)),
      })
      .optional(),
    versao: z.number().int().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.tipo === 'insumo' && !d.insumo) {
      ctx.addIssue({
        code: 'custom',
        path: ['insumo', 'tipoInsumoId'],
        message: 'Escolha o tipo de insumo',
      })
    }
  })

export const dadosMarca = z.object({
  nome: z.string().trim().min(1, 'Informe o nome').max(120),
  /** Vazio = a própria empresa; senão, o cliente de vinificação (decidido em 03/10/2026). */
  donoId: z
    .uuid()
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  versao: z.number().int().optional(),
})

export const dadosProduto = z.object({
  nome: z.string().trim().min(1, 'Informe o nome').max(200),
  marcaId: z.uuid('Escolha a marca'),
  classeProdutoId: z.uuid('Escolha a classe'),
  cor: textoOpc(40),
  teorAcucar: textoOpc(40),
  metodoEspumante: textoOpc(40),
  registroMapa: textoOpc(60),
  titularId: z
    .uuid()
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  observacoes: textoOpc(2000),
  versao: z.number().int().optional(),
})

export const dadosRotulo = z.object({
  versao: z.string().trim().min(1, 'Informe a versão do rótulo').max(40),
  teorAlcoolico: decimal(1, 'Teor inválido').refine(
    (v) => Number(v) > 0 && Number(v) < 100,
    'Teor inválido',
  ),
  urlPagina: z
    .url('Endereço inválido')
    .max(300)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  vigenteDesde: z.iso.date('Informe a data'),
  vigenteAte: z.iso
    .date()
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  observacoes: textoOpc(2000),
})

export const dadosFormato = z.object({
  volumeMl: z.number().int().min(1, 'Informe o volume').max(100000),
})

export const fichaEmbalagemEntrada = z.object({
  itens: z
    .array(
      z.object({
        itemEstoqueId: z.uuid(),
        quantidade: decimal(4, 'Quantidade inválida').refine(
          (v) => Number(v) > 0,
          'Quantidade inválida',
        ),
      }),
    )
    .max(50),
})

export const parametrosAnaliseEmpresa = z.object({
  parametros: z
    .array(
      z.object({
        parametroId: z.uuid(),
        ativo: z.boolean(),
        unidadePreferida: z.string().max(20).nullable().optional(),
        minimo: z
          .string()
          .regex(/^-?\d+(\.\d{1,4})?$/)
          .nullable()
          .optional()
          .or(z.literal('').transform(() => null)),
        maximo: z
          .string()
          .regex(/^-?\d+(\.\d{1,4})?$/)
          .nullable()
          .optional()
          .or(z.literal('').transform(() => null)),
      }),
    )
    .max(200),
})

export const rendimentosPadrao = z.object({
  itens: z
    .array(
      z.object({
        variedadeId: z
          .uuid()
          .nullable()
          .optional()
          .or(z.literal('').transform(() => null)),
        estilo: textoOpc(40),
        litrosPorKg: decimal(4, 'Rendimento inválido').refine(
          (v) => Number(v) > 0 && Number(v) < 1,
          'Use litros por kg, entre 0 e 1 (ex.: 0,7000)',
        ),
      }),
    )
    .max(200),
})

export const ciclosSafra = z.object({
  ciclos: z
    .array(
      z.object({
        numero: z.string().regex(/^\d{2}$/, 'Use dois dígitos (01, 02)'),
        nome: z.string().trim().min(1).max(40),
      }),
    )
    .max(12),
})

export const periodicidadesHigienizacao = z.object({
  itens: z
    .array(
      z.object({ tipoRecipienteId: z.uuid(), intervaloDias: z.number().int().min(1).max(3650) }),
    )
    .max(100),
})

const decimalRegra = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, 'Número inválido')
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null))

/** Nova versão de regra regulatória (P16): a anterior da mesma chave e abrangência se encerra. */
export const novaRegra = z
  .object({
    tipo: z.enum(['limite', 'cadastro', 'prazo', 'dizer']),
    chave: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{2,60}$/, 'Use letras minúsculas, números e _'),
    abrangencia: z.enum(['nacional', 'uf', 'ig']),
    abrangenciaCodigo: z
      .string()
      .trim()
      .max(40)
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
    vigenteDesde: z.iso.date('Informe a data'),
    minimo: decimalRegra,
    maximo: decimalRegra,
    unidade: textoOpc(20),
    descricao: z.string().trim().min(5, 'Descreva a regra').max(300),
    fonteNorma: z.string().trim().min(3, 'Informe a norma').max(200),
    fonteArtigo: textoOpc(100),
    fonteLink: z
      .url('Endereço inválido')
      .max(500)
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
    fonteNota: textoOpc(1000),
  })
  .refine((d) => (d.abrangencia === 'nacional') === !d.abrangenciaCodigo, {
    path: ['abrangenciaCodigo'],
    message: 'Informe a UF ou a IG; na nacional, deixe vazio',
  })

// Produção (cantina.md, Projeto de vinho) -------------------------------------------------------

const decimalOpc = (casas: number, mensagem: string) =>
  decimal(casas, mensagem)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null))
const uuidOpc = z
  .uuid()
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null))

/** Dados do projeto. Na criação rápida (dentro da recepção), basta nome, safra e produto. */
export const dadosProjeto = z.object({
  nome: z.string().trim().min(1, 'Informe o nome').max(120),
  safraPrevista: z.number().int().min(1900, 'Safra inválida').max(2200, 'Safra inválida'),
  cicloPrevisto: z
    .string()
    .regex(/^\d{2}$/, 'Use dois dígitos')
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  classeProdutoId: uuidOpc,
  cor: textoOpc(40),
  teorAcucar: textoOpc(40),
  metodoEspumante: textoOpc(40),
  teorAlcoolicoPretendido: decimalOpc(1, 'Teor inválido'),
  volumePrevistoLitros: decimalOpc(2, 'Volume inválido'),
  kgPrevistos: decimalOpc(1, 'Quantidade inválida'),
  enologoId: uuidOpc,
  variedades: z.array(z.uuid()).max(50).default([]),
  observacoes: textoOpc(2000),
  versao: z.number().int().optional(),
})

/** Situações que o enólogo muda à mão; as demais mudam sozinhas (cantina.md, Situações). */
export const mudarSituacaoProjeto = z.object({
  situacao: z.enum(['em_producao', 'pronto_envase', 'encerrado', 'cancelado']),
  motivo: z.string().trim().max(500).nullable().optional(),
})

const insumoPrevisto = z.object({
  itemEstoqueId: z.uuid('Escolha o insumo'),
  dose: decimal(4, 'Dose inválida').refine((v) => Number(v) > 0, 'Dose inválida'),
  unidade: z.string().trim().min(1, 'Informe a unidade').max(20),
})

/** Passo do plano do projeto (cantina.md, Plano do projeto). */
export const etapaPlano = z.object({
  tipoOperacao: z.enum(CHAVES_TIPO_OPERACAO, 'Escolha a operação'),
  dataPrevista: z.iso.date('Informe a data'),
  recipienteId: uuidOpc,
  observacao: textoOpc(500),
  insumos: z.array(insumoPrevisto).max(20).default([]),
})

/** Modelo de plano com dias relativos: dia 0 = desengace (cantina.md, Modelos de plano). */
export const dadosModeloPlano = z.object({
  nome: z.string().trim().min(1, 'Informe o nome').max(120),
  descricao: textoOpc(500),
  etapas: z
    .array(
      z.object({
        tipoOperacao: z.enum(CHAVES_TIPO_OPERACAO, 'Escolha a operação'),
        diaRelativo: z.number().int().min(-60).max(3650),
        observacao: textoOpc(500),
        insumos: z.array(insumoPrevisto).max(20).default([]),
      }),
    )
    .max(60),
  versao: z.number().int().optional(),
})

export const aplicarModeloPlano = z.object({
  modeloId: z.uuid('Escolha o modelo'),
  dataDia0: z.iso.date('Informe a data do dia 0'),
})

export const mudarEtapaLote = z.object({ etapa: z.string().min(1).max(40) })

/** Vinhedo próprio ou do produtor: cadastro mínimo em 2026 (cantina.md, Recepção, Origem). */
export const dadosPropriedade = z.object({
  nome: z.string().trim().min(1, 'Informe o nome').max(120),
  /** Vazio = a própria empresa. */
  donoId: uuidOpc,
  numeroSivibe: textoOpc(40),
  municipio: textoOpc(120),
  uf: z
    .string()
    .regex(/^[A-Z]{2}$/, 'UF inválida')
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  codigoIbge: z
    .string()
    .regex(/^\d{7}$/, 'Código IBGE inválido')
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  observacoes: textoOpc(1000),
  parcelas: z
    .array(
      z.object({
        id: z.uuid().optional(),
        nome: z.string().trim().min(1, 'Informe o nome da parcela').max(80),
        variedadeId: uuidOpc,
        areaHa: decimalOpc(4, 'Área inválida'),
        ativo: z.boolean().default(true),
      }),
    )
    .max(200),
  versao: z.number().int().optional(),
})

// Recepção da uva (cantina.md, Recepção) ---------------------------------------------------------

const pesagem = z
  .object({
    pesadoEm: z.iso.datetime({ offset: true, message: 'Informe data e hora' }),
    brutoKg: decimal(1, 'Peso inválido'),
    taraKg: decimal(1, 'Tara inválida').default('0'),
  })
  .refine((p) => Number(p.brutoKg) > Number(p.taraKg), {
    path: ['brutoKg'],
    message: 'O bruto precisa ser maior que a tara',
  })

/** Item por variedade: o °Brix é obrigatório na confirmação; o rascunho pode esperar a medição. */
const itemRomaneio = z.object({
  /** Linha da nota importada que preencheu o item (P11). */
  nfeItemId: uuidOpc,
  variedadeId: z.uuid('Escolha a variedade'),
  parcelaId: uuidOpc,
  dataColheita: z.iso.date('Informe a data da colheita'),
  ciclo: z
    .string()
    .regex(/^\d{2}$/)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  brix: decimalOpc(2, '°Brix inválido'),
  ph: decimalOpc(2, 'pH inválido'),
  acidezTotal: decimalOpc(2, 'Acidez inválida'),
  sanidade: decimalOpc(2, 'Sanidade inválida'),
  temperatura: decimalOpc(1, 'Temperatura inválida'),
  organica: z.boolean().default(false),
  candidataIp: z.boolean().default(false),
  dataPoda: z.iso
    .date()
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  observacoes: textoOpc(500),
  pesagens: z.array(pesagem).max(50).default([]),
})

/** Romaneio em rascunho; confirmado, não se edita (P13). */
export const dadosRomaneio = z
  .object({
    chegadaEm: z.iso.datetime({ offset: true, message: 'Informe data e hora da chegada' }),
    projetoId: z.uuid('Escolha o projeto'),
    origem: z.enum(['vinhedo_proprio', 'fornecedor']),
    fornecedorId: uuidOpc,
    /** Vinificação para terceiro: o dono da uva; vazio = a própria empresa. */
    donoUvaId: uuidOpc,
    /** Contrato de terceirização com o dono da uva (opcional; sem ele, "ciente"). */
    contratoId: uuidOpc,
    nfeId: uuidOpc,
    nfNumero: textoOpc(20),
    nfSerie: textoOpc(5),
    nfEmissao: z.iso
      .date()
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
    nfChave: z
      .string()
      .regex(/^\d{44}$/, 'A chave tem 44 dígitos')
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
    transportadorId: uuidOpc,
    placa: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/, 'Placa inválida')
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
    caixas: z.number().int().min(0).nullable().optional(),
    observacoes: textoOpc(2000),
    itens: z.array(itemRomaneio).min(1, 'Inclua ao menos uma variedade').max(30),
    versao: z.number().int().optional(),
  })
  .refine((d) => d.origem !== 'fornecedor' || !!d.fornecedorId, {
    path: ['fornecedorId'],
    message: 'Escolha o fornecedor',
  })

export const confirmacao = z.object({ cientes: z.array(z.string().max(200)).max(50).default([]) })

// Operações da cantina (cantina.md, Desengace, esmagamento e prensagem) --------------------------

/** Lote de destino: existente (incorporar) ou novo, por uma chave da própria operação. */
const loteDestino = z.union([
  z.object({ id: z.uuid() }),
  z.object({ novo: z.string().regex(/^[A-Z]$/, 'Use uma letra (A, B…)') }),
])

/**
 * Insumo aplicado numa operação (cantina.md, Adição de insumo): o lote é obrigatório quando o item
 * controla lote; o insumo não estocado (ex.: trazido pelo cliente) vai com descrição, sem baixa.
 */
const insumoAplicado = z
  .object({
    /** Recipiente tratado; vazio = os destinos da operação. */
    recipienteId: uuidOpc,
    itemId: uuidOpc,
    descricao: textoOpc(120),
    loteItemId: uuidOpc,
    dose: z
      .string()
      .regex(/^\d+(\.\d{1,4})?$/, 'Dose inválida')
      .refine((v) => Number(v) > 0, 'Dose inválida'),
    unidade: z.enum(UNIDADES_DOSE),
    /** Vazio = o volume do recipiente depois da operação. */
    volumeTratado: decimalOpc(2, 'Volume inválido'),
    aplicadoEm: z.iso.datetime({ offset: true }).nullish(),
    temperatura: decimalOpc(1, 'Temperatura inválida'),
  })
  .refine((i) => !!i.itemId !== !!i.descricao, {
    path: ['itemId'],
    message: 'Escolha o insumo do estoque ou descreva o insumo não estocado',
  })

const comumOperacao = {
  executadoEm: z.iso.datetime({ offset: true, message: 'Informe data e hora' }),
  responsavelId: uuidOpc,
  executadoPorId: uuidOpc,
  planoEtapaId: uuidOpc,
  observacao: textoOpc(2000),
  residuos: z
    .array(
      z.object({
        tipo: z.enum(['engaco', 'bagaco']),
        kg: decimal(1, 'Peso inválido').refine((v) => Number(v) > 0, 'Peso inválido'),
        destino: textoOpc(40),
      }),
    )
    .max(4)
    .default([]),
  cientes: z.array(z.string().max(200)).max(50).default([]),
  /** Rascunho que esta confirmação conclui (cantina.md, Regras comuns: rascunho). */
  rascunhoId: uuidOpc,
  /** Insumos aplicados junto (ex.: SO₂ e enzimas no desengace) e o local de onde saem. */
  insumos: z.array(insumoAplicado).max(50).default([]),
  localEstoqueId: uuidOpc,
}

const kgPositivo = decimal(1, 'Peso inválido').refine((v) => Number(v) > 0, 'Peso inválido')
const litrosOpc = decimalOpc(2, 'Volume inválido')
const litrosPositivo = decimal(2, 'Volume inválido').refine((v) => Number(v) > 0, 'Volume inválido')

/**
 * Desengace/esmagamento: consome kg dos itens do romaneio e põe o mosto nos recipientes com litros
 * estimados (cantina.md, Quilos → litros). Com vários destinos, a uva de cada item pode ser
 * repartida (decidido em 03/10/2026); sem repartição, todos recebem a mesma mistura.
 */
export const desengace = z
  .object({
    ...comumOperacao,
    projetoId: z.uuid('Escolha o projeto'),
    consumos: z
      .array(z.object({ itemId: z.uuid(), kg: kgPositivo }))
      .min(1, 'Escolha a uva a processar')
      .max(30),
    destinos: z
      .array(
        z.object({
          recipienteId: z.uuid('Escolha o recipiente'),
          lote: loteDestino,
          /** Litros estimados digitados para este recipiente; vazio = calculado. */
          litros: litrosOpc,
        }),
      )
      .min(1, 'Escolha o recipiente de destino')
      .max(20),
    /** kg de cada item em cada destino; vazio = a mesma mistura em todos. */
    reparticao: z
      .array(z.object({ itemId: z.uuid(), recipienteId: z.uuid(), kg: kgPositivo }))
      .max(200)
      .default([]),
  })
  .refine((d) => new Set(d.destinos.map((x) => x.recipienteId)).size === d.destinos.length, {
    path: ['destinos'],
    message: 'O mesmo recipiente aparece duas vezes',
  })

/**
 * Prensagem (cantina.md): a partir de um recipiente com massa, ou direto da uva do romaneio. Cada
 * fração (flor, 1ª prensa…) tem os seus litros medidos, o seu destino e, se quiser, o seu lote.
 */
export const prensagem = z
  .object({
    ...comumOperacao,
    /** Prensagem da massa de um recipiente (tintos). */
    origemRecipienteId: uuidOpc,
    /** Prensagem direta: projeto e uva do romaneio (brancos e espumantes). */
    projetoId: uuidOpc,
    consumos: z
      .array(z.object({ itemId: z.uuid(), kg: kgPositivo }))
      .max(30)
      .default([]),
    fracoes: z
      .array(
        z.object({
          fracao: z.string().min(1, 'Escolha a fração').max(40),
          litros: litrosPositivo,
          recipienteId: z.uuid('Escolha o destino'),
          /** Vazio = o mesmo lote da massa (só na prensagem do recipiente). */
          lote: loteDestino.nullable().optional(),
        }),
      )
      .min(1, 'Informe ao menos uma fração')
      .max(10),
  })
  .refine((d) => !!d.origemRecipienteId !== d.consumos.length > 0, {
    path: ['consumos'],
    message: 'Escolha a massa de um recipiente ou a uva do romaneio, não os dois',
  })
  .refine((d) => !!d.origemRecipienteId || !!d.projetoId, {
    path: ['projetoId'],
    message: 'Escolha o projeto',
  })

// Trasfega e perda (cantina.md, Trasfega e corte; Operações) ------------------------------------

const unicos = (ids: string[]) => new Set(ids).size === ids.length

/**
 * Trasfega: move o vinho de um lote entre recipientes, com várias origens e vários destinos. Cada
 * destino recebe a mistura das origens, na proporção do que saiu de cada uma. A borra fica na
 * origem como perda; com "esvaziar", é o que sobra no recipiente.
 */
/** Origens da trasfega e do corte: quanto saiu de cada uma, "esvaziar" e a borra. */
const origensMistura = z
  .array(
    z.object({
      recipienteId: z.uuid('Escolha o recipiente de origem'),
      /** Litros que saíram para os destinos; vazio = calculado. */
      litros: litrosOpc,
      esvaziar: z.boolean().default(false),
      /** Borra, quando não esvazia. */
      perda: litrosOpc,
    }),
  )
  .min(1, 'Escolha a origem')
  .max(30)

const misturaValida = <
  T extends { origens: Array<{ recipienteId: string }>; destinos: Array<{ recipienteId: string }> },
>(
  e: z.ZodType<T>,
) =>
  e
    .refine((d) => unicos(d.origens.map((o) => o.recipienteId)), {
      path: ['origens'],
      message: 'O mesmo recipiente aparece duas vezes nas origens',
    })
    .refine((d) => unicos(d.destinos.map((o) => o.recipienteId)), {
      path: ['destinos'],
      message: 'O mesmo recipiente aparece duas vezes nos destinos',
    })
    .refine(
      (d) => !d.destinos.some((x) => d.origens.some((o) => o.recipienteId === x.recipienteId)),
      { path: ['destinos'], message: 'Um recipiente não pode ser origem e destino' },
    )

/**
 * Trasfega: move o vinho de um lote entre recipientes, com várias origens e vários destinos. Cada
 * destino recebe a mistura das origens, na proporção do que saiu de cada uma. A borra fica na
 * origem como perda; com "esvaziar", é o que sobra no recipiente.
 */
export const trasfega = misturaValida(
  z.object({
    ...comumOperacao,
    /** Código da lista "metodo_trasfega". */
    metodo: textoOpc(40),
    /** O enólogo diz se a mistura de lotes é um corte (cantina.md, Trasfega e corte). */
    eCorte: z.boolean().default(false),
    origens: origensMistura,
    destinos: z
      .array(
        z.object({
          recipienteId: z.uuid('Escolha o recipiente de destino'),
          litros: litrosPositivo,
          /** Vazio = o mesmo lote das origens. */
          lote: loteDestino.nullable().optional(),
        }),
      )
      .min(1, 'Escolha o destino')
      .max(30),
  }),
)

/**
 * Corte (cantina.md, Trasfega e corte): mistura de lotes diferentes. Cada destino incorpora a um
 * lote existente ou forma lote novo; lote novo com vinhos de projetos diferentes cria um projeto
 * novo, com o nome informado.
 */
export const corte = misturaValida(
  z.object({
    ...comumOperacao,
    metodo: textoOpc(40),
    origens: origensMistura,
    destinos: z
      .array(
        z.object({
          recipienteId: z.uuid('Escolha o recipiente de destino'),
          litros: litrosPositivo,
          lote: loteDestino,
        }),
      )
      .min(1, 'Escolha o destino')
      .max(30),
    projetoNovo: z
      .object({
        nome: z.string().trim().min(1, 'Informe o nome do projeto novo').max(120),
        cor: textoOpc(40),
      })
      .nullish(),
  }),
)

/**
 * Atesto em lote (cantina.md, Fermentação, chaptalização, álcool e atesto): uma origem completa
 * várias barricas. Em cada barrica, a evaporação igual aos litros repostos (corrigível) evita que
 * ela passe da capacidade no livro. Barrica com outro lote: incorpora (padrão) ou forma lote novo.
 */
export const atesto = misturaValida(
  z.object({
    ...comumOperacao,
    origens: origensMistura.max(1, 'O atesto tem uma origem'),
    destinos: z
      .array(
        z.object({
          recipienteId: z.uuid('Escolha a barrica'),
          litros: litrosPositivo,
          /** Vazio = igual aos litros repostos. */
          evaporacao: litrosOpc,
          /** Vazio = o lote da barrica (ou o da origem, se ela estiver vazia). */
          lote: loteDestino.nullable().optional(),
        }),
      )
      .min(1, 'Escolha as barricas')
      .max(200),
  }),
)

/** Adição de insumo avulsa: um ou mais insumos, cada um num recipiente. */
export const adicaoInsumo = z
  .object({ ...comumOperacao })
  .refine((d) => d.insumos.length > 0, { path: ['insumos'], message: 'Informe o insumo' })
  .refine((d) => d.insumos.every((i) => !!i.recipienteId), {
    path: ['insumos'],
    message: 'Escolha o recipiente de cada insumo',
  })

/**
 * Chaptalização (cantina.md, Fermentação, chaptalização…): açúcar num recipiente, em kg ou g/L,
 * com o ganho estimado em % vol e o alerta pelo limite da classe do produto pretendido.
 */
export const chaptalizacao = z
  .object({
    ...comumOperacao,
    recipienteId: z.uuid('Escolha o recipiente'),
    itemId: uuidOpc,
    descricao: textoOpc(120),
    loteItemId: uuidOpc,
    kg: decimalOpc(3, 'Quantidade inválida'),
    gramasPorLitro: decimalOpc(2, 'Dose inválida'),
  })
  .refine((d) => !!d.kg !== !!d.gramasPorLitro, {
    path: ['kg'],
    message: 'Informe o açúcar em kg ou em g/L',
  })
  .refine((d) => !!d.itemId !== !!d.descricao, {
    path: ['itemId'],
    message: 'Escolha o açúcar do estoque ou descreva',
  })

/**
 * Tratamento (clarificação, filtração, estabilização…): insumos, perdas e os parâmetros técnicos
 * configurados para o tipo (cantina.md, Inventário, estorno e tratamentos).
 */
export const tratamento = z.object({
  ...comumOperacao,
  /** Código da lista "tipo_tratamento". */
  tipoTratamento: z.string().min(1, 'Escolha o tratamento').max(40),
  recipientes: z.array(z.uuid()).min(1, 'Escolha o recipiente').max(50),
  perdas: z
    .array(
      z.object({
        recipienteId: z.uuid(),
        litros: decimal(2, 'Volume inválido').refine((v) => Number(v) > 0, 'Volume inválido'),
        motivo: z.string().min(1, 'Escolha o motivo').max(40),
      }),
    )
    .max(50)
    .default([]),
  parametros: z
    .array(z.object({ parametroId: z.uuid(), valor: z.string().trim().min(1).max(200) }))
    .max(30)
    .default([]),
})

/** Parâmetro técnico de um tipo de tratamento, configurado pela empresa (P29). */
export const parametroTratamento = z.object({
  tipoTratamento: z.string().min(1, 'Escolha o tratamento').max(40),
  nome: z.string().trim().min(1, 'Informe o nome').max(80),
  unidade: textoOpc(20),
  obrigatorio: z.boolean().default(false),
})

/** Início ou fim de uma fermentação do lote que está no recipiente (cantina.md, Fermentações). */
export const fermentacao = z.object({
  ...comumOperacao,
  tipoFermentacao: z.enum(['alcoolica', 'malolatica']),
  evento: z.enum(['inicio', 'fim']),
  recipienteId: z.uuid('Escolha o recipiente'),
})

/** Leitura de densidade e temperatura durante a fermentação (análise interna). */
export const leituraFermentacao = z
  .object({
    amostraEm: z.iso.datetime({ offset: true, message: 'Informe data e hora' }),
    densidade: decimalOpc(4, 'Densidade inválida'),
    temperatura: z
      .string()
      .regex(/^-?\d+(\.\d)?$/, 'Temperatura inválida')
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
    recipienteId: uuidOpc,
  })
  .refine((d) => !!d.densidade || !!d.temperatura, {
    path: ['densidade'],
    message: 'Informe a densidade ou a temperatura',
  })

/** Perda avulsa (vazamento, descarte, amostra…), com motivo da lista "motivo_perda". */
export const perda = z
  .object({
    ...comumOperacao,
    itens: z
      .array(
        z.object({
          recipienteId: z.uuid('Escolha o recipiente'),
          /** Vazio com "esvaziar" = todo o saldo. */
          litros: litrosOpc,
          esvaziar: z.boolean().default(false),
          motivo: z.string().min(1, 'Escolha o motivo').max(40),
        }),
      )
      .min(1, 'Escolha o recipiente')
      .max(50),
  })
  .refine((d) => unicos(d.itens.map((i) => i.recipienteId)), {
    path: ['itens'],
    message: 'O mesmo recipiente aparece duas vezes',
  })
  .refine((d) => d.itens.every((i) => i.esvaziar || (i.litros && Number(i.litros) > 0)), {
    path: ['itens'],
    message: 'Informe os litros perdidos',
  })

// Granel (cantina.md, Granel e GLT) ---------------------------------------------------------------

/** Documentos do transporte a granel: nota, partes, GLT e embalagem. */
const documentoGranel = {
  notaNumero: textoOpc(20),
  notaChave: z
    .string()
    .regex(/^\d{44}$/, 'A chave tem 44 dígitos')
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  remetenteId: uuidOpc,
  destinatarioId: uuidOpc,
  transportadorId: uuidOpc,
  /** Guia de Livre Trânsito (Decreto 12.709/2025, art. 235; Portaria MAPA 690/2022). */
  glt: textoOpc(40),
  embalagem: z
    .enum(CHAVES_EMBALAGEM_GRANEL)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
}

/**
 * Entrada de granel: vinho de fora num ou mais recipientes, num lote novo ou incorporado a um lote
 * do mesmo projeto e titular. A composição é a informada (origem "granel"); sem ela, "não
 * informada" (03-modelo-de-dados.md, 5.3).
 */
export const entradaGranel = z
  .object({
    ...comumOperacao,
    tipoGranel: z.enum(CHAVES_TIPO_ENTRADA_GRANEL),
    projetoId: z.uuid('Escolha o projeto'),
    /** Dono do vinho; vazio = a própria empresa. */
    titularId: uuidOpc,
    ...documentoGranel,
    /** Data em que o recebimento foi confirmado (na GLT); vazio = ainda não. */
    recebimentoConfirmadoEm: z.iso
      .date()
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
    composicao: z
      .array(
        z.object({
          variedadeId: z.uuid('Escolha a variedade'),
          safra: z.number().int().min(1900).max(2200).nullable().optional(),
          ciclo: textoOpc(10),
          organica: z.boolean().default(false),
          percentual: decimal(2, 'Percentual inválido').refine(
            (v) => Number(v) > 0 && Number(v) <= 100,
            'Percentual inválido',
          ),
        }),
      )
      .max(30)
      .default([]),
    destinos: z
      .array(
        z.object({
          recipienteId: z.uuid('Escolha o recipiente'),
          litros: litrosPositivo,
          lote: loteDestino,
        }),
      )
      .min(1, 'Escolha o recipiente de destino')
      .max(30),
  })
  .refine((d) => unicos(d.destinos.map((x) => x.recipienteId)), {
    path: ['destinos'],
    message: 'O mesmo recipiente aparece duas vezes',
  })
  .refine(
    (d) =>
      !d.composicao.length ||
      Math.round(d.composicao.reduce((t, c) => t + Number(c.percentual) * 100, 0)) === 10000,
    { path: ['composicao'], message: 'Os percentuais da composição somam 100%' },
  )

/** Saída de granel: litros de um ou mais recipientes para fora, com nota, partes e GLT. */
export const saidaGranel = z
  .object({
    ...comumOperacao,
    tipoGranel: z.enum(CHAVES_TIPO_SAIDA_GRANEL),
    ...documentoGranel,
    itens: z
      .array(
        z.object({
          recipienteId: z.uuid('Escolha o recipiente'),
          /** Vazio com "esvaziar" = todo o saldo. */
          litros: litrosOpc,
          esvaziar: z.boolean().default(false),
        }),
      )
      .min(1, 'Escolha o recipiente')
      .max(30),
  })
  .refine((d) => unicos(d.itens.map((i) => i.recipienteId)), {
    path: ['itens'],
    message: 'O mesmo recipiente aparece duas vezes',
  })
  .refine((d) => d.itens.every((i) => i.esvaziar || (i.litros && Number(i.litros) > 0)), {
    path: ['itens'],
    message: 'Informe os litros que saíram',
  })

/** Confirmação do recebimento (na GLT), marcada depois da entrada. */
export const recebimentoGranel = z.object({
  recebimentoConfirmadoEm: z.iso
    .date()
    .nullable()
    .or(z.literal('').transform(() => null)),
})

// Laboratório (cantina.md, Análises e Laboratório) ------------------------------------------------

/** Um valor de parâmetro, como digitado: o número e a unidade (convertida para a padrão). */
const resultadoAnalise = z.object({
  parametroId: z.uuid(),
  valor: z.string().regex(/^-?\d+(\.\d{1,6})?$/, 'Valor inválido'),
  unidade: z.string().min(1).max(20),
})

/**
 * Análise interna ou laudo externo de um lote, pelo recipiente (o lote que está nele na hora da
 * amostra) ou pelo lote direto. O laudo pode fechar um pedido (amostra) e citar o laboratório.
 */
export const dadosAnalise = z
  .object({
    tipo: z.enum(['interna', 'laudo']),
    amostraEm: z.iso.datetime({ offset: true, message: 'Informe data e hora da amostra' }),
    recipienteId: uuidOpc,
    loteId: uuidOpc,
    laboratorioId: uuidOpc,
    amostraId: uuidOpc,
    documento: textoOpc(60),
    observacao: textoOpc(2000),
    resultados: z.array(resultadoAnalise).min(1, 'Informe ao menos um valor').max(60),
    versao: z.number().int().optional(),
  })
  .refine((d) => !!d.recipienteId || !!d.loteId, {
    path: ['recipienteId'],
    message: 'Escolha o recipiente ou o lote',
  })
  .refine((d) => new Set(d.resultados.map((r) => r.parametroId)).size === d.resultados.length, {
    path: ['resultados'],
    message: 'O mesmo parâmetro aparece duas vezes',
  })

/** Pedido de análise externa: a amostra coletada, com o laboratório e o prazo do laudo. */
export const dadosAmostra = z
  .object({
    coletadaEm: z.iso.datetime({ offset: true, message: 'Informe data e hora da coleta' }),
    recipienteId: uuidOpc,
    loteId: uuidOpc,
    laboratorioId: z.uuid('Escolha o laboratório'),
    /** Vazio = o prazo médio do laboratório, se houver. */
    prazo: z.iso
      .date()
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
    observacao: textoOpc(2000),
  })
  .refine((d) => !!d.recipienteId || !!d.loteId, {
    path: ['recipienteId'],
    message: 'Escolha o recipiente ou o lote',
  })

// Higienização e manutenção de recipiente (cantina.md, Recipientes) -----------------------------

/**
 * Higienização ou manutenção: operação sem volume, em um ou mais recipientes, com o produto e a
 * dose usados. Devolve o recipiente a "ativo".
 */
export const higienizacao = z
  .object({
    executadoEm: z.iso.datetime({ offset: true, message: 'Informe data e hora' }),
    responsavelId: uuidOpc,
    executadoPorId: uuidOpc,
    observacao: textoOpc(2000),
    cientes: z.array(z.string().max(200)).max(50).default([]),
    rascunhoId: uuidOpc,
    tipoHigienizacao: z.enum(['higienizacao', 'manutencao']),
    recipientes: z.array(z.uuid()).min(1, 'Escolha o recipiente').max(100),
    produto: textoOpc(200),
    dose: textoOpc(100),
  })
  .refine((d) => unicos(d.recipientes), {
    path: ['recipientes'],
    message: 'O mesmo recipiente aparece duas vezes',
  })

// Inventário da cantina (cantina.md, Inventário; 03-modelo-de-dados.md, 2.5) --------------------

/** Nova contagem: data e hora e, se quiser, só os recipientes de um local. */
export const novoInventario = z.object({
  contadoEm: z.iso.datetime({ offset: true, message: 'Informe data e hora' }),
  localId: uuidOpc,
  observacao: textoOpc(2000),
})

/** Contagem salva: o medido de cada recipiente (vazio = não contado) e o motivo da diferença. */
export const contagemInventario = z.object({
  versao: z.number().int(),
  contadoEm: z.iso.datetime({ offset: true, message: 'Informe data e hora' }),
  observacao: textoOpc(2000),
  itens: z
    .array(
      z.object({
        recipienteId: z.uuid(),
        volumeMedido: decimalOpc(2, 'Volume inválido'),
        motivo: textoOpc(500),
      }),
    )
    .max(2000),
})

/** Confirmação: os ajustes saem de uma vez, numa só operação (cantina.md, Inventário). */
export const confirmarInventario = z.object({
  cientes: z.array(z.string().max(200)).max(2000).default([]),
  responsavelId: uuidOpc,
})

// Rascunho e estorno (cantina.md, Regras comuns das operações; 03-modelo-de-dados.md, 4.5) -------

/**
 * Rascunho: o formulário da operação salvo pela metade. Não mexe em volume nem em estoque; a
 * validação completa é feita na confirmação, com os volumes do momento.
 */
export const rascunhoOperacao = z.object({
  tipo: z.enum(CHAVES_TIPO_OPERACAO).refine((t) => t !== 'estorno', 'O estorno não tem rascunho'),
  executadoEm: z.iso.datetime({ offset: true }).nullish(),
  projetoId: uuidOpc,
  observacao: textoOpc(2000),
  formulario: z
    .record(z.string(), z.unknown())
    .refine((f) => JSON.stringify(f).length <= 200_000, 'Rascunho grande demais'),
  versao: z.number().int().optional(),
})

export const estornoOperacao = z.object({
  motivo: z.string().trim().min(3, 'Informe o motivo').max(500),
})

// Engarrafamento (cantina.md, Engarrafamento; 03-modelo-de-dados.md, 2.5) ----------------------

const garrafas = z.number().int().min(0, 'Garrafas inválidas').max(10_000_000, 'Garrafas inválidas')

/** Previsão do envase: garrafas e materiais pela ficha de embalagem, e o que falta no estoque. */
export const previsaoEnvase = z.object({
  projetoId: z.uuid('Escolha o projeto'),
  produtoId: z.uuid('Escolha o produto'),
  /** Vazio = todos os recipientes do projeto com vinho. */
  recipientes: z.array(z.uuid()).max(200).default([]),
  /** Garrafas vazias = sugeridas pelos litros (só com um formato). */
  formatos: z
    .array(z.object({ formatoId: z.uuid(), garrafas: garrafas.nullable().optional() }))
    .min(1, 'Escolha ao menos um formato')
    .max(10),
  localMateriaisId: uuidOpc,
})

/** Ordem de engarrafamento: projeto, produto e rótulo, formatos, recipientes de origem e locais. */
export const dadosOrdemEngarrafamento = z
  .object({
    projetoId: z.uuid('Escolha o projeto'),
    produtoId: z.uuid('Escolha o produto'),
    rotuloId: uuidOpc,
    dataPrevista: z.iso.date('Informe a data prevista'),
    engarrafadoPorId: uuidOpc,
    localProdutoId: z.uuid('Escolha o local do produto acabado'),
    localMateriaisId: z.uuid('Escolha o local dos materiais'),
    formatos: z
      .array(z.object({ formatoId: z.uuid(), garrafasPrevistas: garrafas }))
      .min(1, 'Escolha ao menos um formato')
      .max(10),
    recipientes: z.array(z.uuid()).min(1, 'Escolha os recipientes de origem').max(200),
    observacao: textoOpc(2000),
    versao: z.number().int().optional(),
  })
  .refine((d) => unicos(d.formatos.map((f) => f.formatoId)), {
    path: ['formatos'],
    message: 'O mesmo formato aparece duas vezes',
  })
  .refine((d) => unicos(d.recipientes), {
    path: ['recipientes'],
    message: 'O mesmo recipiente aparece duas vezes',
  })

/**
 * Produção do dia: litros tirados de cada recipiente, garrafas por formato e o consumo real de cada
 * material (o previsto vem da ficha de embalagem). A perda de vinho é o que saiu e não foi
 * engarrafado.
 */
export const producaoEngarrafamento = z.object({
  executadoEm: z.iso.datetime({ offset: true, message: 'Informe data e hora' }),
  responsavelId: uuidOpc,
  executadoPorId: uuidOpc,
  observacao: textoOpc(2000),
  cientes: z.array(z.string().max(200)).max(100).default([]),
  recipientes: z
    .array(
      z.object({
        recipienteId: z.uuid(),
        litros: decimal(2, 'Volume inválido').refine((v) => Number(v) > 0, 'Volume inválido'),
      }),
    )
    .min(1, 'Informe os litros tirados')
    .max(200),
  formatos: z
    .array(z.object({ formatoId: z.uuid(), garrafas: garrafas.refine((g) => g > 0) }))
    .min(1, 'Informe as garrafas')
    .max(10),
  /** Consumo real; sem a linha, vale o previsto pela ficha. */
  materiais: z
    .array(
      z.object({
        itemId: z.uuid(),
        loteItemId: uuidOpc,
        real: z.string().regex(/^\d+(\.\d{1,3})?$/, 'Quantidade inválida'),
      }),
    )
    .max(100)
    .default([]),
})

// Estoque (ambiente-cliente.md, Estoque; 03-modelo-de-dados.md, 2.4) ------------------------------

const quantidadePositiva = decimal(3, 'Quantidade inválida').refine(
  (v) => Number(v) > 0,
  'Quantidade inválida',
)
const dataOpc = z.iso
  .date()
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null))

/** Lote do fabricante: o existente (pelo código) ou um novo, com fabricação e validade. */
const loteDoFabricante = z
  .object({
    codigo: z.string().trim().min(1, 'Informe o lote').max(60),
    fabricacao: dataOpc,
    validade: dataOpc,
  })
  .refine((l) => !l.fabricacao || !l.validade || l.fabricacao <= l.validade, {
    path: ['validade'],
    message: 'A validade é antes da fabricação',
  })

/** Entrada manual, com o número da nota; o XML da NF-e entra no ciclo 5. */
export const entradaEstoque = z.object({
  executadoEm: z.iso.datetime({ offset: true, message: 'Informe data e hora' }),
  localId: z.uuid('Escolha o local'),
  /** Insumo do cliente (vinificação para terceiro): fica fora do estoque próprio, com lote. */
  titularId: uuidOpc,
  documento: textoOpc(60),
  observacao: textoOpc(500),
  itens: z
    .array(
      z.object({
        itemId: z.uuid('Escolha o item'),
        quantidade: quantidadePositiva,
        lote: loteDoFabricante.nullable().optional(),
      }),
    )
    .min(1, 'Informe ao menos um item')
    .max(100),
})

/**
 * Conferência da NF-e no estoque (ambiente-cliente.md, Entrada por NF-e): cada item da nota vai a
 * um item do estoque, com a conversão para a unidade base, o local, o lote e a validade; ou é
 * descartado da importação, com o motivo.
 */
export const conferenciaNfe = z.object({
  itens: z
    .array(
      z.object({
        id: z.uuid(),
        itemEstoqueId: uuidOpc,
        /** Quantos da unidade base cabem em uma unidade da nota. */
        conversao: z
          .string()
          .regex(/^\d+(\.\d{1,6})?$/, 'Conversão inválida')
          .refine((v) => Number(v) > 0, 'Conversão inválida')
          .nullable()
          .optional()
          .or(z.literal('').transform(() => null)),
        localId: uuidOpc,
        lote: textoOpc(60),
        fabricacao: dataOpc,
        validade: dataOpc,
        /** Motivo do descarte; vazio = o item entra no estoque. */
        descartado: textoOpc(200),
      }),
    )
    .max(990),
})

/** Lançamento da nota conferida: a data da entrada e os "cientes". */
export const lancamentoNfe = z.object({
  executadoEm: z.iso.datetime({ offset: true, message: 'Informe data e hora' }),
  cientes: z.array(z.string().max(200)).max(200).default([]),
})

/**
 * Saída de produto (cantina.md, Saídas de produto): tipo da lista configurável, local, documento,
 * destinatário (vazio = consumidor não identificado) e os itens; o lote é escolhido ou sai pela
 * estratégia da empresa (Parâmetros › De qual lote sai cada garrafa).
 */
export const saidaProduto = z.object({
  tipo: z.string().min(1, 'Escolha o tipo').max(40),
  executadoEm: z.iso.datetime({ offset: true, message: 'Informe data e hora' }),
  localId: z.uuid('Escolha o local'),
  documento: textoOpc(60),
  destinatarioDocumento: z
    .string()
    .regex(/^(\d{11}|\d{14})$/, 'CPF ou CNPJ, só os números')
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  destinatarioNome: textoOpc(200),
  pessoaId: uuidOpc,
  /** Dono do produto que sai; vazio = a própria empresa (a baixa usa só os lotes dele). */
  titularId: uuidOpc,
  motivo: textoOpc(500),
  cientes: z.array(z.string().max(200)).max(100).default([]),
  itens: z
    .array(
      z.object({
        itemId: z.uuid('Escolha o produto'),
        quantidade: quantidadePositiva,
        /** Lote escolhido; vazio = pela estratégia. */
        loteItemId: uuidOpc,
      }),
    )
    .min(1, 'Informe ao menos um item')
    .max(200),
})

/** Devolução de uma saída: as garrafas voltam ao mesmo lote, no local escolhido. */
export const devolucaoSaida = z.object({
  executadoEm: z.iso.datetime({ offset: true, message: 'Informe data e hora' }),
  documento: textoOpc(60),
  motivo: textoOpc(500),
  itens: z
    .array(
      z.object({
        baixaId: z.uuid(),
        quantidade: quantidadePositiva,
        localId: z.uuid('Escolha o local'),
        avariada: z.boolean().default(false),
      }),
    )
    .min(1, 'Informe o que voltou')
    .max(200),
})

/** Ajuste de inventário (± a diferença) ou descarte (vencido, avariado), com motivo. */
export const ajusteEstoque = z.object({
  executadoEm: z.iso.datetime({ offset: true, message: 'Informe data e hora' }),
  tipo: z.enum(['ajuste_inventario', 'descarte']),
  localId: z.uuid('Escolha o local'),
  itemId: z.uuid('Escolha o item'),
  loteItemId: uuidOpc,
  /** No ajuste, com sinal; no descarte, a quantidade que sai. */
  quantidade: z
    .string()
    .regex(/^-?\d+(\.\d{1,3})?$/, 'Quantidade inválida')
    .refine((v) => Number(v) !== 0, 'Quantidade inválida'),
  motivo: z.string().trim().min(3, 'Informe o motivo').max(500),
})

/** Transferência entre locais do mesmo estabelecimento. */
export const transferenciaEstoque = z
  .object({
    executadoEm: z.iso.datetime({ offset: true, message: 'Informe data e hora' }),
    origemLocalId: z.uuid('Escolha o local de origem'),
    destinoLocalId: z.uuid('Escolha o local de destino'),
    itens: z
      .array(
        z.object({
          itemId: z.uuid('Escolha o item'),
          loteItemId: uuidOpc,
          quantidade: quantidadePositiva,
        }),
      )
      .min(1, 'Informe ao menos um item')
      .max(100),
  })
  .refine((d) => d.origemLocalId !== d.destinoLocalId, {
    path: ['destinoLocalId'],
    message: 'Escolha outro local',
  })

/**
 * Transferência de titularidade a granel (cantina.md, Mistura entre titulares; Pagamento em
 * produto): os litros passam do lote de um titular para um lote de outro, do mesmo projeto. Total
 * no próprio recipiente (litros vazios) ou parcial para outro recipiente, vazio ou com vinho do
 * novo titular (parcial no mesmo recipiente misturaria titulares).
 */
export const titularidade = z.object({
  ...comumOperacao,
  motivo: z.enum(CHAVES_MOTIVO_TITULARIDADE, 'Escolha o motivo'),
  contratoId: uuidOpc,
  /** Novo titular; vazio = a própria empresa. */
  paraTitularId: uuidOpc,
  itens: z
    .array(
      z.object({
        origemId: z.uuid('Escolha o recipiente'),
        /** Vazio = todo o saldo do recipiente. */
        litros: litrosOpc,
        /** Vazio = o próprio recipiente (transferência total). */
        destinoId: uuidOpc,
        lote: loteDestino,
      }),
    )
    .min(1, 'Escolha ao menos um recipiente')
    .max(30),
})
