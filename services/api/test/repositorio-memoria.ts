// Repositório em memória com a mesma semântica do RepositorioDynamo
// (condições de existência e contador que exige o item CONTADOR).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Repositorio } from '../src/repositorio';
import type { Item, ItemLavagem } from '../src/tipos';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Lê um conjunto do seed: `gabarito` ou `demo`. */
export function lerSeed(conjunto: 'gabarito' | 'demo'): Item[] {
  return JSON.parse(readFileSync(path.join(raiz, 'data/seed', conjunto, 'itens.json'), 'utf8'));
}

export class RepositorioMemoria implements Repositorio {
  readonly itens = new Map<string, Item>();

  constructor(itens: Item[] = []) {
    for (const item of itens) this.itens.set(this.chave(String(item.PK), String(item.SK)), { ...item });
  }

  private chave(pk: string, sk: string) {
    return `${pk}|${sk}`;
  }

  async obter(pk: string, sk: string) {
    const item = this.itens.get(this.chave(pk, sk));
    return item ? { ...item } : undefined;
  }

  async consultar(pk: string, prefixoSk: string) {
    return [...this.itens.values()]
      .filter((i) => i.PK === pk && String(i.SK).startsWith(prefixoSk))
      .map((i) => ({ ...i }));
  }

  async proximoIdLavagem() {
    const contador = this.itens.get(this.chave('CONTADOR', 'LAVAGEM'));
    if (!contador) throw Object.assign(new Error('sem contador'), { name: 'ConditionalCheckFailedException' });
    contador.ultimoId = Number(contador.ultimoId) + 1;
    return contador.ultimoId as number;
  }

  async inserir(item: ItemLavagem) {
    const k = this.chave(item.PK, item.SK);
    if (this.itens.has(k)) return false;
    this.itens.set(k, { ...item });
    return true;
  }

  async substituir(item: ItemLavagem) {
    const k = this.chave(item.PK, item.SK);
    if (!this.itens.has(k)) return false;
    this.itens.set(k, { ...item });
    return true;
  }

  async excluir(pk: string, sk: string) {
    return this.itens.delete(this.chave(pk, sk));
  }
}
