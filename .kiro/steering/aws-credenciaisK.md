---
inclusion: manual
---

# Credenciais da AWS CLI — projeto SigFrota

Orientações para usar as credenciais da AWS pela CLI neste projeto (ex.: invocar
o Amazon Bedrock — serviço essencial do caso de uso). Ative este steering com `#`
quando for executar comandos AWS.

## Profile do projeto

- Use sempre o profile nomeado **`sigfrota`** (não o `default`), passando
  `--profile sigfrota` em todos os comandos.
- Alternativamente, defina a variável de ambiente da sessão antes de uma
  sequência de comandos:
  ```powershell
  $env:AWS_PROFILE = "sigfrota"
  ```

## Configuração (feita uma vez, pelo usuário)

As credenciais são inseridas interativamente pelo próprio usuário — o agente não
deve digitar nem solicitar as chaves:

```powershell
aws configure --profile sigfrota
```
Valores: Access Key ID, Secret Access Key, região (ex.: `us-east-1` para
Bedrock) e formato de saída (`json`).

As credenciais ficam em `~/.aws/credentials` e as configurações em
`~/.aws/config`. **Não** versionar nem copiar esses arquivos para o repositório.

## Verificação (não expõe segredos)

```powershell
aws configure list --profile sigfrota      # mostra chaves mascaradas
aws sts get-caller-identity --profile sigfrota   # confirma autenticação
```

## Observações de ambiente (Windows / PowerShell)

- Se `aws` não for reconhecido, o executável fica em
  `C:\Users\kmoreira\AppData\Local\Programs\Amazon\AWSCLIV2\aws.exe` — chame pelo
  caminho completo ou reabra o terminal para o PATH ser recarregado.
- Em PowerShell, use `$env:NOME` para variáveis de ambiente (não a sintaxe
  `%NOME%` do cmd) e separe comandos com `;` (não `&&`).

## Regras de segurança (obrigatórias)

- **Nunca** imprima, logue ou cole o Access Key ID ou o Secret Access Key em
  respostas, arquivos do repositório ou mensagens de commit.
- **Nunca** faça `git add` de `~/.aws/*`, de arquivos `.env` ou de qualquer
  arquivo com segredos.
- Prefira passar valores de credencial por variável de ambiente ou pelo profile,
  não embutidos em comandos ou no código.
- Siga o princípio do menor privilégio nas policies IAM associadas a estas
  credenciais (ex.: liberar apenas `bedrock:InvokeModel` no modelo usado e o
  acesso estritamente necessário). (Alinhado ao critério de Segurança C4.)
- Se um segredo for exposto por engano, rotacione a chave no IAM imediatamente.
