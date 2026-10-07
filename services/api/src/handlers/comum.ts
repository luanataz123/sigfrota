// Instância do serviço com o repositório DynamoDB real, criada uma vez por
// ambiente de execução da Lambda (reaproveitada entre invocações).

import { RepositorioDynamo } from '../repositorio';
import { ServicoLavagens } from '../servico';

export function criarServico(): ServicoLavagens {
  // `TABELA_NOME` é injetada pelo construto FuncaoLambda (infra).
  const tabela = process.env.TABELA_NOME;
  if (!tabela) throw new Error('Variável TABELA_NOME não configurada.');
  return new ServicoLavagens(new RepositorioDynamo(tabela));
}
