// auth/RequireAuth.test.tsx
//
// Testes do guard de rota (Req. 1.1): usuário não autenticado é redirecionado
// para /login; usuário autenticado tem o conteúdo protegido liberado.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, type AuthAdapter, type Sessao } from './AuthProvider';
import { RequireAuth } from './RequireAuth';

const SESSAO: Sessao = {
  token: 'jwt-de-teste',
  usuario: { nome: 'Atendente', email: 'atendente@mpf.mp.br' },
};

const adapterNunca: AuthAdapter = {
  autenticar: async () => {
    throw new Error('não deveria ser chamado neste teste');
  },
};

/**
 * Monta a árvore de rotas com uma rota protegida (/privado) e a pública
 * (/login), iniciando em /privado. `sessaoInicial` controla se há sessão.
 */
function montar(sessaoInicial: Sessao | null) {
  return render(
    <AuthProvider adapter={adapterNunca} sessaoInicial={sessaoInicial}>
      <MemoryRouter initialEntries={['/privado']}>
        <Routes>
          <Route path="/login" element={<p>Tela de login</p>} />
          <Route
            path="/privado"
            element={
              <RequireAuth>
                <p>Conteúdo protegido</p>
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('RequireAuth (Req. 1.1 — guard de rota)', () => {
  it('redireciona o não autenticado para /login', () => {
    montar(null);

    expect(screen.getByText('Tela de login')).toBeInTheDocument();
    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument();
  });

  it('libera o conteúdo protegido quando autenticado', () => {
    montar(SESSAO);

    expect(screen.getByText('Conteúdo protegido')).toBeInTheDocument();
    expect(screen.queryByText('Tela de login')).not.toBeInTheDocument();
  });
});
