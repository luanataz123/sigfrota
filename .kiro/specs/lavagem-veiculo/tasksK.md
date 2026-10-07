# Plano de Implementação — Módulo de Lavagem de Veículo

Referências: `requirementsK.md` (requisitos), `designK.md` (design),
`docs/lavagem-gabarito-regras.md` (regras R01–R23),
`docs/lavagem-sintetico.sql` (DDL + dados).

Cada tarefa cita os requisitos atendidos. As tarefas são incrementais e devem
ser executadas em ordem; cada uma termina com código compilando e testes verdes.

- [ ] 1. Inicializar o projeto Spring Boot
  - Criar projeto Java 17 + Spring Boot 3 (Spring Web, Spring Data JPA, Validation,
    Thymeleaf, H2) com Maven.
  - Configurar `application.properties` (H2 em memória, carga de `schema.sql`/`data.sql`).
  - _Requisitos: base para todos; Restrições técnicas (seção 9 do caso de uso)._

- [ ] 2. Reproduzir o esquema e os dados fictícios
  - Criar `schema.sql` fiel ao `lavagem-sintetico.sql` (FR_TIPO_LAVAGEM,
    FR_VEICULO_MOCK, FR_POSTO_MOCK, FR_LAVAGEM com CHECKs e FKs; sequence).
  - Criar `data.sql` com os 3 tipos, 3 veículos, 2 postos e as 3 lavagens de exemplo.
  - _Requisitos: 1, 3, 8 (dados fictícios)._ 

- [ ] 3. Mapear entidades e repositórios
  - [ ] 3.1 Entidades `TipoLavagem`, `VeiculoMock` (com `kmAtual`), `PostoMock`.
  - [ ] 3.2 Entidade `Lavagem` com PK por sequence e mapeamento das colunas.
  - [ ] 3.3 Repositórios Spring Data; `LavagemRepository` com
        `findByVeiculo_IdOrderByDataLavagemAsc`.
  - _Requisitos: 1, 2 (R01), 3 (R05/R06/R07), 6 (R19)._

- [ ] 4. Definir DTOs de entrada e saída
  - `LavagemRequest` (inclui `propriaUnidade`, `postoConveniado`) com Bean
    Validation para estruturais (`@NotNull`, `@Positive`).
  - `LavagemResponse` (idLavagem, tipoLavagem, dataLavagem DD/MM/AAAA, km, valor).
  - _Requisitos: 2, 3 (R02/R03/R04), 6 (R20)._

- [ ] 5. Implementar as regras no `LavagemService`
  - [ ] 5.1 Validações estruturais: km>0, valor>0 se informado, data válida,
        existência de tipo/veículo/posto. _(R02, R03, R04, R05, R06, R07, R15)_
  - [ ] 5.2 Regras condicionais de local: própria unidade dispensa valor/posto;
        externa exige valor>0. _(R09, R10, R11)_
  - [ ] 5.3 Regras condicionais de posto: conveniado exige idPosto; não
        conveniado exige dsPosto+cnpjPosto. _(R12, R13, R14)_
  - [ ] 5.4 Persistência: gerar PK, preencher dataCadastro (atual) e cadastrador
        (mock), executar INSERT. _(R01, R08, R17)_
  - _Requisitos: 2, 3, 4, 5, 9 (comentar cada regra com seu Rxx)._

- [ ] 6. Testes unitários do serviço (gabarito de precisão)
  - Cobrir os 11 cenários da seção 5 do gabarito (3 felizes + erros + listagem +
    resultado na tela).
  - _Requisitos: 9 (F5), 3, 4, 5._

- [ ] 7. Expor os endpoints REST
  - [ ] 7.1 `GET /veiculos/{id}/lavagens` → lista ordenada por data. _(R19, R20)_
  - [ ] 7.2 `POST /veiculos/{id}/lavagens` → inclui e retorna a lista atualizada
        com mensagem de sucesso; `400` com erros `{campo, mensagem, regra}`.
        _(R17, R18, R23)_
  - [ ] 7.3 Endpoint/handler para dados do veículo (descrição + kmAtual mock). _(R16)_
  - _Requisitos: 1, 2, 6._

- [ ] 8. Testes de integração dos endpoints
  - `@SpringBootTest` + MockMvc para GET (filtro/ordenação) e POST (sucesso e erro).
  - _Requisitos: 2, 6._

- [ ] 9. Construir a tela acessível (Thymeleaf)
  - [ ] 9.1 Painel do veículo: identificação + tabela de lavagens com `<caption>`,
        `<th scope>`, botão "Incluir Lavagem". _(R16, R19, R20, R22)_
  - [ ] 9.2 Formulário de lavagem com `<label for>`, `<fieldset>/<legend>` para
        "Na Unidade?" e "Posto Conveniado?", exibição condicional de campos. _(R10, R13, R14)_
  - [ ] 9.3 Região `aria-live` para sucesso/erro; `aria-describedby` nos campos;
        foco e contraste. _(Requisito 7)_
  - [ ] 9.4 Re-renderizar a lista após o POST exibindo a nova lavagem. _(R23)_
  - _Requisitos: 1, 2, 4, 5, 7._

- [ ] 10. Aplicar privacidade desde o projeto
  - Garantir ausência de PII em logs (sem CNPJ/cadastrador em claro); cadastrador
    sempre do contexto mock; persistir só o necessário.
  - _Requisitos: 8._

- [ ] 11. Verificação final e relatório de aderência (desejável)
  - Rodar build + todos os testes; conferir mapa regra→teste (R01–R23).
  - Gerar relatório de aderência (regras do gabarito cobertas pelos testes).
  - _Requisitos: 9 (F5)._
