// Contrato de terceirização (04, roteiro do ciclo 10, bloco 1; IN MAPA 72/2018, arts. 14, 25, 27,
// 28 e 30): papel da contraparte, dono das marcas, atividades, registro do produto, formas do texto
// do rótulo, sugestão e "ciente" na recepção e no granel, pendências legais e alertas.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fichaPj, montar } from './apoio';
import { cantina } from './cantina';

let t: Awaited<ReturnType<typeof montar>>;
beforeAll(async () => {
  t = await montar();
});
afterAll(async () => {
  await t.fechar();
});

const emDias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe('contrato de terceirização', () => {
  it('cadastro, rótulo, recepção, granel, pendências e alertas', async () => {
    const c = await cantina(t);
    const m = c.master;
    const ok = (r: { status: number; corpo: unknown }) => {
      expect(r.status, JSON.stringify(r.corpo)).toBe(200);
      return r.corpo as Record<string, string>;
    };
    const pessoa = async (nome: string, papeis: string[]) =>
      ok(await m.post('/api/pessoas', { ficha: fichaPj(nome), papeis })).id!;
    const cliente = await pessoa('Vinhos do Vale Ltda', ['cliente_vinificacao']);
    const outroCliente = await pessoa('Outro Cliente Ltda', ['cliente_vinificacao']);
    const cantinaX = await pessoa('Cantina X Ltda', ['cantina_prestadora']);
    const marcaCliente = ok(await m.post('/api/marcas', { nome: 'Vale', donoId: cliente })).id!;
    const marcaPropria = ok(await m.post('/api/marcas', { nome: 'Sertão' })).id!;
    const ref = (await m.get('/api/referencia')).corpo;
    const classe = ref.classesProduto.find((x: { codigo: string }) => x.codigo === 'vinho_fino').id;
    const produto = ok(
      await m.post('/api/produtos', {
        nome: 'Vale Tinto',
        marcaId: marcaCliente,
        classeProdutoId: classe,
        cor: 'tinto',
        titularId: cliente,
      }),
    ).id!;

    const base = {
      sentido: 'prestamos',
      atividades: ['elaboracao', 'envase'],
      contraparteId: cliente,
      estabelecimentoId: c.estab,
      registroMapaContraparte: 'BA-000123',
      registroMapaContraparteValidade: emDias(-1),
      registroProduto: 'cantina',
      vigenciaInicio: '2026-01-01',
      vigenciaFim: emDias(20),
      precos: [
        { descricao: 'Elaboração', valor: '4.50', unidade: 'por litro' },
        { descricao: 'Armazenagem', valor: '300.00', unidade: 'por mês' },
      ],
      perdaToleradaTipo: 'percentual',
      perdaToleradaValor: '5',
      pagamentoDinheiro: true,
      pagamentoProdutoValor: '10',
      pagamentoProdutoUnidade: 'percentual',
      prefixoLote: 'vc',
      marcas: [marcaCliente],
      produtos: [produto],
    };

    // Papel da contraparte, dono das marcas, atividades e pagamento.
    const semPapel = await m.post('/api/contratos-terceirizacao', {
      ...base,
      contraparteId: cantinaX,
    });
    expect(semPapel.corpo.mensagem).toMatch(/cliente de vinificação/);
    const marcaErrada = await m.post('/api/contratos-terceirizacao', {
      ...base,
      marcas: [marcaPropria],
    });
    expect(marcaErrada.corpo.mensagem).toMatch(/da contraparte: Sertão/);
    const semAtividade = await m.post('/api/contratos-terceirizacao', { ...base, atividades: [] });
    expect(semAtividade.corpo.codigo).toBe('validacao');
    const semPagamento = await m.post('/api/contratos-terceirizacao', {
      ...base,
      pagamentoDinheiro: false,
      pagamentoProdutoValor: null,
      pagamentoProdutoUnidade: null,
    });
    expect(semPagamento.corpo.codigo).toBe('validacao');
    const contratada = await m.post('/api/contratos-terceirizacao', {
      ...base,
      sentido: 'contratamos',
      contraparteId: cantinaX,
      marcas: [marcaCliente],
      produtos: [],
    });
    expect(contratada.corpo.mensagem).toMatch(/da própria empresa/);

    const id = ok(await m.post('/api/contratos-terceirizacao', base)).id!;
    let ficha = (await m.get(`/api/contratos-terceirizacao/${id}`)).corpo;
    expect(ficha.contraparte).toBe('Vinhos do Vale Ltda');
    expect(ficha.situacaoVigencia).toBe('vencendo');
    expect(ficha.prefixoLote).toBe('VC');
    expect(ficha.atividades).toEqual(['elaboracao', 'envase']);
    expect(ficha.precos.map((x: { descricao: string }) => x.descricao)).toEqual([
      'Elaboração',
      'Armazenagem',
    ]);
    expect(ficha.nomesMarcas.map((x: { nome: string }) => x.nome)).toEqual(['Vale']);
    expect(ficha.textoFinal).toMatch(
      /^Produzido por .+, CNPJ \d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}, para Vinhos do Vale Ltda, CNPJ /,
    );
    // Prestamos: falta a via do contrato; o registro do produto é da cantina, então sem certificado.
    expect(ficha.pendencias.map((x: { codigo: string }) => x.codigo)).toEqual(['sem_via_contrato']);
    // Na ficha do produto, o mesmo texto.
    const p = (await m.get(`/api/produtos/${produto}`)).corpo;
    expect(p.terceirizacao).toMatchObject({ contratoId: id, texto: ficha.textoFinal });

    // Registro do produto com o contratante: a forma "sob responsabilidade de" usa a unidade central
    // (o cliente, com o endereço) e passa a faltar o certificado do produto.
    ok(
      await m.put(`/api/contratos-terceirizacao/${id}`, {
        ...base,
        registroProduto: 'contratante',
        formaTexto: 'responsabilidade_produzido',
        versao: ficha.versao,
      }),
    );
    ficha = (await m.get(`/api/contratos-terceirizacao/${id}`)).corpo;
    expect(ficha.textoFinal).toBe(
      'Produzido e envasilhado sob responsabilidade de Vinhos do Vale Ltda, Rodovia BA-210, km 5, Juazeiro/BA',
    );
    expect(ficha.pendencias.map((x: { codigo: string }) => x.codigo)).toEqual([
      'sem_via_contrato',
      'sem_certificado_produto',
    ]);
    // Texto editado prevalece sobre o montado.
    ok(
      await m.put(`/api/contratos-terceirizacao/${id}`, {
        ...base,
        registroProduto: 'contratante',
        formaTexto: 'responsabilidade_produzido',
        textoRotulo: 'Elaborado por nós para o Vale',
        versao: ficha.versao,
      }),
    );
    ficha = (await m.get(`/api/contratos-terceirizacao/${id}`)).corpo;
    expect(ficha.textoFinal).toBe('Elaborado por nós para o Vale');
    expect(ficha.textoMontado).toMatch(/^Produzido e envasilhado sob responsabilidade/);

    // Contratamos com o registro do produto conosco: comunicação no SIPEAGRO e lembrete quando muda.
    const baseX = {
      ...base,
      sentido: 'contratamos',
      contraparteId: cantinaX,
      registroProduto: 'contratante',
      registroMapaContraparteValidade: null,
      vigenciaFim: null,
      marcas: [marcaPropria],
      produtos: [],
      pagamentoProdutoValor: '120',
      pagamentoProdutoUnidade: 'garrafa',
    };
    const idX = ok(await m.post('/api/contratos-terceirizacao', baseX)).id!;
    let fichaX = (await m.get(`/api/contratos-terceirizacao/${idX}`)).corpo;
    expect(fichaX.textoFinal).toMatch(/^Produzido por Cantina X Ltda, CNPJ .+, para /);
    expect(fichaX.situacaoVigencia).toBe('vigente');
    expect(fichaX.pendencias.map((x: { codigo: string }) => x.codigo)).toEqual([
      'sem_comunicacao_sipeagro',
    ]);
    const salvarX = async (extra: Record<string, unknown>) => {
      ok(
        await m.put(`/api/contratos-terceirizacao/${idX}`, {
          ...baseX,
          ...extra,
          versao: fichaX.versao,
        }),
      );
      fichaX = (await m.get(`/api/contratos-terceirizacao/${idX}`)).corpo;
      return fichaX.pendencias.map((x: { codigo: string }) => x.codigo);
    };
    expect(
      await salvarX({ comunicadoSipeagroEm: '2026-03-01', protocoloSipeagro: 'SIP-1' }),
    ).toEqual([]);
    expect(
      await salvarX({
        atividades: ['envase'],
        comunicadoSipeagroEm: '2026-03-01',
        protocoloSipeagro: 'SIP-1',
      }),
    ).toEqual(['comunicacao_desatualizada']);
    expect(
      await salvarX({
        atividades: ['envase'],
        comunicadoSipeagroEm: '2026-03-10',
        protocoloSipeagro: 'SIP-2',
      }),
    ).toEqual([]);

    // Padronizador terceirizando a elaboração (art. 25, §6º).
    const padronizador = ok(
      await m.post('/api/estabelecimentos', {
        ficha: fichaPj('Padronizadora'),
        fuso: 'America/Bahia',
        atividadesMapa: ['padronizador'],
      }),
    ).id!;
    const idP = ok(
      await m.post('/api/contratos-terceirizacao', {
        ...baseX,
        estabelecimentoId: padronizador,
        comunicadoSipeagroEm: '2026-03-01',
      }),
    ).id!;
    expect(
      (await m.get(`/api/contratos-terceirizacao/${idP}`)).corpo.pendencias.map(
        (x: { codigo: string }) => x.codigo,
      ),
    ).toEqual(['padronizador_alem_envase']);
    ok(await m.post(`/api/contratos-terceirizacao/${idP}/inativar`, { motivo: 'Teste' }));

    const lista = (await m.get('/api/contratos-terceirizacao?sentido=prestamos')).corpo;
    expect(lista.itens.map((x: { id: string }) => x.id)).toEqual([id]);
    const vigentes = (
      await m.get(`/api/contratos-terceirizacao/vigentes?contraparteId=${cliente}&data=2026-02-10`)
    ).corpo;
    expect(vigentes.map((x: { id: string }) => x.id)).toEqual([id]);

    // Recepção: sem contrato com o dono da uva, "ciente"; com o contrato, nada.
    const romaneio = async (dono: string, contratoId: string | null) => {
      const r = ok(
        await m.post('/api/romaneios', {
          chegadaEm: '2026-02-10T08:00:00-03:00',
          projetoId: c.projeto,
          origem: 'vinhedo_proprio',
          donoUvaId: dono,
          contratoId,
          itens: [
            {
              variedadeId: c.malbec,
              dataColheita: '2026-02-10',
              brix: '23',
              pesagens: [
                { pesadoEm: '2026-02-10T08:00:00-03:00', brutoKg: '2000', taraKg: '1000' },
              ],
            },
          ],
        }),
      ).id!;
      const avisos = (await m.get(`/api/romaneios/${r}/previa`)).corpo.avisos as Array<{
        codigo: string;
      }>;
      return { r, avisos: avisos.map((a) => a.codigo).filter((x) => !x.startsWith('sivibe')) };
    };
    const comContrato = await romaneio(cliente, id);
    expect(comContrato.avisos).toEqual([]);
    expect((await m.get(`/api/romaneios/${comContrato.r}`)).corpo.contratoId).toBe(id);
    const semContrato = await romaneio(outroCliente, null);
    expect(semContrato.avisos).toEqual([`sem_contrato:${outroCliente}`]);
    const contratoDeOutro = await m.post('/api/romaneios', {
      chegadaEm: '2026-02-10T08:00:00-03:00',
      projetoId: c.projeto,
      origem: 'vinhedo_proprio',
      donoUvaId: outroCliente,
      contratoId: id,
      itens: [{ variedadeId: c.malbec, dataColheita: '2026-02-10', brix: '23' }],
    });
    expect(contratoDeOutro.corpo.mensagem).toMatch(/não é com o dono da uva/);

    // Com recepção ligada, a contraparte não muda.
    ficha = (await m.get(`/api/contratos-terceirizacao/${id}`)).corpo;
    const troca = await m.put(`/api/contratos-terceirizacao/${id}`, {
      ...base,
      contraparteId: outroCliente,
      marcas: [],
      produtos: [],
      versao: ficha.versao,
    });
    expect(troca.corpo.mensagem).toMatch(/a contraparte e o sentido não mudam/);

    // Entrada de granel de um titular sem contrato: "ciente".
    const t1 = await c.recipiente('T1', '5000.00');
    const previa = (
      await m.post('/api/operacoes/entrada_granel/previa', {
        executadoEm: new Date().toISOString(),
        tipoGranel: 'outra',
        projetoId: c.projeto,
        titularId: outroCliente,
        destinos: [{ recipienteId: t1, litros: '500.00', lote: { novo: 'A' } }],
      })
    ).corpo;
    expect(previa.avisos.map((a: { codigo: string }) => a.codigo)).toContain(
      `sem_contrato:${outroCliente}`,
    );

    // Alertas: contrato vence em 20 dias, registro da contraparte vencido, pendências legais.
    const alertas = (await m.get('/api/alertas?atualizar=sim')).corpo as Array<{
      tipo: string;
      mensagem: string;
      link: string;
    }>;
    const a = alertas.filter((x) => x.tipo === 'contrato').map((x) => x.mensagem);
    expect(a.some((x) => /Vinhos do Vale Ltda vence em/.test(x))).toBe(true);
    expect(a.some((x) => /Registro no MAPA de Vinhos do Vale Ltda venceu/.test(x))).toBe(true);
    expect(a.some((x) => /Anexe a via do contrato/.test(x))).toBe(true);
    expect(a.some((x) => /certificado de registro do produto/.test(x))).toBe(true);
    // Inativado (encerrado), os alertas dele somem.
    ok(await m.post(`/api/contratos-terceirizacao/${id}/inativar`, { motivo: 'Encerrado' }));
    const depois = (await m.get('/api/alertas?atualizar=sim')).corpo as Array<{ link: string }>;
    expect(depois.filter((x) => x.link === `/enotrace/contratos/${id}`)).toHaveLength(0);
  });
});
