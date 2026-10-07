// Contrato HTTP da API (DTOs) e formato dos itens no DynamoDB.
//
// Os DTOs espelham `web/src/api/types.ts` (o front e o `@sigfrota/dominio`
// trabalham com 'S'/'N' e campos opcionais). Os itens seguem a modelagem do
// README da raiz e o seed (`data/seed`): booleanos e `null` nos campos que não
// se aplicam. A conversão entre os dois formatos fica só em `mapper.ts`.

export type SimNao = 'S' | 'N';

/** Veículo exposto pela API (R16: `kmAtual` é só referência). */
export interface VeiculoDto {
  idVeiculo: number;
  descricao: string;
  kmAtual: number;
}

export interface TipoLavagemDto {
  idTipoLavagem: number;
  descricao: string;
}

/** Posto conveniado (catálogo). */
export interface PostoDto {
  idPosto: number;
  nome: string;
}

/** Lavagem exposta e recebida pela API. */
export interface LavagemDto {
  idLavagem?: number;
  idVeiculo: number;
  idTipoLavagem: number;
  /** Descrição do tipo, desnormalizada na gravação (R20). Só na resposta. */
  dsTipoLavagem?: string;
  dtLavagem: string;
  kmLavagem: number;
  propriaUnidade: SimNao;
  vlLavagem?: number;
  postoConveniado?: SimNao;
  idPosto?: number;
  dsPosto?: string;
  cnpjPosto?: string;
}

/** Item genérico lido do DynamoDB (DocumentClient). */
export type Item = Record<string, unknown>;

/** Item de lavagem gravado na tabela (mesmo formato do seed). */
export interface ItemLavagem {
  PK: string;
  SK: string;
  entityType: 'LAVAGEM';
  idLavagem: number;
  idVeiculo: number;
  idTipoLavagem: number;
  dsTipoLavagem: string;
  dtLavagem: string;
  kmLavagem: number;
  vlLavagem: number | null;
  idPosto: number | null;
  dsPosto: string | null;
  cnpjPosto: string | null;
  /** R08: `sub` do token Cognito nas lavagens novas; ID numérico no seed. */
  idPessoaCadastrador: string | number;
  /** R08: data da gravação (YYYY-MM-DD). */
  dtCadastro: string;
  propriaUnidade: boolean;
  postoConveniado: boolean | null;
}

/** Chaves da tabela única (README, "Modelagem no DynamoDB"). */
export const chaves = {
  catalogo: 'CATALOGO',
  veiculo: (id: number) => `VEICULO#${id}`,
  tipo: (id: number) => `TIPO#${id}`,
  posto: (id: number) => `POSTO#${id}`,
  lavagem: (id: number) => `LAVAGEM#${id}`,
  contador: { PK: 'CONTADOR', SK: 'LAVAGEM' },
} as const;
