# Plano de Implementação — Módulo de Lavagem de Veículo

Stack: **Node.js (API Express) + React + Tailwind** (tecnologia disponível, em
substituição a Java/Spring). As regras de negócio ficam no backend.

Referências: `requirementsK.md` (requisitos), `designK.md` (design),
`docs/lavagem-gabarito-regras.md` (regras R01–R23),
`docs/lavagem-sintetico.sql` (DDL + dados),
`.kiro/steering/criterios-avaliacaoK.md` (critérios C1–C6).

Cada tarefa cita os requisitos atendidos. As tarefas são incrementais e devem
ser executadas em ordem; cada uma termina com código rodando e testes verdes.

- [ ] 1. Inicializar o backend Node
  - Criar `backend/` com Node 20 LTS, Express, Zod, better-sqlite3; configurar
    scripts (`dev`, `test`) e lockfile com versões fixas.
  - _Requisitos: base; Restrições técnicas (seção 9 do caso de uso)._

- [ ] 2. Reproduzir o esquema e os dados fictícios (SQLite)
  - Criar `schema.sql` fiel ao `lavagem-sintetico.sql` (FR_TIPO_LAVAGEM,
    FR_VEICULO_MOCK, FR_POSTO_MOCK, FR_LAVAGEM com CHECKs e FKs; PK/sequence).
  - Seed com 3 tipos, 3 veículos, 2 postos e as 3 lavagens de exemplo.
  - _Requisitos: 1, 3, 8 (dados fictícios)._

- [ ] 3. Camada de repositórios (data access)
  - [ ] 3.1 Conexão SQLite + prepared statements (parametrizados).
  - [ ] 3.2 `lavagemRepo.listarPorVeiculo(id)` ordenado por data; `inserir(...)`
        com geração de PK (R01).
  - [ ] 3.3 Repos de tipo, veículo (com `kmAtual`) e posto para lookups.
  - _Requisitos: 1, 2 (R01), 3 (R05/R06/R07), 6 (R19)._

- [ ] 4. Schemas de validação (Zod)
  - Schema do payload de inclusão (inclui `propriaUnidade`, `postoConveniado`)
    com estruturais: obrigatórios, `km>0`, `valor>0` se informado, data válida.
  - _Requisitos: 2, 3 (R02/R03/R04/R15), 6 (R20)._

- [ ] 5. Implementar as regras no `lavagemService`
  - [ ] 5.1 Estruturais: km>0, valor>0 se informado, data válida, existência de
        tipo/veículo/posto. _(R02, R03, R04, R05, R06, R07, R15)_
  - [ ] 5.2 Condicionais de local: própria unidade dispensa valor/posto; externa
        exige valor>0. _(R09, R10, R11)_
  - [ ] 5.3 Condicionais de posto: conveniado exige idPosto; não conveniado exige
        dsPosto+cnpjPosto. _(R12, R13, R14)_
  - [ ] 5.4 Persistência: gerar PK, preencher dataCadastro (atual) e cadastrador
        (mock), INSERT parametrizado. _(R01, R08, R17)_
  - Comentar cada regra com seu Rxx (rastreabilidade).
  - _Requisitos: 2, 3, 4, 5, 9._

- [ ] 6. Testes do service (gabarito de precisão)
  - Vitest/Jest cobrindo os 11 cenários da seção 5 do gabarito (felizes + erros +
    listagem + resultado na tela).
  - _Requisitos: 9 (F5), 3, 4, 5._

- [ ] 7. Expor a API Express
  - [ ] 7.1 `GET /veiculos/:id/lavagens` → lista ordenada por data. _(R19, R20)_
  - [ ] 7.2 `POST /veiculos/:id/lavagens` → inclui e retorna a lista atualizada +
        mensagem de sucesso; `400` com erros `{campo, mensagem, regra}`.
        _(R17, R18, R23)_
  - [ ] 7.3 `GET /veiculos/:id` → identificação + kmAtual (mock). _(R16)_
  - _Requisitos: 1, 2, 6._

- [ ] 8. Testes de API (Supertest)
  - GET (filtro/ordenação) e POST (sucesso e erro) sobre o app Express.
  - _Requisitos: 2, 6._

- [ ] 9. Inicializar o front React + Tailwind
  - Criar `frontend/` com Vite + React 18; configurar Tailwind (`index.css`,
    `tailwind.config.js`); cliente HTTP para a API.
  - _Requisitos: base da tela._

- [ ] 10. Construir a tela acessível (React + Tailwind)
  - [ ] 10.1 `PainelLavagens`: identificação + tabela com `<caption>`,
        `<th scope>`, botão "Incluir Lavagem". _(R16, R19, R20, R22)_
  - [ ] 10.2 `FormLavagem` com `<label htmlFor>`, `<fieldset>/<legend>` para "Na
        Unidade?" e "Posto Conveniado?", exibição condicional de campos. _(R10, R13, R14)_
  - [ ] 10.3 `Mensagem` em região `aria-live`; `aria-describedby` nos campos;
        foco visível (`focus:ring`) e contraste adequado. _(Requisito 7)_
  - [ ] 10.4 Após o POST, atualizar o estado da lista exibindo a nova lavagem. _(R23)_
  - _Requisitos: 1, 2, 4, 5, 7._

- [ ] 11. Testes de componente (React Testing Library)
  - Render do painel, submit do form, exibição acessível de erro/sucesso.
  - _Requisitos: 2, 7._

- [ ] 12. Aplicar privacidade e segurança (critérios C4 + Req. 8)
  - [ ] 12.1 Acesso ao banco só por prepared statements; validar/sanitizar
        entradas (Zod). Sem concatenação de SQL. _(C4)_
  - [ ] 12.2 Logs e erros sem `cnpjPosto`/`idPessoaCadastrador` em claro;
        cadastrador sempre do contexto mock. _(Req. 8, C4)_
  - [ ] 12.3 Documentar autenticação/autorização (Cognito/IAM em produção; mock
        no MVP) e menor privilégio IAM; rodar `npm audit`. _(C4)_
  - [ ] 12.4 Gestão de segredos: `.gitignore` cobrindo `.env` e `~/.aws`; acesso
        à AWS pelo profile `sigfrota`; nunca logar/commitar chaves; policy do
        Bedrock com `bedrock:InvokeModel` restrito. Seguir
        `.kiro/steering/aws-credenciaisK.md`. _(C4)_
  - _Requisitos: 8, 11._

- [ ] 13. Integrar o Amazon Bedrock e desenhar a arquitetura AWS (critério C2)
  - [ ] 13.1 Usar o Bedrock (via AWS SDK para JS, profile `sigfrota`) para extrair
        regras do SQL/PL/SQL com rastreabilidade e apoiar a geração; evidenciar.
  - [ ] 13.2 Documentar o caminho de produção (API Gateway, Lambda Node/Fargate,
        Cognito, RDS/Aurora, S3 + CloudFront para o React) e, se der tempo, IaC.
  - _Requisitos: 10._

- [ ] 14. Documentar viabilidade e caminho para produção (critério C6)
  - Registrar o que falta (Km atual real, Cognito, FKs reais, demais painéis),
    custo/escala e potencial de reuso.
  - _Requisitos: 12._

- [ ] 15. Verificação final e relatório de aderência (desejável)
  - Rodar build + todos os testes (backend e frontend); conferir mapa
    regra→teste (R01–R23). Gerar relatório de aderência.
  - _Requisitos: 9 (F5)._
