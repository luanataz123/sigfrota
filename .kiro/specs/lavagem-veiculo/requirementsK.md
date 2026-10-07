# Requisitos — Módulo de Lavagem de Veículo (SigFrota Gerencial)

## Introdução

Este documento especifica a migração assistida por IA de uma fatia do módulo de
Lavagem do SIG Frota, hoje em Oracle APEX / PL/SQL, para **Node.js + React +
Tailwind** (tecnologia disponível no ambiente). O recorte é
a **tela de Veículo enxuta** (identificação do veículo + painel de lavagens) e o
**cadastro de lavagem**, preservando fielmente as regras de negócio que hoje
vivem no código legado e incorporando os padrões institucionais de
acessibilidade (eMAG/WCAG — IN SGMPF 29/2023) e privacidade desde o projeto
(OT 17 / LGPD).

O fluxo central da demonstração é: o gestor abre a tela do veículo, consulta o
painel de lavagens, **inclui uma nova lavagem** e vê a lista re-renderizada já
exibindo o registro recém-criado, com mensagem de sucesso.

**Fonte das especificações:** `docs/modelo-caso-de-uso-hackathon_SigFrota.docx`
(caso de uso), `docs/lavagem-gabarito-regras.md` (regras R01–R23),
`docs/lavagem-apex-trecho-ilustrativo.md` (PL/SQL de origem) e
`docs/lavagem-sintetico.sql` (DDL + dados fictícios).

### Rastreabilidade (critério anti-distorção)

Cada requisito abaixo cita a(s) regra(s) de origem (**Rxx**) do gabarito e, quando
aplicável, o artefato APEX de origem. Nenhum requisito foi introduzido sem origem
verificável no código legado ou no documento de caso de uso.

### Perfil de usuário

- **Gestor da Frota:** abre a tela do veículo, consulta o painel de lavagens,
  inclui uma nova lavagem e confirma na tela que ela foi registrada.
  (No MVP o login é mockado com usuário fixo; Cognito não é exigido.)

### Fora de escopo

- Demais painéis da tela de Veículo (abastecimento, manutenção, infração).
- Os 30+ campos do cadastro completo de veículo e anexos BLOB.
- Cálculo real do "Km atual" via módulo de Atendimento — no MVP é mockado pela
  coluna `KM_ATUAL` do veículo fictício (`FR_VEICULO_MOCK`).

---

## Requisitos

### Requisito 1 — Identificação do veículo e painel de lavagens

**User story:** Como gestor da frota, quero abrir a tela de um veículo e ver seus
dados de identificação com o painel de lavagens, para acompanhar o histórico de
lavagens daquele veículo.

**Rastreabilidade:** R16, R19, R20

#### Critérios de aceitação

1. QUANDO o gestor abre a tela de um veículo pelo seu `id`, O SISTEMA DEVE exibir
   a identificação do veículo (descrição) e o "Km atual" como referência somente
   leitura. (R16 — no MVP, `KM_ATUAL` vem de `FR_VEICULO_MOCK`.)
2. O SISTEMA DEVE exibir um painel que lista as lavagens daquele veículo,
   filtradas por `ID_VEICULO` e ordenadas por data da lavagem. (R19)
3. PARA CADA lavagem listada, O SISTEMA DEVE exibir o tipo de lavagem, a data no
   formato DD/MM/AAAA, o odômetro (km) e o valor formatado como moeda. (R20)
4. QUANDO o veículo não possui lavagens, O SISTEMA DEVE exibir o painel vazio com
   indicação de ausência de registros.

---

### Requisito 2 — Inclusão de lavagem com re-renderização na tela

**User story:** Como gestor da frota, quero incluir uma lavagem e ver o resultado
imediatamente no painel do veículo, para confirmar que o registro foi salvo.

**Rastreabilidade:** R01, R17, R18, R22, R23

#### Critérios de aceitação

1. QUANDO o gestor aciona "Incluir Lavagem", O SISTEMA DEVE abrir o formulário de
   lavagem em modo de inclusão. (R22)
2. QUANDO uma lavagem válida é incluída, O SISTEMA DEVE gerar a chave primária
   `ID_LAVAGEM` automaticamente por sequência. (R01)
3. QUANDO a inclusão é concluída com sucesso, O SISTEMA DEVE persistir o registro
   (INSERT) e preencher automaticamente a data de cadastro (data atual) e o
   cadastrador (usuário logado/mock). (R08, R17)
4. QUANDO a inclusão é concluída, O SISTEMA DEVE re-exibir a lista de lavagens do
   veículo já contendo a nova lavagem, com mensagem de sucesso. (R18, R23)

---

### Requisito 3 — Validações estruturais da lavagem

**User story:** Como gestor da frota, quero que o sistema impeça o registro de
lavagens com dados estruturais inválidos, para manter a integridade dos dados.

**Rastreabilidade:** R02, R03, R04, R05, R06, R07, R15

#### Critérios de aceitação

1. O SISTEMA DEVE exigir tipo de lavagem, data, odômetro (km) e veículo como
   campos obrigatórios. (R02)
2. SE o odômetro (km) informado for menor ou igual a zero, ENTÃO O SISTEMA DEVE
   rejeitar a inclusão. (R04)
   - *Exemplo:* `km = 0` → bloqueado.
3. SE o valor da lavagem for informado E for menor ou igual a zero, ENTÃO O
   SISTEMA DEVE rejeitar a inclusão. (R03)
4. SE a data da lavagem não for uma data válida, ENTÃO O SISTEMA DEVE rejeitar a
   inclusão. (R15)
   - *Exemplo:* `31/02/2026` → bloqueado.
5. SE o tipo de lavagem informado não existir no cadastro de tipos, ENTÃO O
   SISTEMA DEVE rejeitar a inclusão. (R05)
6. SE o veículo informado não existir, ENTÃO O SISTEMA DEVE rejeitar a inclusão.
   (R06)
7. SE um posto conveniado for informado E não existir no cadastro de postos,
   ENTÃO O SISTEMA DEVE rejeitar a inclusão. (R07)

---

### Requisito 4 — Regras condicionais: lavagem na própria unidade × externa

**User story:** Como gestor da frota, quero que o formulário se comporte conforme
o local da lavagem (própria unidade ou externa), para preencher apenas os campos
pertinentes.

**Rastreabilidade:** R09, R10, R11

#### Critérios de aceitação

1. O SISTEMA DEVE permitir indicar se a lavagem é na própria unidade ("Na
   Unidade?" = Sim) ou externa (Não), com padrão "Sim". (R09)
2. SE a lavagem é na própria unidade, ENTÃO O SISTEMA DEVE dispensar e ocultar os
   campos valor, posto conveniado, posto não conveniado e CNPJ. (R10)
   - *Exemplo:* Na unidade = Sim, sem valor e sem posto → aceito.
3. SE a lavagem é externa (não na unidade), ENTÃO O SISTEMA DEVE exigir o valor
   da lavagem (maior que zero). (R11)
   - *Exemplo:* Externa com valor nulo ou 0 → bloqueado.

---

### Requisito 5 — Regras condicionais: posto conveniado × não conveniado

**User story:** Como gestor da frota, quero que o sistema exija os dados corretos
do posto conforme ele seja conveniado ou não, para registrar a lavagem externa
corretamente.

**Rastreabilidade:** R12, R13, R14

#### Critérios de aceitação

1. QUANDO a lavagem é externa, O SISTEMA DEVE permitir indicar se o posto é
   conveniado ("Posto Conveniado?" = Sim/Não), com padrão "Sim". (R12)
2. SE o posto é conveniado, ENTÃO O SISTEMA DEVE exigir a seleção de um posto
   cadastrado (`ID_POSTO`) e ocultar os campos de posto não conveniado. (R13)
   - *Exemplo:* Conveniado sem posto selecionado → bloqueado.
3. SE o posto é não conveniado, ENTÃO O SISTEMA DEVE exigir a descrição do posto
   (`DS_POSTO`) e o CNPJ (`CNPJ_POSTO`), e ocultar a lista de postos conveniados.
   (R14)
   - *Exemplo:* Não conveniado sem CNPJ → bloqueado.

---

### Requisito 6 — Listagem de lavagens por veículo (API)

**User story:** Como consumidor da tela, quero obter as lavagens de um veículo
por um endpoint REST, para renderizar o painel.

**Rastreabilidade:** R19, R20, R21

#### Critérios de aceitação

1. O SISTEMA DEVE expor `GET /veiculos/{id}/lavagens` retornando as lavagens do
   veículo, ordenadas por data da lavagem. (R19)
2. CADA item retornado DEVE conter identificador, tipo de lavagem (descrição),
   data, odômetro e valor. (R20, R21 — o identificador permite abrir a edição.)

---

### Requisito 7 — Acessibilidade (eMAG/WCAG — IN SGMPF 29/2023)

**User story:** Como usuário que depende de tecnologia assistiva, quero uma tela
acessível, para operar o cadastro de lavagem sem barreiras.

**Rastreabilidade:** IN SGMPF nº 29/2023 (caso de uso, seção 7); F4

#### Critérios de aceitação

1. O SISTEMA DEVE prover uma tela que atenda aos critérios eMAG/WCAG, com meta de
   conformidade mínima de 70%.
2. TODO campo de formulário DEVE ter rótulo (`label`) associado programaticamente
   ao seu controle.
3. As mensagens de erro e de sucesso DEVEM ser perceptíveis por leitores de tela
   (ex.: regiões ARIA live) e associadas aos respectivos campos quando aplicável.
4. A navegação pela tela DEVE ser possível por teclado, com ordem de foco
   coerente e foco visível.
5. Os elementos interativos e textos DEVEM respeitar contraste e semântica HTML
   adequados (uso de elementos nativos, hierarquia de cabeçalhos).

> Observação: a conformidade total exige teste manual com tecnologia assistiva e
> revisão especializada de acessibilidade; estes critérios cobrem a verificação
> automatizável e as boas práticas de construção.

---

### Requisito 8 — Privacidade desde o projeto (OT 17 / LGPD)

**User story:** Como responsável pela conformidade, quero que o módulo trate
dados pessoais minimamente e sem exposição indevida, para atender a LGPD.

**Rastreabilidade:** OT 17 (caso de uso, seção 7 e 8.3); F4

#### Critérios de aceitação

1. O SISTEMA DEVE operar apenas com dados fictícios no ambiente do hackathon, sem
   dados pessoais reais. (Seção 8.3 do caso de uso)
2. O SISTEMA NÃO DEVE registrar em log dados que possam identificar pessoas (ex.:
   CNPJ do posto, identificador do cadastrador) em texto claro.
3. O SISTEMA DEVE coletar e persistir apenas os campos necessários à lavagem
   (minimização de dados), conforme a estrutura de `FR_LAVAGEM`.
4. O cadastrador DEVE ser preenchido pelo contexto do usuário autenticado (mock
   no MVP), e não informado livremente pelo cliente.

---

### Requisito 9 — Extração de regras com rastreabilidade

**User story:** Como avaliador do hackathon, quero que cada regra implementada
cite sua origem no PL/SQL, para medir a precisão da extração e evitar distorções.

**Rastreabilidade:** F1, F5; critério anti-distorção (caso de uso, seção 9);
critério de avaliação C1 e C3 (`.kiro/steering/criterios-avaliacaoK.md`)

#### Critérios de aceitação

1. O SISTEMA (código e/ou documentação da spec) DEVE associar cada regra de
   negócio implementada ao seu identificador de origem (R01–R23).
2. OS testes gerados DEVEM cobrir os cenários do gabarito (feliz e de erro) de
   modo que a aderência às regras seja verificável.
3. A SOLUÇÃO DEVE evidenciar o uso dos recursos do Kiro (spec
   requirements→design→tasks, steering e, quando houver, hooks) como parte
   entregável, por ser item pontuado em Inovação. (C3)

---

### Requisito 10 — Arquitetura AWS e uso do Bedrock

**User story:** Como arquiteto da solução, quero que a extração de regras e a
geração de código usem o Amazon Bedrock e que o desenho preveja serviços
gerenciados, para atender ao critério de Arquitetura AWS.

**Rastreabilidade:** caso de uso, seção 9 (Bedrock essencial); critério de
avaliação C2

#### Critérios de aceitação

1. A SOLUÇÃO DEVE utilizar o **Amazon Bedrock** para a extração das regras de
   negócio a partir do SQL/PL/SQL e para a geração de código/spec, evidenciando
   esse uso na documentação e na demonstração. O acesso ao Bedrock DEVE usar o
   profile `sigfrota` conforme `.kiro/steering/aws-credenciaisK.md`. (C2)
2. O DESIGN DEVE descrever o caminho de produção com serviços gerenciados AWS
   (ex.: API Gateway, Lambda, S3) e o desacoplamento em camadas, ainda que o MVP
   rode localmente. (C2)
3. QUANDO viável no tempo do evento, A SOLUÇÃO DEVE descrever a infraestrutura
   como código (SAM, CDK ou CloudFormation) para os componentes de nuvem. (C2)
4. A SOLUÇÃO DEVE manter separação de responsabilidades entre apresentação,
   serviço (regras) e persistência. (C2)

---

### Requisito 11 — Segurança

**User story:** Como responsável pela segurança, quero que o módulo aplique
autenticação, menor privilégio, validação de entrada e criptografia, para
proteger a solução e os dados.

**Rastreabilidade:** critério de avaliação C4; complementa o Requisito 8 (LGPD)

#### Critérios de aceitação

1. A SOLUÇÃO DEVE definir a estratégia de autenticação e autorização (Cognito/IAM
   no caminho de produção; usuário mock no MVP, com a estratégia real documentada).
   (C4)
2. AS roles e policies IAM DEVEM seguir o princípio do menor privilégio. (C4)
3. O SISTEMA DEVE validar e sanitizar as entradas, usando consultas parametrizadas
   (prepared statements) no acesso ao banco para prevenir injeção. (C4)
4. O SISTEMA NÃO DEVE expor dados sensíveis em logs nem nas respostas da API
   (reforça o Requisito 8). (C4)
5. O DESIGN DEVE prever HTTPS e criptografia em trânsito e em repouso (ex.:
   KMS/S3 SSE) no caminho de produção. (C4)
6. O ACESSO à AWS (ex.: Bedrock) DEVE usar o profile nomeado `sigfrota` e seguir
   `.kiro/steering/aws-credenciaisK.md`: segredos nunca em código, log ou commit;
   `~/.aws/*` e arquivos `.env` fora do repositório; policies com menor privilégio
   (ex.: `bedrock:InvokeModel` restrito ao modelo usado). (C4)

---

### Requisito 12 — Viabilidade e caminho para produção

**User story:** Como patrocinador no MPF, quero entender o que falta para levar o
MVP à produção, o custo e a escalabilidade, para avaliar a continuidade.

**Rastreabilidade:** critério de avaliação C6

#### Critérios de aceitação

1. A SOLUÇÃO DEVE documentar o caminho **MVP → produção**, listando o que falta
   (Km atual real via módulo de Atendimento, autenticação Cognito, FKs reais
   `FR_VEICULO`/`FR_POSTO`, demais painéis). (C6)
2. A ARQUITETURA DEVE escalar sem re-arquitetura (serverless/serviços
   gerenciados), com estimativa realista de custo operacional. (C6)
3. A SOLUÇÃO DEVE registrar o potencial de reuso do processo de migração assistida
   para outros módulos/órgãos e manter manutenibilidade (specs, testes,
   modularidade). (C6)
