# Critérios de avaliação — Hackathon AWS × MPF

Base: `criterios-avaliacao-hackathon.html` (raiz do projeto). Este steering
traduz os critérios da banca em orientações acionáveis para a solução do SigFrota
(módulo de Lavagem). Toda spec, código, tela, arquitetura e pitch devem buscar a
nota máxima em cada critério.

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
- Cobrir as funcionalidades do caso de uso (F1–F5) e os requisitos da spec
  (`requirementsK.md`): extração de regras, módulo Node.js + React, tela de inclusão.
- Entregar o **fluxo principal de ponta a ponta**: abrir veículo → incluir
  lavagem → ver a lista re-renderizada com a nova lavagem e mensagem de sucesso.
- Tratar entradas/saídas conforme especificado (entrada é SQL/APEX; saída é
  API Node + endpoints REST + tela React).
- Usar os **dados sintéticos** do kit (`lavagem-sintetico.sql`) na demo.
- Garantir qualidade e utilidade do output (API e tela realmente funcionais).

## 2. Arquitetura AWS

Padrões modernos na AWS e uso adequado de serviços gerenciados.

Orientações:
- **Bedrock** é o serviço essencial: extração de regras + geração de código/spec.
  Evidenciar seu uso na solução.
- Preferir serviços gerenciados a soluções manuais; considerar serverless
  (Lambda, API Gateway, S3) ao menos para encenar a demo na nuvem.
- Mostrar desacoplamento e separação de responsabilidades (camadas:
  controller → service → repository, conforme `designK.md`).
- Se houver tempo, infraestrutura como código (SAM/CDK/CloudFormation).
- Nota: o código Node/React roda localmente no MVP; S3/Lambda/API Gateway são
  dispensáveis, mas citá-los no caminho de produção agrega pontos.

## 3. Inovação e Criatividade

Originalidade e uso inteligente das tecnologias.

Orientações:
- Destacar o diferencial: **migração APEX→Node.js/React assistida por IA com
  rastreabilidade** (regra → origem no PL/SQL) como critério anti-distorção.
- Usar explicitamente **specs, hooks e steering do Kiro** como parte da solução —
  isto é pontuado. (A spec `lavagem-veiculo` e este steering já contam.)
- UX/UI pensada para o gestor da frota (tela clara, acessível, objetiva).
- Features extras que agreguem valor (ex.: relatório de aderência regra→teste)
  só depois do essencial.

## 4. Segurança

Práticas de segurança na arquitetura, código e dados.

Orientações:
- Autenticação/autorização: Cognito/IAM no caminho de produção; no MVP, usuário
  mock, mas descrever a estratégia real.
- Princípio do menor privilégio em roles e policies IAM.
- **Validar e sanitizar inputs** (as validações de regra R02–R15 também protegem
  contra dados inválidos); usar consultas parametrizadas (prepared statements)
  contra injeção.
- Tratamento seguro de dados: não expor dados sensíveis em logs nem na API
  (sem CNPJ do posto nem identificador do cadastrador em claro).
- HTTPS, criptografia em trânsito e repouso (KMS/S3 SSE) no desenho de produção.
- **LGPD**: aplicar privacy by design (OT 17) — dados fictícios, minimização,
  cadastrador vindo do contexto. Ver Requisito 8 da spec.

## 5. Apresentação do MVP

Qualidade do pitch de 5 minutos.

Orientações:
- Estruturar: **problema → solução → demo → resultados → próximos passos**.
- Demo ao vivo funcional: incluir uma lavagem e mostrar o resultado na tela.
- Explicar com clareza a arquitetura e as decisões técnicas (por que Node.js +
  React + Tailwind, por que Bedrock, como garantimos rastreabilidade).
- Gerir o tempo: caber nos 5 minutos; respostas objetivas no 1 min de Q&A.
- Preparar antecipadamente dados e ambiente para a demo não falhar.

## 6. Viabilidade e Escalabilidade

Potencial real de levar o MVP a produção e gerar valor contínuo para o MPF.

Orientações:
- Deixar claro o **caminho MVP → produção**: o que falta (Km atual real via módulo
  de Atendimento, autenticação Cognito, FKs reais FR_VEICULO/FR_POSTO, demais
  painéis).
- Arquitetura que escala sem re-arquitetura (serverless/managed services).
- Estimativa realista de custo operacional na AWS.
- Potencial de reuso: o processo de migração assistida serve a outros módulos do
  SIG Frota e a outros órgãos.
- **Manutenibilidade**: documentação (specs), testes cobrindo as regras do
  gabarito, código modular por camadas.

---

## Checklist rápido antes do pitch

- [ ] Fluxo incluir-lavagem-e-ver-na-tela funcionando (C1, C5).
- [ ] Regras R01–R23 implementadas, cada uma rastreada à origem (C1, C3).
- [ ] Testes do gabarito verdes; relatório de aderência (C1, C6).
- [ ] Uso do Bedrock evidenciado; arquitetura em camadas clara (C2, C3).
- [ ] Specs + steering + (hooks, se houver) demonstrados (C3).
- [ ] Sem PII em logs/API; inputs validados; LGPD endereçada (C4).
- [ ] Pitch ensaiado dentro de 5 min, com próximos passos de produção (C5, C6).
