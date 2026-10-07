// Regras de serviço da API de lavagens.
//
// Rastreabilidade:
//   R01       — ID pelo contador atômico (`proximoIdLavagem`).
//   R02–R04,
//   R09–R15   — `validarLavagem` do `@sigfrota/dominio` (fonte única, a mesma do front).
//   R05–R07   — existência de tipo, veículo e posto verificada no catálogo
//               (o DynamoDB não tem FK).
//   R08       — cadastrador = `sub` do token; data de cadastro = hoje.
//   R10, R13,
//   R14       — campos do ramo que não se aplica são gravados como `null`.
//   R16       — `kmAtual` do catálogo do veículo.
//   R17       — inclusão, alteração e exclusão.
//   R19, R20  — lavagens do veículo ordenadas por data.
//   R21       — leitura de uma lavagem para edição.
// Extras do README ("Limites das colunas"): valor até 999,99 com 2 casas
// (`NUMBER(5,2)`) e km inteiro até 999.999 (`NUMBER(6,0)`).

import { validarLavagem, type ErrosLavagem, type LavagemInput } from '@sigfrota/dominio';
import { ErroHttp } from './http';
import {
  lavagemParaDto,
  ordenarLavagens,
  postoParaDto,
  tipoParaDto,
  veiculoParaDto,
} from './mapper';
import type { Repositorio } from './repositorio';
import {
  chaves,
  type ItemLavagem,
  type LavagemDto,
  type PostoDto,
  type TipoLavagemDto,
  type VeiculoDto,
} from './tipos';

const VALOR_MAXIMO = 999.99;
const KM_MAXIMO = 999_999;
const TAMANHO_MAXIMO_DS_POSTO = 255;
const TAMANHO_MAXIMO_CNPJ = 18;

const MSG = {
  invalido: 'Valor inválido',
  valorMaximo: 'Valor deve ser no máximo R$ 999,99',
  valorCasas: 'Valor deve ter no máximo duas casas decimais',
  kmInteiro: 'Odômetro deve ser um número inteiro',
  kmMaximo: 'Odômetro deve ser no máximo 999.999',
  dsPostoTamanho: 'Descrição do posto deve ter no máximo 255 caracteres',
  cnpjTamanho: 'CNPJ deve ter no máximo 18 caracteres',
  tipoInexistente: 'Tipo de lavagem não encontrado',
  postoInexistente: 'Posto conveniado não encontrado',
  veiculoDivergente: 'A lavagem deve pertencer ao veículo da rota',
} as const;

/** Data de hoje (YYYY-MM-DD) no fuso de Brasília, para `dtCadastro` (R08). */
export function hojeBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

export interface Contexto {
  /** `sub` do token (R08). */
  sub: string;
  /** Data de hoje, injetável nos testes. */
  hoje?: string;
}

type Erros = Partial<Record<string, string>>;

/** Lê um campo numérico opcional do corpo; tipo errado vira erro no campo. */
function numero(corpo: Record<string, unknown>, campo: string, erros: Erros): number | null {
  const v = corpo[campo];
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    erros[campo] = MSG.invalido;
    return null;
  }
  return v;
}

/** Lê um campo de texto opcional do corpo (com `trim`). */
function textoOpcional(corpo: Record<string, unknown>, campo: string, erros: Erros): string | null {
  const v = corpo[campo];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') {
    erros[campo] = MSG.invalido;
    return null;
  }
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/** Lê um campo 'S'/'N' com default (R09/R12). */
function simNao(corpo: Record<string, unknown>, campo: string, padrao: 'S' | 'N', erros: Erros) {
  const v = corpo[campo];
  if (v === undefined || v === null) return padrao;
  if (v !== 'S' && v !== 'N') {
    erros[campo] = MSG.invalido;
    return padrao;
  }
  return v;
}

/** Entrada já tipada e validada, pronta para virar item. */
interface EntradaValida {
  idTipoLavagem: number;
  dtLavagem: string;
  kmLavagem: number;
  externa: boolean;
  conveniado: boolean;
  vlLavagem: number | null;
  idPosto: number | null;
  dsPosto: string | null;
  cnpjPosto: string | null;
}

/**
 * Converte o corpo JSON em entrada validada. Tipos errados, regras do domínio
 * (R02–R04, R09–R15) e limites das colunas viram `400 { mensagem, erros }`.
 * Campos controlados pelo servidor (`idLavagem`, cadastrador, datas de
 * cadastro) são ignorados.
 */
export function validarEntrada(corpo: Record<string, unknown>, idVeiculo: number): EntradaValida {
  const erros: Erros = {};

  if (corpo.idVeiculo !== undefined && corpo.idVeiculo !== idVeiculo) {
    erros.idVeiculo = MSG.veiculoDivergente;
  }

  const entrada: LavagemInput = {
    idTipoLavagem: numero(corpo, 'idTipoLavagem', erros),
    dtLavagem: textoOpcional(corpo, 'dtLavagem', erros),
    kmLavagem: numero(corpo, 'kmLavagem', erros),
    propriaUnidade: simNao(corpo, 'propriaUnidade', 'S', erros),
    vlLavagem: numero(corpo, 'vlLavagem', erros),
    postoConveniado: simNao(corpo, 'postoConveniado', 'S', erros),
    idPosto: numero(corpo, 'idPosto', erros),
    dsPosto: textoOpcional(corpo, 'dsPosto', erros),
    cnpjPosto: textoOpcional(corpo, 'cnpjPosto', erros),
  };

  // Regras do domínio só para campos sem erro de tipo.
  const doDominio: ErrosLavagem = validarLavagem(entrada);
  for (const [campo, mensagem] of Object.entries(doDominio)) {
    if (!erros[campo] && mensagem) erros[campo] = mensagem;
  }

  const externa = entrada.propriaUnidade === 'N';
  const conveniado = entrada.postoConveniado !== 'N';
  const { kmLavagem, vlLavagem, dsPosto, cnpjPosto } = entrada;

  if (!erros.kmLavagem && kmLavagem != null) {
    if (!Number.isInteger(kmLavagem)) erros.kmLavagem = MSG.kmInteiro;
    else if (kmLavagem > KM_MAXIMO) erros.kmLavagem = MSG.kmMaximo;
  }
  if (externa && !erros.vlLavagem && vlLavagem != null) {
    if (vlLavagem > VALOR_MAXIMO) erros.vlLavagem = MSG.valorMaximo;
    else if (Math.round(vlLavagem * 100) !== Number((vlLavagem * 100).toFixed(6))) {
      erros.vlLavagem = MSG.valorCasas;
    }
  }
  if (externa && !conveniado) {
    if (!erros.dsPosto && dsPosto && dsPosto.length > TAMANHO_MAXIMO_DS_POSTO) {
      erros.dsPosto = MSG.dsPostoTamanho;
    }
    if (!erros.cnpjPosto && cnpjPosto && cnpjPosto.length > TAMANHO_MAXIMO_CNPJ) {
      erros.cnpjPosto = MSG.cnpjTamanho;
    }
  }

  if (Object.keys(erros).length > 0) {
    throw new ErroHttp(400, 'Lavagem inválida.', erros as Record<string, string>);
  }

  // R10/R13/R14: só o ramo aplicável é gravado; o resto fica `null`.
  return {
    idTipoLavagem: entrada.idTipoLavagem as number,
    dtLavagem: entrada.dtLavagem as string,
    kmLavagem: kmLavagem as number,
    externa,
    conveniado,
    vlLavagem: externa ? vlLavagem ?? null : null,
    idPosto: externa && conveniado ? entrada.idPosto ?? null : null,
    dsPosto: externa && !conveniado ? dsPosto ?? null : null,
    cnpjPosto: externa && !conveniado ? cnpjPosto ?? null : null,
  };
}

export class ServicoLavagens {
  constructor(private readonly repo: Repositorio) {}

  // --- catálogo -------------------------------------------------------------

  /** Frota para a tela de seleção do veículo, ordenada por ID. */
  async listarVeiculos(): Promise<VeiculoDto[]> {
    const itens = await this.repo.consultar(chaves.catalogo, 'VEICULO#');
    return itens.map(veiculoParaDto).sort((a, b) => a.idVeiculo - b.idVeiculo);
  }

  /** R16 (Km Atual) e R06 (veículo existe). */
  async obterVeiculo(idVeiculo: number): Promise<VeiculoDto> {
    const item = await this.repo.obter(chaves.catalogo, chaves.veiculo(idVeiculo));
    if (!item) throw new ErroHttp(404, `Veículo ${idVeiculo} não encontrado.`);
    return veiculoParaDto(item);
  }

  async listarTipos(): Promise<TipoLavagemDto[]> {
    const itens = await this.repo.consultar(chaves.catalogo, 'TIPO#');
    return itens.map(tipoParaDto).sort((a, b) => a.idTipoLavagem - b.idTipoLavagem);
  }

  async listarPostos(): Promise<PostoDto[]> {
    const itens = await this.repo.consultar(chaves.catalogo, 'POSTO#');
    return itens.map(postoParaDto).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  // --- lavagens: leitura ----------------------------------------------------

  /** R19/R20: lavagens do veículo, ordenadas por data. */
  async listarLavagens(idVeiculo: number): Promise<LavagemDto[]> {
    await this.obterVeiculo(idVeiculo); // 404 para veículo inexistente
    const itens = await this.repo.consultar(chaves.veiculo(idVeiculo), 'LAVAGEM#');
    return ordenarLavagens(itens.map(lavagemParaDto));
  }

  /** R21: uma lavagem do veículo. */
  async obterLavagem(idVeiculo: number, idLavagem: number): Promise<LavagemDto> {
    const item = await this.repo.obter(chaves.veiculo(idVeiculo), chaves.lavagem(idLavagem));
    if (!item) throw new ErroHttp(404, `Lavagem ${idLavagem} não encontrada.`);
    return lavagemParaDto(item);
  }

  // --- lavagens: escrita (R17) ----------------------------------------------

  /** Inclusão: R01, R02–R15, R05–R07, R08. */
  async criarLavagem(idVeiculo: number, corpo: Record<string, unknown>, ctx: Contexto): Promise<LavagemDto> {
    const entrada = validarEntrada(corpo, idVeiculo);
    const dsTipoLavagem = await this.verificarCatalogo(idVeiculo, entrada);

    const idLavagem = await this.repo.proximoIdLavagem(); // R01
    const item = montarItem(idVeiculo, idLavagem, entrada, dsTipoLavagem, {
      idPessoaCadastrador: ctx.sub, // R08
      dtCadastro: ctx.hoje ?? hojeBrasilia(), // R08
    });
    if (!(await this.repo.inserir(item))) {
      throw new ErroHttp(409, 'Conflito ao gerar o identificador da lavagem. Tente novamente.');
    }
    return lavagemParaDto(item as unknown as Record<string, unknown>);
  }

  /** Alteração: mantém cadastrador e data de cadastro originais (R08). */
  async atualizarLavagem(
    idVeiculo: number,
    idLavagem: number,
    corpo: Record<string, unknown>,
  ): Promise<LavagemDto> {
    const atual = await this.repo.obter(chaves.veiculo(idVeiculo), chaves.lavagem(idLavagem));
    if (!atual) throw new ErroHttp(404, `Lavagem ${idLavagem} não encontrada.`);

    const entrada = validarEntrada(corpo, idVeiculo);
    const dsTipoLavagem = await this.verificarCatalogo(idVeiculo, entrada);

    const item = montarItem(idVeiculo, idLavagem, entrada, dsTipoLavagem, {
      idPessoaCadastrador: atual.idPessoaCadastrador as string | number,
      dtCadastro: atual.dtCadastro as string,
    });
    if (!(await this.repo.substituir(item))) {
      throw new ErroHttp(404, `Lavagem ${idLavagem} não encontrada.`);
    }
    return lavagemParaDto(item as unknown as Record<string, unknown>);
  }

  async excluirLavagem(idVeiculo: number, idLavagem: number): Promise<void> {
    const excluiu = await this.repo.excluir(chaves.veiculo(idVeiculo), chaves.lavagem(idLavagem));
    if (!excluiu) throw new ErroHttp(404, `Lavagem ${idLavagem} não encontrada.`);
  }

  /**
   * R05–R07: veículo, tipo e (se conveniado) posto existem no catálogo.
   * Devolve a descrição do tipo, desnormalizada na lavagem (R20).
   */
  private async verificarCatalogo(idVeiculo: number, entrada: EntradaValida): Promise<string> {
    const [veiculo, tipo, posto] = await Promise.all([
      this.repo.obter(chaves.catalogo, chaves.veiculo(idVeiculo)),
      this.repo.obter(chaves.catalogo, chaves.tipo(entrada.idTipoLavagem)),
      entrada.idPosto != null
        ? this.repo.obter(chaves.catalogo, chaves.posto(entrada.idPosto))
        : Promise.resolve(undefined),
    ]);
    if (!veiculo) throw new ErroHttp(404, `Veículo ${idVeiculo} não encontrado.`); // R06

    const erros: Record<string, string> = {};
    if (!tipo) erros.idTipoLavagem = MSG.tipoInexistente; // R05
    if (entrada.idPosto != null && !posto) erros.idPosto = MSG.postoInexistente; // R07
    if (Object.keys(erros).length > 0) throw new ErroHttp(400, 'Lavagem inválida.', erros);

    return String((tipo as Record<string, unknown>).dsTipoLavagem ?? '');
  }
}

function montarItem(
  idVeiculo: number,
  idLavagem: number,
  e: EntradaValida,
  dsTipoLavagem: string,
  cadastro: { idPessoaCadastrador: string | number; dtCadastro: string },
): ItemLavagem {
  return {
    PK: chaves.veiculo(idVeiculo),
    SK: chaves.lavagem(idLavagem),
    entityType: 'LAVAGEM',
    idLavagem,
    idVeiculo,
    idTipoLavagem: e.idTipoLavagem,
    dsTipoLavagem,
    dtLavagem: e.dtLavagem,
    kmLavagem: e.kmLavagem,
    vlLavagem: e.vlLavagem,
    idPosto: e.idPosto,
    dsPosto: e.dsPosto,
    cnpjPosto: e.cnpjPosto,
    idPessoaCadastrador: cadastro.idPessoaCadastrador,
    dtCadastro: cadastro.dtCadastro,
    propriaUnidade: !e.externa,
    postoConveniado: e.externa ? e.conveniado : null,
  };
}
