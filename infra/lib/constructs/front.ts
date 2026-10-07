import * as fs from 'node:fs';
import * as path from 'node:path';
import { Duration, RemovalPolicy, Stack, Token } from 'aws-cdk-lib';
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  HeadersFrameOption,
  HeadersReferrerPolicy,
  HttpVersion,
  PriceClass,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
  type IDistribution,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  ObjectOwnership,
  type IBucket,
} from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source, type ISource } from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import { PREFIXO, REGIAO, urlDominioCognito } from '../config';

/** Propriedades do construto `Front`. */
export interface FrontProps {
  /**
   * Caminho do build do front. Padrão: `web/dist` na raiz do monorepo.
   * Os testes injetam um caminho inexistente para não depender do build.
   */
  caminhoDist?: string;
  /**
   * URL do domínio de login do Cognito (`https://sigfrota-<sufixo>.auth.<região>.amazoncognito.com`),
   * usada na CSP. Padrão: calculada no synth a partir da conta da stack com `calcularSufixo`.
   * Precisa ser uma string concreta (não um token), pois entra literal na CSP.
   */
  dominioCognito?: string;
}

/** Valores publicados no `config.json` do front (Requisito 6.7). */
export interface ConfigFront {
  apiUrl: string;
  userPoolId: string;
  userPoolClientId: string;
  /** URL do domínio de login do Cognito. Padrão: o mesmo domínio usado na CSP. */
  cognitoDominio?: string;
}

/** Página provisória publicada quando não existe build do front (Requisito 6.6). */
const PAGINA_PROVISORIA = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SIG Frota — Lavagem</title>
</head>
<body>
<main>
<h1>SIG Frota — módulo de Lavagem</h1>
<p>Front ainda não publicado. Rode <code>npm run build -w web</code> e depois <code>npm run deploy -w infra</code>.</p>
</main>
</body>
</html>
`;

/**
 * Hospedagem do front em S3 + CloudFront (Requisito 6).
 *
 * - Bucket privado, sem nome explícito, com Block Public Access total,
 *   SSE-S3, `enforceSSL` e `DESTROY` (6.1, 2.4, 2.6, 9.4).
 * - CloudFront com OAC, redirecionamento para HTTPS, cabeçalhos de segurança
 *   e fallback de SPA para `/index.html` (6.2–6.5).
 * - `publicarConteudo()` publica `web/dist` (ou a página provisória) e o
 *   `config.json`; é chamado depois que a API e o Cognito existem (6.6, 6.7).
 */
export class Front extends Construct {
  /** Bucket privado do front. */
  readonly bucket: IBucket;
  /** Distribuição CloudFront. */
  readonly distribution: IDistribution;
  /** URL pública do front (`https://<domínio>.cloudfront.net`), sem barra final. */
  readonly urlFront: string;
  /** URL do domínio de login do Cognito usada na CSP. */
  readonly dominioCognito: string;

  private readonly caminhoDist: string;
  private publicado = false;

  constructor(scope: Construct, id: string, props: FrontProps = {}) {
    super(scope, id);

    this.caminhoDist = props.caminhoDist ?? path.join(__dirname, '../../../web/dist');
    this.dominioCognito = props.dominioCognito ?? this.calcularDominioCognito();

    // Bucket privado: acesso só pelo CloudFront via OAC (6.1, 6.2).
    const bucket = new Bucket(this, 'Bucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Cabeçalhos de segurança (6.4). A CSP usa o curinga regional da API para
    // evitar o ciclo API → Distribution (CORS) → política → API; o domínio do
    // Cognito é literal porque é calculado no synth.
    const hostCognito = this.dominioCognito.replace(/\/+$/, '');
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data: blob:", // blob: para a pré-visualização do recibo (spec 6)
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      [
        "connect-src 'self'",
        `https://*.execute-api.${REGIAO}.amazonaws.com`,
        hostCognito,
        `https://cognito-idp.${REGIAO}.amazonaws.com`,
        `https://*.s3.${REGIAO}.amazonaws.com`, // uploads via URL pré-assinada (specs 5 e 6)
      ].join(' '),
    ].join('; ');

    const cabecalhos = new ResponseHeadersPolicy(this, 'Cabecalhos', {
      responseHeadersPolicyName: `${PREFIXO}-front-seguranca`,
      comment: 'Cabeçalhos de segurança do front do SIG Frota',
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: Duration.seconds(31536000),
          includeSubdomains: true,
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        contentSecurityPolicy: { contentSecurityPolicy: csp, override: true },
      },
    });

    // Distribuição com OAC e HTTPS obrigatório (6.2, 6.3). Com o certificado
    // padrão *.cloudfront.net não é possível fixar o TLS mínimo do navegador;
    // a conexão CloudFront → S3 usa TLS 1.2 ou superior.
    const distribution = new Distribution(this, 'Distribuicao', {
      comment: 'SIG Frota — front do módulo de Lavagem',
      defaultRootObject: 'index.html',
      httpVersion: HttpVersion.HTTP2_AND_3,
      priceClass: PriceClass.PRICE_CLASS_ALL,
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
        responseHeadersPolicy: cabecalhos,
      },
      // Roteamento da SPA: 403/404 do bucket viram index.html com 200 (6.5).
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: Duration.seconds(0),
      })),
    });

    this.bucket = bucket;
    this.distribution = distribution;
    this.urlFront = `https://${distribution.distributionDomainName}`;
  }

  /**
   * Publica o conteúdo do front e o `config.json` (6.6, 6.7).
   * Deve ser chamado uma única vez, depois que a API e o Cognito existirem.
   */
  publicarConteudo(config: ConfigFront): BucketDeployment {
    if (this.publicado) {
      throw new Error('O conteúdo do front já foi publicado; chame publicarConteudo() uma única vez.');
    }
    this.publicado = true;

    // Build do front, se existir; senão, página provisória (o deploy não falha).
    const conteudo: ISource = fs.existsSync(this.caminhoDist)
      ? Source.asset(this.caminhoDist)
      : Source.data('index.html', PAGINA_PROVISORIA);

    // Valores resolvidos em tempo de deploy, lidos pelo front sem rebuild.
    const configJson = Source.jsonData('config.json', {
      apiUrl: config.apiUrl,
      regiao: REGIAO,
      userPoolId: config.userPoolId,
      userPoolClientId: config.userPoolClientId,
      cognitoDominio: config.cognitoDominio ?? this.dominioCognito,
      redirectUri: `${this.urlFront}/`,
    });

    // Log group próprio com retenção definida (9.6).
    const logGroup = new LogGroup(this, 'LogsPublicacao', {
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // retainOnDelete: false apaga os objetos publicados na remoção, deixando o
    // bucket vazio antes do DESTROY, sem o autoDeleteObjects (2.5, 2.6).
    return new BucketDeployment(this, 'Publicacao', {
      sources: [conteudo, configJson],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
      retainOnDelete: false,
      prune: true,
      logGroup,
    });
  }

  /** Calcula o domínio do Cognito a partir da conta concreta da stack. */
  private calcularDominioCognito(): string {
    const conta = Stack.of(this).account;
    if (Token.isUnresolved(conta)) {
      throw new Error(
        'A conta da stack precisa ser concreta para calcular o domínio do Cognito da CSP. ' +
          'Informe env.account ou a prop dominioCognito.',
      );
    }
    return urlDominioCognito(conta);
  }
}
