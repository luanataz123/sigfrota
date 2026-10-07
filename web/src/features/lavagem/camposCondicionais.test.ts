// features/lavagem/camposCondicionais.test.ts
//
// Testes da lógica PURA de visibilidade dos campos do formulário de lavagem.
// Cada teste cita a(s) Rxx de origem (rastreabilidade — gabarito R09–R14).
// A cobertura completa das alternâncias fica na tarefa 6.3; aqui garantimos os
// quatro estados fundamentais.

import { describe, it, expect } from 'vitest';
import { visibilidade, camposOcultos } from './camposCondicionais';

describe('visibilidade (R09–R14)', () => {
  it('R09/R10 — interna (propriaUnidade="S") oculta valor e todos os campos de posto', () => {
    expect(visibilidade({ propriaUnidade: 'S' })).toEqual({
      valor: false,
      escolhaPostoConveniado: false,
      selecaoPosto: false,
      dsPosto: false,
      cnpjPosto: false,
    });
  });

  it('R11/R12/R13 — externa conveniada (postoConveniado="S") mostra valor, escolha e seleção de posto', () => {
    expect(visibilidade({ propriaUnidade: 'N', postoConveniado: 'S' })).toEqual({
      valor: true,
      escolhaPostoConveniado: true,
      selecaoPosto: true,
      dsPosto: false,
      cnpjPosto: false,
    });
  });

  it('R11/R12/R14 — externa não conveniada (postoConveniado="N") mostra valor, escolha, descrição e CNPJ', () => {
    expect(visibilidade({ propriaUnidade: 'N', postoConveniado: 'N' })).toEqual({
      valor: true,
      escolhaPostoConveniado: true,
      selecaoPosto: false,
      dsPosto: true,
      cnpjPosto: true,
    });
  });

  it('R12/R13 — externa com postoConveniado indefinido assume o default "Sim" (conveniado)', () => {
    expect(visibilidade({ propriaUnidade: 'N' })).toEqual({
      valor: true,
      escolhaPostoConveniado: true,
      selecaoPosto: true,
      dsPosto: false,
      cnpjPosto: false,
    });
  });
});

describe('camposOcultos (Req. 5.5 / 6.7 / 8.3)', () => {
  it('R10 — interna oculta valor e todos os campos de posto (limpar/omitir do payload)', () => {
    expect(camposOcultos({ propriaUnidade: 'S' })).toEqual([
      'vlLavagem',
      'postoConveniado',
      'idPosto',
      'dsPosto',
      'cnpjPosto',
    ]);
  });

  it('R13 — externa conveniada oculta somente o ramo não conveniado (dsPosto, cnpjPosto)', () => {
    expect(camposOcultos({ propriaUnidade: 'N', postoConveniado: 'S' })).toEqual([
      'dsPosto',
      'cnpjPosto',
    ]);
  });

  it('R14 — externa não conveniada oculta somente a seleção de posto (idPosto)', () => {
    expect(camposOcultos({ propriaUnidade: 'N', postoConveniado: 'N' })).toEqual([
      'idPosto',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Tarefa 6.3 — cobertura COMPLETA das alternâncias/transições de visibilidade.
// Cada teste cita a(s) Rxx de origem (rastreabilidade — gabarito R09–R14) e os
// requisitos 5.2–5.5 / 6.2–6.7. Simulamos a troca de estado chamando
// `visibilidade`/`camposOcultos` com o estado ANTES e DEPOIS da alternância.

describe('visibilidade — transições unidade × externa (Req. 5.2–5.4 / R09–R11)', () => {
  it('R09/R11 — interna → externa: passa a mostrar valor e a escolha de posto', () => {
    const antes = visibilidade({ propriaUnidade: 'S' });
    const depois = visibilidade({ propriaUnidade: 'N' });
    // Antes (interna) tudo oculto; depois (externa) valor e escolha ficam visíveis.
    expect(antes.valor).toBe(false);
    expect(antes.escolhaPostoConveniado).toBe(false);
    expect(depois.valor).toBe(true);
    expect(depois.escolhaPostoConveniado).toBe(true);
  });

  it('R10 — externa → interna: oculta valor e TODOS os campos de posto', () => {
    const antes = visibilidade({ propriaUnidade: 'N', postoConveniado: 'N' });
    const depois = visibilidade({ propriaUnidade: 'S', postoConveniado: 'N' });
    // Mesmo com postoConveniado='N' no estado, voltar para interna oculta tudo.
    expect(depois).toEqual({
      valor: false,
      escolhaPostoConveniado: false,
      selecaoPosto: false,
      dsPosto: false,
      cnpjPosto: false,
    });
    // Confirma que algo estava visível antes (externa não conveniada).
    expect(antes.valor).toBe(true);
    expect(antes.dsPosto).toBe(true);
    expect(antes.cnpjPosto).toBe(true);
  });
});

describe('visibilidade — transições conveniado × não conveniado (Req. 6.2/6.4 / R12–R14)', () => {
  it('R13→R14 — externa conveniado → não conveniado: troca seleção de posto por descrição+CNPJ', () => {
    const antes = visibilidade({ propriaUnidade: 'N', postoConveniado: 'S' });
    const depois = visibilidade({ propriaUnidade: 'N', postoConveniado: 'N' });
    expect(antes.selecaoPosto).toBe(true);
    expect(antes.dsPosto).toBe(false);
    expect(antes.cnpjPosto).toBe(false);
    expect(depois.selecaoPosto).toBe(false);
    expect(depois.dsPosto).toBe(true);
    expect(depois.cnpjPosto).toBe(true);
    // Valor e escolha permanecem visíveis em ambos (continua externa — R11/R12).
    expect(depois.valor).toBe(true);
    expect(depois.escolhaPostoConveniado).toBe(true);
  });

  it('R14→R13 — externa não conveniado → conveniado: troca descrição+CNPJ por seleção de posto', () => {
    const antes = visibilidade({ propriaUnidade: 'N', postoConveniado: 'N' });
    const depois = visibilidade({ propriaUnidade: 'N', postoConveniado: 'S' });
    expect(antes.dsPosto).toBe(true);
    expect(antes.cnpjPosto).toBe(true);
    expect(antes.selecaoPosto).toBe(false);
    expect(depois.selecaoPosto).toBe(true);
    expect(depois.dsPosto).toBe(false);
    expect(depois.cnpjPosto).toBe(false);
  });
});

describe('camposOcultos — alternâncias que exigem limpeza de ramo (Req. 5.5 / 6.7)', () => {
  it('R10 — ao voltar para interna, TODOS os campos de valor/posto entram em camposOcultos', () => {
    // Independentemente do ramo de posto anterior, interna oculta tudo.
    const ocultosDesdeConveniado = camposOcultos({
      propriaUnidade: 'S',
      postoConveniado: 'S',
    });
    const ocultosDesdeNaoConveniado = camposOcultos({
      propriaUnidade: 'S',
      postoConveniado: 'N',
    });
    const esperadoInterna = [
      'vlLavagem',
      'postoConveniado',
      'idPosto',
      'dsPosto',
      'cnpjPosto',
    ];
    expect(ocultosDesdeConveniado).toEqual(esperadoInterna);
    expect(ocultosDesdeNaoConveniado).toEqual(esperadoInterna);
  });

  it('R13 — alternar para conveniado limpa o ramo não conveniado (dsPosto, cnpjPosto)', () => {
    expect(camposOcultos({ propriaUnidade: 'N', postoConveniado: 'S' })).toEqual([
      'dsPosto',
      'cnpjPosto',
    ]);
  });

  it('R14 — alternar para não conveniado limpa a seleção de posto (idPosto)', () => {
    expect(camposOcultos({ propriaUnidade: 'N', postoConveniado: 'N' })).toEqual([
      'idPosto',
    ]);
  });

  it('R12 — externa com default (postoConveniado indefinido) limpa o ramo não conveniado', () => {
    // Default "Sim" ⇒ comporta-se como conveniado: oculta descrição e CNPJ.
    expect(camposOcultos({ propriaUnidade: 'N' })).toEqual(['dsPosto', 'cnpjPosto']);
  });

  it('R10 — interna NÃO deixa nenhum campo condicional visível (todos ocultos)', () => {
    const vis = visibilidade({ propriaUnidade: 'S' });
    const algumVisivel = Object.values(vis).some(Boolean);
    expect(algumVisivel).toBe(false);
  });
});
