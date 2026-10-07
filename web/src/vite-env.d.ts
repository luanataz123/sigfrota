/// <reference types="vite/client" />
// Tipagem das variáveis de ambiente do front. Os nomes seguem o
// `web/.env.local` gerado por `npm run env-web -w infra` (outputs da stack
// SigfrotaBase); ver também `web/.env.example`.
interface ImportMetaEnv {
  /** 'true' usa os mocks (dados e login); 'false' usa a API e o Cognito (Req. 11.2). */
  readonly VITE_USE_MOCK?: string;
  /** Base URL da HTTP API, sem barra final (Req. 11.1). */
  readonly VITE_API_URL?: string;
  /** Região da solução (us-east-1). */
  readonly VITE_REGIAO?: string;
  /** ID do User Pool do Cognito. */
  readonly VITE_USER_POOL_ID?: string;
  /** ID do App Client público da SPA. */
  readonly VITE_USER_POOL_CLIENT_ID?: string;
  /** Domínio do Hosted UI (não usado no login SRP; reservado). */
  readonly VITE_COGNITO_DOMINIO?: string;
  /** Redirect do Hosted UI (não usado no login SRP; reservado). */
  readonly VITE_REDIRECT_URI?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
