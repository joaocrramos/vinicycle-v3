// Assinatura da empresa (administracao.md, Planos, adicionais e assinaturas; P25): plano e
// adicionais com preço congelado, limites efetivos (plano + adicionais), upgrade na hora com o
// proporcional na próxima fatura e downgrade agendado para a renovação, sem reembolso.
//
// As mesmas regras servem à Administração (ficha do cliente) e ao Master (Configurações ›
// Assinatura). As tabelas da assinatura só são alteradas no contexto da plataforma (RLS): a rota do
// Master confere que quem pede é o Master e eleva o contexto só para esta operação.
import {
  dadosCobranca,
  deCentavos,
  descontoEntrada,
  fimDoCiclo,
  incluirAdicionalEntrada,
  motivo,
  mudarPeriodicidadeEntrada,
  mudarPlanoEntrada,
  NOMES_PERIODICIDADE,
  NOMES_TIPO_ADICIONAL,
  paraCentavos,
  type Periodicidade,
  proporcional,
  reajusteEntrada,
  retirarAdicionalEntrada,
  somarDias,
  INTERVALO_MUDANCA_VENCIMENTO_DIAS,
  diaVencimentoValido,
  MENSAGEM_DIA_VENCIMENTO,
} from '@vinicycle/shared';
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { definirContexto, type Tx } from '../db/cliente';
import * as s from '../db/schema';
import type { Evento } from '../nucleo/auditoria';
import { ErroNaoEncontrado, ErroPermissao, ErroRegra } from '../nucleo/erros';
import { naEmpresa, naPlataforma } from '../nucleo/requisicao';
import { recalcularFaturaFutura } from './cobranca';
import { hoje, listarAdicionais, listarPlanos, precoDoAdicional, precoDoPlano } from './planos';

export type Assinatura = typeof s.assinatura.$inferSelect;

/** Quem pede a mudança: a Administração ou o Master da empresa. */
export interface Agente {
  tx: Tx;
  usuarioId: string;
  origem: 'plataforma' | 'master';
  auditar(evento: Evento): Promise<void>;
}

export async function assinaturaVigente(tx: Tx, empresaId: string): Promise<Assinatura> {
  const [a] = await tx
    .select()
    .from(s.assinatura)
    .where(and(eq(s.assinatura.empresaId, empresaId), eq(s.assinatura.situacao, 'vigente')));
  if (!a) throw new ErroNaoEncontrado('A empresa não tem assinatura vigente.');
  return a;
}

/** Itens em vigor na data: começaram e ainda não terminaram. */
function itemEmVigor(data: string) {
  return and(
    lte(s.assinaturaItem.inicio, data),
    or(isNull(s.assinaturaItem.fim), gte(s.assinaturaItem.fim, data)),
  );
}

export interface Limites {
  estabelecimentos: number | null;
  usuarios: number | null;
  armazenamentoGb: number | null;
  /** Franquia mensal de mensagens: só pelos pacotes adicionais (pendência 25). */
  mensagensWhatsapp: number;
  mensagensSms: number;
  /** Módulos do plano, mais os avulsos e a Gestão. */
  modulos: string[];
}

/** Limite efetivo = plano + adicionais em vigor (P25). Vazio = sem limite. */
export async function limitesEfetivos(
  tx: Tx,
  empresaId: string,
  data = hoje(),
): Promise<Limites | null> {
  const [a] = await tx
    .select({
      id: s.assinatura.id,
      planoId: s.assinatura.planoId,
      estabelecimentos: s.plano.limiteEstabelecimentos,
      usuarios: s.plano.limiteUsuarios,
      armazenamentoGb: s.plano.limiteArmazenamentoGb,
    })
    .from(s.assinatura)
    .innerJoin(s.plano, eq(s.plano.id, s.assinatura.planoId))
    .where(and(eq(s.assinatura.empresaId, empresaId), eq(s.assinatura.situacao, 'vigente')));
  if (!a) return null;
  const itens = await tx
    .select({
      tipo: s.adicional.tipo,
      total: sql<number>`(${s.assinaturaItem.quantidade} * ${s.assinaturaItem.quantidadePorUnidade})::int`,
      modulo: s.modulo.codigo,
    })
    .from(s.assinaturaItem)
    .innerJoin(s.adicional, eq(s.adicional.id, s.assinaturaItem.adicionalId))
    .leftJoin(s.modulo, eq(s.modulo.id, s.adicional.moduloId))
    .where(and(eq(s.assinaturaItem.assinaturaId, a.id), itemEmVigor(data)));
  const somar = (tipo: string, base: number | null) =>
    base === null
      ? null
      : base + itens.filter((i) => i.tipo === tipo).reduce((t, i) => t + Number(i.total), 0);
  const modulos = await tx
    .select({ codigo: s.modulo.codigo })
    .from(s.planoModulo)
    .innerJoin(s.modulo, eq(s.modulo.id, s.planoModulo.moduloId))
    .where(eq(s.planoModulo.planoId, a.planoId));
  return {
    estabelecimentos: somar('estabelecimento', a.estabelecimentos),
    usuarios: somar('usuario', a.usuarios),
    armazenamentoGb: somar(
      'armazenamento',
      a.armazenamentoGb === null ? null : Number(a.armazenamentoGb),
    ),
    mensagensWhatsapp: somar('mensagens_whatsapp', 0)!,
    mensagensSms: somar('mensagens_sms', 0)!,
    modulos: [
      ...new Set([
        'GESTAO',
        ...modulos.map((m) => m.codigo),
        ...itens.filter((i) => i.modulo).map((i) => i.modulo!),
      ]),
    ],
  };
}

export interface Uso {
  estabelecimentos: number;
  /** Usuários ativos mais convites pendentes. */
  usuarios: number;
  armazenamentoBytes: number;
  /** Mensagens do mês corrente, por canal. */
  mensagensWhatsapp: number;
  mensagensSms: number;
}

/** Primeiro dia do mês corrente (a franquia de mensagens é mensal). */
export function inicioDoMes(data = hoje()): string {
  return `${data.slice(0, 8)}01`;
}

export async function usoAtual(tx: Tx, empresaId: string): Promise<Uso> {
  const r = await tx.execute<{
    estab: number;
    usuarios: number;
    bytes: string;
    whatsapp: number;
    sms: number;
  }>(sql`
    select
      (select count(*) from estabelecimento where empresa_id = ${empresaId} and ativo)::int as estab,
      ((select count(*) from vinculo where empresa_id = ${empresaId} and ativo)
        + (select count(*) from convite where empresa_id = ${empresaId}
            and situacao = 'pendente' and expira_em > now()))::int as usuarios,
      (select coalesce(sum(tamanho_bytes), 0) from anexo where empresa_id = ${empresaId})::text as bytes,
      mensagens_no_mes(${empresaId}, 'whatsapp', ${inicioDoMes()}::date) as whatsapp,
      mensagens_no_mes(${empresaId}, 'sms', ${inicioDoMes()}::date) as sms`);
  const l = r.rows[0]!;
  return {
    estabelecimentos: l.estab,
    usuarios: l.usuarios,
    armazenamentoBytes: Number(l.bytes),
    mensagensWhatsapp: l.whatsapp,
    mensagensSms: l.sms,
  };
}

/** O que passa do limite: lista legível, vazia quando cabe tudo. */
export function excessos(
  limites: Pick<Limites, 'estabelecimentos' | 'usuarios' | 'armazenamentoGb'>,
  uso: Uso,
): string[] {
  const r: string[] = [];
  if (limites.estabelecimentos !== null && uso.estabelecimentos > limites.estabelecimentos) {
    r.push(`${uso.estabelecimentos} estabelecimentos ativos para ${limites.estabelecimentos}`);
  }
  if (limites.usuarios !== null && uso.usuarios > limites.usuarios) {
    r.push(`${uso.usuarios} usuários (com convites pendentes) para ${limites.usuarios}`);
  }
  if (
    limites.armazenamentoGb !== null &&
    uso.armazenamentoBytes > limites.armazenamentoGb * 1024 ** 3
  ) {
    const gb = (uso.armazenamentoBytes / 1024 ** 3).toFixed(1).replace('.', ',');
    r.push(`${gb} GB de anexos para ${limites.armazenamentoGb} GB`);
  }
  return r;
}

/**
 * Quando vale o que é agendado: a próxima renovação. Se a fatura do próximo ciclo já foi emitida,
 * o agendamento fica para a renovação seguinte (a fatura emitida não muda).
 */
export async function proximaRenovacao(tx: Tx, a: Assinatura): Promise<string> {
  if (!a.cicloFim) return a.fimTeste ? somarDias(a.fimTeste, 1) : hoje();
  const proxima = somarDias(a.cicloFim, 1);
  const [emitida] = await tx
    .select({ id: s.fatura.id })
    .from(s.fatura)
    .where(
      and(
        eq(s.fatura.assinaturaId, a.id),
        eq(s.fatura.cicloInicio, proxima),
        sql`${s.fatura.situacao} <> 'cancelada'`,
      ),
    );
  if (!emitida) return proxima;
  const [ciclo] = await tx
    .select({ periodicidade: s.assinaturaMudanca.periodicidade })
    .from(s.assinaturaMudanca)
    .where(
      and(
        eq(s.assinaturaMudanca.assinaturaId, a.id),
        eq(s.assinaturaMudanca.tipo, 'periodicidade'),
        eq(s.assinaturaMudanca.situacao, 'agendada'),
        lte(s.assinaturaMudanca.efeitoEm, proxima),
      ),
    );
  const periodicidade = (ciclo?.periodicidade ?? a.periodicidade) as Periodicidade;
  return somarDias(fimDoCiclo(proxima, periodicidade, a.diaBase ?? undefined), 1);
}

/** Limites que a empresa terá depois das mudanças agendadas, para avisar antes da renovação. */
async function limitesDepois(
  tx: Tx,
  a: Assinatura,
): Promise<Pick<Limites, 'estabelecimentos' | 'usuarios' | 'armazenamentoGb'>> {
  const agendadas = await tx
    .select()
    .from(s.assinaturaMudanca)
    .where(
      and(eq(s.assinaturaMudanca.assinaturaId, a.id), eq(s.assinaturaMudanca.situacao, 'agendada')),
    );
  const planoId = agendadas.find((m) => m.tipo === 'plano')?.planoId ?? a.planoId;
  const [p] = await tx.select().from(s.plano).where(eq(s.plano.id, planoId));
  const itens = await tx
    .select({
      id: s.assinaturaItem.id,
      tipo: s.adicional.tipo,
      quantidade: s.assinaturaItem.quantidade,
      porUnidade: s.assinaturaItem.quantidadePorUnidade,
    })
    .from(s.assinaturaItem)
    .innerJoin(s.adicional, eq(s.adicional.id, s.assinaturaItem.adicionalId))
    .where(and(eq(s.assinaturaItem.assinaturaId, a.id), isNull(s.assinaturaItem.fim)));
  const total = (tipo: string) =>
    itens
      .filter((i) => i.tipo === tipo)
      .reduce((t, i) => {
        const retirada = agendadas
          .filter((m) => m.tipo === 'adicional_retirada' && m.assinaturaItemId === i.id)
          .reduce((x, m) => x + (m.quantidade ?? 0), 0);
        return t + Math.max(0, i.quantidade - retirada) * i.porUnidade;
      }, 0);
  return {
    estabelecimentos:
      p!.limiteEstabelecimentos === null
        ? null
        : p!.limiteEstabelecimentos + total('estabelecimento'),
    usuarios: p!.limiteUsuarios === null ? null : p!.limiteUsuarios + total('usuario'),
    armazenamentoGb:
      p!.limiteArmazenamentoGb === null
        ? null
        : Number(p!.limiteArmazenamentoGb) + total('armazenamento'),
  };
}

/** O que passará dos limites depois da renovação, com as mudanças agendadas. */
export async function excessosNaRenovacao(tx: Tx, a: Assinatura): Promise<string[]> {
  return excessos(await limitesDepois(tx, a), await usoAtual(tx, a.empresaId));
}

async function avisoDeExcesso(tx: Tx, a: Assinatura): Promise<string | null> {
  const lista = await excessosNaRenovacao(tx, a);
  if (!lista.length) return null;
  return `Depois da renovação, o uso passará dos limites: ${lista.join('; ')}. Ajuste antes da renovação, ou o que passar do limite fica sem poder crescer.`;
}

async function registrarMudanca(
  c: Agente,
  a: Assinatura,
  dados: Omit<typeof s.assinaturaMudanca.$inferInsert, 'empresaId' | 'assinaturaId' | 'origem'>,
): Promise<string> {
  const [m] = await c.tx
    .insert(s.assinaturaMudanca)
    .values({
      ...dados,
      empresaId: a.empresaId,
      assinaturaId: a.id,
      origem: c.origem,
      criadoPor: c.usuarioId,
      aplicadaEm: dados.situacao === 'aplicada' ? sql`now()` : null,
    })
    .returning({ id: s.assinaturaMudanca.id });
  return m!.id;
}

async function cancelarAgendadas(
  c: Agente,
  a: Assinatura,
  tipo: 'plano' | 'periodicidade' | 'reajuste',
) {
  await c.tx
    .update(s.assinaturaMudanca)
    .set({ situacao: 'cancelada', canceladaEm: sql`now()`, canceladaPor: c.usuarioId })
    .where(
      and(
        eq(s.assinaturaMudanca.assinaturaId, a.id),
        eq(s.assinaturaMudanca.tipo, tipo),
        eq(s.assinaturaMudanca.situacao, 'agendada'),
      ),
    );
}

const emCurso = (a: Assinatura) => !a.emTeste && !!a.cicloInicio && !!a.cicloFim;

export interface ResultadoMudanca {
  situacao: 'aplicada' | 'agendada';
  efeitoEm: string;
  valorProporcional: string | null;
  aviso: string | null;
}

/**
 * Troca de plano: preço maior ou igual vale na hora, com o proporcional dos dias restantes; preço
 * menor fica agendado para a renovação. No teste, vale na hora e sem cobrança.
 */
export async function mudarPlano(
  c: Agente,
  a: Assinatura,
  planoId: string,
  data = hoje(),
): Promise<ResultadoMudanca> {
  if (planoId === a.planoId) throw new ErroRegra('A empresa já está nesse plano.', 'mesmo_plano');
  const [p] = await c.tx.select().from(s.plano).where(eq(s.plano.id, planoId));
  if (!p || !p.ativo) throw new ErroRegra('Plano inválido.', 'planoId');
  const novo = await precoDoPlano(c.tx, planoId, a.periodicidade as Periodicidade, data);
  if (novo === null) {
    throw new ErroRegra(
      `O plano ${p.nome} não é vendido no ciclo ${NOMES_PERIODICIDADE[a.periodicidade as Periodicidade].toLowerCase()}.`,
      'sem_preco',
    );
  }
  await cancelarAgendadas(c, a, 'plano');
  // O preço passa a ser o do plano novo: um reajuste agendado perde o sentido.
  await cancelarAgendadas(c, a, 'reajuste');
  const diferenca = paraCentavos(novo) - paraCentavos(a.valorContratado);
  if (!emCurso(a) || diferenca >= 0) {
    const valor =
      emCurso(a) && diferenca > 0
        ? deCentavos(proporcional(diferenca, { inicio: a.cicloInicio!, fim: a.cicloFim! }, data))
        : null;
    await c.tx
      .update(s.assinatura)
      .set({
        planoId,
        valorContratado: novo,
        atualizadoEm: sql`now()`,
        atualizadoPor: c.usuarioId,
        versao: sql`${s.assinatura.versao} + 1`,
      })
      .where(eq(s.assinatura.id, a.id));
    await registrarMudanca(c, a, {
      tipo: 'plano',
      planoAnteriorId: a.planoId,
      planoId,
      efeitoEm: data,
      situacao: 'aplicada',
      valorProporcional: valor && Number(valor) > 0 ? valor : null,
    });
    await c.auditar({
      acao: 'mudar_plano',
      entidade: 'assinatura',
      registroId: a.id,
      empresaId: a.empresaId,
      antes: { planoId: a.planoId, valor: a.valorContratado },
      depois: { planoId, valor: novo, proporcional: valor },
    });
    return { situacao: 'aplicada', efeitoEm: data, valorProporcional: valor, aviso: null };
  }
  const efeitoEm = await proximaRenovacao(c.tx, a);
  await registrarMudanca(c, a, {
    tipo: 'plano',
    planoAnteriorId: a.planoId,
    planoId,
    efeitoEm,
    situacao: 'agendada',
  });
  await c.auditar({
    acao: 'agendar_plano',
    entidade: 'assinatura',
    registroId: a.id,
    empresaId: a.empresaId,
    depois: { planoId, efeitoEm },
  });
  return {
    situacao: 'agendada',
    efeitoEm,
    valorProporcional: null,
    aviso: await avisoDeExcesso(c.tx, a),
  };
}

/** O ciclo de cobrança muda na renovação (no teste, na hora). Plano e adicionais precisam ter preço. */
export async function mudarPeriodicidade(
  c: Agente,
  a: Assinatura,
  periodicidade: Periodicidade,
  data = hoje(),
): Promise<ResultadoMudanca> {
  if (periodicidade === a.periodicidade) {
    throw new ErroRegra('A assinatura já está nesse ciclo.', 'mesma_periodicidade');
  }
  const agendada = await c.tx
    .select({ planoId: s.assinaturaMudanca.planoId })
    .from(s.assinaturaMudanca)
    .where(
      and(
        eq(s.assinaturaMudanca.assinaturaId, a.id),
        eq(s.assinaturaMudanca.tipo, 'plano'),
        eq(s.assinaturaMudanca.situacao, 'agendada'),
      ),
    );
  const planoId = agendada[0]?.planoId ?? a.planoId;
  const preco = await precoDoPlano(c.tx, planoId, periodicidade, data);
  const nome = NOMES_PERIODICIDADE[periodicidade].toLowerCase();
  if (preco === null) {
    throw new ErroRegra(`O plano não é vendido no ciclo ${nome}.`, 'sem_preco');
  }
  const itens = await c.tx
    .select({ adicionalId: s.assinaturaItem.adicionalId, nome: s.adicional.nome })
    .from(s.assinaturaItem)
    .innerJoin(s.adicional, eq(s.adicional.id, s.assinaturaItem.adicionalId))
    .where(and(eq(s.assinaturaItem.assinaturaId, a.id), isNull(s.assinaturaItem.fim)));
  for (const i of itens) {
    if ((await precoDoAdicional(c.tx, i.adicionalId, periodicidade, data)) === null) {
      throw new ErroRegra(`O adicional ${i.nome} não é vendido no ciclo ${nome}.`, 'sem_preco');
    }
  }
  await cancelarAgendadas(c, a, 'periodicidade');
  await cancelarAgendadas(c, a, 'reajuste');
  if (!emCurso(a)) {
    await c.tx
      .update(s.assinatura)
      .set({
        periodicidade,
        valorContratado: (await precoDoPlano(c.tx, a.planoId, periodicidade, data)) ?? preco,
        atualizadoEm: sql`now()`,
        atualizadoPor: c.usuarioId,
        versao: sql`${s.assinatura.versao} + 1`,
      })
      .where(eq(s.assinatura.id, a.id));
    for (const i of itens) {
      await c.tx
        .update(s.assinaturaItem)
        .set({ valorUnitario: (await precoDoAdicional(c.tx, i.adicionalId, periodicidade, data))! })
        .where(
          and(
            eq(s.assinaturaItem.assinaturaId, a.id),
            eq(s.assinaturaItem.adicionalId, i.adicionalId),
          ),
        );
    }
    await registrarMudanca(c, a, {
      tipo: 'periodicidade',
      periodicidade,
      efeitoEm: data,
      situacao: 'aplicada',
    });
    await c.auditar({
      acao: 'mudar_periodicidade',
      entidade: 'assinatura',
      registroId: a.id,
      empresaId: a.empresaId,
      antes: { periodicidade: a.periodicidade },
      depois: { periodicidade },
    });
    return { situacao: 'aplicada', efeitoEm: data, valorProporcional: null, aviso: null };
  }
  const efeitoEm = await proximaRenovacao(c.tx, a);
  await registrarMudanca(c, a, {
    tipo: 'periodicidade',
    periodicidade,
    efeitoEm,
    situacao: 'agendada',
  });
  await c.auditar({
    acao: 'agendar_periodicidade',
    entidade: 'assinatura',
    registroId: a.id,
    empresaId: a.empresaId,
    depois: { periodicidade, efeitoEm },
  });
  return { situacao: 'agendada', efeitoEm, valorProporcional: null, aviso: null };
}

/**
 * Reajuste do preço contratado, pela Administração: vale na renovação (decidido em 04/10/2026,
 * pendência 25). Sem valor, vale o preço de tabela do plano no dia da renovação.
 */
export async function reajustar(
  c: Agente,
  a: Assinatura,
  d: { valor: string | null; motivo: string },
): Promise<ResultadoMudanca> {
  if (!emCurso(a)) {
    throw new ErroRegra(
      'No teste, o preço é o de tabela na contratação. Para outro valor, use um desconto.',
      'em_teste',
    );
  }
  await cancelarAgendadas(c, a, 'reajuste');
  const efeitoEm = await proximaRenovacao(c.tx, a);
  await registrarMudanca(c, a, {
    tipo: 'reajuste',
    planoId: a.planoId,
    valorNovo: d.valor,
    motivo: d.motivo,
    efeitoEm,
    situacao: 'agendada',
  });
  await c.auditar({
    acao: 'agendar_reajuste',
    entidade: 'assinatura',
    registroId: a.id,
    empresaId: a.empresaId,
    antes: { valor: a.valorContratado },
    depois: { valor: d.valor ?? 'tabela', efeitoEm },
    motivo: d.motivo,
  });
  return { situacao: 'agendada', efeitoEm, valorProporcional: null, aviso: null };
}

/** Inclusão de adicional: vale na hora, com o proporcional dos dias restantes na próxima fatura. */
export async function incluirAdicional(
  c: Agente,
  a: Assinatura,
  adicionalId: string,
  quantidade: number,
  data = hoje(),
): Promise<ResultadoMudanca> {
  const [ad] = await c.tx.select().from(s.adicional).where(eq(s.adicional.id, adicionalId));
  if (!ad || !ad.ativo) throw new ErroRegra('Adicional inválido.', 'adicionalId');
  const preco = await precoDoAdicional(c.tx, ad.id, a.periodicidade as Periodicidade, data);
  if (preco === null) {
    throw new ErroRegra(
      `O adicional ${ad.nome} não é vendido no ciclo ${NOMES_PERIODICIDADE[a.periodicidade as Periodicidade].toLowerCase()}.`,
      'sem_preco',
    );
  }
  if (ad.tipo === 'modulo') {
    if (quantidade !== 1)
      throw new ErroRegra('O módulo avulso é contratado uma vez.', 'quantidade');
    const [noPlano] = await c.tx
      .select({ m: s.planoModulo.moduloId })
      .from(s.planoModulo)
      .where(and(eq(s.planoModulo.planoId, a.planoId), eq(s.planoModulo.moduloId, ad.moduloId!)));
    const [jaTem] = await c.tx
      .select({ id: s.assinaturaItem.id })
      .from(s.assinaturaItem)
      .where(
        and(
          eq(s.assinaturaItem.assinaturaId, a.id),
          eq(s.assinaturaItem.adicionalId, ad.id),
          isNull(s.assinaturaItem.fim),
        ),
      );
    if (noPlano || jaTem) throw new ErroRegra('A empresa já tem esse módulo.', 'modulo_contratado');
  }
  const [item] = await c.tx
    .insert(s.assinaturaItem)
    .values({
      empresaId: a.empresaId,
      assinaturaId: a.id,
      adicionalId: ad.id,
      quantidade,
      quantidadePorUnidade: ad.quantidadePorUnidade,
      valorUnitario: preco,
      inicio: data,
      criadoPor: c.usuarioId,
      atualizadoPor: c.usuarioId,
    })
    .returning({ id: s.assinaturaItem.id });
  const valor = emCurso(a)
    ? deCentavos(
        proporcional(
          paraCentavos(preco) * quantidade,
          { inicio: a.cicloInicio!, fim: a.cicloFim! },
          data,
        ),
      )
    : null;
  await registrarMudanca(c, a, {
    tipo: 'adicional_inclusao',
    adicionalId: ad.id,
    assinaturaItemId: item!.id,
    quantidade,
    efeitoEm: data,
    situacao: 'aplicada',
    valorProporcional: valor && Number(valor) > 0 ? valor : null,
  });
  await c.auditar({
    acao: 'incluir_adicional',
    entidade: 'assinatura',
    registroId: a.id,
    empresaId: a.empresaId,
    depois: { adicional: ad.nome, quantidade, valorUnitario: preco, proporcional: valor },
  });
  return { situacao: 'aplicada', efeitoEm: data, valorProporcional: valor, aviso: null };
}

/** Retirada de adicional: agendada para a renovação, sem reembolso (no teste, na hora). */
export async function retirarAdicional(
  c: Agente,
  a: Assinatura,
  itemId: string,
  quantidade: number,
  data = hoje(),
): Promise<ResultadoMudanca> {
  const [item] = await c.tx
    .select()
    .from(s.assinaturaItem)
    .where(
      and(
        eq(s.assinaturaItem.id, itemId),
        eq(s.assinaturaItem.assinaturaId, a.id),
        isNull(s.assinaturaItem.fim),
      ),
    );
  if (!item) throw new ErroNaoEncontrado('Adicional não encontrado na assinatura.');
  if (quantidade > item.quantidade) {
    throw new ErroRegra(
      `A assinatura tem ${item.quantidade} unidade(s) desse adicional.`,
      'quantidade',
    );
  }
  // Um pedido de retirada por item: o novo substitui o anterior.
  await c.tx
    .update(s.assinaturaMudanca)
    .set({ situacao: 'cancelada', canceladaEm: sql`now()`, canceladaPor: c.usuarioId })
    .where(
      and(
        eq(s.assinaturaMudanca.assinaturaItemId, item.id),
        eq(s.assinaturaMudanca.tipo, 'adicional_retirada'),
        eq(s.assinaturaMudanca.situacao, 'agendada'),
      ),
    );
  if (!emCurso(a)) {
    await reduzirItem(c.tx, item, quantidade, somarDias(data, -1), c.usuarioId);
    await registrarMudanca(c, a, {
      tipo: 'adicional_retirada',
      adicionalId: item.adicionalId,
      assinaturaItemId: item.id,
      quantidade,
      efeitoEm: data,
      situacao: 'aplicada',
    });
    await c.auditar({
      acao: 'retirar_adicional',
      entidade: 'assinatura',
      registroId: a.id,
      empresaId: a.empresaId,
      depois: { itemId, quantidade },
    });
    return { situacao: 'aplicada', efeitoEm: data, valorProporcional: null, aviso: null };
  }
  const efeitoEm = await proximaRenovacao(c.tx, a);
  await registrarMudanca(c, a, {
    tipo: 'adicional_retirada',
    adicionalId: item.adicionalId,
    assinaturaItemId: item.id,
    quantidade,
    efeitoEm,
    situacao: 'agendada',
  });
  await c.auditar({
    acao: 'agendar_retirada',
    entidade: 'assinatura',
    registroId: a.id,
    empresaId: a.empresaId,
    depois: { itemId, quantidade, efeitoEm },
  });
  return {
    situacao: 'agendada',
    efeitoEm,
    valorProporcional: null,
    aviso: await avisoDeExcesso(c.tx, a),
  };
}

/** Tira unidades do item: tudo = o item termina na véspera; parte = o item continua com menos. */
export async function reduzirItem(
  tx: Tx,
  item: typeof s.assinaturaItem.$inferSelect,
  quantidade: number,
  ultimoDia: string,
  usuarioId: string | null,
): Promise<void> {
  if (quantidade >= item.quantidade) {
    await tx
      .update(s.assinaturaItem)
      .set({ fim: ultimoDia, atualizadoEm: sql`now()`, atualizadoPor: usuarioId })
      .where(eq(s.assinaturaItem.id, item.id));
    return;
  }
  await tx
    .update(s.assinaturaItem)
    .set({
      quantidade: item.quantidade - quantidade,
      atualizadoEm: sql`now()`,
      atualizadoPor: usuarioId,
      versao: sql`${s.assinaturaItem.versao} + 1`,
    })
    .where(eq(s.assinaturaItem.id, item.id));
}

export async function cancelarMudanca(c: Agente, a: Assinatura, id: string): Promise<void> {
  if (c.origem === 'master') {
    const [m] = await c.tx
      .select({ tipo: s.assinaturaMudanca.tipo })
      .from(s.assinaturaMudanca)
      .where(eq(s.assinaturaMudanca.id, id));
    if (m?.tipo === 'reajuste') {
      throw new ErroPermissao('gestao.assinatura', 'editar', 'O reajuste é da Administração.');
    }
  }
  const r = await c.tx
    .update(s.assinaturaMudanca)
    .set({ situacao: 'cancelada', canceladaEm: sql`now()`, canceladaPor: c.usuarioId })
    .where(
      and(
        eq(s.assinaturaMudanca.id, id),
        eq(s.assinaturaMudanca.assinaturaId, a.id),
        eq(s.assinaturaMudanca.situacao, 'agendada'),
      ),
    )
    .returning({ id: s.assinaturaMudanca.id });
  if (!r.length) throw new ErroNaoEncontrado('Mudança agendada não encontrada.');
  await c.auditar({
    acao: 'cancelar_mudanca',
    entidade: 'assinatura',
    registroId: a.id,
    empresaId: a.empresaId,
    dados: { mudancaId: id },
  });
}

/** Tudo o que a tela da assinatura mostra, para a Administração e para o Master. */
export async function resumoAssinatura(tx: Tx, empresaId: string, paraPlataforma: boolean) {
  const a = await assinaturaVigente(tx, empresaId);
  const data = hoje();
  const [plano] = await tx
    .select({ nome: s.plano.nome, formasPagamento: s.plano.formasPagamento })
    .from(s.plano)
    .where(eq(s.plano.id, a.planoId));
  const itens = await tx
    .select({
      id: s.assinaturaItem.id,
      adicionalId: s.assinaturaItem.adicionalId,
      nome: s.adicional.nome,
      tipo: s.adicional.tipo,
      quantidade: s.assinaturaItem.quantidade,
      quantidadePorUnidade: s.assinaturaItem.quantidadePorUnidade,
      valorUnitario: s.assinaturaItem.valorUnitario,
      inicio: s.assinaturaItem.inicio,
    })
    .from(s.assinaturaItem)
    .innerJoin(s.adicional, eq(s.adicional.id, s.assinaturaItem.adicionalId))
    .where(and(eq(s.assinaturaItem.assinaturaId, a.id), itemEmVigor(data)))
    .orderBy(s.assinaturaItem.inicio);
  const planos = tx.select({ id: s.plano.id, nome: s.plano.nome }).from(s.plano).as('p');
  const mudancas = await tx
    .select({
      id: s.assinaturaMudanca.id,
      tipo: s.assinaturaMudanca.tipo,
      plano: planos.nome,
      periodicidade: s.assinaturaMudanca.periodicidade,
      adicional: s.adicional.nome,
      quantidade: s.assinaturaMudanca.quantidade,
      efeitoEm: s.assinaturaMudanca.efeitoEm,
      situacao: s.assinaturaMudanca.situacao,
      valorProporcional: s.assinaturaMudanca.valorProporcional,
      valorNovo: s.assinaturaMudanca.valorNovo,
      motivo: s.assinaturaMudanca.motivo,
      origem: s.assinaturaMudanca.origem,
      criadoEm: s.assinaturaMudanca.criadoEm,
    })
    .from(s.assinaturaMudanca)
    .leftJoin(planos, eq(planos.id, s.assinaturaMudanca.planoId))
    .leftJoin(s.adicional, eq(s.adicional.id, s.assinaturaMudanca.adicionalId))
    .where(
      and(
        eq(s.assinaturaMudanca.assinaturaId, a.id),
        inArray(s.assinaturaMudanca.situacao, ['agendada', 'aplicada']),
      ),
    )
    .orderBy(desc(s.assinaturaMudanca.criadoEm))
    .limit(30);
  const descontos = await tx
    .select({
      id: s.desconto.id,
      tipo: s.desconto.tipo,
      valor: s.desconto.valor,
      motivo: s.desconto.motivo,
      inicio: s.desconto.inicio,
      fim: s.desconto.fim,
    })
    .from(s.desconto)
    .where(
      and(
        eq(s.desconto.empresaId, empresaId),
        eq(s.desconto.ativo, true),
        or(isNull(s.desconto.fim), gte(s.desconto.fim, data)),
      ),
    )
    .orderBy(s.desconto.inicio);
  const limites = (await limitesEfetivos(tx, empresaId, data))!;
  const uso = await usoAtual(tx, empresaId);
  const recorrente =
    paraCentavos(a.valorContratado) +
    itens.reduce((t, i) => t + paraCentavos(i.valorUnitario) * i.quantidade, 0);
  return {
    id: a.id,
    plano: { id: a.planoId, nome: plano!.nome, formasPagamento: plano!.formasPagamento },
    periodicidade: a.periodicidade as Periodicidade,
    valorContratado: a.valorContratado,
    valorRecorrente: deCentavos(recorrente),
    inicio: a.inicio,
    emTeste: a.emTeste,
    fimTeste: a.fimTeste,
    cicloInicio: a.cicloInicio,
    cicloFim: a.cicloFim,
    proximaRenovacao: await proximaRenovacao(tx, a),
    diaVencimento: a.diaVencimento,
    diaVencimentoLivreEm: diaVencimentoLivreEm(a),
    formaPagamento: a.formaPagamento,
    itens: itens.map((i) => ({ ...i, tipoNome: NOMES_TIPO_ADICIONAL[i.tipo] })),
    mudancas: mudancas.map((m) => (paraPlataforma ? m : { ...m, motivo: null })),
    // O motivo do desconto é interno da plataforma.
    descontos: descontos.map((d) => (paraPlataforma ? d : { ...d, motivo: null })),
    limites,
    uso,
    excessos: excessos(limites, uso),
  };
}

/**
 * Eleva o contexto da transação para alterar as tabelas da assinatura (RLS). Só depois de conferir
 * que quem pede é o Master da empresa.
 */
export async function comoPlataforma(tx: Tx, usuarioId: string, empresaId: string): Promise<void> {
  await definirContexto(tx, { usuarioId, empresaId, plataforma: true });
}

type Acao = (c: Agente, a: Assinatura, req: FastifyRequest) => Promise<unknown>;

/** Data a partir da qual o Master pode mudar de novo o dia do vencimento; vazia se já pode. */
function diaVencimentoLivreEm(a: Assinatura): string | null {
  if (!a.diaVencimentoAlteradoEm) return null;
  const livre = somarDias(a.diaVencimentoAlteradoEm, INTERVALO_MUDANCA_VENCIMENTO_DIAS);
  return livre > hoje() ? livre : null;
}

/**
 * Dia do vencimento e forma de pagamento, pela Administração ou pelo Master do cliente. Vale para
 * as faturas emitidas daqui em diante; a já emitida mantém o vencimento. O Master muda o dia no
 * máximo uma vez a cada 90 dias; a Administração, quando precisar (05/10/2026).
 */
async function mudarCobranca(c: Agente, a: Assinatura, d: z.infer<typeof dadosCobranca>) {
  const [p] = await c.tx
    .select({ formas: s.plano.formasPagamento })
    .from(s.plano)
    .where(eq(s.plano.id, a.planoId));
  if (d.formaPagamento && !p!.formas.includes(d.formaPagamento)) {
    throw new ErroRegra('O plano não aceita essa forma de pagamento.', 'formaPagamento');
  }
  // O dia que já estava (de antes da lista) continua valendo até ser trocado.
  const mudouDia = d.diaVencimento !== a.diaVencimento;
  if (mudouDia && !diaVencimentoValido(d.diaVencimento)) {
    throw new ErroRegra(MENSAGEM_DIA_VENCIMENTO, 'diaVencimento');
  }
  const livreEm = diaVencimentoLivreEm(a);
  if (mudouDia && livreEm && c.origem === 'master') {
    const [ano, mes, dia] = livreEm.split('-');
    throw new ErroRegra(
      `O dia do vencimento só muda uma vez a cada ${INTERVALO_MUDANCA_VENCIMENTO_DIAS} dias. A próxima mudança fica liberada em ${dia}/${mes}/${ano}.`,
      'diaVencimento',
    );
  }
  await c.tx
    .update(s.assinatura)
    .set({
      diaVencimento: d.diaVencimento,
      ...(mudouDia ? { diaVencimentoAlteradoEm: hoje() } : {}),
      formaPagamento: d.formaPagamento,
      atualizadoEm: sql`now()`,
      atualizadoPor: c.usuarioId,
      versao: sql`${s.assinatura.versao} + 1`,
    })
    .where(eq(s.assinatura.id, a.id));
  await c.auditar({
    acao: 'editar',
    entidade: 'assinatura',
    registroId: a.id,
    empresaId: a.empresaId,
    antes: { diaVencimento: a.diaVencimento, formaPagamento: a.formaPagamento },
    depois: d,
  });
  return { ok: true };
}

/** As ações da assinatura, iguais para a Administração e para o Master. */
const ACOES: Record<string, Acao> = {
  plano: (c, a, req) =>
    comRecalculo(c, a, mudarPlano(c, a, mudarPlanoEntrada.parse(req.body).planoId)),
  periodicidade: (c, a, req) =>
    mudarPeriodicidade(c, a, mudarPeriodicidadeEntrada.parse(req.body).periodicidade),
  adicionais: (c, a, req) => {
    const d = incluirAdicionalEntrada.parse(req.body);
    return comRecalculo(c, a, incluirAdicional(c, a, d.adicionalId, d.quantidade));
  },
};

/** Mudança que vale na hora refaz a fatura do próximo ciclo já emitida e ainda não paga. */
async function comRecalculo(
  c: Agente,
  a: Assinatura,
  mudanca: Promise<ResultadoMudanca>,
): Promise<ResultadoMudanca> {
  const r = await mudanca;
  if (r.situacao === 'aplicada') await recalcularFaturaFutura(c.tx, a, c.usuarioId);
  return r;
}

export async function rotasAssinaturas(app: FastifyInstance): Promise<void> {
  const { db } = app.deps;
  const params = (req: FastifyRequest) =>
    z
      .object({ id: z.uuid().optional(), item: z.uuid().optional(), mudanca: z.uuid().optional() })
      .parse(req.params);

  // ---- Administração (ficha do cliente) ----

  const naFicha = (req: FastifyRequest, fn: (c: Agente, a: Assinatura) => Promise<unknown>) =>
    naPlataforma(db, req, ['plataforma.clientes', 'editar'], async (ctx) => {
      const a = await assinaturaVigente(ctx.tx, params(req).id!);
      return fn(
        { tx: ctx.tx, usuarioId: ctx.usuarioId, origem: 'plataforma', auditar: ctx.auditar },
        a,
      );
    });

  app.get<{ Params: { id: string } }>('/api/plataforma/empresas/:id/assinatura', async (req) =>
    naPlataforma(db, req, ['plataforma.clientes', 'visualizar'], async (ctx) =>
      resumoAssinatura(ctx.tx, z.uuid().parse(req.params.id), true),
    ),
  );
  for (const [nome, acao] of Object.entries(ACOES)) {
    app.post(`/api/plataforma/empresas/:id/assinatura/${nome}`, async (req) =>
      naFicha(req, (c, a) => acao(c, a, req)),
    );
  }
  app.post('/api/plataforma/empresas/:id/assinatura/adicionais/:item/retirar', async (req) =>
    naFicha(req, (c, a) =>
      retirarAdicional(c, a, params(req).item!, retirarAdicionalEntrada.parse(req.body).quantidade),
    ),
  );
  app.post('/api/plataforma/empresas/:id/assinatura/mudancas/:mudanca/cancelar', async (req) =>
    naFicha(req, async (c, a) => {
      await cancelarMudanca(c, a, params(req).mudanca!);
      return { ok: true };
    }),
  );
  app.put('/api/plataforma/empresas/:id/assinatura/cobranca', async (req) =>
    naFicha(req, (c, a) => mudarCobranca(c, a, dadosCobranca.parse(req.body))),
  );
  app.post('/api/plataforma/empresas/:id/descontos', async (req) =>
    naFicha(req, async (c, a) => {
      const d = descontoEntrada.parse(req.body);
      const [x] = await c.tx
        .insert(s.desconto)
        .values({ ...d, empresaId: a.empresaId, criadoPor: c.usuarioId })
        .returning({ id: s.desconto.id });
      await c.auditar({
        acao: 'criar',
        entidade: 'desconto',
        registroId: x!.id,
        empresaId: a.empresaId,
        depois: d,
        motivo: d.motivo,
      });
      return { id: x!.id };
    }),
  );
  app.post('/api/plataforma/empresas/:id/assinatura/reajuste', async (req) =>
    naFicha(req, async (c, a) => {
      const d = reajusteEntrada.parse(req.body);
      return reajustar(c, a, { valor: d.modo === 'valor' ? d.valor : null, motivo: d.motivo });
    }),
  );
  // Desconto editável (decidido em 04/10/2026, pendência 25): vale para as próximas faturas.
  app.put('/api/plataforma/empresas/:id/descontos/:item', async (req) =>
    naFicha(req, async (c, a) => {
      const d = descontoEntrada.parse(req.body);
      const [antes] = await c.tx
        .select()
        .from(s.desconto)
        .where(
          and(
            eq(s.desconto.id, params(req).item!),
            eq(s.desconto.empresaId, a.empresaId),
            eq(s.desconto.ativo, true),
          ),
        );
      if (!antes) throw new ErroNaoEncontrado('Desconto não encontrado.');
      await c.tx.update(s.desconto).set(d).where(eq(s.desconto.id, antes.id));
      await c.auditar({
        acao: 'editar',
        entidade: 'desconto',
        registroId: antes.id,
        empresaId: a.empresaId,
        antes,
        depois: d,
        motivo: d.motivo,
      });
      return { ok: true };
    }),
  );
  app.post('/api/plataforma/empresas/:id/descontos/:item/inativar', async (req) =>
    naFicha(req, async (c, a) => {
      const m = motivo.parse(req.body).motivo;
      const r = await c.tx
        .update(s.desconto)
        .set({
          ativo: false,
          inativadoEm: sql`now()`,
          inativadoPor: c.usuarioId,
          motivoInativacao: m,
        })
        .where(and(eq(s.desconto.id, params(req).item!), eq(s.desconto.empresaId, a.empresaId)))
        .returning({ id: s.desconto.id });
      if (!r.length) throw new ErroNaoEncontrado('Desconto não encontrado.');
      await c.auditar({
        acao: 'inativar',
        entidade: 'desconto',
        registroId: r[0]!.id,
        empresaId: a.empresaId,
        motivo: m,
      });
      return { ok: true };
    }),
  );

  // ---- Configurações › Assinatura (cliente) ----

  app.get('/api/assinatura', async (req) =>
    naEmpresa(db, req, ['gestao.assinatura', 'visualizar'], async (ctx) =>
      resumoAssinatura(ctx.tx, ctx.empresaId, false),
    ),
  );

  /** Planos e adicionais à venda no ciclo da assinatura, para o Master escolher. */
  app.get('/api/assinatura/opcoes', async (req) =>
    naEmpresa(db, req, ['gestao.assinatura', 'visualizar'], async (ctx) => {
      const a = await assinaturaVigente(ctx.tx, ctx.empresaId);
      const planos = (await listarPlanos(ctx.tx, false)).map((p) => ({
        id: p.id,
        nome: p.nome,
        descricao: p.descricao,
        modulos: p.modulos,
        limiteEstabelecimentos: p.limiteEstabelecimentos,
        limiteUsuarios: p.limiteUsuarios,
        limiteArmazenamentoGb: p.limiteArmazenamentoGb,
        precos: p.precos,
      }));
      const adicionais = (await listarAdicionais(ctx.tx, false)).map((x) => ({
        id: x.id,
        nome: x.nome,
        descricao: x.descricao,
        tipo: x.tipo,
        moduloCodigo: x.moduloCodigo,
        quantidadePorUnidade: x.quantidadePorUnidade,
        precos: x.precos,
      }));
      return { periodicidade: a.periodicidade, planos, adicionais };
    }),
  );

  // O Master gerencia a assinatura mesmo em somente leitura ou bloqueio: é como regulariza.
  const doMaster = (req: FastifyRequest, fn: (c: Agente, a: Assinatura) => Promise<unknown>) =>
    naEmpresa(db, req, ['gestao.assinatura', 'visualizar'], async (ctx) => {
      if (!ctx.acesso.eMaster) {
        throw new ErroPermissao('gestao.assinatura', 'editar', 'Só o Master muda a assinatura.');
      }
      const a = await assinaturaVigente(ctx.tx, ctx.empresaId);
      await comoPlataforma(ctx.tx, ctx.usuarioId, ctx.empresaId);
      return fn(
        { tx: ctx.tx, usuarioId: ctx.usuarioId, origem: 'master', auditar: ctx.auditar },
        a,
      );
    });

  for (const [nome, acao] of Object.entries(ACOES)) {
    app.post(`/api/assinatura/${nome}`, async (req) => doMaster(req, (c, a) => acao(c, a, req)));
  }
  app.put('/api/assinatura/cobranca', async (req) =>
    doMaster(req, (c, a) => mudarCobranca(c, a, dadosCobranca.parse(req.body))),
  );
  app.post('/api/assinatura/adicionais/:item/retirar', async (req) =>
    doMaster(req, (c, a) =>
      retirarAdicional(c, a, params(req).item!, retirarAdicionalEntrada.parse(req.body).quantidade),
    ),
  );
  app.post('/api/assinatura/mudancas/:mudanca/cancelar', async (req) =>
    doMaster(req, async (c, a) => {
      await cancelarMudanca(c, a, params(req).mudanca!);
      return { ok: true };
    }),
  );
}
