import { defineConfig } from 'vitest/config';

// Testes da API: rodam sem AWS, com repositório em memória.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
