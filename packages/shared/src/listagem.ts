// Parâmetros e resposta padrão das listagens (P4).
import { z } from 'zod'

export const TAMANHOS_PAGINA = [10, 20, 50, 100] as const
/** "Tudo" é representado por 0. */
export const TAMANHO_TUDO = 0
export const TAMANHO_PADRAO = 10
/** Teto de segurança para "Tudo". */
export const LIMITE_TUDO = 5000

export const consultaListagem = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  tamanho: z.coerce
    .number()
    .int()
    .refine((n) => n === TAMANHO_TUDO || (TAMANHOS_PAGINA as readonly number[]).includes(n), {
      message: 'Tamanho de página inválido',
    })
    .default(TAMANHO_PADRAO),
  ordem: z.string().max(60).optional(),
  direcao: z.enum(['asc', 'desc']).optional(),
  busca: z.string().trim().max(200).optional(),
})

export type ConsultaListagem = z.infer<typeof consultaListagem>

export interface RespostaListagem<T> {
  itens: T[]
  total: number
  pagina: number
  tamanho: number
}

export const preferenciaListagem = z.object({
  ordem: z.string().max(60).nullable(),
  direcao: z.enum(['asc', 'desc']).nullable(),
  tamanho: z.number().int(),
  filtros: z.record(z.string(), z.unknown()),
})

export type PreferenciaListagem = z.infer<typeof preferenciaListagem>
