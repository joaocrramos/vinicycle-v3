// Senhas, tokens de uso único, cifra de segredos e segundo fator (P10, P21).
import { hash, verify } from '@node-rs/argon2';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

/** Argon2id com os parâmetros padrão da biblioteca (recomendação OWASP). */
export function gerarHashSenha(senha: string): Promise<string> {
  return hash(senha);
}

export async function conferirSenha(hashSenha: string | null, senha: string): Promise<boolean> {
  if (!hashSenha) {
    // Custo equivalente, para não revelar pela demora se o usuário existe.
    await hash(senha);
    return false;
  }
  try {
    return await verify(hashSenha, senha);
  } catch {
    return false;
  }
}

/** Token aleatório para link (sessão, convite, troca de senha). Só o hash vai para o banco. */
export function gerarToken(): { token: string; hash: Buffer } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

/** Código numérico de 6 dígitos (troca de senha com sessão aberta). */
export function gerarCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** AES-256-GCM. Formato: iv.tag.cifrado, em base64url. */
export function cifrar(chaveBase64: string, texto: string): string {
  const chave = Buffer.from(chaveBase64, 'base64');
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave, iv);
  const cifrado = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), cifrado].map((b) => b.toString('base64url')).join('.');
}

export function decifrar(chaveBase64: string, valor: string): string {
  const [iv, tag, cifrado] = valor.split('.').map((p) => Buffer.from(p, 'base64url'));
  const d = createDecipheriv('aes-256-gcm', Buffer.from(chaveBase64, 'base64'), iv!);
  d.setAuthTag(tag!);
  return Buffer.concat([d.update(cifrado!), d.final()]).toString('utf8');
}

// Segundo fator por aplicativo autenticador: TOTP (RFC 6238), SHA-1, 6 dígitos, 30 segundos.
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function gerarSegredoTotp(): string {
  const bytes = randomBytes(20);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let r = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) r += BASE32[parseInt(bits.slice(i, i + 5), 2)];
  return r;
}

function base32ParaBytes(segredo: string): Buffer {
  let bits = '';
  for (const c of segredo.replace(/=+$/, '').toUpperCase()) {
    const v = BASE32.indexOf(c);
    if (v < 0) throw new Error('Segredo TOTP inválido');
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function codigoTotp(segredo: string, instante = Date.now()): string {
  const contador = Math.floor(instante / 30_000);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(contador));
  const h = createHmac('sha1', base32ParaBytes(segredo)).update(buf).digest();
  const o = h[h.length - 1]! & 0xf;
  const n = (h.readUInt32BE(o) & 0x7fffffff) % 1_000_000;
  return String(n).padStart(6, '0');
}

/** Aceita o código da janela atual e das vizinhas (relógios fora de sincronia). */
export function conferirTotp(segredo: string, codigo: string, instante = Date.now()): boolean {
  const limpo = codigo.replace(/\D/g, '');
  if (limpo.length !== 6) return false;
  return [-1, 0, 1].some((j) =>
    timingSafeEqual(Buffer.from(codigoTotp(segredo, instante + j * 30_000)), Buffer.from(limpo)),
  );
}

export function uriTotp(segredo: string, email: string): string {
  const rotulo = encodeURIComponent(`ViniCycle:${email}`);
  return `otpauth://totp/${rotulo}?secret=${segredo}&issuer=ViniCycle&algorithm=SHA1&digits=6&period=30`;
}
