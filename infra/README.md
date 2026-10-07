# `infra/` — Infraestrutura do SIG Frota (módulo de Lavagem)

App AWS CDK v2 em TypeScript que cria a base serverless da solução na conta das credenciais ativas, em `us-east-1`. A stack `SigfrotaBase` contém:

- tabela DynamoDB `sigfrota-lavagem` (PK/SK);
- Cognito (User Pool `sigfrota-usuarios`, grupos `atendente` e `gestor`, App Client `sigfrota-spa`, domínio `sigfrota-<sufixo>`);
- HTTP API `sigfrota-api` com authorizer JWT padrão;
- front em S3 privado + CloudFront (OAC, cabeçalhos de segurança, `config.json`);
- parâmetros SSM `/sigfrota/...` com o contrato de infra.

Também exporta o construto `FuncaoLambda` e a função `registrarRota()`, usados pelas stacks dos specs 3, 5 e 6. Spec completo: `.kiro/specs/infra-base/`.

## Pré-requisitos

- Node.js 22 ou superior e `npm install` na raiz do monorepo (o `infra` é um workspace).
- AWS CLI com o profile `hackaton` configurado. As credenciais são temporárias; confira antes de qualquer operação:

  ```powershell
  aws sts get-caller-identity --profile hackaton
  ```

- Bootstrap do CDK em `us-east-1`, uma vez por conta:

  ```powershell
  npm run bootstrap -w infra
  ```

Não é preciso Docker: o empacotamento das Lambdas usa o `esbuild` local.

## Comandos

Todos rodam a partir da raiz do monorepo.

| Comando | O que faz |
|---------|-----------|
| `npm run bootstrap -w infra` | `cdk bootstrap --profile hackaton` |
| `npm run synth -w infra` | `cdk synth --profile hackaton` (gera os templates e roda o `cdk-nag`) |
| `npm run deploy -w infra` | `cdk deploy --all --require-approval never --profile hackaton` |
| `npm run destroy -w infra` | `cdk destroy --all --force --profile hackaton` (remove tabela, bucket, User Pool e log groups) |
| `npm test -w infra` | Testes Vitest com `aws-cdk-lib/assertions`, sem credenciais AWS |
| `npm run typecheck -w infra` | `tsc --noEmit` |
| `npm run usuarios -w infra` | Cria um atendente e um gestor no Cognito |
| `npm run env-web -w infra` | Gera `web/.env.local` a partir dos outputs da stack |

Observações:

- O `synth` não usa `--all`, porque a CLI fixada (`aws-cdk` 2.1144.0) não aceita a flag nesse comando; ele sintetiza todas as stacks do app mesmo assim. `deploy` e `destroy` usam `--all`.
- O `--require-approval never` atende o "um comando, sem passos manuais". É aceitável porque cada conta é um sandbox individual do hackathon.
- O deploy não faz build do front. Para publicar a SPA, rode antes:

  ```powershell
  npm run build -w web
  npm run deploy -w infra
  ```

  Sem `web/dist`, o deploy publica uma página provisória e o `config.json`, sem falhar.
- Throttling da API: contexto `throttleTaxa` (padrão 50 req/s) e `throttleRajada` (padrão 100) no `cdk.json`, sobrescrevíveis com `-c throttleTaxa=...`.
- Os scripts `usuarios` e `env-web` usam `AWS_PROFILE` e, se ausente, assumem `hackaton`.

### Usuários de teste

`npm run usuarios -w infra` lê o `UserPoolId` dos outputs da stack `SigfrotaBase` e pede e-mail e senha do atendente e do gestor. A senha é digitada sem eco, validada contra a política do User Pool (12+ caracteres, maiúscula, minúscula, dígito e símbolo) e nunca é registrada. O script é idempotente: se o usuário já existir, só redefine senha e grupo. Nenhuma senha ou usuário de demonstração fica no código.

## Estrutura

```
bin/sigfrota.ts                  # app CDK: lê CDK_DEFAULT_ACCOUNT e chama criarApp()
lib/config.ts                    # REGIAO, PREFIXO, TAGS, ORIGEM_LOCAL, calcularSufixo(), criarApp()
lib/contrato.ts                  # ContratoInfra, registrarRota(), idRota()
lib/index.ts                     # exportações públicas
lib/nag.ts                       # supressões justificadas do cdk-nag
lib/stacks/base-stack.ts         # SigfrotaBaseStack
lib/constructs/dados.ts          # Tabela
lib/constructs/autenticacao.ts   # Autenticacao (Cognito)
lib/constructs/api.ts            # Api (HTTP API, authorizer, CORS, stage, access logs)
lib/constructs/front.ts          # Front (S3, CloudFront, BucketDeployment)
lib/constructs/funcao-lambda.ts  # FuncaoLambda
scripts/criar-usuarios.mjs
scripts/gerar-env-web.mjs
test/
```

Conta e região:

- Nenhum ID de conta fica no código; a conta vem de `CDK_DEFAULT_ACCOUNT` (profile ativo). Sem credenciais, o bin encerra com "Credenciais AWS não encontradas. Use --profile hackaton."
- A região está definida só em `lib/config.ts` (`REGIAO = 'us-east-1'`).
- O sufixo de unicidade é `calcularSufixo(conta)`: 8 caracteres hex do SHA-256 do ID da conta. É determinístico e não expõe o ID da conta na URL de login.
- Todos os recursos recebem as tags `Projeto=sigfrota` e `Modulo=lavagem`.

## Contrato de infra

### Outputs e parâmetros SSM

Para scripts e ferramentas fora do app CDK. Todos os parâmetros são do tipo `String`.

| `CfnOutput` | Parâmetro SSM | Valor |
|-------------|---------------|-------|
| `TabelaNome` | `/sigfrota/tabela/nome` | Nome da tabela DynamoDB |
| `TabelaArn` | `/sigfrota/tabela/arn` | ARN da tabela |
| `ApiUrl` | `/sigfrota/api/url` | URL da HTTP API |
| `UserPoolId` | `/sigfrota/cognito/user-pool-id` | ID do User Pool |
| `UserPoolClientId` | `/sigfrota/cognito/client-id` | ID do App Client da SPA |
| `CognitoDominio` | `/sigfrota/cognito/dominio` | `https://sigfrota-<sufixo>.auth.us-east-1.amazoncognito.com` |
| `FrontUrl` | `/sigfrota/front/url` | `https://<distribuição>.cloudfront.net` |

### `config.json` do front

Publicado na raiz do bucket a cada deploy, para o front ler em tempo de execução:

```json
{
  "apiUrl": "https://<id>.execute-api.us-east-1.amazonaws.com",
  "regiao": "us-east-1",
  "userPoolId": "us-east-1_XXXXXXXXX",
  "userPoolClientId": "<id>",
  "cognitoDominio": "https://sigfrota-<sufixo>.auth.us-east-1.amazoncognito.com",
  "redirectUri": "https://<distribuição>.cloudfront.net/"
}
```

Para desenvolvimento local, `npm run env-web -w infra` gera `web/.env.local` com `VITE_API_URL`, `VITE_REGIAO`, `VITE_USER_POOL_ID`, `VITE_USER_POOL_CLIENT_ID`, `VITE_COGNITO_DOMINIO` e `VITE_REDIRECT_URI=http://localhost:5173/`. O arquivo está no `.gitignore`.

### `ContratoInfra` (dentro do app CDK)

As stacks dos specs 3, 5 e 6 recebem `base.contrato` por props e usam referências nativas do CDK, sem copiar valores:

| Campo | Tipo | Conteúdo |
|-------|------|----------|
| `tabela` | `ITable` | Tabela `sigfrota-lavagem` |
| `userPool` | `IUserPool` | User Pool |
| `userPoolClient` | `IUserPoolClient` | App Client da SPA |
| `api` | `HttpApi` | HTTP API base |
| `authorizer` | `HttpJwtAuthorizer` | Authorizer JWT padrão |
| `distribution` | `IDistribution` | Distribuição CloudFront |
| `urlFront` | `string` | `https://<distribuição>.cloudfront.net` |
| `dominioCognito` | `string` | URL do domínio de login |
| `regiao` | `string` | `us-east-1` |

Para registrar uma stack nova, edite `bin/sigfrota.ts`: troque `const { app } = criarApp({ conta })` por `const { app, base } = criarApp({ conta })`, importe `REGIAO` de `../lib/config` e descomente a linha do seu spec.

### `FuncaoLambda`

Lambda Node.js padrão com menor privilégio. Importe de `infra/lib` (`lib/index.ts`).

| Prop | Tipo | Padrão |
|------|------|--------|
| `entry` | `string` (caminho absoluto do handler) | obrigatório |
| `handler` | `string` | `'handler'` |
| `acessoTabela` | `AcessoTabela` | sem acesso |
| `ambiente` | `Record<string, string>` | `{}` |
| `timeout` | `Duration` | 10 s |
| `memoria` | `number` (MB) | 512 |
| `descricao` | `string` | — |

`AcessoTabela`:

- `{ tabela, modo: 'leitura' }` → `grantReadData`;
- `{ tabela, modo: 'leituraEscrita' }` → `grantReadWriteData`;
- `{ tabela, modo: 'acoes', acoes: ['dynamodb:Query', 'dynamodb:GetItem'] }` → só as ações listadas. Ações com `*` ou fora do formato `dynamodb:<Nome>` geram erro de synth.

Com acesso à tabela, o construto injeta `TABELA_NOME` no ambiente.

O que o construto garante:

- role IAM exclusiva por função, sem managed policies;
- Node.js 24 (`NODEJS_24_X`), ARM64, esbuild com `minify` e `sourceMap`, `projectRoot` na raiz do monorepo (empacota `packages/dominio`);
- log group dedicado com 30 dias de retenção, logs em JSON (aplicação `INFO`, sistema `WARN`);
- X-Ray ativo;
- erro de synth se algum nome de variável de ambiente casar com `SECRET|SEGREDO|PASSWORD|SENHA|TOKEN|API_KEY|PRIVATE_KEY`. Segredos vão no Secrets Manager ou em SSM SecureString.

Expõe `funcao` (`NodejsFunction`), `role` (`Role`) e `logGroup` (`LogGroup`).

> **Atenção (specs 5 e 6):** o construto reconhece automaticamente no `cdk-nag` o achado `AwsSolutions-IAM5[Resource::*]` da role, por causa do X-Ray (`xray:PutTraceSegments` e `xray:PutTelemetryRecords` não aceitam restrição por recurso). Esse reconhecimento **não distingue a ação**: qualquer outra política com `Resource: "*"` adicionada depois à mesma role passa no `cdk-nag` sem aviso. Ao acrescentar permissões com `funcao.role.addToPolicy(...)` (Bedrock, S3, Step Functions, Textract etc.), use sempre ARNs específicos. Para o Bedrock, por exemplo, `arn:aws:bedrock:us-east-1::foundation-model/<id-do-modelo>` (e o ARN do inference profile, se usar um), nunca `*`.

### `registrarRota()`

```ts
registrarRota(scope: Construct, contrato: ContratoInfra, rota: RotaProps): HttpRoute
```

| Campo de `RotaProps` | Tipo | Observação |
|----------------------|------|------------|
| `metodo` | `'GET' \| 'POST' \| 'PUT' \| 'DELETE'` | `ANY` não é aceito |
| `caminho` | `string` | Começa com `/`; parâmetros `{nome}` ou `{nome+}` |
| `funcao` | `IFunction` | Normalmente `FuncaoLambda.funcao` |
| `publica` | `boolean` | Padrão `false` (exige JWT). Só use `true` com justificativa |

- A rota e a integração são criadas no escopo da stack consumidora, o que evita dependência circular com a stack base.
- O authorizer é sempre explícito: o JWT do contrato ou, com `publica: true`, `HttpNoneAuthorizer`.
- O ID do construto vem de `idRota()`: `GET /veiculos/{idVeiculo}/lavagens` → `Rota-GET-veiculos-idVeiculo-lavagens`.
- O stage `$default` tem `autoDeploy`; a rota entra no ar no próximo deploy.
- **Não use rotas `ANY` nem `$default`.** O preflight `OPTIONS` precisa continuar sendo respondido pelo CORS da API, sem passar pelo authorizer.

### Exemplo (spec 3)

```ts
// infra/lib/stacks/api-stack.ts
import * as path from 'node:path';
import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { FuncaoLambda, registrarRota, type ContratoInfra } from '..';

export interface SigfrotaApiStackProps extends StackProps {
  contrato: ContratoInfra;
}

export class SigfrotaApiStack extends Stack {
  constructor(scope: Construct, id: string, props: SigfrotaApiStackProps) {
    super(scope, id, props);
    const { contrato } = props;

    const listar = new FuncaoLambda(this, 'ListarLavagens', {
      entry: path.join(__dirname, '../../../services/api/src/handlers/listar-lavagens.ts'),
      acessoTabela: { tabela: contrato.tabela, modo: 'acoes', acoes: ['dynamodb:Query', 'dynamodb:GetItem'] },
      descricao: 'Lista as lavagens de um veículo',
    });
    registrarRota(this, contrato, {
      metodo: 'GET',
      caminho: '/veiculos/{idVeiculo}/lavagens',
      funcao: listar.funcao,
    });
  }
}
```

Os specs 5 e 6 seguem o mesmo padrão: `FuncaoLambda` com acesso mínimo (ou sem `acessoTabela`), permissões extras com ARNs específicos e `registrarRota()` para expor o endpoint. Buckets de upload, Step Functions e permissões de Bedrock ficam na stack do próprio spec. A CSP do front já libera `https://*.s3.us-east-1.amazonaws.com` (upload por URL pré-assinada) e `blob:` em `img-src` (pré-visualização do recibo).

### Claims na Lambda

O authorizer JWT entrega as claims em `event.requestContext.authorizer.jwt.claims`. O front envia o **access token** no cabeçalho `Authorization: Bearer <token>`.

- `sub`: identificador do usuário. É a origem do cadastrador (R08); nunca leia o cadastrador do corpo da requisição.
- `cognito:groups`: chega como **string** no formato `[atendente gestor]` (colchetes, separado por espaço), não como array. A API do spec 3 precisa interpretá-la, por exemplo:

  ```ts
  const bruto = String(claims['cognito:groups'] ?? '');
  const grupos = bruto.replace(/^\[|\]$/g, '').split(/[\s,]+/).filter(Boolean);
  ```

Requisições sem token, ou com token inválido ou expirado, recebem 401 do próprio API Gateway, sem invocar a Lambda.

## Segurança

- **Autenticação:** User Pool sem auto cadastro, login por e-mail, senha de 12+ caracteres com os quatro tipos, MFA opcional por TOTP, App Client público só com Authorization Code + PKCE, tokens de acesso e ID com 60 min e refresh com 1 dia.
- **API:** authorizer JWT padrão em todas as rotas, CORS só para o CloudFront e `http://localhost:5173` (sem `*`), throttling no stage.
- **Front:** bucket privado (Block Public Access total, SSE-S3, `enforceSSL`), acesso só via OAC, HTTP → HTTPS, HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` e CSP restrita à própria origem, à API, ao Cognito e ao S3 regional.
- **Dados:** DynamoDB com KMS (chave `aws/dynamodb`) e PITR; logs do CloudWatch criptografados pelo serviço; todo tráfego externo em HTTPS.
- **IAM:** role exclusiva por Lambda, sem curingas de ação; o único `Resource: "*"` permitido é o do X-Ray.
- **Rede:** sem VPC e sem NAT Gateway.
- **Logs:** todos os log groups têm retenção de 30 dias e são removidos no destroy.

### LGPD (OT nº 17)

- O Cognito guarda só o e-mail; nenhum outro atributo pessoal (nome, CPF, telefone) é solicitado.
- Os access logs da API registram apenas `requestId`, `requestTime`, `routeKey`, `status`, `responseLatency`, `integrationErrorMessage` e `sub`. Ficam de fora IP, cabeçalho `Authorization`, corpo da requisição e e-mail.
- Os handlers dos specs 3, 5 e 6 não devem registrar tokens, senhas, e-mails, CNPJ completo nem corpo de requisição.
- Todos os dados do hackathon são sintéticos.

### `cdk-nag`

O app aplica o pacote `AwsSolutions` do `cdk-nag` v3 em todas as stacks (`Validations.of(app).addPlugins(new AwsSolutionsChecks(...))`). Violação sem reconhecimento faz o `synth` falhar. Os reconhecimentos usam `Validations.of(recurso).acknowledge({ id, reason })`, sempre no recurso afetado (nunca na stack inteira) e, nas regras com vários achados, achado a achado (`Regra[Achado]`). Todos estão em `lib/nag.ts`.

| Regra | Recurso | Justificativa |
|-------|---------|---------------|
| IAM5 `[Resource::*]` | Role de cada `FuncaoLambda` | X-Ray não aceita restrição por recurso (veja o alerta acima) |
| COG2 | User Pool | MFA opcional no MVP; obrigatório em produção |
| COG8 | User Pool | Proteção contra ameaças exige o plano Plus; o MVP usa Essentials. No v3, a COG8 substitui a COG3 prevista no design |
| S1 | Bucket do front | Logs de acesso do S3 ficam para produção; bucket privado, acessível só via OAC |
| CFR1 | Distribuição | Sem restrição geográfica, para não bloquear a banca nem uso via VPN |
| CFR2 | Distribuição | AWS WAF fica para produção |
| CFR3 | Distribuição | Logs de acesso do CloudFront ficam para produção |
| CFR4 | Distribuição | Com o certificado `*.cloudfront.net` não dá para fixar o TLS mínimo do navegador |
| IAM4, IAM5 (ações `s3:*Object*`, `s3:List*`, `s3:Abort*`, buckets de assets e do front, `Resource::*` da invalidação), L1 | Lambda singleton do `BucketDeployment` | Recurso interno do CDK; política e runtime definidos pela biblioteca |

Se o `cdk-nag` acusar uma regra fora desta tabela, a primeira opção é corrigir o recurso. A supressão só entra com justificativa escrita em `lib/nag.ts`.

## Custo estimado

Todos os serviços são sob demanda ou pagos por uso (Lambda, HTTP API, DynamoDB on-demand, S3, CloudFront, Cognito Essentials), sem capacidade provisionada, VPC ou NAT. Valores em USD, aproximados, em `us-east-1`; não incluem Bedrock (specs 5 e 6), que é cobrado por token.

| Cenário | Premissas | Custo mensal aproximado |
|---------|-----------|-------------------------|
| MVP (demo) | Algumas centenas de requisições por dia, menos de 10 usuários, menos de 1 GB transferido | Nível gratuito ou menos de US$ 1 |
| Produção | Cerca de 50 unidades, 2.000 lavagens/mês, cerca de 100 mil requisições/mês, cerca de 200 usuários ativos | Menos de US$ 5 em HTTP API, Lambda, DynamoDB, S3 e CloudFront. Cognito Essentials gratuito até 10 mil MAU. Com WAF, mais cerca de US$ 10 |

O PITR e os logs do CloudWatch crescem com o volume de dados, mas ficam em centavos no volume previsto. Para valores atualizados, use a [AWS Pricing Calculator](https://calculator.aws/).

## Pendências para produção

- Stage `prod` separado, com `RemovalPolicy.RETAIN` e `deletionProtection` na tabela e no User Pool.
- MFA obrigatório e plano Plus do Cognito (proteção contra ameaças).
- Domínio próprio com certificado ACM e TLS mínimo fixo no CloudFront.
- AWS WAF na distribuição (e, se necessário, na API).
- Alarmes do CloudWatch e dashboard (erros 5xx, latência, throttling, falhas das Lambdas).
- Pipeline de deploy contínuo.
- Chave KMS gerenciada pelo cliente (CMK) para a tabela.
- Logs de acesso do S3 e do CloudFront.
- Backup entre regiões (AWS Backup ou tabela global).

## Verificação manual pós-deploy

1. Confirmar a identidade: `aws sts get-caller-identity --profile hackaton`.
2. Implantar: `npm run deploy -w infra`.
3. Abrir a `FrontUrl` e confirmar a página provisória ou o front.
4. Abrir `<FrontUrl>/config.json` e conferir os valores.
5. Acessar um objeto pela URL direta do S3 e confirmar 403.
6. Chamar `curl -i <ApiUrl>/qualquer` e confirmar 401 ou 404, sem 5xx.
7. Conferir os parâmetros: `aws ssm get-parameters-by-path --path /sigfrota --recursive --profile hackaton`.
8. Rodar `npm run usuarios -w infra` e fazer login pelo domínio do Cognito.
9. Só com autorização da equipe: `npm run destroy -w infra` e confirmar no console que não restaram tabela, bucket nem log groups `sigfrota`.

## Resultado da verificação manual

Executada na conta `438584370327`, região `us-east-1`, stack `SigfrotaBase`.

| Passo | Resultado | Data |
|-------|-----------|------|
| 1. Identidade | OK: conta `438584370327`, papel `WSParticipantRole` | 2026-10-07 |
| 2. Deploy | OK: stack `SigfrotaBase` em `CREATE_COMPLETE` | 2026-10-07 |
| 3. FrontUrl | OK: `https://d3j36wqaw580a4.cloudfront.net/` responde 200 com a página provisória. Cabeçalhos presentes: `Strict-Transport-Security` (`max-age=31536000; includeSubDomains`), `Content-Security-Policy` (com o domínio do Cognito `sigfrota-4123efc2`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. `http://` responde 301 para `https://` | 2026-10-07 |
| 4. `config.json` | OK: 200 com `apiUrl`, `regiao`, `userPoolId`, `userPoolClientId`, `cognitoDominio` e `redirectUri` iguais aos outputs da stack | 2026-10-07 |
| 5. S3 direto → 403 | OK: `index.html` e `config.json` no bucket `sigfrotabase-frontbucketbac084c5-adhugrf2an3e` respondem 403 | 2026-10-07 |
| 6. API sem token → 401/404 | OK: `GET /qualquer` e `GET /` respondem 404 `{"message":"Not Found"}` (nenhuma rota registrada ainda), sem 5xx | 2026-10-07 |
| 7. Parâmetros SSM | OK: os sete parâmetros `/sigfrota/...` existem, com valores iguais aos outputs | 2026-10-07 |
| 8. Login com usuário de teste | Pendente: executar manualmente (`npm run usuarios -w infra` pede senha interativa) | — |
