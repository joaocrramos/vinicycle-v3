// Régua de cobrança (administracao.md, Período de teste; Inadimplência e bloqueio):
//   - teste: avisos D-3 e D-1 ao Master e bloqueio direto no fim, sem contratação;
//   - fatura: avisos D-3 e no dia ao Master e ao contato financeiro; vencida, aviso e tolerância
//     de 5 dias; do 6º ao 20º dia, somente leitura; a partir do 21º, bloqueio;
//   - pagamento registrado: a empresa volta na hora ao que o atraso restante permite.
// A régua só mexe na situação que ela mesma pôs (ou na empresa ativa): bloqueio manual não muda.
import {
  diasEntre,
  formatarMoeda,
  paraCentavos,
  type SituacaoEmpresa,
  somarDias,
} from '@vinicycle/shared';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { emContexto, type Db, type Tx } from '../db/cliente';
import * as s from '../db/schema';
import { enfileirarEmail } from '../nucleo/email';
import { type AvisoCobranca, emailCobranca } from '../nucleo/modelos-email';
import {
  type Assinatura,
  excessosNaRenovacao,
  limitesEfetivos,
  proximaRenovacao,
  usoAtual,
} from './assinaturas';
import { enfileirarMensagem, querCanal } from './mensagens';
import { hoje } from './planos';

export interface ConfigRegua {
  toleranciaDias: number;
  somenteLeituraDias: number;
  avisosTesteDias: number[];
  avisosVencimentoDias: number[];
}

const fmt = (d: string) => d.split('-').reverse().join('/');
const ORDEM: Record<string, number> = { ativo: 0, somente_leitura: 1, bloqueado: 2 };

async function lerConfig(tx: Tx): Promise<ConfigRegua> {
  const [c] = await tx.select().from(s.configPlataforma);
  return {
    toleranciaDias: c?.toleranciaDias ?? 5,
    somenteLeituraDias: c?.somenteLeituraDias ?? 15,
    avisosTesteDias: c?.avisosTesteDias ?? [3, 1],
    avisosVencimentoDias: c?.avisosVencimentoDias ?? [3, 0],
  };
}

/** Situação que o atraso da fatura mais antiga pede. */
export function situacaoDevida(
  atrasoDias: number,
  c: Pick<ConfigRegua, 'toleranciaDias' | 'somenteLeituraDias'>,
): 'ativo' | 'somente_leitura' | 'bloqueado' {
  if (atrasoDias <= c.toleranciaDias) return 'ativo';
  if (atrasoDias <= c.toleranciaDias + c.somenteLeituraDias) return 'somente_leitura';
  return 'bloqueado';
}

/** Datas da régua para uma fatura vencida (faixa da tela e e-mails). */
export function prazosDaRegua(vencimento: string, c: ConfigRegua) {
  return {
    somenteLeituraEm: somarDias(vencimento, c.toleranciaDias + 1),
    bloqueioEm: somarDias(vencimento, c.toleranciaDias + c.somenteLeituraDias + 1),
  };
}

async function destinatarios(tx: Tx, empresaId: string): Promise<string[]> {
  const masters = await tx
    .select({ email: s.usuario.email })
    .from(s.vinculo)
    .innerJoin(s.usuario, eq(s.usuario.id, s.vinculo.usuarioId))
    .where(
      and(
        eq(s.vinculo.empresaId, empresaId),
        eq(s.vinculo.eMaster, true),
        eq(s.vinculo.ativo, true),
      ),
    );
  const [e] = await tx
    .select({ financeiro: s.empresa.contatoFinanceiroEmail })
    .from(s.empresa)
    .where(eq(s.empresa.id, empresaId));
  const todos = [...masters.map((m) => m.email), ...(e?.financeiro ? [e.financeiro] : [])];
  return [...new Set(todos.map((x) => x.toLowerCase()))];
}

async function nomeEmpresa(tx: Tx, empresaId: string): Promise<string> {
  const [e] = await tx
    .select({ nome: s.ficha.nome, fantasia: s.ficha.nomeFantasia })
    .from(s.empresa)
    .innerJoin(s.ficha, eq(s.ficha.id, s.empresa.fichaId))
    .where(eq(s.empresa.id, empresaId));
  return e?.fantasia || e?.nome || 'sua empresa';
}

/** Envia o aviso uma vez só por (tipo, referência, chave). Só ao Master, ou também ao financeiro. */
async function avisar(
  tx: Tx,
  url: string,
  empresaId: string,
  referenciaId: string,
  chave: string,
  aviso: AvisoCobranca,
  soMaster = false,
): Promise<boolean> {
  const novo = await tx
    .insert(s.avisoCobranca)
    .values({ empresaId, tipo: aviso.tipo, referenciaId, chave })
    .onConflictDoNothing()
    .returning({ id: s.avisoCobranca.id });
  if (!novo.length) return false;
  const empresa = await nomeEmpresa(tx, empresaId);
  // Também por WhatsApp e SMS aos Masters que pediram (Meu perfil), dentro da franquia.
  if (aviso.tipo !== 'franquia_esgotada') {
    const masters = await tx
      .select({ id: s.vinculo.usuarioId })
      .from(s.vinculo)
      .where(
        and(
          eq(s.vinculo.empresaId, empresaId),
          eq(s.vinculo.eMaster, true),
          eq(s.vinculo.ativo, true),
        ),
      );
    const m = emailCobranca({ para: '', empresa, link: `${url}/config/assinatura`, aviso });
    for (const master of masters) {
      for (const canal of ['whatsapp', 'sms'] as const) {
        if (!(await querCanal(tx, master.id, canal))) continue;
        await enfileirarMensagem(tx, {
          empresaId,
          usuarioId: master.id,
          canal,
          texto: `ViniCycle: ${m.assunto}. ${m.botao?.link ?? `${url}/config/assinatura`}`,
          modelo: `cobranca_${aviso.tipo}`,
          origem: 'cobranca',
          origemId: referenciaId,
        });
      }
    }
  }
  const para = soMaster
    ? (
        await tx
          .select({ email: s.usuario.email })
          .from(s.vinculo)
          .innerJoin(s.usuario, eq(s.usuario.id, s.vinculo.usuarioId))
          .where(
            and(
              eq(s.vinculo.empresaId, empresaId),
              eq(s.vinculo.eMaster, true),
              eq(s.vinculo.ativo, true),
            ),
          )
      ).map((m) => m.email)
    : await destinatarios(tx, empresaId);
  for (const email of para) {
    await enfileirarEmail(tx, {
      ...emailCobranca({ para: email, empresa, link: `${url}/config/assinatura`, aviso }),
      modelo: `cobranca_${aviso.tipo}`,
      origem: 'cobranca',
      origemId: referenciaId,
      empresaId,
    });
  }
  return true;
}

async function mudarSituacao(
  tx: Tx,
  empresaId: string,
  situacao: SituacaoEmpresa,
  origem: 'teste' | 'inadimplencia' | 'pagamento',
  motivo: string,
  usuarioId: string | null,
): Promise<void> {
  await tx
    .update(s.empresa)
    .set({ situacao, atualizadoEm: sql`now()`, versao: sql`${s.empresa.versao} + 1` })
    .where(eq(s.empresa.id, empresaId));
  await tx
    .insert(s.empresaSituacao)
    .values({ empresaId, situacao, origem, motivo, criadoPor: usuarioId });
}

/** A fatura em aberto mais antiga já vencida, se houver. */
export async function faturaMaisAtrasada(tx: Tx, empresaId: string, data: string) {
  const [f] = await tx
    .select({
      id: s.fatura.id,
      numero: s.fatura.numero,
      vencimento: s.fatura.vencimento,
      total: s.fatura.total,
    })
    .from(s.fatura)
    .where(
      and(
        eq(s.fatura.empresaId, empresaId),
        inArray(s.fatura.situacao, ['aberta', 'parcial', 'vencida']),
        sql`${s.fatura.vencimento} < ${data}`,
      ),
    )
    .orderBy(asc(s.fatura.vencimento))
    .limit(1);
  return f ?? null;
}

/**
 * Ajusta a situação da empresa ao atraso: sobe (somente leitura, bloqueio) ou desce (pagamento).
 * Só quando a situação atual é da régua; com `lembretes`, manda também os avisos de vencimento.
 */
export async function aplicarRegua(
  tx: Tx,
  empresaId: string,
  opcoes: { data: string; url: string; lembretes: boolean; usuarioId: string | null },
): Promise<void> {
  const cfg = await lerConfig(tx);
  const [e] = await tx
    .select({ situacao: s.empresa.situacao })
    .from(s.empresa)
    .where(eq(s.empresa.id, empresaId));
  if (!e || e.situacao === 'inativo' || e.situacao === 'teste') return;
  const [ultima] = await tx
    .select({ origem: s.empresaSituacao.origem })
    .from(s.empresaSituacao)
    .where(eq(s.empresaSituacao.empresaId, empresaId))
    .orderBy(desc(s.empresaSituacao.desde))
    .limit(1);
  const atrasada = await faturaMaisAtrasada(tx, empresaId, opcoes.data);
  const devida = atrasada
    ? situacaoDevida(diasEntre(atrasada.vencimento, opcoes.data), cfg)
    : 'ativo';
  const daRegua =
    e.situacao === 'ativo' ||
    (['somente_leitura', 'bloqueado'].includes(e.situacao) && ultima?.origem === 'inadimplencia');
  if (daRegua && devida !== e.situacao) {
    const subiu = ORDEM[devida]! > ORDEM[e.situacao]!;
    await mudarSituacao(
      tx,
      empresaId,
      devida,
      subiu ? 'inadimplencia' : 'pagamento',
      subiu
        ? `Fatura ${atrasada!.numero} vencida em ${fmt(atrasada!.vencimento)}`
        : 'Pagamento registrado',
      opcoes.usuarioId,
    );
    const prazos = atrasada ? prazosDaRegua(atrasada.vencimento, cfg) : null;
    if (subiu && devida === 'somente_leitura') {
      await avisar(tx, opcoes.url, empresaId, atrasada!.id, 'somente_leitura', {
        tipo: 'somente_leitura',
        numero: atrasada!.numero,
        bloqueioEm: fmt(prazos!.bloqueioEm),
      });
    } else if (subiu) {
      await avisar(tx, opcoes.url, empresaId, atrasada!.id, 'bloqueio', {
        tipo: 'bloqueio',
        numero: atrasada!.numero,
      });
    } else if (devida === 'ativo') {
      // Um aviso de liberação por fatura que causou a restrição.
      await avisar(
        tx,
        opcoes.url,
        empresaId,
        empresaId,
        `desbloqueio-${new Date().toISOString()}`,
        {
          tipo: 'desbloqueio',
        },
      );
    }
  }
  if (!opcoes.lembretes) return;
  const abertas = await tx
    .select()
    .from(s.fatura)
    .where(
      and(
        eq(s.fatura.empresaId, empresaId),
        inArray(s.fatura.situacao, ['aberta', 'parcial', 'vencida']),
      ),
    );
  for (const f of abertas) {
    if (paraCentavos(f.total) === 0) continue;
    const dias = diasEntre(opcoes.data, f.vencimento);
    const valor = formatarMoeda(paraCentavos(f.total));
    const [cobranca] = await tx
      .select({ link: s.cobrancaExterna.link })
      .from(s.cobrancaExterna)
      .where(and(eq(s.cobrancaExterna.faturaId, f.id), eq(s.cobrancaExterna.situacao, 'ativa')));
    const linkPagamento = cobranca?.link ?? null;
    if (cfg.avisosVencimentoDias.includes(dias)) {
      await avisar(tx, opcoes.url, empresaId, f.id, `D-${dias}`, {
        tipo: 'vencimento',
        dias,
        numero: f.numero,
        valor,
        vencimento: fmt(f.vencimento),
        linkPagamento,
      });
    }
    if (dias < 0 && -dias <= cfg.toleranciaDias) {
      await avisar(tx, opcoes.url, empresaId, f.id, 'vencida', {
        tipo: 'vencida',
        numero: f.numero,
        valor,
        vencimento: fmt(f.vencimento),
        somenteLeituraEm: fmt(prazosDaRegua(f.vencimento, cfg).somenteLeituraEm),
        linkPagamento,
      });
    }
  }
}

/** Teste: avisos antes do fim e bloqueio direto no fim, sem contratação. */
async function reguaDoTeste(tx: Tx, a: Assinatura, data: string, url: string): Promise<void> {
  if (!a.emTeste || !a.fimTeste) return;
  const cfg = await lerConfig(tx);
  const dias = diasEntre(data, a.fimTeste);
  if (cfg.avisosTesteDias.includes(dias)) {
    await avisar(
      tx,
      url,
      a.empresaId,
      a.id,
      `D-${dias}`,
      { tipo: 'teste_fim', dias, fim: fmt(a.fimTeste) },
      true,
    );
  }
  if (data > a.fimTeste) {
    const [e] = await tx
      .select({ situacao: s.empresa.situacao })
      .from(s.empresa)
      .where(eq(s.empresa.id, a.empresaId));
    if (e?.situacao === 'teste') {
      await mudarSituacao(
        tx,
        a.empresaId,
        'bloqueado',
        'teste',
        'Fim do teste sem contratação',
        null,
      );
      await avisar(tx, url, a.empresaId, a.id, 'encerrado', { tipo: 'teste_encerrado' }, true);
    }
  }
}

/** Aviso ao Master, uma semana antes da renovação, quando o agendado deixa o uso acima do limite. */
async function avisoDeLimite(tx: Tx, a: Assinatura, data: string, url: string): Promise<void> {
  if (a.emTeste || !a.cicloFim) return;
  const [agendada] = await tx
    .select({ id: s.assinaturaMudanca.id })
    .from(s.assinaturaMudanca)
    .where(
      and(eq(s.assinaturaMudanca.assinaturaId, a.id), eq(s.assinaturaMudanca.situacao, 'agendada')),
    )
    .limit(1);
  if (!agendada) return;
  const renovacao = await proximaRenovacao(tx, a);
  const faltam = diasEntre(data, renovacao);
  if (faltam < 1 || faltam > 7) return;
  const lista = await excessosNaRenovacao(tx, a);
  if (!lista.length) return;
  await avisar(
    tx,
    url,
    a.empresaId,
    a.id,
    renovacao,
    { tipo: 'limite_renovacao', renovacao: fmt(renovacao), excessos: lista },
    true,
  );
}

/** Franquia de mensagens do mês esgotada: o Master é avisado uma vez por mês e canal. */
async function avisoDeFranquia(tx: Tx, empresaId: string, data: string, url: string) {
  const lim = await limitesEfetivos(tx, empresaId, data);
  if (!lim) return;
  const uso = await usoAtual(tx, empresaId);
  const mes = data.slice(0, 7);
  for (const [canal, franquia, usado] of [
    ['WhatsApp', lim.mensagensWhatsapp, uso.mensagensWhatsapp],
    ['SMS', lim.mensagensSms, uso.mensagensSms],
  ] as const) {
    if (franquia > 0 && usado >= franquia) {
      await avisar(
        tx,
        url,
        empresaId,
        empresaId,
        `${mes}-${canal}`,
        { tipo: 'franquia_esgotada', canal, mes: `${mes.slice(5)}/${mes.slice(0, 4)}` },
        true,
      );
    }
  }
}

/** A régua de todas as empresas; cada uma na sua transação. */
export async function processarRegua(
  db: Db,
  url: string,
  log: Pick<FastifyBaseLogger, 'error'>,
  data = hoje(),
): Promise<void> {
  const empresas = await emContexto(db, { plataforma: true }, (tx) =>
    tx
      .select({ id: s.empresa.id })
      .from(s.empresa)
      .where(inArray(s.empresa.situacao, ['teste', 'ativo', 'somente_leitura', 'bloqueado'])),
  );
  for (const { id } of empresas) {
    try {
      await emContexto(db, { plataforma: true }, async (tx) => {
        const [a] = await tx
          .select()
          .from(s.assinatura)
          .where(and(eq(s.assinatura.empresaId, id), eq(s.assinatura.situacao, 'vigente')));
        if (a) {
          await reguaDoTeste(tx, a, data, url);
          await avisoDeLimite(tx, a, data, url);
        }
        await aplicarRegua(tx, id, { data, url, lembretes: true, usuarioId: null });
        await avisoDeFranquia(tx, id, data, url);
      });
    } catch (e) {
      log.error({ erro: e, empresa: id }, 'Falha na régua de cobrança');
    }
  }
}
