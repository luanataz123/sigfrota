import { CfnOutput, Stack, Token, type StackProps } from 'aws-cdk-lib';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { PREFIXO, urlDominioCognito } from '../config';
import { Api } from '../constructs/api';
import { Autenticacao } from '../constructs/autenticacao';
import { Tabela } from '../constructs/dados';
import { Front } from '../constructs/front';
import type { ContratoInfra } from '../contrato';
import { suprimirBase } from '../nag';

/** Propriedades da stack base. */
export interface SigfrotaBaseStackProps extends StackProps {
  /**
   * Caminho do build do front (`web/dist`). Opcional; os testes injetam um
   * caminho inexistente para não depender do build.
   */
  caminhoDist?: string;
}

/** Item do contrato publicado como `CfnOutput` e parâmetro SSM (Requisito 8.1). */
interface ItemPublicado {
  /** ID lógico do output (ex.: `TabelaNome`). */
  readonly output: string;
  /** Sufixo do parâmetro SSM, depois de `/sigfrota/` (ex.: `tabela/nome`). */
  readonly ssm: string;
  readonly valor: string;
  readonly descricao: string;
}

/**
 * Stack base do SIG Frota — módulo de Lavagem.
 *
 * Ordem de composição, que evita referências circulares dentro da stack:
 * 1. `Tabela` (DynamoDB).
 * 2. `Front` (bucket e distribution) — fornece a URL do CloudFront.
 * 3. `Autenticacao` — callbacks e logout com a URL do CloudFront (4.7).
 * 4. `Api` — CORS com a origem do CloudFront (5.4) e authorizer do Cognito.
 * 5. Publicação do conteúdo do front com o `config.json` (6.7).
 *
 * O domínio do Cognito é calculado uma única vez (`urlDominioCognito`) e
 * repassado ao `Front` (CSP) e ao `Autenticacao` (domínio gerenciado), para
 * garantir que os dois usem o mesmo valor.
 */
export class SigfrotaBaseStack extends Stack {
  /** Caminho do build do front recebido por prop (pode ser indefinido). */
  readonly caminhoDist?: string;

  /** Contrato de infra consumido pelas stacks dos specs 3, 5 e 6 (Requisito 8.2). */
  readonly contrato: ContratoInfra;

  constructor(scope: Construct, id: string, props: SigfrotaBaseStackProps = {}) {
    super(scope, id, props);
    this.caminhoDist = props.caminhoDist;

    // O sufixo do domínio do Cognito exige a conta concreta em tempo de synth.
    const conta = this.account;
    if (Token.isUnresolved(conta)) {
      throw new Error(
        'A conta AWS precisa ser concreta no synth (env.account). Use --profile hackaton.',
      );
    }
    const dominioCognito = urlDominioCognito(conta);

    // 1. Tabela única do módulo (Requisito 3).
    const tabela = new Tabela(this, 'Dados').tabela;

    // 2. Bucket e distribuição do front; a CSP usa o mesmo domínio do Cognito.
    const front = new Front(this, 'Front', { caminhoDist: props.caminhoDist, dominioCognito });

    // 3. Cognito com callbacks e logout na URL do CloudFront.
    const auth = new Autenticacao(this, 'Autenticacao', { urlFront: front.urlFront, conta });

    // 4. HTTP API com CORS restrito ao CloudFront e authorizer JWT do Cognito.
    const api = new Api(this, 'Api', {
      userPool: auth.userPool,
      userPoolClient: auth.userPoolClient,
      origemFront: front.urlFront,
    });

    // 5. Conteúdo do front + config.json, depois que API e Cognito existem.
    const apiUrl = api.api.apiEndpoint;
    front.publicarConteudo({
      apiUrl,
      userPoolId: auth.userPool.userPoolId,
      userPoolClientId: auth.userPoolClient.userPoolClientId,
      cognitoDominio: auth.urlDominio,
    });

    // 6. Supressões justificadas do cdk-nag, por recurso (Requisito 9.3).
    suprimirBase(this, {
      bucketFront: front.bucket,
      distribuicao: front.distribution,
      userPool: auth.userPool,
    });

    this.contrato = {
      tabela,
      userPool: auth.userPool,
      userPoolClient: auth.userPoolClient,
      api: api.api,
      authorizer: api.authorizer,
      distribution: front.distribution,
      urlFront: front.urlFront,
      dominioCognito: auth.urlDominio,
      regiao: this.region,
    };

    // Contrato publicado para scripts e ferramentas fora do app CDK (Requisito 8.1).
    const itens: ItemPublicado[] = [
      { output: 'TabelaNome', ssm: 'tabela/nome', valor: tabela.tableName, descricao: 'Nome da tabela DynamoDB' },
      { output: 'TabelaArn', ssm: 'tabela/arn', valor: tabela.tableArn, descricao: 'ARN da tabela DynamoDB' },
      { output: 'ApiUrl', ssm: 'api/url', valor: apiUrl, descricao: 'URL da HTTP API' },
      { output: 'UserPoolId', ssm: 'cognito/user-pool-id', valor: auth.userPool.userPoolId, descricao: 'ID do User Pool do Cognito' },
      { output: 'UserPoolClientId', ssm: 'cognito/client-id', valor: auth.userPoolClient.userPoolClientId, descricao: 'ID do App Client da SPA' },
      { output: 'CognitoDominio', ssm: 'cognito/dominio', valor: auth.urlDominio, descricao: 'URL do domínio de login do Cognito' },
      { output: 'FrontUrl', ssm: 'front/url', valor: front.urlFront, descricao: 'URL do front no CloudFront' },
    ];

    for (const item of itens) {
      new CfnOutput(this, item.output, { value: item.valor, description: item.descricao });
      new StringParameter(this, `Param${item.output}`, {
        parameterName: `/${PREFIXO}/${item.ssm}`,
        stringValue: item.valor,
        description: item.descricao,
      });
    }
  }
}
