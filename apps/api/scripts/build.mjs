// Empacota a API para a produção: um arquivo por ponto de entrada, com as dependências embutidas.
// Só o argon2 (binário nativo) fica de fora e é instalado no servidor, na versão exata do lock.
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await build({
  entryPoints: {
    main: 'src/main.ts',
    cli: 'src/bin/cli.ts',
    migrar: 'src/bin/migrar.ts',
    referencia: 'src/bin/referencia.ts',
  },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  external: ['@node-rs/argon2', 'pg-native', 'pino-pretty'],
  // Algumas dependências ainda usam require(); no ESM ele precisa ser criado.
  banner: {
    js: "import { createRequire as __criarRequire } from 'node:module'; const require = __criarRequire(import.meta.url);",
  },
  logLevel: 'info',
});
