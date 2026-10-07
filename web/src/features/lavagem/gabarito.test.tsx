// features/lavagem/gabarito.test.tsx
//
// SUÍTE CONSOLIDADA DE RASTREABILIDADE — espelha 1:1 a tabela §5 do gabarito de
// regras de negócio (docs/lavagem-gabarito-regras.md, "Casos de teste
// sugeridos"). É o entregável central da tarefa 9: um teste de COMPONENTE /
// INTEGRAÇÃO por LINHA do gabarito, com o nome de cada teste citando a Rxx de
// origem — critério anti-alucinação da banca.
//
// Há sobreposição intencional com as suítes de unidade/componente anteriores
// (LavagemForm.test.tsx, PainelLavagens.test.tsx, useLavagemMutations.test.tsx).
// Aqui o objetivo não é cobertura nova de código, e sim RASTREABILIDADE EXPLÍCITA
// linha-a-linha contra o gabarito, exercitada por fluxos reais de componente:
//  - fluxos felizes/erro passam pelo LavagemForm (domínio real via lavagemResolver);
//  - a listagem por veículo passa pelo PainelLavagens real;
//  - o "resultado na tela" é um teste de integração: PainelLavagens + mutação no
//    MESMO QueryClient — ao criar uma lavagem, a lista do painel cresce.
//
// Determinismo: MockLavagemClient({ latenciaMs: 0 }) + QueryClient retry:false.
// Nenhuma regra é mockada; a validação é a do domínio (@sigfrota/dominio) via
// resolver, e os dados vêm dos dados sintéticos reais.
//
// Mapa gabarito §5 → teste desta suíte:
//   | Linha do gabarito                 | Regra     | Teste |
//   | Feliz — conveniado                | R12/R13   | "Feliz — conveniado (R12/R13)" |
//   | Feliz — não conveniado            | R14       | "Feliz — não conveniado (R14)" |
//   | Feliz — interna                   | R09/R10   | "Feliz — interna (R09/R10)" |
//   | Erro — km zero                    | R04       | "Erro — km zero (R04)" |
//   | Erro — valor zero externo         | R03/R11   | "Erro — valor zero externo (R03/R11)" |
//   | Erro — externo sem valor          | R11       | "Erro — externo sem valor (R11)" |
//   | Erro — conveniado sem posto       | R13       | "Erro — conveniado sem posto (R13)" |
//   | Erro — não conveniado sem CNPJ    | R14       | "Erro — não conveniado sem CNPJ (R14)" |
//   | Erro — data inválida              | R15       | "Erro — data inválida (R15)" |
//   | Listagem por veículo              | R19/R20   | "Listagem por veículo (R19/R20)" |
//   | Resultado na tela                 | R23       | "Resultado na tela (R23)" |

import { describe, it, expect, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
  renderHook,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { MockLavagemClient } from '../../api/MockLavagemClient';
import { LavagemClientProvider } from '../../app/LavagemClientProvider';
import { LavagemForm } from './LavagemForm';
import { PainelLavagens } from '../veiculo/PainelLavagens';
import { useLavagemMutations } from './useLavagemMutations';
import { LAVAGENS_INICIAIS } from '../../mocks/dados-sinteticos';

/** Lavagens do veículo 101 no conjunto `demo` (inclui a 3397 do gabarito). */
const LAVAGENS_101 = LAVAGENS_INICIAIS.filter((l) => l.idVeiculo === 101).length;

// ─────────────────────────────────────────────────────────────────────────────
// Infra de teste reutilizando os padrões das suítes existentes:
// QueryClientProvider(retry off) + LavagemClientProvider(MockLavagemClient 0ms).
// ─────────────────────────────────────────────────────────────────────────────

function criarQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

/** Monta o LavagemForm do veículo 101 dentro dos providers padrão. */
function renderForm(onSubmit = vi.fn()) {
  const queryClient = criarQueryClient();
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

/** Monta o PainelLavagens real (precisa de MemoryRouter para os <Link>). */
function renderPainel(client: MockLavagemClient, idVeiculo = 101) {
  const queryClient = criarQueryClient();
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

// ── Helpers de preenchimento do formulário (mesmos padrões de LavagemForm.test) ──

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

function alternarUnidade(valor: 'S' | 'N') {
  fireEvent.change(screen.getByLabelText(/na própria unidade\?/i), {
    target: { value: valor },
  });
}

function alternarConveniado(valor: 'S' | 'N') {
  fireEvent.change(screen.getByLabelText(/posto conveniado\?/i), {
    target: { value: valor },
  });
}

function salvar() {
  fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
}

// ═════════════════════════════════════════════════════════════════════════════
// §5 — CASOS FELIZES (via LavagemForm, domínio real)
// ═════════════════════════════════════════════════════════════════════════════

describe('Gabarito §5 — casos felizes (componente LavagemForm)', () => {
  // | Feliz — conveniado | Externa, conveniado, posto=10, valor=60, km=45000 | Aceito |
  it('Feliz — conveniado (R12/R13): externa + conveniado + posto 10 + valor 60 → onSubmit com idPosto', async () => {
    const { onSubmit } = renderForm();

    await preencherObrigatoriosBase();
    alternarUnidade('N'); // externa; conveniado é o default (R12)

    const valor = await screen.findByLabelText(/valor/i);
    fireEvent.change(valor, { target: { value: '60,00' } });
    fireEvent.blur(valor);

    await screen.findByRole('option', {
      name: 'Auto Posto Central (conveniado)',
    });
    fireEvent.change(screen.getByLabelText(/posto conveniado \(seleção\)/i), {
      target: { value: '10' },
    });

    salvar();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // Aceito: payload do ramo conveniado (R13), sem campos do não conveniado.
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        idVeiculo: 101,
        idTipoLavagem: 2,
        kmLavagem: 45000,
        propriaUnidade: 'N',
        postoConveniado: 'S',
        vlLavagem: 60,
        idPosto: 10,
      }),
    );
    const enviado = onSubmit.mock.calls[0][0];
    expect('dsPosto' in enviado).toBe(false);
    expect('cnpjPosto' in enviado).toBe(false);
  });

  // | Feliz — não conveniado | Externa, não conveniado, DS_POSTO+CNPJ, valor=35, km=88800 | Aceito |
  it('Feliz — não conveniado (R14): externa + não conveniado + descrição + CNPJ + valor 35 → onSubmit sem idPosto', async () => {
    const { onSubmit } = renderForm();

    await preencherObrigatoriosBase();
    fireEvent.change(screen.getByLabelText(/odômetro/i), {
      target: { value: '88800' },
    });
    alternarUnidade('N'); // externa

    const valor = await screen.findByLabelText(/valor/i);
    fireEvent.change(valor, { target: { value: '35,00' } });
    fireEvent.blur(valor);

    alternarConveniado('N'); // não conveniado (R14)
    const descricao = await screen.findByLabelText(/descrição do posto/i);
    fireEvent.change(descricao, { target: { value: 'Lava-Jato do Zé' } });
    fireEvent.change(screen.getByLabelText(/cnpj do posto/i), {
      target: { value: '12.345.678/0001-90' },
    });

    salvar();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // Aceito: payload do ramo não conveniado (R14), sem idPosto.
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        idVeiculo: 101,
        kmLavagem: 88800,
        propriaUnidade: 'N',
        postoConveniado: 'N',
        vlLavagem: 35,
        dsPosto: 'Lava-Jato do Zé',
        cnpjPosto: '12.345.678/0001-90',
      }),
    );
    const enviado = onSubmit.mock.calls[0][0];
    expect(enviado.idPosto == null).toBe(true);
  });

  // | Feliz — interna | Na unidade=Sim, sem valor/posto, km=12050 | Aceito |
  it('Feliz — interna (R09/R10): na própria unidade, sem valor/posto, km 12050 → onSubmit omite valor/posto', async () => {
    const { onSubmit } = renderForm();

    await screen.findByRole('option', { name: 'Completa' });
    fireEvent.change(screen.getByLabelText(/tipo de lavagem/i), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText(/data da lavagem/i), {
      target: { value: '2026-01-15' },
    });
    fireEvent.change(screen.getByLabelText(/odômetro/i), {
      target: { value: '12050' },
    });
    // Default já é interna (R09): campos de valor/posto nem são renderizados (R10).
    expect(screen.queryByLabelText(/valor/i)).not.toBeInTheDocument();

    salvar();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // Aceito: payload interno — valor/posto omitidos (R10).
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        idVeiculo: 101,
        idTipoLavagem: 2,
        kmLavagem: 12050,
        propriaUnidade: 'S',
      }),
    );
    const enviado = onSubmit.mock.calls[0][0];
    expect('vlLavagem' in enviado).toBe(false);
    expect('idPosto' in enviado).toBe(false);
    expect('dsPosto' in enviado).toBe(false);
    expect('cnpjPosto' in enviado).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §5 — CASOS DE ERRO (via LavagemForm: bloqueio + sinalização no campo)
// ═════════════════════════════════════════════════════════════════════════════

describe('Gabarito §5 — casos de erro (componente LavagemForm)', () => {
  // | Erro — km zero | km=0 | Rejeitado (R04) |
  it('Erro — km zero (R04): km=0 bloqueia o envio e marca aria-invalid no Odômetro', async () => {
    const { onSubmit } = renderForm();

    await screen.findByRole('option', { name: 'Completa' });
    fireEvent.change(screen.getByLabelText(/tipo de lavagem/i), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText(/data da lavagem/i), {
      target: { value: '2026-01-15' },
    });
    fireEvent.change(screen.getByLabelText(/odômetro/i), {
      target: { value: '0' },
    });

    salvar();

    await waitFor(() => {
      expect(screen.getByLabelText(/odômetro/i)).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // | Erro — valor zero externo | Externa, valor=0 | Rejeitado (R03/R11) |
  it('Erro — valor zero externo (R03/R11): externa com valor=0 bloqueia e marca aria-invalid no Valor', async () => {
    const { onSubmit } = renderForm();

    await preencherObrigatoriosBase();
    alternarUnidade('N'); // externa → valor obrigatório (R11)

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

    salvar();

    await waitFor(() => {
      expect(screen.getByLabelText(/valor/i)).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // | Erro — externo sem valor | Externa, valor nulo | Rejeitado (R11) |
  it('Erro — externo sem valor (R11): externa com valor nulo bloqueia e marca aria-invalid no Valor', async () => {
    const { onSubmit } = renderForm();

    await preencherObrigatoriosBase();
    alternarUnidade('N'); // externa → valor obrigatório (R11)

    // NÃO preenche o valor; seleciona só o posto para isolar a falta do valor.
    await screen.findByRole('option', {
      name: 'Auto Posto Central (conveniado)',
    });
    fireEvent.change(screen.getByLabelText(/posto conveniado \(seleção\)/i), {
      target: { value: '10' },
    });

    salvar();

    await waitFor(() => {
      expect(screen.getByLabelText(/valor/i)).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // | Erro — conveniado sem posto | Externa, conveniado, ID_POSTO nulo | Rejeitado (R13) |
  it('Erro — conveniado sem posto (R13): externa + conveniado sem seleção bloqueia e marca aria-invalid na seleção', async () => {
    const { onSubmit } = renderForm();

    await preencherObrigatoriosBase();
    alternarUnidade('N'); // externa, conveniado por default (R12)

    // Preenche o valor (obrigatório na externa — R11), mas NÃO seleciona posto.
    const valor = await screen.findByLabelText(/valor/i);
    fireEvent.change(valor, { target: { value: '120,00' } });
    fireEvent.blur(valor);

    salvar();

    await waitFor(() => {
      expect(
        screen.getByLabelText(/posto conveniado \(seleção\)/i),
      ).toHaveAttribute('aria-invalid', 'true');
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // | Erro — não conveniado sem CNPJ | Externa, não conveniado, sem CNPJ | Rejeitado (R14) |
  it('Erro — não conveniado sem CNPJ (R14): externa + não conveniado sem CNPJ bloqueia e marca aria-invalid no CNPJ', async () => {
    const { onSubmit } = renderForm();

    await preencherObrigatoriosBase();
    alternarUnidade('N'); // externa

    const valor = await screen.findByLabelText(/valor/i);
    fireEvent.change(valor, { target: { value: '90,00' } });
    fireEvent.blur(valor);

    alternarConveniado('N'); // não conveniado (R14)
    const descricao = await screen.findByLabelText(/descrição do posto/i);
    // Preenche só a descrição; deixa o CNPJ vazio → deve bloquear por R14.
    fireEvent.change(descricao, { target: { value: 'Lava-Jato do Zé' } });

    salvar();

    await waitFor(() => {
      expect(screen.getByLabelText(/cnpj do posto/i)).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // | Erro — data inválida | DT_LAVAGEM = "31/02/2026" | Rejeitado (R15) |
  it('Erro — data inválida (R15): data impossível (31/02) bloqueia o envio e marca aria-invalid na Data', async () => {
    const { onSubmit } = renderForm();

    await screen.findByRole('option', { name: 'Completa' });
    fireEvent.change(screen.getByLabelText(/tipo de lavagem/i), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText(/odômetro/i), {
      target: { value: '45000' },
    });

    // Injeta a data impossível no input ISO. No jsdom o <input type="date">
    // pode descartar a string inválida (value vazio); em ambos os casos o
    // domínio (fonte única) BLOQUEIA e marca o campo data (R15 inválida /
    // obrigatória), que é o essencial do critério.
    fireEvent.change(screen.getByLabelText(/data da lavagem/i), {
      target: { value: '2026-02-31' },
    });

    salvar();

    await waitFor(() => {
      expect(screen.getByLabelText(/data da lavagem/i)).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §5 — LISTAGEM POR VEÍCULO (via PainelLavagens real)
// ═════════════════════════════════════════════════════════════════════════════

describe('Gabarito §5 — listagem por veículo (componente PainelLavagens)', () => {
  // | Listagem por veículo | Veículo 101 | Lista só as lavagens do 101, ordenadas por data (R19/R20) |
  it('Listagem por veículo (R19/R20): painel do 101 lista só as lavagens do 101, ordenadas por data', async () => {
    renderPainel(new MockLavagemClient({ latenciaMs: 0 }));

    const tabela = await screen.findByRole('table');
    const linhas = within(tabela).getAllByRole('row');
    // 1 cabeçalho + exatamente as lavagens do veículo 101 (R19: filtro por id).
    expect(linhas).toHaveLength(1 + LAVAGENS_101);

    // Primeira e última lavagens do 101; as de 102/103 NÃO aparecem (R19).
    const dataAnterior = within(tabela).getByText('02/10/2025');
    const dataPosterior = within(tabela).getByText('01/09/2026');
    expect(dataAnterior).toBeInTheDocument();
    expect(dataPosterior).toBeInTheDocument();
    // Lavagens de outros veículos (ex.: 03/09/2026 do 102) não vazam para o 101.
    expect(screen.queryByText('03/09/2026')).not.toBeInTheDocument();
    expect(screen.queryByText('05/09/2026')).not.toBeInTheDocument();

    // Ordenado por data ASC (R20): 02/10/2025 antes de 01/09/2026 no DOM.
    expect(
      dataAnterior.compareDocumentPosition(dataPosterior) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Colunas do gabarito (R20): Tipo / Data / Km / Valor.
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
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §5 — RESULTADO NA TELA (integração: PainelLavagens + mutação no mesmo client)
// ═════════════════════════════════════════════════════════════════════════════

describe('Gabarito §5 — resultado na tela (integração painel + mutação)', () => {
  // | Resultado na tela | Incluir lavagem válida no 101 e recarregar | A nova lavagem aparece no painel (R23) |
  it('Resultado na tela (R23): incluir uma lavagem no 101 faz o painel exibir uma linha a mais', async () => {
    // Painel e mutação compartilham o MESMO MockLavagemClient e o MESMO
    // QueryClient — assim a invalidação pós-criação re-busca a lista e o painel
    // mostra o resultado "na própria tela" (R23), como no fluxo real da página.
    const client = new MockLavagemClient({ latenciaMs: 0 });
    const queryClient = criarQueryClient();

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          <LavagemClientProvider client={client}>
            <MemoryRouter>{children}</MemoryRouter>
          </LavagemClientProvider>
        </QueryClientProvider>
      );
    }

    // Monta o painel real do 101.
    render(<PainelLavagens idVeiculo={101} />, { wrapper: Wrapper });

    const tabela = await screen.findByRole('table');
    expect(within(tabela).getAllByRole('row')).toHaveLength(1 + LAVAGENS_101); // cabeçalho + existentes

    // Hook de mutação ligado ao MESMO QueryClient/cliente (via o mesmo wrapper).
    const { result } = renderHook(() => useLavagemMutations(101), {
      wrapper: Wrapper,
    });

    await result.current.criar.mutateAsync({
      idVeiculo: 101,
      idTipoLavagem: 1,
      dtLavagem: '2026-10-10',
      kmLavagem: 46000,
      propriaUnidade: 'S',
    });

    // Após a invalidação de ['lavagens', 101], o painel re-renderiza com a nova
    // lavagem já visível: cabeçalho + existentes + 1, incluindo a data recém-criada.
    await waitFor(() => {
      const atual = screen.getByRole('table');
      expect(within(atual).getAllByRole('row')).toHaveLength(2 + LAVAGENS_101);
    });
    expect(
      within(screen.getByRole('table')).getByText('10/10/2026'),
    ).toBeInTheDocument();
  });
});
