// Regras versionadas (P16): carga inicial, nova versão e a regra vigente pela data e abrangência.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { regrasVigentes } from '../src/nucleo/regras';
import { montar } from './apoio';

let t: Awaited<ReturnType<typeof montar>>;
beforeAll(async () => {
  t = await montar();
});
afterAll(async () => {
  await t.fechar();
});

describe('regras regulatórias', () => {
  it('as regras iniciais vêm com a fonte', async () => {
    const { cliente: adm } = await t.admin();
    const r = await adm.get('/api/plataforma/regras');
    expect(r.status).toBe(200);
    expect(r.corpo).toContainEqual(
      expect.objectContaining({
        chave: 'rendimento_prensagem_maximo',
        maximo: '0.8000',
        fonteNorma: 'Decreto 12.709/2025',
        fonteArtigo: 'art. 93',
      }),
    );
  });

  it('nova versão encerra a anterior na véspera; vale a versão da data do fato', async () => {
    const { cliente: adm } = await t.admin();
    const chave = `teste_${Math.random().toString(36).slice(2, 8)}`;
    const base = {
      tipo: 'limite',
      chave,
      abrangencia: 'nacional',
      unidade: '%',
      descricao: 'Regra de teste',
      fonteNorma: 'Norma de teste',
    };
    expect(
      (
        await adm.post('/api/plataforma/regras', {
          ...base,
          vigenteDesde: '2020-01-01',
          minimo: '85',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await adm.post('/api/plataforma/regras', {
          ...base,
          vigenteDesde: '2027-01-01',
          minimo: '90',
        })
      ).status,
    ).toBe(200);
    const antes = (
      await adm.post('/api/plataforma/regras', { ...base, vigenteDesde: '2026-01-01' })
    ).corpo;
    expect(antes.codigo).toBe('vigencia');

    const versoes = (await adm.get('/api/plataforma/regras')).corpo.filter(
      (r: { chave: string }) => r.chave === chave,
    );
    expect(versoes.map((v: { vigenteAte: string | null }) => v.vigenteAte)).toEqual([
      null,
      '2026-12-31',
    ]);
    await t.db.transaction(async (tx) => {
      expect((await regrasVigentes(tx, chave, { data: '2026-06-01' }))[0]!.minimo).toBe('85.0000');
      expect((await regrasVigentes(tx, chave, { data: '2027-02-01' }))[0]!.minimo).toBe('90.0000');
      expect(await regrasVigentes(tx, chave, { data: '2019-12-31' })).toEqual([]);
    });
  });

  it('a regra da IG vem antes da nacional', async () => {
    await t.db.transaction(async (tx) => {
      const r = await regrasVigentes(tx, 'varietal_minimo', {
        data: '2026-10-03',
        igs: ['IP_VALE_SAO_FRANCISCO'],
      });
      expect(r.map((x) => [x.abrangencia, x.minimo])).toEqual([
        ['ig', '85.0000'],
        ['nacional', '75.0000'],
      ]);
      const sem = await regrasVigentes(tx, 'varietal_minimo', { data: '2026-10-03' });
      expect(sem.map((x) => x.abrangencia)).toEqual(['nacional']);
    });
  });

  it('a empresa vê as regras em vigor; só a Administração cria', async () => {
    const { master } = await t.empresaComMaster();
    const r = await master.get('/api/regras');
    expect(r.corpo.some((x: { chave: string }) => x.chave === 'safra_minima')).toBe(true);
    expect((await master.post('/api/plataforma/regras', {})).status).toBe(403);
  });
});
