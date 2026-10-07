// features/veiculo/useLavagens.ts
//
// Hooks de QUERY (TanStack Query) do painel de lavagens do veículo.
// Consomem o `LavagemClient` ativo (real/mock) via `useLavagemClient()`,
// mantendo os componentes desacoplados da implementação (Req. 11.1/11.2).
//
// Rastreabilidade:
//  - R19 / Req. 2.1: `useLavagens` busca `GET /veiculos/{id}/lavagens`.
//  - R19 / Req. 2.2: a listagem é ordenada por data da lavagem (ASC). A
//    ordenação é refeita no cliente para robustez, mesmo que o client já
//    devolva ordenado (a tarefa pede "ordenação por data no cliente se preciso").
//  - R16 / Req. 2.8: `useVeiculo` expõe o `kmAtual` (referência read-only) para
//    o topo do painel.
//  - Req. 2.6 / 2.7: os hooks expõem os estados de loading/erro/dados do
//    TanStack Query (isLoading, isError, data, refetch) para o painel montar
//    spinner, ErrorState (com "tentar novamente") e a lista.
//
// IMPORTANTE: as query keys abaixo (`['lavagens', idVeiculo]` e
// `['veiculo', idVeiculo]`) são contrato com a tarefa 8 (`useLavagemMutations`),
// que invalida `['lavagens', idVeiculo]` no sucesso para "ver o resultado na
// tela" (R23). Não as altere sem ajustar a invalidação correspondente.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Lavagem, Veiculo } from '../../api/types';
import { useLavagemClient } from '../../app/LavagemClientProvider';

/**
 * Ordena lavagens por data (ISO `YYYY-MM-DD`) em ordem ascendente, desempatando
 * por `idLavagem` para resultado determinístico (R19/R20). Função pura: não
 * muta o array recebido. Como as datas trafegam em ISO, a comparação textual
 * já respeita a ordem cronológica.
 */
export function ordenarLavagensPorData(lavagens: Lavagem[]): Lavagem[] {
  return [...lavagens].sort((a, b) => {
    if (a.dtLavagem !== b.dtLavagem) {
      return a.dtLavagem < b.dtLavagem ? -1 : 1;
    }
    return (a.idLavagem ?? 0) - (b.idLavagem ?? 0);
  });
}

/** Query key das lavagens de um veículo. Compartilhada com a invalidação (R23). */
export function lavagensQueryKey(idVeiculo: number) {
  return ['lavagens', idVeiculo] as const;
}

/** Query key do veículo (Km Atual read-only). */
export function veiculoQueryKey(idVeiculo: number) {
  return ['veiculo', idVeiculo] as const;
}

/**
 * Lista as lavagens do veículo (R19 / Req. 2.1), ordenadas por data ASC
 * (R19/R20 / Req. 2.2). Expõe os estados de loading/erro/dados (Req. 2.6/2.7).
 */
export function useLavagens(idVeiculo: number): UseQueryResult<Lavagem[], Error> {
  const client = useLavagemClient();
  return useQuery({
    queryKey: lavagensQueryKey(idVeiculo),
    queryFn: async () => {
      const lavagens = await client.listarLavagens(idVeiculo);
      // Ordena no cliente para robustez (não depende do client ordenar). R19.
      return ordenarLavagensPorData(lavagens);
    },
  });
}

/**
 * Obtém o veículo para exibir o Km Atual read-only no topo do painel
 * (R16 / Req. 2.8). Expõe os mesmos estados de loading/erro/dados.
 */
export function useVeiculo(idVeiculo: number): UseQueryResult<Veiculo, Error> {
  const client = useLavagemClient();
  return useQuery({
    queryKey: veiculoQueryKey(idVeiculo),
    queryFn: () => client.obterVeiculo(idVeiculo),
  });
}
