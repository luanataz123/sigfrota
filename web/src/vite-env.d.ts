/// <reference types="vite/client" />

// Tipagem das variáveis de ambiente usadas pela camada de client (Req. 11.2).
// Coerente com `web/.env.example`.
interface ImportMetaEnv {
  /** Alterna entre o client HTTP real e o MockLavagemClient (Req. 11.2). */
  readonly VITE_USE_MOCK?: string;
  /** Base URL da API api-lavagens quando VITE_USE_MOCK=false (Req. 11.1). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
