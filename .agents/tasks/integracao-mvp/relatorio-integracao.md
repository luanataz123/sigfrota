# Relatório de integração do MVP — SigFrota / Lavagem

Investigação somente leitura em `main` (HEAD `aeb9992`). Nada foi editado nem commitado; a única ação local foi `npm ci` na raiz para compilar e testar. Nenhuma chamada à AWS.

## Resumo

1. **O front compila.** `npm run build -w web` (`tsc -b && vite build`) passa e gera `web/dist`. O problema está nos testes: 68 de 205 falham por causa de **duas versões do Vitest** no monorepo (web 3.2.7 e raiz 5.0.3). Não há erro no código da aplicação.
2. **Ainda não existe back-end.** Não há `services/api`, nenhuma Lambda (só `infra/test/fixtures/handler.ts`) e nenhuma rota registrada na HTTP API. A API implantada responde 404 a tudo (`infra/README.md`, passo 6 da verificação manual). Esse é o maior bloqueio do MVP.
3. **O front não fala com Cognito.** Só existe o `MockAuthAdapter`, e o `providers.tsx` o usa por padrão. Também não há código que leia as variáveis geradas pela infra: o front lê `VITE_USE_MOCK`/`VITE_API_BASE_URL`, mas o `gerar-env-web.mjs` grava `VITE_API_URL`, `VITE_USER_POOL_*` etc. e não grava `VITE_USE_MOCK`. Com isso o front cai no mock em silêncio.
4. **O contrato de rotas do front difere do README.** O front usa `/lavagens/{id}` (GET/PUT/DELETE) e `POST /lavagens`. O README (e o spec do recibo) usam `/veiculos/{idVeiculo}/lavagens[/{idLavagem}]`, que é o que a modelagem DynamoDB exige, porque o idVeiculo faz parte da PK.
5. **Os nomes e tipos dos campos divergem** entre o front (`descricao`, `nome`, `'S'|'N'`) e o seed/DynamoDB (`dsVeiculo`, `dsTipoLavagem`, `nmPosto`, booleanos, `null`). A proposta é resolver com um mapper na API: o front e o `packages/dominio` ficam como estão.
6. **Infra e dados estão coerentes.** Tabela `sigfrota-lavagem`, PK/SK string, sem GSI, nos dois lados. O script de carga não deve usar `--criar-tabela`, porque a tabela já vem do CDK. Há dois ajustes pequenos: o profile no `data/carga/README.md` (diz `hackathon`, o certo é `hackaton`) e 1 teste do seed que falha por CRLF.

---

## A. Build e testes

| Alvo | Comando | Resultado |
|------|---------|-----------|
| web (tipos) | `npx tsc -b` em `web/` | OK (TS 5.9.3 local do web) |
| web (build) | `npm run build` em `web/` | OK: `dist/index.html`, CSS de 13,7 kB, JS de 293 kB |
| web (testes) | `npx vitest run` em `web/` | **68 falhas / 137 ok** (12 de 21 arquivos falham) |
| packages/dominio | `npx vitest run` / `npx tsc -p .` | OK: 21/21 testes, tsc limpo |
| infra | `npm run typecheck -w infra` / `npm test -w infra` | typecheck OK; nenhum teste existe (`passWithNoTests`) |
| data/seed | `node --test data/seed/` | 26/27; 1 falha de CRLF × LF |
| data/carga | — | não instalado (`data/carga/node_modules` ausente; não é workspace) |

**Causa das 68 falhas do web.** Os erros são `Invalid Chai property: toBeInTheDocument` (46), `toHaveAttribute` (13) e outros matchers do jest-dom. O `package-lock.json` instala `vitest@3.2.7` em `web/node_modules`, mas `vitest@5.0.3` (do infra) fica içado na raiz. O `@testing-library/jest-dom` também fica na raiz, então `web/src/test/setup.ts` (`import '@testing-library/jest-dom/vitest'`) estende o `expect` do Vitest **5**, enquanto os testes rodam no Vitest **3**. As 2 falhas de "useAuth deve ser usado dentro de um <AuthProvider>" aparecem no mesmo lote e devem sumir junto (não confirmado).
**Correção:** alinhar a versão. Por exemplo, `web/package.json` com `"vitest": "5.0.3"` (a mesma do infra e do dominio, que já roda nela) e validar `@vitejs/plugin-react`/`vite` 6 com o Vitest 5, ou fixar o Vitest 3 em todos os workspaces. Depois, `npm install` e `npx vitest run` em `web/`.

**Outros pontos de build:**
- `web/package.json` não declara `@sigfrota/dominio`, apesar de o `web/src/lib/validationResolver.ts:17` importá-lo. Hoje funciona só porque o workspace cria o link `node_modules/@sigfrota/dominio`. Adicionar `"@sigfrota/dominio": "*"` às dependências.
- `web/tsconfig.app.tsbuildinfo` e `tsconfig.node.tsbuildinfo` estão versionados. Desejável: tirar do git e pôr no `.gitignore`.
- O script `test` da raiz roda só o web. O dominio não tem script `test` no `package.json`.
- Seed: `core.autocrlf=true` e não há `.gitattributes`. O `seed.test.mjs` compara o JSON gerado (LF) com o arquivo do checkout (CRLF). Correção: `.gitattributes` com `data/seed/**/*.json text eol=lf`.

## B. Contrato front × infra

### B.1 Rotas

O que o front chama (`web/src/api/HttpLavagemClient.ts`), comparado com a infra e o README:

| Método no client | Front chama | README / spec recibo | Infra hoje |
|------------------|-------------|----------------------|------------|
| `listarLavagens(idVeiculo)` | `GET /veiculos/{id}/lavagens` | igual | nenhuma rota |
| `obterVeiculo(idVeiculo)` | `GET /veiculos/{id}` | (não citado) | nenhuma |
| `obterLavagem(id)` | `GET /lavagens/{id}` | `GET /veiculos/{idVeiculo}/lavagens/{idLavagem}` | nenhuma |
| `listarTipos()` | `GET /tipos-lavagem` | (catálogo `Query PK=CATALOGO`) | nenhuma |
| `listarPostos()` | `GET /postos` | idem | nenhuma |
| `criarLavagem(dados)` | `POST /lavagens` | `POST /veiculos/{idVeiculo}/lavagens` (`requirements-recibo-ia.md:19,115`) | nenhuma |
| `atualizarLavagem(id, dados)` | `PUT /lavagens/{id}` | `PUT /veiculos/{idVeiculo}/lavagens/{idLavagem}` | nenhuma |
| `excluirLavagem(id)` | `DELETE /lavagens/{id}` | `DELETE /veiculos/{idVeiculo}/lavagens/{idLavagem}` | nenhuma |

O front deve se adaptar. Sem o idVeiculo na rota, a Lambda não monta a PK `VEICULO#id` e precisaria de GSI ou Scan, o que contraria o README ("Rota com o veículo ... dispensa um GSI pelo ID"). O esforço no front é pequeno: o `idVeiculo` já está disponível em todos os pontos de chamada (`LavagemFormPage.tsx`, `useLavagemMutations(idVeiculo)`). Basta mudar as assinaturas `obterLavagem/atualizarLavagem/excluirLavagem` para receber `idVeiculo` e ajustar `LavagemClient.ts`, o `MockLavagemClient.ts`, os hooks e os testes.

As restrições do `registrarRota` (`infra/lib/contrato.ts`) são atendidas por todas essas rotas: GET/POST/PUT/DELETE, path `{param}` e JWT por padrão.

### B.2 Variáveis de ambiente

| Front lê (`web/src/vite-env.d.ts`, `clientFactory.ts`) | `gerar-env-web.mjs` grava | Situação |
|---|---|---|
| `VITE_USE_MOCK` (padrão `'true'`) | — | **Falta.** Sem ela, o front usa o mock mesmo com a API pronta |
| `VITE_API_BASE_URL` | `VITE_API_URL` | **Nome diferente** |
| — | `VITE_REGIAO`, `VITE_USER_POOL_ID`, `VITE_USER_POOL_CLIENT_ID`, `VITE_COGNITO_DOMINIO`, `VITE_REDIRECT_URI` | Front ainda não usa (não há adapter Cognito) |

**Resolução de menor esforço:**
- O front adota os nomes da infra (`VITE_API_URL` e os demais), atualizando `vite-env.d.ts`, `clientFactory.ts` e `.env.example`.
- O `gerar-env-web.mjs` passa a gravar `VITE_USE_MOCK=false`.

**Deploy no CloudFront.** O `front.ts` publica um `config.json` em tempo de execução, mas o front não o lê. Para o MVP isso não bloqueia: o Vite carrega `.env.local` também no `vite build`, e a API, o User Pool e o Client têm IDs estáveis. Com login SRP (abaixo), o `redirectUri` não é usado. Sequência:

1. `deploy`
2. `env-web`
3. `build -w web`
4. `deploy`

Ler `/config.json` no boot fica como desejável (build único para qualquer ambiente).

### B.3 Autenticação

- **Front:** `AuthProvider` com um `AuthAdapter` plugável (`autenticar({email, senha}) → {token, usuario}`), uma `LoginPage` própria com e-mail e senha e o `MockAuthAdapter` como padrão (`web/src/app/providers.tsx`, `useMemo(() => authAdapter ?? new MockAuthAdapter())`). Não há adapter Cognito nem dependência de SDK Cognito ou Amplify.
- **Infra** (`infra/lib/constructs/autenticacao.ts`): App Client público, `authFlows: { userSrp: true }` e OAuth Authorization Code (Hosted UI) com callback na raiz do CloudFront e em `http://localhost:5173/`. Não habilita `USER_PASSWORD_AUTH`. A política de senha exige 12+ caracteres com os quatro tipos.
- **Authorizer** (`api.ts`): `jwtAudience = [clientId]`. Aceita o ID token (`aud`) e o access token (`client_id`). O `infra/README.md` recomenda enviar o access token.
- **CSP** (`front.ts`): o `connect-src` já libera `https://cognito-idp.us-east-1.amazonaws.com` e o domínio do Hosted UI.

**Proposta:** criar `web/src/auth/CognitoAuthAdapter.ts` com o fluxo **SRP** (`amazon-cognito-identity-js`, versão fixada). Assim a `LoginPage` existente e a infra ficam como estão, sem redirect. O adapter devolve o access token em `token` e `usuario = { nome: email, email }`, já que o Cognito só guarda o e-mail. Em `providers.tsx`, escolher o adapter por `VITE_USE_MOCK`. O usuário vem do `npm run usuarios -w infra`; a senha demo `demo123` do mock não passa na política. Observação: o `amazon-cognito-identity-js` guarda a sessão em `localStorage`, o que contraria o "token só em memória" do design do front. Para o MVP, aceitável (ou usar `MemoryStorage`, com o custo de perder a sessão no F5).

**Alternativa descartada:** Hosted UI + PKCE. Exigiria reescrever a `LoginPage`, tratar o `?code=` e trocar o código por tokens; é mais trabalho.

### B.4 CORS e deploy do front

- **CORS** (`api.ts`): origens CloudFront + `http://localhost:5173`, headers `authorization, content-type` e métodos GET/POST/PUT/DELETE. É compatível com o front (`Accept` é cabeçalho simples). O Vite precisa rodar na porta padrão 5173.
- **Pasta do build:** `front.ts` espera `path.join(__dirname, '../../../web/dist')`, ou seja, `<raiz>/web/dist`, que é o `outDir` padrão do Vite. Confere.
- **Fallback de SPA:** 403/404 viram `index.html`. As rotas do React Router (`/veiculos/101` etc.) funcionam.
- **CSP:** `script-src 'self'` e `style-src 'self'`. O build do Vite usa `<script type="module" src>` e um CSS externo, então é compatível. Ainda assim, convém conferir no navegador após o deploy (não verificado).

## C. Contrato infra × dados

| Item | `infra/lib/constructs/dados.ts` | `data/carga` / `data/seed` | Situação |
|------|---------------------------------|----------------------------|----------|
| Nome | `sigfrota-lavagem` (`nomeTabela()`) | `--tabela sigfrota-lavagem` (README da carga) | OK |
| Chaves | `PK` S, `SK` S | `PK` S, `SK` S (`garantirTabela`) | OK |
| GSI | nenhum | nenhum | OK |
| Billing | PAY_PER_REQUEST | PAY_PER_REQUEST | OK |
| Criptografia/PITR | KMS `aws/dynamodb` + PITR | padrão AWS (só se criar) | o CDK prevalece |
| Retenção | `DESTROY` | — | atenção: `destroy` apaga os dados; refazer a carga |

**Conflito de criação.** A tabela é criada pelo CDK (já implantada, segundo o `infra/README.md`). O script deve rodar **sem** `--criar-tabela` (o próprio README da carga diz isso). Se alguém já tiver criado a tabela pelo script antes do deploy, o `cdk deploy` falha com "already exists". Nesse caso, apagar a tabela manual e reimplantar (operação destrutiva; confirmar antes).

**Ajustes na carga:**
- `data/carga/README.md` usa o profile `hackathon` em todos os exemplos. O steering exige `hackaton` (`--perfil hackaton`).
- É preciso rodar `npm install --prefix data/carga`, porque a pasta não é workspace.
- **Permissão:** a role `WSParticipantRole` provavelmente cobre `BatchWriteItem/PutItem/DescribeTable` (não verificado).

**Formato dos itens (seed → front).** Conferido em `data/seed/gabarito/itens.json` e `data/seed/README.md`:

| Entidade | Seed / DynamoDB | Front (`web/src/api/types.ts`) |
|----------|-----------------|--------------------------------|
| Veículo | `idVeiculo`, `dsVeiculo`, `placa`, `marca`, `modelo`, `ano`, `kmAtual` | `idVeiculo`, `descricao`, `kmAtual` |
| Tipo | `idTipoLavagem`, `dsTipoLavagem` (+ `vlReferenciaMin/Max` no demo) | `idTipoLavagem`, `descricao` |
| Posto | `idPosto`, `nmPosto`, `cnpj` (demo) | `idPosto`, `nome` |
| Lavagem | `propriaUnidade: boolean`, `postoConveniado: boolean\|null`, campos ausentes como `null`, `dsTipoLavagem`, `idPessoaCadastrador` (número 9001–9004), `dtCadastro` | `propriaUnidade: 'S'\|'N'`, `postoConveniado?: 'S'\|'N'`, campos ausentes omitidos, sem `dsTipoLavagem`/cadastrador |
| Valor | reais com decimais (`60`, `44.55`) | reais (`number`) | OK, **não** são centavos |
| Datas | `YYYY-MM-DD` | `YYYY-MM-DD` | OK |
| IDs | números (PK/SK com `#id`) | números | OK |

**Decisão:** quem converte é a API, com um mapper item ↔ DTO em `services/api`. O DTO da API é exatamente o `types.ts` do front. Motivos:
- O `packages/dominio` (`LavagemInput`) já trabalha com `'S'|'N'` e campos opcionais, e o front inteiro (form, `camposCondicionais`, `montarPayload`, testes) também.
- A Lambda passa a reusar `validarLavagem` sobre o DTO recebido, sem conversão prévia.
- O README fixa booleanos no **dado** ("regra explícita no dado"), não no contrato HTTP, então o seed e o README ficam intactos.

**Mock do front × seed.** O `web/src/mocks/dados-sinteticos.ts` inventa a lavagem 3400 (interna, veículo 101), que no demo é outra lavagem, e põe 2 lavagens no 101. Não bloqueia. Desejável, como o README sugere: o mock passar a ler `data/seed/demo/itens.json` com o mesmo mapper.

## D. Back-end Lambda pendente

**Situação.** Só existe `infra/test/fixtures/handler.ts` (fixture). Não há `services/api/`, nem `infra/lib/stacks/api-stack.ts`, e a linha `SigfrotaApiStack` do `infra/bin/sigfrota.ts` está comentada.

**Empacotamento** (`infra/lib/constructs/funcao-lambda.ts`):
- `NodejsFunction` (esbuild local, sem Docker), Node 24, ARM64.
- `projectRoot` na raiz do monorepo e `depsLockFilePath` no `package-lock.json` da raiz.
- `entry` é o caminho absoluto do `.ts`.
- Injeta `TABELA_NOME` quando há `acessoTabela`.
- O esbuild resolve `@sigfrota/dominio`, que exporta `./src/index.ts`, pelo link do workspace.
- O runtime Node 24 já traz o SDK v3: o `NodejsFunction` deixa `@aws-sdk/*` como external por padrão. Declarar as dependências em `services/api/package.json` para tipos e testes.

**Estrutura sugerida:**

```
services/api/
  package.json        # @sigfrota/api; deps: @sigfrota/dominio, @aws-sdk/client-dynamodb, @aws-sdk/lib-dynamodb (3.1147.0, mesma do infra/carga)
  src/http.ts         # parse de path/body, respostas JSON, erro padronizado, sub/claims
  src/mapper.ts       # item DynamoDB <-> DTO (booleans <-> 'S'/'N', nomes, null <-> omitido)
  src/repositorio.ts  # DocumentClient; Query/GetItem/PutItem/UpdateItem/DeleteItem com parâmetros
  src/servico.ts      # validarLavagem (dominio) + R05–R07 + R01 + R08 + limites
  src/handlers/catalogo.ts
  src/handlers/lavagens-leitura.ts
  src/handlers/lavagens-escrita.ts
  test/*.test.ts      # vitest, repositório com fake; casos do gabarito
infra/lib/stacks/api-stack.ts   # 3 FuncaoLambda + registrarRota (exemplo pronto no infra/README.md)
infra/bin/sigfrota.ts           # descomentar SigfrotaApiStack
```

**Handlers e rotas.** São 3 Lambdas, uma por perfil de permissão:

| Lambda | Rota | Entrada | Saída | Regras | DynamoDB | IAM (`modo: 'acoes'`) |
|--------|------|---------|-------|--------|----------|-----------------------|
| catalogo | `GET /veiculos/{idVeiculo}` | path | `200 Veiculo` / `404` | R16 | `GetItem CATALOGO / VEICULO#id` | `GetItem`, `Query` |
| catalogo | `GET /tipos-lavagem` | — | `200 TipoLavagem[]` | R05 (combo) | `Query PK=CATALOGO, begins_with(SK,'TIPO#')` | idem |
| catalogo | `GET /postos` | — | `200 Posto[]` | R13 (combo) | `Query PK=CATALOGO, begins_with(SK,'POSTO#')` | idem |
| lavagens-leitura | `GET /veiculos/{idVeiculo}/lavagens` | path | `200 Lavagem[]`, ordenado por `dtLavagem` e depois `idLavagem` | R19, R20 | `Query PK=VEICULO#id, begins_with(SK,'LAVAGEM#')` (paginar `LastEvaluatedKey`) | `Query`, `GetItem` |
| lavagens-leitura | `GET /veiculos/{idVeiculo}/lavagens/{idLavagem}` | path | `200 Lavagem` / `404` | R21 | `GetItem` | idem |
| lavagens-escrita | `POST /veiculos/{idVeiculo}/lavagens` | `Lavagem` sem id | `201 Lavagem` | R01–R15, R17 | `GetItem` veículo/tipo/posto (R05–R07) → `UpdateItem CONTADOR ADD ultimoId :1 RETURN UPDATED_NEW` → `PutItem` com `attribute_not_exists(PK)` | `GetItem`, `UpdateItem`, `PutItem`, `DeleteItem` |
| lavagens-escrita | `PUT /veiculos/{idVeiculo}/lavagens/{idLavagem}` | `Lavagem` | `200 Lavagem` / `404` | R02–R15, R17 | `GetItem` (preservar `dtCadastro`/cadastrador) → `PutItem` com `attribute_exists(PK)` | idem |
| lavagens-escrita | `DELETE /veiculos/{idVeiculo}/lavagens/{idLavagem}` | path | `204` / `404` | R17 | `DeleteItem` com `attribute_exists(PK)` | idem |

**Regras do serviço (escrita):**
- Rodar `validarLavagem` (do dominio). Com erros, responder `400 { mensagem, erros: ErrosLavagem }`.
- **R05–R07:** tipo, veículo e posto (quando conveniado) existem no catálogo. Se não, `400` (ou `404` para o veículo da rota).
- **Sanitização:** número inteiro em `idVeiculo/idLavagem` do path. Ignorar `idLavagem`, `idPessoaCadastrador` e `dtCadastro` vindos do corpo. `idVeiculo` do corpo, se vier, deve ser igual ao do path. `trim` nos textos. Limite de tamanho em `dsPosto` (255).
- **Limites do README:** `vlLavagem ≤ 999,99` com 2 casas e `kmLavagem ≤ 999999` inteiro. O ideal é colocá-los no dominio (ver E).
- **Ramo:** interna grava `vlLavagem/idPosto/dsPosto/cnpjPosto = null` e `postoConveniado = null`, coerente com o seed (R10).
- **Desnormalização:** gravar `dsTipoLavagem` vindo do catálogo (R20, README).
- **R08:** `idPessoaCadastrador = event.requestContext.authorizer.jwt.claims.sub` (string UUID; o seed usa números 9001–9004). `dtCadastro` = data de hoje (`YYYY-MM-DD`, fuso America/Sao_Paulo). O cadastrador nunca vem do corpo.
- **Contador:** começa do `ultimoId` carregado (3649 no demo, 3399 no gabarito). O próximo ID do demo será 3650.
- **Logs:** sem token, e-mail, CNPJ ou corpo (`infra/README.md`, LGPD).
- **Grupos:** o MVP não restringe por grupo. Se quiser, `cognito:groups` chega como string `[a b]` (`infra/README.md`).

**IAM.** `FuncaoLambda` com `modo: 'acoes'` concede só as ações listadas, no ARN da tabela. As leituras não recebem permissão de escrita. Não há restrição por leading key; fica como produção.

**cdk-nag.** As rotas com authorizer e as roles exclusivas já seguem o padrão. Rodar `npm run synth -w infra` para confirmar (exige credenciais `hackaton`).

## E. Domínio compartilhado (`packages/dominio`)

**Cobertura atual:** `validarLavagem` implementa R02 (sem `idVeiculo`), R03, R04, R09–R15 (`src/index.ts`). Há 21 testes do gabarito passando. As mensagens em português são usadas pelo front.

**O que falta para a Lambda:**
- Limites `NUMBER(5,2)` e `NUMBER(6,0)` (README, "Limites das colunas").
- Dígito verificador do CNPJ (extra do README; o gabarito exige só presença). Cuidado: o gabarito tem CNPJ com DV inválido, então o teste de "dado legado" precisa refletir isso.
- Tipo dos campos em runtime: a API recebe JSON livre, e `validarLavagem` assume `number`/`string`. É preciso uma checagem de tipo antes (no `http.ts` ou no dominio).
- R05–R08 e R01 ficam no serviço da API, por dependerem de dados e do token.

**Consumo:**
- **Vite:** OK (build passou).
- **esbuild/NodejsFunction:** OK em princípio. Exporta TS cru, `type: module`, sem dependências. Ainda não foi testado empacotando uma Lambda real.
- **Node puro:** não serve (exige transpilar), mas nada no MVP precisa disso.

**Pendência de manifesto:** o web não declara a dependência (ver A).

## F. Lista priorizada

Esforço: P = até 1 h, M = 1 a 3 h, G = mais de 3 h.

### F.1 Bloqueantes

| # | Ajuste | Dono | Arquivos | Esforço |
|---|--------|------|----------|---------|
| 1 | Criar `services/api` (workspace) com mapper, repositório, serviço e os 3 handlers da tabela D; testes com fake | backend | `services/api/**`, `package-lock.json` | G |
| 2 | Stack da API: `infra/lib/stacks/api-stack.ts` com 3 `FuncaoLambda` (IAM mínimo) + 8 `registrarRota`; descomentar no bin | infra/backend | `infra/lib/stacks/api-stack.ts`, `infra/bin/sigfrota.ts` | M |
| 3 | Rotas do front com idVeiculo: assinaturas de `obterLavagem/atualizarLavagem/excluirLavagem(idVeiculo, id)` e `criarLavagem` → `POST /veiculos/{id}/lavagens` | front | `web/src/api/{LavagemClient,HttpLavagemClient,MockLavagemClient}.ts`, `features/lavagem/{LavagemFormPage,useLavagemMutations}.ts(x)`, testes | M |
| 4 | Adapter Cognito SRP, escolhido por `VITE_USE_MOCK` em `providers.tsx` | front | `web/src/auth/CognitoAuthAdapter.ts`, `web/src/app/providers.tsx`, `web/package.json` (`amazon-cognito-identity-js`, versão fixa) | M |
| 5 | Variáveis: front usa `VITE_API_URL`, `VITE_USER_POOL_ID`, `VITE_USER_POOL_CLIENT_ID`, `VITE_REGIAO`; `gerar-env-web.mjs` grava `VITE_USE_MOCK=false` | front + infra | `web/src/vite-env.d.ts`, `web/src/api/clientFactory.ts`, `web/.env.example`, `infra/scripts/gerar-env-web.mjs` | P |
| 6 | Carga do demo na tabela do CDK (sem `--criar-tabela`, `--perfil hackaton`) e correção do README da carga | dados | `data/carga/README.md` | P |
| 7 | Usuários de teste no Cognito (`npm run usuarios -w infra`) | infra | — | P |

### F.2 Necessários para a demo

| # | Ajuste | Dono | Arquivos | Esforço |
|---|--------|------|----------|---------|
| 8 | Alinhar a versão do Vitest no web (testes verdes) e declarar `@sigfrota/dominio` no web | front | `web/package.json`, `package-lock.json` | P |
| 9 | Mapear erros `400 { erros }` da API para os campos do form; hoje só aparece um toast genérico | front | `HttpLavagemClient.ts`, `LavagemFormPage.tsx` | M |
| 10 | Limites de valor e km (+ checagem de tipo) no dominio, com testes | domínio | `packages/dominio/src/index.ts`, `index.test.ts` | P |
| 11 | Fluxo de deploy documentado e ensaiado: `deploy` → `env-web` → `build -w web` → `deploy`; conferir a CSP e o login no CloudFront | infra | `infra/README.md` | P |
| 12 | Testes da API com os casos do gabarito (R01, R05–R08, R17–R20, R23) contra `data/seed/gabarito` | backend | `services/api/test/**` | M |
| 13 | `.gitattributes` para o seed (LF) | dados | `.gitattributes` | P |

### F.3 Desejáveis

- Front lendo `/config.json` no boot, para build único (front, M).
- Mock do front alimentado por `data/seed/demo/itens.json` via o mesmo mapper (front, P).
- Tela de seleção de veículo (`GET /veiculos` = `Query CATALOGO begins_with VEICULO#`). Hoje a raiz redireciona fixo para o 101 (`router.tsx`) (front + backend, M).
- DV do CNPJ no dominio (domínio, P).
- Campo `origem` (`MANUAL`/`RECIBO_IA`) já no POST, para o spec do recibo (backend, P).
- Remover os `*.tsbuildinfo` do git (front, P).
- Testes de synth da infra com `aws-cdk-lib/assertions` (infra, M).
- `.kiro/specs/lavagem-veiculo/*K.md` descreve Java/Thymeleaf com usuário mock e contradiz o README. Marcar como superado para não confundir a banca e a equipe (P).

---

## Contrato proposto

**Base:** `VITE_API_URL` (output `ApiUrl`). Todas as rotas exigem `Authorization: Bearer <access token Cognito>`. Corpo e respostas em JSON UTF-8.

| Método | Caminho | Corpo | Sucesso | Erros | Rxx |
|--------|---------|-------|---------|-------|-----|
| GET | `/veiculos/{idVeiculo}` | — | `200 Veiculo` | 404 | R16 |
| GET | `/tipos-lavagem` | — | `200 TipoLavagem[]` | — | R05 |
| GET | `/postos` | — | `200 Posto[]` (conveniados) | — | R13 |
| GET | `/veiculos/{idVeiculo}/lavagens` | — | `200 Lavagem[]`, ordenado por `dtLavagem` e `idLavagem` | 404 veículo | R19, R20 |
| GET | `/veiculos/{idVeiculo}/lavagens/{idLavagem}` | — | `200 Lavagem` | 404 | R21 |
| POST | `/veiculos/{idVeiculo}/lavagens` | `Lavagem` (sem `idLavagem`) | `201 Lavagem` (com `idLavagem`) | 400, 404 | R01–R15, R17, R08 |
| PUT | `/veiculos/{idVeiculo}/lavagens/{idLavagem}` | `Lavagem` | `200 Lavagem` | 400, 404 | R02–R15, R17 |
| DELETE | `/veiculos/{idVeiculo}/lavagens/{idLavagem}` | — | `204` | 404 | R17 |

401 vem do API Gateway, e o front já trata com logout e redirecionamento para `/login`. Formato de erro:

```json
{ "mensagem": "Lavagem inválida", "erros": { "vlLavagem": "Informe o valor da lavagem" } }
```

`erros` usa as mesmas chaves e mensagens de `ErrosLavagem`/`MENSAGENS` do `@sigfrota/dominio`. Em 404 vem só `mensagem`.

**DTOs** (iguais a `web/src/api/types.ts`, que passa a ser a fonte do contrato HTTP):

```ts
type SimNao = 'S' | 'N';
interface Veiculo     { idVeiculo: number; descricao: string; kmAtual: number }       // descricao = dsVeiculo
interface TipoLavagem { idTipoLavagem: number; descricao: string }                     // descricao = dsTipoLavagem
interface Posto       { idPosto: number; nome: string }                                // nome = nmPosto
interface Lavagem {
  idLavagem?: number; idVeiculo: number; idTipoLavagem: number;
  dtLavagem: string;            // YYYY-MM-DD
  kmLavagem: number;            // inteiro 1..999999
  propriaUnidade: SimNao;       // item: true <-> 'S'
  vlLavagem?: number;           // reais, 2 casas, 0 < v <= 999.99
  postoConveniado?: SimNao;     // item: true/false/null <-> 'S'/'N'/omitido
  idPosto?: number; dsPosto?: string; cnpjPosto?: string;  // item: null <-> omitido
}
```

Na resposta, o back pode incluir `dsTipoLavagem` em `Lavagem` (opcional; o front hoje resolve pelo mapa de tipos). `idPessoaCadastrador` e `dtCadastro` não saem na API.

**Modelo DynamoDB:** mantém o README e o seed sem mudança. A tabela `sigfrota-lavagem` vem do CDK, com:
- `CATALOGO / VEICULO#id | TIPO#id | POSTO#id`
- `VEICULO#id / LAVAGEM#id`
- `CONTADOR / LAVAGEM` (`ultimoId`)

Booleanos `propriaUnidade`/`postoConveniado` e `null` nos campos não aplicáveis. `dsTipoLavagem` é desnormalizado na lavagem. `idPessoaCadastrador` = `sub` do token nas novas lavagens (string; números 9001–9004 nas lavagens do seed). `dtCadastro` = data da gravação.

**Quem se adapta e por quê:**
- **Front:** só as rotas e os nomes das variáveis. É o menor esforço e mantém a coerência com a PK do README.
- **API:** faz o mapeamento de nomes e tipos, o que mantém o dominio, o front e o seed intactos.
- **Infra e dados:** já estão conformes, salvo o profile no README da carga.

## Plano de ação MVP

1. Rodar `aws sts get-caller-identity --profile hackaton` e confirmar que a stack `SigfrotaBase` está implantada.
2. **Dados:** `npm install --prefix data/carga`, depois `node data/carga/carregar-dynamodb.mjs --tabela sigfrota-lavagem --perfil hackaton --regiao us-east-1 --dry-run`. Conferir 281 itens e então carregar de fato.
3. **Infra:** `npm run usuarios -w infra` (atendente e gestor).
4. **Back-end (itens 1, 2, 10, 12):**
   - criar `services/api` com o mapper e os 3 handlers, e testes com Vitest 5;
   - criar `infra/lib/stacks/api-stack.ts` e descomentar no bin;
   - `npm run synth -w infra`, depois `npm run deploy -w infra`;
   - validar com `curl` + token (`GET /veiculos/101/lavagens`).
5. **Front (itens 3, 4, 5, 8):**
   - rotas com idVeiculo, adapter Cognito, variáveis alinhadas e Vitest alinhado;
   - `npx vitest run` e `npm run build` em `web/`.
6. **Integração local:** `npm run env-web -w infra`, depois `npm run dev`. Login, veículo 101, incluir lavagem externa, ver o toast e a lista com a nova linha (ID 3650). Depois editar e excluir.
7. **Publicação:** `npm run build -w web`, depois `npm run deploy -w infra`. Repetir o roteiro na `FrontUrl` e conferir a CSP no console do navegador.
8. **Polimento para a demo:** itens 9, 11 e 13, e depois os desejáveis conforme o tempo.
