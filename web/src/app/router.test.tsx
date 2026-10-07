// app/router.test.tsx
//
// Testes de roteamento (Req. 1.1):
//  - rota protegida redireciona para /login quando NÃO autenticado;
//  - /login renderiza a LoginPage;
//  - quando autenticado, a rota protegida libera o conteúdo (VeiculoPage real).
//
// Os testes usam `MemoryRouter` para controlar a entrada inicial sem depender
// do histórico do navegador. Como `AppRoutes` apenas declara `<Routes>`, ele é
// montado aqui dentro da pilha Auth + Query + LavagemClient + Toast + Router de
// teste, espelhando a montagem real feita por `AppProviders` (que, em produção,
// usa BrowserRouter).
//
// NOTA (tarefa 5.3): a rota protegida `/veiculos/:idVeiculo` agora renderiza a
// `VeiculoPage` real (não mais o placeholder "Veículo 101"). Por isso, as
// asserções do caso autenticado checam conteúdo estável da VeiculoPage/painel
// (o cabeçalho "Lavagens do veículo" e o rótulo "Km Atual:"), e o harness
// precisa de QueryClient + LavagemClientProvider + ToastProvider — exatamente
// os providers que o painel consome.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, type AuthAdapter, type Sessao } from '../auth/AuthProvider';
import { MockLavagemClient } from '../api/MockLavagemClient';
import { LavagemClientProvider } from './LavagemClientProvider';
import { ToastProvider } from './ToastRegion';
import { AppRoutes } from './router';

const adapterNunca: AuthAdapter = {
  autenticar: async () => {
    throw new Error('não deveria ser chamado nestes testes');
  },
};

const SESSAO: Sessao = {
  token: 'jwt-de-teste',
  usuario: { nome: 'Atendente Demo', email: 'atendente@mpf.mp.br' },
};

function montar(entradaInicial: string, sessaoInicial: Sessao | null) {
  // QueryClient com retry desligado para estados de erro/loading determinísticos.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Client mock sem latência: a VeiculoPage/painel resolve imediatamente.
  const client = new MockLavagemClient({ latenciaMs: 0 });

  return render(
    <AuthProvider adapter={adapterNunca} sessaoInicial={sessaoInicial}>
      <QueryClientProvider client={queryClient}>
        <LavagemClientProvider client={client}>
          <ToastProvider>
            <MemoryRouter initialEntries={[entradaInicial]}>
              <AppRoutes />
            </MemoryRouter>
          </ToastProvider>
        </LavagemClientProvider>
      </QueryClientProvider>
    </AuthProvider>,
  );
}

describe('AppRoutes (Req. 1.1 — rotas protegidas)', () => {
  it('redireciona rota protegida para /login quando não autenticado', () => {
    montar('/veiculos/101', null);

    // LoginPage renderiza o cabeçalho "Entrar".
    expect(screen.getByRole('heading', { name: /entrar/i })).toBeInTheDocument();
    // A VeiculoPage real NÃO deve aparecer (sem o painel de lavagens).
    expect(
      screen.queryByRole('heading', { name: /lavagens do veículo/i }),
    ).not.toBeInTheDocument();
  });

  it('renderiza a LoginPage em /login', () => {
    montar('/login', null);

    expect(screen.getByRole('heading', { name: /entrar/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument();
  });

  it('libera a rota protegida (VeiculoPage) quando autenticado', async () => {
    montar('/veiculos/101', SESSAO);

    // A VeiculoPage real hospeda o PainelLavagens: checamos conteúdo estável
    // dele (o título do painel e o rótulo do Km Atual read-only).
    expect(
      await screen.findByRole('heading', { name: /lavagens do veículo/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Km Atual:')).toBeInTheDocument();
  });

  it('abre o formulário em modo inclusão na rota /lavagens/nova (autenticado)', async () => {
    montar('/veiculos/101/lavagens/nova', SESSAO);

    // LavagemFormPage real: título do modo inclusão + o formulário de lavagem.
    expect(
      screen.getByRole('heading', { name: /nova lavagem/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('form', { name: /formulário de lavagem/i }),
    ).toBeInTheDocument();
  });

  it('abre o formulário em modo edição na rota /lavagens/:idLavagem (autenticado)', async () => {
    // Usa um id EXISTENTE (3397 — veículo 101 nos dados sintéticos) para que o
    // carregamento da lavagem (R21) resolva e o formulário seja montado.
    montar('/veiculos/101/lavagens/3397', SESSAO);

    // Título do modo edição aparece imediatamente (não depende do fetch).
    expect(
      screen.getByRole('heading', { name: /editar lavagem/i }),
    ).toBeInTheDocument();
    // Após o carregamento, o formulário com os dados é renderizado.
    expect(
      await screen.findByRole('form', { name: /formulário de lavagem/i }),
    ).toBeInTheDocument();
  });
});
