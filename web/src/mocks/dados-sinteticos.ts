// mocks/dados-sinteticos.ts
//
// Dados sintéticos 100% fictícios para a demo/dev sem backend (Req. 11.3).
//
// Fonte única: `data/seed/demo/itens.json`, gerado por `data/seed/gerar-seed.mjs`
// (semente fixa) já no formato da tabela única do DynamoDB (PK/SK). Aqui apenas
// ADAPTAMOS esses itens para os tipos do contrato (`api/types.ts`, camelCase):
//  - booleanos `propriaUnidade`/`postoConveniado` → 'S' | 'N';
//  - `null` → campo ausente (R10/R13/R14: ramos ocultos são omitidos);
//  - textos sem acento do seed ("Higienizacao") → acentuados para exibição.
//
// O conjunto `demo` contém o `gabarito` (veículos 101–103, lavagens 3397–3399)
// mais 15 veículos, 6 postos conveniados e ~250 lavagens (Out/2025 a Set/2026).
// Sem CPF, sem nomes de pessoas: o cadastrador é só um ID (LGPD / OT 17).

import type { Lavagem, Posto, SimNao, TipoLavagem, Veiculo } from '../api/types';
import itensSeed from '../../../data/seed/demo/itens.json';

/** Item bruto do seed (união frouxa; filtramos por `entityType`). */
interface ItemSeed {
  PK: string;
  SK: string;
  entityType: string;
  [campo: string]: unknown;
}

const itens = itensSeed as unknown as ItemSeed[];

const porTipo = (tipo: string) => itens.filter((i) => i.entityType === tipo);

/** Restaura acentos de textos do seed que foram gerados sem acentuação. */
function acentuar(texto: string): string {
  return texto
    .replace('Higienizacao', 'Higienização')
    .replace('Lava-Rapido', 'Lava-Rápido');
}

const simNao = (b: unknown): SimNao => (b ? 'S' : 'N');
const opcional = <T>(v: T | null | undefined): T | undefined =>
  v === null || v === undefined ? undefined : v;

// --- Veículos (cadastro mock de veículos) ------------------------------------
// kmAtual é a referência read-only exibida no painel (R16).
export const VEICULOS: Veiculo[] = porTipo('VEICULO')
  .map((i) => ({
    idVeiculo: i.idVeiculo as number,
    descricao: acentuar(i.dsVeiculo as string),
    kmAtual: i.kmAtual as number,
    placa: i.placa as string,
    marca: i.marca as string,
    modelo: i.modelo as string,
    ano: i.ano as number,
  }))
  .sort((a, b) => a.idVeiculo - b.idVeiculo);

// --- Tipos de lavagem (FR_TIPO_LAVAGEM) --------------------------------------
export const TIPOS_LAVAGEM: TipoLavagem[] = porTipo('TIPO_LAVAGEM')
  .map((i) => ({
    idTipoLavagem: i.idTipoLavagem as number,
    descricao: acentuar(i.dsTipoLavagem as string),
  }))
  .sort((a, b) => a.idTipoLavagem - b.idTipoLavagem);

// --- Postos conveniados (cadastro mock de postos) ----------------------------
export const POSTOS: Posto[] = porTipo('POSTO')
  .map((i) => ({
    idPosto: i.idPosto as number,
    nome: acentuar(i.nmPosto as string),
  }))
  .sort((a, b) => a.idPosto - b.idPosto);

// --- Lavagens iniciais (FR_LAVAGEM) ------------------------------------------
// O cadastrador (idPessoaCadastrador) e a data de cadastro NÃO entram no
// contrato do front: R08 define o cadastrador pelo token, no backend.
export const LAVAGENS_INICIAIS: Lavagem[] = porTipo('LAVAGEM').map((i) => {
  const propriaUnidade = Boolean(i.propriaUnidade);
  const lavagem: Lavagem = {
    idLavagem: i.idLavagem as number,
    idVeiculo: i.idVeiculo as number,
    idTipoLavagem: i.idTipoLavagem as number,
    dtLavagem: i.dtLavagem as string,
    kmLavagem: i.kmLavagem as number,
    propriaUnidade: simNao(propriaUnidade),
  };
  // Ramo externo (R11–R14): valor + posto conveniado OU descrição + CNPJ.
  if (!propriaUnidade) {
    lavagem.vlLavagem = opcional(i.vlLavagem as number | null);
    lavagem.postoConveniado = simNao(i.postoConveniado);
    lavagem.idPosto = opcional(i.idPosto as number | null);
    lavagem.dsPosto = opcional(i.dsPosto as string | null);
    lavagem.cnpjPosto = opcional(i.cnpjPosto as string | null);
  }
  return lavagem;
});

// Próximo id a emitir pelo mock ao criar uma lavagem (R01 no backend; aqui o
// mock gera por incremento). Acima do contador do seed e do maior id existente.
const ultimoIdContador =
  (itens.find((i) => i.entityType === 'CONTADOR')?.ultimoId as number | undefined) ?? 0;
export const PROXIMO_ID_LAVAGEM =
  Math.max(ultimoIdContador, ...LAVAGENS_INICIAIS.map((l) => l.idLavagem ?? 0)) + 1;
