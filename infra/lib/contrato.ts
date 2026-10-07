import {
  HttpMethod,
  HttpNoneAuthorizer,
  HttpRoute,
  HttpRouteKey,
  type HttpApi,
  type IHttpRouteAuthorizer,
} from 'aws-cdk-lib/aws-apigatewayv2';
import type { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { IDistribution } from 'aws-cdk-lib/aws-cloudfront';
import type { IUserPool, IUserPoolClient } from 'aws-cdk-lib/aws-cognito';
import type { ITable } from 'aws-cdk-lib/aws-dynamodb';
import type { IFunction } from 'aws-cdk-lib/aws-lambda';
import type { Construct } from 'constructs';

/**
 * Contrato de infra (Requisito 8): recursos base publicados pela stack
 * `SigfrotaBase` e consumidos, por referência nativa do CDK, pelas stacks dos
 * specs 3 (`api-lavagens`), 5 (`ia-extracao-regras`) e 6 (`ia-leitura-recibo`).
 */
export interface ContratoInfra {
  /** Tabela única `sigfrota-lavagem` (PK/SK). */
  readonly tabela: ITable;
  /** User Pool do Cognito com os grupos `atendente` e `gestor`. */
  readonly userPool: IUserPool;
  /** App Client público da SPA. */
  readonly userPoolClient: IUserPoolClient;
  /** HTTP API base, onde as rotas são registradas via `registrarRota()`. */
  readonly api: HttpApi;
  /** Authorizer JWT padrão da API. */
  readonly authorizer: HttpJwtAuthorizer;
  /** Distribuição CloudFront do front. */
  readonly distribution: IDistribution;
  /** URL do front, ex.: `https://d123.cloudfront.net`. */
  readonly urlFront: string;
  /** URL do domínio de login, ex.: `https://sigfrota-1a2b3c4d.auth.us-east-1.amazoncognito.com`. */
  readonly dominioCognito: string;
  /** Região da solução (`us-east-1`). */
  readonly regiao: string;
}

/** Métodos HTTP aceitos em rotas registradas (sem `ANY`, para preservar o preflight CORS). */
export type MetodoRota = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** Propriedades de uma rota registrada na HTTP API base. */
export interface RotaProps {
  /** Método HTTP. */
  readonly metodo: MetodoRota;
  /** Caminho iniciado por `/`, ex.: `/veiculos/{idVeiculo}/lavagens`. */
  readonly caminho: string;
  /** Lambda que atende a rota (normalmente `FuncaoLambda.funcao`). */
  readonly funcao: IFunction;
  /**
   * Rota sem autenticação. Padrão `false`: a rota exige JWT do Cognito
   * (Requisito 5.2). Só use `true` com justificativa explícita.
   */
  readonly publica?: boolean;
}

const METODOS: Readonly<Record<MetodoRota, HttpMethod>> = {
  GET: HttpMethod.GET,
  POST: HttpMethod.POST,
  PUT: HttpMethod.PUT,
  DELETE: HttpMethod.DELETE,
};

/**
 * Caminho válido: começa com `/`, segmentos com letras, dígitos, `-`, `_`, `.`
 * ou parâmetros `{nome}` / `{nome+}`. Rejeita espaços, `$default` e barra dupla.
 */
const PADRAO_CAMINHO = /^\/$|^(\/([A-Za-z0-9._-]+|\{[A-Za-z0-9_]+\+?\}))+$/;

/** Valida método e caminho da rota, com mensagens em português. */
function validarRota(rota: RotaProps): void {
  if (!Object.prototype.hasOwnProperty.call(METODOS, rota.metodo)) {
    throw new Error(
      `Método de rota inválido: "${String(rota.metodo)}". Use GET, POST, PUT ou DELETE.`,
    );
  }
  if (typeof rota.caminho !== 'string' || !rota.caminho.startsWith('/')) {
    throw new Error(
      `Caminho de rota inválido: "${String(rota.caminho)}". O caminho deve começar com "/".`,
    );
  }
  if (!PADRAO_CAMINHO.test(rota.caminho)) {
    throw new Error(
      `Caminho de rota inválido: "${rota.caminho}". Use segmentos com letras, dígitos, "-", "_", "." ` +
        'ou parâmetros no formato {nome}, sem espaços nem barras duplas.',
    );
  }
}

/**
 * ID do construto derivado do método e do caminho.
 * Ex.: `GET /veiculos/{idVeiculo}/lavagens` → `Rota-GET-veiculos-idVeiculo-lavagens`.
 */
export function idRota(metodo: MetodoRota, caminho: string): string {
  const partes = caminho.split(/[^A-Za-z0-9]+/).filter((parte) => parte.length > 0);
  return ['Rota', metodo, ...(partes.length > 0 ? partes : ['raiz'])].join('-');
}

/**
 * Registra uma rota na HTTP API base (Requisitos 5.2, 5.7 e 8.2).
 *
 * A rota e a integração são criadas no escopo da stack consumidora, e não com
 * `api.addRoutes()`: assim a stack base não referencia funções de outras
 * stacks e não surge dependência circular. O authorizer é sempre passado de
 * forma explícita: o JWT do contrato, ou `HttpNoneAuthorizer` só quando
 * `publica: true`. O stage `$default` tem `autoDeploy`, então a rota entra no
 * ar no próximo deploy sem passo extra.
 */
export function registrarRota(scope: Construct, contrato: ContratoInfra, rota: RotaProps): HttpRoute {
  validarRota(rota);

  const id = idRota(rota.metodo, rota.caminho);
  const authorizer: IHttpRouteAuthorizer =
    rota.publica === true ? new HttpNoneAuthorizer() : contrato.authorizer;

  return new HttpRoute(scope, id, {
    httpApi: contrato.api,
    routeKey: HttpRouteKey.with(rota.caminho, METODOS[rota.metodo]),
    integration: new HttpLambdaIntegration(`${id}-Integracao`, rota.funcao),
    authorizer,
  });
}
