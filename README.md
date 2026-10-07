# SIG Frota — Migração do Módulo de Lavagem (Hackathon AWS × MPF)

Migração do módulo de **Lavagem** do SIG Frota, hoje em Oracle APEX (PL/SQL + metadados de tela), para uma aplicação serverless na AWS (**Node.js** no back, **React + Tailwind** no front), usando IA (Kiro + Amazon Bedrock) para extrair as regras de negócio do código legado.

> Status: stack definida; escolha das features de IA em aberto (ver fim do documento).
>
> Os insumos sugerem Java como alvo da migração. Confirmamos que é sugestão, não requisito; optamos por Node.js por ter cold start menor no Lambda e uma única linguagem no front e no back.

## O problema

As regras do módulo de Lavagem estão espalhadas entre constraints da tabela `FR_LAVAGEM`, validações PL/SQL e dynamic actions da página APEX 45, além da região "Lavagens" da página 10 (tela de Veículo). Isso dificulta manutenção, testes e evolução.

## Fluxo principal do MVP

O atendente abre a tela de um veículo, clica em **Incluir Lavagem**, preenche o formulário e, ao salvar, **vê a nova lavagem no painel do veículo** (regras R19–R23).

## Insumos (`docs/`)

| Arquivo | Conteúdo |
|---------|----------|
| `lavagem-sintetico.sql` | DDL + dados fictícios (`FR_LAVAGEM`, `FR_TIPO_LAVAGEM`, mocks de veículo e posto) |
| `lavagem-apex-trecho-ilustrativo.md` | Trechos PL/SQL do APEX: o "antes" da migração |
| `lavagem-gabarito-regras.md` | Gabarito com as regras R01–R23 e casos de teste |
| `INSTRUÇÃO NORMATIVA SGMPF Nº 29/2023.pdf` | Norma de uso da frota (contexto de domínio) |
| `Orientação Técnica nº 17 - Privacidade desde o projeto.pdf` | Privacy by Design / LGPD |
| `../criterios-avaliacao-hackathon.html` | Critérios de avaliação da banca |

## Regras de negócio

- **Estruturais (R01–R08):** PK por sequence, campos obrigatórios (tipo, data, km, veículo), valor > 0 quando informado, km > 0, FKs válidas, data de cadastro e cadastrador automáticos.
- **Condicionais (R09–R16), o núcleo da migração:**
  - Lavagem **na própria unidade** (default): dispensa valor e posto.
  - Lavagem **externa**: valor obrigatório, e o posto é:
    - **conveniado** (default): `ID_POSTO` obrigatório;
    - **não conveniado**: `DS_POSTO` e `CNPJ_POSTO` obrigatórios.
  - Data deve ser válida; "Km Atual" exibido como referência (no MVP vem de `FR_VEICULO_MOCK.KM_ATUAL`).
- **Operações e tela (R17–R23):** CRUD com confirmação na exclusão, retorno à lista com mensagem, painel de lavagens por veículo ordenado por data (tipo, data, km, valor), link de edição por linha e botão "Incluir Lavagem".

**Rastreabilidade:** todo requisito, validação e teste gerado deve citar a regra de origem (Rxx). É o critério anti-alucinação do caso de uso.

## Critérios de avaliação

6 critérios, nota 0–10 cada (máx. 60). Pitch de 5 min + 1 min de Q&A.

| # | Critério | Como pretendemos atender |
|---|----------|--------------------------|
| 1 | Atendimento aos Requisitos | Cobrir R01–R23, demo ponta a ponta com os dados sintéticos, casos de teste do gabarito passando |
| 2 | Arquitetura AWS | Serverless (Lambda, API Gateway, S3, DynamoDB), eventos (S3 → Step Functions), IaC (SAM ou CDK), Bedrock nas features de IA |
| 3 | Inovação e Criatividade | Specs, hooks e steering do Kiro como parte do processo; UX simples para o atendente |
| 4 | Segurança | Cognito, IAM com menor privilégio, validação de entrada, dados sensíveis fora de logs, criptografia em trânsito e em repouso, LGPD (Privacy by Design, OT nº 17) |
| 5 | Apresentação | Problema → solução → demo → resultados → próximos passos, dentro de 5 min |
| 6 | Viabilidade e Escalabilidade | Caminho MVP → produção, estimativa de custo, reuso por outros módulos/órgãos, testes e documentação |

## Arquitetura

| Camada | Tecnologia |
|--------|------------|
| Frontend | React + Tailwind, hospedado em S3 + CloudFront (HTTPS) |
| Autenticação | Amazon Cognito (grupos `atendente` e `gestor`) |
| API | API Gateway (HTTP API) com authorizer JWT do Cognito |
| Back-end | AWS Lambda em Node.js; regras R09–R14 em um módulo de domínio puro, testável sem AWS |
| Dados | Amazon DynamoDB (criptografia em repouso) |
| IA | Amazon Bedrock |
| IaC | SAM ou CDK (TypeScript) |

### Modelagem no DynamoDB

O padrão de acesso principal é listar as lavagens de um veículo ordenadas por data (R19).

| PK | SK | Item |
|----|----|------|
| `VEICULO#101` | `META` | dados do veículo, `KM_ATUAL` |
| `VEICULO#101` | `LAVAGEM#2026-09-01#3397` | lavagem |
| `TIPO#2` | `META` | tipo de lavagem |
| `POSTO#10` | `META` | posto conveniado |

Decisões em relação ao legado:

- **R05–R07 (FKs):** o DynamoDB não tem chave estrangeira; a existência de tipo, veículo e posto é verificada no service.
- **R01 (sequence):** substituída por contador atômico (`UpdateItem` com `ADD`), mantendo IDs numéricos como no legado.
- **R08 (cadastrador):** vem do `sub` do token Cognito, nunca do corpo da requisição.

## Ideias de IA (candidatas)

Ordenadas por retorno nos critérios e risco na demo:

1. **Extração de regras do PL/SQL (recomendada, núcleo do caso de uso).** Upload do SQL no S3 dispara um Step Functions que chama o Bedrock, extrai as regras em JSON (com trecho de origem e Rxx) e compara com o gabarito, mostrando a precisão em %. Cobre rastreabilidade, arquitetura orientada a eventos e reuso em outros módulos.
2. **Leitura do recibo da lavagem (recomendada para a demo).** Foto do recibo preenche valor, data, posto e CNPJ via Bedrock multimodal ou Textract. LGPD: guardar só os campos extraídos e apagar a imagem via lifecycle no S3.
3. **Detecção de anomalias com explicação.** Valor fora da média, lavagens em sequência, km menor que o último registro. A regra é determinística; o Bedrock só redige a explicação para o gestor.
4. **Consulta em linguagem natural para o gestor.** O Bedrock traduz a pergunta para um schema fixo de filtros (tool use), sem gerar consulta livre.
5. **Geração de casos de teste a partir das regras extraídas.**

Uso do Kiro como parte da solução (critério 3): spec gerado a partir do gabarito, hook que roda os testes ao salvar e steering exigindo que cada validação cite a Rxx.

## Decisões em aberto

1. **Features de IA:** quais das ideias acima entram no MVP (recomendação: 1 e 2; a 3 se sobrar tempo).
2. **IaC:** SAM ou CDK.
3. **Escopo:** depende do tempo restante e do tamanho da equipe.

## Como colaborar

Todos commitam direto na `main`. Se o push for rejeitado ("fetch first"):

```
git pull --rebase origin main
git push origin main
```
