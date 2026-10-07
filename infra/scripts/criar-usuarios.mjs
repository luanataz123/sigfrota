#!/usr/bin/env node
// Cria (ou atualiza) os usuários de teste do SIG Frota no Cognito: um atendente e um gestor.
//
// Uso: npm run usuarios -w infra
// Profile AWS: sempre "hackaton" (regra do workspace). AWS_PROFILE e chaves em variáveis de ambiente são ignorados.
// Região: us-east-1 (mesma da stack base).
//
// Segurança e LGPD:
// - A senha é digitada sem eco e nunca é registrada em log nem em arquivo.
// - O único atributo gravado é o e-mail (minimização de dados, OT nº 17).
// - O script é idempotente: se o usuário já existir, só redefine a senha e o grupo.

import { createInterface } from 'node:readline';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';

// Profile fixo: passado explicitamente aos clientes, tem precedência sobre AWS_PROFILE
// e faz o SDK ignorar AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY do ambiente.
const PROFILE = 'hackaton';
const REGIAO = 'us-east-1';
const NOME_STACK = 'SigfrotaBase';
const PERFIS = [
  { grupo: 'atendente', rotulo: 'atendente' },
  { grupo: 'gestor', rotulo: 'gestor' },
];

// ---------------------------------------------------------------------------
// Entrada pelo terminal
// ---------------------------------------------------------------------------

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
let mudo = false;
// Enquanto "mudo" estiver ativo, nada do que o usuário digita é ecoado no terminal.
const escreverOriginal = rl._writeToOutput?.bind(rl);
rl._writeToOutput = (texto) => {
  if (!mudo) escreverOriginal?.(texto);
};

function perguntar(pergunta) {
  return new Promise((resolve) => rl.question(pergunta, (resposta) => resolve(resposta.trim())));
}

async function perguntarSenha(pergunta) {
  process.stdout.write(pergunta);
  mudo = true;
  try {
    // A pergunta já foi escrita acima; passa string vazia para não ecoar nada.
    return await new Promise((resolve) => rl.question('', (resposta) => resolve(resposta)));
  } finally {
    mudo = false;
    process.stdout.write('\n');
  }
}

// ---------------------------------------------------------------------------
// Validações locais (antes de chamar a API)
// ---------------------------------------------------------------------------

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validarEmail(email) {
  return REGEX_EMAIL.test(email);
}

/** Retorna a lista de itens da política de senha do User Pool que não foram atendidos. */
function problemasDaSenha(senha) {
  const problemas = [];
  if (senha.length < 12) problemas.push('ter no mínimo 12 caracteres');
  if (!/[A-Z]/.test(senha)) problemas.push('ter ao menos uma letra maiúscula');
  if (!/[a-z]/.test(senha)) problemas.push('ter ao menos uma letra minúscula');
  if (!/[0-9]/.test(senha)) problemas.push('ter ao menos um dígito');
  if (!/[^A-Za-z0-9]/.test(senha)) problemas.push('ter ao menos um símbolo');
  return problemas;
}

async function lerEmail(rotulo, emailsUsados) {
  for (;;) {
    const email = (await perguntar(`E-mail do ${rotulo}: `)).toLowerCase();
    if (!validarEmail(email)) {
      console.log('  E-mail inválido. Use o formato nome@dominio.tld.');
    } else if (emailsUsados.has(email)) {
      console.log('  Esse e-mail já foi informado para outro perfil. Use um e-mail diferente.');
    } else {
      return email;
    }
  }
}

async function lerSenha(rotulo) {
  for (;;) {
    const senha = await perguntarSenha(`Senha do ${rotulo} (não será exibida): `);
    const problemas = problemasDaSenha(senha);
    if (problemas.length > 0) {
      console.log(`  A senha não cumpre a política do User Pool. Ela precisa: ${problemas.join('; ')}.`);
      continue;
    }
    const confirmacao = await perguntarSenha(`Confirme a senha do ${rotulo}: `);
    if (confirmacao !== senha) {
      console.log('  As senhas não conferem. Tente de novo.');
      continue;
    }
    return senha;
  }
}

// ---------------------------------------------------------------------------
// AWS
// ---------------------------------------------------------------------------

function ehErroDeCredencial(erro) {
  const nome = erro?.name ?? '';
  return (
    nome === 'ExpiredToken' ||
    nome === 'ExpiredTokenException' ||
    nome === 'CredentialsProviderError' ||
    nome === 'UnrecognizedClientException' ||
    nome === 'InvalidClientTokenId'
  );
}

/** Lê o ID do User Pool nos outputs da stack base. */
async function lerUserPoolId() {
  const cfn = new CloudFormationClient({ region: REGIAO, profile: PROFILE });
  let resposta;
  try {
    resposta = await cfn.send(new DescribeStacksCommand({ StackName: NOME_STACK }));
  } catch (erro) {
    if (erro?.name === 'ValidationError' && /does not exist/i.test(erro.message ?? '')) {
      throw new Error(
        `A stack ${NOME_STACK} não existe na conta/região (${REGIAO}). ` +
          'Rode "npm run deploy -w infra" antes de criar os usuários.',
      );
    }
    throw erro;
  }
  const outputs = resposta.Stacks?.[0]?.Outputs ?? [];
  const userPoolId = outputs.find((o) => o.OutputKey === 'UserPoolId')?.OutputValue;
  if (!userPoolId) {
    throw new Error(
      `O output "UserPoolId" não foi encontrado na stack ${NOME_STACK}. ` +
        'Confira se o deploy terminou com sucesso ("npm run deploy -w infra").',
    );
  }
  return userPoolId;
}

/** Cria o usuário (ou reaproveita o existente), define a senha permanente e o adiciona ao grupo. */
async function provisionarUsuario(cognito, userPoolId, { email, senha, grupo }) {
  try {
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        MessageAction: 'SUPPRESS', // não envia e-mail de convite
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
        ],
      }),
    );
    console.log(`  Usuário ${email} criado.`);
  } catch (erro) {
    if (erro?.name !== 'UsernameExistsException') throw erro;
    console.log(`  Usuário ${email} já existe; a senha e o grupo serão redefinidos.`);
  }

  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: email,
      Password: senha,
      Permanent: true, // evita o desafio de troca de senha no primeiro login
    }),
  );

  await cognito.send(
    new AdminAddUserToGroupCommand({ UserPoolId: userPoolId, Username: email, GroupName: grupo }),
  );
  console.log(`  Senha definida e usuário adicionado ao grupo "${grupo}".`);
}

// ---------------------------------------------------------------------------
// Fluxo principal
// ---------------------------------------------------------------------------

async function principal() {
  console.log(`Profile AWS: ${PROFILE} | Região: ${REGIAO}`);
  const userPoolId = await lerUserPoolId();
  console.log(`User Pool: ${userPoolId}\n`);

  // Coleta todos os dados antes de chamar a API, para não deixar o provisionamento pela metade.
  const usuarios = [];
  const emailsUsados = new Set();
  for (const { grupo, rotulo } of PERFIS) {
    const email = await lerEmail(rotulo, emailsUsados);
    emailsUsados.add(email);
    const senha = await lerSenha(rotulo);
    usuarios.push({ email, senha, grupo });
    console.log('');
  }
  rl.close();

  const cognito = new CognitoIdentityProviderClient({ region: REGIAO, profile: PROFILE });
  for (const usuario of usuarios) {
    console.log(`Provisionando ${usuario.grupo}...`);
    await provisionarUsuario(cognito, userPoolId, usuario);
  }
  console.log('\nUsuários prontos. Faça login pelo domínio do Cognito ou pelo front.');
}

principal().catch((erro) => {
  rl.close();
  if (ehErroDeCredencial(erro)) {
    console.error(
      `Credenciais AWS inválidas ou expiradas para o profile "${PROFILE}". ` +
        'Renove as credenciais temporárias e confira com "aws sts get-caller-identity --profile hackaton".',
    );
  } else if (erro?.name === 'InvalidPasswordException') {
    // A mensagem do Cognito descreve a política; não contém a senha.
    console.error(`O Cognito recusou a senha: ${erro.message}`);
  } else {
    // Só nome e mensagem do erro; nada de dados de entrada (senha) no log.
    console.error(`Erro: ${erro?.name ? `${erro.name}: ` : ''}${erro?.message ?? erro}`);
  }
  process.exitCode = 1;
});
