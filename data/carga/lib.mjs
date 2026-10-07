// Lógica do script de carga (data/carga). Tudo aqui é testável sem AWS:
// o cliente do SDK é injetado (objeto com send(command)) e as dependências
// de ambiente (leitura de arquivo, log, relógio, sono, aleatório) também.
import path from 'node:path';
import { parseArgs } from 'node:util';
import { BatchWriteCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';

export const TAMANHO_LOTE = 25;
export const TIPOS_ENTIDADE = ['VEICULO', 'TIPO_LAVAGEM', 'POSTO', 'LAVAGEM', 'CONTADOR'];
export const TENTATIVAS_PADRAO = 8;

/** Erro esperado do script. codigoSaida: 2 = uso/arquivo inválido (nada gravado), 1 = execução/AWS. */
export class ErroCarga extends Error {
  constructor(mensagem, codigoSaida = 1) {
    super(mensagem);
    this.name = 'ErroCarga';
    this.codigoSaida = codigoSaida;
  }
}

export function textoAjuda() {
  return `Uso: node data/carga/carregar-dynamodb.mjs --tabela <nome> [opções]

Carrega os itens sintéticos (formato DocumentClient) na tabela única do DynamoDB.

Opções:
  --tabela <nome>      Tabela de destino (obrigatória; ou env TABELA_LAVAGEM)
  --arquivo <caminho>  JSON com os itens (padrão: ../seed/demo/itens.json, relativo ao script)
  --regiao <região>    Região AWS (padrão: env AWS_REGION, senão a do --perfil, senão us-east-1)
  --perfil <perfil>    Perfil do ~/.aws (senão, cadeia padrão de credenciais do SDK)
  --dry-run            Só valida e mostra contagens e lotes; não chama a AWS
  --criar-tabela       Cria a tabela se não existir (atalho até a IaC ficar pronta)
  --limpar             Apaga TODOS os itens da tabela antes da carga (destrutivo)
  --confirmar <nome>   Obrigatório com --limpar; deve ser idêntico a --tabela
  --tentativas <n>     Envios por lote ao reprocessar UnprocessedItems (padrão: ${TENTATIVAS_PADRAO})
  --verbose            Mostra o stack dos erros
  -h, --help           Mostra esta ajuda

Códigos de saída: 0 sucesso; 1 erro de execução/AWS; 2 erro de uso ou arquivo inválido (nada gravado).`;
}

/** Lê argv/env e devolve as opções normalizadas. Lança ErroCarga(…, 2) em erro de uso. */
export function lerOpcoes(argv, env = {}, dirScript = '.', cwd = process.cwd()) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        tabela: { type: 'string' },
        arquivo: { type: 'string' },
        regiao: { type: 'string' },
        perfil: { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
        'criar-tabela': { type: 'boolean', default: false },
        limpar: { type: 'boolean', default: false },
        confirmar: { type: 'string' },
        tentativas: { type: 'string' },
        verbose: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    }));
  } catch (err) {
    throw new ErroCarga(`Argumento inválido: ${err.message}. Use --help para ver as opções.`, 2);
  }

  if (values.help) return { ajuda: true };

  const tabela = (values.tabela ?? env.TABELA_LAVAGEM ?? '').trim();
  if (!tabela) {
    throw new ErroCarga('Informe a tabela com --tabela <nome> ou a variável de ambiente TABELA_LAVAGEM.', 2);
  }

  let tentativas = TENTATIVAS_PADRAO;
  if (values.tentativas !== undefined) {
    tentativas = Number(values.tentativas);
    if (!Number.isInteger(tentativas) || tentativas < 1) {
      throw new ErroCarga('--tentativas deve ser um inteiro maior ou igual a 1.', 2);
    }
  }

  if (values.confirmar !== undefined && !values.limpar) {
    throw new ErroCarga('--confirmar só é usado junto com --limpar.', 2);
  }
  if (values.limpar && values.confirmar !== tabela) {
    throw new ErroCarga(
      `--limpar apaga TODOS os itens da tabela e exige --confirmar ${tabela} (idêntico a --tabela). Nada foi apagado.`,
      2,
    );
  }

  // O padrão é relativo ao script (funciona de qualquer cwd); um caminho
  // digitado pelo usuário é relativo ao terminal dele.
  const arquivo = values.arquivo
    ? path.resolve(cwd, values.arquivo)
    : path.resolve(dirScript, '../seed/demo/itens.json');

  return {
    ajuda: false,
    tabela,
    arquivo,
    // Com --perfil e sem região explícita, o SDK usa a região configurada no perfil.
    regiao: values.regiao ?? env.AWS_REGION ?? (values.perfil ? undefined : 'us-east-1'),
    perfil: values.perfil,
    dryRun: values['dry-run'],
    criarTabela: values['criar-tabela'],
    limpar: values.limpar,
    confirmar: values.confirmar,
    tentativas,
    verbose: values.verbose,
  };
}

const textoNaoVazio = (v) => typeof v === 'string' && v.trim() !== '';

/** Valida os itens antes de qualquer escrita. Devolve { contador, demais } ou lança ErroCarga(…, 2). */
export function validarItens(itens) {
  if (!Array.isArray(itens)) throw new ErroCarga('Arquivo inválido: o conteúdo deve ser um array de itens.', 2);
  if (itens.length === 0) throw new ErroCarga('Arquivo inválido: o array de itens está vazio.', 2);

  const chaves = new Set();
  const contadores = [];
  const demais = [];
  itens.forEach((item, i) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new ErroCarga(`Arquivo inválido: o item ${i} não é um objeto.`, 2);
    }
    if (!textoNaoVazio(item.PK) || !textoNaoVazio(item.SK)) {
      throw new ErroCarga(`Arquivo inválido: o item ${i} não tem PK e SK como texto não vazio.`, 2);
    }
    if (!TIPOS_ENTIDADE.includes(item.entityType)) {
      throw new ErroCarga(
        `Arquivo inválido: o item ${i} tem entityType ausente ou desconhecido (esperado: ${TIPOS_ENTIDADE.join(', ')}).`,
        2,
      );
    }
    const chave = `${item.PK}|${item.SK}`;
    if (chaves.has(chave)) {
      throw new ErroCarga(`Arquivo inválido: chave duplicada PK=${item.PK} SK=${item.SK} (item ${i}).`, 2);
    }
    chaves.add(chave);
    (item.entityType === 'CONTADOR' ? contadores : demais).push(item);
  });

  if (contadores.length !== 1) {
    throw new ErroCarga(`Arquivo inválido: deve haver exatamente um CONTADOR (encontrados ${contadores.length}).`, 2);
  }
  const [contador] = contadores;
  if (contador.PK !== 'CONTADOR' || contador.SK !== 'LAVAGEM' || !Number.isInteger(contador.ultimoId) || contador.ultimoId <= 0) {
    throw new ErroCarga('Arquivo inválido: o CONTADOR deve ter PK=CONTADOR, SK=LAVAGEM e ultimoId inteiro > 0.', 2);
  }
  return { contador, demais };
}

/** Arquivo do gabarito: caminho com "gabarito" ou exatamente 3 lavagens. */
export function ehGabarito(caminho, itens) {
  if (/gabarito/i.test(String(caminho ?? ''))) return true;
  return Array.isArray(itens) && itens.filter((i) => i?.entityType === 'LAVAGEM').length === 3;
}

export function contarPorTipo(itens) {
  const contagem = Object.fromEntries(TIPOS_ENTIDADE.map((t) => [t, 0]));
  for (const item of itens) contagem[item.entityType] = (contagem[item.entityType] ?? 0) + 1;
  return contagem;
}

export function dividirEmLotes(itens, tamanho = TAMANHO_LOTE) {
  const lotes = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

/** Full jitter: aleatorio() * min(maxMs, baseMs * 2^tentativa). */
export function calcularEspera(tentativa, { baseMs = 100, maxMs = 5000, aleatorio = Math.random } = {}) {
  return aleatorio() * Math.min(maxMs, baseMs * 2 ** tentativa);
}

/**
 * Envia requests ({PutRequest} ou {DeleteRequest}) em lotes de 25 com BatchWrite,
 * reenviando UnprocessedItems com backoff exponencial e jitter.
 * `tentativas` = número máximo de envios por lote (o primeiro incluído).
 */
export async function gravarEmLotes(doc, tabela, requests, opcoes = {}) {
  const {
    tentativas = TENTATIVAS_PADRAO,
    baseMs = 100,
    maxMs = 5000,
    dormir = async () => {},
    aleatorio = Math.random,
  } = opcoes;
  const lotes = dividirEmLotes(requests);
  let reenvios = 0;
  let gravados = 0;

  for (const lote of lotes) {
    let pendentes = lote;
    for (let envio = 1; ; envio++) {
      const resposta = await doc.send(new BatchWriteCommand({ RequestItems: { [tabela]: pendentes } }));
      const naoProcessados = resposta?.UnprocessedItems?.[tabela] ?? [];
      gravados += pendentes.length - naoProcessados.length;
      if (naoProcessados.length === 0) break;
      if (envio >= tentativas) {
        const naoGravados = requests.length - gravados;
        const erro = new ErroCarga(
          `${naoGravados} itens não foram gravados: o DynamoDB devolveu UnprocessedItems após ${tentativas} tentativas no mesmo lote. ` +
            'Rode de novo (a carga é idempotente) ou aumente --tentativas.',
          1,
        );
        erro.naoGravados = naoGravados;
        throw erro;
      }
      reenvios++;
      await dormir(calcularEspera(envio - 1, { baseMs, maxMs, aleatorio }));
      pendentes = naoProcessados;
    }
  }
  return { lotes: lotes.length, reenvios, gravados };
}

/** Input do PutCommand do contador. Sem --limpar, não deixa o ultimoId regredir. */
export function parametrosContador(tabela, contador, { limpar = false } = {}) {
  if (limpar) return { TableName: tabela, Item: contador };
  return {
    TableName: tabela,
    Item: contador,
    ConditionExpression: 'attribute_not_exists(PK) OR ultimoId <= :novo',
    ExpressionAttributeValues: { ':novo': contador.ultimoId },
    ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
  };
}

export async function gravarContador(doc, tabela, contador, { limpar = false } = {}) {
  try {
    await doc.send(new PutCommand(parametrosContador(tabela, contador, { limpar })));
    return { gravado: true, ultimoId: contador.ultimoId };
  } catch (err) {
    if (err?.name !== 'ConditionalCheckFailedException') throw err;
    // O item antigo volta em AttributeValue ({ N: '3700' }) na exceção.
    const bruto = err.Item?.ultimoId;
    const atual = Number(bruto?.N ?? bruto);
    return { gravado: false, atual: Number.isFinite(atual) ? atual : null, arquivo: contador.ultimoId };
  }
}

/** Apaga todos os itens: Scan paginado só com PK/SK + BatchWrite DeleteRequest. */
export async function limparTabela(doc, tabela, opcoes = {}) {
  const chaves = [];
  let inicio;
  do {
    const pagina = await doc.send(
      new ScanCommand({
        TableName: tabela,
        ProjectionExpression: '#pk, #sk',
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
        ...(inicio && { ExclusiveStartKey: inicio }),
      }),
    );
    for (const item of pagina?.Items ?? []) chaves.push({ DeleteRequest: { Key: { PK: item.PK, SK: item.SK } } });
    inicio = pagina?.LastEvaluatedKey;
  } while (inicio);

  if (chaves.length === 0) return { apagados: 0, reenvios: 0 };
  const { gravados, reenvios } = await gravarEmLotes(doc, tabela, chaves, opcoes);
  return { apagados: gravados, reenvios };
}

/**
 * Confere se a tabela existe; com `criar`, cria (PK/SK string, PAY_PER_REQUEST, SSE).
 * --criar-tabela é atalho para começar antes da IaC: depois, a fonte da verdade
 * da tabela é o CDK/SAM, e o script só carrega dados.
 */
export async function garantirTabela(ddb, tabela, { criar = false, esperarTabelaAtiva = async () => {} } = {}) {
  try {
    await ddb.send(new DescribeTableCommand({ TableName: tabela }));
    return { criada: false };
  } catch (err) {
    if (err?.name !== 'ResourceNotFoundException') throw err;
    if (!criar) {
      throw new ErroCarga(
        `A tabela ${tabela} não existe nessa conta/região. Crie pela IaC (CDK/SAM) ou use --criar-tabela como atalho.`,
        1,
      );
    }
  }
  await ddb.send(
    new CreateTableCommand({
      TableName: tabela,
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    }),
  );
  await esperarTabelaAtiva(tabela);
  return { criada: true };
}

const ERROS_CREDENCIAL = new Set([
  'CredentialsProviderError',
  'ExpiredTokenException',
  'ExpiredToken',
  'UnrecognizedClientException',
  'InvalidSignatureException',
  'TokenRefreshRequired',
  'InvalidClientTokenId',
]);

/** Converte erros do SDK em mensagens úteis (sem dados de credenciais). */
export function traduzirErro(err, { tabela, regiao, perfil } = {}) {
  if (err instanceof ErroCarga) return err.message;
  const nome = err?.name ?? 'Erro';
  if (nome === 'ResourceNotFoundException') {
    return `A tabela ${tabela} não existe na região ${regiao}. Crie pela IaC (CDK/SAM) ou use --criar-tabela.`;
  }
  if (ERROS_CREDENCIAL.has(nome) || /credential|token.*expired|expired.*token/i.test(err?.message ?? '')) {
    const dica = perfil ? `aws sso login --profile ${perfil} (ou confira o perfil com aws configure)` : 'informe --perfil <perfil> ou rode aws configure / aws sso login';
    return `Credenciais AWS ausentes, inválidas ou expiradas. Faça login: ${dica}.`;
  }
  if (nome === 'AccessDeniedException' || nome === 'AccessDenied') {
    return `Acesso negado à tabela ${tabela}. A identidade usada não tem a permissão necessária; veja a policy de menor privilégio no data/carga/README.md.`;
  }
  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT'].includes(err?.code)) {
    return `Sem conexão com o DynamoDB na região ${regiao} (${err.code}). Confira a rede e o nome da região.`;
  }
  return `${nome}: ${err?.message ?? String(err)}`;
}

function formatarContagem(contagem) {
  return TIPOS_ENTIDADE.map((t) => `  ${t.padEnd(13)} ${contagem[t] ?? 0}`).join('\n');
}

/**
 * Fluxo completo. deps = { env, dirScript, cwd, criarClientes, lerArquivo, log, erro,
 * agora, dormir, aleatorio }. criarClientes(opcoes) devolve { ddb, doc, esperarTabelaAtiva? }.
 * Devolve o código de saída.
 */
export async function executar(argv, deps) {
  const { log = () => {}, erro = () => {}, agora = () => Date.now() } = deps;
  const inicio = agora();
  let opcoes = { verbose: argv.includes('--verbose') };
  try {
    opcoes = lerOpcoes(argv, deps.env ?? {}, deps.dirScript ?? '.', deps.cwd ?? process.cwd());
    if (opcoes.ajuda) {
      log(textoAjuda());
      return 0;
    }

    const itens = deps.lerArquivo(opcoes.arquivo);
    const { contador, demais } = validarItens(itens);
    const contagem = contarPorTipo(itens);
    const nLotes = dividirEmLotes(demais).length;

    if (ehGabarito(opcoes.arquivo, itens)) {
      log(
        'AVISO: arquivo do gabarito. Ele contém dado legado inválido (CNPJ da lavagem 3398) e é fixture de testes, ' +
          'não dado validado do sistema. Para a demo, use data/seed/demo/itens.json.',
      );
    }

    if (opcoes.dryRun) {
      log(`Dry-run: arquivo válido (${opcoes.arquivo}). Nenhuma chamada à AWS.`);
      log(`Itens por entityType:\n${formatarContagem(contagem)}\n  ${'TOTAL'.padEnd(13)} ${itens.length}`);
      log(`Lotes de BatchWrite (${TAMANHO_LOTE} itens): ${nLotes}; CONTADOR gravado à parte com PutItem condicional.`);
      log(`Destino: tabela ${opcoes.tabela}, região ${opcoes.regiao ?? 'do perfil'}${opcoes.perfil ? `, perfil ${opcoes.perfil}` : ''}.`);
      if (opcoes.limpar) log('--limpar: a execução real apagaria TODOS os itens da tabela antes da carga.');
      if (opcoes.criarTabela) log('--criar-tabela: a execução real criaria a tabela se ela não existir.');
      return 0;
    }

    const clientes = deps.criarClientes(opcoes);
    const { ddb, doc } = clientes;
    const retry = { tentativas: opcoes.tentativas, dormir: deps.dormir, aleatorio: deps.aleatorio };

    const { criada } = await garantirTabela(ddb, opcoes.tabela, {
      criar: opcoes.criarTabela,
      esperarTabelaAtiva: clientes.esperarTabelaAtiva ?? deps.esperarTabelaAtiva,
    });
    if (criada) log(`Tabela ${opcoes.tabela} criada (PAY_PER_REQUEST, SSE). Depois, a tabela deve vir da IaC.`);

    let apagados = 0;
    let reenvios = 0;
    if (opcoes.limpar) {
      const r = await limparTabela(doc, opcoes.tabela, retry);
      apagados = r.apagados;
      reenvios += r.reenvios;
      log(`Tabela limpa: ${apagados} itens apagados.`);
    }

    const requests = demais.map((Item) => ({ PutRequest: { Item } }));
    const carga = await gravarEmLotes(doc, opcoes.tabela, requests, retry);
    reenvios += carga.reenvios;

    const situacao = await gravarContador(doc, opcoes.tabela, contador, { limpar: opcoes.limpar });
    const gravadosPorTipo = contarPorTipo(demais);
    gravadosPorTipo.CONTADOR = situacao.gravado ? 1 : 0;

    const segundos = ((agora() - inicio) / 1000).toFixed(1);
    log(`Carga concluída na tabela ${opcoes.tabela} (região ${opcoes.regiao ?? 'do perfil'}).`);
    log(`Itens gravados por entityType:\n${formatarContagem(gravadosPorTipo)}`);
    log(`Lotes: ${carga.lotes}; reenvios de UnprocessedItems: ${reenvios}${opcoes.limpar ? `; apagados: ${apagados}` : ''}.`);
    log(
      situacao.gravado
        ? `Contador: ultimoId = ${situacao.ultimoId}.`
        : `Contador mantido em ${situacao.atual ?? '(valor atual)'}: a tabela já tem ultimoId maior que o do arquivo (${situacao.arquivo}); sem --limpar ele não regride.`,
    );
    log(`Tempo: ${segundos}s.`);
    return 0;
  } catch (err) {
    erro(`ERRO: ${traduzirErro(err, opcoes)}`);
    if (opcoes.verbose && err?.stack) erro(err.stack);
    return err?.codigoSaida ?? 1;
  }
}
