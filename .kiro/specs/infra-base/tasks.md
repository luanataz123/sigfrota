# Plano de implementação — `infra-base` (spec 1)

Convenções para todas as tarefas:

- Código em `infra/`, TypeScript, comentários em português do Brasil.
- Dependências com versão fixa (sem `^` ou `~`).
- Testes com Vitest + `aws-cdk-lib/assertions` + `fast-check`, sem credenciais AWS, usando `criarApp({ conta: '111111111111' })` e `caminhoDist` inexistente.
- Todo comando que acessa a AWS usa o profile `hackaton`; antes de criar recursos, confirmar com `aws sts get-caller-identity --profile hackaton`.

- [~] 1. Estruturar o monorepo e o projeto CDK
  - [x] 1.1 Configurar workspaces na raiz
    - Criar ou atualizar o `package.json` da raiz com `"private": true` e `workspaces` incluindo `infra` (preservar entradas já existentes de outros integrantes).
    - Acrescentar `infra/cdk.out/`, `infra/node_modules/` e `web/.env.local` ao `.gitignore` da raiz.
    - _Requirements: 1.1_
  - [x] 1.2 Criar o esqueleto de `infra/`
    - `infra/package.json` com versões fixadas de `aws-cdk-lib`, `constructs`, `aws-cdk` (CLI), `cdk-nag`, `typescript`, `tsx`, `esbuild`, `vitest`, `fast-check`, `@types/node` e AWS SDK v3 (`@aws-sdk/client-cloudformation`, `@aws-sdk/client-cognito-identity-provider`).
    - Scripts `bootstrap`, `synth`, `deploy`, `destroy` (todos com `--profile hackaton`, `deploy` com `--all --require-approval never`, `destroy` com `--all --force`), `test` (`vitest run`), `usuarios` e `env-web`.
    - `tsconfig.json` (strict), `vitest.config.ts` e `cdk.json` com `"app": "npx tsx bin/sigfrota.ts"` e contexto `throttleTaxa: 50`, `throttleRajada: 100`.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.5_
  - [x] 1.3 Implementar `lib/config.ts` e `bin/sigfrota.ts`
    - `REGIAO = 'us-east-1'` (único lugar com a região), `PREFIXO`, `TAGS`, `ORIGEM_LOCAL` e `calcularSufixo(conta)` (8 hex do SHA-256 do ID da conta).
    - `criarApp({ conta?, contexto? })`: cria o `App`, aplica `Tags` (`Projeto=sigfrota`, `Modulo=lavagem`) e `Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }))`, instancia `SigfrotaBaseStack` com `env = { account, region: REGIAO }`. A stack pode começar vazia e ser preenchida nas tarefas seguintes.
    - `bin/sigfrota.ts` lê `CDK_DEFAULT_ACCOUNT`; se ausente, encerra com "Credenciais AWS não encontradas. Use --profile hackaton." Deixar linhas comentadas reservadas para as stacks dos specs 3, 5 e 6.
    - _Requirements: 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 9.1_
  - [ ]* 1.4 Escrever teste de propriedade do sufixo de unicidade (`test/conta.test.ts`)
    - **Property 1: sufixo determinístico e válido**
    - **Validates: Requirements 2.3, 4.8, 11.3**
    - Incluir a varredura estática de `infra/bin` e `infra/lib` sem sequências de 12 dígitos (ID de conta fixo).
    - _Requirements: 2.1, 11.3_

- [ ] 2. Implementar a tabela DynamoDB
  - [ ] 2.1 Criar o construto `Tabela` (`lib/constructs/dados.ts`)
    - `sigfrota-lavagem`, `PK`/`SK` string, `PAY_PER_REQUEST`, `TableEncryption.AWS_MANAGED`, PITR ativo, `RemovalPolicy.DESTROY`, sem GSI e sem nenhum `grant*`.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 2.6_
  - [ ]* 2.2 Escrever testes do construto (`test/dados.test.ts`)
    - Chaves, cobrança, `SSESpecification.SSEEnabled`, PITR, ausência de `GlobalSecondaryIndexes`, `DeletionPolicy: Delete`.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 2.6, 11.2_

- [ ] 3. Implementar a autenticação com Cognito
  - [ ] 3.1 Criar o construto `Autenticacao` (`lib/constructs/autenticacao.ts`)
    - User Pool `sigfrota-usuarios`: auto cadastro desabilitado, login por e-mail, só o atributo e-mail, senha mínima de 12 com os quatro tipos de caractere, MFA opcional só TOTP, recuperação só por e-mail, plano Essentials, `DESTROY`.
    - Grupos `atendente` e `gestor`.
    - App Client `sigfrota-spa`: sem segredo, `userSrp`, `preventUserExistenceErrors`, só Authorization Code, escopos `openid` e `email`, callbacks e logout em `https://<cloudfront>/` e `http://localhost:5173/`, tokens de acesso e ID com 60 min, refresh com 1 dia.
    - Domínio `sigfrota-<calcularSufixo(conta)>`.
    - Receber a URL do CloudFront por prop.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 2.3, 2.6_
  - [ ]* 3.2 Escrever testes do construto (`test/autenticacao.test.ts`)
    - `AllowAdminCreateUserOnly`, grupos, `UsernameAttributes`, ausência de outros atributos, política de senha, MFA `OPTIONAL`, client sem segredo, só `code`, callbacks, validade dos tokens, prefixo do domínio com o sufixo.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 11.2, 11.3_

- [ ] 4. Implementar a HTTP API
  - [ ] 4.1 Criar o construto `Api` (`lib/constructs/api.ts`)
    - `HttpApi` `sigfrota-api` com `HttpJwtAuthorizer` padrão (issuer do User Pool, audience do App Client).
    - CORS com origens `https://<cloudfront>` e `http://localhost:5173`, cabeçalhos `authorization` e `content-type`, métodos GET/POST/PUT/DELETE/OPTIONS, `maxAge` 1 h, sem credenciais.
    - Stage `$default` via `CfnStage`: throttling lido do contexto e access logs em `/aws/apigateway/sigfrota-api` (30 dias, `DESTROY`) com formato JSON só com `requestId`, `requestTime`, `routeKey`, `status`, `responseLatency`, `integrationErrorMessage` e `sub`.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.8, 9.5, 9.6_
  - [ ]* 4.2 Escrever testes do construto (`test/api.test.ts`)
    - Issuer e audience do authorizer, CORS com as duas origens e sem `*`, throttling no stage, formato de log sem `sourceIp` nem `authorization`, retenção do log group.
    - _Requirements: 5.1, 5.4, 5.5, 5.6, 11.2_

- [ ] 5. Implementar a hospedagem do front
  - [ ] 5.1 Criar o construto `Front` (`lib/constructs/front.ts`)
    - Bucket sem nome explícito: `BLOCK_ALL`, `S3_MANAGED`, `enforceSSL`, `BUCKET_OWNER_ENFORCED`, `DESTROY`.
    - Distribution com `S3BucketOrigin.withOriginAccessControl`, `REDIRECT_TO_HTTPS`, `CACHING_OPTIMIZED`, `index.html` como raiz, HTTP/2 e 3, respostas 403/404 → `/index.html` com 200 e TTL 0.
    - `ResponseHeadersPolicy` com HSTS, `nosniff`, `DENY`, `strict-origin-when-cross-origin` e a CSP do design (curinga regional da API e do S3, domínio exato do Cognito calculado no synth).
    - Expor um método para publicar o conteúdo depois que a API e o Cognito existirem: `BucketDeployment` com `web/dist` (ou página provisória se `caminhoDist` não existir) + `Source.jsonData('config.json', ...)`, invalidação `/*`, `retainOnDelete: false`, `prune: true` e log group próprio de 30 dias.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 2.4, 2.5, 2.6, 9.4, 9.6_
  - [ ]* 5.2 Escrever testes do construto (`test/front.test.ts`)
    - Block Public Access, SSE, política `aws:SecureTransport`, OAC, `redirect-to-https`, cabeçalhos, CSP com o domínio do Cognito, respostas de erro, `RetainOnDelete: false`, deploy sem falhar quando `caminhoDist` não existe, chaves do `config.json`.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 2.6, 11.2_

- [ ] 6. Implementar o construto `FuncaoLambda`
  - [ ] 6.1 Criar `lib/constructs/funcao-lambda.ts` e `test/fixtures/handler.ts`
    - Tipos `AcessoTabela` e `FuncaoLambdaProps` conforme o design.
    - Role exclusiva sem managed policies, log group de 30 dias com `grantWrite`, `NodejsFunction` com `NODEJS_24_X` (ou `NODEJS_22_X` se a versão fixada não tiver o 24), ARM64, tracing ativo, logs JSON, `minify` e `sourceMap`, `projectRoot` e `depsLockFilePath` da raiz, timeout 10 s e memória 512 MB por padrão.
    - Acesso à tabela: `grantReadData`, `grantReadWriteData` ou `grant(...acoes)`; rejeitar ações com `*` ou fora do formato `dynamodb:<Nome>`; acrescentar `TABELA_NOME`.
    - Rejeitar no synth variáveis de ambiente cujo nome case com `/(SECRET|SEGREDO|PASSWORD|SENHA|TOKEN|API_KEY|PRIVATE_KEY)/i`.
    - Exportar em `lib/index.ts`.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 3.5_
  - [ ]* 6.2 Escrever teste de propriedade dos segredos (`test/funcao-lambda.test.ts`)
    - **Property 2: segredos rejeitados no ambiente**
    - **Validates: Requirements 7.7**
  - [ ]* 6.3 Escrever teste de propriedade do menor privilégio (`test/funcao-lambda.test.ts`)
    - **Property 4: menor privilégio nas roles das funções**
    - **Validates: Requirements 7.3, 7.4, 3.5**
    - Incluir os testes de exemplo: ARM64, runtime, tracing, duas funções → duas roles, `TABELA_NOME`.
    - _Requirements: 7.1, 7.2, 7.5, 7.6, 11.2_

- [ ] 7. Montar a stack base e o contrato de infra
  - [ ] 7.1 Implementar `SigfrotaBaseStack` (`lib/stacks/base-stack.ts`)
    - Compor `Tabela`, `Front` (bucket e distribution), `Autenticacao` (com a URL do CloudFront), `Api` (com a origem do CloudFront e o Cognito) e, por último, a publicação do conteúdo do front com o `config.json`.
    - Expor `readonly contrato: ContratoInfra`.
    - Criar os sete `CfnOutput` e os sete parâmetros SSM `/sigfrota/...` da tabela do design.
    - _Requirements: 5.4, 6.7, 8.1, 8.2_
  - [ ] 7.2 Implementar `ContratoInfra` e `registrarRota()` (`lib/contrato.ts`)
    - `HttpRoute` criada no escopo da stack consumidora, com `HttpLambdaIntegration` e authorizer sempre explícito (`contrato.authorizer`, ou `HttpNoneAuthorizer` quando `publica: true`).
    - Validar método (GET/POST/PUT/DELETE) e caminho iniciado por `/`; `id` derivado do método e do caminho.
    - Exportar em `lib/index.ts`.
    - _Requirements: 5.2, 5.7, 8.2_
  - [ ]* 7.3 Escrever testes do contrato (`test/contrato.test.ts`)
    - **Property 3: rota protegida por padrão**
    - **Validates: Requirements 5.2, 5.7**
    - Usar uma stack de teste consumidora com `FuncaoLambda` + `registrarRota`; verificar também os sete outputs e os sete parâmetros SSM e que não há dependência circular no synth.
    - _Requirements: 8.1, 8.2_

- [ ] 8. Aplicar a conformidade com o `cdk-nag`
  - [ ] 8.1 Implementar `lib/nag.ts` com as supressões justificadas
    - Apenas as supressões da tabela do design (IAM5 do X-Ray e do log group, Lambda interna do `BucketDeployment`, COG2, COG3, S1, CFR1–CFR4), restritas ao recurso e com `appliesTo` quando a regra permitir.
    - Para qualquer outra violação, corrigir o recurso antes de considerar supressão.
    - _Requirements: 9.1, 9.2, 9.3_
  - [ ]* 8.2 Escrever testes de segurança (`test/seguranca.test.ts`)
    - **Property 5: retenção em todos os log groups**
    - **Validates: Requirements 2.5, 7.5, 9.6**
    - Verificar ausência de anotações de erro `AwsSolutions-*` e de `AWS::EC2::VPC` e `AWS::EC2::NatGateway`.
    - _Requirements: 9.1, 9.2, 9.7_

- [ ] 9. Checkpoint — synth e testes
  - Rodar `npm install`, `npm test -w infra` e `npm run synth -w infra` (com credenciais `hackaton` válidas) e garantir que tudo passa sem erros do `cdk-nag`. Perguntar ao usuário se surgirem dúvidas.

- [ ] 10. Criar os scripts de apoio
  - [ ] 10.1 Implementar `scripts/criar-usuarios.mjs`
    - Ler os outputs da stack `SigfrotaBase` via `DescribeStacks` (profile pela variável `AWS_PROFILE`).
    - Pedir e-mail e senha do atendente e do gestor, com senha sem eco e nunca registrada.
    - `AdminCreateUser` (`SUPPRESS`, `email_verified=true`), `AdminSetUserPassword` (`Permanent: true`) e `AdminAddUserToGroup`; tratar `UsernameExistsException` redefinindo senha e grupo.
    - Mensagem clara quando a stack não existir.
    - _Requirements: 4.10_
  - [ ] 10.2 Implementar `scripts/gerar-env-web.mjs`
    - Gerar `web/.env.local` com `VITE_API_URL`, `VITE_REGIAO`, `VITE_USER_POOL_ID`, `VITE_USER_POOL_CLIENT_ID`, `VITE_COGNITO_DOMINIO` e `VITE_REDIRECT_URI=http://localhost:5173/`.
    - _Requirements: 8.3_

- [ ] 11. Escrever o `infra/README.md`
  - Pré-requisitos (Node.js, profile `hackaton`, `npm run bootstrap -w infra` em `us-east-1`), comandos de synth, deploy, testes, destroy, usuários e env-web, e a ordem `npm run build -w web` antes do deploy.
  - Contrato de infra: nome de cada output e parâmetro SSM, uso de `FuncaoLambda` e `registrarRota` com exemplo para os specs 3, 5 e 6, formato da claim `cognito:groups` e orientação de não usar rotas `ANY`/`$default`.
  - Estimativa de custo do MVP e de produção com as premissas, e a lista de pendências para produção.
  - Roteiro de verificação manual pós-deploy.
  - _Requirements: 1.7, 8.4, 10.1, 10.2, 10.3_

- [ ] 12. Implantar e verificar na conta
  - [ ] 12.1 Implantar a stack
    - Confirmar `aws sts get-caller-identity --profile hackaton` (conta `438584370327`, papel `WSParticipantRole`); se falhar ou a conta divergir, parar e avisar o usuário.
    - Rodar `npm run bootstrap -w infra` (se ainda não houver bootstrap) e `npm run deploy -w infra`.
    - _Requirements: 1.4, 2.1_
  - [ ] 12.2 Executar a verificação manual
    - Abrir a `FrontUrl` (página provisória ou front), confirmar 403 no acesso direto ao S3, confirmar 401 em uma chamada sem token à `ApiUrl`, conferir o `config.json` publicado e os parâmetros SSM.
    - Registrar o resultado no `infra/README.md`. Não rodar `destroy` sem pedir ao usuário.
    - _Requirements: 5.3, 6.2, 6.7, 8.1_

- [ ] 13. Checkpoint final
  - Garantir que todos os testes passam e que o synth não tem erros do `cdk-nag`. Perguntar ao usuário se surgirem dúvidas.