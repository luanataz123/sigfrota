// auth/LoginPage.test.tsx
//
// Testes da tela de login (Req. 1.1, 1.2): login com sucesso navega para o
// destino; credenciais inválidas exibem erro acessível sem navegar; o botão é
// desabilitado durante a autenticação (evita envio duplicado).

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './AuthProvider';
import { MockAuthAdapter } from './MockAuthAdapter';
import { LoginPage } from './LoginPage';

// Credenciais da conta de demonstração do MockAuthAdapter.
const EMAIL_OK = 'atendente@mpf.mp.br';
const SENHA_OK = 'demo123';

/** Preenche e-mail/senha e envia o formulário. */
function preencherEEnviar(email: string, senha: string) {
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: senha } });
  fireEvent.click(screen.getByRole('button'));
}

/**
 * Monta a LoginPage dentro de um AuthProvider (com o adapter informado) e de um
 * router com uma rota de destino observável. `latenciaMs` permite exercitar o
 * estado "autenticando" (botão desabilitado).
 */
function montar(opcoes: { latenciaMs?: number } = {}) {
  const adapter = new MockAuthAdapter({ latenciaMs: opcoes.latenciaMs });

  return render(
    <AuthProvider adapter={adapter}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage rotaPadrao="/veiculos/101" />} />
          <Route path="/veiculos/101" element={<p>Painel do veículo 101</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('LoginPage (Req. 1.1/1.2 — login)', () => {
  it('login com sucesso navega para a rota padrão (Req. 1.2)', async () => {
    montar();

    preencherEEnviar(EMAIL_OK, SENHA_OK);

    expect(
      await screen.findByText('Painel do veículo 101'),
    ).toBeInTheDocument();
  });

  it('credenciais inválidas exibem erro acessível e não navegam (Req. 1.2)', async () => {
    montar();

    preencherEEnviar('ninguem@mpf.mp.br', 'errada');

    // Mensagem de erro vinculada e anunciada (role=alert).
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(/inválid/i);

    // Campos sinalizam estado inválido e apontam para a mensagem (acessível).
    const email = screen.getByLabelText('E-mail');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAttribute('aria-describedby', 'erro-login');

    // Não navegou: continua na tela de login.
    expect(screen.queryByText('Painel do veículo 101')).not.toBeInTheDocument();
    // App não travou: botão volta a ficar habilitado.
    expect(screen.getByRole('button')).toBeEnabled();
  });

  it('desabilita o botão enquanto autentica (Req. 8.6 — evita envio duplicado)', async () => {
    montar({ latenciaMs: 50 });

    preencherEEnviar(EMAIL_OK, SENHA_OK);

    // Durante a autenticação o botão fica desabilitado com rótulo de progresso.
    const botao = screen.getByRole('button');
    expect(botao).toBeDisabled();
    expect(botao).toHaveTextContent(/Entrando/);

    // Ao concluir, navega para o destino.
    await waitFor(() =>
      expect(screen.getByText('Painel do veículo 101')).toBeInTheDocument(),
    );
  });

  it('navega para o destino pretendido preservado em location.state.from (Req. 1.1)', async () => {
    const adapter = new MockAuthAdapter();

    render(
      <AuthProvider adapter={adapter}>
        <MemoryRouter
          initialEntries={[
            { pathname: '/login', state: { from: { pathname: '/veiculos/202' } } },
          ]}
        >
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/veiculos/202" element={<p>Veículo 202 pretendido</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    preencherEEnviar(EMAIL_OK, SENHA_OK);

    expect(
      await screen.findByText('Veículo 202 pretendido'),
    ).toBeInTheDocument();
  });

  it('não trava com erro inesperado do adapter (Req. 1.2)', async () => {
    const adapter = {
      autenticar: vi.fn().mockRejectedValue(new Error('falha de rede')),
    };

    render(
      <AuthProvider adapter={adapter}>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    preencherEEnviar('x@y.z', 'segredo');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /não foi possível entrar/i,
    );
    expect(screen.getByRole('button')).toBeEnabled();
  });
});
