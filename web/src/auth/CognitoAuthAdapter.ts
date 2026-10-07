// auth/CognitoAuthAdapter.ts
//
// Adapter de autenticação real com Amazon Cognito (Req. 1), no mesmo contrato
// `AuthAdapter` do mock: a `LoginPage` e o `AuthProvider` não mudam.
//
// - Fluxo SRP (`USER_SRP_AUTH`): a senha não trafega em texto; é o fluxo
//   habilitado no App Client da infra (`infra/lib/constructs/autenticacao.ts`).
// - Devolve o ACCESS token, validado pelo authorizer JWT do API Gateway
//   (audiência = client_id) e enviado em `Authorization: Bearer` (Req. 1.3).
// - Tokens ficam só em memória (`ArmazenamentoMemoria`), como no design
//   ("Segurança no cliente"): nada vai para localStorage; recarregar a página
//   exige novo login.
// - O Cognito guarda só o e-mail (LGPD / OT nº 17): o nome exibido é o e-mail.

import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  type CognitoUserSession,
  type ICognitoStorage,
} from 'amazon-cognito-identity-js';
import type { AuthAdapter, Credenciais, Sessao } from './AuthProvider';
import { CredenciaisInvalidasError } from './erros';

/** Configuração pública do User Pool (vem do `web/.env.local`). */
export interface CognitoConfig {
  userPoolId: string;
  clientId: string;
}

/** Storage em memória para o SDK do Cognito (nada persiste no navegador). */
class ArmazenamentoMemoria implements ICognitoStorage {
  private readonly dados = new Map<string, string>();
  setItem(chave: string, valor: string) {
    this.dados.set(chave, valor);
  }
  getItem(chave: string) {
    return this.dados.get(chave) ?? null;
  }
  removeItem(chave: string) {
    this.dados.delete(chave);
  }
  clear() {
    this.dados.clear();
  }
}

/** Erros do Cognito que significam credenciais inválidas. */
const ERROS_CREDENCIAIS = new Set([
  'NotAuthorizedException',
  'UserNotFoundException',
  'UserNotConfirmedException',
]);

export class CognitoAuthAdapter implements AuthAdapter {
  private readonly storage = new ArmazenamentoMemoria();
  private readonly pool: CognitoUserPool;

  constructor(config: CognitoConfig) {
    this.pool = new CognitoUserPool({
      UserPoolId: config.userPoolId,
      ClientId: config.clientId,
      Storage: this.storage,
    });
  }

  autenticar({ email, senha }: Credenciais): Promise<Sessao> {
    const username = email.trim().toLowerCase();
    const usuario = new CognitoUser({ Username: username, Pool: this.pool, Storage: this.storage });
    const detalhes = new AuthenticationDetails({ Username: username, Password: senha });

    return new Promise<Sessao>((resolve, reject) => {
      usuario.authenticateUser(detalhes, {
        onSuccess: (sessao: CognitoUserSession) => {
          const emailToken = sessao.getIdToken().decodePayload().email;
          const emailUsuario = typeof emailToken === 'string' ? emailToken : username;
          resolve({
            token: sessao.getAccessToken().getJwtToken(),
            usuario: { nome: emailUsuario, email: emailUsuario },
          });
        },
        onFailure: (erro: unknown) => {
          const e = erro as { name?: string; code?: string } | null;
          const codigo = e?.code ?? e?.name ?? '';
          reject(
            ERROS_CREDENCIAIS.has(codigo)
              ? new CredenciaisInvalidasError()
              : new Error('Não foi possível entrar. Tente novamente.'),
          );
        },
        // Usuários de teste são criados com senha permanente
        // (infra/scripts/criar-usuarios.mjs); estes desafios não são tratados no MVP.
        newPasswordRequired: () =>
          reject(new CredenciaisInvalidasError('Troque a senha provisória antes de entrar.')),
        mfaRequired: () => reject(new Error('MFA não suportado nesta versão.')),
        totpRequired: () => reject(new Error('MFA não suportado nesta versão.')),
      });
    });
  }
}
