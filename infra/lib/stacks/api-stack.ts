import * as path from 'node:path';
import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { ContratoInfra, MetodoRota } from '../contrato';
import { registrarRota } from '../contrato';
import { FuncaoLambda, type AcessoTabela } from '../constructs/funcao-lambda';

/** Propriedades da stack da API de lavagens (spec 3). */
export interface SigfrotaApiStackProps extends StackProps {
  /** Contrato publicado pela stack base. */
  readonly contrato: ContratoInfra;
}

/** Pasta dos handlers em `services/api` (infra/lib/stacks → raiz do monorepo). */
const HANDLERS = path.resolve(__dirname, '../../../services/api/src/handlers');

interface DefinicaoFuncao {
  readonly id: string;
  readonly arquivo: string;
  /** Vai também para a role IAM, que não aceita travessão (—): use hífen. */
  readonly descricao: string;
  /** Ações DynamoDB específicas (menor privilégio, Requisito 7.3). */
  readonly acoes: string[];
  readonly rotas: ReadonlyArray<{ metodo: MetodoRota; caminho: string }>;
}

/**
 * API REST do módulo de Lavagem: três Lambdas, uma por perfil de permissão.
 *
 * - Catálogo (leitura): veículo (R16), tipos (R05) e postos (R13).
 * - Lavagens, leitura: painel do veículo (R19/R20) e edição (R21).
 * - Lavagens, escrita: inclusão, alteração e exclusão (R17), com contador
 *   atômico (R01), checagem de catálogo (R05–R07) e cadastrador do token (R08).
 *
 * Todas as rotas exigem o JWT do Cognito (authorizer padrão do contrato).
 */
export class SigfrotaApiStack extends Stack {
  constructor(scope: Construct, id: string, props: SigfrotaApiStackProps) {
    super(scope, id, props);
    const { contrato } = props;

    const funcoes: DefinicaoFuncao[] = [
      {
        id: 'Catalogo',
        arquivo: 'catalogo.ts',
        descricao: 'SIG Frota - catálogo de veículos, tipos e postos',
        acoes: ['dynamodb:GetItem', 'dynamodb:Query'],
        rotas: [
          { metodo: 'GET', caminho: '/veiculos/{idVeiculo}' },
          { metodo: 'GET', caminho: '/tipos-lavagem' },
          { metodo: 'GET', caminho: '/postos' },
        ],
      },
      {
        id: 'LavagensLeitura',
        arquivo: 'lavagens-leitura.ts',
        descricao: 'SIG Frota - leitura das lavagens de um veículo',
        acoes: ['dynamodb:GetItem', 'dynamodb:Query'],
        rotas: [
          { metodo: 'GET', caminho: '/veiculos/{idVeiculo}/lavagens' },
          { metodo: 'GET', caminho: '/veiculos/{idVeiculo}/lavagens/{idLavagem}' },
        ],
      },
      {
        id: 'LavagensEscrita',
        arquivo: 'lavagens-escrita.ts',
        descricao: 'SIG Frota - inclusão, alteração e exclusão de lavagens',
        acoes: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem'],
        rotas: [
          { metodo: 'POST', caminho: '/veiculos/{idVeiculo}/lavagens' },
          { metodo: 'PUT', caminho: '/veiculos/{idVeiculo}/lavagens/{idLavagem}' },
          { metodo: 'DELETE', caminho: '/veiculos/{idVeiculo}/lavagens/{idLavagem}' },
        ],
      },
    ];

    for (const def of funcoes) {
      const acessoTabela: AcessoTabela = { tabela: contrato.tabela, modo: 'acoes', acoes: def.acoes };
      const funcao = new FuncaoLambda(this, def.id, {
        entry: path.join(HANDLERS, def.arquivo),
        acessoTabela,
        descricao: def.descricao,
      });
      for (const rota of def.rotas) {
        registrarRota(this, contrato, { ...rota, funcao: funcao.funcao });
      }
    }
  }
}
