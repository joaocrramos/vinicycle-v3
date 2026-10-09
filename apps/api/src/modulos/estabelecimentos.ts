// Configurações › Estabelecimentos (P12; ambiente-cliente.md). Quantidade limitada pelo plano
// (P25); inativar em vez de apagar (P26).
import { consultaListagem, dadosEstabelecimento, motivo } from '@vinicycle/shared';
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Tx } from '../db/cliente';
import * as s from '../db/schema';
import { conferirVersao } from '../nucleo/entidades';
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros';
import { buscaTexto, listar } from '../nucleo/listagem';
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao';
import { limitesEfetivos } from './assinaturas';
import { atualizarFicha, criarFicha, lerFicha, resumoFicha } from './fichas';

async function conferirLimite(tx: Tx, empresaId: string): Promise<void> {
  const limite = (await limitesEfetivos(tx, empresaId))?.estabelecimentos ?? null;
  if (limite === null) return;
  const [{ n }] = (await tx
    .select({ n: count() })
    .from(s.estabelecimento)
    .where(and(eq(s.estabelecimento.empresaId, empresaId), eq(s.estabelecimento.ativo, true)))) as [
    { n: number },
  ];
  if (n >= limite) {
    throw new ErroRegra(
      `A assinatura permite ${limite} estabelecimento(s), e esse limite já foi atingido. Para incluir mais, contrate estabelecimentos adicionais.`,
      'limite_plano',
    );
  }
}

/** Usuário com vínculo restrito só vê e altera os estabelecimentos permitidos (P12). */
function filtroPermitidos(ctx: ContextoEmpresa) {
  const r = ctx.acesso.estabelecimentosRestritos;
  return r.length ? inArray(s.estabelecimento.id, r) : undefined;
}

async function carregar(ctx: ContextoEmpresa, id: string) {
  const [e] = await ctx.tx
    .select()
    .from(s.estabelecimento)
    .where(
      and(
        eq(s.estabelecimento.id, id),
        eq(s.estabelecimento.empresaId, ctx.empresaId),
        filtroPermitidos(ctx),
      ),
    );
  if (!e) throw new ErroNaoEncontrado('Estabelecimento não encontrado.');
  return e;
}

function valores(d: z.output<typeof dadosEstabelecimento>) {
  return {
    registroMapa: d.registroMapa ?? null,
    registroMapaValidade: d.registroMapaValidade ?? null,
    capacidadeLitros: d.capacidadeLitros ?? null,
    fuso: d.fuso,
    origemUva: d.origemUva ?? null,
    atividadesMapa: [...new Set(d.atividadesMapa)],
    temManualBpf: d.temManualBpf ?? null,
    manualBpfRevisao: d.manualBpfRevisao ?? null,
    formaRegistroAtual: d.formaRegistroAtual ?? null,
    responsavelTecnicoId: d.responsavelTecnicoId ?? null,
    produtosElaborados: [...new Set(d.produtosElaborados)],
  };
}

/** Confere RT, IGs e classes e grava as IGs. */
async function conferirEGravarPerfil(
  ctx: ContextoEmpresa,
  estabelecimentoId: string | null,
  d: z.output<typeof dadosEstabelecimento>,
): Promise<void> {
  if (d.responsavelTecnicoId) {
    const [rt] = await ctx.tx
      .select({ id: s.pessoaPapel.id })
      .from(s.pessoaPapel)
      .where(
        and(
          eq(s.pessoaPapel.pessoaId, d.responsavelTecnicoId),
          eq(s.pessoaPapel.empresaId, ctx.empresaId),
          eq(s.pessoaPapel.papel, 'responsavel_tecnico'),
          eq(s.pessoaPapel.ativo, true),
        ),
      );
    if (!rt)
      throw new ErroRegra('O responsável técnico precisa ser uma pessoa com esse papel.', 'rt');
  }
  const igs = [...new Set(d.igs)];
  if (igs.length) {
    const validas = await ctx.tx
      .select({ id: s.indicacaoGeografica.id })
      .from(s.indicacaoGeografica)
      .where(inArray(s.indicacaoGeografica.id, igs));
    if (validas.length !== igs.length) throw new ErroRegra('Indicação geográfica inválida.', 'ig');
  }
  if (d.produtosElaborados.length) {
    const classes = await ctx.tx
      .selectDistinct({ codigo: s.classeProduto.codigo })
      .from(s.classeProduto)
      .where(inArray(s.classeProduto.codigo, d.produtosElaborados));
    if (classes.length !== new Set(d.produtosElaborados).size)
      throw new ErroRegra('Classe de produto inválida.', 'classe');
  }
  if (!estabelecimentoId) return;
  await ctx.tx
    .delete(s.estabelecimentoIg)
    .where(eq(s.estabelecimentoIg.estabelecimentoId, estabelecimentoId));
  if (igs.length) {
    await ctx.tx.insert(s.estabelecimentoIg).values(
      igs.map((indicacaoGeograficaId) => ({
        estabelecimentoId,
        empresaId: ctx.empresaId,
        indicacaoGeograficaId,
      })),
    );
  }
}

async function igsDo(ctx: ContextoEmpresa, estabelecimentoId: string): Promise<string[]> {
  const r = await ctx.tx
    .select({ id: s.estabelecimentoIg.indicacaoGeograficaId })
    .from(s.estabelecimentoIg)
    .where(eq(s.estabelecimentoIg.estabelecimentoId, estabelecimentoId));
  return r.map((x) => x.id).sort();
}

export async function rotasEstabelecimentos(app: FastifyInstance): Promise<void> {
  const { db } = app.deps;
  const F = 'gestao.config.estabelecimentos';

  app.get('/api/estabelecimentos', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const consulta = consultaListagem
        .extend({ situacao: z.enum(['ativos', 'inativos', 'todos']).default('ativos') })
        .parse(req.query);
      const filtro = and(
        eq(s.estabelecimento.empresaId, ctx.empresaId),
        filtroPermitidos(ctx),
        consulta.situacao === 'todos'
          ? undefined
          : eq(s.estabelecimento.ativo, consulta.situacao === 'ativos'),
        buscaTexto(consulta.busca, [
          s.ficha.nome,
          s.ficha.nomeFantasia,
          s.ficha.documento,
          s.estabelecimento.registroMapa,
        ]),
      );
      return listar({
        consulta,
        ordenaveis: {
          nome: s.ficha.nome,
          documento: s.ficha.documento,
          registroMapaValidade: s.estabelecimento.registroMapaValidade,
          capacidadeLitros: s.estabelecimento.capacidadeLitros,
        },
        ordemPadrao: { campo: 'nome', direcao: 'asc' },
        contar: async () =>
          (
            await ctx.tx
              .select({ n: count() })
              .from(s.estabelecimento)
              .innerJoin(s.ficha, eq(s.ficha.id, s.estabelecimento.fichaId))
              .where(filtro)
          )[0]!.n,
        buscar: ({ ordem, limite, deslocamento }) =>
          ctx.tx
            .select({
              id: s.estabelecimento.id,
              nome: s.ficha.nome,
              nomeFantasia: s.ficha.nomeFantasia,
              tipoPessoa: s.ficha.tipoPessoa,
              documento: s.ficha.documento,
              registroMapa: s.estabelecimento.registroMapa,
              registroMapaValidade: s.estabelecimento.registroMapaValidade,
              capacidadeLitros: s.estabelecimento.capacidadeLitros,
              municipio: sql<
                string | null
              >`(select e.municipio || '/' || e.uf from ficha_endereco e where e.ficha_id = ${s.ficha.id} and e.principal limit 1)`,
              ativo: s.estabelecimento.ativo,
            })
            .from(s.estabelecimento)
            .innerJoin(s.ficha, eq(s.ficha.id, s.estabelecimento.fichaId))
            .where(filtro)
            .orderBy(...ordem)
            .limit(limite)
            .offset(deslocamento),
      });
    }),
  );

  app.get<{ Params: { id: string } }>('/api/estabelecimentos/:id', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const e = await carregar(ctx, z.uuid().parse(req.params.id));
      const { fichaId, empresaId: _e, criadoPor: _c, atualizadoPor: _a, ...resto } = e;
      return { ...resto, igs: await igsDo(ctx, e.id), ficha: await lerFicha(ctx.tx, fichaId) };
    }),
  );

  app.post('/api/estabelecimentos', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const d = dadosEstabelecimento.parse(req.body);
      await conferirLimite(ctx.tx, ctx.empresaId);
      await conferirEGravarPerfil(ctx, null, d);
      const fichaId = await criarFicha(
        ctx.tx,
        d.ficha,
        'estabelecimento',
        ctx.empresaId,
        ctx.usuarioId,
      );
      const [e] = await ctx.tx
        .insert(s.estabelecimento)
        .values({
          ...valores(d),
          empresaId: ctx.empresaId,
          fichaId,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.estabelecimento.id });
      await conferirEGravarPerfil(ctx, e!.id, d);
      // Vínculo restrito: o estabelecimento novo entra na lista de quem o criou.
      if (ctx.acesso.estabelecimentosRestritos.length) {
        await ctx.tx.insert(s.vinculoEstabelecimento).values({
          vinculoId: ctx.acesso.vinculoId,
          estabelecimentoId: e!.id,
          empresaId: ctx.empresaId,
        });
      }
      await ctx.auditar({
        acao: 'criar',
        entidade: 'estabelecimento',
        registroId: e!.id,
        depois: { ...resumoFicha(d.ficha), ...valores(d), igs: [...new Set(d.igs)].sort() },
      });
      return { id: e!.id };
    }),
  );

  app.put<{ Params: { id: string } }>('/api/estabelecimentos/:id', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id);
      const d = dadosEstabelecimento.parse(req.body);
      const e = await carregar(ctx, id);
      conferirVersao(e.versao, d.versao);
      const fichaAntes = await lerFicha(ctx.tx, e.fichaId);
      const igsAntes = await igsDo(ctx, id);
      await conferirEGravarPerfil(ctx, id, d);
      await atualizarFicha(ctx.tx, e.fichaId, d.ficha, ctx.usuarioId);
      await ctx.tx
        .update(s.estabelecimento)
        .set({
          ...valores(d),
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.estabelecimento.versao} + 1`,
        })
        .where(eq(s.estabelecimento.id, id));
      await ctx.auditar({
        acao: 'editar',
        entidade: 'estabelecimento',
        registroId: id,
        antes: {
          ...resumoFicha(fichaAntes),
          registroMapa: e.registroMapa,
          registroMapaValidade: e.registroMapaValidade,
          capacidadeLitros: e.capacidadeLitros,
          fuso: e.fuso,
          origemUva: e.origemUva,
          atividadesMapa: e.atividadesMapa,
          temManualBpf: e.temManualBpf,
          manualBpfRevisao: e.manualBpfRevisao,
          formaRegistroAtual: e.formaRegistroAtual,
          responsavelTecnicoId: e.responsavelTecnicoId,
          produtosElaborados: e.produtosElaborados,
          igs: igsAntes,
        },
        depois: { ...resumoFicha(d.ficha), ...valores(d), igs: [...new Set(d.igs)].sort() },
      });
      return { ok: true };
    }),
  );

  app.post<{ Params: { id: string } }>('/api/estabelecimentos/:id/inativar', async (req) =>
    naEmpresa(db, req, [F, 'inativar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id);
      const { motivo: m } = motivo.parse(req.body);
      const e = await carregar(ctx, id);
      if (!e.ativo) return { ok: true };
      await ctx.tx
        .update(s.estabelecimento)
        .set({
          ativo: false,
          inativadoEm: sql`now()`,
          inativadoPor: ctx.usuarioId,
          motivoInativacao: m,
        })
        .where(eq(s.estabelecimento.id, id));
      await ctx.auditar({
        acao: 'inativar',
        entidade: 'estabelecimento',
        registroId: id,
        motivo: m,
      });
      return { ok: true };
    }),
  );

  app.post<{ Params: { id: string } }>('/api/estabelecimentos/:id/reativar', async (req) =>
    naEmpresa(db, req, [F, 'inativar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id);
      const e = await carregar(ctx, id);
      if (e.ativo) return { ok: true };
      await conferirLimite(ctx.tx, ctx.empresaId);
      await ctx.tx
        .update(s.estabelecimento)
        .set({ ativo: true, inativadoEm: null, inativadoPor: null, motivoInativacao: null })
        .where(eq(s.estabelecimento.id, id));
      await ctx.auditar({ acao: 'reativar', entidade: 'estabelecimento', registroId: id });
      return { ok: true };
    }),
  );
}
