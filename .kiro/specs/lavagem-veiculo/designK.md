# Design — Módulo de Lavagem de Veículo (SigFrota Gerencial)

## Visão geral

Este design descreve a reimplementação em **Node.js + React + Tailwind** da fatia
de Lavagem do SIG Frota, hoje em Oracle APEX / PL/SQL. O objetivo é preservar
fielmente as regras de negócio (R01–R23) extraídas do gabarito, concentrando as
regras condicionais — hoje espalhadas entre validações PL/SQL e dynamic actions
do APEX — em uma camada de serviço coesa e testável no **backend Node**, expondo
uma API REST consumida por uma **tela React acessível** estilizada com Tailwind.

Requisitos de origem: ver `requirementsK.md`. Regras de origem: ver
`docs/lavagem-gabarito-regras.md`. Código legado de referência: ver
`docs/lavagem-apex-trecho-ilustrativo.md` e `docs/lavagem-sintetico.sql`.

> **Stack:** a tecnologia escolhida é a disponível no ambiente —
> **Node.js (API) + React + Tailwind (tela)** — em substituição a Java/Spring.
> As regras de negócio ficam no backend (não no front) para garantir integridade
> e testabilidade.

## Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│  Front-end  React + Tailwind                                  │
│   Tela de Veículo: identificação + painel de lavagens + form  │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP (fetch/axios) · JSON
┌───────────────────────────▼─────────────────────────────────┐
│  API REST  Express (Node.js)                                  │
│   routes: GET /veiculos/:id/lavagens  POST /veiculos/:id/...  │
└───────────────────────────┬─────────────────────────────────┘
                            │ chama
┌───────────────────────────▼─────────────────────────────────┐
│  Service  lavagemService  — REGRAS DE NEGÓCIO (R01–R18)        │
│   validação condicional coesa + orquestração do INSERT        │
└───────────────────────────┬─────────────────────────────────┘
                            │ repositório
┌───────────────────────────▼─────────────────────────────────┐
│  Repository / Data Access                                     │
│   lavagemRepo, tipoLavagemRepo, veiculoRepo, postoRepo        │
└───────────────────────────┬─────────────────────────────────┘
                            │ AWS SDK (DocumentClient)
┌───────────────────────────▼─────────────────────────────────┐
│  Amazon DynamoDB — tabela única PK/SK                         │
│   PAY_PER_REQUEST, KMS, PITR (ver spec infra-base)            │
└─────────────────────────────────────────────────────────────┘
```

> **Nota de alinhamento:** a persistência oficial do projeto é o **Amazon
> DynamoDB** (tabela única PK/SK), provisionado pela spec `infra-base`. As regras
> de negócio (R01–R23) permanecem no backend Node; o repositório troca o acesso
> SQL por operações DynamoDB. O `lavagem-sintetico.sql` continua sendo a **fonte
> da estrutura e dos dados fictícios**, mapeada para itens PK/SK na carga.

### Decisões técnicas

| Decisão | Escolha | Justificativa |
|---|---|---|
| Runtime/linguagem | Node.js 20 LTS + JavaScript/TypeScript | Tecnologia disponível no ambiente. |
| API | Express | Minimalista, suficiente para 2 rotas; fácil de testar. |
| Front-end | React 18 + Vite | SPA leve; Vite para dev/build rápidos. |
| Estilo | Tailwind CSS | Utilitário; facilita foco/contraste acessível. |
| Validação | Zod (ou Joi) no backend | Esquema de entrada + regras estruturais; condicionais no service. |
| Persistência | Amazon DynamoDB (tabela única PK/SK) | Arquitetura oficial da spec `infra-base`; on-demand, KMS, PITR. |
| Execução do backend | AWS Lambda (Node) atrás de API Gateway HTTP API | Serverless; a lógica Express/handlers roda em Lambda. |
| Testes | Vitest/Jest (service) + Supertest (API) + RTL (React) | Cobertura das regras do gabarito. |
| Km atual | Mock via item de veículo (`KM_ATUAL`) | R16 — módulo de Atendimento fora de escopo. |
| Autenticação | Amazon Cognito (grupos atendente/gestor) | Definida na spec `infra-base`; JWT no API Gateway. |

## Arquitetura AWS (Requisito 10 — critério C2)

A solução é implantada na AWS pela spec `infra-base` (AWS CDK + cdk-nag,
`us-east-1`), com serviços gerenciados serverless. O serviço de IA essencial é o
**Amazon Bedrock**. Para desenvolvimento local, o backend Node pode rodar com
DynamoDB Local, mantendo o mesmo repositório.

### Papel do Bedrock (extração + geração)

```
docs/lavagem-sintetico.sql ─┐
docs/*apex-trecho*.md       ─┼─▶  Amazon Bedrock (LLM)  ─▶  regras em linguagem
docs/*gabarito*.md          ─┘    (prompt com os SQL)       natural + rastreab.
                                                            (R01–R23 → origem)
                                          │
                                          ▼
                              spec (requirements/design/tasks)
                                          │
                                          ▼
                              código Node/React + testes
```

- Entrada: os arquivos SQL/PL/SQL do módulo (DDL + páginas APEX).
- Bedrock extrai as regras em linguagem natural **com rastreabilidade** (cada
  regra aponta a origem no PL/SQL) e apoia a geração da spec e do código.
- Critério anti-distorção: o output do Bedrock é conferido contra o gabarito.
- Acesso ao Bedrock pela AWS CLI/SDK usa o profile `sigfrota` (ver
  `.kiro/steering/aws-credenciaisK.md`).

### Desenho na AWS (serviços gerenciados — spec `infra-base`)

```
Navegador ──HTTPS──▶ CloudFront (+ S3 privado via OAC: SPA React)
     │
     ├─ login OIDC ─▶ Amazon Cognito (grupos atendente/gestor)
     │
     └─ REST + JWT ─▶ API Gateway HTTP API (authorizer JWT)
                           │
                           ▼
                      AWS Lambda (Node 22, ARM64, role própria)
                        ├─ api-lavagens ──▶ Amazon DynamoDB (tabela única PK/SK)
                        └─ ia-extração/recibo ─▶ Step Functions ─▶ Amazon Bedrock
                                                                 └▶ S3 (uploads)
   IaC: AWS CDK + cdk-nag        Observabilidade: CloudWatch Logs + X-Ray
   Config/contrato: SSM          Criptografia em repouso: KMS
```

- O backend Node roda em **Lambda** atrás da **API Gateway HTTP API**; a lógica
  de rotas/service (regras R01–R23) é empacotada como handler.
- Front React servido via **S3 + CloudFront** (OAC, HTTPS).
- Persistência em **DynamoDB** (tabela única PK/SK), sem RDS no MVP.
- IaC em **AWS CDK** com **cdk-nag**, `us-east-1` (ver `infra-base`).
- Diagrama completo e legenda: `docs/arquitetura-aws.mmd`.

> Alinhado à spec `infra-base`. Para desenvolvimento local, usar DynamoDB Local
> com o mesmo repositório; o desenho acima é o alvo de implantação (C2, C6).

## Segurança (Requisito 11 — critério C4)

| Aspecto | MVP (local) | AWS |
|---|---|---|
| Autenticação | usuário mock | Amazon Cognito (grupos atendente/gestor) |
| Autorização | perfil único | JWT no API Gateway + menor privilégio IAM por Lambda |
| Entrada maliciosa | validação de schema | idem + authorizer JWT antes da Lambda |
| Dados sensíveis | sem PII em log/API | idem + mascaramento |
| Criptografia | HTTP local | HTTPS (TLS); repouso com KMS/S3 SSE/DynamoDB KMS |

- **Validação/sanitização:** schema Zod nos payloads + regras no service. O
  acesso a DynamoDB é via SDK (DocumentClient) com parâmetros — sem construção
  dinâmica de expressões a partir de entrada do usuário.
- **Menor privilégio:** roles/policies IAM concedem apenas o necessário (ex.:
  `bedrock:InvokeModel` no modelo usado, acesso ao bucket específico).
- **Exposição:** `cnpjPosto` e `idPessoaCadastrador` nunca em log ou resposta de
  erro em claro (reforça a seção de Privacidade).
- **Dependências:** usar versões fixas (lockfile) e pacotes mantidos; evitar
  typosquatting; rodar `npm audit`.
- **Credenciais AWS:** acesso pelo profile `sigfrota`; segredos nunca em código,
  log ou commit; `~/.aws/*` e `.env` fora do repositório (`.gitignore`). Ver
  `.kiro/steering/aws-credenciaisK.md`.
- **Trânsito/repouso:** HTTPS fim a fim; criptografia em repouso nos dados reais.

## Modelo de dados (DynamoDB — tabela única PK/SK)

A estrutura e os dados fictícios de `docs/lavagem-sintetico.sql` são mapeados
para itens de uma **tabela única DynamoDB** (padrão PK/SK da spec `infra-base`),
preservando os atributos e as regras.

### Desenho de chaves

| Entidade | PK | SK | Atributos principais |
|---|---|---|---|
| Lavagem | `VEICULO#<idVeiculo>` | `LAVAGEM#<idLavagem>` | tipo, data, km, valor, posto (id/ds/cnpj), cadastrador, dataCadastro |
| Veículo (mock) | `VEICULO#<idVeiculo>` | `META` | descrição, `kmAtual` (R16) |
| Tipo de lavagem | `TIPO#<idTipo>` | `META` | descrição |
| Posto (mock) | `POSTO#<idPosto>` | `META` | nome |
| Contador de PK | `SEQ#LAVAGEM` | `META` | próximo `idLavagem` (inicia em 3397) |

- Listar lavagens do veículo (R19/R20): `Query` por `PK = VEICULO#<id>` e
  `SK begins_with "LAVAGEM#"`, ordenado por data no serviço.
- PK da lavagem (R01): obtida por incremento atômico (`UpdateItem` com
  `ADD`) no item contador `SEQ#LAVAGEM`, preservando o comportamento da sequence
  original (`FR_LAVAGEM_SEQ`, início 3397).

### Atributos da Lavagem

| Atributo (API) | Origem (`FR_LAVAGEM`) | Obrigatório | Regra |
|---|---|---|---|
| `idLavagem` | `ID_LAVAGEM` | sim (gerado) | R01 — contador atômico |
| `idTipoLavagem` | `ID_TIPO_LAVAGEM` | sim | R02, R05 |
| `dataLavagem` | `DT_LAVAGEM` | sim | R02, R15 |
| `kmLavagem` | `KM_LAVAGEM` | sim | R02, R04 (> 0) |
| `valorLavagem` | `VL_LAVAGEM` | condicional | R03 (> 0 se informado), R11 |
| `idVeiculo` | `ID_VEICULO` | sim | R02, R06 |
| `dsPosto` | `DS_POSTO` | condicional | R14 |
| `cnpjPosto` | `CNPJ_POSTO` | condicional | R14 |
| `idPosto` | `ID_POSTO` | condicional | R07, R13 |
| `idPessoaCadastrador` | `ID_PESSOA_CADASTRADOR` | auto | R08 (usuário do token/mock) |
| `dataCadastro` | `DT_CADASTRO` | auto | R08 (data atual) |

As FKs do modelo relacional (R05/R06/R07) viram **verificações de existência**
no serviço (`GetItem` do tipo/veículo/posto) antes de gravar.

> Nota: `propriaUnidade` ("Na Unidade?") e `postoConveniado` ("Posto
> Conveniado?") NÃO existem na tabela — são indicadores de entrada (do payload)
> que dirigem a lógica condicional. No modelo persistido, "própria unidade" se
> traduz em ausência de valor/posto; "conveniado" em `idPosto` preenchido vs.
> `dsPosto`+`cnpjPosto`.

## API REST

### `GET /veiculos/:id/lavagens` (R19, R20, R21)

Retorna as lavagens do veículo, ordenadas por `DT_LAVAGEM`.

Resposta `200 OK` (array de):
```json
{
  "idLavagem": 3397,
  "tipoLavagem": "Completa",
  "dataLavagem": "01/09/2026",
  "kmLavagem": 45000,
  "valorLavagem": 60.00
}
```

### `POST /veiculos/:id/lavagens` (R01, R08, R17, R18, R23)

Inclui uma lavagem. Corpo (payload):
```json
{
  "idTipoLavagem": 2,
  "dataLavagem": "2026-09-10",
  "kmLavagem": 46000,
  "propriaUnidade": false,
  "postoConveniado": true,
  "idPosto": 10,
  "dsPosto": null,
  "cnpjPosto": null,
  "valorLavagem": 55.00
}
```
- `201 Created` → lavagem persistida; corpo retorna a lista atualizada do veículo
  (para a tela re-renderizar — R23) + mensagem de sucesso.
- `400 Bad Request` → violação de regra, com lista de erros `{campo, mensagem, regra}`.

### `GET /veiculos/:id` (R16)

Retorna identificação do veículo + `kmAtual` (mock).

## Regras de negócio no service (coração da migração)

O `lavagemService.incluir(idVeiculo, payload)` aplica, em ordem:

1. **Estruturais** (R02, R04, R03, R15, R05, R06, R07): obrigatórios presentes;
   `km > 0`; `valor > 0` se informado; data válida; tipo, veículo e (se houver)
   posto existem.
2. **Condicionais — local** (R09, R10, R11):
   - `propriaUnidade === true` → ignora/zera valor, idPosto, dsPosto, cnpjPosto.
   - `propriaUnidade === false` → `valorLavagem` obrigatório e `> 0`.
3. **Condicionais — posto** (R12, R13, R14), apenas se externa:
   - `postoConveniado === true` → `idPosto` obrigatório; dsPosto/cnpjPosto nulos.
   - `postoConveniado === false` → `dsPosto` e `cnpjPosto` obrigatórios; idPosto nulo.
4. **Persistência** (R01, R08, R17): gera PK (incremento atômico no contador),
   preenche `dataCadastro` (atual) e `idPessoaCadastrador` (usuário do token/mock),
   grava o item com `PutItem` no DynamoDB.
5. **Retorno** (R18, R23): devolve a lista atualizada + mensagem de sucesso.

Mapa de rastreabilidade regra → componente:

| Regra | Onde é implementada |
|---|---|
| R01, R08, R17 | `lavagemService.incluir` + geração de PK no repositório |
| R02 | schema de validação (Zod) do payload |
| R03, R04 | schema (positivo) + checagem no service |
| R05, R06, R07 | lookups nos repositórios no service |
| R09–R14 | `lavagemService` (validação condicional coesa) |
| R15 | validação de data no schema/service |
| R16 | rota `GET /veiculos/:id` lê `kmAtual` do mock |
| R18, R23 | retorno do POST + re-query no `GET` |
| R19, R20, R21 | `lavagemRepo.listarPorVeiculo(id)` ordenado por data + mapeamento |
| R22 | botão "Incluir Lavagem" na tela React abre o form |

## Tela acessível React + Tailwind (Requisito 7 — eMAG/WCAG, IN 29/2023)

- Componentes React com HTML semântico: `<main>`, `<h1>`/`<h2>`, `<table>` com
  `<caption>` e `<th scope>` para o painel de lavagens.
- Cada campo com `<label htmlFor>` associado; agrupamento com `<fieldset>` e
  `<legend>` para "Na Unidade?" e "Posto Conveniado?".
- Mensagens de sucesso/erro em região `aria-live="polite"`; erros de campo
  referenciados por `aria-describedby`.
- Navegação por teclado, foco visível (classes Tailwind `focus:` com `ring`),
  contraste adequado (paleta Tailwind com contraste ≥ 4.5:1).
- Campos condicionais exibidos/ocultados conforme R10/R13/R14, mantendo rótulos.
- Após o POST, atualizar o estado da lista para exibir a nova lavagem (R23).

> A conformidade total depende de teste manual com tecnologia assistiva e revisão
> especializada; o design cobre as boas práticas automatizáveis.

## Privacidade desde o projeto (Requisito 8 — OT 17 / LGPD)

- Apenas dados fictícios (itens DynamoDB carregados a partir de
  `lavagem-sintetico.sql`).
- Minimização: persistir só os atributos da lavagem.
- Logs sem PII: não registrar `cnpjPosto` nem `idPessoaCadastrador` em claro.
- Cadastrador vem do contexto (mock), nunca do corpo da requisição.

## Estratégia de testes

Testes de `lavagemService` cobrindo cada ramo do gabarito (seção 5 de
`lavagem-gabarito-regras.md`):

| Cenário | Esperado | Regra |
|---|---|---|
| Externa, conveniado, posto=10, valor=60, km=45000 | aceito | R11,R13 |
| Externa, não conveniado, DS+CNPJ, valor=35, km=88800 | aceito | R11,R14 |
| Na unidade, sem valor/posto, km=12050 | aceito | R10 |
| km=0 | rejeitado | R04 |
| externa, valor=0 | rejeitado | R03/R11 |
| externa, valor nulo | rejeitado | R11 |
| conveniado sem posto | rejeitado | R13 |
| não conveniado sem CNPJ | rejeitado | R14 |
| data "31/02/2026" | rejeitado | R15 |
| listar veículo 101 | só lavagens do 101, por data | R19/R20 |
| incluir no 101 e recarregar | nova lavagem no painel | R23 |

- Testes de service: Vitest ou Jest.
- Testes de API: Supertest sobre o app Express (GET/POST, sucesso e erro).
- Testes de componente: React Testing Library (render do painel, submit do form,
  exibição de erros/sucesso acessíveis).

## Estrutura de pastas (proposta)

```
backend/
  src/
    db/          client DynamoDB (DocumentClient), seed (dados fictícios)
    repositories/ lavagemRepo, tipoLavagemRepo, veiculoRepo, postoRepo
    services/    lavagemService.js   (regras R01–R18)
    schemas/     lavagemSchema.js    (Zod — estruturais R02/R03/R04/R15)
    routes/      lavagens.routes.js, veiculos.routes.js
    handler.js   (adaptador Lambda/API Gateway)
    app.js       (Express — dev local)
  test/          lavagemService.test, lavagens.api.test
  package.json
frontend/
  src/
    api/         client.js (fetch)
    components/  PainelLavagens.jsx, FormLavagem.jsx, Mensagem.jsx
    pages/       VeiculoPage.jsx
    App.jsx, main.jsx, index.css (Tailwind)
  tailwind.config.js, vite.config.js
  test/          componentes (RTL)
  package.json
```
