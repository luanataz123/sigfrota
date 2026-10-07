// Invariantes dos dados sintéticos (node:test, sem dependências).
// Rodar a partir da raiz do repositório: node --test data/seed/
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const ler = (rel) => JSON.parse(readFileSync(join(DIR, rel), 'utf8'));

const gabarito = ler('gabarito/itens.json');
const demo = ler('demo/itens.json');
const anomalias = ler('demo/anomalias.json');
const esperado = ler('recibos/esperado.json');

const doTipo = (itens, t) => itens.filter((i) => i.entityType === t);
const lavagensDe = (itens) => doTipo(itens, 'LAVAGEM');

const CNPJ_LEGADO = '12.345.678/0001-90'; // só no gabarito (igual ao SQL)
const CNPJ_3398_DEMO = '12.345.678/0001-95'; // DV correto; o demo só tem dados já validados
const LIMITE = '2026-10-06';
const TIPOS_ANOMALIA = ['VALOR_ACIMA_MEDIA', 'MESMO_DIA', 'KM_REGREDIDO'];

// --- helpers independentes do gerador ---------------------------------------
function cnpjValido(cnpj) {
  if (!/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(cnpj)) return false;
  const d = cnpj.replace(/\D/g, '').split('').map(Number);
  if (d.every((x) => x === d[0])) return false;
  const calc = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = pesos.reduce((s, p, i) => s + p * d[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === d[12] && calc(13) === d[13];
}
function dataValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, dd] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, dd));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === dd;
}
const dia = (s) => Date.UTC(...s.split('-').map((x, i) => (i === 1 ? Number(x) - 1 : Number(x)))) / 86400000;
const ordenarTl = (tl) =>
  [...tl].sort((a, b) => (a.dtLavagem < b.dtLavagem ? -1 : a.dtLavagem > b.dtLavagem ? 1 : a.idLavagem - b.idLavagem));
function porVeiculo(lavagens) {
  const m = new Map();
  for (const l of lavagens) m.set(l.idVeiculo, [...(m.get(l.idVeiculo) ?? []), l]);
  for (const [k, tl] of m) m.set(k, ordenarTl(tl));
  return m;
}
function criterios(lavagens) {
  const res = { VALOR_ACIMA_MEDIA: new Set(), MESMO_DIA: new Set(), KM_REGREDIDO: new Set() };
  const soma = new Map();
  for (const l of lavagens) {
    if (l.vlLavagem == null) continue;
    const a = soma.get(l.idTipoLavagem) ?? [0, 0];
    soma.set(l.idTipoLavagem, [a[0] + l.vlLavagem, a[1] + 1]);
  }
  for (const l of lavagens) {
    if (l.vlLavagem == null) continue;
    const [s, n] = soma.get(l.idTipoLavagem);
    if (l.vlLavagem >= (3 * s) / n) res.VALOR_ACIMA_MEDIA.add(l.idLavagem);
  }
  for (const tl of porVeiculo(lavagens).values()) {
    for (let i = 1; i < tl.length; i++) {
      if (tl[i].dtLavagem === tl[i - 1].dtLavagem) res.MESMO_DIA.add(tl[i].idLavagem);
      if (tl[i].kmLavagem < tl[i - 1].kmLavagem) res.KM_REGREDIDO.add(tl[i].idLavagem);
    }
  }
  return res;
}
const idsAnomalia = new Set(anomalias.map((a) => a.idLavagem));
const idsDoTipo = (tipo) => new Set(anomalias.filter((a) => a.tipo === tipo).map((a) => a.idLavagem));

const LAVAGENS_SQL = [
  {
    PK: 'VEICULO#101', SK: 'LAVAGEM#3397', entityType: 'LAVAGEM', idLavagem: 3397, idTipoLavagem: 2,
    dsTipoLavagem: 'Completa', dtLavagem: '2026-09-01', kmLavagem: 45000, vlLavagem: 60, idVeiculo: 101,
    dsPosto: null, cnpjPosto: null, idPosto: 10, idPessoaCadastrador: 9001, dtCadastro: '2026-09-01',
    propriaUnidade: false, postoConveniado: true,
  },
  {
    PK: 'VEICULO#102', SK: 'LAVAGEM#3398', entityType: 'LAVAGEM', idLavagem: 3398, idTipoLavagem: 1,
    dsTipoLavagem: 'Simples', dtLavagem: '2026-09-03', kmLavagem: 88800, vlLavagem: 35, idVeiculo: 102,
    dsPosto: 'Lava-Jato do Ze', cnpjPosto: CNPJ_LEGADO, idPosto: null, idPessoaCadastrador: 9001,
    dtCadastro: '2026-09-03', propriaUnidade: false, postoConveniado: false,
  },
  {
    PK: 'VEICULO#103', SK: 'LAVAGEM#3399', entityType: 'LAVAGEM', idLavagem: 3399, idTipoLavagem: 3,
    dsTipoLavagem: 'Higienizacao interna', dtLavagem: '2026-09-05', kmLavagem: 12050, vlLavagem: null,
    idVeiculo: 103, dsPosto: null, cnpjPosto: null, idPosto: null, idPessoaCadastrador: 9001,
    dtCadastro: '2026-09-05', propriaUnidade: true, postoConveniado: null,
  },
];

// --- Gabarito ---------------------------------------------------------------
describe('gabarito', () => {
  test('tem exatamente os 12 itens do SQL', () => {
    assert.equal(gabarito.length, 12);
    const cont = Object.fromEntries(
      ['TIPO_LAVAGEM', 'VEICULO', 'POSTO', 'LAVAGEM', 'CONTADOR'].map((t) => [t, doTipo(gabarito, t).length]),
    );
    assert.deepEqual(cont, { TIPO_LAVAGEM: 3, VEICULO: 3, POSTO: 2, LAVAGEM: 3, CONTADOR: 1 });
  });

  test('lavagens iguais ao SQL, veículo 101 com 1 lavagem, contador 3399', () => {
    const lav = lavagensDe(gabarito).sort((a, b) => a.idLavagem - b.idLavagem);
    assert.deepEqual(lav, LAVAGENS_SQL);
    assert.equal(lav.filter((l) => l.idVeiculo === 101).length, 1);
    assert.equal(doTipo(gabarito, 'CONTADOR')[0].ultimoId, 3399);
  });

  test('catálogo só com o que o SQL tem', () => {
    for (const p of doTipo(gabarito, 'POSTO')) assert.ok(!('cnpj' in p), `posto ${p.idPosto} com cnpj`);
    for (const t of doTipo(gabarito, 'TIPO_LAVAGEM')) {
      assert.ok(!('vlReferenciaMin' in t) && !('vlReferenciaMax' in t));
    }
    const v = doTipo(gabarito, 'VEICULO').map((x) => [x.idVeiculo, x.dsVeiculo, x.kmAtual]);
    assert.deepEqual(v, [
      [101, 'Fiat Cronos de placa ABC1D23', 45210],
      [102, 'VW Voyage de placa DEF2G45', 88750],
      [103, 'Chevrolet Onix de placa HIJ3K67', 12030],
    ]);
    assert.deepEqual(
      doTipo(gabarito, 'POSTO').map((p) => p.nmPosto),
      ['Auto Posto Central (conveniado)', 'Lava-Rapido Norte (conveniado)'],
    );
  });
});

// --- Gerais (gabarito e demo) -----------------------------------------------
for (const [nome, itens] of [['gabarito', gabarito], ['demo', demo]]) {
  describe(`invariantes gerais: ${nome}`, () => {
    const tipos = new Map(doTipo(itens, 'TIPO_LAVAGEM').map((t) => [t.idTipoLavagem, t]));
    const veiculos = new Set(doTipo(itens, 'VEICULO').map((v) => v.idVeiculo));
    const postos = new Set(doTipo(itens, 'POSTO').map((p) => p.idPosto));
    const lavagens = lavagensDe(itens);

    test('chaves PK/SK/entityType presentes e únicas; sem GSI e sem dado pessoal', () => {
      const chaves = new Set();
      for (const i of itens) {
        for (const k of ['PK', 'SK', 'entityType']) assert.ok(typeof i[k] === 'string' && i[k].length > 0, `${k} ausente`);
        const ch = `${i.PK}|${i.SK}`;
        assert.ok(!chaves.has(ch), `chave duplicada ${ch}`);
        chaves.add(ch);
        for (const attr of Object.keys(i)) {
          assert.ok(!/^gsi/i.test(attr), `atributo GSI ${attr}`);
          assert.ok(!/cpf|email|matricula|nomePessoa|nmPessoa/i.test(attr), `atributo pessoal ${attr}`);
        }
      }
    });

    test('chaves seguem o desenho da tabela', () => {
      for (const i of itens) {
        if (i.entityType === 'VEICULO') assert.deepEqual([i.PK, i.SK], ['CATALOGO', `VEICULO#${i.idVeiculo}`]);
        if (i.entityType === 'TIPO_LAVAGEM') assert.deepEqual([i.PK, i.SK], ['CATALOGO', `TIPO#${i.idTipoLavagem}`]);
        if (i.entityType === 'POSTO') assert.deepEqual([i.PK, i.SK], ['CATALOGO', `POSTO#${i.idPosto}`]);
        if (i.entityType === 'LAVAGEM') assert.deepEqual([i.PK, i.SK], [`VEICULO#${i.idVeiculo}`, `LAVAGEM#${i.idLavagem}`]);
        if (i.entityType === 'CONTADOR') assert.deepEqual([i.PK, i.SK], ['CONTADOR', 'LAVAGEM']);
      }
    });

    test('toda lavagem satisfaz R02–R07 e R09–R15', () => {
      for (const l of lavagens) {
        const id = `lavagem ${l.idLavagem}`;
        // R02
        for (const k of ['idTipoLavagem', 'dtLavagem', 'kmLavagem', 'idVeiculo']) assert.ok(l[k] != null, `${id}: ${k} (R02)`);
        // R03
        assert.ok(l.vlLavagem === null || (typeof l.vlLavagem === 'number' && l.vlLavagem > 0), `${id}: valor (R03)`);
        // R04
        assert.ok(Number.isInteger(l.kmLavagem) && l.kmLavagem > 0, `${id}: km (R04)`);
        // R05–R07
        assert.ok(tipos.has(l.idTipoLavagem), `${id}: tipo inexistente (R05)`);
        assert.equal(l.dsTipoLavagem, tipos.get(l.idTipoLavagem).dsTipoLavagem, `${id}: dsTipoLavagem`);
        assert.ok(veiculos.has(l.idVeiculo), `${id}: veículo inexistente (R06)`);
        if (l.idPosto != null) assert.ok(postos.has(l.idPosto), `${id}: posto inexistente (R07)`);
        // R09
        assert.equal(typeof l.propriaUnidade, 'boolean', `${id}: propriaUnidade (R09)`);
        if (l.propriaUnidade) {
          // R10
          for (const k of ['vlLavagem', 'idPosto', 'dsPosto', 'cnpjPosto', 'postoConveniado']) {
            assert.equal(l[k], null, `${id}: interna com ${k} (R10)`);
          }
        } else {
          // R11, R12
          assert.ok(l.vlLavagem > 0, `${id}: externa sem valor (R11)`);
          assert.equal(typeof l.postoConveniado, 'boolean', `${id}: postoConveniado (R12)`);
          if (l.postoConveniado) {
            // R13
            assert.ok(l.idPosto != null, `${id}: conveniado sem posto (R13)`);
            assert.equal(l.dsPosto, null);
            assert.equal(l.cnpjPosto, null);
          } else {
            // R14
            assert.ok(typeof l.dsPosto === 'string' && l.dsPosto.trim() !== '', `${id}: sem dsPosto (R14)`);
            assert.ok(typeof l.cnpjPosto === 'string' && l.cnpjPosto.trim() !== '', `${id}: sem cnpjPosto (R14)`);
            assert.equal(l.idPosto, null);
          }
        }
        // R15
        assert.ok(dataValida(l.dtLavagem), `${id}: dtLavagem (R15)`);
        assert.ok(dataValida(l.dtCadastro), `${id}: dtCadastro`);
      }
    });

    test('limites de valor, km, cadastrador e contador', () => {
      for (const l of lavagens) {
        if (l.vlLavagem != null) {
          assert.ok(l.vlLavagem <= 999.99, `valor ${l.idLavagem}`);
          assert.equal(Math.round(l.vlLavagem * 100) / 100, l.vlLavagem, `casas decimais ${l.idLavagem}`);
        }
        assert.ok(l.kmLavagem <= 999999, `km ${l.idLavagem}`);
        assert.ok([9001, 9002, 9003, 9004].includes(l.idPessoaCadastrador), `cadastrador ${l.idLavagem}`);
        assert.ok(l.dtLavagem <= LIMITE && l.dtCadastro <= LIMITE, `data futura ${l.idLavagem}`);
      }
      const contador = doTipo(itens, 'CONTADOR');
      assert.equal(contador.length, 1);
      assert.equal(contador[0].ultimoId, Math.max(...lavagens.map((l) => l.idLavagem)));
    });

    const ehGabarito = nome === 'gabarito';
    test(ehGabarito ? 'todo CNPJ tem dígito válido, exceto o legado da 3398' : 'todo CNPJ tem dígito válido, sem exceção', () => {
      for (const l of lavagens) {
        if (l.cnpjPosto == null) continue;
        if (ehGabarito && l.idLavagem === 3398) {
          assert.equal(l.cnpjPosto, CNPJ_LEGADO);
          assert.equal(cnpjValido(l.cnpjPosto), false);
        } else {
          assert.ok(cnpjValido(l.cnpjPosto), `cnpj inválido na lavagem ${l.idLavagem}: ${l.cnpjPosto}`);
        }
      }
      if (ehGabarito) return; // postos do gabarito não têm cnpj (checado em 'catálogo só com o que o SQL tem')
      for (const p of doTipo(itens, 'POSTO')) {
        assert.ok(typeof p.cnpj === 'string', `posto ${p.idPosto} sem cnpj`);
        assert.ok(cnpjValido(p.cnpj), `cnpj inválido no posto ${p.idPosto}: ${p.cnpj}`);
      }
    });
  });
}

// --- Demo -------------------------------------------------------------------
describe('demo', () => {
  const lavagens = lavagensDe(demo);
  const novas = lavagens.filter((l) => l.idLavagem >= 3400);
  const tipos = new Map(doTipo(demo, 'TIPO_LAVAGEM').map((t) => [t.idTipoLavagem, t]));
  const veiculos = doTipo(demo, 'VEICULO');

  test('é superconjunto do gabarito (exceto cnpjPosto da 3398, corrigido no demo)', () => {
    const porChave = new Map(demo.map((i) => [`${i.PK}|${i.SK}`, i]));
    for (const g of gabarito) {
      if (g.entityType === 'CONTADOR') continue;
      const d = porChave.get(`${g.PK}|${g.SK}`);
      assert.ok(d, `item ${g.PK}|${g.SK} ausente no demo`);
      if (g.entityType === 'TIPO_LAVAGEM') {
        const { vlReferenciaMin, vlReferenciaMax, ...resto } = d;
        assert.deepEqual(resto, g);
      } else if (g.entityType === 'POSTO') {
        const { cnpj, ...resto } = d;
        assert.deepEqual(resto, g);
      } else if (g.entityType === 'LAVAGEM' && g.idLavagem === 3398) {
        assert.equal(d.cnpjPosto, CNPJ_3398_DEMO);
        assert.deepEqual({ ...d, cnpjPosto: g.cnpjPosto }, g);
      } else {
        assert.deepEqual(d, g);
      }
    }
  });

  test('contagens do catálogo e das lavagens', () => {
    assert.deepEqual(veiculos.map((v) => v.idVeiculo).sort((a, b) => a - b), Array.from({ length: 18 }, (_, i) => 101 + i));
    assert.equal(tipos.size, 3);
    for (const t of tipos.values()) assert.ok(t.vlReferenciaMin > 0 && t.vlReferenciaMax > t.vlReferenciaMin);
    assert.deepEqual(doTipo(demo, 'POSTO').map((p) => p.idPosto).sort((a, b) => a - b), [10, 11, 12, 13, 14, 15]);
    assert.ok(novas.length >= 240 && novas.length <= 260, `novas = ${novas.length}`);
    const nc = novas.filter((l) => l.postoConveniado === false);
    const pares = new Set(nc.map((l) => `${l.dsPosto}|${l.cnpjPosto}`));
    assert.equal(pares.size, 5, 'cinco postos não conveniados');
    const nomes = new Set(nc.map((l) => l.dsPosto));
    assert.equal(nomes.size, 5, 'cada nome com um único CNPJ');
  });

  test('veículos: placas Mercosul únicas, dsVeiculo e kmAtual', () => {
    const placas = new Set();
    for (const v of veiculos) {
      assert.match(v.placa, /^[A-Z]{3}\d[A-Z]\d{2}$/);
      assert.ok(!placas.has(v.placa), `placa duplicada ${v.placa}`);
      placas.add(v.placa);
      assert.equal(v.dsVeiculo, `${v.marca} ${v.modelo} de placa ${v.placa}`);
      assert.ok(Number.isInteger(v.ano));
      if (v.idVeiculo >= 104) {
        const maxKm = Math.max(...lavagens.filter((l) => l.idVeiculo === v.idVeiculo).map((l) => l.kmLavagem));
        assert.ok(v.kmAtual >= maxKm, `kmAtual do veículo ${v.idVeiculo}`);
      }
    }
  });

  test('IDs novos contínuos a partir de 3400, em ordem de dtCadastro', () => {
    const ids = novas.map((l) => l.idLavagem).sort((a, b) => a - b);
    const ultimo = doTipo(demo, 'CONTADOR')[0].ultimoId;
    assert.deepEqual(ids, Array.from({ length: ultimo - 3400 + 1 }, (_, i) => 3400 + i));
    const ord = [...novas].sort((a, b) => a.idLavagem - b.idLavagem);
    for (let i = 1; i < ord.length; i++) assert.ok(ord[i].dtCadastro >= ord[i - 1].dtCadastro, `dtCadastro ${ord[i].idLavagem}`);
  });

  test('datas: período, limite e atraso de cadastro de 0 a 3 dias', () => {
    for (const l of novas) {
      assert.ok(l.dtLavagem >= '2025-10-01' && l.dtLavagem <= '2026-09-30', `período ${l.idLavagem}`);
      const atraso = dia(l.dtCadastro) - dia(l.dtLavagem);
      assert.ok(atraso >= 0 && atraso <= 3, `atraso ${l.idLavagem}`);
    }
  });

  test('valores das lavagens não anômalas dentro da faixa do tipo', () => {
    for (const l of lavagens) {
      if (l.vlLavagem == null || idsAnomalia.has(l.idLavagem)) continue;
      const t = tipos.get(l.idTipoLavagem);
      assert.ok(l.vlLavagem >= t.vlReferenciaMin && l.vlLavagem <= t.vlReferenciaMax, `valor ${l.idLavagem}`);
    }
  });

  test('101–103: histórico novo anterior (data e km) à lavagem original', () => {
    for (const orig of LAVAGENS_SQL) {
      const hist = novas.filter((l) => l.idVeiculo === orig.idVeiculo);
      assert.ok(hist.length > 0);
      for (const l of hist) {
        assert.ok(l.dtLavagem < orig.dtLavagem, `data ${l.idLavagem}`);
        assert.ok(l.kmLavagem < orig.kmLavagem, `km ${l.idLavagem}`);
      }
    }
  });

  test('km crescente e uma lavagem por dia, exceto as anomalias do manifesto', () => {
    const regredido = idsDoTipo('KM_REGREDIDO');
    const mesmoDia = idsDoTipo('MESMO_DIA');
    for (const tl of porVeiculo(lavagens).values()) {
      for (let i = 1; i < tl.length; i++) {
        if (tl[i].kmLavagem <= tl[i - 1].kmLavagem) assert.ok(regredido.has(tl[i].idLavagem), `km não crescente ${tl[i].idLavagem}`);
        if (tl[i].dtLavagem === tl[i - 1].dtLavagem) assert.ok(mesmoDia.has(tl[i].idLavagem), `mesmo dia ${tl[i].idLavagem}`);
      }
    }
  });

  test('anomalias: manifesto completo e critérios exatos', () => {
    assert.equal(anomalias.length, 7);
    const cont = Object.fromEntries(TIPOS_ANOMALIA.map((t) => [t, anomalias.filter((a) => a.tipo === t).length]));
    assert.deepEqual(cont, { VALOR_ACIMA_MEDIA: 3, MESMO_DIA: 2, KM_REGREDIDO: 2 });
    assert.equal(idsAnomalia.size, 7, 'IDs distintos');
    const porId = new Map(lavagens.map((l) => [l.idLavagem, l]));
    for (const a of anomalias) {
      const l = porId.get(a.idLavagem);
      assert.ok(l, `anomalia ${a.idLavagem} inexistente`);
      assert.equal(l.idVeiculo, a.idVeiculo);
      assert.ok(typeof a.descricao === 'string' && a.descricao.length > 0);
      if (l.vlLavagem != null) assert.ok(l.vlLavagem <= 999.99);
    }
    const crit = criterios(lavagens);
    for (const t of TIPOS_ANOMALIA) {
      assert.deepEqual([...crit[t]].sort(), [...idsDoTipo(t)].sort(), `critério ${t}`);
    }
  });

  test('proporções internas / externas / conveniado (±10 p.p.)', () => {
    const internas = lavagens.filter((l) => l.propriaUnidade).length / lavagens.length;
    const ext = lavagens.filter((l) => !l.propriaUnidade);
    const conv = ext.filter((l) => l.postoConveniado).length / ext.length;
    assert.ok(internas >= 0.3 && internas <= 0.5, `internas ${internas}`);
    assert.ok(conv >= 0.65 && conv <= 0.85, `conveniado ${conv}`);
  });

  test('km/mês plausível nos veículos 104–118', () => {
    for (const [id, tl] of porVeiculo(lavagens)) {
      if (id < 104) continue;
      const ok = tl.filter((l) => !idsAnomalia.has(l.idLavagem));
      const primeira = ok[0];
      const ultima = ok[ok.length - 1];
      const meses = (dia(ultima.dtLavagem) - dia(primeira.dtLavagem)) / 30.44;
      const kmMes = (ultima.kmLavagem - primeira.kmLavagem) / meses;
      assert.ok(kmMes >= 1200 && kmMes <= 3300, `veículo ${id}: ${kmMes.toFixed(0)} km/mês`);
    }
  });
});

// --- Recibos ----------------------------------------------------------------
describe('recibos', () => {
  const lavagens = new Map(lavagensDe(demo).map((l) => [l.idLavagem, l]));
  const postos = new Map(doTipo(demo, 'POSTO').map((p) => [p.idPosto, p]));

  test('8 PNG válidos com os nomes do esperado.json', () => {
    const pngs = readdirSync(join(DIR, 'recibos')).filter((f) => f.endsWith('.png')).sort();
    assert.deepEqual(pngs, esperado.map((e) => e.arquivo).sort());
    assert.equal(pngs.length, 8);
    for (const f of pngs) {
      const b = readFileSync(join(DIR, 'recibos', f));
      assert.deepEqual([...b.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `assinatura ${f}`);
      assert.equal(b.subarray(12, 16).toString('ascii'), 'IHDR');
      assert.ok(b.readUInt32BE(16) > 0 && b.readUInt32BE(20) > 0, `dimensões ${f}`);
    }
  });

  test('esperado.json bate com as lavagens do demo', () => {
    assert.equal(esperado.length, 8);
    let conv = 0;
    for (const e of esperado) {
      assert.deepEqual(Object.keys(e), ['arquivo', 'idLavagem', 'vlLavagem', 'dtLavagem', 'nomePosto', 'cnpj']);
      assert.equal(e.arquivo, `recibo-${e.idLavagem}.png`);
      const l = lavagens.get(e.idLavagem);
      assert.ok(l, `lavagem ${e.idLavagem} inexistente`);
      assert.equal(l.propriaUnidade, false, 'recibo de lavagem interna');
      assert.ok(!idsAnomalia.has(e.idLavagem), 'recibo usa anomalia');
      assert.equal(e.vlLavagem, l.vlLavagem);
      assert.equal(e.dtLavagem, l.dtLavagem);
      if (l.postoConveniado) {
        conv++;
        const p = postos.get(l.idPosto);
        assert.equal(e.nomePosto, p.nmPosto);
        assert.equal(e.cnpj, p.cnpj);
      } else {
        assert.equal(e.nomePosto, l.dsPosto);
        assert.equal(e.cnpj, l.cnpjPosto);
      }
      assert.ok(cnpjValido(e.cnpj));
    }
    assert.equal(conv, 4, '4 conveniados e 4 não conveniados');
  });
});

// --- Determinismo -----------------------------------------------------------
describe('determinismo', () => {
  const tmps = [];
  after(() => {
    for (const t of tmps) rmSync(t, { recursive: true, force: true });
  });

  test('gerar duas vezes produz JSON idênticos aos versionados', () => {
    const gerar = () => {
      const out = mkdtempSync(join(tmpdir(), 'sigfrota-seed-'));
      tmps.push(out);
      execFileSync(process.execPath, [join(DIR, 'gerar-seed.mjs'), '--out', out, '--sem-png'], { stdio: 'pipe' });
      return out;
    };
    const a = gerar();
    const b = gerar();
    for (const rel of ['gabarito/itens.json', 'demo/itens.json', 'demo/anomalias.json', 'recibos/esperado.json']) {
      const atual = readFileSync(join(DIR, rel), 'utf8');
      assert.equal(readFileSync(join(a, rel), 'utf8'), atual, `${rel} (execução A)`);
      assert.equal(readFileSync(join(b, rel), 'utf8'), atual, `${rel} (execução B)`);
    }
  });
});
