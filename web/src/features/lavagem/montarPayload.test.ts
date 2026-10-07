// features/lavagem/montarPayload.test.ts
//
// Testes da função PURA `montarPayloadLavagem` (tarefa 7.5 / Req. 8.3).
//
// Garantem EXPLICITAMENTE que o payload enviado à API só contém os campos
// pertinentes ao ramo (unidade × conveniado), omitindo os ocultos mesmo quando
// há valores residuais vindos de um ramo que ficou escondido:
//   R10 — interna: sem vlLavagem/postoConveniado/idPosto/dsPosto/cnpjPosto.
//   R13 — externa + conveniado: sem dsPosto/cnpjPosto.
//   R14 — externa + não conveniado: sem idPosto.
//   R02 — idVeiculo (contexto) sempre presente.
// Também valida a preservação de idLavagem na edição.

import { describe, it, expect } from 'vitest';
import type { ValoresFormularioLavagem } from '../../lib/validationResolver';
import { montarPayloadLavagem } from './montarPayload';

const BASE: ValoresFormularioLavagem = {
  idTipoLavagem: 2,
  dtLavagem: '2026-01-15',
  kmLavagem: 45000,
  propriaUnidade: 'S',
};

describe('montarPayloadLavagem — interna (R10)', () => {
  it('payload só com contexto + obrigatórios base + propriaUnidade=S', () => {
    const payload = montarPayloadLavagem(
      { ...BASE, propriaUnidade: 'S' },
      { idVeiculo: 101 },
    );

    expect(payload).toEqual({
      idVeiculo: 101,
      idTipoLavagem: 2,
      dtLavagem: '2026-01-15',
      kmLavagem: 45000,
      propriaUnidade: 'S',
    });

    // Nenhum campo do ramo externo/posto deve estar presente (nem undefined).
    expect('vlLavagem' in payload).toBe(false);
    expect('postoConveniado' in payload).toBe(false);
    expect('idPosto' in payload).toBe(false);
    expect('dsPosto' in payload).toBe(false);
    expect('cnpjPosto' in payload).toBe(false);
  });

  it('borda: resíduos de valor/posto numa interna são REMOVIDOS do payload (R10)', () => {
    const payload = montarPayloadLavagem(
      {
        ...BASE,
        propriaUnidade: 'S',
        // Resíduos de uma lavagem externa que ficou oculta sem limpeza:
        vlLavagem: 150,
        postoConveniado: 'N',
        idPosto: 10,
        dsPosto: 'Lava-Jato do Zé',
        cnpjPosto: '12.345.678/0001-90',
      },
      { idVeiculo: 101 },
    );

    expect(payload).toEqual({
      idVeiculo: 101,
      idTipoLavagem: 2,
      dtLavagem: '2026-01-15',
      kmLavagem: 45000,
      propriaUnidade: 'S',
    });
  });
});

describe('montarPayloadLavagem — externa conveniado (R13)', () => {
  it('inclui vlLavagem, postoConveniado=S e idPosto; omite dsPosto/cnpjPosto', () => {
    const payload = montarPayloadLavagem(
      {
        ...BASE,
        propriaUnidade: 'N',
        postoConveniado: 'S',
        vlLavagem: 150,
        idPosto: 10,
      },
      { idVeiculo: 101 },
    );

    expect(payload).toMatchObject({
      idVeiculo: 101,
      propriaUnidade: 'N',
      postoConveniado: 'S',
      vlLavagem: 150,
      idPosto: 10,
    });
    expect('dsPosto' in payload).toBe(false);
    expect('cnpjPosto' in payload).toBe(false);
  });

  it('borda: resíduos de dsPosto/cnpjPosto no conveniado são REMOVIDOS (R13)', () => {
    const payload = montarPayloadLavagem(
      {
        ...BASE,
        propriaUnidade: 'N',
        postoConveniado: 'S',
        vlLavagem: 150,
        idPosto: 10,
        // Resíduos do ramo não conveniado:
        dsPosto: 'Lava-Jato do Zé',
        cnpjPosto: '12.345.678/0001-90',
      },
      { idVeiculo: 101 },
    );

    expect('dsPosto' in payload).toBe(false);
    expect('cnpjPosto' in payload).toBe(false);
    expect(payload.idPosto).toBe(10);
  });
});

describe('montarPayloadLavagem — externa não conveniado (R14)', () => {
  it('inclui vlLavagem, postoConveniado=N, dsPosto e cnpjPosto; omite idPosto', () => {
    const payload = montarPayloadLavagem(
      {
        ...BASE,
        propriaUnidade: 'N',
        postoConveniado: 'N',
        vlLavagem: 75,
        dsPosto: 'Lava-Jato do Zé',
        cnpjPosto: '12.345.678/0001-90',
      },
      { idVeiculo: 101 },
    );

    expect(payload).toMatchObject({
      idVeiculo: 101,
      propriaUnidade: 'N',
      postoConveniado: 'N',
      vlLavagem: 75,
      dsPosto: 'Lava-Jato do Zé',
      cnpjPosto: '12.345.678/0001-90',
    });
    expect('idPosto' in payload).toBe(false);
  });

  it('borda: resíduo de idPosto no não conveniado é REMOVIDO (R14)', () => {
    const payload = montarPayloadLavagem(
      {
        ...BASE,
        propriaUnidade: 'N',
        postoConveniado: 'N',
        vlLavagem: 75,
        dsPosto: 'Lava-Jato do Zé',
        cnpjPosto: '12.345.678/0001-90',
        // Resíduo do ramo conveniado:
        idPosto: 10,
      },
      { idVeiculo: 101 },
    );

    expect('idPosto' in payload).toBe(false);
    expect(payload.dsPosto).toBe('Lava-Jato do Zé');
  });
});

describe('montarPayloadLavagem — contexto e edição (R02)', () => {
  it('inclui sempre o idVeiculo do contexto', () => {
    const payload = montarPayloadLavagem(BASE, { idVeiculo: 999 });
    expect(payload.idVeiculo).toBe(999);
  });

  it('preserva idLavagem quando presente (edição/PUT)', () => {
    const payload = montarPayloadLavagem(
      { ...BASE, idLavagem: 42 } as ValoresFormularioLavagem,
      { idVeiculo: 101 },
    );
    expect(payload.idLavagem).toBe(42);
  });

  it('omite idLavagem em inclusão (ausente nos valores)', () => {
    const payload = montarPayloadLavagem(BASE, { idVeiculo: 101 });
    expect('idLavagem' in payload).toBe(false);
  });
});
