// Integrações de pagamento (administracao.md, Integração de pagamentos; decidido em 04/10/2026,
// pendência 25: Asaas e a nota de serviço pelo provedor).
//   - Administração › Integrações: provedor, ambiente, chave e token do aviso cifrados (P21).
//   - Tarefa (a cada 2 minutos): cria no provedor a cobrança das faturas em aberto, cancela as das
//     faturas canceladas ou pagas por fora e pede a nota de serviço das pagas. Nada de chamada
//     externa dentro da transação: a linha é reservada antes e atualizada depois.
//   - Aviso do provedor (/api/avisos/:id): token conferido, registro de todo aviso, processamento
//     uma vez só; pago vira recebimento (origem provedor) e libera a régua na hora.
import {
  type EventoPadrao,
  FORMAS_PROVEDOR,
  integracaoPagamentoEntrada,
  paraCentavos,
} from '@vinicycle/shared'
import { and, asc, eq, isNull, lt, sql } from 'drizzle-orm'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { z } from 'zod'
import { emContexto, type Db, type Tx } from '../db/cliente'
import * as s from '../db/schema'
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros'
import {
  type AvisoPadrao,
  type Buscar,
  ErroProvedor,
  type ProvedorPagamento,
  provedorAsaas,
  tokenConfere,
} from '../nucleo/pagamentos'
import { naPlataforma } from '../nucleo/requisicao'
import { cifrar, decifrar, gerarToken } from '../nucleo/seguranca'
import { atualizarSituacaoFatura, lerFatura } from './cobranca'
import { provedorMensagemDe } from './mensagens'
import { hoje } from './planos'
import { aplicarRegua } from './regua'

type Integracao = typeof s.integracao.$inferSelect

/** Nos testes, o provedor responde por uma função simulada. */
let buscarProvedor: Buscar = (url, init) => fetch(url, init)
export function definirBuscarProvedor(b: Buscar): void {
  buscarProvedor = b
}

interface Credenciais {
  chave?: string
}

export function provedorDe(i: Integracao, chaveCifra: string): ProvedorPagamento {
  const cred: Credenciais = i.credenciaisCifradas
    ? (JSON.parse(decifrar(chaveCifra, i.credenciaisCifradas)) as Credenciais)
    : {}
  if (!cred.chave) throw new ErroRegra('A integração está sem a chave de acesso.', 'sem_chave')
  if (i.adaptador === 'asaas') {
    return provedorAsaas({
      ambiente: i.ambiente as 'teste' | 'producao',
      chave: cred.chave,
      buscar: buscarProvedor,
    })
  }
  throw new ErroRegra(`Adaptador sem implementação: ${i.adaptador}.`, 'adaptador')
}

interface ConfigNota {
  nfse?: {
    ativa: boolean
    codigoServico: string | null
    descricao: string | null
    aliquotaIss: string | null
  }
}

/** Integração de pagamento ativa que cobra a forma da fatura (vazia = qualquer uma ativa). */
async function integracaoParaForma(tx: Tx, forma: string | null): Promise<Integracao | null> {
  const ativas = await tx
    .select()
    .from(s.integracao)
    .where(and(eq(s.integracao.tipo, 'pagamento'), eq(s.integracao.ativo, true)))
    .orderBy(asc(s.integracao.criadoEm))
  return ativas.find((i) => !forma || i.formas.includes(forma)) ?? null
}

/** A cobrança no provedor de uma fatura deixa de valer (fatura cancelada ou paga por fora). */
export async function pedirCancelamentoExterno(tx: Tx, faturaId: string): Promise<void> {
  await tx
    .update(s.cobrancaExterna)
    .set({ situacao: 'cancelar', atualizadoEm: sql`now()` })
    .where(and(eq(s.cobrancaExterna.faturaId, faturaId), eq(s.cobrancaExterna.situacao, 'ativa')))
}

async function dadosDoCliente(tx: Tx, empresaId: string) {
  const [e] = await tx
    .select({
      nome: s.ficha.nome,
      documento: s.ficha.documento,
      fichaId: s.ficha.id,
      financeiro: s.empresa.contatoFinanceiroEmail,
      telefone: s.empresa.contatoFinanceiroTelefone,
    })
    .from(s.empresa)
    .innerJoin(s.ficha, eq(s.ficha.id, s.empresa.fichaId))
    .where(eq(s.empresa.id, empresaId))
  const contatos = await tx
    .select({
      tipo: s.fichaContato.tipo,
      valor: s.fichaContato.valor,
      principal: s.fichaContato.principal,
    })
    .from(s.fichaContato)
    .where(eq(s.fichaContato.fichaId, e!.fichaId))
  const email =
    e!.financeiro ??
    contatos
      .filter((c) => c.tipo === 'email')
      .sort((a, b) => Number(b.principal) - Number(a.principal))[0]?.valor ??
    null
  return {
    nome: e!.nome,
    documento: e!.documento,
    email,
    telefone: e!.telefone,
    referencia: empresaId,
  }
}

/** Cria no provedor as cobranças das faturas em aberto que ainda não têm. */
async function criarCobrancas(db: Db, chaveCifra: string, log: Pick<FastifyBaseLogger, 'error'>) {
  const candidatas = await emContexto(db, { plataforma: true }, async (tx) => {
    // Reserva presa (queda no meio): vira erro e pode ser tentada de novo.
    await tx
      .update(s.cobrancaExterna)
      .set({ situacao: 'erro', ultimoErro: 'Sem resposta do provedor' })
      .where(
        and(
          eq(s.cobrancaExterna.situacao, 'pendente'),
          lt(s.cobrancaExterna.atualizadoEm, sql`now() - interval '10 minutes'`),
        ),
      )
    const r = await tx.execute<{ id: string; empresa_id: string; forma: string | null }>(sql`
      select f.id, f.empresa_id, a.forma_pagamento as forma
      from fatura f left join assinatura a on a.id = f.assinatura_id
      where f.situacao in ('aberta', 'parcial', 'vencida') and f.total > 0
        and not exists (select 1 from cobranca_externa c where c.fatura_id = f.id
          and c.situacao not in ('cancelada', 'erro'))
        and (select count(*) from cobranca_externa c where c.fatura_id = f.id and c.situacao = 'erro') < 5
      order by f.vencimento limit 50`)
    return r.rows
  })
  for (const c of candidatas) {
    // Transferência, dinheiro e débito ficam na baixa manual.
    if (c.forma && !(FORMAS_PROVEDOR as readonly string[]).includes(c.forma)) continue
    let reserva: { id: string; integracao: Integracao } | null = null
    try {
      reserva = await emContexto(db, { plataforma: true }, async (tx) => {
        const i = await integracaoParaForma(tx, c.forma)
        if (!i) return null
        const [x] = await tx
          .insert(s.cobrancaExterna)
          .values({
            faturaId: c.id,
            empresaId: c.empresa_id,
            integracaoId: i.id,
            forma: c.forma,
            situacao: 'pendente',
          })
          .onConflictDoNothing()
          .returning({ id: s.cobrancaExterna.id })
        return x ? { id: x.id, integracao: i } : null
      })
      if (!reserva) continue
      const provedor = provedorDe(reserva.integracao, chaveCifra)
      const { cliente, fatura, clienteExterno } = await emContexto(
        db,
        { plataforma: true },
        async (tx) => ({
          cliente: await dadosDoCliente(tx, c.empresa_id),
          fatura: await lerFatura(tx, c.id),
          clienteExterno: (
            await tx
              .select({ id: s.clienteProvedor.identificadorExterno })
              .from(s.clienteProvedor)
              .where(
                and(
                  eq(s.clienteProvedor.empresaId, c.empresa_id),
                  eq(s.clienteProvedor.integracaoId, reserva!.integracao.id),
                ),
              )
          )[0]?.id,
        }),
      )
      const clienteId = clienteExterno ?? (await provedor.garantirCliente(cliente))
      const criada = await provedor.criarCobranca({
        clienteId,
        valor: fatura.saldo,
        // Vencida: o provedor não aceita data passada; vence hoje.
        vencimento: fatura.vencimento < hoje() ? hoje() : fatura.vencimento,
        descricao: `ViniCycle · fatura ${fatura.numero}`,
        referencia: fatura.id,
        forma: c.forma as 'pix' | 'boleto' | 'cartao_credito' | null,
      })
      await emContexto(db, { plataforma: true }, async (tx) => {
        if (!clienteExterno) {
          await tx
            .insert(s.clienteProvedor)
            .values({
              empresaId: c.empresa_id,
              integracaoId: reserva!.integracao.id,
              identificadorExterno: clienteId,
            })
            .onConflictDoNothing()
        }
        await tx
          .update(s.cobrancaExterna)
          .set({
            situacao: 'ativa',
            identificadorExterno: criada.id,
            link: criada.link,
            pixCopiaCola: criada.pixCopiaCola,
            atualizadoEm: sql`now()`,
          })
          .where(eq(s.cobrancaExterna.id, reserva!.id))
      })
    } catch (e) {
      log.error({ erro: e, fatura: c.id }, 'Falha ao criar a cobrança no provedor')
      if (reserva) {
        await emContexto(db, { plataforma: true }, (tx) =>
          tx
            .update(s.cobrancaExterna)
            .set({
              situacao: 'erro',
              tentativas: sql`${s.cobrancaExterna.tentativas} + 1`,
              ultimoErro: (e as Error).message.slice(0, 500),
              atualizadoEm: sql`now()`,
            })
            .where(eq(s.cobrancaExterna.id, reserva!.id)),
        )
      }
    }
  }
}

async function cancelarCobrancas(
  db: Db,
  chaveCifra: string,
  log: Pick<FastifyBaseLogger, 'error'>,
) {
  const lista = await emContexto(db, { plataforma: true }, (tx) =>
    tx
      .select({ c: s.cobrancaExterna, i: s.integracao })
      .from(s.cobrancaExterna)
      .innerJoin(s.integracao, eq(s.integracao.id, s.cobrancaExterna.integracaoId))
      .where(eq(s.cobrancaExterna.situacao, 'cancelar'))
      .limit(50),
  )
  for (const { c, i } of lista) {
    try {
      if (c.identificadorExterno)
        await provedorDe(i, chaveCifra).cancelarCobranca(c.identificadorExterno)
      await emContexto(db, { plataforma: true }, (tx) =>
        tx
          .update(s.cobrancaExterna)
          .set({ situacao: 'cancelada', atualizadoEm: sql`now()` })
          .where(eq(s.cobrancaExterna.id, c.id)),
      )
    } catch (e) {
      // Já apagada no provedor: está cancelada do mesmo jeito.
      const naoExiste = e instanceof ErroProvedor && e.status === 404
      if (!naoExiste)
        log.error({ erro: e, cobranca: c.id }, 'Falha ao cancelar a cobrança no provedor')
      await emContexto(db, { plataforma: true }, (tx) =>
        tx
          .update(s.cobrancaExterna)
          .set(
            naoExiste
              ? { situacao: 'cancelada', atualizadoEm: sql`now()` }
              : {
                  tentativas: sql`${s.cobrancaExterna.tentativas} + 1`,
                  ultimoErro: (e as Error).message.slice(0, 500),
                  atualizadoEm: sql`now()`,
                },
          )
          .where(eq(s.cobrancaExterna.id, c.id)),
      )
    }
  }
}

async function emitirNotas(db: Db, chaveCifra: string, log: Pick<FastifyBaseLogger, 'error'>) {
  const lista = await emContexto(db, { plataforma: true }, (tx) =>
    tx
      .select({
        n: s.notaServico,
        i: s.integracao,
        cobranca: s.cobrancaExterna.identificadorExterno,
        numero: s.fatura.numero,
        total: s.fatura.total,
      })
      .from(s.notaServico)
      .innerJoin(s.integracao, eq(s.integracao.id, s.notaServico.integracaoId))
      .innerJoin(s.fatura, eq(s.fatura.id, s.notaServico.faturaId))
      .innerJoin(
        s.cobrancaExterna,
        and(
          eq(s.cobrancaExterna.faturaId, s.notaServico.faturaId),
          eq(s.cobrancaExterna.situacao, 'paga'),
        ),
      )
      .where(and(eq(s.notaServico.situacao, 'pendente'), lt(s.notaServico.tentativas, 5)))
      .limit(50),
  )
  for (const l of lista) {
    const cfg = (l.i.configuracao as ConfigNota).nfse
    try {
      const id = await provedorDe(l.i, chaveCifra).emitirNota({
        cobrancaId: l.cobranca!,
        valor: l.total,
        data: hoje(),
        descricao: cfg?.descricao || 'Licença de uso do sistema ViniCycle',
        codigoServico: cfg?.codigoServico ?? null,
        aliquotaIss: cfg?.aliquotaIss ?? null,
        referencia: String(l.numero),
      })
      await emContexto(db, { plataforma: true }, (tx) =>
        tx
          .update(s.notaServico)
          .set({ situacao: 'agendada', identificadorExterno: id, atualizadoEm: sql`now()` })
          .where(eq(s.notaServico.id, l.n.id)),
      )
    } catch (e) {
      log.error({ erro: e, nota: l.n.id }, 'Falha ao pedir a nota de serviço')
      await emContexto(db, { plataforma: true }, (tx) =>
        tx
          .update(s.notaServico)
          .set({
            tentativas: sql`${s.notaServico.tentativas} + 1`,
            ultimoErro: (e as Error).message.slice(0, 500),
            situacao: sql`case when ${s.notaServico.tentativas} + 1 >= 5 then 'erro' else 'pendente' end`,
            atualizadoEm: sql`now()`,
          })
          .where(eq(s.notaServico.id, l.n.id)),
      )
    }
  }
}

export async function processarIntegracoes(
  db: Db,
  chaveCifra: string,
  log: Pick<FastifyBaseLogger, 'error'>,
): Promise<void> {
  await criarCobrancas(db, chaveCifra, log)
  await cancelarCobrancas(db, chaveCifra, log)
  await emitirNotas(db, chaveCifra, log)
}

export function iniciarTarefaIntegracoes(
  db: Db,
  chaveCifra: string,
  log: Pick<FastifyBaseLogger, 'error'>,
  intervaloMs = 2 * 60_000,
): () => void {
  let parar = false
  let timer: NodeJS.Timeout | undefined
  const ciclo = async () => {
    try {
      await processarIntegracoes(db, chaveCifra, log)
    } catch (e) {
      log.error({ erro: e }, 'Falha na tarefa de integrações')
    }
    if (!parar) timer = setTimeout(ciclo, intervaloMs)
  }
  timer = setTimeout(ciclo, 60_000)
  return () => {
    parar = true
    clearTimeout(timer)
  }
}

/** O efeito de um aviso já traduzido. Devolve o que foi feito, para o registro. */
export async function processarAviso(
  tx: Tx,
  i: Integracao,
  a: AvisoPadrao,
  url: string,
): Promise<string> {
  const [c] = a.cobrancaId
    ? await tx
        .select()
        .from(s.cobrancaExterna)
        .where(
          and(
            eq(s.cobrancaExterna.integracaoId, i.id),
            eq(s.cobrancaExterna.identificadorExterno, a.cobrancaId),
          ),
        )
    : []
  const acompanhar = (empresaId: string) =>
    aplicarRegua(tx, empresaId, { data: hoje(), url, lembretes: false, usuarioId: null })
  switch (a.tipo as EventoPadrao) {
    case 'pago': {
      if (!c) return 'cobrança desconhecida'
      const f = await lerFatura(tx, c.faturaId)
      const saldo = paraCentavos(f.saldo)
      if (f.situacao === 'cancelada' || saldo === 0) {
        // Pago no provedor sem saldo aqui: registra para a conferência, sem baixa.
        await tx
          .update(s.cobrancaExterna)
          .set({ situacao: 'paga' })
          .where(eq(s.cobrancaExterna.id, c.id))
        return `pago sem saldo na fatura ${f.numero} (conferir)`
      }
      const valor = Math.min(saldo, paraCentavos(a.valor ?? f.saldo))
      await tx.insert(s.recebimento).values({
        faturaId: f.id,
        empresaId: f.empresaId,
        data: a.data ?? hoje(),
        valor: (valor / 100).toFixed(2),
        forma: a.forma ?? (c.forma as 'pix' | 'boleto' | 'cartao_credito' | null) ?? 'pix',
        referencia: a.cobrancaId,
        origem: 'provedor',
      })
      const situacao = await atualizarSituacaoFatura(tx, f.id)
      await tx
        .update(s.cobrancaExterna)
        .set({ situacao: 'paga' })
        .where(eq(s.cobrancaExterna.id, c.id))
      if ((i.configuracao as ConfigNota).nfse?.ativa && situacao === 'paga') {
        await tx
          .insert(s.notaServico)
          .values({
            faturaId: f.id,
            empresaId: f.empresaId,
            integracaoId: i.id,
            situacao: 'pendente',
          })
          .onConflictDoNothing()
      }
      await acompanhar(f.empresaId)
      return `baixa de ${(valor / 100).toFixed(2)} na fatura ${f.numero}`
    }
    case 'estornado': {
      if (!c) return 'cobrança desconhecida'
      const r = await tx
        .update(s.recebimento)
        .set({
          estornadoEm: sql`now()`,
          motivoEstorno: `Estorno no provedor (${a.tipoOriginal})`,
        })
        .where(
          and(
            eq(s.recebimento.faturaId, c.faturaId),
            eq(s.recebimento.origem, 'provedor'),
            eq(s.recebimento.referencia, a.cobrancaId!),
            isNull(s.recebimento.estornadoEm),
          ),
        )
        .returning({ id: s.recebimento.id })
      await atualizarSituacaoFatura(tx, c.faturaId)
      await tx
        .update(s.cobrancaExterna)
        .set({ situacao: 'ativa' })
        .where(eq(s.cobrancaExterna.id, c.id))
      await acompanhar(c.empresaId)
      return r.length ? 'recebimento estornado' : 'sem recebimento para estornar'
    }
    case 'vencido':
      if (c) await atualizarSituacaoFatura(tx, c.faturaId)
      return 'vencimento registrado'
    case 'recusado':
      return 'cartão recusado no provedor'
    case 'cancelado':
      if (c && c.situacao !== 'paga') {
        await tx
          .update(s.cobrancaExterna)
          .set({ situacao: 'cancelada' })
          .where(eq(s.cobrancaExterna.id, c.id))
      }
      return 'cobrança apagada no provedor'
    case 'nota_emitida':
    case 'nota_erro': {
      if (!a.notaId) return 'nota sem identificador'
      const r = await tx
        .update(s.notaServico)
        .set(
          a.tipo === 'nota_emitida'
            ? {
                situacao: 'emitida',
                numero: a.numeroNota,
                linkPdf: a.linkPdf,
                linkXml: a.linkXml,
                atualizadoEm: sql`now()`,
              }
            : { situacao: 'erro', ultimoErro: a.erro, atualizadoEm: sql`now()` },
        )
        .where(
          and(
            eq(s.notaServico.integracaoId, i.id),
            eq(s.notaServico.identificadorExterno, a.notaId),
          ),
        )
        .returning({ id: s.notaServico.id })
      return r.length ? a.tipo : 'nota desconhecida'
    }
    default:
      return 'ignorado'
  }
}

function resumo(i: Integracao, url: string) {
  const cfg = i.configuracao as ConfigNota
  return {
    id: i.id,
    tipo: i.tipo,
    adaptador: i.adaptador,
    nome: i.nome,
    ambiente: i.ambiente,
    formas: i.formas,
    nfse: cfg.nfse ?? { ativa: false, codigoServico: null, descricao: null, aliquotaIss: null },
    ativo: i.ativo,
    chaveConfigurada: !!i.credenciaisCifradas,
    urlAviso: `${url}/api/avisos/${i.id}`,
    // WhatsApp: número, modelo aprovado e idioma (sem segredo).
    numeroId: (i.configuracao as { numeroId?: string }).numeroId ?? null,
    modelo: (i.configuracao as { modelo?: string }).modelo ?? null,
    idioma: (i.configuracao as { idioma?: string }).idioma ?? null,
  }
}

export async function rotasIntegracoes(app: FastifyInstance): Promise<void> {
  const { db, config } = app.deps
  const F = 'plataforma.integracoes'
  const cifra = config.CHAVE_CIFRA

  app.get('/api/plataforma/integracoes', async (req) =>
    naPlataforma(db, req, [F, 'visualizar'], async ({ tx }) => {
      const lista = await tx.select().from(s.integracao).orderBy(asc(s.integracao.criadoEm))
      return lista.map((i) => resumo(i, config.URL_APLICACAO))
    }),
  )

  app.post('/api/plataforma/integracoes', async (req) =>
    naPlataforma(db, req, [F, 'criar'], async ({ tx, usuarioId, auditar }) => {
      const d = integracaoPagamentoEntrada.parse(req.body)
      if (!d.chave) throw new ErroRegra('Informe a chave de acesso do provedor.', 'chave')
      const [i] = await tx
        .insert(s.integracao)
        .values({
          tipo: 'pagamento',
          adaptador: d.adaptador,
          nome: d.nome,
          ambiente: d.ambiente,
          formas: d.formas,
          configuracao: { nfse: d.nfse },
          credenciaisCifradas: cifrar(cifra, JSON.stringify({ chave: d.chave })),
          tokenAvisoCifrado: cifrar(cifra, gerarToken().token),
          ativo: d.ativo,
          criadoPor: usuarioId,
          atualizadoPor: usuarioId,
        })
        .returning()
      await auditar({
        acao: 'criar',
        entidade: 'integracao',
        registroId: i!.id,
        depois: { ...d, chave: '(cifrada)' },
      })
      return resumo(i!, config.URL_APLICACAO)
    }),
  )

  app.put<{ Params: { id: string } }>('/api/plataforma/integracoes/:id', async (req) =>
    naPlataforma(db, req, [F, 'editar'], async ({ tx, usuarioId, auditar }) => {
      const id = z.uuid().parse(req.params.id)
      const d = integracaoPagamentoEntrada.parse(req.body)
      const [antes] = await tx.select().from(s.integracao).where(eq(s.integracao.id, id))
      if (!antes) throw new ErroNaoEncontrado('Integração não encontrada.')
      await tx
        .update(s.integracao)
        .set({
          nome: d.nome,
          ambiente: d.ambiente,
          formas: d.formas,
          configuracao: { ...(antes.configuracao as object), nfse: d.nfse },
          ...(d.chave
            ? { credenciaisCifradas: cifrar(cifra, JSON.stringify({ chave: d.chave })) }
            : {}),
          ativo: d.ativo,
          atualizadoEm: sql`now()`,
          atualizadoPor: usuarioId,
          versao: sql`${s.integracao.versao} + 1`,
        })
        .where(eq(s.integracao.id, id))
      await auditar({
        acao: 'editar',
        entidade: 'integracao',
        registroId: id,
        depois: { ...d, chave: d.chave ? '(trocada)' : '(mantida)' },
      })
      return { ok: true }
    }),
  )

  /** O token que o provedor manda em cada aviso: para copiar na configuração do provedor. */
  app.get<{ Params: { id: string } }>('/api/plataforma/integracoes/:id/token', async (req) =>
    naPlataforma(db, req, [F, 'editar'], async ({ tx, auditar }) => {
      const id = z.uuid().parse(req.params.id)
      const [i] = await tx.select().from(s.integracao).where(eq(s.integracao.id, id))
      if (!i?.tokenAvisoCifrado) throw new ErroNaoEncontrado('Integração não encontrada.')
      await auditar({ acao: 'ver_token', entidade: 'integracao', registroId: id })
      return { token: decifrar(cifra, i.tokenAvisoCifrado) }
    }),
  )

  app.post<{ Params: { id: string } }>('/api/plataforma/integracoes/:id/token', async (req) =>
    naPlataforma(db, req, [F, 'editar'], async ({ tx, auditar }) => {
      const id = z.uuid().parse(req.params.id)
      const token = gerarToken().token
      const r = await tx
        .update(s.integracao)
        .set({ tokenAvisoCifrado: cifrar(cifra, token), atualizadoEm: sql`now()` })
        .where(eq(s.integracao.id, id))
        .returning({ id: s.integracao.id })
      if (!r.length) throw new ErroNaoEncontrado('Integração não encontrada.')
      await auditar({ acao: 'trocar_token', entidade: 'integracao', registroId: id })
      return { token }
    }),
  )

  app.post<{ Params: { id: string } }>('/api/plataforma/integracoes/:id/testar', async (req) => {
    const i = await naPlataforma(db, req, [F, 'editar'], async ({ tx }) => {
      const [x] = await tx
        .select()
        .from(s.integracao)
        .where(eq(s.integracao.id, z.uuid().parse(req.params.id)))
      if (!x) throw new ErroNaoEncontrado('Integração não encontrada.')
      return x
    })
    try {
      if (i.tipo === 'pagamento') await provedorDe(i, cifra).testarConexao()
      else await provedorMensagemDe(i, cifra).testarConexao()
      return { ok: true, mensagem: 'Conexão com o provedor confirmada.' }
    } catch (e) {
      return { ok: false, mensagem: (e as Error).message }
    }
  })

  /** Situação das cobranças e notas no provedor, para a ficha da fatura. */
  app.get<{ Params: { id: string } }>('/api/plataforma/faturas/:id/provedor', async (req) =>
    naPlataforma(db, req, ['plataforma.faturas', 'visualizar'], async ({ tx }) => {
      const id = z.uuid().parse(req.params.id)
      const cobrancas = await tx
        .select()
        .from(s.cobrancaExterna)
        .where(eq(s.cobrancaExterna.faturaId, id))
        .orderBy(asc(s.cobrancaExterna.criadoEm))
      const notas = await tx.select().from(s.notaServico).where(eq(s.notaServico.faturaId, id))
      return { cobrancas, notas }
    }),
  )

  // ---- Aviso do provedor (público, conferido pelo token) ----

  app.post<{ Params: { id: string } }>('/api/avisos/:id', async (req, reply) => {
    const id = z.uuid().safeParse(req.params.id)
    if (!id.success) return reply.code(404).send({ ok: false })
    return emContexto(db, { plataforma: true }, async (tx) => {
      const [i] = await tx
        .select()
        .from(s.integracao)
        .where(and(eq(s.integracao.id, id.data), eq(s.integracao.ativo, true)))
      if (!i?.tokenAvisoCifrado) return reply.code(404).send({ ok: false })
      const cabecalho = req.headers['asaas-access-token']
      if (
        !tokenConfere(
          Array.isArray(cabecalho) ? cabecalho[0] : cabecalho,
          decifrar(cifra, i.tokenAvisoCifrado),
        )
      ) {
        req.log.warn({ integracao: i.id }, 'Aviso com token inválido')
        return reply.code(401).send({ ok: false })
      }
      const aviso = provedorDe(i, cifra).traduzirAviso(req.body)
      const [e] = await tx
        .insert(s.eventoIntegracao)
        .values({
          integracaoId: i.id,
          identificadorExterno: aviso.identificador,
          tipoOriginal: aviso.tipoOriginal,
          tipoPadrao: aviso.tipo,
          conteudo: req.body as object,
          assinaturaVerificada: true,
        })
        .onConflictDoNothing()
        .returning({ id: s.eventoIntegracao.id })
      // Repetido: já foi processado; responde certo para o provedor não reenviar.
      if (!e) return { ok: true, repetido: true }
      const resultado = await processarAviso(tx, i, aviso, config.URL_APLICACAO)
      await tx
        .update(s.eventoIntegracao)
        .set({ processadoEm: sql`now()`, resultado })
        .where(eq(s.eventoIntegracao.id, e.id))
      return { ok: true }
    })
  })

  app.get('/api/plataforma/integracoes/avisos', async (req) =>
    naPlataforma(db, req, [F, 'visualizar'], async ({ tx }) =>
      tx
        .select({
          id: s.eventoIntegracao.id,
          integracao: s.integracao.nome,
          tipoOriginal: s.eventoIntegracao.tipoOriginal,
          tipoPadrao: s.eventoIntegracao.tipoPadrao,
          recebidoEm: s.eventoIntegracao.recebidoEm,
          resultado: s.eventoIntegracao.resultado,
        })
        .from(s.eventoIntegracao)
        .innerJoin(s.integracao, eq(s.integracao.id, s.eventoIntegracao.integracaoId))
        .orderBy(sql`${s.eventoIntegracao.recebidoEm} desc`)
        .limit(100),
    ),
  )
}
