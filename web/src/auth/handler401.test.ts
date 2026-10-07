// auth/handler401.test.ts
//
// Testes do ponto de ligação do 401 global (Req. 1.4): o handler encerra a
// sessão (logout) e redireciona ao login, sem travar a app quando algo falha.

import { describe, it, expect, vi } from 'vitest';
import { criarHandler401 } from './handler401';

describe('criarHandler401 (Req. 1.4 — 401 global → logout)', () => {
  it('ao ser acionado (401), chama o logout do AuthProvider', () => {
    const logout = vi.fn();

    const handler = criarHandler401(logout);
    handler();

    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('também redireciona ao login quando a ação é fornecida', () => {
    const logout = vi.fn();
    const redirecionar = vi.fn();

    const handler = criarHandler401(logout, redirecionar);
    handler();

    expect(logout).toHaveBeenCalledTimes(1);
    expect(redirecionar).toHaveBeenCalledTimes(1);
  });

  it('não trava a app se o logout lançar (contém o erro) — Req. 1.4', () => {
    const logout = vi.fn(() => {
      throw new Error('falha ao limpar sessão');
    });
    const redirecionar = vi.fn();

    const handler = criarHandler401(logout, redirecionar);

    expect(() => handler()).not.toThrow();
    // Mesmo com logout falhando, ainda tenta redirecionar.
    expect(redirecionar).toHaveBeenCalledTimes(1);
  });

  it('não trava a app se o redirecionamento lançar — Req. 1.4', () => {
    const logout = vi.fn();
    const redirecionar = vi.fn(() => {
      throw new Error('falha ao navegar');
    });

    const handler = criarHandler401(logout, redirecionar);

    expect(() => handler()).not.toThrow();
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('serve como aoNaoAutorizado do client: 401 da API dispara o logout (Req. 1.4)', async () => {
    const logout = vi.fn();
    const handler = criarHandler401(logout);

    // Simula o HttpLavagemClient chamando aoNaoAutorizado() ao receber 401.
    const { HttpLavagemClient } = await import('../api/HttpLavagemClient');
    const fetch401: typeof fetch = async () =>
      new Response(null, { status: 401 });

    const client = new HttpLavagemClient({
      baseUrl: 'https://api.exemplo',
      aoNaoAutorizado: handler,
      fetchImpl: fetch401,
    });

    await expect(client.listarLavagens(101)).rejects.toMatchObject({
      status: 401,
    });
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
