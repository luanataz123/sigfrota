// Lambda de leitura das lavagens: GET /veiculos/{idVeiculo}/lavagens[/{idLavagem}].
import { rotasLavagensLeitura } from '../rotas';
import { criarServico } from './comum';

export const handler = rotasLavagensLeitura(criarServico());
