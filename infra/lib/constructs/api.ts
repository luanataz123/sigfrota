import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { CfnStage, CorsHttpMethod, HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import type { IUserPool, IUserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { ORIGEM_LOCAL, PREFIXO } from '../config';

/** Valores padrão de throttling, usados se o contexto do CDK não os definir. */
const THROTTLE_TAXA_PADRAO = 50;
const THROTTLE_RAJADA_PADRAO = 100;

/** Propriedades do construto `Api`. */
export interface ApiProps {
  /** User Pool que emite os tokens validados pelo authorizer JWT (Requisito 5.1). */
  readonly userPool: IUserPool;
  /** App Client da SPA; o ID entra como audiência do authorizer. */
  readonly userPoolClient: IUserPoolClient;
  /**
   * Origem do front no CloudFront, no formato `https://<domínio>` (sem barra final).
   * É a única origem de produção aceita pelo CORS (Requisito 5.4).
   */
  readonly origemFront: string;
}

/**
 * Nome do log group dos access logs da API. É função, e não constante, para
 * não ler `PREFIXO` no topo do módulo durante o ciclo de import com `config.ts`.
 */
export function nomeLogGroupApi(): string {
  return `/aws/apigateway/${PREFIXO}-api`;
}

/**
 * Formato JSON dos access logs (Requisitos 5.6 e 9.5). Só campos operacionais
 * e o `sub` do usuário; ficam de fora IP, cabeçalho `Authorization`, corpo da
 * requisição e e-mail, em atenção à minimização de dados da LGPD (OT nº 17).
 */
export function formatoAccessLog(): string {
  return JSON.stringify({
    requestId: '$context.requestId',
    requestTime: '$context.requestTime',
    routeKey: '$context.routeKey',
    status: '$context.status',
    responseLatency: '$context.responseLatency',
    integrationErrorMessage: '$context.integrationErrorMessage',
    sub: '$context.authorizer.claims.sub',
  });
}

/** Lê um número positivo do contexto do CDK, com valor padrão. */
function lerNumeroContexto(escopo: Construct, chave: string, padrao: number): number {
  const bruto: unknown = escopo.node.tryGetContext(chave);
  if (bruto === undefined || bruto === null || bruto === '') {
    return padrao;
  }
  const valor = Number(bruto);
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error(`Contexto "${chave}" inválido: informe um número positivo (recebido: ${String(bruto)}).`);
  }
  return valor;
}

/**
 * HTTP API do SIG Frota protegida por JWT do Cognito (Requisito 5).
 *
 * - Authorizer JWT como padrão de todas as rotas (5.1, 5.2). Token ausente,
 *   inválido ou expirado recebe 401 do próprio API Gateway, sem invocar a
 *   Lambda (5.3).
 * - CORS restrito ao CloudFront e ao `localhost:5173`, sem `*` (5.4).
 * - Throttling no stage `$default`, configurável pelo contexto (5.5).
 * - Access logs JSON sem dados pessoais, com retenção de 30 dias (5.6, 9.5, 9.6).
 * - As claims do token (incluindo `cognito:groups`) chegam à Lambda em
 *   `event.requestContext.authorizer.jwt.claims`, sem configuração extra (5.8).
 *
 * Rotas são registradas pelos specs consumidores via `registrarRota()`; não
 * usar rotas `ANY` nem `$default`, para o preflight `OPTIONS` continuar sendo
 * respondido pelo CORS sem passar pelo authorizer.
 */
export class Api extends Construct {
  /** HTTP API base, exposta para o contrato de infra. */
  readonly api: HttpApi;
  /** Authorizer JWT padrão, reutilizado por `registrarRota()`. */
  readonly authorizer: HttpJwtAuthorizer;
  /** Log group dos access logs do stage `$default`. */
  readonly logGroup: LogGroup;

  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);

    if (!props.origemFront || props.origemFront.endsWith('/')) {
      throw new Error('origemFront deve estar no formato https://<domínio>, sem barra final.');
    }

    // Issuer do User Pool na região da stack (a região é fixada só em config.ts).
    const regiao = Stack.of(this).region;
    const issuer = `https://cognito-idp.${regiao}.amazonaws.com/${props.userPool.userPoolId}`;

    // O API Gateway compara `aud` (ID token) ou `client_id` (access token) com a audiência.
    this.authorizer = new HttpJwtAuthorizer('Jwt', issuer, {
      authorizerName: `${PREFIXO}-jwt`,
      jwtAudience: [props.userPoolClient.userPoolClientId],
    });

    this.api = new HttpApi(this, 'HttpApi', {
      apiName: `${PREFIXO}-api`,
      description: 'SIG Frota — módulo de Lavagem: API REST protegida por JWT do Cognito',
      defaultAuthorizer: this.authorizer,
      corsPreflight: {
        allowOrigins: [props.origemFront, ORIGEM_LOCAL],
        allowHeaders: ['authorization', 'content-type'],
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.PUT,
          CorsHttpMethod.DELETE,
          CorsHttpMethod.OPTIONS,
        ],
        maxAge: Duration.hours(1),
        allowCredentials: false,
      },
      createDefaultStage: true,
    });

    // Log group dedicado aos access logs, com retenção definida (9.6).
    this.logGroup = new LogGroup(this, 'AccessLogs', {
      logGroupName: nomeLogGroupApi(),
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Escape hatch no stage `$default`: throttling e access logs (5.5, 5.6).
    const stage = this.api.defaultStage?.node.defaultChild as CfnStage | undefined;
    if (!stage) {
      throw new Error('Stage $default da HTTP API não encontrado.');
    }
    stage.defaultRouteSettings = {
      throttlingRateLimit: lerNumeroContexto(this, 'throttleTaxa', THROTTLE_TAXA_PADRAO),
      throttlingBurstLimit: lerNumeroContexto(this, 'throttleRajada', THROTTLE_RAJADA_PADRAO),
    };
    stage.accessLogSettings = {
      destinationArn: this.logGroup.logGroupArn,
      format: formatoAccessLog(),
    };
  }
}
