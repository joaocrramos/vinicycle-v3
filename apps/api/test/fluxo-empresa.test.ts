// Fluxo do ciclo 1: a plataforma cria o cliente, o Master aceita o convite, cria o
// estabelecimento e os locais, convida a equipe e ajusta a grade (administracao.md, Fluxo; P27).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fichaPj, montar, SENHA } from './apoio';

let t: Awaited<ReturnType<typeof montar>>;
beforeAll(async () => {
  t = await montar();
});
afterAll(async () => {
  await t.fechar();
});

describe('criação do cliente e primeiro acesso', () => {
  it('Master entra sem estabelecimento e é levado a criá-lo', async () => {
    const { master } = await t.empresaComMaster();
    const sessao = await master.get('/api/auth/sessao');
    expect(sessao.status).toBe(200);
    expect(sessao.corpo.empresa.eMaster).toBe(true);
    expect(sessao.corpo.empresa.precisaEstabelecimento).toBe(true);
    expect(sessao.corpo.empresa.modulos).toEqual(expect.arrayContaining(['GESTAO', 'ENOTRACE']));

    const id = await t.criarEstabelecimento(master, 'Cantina Juazeiro');
    await master.post('/api/auth/contexto', { estabelecimentoId: id });
    const depois = await master.get('/api/auth/sessao');
    expect(depois.corpo.empresa.precisaEstabelecimento).toBe(false);
    expect(depois.corpo.empresa.estabelecimentoId).toBe(id);
  });

  it('convite usado não vale de novo', async () => {
    const { adm } = await t.empresaComMaster();
    const planos = await adm.get('/api/plataforma/planos');
    const email = `outro.${Date.now()}@teste.vinicycle.com`;
    await adm.post('/api/plataforma/empresas', {
      ficha: fichaPj('Vinícola Dupla'),
      emailMaster: email,
      planoId: planos.corpo.find((p: { nome: string }) => p.nome === 'Completo').id,
      periodicidade: 'mensal',
      inicio: '2026-10-03',
      emTeste: true,
    });
    const token = (await t.ultimoLink(email)).split('/convite/')[1]!;
    const c = t.cliente();
    const corpo = {
      ficha: { tipoPessoa: 'fisica', nome: 'Ana' },
      senha: SENHA,
      aceiteTermos: true,
    };
    expect((await c.post(`/api/convites/${token}/aceitar`, corpo)).status).toBe(200);
    const segunda = await t.cliente().post(`/api/convites/${token}/aceitar`, corpo);
    expect(segunda.status).toBe(422);
  });

  it('o documento do cliente é único na plataforma', async () => {
    const { adm } = await t.empresaComMaster();
    const planos = await adm.get('/api/plataforma/planos');
    const ficha = fichaPj('Repetida');
    const dados = {
      ficha,
      emailMaster: 'a@teste.vinicycle.com',
      planoId: planos.corpo.find((p: { nome: string }) => p.nome === 'Completo').id,
      periodicidade: 'mensal',
      inicio: '2026-10-03',
      emTeste: false,
    };
    expect((await adm.post('/api/plataforma/empresas', dados)).status).toBe(200);
    const r = await adm.post('/api/plataforma/empresas', {
      ...dados,
      emailMaster: 'b@teste.vinicycle.com',
    });
    expect(r.status).toBe(422);
    expect(r.corpo.codigo).toBe('documento_duplicado');
  });
});

describe('usuários, perfis e permissões (P27)', () => {
  it('cantineiro não vê configurações; o acesso negado fica na auditoria', async () => {
    const { master } = await t.empresaComMaster();
    const estab = await t.criarEstabelecimento(master);
    await master.post('/api/auth/contexto', { estabelecimentoId: estab });
    const { cliente: cantineiro } = await t.convidar(master, 'Cantineiro');
    const r = await cantineiro.get('/api/locais');
    expect(r.status).toBe(403);
    expect(r.corpo.mensagem).toBe('Sem permissão para visualizar em Configurações: locais.');
    const aud = await master.get('/api/auditoria?acao=acesso_negado');
    expect(aud.corpo.total).toBeGreaterThanOrEqual(1);
    // Busca livre (P4): acha pelo texto, sem acento e sem caixa.
    const busca = await master.get('/api/auditoria?busca=ACESSO_NEGADO');
    expect(busca.corpo.total).toBe(aud.corpo.total);
    expect((await master.get('/api/auditoria?busca=nada-com-isso')).corpo.total).toBe(0);
  });

  it('mudança na grade vale na próxima ação, sem novo login', async () => {
    const { master } = await t.empresaComMaster();
    await t.criarEstabelecimento(master);
    const { cliente: cantineiro } = await t.convidar(master, 'Cantineiro');
    expect((await cantineiro.get('/api/locais')).status).toBe(403);

    const perfis = await master.get('/api/perfis');
    const p = perfis.corpo.find((x: { nome: string }) => x.nome === 'Cantineiro');
    const atual = await master.get(`/api/perfis/${p.id}`);
    const permissoes = atual.corpo.permissoes.map((x: string) => {
      const [funcionalidade, acao] = x.split(':');
      return { funcionalidade, acao };
    });
    permissoes.push({ funcionalidade: 'gestao.config.locais', acao: 'visualizar' });
    const g = await master.put(`/api/perfis/${p.id}/grade`, {
      permissoes,
      versao: atual.corpo.versao,
    });
    expect(g.status).toBe(200);
    expect((await cantineiro.get('/api/locais')).status).toBe(200);
  });

  it('a grade do Master não é editável e ninguém concede telas exclusivas do Master', async () => {
    const { master } = await t.empresaComMaster();
    const perfis = await master.get('/api/perfis');
    const m = perfis.corpo.find((x: { eMaster: boolean }) => x.eMaster);
    expect((await master.put(`/api/perfis/${m.id}/grade`, { permissoes: [] })).status).toBe(422);
    const rt = perfis.corpo.find((x: { nome: string }) => x.nome === 'Responsável Técnico');
    const r = await master.put(`/api/perfis/${rt.id}/grade`, {
      permissoes: [{ funcionalidade: 'gestao.config.usuarios', acao: 'visualizar' }],
    });
    expect(r.status).toBe(422);
  });

  it('o usuário não altera o próprio perfil e o Master não é inativado', async () => {
    const { master } = await t.empresaComMaster();
    const lista = await master.get('/api/usuarios');
    const eu = lista.corpo.itens[0];
    const perfis = await master.get('/api/perfis');
    const rt = perfis.corpo.find((x: { nome: string }) => x.nome === 'Responsável Técnico');
    expect((await master.put(`/api/usuarios/${eu.id}`, { perfilId: rt.id })).status).toBe(422);
    expect((await master.post(`/api/usuarios/${eu.id}/inativar`, { motivo: 'teste' })).status).toBe(
      422,
    );
  });

  it('usuário inativado perde o acesso na hora', async () => {
    const { master } = await t.empresaComMaster();
    await t.criarEstabelecimento(master);
    const { cliente: rt, email } = await t.convidar(master, 'Responsável Técnico');
    expect((await rt.get('/api/auth/sessao')).corpo.empresa).not.toBeNull();
    const lista = await master.get(`/api/usuarios?busca=${encodeURIComponent(email)}`);
    expect(
      (
        await master.post(`/api/usuarios/${lista.corpo.itens[0].id}/inativar`, {
          motivo: 'Saiu da empresa',
        })
      ).status,
    ).toBe(200);
    const r = await rt.get('/api/historico/estabelecimento/00000000-0000-0000-0000-000000000000');
    expect(r.status).toBe(403);
    expect((await rt.get('/api/auth/sessao')).corpo.empresa).toBeNull();
  });

  it('vínculo restrito só vê os estabelecimentos permitidos (P12)', async () => {
    const { master } = await t.empresaComMaster();
    const a = await t.criarEstabelecimento(master, 'Matriz');
    const b = await t.criarEstabelecimento(master, 'Filial');
    // RT com acesso a configurações de estabelecimento, restrito à filial.
    const perfis = await master.get('/api/perfis');
    const rt = perfis.corpo.find((x: { nome: string }) => x.nome === 'Responsável Técnico');
    await master.put(`/api/perfis/${rt.id}/grade`, {
      permissoes: [{ funcionalidade: 'gestao.config.estabelecimentos', acao: 'visualizar' }],
    });
    const { cliente } = await t.convidar(master, rt.id, [b]);
    const sessao = await cliente.get('/api/auth/sessao');
    expect(sessao.corpo.empresa.estabelecimentos.map((e: { id: string }) => e.id)).toEqual([b]);
    const lista = await cliente.get('/api/estabelecimentos');
    expect(lista.corpo.itens.map((e: { id: string }) => e.id)).toEqual([b]);
    expect((await cliente.get(`/api/estabelecimentos/${a}`)).status).toBe(404);
    expect((await cliente.post('/api/auth/contexto', { estabelecimentoId: a })).status).toBe(422);
  });
});

describe('estabelecimentos e locais', () => {
  it('cria, edita com controle de versão, inativa e registra o histórico', async () => {
    const { master } = await t.empresaComMaster();
    const id = await t.criarEstabelecimento(master);
    await master.post('/api/auth/contexto', { estabelecimentoId: id });
    const l = await master.post('/api/locais', { nome: 'Adega', uso: 'recipientes' });
    expect(l.status).toBe(200);
    const repetido = await master.post('/api/locais', {
      nome: 'adega',
      uso: 'ambos',
      moduloEstoque: 'ENOTRACE',
    });
    expect(repetido.status).toBe(422);
    const semModulo = await master.post('/api/locais', { nome: 'Almoxarifado', uso: 'estoque' });
    expect(semModulo.status).toBe(400);
    const lista = await master.get('/api/locais');
    const adega = lista.corpo.itens[0];
    const ed = await master.put(`/api/locais/${adega.id}`, {
      nome: 'Adega 1',
      uso: 'recipientes',
      refrigerado: true,
      versao: adega.versao,
    });
    expect(ed.status).toBe(200);
    const velho = await master.put(`/api/locais/${adega.id}`, {
      nome: 'Adega X',
      uso: 'recipientes',
      versao: adega.versao,
    });
    expect(velho.status).toBe(409);
    expect(
      (await master.post(`/api/locais/${adega.id}/inativar`, { motivo: 'Desativada' })).status,
    ).toBe(200);
    const hist = await master.get(`/api/historico/local/${adega.id}`);
    expect(hist.corpo.map((h: { acao: string }) => h.acao)).toEqual([
      'inativar',
      'editar',
      'criar',
    ]);
    expect(hist.corpo[1].diferenca).toMatchObject({
      nome: ['Adega', 'Adega 1'],
      refrigerado: [false, true],
    });
  });

  it('o Master não troca o documento da empresa (só o suporte)', async () => {
    const { master } = await t.empresaComMaster();
    const e = await master.get('/api/empresa');
    const outra = { ...e.corpo.ficha, documento: fichaPj('x').documento };
    const r = await master.put('/api/empresa', { ficha: outra, versao: e.corpo.versao });
    expect(r.status).toBe(422);
    expect(r.corpo.codigo).toBe('documento_bloqueado');
    const ok = await master.put('/api/empresa', {
      ficha: { ...e.corpo.ficha, nomeFantasia: 'Vinhos do Sertão' },
      corMarca: '#6b1f3a',
      versao: e.corpo.versao,
    });
    expect(ok.status).toBe(200);
  });
});

describe('situação da empresa', () => {
  it('somente leitura bloqueia alterações; bloqueio deixa só o Master entrar', async () => {
    const { master, adm, empresaId } = await t.empresaComMaster();
    await t.criarEstabelecimento(master);
    const { cliente: rt } = await t.convidar(master, 'Responsável Técnico');
    await adm.post(`/api/plataforma/empresas/${empresaId}/situacao`, {
      situacao: 'somente_leitura',
      motivo: 'Inadimplência',
    });
    expect((await master.get('/api/estabelecimentos')).status).toBe(200);
    expect((await master.post('/api/locais', { nome: 'X', uso: 'recipientes' })).status).toBe(403);
    await adm.post(`/api/plataforma/empresas/${empresaId}/situacao`, {
      situacao: 'bloqueado',
      motivo: 'Inadimplência',
    });
    // Bloqueada, o Master só vê a assinatura e exporta os dados (administracao.md).
    expect((await master.get('/api/estabelecimentos')).status).toBe(403);
    expect((await master.get('/api/assinatura')).status).toBe(200);
    expect((await rt.get('/api/historico/empresa/' + empresaId)).status).toBe(403);
  });
});
