// auth/AuthProvider.test.tsx
//
// Testes do fluxo de sessão (Requisito 1): login armazena token/usuário
// (Req. 1.2), expõe a identidade para o cabeçalho (Req. 1.6), disponibiliza o
// token para a camada de client (Req. 1.3) e o logout limpa a sessão (Req. 1.5).

import { describe, it, expect } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthProvider, type AuthAdapter, type Sessao } from './AuthProvider';
import { useAuth } from './useAuth';
import { MockAuthAdapter, CredenciaisInvalidasError } from './MockAuthAdapter';

const SESSAO: Sessao = {
  token: 'jwt-de-teste',
  usuario: { nome: 'Fulana de Tal', email: 'fulana@mpf.mp.br' },
};

/** Adapter simples que sempre devolve a sessão fornecida. */
function adapterFake(sessao: Sessao = SESSAO): AuthAdapter {
  return { autenticar: async () => sessao };
}

function wrapperCom(adapter: AuthAdapter) {
  return ({ children }: { children: ReactNode }) => (
    <AuthProvider adapter={adapter}>{children}</AuthProvider>
  );
}

describe('AuthProvider / useAuth (Req. 1 — sessão)', () => {
  it('inicia sem sessão (não autenticado) — base do guard (Req. 1.1)', () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapperCom(adapterFake()),
    });

    expect(result.current.autenticado).toBe(false);
    expect(result.current.usuario).toBeNull();
    expect(result.current.obterToken()).toBeNull();
  });

  it('login armazena o token e libera o acesso (Req. 1.2)', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapperCom(adapterFake()),
    });

    await act(async () => {
      await result.current.login({ email: 'x@y.z', senha: 'segredo' });
    });

    expect(result.current.autenticado).toBe(true);
    // Req. 1.3: token acessível para a camada de client.
    expect(result.current.obterToken()).toBe('jwt-de-teste');
  });

  it('expõe nome/e-mail do usuário logado para o cabeçalho (Req. 1.6)', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapperCom(adapterFake()),
    });

    await act(async () => {
      await result.current.login({ email: 'x@y.z', senha: 'segredo' });
    });

    expect(result.current.usuario).toEqual({
      nome: 'Fulana de Tal',
      email: 'fulana@mpf.mp.br',
    });
  });

  it('logout limpa a sessão local (Req. 1.5)', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapperCom(adapterFake()),
    });

    await act(async () => {
      await result.current.login({ email: 'x@y.z', senha: 'segredo' });
    });
    expect(result.current.autenticado).toBe(true);

    act(() => {
      result.current.logout();
    });

    expect(result.current.autenticado).toBe(false);
    expect(result.current.usuario).toBeNull();
    expect(result.current.obterToken()).toBeNull();
  });

  it('propaga erro de credenciais inválidas sem criar sessão (Req. 1.2)', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapperCom(new MockAuthAdapter()),
    });

    await expect(
      act(async () => {
        await result.current.login({ email: 'nao@existe.z', senha: 'errada' });
      }),
    ).rejects.toBeInstanceOf(CredenciaisInvalidasError);

    await waitFor(() => expect(result.current.autenticado).toBe(false));
    expect(result.current.obterToken()).toBeNull();
  });

  it('MockAuthAdapter autentica a conta de demonstração (Req. 1.2)', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapperCom(new MockAuthAdapter()),
    });

    await act(async () => {
      await result.current.login({
        email: 'atendente@mpf.mp.br',
        senha: 'demo123',
      });
    });

    expect(result.current.autenticado).toBe(true);
    expect(result.current.usuario?.email).toBe('atendente@mpf.mp.br');
    expect(result.current.obterToken()).toMatch(/^mock\./);
  });

  it('useAuth lança erro quando usado fora do AuthProvider', () => {
    // Silencia o console.error esperado do React para este render que lança.
    expect(() => renderHook(() => useAuth())).toThrow(
      /AuthProvider/,
    );
  });
});
