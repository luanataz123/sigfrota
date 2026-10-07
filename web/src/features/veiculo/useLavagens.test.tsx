// features/veiculo/useLavagens.test.tsx
//
// Testes dos hooks de query do painel de lavagens.
//  - R19/R20 / Req. 2.1, 2.2: useLavagens lista as lavagens do veículo,
//    ordenadas por data (ASC), filtradas por idVeiculo.
//  - R16 / Req. 2.8: useVeiculo expõe o kmAtual (referência read-only).
//  - Req. 2.7: estado de erro quando o client rejeita.
//  - Pureza da ordenação (ordenarLavagensPorData).

import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MockLavagemClient } from '../../api/MockLavagemClient';
import type { LavagemClient } from '../../api/LavagemClient';
import type { Lavagem, Veiculo } from '../../api/types';
import { LavagemClientProvider } from '../../app/LavagemClientProvider';
import {
  ordenarLavagensPorData,
  useLavagens,
  useVeiculo,
} from './useLavagens';

/**
 * Cria um wrapper com QueryClient (retry desligado para os testes não
 * reterem/ficarem lentos) + LavagemClientProvider com o client fornecido.
 */
function criarWrapper(client: LavagemClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <LavagemClientProvider client={client}>
          {children}
        </LavagemClientProvider>
      </QueryClientProvider>
    );
  };
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

describe('ordenarLavagensPorData (R19/R20)', () => {
  it('ordena por data ascendente e não muta o array original', () => {
    const original: Lavagem[] = [
      { idVeiculo: 1, idTipoLavagem: 1, dtLavagem: '2026-09-01', kmLavagem: 10, propriaUnidade: 'S', idLavagem: 2 },
      { idVeiculo: 1, idTipoLavagem: 1, dtLavagem: '2026-08-20', kmLavagem: 10, propriaUnidade: 'S', idLavagem: 1 },
    ];
    const ordenado = ordenarLavagensPorData(original);

    expect(ordenado.map((l) => l.dtLavagem)).toEqual(['2026-08-20', '2026-09-01']);
    // Pureza: a entrada permanece inalterada.
    expect(original.map((l) => l.dtLavagem)).toEqual(['2026-09-01', '2026-08-20']);
  });

  it('desempata datas iguais por idLavagem', () => {
    const lavagens: Lavagem[] = [
      { idVeiculo: 1, idTipoLavagem: 1, dtLavagem: '2026-09-01', kmLavagem: 10, propriaUnidade: 'S', idLavagem: 5 },
      { idVeiculo: 1, idTipoLavagem: 1, dtLavagem: '2026-09-01', kmLavagem: 10, propriaUnidade: 'S', idLavagem: 3 },
    ];
    expect(ordenarLavagensPorData(lavagens).map((l) => l.idLavagem)).toEqual([3, 5]);
  });
});

describe('useLavagens (R19/R20 — Req. 2.1, 2.2)', () => {
  it('retorna as lavagens do veículo 101 ordenadas por data (ASC)', async () => {
    const client = new MockLavagemClient({ latenciaMs: 0 });
    const { result } = renderHook(() => useLavagens(101), {
      wrapper: criarWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const lavagens = result.current.data!;
    // Só do veículo 101 (R19 filtra por idVeiculo).
    expect(lavagens.every((l) => l.idVeiculo === 101)).toBe(true);
    // Dados sintéticos (demo): 101 tem 11 lavagens, da 3400 (2025-10-02) à 3397 (2026-09-01).
    expect(lavagens).toHaveLength(11);
    const datas = lavagens.map((l) => l.dtLavagem);
    expect(datas).toEqual([...datas].sort());
    expect(lavagens[0].idLavagem).toBe(3400);
    expect(lavagens[0].dtLavagem).toBe('2025-10-02');
    expect(lavagens[lavagens.length - 1].idLavagem).toBe(3397);
    expect(lavagens[lavagens.length - 1].dtLavagem).toBe('2026-09-01');
  });

  it('ordena no cliente mesmo quando o client devolve fora de ordem (robustez)', async () => {
    const foraDeOrdem: Lavagem[] = [
      { idVeiculo: 7, idTipoLavagem: 1, dtLavagem: '2026-12-31', kmLavagem: 10, propriaUnidade: 'S', idLavagem: 2 },
      { idVeiculo: 7, idTipoLavagem: 1, dtLavagem: '2026-01-01', kmLavagem: 10, propriaUnidade: 'S', idLavagem: 1 },
    ];
    const client = {
      ...criarClientComFalha(),
      listarLavagens: () => Promise.resolve(foraDeOrdem),
    } as unknown as LavagemClient;

    const { result } = renderHook(() => useLavagens(7), {
      wrapper: criarWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.map((l) => l.dtLavagem)).toEqual([
      '2026-01-01',
      '2026-12-31',
    ]);
  });

  it('expõe o estado de erro quando o client rejeita (Req. 2.7)', async () => {
    const { result } = renderHook(() => useLavagens(101), {
      wrapper: criarWrapper(criarClientComFalha()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useVeiculo (R16 — Req. 2.8)', () => {
  it('retorna o kmAtual do veículo para o painel read-only', async () => {
    const client = new MockLavagemClient({ latenciaMs: 0 });
    const { result } = renderHook(() => useVeiculo(101), {
      wrapper: criarWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const veiculo = result.current.data as Veiculo;
    expect(veiculo.idVeiculo).toBe(101);
    expect(veiculo.kmAtual).toBe(45210);
  });

  it('expõe o estado de erro quando o veículo não existe / client rejeita', async () => {
    const { result } = renderHook(() => useVeiculo(999), {
      wrapper: criarWrapper(criarClientComFalha()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
