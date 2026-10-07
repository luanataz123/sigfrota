// app/LavagemClientProvider.tsx
//
// Expõe o `LavagemClient` ativo (real/mock, via `clientFactory`) para a árvore
// de componentes por um React Context (Req. 11.1/11.2). As queries e mutações
// das tarefas 5 (`useLavagens`) e 8 (`useLavagemMutations`) consomem o client
// por `useLavagemClient()`, sem conhecer qual implementação está ativa nem
// como o token/401 foram ligados.
//
// A LIGAÇÃO do 401 global (Req. 1.4) e a injeção do token (Req. 1.3) são feitas
// em `providers.tsx`, que cria o client com `obterToken` (do AuthProvider) e
// `aoNaoAutorizado` (via `criarHandler401` → logout + navigate) e o fornece
// aqui. Este provider é apenas o transporte do client já configurado.

import { createContext, useContext, type ReactNode } from 'react';
import type { LavagemClient } from '../api/LavagemClient';

const LavagemClientContext = createContext<LavagemClient | null>(null);

interface LavagemClientProviderProps {
  children: ReactNode;
  /** Client já configurado (token + 401) criado em `providers.tsx`. */
  client: LavagemClient;
}

export function LavagemClientProvider({
  children,
  client,
}: LavagemClientProviderProps) {
  return (
    <LavagemClientContext.Provider value={client}>
      {children}
    </LavagemClientContext.Provider>
  );
}

/**
 * Acessa o `LavagemClient` ativo. Lança erro claro quando usado fora do
 * `LavagemClientProvider`, para falhar cedo em erros de montagem da árvore.
 */
export function useLavagemClient(): LavagemClient {
  const client = useContext(LavagemClientContext);
  if (client === null) {
    throw new Error(
      'useLavagemClient deve ser usado dentro de um <LavagemClientProvider>.',
    );
  }
  return client;
}
