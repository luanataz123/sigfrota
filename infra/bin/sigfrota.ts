#!/usr/bin/env node
/**
 * Ponto de entrada do app CDK do SIG Frota (módulo de Lavagem).
 * A conta vem das credenciais ativas (profile `hackaton`); nenhum ID de conta
 * fica no código (Requisito 2.1).
 */
import { criarApp } from '../lib/config';

const conta = process.env.CDK_DEFAULT_ACCOUNT;
if (!conta) {
  // O sufixo de unicidade exige a conta concreta em tempo de synth.
  console.error('Credenciais AWS não encontradas. Use --profile hackaton.');
  process.exit(1);
}

const { app } = criarApp({ conta });

// Stacks dos demais specs: cada integrante descomenta apenas a sua linha
// (e o import correspondente), recebendo o contrato de infra por props.
// Para isso, troque a linha acima por `const { app, base } = criarApp({ conta });`
// e importe REGIAO de '../lib/config'.
// const env = { account: conta, region: REGIAO };
// new SigfrotaApiStack(app, 'SigfrotaApi', { env, contrato: base.contrato });           // spec 3
// new SigfrotaIaRegrasStack(app, 'SigfrotaIaRegras', { env, contrato: base.contrato }); // spec 5
// new SigfrotaIaReciboStack(app, 'SigfrotaIaRecibo', { env, contrato: base.contrato }); // spec 6

app.synth();
