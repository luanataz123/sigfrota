# Design — Módulo de Lavagem de Veículo (SigFrota Gerencial)

## Visão geral

Este design descreve a reimplementação em **Java / Spring Boot** da fatia de
Lavagem do SIG Frota, hoje em Oracle APEX / PL/SQL. O objetivo é preservar
fielmente as regras de negócio (R01–R23) extraídas do gabarito, concentrando as
regras condicionais — hoje espalhadas entre validações PL/SQL e dynamic actions
do APEX — em uma camada de serviço coesa e testável, expondo uma API REST e uma
tela mínima acessível.

Requisitos de origem: ver `requirementsK.md`. Regras de origem: ver
`docs/lavagem-gabarito-regras.md`. Código legado de referência: ver
`docs/lavagem-apex-trecho-ilustrativo.md` e `docs/lavagem-sintetico.sql`.

## Arquitetura

Camadas (arquitetura em camadas clássica do Spring):

```
┌─────────────────────────────────────────────────────────────┐
│  Tela acessível (Thymeleaf/HTML)  — painel do veículo + form  │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP (form submit / fetch)
┌───────────────────────────▼─────────────────────────────────┐
│  Controller REST   LavagemController / VeiculoController      │
│   POST /veiculos/{id}/lavagens   GET /veiculos/{id}/lavagens  │
└───────────────────────────┬─────────────────────────────────┘
                            │ DTO
┌───────────────────────────▼─────────────────────────────────┐
│  Service   LavagemService  — REGRAS DE NEGÓCIO (R01–R18)       │
│   validação condicional coesa + orquestração do INSERT        │
└───────────────────────────┬─────────────────────────────────┘
                            │ Entidade
┌───────────────────────────▼─────────────────────────────────┐
│  Repository (Spring Data JPA)                                 │
│   LavagemRepository / TipoLavagemRepository /                 │
│   VeiculoRepository / PostoRepository                         │
└───────────────────────────┬─────────────────────────────────┘
                            │ JPA
┌───────────────────────────▼─────────────────────────────────┐
│  Banco (H2 em memória no MVP) — DDL de lavagem-sintetico.sql   │
└─────────────────────────────────────────────────────────────┘
```

### Decisões técnicas

| Decisão | Escolha | Justificativa |
|---|---|---|
| Linguagem/framework | Java 17 + Spring Boot 3 | Tecnologia preferida do caso de uso (seção 9). |
| Persistência | Spring Data JPA + H2 em memória | MVP autocontido, roda localmente; DDL fiel ao `lavagem-sintetico.sql`. |
| Validação | Bean Validation + regras no Service | Estruturais via anotações; condicionais no Service (R09–R14). |
| Tela | Thymeleaf (server-side) acessível | Simplicidade e controle total de semântica HTML/ARIA. |
| Km atual | Mock via `FR_VEICULO_MOCK.KM_ATUAL` | R16 — módulo de Atendimento fora de escopo. |
| Autenticação | Usuário fixo/mock | Cognito não exigido no MVP (caso de uso, seção 9). |

## Modelo de dados

Fiel ao DDL de `docs/lavagem-sintetico.sql`.

### Entidade `Lavagem` (tabela `FR_LAVAGEM`)

| Campo Java | Coluna | Tipo | Obrigatório | Regra |
|---|---|---|---|---|
| `id` | `ID_LAVAGEM` | NUMBER(10) PK | sim (gerado) | R01 — sequence `FR_LAVAGEM_SEQ` |
| `tipoLavagem` | `ID_TIPO_LAVAGEM` | FK | sim | R02, R05 |
| `dataLavagem` | `DT_LAVAGEM` | DATE | sim | R02, R15 |
| `kmLavagem` | `KM_LAVAGEM` | NUMBER(6) | sim | R02, R04 (> 0) |
| `valorLavagem` | `VL_LAVAGEM` | NUMBER(5,2) | condicional | R03 (> 0 se informado), R11 |
| `veiculo` | `ID_VEICULO` | FK | sim | R02, R06 |
| `dsPosto` | `DS_POSTO` | VARCHAR2(255) | condicional | R14 |
| `cnpjPosto` | `CNPJ_POSTO` | VARCHAR2(18) | condicional | R14 |
| `idPosto` | `ID_POSTO` | FK | condicional | R07, R13 |
| `idPessoaCadastrador` | `ID_PESSOA_CADASTRADOR` | NUMBER(19) | auto | R08 (usuário mock) |
| `dataCadastro` | `DT_CADASTRO` | DATE | auto | R08 (data atual) |

Entidades de apoio: `TipoLavagem` (`FR_TIPO_LAVAGEM`), `VeiculoMock`
(`FR_VEICULO_MOCK`, inclui `kmAtual`), `PostoMock` (`FR_POSTO_MOCK`).

> Nota: os campos `propriaUnidade` ("Na Unidade?") e `postoConveniado` ("Posto
> Conveniado?") NÃO existem na tabela — são indicadores de entrada (do DTO) que
> dirigem a lógica condicional. No modelo persistido, "própria unidade" se traduz
> em ausência de valor/posto; "conveniado" em `idPosto` preenchido vs.
> `dsPosto`+`cnpjPosto`.

## API REST

### `GET /veiculos/{id}/lavagens` (R19, R20, R21)

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

### `POST /veiculos/{id}/lavagens` (R01, R08, R17, R18, R23)

Inclui uma lavagem. Corpo (DTO de entrada):
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
  (para a tela re-renderizar — R23) ou o recurso criado + `Location`.
- `400 Bad Request` → violação de regra, com lista de erros `{campo, mensagem, regra}`.

## Regras de negócio no Service (coração da migração)

O `LavagemService.incluir(idVeiculo, dto)` aplica, em ordem:

1. **Estruturais** (R02, R04, R03, R15, R05, R06, R07):
   - obrigatórios presentes; `km > 0`; `valor > 0` se informado; data válida;
     tipo, veículo e (se houver) posto existem.
2. **Condicionais — local** (R09, R10, R11):
   - `propriaUnidade == true` → ignora/zera valor, idPosto, dsPosto, cnpjPosto.
   - `propriaUnidade == false` → `valorLavagem` obrigatório e `> 0`.
3. **Condicionais — posto** (R12, R13, R14), apenas se externa:
   - `postoConveniado == true` → `idPosto` obrigatório; dsPosto/cnpjPosto nulos.
   - `postoConveniado == false` → `dsPosto` e `cnpjPosto` obrigatórios; idPosto nulo.
4. **Persistência** (R01, R08, R17): gera PK por sequence, preenche `dataCadastro`
   (atual) e `idPessoaCadastrador` (usuário mock), executa INSERT.
5. **Retorno** (R18, R23): devolve a lista atualizada + mensagem de sucesso.

Mapa de rastreabilidade regra → componente:

| Regra | Onde é implementada |
|---|---|
| R01, R08, R17 | `LavagemService.incluir` + JPA (`@GeneratedValue`/sequence) |
| R02 | Bean Validation (`@NotNull`) no DTO + entidade |
| R03, R04 | Bean Validation (`@Positive`) + checagem no Service |
| R05, R06, R07 | lookups nos repositórios no Service |
| R09–R14 | `LavagemService` (validação condicional coesa) |
| R15 | parsing/validação de data (`@DateTimeFormat` / try-parse) |
| R16 | `VeiculoController` lê `kmAtual` do mock |
| R18, R23 | retorno do POST + re-query no `GET` |
| R19, R20, R21 | `LavagemRepository.findByVeiculoIdOrderByDataLavagem` + DTO |
| R22 | botão "Incluir Lavagem" na tela abre o form |

## Tela acessível (Requisito 7 — eMAG/WCAG, IN 29/2023)

- Template Thymeleaf com HTML semântico: `<main>`, `<h1>`/`<h2>`, `<table>` com
  `<caption>` e `<th scope>` para o painel de lavagens.
- Cada campo com `<label for>` associado; agrupamento com `<fieldset>`/`<legend>`
  para "Na Unidade?" e "Posto Conveniado?".
- Mensagens de sucesso/erro em região `aria-live="polite"`; erros de campo
  referenciados por `aria-describedby`.
- Navegação por teclado, foco visível, contraste adequado.
- Campos condicionais exibidos/ocultados conforme R10/R13/R14, mantendo rótulos.

> A conformidade total depende de teste manual com tecnologia assistiva e revisão
> especializada; o design cobre as boas práticas automatizáveis.

## Privacidade desde o projeto (Requisito 8 — OT 17 / LGPD)

- Apenas dados fictícios (base H2 carregada do `lavagem-sintetico.sql`).
- Minimização: persistir só os campos de `FR_LAVAGEM`.
- Logs sem PII: não registrar `cnpjPosto` nem `idPessoaCadastrador` em claro.
- Cadastrador vem do contexto (mock), nunca do corpo da requisição.

## Estratégia de testes

Testes unitários do `LavagemService` cobrindo cada ramo do gabarito (seção 5 de
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

Testes de integração (`@SpringBootTest` + MockMvc) para os endpoints GET/POST.

## Estrutura de pacotes (proposta)

```
src/main/java/br/mpf/sigfrota/lavagem/
  ├─ domain/        Lavagem, TipoLavagem, VeiculoMock, PostoMock
  ├─ repository/    LavagemRepository, ...
  ├─ dto/           LavagemRequest, LavagemResponse
  ├─ service/       LavagemService (regras R01–R18)
  ├─ web/           LavagemController, VeiculoController
  └─ config/        carga de dados (data.sql) / usuário mock
src/main/resources/
  ├─ templates/     veiculo.html (painel + form acessível)
  ├─ schema.sql     (DDL fiel ao lavagem-sintetico.sql)
  └─ data.sql       (dados fictícios dos 3 cenários)
src/test/java/...   LavagemServiceTest, LavagemControllerTest
```
