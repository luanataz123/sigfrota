# Design — `infra-base` (spec 1)

## Overview
O `infra-base` é um app AWS CDK v2 em TypeScript, em `infra/`, que cria **uma stack base** (`SigfrotaBase`) na conta das credenciais ativas, em `us-east-1`. A stack contém a tabela DynamoDB, o Cognito, a HTTP API com authorizer JWT, o front em S3 + CloudFront e os parâmetros SSM do contrato de infra. Além dos recursos, o spec exporta duas peças reutilizáveis para os specs 3, 5 e 6:

- `FuncaoLambda`: construto de Lambda Node.js com role própria e permissões declaradas (Requisito 7).
- `registrarRota()`: função que adiciona uma rota à HTTP API base a partir de outra stack, sempre com o authorizer JWT, salvo declaração explícita de rota pública (Requisito 5.7).

As stacks dos outros specs (`SigfrotaApi`, `SigfrotaIaRegras`, `SigfrotaIaRecibo`) entram no mesmo app e recebem o contrato de infra por props. `cdk deploy --all` implanta tudo, e `cdk destroy --all` remove tudo.

### Decisões principais

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| Divisão em stacks | Uma stack base; uma stack por spec consumidor | Os recursos base se referenciam entre si (CORS, callback, `config.json`). Numa stack só, não há referências cruzadas entre eles. Cada spec consumidor mexe só no próprio arquivo. |
| Conta | `CDK_DEFAULT_ACCOUNT`, vinda do profile AWS ativo | Cada integrante implanta na própria conta (Requisito 2). Nenhum ID de conta fica no código. |
| Profile AWS | `hackaton`, passado nos scripts npm (`--profile hackaton`) e via `AWS_PROFILE` nos scripts Node | Regra do workspace. O nome do profile é igual em todas as máquinas; a conta por trás muda. |
| Sufixo de unicidade | 8 primeiros caracteres hex do SHA-256 do ID da conta | É determinístico por conta, não expõe o ID da conta na URL de login e só tem caracteres válidos para o prefixo do Cognito. |
| Criptografia da tabela | `TableEncryption.AWS_MANAGED` (KMS, chave `aws/dynamodb`) | Atende o requisito 3.3 com chave KMS, sem custo de chave nem grants extras de `kms:Decrypt`. A chave gerenciada pelo cliente (CMK) entra na lista de pendências para produção. |
| Esvaziamento do bucket | `BucketDeployment` com `retainOnDelete: false` | Na remoção, o próprio custom resource apaga os objetos que publicou, e o bucket fica vazio antes de ser removido. Evita o `autoDeleteObjects`, cuja Lambda deixaria um log group sem retenção para trás (Requisito 9.6). |
| Runtime | `Runtime.NODEJS_24_X` se existir na versão fixada do `aws-cdk-lib`; senão `NODEJS_22_X` | Requisito 7.1. O `cdk-nag` (regra L1) avisa quando não é o runtime mais recente. |
| Testes | Vitest + `aws-cdk-lib/assertions` + `fast-check` | Mesmo runner do front (Vite). Rodam sem credenciais. |
| Empacotamento | `esbuild` local como devDependency de `infra` | Sem esbuild local, o `NodejsFunction` tenta usar Docker, o que é frágil no Windows. |

## Architecture
```mermaid
flowchart LR
  subgraph Navegador
    SPA[React SPA]
  end
  subgraph SigfrotaBase
    CF[CloudFront<br/>OAC + cabeçalhos de segurança]
    S3[(S3 front<br/>privado, SSE-S3)]
    COG[Cognito User Pool<br/>grupos atendente e gestor]
    DOM[Domínio de login<br/>sigfrota-sufixo]
    API[HTTP API<br/>authorizer JWT padrão]
    LOGAPI[(Log group<br/>access logs 30 dias)]
    DDB[(DynamoDB<br/>PK/SK, KMS, PITR)]
    SSM[[SSM /sigfrota/...]]
    DEP[BucketDeployment<br/>web/dist + config.json]
  end
  subgraph Stacks dos specs 3, 5 e 6
    FN[FuncaoLambda<br/>role exclusiva]
    ROTA[registrarRota]
  end
  SPA -->|HTTPS| CF --> S3
  SPA -->|Authorization Code + PKCE| DOM --> COG
  SPA -->|Bearer access token| API
  API -.valida JWT.-> COG
  API --> LOGAPI
  ROTA --> API
  API --> FN --> DDB
  DEP --> S3
  DEP -.invalida.-> CF
```

### Grafo de dependências e o ciclo evitado

Dentro da stack base, há três referências obrigatórias:

- O CORS da API precisa do domínio do CloudFront (Requisito 5.4).
- O callback do App Client precisa da URL do CloudFront (Requisito 4.7).
- O `config.json` precisa da URL da API e dos IDs do Cognito (Requisito 6.7).

Se a CSP do CloudFront citasse a URL exata da API, haveria um ciclo: API → Distribution (CORS) → ResponseHeadersPolicy → API. Para quebrar o ciclo, a CSP usa o curinga regional do serviço (`https://*.execute-api.us-east-1.amazonaws.com`). O domínio do Cognito não causa ciclo, porque é calculado em tempo de synth (`sigfrota-<sufixo>.auth.us-east-1.amazoncognito.com`) e entra na CSP como string literal.

### Estrutura de pastas

```
package.json                     # raiz: workspaces ["infra", "packages/*", "services/*", "web"]
infra/
  bin/sigfrota.ts                # app CDK: env, tags, cdk-nag, stacks
  lib/config.ts                  # REGIAO, PREFIXO, TAGS, calcularSufixo(), contexto de throttling
  lib/contrato.ts                # interface ContratoInfra e registrarRota()
  lib/index.ts                   # exportações públicas (FuncaoLambda, registrarRota, ContratoInfra)
  lib/stacks/base-stack.ts       # SigfrotaBaseStack
  lib/constructs/dados.ts        # Tabela
  lib/constructs/autenticacao.ts # User Pool, grupos, App Client, domínio
  lib/constructs/api.ts          # HTTP API, authorizer, CORS, stage, access logs
  lib/constructs/front.ts        # bucket, CloudFront, cabeçalhos, BucketDeployment
  lib/constructs/funcao-lambda.ts
  lib/nag.ts                     # supressões do cdk-nag com justificativa
  scripts/criar-usuarios.mjs
  scripts/gerar-env-web.mjs
  test/*.test.ts
  test/fixtures/handler.ts       # handler mínimo usado nos testes do construto
  cdk.json  package.json  tsconfig.json  vitest.config.ts  README.md
```

Se a raiz já tiver `package.json` criado por outro integrante, o spec só acrescenta `infra` aos `workspaces`. O `.gitignore` da raiz deve conter `infra/cdk.out/` e `web/.env.local`.

## Components and Interfaces
### `bin/sigfrota.ts` e `lib/config.ts`

```ts
// lib/config.ts
export const REGIAO = 'us-east-1';          // único lugar com a região (Requisito 2.2)
export const PREFIXO = 'sigfrota';
export const TAGS = { Projeto: 'sigfrota', Modulo: 'lavagem' };
export const ORIGEM_LOCAL = 'http://localhost:5173';

/** Sufixo de unicidade: 8 hex do SHA-256 do ID da conta (Requisito 2.3). */
export function calcularSufixo(conta: string): string;

/** Cria o App com tags e cdk-nag. Usado pelo bin e pelos testes. */
export function criarApp(opcoes?: { conta?: string; contexto?: Record<string, unknown> }): {
  app: App; base: SigfrotaBaseStack;
};
```

- `bin/sigfrota.ts` lê `process.env.CDK_DEFAULT_ACCOUNT`. Se o valor estiver ausente, encerra com a mensagem "Credenciais AWS não encontradas. Use --profile hackaton." Isso é necessário porque o sufixo exige a conta concreta em tempo de synth.
- `env = { account: conta, region: REGIAO }` em todas as stacks.
- `Tags.of(app).add(...)` para cada item de `TAGS` (Requisito 1.6).
- `Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }))` (Requisito 9.1). Violações viram anotações de erro, e o `cdk synth` falha (Requisito 9.2).
- O bin tem linhas reservadas e comentadas para as stacks dos specs 3, 5 e 6, por exemplo `// new SigfrotaApiStack(app, 'SigfrotaApi', { env, contrato: base.contrato });`. Cada integrante descomenta apenas a sua linha.

Scripts npm de `infra/package.json`:

| Script | Comando |
|--------|---------|
| `bootstrap` | `cdk bootstrap --profile hackaton` |
| `synth` | `cdk synth --all --profile hackaton` |
| `deploy` | `cdk deploy --all --require-approval never --profile hackaton` |
| `destroy` | `cdk destroy --all --force --profile hackaton` |
| `test` | `vitest run` |
| `usuarios` | `node scripts/criar-usuarios.mjs` (com `AWS_PROFILE=hackaton` documentado) |
| `env-web` | `node scripts/gerar-env-web.mjs` |

`--require-approval never` atende o "um comando, sem passos manuais" (Requisito 1.4). É aceitável porque cada conta é um sandbox individual do hackathon.

`cdk.json`: `"app": "npx tsx bin/sigfrota.ts"` e contexto padrão `{ "throttleTaxa": 50, "throttleRajada": 100 }`.

### `Tabela` (`lib/constructs/dados.ts`) — Requisito 3

| Propriedade | Valor |
|-------------|-------|
| `tableName` | `sigfrota-lavagem` |
| `partitionKey` / `sortKey` | `PK` (STRING) / `SK` (STRING) |
| `billingMode` | `PAY_PER_REQUEST` |
| `encryption` | `TableEncryption.AWS_MANAGED` |
| `pointInTimeRecoverySpecification` | `{ pointInTimeRecoveryEnabled: true }` |
| `removalPolicy` | `DESTROY` |
| GSI | nenhum |

O construto não chama nenhum `grant*`. O acesso só nasce em `FuncaoLambda` (Requisito 3.5).

### `Autenticacao` (`lib/constructs/autenticacao.ts`) — Requisito 4

- **User Pool** `sigfrota-usuarios`:
  - `selfSignUpEnabled: false`, `signInAliases: { email: true }`, `autoVerify: { email: true }`.
  - `standardAttributes: { email: { required: true, mutable: true } }`, sem outros atributos e sem atributos customizados.
  - `passwordPolicy: { minLength: 12, requireLowercase, requireUppercase, requireDigits, requireSymbols }`.
  - `mfa: Mfa.OPTIONAL`, `mfaSecondFactor: { otp: true, sms: false }`.
  - `accountRecovery: AccountRecovery.EMAIL_ONLY`, `featurePlan: FeaturePlan.ESSENTIALS`, `removalPolicy: DESTROY`.
- **Grupos:** `CfnUserPoolGroup` `atendente` e `gestor`.
- **App Client** `sigfrota-spa`:
  - `generateSecret: false`, `authFlows: { userSrp: true }`, `preventUserExistenceErrors: true`.
  - `oAuth: { flows: { authorizationCodeGrant: true, implicitCodeGrant: false }, scopes: [OPENID, EMAIL] }`.
  - `callbackUrls` e `logoutUrls`: `https://<cloudfront>/` e `http://localhost:5173/`.
  - `accessTokenValidity` e `idTokenValidity` de 60 minutos; `refreshTokenValidity` de 1 dia.
  - O PKCE é aplicado pelo cliente; o Cognito o aceita em clientes públicos.
- **Domínio:** `userPool.addDomain('Dominio', { cognitoDomain: { domainPrefix: \`sigfrota-${sufixo}\` } })`, com a interface de login clássica.
- **Contrato com o spec 4:** o callback e o logout são a raiz (`/`). O front deve enviar o access token no cabeçalho `Authorization`.

### `Api` (`lib/constructs/api.ts`) — Requisito 5

- `HttpApi` `sigfrota-api`, com:
  - `defaultAuthorizer: new HttpJwtAuthorizer('Jwt', issuer, { jwtAudience: [clientId] })`. O issuer é `https://cognito-idp.us-east-1.amazonaws.com/<userPoolId>`.
  - `corsPreflight`:
    - `allowOrigins: ['https://<cloudfront>', ORIGEM_LOCAL]`
    - `allowHeaders: ['authorization', 'content-type']`
    - `allowMethods: GET, POST, PUT, DELETE, OPTIONS`
    - `maxAge: 1h`, `allowCredentials: false`
- O API Gateway valida `aud` (ID token) ou `client_id` (access token) contra `jwtAudience`. Token ausente, inválido ou expirado → 401, sem invocar a Lambda (Requisito 5.3).
- O stage `$default` é configurado via escape hatch em `CfnStage`:
  - `defaultRouteSettings.throttlingRateLimit` / `throttlingBurstLimit` vêm do contexto (Requisito 5.5).
  - `accessLogSettings.destinationArn` aponta para o log group `/aws/apigateway/sigfrota-api`, com retenção de 30 dias e `DESTROY`.
  - `accessLogSettings.format` é um JSON só com `requestId`, `requestTime`, `routeKey`, `status`, `responseLatency`, `integrationErrorMessage` e `sub` (`$context.authorizer.claims.sub`). Ficam de fora IP, `Authorization`, corpo e e-mail (Requisito 5.6).
- HTTP APIs não precisam da role de CloudWatch em nível de conta para gravar access logs.
- **Claims na Lambda (Requisito 5.8):** o authorizer JWT entrega as claims em `event.requestContext.authorizer.jwt.claims`. A claim `cognito:groups` vem como string no formato `[atendente gestor]`, e a API do spec 3 precisa interpretá-la assim. A infra não precisa de configuração extra.
- **Orientação ao spec 3:** não usar rotas `ANY` nem `$default`, para que o preflight `OPTIONS` continue sendo respondido pelo CORS da API sem passar pelo authorizer.

### `Front` (`lib/constructs/front.ts`) — Requisito 6

- **Bucket:**
  - `blockPublicAccess: BLOCK_ALL`, `encryption: S3_MANAGED`, `enforceSSL: true`, `versioned: false`.
  - `objectOwnership: BUCKET_OWNER_ENFORCED`, `removalPolicy: DESTROY`, sem `bucketName`.
- **Distribution:**
  - `defaultBehavior`: origem `S3BucketOrigin.withOriginAccessControl(bucket)`, `REDIRECT_TO_HTTPS`, `CACHING_OPTIMIZED`, `ALLOW_GET_HEAD` e a `ResponseHeadersPolicy` descrita abaixo.
  - `defaultRootObject: 'index.html'`, `httpVersion: HTTP2_AND_3` e `priceClass: PRICE_CLASS_ALL`. A borda de São Paulo só existe na classe `ALL`; a diferença de custo no volume do MVP é desprezível.
  - `errorResponses`: 403 e 404 → `/index.html` com status 200 e TTL 0 (Requisito 6.5).
- **TLS (Requisito 6.3):** a conexão do CloudFront com o S3 usa TLS 1.2 ou superior. Com o certificado padrão `*.cloudfront.net`, o CloudFront não permite fixar a versão mínima de TLS para o navegador (`minimumProtocolVersion` só vale com certificado próprio). Os navegadores atuais negociam TLS 1.2 ou 1.3. A versão mínima fixa entra na pendência "domínio próprio com ACM".
- **`ResponseHeadersPolicy` (Requisito 6.4):**
  - HSTS: `max-age=31536000; includeSubDomains`.
  - `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
  - CSP:

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:;
font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';
connect-src 'self' https://*.execute-api.us-east-1.amazonaws.com
  https://sigfrota-<sufixo>.auth.us-east-1.amazoncognito.com
  https://cognito-idp.us-east-1.amazonaws.com
  https://*.s3.us-east-1.amazonaws.com
```

  - `blob:` em `img-src` serve para a pré-visualização do recibo (spec 6).
  - `*.s3.us-east-1.amazonaws.com` em `connect-src` serve para uploads via URL pré-assinada (specs 5 e 6), cujos buckets ficam em outras stacks e não podem ser citados aqui sem criar dependência invertida.
  - Se o build do front precisar de estilos inline, o spec 4 ajusta `style-src` neste construto.
- **`BucketDeployment` (Requisitos 6.6 e 6.7):**
  - Fontes:
    - Se `fs.existsSync(caminhoDist)`: `Source.asset(caminhoDist)`. Caso contrário: `Source.data('index.html', <página "Front ainda não publicado">)`.
    - Sempre `Source.jsonData('config.json', { apiUrl, regiao, userPoolId, userPoolClientId, cognitoDominio, redirectUri })`, com valores resolvidos em tempo de deploy.
  - `distribution` e `distributionPaths: ['/*']` (invalidação a cada deploy).
  - `retainOnDelete: false` e `prune: true`.
  - `logGroup` próprio, com retenção de 30 dias e `DESTROY`.
  - `caminhoDist` é uma prop (padrão: `path.join(__dirname, '../../../web/dist')`), para os testes injetarem um caminho inexistente.
  - O deploy não faz build do front; o `infra/README.md` documenta `npm run build -w web` antes de `npm run deploy -w infra`.

### `FuncaoLambda` (`lib/constructs/funcao-lambda.ts`) — Requisito 7

```ts
export type AcessoTabela =
  | { tabela: ITable; modo: 'leitura' }
  | { tabela: ITable; modo: 'leituraEscrita' }
  | { tabela: ITable; modo: 'acoes'; acoes: string[] };   // ex.: ['dynamodb:Query', 'dynamodb:GetItem']

export interface FuncaoLambdaProps {
  /** Caminho absoluto do handler (ex.: services/api/src/handlers/listar.ts). */
  entry: string;
  handler?: string;                       // padrão: 'handler'
  acessoTabela?: AcessoTabela;            // ausente = sem acesso à tabela
  ambiente?: Record<string, string>;      // validado contra nomes de segredo
  timeout?: Duration;                     // padrão: 10 s
  memoria?: number;                       // padrão: 512 MB
  descricao?: string;
}

export class FuncaoLambda extends Construct {
  readonly funcao: NodejsFunction;
  readonly role: Role;
  readonly logGroup: LogGroup;
}
```

Comportamento:

1. **Role exclusiva:** `new Role(this, 'Role', { assumedBy: lambda.amazonaws.com })`, sem managed policies (Requisito 7.2). Como a role é passada ao `NodejsFunction`, o CDK não anexa `AWSLambdaBasicExecutionRole`.
2. **Log group:** `new LogGroup(this, 'Logs', { retention: ONE_MONTH, removalPolicy: DESTROY })`, passado em `logGroup`, com `logGroup.grantWrite(role)`. A permissão gerada é restrita a `arn:...:log-group:<nome>:*` (Requisito 7.5).
3. **Função:** `NodejsFunction` com:
   - runtime da tabela de decisões, `Architecture.ARM_64`, `tracing: Tracing.ACTIVE`;
   - `loggingFormat: LoggingFormat.JSON`, `applicationLogLevelV2: INFO`, `systemLogLevelV2: WARN`;
   - `bundling: { minify: true, sourceMap: true }`, `projectRoot` na raiz do monorepo e `depsLockFilePath` no `package-lock.json` da raiz, para que `packages/dominio` seja empacotado;
   - ambiente com `NODE_OPTIONS=--enable-source-maps`.
4. **Acesso à tabela (Requisito 7.3):**
   - `leitura` → `tabela.grantReadData(role)`;
   - `leituraEscrita` → `tabela.grantReadWriteData(role)`;
   - `acoes` → `tabela.grant(role, ...acoes)`, aceitando só ações `dynamodb:<Nome>` sem `*`.
   - Em todos os modos, o construto acrescenta `TABELA_NOME` ao ambiente.
   - Com a chave `AWS_MANAGED`, não é preciso grant de KMS.
5. **Segredos (Requisito 7.7):** se algum nome de variável casar com `/(SECRET|SEGREDO|PASSWORD|SENHA|TOKEN|API_KEY|PRIVATE_KEY)/i`, o construto lança erro em tempo de synth: "Use Secrets Manager ou SSM SecureString; segredos não podem ir em variáveis de ambiente".
6. **Exceção justificada (Requisito 7.4):** o tracing ativo adiciona `xray:PutTraceSegments` e `xray:PutTelemetryRecords` com `Resource: "*"`, porque o X-Ray não aceita restrição por recurso. É a única exceção permitida, suprimida no `cdk-nag` (IAM5) com essa justificativa.

### Contrato de infra e `registrarRota()` (`lib/contrato.ts`) — Requisitos 5.7 e 8

```ts
export interface ContratoInfra {
  tabela: ITable;
  userPool: IUserPool;
  userPoolClient: IUserPoolClient;
  api: HttpApi;
  authorizer: HttpJwtAuthorizer;
  distribution: IDistribution;
  urlFront: string;          // https://<domínio do CloudFront>
  dominioCognito: string;    // https://sigfrota-<sufixo>.auth.us-east-1.amazoncognito.com
  regiao: string;
}

export interface RotaProps {
  metodo: 'GET' | 'POST' | 'PUT' | 'DELETE';
  caminho: string;           // começa com '/', ex.: '/veiculos/{idVeiculo}/lavagens'
  funcao: IFunction;
  publica?: boolean;         // padrão false; true usa HttpNoneAuthorizer
}

/** Cria a rota no escopo da stack consumidora, evitando ciclo entre stacks. */
export function registrarRota(scope: Construct, contrato: ContratoInfra, rota: RotaProps): HttpRoute;
```

- A rota é criada com `new HttpRoute(scope, id, { httpApi: contrato.api, routeKey, integration: new HttpLambdaIntegration(...), authorizer })`. O `authorizer` é sempre passado de forma explícita: `contrato.authorizer`, ou `new HttpNoneAuthorizer()` quando `publica: true` (Requisito 5.2).
- A rota e a integração ficam no escopo da stack consumidora. Assim, a stack base não referencia funções de outras stacks e não surge dependência circular. É o motivo de não usar `api.addRoutes()`.
- O stage `$default` tem `autoDeploy`, então as rotas novas entram no ar sem passo extra.
- O `id` do construto é derivado do método e do caminho (ex.: `Rota-GET-veiculos-idVeiculo-lavagens`).
- `SigfrotaBaseStack` expõe `readonly contrato: ContratoInfra`.

**Outputs e parâmetros SSM (Requisito 8.1):**

| `CfnOutput` | Parâmetro SSM (`String`) | Valor |
|-------------|--------------------------|-------|
| `TabelaNome` | `/sigfrota/tabela/nome` | nome da tabela |
| `TabelaArn` | `/sigfrota/tabela/arn` | ARN da tabela |
| `ApiUrl` | `/sigfrota/api/url` | `apiEndpoint` |
| `UserPoolId` | `/sigfrota/cognito/user-pool-id` | ID do User Pool |
| `UserPoolClientId` | `/sigfrota/cognito/client-id` | ID do App Client |
| `CognitoDominio` | `/sigfrota/cognito/dominio` | URL do domínio de login |
| `FrontUrl` | `/sigfrota/front/url` | URL do CloudFront |

Dentro do app CDK, os specs consumidores usam `contrato` (referências nativas do CDK, Requisito 8.2). Os outputs e o SSM servem para scripts e ferramentas fora do app.

### Scripts (`infra/scripts/`)

Os dois scripts são Node puro (ESM) com AWS SDK v3. Usam o profile via `AWS_PROFILE=hackaton` e leem os outputs com `DescribeStacks` da stack `SigfrotaBase`.

- **`criar-usuarios.mjs` (Requisito 4.10):**
  - Pede no terminal e-mail e senha do atendente e do gestor; a senha é lida sem eco e nunca é registrada.
  - Para cada usuário, chama `AdminCreateUser` (`MessageAction: SUPPRESS`, `email_verified=true`), `AdminSetUserPassword` (`Permanent: true`) e `AdminAddUserToGroup`.
  - Se o usuário já existir (`UsernameExistsException`), só redefine a senha e o grupo, o que torna o script idempotente.
- **`gerar-env-web.mjs` (Requisito 8.3):**
  - Escreve `web/.env.local` com `VITE_API_URL`, `VITE_REGIAO`, `VITE_USER_POOL_ID`, `VITE_USER_POOL_CLIENT_ID`, `VITE_COGNITO_DOMINIO` e `VITE_REDIRECT_URI=http://localhost:5173/`.

### `lib/nag.ts` — supressões justificadas (Requisito 9.3)

| Regra | Alvo | Justificativa |
|-------|------|---------------|
| AwsSolutions-IAM5 | Roles das `FuncaoLambda` (`Resource::*` do X-Ray; `<logGroup>:*`) | O X-Ray não aceita restrição por recurso; o curinga de log streams fica limitado ao log group da própria função. |
| AwsSolutions-IAM4, IAM5, L1 | Lambda singleton do `BucketDeployment` | Recurso interno do CDK; a política gerenciada e o runtime são definidos pela biblioteca. |
| AwsSolutions-COG2 | User Pool | MFA opcional no MVP (Requisito 4.5); obrigatório na pendência de produção. |
| AwsSolutions-COG3 | User Pool | Proteção contra ameaças exige o plano Plus; fica para produção. |
| AwsSolutions-S1 | Bucket do front | Logs de acesso do S3 ficam para produção; o bucket só é acessível pelo CloudFront via OAC. |
| AwsSolutions-CFR1 | Distribution | Sem restrição geográfica no MVP, para não bloquear a banca nem uso via VPN. |
| AwsSolutions-CFR2 | Distribution | AWS WAF está na lista de pendências para produção. |
| AwsSolutions-CFR3 | Distribution | Logs de acesso do CloudFront ficam para produção. |
| AwsSolutions-CFR4 | Distribution | Com o certificado padrão, não é possível fixar a versão mínima de TLS para o navegador. |

Supressões ficam restritas ao recurso (com `appliesTo` quando a regra permite). Supressão por stack inteira não é usada. Se o `cdk-nag` acusar alguma regra não prevista nesta tabela, a primeira opção é corrigir o recurso; a supressão só entra com justificativa.

## Data Models
A stack cria apenas o esquema da tabela; os itens seguem a modelagem do README e são gravados pelo spec 3.

| Atributo | Tipo | Papel |
|----------|------|-------|
| `PK` | String | Chave de partição: `CATALOGO`, `VEICULO#<id>` ou `CONTADOR` |
| `SK` | String | Chave de ordenação: `VEICULO#<id>`, `TIPO#<id>`, `POSTO#<id>`, `LAVAGEM#<id>` ou `LAVAGEM` |

Sem GSI, sem TTL e sem streams no MVP.

Formato do `config.json` publicado no bucket:

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

## Correctness Properties
As propriedades abaixo são verificadas com `fast-check` (geração de entradas) e `aws-cdk-lib/assertions` (inspeção do template).

### Property 1: sufixo determinístico e válido

*Para qualquer* ID de conta de 12 dígitos, `calcularSufixo` retorna sempre o mesmo valor para a mesma conta, com exatamente 8 caracteres em `[0-9a-f]`. O prefixo `sigfrota-<sufixo>` é um prefixo de domínio válido do Cognito: minúsculas, dígitos e hífen, sem as palavras `aws`, `amazon` ou `cognito`.

**Validates: Requirements 2.3, 4.8, 11.3**

### Property 2: segredos rejeitados no ambiente

*Para qualquer* nome de variável de ambiente que contenha um dos termos de segredo (em qualquer combinação de maiúsculas e minúsculas), criar uma `FuncaoLambda` com essa variável lança erro em tempo de synth. *Para qualquer* nome sem esses termos, a criação funciona.

**Validates: Requirements 7.7**

### Property 3: rota protegida por padrão

*Para qualquer* combinação de método e caminho válido registrada com `registrarRota` sem `publica: true`, a rota no template tem `AuthorizationType: JWT` e o `AuthorizerId` do authorizer base. Só rotas com `publica: true` têm `AuthorizationType: NONE`.

**Validates: Requirements 5.2, 5.7**

### Property 4: menor privilégio nas roles das funções

*Para qualquer* modo de `AcessoTabela` (incluindo listas geradas de ações `dynamodb:<Nome>`), nenhuma política da role da `FuncaoLambda` tem ação com `*`. O único `Resource: "*"` permitido acompanha exclusivamente as ações `xray:PutTraceSegments` e `xray:PutTelemetryRecords`. Toda política de DynamoDB aponta só para o ARN da tabela (e `/index/*`, quando gerado pelo CDK). Ações curinga (`dynamodb:*`) passadas em `acoes` são rejeitadas com erro.

**Validates: Requirements 7.3, 7.4, 3.5**

### Property 5: retenção em todos os log groups

*Para qualquer* template sintetizado (base e base + funções de teste), todo recurso `AWS::Logs::LogGroup` tem `RetentionInDays` definido e `DeletionPolicy: Delete`.

**Validates: Requirements 2.5, 7.5, 9.6**

## Error Handling
| Situação | Comportamento |
|----------|---------------|
| `CDK_DEFAULT_ACCOUNT` ausente (profile não informado ou credenciais expiradas) | O bin encerra com mensagem orientando `--profile hackaton` e a renovação das credenciais temporárias. |
| Violação do `cdk-nag` sem supressão | Anotação de erro; o `cdk synth` falha com a regra e o caminho do recurso. |
| Variável de ambiente com nome de segredo | `FuncaoLambda` lança erro de synth com a orientação de usar Secrets Manager ou SSM SecureString. |
| Ação curinga em `acessoTabela.acoes` | Erro de synth: "Declare ações específicas, sem curinga". |
| `registrarRota` com caminho sem `/` inicial ou método fora da lista | Erro de synth com a rota inválida. |
| `web/dist` inexistente | O deploy publica a página provisória e o `config.json`, sem falhar (Requisito 6.6). |
| Usuário já existente no `criar-usuarios.mjs` | Redefine senha e grupo; não falha. |
| Stack `SigfrotaBase` inexistente nos scripts | Mensagem pedindo `npm run deploy -w infra` antes. |
| Requisição sem token ou com token inválido na API | 401 do API Gateway, sem invocar a Lambda. |

## Testing Strategy
Os testes ficam em `infra/test/`, rodam com `npm test -w infra` (Vitest) e não exigem credenciais AWS. Todos usam `criarApp({ conta: '111111111111' })` com conta fictícia, e `caminhoDist` inexistente para não depender do build do front.

| Arquivo | Verifica | Requisitos |
|---------|----------|------------|
| `dados.test.ts` | `PK`/`SK` string, `PAY_PER_REQUEST`, `SSESpecification.SSEEnabled`, PITR ativo, sem `GlobalSecondaryIndexes`, `DeletionPolicy: Delete` | 3.1–3.4, 2.6, 11.2 |
| `autenticacao.test.ts` | `AllowAdminCreateUserOnly: true`, grupos `atendente` e `gestor`, `UsernameAttributes: [email]`, sem atributos além de e-mail, política de senha, MFA `OPTIONAL`, client sem segredo, só `code`, callbacks com CloudFront e localhost, validade de 60 min | 4.1–4.9, 11.2 |
| `api.test.ts` | Authorizer JWT com issuer e audience corretos, CORS com as duas origens e sem `*`, throttling no stage, formato de access log sem `$context.identity.sourceIp` nem `authorization` | 5.1, 5.4–5.6, 11.2 |
| `front.test.ts` | Block Public Access total, SSE, política `aws:SecureTransport`, OAC na origem, `redirect-to-https`, cabeçalhos de segurança, CSP com domínio do Cognito, respostas 403/404 → `/index.html`, `BucketDeployment` com `RetainOnDelete: false` | 6.1–6.5, 6.7, 2.6, 11.2 |
| `contrato.test.ts` | Sete outputs e sete parâmetros SSM; propriedade 3 com `fast-check` | 8.1, 5.2, 5.7 |
| `funcao-lambda.test.ts` | ARM64, runtime, tracing ativo, role exclusiva por função (duas funções → duas roles), `TABELA_NOME`; propriedades 2 e 4 | 7.1–7.7, 11.2 |
| `conta.test.ts` | Propriedade 1; prefixo do domínio igual a `sigfrota-` + `calcularSufixo(conta)`; varredura dos arquivos de `infra/bin` e `infra/lib` sem sequências de 12 dígitos (ID de conta fixo) | 2.1, 2.3, 11.3 |
| `seguranca.test.ts` | Nenhuma anotação de erro `AwsSolutions-*` (`Annotations.fromStack(...).findError`); propriedade 5; nenhum `AWS::EC2::VPC` nem `AWS::EC2::NatGateway` | 9.1, 9.2, 9.6, 9.7 |

O teste do ID de conta é estático (varre o código-fonte), porque o template sintetizado contém legitimamente a conta informada em `env`. Os testes do construto usam `test/fixtures/handler.ts`, empacotado pelo esbuild local.

**Verificação manual após o deploy**, registrada no `infra/README.md`:

1. Rodar `aws sts get-caller-identity --profile hackaton`.
2. Rodar `npm run deploy -w infra`.
3. Abrir a `FrontUrl` e confirmar a página provisória ou o front.
4. Acessar o objeto pela URL direta do S3 e confirmar 403.
5. Chamar `curl <ApiUrl>/qualquer` e confirmar 401 ou 404, sem 5xx.
6. Rodar `npm run usuarios -w infra` e fazer login pelo domínio do Cognito.
7. Rodar `npm run destroy -w infra` e confirmar no console que não restaram tabela, bucket nem log groups `sigfrota`.

## Custo e caminho para produção

O `infra/README.md` traz a estimativa detalhada (Requisito 10.2), com estas premissas:

- **MVP (demo):** algumas centenas de requisições por dia, menos de 10 usuários e menos de 1 GB transferido. Tudo cabe no nível gratuito ou fica abaixo de US$ 1/mês.
- **Produção:** cerca de 50 unidades, 2.000 lavagens por mês, cerca de 100 mil requisições por mês e cerca de 200 usuários ativos. HTTP API, Lambda, DynamoDB on-demand, S3 e CloudFront ficam abaixo de US$ 5/mês. O Cognito Essentials é gratuito até 10 mil MAU. O WAF acrescenta cerca de US$ 10/mês.

Pendências para produção (Requisito 10.3):

- stage `prod` com `RETAIN` e `deletionProtection`;
- MFA obrigatório e plano Plus do Cognito;
- domínio próprio com ACM e TLS mínimo fixo;
- AWS WAF;
- alarmes e dashboard;
- pipeline de deploy;
- CMK para a tabela;
- logs de acesso do S3 e do CloudFront;
- backup entre regiões.

## Rastreabilidade

| Requisito | Componente |
|-----------|------------|
| 1 | `bin/sigfrota.ts`, `lib/config.ts`, `infra/package.json`, `infra/README.md` |
| 2 | `lib/config.ts` (`REGIAO`, `calcularSufixo`), `RemovalPolicy.DESTROY`, `BucketDeployment.retainOnDelete` |
| 3 | `Tabela` |
| 4 | `Autenticacao`, `scripts/criar-usuarios.mjs` |
| 5 | `Api`, `registrarRota` |
| 6 | `Front` |
| 7 | `FuncaoLambda` |
| 8 | `ContratoInfra`, outputs, SSM, `scripts/gerar-env-web.mjs` |
| 9 | `lib/nag.ts`, `AwsSolutionsChecks`, `seguranca.test.ts` |
| 10 | Serviços sob demanda; seção de custo do `infra/README.md` |
| 11 | `infra/test/` |
