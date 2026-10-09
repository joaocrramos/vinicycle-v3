// Documentos com vencimento, versões e etiquetas (gestao.md, Documentos).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { montar } from './apoio';

let t: Awaited<ReturnType<typeof montar>>;
beforeAll(async () => {
  t = await montar();
});
afterAll(async () => {
  await t.fechar();
});

// Data no fuso do processo, o mesmo do banco local e do da verificação (o "current_date" do banco).
const hoje = new Date();
const data = (dias: number) =>
  new Intl.DateTimeFormat('en-CA').format(new Date(hoje.getTime() + dias * 86400_000));

async function empresa() {
  const r = await t.empresaComMaster();
  const estab = await t.criarEstabelecimento(r.master);
  await r.master.post('/api/auth/contexto', { estabelecimentoId: estab });
  const tipos = await r.master.get('/api/catalogos/tipo_documento?tamanho=100');
  const tipo = (codigoNome: string) =>
    tipos.corpo.itens.find((i: { nome: string }) => i.nome === codigoNome).id as string;
  return { ...r, estab, tipo };
}

describe('documentos', () => {
  it('vencimento: em dia, vencendo (60 dias) e vencido; resumo para o Início', async () => {
    const { master, tipo } = await empresa();
    const criar = (titulo: string, vencimento: string | null) =>
      master.post('/api/documentos', {
        tipoDocumentoId: tipo('AVCB (Corpo de Bombeiros)'),
        titulo,
        primeiraVersao: { numero: '123', emissao: data(-300), vencimento },
      });
    expect((await criar('AVCB vencido', data(-1))).status).toBe(200);
    await criar('AVCB vencendo', data(30));
    await criar('AVCB em dia', data(200));
    const lista = await master.get('/api/documentos');
    expect(
      lista.corpo.itens.map((d: { titulo: string; situacaoVencimento: string }) => [
        d.titulo,
        d.situacaoVencimento,
      ]),
    ).toEqual([
      ['AVCB vencido', 'vencido'],
      ['AVCB vencendo', 'vencendo'],
      ['AVCB em dia', 'em_dia'],
    ]);
    expect((await master.get('/api/documentos?vencimento=vencido')).corpo.total).toBe(1);
    expect((await master.get('/api/documentos/resumo')).corpo).toEqual({
      vencidos: 1,
      vencendo: 1,
    });
    const ruim = await master.post('/api/documentos', {
      tipoDocumentoId: tipo('AVCB (Corpo de Bombeiros)'),
      titulo: 'Datas trocadas',
      primeiraVersao: { emissao: data(0), vencimento: data(-10) },
    });
    expect(ruim.status).toBe(400);
  });

  it('renovar cria versão nova; a anterior vira substituída e só a vigente é corrigida', async () => {
    const { master, tipo } = await empresa();
    const r = await master.post('/api/documentos', {
      tipoDocumentoId: tipo('Licença ambiental'),
      titulo: 'Licença de operação',
      orgaoEmissor: 'INEMA',
      primeiraVersao: { numero: 'LO-1', vencimento: data(-5) },
    });
    const nova = await master.post(`/api/documentos/${r.corpo.id}/versoes`, {
      numero: 'LO-2',
      emissao: data(0),
      vencimento: data(365),
    });
    expect(nova.status).toBe(200);
    const d = await master.get(`/api/documentos/${r.corpo.id}`);
    expect(
      d.corpo.versoes.map((v: { numero: string; situacao: string }) => [v.numero, v.situacao]),
    ).toEqual([
      ['LO-2', 'vigente'],
      ['LO-1', 'substituida'],
    ]);
    const antiga = d.corpo.versoes[1];
    expect(
      (await master.put(`/api/documentos/${r.corpo.id}/versoes/${antiga.id}`, { numero: 'X' }))
        .corpo.codigo,
    ).toBe('versao_substituida');
    expect(
      (
        await master.put(`/api/documentos/${r.corpo.id}/versoes/${nova.corpo.id}`, {
          numero: 'LO-2A',
          vencimento: data(365),
        })
      ).status,
    ).toBe(200);
    const lista = await master.get('/api/documentos');
    expect(lista.corpo.itens[0]).toMatchObject({ numero: 'LO-2A', situacaoVencimento: 'em_dia' });
    const hist = await master.get(`/api/historico/documento/${r.corpo.id}`);
    expect(hist.corpo.map((h: { acao: string }) => h.acao)).toEqual([
      'corrigir_versao',
      'renovar',
      'criar',
    ]);
  });

  it('documento de um estabelecimento não aparece no outro; o da empresa toda aparece em todos', async () => {
    const { master, estab, tipo } = await empresa();
    const outro = await t.criarEstabelecimento(master, 'Filial');
    await master.post('/api/documentos', {
      tipoDocumentoId: tipo('Alvará de funcionamento'),
      titulo: 'Alvará matriz',
      estabelecimentoId: estab,
      primeiraVersao: {},
    });
    await master.post('/api/documentos', {
      tipoDocumentoId: tipo('Contrato'),
      titulo: 'Contrato geral',
      primeiraVersao: {},
    });
    expect((await master.get('/api/documentos')).corpo.total).toBe(2);
    await master.post('/api/auth/contexto', { estabelecimentoId: outro });
    expect(
      (await master.get('/api/documentos')).corpo.itens.map((d: { titulo: string }) => d.titulo),
    ).toEqual(['Contrato geral']);
  });

  it('etiquetas e responsável; anexo por versão', async () => {
    const { master, tipo } = await empresa();
    const etq = await master.post('/api/etiquetas', { nome: 'MAPA', cor: '#336699' });
    expect((await master.post('/api/etiquetas', { nome: 'mapa' })).corpo.codigo).toBe(
      'nome_duplicado',
    );
    const resp = await master.get('/api/documentos/responsaveis');
    expect(resp.corpo).toHaveLength(1);
    const r = await master.post('/api/documentos', {
      tipoDocumentoId: tipo('Registro MAPA do estabelecimento'),
      titulo: 'Registro do estabelecimento',
      responsavelId: resp.corpo[0].id,
      etiquetas: [etq.corpo.id],
      primeiraVersao: { numero: 'BA 000123-4', vencimento: data(700) },
    });
    expect(
      (await master.get(`/api/documentos?etiqueta=${etq.corpo.id}`)).corpo.itens[0],
    ).toMatchObject({
      titulo: 'Registro do estabelecimento',
      responsavel: 'Maria Master',
    });
    const d = await master.get(`/api/documentos/${r.corpo.id}`);
    const versaoId = d.corpo.versoes[0].id;
    const corpo = Buffer.concat([
      Buffer.from(
        '--x\r\nContent-Disposition: form-data; name="entidade"\r\n\r\ndocumento_versao\r\n',
      ),
      Buffer.from(
        `--x\r\nContent-Disposition: form-data; name="registroId"\r\n\r\n${versaoId}\r\n`,
      ),
      Buffer.from('--x\r\nContent-Disposition: form-data; name="categoria"\r\n\r\ncertificado\r\n'),
      Buffer.from(
        '--x\r\nContent-Disposition: form-data; name="arquivo"; filename="registro.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4\r\n--x--\r\n',
      ),
    ]);
    const up = await t.app.inject({
      method: 'POST',
      url: '/api/anexos',
      headers: {
        cookie: master.cookie,
        'x-vinicycle': '1',
        'content-type': 'multipart/form-data; boundary=x',
      },
      payload: corpo,
    });
    expect(up.statusCode).toBe(200);
    expect(
      (await master.get(`/api/anexos?entidade=documento_versao&registroId=${versaoId}`)).corpo,
    ).toHaveLength(1);
  });
});
