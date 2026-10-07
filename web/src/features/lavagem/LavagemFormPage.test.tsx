// features/lavagem/LavagemFormPage.test.tsx
//
// Testes da página HOST do formulário de lavagem (tarefa 8.2):
//  - Req. 3.2/3.4/R22: modo INCLUSÃO (rota .../lavagens/nova) — título "Nova
//    lavagem" + o formulário; salvar uma interna válida CRIA e NAVEGA de volta
//    para /veiculos/:idVeiculo (R18).
//  - Req. 3.3/3.4/R21: modo EDIÇÃO (rota .../lavagens/:idLavagem) — carrega a
//    lavagem por id (findBy pelos valores), título "Editar lavagem"; salvar
//    ATUALIZA e NAVEGA de volta (R18).
//
// Harness: QueryClient (retry off) + LavagemClientProvider(MockLavagemClient
// latenciaMs:0) + MemoryRouter com Routes para as rotas de formulário e para a
// rota de destino /veiculos/:idVeiculo (um sentinela confirma que a navegação
// pós-sucesso de fato chegou lá). Usa o DOMÍNIO REAL via lavagemResolver — sem
// mock de regra.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Lavagem } from '../../api/types';
import { MockLavagemClient } from '../../api/MockLavagemClient';
import { LavagemClientProvider } from '../../app/LavagemClientProvider';
import { ToastProvider } from '../../app/ToastRegion';
import { LavagemFormPage } from './LavagemFormPage';

/** Rota de DESTINO: um sentinela confirma que a navegação pós-sucesso chegou. */
function DestinoVeiculo() {
  return <div data-testid="destino-veiculo">Painel do veículo (destino)</div>;
}

/**
 * Monta a página numa pilha com QueryClient + LavagemClientProvider +
 * MemoryRouter. `entrada` controla a rota inicial; o `client` é injetado para
 * que o teste possa espionar `criarLavagem`/`atualizarLavagem`.
 */
function montar(entrada: string, client: MockLavagemClient) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <LavagemClientProvider client={client}>
          {/* ToastProvider: o host usa useToast para o erro de salvamento
              (Req. 8.7). Em runtime vem de providers.tsx; nos testes é injetado
              aqui para que useToast funcione. */}
          <ToastProvider duracaoMs={0}>
            <MemoryRouter initialEntries={[entrada]}>{children}</MemoryRouter>
          </ToastProvider>
        </LavagemClientProvider>
      </QueryClientProvider>
    );
  }

  return render(
    <Routes>
      <Route
        path="/veiculos/:idVeiculo/lavagens/nova"
        element={<LavagemFormPage />}
      />
      <Route
        path="/veiculos/:idVeiculo/lavagens/:idLavagem"
        element={<LavagemFormPage />}
      />
      <Route path="/veiculos/:idVeiculo" element={<DestinoVeiculo />} />
    </Routes>,
    { wrapper: Wrapper },
  );
}

/** Preenche os obrigatórios base (tipo/data/km) de uma lavagem interna válida. */
async function preencherInternaValida() {
  // Aguarda os tipos popularem para selecionar uma opção real do mock.
  await screen.findByRole('option', { name: 'Completa' });
  fireEvent.change(screen.getByLabelText(/tipo de lavagem/i), {
    target: { value: '2' },
  });
  fireEvent.change(screen.getByLabelText(/data da lavagem/i), {
    target: { value: '2026-10-10' },
  });
  fireEvent.change(screen.getByLabelText(/odômetro/i), {
    target: { value: '46000' },
  });
}

describe('LavagemFormPage — modo inclusão (Req. 3.2/3.4 / R22)', () => {
  it('renderiza o título "Nova lavagem" e o formulário na rota /lavagens/nova', async () => {
    const client = new MockLavagemClient({ latenciaMs: 0 });
    montar('/veiculos/101/lavagens/nova', client);

    expect(
      screen.getByRole('heading', { name: /nova lavagem/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('form', { name: /formulário de lavagem/i }),
    ).toBeInTheDocument();
  });

  it('salvar uma interna válida cria a lavagem e navega de volta a /veiculos/101 (R17/R18)', async () => {
    const client = new MockLavagemClient({ latenciaMs: 0 });
    const spyCriar = vi.spyOn(client, 'criarLavagem');
    montar('/veiculos/101/lavagens/nova', client);

    await preencherInternaValida();
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    // Navegou para a rota de destino (sentinela), confirmando o retorno (R18).
    expect(await screen.findByTestId('destino-veiculo')).toBeInTheDocument();

    // E a criação (POST) foi chamada com o payload da interna (R17/Req. 8.1).
    expect(spyCriar).toHaveBeenCalledTimes(1);
    expect(spyCriar).toHaveBeenCalledWith(
      expect.objectContaining({
        idVeiculo: 101,
        idTipoLavagem: 2,
        dtLavagem: '2026-10-10',
        kmLavagem: 46000,
        propriaUnidade: 'S',
      }),
    );
  });
});

describe('LavagemFormPage — modo edição (Req. 3.3/3.4 / R21)', () => {
  it('carrega a lavagem 3397 (veículo 101) e exibe o título "Editar lavagem" com os dados', async () => {
    const client = new MockLavagemClient({ latenciaMs: 0 });
    montar('/veiculos/101/lavagens/3397', client);

    // Título do modo edição (Req. 3.4) — presente antes mesmo do fetch resolver.
    expect(
      screen.getByRole('heading', { name: /editar lavagem/i }),
    ).toBeInTheDocument();

    // Após o carregamento (R21), os valores da lavagem 3397 populam os campos.
    // 3397: externa (propriaUnidade 'N'), tipo 2, data 2026-09-01, km 45000.
    const campoData = (await screen.findByLabelText(
      /data da lavagem/i,
    )) as HTMLInputElement;
    await waitFor(() => expect(campoData.value).toBe('2026-09-01'));

    const campoKm = screen.getByLabelText(/odômetro/i) as HTMLInputElement;
    expect(campoKm.value).toBe('45000');

    // Como é externa, o campo valor aparece com o valor carregado.
    expect(screen.getByLabelText(/valor/i)).toBeInTheDocument();
  });

  it('salvar em edição atualiza a lavagem e navega de volta a /veiculos/101 (R17/R18)', async () => {
    const client = new MockLavagemClient({ latenciaMs: 0 });
    const spyAtualizar = vi.spyOn(client, 'atualizarLavagem');
    montar('/veiculos/101/lavagens/3397', client);

    // Aguarda o carregamento dos dados (campo data preenchido com o valor real).
    const campoData = (await screen.findByLabelText(
      /data da lavagem/i,
    )) as HTMLInputElement;
    await waitFor(() => expect(campoData.value).toBe('2026-09-01'));

    // Altera o odômetro e salva.
    fireEvent.change(screen.getByLabelText(/odômetro/i), {
      target: { value: '45500' },
    });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    // Navegou de volta ao painel (R18).
    expect(await screen.findByTestId('destino-veiculo')).toBeInTheDocument();

    // Chamou atualizar (PUT) com o id da rota e o novo km (R17/Req. 8.2).
    expect(spyAtualizar).toHaveBeenCalledTimes(1);
    const [idArg, dadosArg] = spyAtualizar.mock.calls[0];
    expect(idArg).toBe(3397);
    expect(dadosArg).toMatchObject({
      idVeiculo: 101,
      kmLavagem: 45500,
      propriaUnidade: 'N',
    });
  });

  it('exibe erro (ErrorState) quando a lavagem não existe', async () => {
    const client = new MockLavagemClient({ latenciaMs: 0 });
    montar('/veiculos/101/lavagens/999999', client);

    // Título do modo edição aparece de qualquer forma (Req. 3.4)...
    expect(
      screen.getByRole('heading', { name: /editar lavagem/i }),
    ).toBeInTheDocument();
    // ...e o carregamento falha → ErrorState (role alert) com nova tentativa.
    expect(
      await screen.findByText(/não foi possível carregar a lavagem/i),
    ).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tarefa 8.3 — Estados de salvamento (Req. 8.6/8.7)
//
//  - Req. 8.6: ENQUANTO salva, o botão fica desabilitado e indica progresso
//    ("Salvando…"), evitando envio duplicado. Usamos um client cujo
//    `criarLavagem` fica pendente (deferred) para observar o estado intermediário.
//  - Req. 8.7: QUANDO falha, os dados preenchidos permanecem (o form segue
//    montado, não navega), um toast de erro é exibido e o botão volta a habilitar
//    para nova tentativa. Usamos um client cujo `criarLavagem` rejeita.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Client cujo `criarLavagem` só resolve quando o teste chamar `resolver(...)` —
 * permite asserir o estado "salvando" (botão desabilitado) antes de concluir.
 */
class ClientCriarPendente extends MockLavagemClient {
  resolver!: (lavagem: Lavagem) => void;
  readonly promessa: Promise<Lavagem>;

  constructor() {
    super({ latenciaMs: 0 });
    this.promessa = new Promise<Lavagem>((resolve) => {
      this.resolver = resolve;
    });
  }

  override criarLavagem(dados: Lavagem): Promise<Lavagem> {
    // Ignora a promessa interna do mock: devolve a controlada pelo teste.
    void dados;
    return this.promessa;
  }
}

/** Client cujo `criarLavagem` sempre rejeita (falha de salvamento — Req. 8.7). */
class ClientCriarComErro extends MockLavagemClient {
  constructor() {
    super({ latenciaMs: 0 });
  }

  override criarLavagem(): Promise<Lavagem> {
    return Promise.reject(new Error('Falha ao salvar.'));
  }
}

describe('LavagemFormPage — estados de salvamento (Req. 8.6/8.7)', () => {
  it('Req. 8.6: durante o envio o botão fica desabilitado e indica "Salvando…"', async () => {
    const client = new ClientCriarPendente();
    montar('/veiculos/101/lavagens/nova', client);

    await preencherInternaValida();

    const botao = screen.getByRole('button', { name: /salvar/i });
    expect(botao).toBeEnabled();

    fireEvent.click(botao);

    // Enquanto a criação está pendente: botão desabilitado + texto "Salvando…".
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /salvando/i }),
      ).toBeDisabled();
    });

    // Conclui a operação pendente → navega de volta ao painel (R18).
    client.resolver({
      idLavagem: 9999,
      idVeiculo: 101,
      idTipoLavagem: 2,
      dtLavagem: '2026-10-10',
      kmLavagem: 46000,
      propriaUnidade: 'S',
    });

    expect(await screen.findByTestId('destino-veiculo')).toBeInTheDocument();
  });

  it('Req. 8.6: clicar novamente durante o envio não dispara segundo POST (sem envio duplicado)', async () => {
    const client = new ClientCriarPendente();
    const spyCriar = vi.spyOn(client, 'criarLavagem');
    montar('/veiculos/101/lavagens/nova', client);

    await preencherInternaValida();

    const botao = screen.getByRole('button', { name: /salvar/i });
    fireEvent.click(botao);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /salvando/i }),
      ).toBeDisabled();
    });

    // Segundo clique no botão desabilitado não deve chamar criarLavagem de novo.
    fireEvent.click(screen.getByRole('button', { name: /salvando/i }));

    expect(spyCriar).toHaveBeenCalledTimes(1);

    // Encerra a operação para não deixar promessa pendente.
    client.resolver({
      idLavagem: 9999,
      idVeiculo: 101,
      idTipoLavagem: 2,
      dtLavagem: '2026-10-10',
      kmLavagem: 46000,
      propriaUnidade: 'S',
    });
    await screen.findByTestId('destino-veiculo');
  });

  it('Req. 8.7: falha mantém os dados, exibe toast de erro, NÃO navega e reabilita o botão', async () => {
    const client = new ClientCriarComErro();
    montar('/veiculos/101/lavagens/nova', client);

    await preencherInternaValida();
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    // Toast de erro exibido (Req. 8.7 / Req. 10.1).
    expect(
      await screen.findByText(/não foi possível salvar a lavagem/i),
    ).toBeInTheDocument();

    // NÃO navegou: o sentinela de destino não aparece.
    expect(screen.queryByTestId('destino-veiculo')).not.toBeInTheDocument();

    // Os dados preenchidos permanecem no formulário (ex.: km).
    const campoKm = screen.getByLabelText(/odômetro/i) as HTMLInputElement;
    expect(campoKm.value).toBe('46000');

    // O botão volta a habilitar, permitindo nova tentativa.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /salvar/i })).toBeEnabled();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tarefa 8.4 — ConfirmDeleteDialog + exclusão (Req. 9.1–9.5 / R17/R18)
//
//  - Req. 9.1: a ação "Excluir" só aparece no modo EDIÇÃO (não na inclusão).
//  - Req. 9.2: acionar "Excluir" abre o diálogo de confirmação (não exclui ainda).
//  - Req. 9.3: confirmar exclui (client.excluirLavagem com o id da rota) e
//    navega de volta a /veiculos/:idVeiculo (sentinela de destino).
//  - Req. 9.4: cancelar fecha o diálogo e NÃO exclui.
//  - Req. 9.5: falha na exclusão exibe toast de erro e NÃO navega.
// ─────────────────────────────────────────────────────────────────────────────

/** Client cujo `excluirLavagem` sempre rejeita (falha de exclusão — Req. 9.5). */
class ClientExcluirComErro extends MockLavagemClient {
  constructor() {
    super({ latenciaMs: 0 });
  }

  override excluirLavagem(): Promise<void> {
    return Promise.reject(new Error('Falha ao excluir.'));
  }
}

/** Aguarda o carregamento da lavagem 3397 (campo data preenchido). */
async function aguardarCarregarEdicao() {
  const campoData = (await screen.findByLabelText(
    /data da lavagem/i,
  )) as HTMLInputElement;
  await waitFor(() => expect(campoData.value).toBe('2026-09-01'));
}

describe('LavagemFormPage — exclusão (Req. 9.1–9.5 / R17/R18)', () => {
  it('Req. 9.1: o botão "Excluir" NÃO aparece no modo inclusão', async () => {
    const client = new MockLavagemClient({ latenciaMs: 0 });
    montar('/veiculos/101/lavagens/nova', client);

    await screen.findByRole('form', { name: /formulário de lavagem/i });
    expect(
      screen.queryByRole('button', { name: /excluir/i }),
    ).not.toBeInTheDocument();
  });

  it('Req. 9.1/9.2: na edição, "Excluir" aparece e abre o diálogo de confirmação', async () => {
    const client = new MockLavagemClient({ latenciaMs: 0 });
    const spyExcluir = vi.spyOn(client, 'excluirLavagem');
    montar('/veiculos/101/lavagens/3397', client);

    await aguardarCarregarEdicao();

    const botaoExcluir = screen.getByRole('button', { name: /excluir/i });
    expect(botaoExcluir).toBeInTheDocument();

    // Antes de clicar, o diálogo não existe.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    fireEvent.click(botaoExcluir);

    // Abriu o diálogo (Req. 9.2) e NÃO excluiu ainda.
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(spyExcluir).not.toHaveBeenCalled();
  });

  it('Req. 9.3/R17/R18: confirmar exclui a lavagem 3397 e navega de volta ao painel', async () => {
    const client = new MockLavagemClient({ latenciaMs: 0 });
    const spyExcluir = vi.spyOn(client, 'excluirLavagem');
    montar('/veiculos/101/lavagens/3397', client);

    await aguardarCarregarEdicao();

    fireEvent.click(screen.getByRole('button', { name: /excluir/i }));

    // No diálogo, confirma (o botão destrutivo dentro do alertdialog).
    const dialogo = screen.getByRole('alertdialog');
    const confirmar = within(dialogo).getByRole('button', { name: /excluir/i });
    fireEvent.click(confirmar);

    // Navegou de volta ao painel (R18).
    expect(await screen.findByTestId('destino-veiculo')).toBeInTheDocument();

    // Chamou excluir (DELETE) com o id da rota (R17).
    expect(spyExcluir).toHaveBeenCalledTimes(1);
    expect(spyExcluir).toHaveBeenCalledWith(3397);
  });

  it('Req. 9.4: cancelar fecha o diálogo e NÃO exclui', async () => {
    const client = new MockLavagemClient({ latenciaMs: 0 });
    const spyExcluir = vi.spyOn(client, 'excluirLavagem');
    montar('/veiculos/101/lavagens/3397', client);

    await aguardarCarregarEdicao();

    fireEvent.click(screen.getByRole('button', { name: /excluir/i }));

    const dialogo = screen.getByRole('alertdialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: /cancelar/i }));

    // Diálogo fechou e nada foi excluído.
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(spyExcluir).not.toHaveBeenCalled();

    // Não navegou: o form segue montado.
    expect(screen.queryByTestId('destino-veiculo')).not.toBeInTheDocument();
  });

  it('Req. 9.5: falha na exclusão exibe toast de erro e NÃO navega', async () => {
    const client = new ClientExcluirComErro();
    montar('/veiculos/101/lavagens/3397', client);

    await aguardarCarregarEdicao();

    fireEvent.click(screen.getByRole('button', { name: /excluir/i }));

    const dialogo = screen.getByRole('alertdialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: /excluir/i }));

    // Toast de erro (Req. 9.5 / Req. 10.1).
    expect(
      await screen.findByText(/não foi possível excluir a lavagem/i),
    ).toBeInTheDocument();

    // NÃO navegou: o sentinela de destino não aparece (a lavagem permanece).
    expect(screen.queryByTestId('destino-veiculo')).not.toBeInTheDocument();
  });
});
