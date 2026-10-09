// Configuração lida do ambiente. Segredos nunca ficam no código (02-arquitetura.md, Princípio 5).
import { z } from 'zod';

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORTA: z.coerce.number().int().default(3000),
  HOST: z.string().default('127.0.0.1'),
  URL_APLICACAO: z.url(),
  DATABASE_URL: z.string().min(1),
  CHAVE_CIFRA: z
    .string()
    .refine(
      (v) => Buffer.from(v, 'base64').length === 32,
      'CHAVE_CIFRA deve ter 32 bytes em base64',
    ),
  ARMAZENAMENTO_DIR: z.string().min(1),
  EMAIL_PROVEDOR: z.enum(['console', 'resend', 'memoria']).default('console'),
  EMAIL_REMETENTE: z.string().default('ViniCycle <nao-responda@vinicycle.com>'),
  RESEND_API_KEY: z.string().optional(),
  /** Pasta da interface compilada, servida pela API em produção. */
  WEB_DIR: z.string().optional(),
});

export type Config = z.infer<typeof esquema> & { cookieSeguro: boolean };

export function lerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const c = esquema.parse(env);
  if (c.EMAIL_PROVEDOR === 'resend' && !c.RESEND_API_KEY) {
    throw new Error('EMAIL_PROVEDOR=resend exige RESEND_API_KEY');
  }
  return { ...c, cookieSeguro: c.URL_APLICACAO.startsWith('https://') };
}
