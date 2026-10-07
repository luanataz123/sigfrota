// features/lavagem/useLavagemMutations.test.tsx
//
// Testes dos hooks de mutação do módulo de lavagem (criar/atualizar/excluir)
// e da invalidação de query que faz o painel "ver o resultado na tela" (R23).
//
// Rastreabilidade:
//  - R17 / Req. 8.1: criar (POST) resolve com a lavagem criada (com idLavagem).
//  - R17 / Req. 8.2: atualizar (PUT) reflete a mudança.
//  - R17        : excluir (DELETE) remove a lavagem.
//  - R23 / Req. 8.5: no sucesso de cada mutação, a query ['lavagens', idVeiculo]
//    é invalidada — verificado por spy em queryClient.invalidateQueries com a
//    key correta E, de ponta a ponta, confirmando que um useLavagens re-busca e
//    passa a conter/refletir a mudança.
//
// Determinismo: MockLavagemClient com latenciaMs:0 e QueryClient com retry:false.

import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MockLavagemClient } from '../../api/MockLavagemClient';
import type { Lavagem } from '../../api/types';
import { LavagemClientProvider } from '../../app/LavagemClientProvider';
import { useLavagens, lavagensQueryKey } from '../veiculo/useLavagens';
import { useLavagemMutations } from './useLavagemMutations';

/**
 * Cria um QueryClient determinístico (sem retry) e o wrapper com
 * QueryClientProvider + LavagemClientProvider. Devolve também o queryClient
 * para espiar `invalidateQueries`.
 */
function criarAmbiente(client: MockLavagemClient) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <LavagemClientProvider client={client}>{children}</LavagemClientProvider>
    </QueryClientProvider>
  );
  return { queryClient, wrapper };
}

/** Payload válido de uma nova lavagem interna (na própria unidade) — R09/R10. */
function payloadNovaLavagem(idVeiculo: number): Lavagem {
  return {
    idVeiculo,
    idTipoLavagem: 1,
    dtLavagem: '2026-10-10',
    kmLavagem: 46000,
    propriaUnidade: 'S',
  };
}

describe('useLavagemMutations.criar (R17/Req. 8.1 — POST + invalidação R23/Req. 8.5)', () => {
  it('resolve com a lavagem criada (com idLavagem) e invalida ["lavagens", idVeiculo]', async () => {
    const client = new MockLavagemClient({ latenciaMs: 0 });
    const { queryClient, wrapper } = criarAmbiente(client);
    const spyInvalidar = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useLavagemMutations(101), { wrapper });

    const criada = await result.current.criar.mutateAsync(payloadNovaLavagem(101));

    // Resolve com a lavagem criada, agora com idLavagem atribuído (R01/R17).
    expect(criada.idLavagem).toBeTypeOf('number');
    expect(criada.idVeiculo).toBe(101);

    await waitFor(() => expect(result.current.criar.isSuccess).toBe(true));

    // Invalidou a MESMA key que o painel usa (R23/Req. 8.5).
    expect(spyInvalidar).toHaveBeenCalledWith({
      queryKey: lavagensQueryKey(101),
    });
  });

  it('ponta a ponta: após criar, um useLavagens re-busca e passa a conter a nova lavagem', async () => {
    const client = new MockLavagemClient({ latenciaMs: 0 });
    const { wrapper } = criarAmbiente(client);

    // Hook combinado: observa a lista e expõe as mutações no mesmo QueryClient.
    const { result } = renderHook(
      () => ({
        lista: useLavagens(101),
        mutations: useLavagemMutations(101),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.lista.isSuccess).toBe(true));
    const totalAntes = result.current.lista.data!.length;

    await result.current.mutations.criar.mutateAsync(payloadNovaLavagem(101));

    // A invalidação dispara o re-fetch; a lista cresce em 1 e contém a nova data.
    await waitFor(() =>
      expect(result.current.lista.data!.length).toBe(totalAntes + 1),
    );
    expect(
      result.current.lista.data!.some((l) => l.dtLavagem === '2026-10-10'),
    ).toBe(true);
  });
});

describe('useLavagemMutations.atualizar (R17/Req. 8.2 — PUT + invalidação R23/Req. 8.5)', () => {
  it('reflete a mudança na lista e invalida ["lavagens", idVeiculo]', async () => {
    const client = new MockLavagemClient({ latenciaMs: 0 });
    const { queryClient, wrapper } = criarAmbiente(client);
    const spyInvalidar = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => ({
        lista: useLavagens(101),
        mutations: useLavagemMutations(101),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.lista.isSuccess).toBe(true));
    // 3397 é a externa conveniada do veículo 101 (dados sintéticos).
    const original = result.current.lista.data!.find((l) => l.idLavagem === 3397)!;
    expect(original.kmLavagem).toBe(45000);

    const atualizada = await result.current.mutations.atualizar.mutateAsync({
      id: 3397,
      dados: { ...original, kmLavagem: 45555 },
    });
    expect(atualizada.kmLavagem).toBe(45555);
    expect(atualizada.idLavagem).toBe(3397);

    expect(spyInvalidar).toHaveBeenCalledWith({
      queryKey: lavagensQueryKey(101),
    });

    // Ponta a ponta: a lista re-buscada reflete o novo km.
    await waitFor(() =>
      expect(
        result.current.lista.data!.find((l) => l.idLavagem === 3397)!.kmLavagem,
      ).toBe(45555),
    );
  });
});

describe('useLavagemMutations.excluir (R17 — DELETE + invalidação R23/Req. 8.5)', () => {
  it('remove a lavagem da lista e invalida ["lavagens", idVeiculo]', async () => {
    const client = new MockLavagemClient({ latenciaMs: 0 });
    const { queryClient, wrapper } = criarAmbiente(client);
    const spyInvalidar = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => ({
        lista: useLavagens(101),
        mutations: useLavagemMutations(101),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.lista.isSuccess).toBe(true));
    const totalAntes = result.current.lista.data!.length;
    expect(
      result.current.lista.data!.some((l) => l.idLavagem === 3400),
    ).toBe(true);

    await result.current.mutations.excluir.mutateAsync(3400);

    expect(spyInvalidar).toHaveBeenCalledWith({
      queryKey: lavagensQueryKey(101),
    });

    // Ponta a ponta: a lista re-buscada já não contém a lavagem excluída.
    await waitFor(() =>
      expect(result.current.lista.data!.length).toBe(totalAntes - 1),
    );
    expect(
      result.current.lista.data!.some((l) => l.idLavagem === 3400),
    ).toBe(false);
  });
});
