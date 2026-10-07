// api/LavagemClient.ts
//
// As operações sobre uma lavagem recebem também o `idVeiculo`: na API a
// lavagem é um sub-recurso do veículo (`/veiculos/{idVeiculo}/lavagens/{idLavagem}`),
// porque o veículo compõe a chave no DynamoDB (README, "Modelagem no DynamoDB").
import type { Lavagem, Veiculo, TipoLavagem, Posto } from './types';

export interface LavagemClient {
  listarLavagens(idVeiculo: number): Promise<Lavagem[]>;      // R19/R20
  listarVeiculos(): Promise<Veiculo[]>;                       // seleção do veículo (frota)
  obterVeiculo(idVeiculo: number): Promise<Veiculo>;          // R16 (KM_ATUAL)
  obterLavagem(idVeiculo: number, id: number): Promise<Lavagem>; // R21 (edição)
  listarTipos(): Promise<TipoLavagem[]>;                      // Req.4.5
  listarPostos(): Promise<Posto[]>;                           // Req.6.6
  criarLavagem(dados: Lavagem): Promise<Lavagem>;             // R17 (POST, veículo em dados.idVeiculo)
  atualizarLavagem(idVeiculo: number, id: number, dados: Lavagem): Promise<Lavagem>; // R17 (PUT)
  excluirLavagem(idVeiculo: number, id: number): Promise<void>; // R17 (DELETE)
}
