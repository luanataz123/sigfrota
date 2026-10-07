// @sigfrota/dominio — testes de validarLavagem (R02–R04, R09–R15).
//
// Espelha os casos do gabarito (docs/lavagem-gabarito-regras.md §5). Cada teste
// cita a Rxx de origem (rastreabilidade / anti-alucinação).
//
// Nota: estes testes rodam via Vitest do workspace `web` (único configurado no
// monorepo), que compila os `.ts` do domínio diretamente pelo workspace link.

import { describe, it, expect } from 'vitest';
import { validarLavagem, dataIsoValida, MENSAGENS } from './index';
import type { LavagemInput } from './index';

// Base válida de lavagem INTERNA (na própria unidade). Serve de ponto de partida.
const internaValida: LavagemInput = {
  idTipoLavagem: 1,
  dtLavagem: '2026-01-15',
  kmLavagem: 12050,
  propriaUnidade: 'S',
};

// Base válida de lavagem EXTERNA + CONVENIADO.
const externaConveniadoValida: LavagemInput = {
  idTipoLavagem: 1,
  dtLavagem: '2026-01-15',
  kmLavagem: 45000,
  propriaUnidade: 'N',
  vlLavagem: 60,
  postoConveniado: 'S',
  idPosto: 10,
};

// Base válida de lavagem EXTERNA + NÃO CONVENIADO.
const externaNaoConveniadoValida: LavagemInput = {
  idTipoLavagem: 1,
  dtLavagem: '2026-01-15',
  kmLavagem: 88800,
  propriaUnidade: 'N',
  vlLavagem: 35,
  postoConveniado: 'N',
  dsPosto: 'Posto da Esquina',
  cnpjPosto: '12.345.678/0001-99',
};

describe('dataIsoValida (R15)', () => {
  it('aceita data ISO real', () => {
    expect(dataIsoValida('2026-01-15')).toBe(true);
    expect(dataIsoValida('2024-02-29')).toBe(true); // bissexto
  });

  it('rejeita data inexistente (31/02)', () => {
    expect(dataIsoValida('2026-02-31')).toBe(false);
    expect(dataIsoValida('2026-13-01')).toBe(false);
    expect(dataIsoValida('2023-02-29')).toBe(false); // 2023 não é bissexto
  });

  it('rejeita formato não-ISO ou vazio', () => {
    expect(dataIsoValida('15/01/2026')).toBe(false);
    expect(dataIsoValida('2026-1-5')).toBe(false);
    expect(dataIsoValida('')).toBe(false);
    expect(dataIsoValida(null)).toBe(false);
    expect(dataIsoValida(undefined)).toBe(false);
  });
});

describe('validarLavagem — casos felizes', () => {
  it('aceita lavagem interna sem valor/posto (R09/R10)', () => {
    expect(validarLavagem(internaValida)).toEqual({});
  });

  it('aceita externa + conveniado com posto (R11/R13)', () => {
    expect(validarLavagem(externaConveniadoValida)).toEqual({});
  });

  it('aceita externa + não conveniado com descrição e CNPJ (R14)', () => {
    expect(validarLavagem(externaNaoConveniadoValida)).toEqual({});
  });
});

describe('validarLavagem — obrigatórios base (R02)', () => {
  it('exige tipo de lavagem', () => {
    const erros = validarLavagem({ ...internaValida, idTipoLavagem: undefined });
    expect(erros.idTipoLavagem).toBe(MENSAGENS.obrigatorio);
  });

  it('exige data', () => {
    const erros = validarLavagem({ ...internaValida, dtLavagem: undefined });
    expect(erros.dtLavagem).toBe(MENSAGENS.obrigatorio);
  });

  it('exige km', () => {
    const erros = validarLavagem({ ...internaValida, kmLavagem: undefined });
    expect(erros.kmLavagem).toBe(MENSAGENS.obrigatorio);
  });
});

describe('validarLavagem — km (R04)', () => {
  it('rejeita km zero', () => {
    const erros = validarLavagem({ ...internaValida, kmLavagem: 0 });
    expect(erros.kmLavagem).toBe(MENSAGENS.kmMaiorQueZero);
  });

  it('rejeita km negativo', () => {
    const erros = validarLavagem({ ...internaValida, kmLavagem: -5 });
    expect(erros.kmLavagem).toBe(MENSAGENS.kmMaiorQueZero);
  });
});

describe('validarLavagem — data inválida (R15)', () => {
  it('rejeita 31/02 em ISO', () => {
    const erros = validarLavagem({ ...internaValida, dtLavagem: '2026-02-31' });
    expect(erros.dtLavagem).toBe(MENSAGENS.dataInvalida);
  });
});

describe('validarLavagem — externa: valor (R03/R11)', () => {
  it('exige valor quando externa e valor ausente', () => {
    const erros = validarLavagem({
      ...externaConveniadoValida,
      vlLavagem: undefined,
    });
    expect(erros.vlLavagem).toBe(MENSAGENS.valorObrigatorio);
  });

  it('rejeita valor zero na externa', () => {
    const erros = validarLavagem({ ...externaConveniadoValida, vlLavagem: 0 });
    expect(erros.vlLavagem).toBe(MENSAGENS.valorMaiorQueZero);
  });

  it('rejeita valor negativo na externa', () => {
    const erros = validarLavagem({ ...externaConveniadoValida, vlLavagem: -1 });
    expect(erros.vlLavagem).toBe(MENSAGENS.valorMaiorQueZero);
  });
});

describe('validarLavagem — externa conveniado (R13)', () => {
  it('exige idPosto quando conveniado sem posto', () => {
    const erros = validarLavagem({
      ...externaConveniadoValida,
      idPosto: undefined,
    });
    expect(erros.idPosto).toBe(MENSAGENS.selecionePosto);
  });
});

describe('validarLavagem — externa não conveniado (R14)', () => {
  it('exige descrição do posto', () => {
    const erros = validarLavagem({
      ...externaNaoConveniadoValida,
      dsPosto: undefined,
    });
    expect(erros.dsPosto).toBe(MENSAGENS.descricaoPosto);
  });

  it('exige CNPJ do posto', () => {
    const erros = validarLavagem({
      ...externaNaoConveniadoValida,
      cnpjPosto: '   ',
    });
    expect(erros.cnpjPosto).toBe(MENSAGENS.cnpjPosto);
  });

  it('não exige idPosto quando não conveniado', () => {
    const erros = validarLavagem(externaNaoConveniadoValida);
    expect(erros.idPosto).toBeUndefined();
  });
});

describe('validarLavagem — interna dispensa valor/posto (R10)', () => {
  it('ignora ausência de valor e posto na interna', () => {
    const erros = validarLavagem({
      idTipoLavagem: 1,
      dtLavagem: '2026-01-15',
      kmLavagem: 10,
      propriaUnidade: 'S',
    });
    expect(erros).toEqual({});
  });

  it('ainda rejeita valor <= 0 se informado na interna (R03)', () => {
    const erros = validarLavagem({ ...internaValida, vlLavagem: 0 });
    expect(erros.vlLavagem).toBe(MENSAGENS.valorMaiorQueZero);
  });
});
