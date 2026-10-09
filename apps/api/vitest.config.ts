import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['./test/preparar-banco.ts'],
    // Os testes usam o mesmo banco; arquivos em sequência evitam disputa nas contagens de limites.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
