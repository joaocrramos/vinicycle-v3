// Passagem de bastão do Master (administracao.md) e troca de e-mail do usuário (P10).
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/db/schema';
import { emailAleatorio, montar, SENHA } from './apoio';

let t: Awaited<ReturnType<typeof montar>>;
beforeAll(async () => {
  t = await montar();
});
afterAll(async () => {
  await t.fechar();
});

async function cenario() {
  const r = await t.empresaComMaster();
  await t.criarEstabelecimento(r.master);
  const perfis = (await r.master.get('/api/perfis')).corpo as Array<{
    id: string;
    nome: string;
  }>;
  const perfil = (nome: string) => perfis.find((p) => p.nome === nome)!.id;
  const enologo = await t.convidar(r.master, 'Enólogo');
  const usuarios = (await r.master.get('/api/usuarios')).corpo.itens as Array<{
    id: string;
    email: string;
    eMaster: boolean;
    perfil: string;
    ativo: boolean;
  }>;
  const vinculoDe = (email: string) => usuarios.find((u) => u.email === email)!.id;
  return { ...r, perfil, enologo, vinculoDe };
}

const token = (link: string) => link.split('/bastao/')[1]!;

describe('passagem de bastão pelo Master', () => {
  it('nada muda até o aceite; ao aceitar, o escolhido vira Master e o antigo recebe o perfil escolhido', async () => {
    const { master, emailMaster, perfil, enologo, vinculoDe } = await cenario();
    const pedido = await master.post(`/api/usuarios/${vinculoDe(enologo.email)}/bastao`, {
      perfilAnteriorId: perfil('Financeiro / Administrativo'),
    });
    expect(pedido.status).toBe(200);
    const pendente = (await master.get('/api/usuarios/bastao')).corpo;
    expect(pendente).toMatchObject({
      escolhidoEmail: enologo.email,
      perfilAnterior: 'Financeiro / Administrativo',
    });

    // Ainda é o Master atual quem administra.
    expect((await master.get('/api/usuarios')).status).toBe(200);

    const link = await t.ultimoLink(enologo.email);
    const info = await enologo.cliente.get(`/api/bastao/${token(link)}`);
    expect(info.corpo).toMatchObject({ situacao: 'pendente', sessaoConfere: true });

    // Com a sessão do escolhido aberta, aceita sem digitar a senha.
    const aceite = await enologo.cliente.post(`/api/bastao/${token(link)}/aceitar`, {});
    expect(aceite.status).toBe(200);

    const lista = (await enologo.cliente.get('/api/usuarios')).corpo.itens as Array<{
      email: string;
      eMaster: boolean;
      perfil: string;
    }>;
    expect(lista.find((u) => u.email === enologo.email)).toMatchObject({ eMaster: true });
    expect(lista.find((u) => u.email === emailMaster)).toMatchObject({
      eMaster: false,
      perfil: 'Financeiro / Administrativo',
    });
    // O antigo Master perde as telas exclusivas do Master na próxima ação.
    expect((await master.get('/api/usuarios')).status).toBe(403);
    // Link usado não vale de novo.
    expect((await enologo.cliente.post(`/api/bastao/${token(link)}/aceitar`, {})).status).toBe(422);

    const aud = await enologo.cliente.get('/api/auditoria?entidade=troca_master');
    expect(aud.corpo.itens.map((a: { acao: string }) => a.acao).sort()).toEqual([
      'bastao_aceito',
      'bastao_pedido',
    ]);
    // Os dois recebem a confirmação.
    await t.ultimoLink(enologo.email).catch(() => null);
    const assuntos = t.correio.enviados.filter((m) =>
      m.assunto.startsWith('Passagem de bastão concluída'),
    );
    expect(assuntos.map((m) => m.para).sort()).toEqual([emailMaster, enologo.email].sort());
  });

  it('um pedido por vez; o Master cancela; o escolhido recusa', async () => {
    const { master, emailMaster, perfil, enologo, vinculoDe } = await cenario();
    const alvo = `/api/usuarios/${vinculoDe(enologo.email)}/bastao`;
    const corpo = { perfilAnteriorId: perfil('Financeiro / Administrativo') };
    expect((await master.post(alvo, corpo)).status).toBe(200);
    expect((await master.post(alvo, corpo)).corpo.codigo).toBe('bastao_pendente');

    const primeiro = token(await t.ultimoLink(enologo.email));
    expect((await master.post('/api/usuarios/bastao/cancelar')).status).toBe(200);
    expect((await master.get('/api/usuarios/bastao')).corpo).toBeNull();
    const cancelado = await enologo.cliente.post(`/api/bastao/${primeiro}/aceitar`, {});
    expect(cancelado.corpo.codigo).toBe('bastao_situacao');

    expect((await master.post(alvo, corpo)).status).toBe(200);
    const segundo = token(await t.ultimoLink(enologo.email));
    expect((await t.cliente().post(`/api/bastao/${segundo}/recusar`)).status).toBe(200);
    await t.ultimoLink(enologo.email);
    expect(
      t.correio.enviados.some(
        (m) => m.para === emailMaster && m.assunto.startsWith('Passagem de bastão recusada'),
      ),
    ).toBe(true);
    // Nada mudou.
    const lista = (await master.get('/api/usuarios')).corpo.itens as Array<{
      email: string;
      eMaster: boolean;
    }>;
    expect(lista.find((u) => u.email === emailMaster)!.eMaster).toBe(true);
  });

  it('só o Master pede; o perfil do antigo Master não pode ser o de Master', async () => {
    const { master, perfil, enologo, vinculoDe } = await cenario();
    const outro = await t.convidar(master, 'Cantineiro');
    const negado = await outro.cliente.post(`/api/usuarios/${vinculoDe(enologo.email)}/bastao`, {
      perfilAnteriorId: perfil('Financeiro / Administrativo'),
    });
    expect(negado.status).toBe(403);
    const perfilMaster = await master.post(`/api/usuarios/${vinculoDe(enologo.email)}/bastao`, {
      perfilAnteriorId: perfil('Master'),
    });
    expect(perfilMaster.corpo.codigo).toBe('perfil');
  });

  it('pedido vencido expira e libera um novo', async () => {
    const { master, empresaId, perfil, enologo, vinculoDe } = await cenario();
    const alvo = `/api/usuarios/${vinculoDe(enologo.email)}/bastao`;
    const corpo = { perfilAnteriorId: perfil('Financeiro / Administrativo') };
    expect((await master.post(alvo, corpo)).status).toBe(200);
    const vencido = token(await t.ultimoLink(enologo.email));
    await t.dbDono
      .update(schema.trocaMaster)
      .set({ expiraEm: sql`now() - interval '1 minute'` })
      .where(eq(schema.trocaMaster.empresaId, empresaId));
    expect((await enologo.cliente.get(`/api/bastao/${vencido}`)).corpo.situacao).toBe('expirada');
    expect((await enologo.cliente.post(`/api/bastao/${vencido}/aceitar`, {})).corpo.codigo).toBe(
      'bastao_situacao',
    );
    expect((await master.post(alvo, corpo)).status).toBe(200);
  });
});

describe('troca do Master pelo suporte', () => {
  function formulario(campos: Record<string, string>, comArquivo = true) {
    const partes = Object.entries(campos).map(([k, v]) =>
      Buffer.from(`--x\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`),
    );
    if (comArquivo) {
      partes.push(
        Buffer.from(
          '--x\r\nContent-Disposition: form-data; name="comprovante"; filename="pedido.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4 pedido\r\n',
        ),
      );
    }
    partes.push(Buffer.from('--x--\r\n'));
    return Buffer.concat(partes);
  }

  it('designa um e-mail novo, com motivo e comprovante; o designado se cadastra e assume', async () => {
    const { adm, empresaId, emailMaster } = await t.empresaComMaster();
    const novo = emailAleatorio('novo-master');
    const enviar = (corpo: Buffer) =>
      t.app.inject({
        method: 'POST',
        url: `/api/plataforma/empresas/${empresaId}/bastao`,
        headers: {
          cookie: adm.cookie,
          'x-vinicycle': '1',
          'content-type': 'multipart/form-data; boundary=x',
        },
        payload: corpo,
      });
    const campos = { email: novo, perfilAnteriorId: '', motivo: 'Master desligado da empresa.' };
    expect((await enviar(formulario(campos, false))).statusCode).toBe(422);
    const r = await enviar(formulario(campos));
    expect(r.statusCode).toBe(200);
    const trocaId = JSON.parse(r.body).id as string;

    const [anexo] = await t.dbDono
      .select()
      .from(schema.anexo)
      .where(and(eq(schema.anexo.entidade, 'troca_master'), eq(schema.anexo.registroId, trocaId)));
    expect(anexo).toMatchObject({ categoria: 'comprovante', nomeOriginal: 'pedido.pdf' });

    // O Master anterior é avisado.
    const link = await t.ultimoLink(novo);
    expect(
      t.correio.enviados.some((m) => m.para === emailMaster && m.assunto.includes('pelo suporte')),
    ).toBe(true);

    const designado = t.cliente();
    const info = await designado.get(`/api/bastao/${token(link)}`);
    expect(info.corpo).toMatchObject({ usuarioExiste: false, quem: null });
    const semDados = await designado.post(`/api/bastao/${token(link)}/aceitar`, { senha: SENHA });
    expect(semDados.corpo.codigo).toBe('ficha');
    const aceite = await designado.post(`/api/bastao/${token(link)}/aceitar`, {
      ficha: { tipoPessoa: 'fisica', nome: 'Nova Master' },
      senha: SENHA,
      aceiteTermos: true,
    });
    expect(aceite.status).toBe(200);
    const lista = (await designado.get('/api/usuarios?situacao=todos')).corpo.itens as Array<{
      email: string;
      eMaster: boolean;
      ativo: boolean;
    }>;
    expect(lista.find((u) => u.email === novo)).toMatchObject({ eMaster: true, ativo: true });
    // Perfil anterior vazio: o acesso do Master anterior é inativado.
    expect(lista.find((u) => u.email === emailMaster)).toMatchObject({
      eMaster: false,
      ativo: false,
    });
  });
});

describe('troca de e-mail (P10)', () => {
  it('confirma no e-mail novo, sem colisão, e avisa o endereço antigo', async () => {
    const { master, emailMaster } = await t.empresaComMaster();
    const outro = await t.empresaComMaster();
    const novo = emailAleatorio('novo');

    expect((await master.post('/api/eu/email', { email: novo, senha: 'errada' })).status).toBe(400);
    const colisao = await master.post('/api/eu/email', { email: outro.emailMaster, senha: SENHA });
    expect(colisao.corpo.codigo).toBe('email_em_uso');

    expect((await master.post('/api/eu/email', { email: novo, senha: SENHA })).status).toBe(200);
    // Até a confirmação, nada muda.
    expect((await master.get('/api/eu')).corpo.email).toBe(emailMaster);
    const link = await t.ultimoLink(novo);
    const confirmar = await t.cliente().post('/api/eu/email/confirmar', {
      token: link.split('token=')[1],
    });
    expect(confirmar.status).toBe(200);
    expect((await master.get('/api/eu')).corpo.email).toBe(novo);
    await t.ultimoLink(novo).catch(() => null); // processa a fila de e-mails
    expect(
      t.correio.enviados.some((m) => m.para === emailMaster && m.assunto.includes('foi alterado')),
    ).toBe(true);

    // Entra com o e-mail novo; o antigo não serve mais.
    expect((await t.cliente().post('/api/auth/entrar', { email: novo, senha: SENHA })).status).toBe(
      200,
    );
    expect(
      (await t.cliente().post('/api/auth/entrar', { email: emailMaster, senha: SENHA })).status,
    ).toBe(401);
    // Link usado não vale de novo.
    expect(
      (await t.cliente().post('/api/eu/email/confirmar', { token: link.split('token=')[1] }))
        .status,
    ).toBe(422);
  });
});
