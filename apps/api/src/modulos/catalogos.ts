// Catálogos globais com itens próprios (P8): a empresa usa os globais e cria os seus, sem alterar
// os globais. Também entrega os catálogos fixos (unidades, classes, IGs, papéis) aos formulários.
import {
  type Catalogo,
  catalogoValido,
  consultaListagem,
  esquemaDoCatalogo,
  esquemaDoCatalogoPlataforma,
  funcionalidadeDoCatalogo,
  listaOficial,
  motivo,
} from '@vinicycle/shared';
import { and, asc, count, eq, isNull, or, type SQL, sql } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as s from '../db/schema';
import { conferirVersao } from '../nucleo/entidades';
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros';
import { buscaTexto, listar } from '../nucleo/listagem';
import {
  type ContextoEmpresa,
  type ContextoPlataforma,
  naEmpresa,
  naPlataforma,
} from '../nucleo/requisicao';

type Tabela = PgTable & Record<string, AnyPgColumn>;

interface Definicao {
  tabela: Tabela;
  /** Campos próprios do catálogo, além de id, nome, origem e situação. */
  campos: string[];
  /** Filtro fixo (ex.: a lista de uma opção). */
  filtro?: SQL;
  extras?: Record<string, unknown>;
}

function definicao(catalogo: Catalogo): Definicao {
  if (catalogo.startsWith('opcao:')) {
    const lista = catalogo.slice(6);
    return {
      tabela: s.opcaoLista as unknown as Tabela,
      campos: ['codigo', 'ordem'],
      filtro: eq(s.opcaoLista.lista, lista),
      extras: { lista },
    };
  }
  const mapa = {
    tipo_recipiente: { tabela: s.tipoRecipiente, campos: ['pressurizado', 'eBarrica'] },
    tipo_insumo: { tabela: s.tipoInsumo, campos: ['unidades', 'apresentacoes'] },
    tipo_documento: { tabela: s.tipoDocumento, campos: ['temVencimento', 'avisosDias'] },
    variedade: { tabela: s.variedade, campos: ['codigoOficial', 'tipo', 'cor', 'sinonimos'] },
  } as const;
  const d = mapa[catalogo as keyof typeof mapa];
  return { tabela: d.tabela as unknown as Tabela, campos: [...d.campos] };
}

function lerCatalogo(valor: string): Catalogo {
  if (!catalogoValido(valor)) throw new ErroNaoEncontrado('Catálogo não encontrado.');
  return valor;
}

/** Código do item próprio de lista: derivado do nome, sem acento, único na empresa. */
function codigoDoNome(nome: string): string {
  return (
    nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40) || 'item'
  );
}

async function carregarProprio(ctx: ContextoEmpresa, d: Definicao, id: string) {
  const [item] = (await ctx.tx
    .select()
    .from(d.tabela)
    .where(and(eq(d.tabela.id!, id), d.filtro))) as Array<Record<string, unknown>>;
  if (!item) throw new ErroNaoEncontrado('Item não encontrado.');
  if (item.empresaId !== ctx.empresaId) {
    throw new ErroRegra(
      'Itens do catálogo global são mantidos pela plataforma e não podem ser alterados.',
      'item_global',
    );
  }
  return item;
}

/** Código do item global novo, derivado do nome e livre entre os globais do catálogo. */
async function codigoGlobalLivre(ctx: ContextoPlataforma, d: Definicao, nome: string) {
  const base = codigoDoNome(nome);
  const usados = (await ctx.tx
    .select({ codigo: d.tabela.codigo! })
    .from(d.tabela)
    .where(
      and(d.filtro, isNull(d.tabela.empresaId!), sql`${d.tabela.codigo} like ${`${base}%`}`),
    )) as Array<{ codigo: string }>;
  const ocupados = new Set(usados.map((u) => u.codigo));
  let codigo = base;
  for (let n = 2; ocupados.has(codigo); n++) codigo = `${base}_${n}`;
  return codigo;
}

async function carregarGlobal(ctx: ContextoPlataforma, d: Definicao, id: string) {
  const [item] = (await ctx.tx
    .select()
    .from(d.tabela)
    .where(and(eq(d.tabela.id!, id), d.filtro, isNull(d.tabela.empresaId!)))) as Array<
    Record<string, unknown>
  >;
  if (!item) throw new ErroNaoEncontrado('Item não encontrado.');
  return item;
}

function tratarNomeRepetido(e: unknown): never {
  const restricao = (e as { cause?: { constraint?: string } }).cause?.constraint ?? '';
  if (restricao.endsWith('_nome'))
    throw new ErroRegra('Já existe um item com este nome.', 'nome_duplicado');
  if (restricao.includes('codigo'))
    throw new ErroRegra('Já existe um item com este código.', 'codigo_duplicado');
  throw e;
}

/** Catálogos fixos para os formulários, na empresa e na Administração. */
async function referencia(tx: ContextoPlataforma['tx']) {
  const [unidades, classes, igs, papeis, opcoes] = await Promise.all([
    tx.select().from(s.unidade).orderBy(asc(s.unidade.ordem)),
    tx
      .select()
      .from(s.classeProduto)
      .where(
        sql`${s.classeProduto.vigenteAte} is null or ${s.classeProduto.vigenteAte} >= current_date`,
      )
      .orderBy(asc(s.classeProduto.ordem)),
    tx.select().from(s.indicacaoGeografica).where(eq(s.indicacaoGeografica.ativo, true)),
    tx.select().from(s.papel).orderBy(asc(s.papel.ordem)),
    tx
      .select({
        lista: s.opcaoLista.lista,
        codigo: s.opcaoLista.codigo,
        nome: s.opcaoLista.nome,
      })
      .from(s.opcaoLista)
      .where(eq(s.opcaoLista.ativo, true))
      .orderBy(asc(s.opcaoLista.ordem), asc(s.opcaoLista.nome)),
  ]);
  const listas: Record<string, Array<{ codigo: string; nome: string }>> = {};
  for (const o of opcoes) (listas[o.lista] ??= []).push({ codigo: o.codigo, nome: o.nome });
  return {
    unidades: unidades.map(({ id: _id, ...u }) => u),
    classesProduto: classes,
    igs,
    papeis: papeis.map((p) => ({ codigo: p.codigo, nome: p.nome })),
    listas,
  };
}

export async function rotasCatalogos(app: FastifyInstance): Promise<void> {
  const { db } = app.deps;

  // Catálogos fixos para os formulários (qualquer usuário da empresa).
  app.get('/api/referencia', async (req) =>
    naEmpresa(db, req, null, async ({ tx }) => referencia(tx)),
  );
  app.get('/api/plataforma/referencia', async (req) =>
    naPlataforma(db, req, null, async ({ tx }) => referencia(tx)),
  );

  app.get<{ Params: { catalogo: string } }>('/api/catalogos/:catalogo', async (req) => {
    const catalogo = lerCatalogo(req.params.catalogo);
    return naEmpresa(db, req, null, async (ctx) => {
      ctx.exigir(funcionalidadeDoCatalogo(catalogo), 'visualizar');
      const d = definicao(catalogo);
      const t = d.tabela;
      const q = consultaListagem
        .extend({
          situacao: z.enum(['ativos', 'inativos', 'todos']).default('ativos'),
          origem: z.enum(['todos', 'globais', 'proprios']).default('todos'),
          emUso: z.enum(['sim', 'todos']).default('todos'),
        })
        .parse(req.query);
      const emUso =
        catalogo === 'variedade'
          ? sql<boolean>`exists (select 1 from empresa_variedade ev where ev.variedade_id = ${t.id} and ev.empresa_id = ${ctx.empresaId} and ev.ativo)`
          : sql<boolean>`true`;
      const filtro = and(
        d.filtro,
        q.situacao === 'todos' ? undefined : eq(t.ativo!, q.situacao === 'ativos'),
        q.origem === 'globais'
          ? isNull(t.empresaId!)
          : q.origem === 'proprios'
            ? eq(t.empresaId!, ctx.empresaId)
            : undefined,
        catalogo === 'variedade' && q.emUso === 'sim' ? emUso : undefined,
        buscaTexto(
          q.busca,
          catalogo === 'variedade'
            ? [t.nome!, t.codigoOficial!, sql`array_to_string(${t.sinonimos}, ' ')`]
            : [t.nome!],
        ),
      );
      const colunas = Object.fromEntries(d.campos.map((c) => [c, t[c]!]));
      return listar({
        consulta: q,
        ordenaveis: {
          nome: t.nome!,
          ...(catalogo === 'variedade' ? { codigoOficial: t.codigoOficial! } : {}),
        },
        ordemPadrao: { campo: 'nome', direcao: 'asc' },
        contar: async () => (await ctx.tx.select({ n: count() }).from(t).where(filtro))[0]!.n,
        buscar: ({ ordem, limite, deslocamento }) =>
          ctx.tx
            .select({
              id: t.id!,
              nome: t.nome!,
              global: sql<boolean>`${t.empresaId} is null`,
              ativo: t.ativo!,
              versao: t.versao!,
              emUso,
              ...colunas,
            })
            .from(t)
            .where(filtro)
            .orderBy(...(catalogo.startsWith('opcao:') ? [asc(t.ordem!), ...ordem] : ordem))
            .limit(limite)
            .offset(deslocamento),
      });
    });
  });

  app.post<{ Params: { catalogo: string } }>('/api/catalogos/:catalogo', async (req) => {
    const catalogo = lerCatalogo(req.params.catalogo);
    if (listaOficial(catalogo))
      throw new ErroRegra('Esta lista é oficial e só a plataforma a altera.', 'lista_oficial');
    return naEmpresa(db, req, null, async (ctx) => {
      ctx.exigir(funcionalidadeDoCatalogo(catalogo), 'criar');
      const d = definicao(catalogo);
      const dados = esquemaDoCatalogo(catalogo).parse(req.body) as Record<string, unknown>;
      const valores: Record<string, unknown> = {
        ...dados,
        ...d.extras,
        empresaId: ctx.empresaId,
        criadoPor: ctx.usuarioId,
        atualizadoPor: ctx.usuarioId,
      };
      if (catalogo.startsWith('opcao:')) {
        const base = codigoDoNome(String(dados.nome));
        const [{ n }] = (await ctx.tx
          .select({ n: count() })
          .from(s.opcaoLista)
          .where(
            and(
              d.filtro,
              eq(s.opcaoLista.empresaId, ctx.empresaId),
              sql`codigo like ${base + '%'}`,
            ),
          )) as [{ n: number }];
        valores.codigo = n ? `${base}_${n + 1}` : base;
      }
      if (catalogo === 'variedade') {
        // Variedade sem código oficial: a plataforma é avisada para avaliar a inclusão no catálogo
        // global, e as declarações mostram alerta (ambiente-cliente.md, Cadastros).
        valores.avisadaPlataformaEm = new Date();
      }
      const [item] = (await ctx.tx
        .insert(d.tabela)
        .values(valores as never)
        .returning({ id: d.tabela.id! })
        .catch(tratarNomeRepetido)) as Array<{ id: string }>;
      if (catalogo === 'variedade') {
        await ctx.tx
          .insert(s.empresaVariedade)
          .values({ empresaId: ctx.empresaId, variedadeId: item!.id, criadoPor: ctx.usuarioId });
      }
      await ctx.auditar({
        acao: 'criar',
        entidade: catalogo.replace(':', '.'),
        registroId: item!.id,
        depois: dados,
      });
      return { id: item!.id };
    });
  });

  app.put<{ Params: { catalogo: string; id: string } }>(
    '/api/catalogos/:catalogo/:id',
    async (req) => {
      const catalogo = lerCatalogo(req.params.catalogo);
      return naEmpresa(db, req, null, async (ctx) => {
        ctx.exigir(funcionalidadeDoCatalogo(catalogo), 'editar');
        const d = definicao(catalogo);
        const id = z.uuid().parse(req.params.id);
        const corpo = req.body as Record<string, unknown>;
        const dados = esquemaDoCatalogo(catalogo).parse(corpo) as Record<string, unknown>;
        const item = await carregarProprio(ctx, d, id);
        conferirVersao(
          item.versao as number,
          typeof corpo.versao === 'number' ? corpo.versao : undefined,
        );
        await ctx.tx
          .update(d.tabela)
          .set({
            ...dados,
            atualizadoEm: sql`now()`,
            atualizadoPor: ctx.usuarioId,
            versao: sql`versao + 1`,
          } as never)
          .where(eq(d.tabela.id!, id))
          .catch(tratarNomeRepetido);
        const antes = Object.fromEntries(Object.keys(dados).map((k) => [k, item[k]]));
        await ctx.auditar({
          acao: 'editar',
          entidade: catalogo.replace(':', '.'),
          registroId: id,
          antes,
          depois: dados,
        });
        return { ok: true };
      });
    },
  );

  for (const acao of ['inativar', 'reativar'] as const) {
    app.post<{ Params: { catalogo: string; id: string } }>(
      `/api/catalogos/:catalogo/:id/${acao}`,
      async (req) => {
        const catalogo = lerCatalogo(req.params.catalogo);
        return naEmpresa(db, req, null, async (ctx) => {
          ctx.exigir(funcionalidadeDoCatalogo(catalogo), 'inativar');
          const d = definicao(catalogo);
          const id = z.uuid().parse(req.params.id);
          const m = acao === 'inativar' ? motivo.parse(req.body).motivo : null;
          await carregarProprio(ctx, d, id);
          await ctx.tx
            .update(d.tabela)
            .set(
              (acao === 'inativar'
                ? {
                    ativo: false,
                    inativadoEm: sql`now()`,
                    inativadoPor: ctx.usuarioId,
                    motivoInativacao: m,
                  }
                : {
                    ativo: true,
                    inativadoEm: null,
                    inativadoPor: null,
                    motivoInativacao: null,
                  }) as never,
            )
            .where(eq(d.tabela.id!, id));
          await ctx.auditar({
            acao,
            entidade: catalogo.replace(':', '.'),
            registroId: id,
            motivo: m,
          });
          return { ok: true };
        });
      },
    );
  }

  // ---- Administração › Catálogos: a equipe da plataforma mantém os itens globais, que valem
  // para todas as empresas, inclusive as listas oficiais (decisão de 05/10/2026). ----
  const FP = 'plataforma.catalogos';

  app.get<{ Params: { catalogo: string } }>('/api/plataforma/catalogos/:catalogo', async (req) => {
    const catalogo = lerCatalogo(req.params.catalogo);
    return naPlataforma(db, req, [FP, 'visualizar'], async (ctx) => {
      const d = definicao(catalogo);
      const t = d.tabela;
      const q = consultaListagem
        .extend({ situacao: z.enum(['ativos', 'inativos', 'todos']).default('ativos') })
        .parse(req.query);
      const filtro = and(
        d.filtro,
        isNull(t.empresaId!),
        q.situacao === 'todos' ? undefined : eq(t.ativo!, q.situacao === 'ativos'),
        buscaTexto(q.busca, catalogo === 'variedade' ? [t.nome!, t.codigoOficial!] : [t.nome!]),
      );
      const colunas = Object.fromEntries(d.campos.map((c) => [c, t[c]!]));
      return listar({
        consulta: q,
        ordenaveis: { nome: t.nome! },
        ordemPadrao: { campo: 'nome', direcao: 'asc' },
        contar: async () => (await ctx.tx.select({ n: count() }).from(t).where(filtro))[0]!.n,
        buscar: ({ ordem, limite, deslocamento }) =>
          ctx.tx
            .select({
              id: t.id!,
              nome: t.nome!,
              global: sql<boolean>`false`,
              ativo: t.ativo!,
              versao: t.versao!,
              emUso: sql<boolean>`true`,
              ...colunas,
              codigo: t.codigo!,
            })
            .from(t)
            .where(filtro)
            .orderBy(...(catalogo.startsWith('opcao:') ? [asc(t.ordem!), ...ordem] : ordem))
            .limit(limite)
            .offset(deslocamento),
      });
    });
  });

  app.post<{ Params: { catalogo: string } }>('/api/plataforma/catalogos/:catalogo', async (req) => {
    const catalogo = lerCatalogo(req.params.catalogo);
    return naPlataforma(db, req, [FP, 'criar'], async (ctx) => {
      const d = definicao(catalogo);
      const dados = esquemaDoCatalogoPlataforma(catalogo).parse(req.body) as Record<
        string,
        unknown
      >;
      const codigo =
        (dados.codigoOficial as string | null | undefined) ??
        (await codigoGlobalLivre(ctx, d, String(dados.nome)));
      const [item] = (await ctx.tx
        .insert(d.tabela)
        .values({
          ...dados,
          ...d.extras,
          codigo,
          empresaId: null,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        } as never)
        .returning({ id: d.tabela.id! })
        .catch(tratarNomeRepetido)) as Array<{ id: string }>;
      await ctx.auditar({
        acao: 'criar',
        entidade: catalogo.replace(':', '.'),
        registroId: item!.id,
        depois: { ...dados, codigo },
      });
      return { id: item!.id };
    });
  });

  app.put<{ Params: { catalogo: string; id: string } }>(
    '/api/plataforma/catalogos/:catalogo/:id',
    async (req) => {
      const catalogo = lerCatalogo(req.params.catalogo);
      return naPlataforma(db, req, [FP, 'editar'], async (ctx) => {
        const d = definicao(catalogo);
        const id = z.uuid().parse(req.params.id);
        const corpo = req.body as Record<string, unknown>;
        const dados = esquemaDoCatalogoPlataforma(catalogo).parse(corpo) as Record<string, unknown>;
        const item = await carregarGlobal(ctx, d, id);
        conferirVersao(
          item.versao as number,
          typeof corpo.versao === 'number' ? corpo.versao : undefined,
        );
        await ctx.tx
          .update(d.tabela)
          .set({
            ...dados,
            atualizadoEm: sql`now()`,
            atualizadoPor: ctx.usuarioId,
            versao: sql`versao + 1`,
          } as never)
          .where(eq(d.tabela.id!, id))
          .catch(tratarNomeRepetido);
        await ctx.auditar({
          acao: 'editar',
          entidade: catalogo.replace(':', '.'),
          registroId: id,
          antes: Object.fromEntries(Object.keys(dados).map((k) => [k, item[k]])),
          depois: dados,
        });
        return { ok: true };
      });
    },
  );

  for (const acao of ['inativar', 'reativar'] as const) {
    app.post<{ Params: { catalogo: string; id: string } }>(
      `/api/plataforma/catalogos/:catalogo/:id/${acao}`,
      async (req) => {
        const catalogo = lerCatalogo(req.params.catalogo);
        return naPlataforma(db, req, [FP, 'inativar'], async (ctx) => {
          const d = definicao(catalogo);
          const id = z.uuid().parse(req.params.id);
          const m = acao === 'inativar' ? motivo.parse(req.body).motivo : null;
          await carregarGlobal(ctx, d, id);
          await ctx.tx
            .update(d.tabela)
            .set(
              (acao === 'inativar'
                ? {
                    ativo: false,
                    inativadoEm: sql`now()`,
                    inativadoPor: ctx.usuarioId,
                    motivoInativacao: m,
                  }
                : {
                    ativo: true,
                    inativadoEm: null,
                    inativadoPor: null,
                    motivoInativacao: null,
                  }) as never,
            )
            .where(eq(d.tabela.id!, id));
          await ctx.auditar({
            acao,
            entidade: catalogo.replace(':', '.'),
            registroId: id,
            motivo: m,
          });
          return { ok: true };
        });
      },
    );
  }

  // Variedades com que a empresa trabalha: só elas aparecem nas telas.
  app.post<{ Params: { id: string } }>('/api/variedades/:id/uso', async (req) =>
    naEmpresa(db, req, ['enotrace.cadastros', 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id);
      const { emUso } = z.object({ emUso: z.boolean() }).parse(req.body);
      const [v] = await ctx.tx
        .select({ id: s.variedade.id, nome: s.variedade.nome })
        .from(s.variedade)
        .where(
          and(
            eq(s.variedade.id, id),
            or(isNull(s.variedade.empresaId), eq(s.variedade.empresaId, ctx.empresaId)),
          ),
        );
      if (!v) throw new ErroNaoEncontrado('Variedade não encontrada.');
      await ctx.tx
        .insert(s.empresaVariedade)
        .values({
          empresaId: ctx.empresaId,
          variedadeId: id,
          ativo: emUso,
          criadoPor: ctx.usuarioId,
        })
        .onConflictDoUpdate({
          target: [s.empresaVariedade.empresaId, s.empresaVariedade.variedadeId],
          set: { ativo: emUso },
        });
      await ctx.auditar({
        acao: emUso ? 'usar_variedade' : 'deixar_variedade',
        entidade: 'variedade',
        registroId: id,
        dados: { variedade: v.nome },
      });
      return { ok: true };
    }),
  );
}
