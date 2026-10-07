import { defineConfig } from 'vitest/config';

// Testes da infraestrutura: rodam sem credenciais AWS (Requisito 11.1).
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Os testes são opcionais nas tarefas; sem arquivos, o comando não deve falhar.
    passWithNoTests: true,
    // O synth com empacotamento esbuild das Lambdas pode levar alguns segundos.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
