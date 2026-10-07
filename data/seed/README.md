# Dados sintéticos do módulo de Lavagem (`data/seed/`)

> **Dados 100% fictícios.** Não há nomes, CPF, matrícula ou e-mail: cadastradores aparecem só por ID (9001–9004). Placas, CNPJs e nomes de postos foram inventados; qualquer coincidência com dados reais é acidental.

Itens no formato do DynamoDB DocumentClient (JSON simples, não `AttributeValue` tipado), para a tabela única descrita em "Modelagem no DynamoDB" no README da raiz. Todo item tem `PK`, `SK` e `entityType`. Não há GSI no MVP.

## Arquivos

| Arquivo | Conteúdo | Uso |
|---------|----------|-----|
| `gabarito/itens.json` | Exatamente os registros de `docs/lavagem-sintetico.sql`: 3 tipos, 3 veículos, 2 postos, 3 lavagens (3397–3399) e o contador (`ultimoId` 3399). 12 itens | Testes do domínio contra o gabarito (o veículo 101 tem só 1 lavagem) |
| `demo/itens.json` | O gabarito (igual, exceto o `cnpjPosto` da 3398, que no demo é `12.345.678/0001-95`) mais o histórico ampliado: 3 tipos, 18 veículos, 6 postos conveniados, 253 lavagens (250 novas, IDs 3400–3649, de 2025-10-02 a 2026-09-30) e o contador (`ultimoId` 3649). 281 itens | Front com mock, carga na tabela, demo |
| `demo/anomalias.json` | 7 lavagens suspeitas plantadas no demo: `{ idLavagem, idVeiculo, tipo, descricao }` | Medir a detecção de anomalias |
| `recibos/recibo-<idLavagem>.png` | 8 recibos fictícios (600×800 a 144 dpi), marcados "DOCUMENTO FICTÍCIO" | Entrada da leitura de recibo (Bedrock) |
| `recibos/esperado.json` | Por recibo: `{ arquivo, idLavagem, vlLavagem, dtLavagem, nomePosto, cnpj }` | Comparar campo a campo com o que a IA extraiu |
| `gerar-seed.mjs` | Gerador determinístico (PRNG `mulberry32`, semente fixa) | Regenerar tudo |
| `seed.test.mjs` | Invariantes (`node:test`, sem dependências) | Garantir que os dados seguem as regras |

Lavagens do demo: 101 internas (39,9%), 113 em posto conveniado e 39 em não conveniado (74,3% das externas são conveniadas).

## Como instalar, regenerar e testar

A partir da raiz do repositório (PowerShell):

```
npm install --prefix data/seed     # instala só o sharp (SVG -> PNG), versão fixa
node data/seed/gerar-seed.mjs      # regenera JSON e PNG (mesmo resultado sempre)
node --test data/seed/             # roda seed.test.mjs
```

Opções do gerador: `--out <dir>` grava em outro diretório; `--sem-png` grava só os JSON (não precisa do `sharp`). O gerador se autochecha e falha antes de gravar se algum critério não fechar.

`node --test data/seed/` funciona porque o `package.json` aponta `main` para `seed.test.mjs`; `node --test "data/seed/*.test.mjs"` também serve.

## Chaves e acessos

| Entidade | `PK` | `SK` | `entityType` |
|----------|------|------|--------------|
| Veículo | `CATALOGO` | `VEICULO#<idVeiculo>` | `VEICULO` |
| Tipo de lavagem | `CATALOGO` | `TIPO#<idTipoLavagem>` | `TIPO_LAVAGEM` |
| Posto conveniado | `CATALOGO` | `POSTO#<idPosto>` | `POSTO` |
| Lavagem | `VEICULO#<idVeiculo>` | `LAVAGEM#<idLavagem>` | `LAVAGEM` |
| Contador | `CONTADOR` | `LAVAGEM` | `CONTADOR` |

Catálogo: `Query PK = CATALOGO`. Lavagens do veículo: `Query PK = VEICULO#id, SK begins_with LAVAGEM#` (ordenar por data na Lambda). Uma lavagem: `GetItem`. Novo ID: `UpdateItem ADD ultimoId :1` no contador.

## Mapeamento coluna legada → atributo

| Atributo | Coluna legada | Observação |
|----------|---------------|------------|
| `idVeiculo`, `dsVeiculo`, `kmAtual` | `FR_VEICULO_MOCK.ID_VEICULO`, `DS_VEICULO`, `KM_ATUAL` | `dsVeiculo` no formato legado, ex. `Fiat Strada de placa VCO0T99` |
| `placa`, `marca`, `modelo` | extraídos de `DS_VEICULO` | novos |
| `ano` | — | novo, inventado (101: 2022, 102: 2019, 103: 2025) |
| `idTipoLavagem`, `dsTipoLavagem` | `FR_TIPO_LAVAGEM.ID_TIPO_LAVAGEM`, `DS_TIPO_LAVAGEM` | |
| `vlReferenciaMin`, `vlReferenciaMax` | — | só no demo: Simples 30–50, Completa 55–95, Higienizacao interna 120–220 |
| `idPosto`, `nmPosto` | `FR_POSTO_MOCK.ID_POSTO`, `NM_POSTO` | |
| `cnpj` (posto) | — | só no demo, presente em todo posto, com dígito válido |
| `idLavagem` | `FR_LAVAGEM.ID_LAVAGEM` | R01 |
| `idTipoLavagem`, `dtLavagem`, `kmLavagem`, `idVeiculo` | `ID_TIPO_LAVAGEM`, `DT_LAVAGEM`, `KM_LAVAGEM`, `ID_VEICULO` | obrigatórios (R02); data em `yyyy-mm-dd` |
| `vlLavagem` | `VL_LAVAGEM` | `null` ou > 0, até 999,99 (`NUMBER(5,2)`) |
| `dsTipoLavagem` (lavagem) | join com `FR_TIPO_LAVAGEM` | desnormalizado para a listagem (R20) |
| `dsPosto`, `cnpjPosto`, `idPosto` | `DS_POSTO`, `CNPJ_POSTO`, `ID_POSTO` | `null` quando não se aplica |
| `idPessoaCadastrador`, `dtCadastro` | `ID_PESSOA_CADASTRADOR`, `DT_CADASTRO` | R08 |
| `propriaUnidade` | derivado (item APEX `P45_PROPRIA_UNIDADE`) | `true` quando não há valor nem posto |
| `postoConveniado` | derivado (item APEX `P45_POSTO_CONVENIADO`) | `true` com `ID_POSTO`; `false` com `DS_POSTO` + `CNPJ_POSTO`; `null` se `propriaUnidade` |
| `ultimoId` (contador) | `FR_LAVAGEM_SEQ` | começa em 3400 (a sequence em 3397 colidiria com 3397–3399) |

Exemplo de lavagem em posto não conveniado:

```json
{ "PK": "VEICULO#101", "SK": "LAVAGEM#3512", "entityType": "LAVAGEM", "idLavagem": 3512,
  "idTipoLavagem": 1, "dsTipoLavagem": "Simples", "dtLavagem": "2026-03-30", "kmLavagem": 34705,
  "vlLavagem": 44.55, "idVeiculo": 101, "dsPosto": "Lava-Jato Boa Vista", "cnpjPosto": "71.746.193/0001-72",
  "idPosto": null, "idPessoaCadastrador": 9003, "dtCadastro": "2026-03-31",
  "propriaUnidade": false, "postoConveniado": false }
```

## Como a lavagem se liga ao posto

Fiel ao legado (R13 e R14), o vínculo depende do tipo de lavagem:

| Lavagem | Vínculo | Onde está o CNPJ |
|---------|---------|------------------|
| Posto conveniado (`postoConveniado: true`) | `idPosto` → item `PK = CATALOGO`, `SK = POSTO#<idPosto>` | No posto do catálogo (`cnpj`); na lavagem, `dsPosto` e `cnpjPosto` são `null` |
| Posto não conveniado (`postoConveniado: false`) | Nenhum: o posto não é cadastrado | Na própria lavagem (`dsPosto` + `cnpjPosto`); `idPosto` é `null` |
| Interna (`propriaUnidade: true`) | Não tem posto | — |

Para relatórios por posto ou para achar um posto pelo CNPJ lido de um recibo, junte as duas fontes: o catálogo carregado por `Query PK = CATALOGO` e os campos da lavagem.

## Coerência do demo

- Km estritamente crescente por veículo (~1.500–3.000 km/mês) e no máximo uma lavagem por veículo por dia, exceto as anomalias.
- Veículos 101–103: o histórico novo é anterior, em data e km, à lavagem original do SQL. O 103 começa em mar/2026 (carro com 12.050 km).
- `dtCadastro` de 0 a 3 dias após `dtLavagem`; nenhuma data após 2026-10-06. IDs novos atribuídos em ordem de `dtCadastro`.
- Postos conveniados 12–15 são novos; 10 e 11 ganham `cnpj` no demo. 5 postos não conveniados reaproveitados entre lavagens.

## Anomalias

Critérios (os mesmos no gerador e nos testes; fora do manifesto, nenhuma lavagem os satisfaz):

- `VALOR_ACIMA_MEDIA`: `vlLavagem >= 3 ×` a média de `vlLavagem` das lavagens do demo com o mesmo tipo (a média inclui a própria).
- `MESMO_DIA`: outra lavagem do mesmo veículo na mesma `dtLavagem` com `idLavagem` menor.
- `KM_REGREDIDO`: `kmLavagem` menor que o da lavagem anterior do veículo, ordenando por `(dtLavagem, idLavagem)`.

| idLavagem | Veículo | Tipo | Descrição |
|-----------|---------|------|-----------|
| 3418 | 111 | KM_REGREDIDO | Km 26.862 menor que os 27.387 da lavagem anterior (3405) |
| 3469 | 116 | VALOR_ACIMA_MEDIA | Valor R$ 569,42 é 3,2x a média das lavagens Higienizacao interna (R$ 175,40) |
| 3483 | 104 | MESMO_DIA | Segunda lavagem do veículo 104 em 2026-02-17 (a primeira é a 3482) |
| 3538 | 105 | MESMO_DIA | Segunda lavagem do veículo 105 em 2026-04-24 (a primeira é a 3537) |
| 3553 | 113 | VALOR_ACIMA_MEDIA | Valor R$ 142,82 é 3,4x a média das lavagens Simples (R$ 42,33) |
| 3579 | 108 | KM_REGREDIDO | Km 63.825 menor que os 64.111 da lavagem anterior (3573) |
| 3612 | 114 | VALOR_ACIMA_MEDIA | Valor R$ 252,46 é 3,3x a média das lavagens Completa (R$ 75,53) |

Todas continuam válidas pelas regras do gabarito: são suspeitas de negócio, não erros de validação.

## Recibos

8 lavagens externas do demo, nenhuma anômala: 4 em postos conveniados (12, 13, 14, 15; `nomePosto`/`cnpj` vêm do catálogo) e 4 em não conveniados (`dsPosto`/`cnpjPosto` da lavagem). Cada imagem mostra nome do posto, CNPJ, data (dd/mm/aaaa), serviço e valor. Sugestão para medir a extração: comparar valor como número, data em ISO, nome normalizado (sem caixa/acentos) e CNPJ só com dígitos, e reportar o % de acerto por campo.

## Particularidades herdadas do legado

- CNPJ da 3398: no gabarito fica `12.345.678/0001-90`, com dígito inválido, igual ao SQL, porque é a fixture dos casos de teste. No demo ele vira `12.345.678/0001-95` (DV correto), já que o demo só traz dados que o sistema já validou. Todo CNPJ do demo é válido, tanto em lavagens quanto em postos 10–15. No gabarito, o da 3398 é o único CNPJ, e os postos não têm `cnpj`.
- Nas lavagens 3398 (88.800) e 3399 (12.050), o km passa do `kmAtual` do veículo (88.750 e 12.030); mantido como no SQL.
- Datas sem hora, como as colunas `DATE` do legado.
