/**
 * Supressões justificadas do cdk-nag (Requisitos 9.1, 9.2 e 9.3).
 *
 * No cdk-nag v3 as supressões usam a API nativa do CDK
 * `Validations.of(construto).acknowledge({ id, reason })`. O cdk-nag considera
 * reconhecida uma regra quando o `id` aparece nos metadados do recurso ou de
 * qualquer construto ancestral; por isso cada supressão é aplicada no menor
 * construto possível (o recurso afetado), nunca na stack inteira.
 *
 * Regras com vários achados por recurso (ex.: IAM4, IAM5) são reconhecidas
 * achado a achado, no formato `RuleId[Achado]` (equivalente ao `appliesTo` do
 * cdk-nag v2). Não existe reconhecimento por prefixo: um achado novo, não
 * previsto aqui, volta a quebrar o synth — que é o comportamento desejado.
 *
 * Este módulo não importa `config.ts`, para evitar ciclo de importação
 * (`config.ts` → stacks → construtos → `nag.ts`).
 */
import { DefaultStackSynthesizer, Stack, Token, Validations, type CfnResource } from 'aws-cdk-lib';
import type { IConstruct } from 'constructs';

/** Prefixo das regras do pacote AwsSolutions. */
const PACOTE = 'AwsSolutions';

/** Prefixo do ID do construto singleton da Lambda do `BucketDeployment`. */
const PREFIXO_SINGLETON_BUCKET_DEPLOYMENT = 'Custom::CDKBucketDeployment';

/** Reconhece uma regra (ou achado `Regra[Achado]`) com justificativa escrita. */
function reconhecer(alvo: IConstruct, regra: string, justificativa: string): void {
  Validations.of(alvo).acknowledge({ id: `${PACOTE}-${regra}`, reason: justificativa });
}

/** Representação que o cdk-nag usa para `Fn::GetAtt` de ARN: `<IdLogico.Arn>`. */
function arnRenderizado(recurso: IConstruct): string {
  const cfn = (recurso.node.defaultChild ?? recurso) as CfnResource;
  return `<${Stack.of(recurso).getLogicalId(cfn)}.Arn>`;
}

/** Valor como o cdk-nag o renderiza: literal se concreto, `<AWS::Pseudo>` se token. */
function pseudo(valor: string, nome: 'AccountId' | 'Region'): string {
  return Token.isUnresolved(valor) ? `<AWS::${nome}>` : valor;
}

// ---------------------------------------------------------------------------
// FuncaoLambda (specs 1, 3, 5 e 6)
// ---------------------------------------------------------------------------

/**
 * Supressões da role de uma `FuncaoLambda` (Requisito 7.4).
 *
 * Chamada pelo próprio construto, para que as stacks dos specs 3, 5 e 6
 * herdem a supressão sem repetir código.
 *
 * - IAM5 `Resource::*`: o tracing ativo do X-Ray adiciona
 *   `xray:PutTraceSegments` e `xray:PutTelemetryRecords`, que não aceitam
 *   restrição por recurso. Atenção: o achado do cdk-nag não distingue a ação;
 *   qualquer outro `Resource: "*"` acrescentado depois a esta role também
 *   ficaria reconhecido. Por isso o construto não expõe forma de adicionar
 *   políticas com `*`, e o teste de propriedade 4 verifica que o único
 *   `Resource: "*"` acompanha só as ações do X-Ray.
 *
 * Observação: a permissão de escrita no log group da função
 * (`<LogGroup.Arn>`, que já termina em `:*`) não gera achado IAM5, por isso
 * não há reconhecimento para ela.
 */
export function suprimirFuncaoLambda(role: IConstruct): void {
  reconhecer(
    role,
    'IAM5[Resource::*]',
    'X-Ray (tracing ativo): xray:PutTraceSegments e xray:PutTelemetryRecords não aceitam ' +
      'restrição por recurso. É a única exceção a Resource "*" permitida nas roles das Lambdas (Requisito 7.4).',
  );
}

// ---------------------------------------------------------------------------
// Stack base
// ---------------------------------------------------------------------------

/** Recursos da stack base que recebem supressões. */
export interface AlvosNagBase {
  /** Bucket do front (L2). */
  readonly bucketFront: IConstruct;
  /** Distribuição CloudFront do front (L2). */
  readonly distribuicao: IConstruct;
  /** User Pool do Cognito (L2). */
  readonly userPool: IConstruct;
}

/**
 * Supressões dos recursos da stack base, cada uma restrita ao recurso.
 * Deve ser chamada depois de `Front.publicarConteudo()`, porque a Lambda
 * singleton do `BucketDeployment` só existe a partir daí.
 */
export function suprimirBase(stack: Stack, alvos: AlvosNagBase): void {
  // --- Cognito ---------------------------------------------------------------
  reconhecer(
    alvos.userPool,
    'COG2',
    'MFA opcional (TOTP) no MVP, conforme Requisito 4.5. MFA obrigatório está na lista de pendências para produção.',
  );
  // O design previa COG3 (AdvancedSecurityMode). No cdk-nag v3 a verificação
  // equivalente é a COG8 (plano Plus); a COG3 não é acusada com o plano
  // Essentials e, por isso, não é suprimida.
  reconhecer(
    alvos.userPool,
    'COG8',
    'Proteção contra ameaças exige o plano Plus do Cognito (custo por MAU); o MVP usa o plano Essentials. ' +
      'O plano Plus está na lista de pendências para produção.',
  );

  // --- S3 do front -----------------------------------------------------------
  reconhecer(
    alvos.bucketFront,
    'S1',
    'Logs de acesso do S3 ficam para produção. O bucket é privado (Block Public Access total) e só é ' +
      'acessível pelo CloudFront via OAC.',
  );

  // --- CloudFront ------------------------------------------------------------
  reconhecer(
    alvos.distribuicao,
    'CFR1',
    'Sem restrição geográfica no MVP, para não bloquear a banca nem o uso via VPN.',
  );
  reconhecer(alvos.distribuicao, 'CFR2', 'AWS WAF está na lista de pendências para produção.');
  reconhecer(alvos.distribuicao, 'CFR3', 'Logs de acesso do CloudFront ficam para produção.');
  reconhecer(
    alvos.distribuicao,
    'CFR4',
    'Com o certificado padrão *.cloudfront.net não é possível fixar a versão mínima de TLS para o ' +
      'navegador; o TLS mínimo fixo entra com domínio próprio e ACM (pendência de produção).',
  );

  // --- Lambda singleton do BucketDeployment ----------------------------------
  suprimirSingletonBucketDeployment(stack, alvos.bucketFront);
}

/**
 * Supressões da Lambda interna do `BucketDeployment` (recurso do próprio CDK).
 * Restritas ao construto singleton cujo ID começa com `Custom::CDKBucketDeployment`.
 */
function suprimirSingletonBucketDeployment(stack: Stack, bucketFront: IConstruct): void {
  const singletons = stack.node.children.filter((filho) =>
    filho.node.id.startsWith(PREFIXO_SINGLETON_BUCKET_DEPLOYMENT),
  );
  if (singletons.length === 0) {
    throw new Error(
      'Lambda singleton do BucketDeployment não encontrada. Chame suprimirBase() depois de publicarConteudo().',
    );
  }

  // Bucket de assets do bootstrap do CDK: cdk-<qualificador>-assets-<conta>-<região>.
  const sintetizador = stack.synthesizer;
  const qualificador =
    (sintetizador instanceof DefaultStackSynthesizer ? sintetizador.bootstrapQualifier : undefined) ??
    DefaultStackSynthesizer.DEFAULT_QUALIFIER;
  const bucketAssets =
    `arn:<AWS::Partition>:s3:::cdk-${qualificador}-assets-` +
    `${pseudo(stack.account, 'AccountId')}-${pseudo(stack.region, 'Region')}/*`;

  const motivoInterno =
    'Lambda interna do BucketDeployment (recurso do CDK): a política é gerada pela biblioteca, ' +
    'com escopo nos buckets de origem (assets do bootstrap) e de destino (front).';

  for (const singleton of singletons) {
    reconhecer(
      singleton,
      'IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole]',
      `${motivoInterno} A managed policy AWSLambdaBasicExecutionRole é anexada pelo CDK e só permite gravar logs.`,
    );
    for (const acao of ['s3:GetObject*', 's3:GetBucket*', 's3:List*', 's3:DeleteObject*', 's3:Abort*']) {
      reconhecer(
        singleton,
        `IAM5[Action::${acao}]`,
        `${motivoInterno} A ação ${acao} vem dos grants de leitura/escrita do CDK nesses buckets.`,
      );
    }
    reconhecer(
      singleton,
      `IAM5[Resource::${bucketAssets}]`,
      `${motivoInterno} Leitura dos objetos do bucket de assets do bootstrap (origem da publicação).`,
    );
    reconhecer(
      singleton,
      `IAM5[Resource::${arnRenderizado(bucketFront)}/*]`,
      `${motivoInterno} Escrita e remoção (prune) dos objetos do bucket do front.`,
    );
    reconhecer(
      singleton,
      'IAM5[Resource::*]',
      `${motivoInterno} cloudfront:CreateInvalidation/GetInvalidation exigem Resource "*" na política gerada pelo CDK.`,
    );
    reconhecer(
      singleton,
      'L1',
      `${motivoInterno} O runtime da Lambda é definido pela versão fixada do aws-cdk-lib.`,
    );
  }
}
