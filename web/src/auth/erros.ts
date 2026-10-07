// auth/erros.ts
//
// Erros de autenticação compartilhados pelos adapters (mock e Cognito). A
// `LoginPage` exibe a mensagem de `CredenciaisInvalidasError` ao usuário.

/** Erro de credenciais inválidas, exibível na tela de login (tarefa 3.2). */
export class CredenciaisInvalidasError extends Error {
  constructor(message = 'E-mail ou senha inválidos.') {
    super(message);
    this.name = 'CredenciaisInvalidasError';
  }
}
