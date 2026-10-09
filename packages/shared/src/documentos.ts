// Validação e formatação de CPF e CNPJ (P2).
//
// CNPJ alfanumérico: a partir de julho de 2026, as 12 primeiras posições podem ter letras
// maiúsculas (IN RFB 2.229/2024). Os dois dígitos verificadores continuam numéricos. No cálculo,
// cada caractere vale o seu código ASCII menos 48: '0'..'9' valem 0..9 e 'A'..'Z' valem 17..42.
// Para CNPJs só com números, o resultado é o mesmo do cálculo tradicional.

export type TipoDocumento = 'cpf' | 'cnpj';

/** Remove máscara e espaços; converte letras para maiúsculas. */
export function limparDocumento(valor: string): string {
  return valor.replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
}

function valorCaractere(c: string): number {
  return c.charCodeAt(0) - 48;
}

function digitoModulo11(base: string, pesos: number[]): number {
  let soma = 0;
  for (let i = 0; i < base.length; i++) {
    soma += valorCaractere(base[i]!) * pesos[i]!;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cpfValido(valor: string): boolean {
  const cpf = limparDocumento(valor);
  if (!/^\d{11}$/.test(cpf)) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const d1 = digitoModulo11(cpf.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoModulo11(cpf.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cpf[9] === String(d1) && cpf[10] === String(d2);
}

const PESOS_CNPJ_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CNPJ_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export function cnpjValido(valor: string): boolean {
  const cnpj = limparDocumento(valor);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj)) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const d1 = digitoModulo11(cnpj.slice(0, 12), PESOS_CNPJ_1);
  const d2 = digitoModulo11(cnpj.slice(0, 13), PESOS_CNPJ_2);
  return cnpj[12] === String(d1) && cnpj[13] === String(d2);
}

export function documentoValido(tipo: TipoDocumento, valor: string): boolean {
  return tipo === 'cpf' ? cpfValido(valor) : cnpjValido(valor);
}

/** Aplica a máscara enquanto se digita, aceitando valores parciais. */
export function mascararDocumento(tipo: TipoDocumento, valor: string): string {
  const v = limparDocumento(valor);
  if (tipo === 'cpf') {
    const d = v.replace(/\D/g, '').slice(0, 11);
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  }
  // CNPJ: letras só nas 12 primeiras posições; as duas últimas são dígitos.
  const base = v.slice(0, 12);
  const dv = v.slice(12, 14).replace(/\D/g, '');
  const c = base + dv;
  let r = c.slice(0, 2);
  if (c.length > 2) r += '.' + c.slice(2, 5);
  if (c.length > 5) r += '.' + c.slice(5, 8);
  if (c.length > 8) r += '/' + c.slice(8, 12);
  if (c.length > 12) r += '-' + c.slice(12, 14);
  return r;
}

/** Formata um documento completo e já limpo para exibição. */
export function formatarDocumento(tipo: TipoDocumento, valor: string): string {
  return mascararDocumento(tipo, valor);
}
