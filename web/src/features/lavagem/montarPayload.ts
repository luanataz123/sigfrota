// features/lavagem/montarPayload.ts
//
// Montagem PURA do payload de lavagem por ramo (tarefa 7.5 / Req. 8.3).
//
// O formulário já LIMPA os campos ocultos ao alternar unidade/conveniado
// (tarefas 7.2/7.3, via setValue(undefined)). Esta função é a garantia
// EXPLÍCITA e idempotente de que o objeto enviado à API só carrega os campos
// pertinentes ao estado atual — mesmo em casos de borda (valores residuais de
// um ramo que ficou oculto sem passar pela limpeza, p.ex.).
//
// Rastreabilidade:
//   R02 — idVeiculo vem do contexto (não é campo editável) e sempre entra.
//   R10 — interna: NÃO envia vlLavagem, postoConveniado, idPosto, dsPosto, cnpjPosto.
//   R13 — externa + conveniado: NÃO envia dsPosto, cnpjPosto.
//   R14 — externa + não conveniado: NÃO envia idPosto.
//
// A função deriva a visibilidade de `camposCondicionais.visibilidade()` (fonte
// única da lógica condicional) e OMITE as chaves ocultas do objeto final — não
// as deixa como `undefined`, para não "poluir" o payload.

import type { Lavagem, SimNao } from '../../api/types';
import type { ValoresFormularioLavagem } from '../../lib/validationResolver';
import { camposOcultos, type CampoCondicional } from './camposCondicionais';

/** Contexto não editável do payload (R02). */
export interface ContextoPayload {
  /** Veículo ao qual a lavagem pertence (R02). */
  idVeiculo: number;
}

/** Normaliza um `SimNao | null | undefined` para `SimNao`, com default. */
function simNao(v: SimNao | null | undefined, padrao: SimNao): SimNao {
  return v === 'S' || v === 'N' ? v : padrao;
}

/**
 * Monta o objeto `Lavagem` pronto para a API a partir dos valores validados do
 * formulário e do contexto do veículo, OMITINDO os campos que estão ocultos no
 * estado atual (R10/R13/R14).
 *
 * Pré-condição: `valores` já foi aprovado pelo resolver (fonte única), então os
 * obrigatórios base (idTipoLavagem, dtLavagem, kmLavagem) estão presentes. Em
 * caso de ausência, caímos em valores neutros para manter a função total.
 */
export function montarPayloadLavagem(
  valores: ValoresFormularioLavagem,
  { idVeiculo }: ContextoPayload,
): Lavagem {
  const propriaUnidade = simNao(valores.propriaUnidade, 'S'); // R09 (default interna)
  const postoConveniado = simNao(valores.postoConveniado, 'S'); // R12 (default conveniado)

  // Campos ocultos no estado atual: devem ser omitidos do payload (R10/R13/R14).
  const ocultos = new Set<CampoCondicional>(
    camposOcultos({ propriaUnidade, postoConveniado }),
  );

  // Base sempre presente: contexto (R02) + obrigatórios base + propriaUnidade (R09).
  const payload: Lavagem = {
    idVeiculo, // R02 (contexto)
    idTipoLavagem: valores.idTipoLavagem ?? 0, // R02/R05
    dtLavagem: valores.dtLavagem ?? '', // R15
    kmLavagem: valores.kmLavagem ?? 0, // R02/R04
    propriaUnidade, // R09
  };

  // Preserva idLavagem quando presente (edição/PUT — a entidade pode trazê-lo
  // mesmo não fazendo parte de `LavagemInput`).
  const idLavagem = (valores as { idLavagem?: number }).idLavagem;
  if (idLavagem != null) {
    payload.idLavagem = idLavagem;
  }

  // Campo "postoConveniado" (escolha do ramo) só viaja na externa — na interna
  // ele está em `ocultos` (R10) e é omitido.
  if (!ocultos.has('postoConveniado')) {
    payload.postoConveniado = postoConveniado; // R12
  }

  // vlLavagem (R10/R11): só na externa.
  if (!ocultos.has('vlLavagem') && valores.vlLavagem != null) {
    payload.vlLavagem = valores.vlLavagem;
  }

  // idPosto (R13): só na externa + conveniado.
  if (!ocultos.has('idPosto') && valores.idPosto != null) {
    payload.idPosto = valores.idPosto;
  }

  // dsPosto (R14): só na externa + não conveniado.
  if (!ocultos.has('dsPosto') && valores.dsPosto != null) {
    payload.dsPosto = valores.dsPosto;
  }

  // cnpjPosto (R14): só na externa + não conveniado.
  if (!ocultos.has('cnpjPosto') && valores.cnpjPosto != null) {
    payload.cnpjPosto = valores.cnpjPosto;
  }

  return payload;
}
