import { Duration, RemovalPolicy, Stack, Token } from 'aws-cdk-lib';
import {
  AccountRecovery,
  CfnUserPoolGroup,
  FeaturePlan,
  Mfa,
  OAuthScope,
  UserPool,
  type IUserPool,
  type IUserPoolClient,
  type UserPoolDomain,
} from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import { ORIGEM_LOCAL, PREFIXO, prefixoDominioCognito, urlDominioCognito } from '../config';

/** Grupos de acesso do módulo de Lavagem (Requisito 4.2). */
export const GRUPOS = ['atendente', 'gestor'] as const;

/** Propriedades do construto de autenticação. */
export interface AutenticacaoProps {
  /** URL do front no CloudFront, ex.: `https://d123.cloudfront.net` (Requisito 4.7). */
  readonly urlFront: string;
  /**
   * ID da conta usado no sufixo de unicidade. Padrão: a conta da stack.
   * Precisa ser concreto em tempo de synth, porque o prefixo do domínio
   * é uma string literal (usada também na CSP do CloudFront).
   */
  readonly conta?: string;
}

/**
 * Autenticação com Amazon Cognito (Requisito 4).
 *
 * - User Pool sem auto cadastro (4.1), login por e-mail e nenhum outro
 *   atributo pessoal, por minimização de dados da LGPD / OT nº 17 (4.3).
 * - Senha mínima de 12 caracteres com os quatro tipos (4.4); MFA opcional
 *   apenas por TOTP (4.5); recuperação só por e-mail.
 * - Grupos `atendente` e `gestor` (4.2).
 * - App Client público para a SPA: sem segredo, só Authorization Code
 *   (o PKCE é aplicado pelo cliente), sem fluxo implícito (4.6), callbacks no
 *   CloudFront e em localhost (4.7), tokens de 60 minutos (4.9).
 * - Domínio gerenciado `sigfrota-<sufixo>` (4.8).
 * - `RemovalPolicy.DESTROY` (2.6).
 */
export class Autenticacao extends Construct {
  readonly userPool: IUserPool;
  readonly userPoolClient: IUserPoolClient;
  readonly dominio: UserPoolDomain;
  /** Prefixo do domínio de login, ex.: `sigfrota-1a2b3c4d`. */
  readonly prefixoDominio: string;
  /** URL do domínio de login, ex.: `https://sigfrota-1a2b3c4d.auth.us-east-1.amazoncognito.com`. */
  readonly urlDominio: string;

  constructor(scope: Construct, id: string, props: AutenticacaoProps) {
    super(scope, id);

    const conta = props.conta ?? Stack.of(this).account;
    if (Token.isUnresolved(conta)) {
      throw new Error(
        'A conta AWS precisa ser concreta no synth para calcular o domínio do Cognito. ' +
          'Defina env.account na stack (use --profile hackaton).',
      );
    }

    const pool = new UserPool(this, 'UserPool', {
      userPoolName: `${PREFIXO}-usuarios`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      // Apenas o e-mail; nenhum atributo padrão ou customizado adicional.
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      mfa: Mfa.OPTIONAL,
      mfaSecondFactor: { otp: true, sms: false },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      featurePlan: FeaturePlan.ESSENTIALS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    for (const grupo of GRUPOS) {
      new CfnUserPoolGroup(this, `Grupo-${grupo}`, {
        userPoolId: pool.userPoolId,
        groupName: grupo,
        description: `Perfil ${grupo} do SIG Frota — Lavagem`,
      });
    }

    // Callback e logout na raiz (contrato com o spec 4), com barra final.
    const urlFrontRaiz = `${props.urlFront.replace(/\/+$/, '')}/`;
    const urlsRetorno = [urlFrontRaiz, `${ORIGEM_LOCAL}/`];

    this.userPoolClient = pool.addClient('ClienteSpa', {
      userPoolClientName: `${PREFIXO}-spa`,
      generateSecret: false,
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      oAuth: {
        flows: { authorizationCodeGrant: true, implicitCodeGrant: false },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL],
        callbackUrls: urlsRetorno,
        logoutUrls: urlsRetorno,
      },
      accessTokenValidity: Duration.minutes(60),
      idTokenValidity: Duration.minutes(60),
      refreshTokenValidity: Duration.days(1),
    });

    this.prefixoDominio = prefixoDominioCognito(conta);
    this.urlDominio = urlDominioCognito(conta);
    this.dominio = pool.addDomain('Dominio', {
      cognitoDomain: { domainPrefix: this.prefixoDominio },
    });

    this.userPool = pool;
  }
}
