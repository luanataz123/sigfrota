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
| `INSTRUÇÃO NORMATIVA SGMPF Nº 29/2023.pdf` | Acessibilidade (e-MAG/WCAG): soluções do MPF só entram em produção com nota ≥ 70% na verificação automatizada ("parcialmente acessível") e análise humana |
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
| 3 | Inovação e Criatividade | Specs, hooks e steering do Kiro como parte do processo; UX simples e acessível para o atendente (e-MAG/WCAG, IN SGMPF nº 29/2023) |
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

Uma tabela, três tipos de partição (catálogo, lavagens por veículo e contador) e nenhum GSI no MVP. Todas as buscas são `Query` ou `GetItem`, sem `Scan`.

| PK | SK | Item |
|----|----|------|
| `CATALOGO` | `VEICULO#101` | veículo: descrição, placa, `kmAtual` |
| `CATALOGO` | `TIPO#2` | tipo de lavagem |
| `CATALOGO` | `POSTO#10` | posto conveniado |
| `VEICULO#101` | `LAVAGEM#3397` | lavagem |
| `CONTADOR` | `LAVAGEM` | último ID gerado |

| Busca | Operação |
|-------|----------|
| Carregar veículos, tipos e postos (tela inicial e combos do formulário) | `Query PK = CATALOGO` (poucas dezenas de itens) |
| Lavagens do veículo (R19) | `Query PK = VEICULO#id, SK begins_with LAVAGEM#`; ordenação por data na Lambda |
| Abrir uma lavagem para edição (R21) | `GetItem PK = VEICULO#id, SK = LAVAGEM#idLavagem` |
| Gerar novo ID (R01) | `UpdateItem` com `ADD` no item `CONTADOR` |

Por que assim:

- **SK pelo ID, não pela data:** editar a data não muda a chave, então update é um `PutItem` simples, sem transação. Um veículo tem poucas dezenas de lavagens, e ordenar isso na Lambda é trivial.
- **Rota com o veículo:** `/veiculos/{idVeiculo}/lavagens/{idLavagem}` já traz a PK, o que dispensa um GSI pelo ID.
- **`dsTipoLavagem` gravado na lavagem:** a listagem (R20) sai de uma única `Query`, sem "join".
- **`propriaUnidade` e `postoConveniado` gravados como booleanos:** a regra condicional (R09–R14) fica explícita no dado, sem precisar deduzir pelos campos vazios.
- **Painel do gestor:** se entrar no escopo, um GSI por mês (`MES#2026-09`). Fora do MVP até lá.

Decisões em relação ao legado:

- **R05–R07 (FKs):** o DynamoDB não tem chave estrangeira; a existência de tipo, veículo e posto é verificada no service, contra o catálogo.
- **R01 (sequence):** contador atômico começando em **3400**. A sequence do SQL começa em 3397, mas 3397–3399 já existem nos dados, então o legado colidiria na primeira inclusão.
- **R08 (cadastrador):** vem do `sub` do token Cognito, nunca do corpo da requisição.
- **Km Atual (R16):** não criamos a regra "km da lavagem ≤ Km Atual". Nos dados do SQL, 2 das 3 lavagens já passam do Km Atual (que no sistema real vem de outro módulo e pode estar desatualizado).
- **CNPJ (R14):** além de exigir o CNPJ, como o gabarito pede, validamos o dígito verificador em toda inclusão e alteração (extra nosso). O CNPJ do SQL (`12.345.678/0001-90`) é inválido no dígito; o registro 3398 fica como está na carga, e só precisa ser corrigido se alguém editá-lo.
- **Limites das colunas:** valor até R$ 999,99 (`NUMBER(5,2)`) e km até 999.999 (`NUMBER(6,0)`).

## Dados sintéticos (`data/seed/`)

Não temos acesso aos dados reais. Um script Node.js com semente fixa no gerador aleatório gera JSON já no formato da tabela acima (a única dependência é a conversão das imagens de recibo para PNG). Todo mundo obtém os mesmos dados.

| Conjunto | Conteúdo | Uso |
|----------|----------|-----|
| `gabarito` | Exatamente os registros do SQL: 3 tipos, 3 veículos, 2 postos, 3 lavagens | Testes do gabarito (o veículo 101 precisa ter só 1 lavagem) |
| `demo` | O gabarito mais 15 veículos (18 no total), 4 postos conveniados (6 no total), 5 não conveniados e ~250 lavagens (Out/2025 a Set/2026) | Demo e desenvolvimento |
| `anomalias` | 7 lavagens suspeitas plantadas no `demo`, listadas num manifesto | Medir a detecção de anomalias (ideia 3) |
| `recibos` | 8 imagens de recibo fictícias (PNG, marcadas "DOCUMENTO FICTÍCIO") + o JSON esperado de cada uma | Medir a leitura do recibo (ideia 2) |

Coerência do `demo`: km crescente por veículo, uma lavagem por veículo por dia, ~40% internas e ~60% externas (das externas, ~75% em posto conveniado), valores dentro da faixa de cada tipo, CNPJs novos com dígito válido, IDs novos a partir de 3400, nenhuma data futura, cadastradores só por ID (9001–9004, sem nomes nem CPF).

Anomalias plantadas: valor três vezes acima da média do tipo, duas lavagens do mesmo veículo no mesmo dia e km menor que na lavagem anterior. Continuam válidas pelas regras do gabarito: são suspeitas de negócio, não erros de validação. Fora delas, nenhum dado pode disparar esses critérios.

Recibos: cada um corresponde a uma lavagem externa do `demo` (valor, data, posto e CNPJ). O JSON esperado permite comparar campo a campo o que o Bedrock extraiu. As imagens são geradas como SVG pelo script e convertidas para PNG, formato aceito pelo Bedrock.

Para desenvolver rápido:

- **Front sem esperar a API:** o React lê os JSON do `demo` como mock até as Lambdas ficarem prontas.
- **Domínio sem AWS:** os testes do `packages/dominio` rodam contra o `gabarito`, direto no Node.
- **Uma carga só:** um script com `BatchWriteItem` popula a tabela a partir do mesmo JSON.

## Ideias de IA (candidatas)

Ordenadas por retorno nos critérios e risco na demo:

1. **Extração de regras do PL/SQL (recomendada, núcleo do caso de uso).** Upload do SQL no S3 dispara um Step Functions que chama o Bedrock, extrai as regras em JSON (com trecho de origem e Rxx) e compara com o gabarito, mostrando a precisão em %. Cobre rastreabilidade, arquitetura orientada a eventos e reuso em outros módulos.
2. **Leitura do recibo da lavagem (recomendada para a demo).** Foto do recibo preenche valor, data, posto e CNPJ via Bedrock multimodal ou Textract. LGPD: guardar só os campos extraídos e apagar a imagem via lifecycle no S3.
3. **Detecção de anomalias com explicação.** Valor fora da média, lavagens em sequência, km menor que o último registro. A regra é determinística; o Bedrock só redige a explicação para o gestor.
4. **Consulta em linguagem natural para o gestor.** O Bedrock traduz a pergunta para um schema fixo de filtros (tool use), sem gerar consulta livre.
5. **Geração de casos de teste a partir das regras extraídas.**

Uso do Kiro como parte da solução (critério 3): spec gerado a partir do gabarito, hook que roda os testes ao salvar e steering exigindo que cada validação cite a Rxx.

## Specs (Kiro)

Os specs 1, 2 e 5 não dependem de nenhum outro e podem começar em paralelo.

| # | Spec | Escopo | Regras | Depende de |
|---|------|--------|--------|------------|
| 1 | `infra-base` | DynamoDB com criptografia, Cognito (`atendente`, `gestor`), API Gateway com authorizer JWT, S3 + CloudFront, IAM de menor privilégio por Lambda | — | — |
| 2 | `dominio-lavagem` | Módulo Node.js sem dependência da AWS com as validações; testes a partir dos casos do gabarito, cada um citando a Rxx | R02–R04, R09–R15 | — |
| 3 | `api-lavagens` | CRUD e `GET /veiculos/{id}/lavagens`, contador atômico, checagem de existência, cadastrador do token, Km Atual, carga dos dados sintéticos | R01, R05–R08, R16–R20 | 1, 2 |
| 4 | `frontend-lavagens` | Login Cognito, painel de lavagens do veículo, formulário com campos condicionais, confirmação na exclusão | R09–R14, R17–R23 | contrato do 3 (pode usar mock) |
| 5 | `ia-extracao-regras` | Upload do SQL no S3 → Step Functions → Bedrock → regras em JSON com trecho de origem → comparação com o gabarito e tela de precisão | todas (gabarito) | — |
| 6 | `ia-leitura-recibo` | Foto do recibo → Bedrock multimodal → preenchimento do formulário; imagem apagada por lifecycle no S3 | — | 4 |

Opcional, se sobrar tempo: `ia-anomalias` (ideia 3).

Rastreabilidade das Rxx e execução de testes ficam fora dos specs, como um steering file e um hook válidos para todos.

## Divisão da equipe

| Pessoa | Spec principal | Depois / em paralelo |
|--------|----------------|----------------------|
| 1 | `infra-base` | Deploy contínuo e segurança/LGPD para o pitch |
| 2 | `dominio-lavagem` | Revisar a cobertura das Rxx nos outros specs |
| 3 | `api-lavagens` | Carga dos dados sintéticos e roteiro da demo |
| 4 | `frontend-lavagens` | Polimento de UX |
| 5 | `ia-extracao-regras` | Tela de precisão contra o gabarito |
| 6 | `ia-leitura-recibo` | Pitch, estimativa de custo e próximos passos |

A pessoa 6 começa pela parte do recibo que não depende do front (Lambda e prompt no Bedrock) e integra ao formulário quando o spec 4 estiver pronto.

## Estrutura do repositório

Monorepo com npm workspaces, uma pasta por spec:

```
infra/                 # spec 1 — IaC (CDK ou SAM)
packages/dominio/      # spec 2 — regras compartilhadas por API e front
services/api/          # spec 3
services/ia-regras/    # spec 5
services/ia-recibo/    # spec 6
web/                   # spec 4 — React + Tailwind
data/seed/             # dados sintéticos (gabarito e demo)
docs/                  # insumos do hackathon
```

## Combinados da equipe

1. **Cada pessoa mexe quase só na sua pasta**, para reduzir conflitos na `main`.
2. **Contratos na primeira hora:** as pessoas 1 e 3 fecham o OpenAPI e o desenho das chaves no DynamoDB; front e IA trabalham contra mocks até a API ficar pronta.
3. **`packages/dominio` é a fonte única das regras:** o mesmo módulo de validação (R09–R14) roda na Lambda e no React.

## Decisões em aberto

1. **Features de IA:** quais das ideias acima entram no MVP (recomendação: 1 e 2; a 3 se sobrar tempo).
2. **IaC:** SAM ou CDK (recomendação: CDK em TypeScript, mesma linguagem do projeto).
3. **Escopo:** ajustar ao tempo restante do hackathon.

## Como colaborar

Todos commitam direto na `main`. Se o push for rejeitado ("fetch first"):

```
git pull --rebase origin main
git push origin main
```
