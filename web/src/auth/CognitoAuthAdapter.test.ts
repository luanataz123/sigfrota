// Testes do CognitoAuthAdapter com o SDK do Cognito simulado (sem rede).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CredenciaisInvalidasError } from './erros';

type Callbacks = {
  onSuccess: (s: unknown) => void;
  onFailure: (e: unknown) => void;
  newPasswordRequired: () => void;
};

const estado = vi.hoisted(() => ({
  comportamento: (_cb: unknown): void => {},
  username: '',
  password: '',
}));

vi.mock('amazon-cognito-identity-js', () => ({
  CognitoUserPool: class {},
  AuthenticationDetails: class {
    constructor(dados: { Username: string; Password: string }) {
      estado.username = dados.Username;
      estado.password = dados.Password;
    }
  },
  CognitoUser: class {
    authenticateUser(_detalhes: unknown, cb: unknown) {
      estado.comportamento(cb);
    }
  },
}));

const { CognitoAuthAdapter } = await import('./CognitoAuthAdapter');

function sessaoFalsa(email: string) {
  return {
    getAccessToken: () => ({ getJwtToken: () => 'access.jwt' }),
    getIdToken: () => ({ decodePayload: () => ({ email }) }),
  };
}

describe('CognitoAuthAdapter (Req. 1.2/1.3)', () => {
  const adapter = () => new CognitoAuthAdapter({ userPoolId: 'us-east-1_X', clientId: 'cli' });

  beforeEach(() => {
    estado.username = '';
  });

  it('login com sucesso devolve o ACCESS token e o e-mail como identificação', async () => {
    estado.comportamento = (cb) => (cb as Callbacks).onSuccess(sessaoFalsa('atendente@exemplo.gov.br'));
    const sessao = await adapter().autenticar({ email: ' Atendente@Exemplo.gov.br ', senha: 's' });
    expect(sessao).toEqual({
      token: 'access.jwt',
      usuario: { nome: 'atendente@exemplo.gov.br', email: 'atendente@exemplo.gov.br' },
    });
    // E-mail normalizado antes de ir ao Cognito.
    expect(estado.username).toBe('atendente@exemplo.gov.br');
  });

  it('NotAuthorizedException vira CredenciaisInvalidasError', async () => {
    estado.comportamento = (cb) =>
      (cb as Callbacks).onFailure({ code: 'NotAuthorizedException', name: 'NotAuthorizedException' });
    await expect(adapter().autenticar({ email: 'a@b.c', senha: 'x' })).rejects.toBeInstanceOf(
      CredenciaisInvalidasError,
    );
  });

  it('erro inesperado vira Error genérico (sem expor detalhes)', async () => {
    estado.comportamento = (cb) => (cb as Callbacks).onFailure({ name: 'NetworkError' });
    await expect(adapter().autenticar({ email: 'a@b.c', senha: 'x' })).rejects.toThrow(
      'Não foi possível entrar',
    );
  });

  it('desafio de nova senha é recusado com mensagem clara', async () => {
    estado.comportamento = (cb) => (cb as Callbacks).newPasswordRequired();
    await expect(adapter().autenticar({ email: 'a@b.c', senha: 'x' })).rejects.toThrow(/senha provisória/);
  });
});
