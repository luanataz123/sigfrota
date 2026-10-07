#!/usr/bin/env node
// Carga dos dados sintéticos do módulo de Lavagem no DynamoDB.
// Uso (da raiz):  node data/carga/carregar-dynamodb.mjs --tabela <nome> [--dry-run] [--perfil p] [--regiao r]
// Detalhes: data/carga/README.md ou --help. Toda a lógica está em lib.mjs.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as dormir } from 'node:timers/promises';
import { DynamoDBClient, waitUntilTableExists } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ErroCarga, executar } from './lib.mjs';

const dirScript = fileURLToPath(new URL('.', import.meta.url));

function criarClientes(opcoes) {
  // Credenciais pela cadeia padrão do SDK (ou pelo perfil). O script nunca lê nem imprime credenciais.
  const ddb = new DynamoDBClient({
    // Sem região explícita, o SDK resolve pela região do perfil (~/.aws/config).
    ...(opcoes.regiao && { region: opcoes.regiao }),
    ...(opcoes.perfil && { profile: opcoes.perfil }),
  });
  const doc = DynamoDBDocumentClient.from(ddb);
  // O waiter do SDK só termina quando a tabela fica ACTIVE.
  const esperarTabelaAtiva = (TableName) => waitUntilTableExists({ client: ddb, maxWaitTime: 120 }, { TableName });
  return { ddb, doc, esperarTabelaAtiva };
}

function lerArquivo(caminho) {
  let texto;
  try {
    texto = readFileSync(caminho, 'utf8');
  } catch (err) {
    throw new ErroCarga(`Não foi possível ler o arquivo ${caminho} (${err.code ?? err.message}).`, 2);
  }
  try {
    return JSON.parse(texto);
  } catch (err) {
    throw new ErroCarga(`O arquivo ${caminho} não é um JSON válido: ${err.message}`, 2);
  }
}

const deps = {
  env: process.env,
  dirScript,
  cwd: process.cwd(),
  criarClientes,
  lerArquivo,
  log: (m) => console.log(m),
  erro: (m) => console.error(m),
  agora: () => performance.now(),
  dormir: (ms) => dormir(ms),
  aleatorio: Math.random,
};

process.exitCode = await executar(process.argv.slice(2), deps);
