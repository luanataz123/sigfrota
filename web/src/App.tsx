// App.tsx
//
// Raiz da aplicação: monta os providers (Router, Auth, Query, LavagemClient,
// Toast) ao redor das rotas do módulo. Toda a configuração vive em
// `app/providers.tsx` e `app/router.tsx`.

import { AppProviders } from './app/providers';
import { AppRoutes } from './app/router';

export function App() {
  return (
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  );
}
