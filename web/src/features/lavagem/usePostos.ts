// features/lavagem/usePostos.ts
//
// Hook de QUERY (TanStack Query) para os postos conveniados do contrato
// (`client.listarPostos()` — Req. 6.6). O `LavagemForm` usa a lista para popular
// a seleção de posto conveniado, exibindo o nome e enviando o `idPosto` (R13).
//
// Análogo a `features/veiculo/useTipos.ts`: a query key `['postos']` é global
// (os postos não dependem do veículo), o que permite ao TanStack Query cachear
// a lista entre formulários de veículos diferentes.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Posto } from '../../api/types';
import { useLavagemClient } from '../../app/LavagemClientProvider';

/** Query key dos postos conveniados (global, independe do veículo). */
export const postosQueryKey = ['postos'] as const;

/**
 * Lista os postos conveniados (Req. 6.6). Expõe os estados do TanStack Query
 * para o formulário popular a seleção de posto quando a lista chegar.
 */
export function usePostos(): UseQueryResult<Posto[], Error> {
  const client = useLavagemClient();
  return useQuery({
    queryKey: postosQueryKey,
    queryFn: () => client.listarPostos(),
  });
}
