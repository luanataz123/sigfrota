// Lambda de escrita das lavagens: POST, PUT e DELETE em /veiculos/{idVeiculo}/lavagens.
import { rotasLavagensEscrita } from '../rotas';
import { criarServico } from './comum';

export const handler = rotasLavagensEscrita(criarServico());
