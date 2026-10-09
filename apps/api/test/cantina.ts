// Cenário da cantina para os testes das operações: empresa, recipientes, romaneio confirmado e lote.
import { expect } from 'vitest';
import type { montar } from './apoio';

/** Empresa com estabelecimento, local, projeto tinto e os auxiliares de recipiente, uva e lote. */
export async function cantina(t: Awaited<ReturnType<typeof montar>>) {
  const { master } = await t.empresaComMaster();
  const estab = await t.criarEstabelecimento(master);
  await master.post('/api/auth/contexto', { estabelecimentoId: estab });
  const local = (await master.post('/api/locais', { nome: 'Adega', uso: 'recipientes' })).corpo.id;
  const tipos = (await master.get('/api/catalogos/tipo_recipiente?tamanho=0')).corpo
    .itens as Array<{ id: string; nome: string }>;
  const recipiente = async (codigo: string, litros: string, tipo = 'Tanque de inox') =>
    (
      await master.post('/api/recipientes', {
        codigo,
        tipoRecipienteId: tipos.find((x) => x.nome === tipo)!.id,
        capacidadeLitros: litros,
        localId: local,
      })
    ).corpo.id as string;
  const variedade = async (nome: string) =>
    (
      await master.get(`/api/catalogos/variedade?tamanho=0&busca=${encodeURIComponent(nome)}`)
    ).corpo.itens.find((v: { nome: string }) => v.nome === nome).id as string;
  const malbec = await variedade('Malbec');
  const cabernet = await variedade('Cabernet Sauvignon');
  const projeto = (
    await master.post('/api/projetos', { nome: 'Tinto 2026', safraPrevista: 2026, cor: 'tinto' })
  ).corpo.id as string;
  /** Romaneio de vinhedo próprio, confirmado; devolve o id de cada item. */
  const romaneio = async (
    itens: Array<[string, string]>,
    donoUvaId: string | null = null,
    projetoId: string = projeto,
  ) => {
    const r = await master.post('/api/romaneios', {
      chegadaEm: '2026-02-10T08:00:00-03:00',
      projetoId,
      origem: 'vinhedo_proprio',
      donoUvaId,
      itens: itens.map(([variedadeId, kg]) => ({
        variedadeId,
        dataColheita: '2026-02-10',
        brix: '23',
        pesagens: [
          {
            pesadoEm: '2026-02-10T08:00:00-03:00',
            brutoKg: String(Number(kg) + 1000),
            taraKg: '1000',
          },
        ],
      })),
    });
    const avisos = (await master.get(`/api/romaneios/${r.corpo.id}/previa`)).corpo.avisos as Array<{
      codigo: string;
    }>;
    const ok = await master.post(`/api/romaneios/${r.corpo.id}/confirmar`, {
      cientes: avisos.map((a) => a.codigo),
    });
    expect(ok.status).toBe(200);
    return (
      (await master.get(`/api/romaneios/${r.corpo.id}`)).corpo.itens as Array<{ id: string }>
    ).map((i) => i.id);
  };
  const lote = async (recipienteId: string) => {
    const p = (await master.get(`/api/projetos/${projeto}`)).corpo;
    return (
      p.lotes as Array<{
        id: string;
        codigo: string;
        volume: string;
        rendimentoReal: string | null;
        recipientes: Array<{ id: string; litros: string }>;
      }>
    ).find((l) => l.recipientes.some((r) => r.id === recipienteId))!;
  };
  return { master, estab, recipiente, malbec, cabernet, projeto, romaneio, lote };
}
