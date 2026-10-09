// Leitura das planilhas de importação (P23).
import { describe, expect, it } from 'vitest';
import { dataBr, lerCsv, normalizarNome, numeroBr } from '../src/planilha';

describe('planilha', () => {
  it('lê CSV com ";" ou ",", aspas, BOM e linhas em branco', () => {
    expect(lerCsv('﻿a;b;c\r\n1;"x;y";3\r\n\r\n4;"diz ""oi""";6')).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x;y', '3'],
      ['4', 'diz "oi"', '6'],
    ]);
    expect(lerCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
  it('números e datas no formato brasileiro', () => {
    expect(numeroBr('1.234,56')).toBe('1234.56');
    expect(numeroBr('1234.5')).toBe('1234.5');
    expect(numeroBr('12a')).toBeNull();
    expect(dataBr('31/12/2025')).toBe('2025-12-31');
    expect(dataBr('2025-02-30')).toBeNull();
    expect(normalizarNome('  Cabernet  Sauvignon ')).toBe('cabernet sauvignon');
    expect(normalizarNome('Mourvèdre')).toBe('mourvedre');
  });
});
