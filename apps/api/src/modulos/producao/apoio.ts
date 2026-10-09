// Apoio às operações da cantina: data da execução, pessoas, projeto, saldos, lotes de destino e a
// repartição exata em inteiros. Usado por todas as telas de operação (operacoes.ts, movimentos.ts).
import {
  type Composicao,
  paraCentilitros,
  quantidadeAplicada,
  so2Adicionado,
  type UnidadeDose,
} from '@vinicycle/shared';
import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import * as s from '../../db/schema';
import { ErroRegra } from '../../nucleo/erros';
import { type Aviso, fonteDaRegra, regraVigente } from '../../nucleo/regras';
import type { ContextoEmpresa } from '../../nucleo/requisicao';
import type { Lancamento, LigacaoGenealogia, PlanoOperacao, RefLote } from './motor';

/** Data da execução: pode ser no passado (a trasfega de ontem lançada hoje), não no futuro. */
export function dataExecucao(iso: string): Date {
  const d = new Date(iso);
  if (d.getTime() > Date.now() + 5 * 60_000)
    throw new ErroRegra('A data da execução não pode ser no futuro.', 'data_futura');
  return d;
}

export async function conferirPessoas(ctx: ContextoEmpresa, ids: Array<string | null | undefined>) {
  const lista = [...new Set(ids.filter(Boolean) as string[])];
  if (!lista.length) return;
  const ok = await ctx.tx
    .select({ id: s.pessoa.id })
    .from(s.pessoa)
    .where(and(inArray(s.pessoa.id, lista), eq(s.pessoa.empresaId, ctx.empresaId)));
  if (ok.length !== lista.length) throw new ErroRegra('Pessoa inválida.', 'pessoa');
}

export async function carregarProjeto(ctx: ContextoEmpresa, id: string, estab: string) {
  const [p] = await ctx.tx
    .select()
    .from(s.projeto)
    .where(and(eq(s.projeto.id, id), eq(s.projeto.empresaId, ctx.empresaId)));
  if (!p || p.estabelecimentoId !== estab) throw new ErroRegra('Projeto inválido.', 'projeto');
  if (['encerrado', 'cancelado', 'engarrafado'].includes(p.situacao))
    throw new ErroRegra('O projeto não está aberto.', 'projeto');
  return p;
}

export async function conferirEtapaPlano(
  ctx: ContextoEmpresa,
  etapaId: string | null | undefined,
  projetoId: string,
) {
  if (!etapaId) return;
  const [e] = await ctx.tx
    .select({ projetoId: s.planoEtapa.projetoId })
    .from(s.planoEtapa)
    .where(eq(s.planoEtapa.id, etapaId));
  if (!e || e.projetoId !== projetoId)
    throw new ErroRegra('A etapa do plano é de outro projeto.', 'plano_etapa');
}

/** Itens de romaneio com o que a composição precisa (5.2). */
export async function itensUva(ctx: ContextoEmpresa, ids: string[]) {
  const linhas = await ctx.tx
    .select({
      id: s.romaneioItem.id,
      romaneioId: s.romaneio.id,
      romaneio: s.romaneio.codigo,
      projetoId: s.romaneio.projetoId,
      origem: s.romaneio.origem,
      donoUvaId: s.romaneio.donoUvaId,
      estab: s.romaneio.estabelecimentoId,
      variedadeId: s.romaneioItem.variedadeId,
      variedade: s.variedade.nome,
      safra: s.romaneioItem.safra,
      ciclo: s.romaneioItem.ciclo,
      organica: s.romaneioItem.organica,
      candidataIp: s.romaneioItem.candidataIp,
    })
    .from(s.romaneioItem)
    .innerJoin(s.romaneio, eq(s.romaneio.id, s.romaneioItem.romaneioId))
    .innerJoin(s.variedade, eq(s.variedade.id, s.romaneioItem.variedadeId))
    .where(and(inArray(s.romaneioItem.id, ids), eq(s.romaneioItem.empresaId, ctx.empresaId)));
  if (linhas.length !== new Set(ids).size)
    throw new ErroRegra('Item de romaneio inválido.', 'item');
  return linhas;
}
export type ItemUva = Awaited<ReturnType<typeof itensUva>>[number];

export function composicaoDoItem(i: ItemUva): Composicao {
  return {
    componentes: [
      {
        variedadeId: i.variedadeId,
        safra: i.safra,
        ciclo: i.ciclo,
        origem: i.origem === 'vinhedo_proprio' ? 'propria' : 'comprada',
        organica: i.organica,
        candidataIp: i.candidataIp,
        fracao: 1,
      },
    ],
    chaptalizado: false,
  };
}

/** Uma só titularidade na operação: lotes de titulares diferentes não se misturam. */
export function titularUnico(itens: ItemUva[]): string | null {
  const titulares = [...new Set(itens.map((i) => i.donoUvaId ?? ''))];
  if (titulares.length > 1)
    throw new ErroRegra(
      'Uvas de donos diferentes não vão juntas: processe cada dono numa operação.',
      'titulares',
    );
  return titulares[0] || null;
}

/** Rendimento padrão mais específico: variedade e estilo, só variedade, só estilo, geral. */
export async function rendimentos(ctx: ContextoEmpresa, estab: string, estilo: string | null) {
  const regras = await ctx.tx
    .select()
    .from(s.rendimentoPadrao)
    .where(eq(s.rendimentoPadrao.estabelecimentoId, estab));
  return (variedadeId: string): number | null => {
    const achar = (v: string | null, e: string | null) =>
      regras.find((r) => r.variedadeId === v && r.estilo === e);
    const r =
      achar(variedadeId, estilo) ??
      achar(variedadeId, null) ??
      (estilo ? achar(null, estilo) : undefined) ??
      achar(null, null);
    return r ? Number(r.litrosPorKg) : null;
  };
}

/** Saldo de cada lote nos recipientes, agora. */
export async function saldosPorLote(ctx: ContextoEmpresa, recipientes: string[]) {
  if (!recipientes.length) return [];
  const linhas = await ctx.tx
    .select({
      recipienteId: s.movimentoVolume.recipienteId,
      loteId: s.movimentoVolume.loteId,
      total: sql<string>`sum(${s.movimentoVolume.litros})`,
    })
    .from(s.movimentoVolume)
    .where(inArray(s.movimentoVolume.recipienteId, recipientes))
    .groupBy(s.movimentoVolume.recipienteId, s.movimentoVolume.loteId);
  return linhas.map((l) => ({ ...l, cl: paraCentilitros(l.total) })).filter((l) => l.cl > 0);
}

/** Saldo de cada lote nos recipientes na data da execução (o "esvaziar" de uma data passada). */
export async function saldosNaData(ctx: ContextoEmpresa, recipientes: string[], data: Date) {
  if (!recipientes.length) return [];
  const linhas = await ctx.tx
    .select({
      recipienteId: s.movimentoVolume.recipienteId,
      loteId: s.movimentoVolume.loteId,
      total: sql<string>`sum(${s.movimentoVolume.litros})`,
    })
    .from(s.movimentoVolume)
    .where(
      and(
        inArray(s.movimentoVolume.recipienteId, recipientes),
        lte(s.movimentoVolume.executadoEm, data),
      ),
    )
    .groupBy(s.movimentoVolume.recipienteId, s.movimentoVolume.loteId);
  return linhas.map((l) => ({ ...l, cl: paraCentilitros(l.total) })).filter((l) => l.cl > 0);
}

/** Código de uma lista configurável (motivo de perda, método de trasfega…): global ou da empresa. */
export async function conferirOpcao(
  ctx: ContextoEmpresa,
  lista: string,
  codigo: string | null | undefined,
  rotulo: string,
) {
  if (!codigo) return;
  const r = await ctx.tx.execute(sql`
    select 1 from opcao_lista where lista = ${lista} and codigo = ${codigo}
      and (empresa_id is null or empresa_id = ${ctx.empresaId}) limit 1`);
  if (!r.rows.length) throw new ErroRegra(`${rotulo} inválido.`, lista);
}

export async function conferirLoteExistente(
  ctx: ContextoEmpresa,
  loteId: string,
  projetoId: string,
  titularId: string | null,
) {
  const [l] = await ctx.tx
    .select({ codigo: s.lote.codigo, projetoId: s.lote.projetoId, titularId: s.lote.titularId })
    .from(s.lote)
    .where(and(eq(s.lote.id, loteId), eq(s.lote.empresaId, ctx.empresaId)));
  if (!l) throw new ErroRegra('Lote inválido.', 'lote');
  if (l.projetoId !== projetoId)
    throw new ErroRegra(`O lote ${l.codigo} é de outro projeto.`, 'lote_projeto');
  if (l.titularId !== titularId)
    throw new ErroRegra(
      `O lote ${l.codigo} é de outro titular. Lotes de titulares diferentes não se misturam.`,
      'titulares',
    );
}

/**
 * Destino que já tem outro lote: incorporar exige escolher esse lote; lote novo leva o saldo
 * antigo para o lote novo, com genealogia (03-modelo-de-dados.md, 4.3, Mistura no destino).
 */
export function tratarLoteNoDestino(
  recipienteId: string,
  alvo: RefLote,
  saldos: Array<{ recipienteId: string; loteId: string; cl: number }>,
  lancamentos: Lancamento[],
  genealogia: LigacaoGenealogia[],
  codigos: Map<string, string>,
) {
  const atual = saldos.find((x) => x.recipienteId === recipienteId);
  if (!atual) return;
  if ('id' in alvo) {
    if (alvo.id !== atual.loteId)
      throw new ErroRegra(
        `O recipiente já tem o lote ${codigos.get(atual.loteId) ?? ''}: incorpore a ele ou forme um lote novo.`,
        'mistura',
      );
    return;
  }
  lancamentos.push(
    { recipienteId, lote: { id: atual.loteId }, centilitros: -atual.cl, tipo: 'saida_corte' },
    {
      recipienteId,
      lote: alvo,
      centilitros: atual.cl,
      tipo: 'entrada_corte',
      composicao: { recipienteId },
    },
  );
  genealogia.push({
    origem: { id: atual.loteId },
    destino: alvo,
    centilitros: atual.cl,
    tipo: 'lote_novo',
  });
}

export async function codigosDeLotes(ctx: ContextoEmpresa, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const l = await ctx.tx
    .select({ id: s.lote.id, codigo: s.lote.codigo })
    .from(s.lote)
    .where(inArray(s.lote.id, ids));
  return new Map(l.map((x) => [x.id, x.codigo]));
}

/** Reparte inteiros mantendo a soma exata (maior resto). */
export function repartir(total: number, pesos: number[]): number[] {
  const soma = pesos.reduce((t, p) => t + p, 0);
  if (!soma) return pesos.map(() => 0);
  const brutos = pesos.map((p) => (total * p) / soma);
  const partes = brutos.map(Math.floor);
  let falta = total - partes.reduce((t, p) => t + p, 0);
  const ordem = brutos.map((b, i) => [b - Math.floor(b), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of ordem) {
    if (falta <= 0) break;
    partes[i]! += 1;
    falta -= 1;
  }
  return partes;
}

export async function avisoRendimento(
  ctx: ContextoEmpresa,
  executadoEm: Date,
  fuso: string,
  litrosPorKg: number,
): Promise<Aviso[]> {
  const data = new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(executadoEm);
  const regra = await regraVigente(ctx.tx, 'rendimento_prensagem_maximo', { data });
  if (!regra?.maximo || litrosPorKg <= Number(regra.maximo)) return [];
  return [
    {
      codigo: 'rendimento_prensagem',
      mensagem: `Rendimento de ${litrosPorKg.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} L/kg, acima do limite de ${Number(regra.maximo).toLocaleString('pt-BR')} L/kg.`,
      regraId: regra.id,
      valorApurado: litrosPorKg.toFixed(4),
      limite: regra.maximo,
      fonte: fonteDaRegra(regra),
    },
  ];
}

export async function fusoDo(ctx: ContextoEmpresa, estab: string) {
  const [e] = await ctx.tx
    .select({ fuso: s.estabelecimento.fuso })
    .from(s.estabelecimento)
    .where(eq(s.estabelecimento.id, estab));
  return e!.fuso;
}

/** Plano montado a partir do formulário, com os "cientes" e o rascunho que a confirmação conclui. */
/** Insumo como vem do formulário (comumOperacao.insumos). */
export interface InsumoForm {
  recipienteId?: string | null;
  itemId?: string | null;
  descricao?: string | null;
  loteItemId?: string | null;
  dose: string;
  unidade: UnidadeDose;
  volumeTratado?: string | null;
  aplicadoEm?: string | null;
  temperatura?: string | null;
}

export interface Montada {
  plano: PlanoOperacao;
  cientes: string[];
  rascunhoId: string | null;
  /** Insumos aplicados junto; sem recipiente, vão para os recipientes "padrao" da operação. */
  insumos?: { lista: InsumoForm[]; localEstoqueId?: string | null; padrao: string[] };
}

/**
 * Insumos aplicados numa operação (cantina.md, Adição de insumo): volume tratado (padrão: o do
 * recipiente depois da operação), quantidade baixada do lote do insumo, SO₂ somado na parte do
 * lote, aviso de lote vencido e do limite de SO₂ (IN Anvisa 211/2023). Completa o plano.
 */
export async function aplicarInsumos(
  ctx: ContextoEmpresa,
  plano: PlanoOperacao,
  entrada: NonNullable<Montada['insumos']>,
): Promise<void> {
  const lista = entrada.lista;
  if (!lista.length) return;
  const destinos = (i: InsumoForm) => (i.recipienteId ? [i.recipienteId] : entrada.padrao);
  if (lista.some((i) => !destinos(i).length))
    throw new ErroRegra('Escolha o recipiente de cada insumo.', 'insumo_recipiente');
  const ids = [...new Set(lista.flatMap(destinos))];

  // Volume e lote de cada recipiente depois dos lançamentos da operação.
  const saldos = await saldosPorLote(ctx, ids);
  const depois = (rid: string) => {
    const meus = plano.lancamentos.filter((l) => l.recipienteId === rid);
    const cl =
      saldos.filter((x) => x.recipienteId === rid).reduce((s, x) => s + x.cl, 0) +
      meus.reduce((s, l) => s + l.centilitros, 0);
    const entra = [...meus].reverse().find((l) => l.centilitros > 0);
    const atual = saldos.find((x) => x.recipienteId === rid);
    const lote: RefLote | null = entra ? entra.lote : atual ? { id: atual.loteId } : null;
    return { cl, lote };
  };

  const itensIds = [...new Set(lista.flatMap((i) => (i.itemId ? [i.itemId] : [])))];
  const itens = itensIds.length
    ? await ctx.tx
        .select({
          id: s.itemEstoque.id,
          nome: s.itemEstoque.nome,
          unidade: s.itemEstoque.unidadeBase,
          teorSo2: s.itemInsumo.teorSo2,
        })
        .from(s.itemEstoque)
        .leftJoin(s.itemInsumo, eq(s.itemInsumo.itemId, s.itemEstoque.id))
        .where(and(inArray(s.itemEstoque.id, itensIds), eq(s.itemEstoque.empresaId, ctx.empresaId)))
    : [];
  if (itens.length !== itensIds.length) throw new ErroRegra('Insumo inválido.', 'item');
  const lotesIds = [...new Set(lista.flatMap((i) => (i.loteItemId ? [i.loteItemId] : [])))];
  const lotesItem = lotesIds.length
    ? await ctx.tx
        .select({
          id: s.loteItem.id,
          codigo: s.loteItem.codigo,
          validade: s.loteItem.validade,
          titularId: s.loteItem.titularId,
        })
        .from(s.loteItem)
        .where(inArray(s.loteItem.id, lotesIds))
    : [];
  // Titular do vinho de cada lote, para o insumo do cliente (04, roteiro do ciclo 10, bloco 3).
  const titularDoVinho = async (r: RefLote): Promise<string | null> => {
    if ('novo' in r) return plano.lotesNovos?.find((l) => l.chave === r.novo)?.titularId ?? null;
    const [l] = await ctx.tx
      .select({ titularId: s.lote.titularId })
      .from(s.lote)
      .where(eq(s.lote.id, r.id));
    return l?.titularId ?? null;
  };

  // Local do estoque de onde saem: o informado, ou o único do EnoTrace no estabelecimento.
  let localId = entrada.localEstoqueId ?? null;
  if (itensIds.length && !localId) {
    const locais = await ctx.tx
      .select({ id: s.local.id })
      .from(s.local)
      .where(
        and(
          eq(s.local.estabelecimentoId, plano.estabelecimentoId),
          eq(s.local.moduloEstoque, 'ENOTRACE'),
          eq(s.local.ativo, true),
        ),
      );
    if (locais.length !== 1)
      throw new ErroRegra('Escolha o local do estoque de onde saem os insumos.', 'local_estoque');
    localId = locais[0]!.id;
  }

  const fuso = await fusoDo(ctx, plano.estabelecimentoId);
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(plano.executadoEm);
  const ajustes = new Map((plano.ajustesParte ?? []).map((a) => [a.recipienteId, { ...a }]));
  plano.insumos ??= [];
  plano.estoque ??= [];
  plano.avisos ??= [];
  for (const i of lista) {
    const item = i.itemId ? itens.find((x) => x.id === i.itemId)! : null;
    const loteItem = i.loteItemId ? lotesItem.find((x) => x.id === i.loteItemId) : null;
    if (i.loteItemId && !loteItem) throw new ErroRegra('Lote do insumo inválido.', 'lote');
    if (loteItem?.validade && loteItem.validade < hoje) {
      const codigo = `vencido:${loteItem.id}`;
      if (!plano.avisos.some((a) => a.codigo === codigo))
        plano.avisos.push({
          codigo,
          mensagem: `O lote ${loteItem.codigo} de ${item?.nome ?? 'insumo'} venceu em ${loteItem.validade.split('-').reverse().join('/')}.`,
        });
    }
    for (const rid of destinos(i)) {
      const d = depois(rid);
      if (!d.lote || d.cl <= 0)
        throw new ErroRegra(
          'Insumo num recipiente vazio: escolha um recipiente com vinho.',
          'vazio',
        );
      // Insumo de um cliente no vinho de outro titular: "ciente" (P29).
      if (loteItem?.titularId && loteItem.titularId !== (await titularDoVinho(d.lote))) {
        const codigo = `insumo_outro_titular:${loteItem.id}`;
        if (!plano.avisos.some((a) => a.codigo === codigo))
          plano.avisos.push({
            codigo,
            mensagem: `O lote ${loteItem.codigo} de ${item?.nome ?? 'insumo'} é de um cliente e o vinho é de outro titular.`,
          });
      }
      const volume = i.volumeTratado ? Number(i.volumeTratado) : d.cl / 100;
      let quantidade: number | null = null;
      let so2: number | null = null;
      if (item) {
        quantidade = quantidadeAplicada(Number(i.dose), i.unidade, volume, item.unidade);
        if (quantidade === null)
          throw new ErroRegra(
            `A dose em ${i.unidade} não converte para a unidade de ${item.nome} (${item.unidade}).`,
            'unidade_dose',
          );
        if (item.teorSo2)
          so2 = so2Adicionado(quantidade, item.unidade, Number(item.teorSo2), volume);
        plano.estoque.push({
          localId: localId!,
          itemId: item.id,
          loteItemId: i.loteItemId ?? null,
          quantidade: (-quantidade).toFixed(3),
          tipo: 'consumo_operacao',
        });
      }
      if (so2) {
        const a = ajustes.get(rid) ?? { recipienteId: rid };
        a.so2 = (a.so2 ?? 0) + so2;
        ajustes.set(rid, a);
      }
      plano.insumos.push({
        recipienteId: rid,
        lote: d.lote,
        itemId: item?.id ?? null,
        loteItemId: i.loteItemId ?? null,
        descricao: item ? null : (i.descricao ?? null),
        dose: i.dose,
        unidade: i.unidade,
        volumeTratado: volume.toFixed(2),
        quantidade: quantidade === null ? null : quantidade.toFixed(3),
        so2,
        aplicadoEm: i.aplicadoEm ? new Date(i.aplicadoEm) : plano.executadoEm,
        temperatura: i.temperatura ?? null,
      });
      // Linha de ajuste: a operação "toca" o recipiente (dependentes do estorno, 4.5).
      if (!plano.linhas.some((l) => l.recipienteId === rid)) {
        plano.linhas.push({
          ordem: Math.max(0, ...plano.linhas.map((l) => l.ordem)) + 1,
          papel: 'ajuste',
          recipienteId: rid,
          lote: d.lote,
          centilitros: d.cl,
        });
      }
    }
  }
  plano.ajustesParte = [...ajustes.values()];
  const data = new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(plano.executadoEm);
  const regra = await regraVigente(ctx.tx, 'so2_total_maximo', { data });
  plano.limiteSo2 = regra?.maximo
    ? { maximo: Number(regra.maximo), regraId: regra.id, fonte: fonteDaRegra(regra) }
    : null;
}
