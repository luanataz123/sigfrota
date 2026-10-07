// Testes do script de carga: sem AWS e sem rede (cliente fake injetado).
// Rodar da raiz: node --test data/carga/
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ErroCarga,
  TAMANHO_LOTE,
  lerOpcoes,
  validarItens,
  ehGabarito,
  contarPorTipo,
  dividirEmLotes,
  calcularEspera,
  gravarEmLotes,
  parametrosContador,
  gravarContador,
  limparTabela,
  garantirTabela,
  traduzirErro,
  executar,
} from './lib.mjs';

const dirScript = fileURLToPath(new URL('.', import.meta.url));
const CAMINHO_DEMO = fileURLToPath(new URL('../seed/demo/itens.json', import.meta.url));
const CAMINHO_GABARITO = fileURLToPath(new URL('../seed/gabarito/itens.json', import.meta.url));
const lerJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const DEMO = lerJson(CAMINHO_DEMO);
const GABARITO = lerJson(CAMINHO_GABARITO);

const erroSdk = (name, extra = {}) => Object.assign(new Error(`${name} simulado`), { name, ...extra });

/**
 * Cliente fake: registra cada send, guarda os itens num Map (PK|SK) e responde por comando.
 * opções: unprocessed(n, input) => lista de não processados; contadorFalha: erro do PutCommand;
 * tabelaExiste; paginas (respostas do Scan).
 */
function clienteFake({ unprocessed, contadorFalha, tabelaExiste = true, paginas } = {}) {
  const chamadas = [];
  const dados = new Map();
  let nBatch = 0;
  let nScan = 0;
  const cliente = {
    chamadas,
    dados,
    async send(command) {
      const nome = command.constructor.name;
      const input = structuredClone(command.input);
      chamadas.push({ nome, input });
      switch (nome) {
        case 'DescribeTableCommand':
          if (!tabelaExiste) throw erroSdk('ResourceNotFoundException');
          return { Table: { TableStatus: 'ACTIVE' } };
        case 'CreateTableCommand':
          tabelaExiste = true;
          return {};
        case 'BatchWriteCommand': {
          const [tabela] = Object.keys(input.RequestItems);
          const reqs = input.RequestItems[tabela];
          const pendentes = unprocessed ? unprocessed(nBatch++, reqs) : [];
          for (const r of reqs) {
            if (pendentes.includes(r) || pendentes.some((p) => JSON.stringify(p) === JSON.stringify(r))) continue;
            if (r.PutRequest) dados.set(`${r.PutRequest.Item.PK}|${r.PutRequest.Item.SK}`, r.PutRequest.Item);
            if (r.DeleteRequest) dados.delete(`${r.DeleteRequest.Key.PK}|${r.DeleteRequest.Key.SK}`);
          }
          return { UnprocessedItems: pendentes.length ? { [tabela]: pendentes } : {} };
        }
        case 'PutCommand': {
          if (contadorFalha) throw contadorFalha;
          const atual = dados.get(`${input.Item.PK}|${input.Item.SK}`);
          if (input.ConditionExpression && atual && atual.ultimoId > input.ExpressionAttributeValues[':novo']) {
            throw erroSdk('ConditionalCheckFailedException', { Item: { ultimoId: { N: String(atual.ultimoId) } } });
          }
          dados.set(`${input.Item.PK}|${input.Item.SK}`, input.Item);
          return {};
        }
        case 'ScanCommand': {
          if (paginas) return paginas[nScan++];
          return { Items: [...dados.values()].map(({ PK, SK }) => ({ PK, SK })) };
        }
        default:
          throw new Error(`comando inesperado: ${nome}`);
      }
    },
  };
  return cliente;
}

function depsFake({ cliente = clienteFake(), itens = DEMO, env = {} } = {}) {
  const deps = {
    env,
    dirScript,
    cwd: dirScript,
    logs: [],
    erros: [],
    sonos: [],
    nCriarClientes: 0,
    cliente,
    esperou: 0,
    log: (m) => deps.logs.push(m),
    erro: (m) => deps.erros.push(m),
    agora: () => 0,
    dormir: async (ms) => deps.sonos.push(ms),
    aleatorio: () => 0.5,
    lerArquivo: (p) => (typeof itens === 'function' ? itens(p) : structuredClone(itens)),
    criarClientes: () => {
      deps.nCriarClientes++;
      return { ddb: cliente, doc: cliente, esperarTabelaAtiva: async () => { deps.esperou++; } };
    },
  };
  return deps;
}

const CONTADOR = { PK: 'CONTADOR', SK: 'LAVAGEM', entityType: 'CONTADOR', ultimoId: 10 };
const veiculo = (id) => ({ PK: 'CATALOGO', SK: `VEICULO#${id}`, entityType: 'VEICULO', idVeiculo: id });

describe('validação aborta sem escrita', () => {
  const casos = {
    'array vazio': [],
    'não-array': { itens: [] },
    'item sem PK': [{ SK: 'X', entityType: 'VEICULO' }, CONTADOR],
    'SK vazia': [{ PK: 'CATALOGO', SK: '  ', entityType: 'VEICULO' }, CONTADOR],
    'sem entityType': [{ PK: 'CATALOGO', SK: 'VEICULO#1' }, CONTADOR],
    'entityType desconhecido': [{ PK: 'CATALOGO', SK: 'VEICULO#1', entityType: 'OUTRO' }, CONTADOR],
    'PK+SK duplicada': [veiculo(1), veiculo(1), CONTADOR],
    'zero CONTADOR': [veiculo(1)],
    'dois CONTADOR': [veiculo(1), CONTADOR, { ...CONTADOR, SK: 'LAVAGEM2' }],
    'CONTADOR sem ultimoId': [veiculo(1), { PK: 'CONTADOR', SK: 'LAVAGEM', entityType: 'CONTADOR' }],
  };
  for (const [nome, itens] of Object.entries(casos)) {
    test(nome, async () => {
      assert.throws(() => validarItens(itens), (e) => e instanceof ErroCarga && e.codigoSaida === 2);
      const deps = depsFake({ itens });
      const codigo = await executar(['--tabela', 't'], deps);
      assert.equal(codigo, 2);
      assert.equal(deps.nCriarClientes, 0);
      assert.equal(deps.cliente.chamadas.length, 0);
      assert.match(deps.erros[0], /Arquivo inválido/);
    });
  }

  test('mensagem cita o índice, não o conteúdo do item', () => {
    assert.throws(() => validarItens([veiculo(1), { PK: 'P', SK: 'S', placa: 'ABC1D23' }, CONTADOR]), (e) => {
      assert.match(e.message, /item 1/);
      assert.doesNotMatch(e.message, /ABC1D23/);
      return true;
    });
  });

  test('demo e gabarito reais são válidos', () => {
    assert.equal(validarItens(DEMO).demais.length, 280);
    assert.equal(validarItens(GABARITO).contador.ultimoId, 3399);
  });
});

describe('lotes', () => {
  test('280 itens não-contador do demo -> 12 lotes (11x25 + 5)', () => {
    const { demais } = validarItens(DEMO);
    const lotes = dividirEmLotes(demais);
    assert.equal(lotes.length, 12);
    assert.deepEqual(lotes.map((l) => l.length), [...Array(11).fill(25), 5]);
  });

  test('gravarEmLotes envia 12 BatchWrite, nenhum com mais de 25, só com a tabela', async () => {
    const fake = clienteFake();
    const reqs = validarItens(DEMO).demais.map((Item) => ({ PutRequest: { Item } }));
    const r = await gravarEmLotes(fake, 'tab', reqs);
    assert.deepEqual(r, { lotes: 12, reenvios: 0, gravados: 280 });
    assert.equal(fake.chamadas.length, 12);
    for (const c of fake.chamadas) {
      assert.equal(c.nome, 'BatchWriteCommand');
      assert.deepEqual(Object.keys(c.input.RequestItems), ['tab']);
      assert.ok(c.input.RequestItems.tab.length <= TAMANHO_LOTE);
    }
  });
});

describe('reenvio de UnprocessedItems', () => {
  const reqs = Array.from({ length: 10 }, (_, i) => ({ PutRequest: { Item: veiculo(i) } }));

  test('reenvia só os não processados até o sucesso', async () => {
    // 1º envio: 4 pendentes; 2º: 1 pendente; 3º: tudo gravado.
    const fake = clienteFake({ unprocessed: (n, r) => (n === 0 ? r.slice(0, 4) : n === 1 ? r.slice(0, 1) : []) });
    const sonos = [];
    const r = await gravarEmLotes(fake, 't', reqs, { dormir: async (ms) => sonos.push(ms), aleatorio: () => 0.5 });
    assert.deepEqual(r, { lotes: 1, reenvios: 2, gravados: 10 });
    assert.equal(fake.chamadas.length, 3);
    assert.equal(fake.chamadas[1].input.RequestItems.t.length, 4);
    assert.deepEqual(fake.chamadas[1].input.RequestItems.t, reqs.slice(0, 4));
    assert.equal(fake.chamadas[2].input.RequestItems.t.length, 1);
    assert.equal(sonos.length, 2);
    assert.equal(fake.dados.size, 10);
  });

  test('falha após esgotar as tentativas, informando quantos não foram gravados', async () => {
    const fake = clienteFake({ unprocessed: (n, r) => r.slice(0, 3) });
    const sonos = [];
    await assert.rejects(
      gravarEmLotes(fake, 't', reqs, { tentativas: 3, dormir: async (ms) => sonos.push(ms), aleatorio: () => 1 }),
      (e) => {
        assert.ok(e instanceof ErroCarga);
        assert.equal(e.codigoSaida, 1);
        assert.equal(e.naoGravados, 3);
        assert.match(e.message, /^3 itens não foram gravados/);
        assert.match(e.message, /3 tentativas/);
        return true;
      },
    );
    assert.equal(fake.chamadas.length, 3);
    assert.deepEqual(sonos, [100, 200]); // backoff exponencial no limite do jitter
  });

  test('conta também os lotes não enviados como não gravados; executar retorna 1', async () => {
    const fake = clienteFake({ unprocessed: (n, r) => (n === 0 ? [] : r.slice(0, 2)) });
    const deps = depsFake({ cliente: fake });
    const codigo = await executar(['--tabela', 't', '--tentativas', '2'], deps);
    assert.equal(codigo, 1);
    // 1º lote (25) gravado; 2º lote ficou com 2 pendentes; 10 lotes restantes (230) não enviados.
    assert.match(deps.erros[0], /232 itens não foram gravados/);
    assert.ok(!fake.chamadas.some((c) => c.nome === 'PutCommand'), 'contador não é gravado se a carga falhou');
  });

  test('espera = aleatorio * min(max, base * 2^n)', () => {
    assert.equal(calcularEspera(0, { aleatorio: () => 1 }), 100);
    assert.equal(calcularEspera(3, { aleatorio: () => 1 }), 800);
    assert.equal(calcularEspera(10, { aleatorio: () => 1 }), 5000);
    assert.equal(calcularEspera(3, { aleatorio: () => 0.25 }), 200);
  });
});

describe('contador', () => {
  test('sem --limpar: PutItem condicional que não regride', () => {
    assert.deepEqual(parametrosContador('t', CONTADOR), {
      TableName: 't',
      Item: CONTADOR,
      ConditionExpression: 'attribute_not_exists(PK) OR ultimoId <= :novo',
      ExpressionAttributeValues: { ':novo': 10 },
      ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
    });
  });

  test('com --limpar: sobrescreve (sem condição)', () => {
    const p = parametrosContador('t', CONTADOR, { limpar: true });
    assert.deepEqual(p, { TableName: 't', Item: CONTADOR });
  });

  test('condição falhou: mantém o valor atual e informa', async () => {
    const fake = clienteFake({ contadorFalha: erroSdk('ConditionalCheckFailedException', { Item: { ultimoId: { N: '3700' } } }) });
    assert.deepEqual(await gravarContador(fake, 't', CONTADOR), { gravado: false, atual: 3700, arquivo: 10 });

    const deps = depsFake({ cliente: fake });
    assert.equal(await executar(['--tabela', 't'], deps), 0);
    assert.ok(deps.logs.some((l) => /Contador mantido em 3700/.test(l)));
  });

  test('outros erros do PutItem propagam', async () => {
    const fake = clienteFake({ contadorFalha: erroSdk('AccessDeniedException') });
    await assert.rejects(gravarContador(fake, 't', CONTADOR), { name: 'AccessDeniedException' });
  });

  test('fluxo: contador maior na tabela não regride sem --limpar e é sobrescrito com --limpar', async () => {
    const fake = clienteFake();
    fake.dados.set('CONTADOR|LAVAGEM', { ...CONTADOR, ultimoId: 3700 });
    assert.equal(await executar(['--tabela', 't'], depsFake({ cliente: fake })), 0);
    assert.equal(fake.dados.get('CONTADOR|LAVAGEM').ultimoId, 3700);

    assert.equal(await executar(['--tabela', 't', '--limpar', '--confirmar', 't'], depsFake({ cliente: fake })), 0);
    assert.equal(fake.dados.get('CONTADOR|LAVAGEM').ultimoId, 3649);
    assert.equal(fake.dados.size, 281);
  });
});

describe('--limpar', () => {
  for (const [nome, argv] of Object.entries({
    'sem --confirmar': ['--tabela', 't', '--limpar'],
    'com --confirmar diferente': ['--tabela', 't', '--limpar', '--confirmar', 'outra'],
    'mesmo no dry-run': ['--tabela', 't', '--limpar', '--confirmar', 'T', '--dry-run'],
  })) {
    test(`${nome}: aborta sem apagar nada`, async () => {
      const deps = depsFake();
      assert.equal(await executar(argv, deps), 2);
      assert.equal(deps.nCriarClientes, 0);
      assert.equal(deps.cliente.chamadas.length, 0);
      assert.match(deps.erros[0], /Nada foi apagado/);
    });
  }

  test('--confirmar sem --limpar é erro de uso', () => {
    assert.throws(() => lerOpcoes(['--tabela', 't', '--confirmar', 't']), { codigoSaida: 2 });
  });

  test('com --confirmar idêntico: Scan paginado só com PK/SK e DeleteRequest de todas as chaves', async () => {
    const paginas = [
      { Items: [{ PK: 'A', SK: '1' }, { PK: 'A', SK: '2' }], LastEvaluatedKey: { PK: 'A', SK: '2' } },
      { Items: [{ PK: 'B', SK: '1' }] },
    ];
    const fake = clienteFake({ paginas });
    const r = await limparTabela(fake, 't');
    assert.equal(r.apagados, 3);
    const scans = fake.chamadas.filter((c) => c.nome === 'ScanCommand');
    assert.equal(scans.length, 2);
    for (const s of scans) {
      assert.equal(s.input.ProjectionExpression, '#pk, #sk');
      assert.deepEqual(s.input.ExpressionAttributeNames, { '#pk': 'PK', '#sk': 'SK' });
    }
    assert.equal(scans[0].input.ExclusiveStartKey, undefined);
    assert.deepEqual(scans[1].input.ExclusiveStartKey, { PK: 'A', SK: '2' });
    const deletes = fake.chamadas.filter((c) => c.nome === 'BatchWriteCommand').flatMap((c) => c.input.RequestItems.t);
    assert.deepEqual(deletes, [
      { DeleteRequest: { Key: { PK: 'A', SK: '1' } } },
      { DeleteRequest: { Key: { PK: 'A', SK: '2' } } },
      { DeleteRequest: { Key: { PK: 'B', SK: '1' } } },
    ]);
  });

  test('fluxo completo apaga itens que não estão no arquivo', async () => {
    const fake = clienteFake();
    fake.dados.set('VEICULO#999|LAVAGEM#1', { PK: 'VEICULO#999', SK: 'LAVAGEM#1' });
    const deps = depsFake({ cliente: fake });
    assert.equal(await executar(['--tabela', 't', '--limpar', '--confirmar', 't'], deps), 0);
    assert.equal(fake.dados.has('VEICULO#999|LAVAGEM#1'), false);
    assert.equal(fake.dados.size, 281);
    assert.ok(deps.logs.some((l) => /1 itens apagados/.test(l)));
  });
});

describe('--dry-run', () => {
  test('não chama o cliente e mostra contagens e lotes', async () => {
    const deps = depsFake();
    assert.equal(await executar(['--tabela', 't', '--dry-run'], deps), 0);
    assert.equal(deps.nCriarClientes, 0);
    assert.equal(deps.cliente.chamadas.length, 0);
    const saida = deps.logs.join('\n');
    assert.match(saida, /Nenhuma chamada à AWS/);
    assert.match(saida, /VEICULO\s+18/);
    assert.match(saida, /TIPO_LAVAGEM\s+3/);
    assert.match(saida, /POSTO\s+6/);
    assert.match(saida, /LAVAGEM\s+253/);
    assert.match(saida, /CONTADOR\s+1/);
    assert.match(saida, /TOTAL\s+281/);
    assert.match(saida, /\(25 itens\): 12;/);
  });
});

describe('carga do demo real', () => {
  test('grava as contagens certas por entityType e o contador 3649, sem logar lavagens', async () => {
    const fake = clienteFake();
    const deps = depsFake({ cliente: fake, itens: (p) => lerJson(p) });
    assert.equal(await executar(['--tabela', 'sigfrota-lavagem'], deps), 0);

    const puts = fake.chamadas
      .filter((c) => c.nome === 'BatchWriteCommand')
      .flatMap((c) => c.input.RequestItems['sigfrota-lavagem'].map((r) => r.PutRequest.Item));
    assert.deepEqual(contarPorTipo(puts), { VEICULO: 18, TIPO_LAVAGEM: 3, POSTO: 6, LAVAGEM: 253, CONTADOR: 0 });
    assert.equal(fake.chamadas.filter((c) => c.nome === 'BatchWriteCommand').length, 12);
    const putContador = fake.chamadas.filter((c) => c.nome === 'PutCommand');
    assert.equal(putContador.length, 1);
    assert.equal(putContador[0].input.Item.ultimoId, 3649);
    assert.equal(fake.chamadas[0].nome, 'DescribeTableCommand');

    const saida = deps.logs.join('\n');
    assert.match(saida, /LAVAGEM\s+253/);
    assert.match(saida, /CONTADOR\s+1/);
    assert.match(saida, /Lotes: 12; reenvios de UnprocessedItems: 0/);
    assert.match(saida, /ultimoId = 3649/);
    assert.match(saida, /sigfrota-lavagem/);
    assert.match(saida, /us-east-1/);
    assert.doesNotMatch(saida, /LAVAGEM#/);
    assert.doesNotMatch(saida, /AVISO/);
  });

  test('idempotente: rodar duas vezes deixa o mesmo conteúdo', async () => {
    const fake = clienteFake();
    assert.equal(await executar(['--tabela', 't'], depsFake({ cliente: fake })), 0);
    const primeira = JSON.stringify([...fake.dados.entries()].sort());
    assert.equal(fake.dados.size, 281);
    assert.equal(await executar(['--tabela', 't'], depsFake({ cliente: fake })), 0);
    assert.equal(fake.dados.size, 281);
    assert.equal(JSON.stringify([...fake.dados.entries()].sort()), primeira);
  });
});

describe('opções', () => {
  test('TABELA_LAVAGEM do env e região padrão us-east-1', () => {
    const o = lerOpcoes([], { TABELA_LAVAGEM: 'da-env' }, dirScript);
    assert.equal(o.tabela, 'da-env');
    assert.equal(o.regiao, 'us-east-1');
    assert.equal(o.tentativas, 8);
    assert.equal(o.perfil, undefined);
  });

  test('--tabela tem precedência; AWS_REGION quando presente; --regiao e --perfil', () => {
    assert.equal(lerOpcoes(['--tabela', 'a'], { TABELA_LAVAGEM: 'b' }).tabela, 'a');
    assert.equal(lerOpcoes(['--tabela', 'a'], { AWS_REGION: 'sa-east-1' }).regiao, 'sa-east-1');
    const o = lerOpcoes(['--tabela', 'a', '--regiao', 'us-west-2', '--perfil', 'hackathon'], { AWS_REGION: 'sa-east-1' });
    assert.equal(o.regiao, 'us-west-2');
    assert.equal(o.perfil, 'hackathon');
  });

  test('--perfil sem região explícita deixa o SDK usar a região do perfil', () => {
    assert.equal(lerOpcoes(['--tabela', 'a', '--perfil', 'alan'], {}).regiao, undefined);
    assert.equal(lerOpcoes(['--tabela', 'a', '--perfil', 'alan'], { AWS_REGION: 'sa-east-1' }).regiao, 'sa-east-1');
  });

  test('arquivo padrão resolvido a partir do script, não do cwd', () => {
    const o = lerOpcoes(['--tabela', 'a'], {}, dirScript, path.parse(dirScript).root);
    assert.equal(o.arquivo, CAMINHO_DEMO);
  });

  test('--arquivo informado é relativo ao cwd', () => {
    const raiz = path.resolve(dirScript, '../..');
    const o = lerOpcoes(['--tabela', 'a', '--arquivo', 'data/seed/gabarito/itens.json'], {}, dirScript, raiz);
    assert.equal(o.arquivo, CAMINHO_GABARITO);
  });

  test('erros de uso retornam código 2', async () => {
    for (const argv of [[], ['--tabela', 'a', '--endpoint', 'http://x'], ['--tabela', 'a', '--tentativas', '0'], ['--tabela', 'a', 'posicional']]) {
      assert.throws(() => lerOpcoes(argv, {}), (e) => e instanceof ErroCarga && e.codigoSaida === 2, JSON.stringify(argv));
    }
    const deps = depsFake();
    assert.equal(await executar(['--dry-run'], deps), 2);
    assert.match(deps.erros[0], /TABELA_LAVAGEM/);
  });

  test('--help mostra a ajuda sem exigir tabela', async () => {
    const deps = depsFake();
    assert.equal(await executar(['--help'], deps), 0);
    assert.match(deps.logs[0], /--criar-tabela/);
    assert.equal(deps.nCriarClientes, 0);
  });
});

describe('gabarito', () => {
  test('ehGabarito pelo caminho ou por ter 3 lavagens', () => {
    assert.equal(ehGabarito('C:\\x\\Gabarito\\itens.json', []), true);
    assert.equal(ehGabarito('/tmp/copia.json', GABARITO), true);
    assert.equal(ehGabarito(CAMINHO_DEMO, DEMO), false);
  });

  test('avisa e não bloqueia', async () => {
    const deps = depsFake({ itens: GABARITO });
    assert.equal(await executar(['--tabela', 't', '--dry-run', '--arquivo', CAMINHO_GABARITO], deps), 0);
    assert.match(deps.logs[0], /AVISO: arquivo do gabarito.*CNPJ da lavagem 3398.*fixture de testes/);
    assert.match(deps.logs.join('\n'), /TOTAL\s+12/);
  });
});

describe('tabela', () => {
  test('--criar-tabela cria com PK/SK string, PAY_PER_REQUEST, SSE e espera ACTIVE', async () => {
    const fake = clienteFake({ tabelaExiste: false });
    let esperou = '';
    const r = await garantirTabela(fake, 't', { criar: true, esperarTabelaAtiva: async (n) => { esperou = n; } });
    assert.deepEqual(r, { criada: true });
    assert.equal(esperou, 't');
    const create = fake.chamadas.find((c) => c.nome === 'CreateTableCommand').input;
    assert.deepEqual(create.AttributeDefinitions, [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
    ]);
    assert.deepEqual(create.KeySchema, [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ]);
    assert.equal(create.BillingMode, 'PAY_PER_REQUEST');
    // Sem SSESpecification: vale a criptografia padrão (chave da AWS), sem custo de KMS.
    assert.equal(create.SSESpecification, undefined);
  });

  test('tabela existente não é recriada', async () => {
    const fake = clienteFake();
    assert.deepEqual(await garantirTabela(fake, 't', { criar: true }), { criada: false });
    assert.ok(!fake.chamadas.some((c) => c.nome === 'CreateTableCommand'));
  });

  test('sem --criar-tabela: erro mencionando --criar-tabela, nada gravado', async () => {
    await assert.rejects(garantirTabela(clienteFake({ tabelaExiste: false }), 't'), /--criar-tabela/);
    const fake = clienteFake({ tabelaExiste: false });
    const deps = depsFake({ cliente: fake });
    assert.equal(await executar(['--tabela', 't'], deps), 1);
    assert.deepEqual(fake.chamadas.map((c) => c.nome), ['DescribeTableCommand']);
  });

  test('executar com --criar-tabela usa o waiter do cliente', async () => {
    const deps = depsFake({ cliente: clienteFake({ tabelaExiste: false }) });
    assert.equal(await executar(['--tabela', 't', '--criar-tabela'], deps), 0);
    assert.equal(deps.esperou, 1);
    assert.equal(deps.cliente.dados.size, 281);
  });
});

describe('erros do SDK', () => {
  const ctx = { tabela: 'tab', regiao: 'us-east-1', perfil: 'hackathon' };
  test('mensagens em português', () => {
    assert.match(traduzirErro(erroSdk('ResourceNotFoundException'), ctx), /tabela tab não existe/);
    assert.match(traduzirErro(erroSdk('CredentialsProviderError'), ctx), /Credenciais AWS.*aws sso login --profile hackathon/);
    assert.match(traduzirErro(erroSdk('ExpiredTokenException'), ctx), /expiradas/);
    assert.match(traduzirErro(erroSdk('AccessDeniedException'), ctx), /Acesso negado.*README/);
    assert.match(traduzirErro(Object.assign(new Error('x'), { code: 'ENOTFOUND' }), ctx), /Sem conexão/);
    assert.match(traduzirErro(erroSdk('ValidationException'), ctx), /^ValidationException: /);
  });

  test('stack só com --verbose', async () => {
    const fake = clienteFake({ contadorFalha: erroSdk('AccessDeniedException') });
    const semVerbose = depsFake({ cliente: fake });
    assert.equal(await executar(['--tabela', 'tab'], semVerbose), 1);
    assert.equal(semVerbose.erros.length, 1);
    assert.match(semVerbose.erros[0], /Acesso negado/);
    assert.doesNotMatch(semVerbose.erros[0], /\n\s+at /);

    const comVerbose = depsFake({ cliente: clienteFake({ contadorFalha: erroSdk('AccessDeniedException') }) });
    assert.equal(await executar(['--tabela', 'tab', '--verbose'], comVerbose), 1);
    assert.equal(comVerbose.erros.length, 2);
    assert.match(comVerbose.erros[1], /\n\s+at /);
  });
});
