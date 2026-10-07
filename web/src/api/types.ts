// api/types.ts
export type SimNao = 'S' | 'N';

export interface Veiculo {
  idVeiculo: number;
  descricao: string;
  kmAtual: number;        // R16 (referência, read-only)
  // Identificação do veículo (cadastro de veículos; somente leitura na tela).
  placa?: string;
  marca?: string;
  modelo?: string;
  ano?: number;
}

export interface TipoLavagem {
  idTipoLavagem: number;
  descricao: string;      // DS_TIPO_LAVAGEM
}

export interface Posto {
  idPosto: number;
  nome: string;
}

export interface Lavagem {
  idLavagem?: number;        // ausente em inclusão (R01 no backend)
  idVeiculo: number;         // R02
  idTipoLavagem: number;     // R02, R05
  dtLavagem: string;         // ISO YYYY-MM-DD (R15)
  kmLavagem: number;         // R02, R04
  propriaUnidade: SimNao;    // R09 (default 'S')
  vlLavagem?: number;        // R03/R11 (externa)
  postoConveniado?: SimNao;  // R12 (default 'S' quando externa)
  idPosto?: number;          // R13
  dsPosto?: string;          // R14
  cnpjPosto?: string;        // R14
}
