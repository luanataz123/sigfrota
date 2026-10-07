import { describe, it, expect, vi } from 'vitest';
import { HttpLavagemClient, HttpLavagemError } from './HttpLavagemClient';
import type { Lavagem } from './types';

const BASE_URL = 'https://api.exemplo.test';
const TOKEN = 'jwt-abc-123';

const lavagemBase: Lavagem = {
  idVeiculo: 101,
  idTipoLavagem: 1,
  dtLavagem: '2026-10-01',
  kmLavagem: 50000,
  propriaUnidade: 'S',
};

/** Monta uma Response JSON de sucesso. */
function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Cria um fetch mockado que devolve sempre a mesma resposta, capturando a chamada. */
function fetchQueRetorna(resposta: Response) {
  return vi.fn<typeof fetch>(async () => resposta);
}

/** Extrai (url, init) da primeira chamada ao fetch mockado. */
function primeiraChamada(mock: ReturnType<typeof vi.fn>) {
  const [url, init] = mock.mock.calls[0] as [string, RequestInit];
  return { url, init, headers: new Headers(init?.headers) };
}

function criarClient(
  fetchImpl: typeof fetch,
  obterToken: () => string | null | undefined = () => TOKEN,
  aoNaoAutorizado: () => void = () => {},
) {
  return new HttpLavagemClient({
    baseUrl: BASE_URL,
    obterToken,
    aoNaoAutorizado,
    fetchImpl,
  });
}

describe('HttpLavagemClient — contrato HTTP', () => {
  it('R19: listarLavagens faz GET na URL correta e parseia Lavagem[]', async () => {
    const corpo: Lavagem[] = [{ ...lavagemBase, idLavagem: 1 }];
    const fetchMock = fetchQueRetorna(respostaJson(corpo));
    const client = criarClient(fetchMock);

    const resultado = await client.listarLavagens(101);

    const { url, init, headers } = primeiraChamada(fetchMock);
    expect(url).toBe(`${BASE_URL}/veiculos/101/lavagens`);
    expect(init.method ?? 'GET').toBe('GET');
    // Req. 1.3: Authorization Bearer presente quando há token.
    expect(headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    expect(headers.get('Accept')).toBe('application/json');
    expect(resultado).toEqual(corpo);
  });

  it('R16: obterVeiculo faz GET /veiculos/{id} e retorna o Veiculo', async () => {
    const veiculo = { idVeiculo: 101, descricao: 'Gol', kmAtual: 48000 };
    const fetchMock = fetchQueRetorna(respostaJson(veiculo));
    const client = criarClient(fetchMock);

    const resultado = await client.obterVeiculo(101);

    const { url } = primeiraChamada(fetchMock);
    expect(url).toBe(`${BASE_URL}/veiculos/101`);
    expect(resultado).toEqual(veiculo);
  });

  it('R21: obterLavagem faz GET /veiculos/{idVeiculo}/lavagens/{id}', async () => {
    const lavagem: Lavagem = { ...lavagemBase, idLavagem: 7 };
    const fetchMock = fetchQueRetorna(respostaJson(lavagem));
    const client = criarClient(fetchMock);

    const resultado = await client.obterLavagem(101, 7);

    expect(primeiraChamada(fetchMock).url).toBe(`${BASE_URL}/veiculos/101/lavagens/7`);
    expect(resultado).toEqual(lavagem);
  });

  it('listarTipos e listarPostos chamam os endpoints de catálogo', async () => {
    const tiposMock = fetchQueRetorna(respostaJson([{ idTipoLavagem: 1, descricao: 'Simples' }]));
    await criarClient(tiposMock).listarTipos();
    expect(primeiraChamada(tiposMock).url).toBe(`${BASE_URL}/tipos-lavagem`);

    const postosMock = fetchQueRetorna(respostaJson([{ idPosto: 1, nome: 'Posto A' }]));
    await criarClient(postosMock).listarPostos();
    expect(primeiraChamada(postosMock).url).toBe(`${BASE_URL}/postos`);
  });

  it('R17: criarLavagem faz POST no veículo do payload, com Content-Type JSON e body serializado', async () => {
    const criada: Lavagem = { ...lavagemBase, idLavagem: 42 };
    const fetchMock = fetchQueRetorna(respostaJson(criada, 201));
    const client = criarClient(fetchMock);

    const resultado = await client.criarLavagem(lavagemBase);

    const { url, init, headers } = primeiraChamada(fetchMock);
    expect(url).toBe(`${BASE_URL}/veiculos/101/lavagens`);
    expect(init.method).toBe('POST');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(init.body).toBe(JSON.stringify(lavagemBase));
    expect(resultado).toEqual(criada);
  });

  it('R17: atualizarLavagem faz PUT /veiculos/{idVeiculo}/lavagens/{id} com body JSON', async () => {
    const atualizada: Lavagem = { ...lavagemBase, idLavagem: 42, kmLavagem: 51234 };
    const fetchMock = fetchQueRetorna(respostaJson(atualizada));
    const client = criarClient(fetchMock);

    const resultado = await client.atualizarLavagem(101, 42, atualizada);

    const { url, init } = primeiraChamada(fetchMock);
    expect(url).toBe(`${BASE_URL}/veiculos/101/lavagens/42`);
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(JSON.stringify(atualizada));
    expect(resultado).toEqual(atualizada);
  });

  it('R17: excluirLavagem faz DELETE e trata 204 (sem corpo) como void', async () => {
    const fetchMock = fetchQueRetorna(new Response(null, { status: 204 }));
    const client = criarClient(fetchMock);

    const resultado = await client.excluirLavagem(101, 42);

    const { url, init } = primeiraChamada(fetchMock);
    expect(url).toBe(`${BASE_URL}/veiculos/101/lavagens/42`);
    expect(init.method).toBe('DELETE');
    expect(resultado).toBeUndefined();
  });

  it('Req. 1.4: 401 chama aoNaoAutorizado e rejeita com HttpLavagemError status 401', async () => {
    const aoNaoAutorizado = vi.fn();
    const fetchMock = fetchQueRetorna(new Response(null, { status: 401 }));
    const client = criarClient(fetchMock, () => TOKEN, aoNaoAutorizado);

    await expect(client.listarLavagens(101)).rejects.toSatisfy(
      (e: unknown) => e instanceof HttpLavagemError && e.status === 401,
    );
    expect(aoNaoAutorizado).toHaveBeenCalledTimes(1);
  });

  it('4xx com corpo de erro: rejeita com HttpLavagemError expondo status e corpo', async () => {
    const corpoErro = { erros: [{ campo: 'kmLavagem', mensagem: 'Km inválido (R04)' }] };
    const fetchMock = fetchQueRetorna(respostaJson(corpoErro, 422));
    const client = criarClient(fetchMock);

    try {
      await client.criarLavagem(lavagemBase);
      expect.unreachable('deveria ter lançado HttpLavagemError');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpLavagemError);
      const erro = e as HttpLavagemError;
      expect(erro.status).toBe(422);
      expect(erro.corpo).toEqual(corpoErro);
    }
  });

  it('Req. 1.3: sem token não envia header Authorization (requisição anônima)', async () => {
    const fetchMock = fetchQueRetorna(respostaJson([]));
    const client = criarClient(fetchMock, () => null);

    await client.listarLavagens(101);

    const { headers } = primeiraChamada(fetchMock);
    expect(headers.has('Authorization')).toBe(false);
  });

  it('normaliza baseUrl removendo barra(s) final(is)', async () => {
    const fetchMock = fetchQueRetorna(respostaJson([]));
    const client = new HttpLavagemClient({
      baseUrl: `${BASE_URL}///`,
      obterToken: () => TOKEN,
      fetchImpl: fetchMock,
    });

    await client.listarLavagens(101);

    expect(primeiraChamada(fetchMock).url).toBe(`${BASE_URL}/veiculos/101/lavagens`);
  });
});
