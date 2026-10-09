// Mensagens por WhatsApp e SMS, Envios e Modelos de mensagem (administracao.md, Mapa de telas;
// P20; decidido em 04/10/2026, pendência 25):
//   - cada usuário escolhe receber os avisos também por WhatsApp ou SMS (Meu perfil), com o
//     telefone do cadastro;
//   - a franquia mensal vem dos pacotes adicionais, um por canal; sem franquia, sem integração ou
//     sem telefone, o aviso segue só por e-mail e na tela;
//   - a fila de WhatsApp e SMS é processada pela integração ativa do canal.
import {
  CANAIS_MENSAGEM,
  consultaListagem,
  integracaoWhatsappEntrada,
  MODELOS_EDITAVEIS,
  type CodigoModeloEditavel,
  versaoModeloEntrada,
} from '@vinicycle/shared';
import { and, asc, desc, eq, lte, max, sql } from 'drizzle-orm';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { emContexto, type Db, type Tx } from '../db/cliente';
import * as s from '../db/schema';
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros';
import { buscaTexto, listar } from '../nucleo/listagem';
import {
  type ProvedorMensagem,
  provedorMetaWhatsapp,
  telefoneInternacional,
} from '../nucleo/mensageria';
import { emailCobranca, emailConvite } from '../nucleo/modelos-email';
import type { Buscar } from '../nucleo/pagamentos';
import { naPlataforma } from '../nucleo/requisicao';
import { cifrar, decifrar } from '../nucleo/seguranca';
import { inicioDoMes, limitesEfetivos } from './assinaturas';

type Integracao = typeof s.integracao.$inferSelect;

let buscarMensagens: Buscar = (url, init) => fetch(url, init);
export function definirBuscarMensagens(b: Buscar): void {
  buscarMensagens = b;
}

interface ConfigWhatsapp {
  numeroId?: string;
  modelo?: string;
  idioma?: string;
}

export function provedorMensagemDe(i: Integracao, chaveCifra: string): ProvedorMensagem {
  const cred = i.credenciaisCifradas
    ? (JSON.parse(decifrar(chaveCifra, i.credenciaisCifradas)) as { chave?: string })
    : {};
  const cfg = i.configuracao as ConfigWhatsapp;
  if (i.tipo === 'whatsapp' && i.adaptador === 'meta' && cred.chave && cfg.numeroId && cfg.modelo) {
    return provedorMetaWhatsapp({
      token: cred.chave,
      numeroId: cfg.numeroId,
      modelo: cfg.modelo,
      idioma: cfg.idioma ?? 'pt_BR',
      buscar: buscarMensagens,
    });
  }
  throw new ErroRegra('Integração de mensagem incompleta.', 'integracao');
}

/** Telefone do usuário para o canal: WhatsApp marcado no cadastro, ou o telefone principal. */
async function telefoneDoUsuario(tx: Tx, usuarioId: string, canal: 'whatsapp' | 'sms') {
  const contatos = await tx
    .select({
      valor: s.fichaContato.valor,
      whatsapp: s.fichaContato.whatsapp,
      principal: s.fichaContato.principal,
    })
    .from(s.usuario)
    .innerJoin(s.fichaContato, eq(s.fichaContato.fichaId, s.usuario.fichaId))
    .where(and(eq(s.usuario.id, usuarioId), eq(s.fichaContato.tipo, 'telefone')));
  const escolhido =
    canal === 'whatsapp'
      ? contatos.find((c) => c.whatsapp)
      : (contatos.find((c) => c.principal) ?? contatos[0]);
  return telefoneInternacional(escolhido?.valor);
}

export type ResultadoMensagem = 'enfileirada' | 'sem_integracao' | 'sem_telefone' | 'sem_franquia';

/**
 * Põe a mensagem na fila do canal, se a empresa tiver franquia no mês, a plataforma tiver o canal
 * ativo e o usuário tiver telefone. Quem chama segue com o e-mail quando não der.
 */
export async function enfileirarMensagem(
  tx: Tx,
  d: {
    empresaId: string;
    usuarioId: string;
    canal: 'whatsapp' | 'sms';
    texto: string;
    modelo: string;
    origem: string;
    origemId?: string | null;
  },
): Promise<ResultadoMensagem> {
  const ativo = await tx.execute<{ ok: boolean }>(sql`select canal_ativo(${d.canal}) as ok`);
  if (!ativo.rows[0]?.ok) return 'sem_integracao';
  const telefone = await telefoneDoUsuario(tx, d.usuarioId, d.canal);
  if (!telefone) return 'sem_telefone';
  const limites = await limitesEfetivos(tx, d.empresaId);
  const franquia =
    d.canal === 'whatsapp' ? (limites?.mensagensWhatsapp ?? 0) : (limites?.mensagensSms ?? 0);
  const usados = await tx.execute<{ n: number }>(
    sql`select mensagens_no_mes(${d.empresaId}, ${d.canal}, ${inicioDoMes()}::date) as n`,
  );
  if ((usados.rows[0]?.n ?? 0) >= franquia) return 'sem_franquia';
  await tx.insert(s.envio).values({
    canal: d.canal,
    destinatario: telefone,
    modelo: d.modelo,
    corpoTexto: d.texto,
    origem: d.origem,
    origemId: d.origemId ?? null,
    empresaId: d.empresaId,
  });
  return 'enfileirada';
}

/** Usuário quer os avisos também por este canal (Meu perfil)? */
export async function querCanal(
  tx: Tx,
  usuarioId: string,
  canal: 'whatsapp' | 'sms',
): Promise<boolean> {
  const [u] = await tx
    .select({ p: s.usuario.preferencias })
    .from(s.usuario)
    .where(eq(s.usuario.id, usuarioId));
  const canais = (u?.p as { canais?: { whatsapp?: boolean; sms?: boolean } } | undefined)?.canais;
  return !!canais?.[canal];
}

const MAX_TENTATIVAS = 6;

/** Fila de WhatsApp e SMS: a integração ativa de cada canal envia. */
export async function processarFilaMensagens(
  db: Db,
  chaveCifra: string,
  log: Pick<FastifyBaseLogger, 'error'>,
): Promise<number> {
  return emContexto(db, { sistema: true, plataforma: true }, async (tx) => {
    const pendentes = await tx
      .select()
      .from(s.envio)
      .where(
        and(
          sql`${s.envio.canal} in ('whatsapp', 'sms')`,
          eq(s.envio.situacao, 'pendente'),
          lte(s.envio.proximaTentativaEm, sql`now()`),
        ),
      )
      .orderBy(s.envio.proximaTentativaEm)
      .limit(20)
      .for('update', { skipLocked: true });
    const integracoes = await tx
      .select()
      .from(s.integracao)
      .where(and(sql`${s.integracao.tipo} in ('whatsapp', 'sms')`, eq(s.integracao.ativo, true)))
      .orderBy(asc(s.integracao.criadoEm));
    for (const e of pendentes) {
      const tentativas = e.tentativas + 1;
      const i = integracoes.find((x) => x.tipo === e.canal);
      try {
        if (!i) throw new Error('Canal sem integração ativa.');
        const provedor = provedorMensagemDe(i, chaveCifra);
        const r = await provedor.enviar({ para: e.destinatario, texto: e.corpoTexto });
        await tx
          .update(s.envio)
          .set({
            situacao: 'enviado',
            tentativas,
            enviadoEm: sql`now()`,
            provedor: provedor.nome,
            ultimoErro: null,
          })
          .where(eq(s.envio.id, e.id));
        await tx.insert(s.envioTentativa).values({ envioId: e.id, sucesso: true, resposta: r });
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        log.error({ envio: e.id, erro: mensagem }, `Falha no envio por ${e.canal}`);
        await tx
          .update(s.envio)
          .set({
            situacao: tentativas >= MAX_TENTATIVAS || !i ? 'falhou' : 'pendente',
            tentativas,
            ultimoErro: mensagem.slice(0, 1000),
            provedor: i?.adaptador ?? null,
            proximaTentativaEm: new Date(Date.now() + 60_000 * 2 ** (tentativas - 1)),
          })
          .where(eq(s.envio.id, e.id));
        await tx
          .insert(s.envioTentativa)
          .values({ envioId: e.id, sucesso: false, resposta: { erro: mensagem } });
      }
    }
    return pendentes.length;
  });
}

export function iniciarTarefaMensagens(
  db: Db,
  chaveCifra: string,
  log: Pick<FastifyBaseLogger, 'error'>,
  intervaloMs = 15_000,
): () => void {
  let parar = false;
  let timer: NodeJS.Timeout | undefined;
  const ciclo = async () => {
    try {
      await processarFilaMensagens(db, chaveCifra, log);
    } catch (e) {
      log.error({ erro: e }, 'Falha na fila de mensagens');
    }
    if (!parar) timer = setTimeout(ciclo, intervaloMs);
  };
  timer = setTimeout(ciclo, 20_000);
  return () => {
    parar = true;
    clearTimeout(timer);
  };
}

/** Texto padrão de cada modelo editável, com as variáveis à mostra ({{nome}}). */
function textoPadrao(codigo: CodigoModeloEditavel): { assunto: string; corpo: string } {
  const v = (nome: string) => `{{${nome}}}`;
  const m =
    codigo === 'convite'
      ? emailConvite({
          para: '',
          empresa: v('empresa'),
          quem: v('quem'),
          link: v('link'),
          dias: v('dias') as unknown as number,
          master: false,
        })
      : emailCobranca({
          para: '',
          empresa: v('empresa'),
          link: v('link'),
          aviso: Object.fromEntries([
            ['tipo', codigo.replace('cobranca_', '')],
            ...MODELOS_EDITAVEIS[codigo].variaveis.map((x) => [
              x,
              x === 'excessos' ? [v(x)] : v(x),
            ]),
          ]) as never,
        });
  return { assunto: m.assunto, corpo: (m.paragrafos ?? []).join('\n\n') };
}

export async function rotasMensagens(app: FastifyInstance): Promise<void> {
  const { db, config } = app.deps;
  const cifra = config.CHAVE_CIFRA;

  // ---- Integração do WhatsApp (Meta) ----

  app.post('/api/plataforma/integracoes/whatsapp', async (req) =>
    naPlataforma(
      db,
      req,
      ['plataforma.integracoes', 'criar'],
      async ({ tx, usuarioId, auditar }) => {
        const d = integracaoWhatsappEntrada.parse(req.body);
        if (!d.chave) throw new ErroRegra('Informe o token de acesso da Meta.', 'chave');
        const [i] = await tx
          .insert(s.integracao)
          .values({
            tipo: 'whatsapp',
            adaptador: d.adaptador,
            nome: d.nome,
            ambiente: 'producao',
            configuracao: { numeroId: d.numeroId, modelo: d.modelo, idioma: d.idioma },
            credenciaisCifradas: cifrar(cifra, JSON.stringify({ chave: d.chave })),
            ativo: d.ativo,
            criadoPor: usuarioId,
            atualizadoPor: usuarioId,
          })
          .returning({ id: s.integracao.id });
        await auditar({
          acao: 'criar',
          entidade: 'integracao',
          registroId: i!.id,
          depois: { ...d, chave: '(cifrada)' },
        });
        return { id: i!.id };
      },
    ),
  );

  app.put<{ Params: { id: string } }>('/api/plataforma/integracoes/:id/whatsapp', async (req) =>
    naPlataforma(
      db,
      req,
      ['plataforma.integracoes', 'editar'],
      async ({ tx, usuarioId, auditar }) => {
        const id = z.uuid().parse(req.params.id);
        const d = integracaoWhatsappEntrada.parse(req.body);
        const r = await tx
          .update(s.integracao)
          .set({
            nome: d.nome,
            configuracao: { numeroId: d.numeroId, modelo: d.modelo, idioma: d.idioma },
            ...(d.chave
              ? { credenciaisCifradas: cifrar(cifra, JSON.stringify({ chave: d.chave })) }
              : {}),
            ativo: d.ativo,
            atualizadoEm: sql`now()`,
            atualizadoPor: usuarioId,
          })
          .where(and(eq(s.integracao.id, id), eq(s.integracao.tipo, 'whatsapp')))
          .returning({ id: s.integracao.id });
        if (!r.length) throw new ErroNaoEncontrado('Integração não encontrada.');
        await auditar({
          acao: 'editar',
          entidade: 'integracao',
          registroId: id,
          depois: { ...d, chave: d.chave ? '(trocada)' : '(mantida)' },
        });
        return { ok: true };
      },
    ),
  );

  /** Mensagem de teste para um número, pela integração. */
  app.post<{ Params: { id: string } }>(
    '/api/plataforma/integracoes/:id/mensagem-teste',
    async (req) => {
      const { telefone } = z.object({ telefone: z.string() }).parse(req.body);
      const para = telefoneInternacional(telefone);
      if (!para) throw new ErroRegra('Telefone inválido.', 'telefone');
      const i = await naPlataforma(
        db,
        req,
        ['plataforma.integracoes', 'editar'],
        async ({ tx }) => {
          const [x] = await tx
            .select()
            .from(s.integracao)
            .where(eq(s.integracao.id, z.uuid().parse(req.params.id)));
          if (!x) throw new ErroNaoEncontrado('Integração não encontrada.');
          return x;
        },
      );
      try {
        await provedorMensagemDe(i, cifra).enviar({
          para,
          texto: 'Mensagem de teste do ViniCycle.',
        });
        return { ok: true, mensagem: 'Mensagem enviada.' };
      } catch (e) {
        return { ok: false, mensagem: (e as Error).message };
      }
    },
  );

  // ---- Envios (Administração) ----

  app.get('/api/plataforma/envios', async (req) =>
    naPlataforma(db, req, ['plataforma.envios', 'visualizar'], async ({ tx }) => {
      const c = consultaListagem
        .extend({
          canal: z.enum(CANAIS_MENSAGEM).optional(),
          situacao: z.enum(['pendente', 'enviado', 'falhou']).optional(),
        })
        .parse(req.query);
      const filtro = and(
        buscaTexto(c.busca, [s.envio.destinatario, s.envio.assunto, s.envio.modelo]),
        c.canal ? eq(s.envio.canal, c.canal) : undefined,
        c.situacao ? eq(s.envio.situacao, c.situacao) : undefined,
      );
      return listar({
        consulta: c,
        ordenaveis: {
          criadoEm: s.envio.criadoEm,
          situacao: s.envio.situacao,
          canal: s.envio.canal,
        },
        ordemPadrao: { campo: 'criadoEm', direcao: 'desc' },
        contar: async () =>
          (
            await tx
              .select({ n: sql<number>`count(*)::int` })
              .from(s.envio)
              .where(filtro)
          )[0]!.n,
        buscar: ({ ordem, limite, deslocamento }) =>
          tx
            .select({
              id: s.envio.id,
              canal: s.envio.canal,
              destinatario: s.envio.destinatario,
              modelo: s.envio.modelo,
              assunto: s.envio.assunto,
              origem: s.envio.origem,
              situacao: s.envio.situacao,
              tentativas: s.envio.tentativas,
              ultimoErro: s.envio.ultimoErro,
              provedor: s.envio.provedor,
              criadoEm: s.envio.criadoEm,
              enviadoEm: s.envio.enviadoEm,
            })
            .from(s.envio)
            .where(filtro)
            .orderBy(...ordem)
            .limit(limite)
            .offset(deslocamento),
      });
    }),
  );

  app.get<{ Params: { id: string } }>('/api/plataforma/envios/:id', async (req) =>
    naPlataforma(db, req, ['plataforma.envios', 'visualizar'], async ({ tx }) => {
      const id = z.uuid().parse(req.params.id);
      const [e] = await tx.select().from(s.envio).where(eq(s.envio.id, id));
      if (!e) throw new ErroNaoEncontrado('Envio não encontrado.');
      const tentativas = await tx
        .select()
        .from(s.envioTentativa)
        .where(eq(s.envioTentativa.envioId, id))
        .orderBy(desc(s.envioTentativa.ocorridaEm));
      return { ...e, corpoHtml: undefined, tentativas };
    }),
  );

  app.post<{ Params: { id: string } }>('/api/plataforma/envios/:id/reenviar', async (req) =>
    naPlataforma(db, req, ['plataforma.envios', 'editar'], async ({ tx, auditar }) => {
      const id = z.uuid().parse(req.params.id);
      const r = await tx
        .update(s.envio)
        .set({ situacao: 'pendente', proximaTentativaEm: sql`now()`, tentativas: 0 })
        .where(and(eq(s.envio.id, id), sql`${s.envio.situacao} <> 'pendente'`))
        .returning({ id: s.envio.id });
      if (!r.length) throw new ErroRegra('O envio já está na fila.', 'pendente');
      await auditar({ acao: 'reenviar', entidade: 'envio', registroId: id });
      return { ok: true };
    }),
  );

  // ---- Modelos de mensagem (Administração) ----

  app.get('/api/plataforma/modelos', async (req) =>
    naPlataforma(db, req, ['plataforma.envios', 'visualizar'], async ({ tx }) => {
      const versoes = await tx
        .select()
        .from(s.modeloMensagemVersao)
        .orderBy(desc(s.modeloMensagemVersao.versao));
      return (Object.keys(MODELOS_EDITAVEIS) as CodigoModeloEditavel[]).map((codigo) => ({
        codigo,
        nome: MODELOS_EDITAVEIS[codigo].nome,
        variaveis: MODELOS_EDITAVEIS[codigo].variaveis,
        padrao: textoPadrao(codigo),
        versoes: versoes
          .filter((v) => v.codigo === codigo)
          .map((v) => ({
            id: v.id,
            versao: v.versao,
            assunto: v.assunto,
            corpo: v.corpo,
            ativa: v.ativa,
            criadoEm: v.criadoEm,
          })),
      }));
    }),
  );

  app.post<{ Params: { codigo: string } }>('/api/plataforma/modelos/:codigo', async (req) =>
    naPlataforma(db, req, ['plataforma.envios', 'editar'], async ({ tx, usuarioId, auditar }) => {
      const codigo = z
        .enum(Object.keys(MODELOS_EDITAVEIS) as [CodigoModeloEditavel])
        .parse(req.params.codigo);
      const d = versaoModeloEntrada.parse(req.body);
      const [{ ultima }] = (await tx
        .select({ ultima: max(s.modeloMensagemVersao.versao) })
        .from(s.modeloMensagemVersao)
        .where(eq(s.modeloMensagemVersao.codigo, codigo))) as [{ ultima: number | null }];
      await tx
        .update(s.modeloMensagemVersao)
        .set({ ativa: false })
        .where(eq(s.modeloMensagemVersao.codigo, codigo));
      const [v] = await tx
        .insert(s.modeloMensagemVersao)
        .values({ codigo, versao: (ultima ?? 0) + 1, ...d, ativa: true, criadoPor: usuarioId })
        .returning({ id: s.modeloMensagemVersao.id, versao: s.modeloMensagemVersao.versao });
      await auditar({
        acao: 'editar',
        entidade: 'modelo_mensagem',
        registroId: v!.id,
        depois: { codigo, ...d },
      });
      return v;
    }),
  );

  /** Volta ao texto padrão do sistema (as versões ficam no histórico). */
  app.post<{ Params: { codigo: string } }>('/api/plataforma/modelos/:codigo/padrao', async (req) =>
    naPlataforma(db, req, ['plataforma.envios', 'editar'], async ({ tx, auditar }) => {
      const codigo = z
        .enum(Object.keys(MODELOS_EDITAVEIS) as [CodigoModeloEditavel])
        .parse(req.params.codigo);
      await tx
        .update(s.modeloMensagemVersao)
        .set({ ativa: false })
        .where(eq(s.modeloMensagemVersao.codigo, codigo));
      await auditar({ acao: 'restaurar_padrao', entidade: 'modelo_mensagem', dados: { codigo } });
      return { ok: true };
    }),
  );
}
