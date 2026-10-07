// Conversão entre itens do DynamoDB (booleanos, `null`) e DTOs da API
// ('S'/'N', campos omitidos). Único ponto que conhece os dois formatos.

import type { Item, LavagemDto, PostoDto, TipoLavagemDto, VeiculoDto } from './tipos';

const num = (v: unknown): number => Number(v);
const texto = (v: unknown): string => (typeof v === 'string' ? v : '');

export function veiculoParaDto(item: Item): VeiculoDto {
  return {
    idVeiculo: num(item.idVeiculo),
    descricao: texto(item.dsVeiculo),
    kmAtual: num(item.kmAtual), // R16
  };
}

export function tipoParaDto(item: Item): TipoLavagemDto {
  return { idTipoLavagem: num(item.idTipoLavagem), descricao: texto(item.dsTipoLavagem) };
}

export function postoParaDto(item: Item): PostoDto {
  return { idPosto: num(item.idPosto), nome: texto(item.nmPosto) };
}

/**
 * Item de lavagem → DTO. `propriaUnidade`/`postoConveniado` viram 'S'/'N'
 * (R09/R12); campos `null` são omitidos. O cadastrador (R08) não sai na API.
 */
export function lavagemParaDto(item: Item): LavagemDto {
  const propria = item.propriaUnidade !== false;
  const dto: LavagemDto = {
    idLavagem: num(item.idLavagem),
    idVeiculo: num(item.idVeiculo),
    idTipoLavagem: num(item.idTipoLavagem),
    dtLavagem: texto(item.dtLavagem),
    kmLavagem: num(item.kmLavagem),
    propriaUnidade: propria ? 'S' : 'N',
  };
  if (typeof item.dsTipoLavagem === 'string') dto.dsTipoLavagem = item.dsTipoLavagem;
  if (item.vlLavagem != null) dto.vlLavagem = num(item.vlLavagem);
  if (!propria) dto.postoConveniado = item.postoConveniado === false ? 'N' : 'S';
  if (item.idPosto != null) dto.idPosto = num(item.idPosto);
  if (item.dsPosto != null) dto.dsPosto = texto(item.dsPosto);
  if (item.cnpjPosto != null) dto.cnpjPosto = texto(item.cnpjPosto);
  return dto;
}

/** R19/R20: ordena por data e desempata pelo ID. */
export function ordenarLavagens(lavagens: LavagemDto[]): LavagemDto[] {
  return [...lavagens].sort((a, b) =>
    a.dtLavagem !== b.dtLavagem
      ? a.dtLavagem < b.dtLavagem
        ? -1
        : 1
      : (a.idLavagem ?? 0) - (b.idLavagem ?? 0),
  );
}
