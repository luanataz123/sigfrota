// App.test.tsx
//
// Smoke test da montagem completa (providers + router). Com o `MockAuthAdapter`
// padrão a sessão começa vazia, então a raiz "/" → /veiculos/101 cai no
// RequireAuth e o usuário é levado à LoginPage (Req. 1.1).

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App (montagem de providers + router)', () => {
  it('monta a árvore e leva o usuário não autenticado ao login', () => {
    render(<App />);

    // BrowserRouter inicia em "/", que redireciona ao veículo demo e, sem
    // sessão, para a tela de login.
    expect(
      screen.getByRole('heading', { name: /entrar/i }),
    ).toBeInTheDocument();
  });
});
