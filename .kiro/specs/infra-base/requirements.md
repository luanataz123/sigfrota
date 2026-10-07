# Requisitos — `infra-base` (spec 1)

## Introdução

Infraestrutura como código (AWS CDK em TypeScript) do SIG Frota — módulo de Lavagem. O spec entrega a base serverless sobre a qual os specs 3 (`api-lavagens`), 4 (`frontend-lavagens`), 5 (`ia-extracao-regras`) e 6 (`ia-leitura-recibo`) se apoiam: tabela DynamoDB, Cognito, API Gateway (HTTP API) com authorizer JWT, hospedagem do front em S3 + CloudFront e um padrão de Lambda com IAM de menor privilégio.

O código fica em `infra/` (workspace npm do monorepo). Não há regras de negócio Rxx neste spec; ele atende principalmente os critérios 2 (Arquitetura AWS), 4 (Segurança) e 6 (Viabilidade e Escalabilidade) da banca.

### Contexto de implantação

- Cada integrante da equipe tem sua própria conta AWS do hackathon e implanta a solução completa de forma independente. Uma das contas é usada na apresentação.
- Há um único ambiente (`dev`). Não existe stage de produção no MVP; o que mudaria em produção fica documentado (Requisito 10).
- Região fixa: `us-east-1`, pela disponibilidade de modelos no Amazon Bedrock.

### Divisão do trabalho

- Este spec cria apenas os recursos base e os pontos de extensão.
- Os recursos de IA (buckets de upload, Step Functions, Bedrock) ficam em stacks próprias dentro de `infra/`, criadas pelas pessoas dos specs 5 e 6 usando o construto de Lambda e o contrato de infra deste spec.
- As rotas e handlers da API são do spec 3, registrados pelo ponto de extensão do Requisito 4.

### Fora do escopo

- Rotas e handlers da API (spec 3), telas (spec 4), recursos de IA (specs 5 e 6).
- Carga dos dados sintéticos (spec 3).
- Pipeline de deploy contínuo.
- Alarmes, tópicos SNS e dashboards do CloudWatch.
- Domínio próprio e certificado ACM: o MVP usa o domínio padrão `*.cloudfront.net`.

## Glossário

- **Conta do integrante**: conta AWS individual do hackathon onde cada pessoa implanta a solução completa.
- **Sufixo de unicidade**: valor derivado da conta (por exemplo, os últimos dígitos do ID da conta) usado em nomes que precisam ser únicos globalmente.
- **Construto de função**: construto CDK reutilizável que cria uma Lambda Node.js com role própria e permissões explícitas.
- **Contrato de infra**: conjunto de valores publicados pela stack (nome da tabela, URL da API, IDs do Cognito, URL do CloudFront) consumidos pelos outros specs.

## Requisitos

### Requisito 1 — Projeto CDK no monorepo

**História:** Como integrante da equipe, quero um projeto CDK em TypeScript dentro de `infra/`, para provisionar toda a infraestrutura na minha conta com um comando, sem passos manuais no console.

#### Critérios de aceitação

1. O projeto CDK DEVE ficar em `infra/` e ser declarado como workspace no `package.json` da raiz.
2. O projeto DEVE usar `aws-cdk-lib` v2 e TypeScript, com versões fixadas (sem `^` ou `~`).
3. QUANDO a pessoa executar `npm run synth -w infra`, ENTÃO o sistema DEVE gerar os templates CloudFormation sem erros.
4. QUANDO a pessoa executar `npm run deploy -w infra`, ENTÃO o sistema DEVE implantar todas as stacks base na conta das credenciais ativas, na região `us-east-1`.
5. Todos os nomes de recursos com nome explícito DEVEM levar o prefixo `sigfrota`.
6. Todos os recursos DEVEM receber as tags `Projeto=sigfrota` e `Modulo=lavagem`, para rateio de custo.
7. O `infra/README.md` DEVE documentar pré-requisitos (Node.js, credenciais AWS, `cdk bootstrap` em `us-east-1`), comandos de synth, deploy, testes e destroy.

### Requisito 2 — Implantação independente por conta

**História:** Como integrante da equipe, quero implantar a solução completa na minha própria conta sem colidir com as contas dos colegas, para desenvolver e testar de forma isolada.

#### Critérios de aceitação

1. O código NÃO DEVE conter ID de conta AWS fixo; a conta DEVE vir das credenciais ativas (`CDK_DEFAULT_ACCOUNT`).
2. A região DEVE ser `us-east-1` e DEVE estar definida em um único lugar do código.
3. Recursos cujo nome precisa ser único globalmente (por exemplo o prefixo de domínio do Cognito) DEVEM incluir o sufixo de unicidade derivado da conta.
4. Buckets S3 NÃO DEVEM ter nome explícito; o nome DEVE ser gerado pelo CloudFormation.
5. QUANDO a pessoa executar `npm run destroy -w infra`, ENTÃO o sistema DEVE remover todos os recursos base da conta, incluindo tabela, bucket do front e log groups, sem passos manuais.
6. Todos os recursos com estado (tabela, bucket, log groups, User Pool) DEVEM usar `RemovalPolicy.DESTROY`; o bucket DEVE ter esvaziamento automático na remoção.

### Requisito 3 — Tabela DynamoDB

**História:** Como pessoa desenvolvedora da API, quero uma tabela DynamoDB única no modelo do README (PK/SK), para gravar catálogo, lavagens e contador com criptografia e recuperação.

#### Critérios de aceitação

1. O sistema DEVE criar uma tabela com chave de partição `PK` (string) e chave de ordenação `SK` (string), sem GSI no MVP.
2. A tabela DEVE usar o modo de cobrança sob demanda (`PAY_PER_REQUEST`).
3. A tabela DEVE ter criptografia em repouso com chave KMS.
4. A tabela DEVE ter point-in-time recovery habilitado.
5. A stack NÃO DEVE conceder acesso à tabela a nenhum principal além das roles das Lambdas que o declararem explicitamente (Requisito 7).

### Requisito 4 — Autenticação com Amazon Cognito

**História:** Como atendente ou gestor, quero entrar no sistema com usuário e senha, para que só pessoas autorizadas registrem e consultem lavagens.

#### Critérios de aceitação

1. O sistema DEVE criar um User Pool com auto cadastro desabilitado; usuários são criados apenas por administradores.
2. O User Pool DEVE ter os grupos `atendente` e `gestor`.
3. O User Pool DEVE usar e-mail como identificador de login e NÃO DEVE solicitar outros atributos pessoais (nome, CPF, telefone), em atenção à minimização de dados da LGPD (OT nº 17).
4. O User Pool DEVE exigir senha com no mínimo 12 caracteres, com maiúsculas, minúsculas, números e símbolos.
5. O User Pool DEVE oferecer MFA opcional por TOTP.
6. O sistema DEVE criar um App Client público (sem segredo) para a SPA, com fluxo Authorization Code + PKCE e sem fluxo implícito.
7. O App Client DEVE aceitar como URLs de callback e logout a URL do CloudFront e `http://localhost:5173`, para desenvolvimento local do front.
8. O sistema DEVE criar um domínio de login gerenciado do Cognito com prefixo `sigfrota-<sufixo de unicidade>`.
9. Os tokens de acesso e de ID DEVEM expirar em até 60 minutos.
10. A stack NÃO DEVE conter senhas nem usuários de demonstração; o sistema DEVE fornecer um script que crie um usuário em cada grupo, com e-mail e senha informados em tempo de execução.

### Requisito 5 — API Gateway HTTP API com authorizer JWT

**História:** Como pessoa desenvolvedora da API, quero uma HTTP API protegida por JWT do Cognito, para que toda rota rejeite chamadas sem token válido antes de chegar à Lambda.

#### Critérios de aceitação

1. O sistema DEVE criar uma HTTP API (API Gateway v2) com authorizer JWT apontando para o User Pool e o App Client do Requisito 4.
2. O authorizer JWT DEVE ser o padrão de todas as rotas; uma rota sem autenticação só DEVE existir se declarada explicitamente como pública.
3. QUANDO uma requisição chegar sem token ou com token inválido ou expirado, ENTÃO a API DEVE responder 401 sem invocar a Lambda.
4. O CORS DEVE permitir apenas a origem do CloudFront e `http://localhost:5173`; NÃO DEVE usar `*`.
5. A API DEVE ter limite de throttling no stage padrão, com taxa e rajada configuráveis por contexto do CDK.
6. A API DEVE gravar access logs em CloudWatch Logs com ID da requisição, rota, status, latência e `sub` do usuário, e NÃO DEVE registrar cabeçalho `Authorization`, corpo da requisição nem IP completo.
7. A infra DEVE oferecer um ponto de extensão para o spec 3 registrar rotas (método, caminho, Lambda) sem alterar os construtos base.
8. A verificação de grupo (`atendente` ou `gestor`) é feita pela API a partir da claim `cognito:groups`; a infra DEVE garantir que essa claim chegue à Lambda no contexto do authorizer.

### Requisito 6 — Hospedagem do front em S3 + CloudFront

**História:** Como atendente, quero acessar o sistema por HTTPS em uma URL estável, para usar a aplicação com segurança no navegador.

#### Critérios de aceitação

1. O sistema DEVE criar um bucket S3 privado, com Block Public Access total, criptografia SSE-S3 e `enforceSSL`.
2. O sistema DEVE criar uma distribuição CloudFront com Origin Access Control (OAC) para o bucket; o bucket NÃO DEVE ser acessível diretamente.
3. O CloudFront DEVE redirecionar HTTP para HTTPS e usar TLS 1.2 ou superior.
4. O CloudFront DEVE aplicar uma política de cabeçalhos de segurança: HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` e Content-Security-Policy que permita apenas a própria origem, a API e o domínio do Cognito.
5. QUANDO o CloudFront receber 403 ou 404 do bucket, ENTÃO DEVE responder `index.html` com status 200, para o roteamento da SPA.
6. QUANDO existir build do front em `web/dist`, ENTÃO o deploy DEVE publicá-lo no bucket e invalidar o cache do CloudFront; QUANDO não existir, ENTÃO o deploy NÃO DEVE falhar.
7. O deploy DEVE publicar um arquivo `config.json` no bucket com URL da API, região, ID do User Pool, ID do App Client e domínio do Cognito, para o front ler em tempo de execução sem rebuild.

### Requisito 7 — Construto de Lambda com menor privilégio

**História:** Como pessoa desenvolvedora dos specs 3, 5 e 6, quero um construto padrão para criar Lambdas Node.js, para que cada função tenha role própria e só as permissões de que precisa.

#### Critérios de aceitação

1. O construto DEVE criar a Lambda com o runtime Node.js LTS mais recente suportado pelo Lambda (`nodejs22.x` ou superior), arquitetura ARM64 e empacotamento via esbuild (`NodejsFunction`).
2. Cada Lambda DEVE ter uma role IAM exclusiva; o construto NÃO DEVE reutilizar roles entre funções.
3. O construto DEVE exigir que o acesso à tabela seja declarado de forma explícita e granular: somente leitura, leitura e escrita, ou ações específicas (por exemplo `dynamodb:Query`, `dynamodb:GetItem`).
4. As políticas geradas NÃO DEVEM conter `Resource: "*"` nem curingas de ação (`dynamodb:*`, `s3:*`), exceto onde o serviço não suporta restrição por recurso, com justificativa registrada.
5. O construto DEVE criar um log group dedicado com retenção de 30 dias.
6. O construto DEVE habilitar X-Ray (tracing ativo) e definir timeout e memória padrão, sobrescrevíveis por função.
7. O construto DEVE permitir variáveis de ambiente e NÃO DEVE aceitar segredos em texto puro nelas.
8. O construto DEVE ser exportado de forma que as stacks dos specs 3, 5 e 6 o importem sem duplicar código.

### Requisito 8 — Contrato de infra para os outros specs

**História:** Como pessoa responsável pelos specs 3 a 6, quero obter os identificadores dos recursos base de forma padronizada, para integrar meu código sem depender de valores copiados à mão.

#### Critérios de aceitação

1. O sistema DEVE publicar como `CfnOutput` e como parâmetro SSM (`/sigfrota/...`): nome e ARN da tabela, URL da API, ID do User Pool, ID do App Client, domínio do Cognito e URL do CloudFront.
2. As stacks dos specs 3, 5 e 6 DEVEM conseguir referenciar os recursos base dentro do mesmo app CDK, sem ler valores copiados à mão.
3. O sistema DEVE fornecer um script que gere `web/.env.local` a partir dos outputs da stack da conta ativa, para desenvolvimento local do front.
4. O contrato de infra DEVE estar documentado em `infra/README.md`, com o nome de cada output e de cada parâmetro SSM.

### Requisito 9 — Segurança e conformidade transversais

**História:** Como banca e como MPF, quero evidências verificáveis de boas práticas de segurança na infra, para confiar que o MVP pode evoluir para produção.

#### Critérios de aceitação

1. O app CDK DEVE aplicar as regras do `cdk-nag` (pacote `AwsSolutions`) em todas as stacks.
2. QUANDO o `cdk synth` encontrar violação do `cdk-nag` sem supressão justificada, ENTÃO o synth DEVE falhar.
3. Toda supressão do `cdk-nag` DEVE ter justificativa escrita no código.
4. Todos os dados em repouso (DynamoDB, S3, logs) DEVEM estar criptografados, e todo tráfego externo DEVE usar HTTPS.
5. Os logs da API e das Lambdas NÃO DEVEM conter tokens, senhas, e-mails, CNPJ completo nem corpo de requisição.
6. Todos os log groups DEVEM ter retenção definida; nenhum DEVE ficar com retenção infinita.
7. A arquitetura NÃO DEVE usar VPC nem NAT Gateway no MVP, para evitar custo fixo e superfície de rede desnecessária.

### Requisito 10 — Custo e caminho para produção

**História:** Como gestor do MPF, quero saber quanto a infra custa e o que falta para produção, para avaliar a continuidade do projeto.

#### Critérios de aceitação

1. Todos os recursos DEVEM ser sob demanda ou pagos por uso (Lambda, HTTP API, DynamoDB on-demand, S3, CloudFront), sem capacidade provisionada.
2. O `infra/README.md` DEVE trazer uma estimativa de custo mensal para o volume do MVP e para um cenário de produção, com as premissas usadas.
3. O `infra/README.md` DEVE listar o que falta para produção, no mínimo: stage `prod` com `RemovalPolicy.RETAIN` e `deletionProtection`, MFA obrigatório, domínio próprio com ACM, AWS WAF, alarmes e dashboard, pipeline de deploy e backup entre regiões.

### Requisito 11 — Testes da infraestrutura

**História:** Como pessoa desenvolvedora, quero testes automatizados das stacks, para detectar regressões de segurança antes do deploy.

#### Critérios de aceitação

1. O projeto DEVE ter testes com `aws-cdk-lib/assertions` executáveis por `npm test -w infra`, sem credenciais AWS.
2. Os testes DEVEM verificar, no mínimo: criptografia e PITR da tabela; ausência de GSI; auto cadastro desabilitado e grupos no Cognito; authorizer JWT como padrão na API; CORS sem `*`; bucket sem acesso público e com OAC; redirecionamento HTTPS no CloudFront; ausência de `Resource: "*"` nas políticas das Lambdas; retenção definida em todos os log groups.
3. Os testes DEVEM verificar que nenhum template contém ID de conta fixo e que o prefixo do domínio do Cognito inclui o sufixo de unicidade.
