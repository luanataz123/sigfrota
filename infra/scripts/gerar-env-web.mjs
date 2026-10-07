#!/usr/bin/env node
// Gera `web/.env.local` a partir dos outputs da stack `SigfrotaBase` (Requisito 8.3).
//
// Uso (a partir da raiz do monorepo):
//   npm run env-web -w infra
//
// O profile AWS vem de AWS_PROFILE (padrão: `hackaton`). Nenhuma credencial é
// gravada no arquivo gerado: só URLs e identificadores públicos do front.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Define o profile antes de criar o cliente: a cadeia padrão de credenciais do
// SDK v3 lê AWS_PROFILE.
process.env.AWS_PROFILE = process.env.AWS_PROFILE ?? 'hackaton';

const { CloudFormationClient, DescribeStacksCommand } = await import(
  '@aws-sdk/client-cloudformation'
);

const REGIAO = 'us-east-1';
const NOME_STACK = 'SigfrotaBase';
const REDIRECT_LOCAL = 'http://localhost:5173/';
const OUTPUTS_OBRIGATORIOS = ['ApiUrl', 'UserPoolId', 'UserPoolClientId', 'CognitoDominio'];

// infra/scripts → raiz do monorepo → web/.env.local
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const caminhoEnv = path.join(raiz, 'web', '.env.local');

/** Encerra com mensagem de erro em português, sem pilha de chamadas. */
function falhar(mensagem) {
  console.error(`Erro: ${mensagem}`);
  process.exit(1);
}

/** Lê os outputs da stack e devolve um mapa chave → valor. */
async function lerOutputs() {
  const cliente = new CloudFormationClient({ region: REGIAO });
  try {
    const resposta = await cliente.send(new DescribeStacksCommand({ StackName: NOME_STACK }));
    const stack = resposta.Stacks?.[0];
    if (!stack) {
      falhar(`stack ${NOME_STACK} não encontrada. Rode "npm run deploy -w infra" antes.`);
    }
    return Object.fromEntries(
      (stack.Outputs ?? []).map((o) => [o.OutputKey, o.OutputValue]),
    );
  } catch (erro) {
    const mensagem = String(erro?.message ?? erro);
    if (erro?.name === 'ValidationError' && /does not exist/i.test(mensagem)) {
      falhar(
        `stack ${NOME_STACK} não existe na conta do profile "${process.env.AWS_PROFILE}" ` +
          `(${REGIAO}). Rode "npm run deploy -w infra" antes.`,
      );
    }
    if (/ExpiredToken|CredentialsProviderError|Could not load credentials/i.test(`${erro?.name} ${mensagem}`)) {
      falhar(
        `credenciais AWS ausentes ou expiradas para o profile "${process.env.AWS_PROFILE}". ` +
          'Renove as credenciais temporárias e tente de novo.',
      );
    }
    falhar(`não foi possível ler a stack ${NOME_STACK}: ${mensagem}`);
  }
}

const outputs = await lerOutputs();

const faltando = OUTPUTS_OBRIGATORIOS.filter((chave) => !outputs[chave]);
if (faltando.length > 0) {
  falhar(
    `a stack ${NOME_STACK} não tem os outputs: ${faltando.join(', ')}. ` +
      'Rode "npm run deploy -w infra" para atualizá-la.',
  );
}

const conteudo = [
  '# Gerado por infra/scripts/gerar-env-web.mjs. Não edite à mão nem versione.',
  // Com a stack implantada, o front usa a API e o login Cognito (não os mocks).
  'VITE_USE_MOCK=false',
  `VITE_API_URL=${outputs.ApiUrl}`,
  `VITE_REGIAO=${REGIAO}`,
  `VITE_USER_POOL_ID=${outputs.UserPoolId}`,
  `VITE_USER_POOL_CLIENT_ID=${outputs.UserPoolClientId}`,
  `VITE_COGNITO_DOMINIO=${outputs.CognitoDominio}`,
  `VITE_REDIRECT_URI=${REDIRECT_LOCAL}`,
  '',
].join('\n');

await mkdir(path.dirname(caminhoEnv), { recursive: true });
await writeFile(caminhoEnv, conteudo, 'utf8');

console.log(`Arquivo gerado: ${path.relative(raiz, caminhoEnv)}`);
if (outputs.FrontUrl) {
  console.log(`Front publicado: ${outputs.FrontUrl}`);
}
