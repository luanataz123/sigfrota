import { describe, it, expect } from 'vitest';
import { MockLavagemClient, MockLavagemError } from './MockLavagemClient';
import type { Lavagem } from './types';

// Sem latência para os testes serem rápidos e determinísticos.
const criarClient = () => new MockLavagemClient({ latenciaMs: 0 });

const lavagemBase: Lavagem = {
  idVeiculo: 101,
  idTipoLavagem: 1,
  dtLavagem: '2026-10-01',
  kmLavagem: 50000,
  propriaUnidade: 'S',
};

describe('MockLavagemClient', () => {
  it('R19: listarLavagens retorna só as lavagens do veículo informado', async () => {
    const client = criarClient();
    const lavagens = await client.listarLavagens(101);
    expect(lavagens.length).toBeGreaterThan(0);
    expect(lavagens.every((l) => l.idVeiculo === 101)).toBe(true);
  });

  it('R20: listarLavagens devolve ordenado por data (ascendente)', async () => {
    const client = criarClient();
    const lavagens = await client.listarLavagens(101);
    const datas = lavagens.map((l) => l.dtLavagem);
    const ordenadas = [...datas].sort();
    expect(datas).toEqual(ordenadas);
  });

  it('R16: obterVeiculo expõe o kmAtual do veículo 101', async () => {
    const client = criarClient();
    const veiculo = await client.obterVeiculo(101);
    expect(veiculo.idVeiculo).toBe(101);
    expect(typeof veiculo.kmAtual).toBe('number');
    expect(veiculo.kmAtual).toBeGreaterThan(0);
  });

  it('obterVeiculo lança erro para veículo inexistente', async () => {
    const client = criarClient();
    await expect(client.obterVeiculo(999)).rejects.toBeInstanceOf(MockLavagemError);
  });

  it('R01/R23: criarLavagem gera novo id e aparece na listagem seguinte', async () => {
    const client = criarClient();
    const antes = await client.listarLavagens(101);
    const criada = await client.criarLavagem(lavagemBase);
    expect(criada.idLavagem).toBeDefined();
    // id não colide com os existentes
    expect(antes.some((l) => l.idLavagem === criada.idLavagem)).toBe(false);

    const depois = await client.listarLavagens(101);
    expect(depois.length).toBe(antes.length + 1);
    expect(depois.some((l) => l.idLavagem === criada.idLavagem)).toBe(true);
  });

  it('R01: ids gerados são incrementais e distintos', async () => {
    const client = criarClient();
    const a = await client.criarLavagem(lavagemBase);
    const b = await client.criarLavagem(lavagemBase);
    expect(b.idLavagem).toBe((a.idLavagem ?? 0) + 1);
  });

  it('R21: obterLavagem retorna a lavagem pelo id', async () => {
    const client = criarClient();
    const criada = await client.criarLavagem(lavagemBase);
    const obtida = await client.obterLavagem(101, criada.idLavagem!);
    expect(obtida.idLavagem).toBe(criada.idLavagem);
    expect(obtida.idVeiculo).toBe(101);
  });

  it('R21: obterLavagem com veículo diferente não encontra a lavagem', async () => {
    const client = criarClient();
    const criada = await client.criarLavagem(lavagemBase);
    await expect(client.obterLavagem(102, criada.idLavagem!)).rejects.toThrow();
  });

  it('R17/R23: atualizarLavagem reflete na listagem seguinte', async () => {
    const client = criarClient();
    const criada = await client.criarLavagem(lavagemBase);
    await client.atualizarLavagem(101, criada.idLavagem!, {
      ...lavagemBase,
      kmLavagem: 51234,
    });
    const obtida = await client.obterLavagem(101, criada.idLavagem!);
    expect(obtida.kmLavagem).toBe(51234);
  });

  it('R17/R23: excluirLavagem remove da listagem seguinte', async () => {
    const client = criarClient();
    const criada = await client.criarLavagem(lavagemBase);
    await client.excluirLavagem(101, criada.idLavagem!);
    const depois = await client.listarLavagens(101);
    expect(depois.some((l) => l.idLavagem === criada.idLavagem)).toBe(false);
  });

  it('listarTipos e listarPostos retornam os dados sintéticos', async () => {
    const client = criarClient();
    expect((await client.listarTipos()).length).toBeGreaterThan(0);
    expect((await client.listarPostos()).length).toBeGreaterThan(0);
  });

  it('Req.2.7: taxaErro=1 faz as leituras falharem (estado de erro)', async () => {
    const client = new MockLavagemClient({ latenciaMs: 0, taxaErro: 1 });
    await expect(client.listarLavagens(101)).rejects.toBeInstanceOf(MockLavagemError);
  });

  it('mutações não contaminam os dados base entre instâncias', async () => {
    const c1 = criarClient();
    await c1.criarLavagem(lavagemBase);
    const c2 = criarClient();
    const c1Lista = await c1.listarLavagens(101);
    const c2Lista = await c2.listarLavagens(101);
    expect(c1Lista.length).toBe(c2Lista.length + 1);
  });
});
