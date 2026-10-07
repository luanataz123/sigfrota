# Carga dos dados sintéticos no DynamoDB (`data/carga/`)

Script que grava os itens de `data/seed/demo/itens.json` (ou outro JSON no mesmo formato DocumentClient) na tabela única do módulo de Lavagem, descrita em "Modelagem no DynamoDB" no README da raiz. Os dados são 100% fictícios. A tabela de produção vem da IaC (CDK/SAM); o script só carrega dados.

## Pré-requisitos

- Node.js 20 ou superior.
- Credenciais AWS na sua máquina, por perfil (`aws configure` ou `aws configure sso`) ou pela cadeia padrão do SDK (variáveis de ambiente, SSO, role).
- A tabela criada pela IaC. Enquanto ela não existir, `--criar-tabela` serve de atalho.

## Instalação e testes

A partir da raiz do repositório (PowerShell):

```
npm install --prefix data/carga
node --test data/carga/
```

Os testes usam um cliente fake injetado: não acessam a AWS nem a rede. `node --test data/carga/` funciona porque o `package.json` aponta `main` para `carga.test.mjs` (mesmo padrão de `data/seed`); `npm test --prefix data/carga` também serve.

## Opções

| Opção | Descrição |
|-------|-----------|
| `--tabela <nome>` | Tabela de destino. Obrigatória, ou pela variável `TABELA_LAVAGEM` |
| `--arquivo <caminho>` | JSON com os itens. Padrão: `../seed/demo/itens.json` relativo ao script (funciona de qualquer pasta). Um caminho informado é relativo à pasta atual do terminal |
| `--regiao <região>` | Padrão: `AWS_REGION`; senão, a região configurada no `--perfil`; sem perfil, `us-east-1` |
| `--perfil <perfil>` | Perfil do `~/.aws`. Sem ele, vale a cadeia padrão do SDK |
| `--dry-run` | Valida o arquivo e mostra contagens e lotes, sem chamar a AWS |
| `--criar-tabela` | Cria a tabela se não existir: `PK`/`SK` string, `PAY_PER_REQUEST`, espera ficar `ACTIVE`. A criptografia em repouso é a padrão do DynamoDB (chave da AWS, sem custo de KMS) |
| `--limpar` | Apaga TODOS os itens da tabela antes da carga. Exige `--confirmar <nome>` |
| `--confirmar <nome>` | Tem de ser idêntico a `--tabela`; senão o script aborta sem apagar nada |
| `--tentativas <n>` | Envios por lote ao reprocessar `UnprocessedItems` (padrão 8) |
| `--verbose` | Mostra o stack dos erros |
| `-h`, `--help` | Ajuda |

Códigos de saída: `0` sucesso; `1` erro de execução ou da AWS; `2` erro de uso ou arquivo inválido (nada foi gravado).

## Passo a passo na sua conta AWS

1. Configure o perfil, uma vez:

   ```
   aws configure --profile hackathon          # chave de acesso
   aws configure sso --profile hackathon      # ou IAM Identity Center
   aws sso login --profile hackathon          # quando o login SSO expirar
   ```

2. Valide sem tocar na AWS:

   ```
   node data/carga/carregar-dynamodb.mjs --tabela sigfrota-lavagem --dry-run
   ```

   Esperado para o demo: VEICULO 18, TIPO_LAVAGEM 3, POSTO 6, LAVAGEM 253, CONTADOR 1, total 281, 12 lotes.

3. Carregue:

   ```
   node data/carga/carregar-dynamodb.mjs --tabela sigfrota-lavagem --perfil hackathon --regiao us-east-1
   ```

   Se a IaC ainda não criou a tabela, acrescente `--criar-tabela`. É só um atalho para começar: depois que o CDK/SAM criar a tabela, ela é a fonte da verdade (nome, chaves, criptografia, backup) e o script não deve mais criá-la.

4. Confira no console do DynamoDB (Tabelas → `sigfrota-lavagem` → Explorar itens) ou pela CLI:

   ```
   aws dynamodb scan --table-name sigfrota-lavagem --select COUNT --profile hackathon --region us-east-1
   ```

   O `Count` deve ser 281 numa tabela que só tem o demo. No console, uma consulta com `PK = CATALOGO` deve trazer 27 itens (18 veículos, 3 tipos, 6 postos) e `PK = VEICULO#101` as lavagens desse veículo.

5. Para recomeçar do zero (destrutivo, apaga tudo):

   ```
   node data/carga/carregar-dynamodb.mjs --tabela sigfrota-lavagem --perfil hackathon --limpar --confirmar sigfrota-lavagem
   ```

Com a variável de ambiente no lugar de `--tabela`:

```
$env:TABELA_LAVAGEM = 'sigfrota-lavagem'
npm run carregar --prefix data/carga -- --perfil hackathon --dry-run
```

## Como a carga funciona

- Valida o arquivo inteiro antes de qualquer escrita: array não vazio; todo item com `PK` e `SK` texto não vazio e `entityType` conhecido; nenhuma `PK`+`SK` repetida; exatamente um `CONTADOR` (`PK=CONTADOR`, `SK=LAVAGEM`, `ultimoId` inteiro > 0). Falhou, aborta com código 2 sem gravar nada.
- Grava os itens como estão, com `BatchWriteItem` em lotes de 25, e reenvia os `UnprocessedItems` com backoff exponencial e jitter. Se esgotar as tentativas, sai com código 1 e informa quantos itens não foram gravados.
- É idempotente: rodar de novo sobrescreve os mesmos itens com o mesmo conteúdo.
- Se a tabela não existir e não houver `--criar-tabela`, para antes de gravar.
- O resumo final traz itens por `entityType`, lotes, reenvios, contador, tempo, tabela e região. Nenhuma lavagem é impressa linha a linha.

### Contador

O item `CONTADOR` (`ultimoId`, 3649 no demo) gera os IDs de novas lavagens (`UpdateItem ADD ultimoId :1`). Ele é gravado à parte, depois dos lotes, com `PutItem` condicional (`attribute_not_exists(PK) OR ultimoId <= :novo`). Se a tabela já tiver um `ultimoId` maior, porque a demo já incluiu lavagens, o valor atual é mantido e o resumo avisa: sem `--limpar`, o contador nunca regride, o que evitaria IDs repetidos. Com `--limpar`, a tabela fica só com o arquivo e o contador volta ao valor dele.

### Gabarito

`data/seed/gabarito/itens.json` é fixture dos testes do domínio e contém dado legado inválido (o CNPJ da lavagem 3398, com dígito verificador errado, igual ao SQL). O script avisa quando o arquivo é o gabarito (caminho com "gabarito" ou exatamente 3 lavagens), mas não bloqueia. Não use o gabarito como dado da demo: o demo só tem dados já validados.

## Policy IAM de menor privilégio

Restrita ao ARN da tabela. Troque `<regiao>`, `<conta>` e `<tabela>`. Os dois últimos statements são opcionais: inclua só se for usar `--criar-tabela` ou `--limpar` (a exclusão usa `BatchWriteItem`, já liberado).

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CargaLavagem",
      "Effect": "Allow",
      "Action": ["dynamodb:BatchWriteItem", "dynamodb:PutItem", "dynamodb:DescribeTable"],
      "Resource": "arn:aws:dynamodb:<regiao>:<conta>:table/<tabela>"
    },
    {
      "Sid": "OpcionalCriarTabela",
      "Effect": "Allow",
      "Action": "dynamodb:CreateTable",
      "Resource": "arn:aws:dynamodb:<regiao>:<conta>:table/<tabela>"
    },
    {
      "Sid": "OpcionalLimpar",
      "Effect": "Allow",
      "Action": "dynamodb:Scan",
      "Resource": "arn:aws:dynamodb:<regiao>:<conta>:table/<tabela>"
    }
  ]
}
```

## Segurança

- Credenciais nunca vão para o repositório: use perfil ou SSO. O script não lê, não imprime e não registra credenciais; elas ficam com a cadeia padrão do SDK.
- Erros comuns (tabela inexistente, credenciais ausentes ou expiradas, acesso negado) viram mensagens curtas em português, sem stack trace; `--verbose` mostra o stack.
- `--limpar` é destrutivo e exige `--confirmar` com o nome exato da tabela.
- Toda tabela do DynamoDB, inclusive a criada por `--criar-tabela`, já é criptografada em repouso com a chave padrão da AWS; o SDK usa HTTPS.
- Dados 100% fictícios, sem dado pessoal (cadastradores só por ID); os logs não trazem dados de lavagem.
