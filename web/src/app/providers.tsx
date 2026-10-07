// app/providers.tsx
//
// Monta a ÁRVORE DE PROVIDERS da aplicação (Req. 1.1 e §"Arquitetura de pastas"
// do design): Router → Auth → Query → LavagemClient → Toast. A ordem importa:
//
//  - `BrowserRouter` por fora para que o 401 global possa usar `navigate`.
//  - `AuthProvider` para expor `obterToken` (Req. 1.3) e `logout` (Req. 1.5).
//  - `QueryClientProvider` (TanStack Query) para as queries/mutações das
//    tarefas 5 e 8 (Req. 2.6/2.7, 8.6).
//  - `LavagemClientProvider` fornece o `LavagemClient` já configurado com a
//    ligação do 401 (Req. 1.4) e injeção de token (Req. 1.3).
//  - `ToastProvider` para as mensagens de sucesso/erro (Req. 10.1).
//
// A ligação do 401 (logout + navigate) precisa dos hooks `useAuth`/`useNavigate`,
// que só existem DENTRO de Auth/Router. Por isso o client é criado em um
// componente interno (`ConexaoLavagemClient`) que vive abaixo desses providers.

import { useMemo, useRef, type ReactNode } from 'react';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, type AuthAdapter, type Sessao } from '../auth/AuthProvider';
import { criarAuthAdapter } from '../auth/authAdapterFactory';
import { useAuth } from '../auth/useAuth';
import { criarHandler401 } from '../auth/handler401';
import { criarLavagemClient } from '../api/clientFactory';
import { LavagemClientProvider } from './LavagemClientProvider';
import { ToastProvider } from './ToastRegion';

/** Cria um QueryClient com defaults sensatos para o MVP. */
function criarQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Evita refetch agressivo durante a demo; estados de loading/erro
        // continuam explícitos nos hooks das tarefas 5/8 (Req. 2.6/2.7).
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
    },
  });
}

/**
 * Componente interno: vive abaixo de Auth e Router, então pode ligar o 401
 * global (Req. 1.4) ao `logout` do AuthProvider e ao `navigate('/login')`, e
 * injetar o token da sessão (Req. 1.3) no client. Expõe o client resultante
 * para a árvore via `LavagemClientProvider`.
 */
function ConexaoLavagemClient({ children }: { children: ReactNode }) {
  const { obterToken, logout } = useAuth();
  const navigate = useNavigate();

  // `navigate` (BrowserRouter) muda de identidade a cada troca de rota. Se ele
  // entrasse nas dependências do `useMemo`, o client seria recriado a cada
  // navegação e o MockLavagemClient (estado em memória) perderia as lavagens
  // incluídas (R23). Por isso guardamos o `navigate` mais recente em uma ref e
  // mantemos o client estável.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // Recria o client apenas quando as dependências estáveis mudam. `obterToken`
  // é estável (useCallback no AuthProvider) e lê sempre o token mais recente.
  const client = useMemo(
    () =>
      criarLavagemClient({
        obterToken, // Req. 1.3
        aoNaoAutorizado: criarHandler401(logout, () =>
          navigateRef.current('/login', { replace: true }),
        ), // Req. 1.4
      }),
    [obterToken, logout],
  );

  return <LavagemClientProvider client={client}>{children}</LavagemClientProvider>;
}

export interface AppProvidersProps {
  children: ReactNode;
  /**
   * Adapter de autenticação. Default: `criarAuthAdapter()` — `MockAuthAdapter`
   * com VITE_USE_MOCK=true, `CognitoAuthAdapter` com a API real. Injetável
   * para testes.
   */
  authAdapter?: AuthAdapter;
  /** Sessão inicial opcional (útil em testes para montar já autenticado). */
  sessaoInicial?: Sessao | null;
  /** QueryClient injetável; default: um novo client com defaults do MVP. */
  queryClient?: QueryClient;
}

/**
 * Provedores da aplicação. Envolve `children` (tipicamente `<AppRoutes/>`) com
 * Router, Auth, Query, LavagemClient e Toast, deixando a árvore pronta para as
 * páginas protegidas e para as queries/mutações.
 */
export function AppProviders({
  children,
  authAdapter,
  sessaoInicial = null,
  queryClient,
}: AppProvidersProps) {
  // Instâncias estáveis por montagem (evita recriar entre renders).
  // Mock ou Cognito conforme VITE_USE_MOCK (ver auth/authAdapterFactory.ts).
  const adapter = useMemo(() => authAdapter ?? criarAuthAdapter(), [authAdapter]);
  const qc = useMemo(() => queryClient ?? criarQueryClient(), [queryClient]);

  return (
    <BrowserRouter>
      <AuthProvider adapter={adapter} sessaoInicial={sessaoInicial}>
        <QueryClientProvider client={qc}>
          <ConexaoLavagemClient>
            <ToastProvider>{children}</ToastProvider>
          </ConexaoLavagemClient>
        </QueryClientProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
