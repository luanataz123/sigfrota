import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

/** Propriedades da stack base. */
export interface SigfrotaBaseStackProps extends StackProps {
  /**
   * Caminho do build do front (`web/dist`). Opcional; os testes injetam um
   * caminho inexistente para não depender do build. Usado na tarefa 5.
   */
  caminhoDist?: string;
}

/**
 * Stack base do SIG Frota (tabela, Cognito, HTTP API, front e parâmetros SSM).
 * Por enquanto vazia; os recursos entram nas tarefas 2 a 7 do spec `infra-base`.
 */
export class SigfrotaBaseStack extends Stack {
  /** Caminho do build do front recebido por prop (pode ser indefinido). */
  readonly caminhoDist?: string;

  constructor(scope: Construct, id: string, props: SigfrotaBaseStackProps = {}) {
    super(scope, id, props);
    this.caminhoDist = props.caminhoDist;
  }
}
