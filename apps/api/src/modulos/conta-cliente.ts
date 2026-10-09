// EnoTrace › Terceiros › Conta do cliente (04, roteiro do ciclo 10, bloco 3): o que a cantina
// recebeu, elaborou, guarda, devolveu e reteve de cada cliente de vinificação, por safra, com o
// rendimento e as perdas comparados com a perda tolerada do contrato (acima dela, alerta).
// Volumes pelo livro de volumes (operações confirmadas, sem os estornos); garrafas e insumos pelo
// livro do estoque (lotes com o titular).
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as s from '../db/schema';
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao';
import { transferenciaValida } from './titularidade';

const n = (v: unknown) => Number(v ?? 0);
const l2 = (v: number) => v.toFixed(2);

export interface SafraConta {
  safra: number | null;
  uvaKg: string;
  mostoElaborado: string;
  granelRecebido: string;
  perdas: string;
  engarrafado: string;
  devolvidoGranel: string;
  outrasSaidasGranel: string;
  transferidoGranel: string;
  emElaboracao: string;
  rendimento: string | null;
  perdaPercentual: string | null;
  foraDaTolerancia: string | null;
}

export interface ContaCliente {
  titularId: string;
  titular: string;
  contrato: null | {
    id: string;
    numero: string | null;
    perdaToleradaTipo: string | null;
    perdaToleradaValor: string | null;
    pagamentoProdutoValor: string | null;
    pagamentoProdutoUnidade: string | null;
  };
  safras: SafraConta[];
  garrafas: {
    emEstoque: number;
    litrosEmEstoque: string;
    devolvidas: number;
    entreguesPorOrdem: number;
  };
  transferencias: {
    pagamentoLitros: string;
    pagamentoGarrafas: number;
    vendidoLitros: string;
    vendidoGarrafas: number;
    recebidoLitros: string;
    recebidoGarrafas: number;
  };
  insumos: Array<{
    item: string;
    unidade: string;
    recebido: string;
    usado: string;
    devolvido: string;
    saldo: string;
  }>;
  faltaDevolverLitros: string;
}

/** Contas dos clientes de vinificação (um titular, ou todos os que têm movimento). */
export async function contasDosClientes(
  ctx: ContextoEmpresa,
  o: { titularId?: string | null } = {},
): Promise<ContaCliente[]> {
  const e = ctx.empresaId;
  const estabs = await ctx.estabelecimentosPermitidos();
  if (!estabs.length) return [];
  const emEstabs = sql.raw(`(${estabs.map((x) => `'${x}'`).join(',')})`);
  const doTitular = (coluna: string) =>
    o.titularId ? sql`and ${sql.raw(coluna)} = ${o.titularId}` : sql``;

  // Titulares com algum registro: lote, romaneio, lote de estoque ou transferência.
  const titulares = await ctx.tx.execute<{ id: string; nome: string }>(sql`
    select p.id, f.nome from pessoa p join ficha f on f.id = p.ficha_id
    where p.empresa_id = ${e} ${o.titularId ? sql`and p.id = ${o.titularId}` : sql``}
      and (exists (select 1 from lote l where l.titular_id = p.id and l.estabelecimento_id in ${emEstabs})
        or exists (select 1 from romaneio r where r.dono_uva_id = p.id and r.situacao = 'confirmado' and r.estabelecimento_id in ${emEstabs})
        or exists (select 1 from lote_item li where li.titular_id = p.id and li.estabelecimento_id in ${emEstabs})
        or exists (select 1 from transferencia_titularidade t where (t.de_titular_id = p.id or t.para_titular_id = p.id) and t.estabelecimento_id in ${emEstabs}))
    order by f.nome`);
  if (!titulares.rows.length) return [];

  const uva = await ctx.tx.execute<{ titular: string; safra: number | null; kg: string }>(sql`
    select r.dono_uva_id as titular, i.safra, sum(p.bruto_kg - p.tara_kg)::text as kg
    from romaneio r join romaneio_item i on i.romaneio_id = r.id join pesagem p on p.item_id = i.id
    where r.empresa_id = ${e} and r.situacao = 'confirmado' and r.dono_uva_id is not null
      and r.estabelecimento_id in ${emEstabs} ${doTitular('r.dono_uva_id')}
    group by r.dono_uva_id, i.safra`);

  // Movimentos válidos (operação confirmada, sem os estornos) dos lotes de cada titular, por tipo.
  const volumes = await ctx.tx.execute<{
    titular: string;
    safra: number | null;
    tipo: string;
    granel: string | null;
    litros: string;
  }>(sql`
    select l.titular_id as titular,
      l.safra,
      m.tipo, g.tipo as granel, sum(m.litros)::text as litros
    from movimento_volume m join lote l on l.id = m.lote_id join operacao o on o.id = m.operacao_id
      left join operacao_granel g on g.operacao_id = o.id
    where m.empresa_id = ${e} and l.titular_id is not null and o.situacao = 'confirmada'
      and o.tipo <> 'estorno' and m.estabelecimento_id in ${emEstabs} ${doTitular('l.titular_id')}
    group by 1, 2, 3, 4`);
  // Saldo atual (todos os lançamentos, estornos inclusive).
  const saldos = await ctx.tx.execute<{
    titular: string;
    safra: number | null;
    litros: string;
  }>(sql`
    select l.titular_id as titular,
      l.safra,
      sum(m.litros)::text as litros
    from movimento_volume m join lote l on l.id = m.lote_id
    where m.empresa_id = ${e} and l.titular_id is not null and m.estabelecimento_id in ${emEstabs}
      ${doTitular('l.titular_id')}
    group by 1, 2`);

  // Garrafas do titular no estoque e as que saíram para ele ou por ordem dele.
  const garrafas = await ctx.tx.execute<{ titular: string; garrafas: string; ml: string }>(sql`
    select li.titular_id as titular, sum(m.quantidade)::text as garrafas,
      sum(m.quantidade * f.volume_ml)::text as ml
    from movimento_estoque m join lote_item li on li.id = m.lote_item_id
      join produto_formato f on f.item_estoque_id = li.item_id
    where m.empresa_id = ${e} and li.titular_id is not null and m.estabelecimento_id in ${emEstabs}
      ${doTitular('li.titular_id')}
    group by li.titular_id`);
  const saidas = await ctx.tx.execute<{ titular: string; tipo: string; garrafas: string }>(sql`
    select sa.titular_id as titular, sa.tipo, sum(b.quantidade)::text as garrafas
    from saida sa join saida_item si on si.saida_id = sa.id join saida_baixa b on b.saida_item_id = si.id
      join produto_formato f on f.item_estoque_id = si.item_id
    where sa.empresa_id = ${e} and sa.situacao = 'lancada' and sa.titular_id is not null
      and sa.tipo in ('devolucao_titular', 'entrega_ordem_titular') and sa.estabelecimento_id in ${emEstabs}
      ${doTitular('sa.titular_id')}
    group by sa.titular_id, sa.tipo`);

  const transferencias = await ctx.tx.execute<{
    de: string | null;
    para: string | null;
    motivo: string;
    litros: string;
    garrafas: string;
  }>(sql`
    select de_titular_id as de, para_titular_id as para, motivo,
      sum(litros)::text as litros, sum(garrafas)::text as garrafas
    from transferencia_titularidade
    where transferencia_titularidade.empresa_id = ${e} and estabelecimento_id in ${emEstabs} and ${transferenciaValida}
    group by 1, 2, 3`);

  // Insumos do cliente: lotes de itens que não são produto acabado.
  const insumos = await ctx.tx.execute<{
    titular: string;
    item: string;
    unidade: string;
    tipo: string;
    saida: string | null;
    quantidade: string;
  }>(sql`
    select li.titular_id as titular, i.nome as item, i.unidade_base as unidade, m.tipo,
      (select sa.tipo from saida_baixa b join saida_item si on si.id = b.saida_item_id join saida sa on sa.id = si.saida_id where b.movimento_id = m.id) as saida,
      sum(m.quantidade)::text as quantidade
    from movimento_estoque m join lote_item li on li.id = m.lote_item_id join item_estoque i on i.id = li.item_id
    where m.empresa_id = ${e} and li.titular_id is not null and i.tipo <> 'produto_acabado'
      and m.estabelecimento_id in ${emEstabs} ${doTitular('li.titular_id')}
    group by li.titular_id, i.nome, i.unidade_base, m.tipo, saida
    order by i.nome`);

  const contratos = await ctx.tx
    .select()
    .from(s.contratoTerceirizacao)
    .where(
      and(
        eq(s.contratoTerceirizacao.empresaId, e),
        eq(s.contratoTerceirizacao.sentido, 'prestamos'),
        eq(s.contratoTerceirizacao.ativo, true),
      ),
    )
    .orderBy(sql`${s.contratoTerceirizacao.vigenciaInicio} desc`);

  return titulares.rows.map((t) => {
    const contrato = contratos.find((c) => c.contraparteId === t.id) ?? null;
    const safrasIds = [
      ...new Set([
        ...uva.rows.filter((x) => x.titular === t.id).map((x) => x.safra),
        ...volumes.rows.filter((x) => x.titular === t.id).map((x) => x.safra),
        ...saldos.rows.filter((x) => x.titular === t.id).map((x) => x.safra),
      ]),
    ].sort((a, b) => (b ?? 0) - (a ?? 0));
    const safras = safrasIds.map((safra): SafraConta => {
      const v = (tipos: string[], granel?: (g: string | null) => boolean) =>
        volumes.rows
          .filter(
            (x) =>
              x.titular === t.id &&
              x.safra === safra &&
              tipos.includes(x.tipo) &&
              (!granel || granel(x.granel)),
          )
          .reduce((a, x) => a + n(x.litros), 0);
      const uvaKg = uva.rows
        .filter((x) => x.titular === t.id && x.safra === safra)
        .reduce((a, x) => a + n(x.kg), 0);
      const mosto = v([
        'entrada_mosto',
        'ajuste_prensagem',
        'saida_prensagem',
        'entrada_prensagem',
      ]);
      const granel = v(['entrada_granel']);
      const perdas = -v(['perda', 'evaporacao', 'ajuste_inventario']);
      const engarrafado = -v(['engarrafamento', 'tiragem']);
      const devolvido = -v(['saida_granel'], (g) => g === 'devolucao_titular');
      const outras = -v(['saida_granel'], (g) => g !== 'devolucao_titular');
      const transferido = -v(['saida_titularidade']);
      const emElaboracao = saldos.rows
        .filter((x) => x.titular === t.id && x.safra === safra)
        .reduce((a, x) => a + n(x.litros), 0);
      const rendimento = uvaKg > 0 && mosto > 0 ? mosto / uvaKg : null;
      const base = mosto + granel;
      const perdaPercentual = base > 0 ? (perdas / base) * 100 : null;
      let fora: string | null = null;
      if (contrato?.perdaToleradaTipo === 'percentual' && perdaPercentual !== null) {
        if (perdaPercentual > n(contrato.perdaToleradaValor))
          fora = `Perda de ${perdaPercentual.toFixed(2).replace('.', ',')}%, acima da tolerada de ${n(contrato.perdaToleradaValor).toString().replace('.', ',')}%.`;
      } else if (contrato?.perdaToleradaTipo === 'rendimento_minimo' && rendimento !== null) {
        if (rendimento < n(contrato.perdaToleradaValor))
          fora = `Rendimento de ${rendimento.toFixed(3).replace('.', ',')} L/kg, abaixo do mínimo de ${n(contrato.perdaToleradaValor).toString().replace('.', ',')} L/kg.`;
      }
      return {
        safra,
        uvaKg: uvaKg.toFixed(1),
        mostoElaborado: l2(mosto),
        granelRecebido: l2(granel),
        perdas: l2(perdas),
        engarrafado: l2(engarrafado),
        devolvidoGranel: l2(devolvido),
        outrasSaidasGranel: l2(outras),
        transferidoGranel: l2(transferido),
        emElaboracao: l2(emElaboracao),
        rendimento: rendimento === null ? null : rendimento.toFixed(3),
        perdaPercentual: perdaPercentual === null ? null : perdaPercentual.toFixed(2),
        foraDaTolerancia: fora,
      };
    });
    const g = garrafas.rows.find((x) => x.titular === t.id);
    const saiu = (tipo: string) =>
      saidas.rows
        .filter((x) => x.titular === t.id && x.tipo === tipo)
        .reduce((a, x) => a + n(x.garrafas), 0);
    const tr = (f: (x: (typeof transferencias.rows)[number]) => boolean) => {
      const r = transferencias.rows.filter(f);
      return {
        litros: l2(r.reduce((a, x) => a + n(x.litros), 0)),
        garrafas: r.reduce((a, x) => a + n(x.garrafas), 0),
      };
    };
    const pagamento = tr((x) => x.de === t.id && x.motivo === 'pagamento_servico');
    const vendido = tr((x) => x.de === t.id && x.motivo !== 'pagamento_servico');
    const recebido = tr((x) => x.para === t.id);
    const porItem = new Map<string, ContaCliente['insumos'][number]>();
    for (const x of insumos.rows.filter((y) => y.titular === t.id)) {
      const it = porItem.get(x.item) ?? {
        item: x.item,
        unidade: x.unidade,
        recebido: '0',
        usado: '0',
        devolvido: '0',
        saldo: '0',
      };
      const q = n(x.quantidade);
      const soma = (k: 'recebido' | 'usado' | 'devolvido' | 'saldo', v: number) => {
        it[k] = (n(it[k]) + v).toFixed(3);
      };
      soma('saldo', q);
      if (q > 0 && x.tipo !== 'estorno') soma('recebido', q);
      if (x.tipo === 'consumo_operacao') soma('usado', -q);
      if (x.tipo === 'saida' && x.saida === 'devolucao_titular') soma('devolvido', -q);
      porItem.set(x.item, it);
    }
    const emElaboracao = safras.reduce((a, x) => a + n(x.emElaboracao), 0);
    const litrosEmEstoque = n(g?.ml) / 1000;
    return {
      titularId: t.id,
      titular: t.nome,
      contrato: contrato && {
        id: contrato.id,
        numero: contrato.numero,
        perdaToleradaTipo: contrato.perdaToleradaTipo,
        perdaToleradaValor: contrato.perdaToleradaValor,
        pagamentoProdutoValor: contrato.pagamentoProdutoValor,
        pagamentoProdutoUnidade: contrato.pagamentoProdutoUnidade,
      },
      safras,
      garrafas: {
        emEstoque: Math.round(n(g?.garrafas)),
        litrosEmEstoque: l2(litrosEmEstoque),
        devolvidas: Math.round(saiu('devolucao_titular')),
        entreguesPorOrdem: Math.round(saiu('entrega_ordem_titular')),
      },
      transferencias: {
        pagamentoLitros: pagamento.litros,
        pagamentoGarrafas: pagamento.garrafas,
        vendidoLitros: vendido.litros,
        vendidoGarrafas: vendido.garrafas,
        recebidoLitros: recebido.litros,
        recebidoGarrafas: recebido.garrafas,
      },
      insumos: [...porItem.values()],
      faltaDevolverLitros: l2(emElaboracao + litrosEmEstoque),
    };
  });
}

export async function rotasContaCliente(app: FastifyInstance): Promise<void> {
  const { db } = app.deps;
  app.get('/api/terceiros/contas', async (req) =>
    naEmpresa(db, req, ['enotrace.relatorios', 'visualizar'], async (ctx) => {
      const q = z.object({ titularId: z.uuid().optional() }).parse(req.query);
      return contasDosClientes(ctx, { titularId: q.titularId ?? null });
    }),
  );
}
