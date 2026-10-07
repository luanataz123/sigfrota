// mocks/dados-sinteticos.ts
//
// Dados sintéticos 100% fictícios para a demo/dev sem backend (Req. 11.3).
// Derivados de `docs/lavagem-sintetico.sql`, mapeados para os tipos do contrato
// (`api/types.ts`) em camelCase. O veículo 101 contém ao menos uma lavagem,
// como exige o Req. 11.3, para exercitar a listagem (R19/R20) e o fluxo
// "ver o resultado na tela" (R23) a partir do mock.

import type { Lavagem, Posto, TipoLavagem, Veiculo } from '../api/types';

// --- Veículos (mock de FR_VEICULO_MOCK) --------------------------------------
// kmAtual é a referência read-only exibida no painel (R16).
export const VEICULOS: Veiculo[] = [
  { idVeiculo: 101, descricao: 'Fiat Cronos de placa ABC1D23', kmAtual: 45210 },
  { idVeiculo: 102, descricao: 'VW Voyage de placa DEF2G45', kmAtual: 88750 },
  { idVeiculo: 103, descricao: 'Chevrolet Onix de placa HIJ3K67', kmAtual: 12030 },
];

// --- Tipos de lavagem (FR_TIPO_LAVAGEM) --------------------------------------
export const TIPOS_LAVAGEM: TipoLavagem[] = [
  { idTipoLavagem: 1, descricao: 'Simples' },
  { idTipoLavagem: 2, descricao: 'Completa' },
  { idTipoLavagem: 3, descricao: 'Higienização interna' },
];

// --- Postos conveniados (FR_POSTO_MOCK) --------------------------------------
export const POSTOS: Posto[] = [
  { idPosto: 10, nome: 'Auto Posto Central (conveniado)' },
  { idPosto: 11, nome: 'Lava-Rápido Norte (conveniado)' },
];

// --- Lavagens iniciais (FR_LAVAGEM) ------------------------------------------
// IDs seguem a sequence sintética (FR_LAVAGEM_SEQ START WITH 3397). O veículo
// 101 tem duas lavagens para exercitar a ordenação por data (R19/R20); os
// demais veículos também têm exemplos para variar a demo.
export const LAVAGENS_INICIAIS: Lavagem[] = [
  // 101 — externa, posto conveniado (tem idPosto, sem dsPosto/cnpj) — R12/R13
  {
    idLavagem: 3397,
    idVeiculo: 101,
    idTipoLavagem: 2,
    dtLavagem: '2026-09-01',
    kmLavagem: 45000,
    propriaUnidade: 'N',
    vlLavagem: 60.0,
    postoConveniado: 'S',
    idPosto: 10,
  },
  // 101 — interna, na própria unidade (sem valor/posto) — R09/R10
  {
    idLavagem: 3400,
    idVeiculo: 101,
    idTipoLavagem: 1,
    dtLavagem: '2026-08-20',
    kmLavagem: 44120,
    propriaUnidade: 'S',
  },
  // 102 — externa, posto NÃO conveniado (dsPosto + cnpj, sem idPosto) — R14
  {
    idLavagem: 3398,
    idVeiculo: 102,
    idTipoLavagem: 1,
    dtLavagem: '2026-09-03',
    kmLavagem: 88800,
    propriaUnidade: 'N',
    vlLavagem: 35.0,
    postoConveniado: 'N',
    dsPosto: 'Lava-Jato do Zé',
    cnpjPosto: '12.345.678/0001-90',
  },
  // 103 — interna, na própria unidade — R09/R10
  {
    idLavagem: 3399,
    idVeiculo: 103,
    idTipoLavagem: 3,
    dtLavagem: '2026-09-05',
    kmLavagem: 12050,
    propriaUnidade: 'S',
  },
];

// Próximo id a emitir pelo mock ao criar uma lavagem (R01 no backend; aqui o
// mock gera por incremento). Começa acima do maior id inicial.
export const PROXIMO_ID_LAVAGEM =
  Math.max(...LAVAGENS_INICIAIS.map((l) => l.idLavagem ?? 0)) + 1;
