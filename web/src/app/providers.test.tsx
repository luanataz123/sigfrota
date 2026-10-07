// app/providers.test.tsx
//
// Verifica que `AppProviders` monta a árvore e expõe um `LavagemClient` ativo
// para a tree (Req. 11.1): um consumidor que chama `useLavagemClient()`
// consegue acessar o client sem erro. Isso cobre a ligação feita por
// `ConexaoLavagemClient` (token + 401) a partir do AuthProvider/Router.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppProviders } from './providers';
import { useLavagemClient } from './LavagemClientProvider';

function ConsumidorDeClient() {
  const client = useLavagemClient();
  // Confirma que o objeto expõe os métodos do contrato LavagemClient.
  const ok = typeof client.listarLavagens === 'function';
  return <p>client-ok:{String(ok)}</p>;
}

describe('AppProviders (Req. 11.1 — client exposto à árvore)', () => {
  it('fornece um LavagemClient configurado via useLavagemClient', () => {
    render(
      <AppProviders>
        <ConsumidorDeClient />
      </AppProviders>,
    );

    expect(screen.getByText('client-ok:true')).toBeInTheDocument();
  });
});
