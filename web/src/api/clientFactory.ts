// api/clientFactory.ts
//
// Escolhe a implementação do `LavagemClient` conforme a configuração de
// ambiente (Req. 11.2): mock para desenvolvimento/demo sem AWS, ou o client
// HTTP real contra o contrato `api-lavagens`. Nenhum componente precisa saber
// qual implementação está ativa — depende apenas da interface.
//
// Variáveis de ambiente (coerentes com `web/.env.example`):
//  - VITE_USE_MOCK   : 'true' usa o MockLavagemClient; 'false' usa o HTTP.
//  - VITE_API_BASE_URL: base URL da API quando VITE_USE_MOCK=false (Req. 11.1).

import type { LavagemClient } from './LavagemClient';
import { MockLavagemClient } from './MockLavagemClient';
import {
  HttpLavagemClient,
  type HttpLavagemClientOptions,
} from './HttpLavagemClient';

/** `true` quando a env `VITE_USE_MOCK` está em 'true' (string). Req. 11.2. */
export function usarMock(): boolean {
  // Default seguro para desenvolvimento/demo: mock quando a env não está setada.
  return (import.meta.env.VITE_USE_MOCK ?? 'true') === 'true';
}

/**
 * Dependências injetáveis para o client HTTP (token/401), repassadas ao
 * `HttpLavagemClient`. A tarefa 3 (AuthProvider) fornecerá estes callbacks;
 * no mock elas são ignoradas.
 */
export type ClientFactoryOptions = Pick<
  HttpLavagemClientOptions,
  'obterToken' | 'aoNaoAutorizado' | 'fetchImpl'
>;

/**
 * Cria o `LavagemClient` apropriado ao ambiente (Req. 11.2).
 *
 * - `VITE_USE_MOCK=true`  → `MockLavagemClient` (Req. 11.2/11.3).
 * - `VITE_USE_MOCK=false` → `HttpLavagemClient` com `VITE_API_BASE_URL`
 *   (Req. 11.1); injeta token (Req. 1.3) e tratamento de 401 (Req. 1.4) quando
 *   fornecidos.
 */
export function criarLavagemClient(
  opcoes: ClientFactoryOptions = {},
): LavagemClient {
  if (usarMock()) {
    return new MockLavagemClient();
  }

  const baseUrl = import.meta.env.VITE_API_BASE_URL;
  if (!baseUrl) {
    // Falha cedo: HTTP sem base URL é erro de configuração (Req. 11.1).
    throw new Error(
      'VITE_API_BASE_URL não configurada: defina a base da API ou use VITE_USE_MOCK=true.',
    );
  }

  return new HttpLavagemClient({ baseUrl, ...opcoes });
}
