// Trava do período (P13; cantina.md, Declarações e fechamento): nenhum lançamento com data num mês
// fechado do estabelecimento nem num ano com a declaração anual entregue ao MAPA (fora de uma
// retificação aberta). O mês e o ano são os do fuso do estabelecimento.
import { sql } from 'drizzle-orm';
import type { Tx } from '../db/cliente';
import { ErroRegra } from './erros';

/** Mensagem do mês fechado (ou do ano declarado) em que a data cai, ou nada se está aberto. */
export async function mesFechado(
  tx: Tx,
  estabelecimentoId: string,
  data: Date,
): Promise<string | null> {
  const r = await tx.execute<{ ano: number; mes: number }>(sql`
    select f.ano, f.mes from fechamento_mensal f join estabelecimento e on e.id = f.estabelecimento_id
    where f.estabelecimento_id = ${estabelecimentoId} and f.situacao = 'fechado'
      and f.ano = extract(year from (${data.toISOString()}::timestamptz at time zone e.fuso))
      and f.mes = extract(month from (${data.toISOString()}::timestamptz at time zone e.fuso))`);
  const f = r.rows[0];
  if (f)
    return `O mês ${String(f.mes).padStart(2, '0')}/${f.ano} está fechado: reabra-o para lançar com esta data.`;
  const d = await tx.execute<{ ano: number }>(sql`
    select d.ano from declaracao d join estabelecimento e on e.id = d.estabelecimento_id
    where d.estabelecimento_id = ${estabelecimentoId} and d.tipo = 'anual_mapa'
      and d.situacao in ('declarada', 'retificada')
      and d.ano = extract(year from (${data.toISOString()}::timestamptz at time zone e.fuso))`);
  const a = d.rows[0];
  return a
    ? `O ano de ${a.ano} já foi declarado ao MAPA: abra uma retificação para lançar com esta data.`
    : null;
}

export async function exigirMesAberto(
  tx: Tx,
  estabelecimentoId: string,
  data: Date,
): Promise<void> {
  const m = await mesFechado(tx, estabelecimentoId, data);
  if (m) throw new ErroRegra(m, 'periodo_fechado');
}
