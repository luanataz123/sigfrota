# Requisitos — Frontend do Módulo de Lavagem

## Introdução

Este documento define os requisitos do **frontend** (React + Tailwind) do módulo
de Lavagem do SIG Frota, parte da migração do sistema legado Oracle APEX para uma
aplicação serverless na AWS (Hackathon AWS × MPF).

O escopo é **exclusivamente a camada de interface**. O backend (API, DynamoDB,
Cognito, Bedrock) está fora deste spec; o frontend trabalha contra o **contrato
da API** (`api-lavagens`), podendo usar **mocks** enquanto a API não estiver
pronta. Toda regra de interface condicional reaproveita o módulo de domínio
(`packages/dominio`) como fonte única das validações R09–R14.

O fluxo principal do MVP é: o atendente abre a tela de um veículo, clica em
**Incluir Lavagem**, preenche o formulário com campos que aparecem/desaparecem
conforme o contexto, salva e **vê a nova lavagem no painel do veículo**.

**Rastreabilidade:** cada requisito cita a(s) regra(s) de origem (Rxx) do gabarito
`docs/lavagem-gabarito-regras.md`. É o critério anti-alucinação do caso de uso.

### Convenções

- Papéis de usuário (grupos Cognito): `atendente` (opera lavagens) e `gestor`
  (consulta). No MVP o foco é o `atendente`.
- "Painel de lavagens" = região de listagem na tela do veículo.
- "Formulário de lavagem" = tela de inclusão/edição de uma lavagem.
- Rxx = regras do gabarito. R09–R16 são condicionais (núcleo); R17–R23 são
  operações e tela.

---

## Requisitos

### Requisito 1 — Autenticação e sessão

**História:** Como atendente, quero fazer login com minhas credenciais, para que
somente usuários autorizados operem o módulo de lavagem.

#### Critérios de aceite

1. QUANDO um usuário não autenticado acessa qualquer rota protegida, O SISTEMA
   DEVE redirecioná-lo para a tela de login.
2. QUANDO o usuário informa credenciais e a autenticação (Cognito) tem sucesso, O
   SISTEMA DEVE armazenar o token de sessão e liberar o acesso às rotas do módulo.
3. ENQUANTO houver uma sessão válida, O SISTEMA DEVE anexar o token (JWT) a cada
   requisição à API.
4. QUANDO o token expira ou a API responde 401, O SISTEMA DEVE encerrar a sessão
   e redirecionar para o login sem travar a aplicação.
5. QUANDO o usuário aciona "sair", O SISTEMA DEVE limpar a sessão local e
   retornar à tela de login.
6. O SISTEMA DEVE exibir a identificação do usuário logado (nome/e-mail) no
   cabeçalho. *(apoia R08 — cadastrador vem do token, nunca de campo editável)*

> Nota: a integração real com Cognito pode ser abstraída atrás de um provider de
> autenticação; no MVP, aceita-se um provider mockável que respeite os critérios
> 1–5. Backend fora de escopo.

---

### Requisito 2 — Painel de lavagens do veículo (listagem)

**História:** Como atendente, quero ver a lista de lavagens de um veículo na tela
dele, para acompanhar o histórico e confirmar inclusões.

#### Critérios de aceite _(R19, R20)_

1. QUANDO a tela do veículo é aberta, O SISTEMA DEVE buscar e listar as lavagens
   daquele veículo via `GET /veiculos/{id}/lavagens`. *(R19)*
2. O SISTEMA DEVE exibir as lavagens **ordenadas por data da lavagem**. *(R19)*
3. O SISTEMA DEVE exibir, para cada lavagem, as colunas: **Tipo de Lavagem**,
   **Data** (formato DD/MM/AAAA), **Odômetro (Km)** e **Valor** (formato de
   moeda BRL). *(R20)*
4. QUANDO a lavagem é interna (sem valor), O SISTEMA DEVE exibir o valor como
   vazio/"—" em vez de R$ 0,00. *(R10)*
5. QUANDO o veículo não tem lavagens, O SISTEMA DEVE exibir um estado vazio com
   orientação para incluir a primeira lavagem.
6. ENQUANTO a lista está carregando, O SISTEMA DEVE exibir um indicador de
   carregamento (skeleton/spinner).
7. QUANDO a busca falha, O SISTEMA DEVE exibir mensagem de erro e uma ação de
   "tentar novamente".
8. O SISTEMA DEVE exibir o **Km Atual** do veículo como referência (somente
   leitura) no topo do painel. *(R16 — no MVP vem do mock `KM_ATUAL`)*

---

### Requisito 3 — Abrir inclusão e edição a partir do painel

**História:** Como atendente, quero abrir o formulário de lavagem para incluir
uma nova ou editar uma existente diretamente do painel do veículo.

#### Critérios de aceite _(R21, R22)_

1. O SISTEMA DEVE exibir no painel um botão **"Incluir Lavagem"**. *(R22)*
2. QUANDO o usuário aciona "Incluir Lavagem", O SISTEMA DEVE abrir o formulário
   em **modo inclusão** (sem `ID_LAVAGEM`), já associado ao veículo atual. *(R22)*
3. QUANDO o usuário aciona o link de uma linha da lista, O SISTEMA DEVE abrir o
   formulário em **modo edição**, carregando os dados daquela lavagem pelo
   `ID_LAVAGEM`. *(R21)*
4. O SISTEMA DEVE deixar claro na interface se o formulário está em modo inclusão
   ou edição (título/estado).

---

### Requisito 4 — Formulário: campos e obrigatoriedade base

**História:** Como atendente, quero um formulário que me obrigue a informar os
dados essenciais da lavagem, para evitar registros incompletos.

#### Critérios de aceite _(R02, R03, R04)_

1. O SISTEMA DEVE apresentar os campos: **Tipo de lavagem**, **Data da lavagem**,
   **Odômetro (Km)**, **Na própria unidade?**, **Posto conveniado?**, **Valor**,
   **Posto conveniado (seleção)**, **Descrição do posto** e **CNPJ do posto**.
2. O SISTEMA DEVE exigir obrigatoriamente **tipo de lavagem**, **data** e
   **odômetro (km)** em todos os casos. *(R02)*
3. QUANDO o odômetro informado é menor ou igual a zero, O SISTEMA DEVE bloquear o
   envio e sinalizar o erro no campo. *(R04)*
4. QUANDO o valor é informado e é menor ou igual a zero, O SISTEMA DEVE bloquear
   o envio e sinalizar o erro no campo. *(R03)*
5. O SISTEMA DEVE popular o campo **Tipo de lavagem** a partir do contrato
   (lista de tipos), exibindo a descrição e enviando o `ID_TIPO_LAVAGEM`.
6. O SISTEMA DEVE validar as entradas no cliente **reaproveitando o módulo de
   domínio** (`packages/dominio`), sem reimplementar as regras no componente.

---

### Requisito 5 — Formulário: comportamento condicional (unidade × externa)

**História:** Como atendente, quero que o formulário mostre apenas os campos
pertinentes ao tipo de lavagem, para preencher mais rápido e sem erro.

#### Critérios de aceite _(R09, R10, R11)_

1. O SISTEMA DEVE oferecer a escolha **"Na própria unidade?"** com valor padrão
   **"Sim"**. *(R09)*
2. QUANDO "Na própria unidade?" = **Sim**, O SISTEMA DEVE **ocultar** os campos
   valor, posto conveniado, seleção de posto, descrição do posto e CNPJ, e NÃO
   DEVE exigi-los. *(R10)*
3. QUANDO "Na própria unidade?" = **Não** (externa), O SISTEMA DEVE **exibir** o
   campo valor e torná-lo **obrigatório**. *(R11)*
4. QUANDO o usuário é externa e não informa valor, O SISTEMA DEVE bloquear o
   envio e sinalizar o erro no campo valor. *(R11)*
5. QUANDO o usuário alterna de externa para interna, O SISTEMA DEVE limpar
   os erros e dispensar os campos de valor/posto para não bloquear o envio.

---

### Requisito 6 — Formulário: posto conveniado × não conveniado

**História:** Como atendente, em lavagem externa, quero indicar se o posto é
conveniado e informar só os dados correspondentes.

#### Critérios de aceite _(R12, R13, R14)_

1. QUANDO a lavagem é externa, O SISTEMA DEVE oferecer a escolha **"Posto
   conveniado?"** com valor padrão **"Sim"**. *(R12)*
2. QUANDO "Posto conveniado?" = **Sim**, O SISTEMA DEVE exibir a **seleção de
   posto conveniado** (obrigatória) e ocultar descrição e CNPJ. *(R13)*
3. QUANDO o posto é conveniado e nenhum posto é selecionado, O SISTEMA DEVE
   bloquear o envio e sinalizar o erro. *(R13)*
4. QUANDO "Posto conveniado?" = **Não**, O SISTEMA DEVE exibir **Descrição do
   posto** e **CNPJ** (ambos obrigatórios) e ocultar a seleção de posto. *(R14)*
5. QUANDO o posto é não conveniado e falta descrição ou CNPJ, O SISTEMA DEVE
   bloquear o envio e sinalizar o(s) campo(s). *(R14)*
6. O SISTEMA DEVE popular a seleção de posto conveniado a partir do contrato
   (lista de postos), exibindo nome e enviando o `ID_POSTO`.
7. QUANDO o usuário alterna entre conveniado e não conveniado, O SISTEMA DEVE
   limpar os valores e erros dos campos que passam a ficar ocultos.

---

### Requisito 7 — Formulário: validação de data

**História:** Como atendente, quero ser avisado quando a data da lavagem for
inválida, para não registrar datas impossíveis.

#### Critérios de aceite _(R15)_

1. QUANDO a data informada não é uma data válida (ex.: 31/02), O SISTEMA DEVE
   bloquear o envio e sinalizar o erro no campo data. *(R15)*
2. O SISTEMA DEVE aceitar e enviar a data em formato consistente com o contrato
   da API (ISO `YYYY-MM-DD`), exibindo-a ao usuário em DD/MM/AAAA.

---

### Requisito 8 — Salvar (incluir / alterar)

**História:** Como atendente, quero salvar a lavagem e voltar ao painel do
veículo com a lista atualizada, para confirmar que o registro foi gravado.

#### Critérios de aceite _(R17, R18, R23)_

1. QUANDO o formulário está em modo inclusão e é válido, O SISTEMA DEVE enviar um
   **POST** de criação ao contrato da API. *(R17)*
2. QUANDO o formulário está em modo edição e é válido, O SISTEMA DEVE enviar uma
   atualização (**PUT/PATCH**) da lavagem correspondente. *(R17)*
3. O SISTEMA NÃO DEVE enviar os campos de valor/posto quando a lavagem é interna,
   nem os campos do ramo oculto no caso de posto. *(R10, R13, R14)*
4. QUANDO o salvamento tem sucesso, O SISTEMA DEVE retornar ao painel do veículo
   e exibir uma **mensagem de sucesso**. *(R18)*
5. QUANDO o painel é reexibido após inclusão, O SISTEMA DEVE mostrar a lista
   **já contendo a nova lavagem**. *(R23)*
6. ENQUANTO o salvamento está em andamento, O SISTEMA DEVE desabilitar o botão de
   salvar e indicar o progresso, evitando envio duplicado.
7. QUANDO o salvamento falha, O SISTEMA DEVE manter os dados preenchidos, exibir
   a mensagem de erro e permitir nova tentativa.

---

### Requisito 9 — Excluir com confirmação

**História:** Como atendente, quero excluir uma lavagem com uma confirmação
explícita, para não apagar registros por engano.

#### Critérios de aceite _(R17, R18)_

1. QUANDO o formulário está em modo edição, O SISTEMA DEVE oferecer a ação
   **Excluir**. *(R17)*
2. QUANDO o usuário aciona Excluir, O SISTEMA DEVE pedir **confirmação** antes de
   executar. *(R17)*
3. QUANDO a exclusão é confirmada e tem sucesso, O SISTEMA DEVE retornar ao painel
   do veículo com **mensagem de sucesso** e a lavagem removida da lista. *(R18)*
4. QUANDO o usuário cancela a confirmação, O SISTEMA NÃO DEVE excluir nada.
5. QUANDO a exclusão falha, O SISTEMA DEVE exibir mensagem de erro e manter a
   lavagem.

---

### Requisito 10 — Feedback, acessibilidade e responsividade

**História:** Como atendente, quero uma interface clara, acessível e usável em
diferentes telas, para operar com rapidez e confiança (apoia os critérios 1, 3 e
5 da banca).

#### Critérios de aceite

1. O SISTEMA DEVE exibir mensagens de sucesso e erro de forma visível e
   temporária (toast/alert) sem bloquear o fluxo.
2. O SISTEMA DEVE associar rótulos (`label`) a todos os campos e expor estados de
   erro de forma acessível (`aria-invalid`, mensagens vinculadas).
3. O SISTEMA DEVE permitir navegação e envio por teclado em todo o formulário.
4. O SISTEMA DEVE manter contraste e alvos de toque adequados (diretrizes WCAG
   AA como referência de projeto).
5. O SISTEMA DEVE ser responsivo, funcionando em telas de desktop e tablet
   (layout em coluna única em larguras menores).
6. O SISTEMA DEVE evitar expor dados sensíveis (ex.: CNPJ) em logs do cliente.
   *(apoia o critério Segurança/LGPD)*

---

### Requisito 11 — Camada de dados e contrato (desacoplamento)

**História:** Como time de frontend, quero uma camada de acesso a dados isolada
atrás do contrato da API, para desenvolver com mocks enquanto o backend não está
pronto.

#### Critérios de aceite

1. O SISTEMA DEVE concentrar todas as chamadas HTTP em uma camada de serviço
   (client) tipada, baseada no contrato da API `api-lavagens`.
2. O SISTEMA DEVE permitir alternar entre **API real** e **mock** por
   configuração (variável de ambiente), sem alterar os componentes.
3. O mock DEVE refletir os dados sintéticos (`docs/lavagem-sintetico.sql`),
   incluindo o veículo 101 com ao menos uma lavagem, para a demo. *(R19, R23)*
4. O SISTEMA DEVE tipar as entidades (Lavagem, TipoLavagem, Posto, Veículo)
   conforme o contrato, para falhar cedo em divergências.
