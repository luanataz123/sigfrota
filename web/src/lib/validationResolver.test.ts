// lib/validationResolver.test.ts
//
// Testa a PONTE entre o React Hook Form e o domínio (Req. 4.6). A regra em si é
// testada no domínio (@sigfrota/dominio); aqui garantimos a ADAPTAÇÃO de formato
// (`{ campo: mensagem }` → `{ campo: { type, message } }`) e o contrato do
// resolver (`{ values, errors }`), cobrindo os ramos principais do gabarito.

import { describe, it, expect } from 'vitest';
import {
  lavagemResolver,
  paraErrosRhf,
  type ValoresFormularioLavagem,
} from './validationResolver';
import { MENSAGENS } from '@sigfrota/dominio';

// O resolver do RHF recebe (values, context, options); nos testes só os valores
// importam. Usamos um cast fino para dispensar o segundo/terceiro argumentos.
const resolver = (valores: ValoresFormularioLavagem) =>
  lavagemResolver(valores, undefined, {
    fields: {},
    shouldUseNativeValidation: false,
  } as never);

const internaValida: ValoresFormularioLavagem = {
  idTipoLavagem: 1,
  dtLavagem: '2026-01-15',
  kmLavagem: 12050,
  propriaUnidade: 'S',
};

const externaConveniadoValida: ValoresFormularioLavagem = {
  idTipoLavagem: 1,
  dtLavagem: '2026-01-15',
  kmLavagem: 45000,
  propriaUnidade: 'N',
  vlLavagem: 60,
  postoConveniado: 'S',
  idPosto: 10,
};

describe('paraErrosRhf — conversão de formato', () => {
  it('mapeia campo→mensagem para { type, message }', () => {
    const rhf = paraErrosRhf({
      kmLavagem: MENSAGENS.kmMaiorQueZero,
      vlLavagem: MENSAGENS.valorObrigatorio,
    });
    expect(rhf.kmLavagem).toEqual({
      type: 'validate',
      message: MENSAGENS.kmMaiorQueZero,
    });
    expect(rhf.vlLavagem).toEqual({
      type: 'validate',
      message: MENSAGENS.valorObrigatorio,
    });
  });

  it('retorna objeto vazio quando não há erros', () => {
    expect(paraErrosRhf({})).toEqual({});
  });
});

describe('lavagemResolver — caso válido', () => {
  it('interna válida retorna values e errors vazio (R09/R10)', async () => {
    const r = await resolver(internaValida);
    expect(r.values).toEqual(internaValida);
    expect(r.errors).toEqual({});
  });

  it('externa + conveniado válida retorna errors vazio (R11/R13)', async () => {
    const r = await resolver(externaConveniadoValida);
    expect(r.values).toEqual(externaConveniadoValida);
    expect(r.errors).toEqual({});
  });
});

describe('lavagemResolver — ramos de erro (bloqueia envio)', () => {
  it('externa sem valor → erro em vlLavagem (R11)', async () => {
    const r = await resolver({
      ...externaConveniadoValida,
      vlLavagem: undefined,
    });
    expect(r.values).toEqual({});
    expect(r.errors.vlLavagem?.message).toBe(MENSAGENS.valorObrigatorio);
  });

  it('externa + conveniado sem posto → erro em idPosto (R13)', async () => {
    const r = await resolver({ ...externaConveniadoValida, idPosto: undefined });
    expect(r.errors.idPosto?.message).toBe(MENSAGENS.selecionePosto);
  });

  it('externa + não conveniado sem CNPJ → erro em cnpjPosto (R14)', async () => {
    const r = await resolver({
      idTipoLavagem: 1,
      dtLavagem: '2026-01-15',
      kmLavagem: 88800,
      propriaUnidade: 'N',
      vlLavagem: 35,
      postoConveniado: 'N',
      dsPosto: 'Posto da Esquina',
      cnpjPosto: undefined,
    });
    expect(r.errors.cnpjPosto?.message).toBe(MENSAGENS.cnpjPosto);
  });

  it('km zero → erro em kmLavagem (R04)', async () => {
    const r = await resolver({ ...internaValida, kmLavagem: 0 });
    expect(r.errors.kmLavagem?.message).toBe(MENSAGENS.kmMaiorQueZero);
  });

  it('data inválida → erro em dtLavagem (R15)', async () => {
    const r = await resolver({ ...internaValida, dtLavagem: '2026-02-31' });
    expect(r.errors.dtLavagem?.message).toBe(MENSAGENS.dataInvalida);
  });
});

// ---------------------------------------------------------------------------
// Tarefa 6.3 — cobertura COMPLETA de cada ramo de obrigatoriedade e dos casos
// do gabarito (docs/lavagem-gabarito-regras.md §5). Usamos o DOMÍNIO REAL via
// `lavagemResolver` (sem mocks). Cada teste cita a(s) Rxx de origem.

const externaNaoConveniadoValida: ValoresFormularioLavagem = {
  idTipoLavagem: 2,
  dtLavagem: '2026-01-15',
  kmLavagem: 88800,
  propriaUnidade: 'N',
  vlLavagem: 35,
  postoConveniado: 'N',
  dsPosto: 'Posto da Esquina',
  cnpjPosto: '12.345.678/0001-99',
};

describe('gabarito §5 — casos felizes (aceitos)', () => {
  it('R09/R10 — feliz interna (km válido, sem valor/posto) → aceito', async () => {
    const r = await resolver(internaValida);
    expect(r.errors).toEqual({});
    expect(r.values).toEqual(internaValida);
  });

  it('R11/R13 — feliz externa conveniado (valor>0, idPosto) → aceito', async () => {
    const r = await resolver(externaConveniadoValida);
    expect(r.errors).toEqual({});
    expect(r.values).toEqual(externaConveniadoValida);
  });

  it('R11/R14 — feliz externa não conveniado (valor>0, dsPosto, cnpjPosto) → aceito', async () => {
    const r = await resolver(externaNaoConveniadoValida);
    expect(r.errors).toEqual({});
    expect(r.values).toEqual(externaNaoConveniadoValida);
  });
});

describe('R04 — odômetro (km) deve ser > 0', () => {
  it('R04 — km zero → erro em kmLavagem', async () => {
    const r = await resolver({ ...internaValida, kmLavagem: 0 });
    expect(r.values).toEqual({});
    expect(r.errors.kmLavagem?.message).toBe(MENSAGENS.kmMaiorQueZero);
  });

  it('R04 — km negativo → erro em kmLavagem', async () => {
    const r = await resolver({ ...internaValida, kmLavagem: -5 });
    expect(r.errors.kmLavagem?.message).toBe(MENSAGENS.kmMaiorQueZero);
  });
});

describe('R03/R11 — valor da lavagem externa', () => {
  it('R11 — externo sem valor (undefined) → erro em vlLavagem (valor obrigatório)', async () => {
    const r = await resolver({ ...externaConveniadoValida, vlLavagem: undefined });
    expect(r.values).toEqual({});
    expect(r.errors.vlLavagem?.message).toBe(MENSAGENS.valorObrigatorio);
  });

  it('R03/R11 — valor zero externo → erro em vlLavagem (valor > 0)', async () => {
    const r = await resolver({ ...externaConveniadoValida, vlLavagem: 0 });
    expect(r.errors.vlLavagem?.message).toBe(MENSAGENS.valorMaiorQueZero);
  });

  it('R03/R11 — valor negativo externo → erro em vlLavagem (valor > 0)', async () => {
    const r = await resolver({ ...externaConveniadoValida, vlLavagem: -10 });
    expect(r.errors.vlLavagem?.message).toBe(MENSAGENS.valorMaiorQueZero);
  });
});

describe('R13 — conveniado exige seleção de posto', () => {
  it('R13 — conveniado sem posto (idPosto undefined) → erro em idPosto', async () => {
    const r = await resolver({ ...externaConveniadoValida, idPosto: undefined });
    expect(r.values).toEqual({});
    expect(r.errors.idPosto?.message).toBe(MENSAGENS.selecionePosto);
  });

  it('R12/R13 — externa com postoConveniado default (undefined) exige posto', async () => {
    const r = await resolver({
      idTipoLavagem: 1,
      dtLavagem: '2026-01-15',
      kmLavagem: 45000,
      propriaUnidade: 'N',
      vlLavagem: 60,
      // postoConveniado ausente ⇒ default "Sim" (R12) ⇒ idPosto obrigatório (R13)
    });
    expect(r.errors.idPosto?.message).toBe(MENSAGENS.selecionePosto);
  });
});

describe('R14 — não conveniado exige descrição E CNPJ (testar faltando cada um)', () => {
  it('R14 — não conveniado sem CNPJ → erro em cnpjPosto', async () => {
    const r = await resolver({ ...externaNaoConveniadoValida, cnpjPosto: undefined });
    expect(r.values).toEqual({});
    expect(r.errors.cnpjPosto?.message).toBe(MENSAGENS.cnpjPosto);
    // Descrição estava presente ⇒ não deve haver erro em dsPosto.
    expect(r.errors.dsPosto).toBeUndefined();
  });

  it('R14 — não conveniado sem descrição → erro em dsPosto', async () => {
    const r = await resolver({ ...externaNaoConveniadoValida, dsPosto: undefined });
    expect(r.errors.dsPosto?.message).toBe(MENSAGENS.descricaoPosto);
    expect(r.errors.cnpjPosto).toBeUndefined();
  });

  it('R14 — não conveniado sem descrição NEM CNPJ → erro nos dois campos', async () => {
    const r = await resolver({
      ...externaNaoConveniadoValida,
      dsPosto: undefined,
      cnpjPosto: undefined,
    });
    expect(r.errors.dsPosto?.message).toBe(MENSAGENS.descricaoPosto);
    expect(r.errors.cnpjPosto?.message).toBe(MENSAGENS.cnpjPosto);
  });

  it('R14 — descrição/CNPJ só com espaços não contam como preenchidos', async () => {
    const r = await resolver({
      ...externaNaoConveniadoValida,
      dsPosto: '   ',
      cnpjPosto: '  ',
    });
    expect(r.errors.dsPosto?.message).toBe(MENSAGENS.descricaoPosto);
    expect(r.errors.cnpjPosto?.message).toBe(MENSAGENS.cnpjPosto);
  });
});

describe('R15 — data da lavagem deve ser válida', () => {
  it('R15 — data impossível 31/02 (ISO 2026-02-31) → erro em dtLavagem', async () => {
    const r = await resolver({ ...internaValida, dtLavagem: '2026-02-31' });
    expect(r.values).toEqual({});
    expect(r.errors.dtLavagem?.message).toBe(MENSAGENS.dataInvalida);
  });

  it('R15 — formato errado (DD/MM/AAAA cru) → erro em dtLavagem', async () => {
    const r = await resolver({ ...internaValida, dtLavagem: '15/01/2026' });
    expect(r.errors.dtLavagem?.message).toBe(MENSAGENS.dataInvalida);
  });
});

describe('R02 — obrigatórios base faltando (tipo, data, km)', () => {
  it('R02 — sem idTipoLavagem → erro em idTipoLavagem', async () => {
    const r = await resolver({ ...internaValida, idTipoLavagem: undefined });
    expect(r.values).toEqual({});
    expect(r.errors.idTipoLavagem?.message).toBe(MENSAGENS.obrigatorio);
  });

  it('R02 — sem dtLavagem → erro em dtLavagem (obrigatório)', async () => {
    const r = await resolver({ ...internaValida, dtLavagem: undefined });
    expect(r.errors.dtLavagem?.message).toBe(MENSAGENS.obrigatorio);
  });

  it('R02 — sem kmLavagem → erro em kmLavagem (obrigatório)', async () => {
    const r = await resolver({ ...internaValida, kmLavagem: undefined });
    expect(r.errors.kmLavagem?.message).toBe(MENSAGENS.obrigatorio);
  });

  it('R02 — faltando os três obrigatórios base de uma vez → erro em cada um', async () => {
    const r = await resolver({ propriaUnidade: 'S' });
    expect(r.errors.idTipoLavagem?.message).toBe(MENSAGENS.obrigatorio);
    expect(r.errors.dtLavagem?.message).toBe(MENSAGENS.obrigatorio);
    expect(r.errors.kmLavagem?.message).toBe(MENSAGENS.obrigatorio);
  });
});

describe('R10 — interna NÃO exige valor/posto mesmo que ocultos', () => {
  it('R10 — interna sem valor nem posto → aceito (não gera erro de valor/posto)', async () => {
    const r = await resolver(internaValida);
    expect(r.errors.vlLavagem).toBeUndefined();
    expect(r.errors.idPosto).toBeUndefined();
    expect(r.errors.dsPosto).toBeUndefined();
    expect(r.errors.cnpjPosto).toBeUndefined();
    expect(r.errors).toEqual({});
  });

  it('R10 — interna com postoConveniado="N" definido NÃO exige dsPosto/cnpjPosto', async () => {
    // Mesmo com ramo não conveniado "sujo" no estado, interna dispensa posto.
    const r = await resolver({ ...internaValida, postoConveniado: 'N' });
    expect(r.errors.dsPosto).toBeUndefined();
    expect(r.errors.cnpjPosto).toBeUndefined();
    expect(r.errors.vlLavagem).toBeUndefined();
    expect(r.errors).toEqual({});
  });
});
