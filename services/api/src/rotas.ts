// Rotas da API agrupadas por Lambda (uma por perfil de permissão IAM).
// Os handlers em `handlers/` só instanciam o repositório real; os testes usam
// estas fábricas com um repositório em memória.

import { corpoJson, criarDespachante, inteiroDaRota, responder, subDoToken } from './http';
import type { ServicoLavagens } from './servico';

/** Catálogo (leitura): veículo, tipos e postos. */
export function rotasCatalogo(servico: ServicoLavagens) {
  return criarDespachante({
    'GET /veiculos/{idVeiculo}': async (e) =>
      responder(200, await servico.obterVeiculo(inteiroDaRota(e, 'idVeiculo'))),
    'GET /tipos-lavagem': async () => responder(200, await servico.listarTipos()),
    'GET /postos': async () => responder(200, await servico.listarPostos()),
  });
}

/** Lavagens (leitura): painel do veículo (R19/R20) e edição (R21). */
export function rotasLavagensLeitura(servico: ServicoLavagens) {
  return criarDespachante({
    'GET /veiculos/{idVeiculo}/lavagens': async (e) =>
      responder(200, await servico.listarLavagens(inteiroDaRota(e, 'idVeiculo'))),
    'GET /veiculos/{idVeiculo}/lavagens/{idLavagem}': async (e) =>
      responder(
        200,
        await servico.obterLavagem(inteiroDaRota(e, 'idVeiculo'), inteiroDaRota(e, 'idLavagem')),
      ),
  });
}

/** Lavagens (escrita): inclusão, alteração e exclusão (R17). */
export function rotasLavagensEscrita(servico: ServicoLavagens) {
  return criarDespachante({
    'POST /veiculos/{idVeiculo}/lavagens': async (e) => {
      const idVeiculo = inteiroDaRota(e, 'idVeiculo');
      const sub = subDoToken(e); // R08
      return responder(201, await servico.criarLavagem(idVeiculo, corpoJson(e), { sub }));
    },
    'PUT /veiculos/{idVeiculo}/lavagens/{idLavagem}': async (e) =>
      responder(
        200,
        await servico.atualizarLavagem(
          inteiroDaRota(e, 'idVeiculo'),
          inteiroDaRota(e, 'idLavagem'),
          corpoJson(e),
        ),
      ),
    'DELETE /veiculos/{idVeiculo}/lavagens/{idLavagem}': async (e) => {
      await servico.excluirLavagem(inteiroDaRota(e, 'idVeiculo'), inteiroDaRota(e, 'idLavagem'));
      return responder(204);
    },
  });
}
