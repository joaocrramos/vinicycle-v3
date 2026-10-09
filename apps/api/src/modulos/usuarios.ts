// Configurações › Usuários (ambiente-cliente.md; P8, P12, P25, P27). Só o Master.
import { alterarVinculo, consultaListagem, motivo, novoConvite } from '@vinicycle/shared';
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as s from '../db/schema';
import { conferirVersao } from '../nucleo/entidades';
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros';
import { buscaTexto, listar } from '../nucleo/listagem';
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao';
import { conferirLimiteUsuarios, criarConvite, reenviarConvite } from './convites';

async function carregarVinculo(ctx: ContextoEmpresa, id: string) {
  const [v] = await ctx.tx
    .select()
    .from(s.vinculo)
    .where(and(eq(s.vinculo.id, id), eq(s.vinculo.empresaId, ctx.empresaId)));
  if (!v) throw new ErroNaoEncontrado('Usuário não encontrado.');
  return v;
}

async function estabelecimentosDe(ctx: ContextoEmpresa, vinculoId: string): Promise<string[]> {
  const r = await ctx.tx
    .select({ id: s.vinculoEstabelecimento.estabelecimentoId })
    .from(s.vinculoEstabelecimento)
    .where(eq(s.vinculoEstabelecimento.vinculoId, vinculoId));
  return r.map((x) => x.id).sort();
}

export async function rotasUsuarios(app: FastifyInstance): Promise<void> {
  const { db, config } = app.deps;
  const F = 'gestao.config.usuarios';

  app.get('/api/usuarios', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const consulta = consultaListagem
        .extend({ situacao: z.enum(['ativos', 'inativos', 'todos']).default('ativos') })
        .parse(req.query);
      const filtro = and(
        eq(s.vinculo.empresaId, ctx.empresaId),
        consulta.situacao === 'todos'
          ? undefined
          : eq(s.vinculo.ativo, consulta.situacao === 'ativos'),
        buscaTexto(consulta.busca, [s.ficha.nome, s.usuario.email, s.perfil.nome]),
      );
      const base = () =>
        ctx.tx
          .select({
            id: s.vinculo.id,
            usuarioId: s.usuario.id,
            nome: s.ficha.nome,
            email: s.usuario.email,
            avatarCor: s.ficha.avatarCor,
            perfilId: s.perfil.id,
            perfil: s.perfil.nome,
            eMaster: s.vinculo.eMaster,
            ativo: s.vinculo.ativo,
            ultimoAcessoEm: s.usuario.ultimoAcessoEm,
            versao: s.vinculo.versao,
            estabelecimentos: sql<
              string[]
            >`coalesce((select array_agg(ve.estabelecimento_id) from vinculo_estabelecimento ve where ve.vinculo_id = ${s.vinculo.id}), '{}')`,
          })
          .from(s.vinculo)
          .innerJoin(s.usuario, eq(s.usuario.id, s.vinculo.usuarioId))
          .innerJoin(s.ficha, eq(s.ficha.id, s.usuario.fichaId))
          .innerJoin(s.perfil, eq(s.perfil.id, s.vinculo.perfilId));
      return listar({
        consulta,
        ordenaveis: {
          nome: s.ficha.nome,
          email: s.usuario.email,
          perfil: s.perfil.nome,
          ultimoAcessoEm: s.usuario.ultimoAcessoEm,
        },
        ordemPadrao: { campo: 'nome', direcao: 'asc' },
        contar: async () =>
          (
            await ctx.tx
              .select({ n: count() })
              .from(s.vinculo)
              .innerJoin(s.usuario, eq(s.usuario.id, s.vinculo.usuarioId))
              .innerJoin(s.ficha, eq(s.ficha.id, s.usuario.fichaId))
              .innerJoin(s.perfil, eq(s.perfil.id, s.vinculo.perfilId))
              .where(filtro)
          )[0]!.n,
        buscar: ({ ordem, limite, deslocamento }) =>
          base()
            .where(filtro)
            .orderBy(...ordem)
            .limit(limite)
            .offset(deslocamento),
      });
    }),
  );

  app.get('/api/usuarios/convites', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const linhas = await ctx.tx
        .select({
          id: s.convite.id,
          email: s.convite.email,
          perfil: s.perfil.nome,
          estabelecimentos: s.convite.estabelecimentos,
          situacao: s.convite.situacao,
          enviadoEm: s.convite.enviadoEm,
          expiraEm: s.convite.expiraEm,
          reenvios: s.convite.reenvios,
        })
        .from(s.convite)
        .innerJoin(s.perfil, eq(s.perfil.id, s.convite.perfilId))
        .where(
          and(
            eq(s.convite.empresaId, ctx.empresaId),
            inArray(s.convite.situacao, ['pendente', 'expirado']),
          ),
        )
        .orderBy(s.convite.enviadoEm);
      return linhas.map((c) => ({
        ...c,
        situacao:
          c.situacao === 'pendente' && c.expiraEm.getTime() < Date.now() ? 'expirado' : c.situacao,
      }));
    }),
  );

  app.post('/api/usuarios/convites', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const d = novoConvite.parse(req.body);
      const [p] = await ctx.tx
        .select({ eMaster: s.perfil.eMaster })
        .from(s.perfil)
        .where(and(eq(s.perfil.id, d.perfilId), eq(s.perfil.empresaId, ctx.empresaId)));
      if (p?.eMaster) {
        throw new ErroRegra(
          'A empresa tem um só Master. Para trocá-lo, use "Passar o bastão".',
          'master',
        );
      }
      await conferirLimiteUsuarios(ctx.tx, ctx.empresaId);
      const id = await criarConvite(ctx.tx, ctx.origem, {
        ...d,
        empresaId: ctx.empresaId,
        urlAplicacao: config.URL_APLICACAO,
      });
      return { id };
    }),
  );

  app.post<{ Params: { id: string } }>('/api/usuarios/convites/:id/reenviar', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      await reenviarConvite(
        ctx.tx,
        ctx.origem,
        z.uuid().parse(req.params.id),
        config.URL_APLICACAO,
      );
      return { ok: true };
    }),
  );

  app.post<{ Params: { id: string } }>('/api/usuarios/convites/:id/cancelar', async (req) =>
    naEmpresa(db, req, [F, 'inativar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id);
      const [c] = await ctx.tx
        .update(s.convite)
        .set({ situacao: 'cancelado', canceladoEm: sql`now()`, canceladoPor: ctx.usuarioId })
        .where(
          and(
            eq(s.convite.id, id),
            eq(s.convite.empresaId, ctx.empresaId),
            inArray(s.convite.situacao, ['pendente', 'expirado']),
          ),
        )
        .returning({ id: s.convite.id });
      if (!c) throw new ErroNaoEncontrado('Convite não encontrado.');
      const { motivo: m } = z
        .object({ motivo: z.string().trim().max(500).optional() })
        .parse(req.body ?? {});
      await ctx.auditar({
        acao: 'cancelar',
        entidade: 'convite',
        registroId: id,
        motivo: m ?? null,
      });
      return { ok: true };
    }),
  );

  // Perfil e estabelecimentos permitidos. Ninguém altera o próprio perfil, e o Master só muda
  // pela passagem de bastão (P27).
  app.put<{ Params: { id: string } }>('/api/usuarios/:id', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id);
      const d = alterarVinculo.extend({ versao: z.number().int().optional() }).parse(req.body);
      const v = await carregarVinculo(ctx, id);
      conferirVersao(v.versao, d.versao);
      if (v.usuarioId === ctx.usuarioId)
        throw new ErroRegra('Você não pode alterar o seu próprio perfil.', 'proprio');
      if (v.eMaster)
        throw new ErroRegra('O perfil do Master só muda pela passagem de bastão.', 'master');
      const [p] = await ctx.tx
        .select({ eMaster: s.perfil.eMaster, ativo: s.perfil.ativo })
        .from(s.perfil)
        .where(and(eq(s.perfil.id, d.perfilId), eq(s.perfil.empresaId, ctx.empresaId)));
      if (!p || !p.ativo) throw new ErroRegra('Perfil inválido.', 'perfil');
      if (p.eMaster)
        throw new ErroRegra(
          'A empresa tem um só Master. Para trocá-lo, use "Passar o bastão".',
          'master',
        );
      const estabs = [...new Set(d.estabelecimentos)].sort();
      if (estabs.length) {
        const validos = await ctx.tx
          .select({ id: s.estabelecimento.id })
          .from(s.estabelecimento)
          .where(
            and(
              eq(s.estabelecimento.empresaId, ctx.empresaId),
              inArray(s.estabelecimento.id, estabs),
            ),
          );
        if (validos.length !== estabs.length)
          throw new ErroRegra('Estabelecimento inválido.', 'estabelecimento');
      }
      const antes = { perfilId: v.perfilId, estabelecimentos: await estabelecimentosDe(ctx, id) };
      await ctx.tx
        .update(s.vinculo)
        .set({
          perfilId: d.perfilId,
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.vinculo.versao} + 1`,
        })
        .where(eq(s.vinculo.id, id));
      await ctx.tx
        .delete(s.vinculoEstabelecimento)
        .where(eq(s.vinculoEstabelecimento.vinculoId, id));
      if (estabs.length) {
        await ctx.tx
          .insert(s.vinculoEstabelecimento)
          .values(
            estabs.map((e) => ({ vinculoId: id, estabelecimentoId: e, empresaId: ctx.empresaId })),
          );
      }
      await ctx.auditar({
        acao: 'editar',
        entidade: 'vinculo',
        registroId: id,
        antes,
        depois: { perfilId: d.perfilId, estabelecimentos: estabs },
      });
      return { ok: true };
    }),
  );

  app.post<{ Params: { id: string } }>('/api/usuarios/:id/inativar', async (req) =>
    naEmpresa(db, req, [F, 'inativar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id);
      const { motivo: m } = motivo.parse(req.body);
      const v = await carregarVinculo(ctx, id);
      if (v.usuarioId === ctx.usuarioId)
        throw new ErroRegra('Você não pode inativar o seu próprio acesso.', 'proprio');
      if (v.eMaster)
        throw new ErroRegra('O Master não pode ser inativado. Passe o bastão antes.', 'master');
      if (!v.ativo) return { ok: true };
      await ctx.tx
        .update(s.vinculo)
        .set({
          ativo: false,
          inativadoEm: sql`now()`,
          inativadoPor: ctx.usuarioId,
          motivoInativacao: m,
        })
        .where(eq(s.vinculo.id, id));
      await ctx.auditar({ acao: 'inativar', entidade: 'vinculo', registroId: id, motivo: m });
      return { ok: true };
    }),
  );

  app.post<{ Params: { id: string } }>('/api/usuarios/:id/reativar', async (req) =>
    naEmpresa(db, req, [F, 'inativar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id);
      const v = await carregarVinculo(ctx, id);
      if (v.ativo) return { ok: true };
      await conferirLimiteUsuarios(ctx.tx, ctx.empresaId);
      await ctx.tx
        .update(s.vinculo)
        .set({ ativo: true, inativadoEm: null, inativadoPor: null, motivoInativacao: null })
        .where(eq(s.vinculo.id, id));
      await ctx.auditar({ acao: 'reativar', entidade: 'vinculo', registroId: id });
      return { ok: true };
    }),
  );
}
