// features/lavagem/useLavagemMutations.ts
//
// Hooks de MUTAÇÃO (TanStack Query) do módulo de lavagem: criar, atualizar e
// excluir. Consomem o `LavagemClient` ativo (real/mock) via `useLavagemClient()`,
// mantendo o formulário desacoplado da implementação (Req. 11.1/11.2).
//
// Rastreabilidade:
//  - R17 / Req. 8.1: `criar` envia POST (`client.criarLavagem`).
//  - R17 / Req. 8.2: `atualizar` envia PUT (`client.atualizarLavagem`).
//  - R17        : `excluir` envia DELETE (`client.excluirLavagem`) — usado na
//                 tarefa 8.4 (exclusão com confirmação).
//  - R23 / Req. 8.5: no SUCESSO de cada mutação invalidamos a query
//                 `['lavagens', idVeiculo]` para que o painel re-busque e mostre
//                 o resultado "na tela". Reusamos `lavagensQueryKey`/`veiculoQueryKey`
//                 de `features/veiculo/useLavagens.ts` para garantir que a key da
//                 invalidação é EXATAMENTE a mesma usada pela query do painel.
//
// Cada mutação expõe os estados do TanStack Query (isPending, isError, error,
// etc.) para o formulário (tarefas 8.2/8.3/8.4) desabilitar o botão e exibir
// erro (Req. 8.6/8.7), e `mutateAsync` para o chamador aguardar e navegar no
// sucesso (Req. 8.4 / R18).

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import type { Lavagem } from '../../api/types';
import { useLavagemClient } from '../../app/LavagemClientProvider';
import {
  lavagensQueryKey,
  veiculoQueryKey,
} from '../veiculo/useLavagens';

/** Argumentos da mutação de atualização: id da lavagem + dados completos. */
export interface AtualizarLavagemArgs {
  id: number;
  dados: Lavagem;
}

/** Conjunto de mutações do formulário de lavagem, com seus estados. */
export interface LavagemMutations {
  /** Criação (POST). Recebe o payload da lavagem (montado em 7.5). R17/Req.8.1. */
  criar: UseMutationResult<Lavagem, Error, Lavagem>;
  /** Atualização (PUT). Recebe `{ id, dados }`. R17/Req.8.2. */
  atualizar: UseMutationResult<Lavagem, Error, AtualizarLavagemArgs>;
  /** Exclusão (DELETE). Recebe o id da lavagem. R17 (usada na 8.4). */
  excluir: UseMutationResult<void, Error, number>;
}

/**
 * Expõe as três mutações (criar/atualizar/excluir) do módulo de lavagem para o
 * veículo `idVeiculo`. No sucesso de cada uma, invalida a query das lavagens
 * desse veículo para "ver o resultado na tela" (R23/Req. 8.5).
 *
 * A invalidação de `['veiculo', idVeiculo]` é opcional (o `kmAtual` não muda
 * ao incluir/alterar/excluir uma lavagem — R16 vem do mock/backend); por isso
 * invalidamos apenas a query de lavagens, que é a que efetivamente reflete o
 * resultado da operação no painel.
 */
export function useLavagemMutations(idVeiculo: number): LavagemMutations {
  const client = useLavagemClient();
  const queryClient = useQueryClient();

  /** Invalida a query do painel para forçar o re-fetch (R23/Req. 8.5). */
  const invalidarLavagens = () =>
    queryClient.invalidateQueries({ queryKey: lavagensQueryKey(idVeiculo) });

  const criar = useMutation<Lavagem, Error, Lavagem>({
    mutationFn: (dados: Lavagem) => client.criarLavagem(dados), // R17 (POST)
    onSuccess: invalidarLavagens, // R23/Req. 8.5
  });

  const atualizar = useMutation<Lavagem, Error, AtualizarLavagemArgs>({
    mutationFn: ({ id, dados }: AtualizarLavagemArgs) =>
      client.atualizarLavagem(id, dados), // R17 (PUT)
    onSuccess: invalidarLavagens, // R23/Req. 8.5
  });

  const excluir = useMutation<void, Error, number>({
    mutationFn: (id: number) => client.excluirLavagem(id), // R17 (DELETE)
    onSuccess: invalidarLavagens, // R23/Req. 8.5
  });

  return { criar, atualizar, excluir };
}

// Re-exporta as query keys usadas, por conveniência de quem consome as mutações
// (ex.: testes que querem observar a invalidação com a MESMA key do painel).
export { lavagensQueryKey, veiculoQueryKey };
