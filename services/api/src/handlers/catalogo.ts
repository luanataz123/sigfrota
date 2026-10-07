// Lambda do catálogo: GET /veiculos/{idVeiculo}, GET /tipos-lavagem, GET /postos.
import { rotasCatalogo } from '../rotas';
import { criarServico } from './comum';

export const handler = rotasCatalogo(criarServico());
