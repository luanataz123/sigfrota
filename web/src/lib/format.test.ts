// lib/format.test.ts
//
// Testes dos utilitários de EXIBIÇÃO (Req. 2.3, 2.4, 7.2).
// Rastreabilidade: R15 (data válida), R20 (colunas data/valor/km), R10 (interna
// sem valor exibe "—").

import { describe, it, expect } from 'vitest';
import {
  isoParaBr,
  brParaIso,
  formatarMoeda,
  formatarValorLavagem,
  formatarKm,
  SEM_VALOR,
} from './format';

// Intl pode usar espaço não-separável (U+00A0) entre "R$" e o número; para
// comparar de forma estável, normalizamos qualquer espaço para o ASCII " ".
const normalizarEspacos = (s: string): string => s.replace(/\u00a0/g, ' ');

describe('isoParaBr (Req. 2.3) — ISO YYYY-MM-DD → DD/MM/AAAA', () => {
  it('converte uma data ISO válida', () => {
    expect(isoParaBr('2024-03-07')).toBe('07/03/2024');
  });

  it('converte limites de dia/mês', () => {
    expect(isoParaBr('2024-12-31')).toBe('31/12/2024');
    expect(isoParaBr('2024-01-01')).toBe('01/01/2024');
  });

  it('retorna string vazia para entrada vazia/null/undefined', () => {
    expect(isoParaBr('')).toBe('');
    expect(isoParaBr(null)).toBe('');
    expect(isoParaBr(undefined)).toBe('');
  });

  it('retorna string vazia para formato inválido', () => {
    expect(isoParaBr('07/03/2024')).toBe('');
    expect(isoParaBr('2024-3-7')).toBe('');
    expect(isoParaBr('lixo')).toBe('');
  });

  it('retorna string vazia para data inexistente (ex.: 31/02) — R15', () => {
    expect(isoParaBr('2024-02-31')).toBe('');
    expect(isoParaBr('2024-13-01')).toBe('');
    expect(isoParaBr('2023-02-29')).toBe(''); // 2023 não é bissexto
  });
});

describe('brParaIso (Req. 7.2) — DD/MM/AAAA → ISO YYYY-MM-DD', () => {
  it('converte uma data BR válida', () => {
    expect(brParaIso('07/03/2024')).toBe('2024-03-07');
  });

  it('retorna string vazia para entrada vazia/null/undefined', () => {
    expect(brParaIso('')).toBe('');
    expect(brParaIso(null)).toBe('');
    expect(brParaIso(undefined)).toBe('');
  });

  it('retorna string vazia para formato inválido', () => {
    expect(brParaIso('2024-03-07')).toBe('');
    expect(brParaIso('7/3/2024')).toBe('');
    expect(brParaIso('lixo')).toBe('');
  });

  it('retorna string vazia para data inexistente (ex.: 31/02) — R15', () => {
    expect(brParaIso('31/02/2024')).toBe('');
    expect(brParaIso('01/13/2024')).toBe('');
    expect(brParaIso('29/02/2023')).toBe('');
  });
});

describe('ida e volta iso ↔ br (round-trip)', () => {
  it('isoParaBr(brParaIso(x)) preserva uma data válida', () => {
    const br = '07/03/2024';
    expect(isoParaBr(brParaIso(br))).toBe(br);
  });

  it('brParaIso(isoParaBr(x)) preserva uma data válida', () => {
    const iso = '2024-03-07';
    expect(brParaIso(isoParaBr(iso))).toBe(iso);
  });

  it('round-trip em datas bissextas válidas', () => {
    expect(isoParaBr(brParaIso('29/02/2024'))).toBe('29/02/2024');
  });
});

describe('formatarMoeda — BRL com símbolo (Req. 2.3/R20)', () => {
  it('formata um valor com centavos', () => {
    expect(normalizarEspacos(formatarMoeda(1234.5))).toBe('R$ 1.234,50');
  });

  it('formata um valor inteiro com duas casas', () => {
    expect(normalizarEspacos(formatarMoeda(10))).toBe('R$ 10,00');
  });

  it('formata zero (não é a mesma coisa que lavagem interna)', () => {
    expect(normalizarEspacos(formatarMoeda(0))).toBe('R$ 0,00');
  });

  it('trata NaN caindo para zero', () => {
    expect(normalizarEspacos(formatarMoeda(Number.NaN))).toBe('R$ 0,00');
  });
});

describe('formatarValorLavagem — "—" para interna (Req. 2.4/R10)', () => {
  it('retorna "—" para undefined (lavagem interna)', () => {
    expect(formatarValorLavagem(undefined)).toBe(SEM_VALOR);
  });

  it('retorna "—" para null', () => {
    expect(formatarValorLavagem(null)).toBe(SEM_VALOR);
  });

  it('retorna "—" para NaN', () => {
    expect(formatarValorLavagem(Number.NaN)).toBe(SEM_VALOR);
  });

  it('formata em BRL quando há valor', () => {
    expect(normalizarEspacos(formatarValorLavagem(89.9))).toBe('R$ 89,90');
  });

  it('formata R$ 0,00 explícito quando o valor é zero (não é interna)', () => {
    expect(normalizarEspacos(formatarValorLavagem(0))).toBe('R$ 0,00');
  });
});

describe('formatarKm — inteiro com separador de milhar pt-BR (R20)', () => {
  it('formata milhares com ponto', () => {
    expect(formatarKm(45210)).toBe('45.210');
  });

  it('formata milhões', () => {
    expect(formatarKm(1234567)).toBe('1.234.567');
  });

  it('não usa separador abaixo de mil', () => {
    expect(formatarKm(999)).toBe('999');
  });

  it('arredonda frações para inteiro', () => {
    expect(formatarKm(45210.7)).toBe('45.211');
  });

  it('retorna string vazia para NaN', () => {
    expect(formatarKm(Number.NaN)).toBe('');
  });
});
