// Pessoas com papéis (P2; gestao.md) e busca de CEP e CNPJ.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { consultasPublicas } from '../src/nucleo/consultas-publicas';
import { fichaPj, gerarCnpj, montar } from './apoio';

let t: Awaited<ReturnType<typeof montar>>;
beforeAll(async () => {
  t = await montar();
});
afterAll(async () => {
  await t.fechar();
});

async function empresa() {
  const r = await t.empresaComMaster();
  await t.criarEstabelecimento(r.master);
  return r;
}

describe('pessoas (P2)', () => {
  it('cadastro único com papéis e extensões; filtro por papel', async () => {
    const { master } = await empresa();
    const ficha = fichaPj('Enoquímica Ltda');
    const r = await master.post('/api/pessoas', {
      ficha,
      papeis: ['fornecedor', 'fabricante'],
      fornecedor: { categorias: ['insumos'] },
      fabricante: { marcas: ['Levedura Forte', 'levedura forte', 'Taninol'] },
      contatos: [
        {
          nome: 'Carla Vendas',
          cargo: 'Representante',
          emails: ['carla@enoquimica.com.br'],
          telefones: [],
        },
      ],
    });
    expect(r.status).toBe(200);
    const p = await master.get(`/api/pessoas/${r.corpo.id}`);
    expect(p.corpo.papeis.sort()).toEqual(['fabricante', 'fornecedor']);
    expect(p.corpo.fabricante.marcas).toEqual(['Levedura Forte', 'Taninol']);
    expect(p.corpo.contatos[0].nome).toBe('Carla Vendas');
    const fornecedores = await master.get('/api/pessoas?papel=fornecedor');
    expect(fornecedores.corpo.itens.map((i: { nome: string }) => i.nome)).toEqual([
      'Enoquímica Ltda',
    ]);
    expect((await master.get('/api/pessoas?papel=cliente')).corpo.total).toBe(0);
    const opcoes = await master.get('/api/pessoas/opcoes?papel=fabricante');
    expect(opcoes.corpo).toHaveLength(1);
  });

  it('documento obrigatório e único na empresa; outra empresa pode ter o mesmo', async () => {
    const a = await empresa();
    const b = await empresa();
    const ficha = fichaPj('Produtor Rural');
    expect(
      (
        await a.master.post('/api/pessoas', {
          ficha: { ...ficha, documento: '' },
          papeis: ['produtor_uva'],
        })
      ).status,
    ).toBe(400);
    expect((await a.master.post('/api/pessoas', { ficha, papeis: ['produtor_uva'] })).status).toBe(
      200,
    );
    const repetida = await a.master.post('/api/pessoas', { ficha, papeis: ['cliente'] });
    expect(repetida.corpo.codigo).toBe('documento_duplicado');
    expect((await b.master.post('/api/pessoas', { ficha, papeis: ['cliente'] })).status).toBe(200);
  });

  it('papel retirado fica inativo e os dados dele voltam se o papel voltar', async () => {
    const { master } = await empresa();
    const ficha = { tipoPessoa: 'fisica', nome: 'José Viticultor', documento: '52998224725' };
    const produtor = {
      numeroSivibe: 'BA-0001',
      situacaoCadastro: 'regular',
      declaracaoAnoAnterior: true,
    };
    const r = await master.post('/api/pessoas', {
      ficha,
      papeis: ['produtor_uva'],
      produtorUva: produtor,
    });
    const atual = await master.get(`/api/pessoas/${r.corpo.id}`);
    expect(
      (
        await master.put(`/api/pessoas/${r.corpo.id}`, {
          ficha: atual.corpo.ficha,
          papeis: ['cliente'],
          versao: atual.corpo.versao,
        })
      ).status,
    ).toBe(200);
    expect((await master.get('/api/pessoas?papel=produtor_uva')).corpo.total).toBe(0);
    const v2 = await master.get(`/api/pessoas/${r.corpo.id}`);
    await master.put(`/api/pessoas/${r.corpo.id}`, {
      ficha: v2.corpo.ficha,
      papeis: ['cliente', 'produtor_uva'],
      versao: v2.corpo.versao,
    });
    const v3 = await master.get(`/api/pessoas/${r.corpo.id}`);
    expect(v3.corpo.produtorUva).toMatchObject({
      numeroSivibe: 'BA-0001',
      situacaoCadastro: 'regular',
    });
    const hist = await master.get(`/api/historico/pessoa/${r.corpo.id}`);
    expect(hist.corpo.map((h: { acao: string }) => h.acao)).toEqual(['editar', 'editar', 'criar']);
  });

  it('placa e e-mail de contato são validados', async () => {
    const { master } = await empresa();
    const ficha = fichaPj('Transportes Sertão');
    const placaRuim = await master.post('/api/pessoas', {
      ficha,
      papeis: ['transportador'],
      transportador: { placas: ['12-ABC'] },
    });
    expect(placaRuim.status).toBe(400);
    const ok = await master.post('/api/pessoas', {
      ficha,
      papeis: ['transportador'],
      transportador: { placas: ['abc-1d23', 'ABC1234'] },
    });
    expect(ok.status).toBe(200);
    expect((await master.get(`/api/pessoas/${ok.corpo.id}`)).corpo.transportador.placas).toEqual([
      'ABC1234',
      'ABC1D23',
    ]);
  });

  it('o cantineiro só vê pessoas (grade inicial, P27)', async () => {
    const { master } = await empresa();
    const { cliente: cantineiro } = await t.convidar(master, 'Cantineiro');
    expect((await cantineiro.get('/api/pessoas')).status).toBe(200);
    expect(
      (await cantineiro.post('/api/pessoas', { ficha: fichaPj('X'), papeis: ['cliente'] })).status,
    ).toBe(403);
  });
});

describe('estabelecimento completo (P12)', () => {
  it('RT tem de ser pessoa com o papel; IGs e produtos elaborados ficam gravados', async () => {
    const { master } = await t.empresaComMaster();
    const estab = await t.criarEstabelecimento(master);
    const rt = await master.post('/api/pessoas', {
      ficha: { tipoPessoa: 'fisica', nome: 'Ana Enóloga', documento: '52998224725' },
      papeis: ['responsavel_tecnico'],
      rt: { conselho: 'crq', numeroRegistro: '12345' },
    });
    const outro = await master.post('/api/pessoas', {
      ficha: fichaPj('Fornecedor Qualquer'),
      papeis: ['fornecedor'],
    });
    const ref = await master.get('/api/referencia');
    const ip = ref.corpo.igs[0].id;
    const atual = await master.get(`/api/estabelecimentos/${estab}`);
    const base = { ...atual.corpo, versao: atual.corpo.versao };
    const ruim = await master.put(`/api/estabelecimentos/${estab}`, {
      ...base,
      responsavelTecnicoId: outro.corpo.id,
    });
    expect(ruim.corpo.codigo).toBe('rt');
    const ok = await master.put(`/api/estabelecimentos/${estab}`, {
      ...base,
      responsavelTecnicoId: rt.corpo.id,
      igs: [ip],
      produtosElaborados: ['vinho_fino', 'espumante_natural'],
    });
    expect(ok.status).toBe(200);
    const depois = await master.get(`/api/estabelecimentos/${estab}`);
    expect(depois.corpo).toMatchObject({
      responsavelTecnicoId: rt.corpo.id,
      igs: [ip],
      produtosElaborados: ['vinho_fino', 'espumante_natural'],
    });
  });
});

describe('busca de CEP e CNPJ', () => {
  it('pela API, com sessão', async () => {
    const { master } = await empresa();
    const r = await master.get('/api/consultas/cep/48900-000');
    expect(r.corpo).toMatchObject({
      encontrado: true,
      municipio: 'Juazeiro',
      uf: 'BA',
      codigoIbge: '2918407',
      fonte: 'ViaCEP',
    });
    expect((await t.cliente().get('/api/consultas/cep/48900000')).status).toBe(401);
  });

  it('cadeia de reserva: provedor fora do ar passa para o próximo e o IBGE é completado', async () => {
    const chamadas: string[] = [];
    const c = consultasPublicas(async (url) => {
      chamadas.push(url);
      if (url.includes('viacep')) throw new Error('fora do ar');
      if (url.includes('brasilapi.com.br/api/cep')) {
        return { street: 'Av. Principal', neighborhood: 'Centro', city: 'Curaçá', state: 'BA' };
      }
      if (url.includes('ibge/municipios/v1/BA'))
        return [{ nome: 'CURACA', codigo_ibge: '2909901' }];
      if (url.includes('brasilapi.com.br/api/cnpj')) throw new Error('lento');
      if (url.includes('publica.cnpj.ws')) {
        return {
          razao_social: 'VINICOLA TESTE LTDA',
          estabelecimento: {
            nome_fantasia: 'Vinícola Teste',
            situacao_cadastral: 'Ativa',
            cep: '48900000',
            tipo_logradouro: 'Rodovia',
            logradouro: 'BA-210',
            numero: 'SN',
            bairro: 'Zona Rural',
            cidade: { nome: 'Juazeiro', ibge_id: 2918407 },
            estado: { sigla: 'BA' },
          },
        };
      }
      return null;
    });
    expect(await c.cep('48960-000')).toMatchObject({
      municipio: 'Curaçá',
      codigoIbge: '2909901',
      fonte: 'BrasilAPI',
    });
    const cnpj = await c.cnpj(gerarCnpj());
    expect(cnpj).toMatchObject({
      nome: 'VINICOLA TESTE LTDA',
      nomeFantasia: 'Vinícola Teste',
      fonte: 'CNPJ.ws (Receita Federal)',
    });
    expect(cnpj!.endereco).toMatchObject({ logradouro: 'Rodovia BA-210', codigoIbge: '2918407' });
    expect(await c.cnpj('11.222.333/0001-82')).toBeNull();
    expect(chamadas.some((u) => u.includes('viacep'))).toBe(true);
  });
});
