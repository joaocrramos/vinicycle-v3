// WhatsApp e SMS, franquia por pacote, modelos editáveis e Envios (ciclo 12, bloco 2).
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/db/schema';
import { definirBuscarMensagens, processarFilaMensagens } from '../src/modulos/mensagens';
import { hoje } from '../src/modulos/planos';
import { processarRegua } from '../src/modulos/regua';
import { processarFila } from '../src/nucleo/email';
import { montar } from './apoio';
import { somarDias } from '@vinicycle/shared';

let t: Awaited<ReturnType<typeof montar>>;
const silencio = { error: () => {} };
const url = 'http://localhost:5173';
const meta: Array<{
  url: string;
  corpo: {
    to: string;
    template: { name: string; components: Array<{ parameters: Array<{ text: string }> }> };
  };
}> = [];

beforeAll(async () => {
  t = await montar();
  definirBuscarMensagens(async (u, init) => {
    meta.push({ url: u, corpo: JSON.parse(String(init?.body ?? '{}')) });
    return new Response(JSON.stringify({ messages: [{ id: `wamid.${meta.length}` }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
});
afterAll(async () => {
  await t.fechar();
});

async function telefoneDoMaster(email: string, valor: string) {
  const [u] = await t.dbDono.select().from(schema.usuario).where(eq(schema.usuario.email, email));
  await t.dbDono
    .insert(schema.fichaContato)
    .values({ fichaId: u!.fichaId, tipo: 'telefone', valor, whatsapp: true, principal: true });
}

async function mensagensDaEmpresa(empresaId: string, canal: 'whatsapp' | 'sms') {
  return t.dbDono
    .select()
    .from(schema.envio)
    .where(and(eq(schema.envio.empresaId, empresaId), eq(schema.envio.canal, canal)));
}

async function emails(para: string) {
  while ((await processarFila(t.db, t.correio, t.config.EMAIL_REMETENTE, silencio)) > 0);
  return t.correio.enviados.filter((m) => m.para === para).map((m) => m.assunto);
}

describe('WhatsApp e franquia', () => {
  let integracaoId: string;
  beforeAll(async () => {
    const { cliente: adm } = await t.admin();
    const r = await adm.post('/api/plataforma/integracoes/whatsapp', {
      nome: 'WhatsApp ViniCycle',
      adaptador: 'meta',
      numeroId: '123456789012345',
      modelo: 'aviso_vinicycle',
      idioma: 'pt_BR',
      chave: 'token-meta',
      ativo: true,
    });
    if (r.status !== 200) throw new Error(JSON.stringify(r.corpo));
    integracaoId = r.corpo.id;
  });
  afterAll(async () => {
    await t.dbDono
      .update(schema.integracao)
      .set({ ativo: false })
      .where(eq(schema.integracao.id, integracaoId));
  });

  it('sem pacote não sai WhatsApp; com pacote sai pelo modelo aprovado; esgotado, avisa o Master', async () => {
    const { master, adm, empresaId, emailMaster } = await t.empresaComMaster({ inicio: hoje() });
    await telefoneDoMaster(emailMaster, '(74) 99999-8888');
    expect(
      (await master.put('/api/eu/preferencias', { canais: { whatsapp: true, sms: false } })).status,
    ).toBe(200);

    // Sem pacote: o aviso de vencimento sai só por e-mail.
    await processarRegua(t.db, url, silencio, somarDias(hoje(), -3));
    expect(await mensagensDaEmpresa(empresaId, 'whatsapp')).toHaveLength(0);

    // Pacote de 1 mensagem por mês.
    const pacote = await adm.post('/api/plataforma/adicionais', {
      nome: `WhatsApp ${Math.random().toString(36).slice(2, 6)}`,
      tipo: 'mensagens_whatsapp',
      quantidadePorUnidade: 1,
      precos: [{ periodicidade: 'mensal', valor: '10.00' }],
      precosDesde: '2026-01-01',
    });
    await adm.post(`/api/plataforma/empresas/${empresaId}/assinatura/adicionais`, {
      adicionalId: pacote.corpo.id,
      quantidade: 1,
    });
    const a = (await master.get('/api/assinatura')).corpo;
    expect(a.limites.mensagensWhatsapp).toBe(1);

    await processarRegua(t.db, url, silencio, hoje()); // vence hoje
    const fila = await mensagensDaEmpresa(empresaId, 'whatsapp');
    expect(fila).toHaveLength(1);
    expect(fila[0]).toMatchObject({ destinatario: '5574999998888', modelo: 'cobranca_vencimento' });
    for (
      let i = 0;
      i < 20 && (await mensagensDaEmpresa(empresaId, 'whatsapp'))[0]!.situacao === 'pendente';
      i++
    ) {
      await processarFilaMensagens(t.db, t.config.CHAVE_CIFRA, silencio);
    }
    const enviada = meta.find((m) => m.corpo.to === '5574999998888')!;
    expect(enviada.url).toContain('/123456789012345/messages');
    expect(enviada.corpo.template.name).toBe('aviso_vinicycle');
    expect(enviada.corpo.template.components[0]!.parameters[0]!.text).toContain('vence hoje');

    // A franquia acabou: o próximo aviso não sai por WhatsApp, e o Master é avisado por e-mail.
    await processarRegua(t.db, url, silencio, somarDias(hoje(), 1));
    expect(await mensagensDaEmpresa(empresaId, 'whatsapp')).toHaveLength(1);
    expect((await emails(emailMaster)).some((x) => x.includes('franquia de WhatsApp'))).toBe(true);
    expect((await master.get('/api/assinatura')).corpo.uso.mensagensWhatsapp).toBe(1);
  });

  it('resumo agendado por WhatsApp: sem telefone, vai por e-mail com o aviso', async () => {
    const { master } = await t.empresaComMaster();
    const estab = await t.criarEstabelecimento(master);
    const r = await master.post('/api/relatorios-agendados', {
      relatorio: 'alertas',
      frequencia: 'semanal',
      estabelecimentoId: estab,
      canal: 'whatsapp',
    });
    expect(r.status).toBe(200);
    const agora = await master.post(`/api/relatorios-agendados/${r.corpo.id}/enviar`, {});
    expect(agora.corpo.aviso).toContain('Sem telefone com WhatsApp');
    const lista = (await master.get('/api/relatorios-agendados')).corpo.itens;
    expect(lista[0].canal).toBe('whatsapp');
  });
});

describe('modelos de mensagem e Envios', () => {
  it('a versão editada troca o texto; voltar ao padrão desfaz', async () => {
    const { cliente: adm } = await t.admin();
    const modelos = (await adm.get('/api/plataforma/modelos')).corpo;
    const venc = modelos.find((m: { codigo: string }) => m.codigo === 'cobranca_vencimento');
    expect(venc.padrao.assunto).toContain('{{numero}}');
    expect(venc.padrao.corpo).toContain('{{vencimento}}');
    const v = await adm.post('/api/plataforma/modelos/cobranca_vencimento', {
      assunto: 'Lembrete: fatura {{numero}} da {{empresa}}',
      corpo: 'Olá! A fatura {{numero}}, de {{valor}}, vence em {{vencimento}}.\n\nObrigado.',
    });
    expect(v.corpo.versao).toBeGreaterThanOrEqual(1);

    const { emailMaster, nome } = await t.empresaComMaster({ inicio: hoje() });
    await processarRegua(t.db, url, silencio, somarDias(hoje(), -3));
    const assuntos = await emails(emailMaster);
    expect(assuntos.some((a) => a.startsWith('Lembrete: fatura') && a.includes(nome))).toBe(true);
    const m = t.correio.enviados.find(
      (x) => x.para === emailMaster && x.assunto.startsWith('Lembrete'),
    )!;
    expect(m.texto).toContain('Obrigado.');
    expect(m.texto).toContain('/config/assinatura');

    await adm.post('/api/plataforma/modelos/cobranca_vencimento/padrao', {});
    const depois = (await adm.get('/api/plataforma/modelos')).corpo.find(
      (x: { codigo: string }) => x.codigo === 'cobranca_vencimento',
    );
    expect(depois.versoes.every((x: { ativa: boolean }) => !x.ativa)).toBe(true);
  });

  it('Envios lista a fila e reenvia o que falhou', async () => {
    const { cliente: adm } = await t.admin();
    const lista = (await adm.get('/api/plataforma/envios?canal=email&tamanho=10')).corpo;
    expect(lista.itens.length).toBeGreaterThan(0);
    const [falho] = await t.dbDono
      .update(schema.envio)
      .set({ situacao: 'falhou', ultimoErro: 'Teste' })
      .where(eq(schema.envio.id, lista.itens[0].id))
      .returning();
    const d = (await adm.get(`/api/plataforma/envios/${falho!.id}`)).corpo;
    expect(d).toMatchObject({ situacao: 'falhou', ultimoErro: 'Teste' });
    expect((await adm.post(`/api/plataforma/envios/${falho!.id}/reenviar`, {})).status).toBe(200);
    expect((await adm.post(`/api/plataforma/envios/${falho!.id}/reenviar`, {})).status).toBe(422);
  });
});
