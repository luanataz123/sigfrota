// auth/MockAuthAdapter.ts
//
// Adapter de autenticação mockável para o MVP (Req. 1, nota). Respeita o
// contrato `AuthAdapter` sem depender de Cognito: valida credenciais contra
// uma lista em memória e emite uma `Sessao` com um token sintético. A
// integração real com Cognito (mesmo contrato) pertence ao spec `infra-base`.

import type { AuthAdapter, Credenciais, Sessao, Usuario } from './AuthProvider';
import { CredenciaisInvalidasError } from './erros';

// Reexportado para manter os imports existentes (LoginPage e testes).
export { CredenciaisInvalidasError };

interface ContaMock extends Usuario {
  senha: string;
}

/** Conta padrão do MVP para a demo (atendente). */
const CONTAS_PADRAO: ContaMock[] = [
  { nome: 'Atendente Demo', email: 'atendente@mpf.mp.br', senha: 'demo123' },
];

export interface MockAuthAdapterOptions {
  /** Contas aceitas; default: a conta de demonstração. */
  contas?: ContaMock[];
  /** Latência simulada (ms) para exercitar estados de carregamento. */
  latenciaMs?: number;
}

export class MockAuthAdapter implements AuthAdapter {
  private readonly contas: ContaMock[];
  private readonly latenciaMs: number;

  constructor(opcoes: MockAuthAdapterOptions = {}) {
    this.contas = opcoes.contas ?? CONTAS_PADRAO;
    this.latenciaMs = opcoes.latenciaMs ?? 0;
  }

  async autenticar(credenciais: Credenciais): Promise<Sessao> {
    if (this.latenciaMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latenciaMs));
    }

    const conta = this.contas.find(
      (c) => c.email === credenciais.email && c.senha === credenciais.senha,
    );
    if (!conta) {
      throw new CredenciaisInvalidasError();
    }

    const usuario: Usuario = { nome: conta.nome, email: conta.email };
    // Token sintético (não é um JWT real; apenas carrega a identidade no MVP).
    const token = criarTokenMock(usuario);
    return { token, usuario };
  }
}

/**
 * Monta um token sintético legível para o MVP. Não substitui um JWT assinado;
 * serve para a camada de client anexar algo no header (Req. 1.3) durante a demo.
 */
function criarTokenMock(usuario: Usuario): string {
  const payload = JSON.stringify({ sub: usuario.email, nome: usuario.nome });
  // base64url do payload, apenas para parecer um token opaco.
  const corpo = btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `mock.${corpo}`;
}
