// Conversão sugerida da unidade da nota para a unidade base do item (ambiente-cliente.md, Entrada
// por NF-e): só entre unidades da mesma grandeza.
import { describe, expect, it } from 'vitest';
import { conversaoSugerida, unidadeDaNota } from '../src/notas';

describe('conversão da nota', () => {
  it('reconhece as unidades comerciais comuns', () => {
    expect(unidadeDaNota(' kg ')).toBe('kg');
    expect(unidadeDaNota('LT')).toBe('L');
    expect(unidadeDaNota('Und.')).toBe('un');
    expect(unidadeDaNota('CX')).toBeNull();
  });
  it('sugere pela grandeza e não mistura grandezas', () => {
    expect(conversaoSugerida('KG', 'g')).toBe('1000');
    expect(conversaoSugerida('G', 'kg')).toBe('0.001');
    expect(conversaoSugerida('L', 'mL')).toBe('1000');
    expect(conversaoSugerida('UN', 'un')).toBe('1');
    expect(conversaoSugerida('KG', 'L')).toBeNull();
    expect(conversaoSugerida('CX', 'un')).toBeNull();
  });
});
