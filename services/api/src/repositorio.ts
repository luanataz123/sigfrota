// Acesso ao DynamoDB (tabela única). Só `Query`, `GetItem`, `PutItem`,
// `UpdateItem` e `DeleteItem`, sem `Scan`. As expressões são fixas e os valores
// sempre vão em `ExpressionAttributeValues` (nada de concatenar texto do usuário).

import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { chaves, type Item, type ItemLavagem } from './tipos';

/** Contrato do repositório; os testes usam uma implementação em memória. */
export interface Repositorio {
  obter(pk: string, sk: string): Promise<Item | undefined>;
  /** `Query PK = pk AND begins_with(SK, prefixo)`, com paginação. */
  consultar(pk: string, prefixoSk: string): Promise<Item[]>;
  /** R01: incrementa o contador atômico e devolve o novo ID. */
  proximoIdLavagem(): Promise<number>;
  /** Grava uma lavagem nova; `false` se a chave já existir. */
  inserir(item: ItemLavagem): Promise<boolean>;
  /** Substitui uma lavagem existente; `false` se ela não existir. */
  substituir(item: ItemLavagem): Promise<boolean>;
  /** Exclui uma lavagem existente; `false` se ela não existir. */
  excluir(pk: string, sk: string): Promise<boolean>;
}

function condicaoFalhou(erro: unknown): boolean {
  return (
    erro instanceof ConditionalCheckFailedException ||
    (erro as { name?: string } | null)?.name === 'ConditionalCheckFailedException'
  );
}

export class RepositorioDynamo implements Repositorio {
  private readonly doc: DynamoDBDocumentClient;

  constructor(
    private readonly tabela: string,
    cliente: DynamoDBClient = new DynamoDBClient({}),
  ) {
    this.doc = DynamoDBDocumentClient.from(cliente);
  }

  async obter(pk: string, sk: string): Promise<Item | undefined> {
    const r = await this.doc.send(new GetCommand({ TableName: this.tabela, Key: { PK: pk, SK: sk } }));
    return r.Item;
  }

  async consultar(pk: string, prefixoSk: string): Promise<Item[]> {
    const itens: Item[] = [];
    let inicio: Record<string, unknown> | undefined;
    do {
      const r = await this.doc.send(
        new QueryCommand({
          TableName: this.tabela,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefixo)',
          ExpressionAttributeValues: { ':pk': pk, ':prefixo': prefixoSk },
          ExclusiveStartKey: inicio,
        }),
      );
      itens.push(...(r.Items ?? []));
      inicio = r.LastEvaluatedKey;
    } while (inicio);
    return itens;
  }

  async proximoIdLavagem(): Promise<number> {
    // O contador precisa existir (carga do seed); sem ele, o ADD começaria em 1.
    const r = await this.doc.send(
      new UpdateCommand({
        TableName: this.tabela,
        Key: chaves.contador,
        UpdateExpression: 'ADD ultimoId :um',
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeValues: { ':um': 1 },
        ReturnValues: 'UPDATED_NEW',
      }),
    );
    const id = Number(r.Attributes?.ultimoId);
    if (!Number.isInteger(id)) throw new Error('Contador de lavagens inválido.');
    return id;
  }

  async inserir(item: ItemLavagem): Promise<boolean> {
    return this.gravar(item, 'attribute_not_exists(PK)');
  }

  async substituir(item: ItemLavagem): Promise<boolean> {
    return this.gravar(item, 'attribute_exists(PK)');
  }

  async excluir(pk: string, sk: string): Promise<boolean> {
    try {
      await this.doc.send(
        new DeleteCommand({
          TableName: this.tabela,
          Key: { PK: pk, SK: sk },
          ConditionExpression: 'attribute_exists(PK)',
        }),
      );
      return true;
    } catch (erro) {
      if (condicaoFalhou(erro)) return false;
      throw erro;
    }
  }

  private async gravar(item: ItemLavagem, condicao: string): Promise<boolean> {
    try {
      await this.doc.send(
        new PutCommand({ TableName: this.tabela, Item: item, ConditionExpression: condicao }),
      );
      return true;
    } catch (erro) {
      if (condicaoFalhou(erro)) return false;
      throw erro;
    }
  }
}
