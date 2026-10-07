// features/veiculo/PainelLavagens.test.tsx
//
// Testes de componente do painel de lavagens (Req. 2 — listagem).
//  - R19/R20 / Req. 2.1–2.3: o painel do veículo 101 lista suas duas lavagens
//    com as colunas Tipo / Data / Km / Valor.
//  - R10 / Req. 2.4: a lavagem interna (sem valor) exibe "—" na coluna Valor.
//  - R16 / Req. 2.8: o Km Atual read-only aparece no topo.
//  - R22 / Req. 3.1: há um botão "Incluir Lavagem".
//  - R21 / Req. 3.3: cada linha tem um link de edição para a lavagem.
//  - Req. 2.5: estado vazio (veículo sem lavagens) com CTA.
//  - Req. 2.7: estado de erro (client que rejeita) com "tentar novamente".

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { MockLavagemClient } from '../../api/MockLavagemClient';
import type { LavagemClient } from '../../api/LavagemClient';
import { LavagemClientProvider } from '../../app/LavagemClientProvider';
import { PainelLavagens } from './PainelLavagens';

/**
 * Wrapper de teste: QueryClient (retry desligado), LavagemClientProvider com o
 * client fornecido e MemoryRouter (os `<Link>` das linhas precisam de contexto
 * de rota).
 */
function renderPainel(client: LavagemClient, idVeiculo = 101) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <LavagemClientProvider client={client}>
          <MemoryRouter>{children}</MemoryRouter>
        </LavagemClientProvider>
      </QueryClientProvider>
    );
  }
  return render(<PainelLavagens idVeiculo={idVeiculo} />, { wrapper: Wrapper });
}

/** Client stub que sempre rejeita, para exercitar o estado de erro (Req. 2.7). */
function criarClientComFalha(): LavagemClient {
  const falhar = () => Promise.reject(new Error('falha de rede simulada'));
  return {
    listarLavagens: falhar,
    obterVeiculo: falhar,
    obterLavagem: falhar,
    listarTipos: falhar,
    listarPostos: falhar,
    criarLavagem: falhar,
    atualizarLavagem: falhar,
    excluirLavagem: falhar,
  } as unknown as LavagemClient;
}

/** Client mock cujo veículo não tem lavagens, para o estado vazio (Req. 2.5). */
function criarClientSemLavagens(idVeiculo: number): LavagemClient {
  const base = new MockLavagemClient({ latenciaMs: 0 });
  return {
    ...base,
    listarLavagens: (id: number) =>
      id === idVeiculo ? Promise.resolve([]) : base.listarLavagens(id),
    obterVeiculo: (id: number) => base.obterVeiculo(id),
    listarTipos: () => base.listarTipos(),
  } as unknown as LavagemClient;
}

describe('PainelLavagens — listagem (R19/R20 — Req. 2.1–2.3)', () => {
  it('lista as duas lavagens do veículo 101 com Tipo / Data / Km / Valor', async () => {
    renderPainel(new MockLavagemClient({ latenciaMs: 0 }));

    // A tabela aparece quando a lista carrega.
    const tabela = await screen.findByRole('table');
    const linhas = within(tabela).getAllByRole('row');
    // 1 linha de cabeçalho + 2 lavagens do 101.
    expect(linhas).toHaveLength(3);

    // Cabeçalhos de coluna acessíveis (th scope="col").
    expect(
      within(tabela).getByRole('columnheader', { name: 'Tipo de Lavagem' }),
    ).toBeInTheDocument();
    expect(
      within(tabela).getByRole('columnheader', { name: 'Data' }),
    ).toBeInTheDocument();
    expect(
      within(tabela).getByRole('columnheader', { name: 'Odômetro (Km)' }),
    ).toBeInTheDocument();
    expect(
      within(tabela).getByRole('columnheader', { name: 'Valor' }),
    ).toBeInTheDocument();

    // Ordenado por data: 2026-08-20 (interna, Simples) antes de 2026-09-01
    // (externa, Completa, R$ 60,00).
    expect(screen.getByText('20/08/2026')).toBeInTheDocument();
    expect(screen.getByText('01/09/2026')).toBeInTheDocument();
    // Descrição do tipo resolvida pelo mapa de tipos (R20).
    expect(screen.getByText('Simples')).toBeInTheDocument();
    expect(screen.getByText('Completa')).toBeInTheDocument();
    // Km formatado com separador de milhar.
    expect(screen.getByText('45.000')).toBeInTheDocument();
    expect(screen.getByText('44.120')).toBeInTheDocument();
    // Valor da lavagem externa em BRL.
    expect(screen.getByText(/R\$\s?60,00/)).toBeInTheDocument();
  });

  it('exibe "—" no valor da lavagem interna (R10 / Req. 2.4)', async () => {
    renderPainel(new MockLavagemClient({ latenciaMs: 0 }));

    const tabela = await screen.findByRole('table');
    // A lavagem interna é a 3400 (2026-08-20). Localiza a linha pela data e
    // confere que a célula de valor exibe o placeholder "—".
    const celulaData = within(tabela).getByText('20/08/2026');
    const linhaInterna = celulaData.closest('tr')!;
    expect(within(linhaInterna).getByText('—')).toBeInTheDocument();
    // A lavagem externa NÃO mostra "—" no valor (mostra R$).
    expect(within(linhaInterna).queryByText(/R\$/)).not.toBeInTheDocument();
  });

  it('exibe o Km Atual read-only do veículo (R16 / Req. 2.8)', async () => {
    renderPainel(new MockLavagemClient({ latenciaMs: 0 }));

    // kmAtual do 101 = 45210 → "45.210".
    await waitFor(() =>
      expect(screen.getByText('45.210')).toBeInTheDocument(),
    );
    expect(screen.getByText('Km Atual:')).toBeInTheDocument();
    expect(screen.getByText('(somente leitura)')).toBeInTheDocument();
  });

  it('oferece o botão "Incluir Lavagem" (R22 / Req. 3.1)', async () => {
    renderPainel(new MockLavagemClient({ latenciaMs: 0 }));

    expect(
      screen.getByRole('button', { name: 'Incluir Lavagem' }),
    ).toBeInTheDocument();
    // Aguarda a lista estabilizar para o teste não deixar queries pendentes.
    await screen.findByRole('table');
  });

  it('cada linha tem um link de edição para a lavagem (R21 / Req. 3.3)', async () => {
    renderPainel(new MockLavagemClient({ latenciaMs: 0 }));

    const tabela = await screen.findByRole('table');
    const links = within(tabela).getAllByRole('link', { name: /Editar/i });
    expect(links).toHaveLength(2);
    // Os links apontam para as rotas de edição das lavagens do 101 (3397/3400).
    const hrefs = links.map((l) => l.getAttribute('href'));
    expect(hrefs).toContain('/veiculos/101/lavagens/3397');
    expect(hrefs).toContain('/veiculos/101/lavagens/3400');
  });
});

describe('PainelLavagens — estado vazio (Req. 2.5)', () => {
  it('exibe orientação para incluir a primeira lavagem quando não há lavagens', async () => {
    renderPainel(criarClientSemLavagens(101));

    expect(
      await screen.findByText('Nenhuma lavagem registrada'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Incluir primeira lavagem' }),
    ).toBeInTheDocument();
    // Sem tabela no estado vazio.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('PainelLavagens — estado de erro (Req. 2.7)', () => {
  it('exibe mensagem de erro e ação "tentar novamente" quando a busca falha', async () => {
    renderPainel(criarClientComFalha());

    // O ErrorState é um role="alert".
    const alerta = await screen.findByRole('alert');
    expect(alerta).toBeInTheDocument();
    expect(
      within(alerta).getByRole('button', { name: 'Tentar novamente' }),
    ).toBeInTheDocument();
    // Sem tabela no estado de erro.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
