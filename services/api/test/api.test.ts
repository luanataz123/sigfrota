// Testes da API contra o conjunto `gabarito` (docs/lavagem-gabarito-regras.md §5).
// Cada caso cita a regra de origem (Rxx).

import { describe, expect, it } from 'vitest';
import type { EventoHttp } from '../src/http';
import { rotasCatalogo, rotasLavagensEscrita, rotasLavagensLeitura } from '../src/rotas';
import { ServicoLavagens } from '../src/servico';
import { lerSeed, RepositorioMemoria } from './repositorio-memoria';

const SUB = '11111111-2222-3333-4444-555555555555';

function montar() {
  const repo = new RepositorioMemoria(lerSeed('gabarito'));
  const servico = new ServicoLavagens(repo);
  return {
    repo,
    catalogo: rotasCatalogo(servico),
    leitura: rotasLavagensLeitura(servico),
    escrita: rotasLavagensEscrita(servico),
  };
}

function evento(
  routeKey: string,
  pathParameters: Record<string, string> = {},
  corpo?: unknown,
  sub: string | undefined = SUB,
): EventoHttp {
  return {
    routeKey,
    pathParameters,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    requestContext: { authorizer: { jwt: { claims: sub ? { sub } : {} } } },
  };
}

const json = (r: { body: string }) => JSON.parse(r.body);

const interna = { idVeiculo: 101, idTipoLavagem: 1, dtLavagem: '2026-10-01', kmLavagem: 45100, propriaUnidade: 'S' };
const externaConveniada = {
  idVeiculo: 101,
  idTipoLavagem: 2,
  dtLavagem: '2026-10-02',
  kmLavagem: 45150,
  propriaUnidade: 'N',
  vlLavagem: 70.5,
  postoConveniado: 'S',
  idPosto: 10,
};
const externaNaoConveniada = {
  idVeiculo: 101,
  idTipoLavagem: 1,
  dtLavagem: '2026-10-03',
  kmLavagem: 45200,
  propriaUnidade: 'N',
  vlLavagem: 40,
  postoConveniado: 'N',
  dsPosto: 'Lava-Jato Teste',
  cnpjPosto: '12.345.678/0001-95',
};

describe('catálogo', () => {
  it('R16: GET /veiculos/{id} devolve descrição e Km Atual', async () => {
    const { catalogo } = montar();
    const r = await catalogo(evento('GET /veiculos/{idVeiculo}', { idVeiculo: '101' }));
    expect(r.statusCode).toBe(200);
    expect(json(r)).toEqual({ idVeiculo: 101, descricao: 'Fiat Cronos de placa ABC1D23', kmAtual: 45210 });
  });

  it('R06: veículo inexistente → 404', async () => {
    const { catalogo } = montar();
    const r = await catalogo(evento('GET /veiculos/{idVeiculo}', { idVeiculo: '999' }));
    expect(r.statusCode).toBe(404);
  });

  it('parâmetro de rota não numérico → 400', async () => {
    const { catalogo } = montar();
    const r = await catalogo(evento('GET /veiculos/{idVeiculo}', { idVeiculo: '1 OR 1=1' }));
    expect(r.statusCode).toBe(400);
  });

  it('tipos e postos no formato do front', async () => {
    const { catalogo } = montar();
    expect(json(await catalogo(evento('GET /tipos-lavagem')))).toEqual([
      { idTipoLavagem: 1, descricao: 'Simples' },
      { idTipoLavagem: 2, descricao: 'Completa' },
      { idTipoLavagem: 3, descricao: 'Higienizacao interna' },
    ]);
    const postos = json(await catalogo(evento('GET /postos')));
    expect(postos.map((p: { idPosto: number }) => p.idPosto).sort()).toEqual([10, 11]);
    expect(postos[0]).toHaveProperty('nome');
  });
});

describe('listagem e leitura', () => {
  it('R19/R20: o veículo 101 tem só a lavagem 3397, no formato do front', async () => {
    const { leitura } = montar();
    const r = await leitura(evento('GET /veiculos/{idVeiculo}/lavagens', { idVeiculo: '101' }));
    expect(r.statusCode).toBe(200);
    expect(json(r)).toEqual([
      {
        idLavagem: 3397,
        idVeiculo: 101,
        idTipoLavagem: 2,
        dsTipoLavagem: 'Completa',
        dtLavagem: '2026-09-01',
        kmLavagem: 45000,
        propriaUnidade: 'N',
        vlLavagem: 60,
        postoConveniado: 'S',
        idPosto: 10,
      },
    ]);
  });

  it('R14: lavagem não conveniada sai com dsPosto/cnpjPosto e postoConveniado N', async () => {
    const { leitura } = montar();
    const r = await leitura(
      evento('GET /veiculos/{idVeiculo}/lavagens/{idLavagem}', { idVeiculo: '102', idLavagem: '3398' }),
    );
    const l = json(r);
    expect(l).toMatchObject({ propriaUnidade: 'N', postoConveniado: 'N', dsPosto: 'Lava-Jato do Ze' });
    expect(l).not.toHaveProperty('idPosto');
  });

  it('R10: lavagem interna sai sem valor nem posto', async () => {
    const { leitura } = montar();
    const l = json(
      await leitura(evento('GET /veiculos/{idVeiculo}/lavagens/{idLavagem}', { idVeiculo: '103', idLavagem: '3399' })),
    );
    expect(l.propriaUnidade).toBe('S');
    for (const campo of ['vlLavagem', 'postoConveniado', 'idPosto', 'dsPosto', 'cnpjPosto']) {
      expect(l).not.toHaveProperty(campo);
    }
  });

  it('R21: lavagem de outro veículo → 404', async () => {
    const { leitura } = montar();
    const r = await leitura(
      evento('GET /veiculos/{idVeiculo}/lavagens/{idLavagem}', { idVeiculo: '101', idLavagem: '3398' }),
    );
    expect(r.statusCode).toBe(404);
  });
});

describe('inclusão (R17)', () => {
  const post = (corpo: unknown, sub?: string) =>
    evento('POST /veiculos/{idVeiculo}/lavagens', { idVeiculo: '101' }, corpo, sub);

  it('R23: incluir lavagem válida no 101 e recarregar a lista mostra a nova lavagem', async () => {
    const { escrita, leitura } = montar();
    const r = await escrita(post(externaConveniada));
    expect(r.statusCode).toBe(201);
    const criada = json(r);
    expect(criada.idLavagem).toBe(3400); // R01: contador do gabarito em 3399

    const lista = json(await leitura(evento('GET /veiculos/{idVeiculo}/lavagens', { idVeiculo: '101' })));
    expect(lista.map((l: { idLavagem: number }) => l.idLavagem)).toEqual([3397, 3400]);
  });

  it('R01/R08: ID do contador, cadastrador do token e campos do ramo como null', async () => {
    const { escrita, repo } = montar();
    const corpo = { ...interna, idLavagem: 1, idPessoaCadastrador: 'invasor', vlLavagem: 99 };
    const criada = json(await escrita(post(corpo)));
    const item = await repo.obter('VEICULO#101', `LAVAGEM#${criada.idLavagem}`);
    expect(criada.idLavagem).toBe(3400);
    expect(item).toMatchObject({
      idPessoaCadastrador: SUB,
      propriaUnidade: true,
      postoConveniado: null,
      vlLavagem: null, // R10: interna dispensa valor
      idPosto: null,
      dsTipoLavagem: 'Simples',
    });
    expect(item?.dtCadastro).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('R14: externa não conveniada grava dsPosto/cnpjPosto e idPosto null', async () => {
    const { escrita, repo } = montar();
    const criada = json(await escrita(post({ ...externaNaoConveniada, idPosto: 10 })));
    const item = await repo.obter('VEICULO#101', `LAVAGEM#${criada.idLavagem}`);
    expect(item).toMatchObject({ postoConveniado: false, idPosto: null, cnpjPosto: '12.345.678/0001-95' });
  });

  it('R08: sem sub no token → 401', async () => {
    const { escrita } = montar();
    const r = await escrita({ ...post(interna), requestContext: {} });
    expect(r.statusCode).toBe(401);
  });

  const casosInvalidos: Array<[string, Record<string, unknown>, string]> = [
    ['R02: sem tipo', { ...interna, idTipoLavagem: undefined }, 'idTipoLavagem'],
    ['R04: km zero', { ...interna, kmLavagem: 0 }, 'kmLavagem'],
    ['R11: externa sem valor', { ...externaConveniada, vlLavagem: undefined }, 'vlLavagem'],
    ['R03: valor negativo', { ...externaConveniada, vlLavagem: -10 }, 'vlLavagem'],
    ['R13: conveniado sem posto', { ...externaConveniada, idPosto: undefined }, 'idPosto'],
    ['R14: não conveniado sem CNPJ', { ...externaNaoConveniada, cnpjPosto: undefined }, 'cnpjPosto'],
    ['R15: data inválida', { ...interna, dtLavagem: '2026-02-31' }, 'dtLavagem'],
    ['R05: tipo inexistente', { ...interna, idTipoLavagem: 99 }, 'idTipoLavagem'],
    ['R07: posto inexistente', { ...externaConveniada, idPosto: 99 }, 'idPosto'],
    ['limite: valor acima de 999,99', { ...externaConveniada, vlLavagem: 1000 }, 'vlLavagem'],
    ['limite: km acima de 999.999', { ...interna, kmLavagem: 1_000_000 }, 'kmLavagem'],
    ['tipo errado: km como texto', { ...interna, kmLavagem: '45100' }, 'kmLavagem'],
    ['veículo do corpo diferente da rota', { ...interna, idVeiculo: 102 }, 'idVeiculo'],
  ];

  it.each(casosInvalidos)('%s → 400 com erro no campo', async (_nome, corpo, campo) => {
    const { escrita, repo } = montar();
    const r = await escrita(post(corpo));
    expect(r.statusCode).toBe(400);
    expect(json(r).erros).toHaveProperty(campo);
    // Nada gravado e contador intacto.
    expect((await repo.obter('CONTADOR', 'LAVAGEM'))?.ultimoId).toBe(3399);
  });

  it('R06: veículo inexistente na rota → 404', async () => {
    const { escrita } = montar();
    const r = await escrita(
      evento('POST /veiculos/{idVeiculo}/lavagens', { idVeiculo: '999' }, { ...interna, idVeiculo: 999 }),
    );
    expect(r.statusCode).toBe(404);
  });

  it('corpo que não é JSON → 400', async () => {
    const { escrita } = montar();
    const r = await escrita({ ...post(interna), body: '{nao-json' });
    expect(r.statusCode).toBe(400);
  });
});

describe('alteração e exclusão (R17)', () => {
  it('PUT altera a lavagem e preserva cadastrador e data de cadastro (R08)', async () => {
    const { escrita, repo } = montar();
    const r = await escrita(
      evento(
        'PUT /veiculos/{idVeiculo}/lavagens/{idLavagem}',
        { idVeiculo: '101', idLavagem: '3397' },
        { ...externaConveniada, kmLavagem: 45001, idLavagem: 3397 },
      ),
    );
    expect(r.statusCode).toBe(200);
    expect(json(r)).toMatchObject({ idLavagem: 3397, kmLavagem: 45001 });
    expect(await repo.obter('VEICULO#101', 'LAVAGEM#3397')).toMatchObject({
      idPessoaCadastrador: 9001,
      dtCadastro: '2026-09-01',
      kmLavagem: 45001,
    });
  });

  it('PUT de lavagem inexistente → 404', async () => {
    const { escrita } = montar();
    const r = await escrita(
      evento('PUT /veiculos/{idVeiculo}/lavagens/{idLavagem}', { idVeiculo: '101', idLavagem: '5000' }, interna),
    );
    expect(r.statusCode).toBe(404);
  });

  it('DELETE remove a lavagem (204) e repetir dá 404', async () => {
    const { escrita, leitura } = montar();
    const del = evento('DELETE /veiculos/{idVeiculo}/lavagens/{idLavagem}', { idVeiculo: '101', idLavagem: '3397' });
    expect((await escrita(del)).statusCode).toBe(204);
    expect((await escrita(del)).statusCode).toBe(404);
    const lista = json(await leitura(evento('GET /veiculos/{idVeiculo}/lavagens', { idVeiculo: '101' })));
    expect(lista).toEqual([]);
  });
});

describe('demo', () => {
  it('lista do 101 no demo vem ordenada por data', async () => {
    const servico = new ServicoLavagens(new RepositorioMemoria(lerSeed('demo')));
    const lista = await servico.listarLavagens(101);
    expect(lista.length).toBeGreaterThan(1);
    const datas = lista.map((l) => l.dtLavagem);
    expect([...datas].sort()).toEqual(datas);
  });
});
