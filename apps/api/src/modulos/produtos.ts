// EnoTrace › Cadastros › Marcas e Produtos (cantina.md; 03-modelo-de-dados.md, 2.5).
// Denominação = classe + cor + açúcar (Lei 7.678/1988, art. 8º, III; IN MAPA 14/2018, art. 26).
// Cada formato é um item de estoque de produto acabado, com o mesmo código de lote comercial.
import {
  consultaListagem,
  dadosFormato,
  dadosMarca,
  dadosProduto,
  dadosRotulo,
  fichaEmbalagemEntrada,
  formatarDecimal,
} from '@vinicycle/shared';
import { and, asc, count, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Tx } from '../db/cliente';
import * as s from '../db/schema';
import { conferirVersao } from '../nucleo/entidades';
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros';
import { rotasInativacao } from '../nucleo/inativacao';
import { buscaTexto, listar } from '../nucleo/listagem';
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao';
import { contratoDoProduto } from './contratos';

const F = 'enotrace.cadastros';

async function temPapel(ctx: ContextoEmpresa, pessoaId: string, papel: string) {
  const [p] = await ctx.tx
    .select({ id: s.pessoaPapel.id })
    .from(s.pessoaPapel)
    .where(
      and(
        eq(s.pessoaPapel.pessoaId, pessoaId),
        eq(s.pessoaPapel.empresaId, ctx.empresaId),
        eq(s.pessoaPapel.papel, papel),
        eq(s.pessoaPapel.ativo, true),
      ),
    );
  return !!p;
}

/** Código existe na lista (global ou da empresa). */
async function naLista(
  tx: Tx,
  empresaId: string,
  lista: string,
  codigo: string | null | undefined,
) {
  if (!codigo) return true;
  const [o] = await tx
    .select({ id: s.opcaoLista.id })
    .from(s.opcaoLista)
    .where(
      and(
        eq(s.opcaoLista.lista, lista),
        eq(s.opcaoLista.codigo, codigo),
        or(isNull(s.opcaoLista.empresaId), eq(s.opcaoLista.empresaId, empresaId)),
      ),
    );
  return !!o;
}

/** "Volume" para o nome do item de estoque: 750 mL, 1,5 L. */
function nomeVolume(ml: number): string {
  return ml >= 1000
    ? `${formatarDecimal(String(ml / 1000), ml % 1000 ? (ml % 100 ? 3 : 1) : 0)} L`
    : `${ml} mL`;
}

function erroUnico(nomes: Record<string, string>) {
  return (e: unknown): never => {
    const r = (e as { cause?: { constraint?: string } }).cause?.constraint ?? '';
    if (nomes[r]) throw new ErroRegra(nomes[r], 'duplicado');
    throw e;
  };
}

export async function rotasProdutos(app: FastifyInstance): Promise<void> {
  const { db } = app.deps;

  // Marcas -------------------------------------------------------------------------------------

  app.get('/api/marcas', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const q = consultaListagem
        .extend({ situacao: z.enum(['ativos', 'inativos', 'todos']).default('ativos') })
        .parse(req.query);
      const filtro = and(
        eq(s.marca.empresaId, ctx.empresaId),
        q.situacao === 'todos' ? undefined : eq(s.marca.ativo, q.situacao === 'ativos'),
        buscaTexto(q.busca, [s.marca.nome]),
      );
      return listar({
        consulta: q,
        ordenaveis: { nome: s.marca.nome },
        ordemPadrao: { campo: 'nome', direcao: 'asc' },
        contar: async () => (await ctx.tx.select({ n: count() }).from(s.marca).where(filtro))[0]!.n,
        buscar: ({ ordem, limite, deslocamento }) =>
          ctx.tx
            .select({
              id: s.marca.id,
              nome: s.marca.nome,
              donoId: s.marca.donoId,
              dono: sql<
                string | null
              >`(select f.nome from pessoa p join ficha f on f.id = p.ficha_id where p.id = ${s.marca.donoId})`,
              produtos: sql<number>`(select count(*)::int from produto p where p.marca_id = ${s.marca.id} and p.ativo)`,
              ativo: s.marca.ativo,
              versao: s.marca.versao,
            })
            .from(s.marca)
            .where(filtro)
            .orderBy(...ordem)
            .limit(limite)
            .offset(deslocamento),
      });
    }),
  );

  const marcaRepetida = erroUnico({
    marca_nome: 'Já existe uma marca com este nome para este dono.',
  });

  app.post('/api/marcas', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const d = dadosMarca.parse(req.body);
      if (d.donoId && !(await temPapel(ctx, d.donoId, 'cliente_vinificacao'))) {
        throw new ErroRegra(
          'O dono da marca precisa ser a própria empresa ou um cliente de vinificação.',
          'dono',
        );
      }
      const [m] = await ctx.tx
        .insert(s.marca)
        .values({
          nome: d.nome,
          donoId: d.donoId ?? null,
          empresaId: ctx.empresaId,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.marca.id })
        .catch(marcaRepetida);
      await ctx.auditar({
        acao: 'criar',
        entidade: 'marca',
        registroId: m!.id,
        depois: { nome: d.nome, donoId: d.donoId ?? null },
      });
      return { id: m!.id };
    }),
  );

  app.put<{ Params: { id: string } }>('/api/marcas/:id', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id);
      const d = dadosMarca.parse(req.body);
      const [atual] = await ctx.tx
        .select()
        .from(s.marca)
        .where(and(eq(s.marca.id, id), eq(s.marca.empresaId, ctx.empresaId)));
      if (!atual) throw new ErroNaoEncontrado('Marca não encontrada.');
      conferirVersao(atual.versao, d.versao);
      if (d.donoId && !(await temPapel(ctx, d.donoId, 'cliente_vinificacao'))) {
        throw new ErroRegra(
          'O dono da marca precisa ser a própria empresa ou um cliente de vinificação.',
          'dono',
        );
      }
      await ctx.tx
        .update(s.marca)
        .set({
          nome: d.nome,
          donoId: d.donoId ?? null,
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.marca.versao} + 1`,
        })
        .where(eq(s.marca.id, id))
        .catch(marcaRepetida);
      await ctx.auditar({
        acao: 'editar',
        entidade: 'marca',
        registroId: id,
        antes: { nome: atual.nome, donoId: atual.donoId },
        depois: { nome: d.nome, donoId: d.donoId ?? null },
      });
      return { ok: true };
    }),
  );

  rotasInativacao(app, {
    url: '/api/marcas',
    tabela: s.marca,
    entidade: 'marca',
    funcionalidade: F,
  });

  // Produtos -----------------------------------------------------------------------------------

  /** Denominação legível: classe, cor e açúcar. */
  const denominacao = sql<string>`concat_ws(' ', ${s.classeProduto.nome},
    (select o.nome from opcao_lista o where o.lista = 'cor_vinho' and o.codigo = ${s.produto.cor} order by o.empresa_id nulls last limit 1),
    (select o.nome from opcao_lista o where o.lista = 'teor_acucar' and o.codigo = ${s.produto.teorAcucar} order by o.empresa_id nulls last limit 1))`;

  async function carregarProduto(ctx: ContextoEmpresa, id: string) {
    const [p] = await ctx.tx
      .select()
      .from(s.produto)
      .where(and(eq(s.produto.id, id), eq(s.produto.empresaId, ctx.empresaId)));
    if (!p) throw new ErroNaoEncontrado('Produto não encontrado.');
    return p;
  }

  async function conferirProduto(ctx: ContextoEmpresa, d: z.output<typeof dadosProduto>) {
    const [m] = await ctx.tx
      .select({ id: s.marca.id })
      .from(s.marca)
      .where(and(eq(s.marca.id, d.marcaId), eq(s.marca.empresaId, ctx.empresaId)));
    if (!m) throw new ErroRegra('Marca inválida.', 'marca');
    const [c] = await ctx.tx
      .select()
      .from(s.classeProduto)
      .where(eq(s.classeProduto.id, d.classeProdutoId));
    if (!c) throw new ErroRegra('Classe inválida.', 'classe');
    if (c.exigeMetodoEspumante && !d.metodoEspumante) {
      throw new ErroRegra(
        `${c.nome} exige o método de elaboração do espumante.`,
        'metodo_espumante',
      );
    }
    for (const [lista, codigo, nome] of [
      ['cor_vinho', d.cor, 'Cor'],
      ['teor_acucar', d.teorAcucar, 'Classificação quanto ao açúcar'],
      ['metodo_espumante', d.metodoEspumante, 'Método do espumante'],
    ] as const) {
      if (!(await naLista(ctx.tx, ctx.empresaId, lista, codigo)))
        throw new ErroRegra(`${nome} inválido(a).`, lista);
    }
    if (d.titularId && !(await temPapel(ctx, d.titularId, 'cliente_vinificacao'))) {
      throw new ErroRegra('O titular precisa ser um cliente de vinificação.', 'titular');
    }
  }

  const valoresProduto = (d: z.output<typeof dadosProduto>) => ({
    nome: d.nome,
    marcaId: d.marcaId,
    classeProdutoId: d.classeProdutoId,
    cor: d.cor ?? null,
    teorAcucar: d.teorAcucar ?? null,
    metodoEspumante: d.metodoEspumante ?? null,
    registroMapa: d.registroMapa ?? null,
    titularId: d.titularId ?? null,
    observacoes: d.observacoes ?? null,
  });

  const produtoRepetido = erroUnico({
    produto_nome: 'Já existe um produto com este nome nesta marca.',
  });

  app.get('/api/produtos', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const q = consultaListagem
        .extend({
          situacao: z.enum(['ativos', 'inativos', 'todos']).default('ativos'),
          marca: z.uuid().optional(),
        })
        .parse(req.query);
      const filtro = and(
        eq(s.produto.empresaId, ctx.empresaId),
        q.situacao === 'todos' ? undefined : eq(s.produto.ativo, q.situacao === 'ativos'),
        q.marca ? eq(s.produto.marcaId, q.marca) : undefined,
        buscaTexto(q.busca, [s.produto.nome, s.marca.nome, s.produto.registroMapa]),
      );
      return listar({
        consulta: q,
        ordenaveis: { nome: s.produto.nome, marca: s.marca.nome, classe: s.classeProduto.nome },
        ordemPadrao: { campo: 'nome', direcao: 'asc' },
        contar: async () =>
          (
            await ctx.tx
              .select({ n: count() })
              .from(s.produto)
              .innerJoin(s.marca, eq(s.marca.id, s.produto.marcaId))
              .where(filtro)
          )[0]!.n,
        buscar: ({ ordem, limite, deslocamento }) =>
          ctx.tx
            .select({
              id: s.produto.id,
              nome: s.produto.nome,
              marcaId: s.produto.marcaId,
              marca: s.marca.nome,
              classe: s.classeProduto.nome,
              denominacao,
              registroMapa: s.produto.registroMapa,
              formatos: sql<
                number[]
              >`coalesce((select array_agg(f.volume_ml order by f.volume_ml) from produto_formato f where f.produto_id = ${s.produto.id} and f.ativo), '{}')`,
              teorAlcoolico: sql<
                string | null
              >`(select r.teor_alcoolico from produto_rotulo r where r.produto_id = ${s.produto.id} and r.vigente_desde <= current_date and (r.vigente_ate is null or r.vigente_ate >= current_date) order by r.vigente_desde desc limit 1)`,
              ativo: s.produto.ativo,
            })
            .from(s.produto)
            .innerJoin(s.marca, eq(s.marca.id, s.produto.marcaId))
            .innerJoin(s.classeProduto, eq(s.classeProduto.id, s.produto.classeProdutoId))
            .where(filtro)
            .orderBy(...ordem)
            .limit(limite)
            .offset(deslocamento),
      });
    }),
  );

  app.get<{ Params: { id: string } }>('/api/produtos/:id', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const p = await carregarProduto(ctx, z.uuid().parse(req.params.id));
      const [den] = await ctx.tx
        .select({ denominacao })
        .from(s.produto)
        .innerJoin(s.classeProduto, eq(s.classeProduto.id, s.produto.classeProdutoId))
        .where(eq(s.produto.id, p.id));
      const rotulos = await ctx.tx
        .select()
        .from(s.produtoRotulo)
        .where(eq(s.produtoRotulo.produtoId, p.id))
        .orderBy(desc(s.produtoRotulo.vigenteDesde));
      const formatos = await ctx.tx
        .select({
          id: s.produtoFormato.id,
          volumeMl: s.produtoFormato.volumeMl,
          itemEstoqueId: s.produtoFormato.itemEstoqueId,
          ativo: s.produtoFormato.ativo,
        })
        .from(s.produtoFormato)
        .where(eq(s.produtoFormato.produtoId, p.id))
        .orderBy(asc(s.produtoFormato.volumeMl));
      const fichas = formatos.length
        ? await ctx.tx
            .select({
              formatoId: s.fichaEmbalagem.formatoId,
              itemEstoqueId: s.fichaEmbalagem.itemEstoqueId,
              item: s.itemEstoque.nome,
              unidade: s.itemEstoque.unidadeBase,
              quantidade: s.fichaEmbalagem.quantidade,
            })
            .from(s.fichaEmbalagem)
            .innerJoin(s.itemEstoque, eq(s.itemEstoque.id, s.fichaEmbalagem.itemEstoqueId))
            .where(
              inArray(
                s.fichaEmbalagem.formatoId,
                formatos.map((f) => f.id),
              ),
            )
            .orderBy(asc(s.itemEstoque.nome))
        : [];
      const { empresaId: _e, criadoPor: _c, atualizadoPor: _a, ...resto } = p;
      return {
        ...resto,
        denominacao: den?.denominacao ?? '',
        // Elaboração por terceiro: o texto do rótulo vem do contrato (cantina.md, Rótulo).
        terceirizacao: await contratoDoProduto(ctx, p.id, p.marcaId),
        rotulos,
        formatos: formatos.map((f) => ({
          ...f,
          ficha: fichas.filter((x) => x.formatoId === f.id),
        })),
      };
    }),
  );

  app.post('/api/produtos', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const d = dadosProduto.parse(req.body);
      await conferirProduto(ctx, d);
      const [p] = await ctx.tx
        .insert(s.produto)
        .values({
          ...valoresProduto(d),
          empresaId: ctx.empresaId,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.produto.id })
        .catch(produtoRepetido);
      await ctx.auditar({
        acao: 'criar',
        entidade: 'produto',
        registroId: p!.id,
        depois: valoresProduto(d),
      });
      return { id: p!.id };
    }),
  );

  app.put<{ Params: { id: string } }>('/api/produtos/:id', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id);
      const d = dadosProduto.parse(req.body);
      const atual = await carregarProduto(ctx, id);
      conferirVersao(atual.versao, d.versao);
      await conferirProduto(ctx, d);
      const novos = valoresProduto(d);
      await ctx.tx
        .update(s.produto)
        .set({
          ...novos,
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.produto.versao} + 1`,
        })
        .where(eq(s.produto.id, id))
        .catch(produtoRepetido);
      // O nome do item de estoque de cada formato acompanha o nome do produto.
      if (atual.nome !== d.nome) {
        const formatos = await ctx.tx
          .select()
          .from(s.produtoFormato)
          .where(eq(s.produtoFormato.produtoId, id));
        for (const f of formatos) {
          await ctx.tx
            .update(s.itemEstoque)
            .set({ nome: `${d.nome} ${nomeVolume(f.volumeMl)}` })
            .where(eq(s.itemEstoque.id, f.itemEstoqueId));
        }
      }
      const antes = Object.fromEntries(
        Object.keys(novos).map((k) => [k, atual[k as keyof typeof atual]]),
      );
      await ctx.auditar({
        acao: 'editar',
        entidade: 'produto',
        registroId: id,
        antes,
        depois: novos,
      });
      return { ok: true };
    }),
  );

  rotasInativacao(app, {
    url: '/api/produtos',
    tabela: s.produto,
    entidade: 'produto',
    funcionalidade: F,
  });

  // Rótulos: versão com o teor alcoólico declarado (laudo fora de ±0,5% vol alerta no envase;
  // IN MAPA 14/2018, art. 11, §4º).
  const rotuloRepetido = erroUnico({ produto_rotulo_versao: 'Já existe esta versão de rótulo.' });

  app.post<{ Params: { id: string } }>('/api/produtos/:id/rotulos', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id);
      const d = dadosRotulo.parse(req.body);
      await carregarProduto(ctx, id);
      const [r] = await ctx.tx
        .insert(s.produtoRotulo)
        .values({
          ...d,
          urlPagina: d.urlPagina ?? null,
          vigenteAte: d.vigenteAte ?? null,
          observacoes: d.observacoes ?? null,
          produtoId: id,
          empresaId: ctx.empresaId,
          criadoPor: ctx.usuarioId,
        })
        .returning({ id: s.produtoRotulo.id })
        .catch(rotuloRepetido);
      await ctx.auditar({
        acao: 'incluir_rotulo',
        entidade: 'produto',
        registroId: id,
        dados: { rotuloId: r!.id, ...d },
      });
      return { id: r!.id };
    }),
  );

  app.put<{ Params: { id: string; rotuloId: string } }>(
    '/api/produtos/:id/rotulos/:rotuloId',
    async (req) =>
      naEmpresa(db, req, [F, 'editar'], async (ctx) => {
        const id = z.uuid().parse(req.params.id);
        const rotuloId = z.uuid().parse(req.params.rotuloId);
        const d = dadosRotulo.parse(req.body);
        const [atual] = await ctx.tx
          .select()
          .from(s.produtoRotulo)
          .where(
            and(
              eq(s.produtoRotulo.id, rotuloId),
              eq(s.produtoRotulo.produtoId, id),
              eq(s.produtoRotulo.empresaId, ctx.empresaId),
            ),
          );
        if (!atual) throw new ErroNaoEncontrado('Rótulo não encontrado.');
        const novos = {
          ...d,
          urlPagina: d.urlPagina ?? null,
          vigenteAte: d.vigenteAte ?? null,
          observacoes: d.observacoes ?? null,
        };
        await ctx.tx
          .update(s.produtoRotulo)
          .set(novos)
          .where(eq(s.produtoRotulo.id, rotuloId))
          .catch(rotuloRepetido);
        const antes = Object.fromEntries(
          Object.keys(novos).map((k) => [k, atual[k as keyof typeof atual]]),
        );
        await ctx.auditar({
          acao: 'editar_rotulo',
          entidade: 'produto',
          registroId: id,
          antes,
          depois: novos,
        });
        return { ok: true };
      }),
  );

  // Formatos: cada um vira um item de estoque de produto acabado (cantina.md, Engarrafamento).
  app.post<{ Params: { id: string } }>('/api/produtos/:id/formatos', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id);
      const { volumeMl } = dadosFormato.parse(req.body);
      const p = await carregarProduto(ctx, id);
      const [existente] = await ctx.tx
        .select()
        .from(s.produtoFormato)
        .where(and(eq(s.produtoFormato.produtoId, id), eq(s.produtoFormato.volumeMl, volumeMl)));
      if (existente) throw new ErroRegra('O produto já tem este formato.', 'duplicado');
      const [item] = await ctx.tx
        .insert(s.itemEstoque)
        .values({
          empresaId: ctx.empresaId,
          modulo: 'ENOTRACE',
          tipo: 'produto_acabado',
          nome: `${p.nome} ${nomeVolume(volumeMl)}`,
          unidadeBase: 'un',
          controlaLote: true,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.itemEstoque.id })
        .catch(
          erroUnico({
            item_estoque_nome: 'Já existe um item de estoque com o nome deste formato.',
          }),
        );
      const [f] = await ctx.tx
        .insert(s.produtoFormato)
        .values({
          produtoId: id,
          empresaId: ctx.empresaId,
          volumeMl,
          itemEstoqueId: item!.id,
          criadoPor: ctx.usuarioId,
        })
        .returning({ id: s.produtoFormato.id });
      await ctx.auditar({
        acao: 'incluir_formato',
        entidade: 'produto',
        registroId: id,
        dados: { formatoId: f!.id, volumeMl },
      });
      return { id: f!.id };
    }),
  );

  for (const acao of ['inativar', 'reativar'] as const) {
    app.post<{ Params: { id: string; formatoId: string } }>(
      `/api/produtos/:id/formatos/:formatoId/${acao}`,
      async (req) =>
        naEmpresa(db, req, [F, 'editar'], async (ctx) => {
          const id = z.uuid().parse(req.params.id);
          const formatoId = z.uuid().parse(req.params.formatoId);
          const [f] = await ctx.tx
            .update(s.produtoFormato)
            .set(
              acao === 'inativar'
                ? { ativo: false, inativadoEm: sql`now()`, inativadoPor: ctx.usuarioId }
                : { ativo: true, inativadoEm: null, inativadoPor: null },
            )
            .where(
              and(
                eq(s.produtoFormato.id, formatoId),
                eq(s.produtoFormato.produtoId, id),
                eq(s.produtoFormato.empresaId, ctx.empresaId),
              ),
            )
            .returning({
              itemEstoqueId: s.produtoFormato.itemEstoqueId,
              volumeMl: s.produtoFormato.volumeMl,
            });
          if (!f) throw new ErroNaoEncontrado('Formato não encontrado.');
          await ctx.tx
            .update(s.itemEstoque)
            .set({ ativo: acao === 'reativar' })
            .where(eq(s.itemEstoque.id, f.itemEstoqueId));
          await ctx.auditar({
            acao: `${acao}_formato`,
            entidade: 'produto',
            registroId: id,
            dados: { formatoId, volumeMl: f.volumeMl },
          });
          return { ok: true };
        }),
    );
  }

  // Ficha de embalagem: materiais por unidade do formato (ex.: 1 garrafa, 1 rolha, 1/6 de caixa).
  app.put<{ Params: { id: string; formatoId: string } }>(
    '/api/produtos/:id/formatos/:formatoId/ficha',
    async (req) =>
      naEmpresa(db, req, [F, 'editar'], async (ctx) => {
        const id = z.uuid().parse(req.params.id);
        const formatoId = z.uuid().parse(req.params.formatoId);
        const d = fichaEmbalagemEntrada.parse(req.body);
        const [f] = await ctx.tx
          .select()
          .from(s.produtoFormato)
          .where(
            and(
              eq(s.produtoFormato.id, formatoId),
              eq(s.produtoFormato.produtoId, id),
              eq(s.produtoFormato.empresaId, ctx.empresaId),
            ),
          );
        if (!f) throw new ErroNaoEncontrado('Formato não encontrado.');
        const ids = [...new Set(d.itens.map((i) => i.itemEstoqueId))];
        if (ids.length !== d.itens.length)
          throw new ErroRegra('Item repetido na ficha.', 'duplicado');
        if (ids.length) {
          const validos = await ctx.tx
            .select({ id: s.itemEstoque.id })
            .from(s.itemEstoque)
            .where(
              and(
                eq(s.itemEstoque.empresaId, ctx.empresaId),
                inArray(s.itemEstoque.id, ids),
                inArray(s.itemEstoque.tipo, ['embalagem', 'insumo', 'selo', 'outro']),
              ),
            );
          if (validos.length !== ids.length)
            throw new ErroRegra('A ficha só aceita embalagens e insumos do estoque.', 'item');
        }
        const antes = await ctx.tx
          .select({
            itemEstoqueId: s.fichaEmbalagem.itemEstoqueId,
            quantidade: s.fichaEmbalagem.quantidade,
          })
          .from(s.fichaEmbalagem)
          .where(eq(s.fichaEmbalagem.formatoId, formatoId));
        await ctx.tx.delete(s.fichaEmbalagem).where(eq(s.fichaEmbalagem.formatoId, formatoId));
        if (d.itens.length) {
          await ctx.tx
            .insert(s.fichaEmbalagem)
            .values(d.itens.map((i) => ({ ...i, formatoId, empresaId: ctx.empresaId })));
        }
        await ctx.auditar({
          acao: 'editar_ficha_embalagem',
          entidade: 'produto',
          registroId: id,
          antes: { volumeMl: f.volumeMl, itens: antes },
          depois: { volumeMl: f.volumeMl, itens: d.itens },
        });
        return { ok: true };
      }),
  );
}
