// Regras versionadas (P16) e "ciente" (P29). A regra vale pela data do fato (a data de execução
// da operação, a chegada da uva), não pela data do lançamento. O sistema informa; não impede.
import { and, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm'
import type { Tx } from '../db/cliente'
import * as s from '../db/schema'
import { ErroRegra } from './erros'
import type { ContextoEmpresa } from './requisicao'

export type Regra = typeof s.regraRegulatoria.$inferSelect

/** Aviso que pede "ciente" para confirmar (P29). */
export interface Aviso {
  codigo: string
  mensagem: string
  regraId?: string | null
  valorApurado?: string | null
  limite?: string | null
  /** Norma citada, para a tela. */
  fonte?: string | null
}

/** Fonte legal no formato da tela: "Decreto 12.709/2025, art. 93". */
export function fonteDaRegra(r: Regra): string {
  return [r.fonteNorma, r.fonteArtigo].filter(Boolean).join(', ')
}

/**
 * Versões vigentes na data, da mais específica para a mais geral: IG, depois UF, depois a
 * nacional. Quem chama decide se usa só a primeira ou a mais exigente.
 */
export async function regrasVigentes(
  tx: Tx,
  chave: string,
  local: { data: string; uf?: string | null; igs?: string[] },
): Promise<Regra[]> {
  const igs = local.igs ?? []
  const linhas = await tx
    .select()
    .from(s.regraRegulatoria)
    .where(
      and(
        eq(s.regraRegulatoria.chave, chave),
        lte(s.regraRegulatoria.vigenteDesde, local.data),
        or(isNull(s.regraRegulatoria.vigenteAte), gte(s.regraRegulatoria.vigenteAte, local.data)),
        or(
          eq(s.regraRegulatoria.abrangencia, 'nacional'),
          local.uf
            ? and(
                eq(s.regraRegulatoria.abrangencia, 'uf'),
                eq(s.regraRegulatoria.abrangenciaCodigo, local.uf),
              )
            : sql`false`,
          igs.length
            ? and(
                eq(s.regraRegulatoria.abrangencia, 'ig'),
                sql`${s.regraRegulatoria.abrangenciaCodigo} in (${sql.join(
                  igs.map((i) => sql`${i}`),
                  sql`, `,
                )})`,
              )
            : sql`false`,
        ),
      ),
    )
    .orderBy(desc(s.regraRegulatoria.vigenteDesde))
  const peso = { ig: 0, uf: 1, nacional: 2 } as const
  // Por abrangência, só a versão mais recente vale.
  const vistas = new Set<string>()
  return linhas
    .filter((r) => {
      const k = `${r.abrangencia}|${r.abrangenciaCodigo ?? ''}`
      if (vistas.has(k)) return false
      vistas.add(k)
      return true
    })
    .sort((a, b) => peso[a.abrangencia] - peso[b.abrangencia])
}

export async function regraVigente(
  tx: Tx,
  chave: string,
  local: { data: string; uf?: string | null; igs?: string[] },
): Promise<Regra | null> {
  return (await regrasVigentes(tx, chave, local))[0] ?? null
}

/** Sem o "ciente" de todos os avisos, não confirma: devolve a lista para a tela. */
export function exigirCientes(avisos: Aviso[], cientes: string[]): void {
  if (avisos.some((a) => !cientes.includes(a.codigo))) {
    throw new ErroRegra('Confirme que está ciente dos avisos.', 'ciente_pendente', { avisos })
  }
}

/** Grava cada aviso com o "ciente" de quem confirmou (P29), ligado ao registro. */
export async function gravarOcorrencias(
  ctx: ContextoEmpresa,
  registro: { entidade: string; registroId: string; estabelecimentoId: string | null },
  avisos: Aviso[],
): Promise<void> {
  if (!avisos.length) return
  const agora = new Date()
  await ctx.tx.insert(s.ocorrenciaRegra).values(
    avisos.map((a) => ({
      empresaId: ctx.empresaId,
      estabelecimentoId: registro.estabelecimentoId,
      entidade: registro.entidade,
      registroId: registro.registroId,
      regraId: a.regraId ?? null,
      codigo: a.codigo,
      mensagem: a.mensagem,
      valorApurado: a.valorApurado ?? null,
      limite: a.limite ?? null,
      cienteEm: agora,
      cientePor: ctx.usuarioId,
      criadoPor: ctx.usuarioId,
    })),
  )
}
