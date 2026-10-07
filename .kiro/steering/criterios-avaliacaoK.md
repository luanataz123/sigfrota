# Critérios de avaliação — Hackathon AWS × MPF

Base: `criterios-avaliacao-hackathon.html` (raiz do projeto). Este steering
traduz os critérios da banca em orientações acionáveis para a solução do SigFrota
(módulo de Lavagem). Toda spec, código, tela, arquitetura e pitch devem buscar a
nota máxima em cada critério.

A stack e as decisões de arquitetura estão no `README.md` da raiz, que é a fonte
da verdade. Em caso de conflito entre este steering, uma spec e o README, vale o
README.

## Stack definida

- Back-end: **Node.js** em **AWS Lambda**, atrás de **API Gateway (HTTP API)**.
  Java/Spring era sugestão do kit, não requisito.
- Front-end: **React + Tailwind**, em S3 + CloudFront.
- Dados: **DynamoDB**, tabela única (modelagem no README).
- Autenticação: **Cognito**, com authorizer JWT no API Gateway.
- IA: **Amazon Bedrock**.
- IaC: CDK (TypeScript) ou SAM.
- Regras de negócio (R02–R15) em `packages/dominio`, módulo puro compartilhado
  por Lambda e React.
- Dados sintéticos em `data/seed/` (o `demo` para a demo, o `gabarito` para os
  testes do gabarito).

## Como a banca avalia

- **6 critérios**, cada um de **0 a 10** → **60 pontos** máximos.
- Nota final da equipe = média aritmética das notas de todos os membros da banca.
- **Pitch de 5 minutos** por equipe + **1 minuto** de Q&A.

Escala de referência: 9–10 Excelente · 7–8 Bom · 5–6 Satisfatório · 3–4 Parcial ·
0–2 Insuficiente.

---

## 1. Atendimento aos Requisitos

Quanto o MVP atende aos requisitos funcionais e não-funcionais do caso de uso.

Orientações:
- Cobrir as regras R01–R23 de `docs/lavagem-gabarito-regras.md`, cada uma
  rastreada à origem (Rxx).
- Entregar o **fluxo principal de ponta a ponta**: abrir veículo → incluir
  lavagem → ver a lista re-renderizada com a nova lavagem e mensagem de sucesso.
- Tratar entradas e saídas conforme especificado: entrada é o SQL/PL/SQL do
  APEX; saída é API REST + tela.
- Usar os **dados sintéticos** de `data/seed/demo` na demo; os casos de teste do
  gabarito rodam contra `data/seed/gabarito`.
- Garantir que API e tela funcionem de verdade, não só no slide.

## 2. Arquitetura AWS

Padrões modernos na AWS e uso adequado de serviços gerenciados.

Orientações:
- Serverless de ponta a ponta: Lambda, API Gateway, DynamoDB, S3, CloudFront,
  Cognito.
- **Bedrock** evidenciado na solução (extração de regras do PL/SQL; leitura de
  recibo).
- Orientação a eventos onde fizer sentido (ex.: upload no S3 dispara a extração
  de regras via Step Functions).
- Separação de responsabilidades: handler da Lambda → domínio
  (`packages/dominio`) → repositório DynamoDB.
- Infraestrutura como código (CDK ou SAM).

## 3. Inovação e Criatividade

Originalidade e uso inteligente das tecnologias.

Orientações:
- Destacar o diferencial: **migração APEX → serverless assistida por IA com
  rastreabilidade** (regra → origem no PL/SQL) como critério anti-alucinação.
- Usar explicitamente **specs, hooks e steering do Kiro** como parte da
  solução; isso é pontuado.
- UX/UI pensada para o gestor da frota (tela clara, acessível, objetiva).
- Features extras (leitura de recibo, anomalias, relatório de aderência
  regra → teste) só depois do essencial.

## 4. Segurança

Práticas de segurança na arquitetura, código e dados.

Orientações:
- Autenticação e autorização com Cognito; cadastrador (R08) vem do `sub` do
  token, nunca do corpo da requisição.
- Menor privilégio nas roles IAM: cada Lambda acessa só a tabela e as ações de
  que precisa.
- **Validar e sanitizar inputs** no back-end (as regras R02–R15 também protegem
  contra dados inválidos). No DynamoDB, usar o SDK com parâmetros, nunca montar
  expressões concatenando texto do usuário.
- HTTPS, criptografia em trânsito e em repouso (DynamoDB e S3 com SSE).
- **LGPD**: privacy by design (OT 17). Todos os dados são fictícios e não há
  dado pessoal (cadastradores só por ID). Citar no pitch como seria em produção:
  minimização, logs sem dado pessoal, retenção definida.
- CNPJ de posto é dado de empresa, não dado pessoal, e é fictício no hackathon;
  pode aparecer na API e na tela. Não é prioridade para o MVP.

## 5. Apresentação do MVP

Qualidade do pitch de 5 minutos.

Orientações:
- Estruturar: **problema → solução → demo → resultados → próximos passos**.
- Demo ao vivo funcional: incluir uma lavagem e mostrar o resultado na tela.
- Explicar com clareza a arquitetura e as decisões técnicas (por que serverless
  e Node.js, por que Bedrock, como garantimos rastreabilidade).
- Gerir o tempo: caber nos 5 minutos; respostas objetivas no 1 min de Q&A.
- Preparar antecipadamente dados e ambiente para a demo não falhar (tabela
  carregada com o `demo`, usuários de teste no Cognito).

## 6. Viabilidade e Escalabilidade

Potencial real de levar o MVP a produção e gerar valor contínuo para o MPF.

Orientações:
- Deixar claro o **caminho MVP → produção**: o que falta (Km atual real via
  módulo de Atendimento, integração com os cadastros reais de veículo e posto,
  migração dos dados históricos, demais painéis).
- Arquitetura que escala sem re-arquitetura (serverless/managed services).
- Estimativa realista de custo operacional na AWS.
- Potencial de reuso: o processo de migração assistida serve a outros módulos do
  SIG Frota e a outros órgãos.
- **Manutenibilidade**: documentação (README, specs), testes cobrindo as regras
  do gabarito, código modular.

---

## Checklist rápido antes do pitch

- [ ] Fluxo incluir-lavagem-e-ver-na-tela funcionando (C1, C5).
- [ ] Regras R01–R23 implementadas, cada uma rastreada à origem (C1, C3).
- [ ] Testes do gabarito verdes; relatório de aderência (C1, C6).
- [ ] Uso do Bedrock evidenciado; arquitetura serverless clara (C2, C3).
- [ ] Specs + steering + hooks demonstrados (C3).
- [ ] Login Cognito, inputs validados, IAM mínimo, LGPD endereçada (C4).
- [ ] Pitch ensaiado dentro de 5 min, com próximos passos de produção (C5, C6).
