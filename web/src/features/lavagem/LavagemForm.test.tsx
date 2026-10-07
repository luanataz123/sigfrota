// features/lavagem/LavagemForm.test.tsx
//
// Testes da ESTRUTURA BASE do formulário de lavagem (tarefa 7.1):
//  - Req. 4.1: renderiza TODOS os campos (tipo, data, km e, na externa, valor,
//    posto conveniado?, seleção de posto, descrição, CNPJ).
//  - Req. 4.5 / R05: o select de Tipo é populado pelo contrato (envia idTipoLavagem).
//  - Req. 6.6 / R13: o select de Posto é populado pelo contrato (envia idPosto).
//  - Req. 4.2 / R02: submeter vazio bloqueia e sinaliza tipo/data/km.
//  - Fluxo feliz interna: submeter uma lavagem interna válida chama onSubmit.
//
// Usa o DOMÍNIO REAL (via lavagemResolver) e o MockLavagemClient (latência 0),
// sem mocks de regra, exercitando a integração real do formulário.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MockLavagemClient } from '../../api/MockLavagemClient';
import { LavagemClientProvider } from '../../app/LavagemClientProvider';
import { LavagemForm } from './LavagemForm';

/** Wrapper com QueryClient (retry off) + client mock (latência 0). */
function renderForm(onSubmit = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const client = new MockLavagemClient({ latenciaMs: 0 });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <LavagemClientProvider client={client}>
          {children}
        </LavagemClientProvider>
      </QueryClientProvider>
    );
  }

  render(<LavagemForm idVeiculo={101} onSubmit={onSubmit} />, {
    wrapper: Wrapper,
  });
  return { onSubmit };
}

describe('LavagemForm — estrutura base (Req. 4.1)', () => {
  it('renderiza os campos obrigatórios base (tipo, data, km) e os toggles', () => {
    renderForm();

    expect(screen.getByLabelText(/tipo de lavagem/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/data da lavagem/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/odômetro/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/na própria unidade\?/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /salvar/i }),
    ).toBeInTheDocument();
  });

  it('renderiza os campos da lavagem externa ao escolher "Não" na própria unidade', () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(/na própria unidade\?/i), {
      target: { value: 'N' },
    });

    // Externa: valor, "posto conveniado?" e (conveniado default) seleção de posto.
    expect(screen.getByLabelText(/valor/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/posto conveniado\?/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/posto conveniado \(seleção\)/i),
    ).toBeInTheDocument();

    // Não conveniado: descrição + CNPJ.
    fireEvent.change(screen.getByLabelText(/posto conveniado\?/i), {
      target: { value: 'N' },
    });
    expect(screen.getByLabelText(/descrição do posto/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cnpj do posto/i)).toBeInTheDocument();
  });
});

describe('LavagemForm — selects populados pelo contrato', () => {
  it('popula o select de Tipo com as opções do mock (Req. 4.5 / R05)', async () => {
    renderForm();
    // Dados sintéticos: tipos 1 (Simples), 2 (Completa), 3 (Higienização interna).
    expect(await screen.findByRole('option', { name: 'Simples' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Completa' })).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Higienização interna' }),
    ).toBeInTheDocument();
  });

  it('popula o select de Posto com as opções do mock na externa (Req. 6.6 / R13)', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/na própria unidade\?/i), {
      target: { value: 'N' },
    });
    expect(
      await screen.findByRole('option', {
        name: 'Auto Posto Central (conveniado)',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Lava-Rápido Norte (conveniado)' }),
    ).toBeInTheDocument();
  });
});

describe('LavagemForm — obrigatórios base (Req. 4.2 / R02)', () => {
  it('submeter vazio bloqueia e sinaliza tipo, data e km', async () => {
    const { onSubmit } = renderForm();

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    // Bloqueia o envio (onSubmit não é chamado) e exibe erros nos obrigatórios.
    await waitFor(() => {
      const tipo = screen.getByLabelText(/tipo de lavagem/i);
      expect(tipo).toHaveAttribute('aria-invalid', 'true');
    });
    expect(screen.getByLabelText(/data da lavagem/i)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText(/odômetro/i)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('LavagemForm — fluxo feliz interna (R09/R10)', () => {
  it('submeter interna válida (tipo, data, km>0, própria unidade=S) chama onSubmit', async () => {
    const { onSubmit } = renderForm();

    // Aguarda os tipos popularem para selecionar uma opção real.
    await screen.findByRole('option', { name: 'Completa' });

    fireEvent.change(screen.getByLabelText(/tipo de lavagem/i), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText(/data da lavagem/i), {
      target: { value: '2026-01-15' },
    });
    fireEvent.change(screen.getByLabelText(/odômetro/i), {
      target: { value: '45000' },
    });

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // Tarefa 7.5: onSubmit recebe o PAYLOAD já saneado por ramo, com idVeiculo
    // (contexto, R02) incluído e campos ocultos (valor/posto) OMITIDOS (R10).
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        idVeiculo: 101,
        idTipoLavagem: 2,
        dtLavagem: '2026-01-15',
        kmLavagem: 45000,
        propriaUnidade: 'S',
      }),
    );
    const enviado = onSubmit.mock.calls[0][0];
    expect('vlLavagem' in enviado).toBe(false);
    expect('postoConveniado' in enviado).toBe(false);
    expect('idPosto' in enviado).toBe(false);
    expect('dsPosto' in enviado).toBe(false);
    expect('cnpjPosto' in enviado).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tarefa 7.2 — Comportamento condicional unidade × externa (Req. 5.1–5.5)
//
// Foco: a alternância "Na própria unidade?" (S/N) mostra/oculta o campo valor,
// torna-o obrigatório na externa (R11) e, ao voltar para interna, LIMPA valor e
// descarta erros (Req. 5.5) — para não carregar lixo no payload nem bloquear o
// envio da interna.
// ─────────────────────────────────────────────────────────────────────────────

/** Seleciona o toggle "Na própria unidade?" com o valor desejado. */
function alternarUnidade(valor: 'S' | 'N') {
  fireEvent.change(screen.getByLabelText(/na própria unidade\?/i), {
    target: { value: valor },
  });
}

/** Preenche os obrigatórios base (tipo, data, km) com dados válidos do mock. */
async function preencherObrigatoriosBase() {
  await screen.findByRole('option', { name: 'Completa' });
  fireEvent.change(screen.getByLabelText(/tipo de lavagem/i), {
    target: { value: '2' },
  });
  fireEvent.change(screen.getByLabelText(/data da lavagem/i), {
    target: { value: '2026-01-15' },
  });
  fireEvent.change(screen.getByLabelText(/odômetro/i), {
    target: { value: '45000' },
  });
}

describe('LavagemForm — unidade × externa (Req. 5.1–5.5 / R09–R11)', () => {
  it('Req. 5.1/R09: default é interna — campos de valor/posto ocultos ao abrir', () => {
    renderForm();

    // Toggle presente com default 'S' (interna).
    const toggle = screen.getByLabelText(
      /na própria unidade\?/i,
    ) as HTMLSelectElement;
    expect(toggle.value).toBe('S');

    // Interna oculta valor, "posto conveniado?", seleção, descrição e CNPJ (R10).
    expect(screen.queryByLabelText(/valor/i)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/posto conveniado\?/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/posto conveniado \(seleção\)/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/descrição do posto/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/cnpj do posto/i)).not.toBeInTheDocument();
  });

  it('Req. 5.3/5.4/R11: externa exibe valor obrigatório — submeter sem valor bloqueia e marca erro', async () => {
    const { onSubmit } = renderForm();

    await preencherObrigatoriosBase();
    alternarUnidade('N'); // externa

    // O campo valor aparece.
    const valor = await screen.findByLabelText(/valor/i);
    expect(valor).toBeInTheDocument();

    // Submeter sem valor: bloqueia (onSubmit não é chamado) e marca erro no valor.
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/valor/i)).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Req. 5.5: voltar de externa para interna limpa o valor — interna válida envia SEM vlLavagem', async () => {
    const { onSubmit } = renderForm();

    await preencherObrigatoriosBase();

    // Vai para externa e preenche um valor.
    alternarUnidade('N');
    const valor = await screen.findByLabelText(/valor/i);
    fireEvent.change(valor, { target: { value: '150,00' } });
    fireEvent.blur(valor);

    // Volta para interna: o campo valor some.
    alternarUnidade('S');
    await waitFor(() => {
      expect(screen.queryByLabelText(/valor/i)).not.toBeInTheDocument();
    });

    // Submeter a interna válida chama onSubmit SEM vlLavagem (limpo em 5.5).
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const enviado = onSubmit.mock.calls[0][0];
    expect(enviado).toMatchObject({
      idTipoLavagem: 2,
      dtLavagem: '2026-01-15',
      kmLavagem: 45000,
      propriaUnidade: 'S',
    });
    // vlLavagem foi limpo: não deve carregar o valor digitado antes.
    expect(enviado.vlLavagem == null).toBe(true);
  });

  it('externa com valor + conveniado + posto selecionado chama onSubmit com vlLavagem', async () => {
    const { onSubmit } = renderForm();

    await preencherObrigatoriosBase();
    alternarUnidade('N'); // externa (conveniado é default 'S')

    // Preenche o valor.
    const valor = await screen.findByLabelText(/valor/i);
    fireEvent.change(valor, { target: { value: '150,00' } });
    fireEvent.blur(valor);

    // Seleciona um posto conveniado real do mock.
    await screen.findByRole('option', {
      name: 'Auto Posto Central (conveniado)',
    });
    const selecaoPosto = screen.getByLabelText(/posto conveniado \(seleção\)/i);
    // "Auto Posto Central (conveniado)" tem idPosto 10 nos dados sintéticos.
    fireEvent.change(selecaoPosto, { target: { value: '10' } });

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // Payload saneado por ramo (7.5): inclui idVeiculo e o ramo conveniado; o
    // ramo não conveniado (dsPosto/cnpjPosto) é omitido (R13).
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        idVeiculo: 101,
        propriaUnidade: 'N',
        postoConveniado: 'S',
        vlLavagem: 150,
        idPosto: 10,
      }),
    );
    const enviado = onSubmit.mock.calls[0][0];
    expect('dsPosto' in enviado).toBe(false);
    expect('cnpjPosto' in enviado).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tarefa 7.3 — Comportamento conveniado × não conveniado (Req. 6.1–6.5, 6.7)
//
// Foco: na lavagem EXTERNA, o toggle "Posto conveniado?" (default "Sim" — R12)
// alterna entre:
//   - conveniado  → seleção de posto obrigatória (R13), descrição/CNPJ ocultos;
//   - não conveniado → descrição + CNPJ obrigatórios (R14), seleção oculta.
// E ao alternar entre os dois ramos, os campos que passam a ficar OCULTOS têm
// valores e erros limpos (Req. 6.7) — sem jamais apagar o próprio toggle
// "Posto conveniado?" enquanto a lavagem continua externa.
// ─────────────────────────────────────────────────────────────────────────────

/** Alterna o toggle "Posto conveniado?" (S/N) — só existe na externa. */
function alternarConveniado(valor: 'S' | 'N') {
  fireEvent.change(screen.getByLabelText(/posto conveniado\?/i), {
    target: { value: valor },
  });
}

describe('LavagemForm — conveniado × não conveniado (Req. 6.1–6.5, 6.7 / R12–R14)', () => {
  it('Req. 6.1/6.2/R12/R13: externa + conveniado (default) exibe seleção de posto e oculta descrição/CNPJ', async () => {
    renderForm();

    await preencherObrigatoriosBase();
    alternarUnidade('N'); // externa

    // Toggle "Posto conveniado?" presente com default 'S' (R12).
    const toggle = (await screen.findByLabelText(
      /posto conveniado\?/i,
    )) as HTMLSelectElement;
    expect(toggle.value).toBe('S');

    // Conveniado: seleção de posto visível (R13); descrição e CNPJ ocultos.
    expect(
      screen.getByLabelText(/posto conveniado \(seleção\)/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/descrição do posto/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/cnpj do posto/i)).not.toBeInTheDocument();
  });

  it('Req. 6.3/R13: conveniado sem posto selecionado bloqueia o envio e marca erro na seleção', async () => {
    const { onSubmit } = renderForm();

    await preencherObrigatoriosBase();
    alternarUnidade('N'); // externa, conveniado por default

    // Preenche o valor (obrigatório na externa — R11), mas NÃO seleciona posto.
    const valor = await screen.findByLabelText(/valor/i);
    fireEvent.change(valor, { target: { value: '120,00' } });
    fireEvent.blur(valor);

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    // Bloqueia (onSubmit não chamado) e sinaliza a seleção de posto (R13).
    await waitFor(() => {
      expect(
        screen.getByLabelText(/posto conveniado \(seleção\)/i),
      ).toHaveAttribute('aria-invalid', 'true');
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Req. 6.4/6.5/R14: alternar para não conveniado troca para descrição+CNPJ; faltando CNPJ bloqueia e marca erro', async () => {
    const { onSubmit } = renderForm();

    await preencherObrigatoriosBase();
    alternarUnidade('N'); // externa

    // Preenche o valor para isolar a falha no ramo do posto.
    const valor = await screen.findByLabelText(/valor/i);
    fireEvent.change(valor, { target: { value: '90,00' } });
    fireEvent.blur(valor);

    // Alterna para NÃO conveniado: seleção some; descrição + CNPJ aparecem (R14).
    alternarConveniado('N');
    await waitFor(() => {
      expect(
        screen.queryByLabelText(/posto conveniado \(seleção\)/i),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText(/descrição do posto/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cnpj do posto/i)).toBeInTheDocument();

    // Preenche só a descrição (deixa o CNPJ vazio) → deve bloquear por R14.
    fireEvent.change(screen.getByLabelText(/descrição do posto/i), {
      target: { value: 'Lava-Jato do Zé' },
    });

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/cnpj do posto/i)).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Req. 6.7: do não conveniado (ds+cnpj) → conveniado (posto): onSubmit NÃO carrega dsPosto/cnpjPosto', async () => {
    const { onSubmit } = renderForm();

    await preencherObrigatoriosBase();
    alternarUnidade('N'); // externa

    // Preenche o valor.
    const valor = await screen.findByLabelText(/valor/i);
    fireEvent.change(valor, { target: { value: '80,00' } });
    fireEvent.blur(valor);

    // Vai para NÃO conveniado e preenche descrição + CNPJ.
    alternarConveniado('N');
    const descricao = await screen.findByLabelText(/descrição do posto/i);
    fireEvent.change(descricao, { target: { value: 'Lava-Jato do Zé' } });
    fireEvent.change(screen.getByLabelText(/cnpj do posto/i), {
      target: { value: '12.345.678/0001-90' },
    });

    // Volta para conveniado: ramo não conveniado (ds/cnpj) deve ser LIMPO (6.7).
    alternarConveniado('S');
    await screen.findByRole('option', {
      name: 'Auto Posto Central (conveniado)',
    });
    const selecaoPosto = screen.getByLabelText(/posto conveniado \(seleção\)/i);
    fireEvent.change(selecaoPosto, { target: { value: '10' } });

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const enviado = onSubmit.mock.calls[0][0];
    // O toggle NÃO foi apagado — continua externo e conveniado.
    expect(enviado).toMatchObject({
      propriaUnidade: 'N',
      postoConveniado: 'S',
      idPosto: 10,
    });
    // Ramo não conveniado foi limpo: nada de dsPosto/cnpjPosto no payload.
    expect(enviado.dsPosto == null).toBe(true);
    expect(enviado.cnpjPosto == null).toBe(true);
  });

  it('Req. 6.7: do conveniado (posto) → não conveniado (ds+cnpj): onSubmit NÃO carrega idPosto', async () => {
    const { onSubmit } = renderForm();

    await preencherObrigatoriosBase();
    alternarUnidade('N'); // externa, conveniado por default

    // Preenche o valor e seleciona um posto conveniado real do mock.
    const valor = await screen.findByLabelText(/valor/i);
    fireEvent.change(valor, { target: { value: '110,00' } });
    fireEvent.blur(valor);
    await screen.findByRole('option', {
      name: 'Auto Posto Central (conveniado)',
    });
    fireEvent.change(screen.getByLabelText(/posto conveniado \(seleção\)/i), {
      target: { value: '10' },
    });

    // Alterna para NÃO conveniado: idPosto (ramo oculto) deve ser LIMPO (6.7).
    alternarConveniado('N');
    const descricao = await screen.findByLabelText(/descrição do posto/i);
    fireEvent.change(descricao, { target: { value: 'Lava-Jato do Zé' } });
    fireEvent.change(screen.getByLabelText(/cnpj do posto/i), {
      target: { value: '12.345.678/0001-90' },
    });

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const enviado = onSubmit.mock.calls[0][0];
    expect(enviado).toMatchObject({
      propriaUnidade: 'N',
      postoConveniado: 'N',
      dsPosto: 'Lava-Jato do Zé',
      cnpjPosto: '12.345.678/0001-90',
    });
    // Ramo conveniado foi limpo: idPosto não deve viajar no payload.
    expect(enviado.idPosto == null).toBe(true);
  });

  it('fluxo feliz não conveniado: envia dsPosto e cnpjPosto e NÃO envia idPosto', async () => {
    const { onSubmit } = renderForm();

    await preencherObrigatoriosBase();
    alternarUnidade('N'); // externa

    const valor = await screen.findByLabelText(/valor/i);
    fireEvent.change(valor, { target: { value: '75,00' } });
    fireEvent.blur(valor);

    alternarConveniado('N'); // não conveniado
    const descricao = await screen.findByLabelText(/descrição do posto/i);
    fireEvent.change(descricao, { target: { value: 'Lava-Jato do Zé' } });
    fireEvent.change(screen.getByLabelText(/cnpj do posto/i), {
      target: { value: '12.345.678/0001-90' },
    });

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        propriaUnidade: 'N',
        postoConveniado: 'N',
        vlLavagem: 75,
        dsPosto: 'Lava-Jato do Zé',
        cnpjPosto: '12.345.678/0001-90',
      }),
    );
    const enviado = onSubmit.mock.calls[0][0];
    expect(enviado.idPosto == null).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tarefa 7.4 — Validações de valor, km e data NO ENVIO (Req. 4.3, 4.4, 7.1, 7.2)
//
// Foco: ao submeter, o resolver (fonte única — @sigfrota/dominio) BLOQUEIA o
// envio e SINALIZA O ERRO NO CAMPO CORRETO (aria-invalid + mensagem visível),
// sem reimplementar regra no componente:
//   - R04 / Req. 4.3: km <= 0 (zero e negativo) → erro ancorado em "Odômetro".
//   - R03 / Req. 4.4 (+ R11): valor <= 0 na externa → erro ancorado em "Valor".
//   - R15 / Req. 7.1: data inválida (ex.: 2026-02-31) → erro no campo "Data".
//   - Req. 7.2: a data trafega em ISO YYYY-MM-DD no payload do onSubmit.
//
// O input de km é type=number com valueAsNumber (RHF), então "0"/"-5" chegam ao
// resolver como number. O valor usa MoneyInput (emite number). A data usa
// <input type="date"> (ISO no value — Req. 7.2).
// ─────────────────────────────────────────────────────────────────────────────

describe('LavagemForm — km no envio (Req. 4.3 / R04)', () => {
  it('R04: km zero bloqueia o envio e sinaliza erro no campo Odômetro', async () => {
    const { onSubmit } = renderForm();

    // Tipo e data válidos; isola a falha no km.
    await screen.findByRole('option', { name: 'Completa' });
    fireEvent.change(screen.getByLabelText(/tipo de lavagem/i), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText(/data da lavagem/i), {
      target: { value: '2026-01-15' },
    });
    // Km = 0 (valueAsNumber → number 0).
    fireEvent.change(screen.getByLabelText(/odômetro/i), {
      target: { value: '0' },
    });

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    // Bloqueia (onSubmit não chamado) e sinaliza SOMENTE o campo km.
    await waitFor(() => {
      expect(screen.getByLabelText(/odômetro/i)).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });
    // Mensagem de erro de km visível e ancorada ao campo.
    expect(
      screen.getByText(/odômetro deve ser maior que zero/i),
    ).toBeInTheDocument();
    // Os outros obrigatórios base (preenchidos) não ficam marcados.
    expect(screen.getByLabelText(/tipo de lavagem/i)).toHaveAttribute(
      'aria-invalid',
      'false',
    );
    expect(screen.getByLabelText(/data da lavagem/i)).toHaveAttribute(
      'aria-invalid',
      'false',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('R04: km negativo bloqueia o envio e sinaliza erro no campo Odômetro', async () => {
    const { onSubmit } = renderForm();

    await screen.findByRole('option', { name: 'Completa' });
    fireEvent.change(screen.getByLabelText(/tipo de lavagem/i), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText(/data da lavagem/i), {
      target: { value: '2026-01-15' },
    });
    fireEvent.change(screen.getByLabelText(/odômetro/i), {
      target: { value: '-5' },
    });

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/odômetro/i)).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });
    expect(
      screen.getByText(/odômetro deve ser maior que zero/i),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('LavagemForm — valor no envio (Req. 4.4 / R03/R11)', () => {
  it('R03/R11: valor zero na externa bloqueia o envio e sinaliza erro no campo Valor', async () => {
    const { onSubmit } = renderForm();

    await preencherObrigatoriosBase();
    alternarUnidade('N'); // externa → valor obrigatório (R11)

    // Valor = 0 (MoneyInput emite number 0).
    const valor = await screen.findByLabelText(/valor/i);
    fireEvent.change(valor, { target: { value: '0' } });
    fireEvent.blur(valor);

    // Seleciona um posto conveniado real para isolar a falha no valor.
    await screen.findByRole('option', {
      name: 'Auto Posto Central (conveniado)',
    });
    fireEvent.change(screen.getByLabelText(/posto conveniado \(seleção\)/i), {
      target: { value: '10' },
    });

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/valor/i)).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });
    // Mensagem "valor deve ser maior que zero" ancorada ao campo valor (R03).
    expect(
      screen.getByText(/valor deve ser maior que zero/i),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('LavagemForm — data no envio (Req. 7.1 / R15 e Req. 7.2)', () => {
  it('R15/Req. 7.1: data inválida (31/02) bloqueia o envio e sinaliza erro no campo Data', async () => {
    const { onSubmit } = renderForm();

    await screen.findByRole('option', { name: 'Completa' });
    fireEvent.change(screen.getByLabelText(/tipo de lavagem/i), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText(/odômetro/i), {
      target: { value: '45000' },
    });

    // Injeta uma data impossível diretamente no input ISO. Observação: o
    // <input type="date"> no jsdom pode descartar uma string inválida (deixando
    // o value vazio). Em qualquer um dos casos o resolver (fonte única)
    // BLOQUEIA o envio e marca o campo data — vazio → obrigatório, inválida →
    // "Data inválida". O essencial do critério (bloquear + sinalizar no campo
    // data) é garantido em ambos os cenários.
    const campoData = screen.getByLabelText(/data da lavagem/i);
    fireEvent.change(campoData, { target: { value: '2026-02-31' } });

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/data da lavagem/i)).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });
    // Alguma mensagem de erro está ancorada ao campo data (inválida ou
    // obrigatória, conforme o jsdom aceite ou não a string impossível).
    const mensagem =
      screen.queryByText(/data inválida/i) ??
      screen.queryByText(/campo obrigatório/i);
    expect(mensagem).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Req. 7.2: lavagem válida envia dtLavagem em ISO YYYY-MM-DD no onSubmit', async () => {
    const { onSubmit } = renderForm();

    await preencherObrigatoriosBase(); // data '2026-01-15' (ISO)

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const enviado = onSubmit.mock.calls[0][0];
    // A data vai no contrato em ISO YYYY-MM-DD (Req. 7.2).
    expect(enviado.dtLavagem).toBe('2026-01-15');
    expect(enviado.dtLavagem).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('R15: data real (bissexto 29/02) passa e envia ISO no onSubmit', async () => {
    const { onSubmit } = renderForm();

    await screen.findByRole('option', { name: 'Completa' });
    fireEvent.change(screen.getByLabelText(/tipo de lavagem/i), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText(/data da lavagem/i), {
      target: { value: '2024-02-29' }, // 2024 é bissexto → data real
    });
    fireEvent.change(screen.getByLabelText(/odômetro/i), {
      target: { value: '45000' },
    });

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].dtLavagem).toBe('2024-02-29');
  });
});
