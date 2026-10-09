import { describe, expect, it } from 'vitest';
import { fichaEntrada, formatarTelefone, normalizarTelefone } from '../src/ficha';

describe('ficha (P2)', () => {
  it('limpa o documento e valida o CNPJ', () => {
    const r = fichaEntrada.safeParse({
      tipoPessoa: 'juridica',
      nome: 'Vinícola',
      documento: '11.222.333/0001-81',
    });
    expect(r.success).toBe(true);
    expect(r.data?.documento).toBe('11222333000181');
  });
  it('recusa CPF inválido', () => {
    const r = fichaEntrada.safeParse({
      tipoPessoa: 'fisica',
      nome: 'Ana',
      documento: '111.111.111-11',
    });
    expect(r.success).toBe(false);
  });
  it('estrangeiro exige país', () => {
    expect(fichaEntrada.safeParse({ tipoPessoa: 'estrangeira', nome: 'X' }).success).toBe(false);
    expect(
      fichaEntrada.safeParse({ tipoPessoa: 'estrangeira', nome: 'X', pais: 'AR' }).success,
    ).toBe(true);
  });
  it('normaliza telefones', () => {
    expect(normalizarTelefone('(74) 99999-8888')).toBe('+5574999998888');
    expect(formatarTelefone('+5574999998888')).toBe('+55 (74) 99999-8888');
    expect(formatarTelefone('+557433334444')).toBe('+55 (74) 3333-4444');
  });
  it('valida e-mail de contato', () => {
    const r = fichaEntrada.safeParse({
      tipoPessoa: 'fisica',
      nome: 'Ana',
      contatos: [{ tipo: 'email', valor: 'nao-e-email' }],
    });
    expect(r.success).toBe(false);
  });
});
