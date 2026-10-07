// features/veiculo/useTipos.ts
//
// Hook de QUERY (TanStack Query) para os tipos de lavagem do contrato
// (`client.listarTipos()` — Req. 4.5). O painel usa a lista para resolver a
// descrição do tipo (DS_TIPO_LAVAGEM) a partir do `idTipoLavagem` de cada
// lavagem (R20 / Req. 2.3), montando a coluna "Tipo de Lavagem".
//
// A query key `['tipos']` é global (os tipos não dependem do veículo), o que
// permite o TanStack Query cachear a lista entre painéis de veículos diferentes.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { TipoLavagem } from '../../api/types';
import { useLavagemClient } from '../../app/LavagemClientProvider';

/** Query key dos tipos de lavagem (global, independe do veículo). */
export const tiposQueryKey = ['tipos'] as const;

/**
 * Lista os tipos de lavagem (Req. 4.5). Expõe os estados do TanStack Query
 * para o painel tratar o carregamento dos tipos (a coluna "Tipo de Lavagem"
 * exibe um fallback enquanto os tipos ainda não chegaram).
 */
export function useTipos(): UseQueryResult<TipoLavagem[], Error> {
  const client = useLavagemClient();
  return useQuery({
    queryKey: tiposQueryKey,
    queryFn: () => client.listarTipos(),
  });
}

/**
 * Monta um `Map<idTipoLavagem, descricao>` a partir da lista de tipos, para a
 * linha resolver a descrição em O(1). Função pura; aceita `undefined` (tipos
 * ainda carregando) devolvendo um mapa vazio.
 */
export function mapaDeTipos(
  tipos: TipoLavagem[] | undefined,
): Map<number, string> {
  const mapa = new Map<number, string>();
  for (const tipo of tipos ?? []) {
    mapa.set(tipo.idTipoLavagem, tipo.descricao);
  }
  return mapa;
}
