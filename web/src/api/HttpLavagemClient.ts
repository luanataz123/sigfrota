// api/HttpLavagemClient.ts
//
// Implementação HTTP do contrato `LavagemClient` contra a API `api-lavagens`.
//
// Responsabilidades:
//  - Injeta o JWT da sessão no header `Authorization` de cada chamada (Req. 1.3).
//  - Ao receber 401, dispara um callback de encerramento de sessão (Req. 1.4),
//    sem travar a aplicação, e propaga um `HttpLavagemError`.
//  - Serializa/parseia JSON e expõe o corpo de erros 4xx/5xx para a UI.
//
// O token e o callback de 401 são INJETÁVEIS (via construtor) para não acoplar
// esta camada ao AuthProvider. O `providers.tsx` (tarefa 3.3) liga
// `() => sessao.token` e `() => sessao.logout()` aqui via `criarLavagemClient`.
//
// -----------------------------------------------------------------------------
// Contrato HTTP assumido (REST sobre `baseUrl` = VITE_API_BASE_URL, Req. 11.1)
//
//   GET    /veiculos/{id}/lavagens   → Lavagem[]       (R19/R20)
//   GET    /veiculos/{id}            → Veiculo          (R16, kmAtual read-only)
//   GET    /lavagens/{id}            → Lavagem          (R21, edição)
//   GET    /tipos-lavagem            → TipoLavagem[]    (Req. 4.5)
//   GET    /postos                   → Posto[]          (Req. 6.6)
//   POST   /lavagens                 → Lavagem          (R17, inclusão)
//   PUT    /lavagens/{id}            → Lavagem          (R17, edição)
//   DELETE /lavagens/{id}            → 204 No Content   (R17, exclusão)
//
// Todos os corpos trafegam em `application/json`. A spec de backend
// `api-lavagens` ainda não existe no repositório; estes caminhos/métodos são o
// contrato assumido por este frontend. Quando a spec de backend existir, basta
// alinhar nomes de rota/campos aqui (os tipos vivem em `./types`).
// -----------------------------------------------------------------------------

import type { LavagemClient } from './LavagemClient';
import type { Lavagem, Posto, TipoLavagem, Veiculo } from './types';

/** Erro HTTP genérico desta camada (status + corpo bruto, quando houver). */
export class HttpLavagemError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly corpo?: unknown,
  ) {
    super(message);
    this.name = 'HttpLavagemError';
  }
}

export interface HttpLavagemClientOptions {
  /** Base URL da API (ex.: `import.meta.env.VITE_API_BASE_URL`). Req. 11.1. */
  baseUrl: string;
  /**
   * Fornece o JWT da sessão atual, ou `null`/`undefined` quando não há sessão.
   * Injetável para desacoplar do AuthProvider (tarefa 3). Req. 1.3.
   */
  obterToken?: () => string | null | undefined;
  /**
   * Callback disparado quando a API responde 401 (token expirado/ausente).
   * A tarefa 3 ligará isto ao logout do AuthProvider. Req. 1.4.
   */
  aoNaoAutorizado?: () => void;
  /** `fetch` injetável para testes (default: `globalThis.fetch`). */
  fetchImpl?: typeof fetch;
}

export class HttpLavagemClient implements LavagemClient {
  private readonly baseUrl: string;
  private readonly obterToken: () => string | null | undefined;
  private readonly aoNaoAutorizado: () => void;
  private readonly fetchImpl: typeof fetch;

  constructor(opcoes: HttpLavagemClientOptions) {
    // Normaliza removendo barra final para compor caminhos com segurança.
    this.baseUrl = opcoes.baseUrl.replace(/\/+$/, '');
    this.obterToken = opcoes.obterToken ?? (() => undefined);
    this.aoNaoAutorizado = opcoes.aoNaoAutorizado ?? (() => {});
    this.fetchImpl = opcoes.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  // --- infra base de HTTP ----------------------------------------------------

  /**
   * Executa uma chamada HTTP injetando o JWT (Req. 1.3) e tratando 401 (Req. 1.4).
   *
   * Erros de validação do servidor (4xx com corpo, R03–R15) são propagados como
   * `HttpLavagemError` com `status` e `corpo`, para a UI exibir sem reinterpretar
   * campo a campo.
   */
  private async requisicao<T>(caminho: string, init: RequestInit = {}): Promise<T> {
    const token = this.obterToken();

    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    // Req. 1.3: anexa o JWT da sessão quando houver.
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const resposta = await this.fetchImpl(`${this.baseUrl}${caminho}`, {
      ...init,
      headers,
    });

    // Req. 1.4: 401 → encerra a sessão sem travar a app.
    if (resposta.status === 401) {
      this.aoNaoAutorizado();
      throw new HttpLavagemError(401, 'Sessão expirada ou não autorizada.');
    }

    if (!resposta.ok) {
      // Erros de domínio/validação (R03–R15): expõe o corpo bruto à UI.
      let corpo: unknown;
      try {
        corpo = await resposta.json();
      } catch {
        corpo = undefined;
      }
      throw new HttpLavagemError(
        resposta.status,
        `Falha HTTP ${resposta.status} ao chamar ${caminho}.`,
        corpo,
      );
    }

    // 204/sem corpo → retorno vazio.
    if (resposta.status === 204) {
      return undefined as T;
    }
    return (await resposta.json()) as T;
  }

  // --- leituras --------------------------------------------------------------

  async listarLavagens(idVeiculo: number): Promise<Lavagem[]> {
    // R19/R20
    return this.requisicao<Lavagem[]>(`/veiculos/${idVeiculo}/lavagens`);
  }

  async obterVeiculo(idVeiculo: number): Promise<Veiculo> {
    // R16 (KM_ATUAL)
    return this.requisicao<Veiculo>(`/veiculos/${idVeiculo}`);
  }

  async obterLavagem(id: number): Promise<Lavagem> {
    // R21 (edição)
    return this.requisicao<Lavagem>(`/lavagens/${id}`);
  }

  async listarTipos(): Promise<TipoLavagem[]> {
    // Req. 4.5
    return this.requisicao<TipoLavagem[]>(`/tipos-lavagem`);
  }

  async listarPostos(): Promise<Posto[]> {
    // Req. 6.6
    return this.requisicao<Posto[]>(`/postos`);
  }

  // --- mutações --------------------------------------------------------------

  async criarLavagem(dados: Lavagem): Promise<Lavagem> {
    // R17 (POST)
    return this.requisicao<Lavagem>(`/lavagens`, {
      method: 'POST',
      body: JSON.stringify(dados),
    });
  }

  async atualizarLavagem(id: number, dados: Lavagem): Promise<Lavagem> {
    // R17 (PUT): substituição completa do recurso.
    return this.requisicao<Lavagem>(`/lavagens/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dados),
    });
  }

  async excluirLavagem(id: number): Promise<void> {
    // R17 (DELETE)
    await this.requisicao<void>(`/lavagens/${id}`, { method: 'DELETE' });
  }
}
