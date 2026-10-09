// Bloco cadastral padrão (P2): o mesmo para empresa, estabelecimento, pessoa e usuário.
import { z } from 'zod';
import { cnpjValido, cpfValido, limparDocumento } from './documentos';

export const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE',
  'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const; // prettier-ignore

export const TIPOS_PESSOA = ['fisica', 'juridica', 'estrangeira'] as const;
export type TipoPessoa = (typeof TIPOS_PESSOA)[number];

export const ROTULOS_ENDERECO = ['principal', 'cobranca', 'entrega', 'propriedade_rural'] as const;
export const TIPOS_CONTATO = ['email', 'telefone', 'rede'] as const;
export const REDES = [
  'instagram',
  'facebook',
  'linkedin',
  'tiktok',
  'youtube',
  'x',
  'outra',
] as const;

const vazioParaNulo = (v: unknown) => (v === '' ? null : v);

/** "Isento" é aceito nas inscrições estadual e municipal (P2). */
export const ISENTO = 'ISENTO';

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export function telefoneValido(valor: string): boolean {
  const d = valor.replace(/\D/g, '');
  if (valor.trim().startsWith('+') && !d.startsWith('55')) return d.length >= 8 && d.length <= 15;
  const nacional = d.startsWith('55') && d.length > 11 ? d.slice(2) : d;
  return /^[1-9]{2}\d{8,9}$/.test(nacional);
}

/** Telefone em formato E.164 ("+5574999998888"). */
export function normalizarTelefone(valor: string): string {
  const d = valor.replace(/\D/g, '');
  if (valor.trim().startsWith('+')) return `+${d}`;
  return d.startsWith('55') && d.length > 11 ? `+${d}` : `+55${d}`;
}

export function formatarTelefone(e164: string): string {
  const d = e164.replace(/\D/g, '');
  if (!d.startsWith('55')) return e164;
  const n = d.slice(2);
  const ddd = n.slice(0, 2);
  const resto = n.slice(2);
  const meio = resto.length === 9 ? resto.slice(0, 5) : resto.slice(0, 4);
  const fim = resto.slice(meio.length);
  return `+55 (${ddd}) ${meio}-${fim}`;
}

export const enderecoEntrada = z.object({
  id: z.uuid().optional(),
  rotulo: z.enum(ROTULOS_ENDERECO),
  cep: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => /^\d{8}$/.test(v), 'CEP deve ter 8 dígitos'),
  logradouro: z.string().trim().min(1, 'Informe o logradouro').max(200),
  numero: z.string().trim().min(1, 'Informe o número (ou S/N)').max(20),
  complemento: textoOpcional(100),
  bairro: z.string().trim().max(100).default(''),
  municipio: z.string().trim().min(1, 'Informe o município').max(100),
  codigoIbge: z.preprocess(
    vazioParaNulo,
    z
      .string()
      .regex(/^\d{7}$/, 'Código IBGE deve ter 7 dígitos')
      .nullable()
      .optional(),
  ),
  uf: z.enum(UFS),
  principal: z.boolean().default(false),
});

export const contatoEntrada = z
  .object({
    id: z.uuid().optional(),
    tipo: z.enum(TIPOS_CONTATO),
    rotulo: z.string().trim().max(50).default(''),
    valor: z.string().trim().min(1).max(200),
    whatsapp: z.boolean().default(false),
    rede: z.enum(REDES).nullable().optional(),
    principal: z.boolean().default(false),
  })
  .superRefine((c, ctx) => {
    if (c.tipo === 'email' && !z.email().safeParse(c.valor).success) {
      ctx.addIssue({ code: 'custom', path: ['valor'], message: 'E-mail inválido' });
    }
    if (c.tipo === 'telefone' && !telefoneValido(c.valor)) {
      ctx.addIssue({ code: 'custom', path: ['valor'], message: 'Telefone inválido' });
    }
    if (c.tipo === 'rede' && !c.rede) {
      ctx.addIssue({ code: 'custom', path: ['rede'], message: 'Informe a rede social' });
    }
  })
  .transform((c) => (c.tipo === 'telefone' ? { ...c, valor: normalizarTelefone(c.valor) } : c));

export const fichaEntrada = z
  .object({
    tipoPessoa: z.enum(TIPOS_PESSOA),
    nome: z.string().trim().min(1, 'Informe o nome').max(200),
    nomeFantasia: textoOpcional(200),
    documento: z
      .string()
      .transform((v) => limparDocumento(v))
      .nullable()
      .optional()
      .transform((v) => (v ? v : null)),
    pais: z.preprocess(
      (v) => (typeof v === 'string' ? vazioParaNulo(v.trim().toUpperCase()) : v),
      z
        .string()
        .regex(/^[A-Z]{2}$/, 'Use a sigla de 2 letras do país')
        .nullable()
        .optional(),
    ),
    inscricaoEstadual: textoOpcional(30),
    inscricaoMunicipal: textoOpcional(30),
    site: z
      .url('Endereço do site inválido')
      .max(300)
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
    observacoes: textoOpcional(4000),
    avatarCor: z.string().max(20).nullable().optional(),
    enderecos: z.array(enderecoEntrada).max(20).default([]),
    contatos: z.array(contatoEntrada).max(50).default([]),
  })
  .superRefine((f, ctx) => {
    if (f.documento) {
      if (f.tipoPessoa === 'fisica' && !cpfValido(f.documento)) {
        ctx.addIssue({ code: 'custom', path: ['documento'], message: 'CPF inválido' });
      }
      if (f.tipoPessoa === 'juridica' && !cnpjValido(f.documento)) {
        ctx.addIssue({ code: 'custom', path: ['documento'], message: 'CNPJ inválido' });
      }
    }
    if (f.tipoPessoa === 'estrangeira' && !f.pais) {
      ctx.addIssue({ code: 'custom', path: ['pais'], message: 'Informe o país' });
    }
    if (f.enderecos.filter((e) => e.principal).length > 1) {
      ctx.addIssue({ code: 'custom', path: ['enderecos'], message: 'Só um endereço principal' });
    }
    if (f.contatos.filter((c) => c.tipo === 'email' && c.principal).length > 1) {
      ctx.addIssue({ code: 'custom', path: ['contatos'], message: 'Só um e-mail principal' });
    }
  });

export type FichaEntrada = z.input<typeof fichaEntrada>;
export type Ficha = z.output<typeof fichaEntrada>;

/** Ficha que exige documento (empresa, estabelecimento). */
export const fichaComDocumento = fichaEntrada.refine((f) => !!f.documento, {
  path: ['documento'],
  message: 'Informe o documento',
});

export function tipoDocumentoDaPessoa(tipo: TipoPessoa): 'cpf' | 'cnpj' | 'outro' {
  return tipo === 'fisica' ? 'cpf' : tipo === 'juridica' ? 'cnpj' : 'outro';
}
