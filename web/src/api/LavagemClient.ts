// api/LavagemClient.ts
import type { Lavagem, Veiculo, TipoLavagem, Posto } from './types';

export interface LavagemClient {
  listarLavagens(idVeiculo: number): Promise<Lavagem[]>;      // R19/R20
  obterVeiculo(idVeiculo: number): Promise<Veiculo>;          // R16 (KM_ATUAL)
  obterLavagem(id: number): Promise<Lavagem>;                 // R21 (edição)
  listarTipos(): Promise<TipoLavagem[]>;                      // Req.4.5
  listarPostos(): Promise<Posto[]>;                           // Req.6.6
  criarLavagem(dados: Lavagem): Promise<Lavagem>;             // R17 (POST)
  atualizarLavagem(id: number, dados: Lavagem): Promise<Lavagem>; // R17 (PUT)
  excluirLavagem(id: number): Promise<void>;                  // R17 (DELETE)
}
