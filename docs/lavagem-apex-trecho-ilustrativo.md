# Trecho ilustrativo — o código APEX "antes" (módulo de Lavagem)

**Para que serve:** mostrar, de forma legível, as regras de negócio que hoje
vivem no PL/SQL da página APEX 45 (Lavagem de Veículo). É o "antes" da migração
— o insumo que a IA lê para extrair as regras e gerar o Java.

> **Observação importante.** A página 45 real tem ~683 linhas em formato de
> **metadados do APEX** (chamadas `wwv_flow_imp_page.create_...`), pouco legível
> para humanos. Os trechos abaixo são as **partes de regra de negócio** (PL/SQL)
> recortadas desse arquivo — o que de fato precisa ser entendido e migrado. O
> arquivo completo é `apex/Frota-Apex/application/pages/page_00045.sql`.

---

## 1. Validação: posto conveniado é obrigatório quando a lavagem é externa

```sql
IF :P45_PROPRIA_UNIDADE = 'N'
   AND :P45_POSTO_CONVENIADO = 'S'
   AND :P45_ID_POSTO IS NULL THEN
    RETURN 'Selecionar Posto conveniado!';
ELSE
    RETURN NULL;
END IF;
```
→ Regra **R13**: se a lavagem é externa e o posto é conveniado, é obrigatório
selecionar o posto.

---

## 2. Validação: posto não conveniado exige descrição e CNPJ

```sql
IF :P45_POSTO_CONVENIADO = 'N' THEN
    IF :P45_DS_POSTO IS NULL THEN
        RETURN 'Posto não conveniado deve ter algum valor.';
    ELSIF :P45_CNPJ_POSTO IS NULL THEN
        RETURN 'CNPJ Posto não conveniado deve ter algum valor.';
    END IF;
ELSE
    RETURN NULL;
END IF;
```
→ Regra **R14**: posto não conveniado obriga descrição (DS_POSTO) e CNPJ.

---

## 3. Validação: valor obrigatório apenas quando a lavagem é externa

```
Item associado: P45_VL_LAVAGEM
Tipo: ITEM_NOT_NULL
Condição: executa quando P45_PROPRIA_UNIDADE = 'N'
Mensagem de erro: "Valor deve ter algum valor!"
```
→ Regra **R11**: em lavagem externa (fora da própria unidade), o valor é
obrigatório. (Na própria unidade, é dispensado.)

---

## 4. Validação: quilometragem deve ser positiva

```sql
:P45_KM_LAVAGEM is not null and :P45_KM_LAVAGEM > 0;
```
→ Regra **R04**: odômetro (km) obrigatório e maior que zero.

---

## 5. Validação: data da lavagem precisa ser uma data válida

```
Item associado: P45_DT_LAVAGEM
Tipo: ITEM_IS_DATE
Mensagem de erro: "Data da Lavagem inválida!"
```
→ Regra **R15**: a data informada deve ser válida.

---

## 6. Geração da chave e gravação (INSERT/UPDATE/DELETE)

```sql
-- Antes de gravar, gera a PK a partir da sequence (se for inclusão)
IF :P45_ID_LAVAGEM IS NULL THEN
    SELECT "FR_LAVAGEM_SEQ".NEXTVAL INTO :P45_ID_LAVAGEM FROM SYS.DUAL;
END IF;
```
```
Processo "Process Row of FR_LAVAGEM": grava na tabela FR_LAVAGEM
Operações permitidas: I:U:D  (Insert / Update / Delete)
```
→ Regras **R01** e **R17**: PK por sequence; incluir, alterar e excluir
lavagens.

---

## 7. Comportamento de tela (mostra/esconde campos conforme o contexto)

No APEX, "dynamic actions" controlam a interface conforme as escolhas:

- Se **"Na Unidade?" = Não** → mostra valor, posto conveniado e campos de posto.
- Se **"Na Unidade?" = Sim** → esconde valor e posto (lavagem interna).
- Se **"Posto Conveniado?" = Sim** → mostra a lista de postos; esconde
  descrição/CNPJ.
- Se **"Posto Conveniado?" = Não** → mostra descrição e CNPJ; esconde a lista.

→ Regras **R09, R10, R12**: a lógica condicional de obrigatoriedade e exibição.

---

## 8. Painel de lavagens na tela de Veículo (página 10) — a listagem

Além do formulário (página 45), a **tela de Veículo (página 10)** tem a região
"Lavagens", que lista as lavagens daquele veículo. É esse painel que exibe o
"resultado da inclusão" depois que o usuário salva uma lavagem nova.

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
→ Regras **R19/R20**: lista as lavagens do veículo (filtro por `ID_VEICULO`,
ordem por data), exibindo tipo, data, odômetro e valor.

- Cada linha abre o formulário (página 45) em edição, via link que passa o
  `ID_LAVAGEM` (**R21**).
- O botão "Incluir Lavagem" (`P10_INCLUIR_LAVAGEM`) abre o formulário em modo de
  inclusão (**R22**).
- Ao voltar da inclusão, a lista é recarregada já com a lavagem nova (**R23**) —
  é o "ver o resultado na tela".

Em Java, esta consulta vira o endpoint `GET /veiculos/{id}/lavagens`, e a tela
re-renderiza a lista após o POST de inclusão.

---

## Resumo para a conversa

- O que o APEX guarda é **metadado + PL/SQL espalhado** entre validações,
  processos e ações de tela.
- A IA (no hackathon) lê isso e produz a **lista de regras limpa**
  (ver `lavagem-gabarito-regras.md`) e, a partir dela, o **código Java** com
  essas regras concentradas no serviço, testadas.
- Este arquivo é o "antes" legível; o gabarito é o "o que se extrai"; o Java
  gerado no evento é o "depois".
