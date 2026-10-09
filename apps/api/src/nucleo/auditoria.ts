// Auditoria (P14; 03-modelo-de-dados.md, 1.5). Gravada na mesma transação da mudança.
import type { Tx } from '../db/cliente';
import { auditoria } from '../db/schema';

/** Quem, de onde e em que empresa: o mesmo em todo registro da requisição. */
export interface Origem {
  usuarioId: string | null;
  personificadoId?: string | null;
  personificacaoId?: string | null;
  empresaId: string | null;
  estabelecimentoId?: string | null;
  ip?: string | null;
  navegador?: string | null;
  requisicaoId?: string | null;
}

export interface Evento {
  acao: string;
  entidade?: string;
  registroId?: string | null;
  antes?: Record<string, unknown> | null;
  depois?: Record<string, unknown> | null;
  dados?: Record<string, unknown>;
  motivo?: string | null;
  /** Empresa do registro, quando difere da empresa ativa (ex.: Administração). */
  empresaId?: string | null;
}

/** Campos que nunca vão para a auditoria. */
const OCULTOS = new Set([
  'senhaHash',
  'tokenHash',
  'totpSegredoCifrado',
  'atualizadoEm',
  'atualizadoPor',
  'versao',
  'criadoEm',
  'criadoPor',
]);

function normalizar(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return undefined;
  return v ?? null;
}

/** Diferença campo a campo: { campo: [antes, depois] }. Inclusão e exclusão também. */
export function diferenca(
  antes: Record<string, unknown> | null | undefined,
  depois: Record<string, unknown> | null | undefined,
): Record<string, [unknown, unknown]> | null {
  const campos = new Set([...Object.keys(antes ?? {}), ...Object.keys(depois ?? {})]);
  const r: Record<string, [unknown, unknown]> = {};
  for (const c of campos) {
    if (OCULTOS.has(c)) continue;
    const a = normalizar(antes?.[c]);
    const d = normalizar(depois?.[c]);
    if (a === undefined && d === undefined) continue;
    if (JSON.stringify(a) !== JSON.stringify(d)) r[c] = [a ?? null, d ?? null];
  }
  return Object.keys(r).length ? r : null;
}

export async function auditar(tx: Tx, origem: Origem, evento: Evento): Promise<void> {
  await tx.insert(auditoria).values({
    usuarioId: origem.usuarioId,
    personificadoId: origem.personificadoId ?? null,
    personificacaoId: origem.personificacaoId ?? null,
    empresaId: evento.empresaId !== undefined ? evento.empresaId : origem.empresaId,
    estabelecimentoId: origem.estabelecimentoId ?? null,
    acao: evento.acao,
    entidade: evento.entidade ?? null,
    registroId: evento.registroId ?? null,
    diferenca:
      evento.antes !== undefined || evento.depois !== undefined
        ? diferenca(evento.antes, evento.depois)
        : null,
    dados: evento.dados ?? null,
    motivo: evento.motivo ?? null,
    ip: origem.ip ?? null,
    navegador: origem.navegador ?? null,
    requisicaoId: origem.requisicaoId ?? null,
  });
}
