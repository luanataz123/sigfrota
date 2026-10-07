import { RemovalPolicy } from 'aws-cdk-lib';
import {
  AttributeType,
  BillingMode,
  Table,
  TableEncryption,
  type ITable,
} from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { PREFIXO } from '../config';

/**
 * Nome da tabela única do módulo de Lavagem (modelagem no README da raiz).
 * É uma função, e não uma constante, porque `config.ts` importa a stack base,
 * que importa este arquivo: avaliar `PREFIXO` no topo do módulo, durante esse
 * ciclo de import, poderia ler o valor ainda indefinido.
 */
export function nomeTabela(): string {
  return `${PREFIXO}-lavagem`;
}

/**
 * Tabela DynamoDB única do SIG Frota — módulo de Lavagem (Requisito 3).
 *
 * - Chaves `PK`/`SK` do tipo string, sem GSI no MVP (3.1).
 * - Cobrança sob demanda (3.2).
 * - Criptografia em repouso com chave KMS gerenciada pela AWS (`aws/dynamodb`) (3.3).
 * - Point-in-time recovery habilitado (3.4).
 * - `RemovalPolicy.DESTROY`, para o `destroy` limpar a conta do integrante (2.6).
 *
 * O construto não concede acesso a nenhum principal: as permissões nascem
 * apenas nas `FuncaoLambda` que declararem `acessoTabela` (3.5).
 */
export class Tabela extends Construct {
  /** Tabela criada, exposta para o contrato de infra. */
  readonly tabela: ITable;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.tabela = new Table(this, 'Tabela', {
      tableName: nomeTabela(),
      partitionKey: { name: 'PK', type: AttributeType.STRING },
      sortKey: { name: 'SK', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }
}
