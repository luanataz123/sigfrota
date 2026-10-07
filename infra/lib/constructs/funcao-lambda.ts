import * as path from 'node:path';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import type { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import {
  ApplicationLogLevel,
  Architecture,
  LoggingFormat,
  Runtime,
  SystemLogLevel,
  Tracing,
} from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { suprimirFuncaoLambda } from '../nag';

/**
 * Forma de acesso da função à tabela, sempre declarada de forma explícita
 * (Requisito 7.3). Ausência de `acessoTabela` significa nenhum acesso.
 */
export type AcessoTabela =
  | { tabela: ITable; modo: 'leitura' }
  | { tabela: ITable; modo: 'leituraEscrita' }
  /** Ações específicas, ex.: `['dynamodb:Query', 'dynamodb:GetItem']`. */
  | { tabela: ITable; modo: 'acoes'; acoes: string[] };

/** Propriedades do construto `FuncaoLambda`. */
export interface FuncaoLambdaProps {
  /** Caminho absoluto do handler (ex.: `services/api/src/handlers/listar.ts`). */
  entry: string;
  /** Nome da função exportada pelo handler. Padrão: `handler`. */
  handler?: string;
  /** Acesso à tabela; ausente = sem acesso. */
  acessoTabela?: AcessoTabela;
  /** Variáveis de ambiente; nomes que sugerem segredo são rejeitados (Requisito 7.7). */
  ambiente?: Record<string, string>;
  /** Timeout da função. Padrão: 10 s. */
  timeout?: Duration;
  /** Memória em MB. Padrão: 512. */
  memoria?: number;
  /** Descrição da função no console. */
  descricao?: string;
}

/** Nomes de variáveis de ambiente que indicam segredo em texto puro. */
const PADRAO_SEGREDO = /(SECRET|SEGREDO|PASSWORD|SENHA|TOKEN|API_KEY|PRIVATE_KEY)/i;

/** Ação DynamoDB específica, sem curinga (ex.: `dynamodb:GetItem`). */
const PADRAO_ACAO_DYNAMODB = /^dynamodb:[A-Za-z]+$/;

/** Raiz do monorepo (infra/lib/constructs → raiz), para empacotar `packages/dominio`. */
const RAIZ_MONOREPO = path.resolve(__dirname, '../../..');

/** Valida os nomes das variáveis de ambiente contra o padrão de segredo. */
function validarAmbiente(ambiente: Record<string, string>): void {
  for (const nome of Object.keys(ambiente)) {
    if (PADRAO_SEGREDO.test(nome)) {
      throw new Error(
        `Variável de ambiente "${nome}" parece um segredo. ` +
          'Use Secrets Manager ou SSM SecureString; segredos não podem ir em variáveis de ambiente.',
      );
    }
  }
}

/** Valida a lista de ações específicas do DynamoDB. */
function validarAcoes(acoes: string[]): void {
  if (acoes.length === 0) {
    throw new Error('Declare ao menos uma ação do DynamoDB em acessoTabela.acoes.');
  }
  for (const acao of acoes) {
    if (acao.includes('*') || !PADRAO_ACAO_DYNAMODB.test(acao)) {
      throw new Error(
        `Ação inválida em acessoTabela.acoes: "${acao}". ` +
          'Declare ações específicas, sem curinga, no formato dynamodb:<Nome>.',
      );
    }
  }
}

/**
 * Lambda Node.js padrão do SIG Frota, com menor privilégio (Requisito 7).
 *
 * - Runtime Node.js 24, ARM64, empacotamento via esbuild local (7.1).
 * - Role exclusiva por função, sem managed policies (7.2).
 * - Acesso à tabela declarado de forma granular (7.3, 3.5).
 * - Log group dedicado com 30 dias de retenção e `DESTROY` (7.5, 9.6).
 * - X-Ray ativo; timeout e memória padrão sobrescrevíveis (7.6).
 * - Rejeita segredos em variáveis de ambiente (7.7).
 *
 * Exceção justificada (7.4): o tracing ativo adiciona `xray:PutTraceSegments`
 * e `xray:PutTelemetryRecords` com `Resource: "*"`, porque o X-Ray não aceita
 * restrição por recurso. A supressão correspondente fica em `lib/nag.ts` e é
 * aplicada pelo próprio construto.
 */
export class FuncaoLambda extends Construct {
  readonly funcao: NodejsFunction;
  readonly role: Role;
  readonly logGroup: LogGroup;

  constructor(scope: Construct, id: string, props: FuncaoLambdaProps) {
    super(scope, id);

    const ambiente: Record<string, string> = { ...(props.ambiente ?? {}) };
    validarAmbiente(ambiente);

    const acesso = props.acessoTabela;
    if (acesso?.modo === 'acoes') {
      validarAcoes(acesso.acoes);
    }

    // Role exclusiva, sem managed policies: como é passada ao NodejsFunction,
    // o CDK não anexa a AWSLambdaBasicExecutionRole.
    this.role = new Role(this, 'Role', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      description: props.descricao,
    });

    // Log group dedicado; a permissão de escrita fica restrita a ele.
    this.logGroup = new LogGroup(this, 'Logs', {
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    this.logGroup.grantWrite(this.role);

    if (acesso) {
      ambiente.TABELA_NOME = acesso.tabela.tableName;
    }

    this.funcao = new NodejsFunction(this, 'Funcao', {
      entry: props.entry,
      handler: props.handler ?? 'handler',
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      role: this.role,
      logGroup: this.logGroup,
      tracing: Tracing.ACTIVE,
      loggingFormat: LoggingFormat.JSON,
      applicationLogLevelV2: ApplicationLogLevel.INFO,
      systemLogLevelV2: SystemLogLevel.WARN,
      timeout: props.timeout ?? Duration.seconds(10),
      memorySize: props.memoria ?? 512,
      description: props.descricao,
      projectRoot: RAIZ_MONOREPO,
      depsLockFilePath: path.join(RAIZ_MONOREPO, 'package-lock.json'),
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        ...ambiente,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });

    // Exceção justificada do X-Ray no cdk-nag, herdada por todas as stacks (7.4).
    suprimirFuncaoLambda(this.role);

    // Concede o acesso declarado à tabela, sempre à role exclusiva.
    if (acesso) {
      switch (acesso.modo) {
        case 'leitura':
          acesso.tabela.grantReadData(this.role);
          break;
        case 'leituraEscrita':
          acesso.tabela.grantReadWriteData(this.role);
          break;
        case 'acoes':
          acesso.tabela.grant(this.role, ...acesso.acoes);
          break;
      }
    }
  }
}
