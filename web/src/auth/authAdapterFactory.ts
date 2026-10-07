// auth/authAdapterFactory.ts
//
// Escolhe o adapter de autenticação pela mesma chave do client de dados
// (`VITE_USE_MOCK`, Req. 11.2): mock em desenvolvimento sem AWS, Cognito com a
// API real. As variáveis vêm do `web/.env.local` gerado por
// `npm run env-web -w infra`.

import { usarMock } from '../api/clientFactory';
import type { AuthAdapter } from './AuthProvider';
import { CognitoAuthAdapter } from './CognitoAuthAdapter';
import { MockAuthAdapter } from './MockAuthAdapter';

export function criarAuthAdapter(): AuthAdapter {
  if (usarMock()) return new MockAuthAdapter();

  const userPoolId = import.meta.env.VITE_USER_POOL_ID;
  const clientId = import.meta.env.VITE_USER_POOL_CLIENT_ID;
  if (!userPoolId || !clientId) {
    // Falha cedo: sem Cognito configurado não há como autenticar.
    throw new Error(
      'VITE_USER_POOL_ID/VITE_USER_POOL_CLIENT_ID não configuradas: rode "npm run env-web -w infra" ou use VITE_USE_MOCK=true.',
    );
  }
  return new CognitoAuthAdapter({ userPoolId, clientId });
}
