// features/veiculo/VeiculoPage.test.tsx
//
// Testes de componente da tela do veículo (tarefa 5.3 — Req. 2/3, R18/R23).
//  - Lê o parâmetro de rota `:idVeiculo` e monta o PainelLavagens (Km Atual /
//    tabela) para o veículo correto (R16/R19).
//  - Exibe a identificação do usuário logado no cabeçalho (Req. 1.6) e um botão
//    "Sair" (Req. 1.5).
//  - Ao chegar com `location.state.sucesso`, exibe um toast de SUCESSO e limpa
//    o state para não repetir (Req. 8.4 / R18/R23).
//
// Harness: QueryClient (retry off) + LavagemClientProvider (MockLavagemClient
// sem latência) + AuthProvider (sessaoInicial) + ToastProvider + MemoryRouter
// com a rota real `/veiculos/:idVeiculo`, de modo que `useParams` resolva o id.

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, type AuthAdapter, type Sessao } from '../../auth/AuthProvider';
import { MockLavagemClient } from '../../api/MockLavagemClient';
import { LavagemClientProvider } from '../../app/LavagemClientProvider';
import { ToastProvider } from '../../app/ToastRegion';
import { VeiculoPage } from './VeiculoPage';

const adapterNunca: AuthAdapter = {
  autenticar: async () => {
    throw new Error('não deveria ser chamado nestes testes');
  },
};

const SESSAO: Sessao = {
  token: 'jwt-de-teste',
  usuario: { nome: 'Atendente Demo', email: 'atendente@mpf.mp.br' },
};

/**
 * Monta a VeiculoPage na rota real `/veiculos/:idVeiculo`, com a árvore de
 * providers que o painel consome. `entrada` pode ser um caminho (string) ou um
 * objeto `{ pathname, state }` para exercitar o toast de sucesso ao voltar.
 */
function montar(
  entrada: string | { pathname: string; state?: unknown },
  sessaoInicial: Sessao | null = SESSAO,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const client = new MockLavagemClient({ latenciaMs: 0 });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthProvider adapter={adapterNunca} sessaoInicial={sessaoInicial}>
        <QueryClientProvider client={queryClient}>
          <LavagemClientProvider client={client}>
            <ToastProvider duracaoMs={0}>
              <MemoryRouter initialEntries={[entrada]}>
                <Routes>
                  <Route path="/veiculos/:idVeiculo" element={children} />
                </Routes>
              </MemoryRouter>
            </ToastProvider>
          </LavagemClientProvider>
        </QueryClientProvider>
      </AuthProvider>
    );
  }

  return render(<VeiculoPage />, { wrapper: Wrapper });
}

describe('VeiculoPage — host do painel (Req. 2/3)', () => {
  it('lê o idVeiculo da rota e renderiza o painel do veículo (Km Atual / tabela)', async () => {
    montar('/veiculos/101');

    // Título do painel hospedado.
    expect(
      await screen.findByRole('heading', { name: /lavagens do veículo/i }),
    ).toBeInTheDocument();
    // Km Atual read-only do 101 (R16): kmAtual 45210 → "45.210".
    expect(screen.getByText('Km Atual:')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('45.210')).toBeInTheDocument(),
    );
    // A tabela de lavagens do 101 aparece (R19/R20).
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('exibe a identificação do usuário logado e o botão "Sair" (Req. 1.5/1.6)', async () => {
    montar('/veiculos/101');

    expect(screen.getByText('Atendente Demo')).toBeInTheDocument();
    expect(screen.getByText('atendente@mpf.mp.br')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sair/i })).toBeInTheDocument();
    // Aguarda a lista estabilizar para não deixar queries pendentes.
    await screen.findByRole('table');
  });
});

describe('VeiculoPage — toast de sucesso ao voltar (Req. 8.4 / R18/R23)', () => {
  it('exibe toast de sucesso quando a navegação chega com state.sucesso', async () => {
    montar({
      pathname: '/veiculos/101',
      state: { sucesso: 'Lavagem incluída com sucesso' },
    });

    // O toast de sucesso aparece na região aria-live.
    expect(
      await screen.findByText('Lavagem incluída com sucesso'),
    ).toBeInTheDocument();
    // O painel segue renderizando normalmente abaixo do toast.
    expect(
      screen.getByRole('heading', { name: /lavagens do veículo/i }),
    ).toBeInTheDocument();
    await screen.findByRole('table');
  });

  it('não exibe toast quando a navegação chega sem state de sucesso', async () => {
    montar('/veiculos/101');

    // Garante que o painel montou (fluxo normal) e nenhum toast de sucesso surgiu.
    await screen.findByRole('table');
    expect(
      screen.queryByText(/incluída com sucesso/i),
    ).not.toBeInTheDocument();
  });
});
