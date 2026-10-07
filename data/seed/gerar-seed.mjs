#!/usr/bin/env node
// Gerador determinístico dos dados sintéticos do módulo de Lavagem (SIG Frota).
// Todos os dados são FICTÍCIOS. Saída: itens no formato do DynamoDB DocumentClient
// (tabela única, PK/SK/entityType), conforme o README da raiz ("Modelagem no DynamoDB").
//
// Uso: node gerar-seed.mjs [--out <dir>] [--sem-png]
//   --out      diretório de saída (default: o diretório deste script)
//   --sem-png  grava todos os JSON, mas não gera os PNG dos recibos (não carrega o sharp)
//
// Determinismo: PRNG mulberry32 com semente fixa; nada de Math.random nem Date.now.

import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// 1. CLI
// ---------------------------------------------------------------------------
let outDir = fileURLToPath(new URL('.', import.meta.url));
let semPng = false;
{
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') {
      outDir = args[++i];
      if (!outDir) throw new Error('--out exige um diretório');
    } else if (args[i] === '--sem-png') {
      semPng = true;
    } else {
      throw new Error(`Argumento desconhecido: ${args[i]}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. PRNG, helpers e datas
// ---------------------------------------------------------------------------
const SEMENTE = 20261006;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(SEMENTE);
const int = (min, max) => min + Math.floor(rnd() * (max - min + 1));
const float = (min, max) => min + rnd() * (max - min);
const pick = (arr) => arr[int(0, arr.length - 1)];
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// opcoes: [[valor, peso], ...]
function pickPeso(opcoes) {
  const total = opcoes.reduce((s, [, p]) => s + p, 0);
  let r = rnd() * total;
  for (const [v, p] of opcoes) {
    if ((r -= p) < 0) return v;
  }
  return opcoes[opcoes.length - 1][0];
}
const round2 = (v) => Math.round(v * 100) / 100;

const DIA_MS = 86400000;
function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DIA_MS);
}
const toISO = (dia) => new Date(dia * DIA_MS).toISOString().slice(0, 10);
const fmtBR = (iso) => iso.split('-').reverse().join('/');
const fmtMoeda = (v) => `R$ ${v.toFixed(2).replace('.', ',')}`;
const fmtKm = (km) => String(km).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fmtNum1 = (v) => v.toFixed(1).replace('.', ',');

const INICIO = parseISO('2025-10-01');
const FIM = parseISO('2026-09-30');
const LIMITE = parseISO('2026-10-06'); // nenhuma data depois disso
const PRIMEIRO_ID_NOVO = 3400;
const CADASTRADORES = [9001, 9002, 9003, 9004];

// ---------------------------------------------------------------------------
// 3. CNPJ
// ---------------------------------------------------------------------------
function calcularDV(base12) {
  const dv = (digs, pesos) => {
    const soma = digs.reduce((s, d, i) => s + d * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d = base12.split('').map(Number);
  const d1 = dv(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv([...d, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${d1}${d2}`;
}
const cnpjsUsados = new Set(['12345678000190']);
function gerarCnpj() {
  for (;;) {
    let raiz = '';
    for (let i = 0; i < 8; i++) raiz += int(0, 9);
    const base = `${raiz}0001`;
    const num = base + calcularDV(base);
    if (cnpjsUsados.has(num) || /^(\d)\1+$/.test(raiz)) continue;
    cnpjsUsados.add(num);
    return `${num.slice(0, 2)}.${num.slice(2, 5)}.${num.slice(5, 8)}/${num.slice(8, 12)}-${num.slice(12)}`;
  }
}

// ---------------------------------------------------------------------------
// 4. Catálogo do gabarito (literal do docs/lavagem-sintetico.sql)
// ---------------------------------------------------------------------------
const TIPOS = [
  { idTipoLavagem: 1, dsTipoLavagem: 'Simples', vlReferenciaMin: 30, vlReferenciaMax: 50 },
  { idTipoLavagem: 2, dsTipoLavagem: 'Completa', vlReferenciaMin: 55, vlReferenciaMax: 95 },
  { idTipoLavagem: 3, dsTipoLavagem: 'Higienizacao interna', vlReferenciaMin: 120, vlReferenciaMax: 220 },
];
const dsTipo = (id) => TIPOS.find((t) => t.idTipoLavagem === id).dsTipoLavagem;

const VEICULOS_ORIGINAIS = [
  { idVeiculo: 101, marca: 'Fiat', modelo: 'Cronos', placa: 'ABC1D23', ano: 2022, kmAtual: 45210 },
  { idVeiculo: 102, marca: 'VW', modelo: 'Voyage', placa: 'DEF2G45', ano: 2019, kmAtual: 88750 },
  { idVeiculo: 103, marca: 'Chevrolet', modelo: 'Onix', placa: 'HIJ3K67', ano: 2025, kmAtual: 12030 },
];
const POSTOS_ORIGINAIS = [
  { idPosto: 10, nmPosto: 'Auto Posto Central (conveniado)' },
  { idPosto: 11, nmPosto: 'Lava-Rapido Norte (conveniado)' },
];
const LAVAGENS_ORIGINAIS = [
  {
    idLavagem: 3397, idTipoLavagem: 2, dtLavagem: '2026-09-01', kmLavagem: 45000, vlLavagem: 60,
    idVeiculo: 101, dsPosto: null, cnpjPosto: null, idPosto: 10, idPessoaCadastrador: 9001,
    dtCadastro: '2026-09-01', propriaUnidade: false, postoConveniado: true,
  },
  {
    idLavagem: 3398, idTipoLavagem: 1, dtLavagem: '2026-09-03', kmLavagem: 88800, vlLavagem: 35,
    idVeiculo: 102, dsPosto: 'Lava-Jato do Ze', cnpjPosto: '12.345.678/0001-90', idPosto: null,
    idPessoaCadastrador: 9001, dtCadastro: '2026-09-03', propriaUnidade: false, postoConveniado: false,
  },
  {
    idLavagem: 3399, idTipoLavagem: 3, dtLavagem: '2026-09-05', kmLavagem: 12050, vlLavagem: null,
    idVeiculo: 103, dsPosto: null, cnpjPosto: null, idPosto: null, idPessoaCadastrador: 9001,
    dtCadastro: '2026-09-05', propriaUnidade: true, postoConveniado: null,
  },
];

// Construtores de itens (ordem fixa das chaves)
const itemTipo = (t, demo) => ({
  PK: 'CATALOGO', SK: `TIPO#${t.idTipoLavagem}`, entityType: 'TIPO_LAVAGEM',
  idTipoLavagem: t.idTipoLavagem, dsTipoLavagem: t.dsTipoLavagem,
  ...(demo ? { vlReferenciaMin: t.vlReferenciaMin, vlReferenciaMax: t.vlReferenciaMax } : {}),
});
const itemVeiculo = (v) => ({
  PK: 'CATALOGO', SK: `VEICULO#${v.idVeiculo}`, entityType: 'VEICULO',
  idVeiculo: v.idVeiculo, dsVeiculo: `${v.marca} ${v.modelo} de placa ${v.placa}`,
  placa: v.placa, marca: v.marca, modelo: v.modelo, ano: v.ano, kmAtual: v.kmAtual,
});
const itemPosto = (p, demo) => ({
  PK: 'CATALOGO', SK: `POSTO#${p.idPosto}`, entityType: 'POSTO',
  idPosto: p.idPosto, nmPosto: p.nmPosto, ...(demo ? { cnpj: p.cnpj } : {}),
});
const itemLavagem = (l) => ({
  PK: `VEICULO#${l.idVeiculo}`, SK: `LAVAGEM#${l.idLavagem}`, entityType: 'LAVAGEM',
  idLavagem: l.idLavagem, idTipoLavagem: l.idTipoLavagem, dsTipoLavagem: dsTipo(l.idTipoLavagem),
  dtLavagem: l.dtLavagem, kmLavagem: l.kmLavagem, vlLavagem: l.vlLavagem, idVeiculo: l.idVeiculo,
  dsPosto: l.dsPosto, cnpjPosto: l.cnpjPosto, idPosto: l.idPosto,
  idPessoaCadastrador: l.idPessoaCadastrador, dtCadastro: l.dtCadastro,
  propriaUnidade: l.propriaUnidade, postoConveniado: l.postoConveniado,
});
const itemContador = (ultimoId) => ({ PK: 'CONTADOR', SK: 'LAVAGEM', entityType: 'CONTADOR', ultimoId });

const ordenarItens = (itens) =>
  [...itens].sort((a, b) => (a.PK < b.PK ? -1 : a.PK > b.PK ? 1 : a.SK < b.SK ? -1 : a.SK > b.SK ? 1 : 0));

const gabarito = ordenarItens([
  ...TIPOS.map((t) => itemTipo(t, false)),
  ...VEICULOS_ORIGINAIS.map(itemVeiculo),
  ...POSTOS_ORIGINAIS.map((p) => itemPosto(p, false)),
  ...LAVAGENS_ORIGINAIS.map(itemLavagem),
  itemContador(3399),
]);

// ---------------------------------------------------------------------------
// 5. Catálogo do demo
// ---------------------------------------------------------------------------
const MODELOS_NOVOS = [
  [104, 'Fiat', 'Strada'], [105, 'Toyota', 'Corolla'], [106, 'Renault', 'Duster'],
  [107, 'Toyota', 'Hilux'], [108, 'Fiat', 'Toro'], [109, 'VW', 'Gol'],
  [110, 'Chevrolet', 'Spin'], [111, 'Renault', 'Logan'], [112, 'Nissan', 'Versa'],
  [113, 'Mitsubishi', 'L200'], [114, 'Chevrolet', 'S10'], [115, 'Fiat', 'Ducato'],
  [116, 'VW', 'Saveiro'], [117, 'Fiat', 'Cronos'], [118, 'Chevrolet', 'Onix'],
];
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const placasUsadas = new Set(VEICULOS_ORIGINAIS.map((v) => v.placa));
function gerarPlaca() {
  for (;;) {
    const L = () => LETRAS[int(0, 25)];
    const placa = `${L()}${L()}${L()}${int(0, 9)}${L()}${int(0, 9)}${int(0, 9)}`;
    if (!placasUsadas.has(placa)) {
      placasUsadas.add(placa);
      return placa;
    }
  }
}
const veiculosNovos = MODELOS_NOVOS.map(([idVeiculo, marca, modelo]) => ({
  idVeiculo, marca, modelo, placa: gerarPlaca(), ano: int(2018, 2025), kmAtual: null,
}));

const postosConveniados = [
  ...POSTOS_ORIGINAIS.map((p) => ({ ...p })),
  { idPosto: 12, nmPosto: 'Auto Posto Planalto' },
  { idPosto: 13, nmPosto: 'Lava Car Esplanada' },
  { idPosto: 14, nmPosto: 'Posto Rodovia Leste' },
  { idPosto: 15, nmPosto: 'Lava-Rapido Centro-Oeste' },
];
for (const p of postosConveniados) p.cnpj = gerarCnpj();

const postosNaoConveniados = [
  'Lava-Jato Boa Vista', 'Lava Car Express', 'Estetica Automotiva Ipe',
  'Lava-Rapido Rodoviaria', 'Auto Lavagem Cerrado',
].map((dsPosto) => ({ dsPosto, cnpjPosto: gerarCnpj() }));

// ---------------------------------------------------------------------------
// 6. Linha do tempo por veículo (antes dos IDs)
// ---------------------------------------------------------------------------
// Sorteia n dias distintos e ordenados em [inicio, fim], com no mínimo gapMin dias entre eles.
function sortearDias(inicio, fim, n, gapMin = 3) {
  const folga = (n - 1) * (gapMin - 1);
  const max = fim - inicio - folga;
  if (max < n - 1) throw new Error('Intervalo pequeno demais para sortear os dias');
  const set = new Set();
  while (set.size < n) set.add(int(0, max));
  return [...set].sort((a, b) => a - b).map((v, i) => inicio + v + i * (gapMin - 1));
}
const incrementoKm = (kmMes, gapDias) => Math.max(1, Math.round((kmMes / 30) * gapDias * float(0.85, 1.15)));
const sortearTipo = () => pickPeso([[1, 45], [2, 35], [3, 20]]);

// Veículos que recebem anomalias (7 veículos distintos entre 104–118)
const sorteioAnomalias = shuffle(veiculosNovos.map((v) => v.idVeiculo));
const veicMesmoDia = sorteioAnomalias.slice(0, 2);
const veicKmRegredido = sorteioAnomalias.slice(2, 4);
const veicValor = sorteioAnomalias.slice(4, 7); // tipos 1, 2 e 3, nessa ordem

const linhas = new Map(); // idVeiculo -> [{ idVeiculo, dia, km, idTipoLavagem, ... }]

// 101–103: histórico estritamente anterior (data e km) à lavagem original
const HISTORICO_ORIGINAIS = [
  { idVeiculo: 101, n: 10, inicio: INICIO, kmMes: 2000 },
  { idVeiculo: 102, n: 10, inicio: INICIO, kmMes: 2800 },
  { idVeiculo: 103, n: 5, inicio: parseISO('2026-03-01'), kmMes: 1600 },
];
for (const h of HISTORICO_ORIGINAIS) {
  const orig = LAVAGENS_ORIGINAIS.find((l) => l.idVeiculo === h.idVeiculo);
  const diaOrig = parseISO(orig.dtLavagem);
  const dias = sortearDias(h.inicio, diaOrig - 3, h.n);
  const incs = dias.map((d, i) => incrementoKm(h.kmMes, (dias[i + 1] ?? diaOrig) - d));
  let km = orig.kmLavagem - incs.reduce((s, x) => s + x, 0);
  if (km <= 0) throw new Error(`km inicial inválido para o veículo ${h.idVeiculo}`);
  const tl = [];
  dias.forEach((dia, i) => {
    tl.push({ idVeiculo: h.idVeiculo, dia, km, idTipoLavagem: sortearTipo() });
    km += incs[i];
  });
  linhas.set(h.idVeiculo, tl);
}

// 104–118
for (const v of veiculosNovos) {
  const n = veicMesmoDia.includes(v.idVeiculo) ? 14 : 15;
  const kmMes = int(1500, 3000);
  const dias = sortearDias(INICIO, FIM, n);
  let km = int(5000, 120000);
  const tl = dias.map((dia, i) => {
    if (i > 0) km += incrementoKm(kmMes, dia - dias[i - 1]);
    return { idVeiculo: v.idVeiculo, dia, km, idTipoLavagem: sortearTipo() };
  });
  linhas.set(v.idVeiculo, tl);
}

// ---------------------------------------------------------------------------
// 7. Anomalias de estrutura (MESMO_DIA e KM_REGREDIDO)
// ---------------------------------------------------------------------------
for (const idVeiculo of veicMesmoDia) {
  const tl = linhas.get(idVeiculo);
  const idx = int(1, tl.length - 2);
  const base = tl[idx];
  const dup = {
    idVeiculo, dia: base.dia, km: base.km + int(8, 60), idTipoLavagem: sortearTipo(),
    anomalia: 'MESMO_DIA', cadastroMesmoDia: true,
  };
  if (dup.km >= tl[idx + 1].km) throw new Error('Duplicata de mesmo dia ultrapassou o km seguinte');
  base.cadastroMesmoDia = true;
  tl.splice(idx + 1, 0, dup);
}
for (const idVeiculo of veicKmRegredido) {
  const tl = linhas.get(idVeiculo);
  const idx = int(1, tl.length - 2);
  tl[idx].km = tl[idx - 1].km - int(200, 900);
  tl[idx].anomalia = 'KM_REGREDIDO';
}
veicValor.forEach((idVeiculo, i) => {
  const tl = linhas.get(idVeiculo);
  const l = tl[int(0, tl.length - 1)];
  l.idTipoLavagem = i + 1;
  l.anomalia = 'VALOR_ACIMA_MEDIA';
});

// ---------------------------------------------------------------------------
// 8. Modalidade (interna / conveniado / não conveniado) e valores normais
// ---------------------------------------------------------------------------
const QTD_INTERNAS = 100;
const QTD_CONVENIADO = 112;
const novas = [...linhas.keys()].sort((a, b) => a - b).flatMap((id) => linhas.get(id));
if (novas.length !== 250) throw new Error(`Esperadas 250 lavagens novas, geradas ${novas.length}`);

const reservadasValor = novas.filter((l) => l.anomalia === 'VALOR_ACIMA_MEDIA');
const resto = shuffle(novas.filter((l) => l.anomalia !== 'VALOR_ACIMA_MEDIA'));
const internas = resto.slice(0, QTD_INTERNAS);
const externas = shuffle([...resto.slice(QTD_INTERNAS), ...reservadasValor]);

for (const l of internas) {
  Object.assign(l, { propriaUnidade: true, postoConveniado: null, vlLavagem: null, idPosto: null, dsPosto: null, cnpjPosto: null });
}
externas.forEach((l, i) => {
  const tipo = TIPOS.find((t) => t.idTipoLavagem === l.idTipoLavagem);
  l.propriaUnidade = false;
  l.vlLavagem = round2(float(tipo.vlReferenciaMin, tipo.vlReferenciaMax));
  if (i < QTD_CONVENIADO) {
    const posto = i < postosConveniados.length ? postosConveniados[i] : pick(postosConveniados);
    Object.assign(l, { postoConveniado: true, idPosto: posto.idPosto, dsPosto: null, cnpjPosto: null });
  } else {
    const j = i - QTD_CONVENIADO;
    const posto = j < postosNaoConveniados.length ? postosNaoConveniados[j] : pick(postosNaoConveniados);
    Object.assign(l, { postoConveniado: false, idPosto: null, dsPosto: posto.dsPosto, cnpjPosto: posto.cnpjPosto });
  }
});

// ---------------------------------------------------------------------------
// 9. Valores anômalos: 3,5x a média das lavagens normais do tipo (inclui 3397/3398)
// ---------------------------------------------------------------------------
for (const tipo of TIPOS) {
  const normais = [...LAVAGENS_ORIGINAIS, ...novas.map((l) => ({ ...l }))]
    .filter((l) => l.idTipoLavagem === tipo.idTipoLavagem && l.vlLavagem != null && l.anomalia !== 'VALOR_ACIMA_MEDIA');
  const media = normais.reduce((s, l) => s + l.vlLavagem, 0) / normais.length;
  const alvo = reservadasValor.find((l) => l.idTipoLavagem === tipo.idTipoLavagem);
  alvo.vlLavagem = round2(3.5 * media);
}

// ---------------------------------------------------------------------------
// 10. Cadastro, IDs (ordem cronológica de dtCadastro) e kmAtual
// ---------------------------------------------------------------------------
for (const l of novas) {
  const atraso = l.cadastroMesmoDia ? 0 : int(0, 3);
  l.diaCadastro = Math.min(l.dia + atraso, LIMITE);
  l.idPessoaCadastrador = pick(CADASTRADORES);
}
novas.sort((a, b) => a.diaCadastro - b.diaCadastro || a.dia - b.dia || a.idVeiculo - b.idVeiculo || a.km - b.km);
novas.forEach((l, i) => {
  l.idLavagem = PRIMEIRO_ID_NOVO + i;
  l.dtLavagem = toISO(l.dia);
  l.dtCadastro = toISO(l.diaCadastro);
  l.kmLavagem = l.km;
});
const ultimoIdDemo = PRIMEIRO_ID_NOVO + novas.length - 1;

for (const v of veiculosNovos) {
  const maxKm = Math.max(...novas.filter((l) => l.idVeiculo === v.idVeiculo).map((l) => l.kmLavagem));
  v.kmAtual = maxKm + int(0, 800);
}

const lavagensDemo = [...LAVAGENS_ORIGINAIS, ...novas].map(itemLavagem);
const demo = ordenarItens([
  ...TIPOS.map((t) => itemTipo(t, true)),
  ...[...VEICULOS_ORIGINAIS, ...veiculosNovos].map(itemVeiculo),
  ...postosConveniados.map((p) => itemPosto(p, true)),
  ...lavagensDemo,
  itemContador(ultimoIdDemo),
]);

// ---------------------------------------------------------------------------
// 11. Critérios de anomalia (mesma definição do README e do seed.test.mjs)
// ---------------------------------------------------------------------------
function mediasPorTipo(lavagens) {
  const acc = new Map();
  for (const l of lavagens) {
    if (l.vlLavagem == null) continue;
    const a = acc.get(l.idTipoLavagem) ?? { soma: 0, n: 0 };
    a.soma += l.vlLavagem;
    a.n += 1;
    acc.set(l.idTipoLavagem, a);
  }
  return new Map([...acc].map(([k, a]) => [k, a.soma / a.n]));
}
function aplicarCriterios(lavagens) {
  const res = { VALOR_ACIMA_MEDIA: new Set(), MESMO_DIA: new Set(), KM_REGREDIDO: new Set() };
  const medias = mediasPorTipo(lavagens);
  for (const l of lavagens) {
    if (l.vlLavagem != null && l.vlLavagem >= 3 * medias.get(l.idTipoLavagem)) res.VALOR_ACIMA_MEDIA.add(l.idLavagem);
  }
  const porVeiculo = new Map();
  for (const l of lavagens) porVeiculo.set(l.idVeiculo, [...(porVeiculo.get(l.idVeiculo) ?? []), l]);
  for (const tl of porVeiculo.values()) {
    tl.sort((a, b) => (a.dtLavagem < b.dtLavagem ? -1 : a.dtLavagem > b.dtLavagem ? 1 : a.idLavagem - b.idLavagem));
    for (let i = 1; i < tl.length; i++) {
      if (tl[i].dtLavagem === tl[i - 1].dtLavagem) res.MESMO_DIA.add(tl[i].idLavagem);
      if (tl[i].kmLavagem < tl[i - 1].kmLavagem) res.KM_REGREDIDO.add(tl[i].idLavagem);
    }
  }
  return res;
}

// Manifesto
const medias = mediasPorTipo(lavagensDemo);
const anomalias = novas
  .filter((l) => l.anomalia)
  .sort((a, b) => a.idLavagem - b.idLavagem)
  .map((l) => {
    let descricao;
    if (l.anomalia === 'VALOR_ACIMA_MEDIA') {
      const m = medias.get(l.idTipoLavagem);
      descricao = `Valor ${fmtMoeda(l.vlLavagem)} é ${fmtNum1(l.vlLavagem / m)}x a média das lavagens ${dsTipo(l.idTipoLavagem)} (${fmtMoeda(round2(m))})`;
    } else if (l.anomalia === 'MESMO_DIA') {
      const outra = novas.find((o) => o.idVeiculo === l.idVeiculo && o.dtLavagem === l.dtLavagem && o !== l);
      descricao = `Segunda lavagem do veículo ${l.idVeiculo} em ${l.dtLavagem} (a primeira é a ${outra.idLavagem})`;
    } else {
      const tl = linhas.get(l.idVeiculo);
      const ant = tl[tl.indexOf(l) - 1];
      descricao = `Km ${fmtKm(l.kmLavagem)} menor que os ${fmtKm(ant.kmLavagem)} da lavagem anterior (${ant.idLavagem})`;
    }
    return { idLavagem: l.idLavagem, idVeiculo: l.idVeiculo, tipo: l.anomalia, descricao };
  });

// ---------------------------------------------------------------------------
// 12. Autochecagem (falha antes de gravar qualquer arquivo)
// ---------------------------------------------------------------------------
function verificar(cond, msg) {
  if (!cond) throw new Error(`Autochecagem falhou: ${msg}`);
}
{
  const crit = aplicarCriterios(lavagensDemo);
  for (const tipo of Object.keys(crit)) {
    const esperado = anomalias.filter((a) => a.tipo === tipo).map((a) => a.idLavagem).sort();
    verificar(JSON.stringify([...crit[tipo]].sort()) === JSON.stringify(esperado), `critério ${tipo} difere do manifesto`);
  }
  const nInternas = lavagensDemo.filter((l) => l.propriaUnidade).length;
  const ext = lavagensDemo.filter((l) => !l.propriaUnidade);
  const nConv = ext.filter((l) => l.postoConveniado).length;
  verificar(Math.abs(nInternas / lavagensDemo.length - 0.4) <= 0.1, 'proporção de internas');
  verificar(Math.abs(nConv / ext.length - 0.75) <= 0.1, 'proporção de conveniado');
  for (const l of lavagensDemo) {
    verificar(l.kmLavagem > 0 && l.kmLavagem <= 999999 && Number.isInteger(l.kmLavagem), `km ${l.idLavagem}`);
    verificar(l.vlLavagem == null || (l.vlLavagem > 0 && l.vlLavagem <= 999.99), `valor ${l.idLavagem}`);
    verificar(parseISO(l.dtCadastro) <= LIMITE && parseISO(l.dtLavagem) <= LIMITE, `data ${l.idLavagem}`);
  }
  const ncPares = new Set(novas.filter((l) => l.postoConveniado === false).map((l) => l.dsPosto + '|' + l.cnpjPosto));
  verificar(ncPares.size === 5, 'cinco postos não conveniados usados');
  for (const id of new Set(novas.map((l) => l.idVeiculo))) {
    if (id < 104) continue;
    const tl = novas.filter((l) => l.idVeiculo === id && !l.anomalia).sort((a, b) => a.dia - b.dia);
    const meses = (tl[tl.length - 1].dia - tl[0].dia) / 30.44;
    const kmMes = (tl[tl.length - 1].kmLavagem - tl[0].kmLavagem) / meses;
    verificar(kmMes >= 1200 && kmMes <= 3300, `km/mês do veículo ${id} = ${kmMes.toFixed(0)}`);
  }
}

// ---------------------------------------------------------------------------
// 13. Recibos (8 lavagens externas novas, sem anomalias nem pares de mesmo dia)
// ---------------------------------------------------------------------------
const candidatas = shuffle(
  novas.filter((l) => !l.propriaUnidade && !l.anomalia && !l.cadastroMesmoDia).sort((a, b) => a.idLavagem - b.idLavagem),
);
const recibosSel = [];
for (const idPosto of [12, 13, 14, 15]) {
  recibosSel.push(candidatas.find((l) => l.postoConveniado && l.idPosto === idPosto));
}
const ncUsados = new Set();
for (const l of candidatas) {
  if (ncUsados.size === 4) break;
  if (l.postoConveniado === false && !ncUsados.has(l.dsPosto)) {
    ncUsados.add(l.dsPosto);
    recibosSel.push(l);
  }
}
verificar(recibosSel.length === 8 && recibosSel.every(Boolean), 'oito recibos selecionados');
const recibos = recibosSel
  .sort((a, b) => a.idLavagem - b.idLavagem)
  .map((l) => {
    const posto = l.postoConveniado ? postosConveniados.find((p) => p.idPosto === l.idPosto) : null;
    return {
      arquivo: `recibo-${l.idLavagem}.png`,
      idLavagem: l.idLavagem,
      vlLavagem: l.vlLavagem,
      dtLavagem: l.dtLavagem,
      nomePosto: posto ? posto.nmPosto : l.dsPosto,
      cnpj: posto ? posto.cnpj : l.cnpjPosto,
      dsTipoLavagem: dsTipo(l.idTipoLavagem), // usado só no SVG; removido do esperado.json
    };
  });

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function svgRecibo(r) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
  <g font-family="Arial, DejaVu Sans, sans-serif" fill="#111111">
    <rect width="600" height="800" fill="#ffffff"/>
    <rect x="0" y="0" width="600" height="72" fill="#c62828"/>
    <text x="300" y="47" font-size="32" font-weight="bold" fill="#ffffff" text-anchor="middle">DOCUMENTO FICTÍCIO</text>
    <text x="300" y="135" font-size="28" font-weight="bold" text-anchor="middle">${esc(r.nomePosto)}</text>
    <text x="300" y="172" font-size="20" text-anchor="middle">CNPJ: ${esc(r.cnpj)}</text>
    <line x1="40" y1="200" x2="560" y2="200" stroke="#444444" stroke-width="2" stroke-dasharray="8 6"/>
    <text x="300" y="245" font-size="24" font-weight="bold" text-anchor="middle">RECIBO DE LAVAGEM</text>
    <text x="60" y="310" font-size="22">Data: ${fmtBR(r.dtLavagem)}</text>
    <text x="60" y="355" font-size="22">Serviço: Lavagem ${esc(r.dsTipoLavagem)}</text>
    <line x1="40" y1="395" x2="560" y2="395" stroke="#444444" stroke-width="2" stroke-dasharray="8 6"/>
    <text x="60" y="450" font-size="30" font-weight="bold">TOTAL</text>
    <text x="540" y="450" font-size="30" font-weight="bold" text-anchor="end">${fmtMoeda(r.vlLavagem)}</text>
    <text x="300" y="610" font-size="52" font-weight="bold" fill="#c62828" fill-opacity="0.18" text-anchor="middle" transform="rotate(-20 300 610)">DOCUMENTO FICTÍCIO</text>
    <text x="300" y="740" font-size="16" text-anchor="middle" fill="#555555">Dados fictícios gerados para o hackathon SIG Frota</text>
    <text x="300" y="765" font-size="16" text-anchor="middle" fill="#555555">Sem validade fiscal</text>
  </g>
</svg>
`;
}

// ---------------------------------------------------------------------------
// 14. Escrita
// ---------------------------------------------------------------------------
const gravarJson = (rel, dados) => writeFileSync(join(outDir, rel), JSON.stringify(dados, null, 2) + '\n', 'utf8');
for (const d of ['gabarito', 'demo', 'recibos']) mkdirSync(join(outDir, d), { recursive: true });

gravarJson('gabarito/itens.json', gabarito);
gravarJson('demo/itens.json', demo);
gravarJson('demo/anomalias.json', anomalias);
gravarJson('recibos/esperado.json', recibos.map(({ dsTipoLavagem, ...r }) => r));

if (!semPng) {
  const { default: sharp } = await import('sharp');
  const dirRecibos = join(outDir, 'recibos');
  for (const f of readdirSync(dirRecibos)) if (/^recibo-\d+\.png$/.test(f)) rmSync(join(dirRecibos, f));
  for (const r of recibos) {
    await sharp(Buffer.from(svgRecibo(r)), { density: 144 }).png({ compressionLevel: 9 }).toFile(join(dirRecibos, r.arquivo));
  }
}

// Resumo
const contar = (tipo) => demo.filter((i) => i.entityType === tipo).length;
const ext = lavagensDemo.filter((l) => !l.propriaUnidade);
const porTipoAnom = anomalias.reduce((acc, a) => ({ ...acc, [a.tipo]: (acc[a.tipo] ?? 0) + 1 }), {});
console.log(`Saída: ${outDir}`);
console.log(`gabarito: ${gabarito.length} itens (ultimoId 3399)`);
console.log(
  `demo: ${demo.length} itens; ${contar('VEICULO')} veículos, ${contar('TIPO_LAVAGEM')} tipos, ${contar('POSTO')} postos conveniados, ` +
    `${lavagensDemo.length} lavagens (${novas.length} novas, ${PRIMEIRO_ID_NOVO}–${ultimoIdDemo}), ultimoId ${ultimoIdDemo}`,
);
console.log(
  `  internas ${lavagensDemo.length - ext.length}, conveniado ${ext.filter((l) => l.postoConveniado).length}, ` +
    `não conveniado ${ext.filter((l) => !l.postoConveniado).length}`,
);
console.log(`anomalias: ${anomalias.length} ${JSON.stringify(porTipoAnom)}`);
console.log(`recibos: ${recibos.length} ${semPng ? '(só esperado.json, --sem-png)' : 'PNG + esperado.json'}`);
