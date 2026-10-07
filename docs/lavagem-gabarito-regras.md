# Gabarito de regras de negócio — Módulo de Lavagem

**Uso:** medir a precisão da extração feita pela IA no hackathon. A equipe faz o
Kiro/Bedrock extraírem as regras do SQL/PL/SQL; comparamos com esta lista.
**Fonte real:** tabela `FR_LAVAGEM` (DDL) + página APEX 45 (validações, defaults,
dynamic actions e processos). Este gabarito reflete o sistema em produção.

---

## 1. Regras estruturais (na tabela / constraints)

| # | Regra | Origem no APEX |
|---|-------|----------------|
| R01 | `ID_LAVAGEM` é a chave primária, gerada por sequence (`FR_LAVAGEM_SEQ`). | Sequence + process "Get PK" |
| R02 | Campos obrigatórios: tipo de lavagem, data, km e veículo. | `NOT NULL` na DDL |
| R03 | Valor da lavagem, se informado, deve ser maior que zero. | CHECK `VL_LAVAGEM > 0` |
| R04 | Odômetro (km) deve ser maior que zero. | CHECK `KM_LAVAGEM > 0` + validação "KM > 0" |
| R05 | Tipo de lavagem deve existir no cadastro de tipos. | FK para `FR_TIPO_LAVAGEM` |
| R06 | Veículo deve existir. | FK para `FR_VEICULO` |
| R07 | Posto conveniado, quando informado, deve existir. | FK para `FR_POSTO` |
| R08 | Data de cadastro e cadastrador são preenchidos automaticamente (data atual e usuário logado). | Defaults `CURRENT_DATE` e `:APP_CORP_ID_USUARIO` |

## 2. Regras condicionais (no PL/SQL das validações — o "coração" a migrar)

| # | Regra | Origem no APEX |
|---|-------|----------------|
| R09 | A lavagem pode ser feita **na própria unidade** ("Na Unidade?" = Sim) ou externamente (Não). | Item `P45_PROPRIA_UNIDADE`, default "Sim" |
| R10 | Se a lavagem é **na própria unidade**, os campos valor, posto conveniado, posto não conveniado e CNPJ são dispensados/ocultados. | Dynamic action "Na própria Unidade" |
| R11 | Se a lavagem é **externa** (Não na unidade), o **valor é obrigatório**. | Validação "Informar Valor" (condicional) |
| R12 | Em lavagem externa, o usuário indica se o posto é **conveniado** ("Posto Conveniado?" = Sim/Não), default "Sim". | Item `P45_POSTO_CONVENIADO` |
| R13 | Se o posto é **conveniado**, deve-se **selecionar um posto** cadastrado (ID_POSTO obrigatório); os campos de posto não conveniado ficam ocultos. | Validação "Posto conveniado requerido" |
| R14 | Se o posto é **não conveniado**, são obrigatórios **descrição do posto (DS_POSTO)** e **CNPJ (CNPJ_POSTO)**; o campo de posto conveniado fica oculto. | Validação "Posto não conveniado requerido" |
| R15 | A data da lavagem deve ser uma data válida. | Validação "Data de Lavagem" (ITEM_IS_DATE) |
| R16 | O "Km Atual" do veículo é exibido como referência (somente leitura), obtido do último atendimento atendido do veículo. | Item display-only `P45_KM_ATUAL` (query em `FR_ATENDIMENTO`) — **no MVP, mockar com `FR_VEICULO_MOCK.KM_ATUAL`** |

## 3. Operações (CRUD)

| # | Regra | Origem no APEX |
|---|-------|----------------|
| R17 | Incluir nova lavagem (INSERT) quando não há ID; salvar alterações (UPDATE) quando há ID; excluir (DELETE) com confirmação. | Botões Salvar / Salvar Alterações / Excluir + process "Process Row of FR_LAVAGEM" (I:U:D) |
| R18 | Após salvar/excluir, retornar à lista de lavagens com mensagem de sucesso. | Branch para página 10 |

## 3.1 Painel de lavagens na tela de Veículo (página 10) — o "ver o resultado na tela"

Estas regras vêm da **região "Lavagens"** da página 10 (tela de Veículo). São o
coração do escopo "incluir uma lavagem e ver o resultado na própria tela".

| # | Regra | Origem no APEX |
|---|-------|----------------|
| R19 | A tela de Veículo exibe um painel que **lista as lavagens daquele veículo**, filtrado por `ID_VEICULO`, ordenado por data da lavagem. | Região (IR) "Lavagens" da página 10 — SQL abaixo |
| R20 | Colunas exibidas na lista: Tipo de Lavagem, Data (DD/MM/YYYY), Odômetro (Km) e Valor (moeda). | Colunas da worksheet da página 10 |
| R21 | Cada linha tem link que abre o formulário de lavagem (página 45) em modo edição, passando o `ID_LAVAGEM` da linha. | `p_detail_link` → `f?p=...:45:...:P45_ID_LAVAGEM:#ID_LAVAGEM#` |
| R22 | A tela tem o botão **"Incluir Lavagem"**, que abre o formulário (página 45) em modo inclusão. | Botão `P10_INCLUIR_LAVAGEM` |
| R23 | Após incluir pelo formulário e voltar, a lista do veículo é re-exibida **já com a nova lavagem** (é o "resultado na tela"). | Branch da página 45 → página 10 + re-query da região |

**SQL real da listagem (insumo de origem, página 10):**

```sql
SELECT LV.ID_LAVAGEM
     , LV.ID_TIPO_LAVAGEM
     , LV.DT_LAVAGEM
     , LV.KM_LAVAGEM
     , LV.VL_LAVAGEM
     , LV.ID_VEICULO
     , TLV.DS_TIPO_LAVAGEM
FROM FR_LAVAGEM LV
     INNER JOIN FR_TIPO_LAVAGEM TLV
             ON TLV.ID_TIPO_LAVAGEM = LV.ID_TIPO_LAVAGEM
WHERE LV.ID_VEICULO = :P10_ID_VEICULO
ORDER BY LV.DT_LAVAGEM;
```

Em Java/Spring, essa consulta vira o endpoint de listagem
(`GET /veiculos/{id}/lavagens`), e a tela re-renderiza a lista após a inclusão.

---

## 4. Observações para a migração Java

- As regras **R09 a R14** são a parte valiosa: são condicionais que no APEX estão
  espalhadas entre validações PL/SQL e dynamic actions. Em Java/Spring devem
  virar validação de serviço coesa (ex.: Bean Validation + regras no Service),
  com testes cobrindo cada ramo (unidade/externa × conveniado/não conveniado).
- **R16 (Km Atual)** depende de `FR_ATENDIMENTO` (outro módulo). Para manter a
  Lavagem autocontida no MVP, substituir pela coluna `KM_ATUAL` do mock de
  veículo. Registrar essa simplificação como decisão.
- Rastreabilidade esperada: cada requisito gerado pela IA deve citar a regra de
  origem (Rxx) — é o critério anti-alucinação do UC.

---

## 5. Casos de teste sugeridos (para o gabarito de precisão)

| Cenário | Entrada | Resultado esperado |
|---------|---------|--------------------|
| Feliz — conveniado | Externa, conveniado, posto=10, valor=60, km=45000 | Aceito |
| Feliz — não conveniado | Externa, não conveniado, DS_POSTO+CNPJ, valor=35, km=88800 | Aceito |
| Feliz — interna | Na unidade=Sim, sem valor/posto, km=12050 | Aceito |
| Erro — km zero | km=0 | Rejeitado (R04) |
| Erro — valor zero externo | Externa, valor=0 | Rejeitado (R03/R11) |
| Erro — externo sem valor | Externa, valor nulo | Rejeitado (R11) |
| Erro — conveniado sem posto | Externa, conveniado, ID_POSTO nulo | Rejeitado (R13) |
| Erro — não conveniado sem CNPJ | Externa, não conveniado, sem CNPJ | Rejeitado (R14) |
| Erro — data inválida | DT_LAVAGEM = "31/02/2026" | Rejeitado (R15) |
| Listagem por veículo | Veículo 101 (tem 1 lavagem no SQL sintético) | Lista retorna só as lavagens do 101, ordenadas por data (R19/R20) |
| Resultado na tela | Incluir lavagem válida no veículo 101 e recarregar a lista | A nova lavagem aparece no painel do veículo 101 (R23) |
