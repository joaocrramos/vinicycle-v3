// Catálogos globais com itens próprios que a empresa edita (P8, P29): o que cada um tem, quem pode
// alterar e as regras de validação, iguais na tela e na API.
import { z } from 'zod'
import { CORES_UVA, LISTAS, type Lista, LISTAS_OFICIAIS, TIPOS_UVA } from './dominios'

const nome = z.string().trim().min(1, 'Informe o nome').max(120)

export const esquemasCatalogo = {
  tipo_recipiente: z.object({
    nome,
    pressurizado: z.boolean().default(false),
    eBarrica: z.boolean().default(false),
  }),
  tipo_insumo: z.object({
    nome,
    unidades: z.array(z.string().max(20)).min(1, 'Escolha pelo menos uma unidade').max(20),
    apresentacoes: z.array(z.string().max(40)).max(20).default([]),
  }),
  tipo_documento: z.object({
    nome,
    temVencimento: z.boolean().default(true),
    avisosDias: z.array(z.number().int().min(1).max(730)).max(10).default([60, 30, 7]),
  }),
  variedade: z.object({
    nome,
    tipo: z.enum(TIPOS_UVA),
    cor: z.enum(CORES_UVA),
    sinonimos: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  }),
  opcao: z.object({
    nome,
    ordem: z.number().int().min(0).max(10000).default(100),
  }),
} as const

export type Catalogo = Exclude<keyof typeof esquemasCatalogo, 'opcao'> | `opcao:${Lista}`

/** Quem altera cada catálogo (P27). As listas oficiais (cores, açúcar, conselhos) só a plataforma. */
export function funcionalidadeDoCatalogo(catalogo: Catalogo): string {
  if (catalogo === 'tipo_documento') return 'gestao.documentos'
  if (catalogo === 'opcao:cargo' || catalogo === 'opcao:categoria_fornecimento')
    return 'gestao.pessoas'
  return 'enotrace.cadastros'
}

export function catalogoValido(valor: string): valor is Catalogo {
  if (valor.startsWith('opcao:')) return valor.slice(6) in LISTAS
  return valor in esquemasCatalogo && valor !== 'opcao'
}

export function listaOficial(catalogo: Catalogo): boolean {
  return catalogo.startsWith('opcao:') && LISTAS_OFICIAIS.includes(catalogo.slice(6) as Lista)
}

export function esquemaDoCatalogo(catalogo: Catalogo) {
  return catalogo.startsWith('opcao:')
    ? esquemasCatalogo.opcao
    : esquemasCatalogo[catalogo as keyof typeof esquemasCatalogo]
}

/** Na Administração › Catálogos, a variedade global tem também o código oficial (SISDEVIN). */
export function esquemaDoCatalogoPlataforma(catalogo: Catalogo) {
  return catalogo === 'variedade'
    ? esquemasCatalogo.variedade.extend({
        codigoOficial: z
          .string()
          .trim()
          .max(20)
          .nullable()
          .default(null)
          .transform((v) => v || null),
      })
    : esquemaDoCatalogo(catalogo)
}

export const NOMES_CATALOGO: Record<Exclude<keyof typeof esquemasCatalogo, 'opcao'>, string> = {
  tipo_recipiente: 'Tipos de recipiente',
  tipo_insumo: 'Tipos de insumo',
  tipo_documento: 'Tipos de documento',
  variedade: 'Variedades',
}

export function nomeDoCatalogo(catalogo: Catalogo): string {
  return catalogo.startsWith('opcao:')
    ? LISTAS[catalogo.slice(6) as Lista]
    : NOMES_CATALOGO[catalogo as keyof typeof NOMES_CATALOGO]
}
