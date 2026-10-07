// api/MockLavagemClient.ts
//
// Implementação em memória do contrato `LavagemClient` (Req. 11.2) operando
// sobre os dados sintéticos (Req. 11.3). Simula latência para exercitar os
// estados de loading do painel (Req. 2.6) e permite injetar erros de forma
// controlada/ocasional para exercitar o estado de erro (Req. 2.7).
//
// Rastreabilidade:
//  - R19/R20: listarLavagens filtra por idVeiculo e devolve ordenado por data.
//  - R21:     obterLavagem busca por idLavagem (modo edição).
//  - R16:     obterVeiculo expõe o kmAtual (referência read-only).
//  - R17/R23: criar/atualizar/excluir refletem no estado interno, de modo que a
//             listagem seguinte já mostra o resultado "na tela".
//  - R01:     ao criar, o mock gera um novo idLavagem por incremento.

import type { LavagemClient } from './LavagemClient';
import type { Lavagem, Posto, TipoLavagem, Veiculo } from './types';
import {
  LAVAGENS_INICIAIS,
  POSTOS,
  PROXIMO_ID_LAVAGEM,
  TIPOS_LAVAGEM,
  VEICULOS,
} from '../mocks/dados-sinteticos';

export interface MockLavagemClientOptions {
  /** Latência simulada por chamada, em ms (default 400). Req. 2.6. */
  latenciaMs?: number;
  /**
   * Probabilidade (0..1) de uma chamada de leitura falhar, para exercitar o
   * estado de erro do painel (Req. 2.7). Default 0 (desligado) para a demo ser
   * determinística; suba para ~0.15 ao testar o ErrorState manualmente.
   */
  taxaErro?: number;
}

/** Erro de rede/serviço simulado para o estado de erro (Req. 2.7). */
export class MockLavagemError extends Error {
  constructor(message = 'Falha simulada ao comunicar com o serviço de lavagens.') {
    super(message);
    this.name = 'MockLavagemError';
  }
}

function clone<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor)) as T;
}

/** Ordena por data da lavagem (ISO YYYY-MM-DD) e desempata por id. R19/R20. */
function ordenarPorData(lavagens: Lavagem[]): Lavagem[] {
  return [...lavagens].sort((a, b) => {
    if (a.dtLavagem !== b.dtLavagem) {
      return a.dtLavagem < b.dtLavagem ? -1 : 1;
    }
    return (a.idLavagem ?? 0) - (b.idLavagem ?? 0);
  });
}

export class MockLavagemClient implements LavagemClient {
  private readonly veiculos: Veiculo[];
  private readonly tipos: TipoLavagem[];
  private readonly postos: Posto[];
  private lavagens: Lavagem[];
  private proximoId: number;

  private readonly latenciaMs: number;
  private readonly taxaErro: number;

  constructor(opcoes: MockLavagemClientOptions = {}) {
    this.latenciaMs = opcoes.latenciaMs ?? 400;
    this.taxaErro = opcoes.taxaErro ?? 0;

    // Cópias defensivas: o mock é mutável (R23) sem contaminar os dados base.
    this.veiculos = clone(VEICULOS);
    this.tipos = clone(TIPOS_LAVAGEM);
    this.postos = clone(POSTOS);
    this.lavagens = clone(LAVAGENS_INICIAIS);
    this.proximoId = PROXIMO_ID_LAVAGEM;
  }

  // --- infra de simulação ----------------------------------------------------

  /** Simula latência de rede (Req. 2.6). */
  private atraso(): Promise<void> {
    if (this.latenciaMs <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, this.latenciaMs));
  }

  /** Dispara um erro ocasional conforme `taxaErro` (Req. 2.7). */
  private talvezFalhar(): void {
    if (this.taxaErro > 0 && Math.random() < this.taxaErro) {
      throw new MockLavagemError();
    }
  }

  // --- leituras --------------------------------------------------------------

  async listarLavagens(idVeiculo: number): Promise<Lavagem[]> {
    await this.atraso();
    this.talvezFalhar();
    // R19: filtra por idVeiculo. R20: ordenado por data.
    const doVeiculo = this.lavagens.filter((l) => l.idVeiculo === idVeiculo);
    return clone(ordenarPorData(doVeiculo));
  }

  async listarVeiculos(): Promise<Veiculo[]> {
    await this.atraso();
    this.talvezFalhar();
    return clone(this.veiculos);
  }

  async obterVeiculo(idVeiculo: number): Promise<Veiculo> {
    await this.atraso();
    this.talvezFalhar();
    const veiculo = this.veiculos.find((v) => v.idVeiculo === idVeiculo);
    if (!veiculo) {
      throw new MockLavagemError(`Veículo ${idVeiculo} não encontrado.`);
    }
    return clone(veiculo); // R16 (kmAtual read-only)
  }

  async obterLavagem(id: number): Promise<Lavagem> {
    await this.atraso();
    this.talvezFalhar();
    const lavagem = this.lavagens.find((l) => l.idLavagem === id);
    if (!lavagem) {
      throw new MockLavagemError(`Lavagem ${id} não encontrada.`);
    }
    return clone(lavagem); // R21
  }

  async listarTipos(): Promise<TipoLavagem[]> {
    await this.atraso();
    this.talvezFalhar();
    return clone(this.tipos);
  }

  async listarPostos(): Promise<Posto[]> {
    await this.atraso();
    this.talvezFalhar();
    return clone(this.postos);
  }

  // --- mutações (refletem no estado interno — R17/R23) -----------------------

  async criarLavagem(dados: Lavagem): Promise<Lavagem> {
    await this.atraso();
    this.talvezFalhar();
    // R01: id gerado por incremento (o idLavagem recebido é ignorado).
    const nova: Lavagem = { ...clone(dados), idLavagem: this.proximoId++ };
    this.lavagens.push(nova);
    return clone(nova);
  }

  async atualizarLavagem(id: number, dados: Lavagem): Promise<Lavagem> {
    await this.atraso();
    this.talvezFalhar();
    const indice = this.lavagens.findIndex((l) => l.idLavagem === id);
    if (indice === -1) {
      throw new MockLavagemError(`Lavagem ${id} não encontrada.`);
    }
    const atualizada: Lavagem = { ...clone(dados), idLavagem: id };
    this.lavagens[indice] = atualizada; // R17 (PUT)
    return clone(atualizada);
  }

  async excluirLavagem(id: number): Promise<void> {
    await this.atraso();
    this.talvezFalhar();
    const indice = this.lavagens.findIndex((l) => l.idLavagem === id);
    if (indice === -1) {
      throw new MockLavagemError(`Lavagem ${id} não encontrada.`);
    }
    this.lavagens.splice(indice, 1); // R17 (DELETE)
  }
}
