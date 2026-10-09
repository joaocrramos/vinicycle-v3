// Composição por recipiente: os exemplos da seção 5.4 do modelo de dados.
import { describe, expect, it } from 'vitest';
import {
  type Composicao,
  deCentilitros,
  misturar,
  normalizar,
  paraCentilitros,
  porSafra,
  porVariedade,
  safraCicloPredominante,
} from '../src/producao';

const uva = (variedadeId: string, safra: number, ciclo: string, fracao = 1): Composicao => ({
  componentes: [
    { variedadeId, safra, ciclo, origem: 'propria', organica: false, candidataIp: false, fracao },
  ],
  chaptalizado: false,
});
const cl = paraCentilitros;
const pct = (c: Composicao, v: string) =>
  Number(((porVariedade(c).find((x) => x.variedadeId === v)?.fracao ?? 0) * 100).toFixed(2));

describe('números', () => {
  it('litros em centilitros, sem ponto flutuante', () => {
    expect(cl('0.1') + cl('0.2')).toBe(30);
    expect(deCentilitros(cl('1020.5'))).toBe('1020.50');
    expect(deCentilitros(-5)).toBe('-0.05');
  });
});

describe('composição (modelo, 5.4)', () => {
  const grenache = uva('grenache', 2026, '01');
  const syrah = uva('syrah', 2026, '01');

  it('exemplo 1: incorporação só no recipiente que recebe', () => {
    const b1 = misturar([
      { centilitros: cl(200), composicao: grenache },
      { centilitros: cl(20), composicao: syrah },
    ]);
    expect(pct(b1, 'grenache')).toBe(90.91);
    expect(pct(b1, 'syrah')).toBe(9.09);
    const loteA = misturar([
      { centilitros: cl(800), composicao: grenache },
      { centilitros: cl(220), composicao: b1 },
    ]);
    expect(pct(loteA, 'grenache')).toBe(98.04);
    expect(pct(loteA, 'syrah')).toBe(1.96);
  });

  it('exemplo 2: juntar as partes do mesmo lote dá a média ponderada', () => {
    const b1 = misturar([
      { centilitros: cl(200), composicao: grenache },
      { centilitros: cl(20), composicao: syrah },
    ]);
    const t1 = misturar([
      { centilitros: cl(800), composicao: grenache },
      { centilitros: cl(220), composicao: b1 },
    ]);
    expect(pct(t1, 'grenache')).toBe(98.04);
  });

  it('exemplo 3: corte com lote novo e safra predominante no código', () => {
    const t1 = normalizarComp([
      ['grenache', 2026, '01', 0.9],
      ['syrah', 2026, '01', 0.1],
    ]);
    const novo = misturar([
      { centilitros: cl(700), composicao: t1 },
      { centilitros: cl(300), composicao: uva('malbec', 2025, '02') },
    ]);
    expect(pct(novo, 'grenache')).toBe(63);
    expect(pct(novo, 'syrah')).toBe(7);
    expect(pct(novo, 'malbec')).toBe(30);
    expect(porSafra(novo)).toEqual([
      { safra: 2026, fracao: 0.7 },
      { safra: 2025, fracao: 0.3 },
    ]);
    expect(safraCicloPredominante(novo)).toEqual({ safra: 2026, ciclo: '01' });
  });

  it('empate na safra: vale a mais recente', () => {
    const c = misturar([
      { centilitros: 100, composicao: uva('a', 2025, '02') },
      { centilitros: 100, composicao: uva('b', 2026, '01') },
    ]);
    expect(safraCicloPredominante(c)).toEqual({ safra: 2026, ciclo: '01' });
  });

  it('frações somam exatamente 1 e a chaptalização viaja com os litros', () => {
    const tercos = misturar([
      { centilitros: 1, composicao: uva('a', 2026, '01') },
      { centilitros: 1, composicao: uva('b', 2026, '01') },
      { centilitros: 1, composicao: { ...uva('c', 2026, '01'), chaptalizado: true } },
    ]);
    const soma = tercos.componentes.reduce((s, x) => s + Math.round(x.fracao * 1e8), 0);
    expect(soma).toBe(1e8);
    expect(tercos.chaptalizado).toBe(true);
  });
});

function normalizarComp(itens: Array<[string, number, string, number]>): Composicao {
  return {
    componentes: normalizar(
      itens.map(([variedadeId, safra, ciclo, fracao]) => ({
        variedadeId,
        safra,
        ciclo,
        origem: 'propria' as const,
        organica: false,
        candidataIp: false,
        fracao,
      })),
    ),
    chaptalizado: false,
  };
}
