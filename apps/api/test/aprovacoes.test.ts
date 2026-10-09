// Aprovações (04, roteiro do ciclo 8, bloco 2): com o parâmetro ligado, o estorno e a reabertura
// viram pedido; quem aprova faz a ação na hora; recusa com motivo; ação que não pode mais ser feita
// fica "não feita"; quem pediu não aprova o próprio pedido, exceto o Master.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { montar } from './apoio';
import { cantina } from './cantina';

let t: Awaited<ReturnType<typeof montar>>;
beforeAll(async () => {
  t = await montar();
});
afterAll(async () => {
  await t.fechar();
});

describe('aprovações', () => {
  it('estorno e reabertura pela lista de pendências', async () => {
    const c = await cantina(t);
    const m = c.master;
    await m.put('/api/cantina/rendimentos', {
      itens: [{ variedadeId: null, litrosPorKg: '0.7000' }],
    });
    const t1 = await c.recipiente('T1', '5000.00');
    const t2 = await c.recipiente('T2', '5000.00');
    const t3 = await c.recipiente('T3', '5000.00');
    const [a, b] = await c.romaneio([
      [c.malbec, '1000'],
      [c.cabernet, '1000'],
    ]);
    const desengace = async (itemId: string, recipienteId: string, lote: string) =>
      (
        await m.post('/api/operacoes/desengace', {
          executadoEm: '2026-02-11T10:00:00-03:00',
          projetoId: c.projeto,
          consumos: [{ itemId, kg: '1000' }],
          destinos: [{ recipienteId, lote: { novo: lote } }],
        })
      ).corpo.operacaoId as string;
    const op1 = await desengace(a!, t1, 'A');
    const op2 = await desengace(b!, t3, 'B');

    expect(
      (
        await m.put('/api/parametros/aprovacoes', {
          inventario: true,
          estorno: true,
          reabertura: true,
          retificacao: true,
        })
      ).status,
    ).toBe(200);
    const entrar = async (perfil: string) => {
      const u = (await t.convidar(m, perfil, [c.estab])).cliente;
      await u.post('/api/auth/contexto', { estabelecimentoId: c.estab });
      return u;
    };
    // Aprovar não vem em nenhum perfil: o Master dá ao RT (ponto 21).
    const perfis = (await m.get('/api/perfis')).corpo as Array<{ id: string; nome: string }>;
    const perfilRt = perfis.find((p) => p.nome === 'Responsável Técnico')!.id;
    const grade = (await m.get(`/api/perfis/${perfilRt}`)).corpo;
    expect(grade.permissoes).not.toContain('gestao.aprovacoes:aprovar');
    expect(
      (
        await m.put(`/api/perfis/${perfilRt}/grade`, {
          versao: grade.versao,
          permissoes: [...grade.permissoes, 'gestao.aprovacoes:aprovar'].map((x: string) => {
            const [funcionalidade, acao] = x.split(':');
            return { funcionalidade, acao };
          }),
        })
      ).status,
    ).toBe(200);
    const enologo = await entrar('Enólogo');
    const rt = await entrar('Responsável Técnico');
    const situacao = async (id: string) => (await m.get(`/api/operacoes/${id}`)).corpo.situacao;

    // O enólogo pede o estorno: a operação continua confirmada.
    const pedido = await enologo.post(`/api/operacoes/${op1}/estorno`, { motivo: 'Lote errado' });
    expect(pedido.corpo).toMatchObject({ aguardandoAprovacao: true });
    expect(await situacao(op1)).toBe('confirmada');
    expect(
      (await enologo.post(`/api/operacoes/${op1}/estorno`, { motivo: 'De novo' })).corpo.codigo,
    ).toBe('pendente');
    const minhas = (await enologo.get('/api/aprovacoes')).corpo;
    expect(minhas).toMatchObject({
      podeAprovar: false,
      itens: [{ meu: true, podeDecidir: false }],
    });
    expect(
      (await enologo.post(`/api/aprovacoes/${pedido.corpo.solicitacaoId}/aprovar`)).status,
    ).toBe(403);

    // Quem aprova vê o pedido e marca: a ação é feita na hora.
    const pend = (await rt.get('/api/aprovacoes')).corpo;
    expect(pend.itens).toMatchObject([
      { tipo: 'estorno', nomeTipo: 'Estorno de operação', podeDecidir: true },
    ]);
    expect((await rt.get('/api/aprovacoes/resumo')).corpo).toEqual({ pendentes: 1 });
    expect((await rt.post(`/api/aprovacoes/${pend.itens[0].id}/aprovar`)).corpo).toEqual({
      situacao: 'aprovada',
      erro: null,
    });
    expect(await situacao(op1)).toBe('estornada');
    expect((await rt.get('/api/aprovacoes')).corpo.itens).toEqual([]);

    // Algo mudou depois do pedido (trasfega posterior): aprovado, mas não feito; alerta até o visto.
    const p2 = (await enologo.post(`/api/operacoes/${op2}/estorno`, { motivo: 'Errado' })).corpo;
    const trasfega = await m.post('/api/operacoes/trasfega', {
      executadoEm: '2026-02-12T10:00:00-03:00',
      origens: [{ recipienteId: t3, esvaziar: true, perda: null }],
      destinos: [{ recipienteId: t2, litros: '700.00' }],
    });
    expect(trasfega.status).toBe(200);
    const r2 = (await rt.post(`/api/aprovacoes/${p2.solicitacaoId}/aprovar`)).corpo;
    expect(r2.situacao).toBe('falhou');
    expect(r2.erro).toBeTruthy();
    expect(await situacao(op2)).toBe('confirmada');
    const alertas = async (u: typeof m) =>
      (
        (await u.get('/api/alertas?atualizar=sim')).corpo as Array<{
          tipo: string;
          mensagem: string;
        }>
      )
        .filter((x) => x.tipo === 'aprovacao')
        .map((x) => x.mensagem);
    expect((await alertas(enologo))[0]).toContain('Pedido aprovado, mas não foi feito');
    await enologo.post(`/api/aprovacoes/${p2.solicitacaoId}/visto`);
    expect(await alertas(enologo)).toEqual([]);

    // Recusa com motivo.
    const p3 = (
      await enologo.post(`/api/operacoes/${trasfega.corpo.operacaoId}/estorno`, { motivo: 'Teste' })
    ).corpo;
    expect((await alertas(rt))[0]).toBe('1 pedido esperando aprovação.');
    expect((await alertas(enologo)).length).toBe(0);
    expect((await rt.post(`/api/aprovacoes/${p3.solicitacaoId}/recusar`, {})).status).toBe(400);
    expect(
      (await rt.post(`/api/aprovacoes/${p3.solicitacaoId}/recusar`, { motivo: 'Está certo' }))
        .status,
    ).toBe(200);
    expect(await situacao(trasfega.corpo.operacaoId)).toBe('confirmada');
    expect((await alertas(enologo))[0]).toContain('Motivo: Está certo');

    // Reabertura: o RT pede e não aprova o próprio pedido; o Master aprova.
    const hoje = new Date();
    const ano = hoje.getUTCMonth() === 0 ? hoje.getUTCFullYear() - 1 : hoje.getUTCFullYear();
    const mes = hoje.getUTCMonth() === 0 ? 12 : hoje.getUTCMonth();
    const conf = (await m.get(`/api/fechamentos/${ano}/${mes}`)).corpo.conferencia as Array<{
      codigo: string;
      n: number;
    }>;
    expect(
      (
        await m.post(`/api/fechamentos/${ano}/${mes}/fechar`, {
          cientes: conf.filter((x) => x.n > 0).map((x) => `fechamento:${x.codigo}`),
        })
      ).status,
    ).toBe(200);
    const p4 = (await rt.post(`/api/fechamentos/${ano}/${mes}/reabrir`, { motivo: 'Faltou nota' }))
      .corpo;
    expect(p4.aguardandoAprovacao).toBe(true);
    expect((await rt.post(`/api/aprovacoes/${p4.solicitacaoId}/aprovar`)).corpo.codigo).toBe(
      'proprio',
    );
    expect((await m.post(`/api/aprovacoes/${p4.solicitacaoId}/aprovar`)).corpo.situacao).toBe(
      'aprovada',
    );
    expect((await m.get(`/api/fechamentos/${ano}/${mes}`)).corpo).toMatchObject({
      situacao: 'reaberto',
      motivoReabertura: 'Faltou nota',
    });

    // O Master também pede, e pode aprovar o próprio pedido (empresa de um usuário só).
    const p5 = (
      await m.post(`/api/operacoes/${trasfega.corpo.operacaoId}/estorno`, { motivo: 'Agora sim' })
    ).corpo;
    expect((await m.post(`/api/aprovacoes/${p5.solicitacaoId}/aprovar`)).corpo.situacao).toBe(
      'aprovada',
    );
    expect(await situacao(trasfega.corpo.operacaoId)).toBe('estornada');
    const hist = (await m.get('/api/aprovacoes?escopo=historico')).corpo.itens as Array<{
      situacao: string;
    }>;
    expect(hist.map((x) => x.situacao)).toEqual([
      'aprovada',
      'aprovada',
      'recusada',
      'falhou',
      'aprovada',
    ]);
  });
});
