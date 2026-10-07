// features/lavagem/camposCondicionais.ts
//
// Lógica PURA de visibilidade dos campos do formulário de lavagem, derivada do
// estado atual. Nenhum `if` de regra fica solto no JSX: o formulário consome
// `visibilidade(estado)` para ligar/desligar campos (R09–R14). A obrigatoriedade
// de cada campo continua delegada ao domínio via `validationResolver`.
import type { SimNao } from '../../api/types';

/**
 * Fatia mínima do estado do formulário que governa a visibilidade condicional.
 * - `propriaUnidade`: "Na própria unidade?" (R09), default 'S' (interna).
 * - `postoConveniado`: "Posto conveniado?" (R12), default 'S' quando externa;
 *   `undefined` numa lavagem externa é tratado como conveniado (default 'S').
 */
export interface EstadoLavagem {
  propriaUnidade: SimNao;     // R09
  postoConveniado?: SimNao;   // R12
}

/** Mapa de visibilidade dos campos condicionais do formulário. */
export interface VisibilidadeCampos {
  valor: boolean;                   // R10/R11
  escolhaPostoConveniado: boolean;  // R12
  selecaoPosto: boolean;            // R13
  dsPosto: boolean;                 // R14
  cnpjPosto: boolean;               // R14
}

/**
 * Deriva quais campos devem estar visíveis a partir do estado atual.
 *
 * - Interna (`propriaUnidade === 'S'`, default): oculta valor, escolha de posto
 *   conveniado, seleção de posto, descrição e CNPJ (Req. 5.2, R10).
 * - Externa (`propriaUnidade === 'N'`): mostra valor (obrigatório — R11) e a
 *   escolha "Posto conveniado?" (R12).
 * - Externa + conveniado (`postoConveniado !== 'N'`, inclui o default/undefined):
 *   mostra a seleção de posto (R13), oculta descrição e CNPJ.
 * - Externa + não conveniado (`postoConveniado === 'N'`): mostra descrição e
 *   CNPJ (R14), oculta a seleção de posto.
 */
export function visibilidade(e: EstadoLavagem): VisibilidadeCampos {
  const externa = e.propriaUnidade === 'N';           // R09
  const conveniado = externa && e.postoConveniado !== 'N';
  return {
    valor: externa,                                   // R10/R11
    escolhaPostoConveniado: externa,                  // R12
    selecaoPosto: externa && conveniado,              // R13
    dsPosto: externa && !conveniado,                  // R14
    cnpjPosto: externa && !conveniado,                // R14
  };
}

/**
 * Nomes dos campos condicionais, na forma dos campos do formulário/`Lavagem`.
 * Útil para a limpeza de ramos ocultos (Req. 5.5 / 6.7) e para montar o payload
 * sem campos ocultos (Req. 8.3) na tarefa 7.
 */
export type CampoCondicional =
  | 'vlLavagem'        // valor (R10/R11)
  | 'postoConveniado'  // escolha "Posto conveniado?" (R12)
  | 'idPosto'          // seleção de posto (R13)
  | 'dsPosto'          // descrição do posto (R14)
  | 'cnpjPosto';       // CNPJ do posto (R14)

// Mapeia cada chave de visibilidade para o(s) campo(s) de dados correspondente(s).
const CAMPOS_POR_VISIBILIDADE: Record<keyof VisibilidadeCampos, CampoCondicional[]> = {
  valor: ['vlLavagem'],
  escolhaPostoConveniado: ['postoConveniado'],
  selecaoPosto: ['idPosto'],
  dsPosto: ['dsPosto'],
  cnpjPosto: ['cnpjPosto'],
};

/**
 * Helper PURO: dado o estado atual, retorna os campos que estão OCULTOS e
 * portanto devem ser limpos (valores e erros) e omitidos do payload.
 *
 * Mantido puro e sem efeitos — a limpeza em si (reset/clearErrors) é
 * responsabilidade do `LavagemForm` (tarefas 7.2/7.3). Serve para alternâncias
 * "Na própria unidade?" (Req. 5.5, R10) e "Posto conveniado?" (Req. 6.7).
 */
export function camposOcultos(e: EstadoLavagem): CampoCondicional[] {
  const vis = visibilidade(e);
  return (Object.keys(CAMPOS_POR_VISIBILIDADE) as (keyof VisibilidadeCampos)[])
    .filter((chave) => !vis[chave])
    .flatMap((chave) => CAMPOS_POR_VISIBILIDADE[chave]);
}
