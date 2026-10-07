import { createHash } from 'node:crypto';
import { App, Tags, Validations } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { SigfrotaBaseStack } from './stacks/base-stack';

/** Região única da solução (Requisito 2.2). Nenhum outro arquivo deve fixar a região. */
export const REGIAO = 'us-east-1';

/** Prefixo de todos os nomes explícitos de recursos (Requisito 1.5). */
export const PREFIXO = 'sigfrota';

/** Tags aplicadas a todos os recursos, para rateio de custo (Requisito 1.6). */
export const TAGS: Readonly<Record<string, string>> = {
  Projeto: 'sigfrota',
  Modulo: 'lavagem',
};

/** Origem do servidor de desenvolvimento do front (Vite). */
export const ORIGEM_LOCAL = 'http://localhost:5173';

/**
 * Sufixo de unicidade derivado da conta (Requisito 2.3): os 8 primeiros
 * caracteres hexadecimais do SHA-256 do ID da conta. É determinístico por
 * conta e não expõe o ID da conta em URLs públicas (ex.: domínio do Cognito).
 */
export function calcularSufixo(conta: string): string {
  return createHash('sha256').update(conta).digest('hex').slice(0, 8);
}

/**
 * Prefixo do domínio de login do Cognito: `sigfrota-<sufixo>` (Requisitos 2.3 e 4.8).
 * Fonte única usada pelo Cognito e pela CSP do CloudFront.
 */
export function prefixoDominioCognito(conta: string): string {
  return `${PREFIXO}-${calcularSufixo(conta)}`;
}

/**
 * URL do domínio de login gerenciado do Cognito, ex.:
 * `https://sigfrota-1a2b3c4d.auth.us-east-1.amazoncognito.com`.
 */
export function urlDominioCognito(conta: string): string {
  return `https://${prefixoDominioCognito(conta)}.auth.${REGIAO}.amazoncognito.com`;
}

/** Opções de criação do app CDK. */
export interface OpcoesCriarApp {
  /** ID da conta AWS. Padrão: `process.env.CDK_DEFAULT_ACCOUNT`. */
  conta?: string;
  /** Contexto do CDK (ex.: `throttleTaxa`, `throttleRajada`). */
  contexto?: Record<string, unknown>;
  /** Caminho do build do front; os testes injetam um caminho inexistente. */
  caminhoDist?: string;
}

/**
 * Cria o App CDK com tags, verificações do cdk-nag e a stack base.
 * Usado pelo `bin/sigfrota.ts` e pelos testes (sem credenciais AWS).
 */
export function criarApp(opcoes: OpcoesCriarApp = {}): { app: App; base: SigfrotaBaseStack } {
  const conta = opcoes.conta ?? process.env.CDK_DEFAULT_ACCOUNT;
  if (!conta) {
    throw new Error('Conta AWS não informada. Use --profile hackaton ou informe a conta.');
  }

  const app = new App({ context: opcoes.contexto });

  // Tags de rateio de custo em todos os recursos do app.
  for (const [chave, valor] of Object.entries(TAGS)) {
    Tags.of(app).add(chave, valor);
  }

  // Regras AwsSolutions do cdk-nag em todas as stacks (Requisito 9.1).
  // No cdk-nag v3 o pacote é um plugin de validação do CDK (não mais um Aspect):
  // violações sem `Validations.of(...).acknowledge()` fazem o synth falhar.
  Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));

  const env = { account: conta, region: REGIAO };
  const base = new SigfrotaBaseStack(app, 'SigfrotaBase', {
    env,
    description: 'SIG Frota — módulo de Lavagem: infraestrutura base',
    caminhoDist: opcoes.caminhoDist,
  });

  return { app, base };
}
