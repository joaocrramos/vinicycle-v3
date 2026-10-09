// Personificação (P28; ciclo 12, bloco 4).
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/db/schema';
import { processarFila } from '../src/nucleo/email';
import { montar } from './apoio';

let t: Awaited<ReturnType<typeof montar>>;
const silencio = { error: () => {} };
beforeAll(async () => {
  t = await montar();
});
afterAll(async () => {
  await t.fechar();
});

async function usuarioId(email: string) {
  const [u] = await t.dbDono.select().from(schema.usuario).where(eq(schema.usuario.email, email));
  return u!.id;
}

describe('personificação', () => {
  it('age como o usuário, com as duas identidades na auditoria, e bloqueia o que é sensível', async () => {
    const { empresaId, emailMaster, master } = await t.empresaComMaster();
    await t.criarEstabelecimento(master);
    const { cliente: adm, usuarioId: membroId } = await t.admin();
    const alvo = await usuarioId(emailMaster);

    expect(
      (
        await adm.post('/api/plataforma/personificacoes', {
          empresaId,
          usuarioId: alvo,
          motivo: 'x',
        })
      ).status,
    ).toBe(400);
    const r = await adm.post('/api/plataforma/personificacoes', {
      empresaId,
      usuarioId: alvo,
      motivo: 'Chamado 12: erro no fechamento',
    });
    expect(r.status).toBe(200);

    const sessao = (await adm.get('/api/auth/sessao')).corpo;
    expect(sessao).toMatchObject({ contexto: 'empresa', equipe: null });
    expect(sessao.empresa.id).toBe(empresaId);
    expect(sessao.personificacao).toMatchObject({ usuario: 'Maria Master' });

    // Escolher o estabelecimento continua possível.
    const estab = sessao.empresa.estabelecimentos[0].id;
    expect((await adm.post('/api/auth/contexto', { estabelecimentoId: estab })).status).toBe(200);

    // Age com as permissões do usuário; a auditoria guarda quem fez e como quem.
    const local = await adm.post('/api/locais', { nome: 'Sala do suporte', uso: 'recipientes' });
    expect(local.status).toBe(200);
    const [linha] = await t.dbDono
      .select()
      .from(schema.auditoria)
      .where(and(eq(schema.auditoria.empresaId, empresaId), eq(schema.auditoria.acao, 'criar')))
      .orderBy(desc(schema.auditoria.ocorridoEm))
      .limit(1);
    expect(linha).toMatchObject({
      usuarioId: membroId,
      personificadoId: alvo,
      personificacaoId: r.corpo.id,
    });

    // Bloqueado: dados de acesso, perfis, exportação, Administração, trocar de área, bastão.
    expect((await adm.put('/api/eu/preferencias', { tema: 'escuro' })).status).toBe(403);
    expect((await adm.post('/api/perfis', { nome: 'Novo perfil' })).status).toBe(403);
    const exp = await t.app.inject({
      method: 'GET',
      url: '/api/exportacao/pacote',
      headers: { cookie: adm.cookie },
    });
    expect(exp.statusCode).toBe(403);
    expect((await adm.get('/api/plataforma/empresas')).status).toBe(403);
    expect((await adm.post('/api/auth/contexto', { contexto: 'plataforma' })).status).toBe(403);
    expect(
      (
        await adm.post('/api/plataforma/personificacoes', {
          empresaId,
          usuarioId: alvo,
          motivo: 'De novo, de dentro',
        })
      ).status,
    ).toBe(403);

    // O Master é avisado e vê na auditoria da empresa.
    while ((await processarFila(t.db, t.correio, t.config.EMAIL_REMETENTE, silencio)) > 0);
    const aviso = t.correio.enviados.find(
      (m) => m.para === emailMaster && m.assunto.includes('O suporte do ViniCycle acessou'),
    );
    expect(aviso?.texto).toContain('Chamado 12: erro no fechamento');

    const fim = await adm.post('/api/auth/personificacao/encerrar', {});
    expect(fim.status).toBe(200);
    expect(fim.corpo).toMatchObject({ contexto: 'plataforma', personificacao: null });
    expect((await adm.get('/api/plataforma/empresas')).status).toBe(200);

    const lista = (await master.get('/api/personificacoes')).corpo;
    expect(lista[0]).toMatchObject({ usuario: 'Maria Master', formaEncerramento: 'manual' });
  });

  it('acaba sozinha depois de 60 minutos', async () => {
    const { empresaId, emailMaster } = await t.empresaComMaster();
    const { cliente: adm } = await t.admin();
    const r = await adm.post('/api/plataforma/personificacoes', {
      empresaId,
      usuarioId: await usuarioId(emailMaster),
      motivo: 'Conferir permissões do usuário',
    });
    await t.dbDono
      .update(schema.personificacao)
      .set({ fimPrevisto: new Date(Date.now() - 1000) })
      .where(eq(schema.personificacao.id, r.corpo.id));
    const sessao = (await adm.get('/api/auth/sessao')).corpo;
    expect(sessao).toMatchObject({ contexto: 'plataforma', personificacao: null });
    const [p] = await t.dbDono
      .select()
      .from(schema.personificacao)
      .where(eq(schema.personificacao.id, r.corpo.id));
    expect(p!.formaEncerramento).toBe('tempo');
  });
});
