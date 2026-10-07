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
                            │ SQL
┌───────────────────────────▼─────────────────────────────────┐
│  Banco  SQLite em memória (MVP) — DDL de lavagem-sintetico.sql │
└─────────────────────────────────────────────────────────────┘
```

### Decisões técnicas

| Decisão | Escolha | Justificativa |
|---|---|---|
| Runtime/linguagem | Node.js 20 LTS + JavaScript/TypeScript | Tecnologia disponível no ambiente. |
| API | Express | Minimalista, suficiente para 2 rotas; fácil de testar. |
| Front-end | React 18 + Vite | SPA leve; Vite para dev/build rápidos. |
| Estilo | Tailwind CSS | Utilitário; facilita foco/contraste acessível. |
| Validação | Zod (ou Joi) no backend | Esquema de entrada + regras estruturais; condicionais no service. |
| Persistência | SQLite em memória (better-sqlite3) | MVP autocontido; DDL fiel ao `lavagem-sintetico.sql`. |
| Testes | Vitest/Jest (service) + Supertest (API) + RTL (React) | Cobertura das regras do gabarito. |
| Km atual | Mock via `FR_VEICULO_MOCK.KM_ATUAL` | R16 — módulo de Atendimento fora de escopo. |
| Autenticação | Usuário fixo/mock | Cognito não exigido no MVP (caso de uso, seção 9). |

## Arquitetura AWS (Requisito 10 — critério C2)

O MVP roda localmente (Node + SQLite), mas a solução se insere num desenho AWS
com serviços gerenciados. O serviço essencial é o **Amazon Bedrock**.

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

### Caminho de produção (serviços gerenciados)

```
Navegador ──HTTPS──▶ API Gateway ──▶ Lambda (Node) / ECS Fargate
                                        │
                                        ├─▶ Amazon Bedrock (extração/geração)
                                        ├─▶ RDS/Aurora (FR_LAVAGEM real)
                                        └─▶ S3 (artefatos SQL de entrada)
   Cognito (autenticação) ─────────────┘
   IaC: SAM / CDK / CloudFormation      Observabilidade: CloudWatch
```

- O backend Node encaixa bem em **Lambda** (serverless) ou Fargate.
- Front React servido via S3 + CloudFront.
- Desacoplamento já refletido nas camadas routes → service → repository.
- IaC (SAM/CDK/CloudFormation) descreve os componentes de nuvem, se houver tempo.

> No MVP, S3/Lambda/API Gateway são dispensáveis (Node roda local); o desenho
> acima é o caminho para produção e serve ao pitch (C2, C6).

## Segurança (Requisito 11 — critério C4)

| Aspecto | MVP | Produção |
|---|---|---|
| Autenticação | usuário fixo/mock | Amazon Cognito |
| Autorização | perfil único (gestor) | IAM + escopos por perfil, menor privilégio |
| Injeção | SQL parametrizado (prepared statements) | idem + validação de entrada |
| Dados sensíveis | sem PII em log/API | idem + mascaramento |
| Criptografia | HTTP local | HTTPS (TLS); repouso com KMS/S3 SSE/RDS encryption |

- **Validação/sanitização:** schema Zod nos payloads + regras no service;
  **sempre** usar prepared statements/parâmetros no acesso ao banco — nunca
  concatenar SQL — para prevenir injeção.
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

## Modelo de dados

Fiel ao DDL de `docs/lavagem-sintetico.sql`.

### `FR_LAVAGEM` (tabela principal)

| Campo (API) | Coluna | Tipo | Obrigatório | Regra |
|---|---|---|---|---|
| `idLavagem` | `ID_LAVAGEM` | INTEGER PK | sim (gerado) | R01 — sequence `FR_LAVAGEM_SEQ` |
| `idTipoLavagem` | `ID_TIPO_LAVAGEM` | FK | sim | R02, R05 |
| `dataLavagem` | `DT_LAVAGEM` | DATE | sim | R02, R15 |
| `kmLavagem` | `KM_LAVAGEM` | INTEGER | sim | R02, R04 (> 0) |
| `valorLavagem` | `VL_LAVAGEM` | NUMERIC(5,2) | condicional | R03 (> 0 se informado), R11 |
| `idVeiculo` | `ID_VEICULO` | FK | sim | R02, R06 |
| `dsPosto` | `DS_POSTO` | VARCHAR(255) | condicional | R14 |
| `cnpjPosto` | `CNPJ_POSTO` | VARCHAR(18) | condicional | R14 |
| `idPosto` | `ID_POSTO` | FK | condicional | R07, R13 |
| `idPessoaCadastrador` | `ID_PESSOA_CADASTRADOR` | INTEGER | auto | R08 (usuário mock) |
| `dataCadastro` | `DT_CADASTRO` | DATE | auto | R08 (data atual) |

Tabelas de apoio: `FR_TIPO_LAVAGEM`, `FR_VEICULO_MOCK` (inclui `KM_ATUAL`),
`FR_POSTO_MOCK`. Como o SQLite não tem sequence nativa, a PK é gerada por
`AUTOINCREMENT` iniciando no valor da sequence original (3397), ou por uma tabela
de controle — preservando o comportamento de R01.

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
4. **Persistência** (R01, R08, R17): gera PK, preenche `dataCadastro` (atual) e
   `idPessoaCadastrador` (usuário mock), executa INSERT parametrizado.
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

- Apenas dados fictícios (SQLite carregado do `lavagem-sintetico.sql`).
- Minimização: persistir só os campos de `FR_LAVAGEM`.
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
    db/          schema.sql (DDL), seed (dados fictícios), conexão SQLite
    repositories/ lavagemRepo, tipoLavagemRepo, veiculoRepo, postoRepo
    services/    lavagemService.js   (regras R01–R18)
    schemas/     lavagemSchema.js    (Zod — estruturais R02/R03/R04/R15)
    routes/      lavagens.routes.js, veiculos.routes.js
    app.js       (Express)
    server.js
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
