// lib/validationResolver.ts
//
// Ponte entre o React Hook Form e o módulo de domínio `@sigfrota/dominio`
// (Req. 4.6). A FONTE ÚNICA das regras R02–R04 e R09–R15 é `validarLavagem` no
// domínio — o mesmo módulo que roda na Lambda. Esta camada NÃO reimplementa
// regra alguma: apenas adapta o retorno `{ campo: mensagem }` do domínio para o
// formato de erros do React Hook Form `{ [campo]: { type, message } }`.
//
// Rastreabilidade: R02–R04, R09–R15 vivem em @sigfrota/dominio; aqui só há a
// conversão de formato (ver design.md, "Ponte de validação (fonte única)").

import type { Resolver, FieldErrors, FieldError } from 'react-hook-form';
import {
  validarLavagem,
  type LavagemInput,
  type ErrosLavagem,
} from '@sigfrota/dominio';

// Tipo dos valores do formulário validados pelo resolver. É o recorte que o
// domínio avalia (ver `LavagemInput`); o formulário pode ter campos extras
// (ex.: idVeiculo, idLavagem) que o domínio ignora.
export type ValoresFormularioLavagem = LavagemInput;

/**
 * Converte o mapa `{ campo: mensagem }` do domínio para o formato de erros do
 * React Hook Form. Usa `type: 'validate'` por serem regras de validação de
 * negócio (não de schema nativo do RHF).
 */
export function paraErrosRhf(
  erros: ErrosLavagem,
): FieldErrors<ValoresFormularioLavagem> {
  const resultado: Record<string, FieldError> = {};
  for (const [campo, mensagem] of Object.entries(erros)) {
    if (mensagem) {
      resultado[campo] = { type: 'validate', message: mensagem };
    }
  }
  return resultado as FieldErrors<ValoresFormularioLavagem>;
}

/**
 * Resolver do React Hook Form que delega a validação ao domínio. Para usar:
 *
 *   useForm({ resolver: lavagemResolver })
 *
 * Quando a lavagem é válida, retorna `{ values, errors: {} }`; caso contrário,
 * `values` fica vazio (padrão do RHF para bloquear o envio) e `errors` traz os
 * campos sinalizados.
 */
export const lavagemResolver: Resolver<ValoresFormularioLavagem> = (
  valores,
) => {
  const erros = validarLavagem(valores); // R02–R04, R09–R15 (fonte única)

  if (Object.keys(erros).length === 0) {
    return { values: valores, errors: {} };
  }

  return { values: {}, errors: paraErrosRhf(erros) };
};
