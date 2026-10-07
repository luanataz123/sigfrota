// api/HttpLavagemClient.ts
//
// ESQUELETO da implementação HTTP do contrato `LavagemClient`.
//
// Esta classe estabelece a estrutura base para falar com a API real
// `api-lavagens`:
//  - Injeta o JWT da sessão no header `Authorization` de cada chamada (Req. 1.3).
//  - Ao receber 401, dispara um callback de encerramento de sessão (Req. 1.4),
//    sem travar a aplicação.
//
// O token e o callback de 401 são INJETÁVEIS (via construtor) para não acoplar
// esta camada ao AuthProvider — que ainda não existe (será criado na tarefa 3).
// A tarefa 3 passará `() => sessao.token` e `() => sessao.logout()` aqui.
//
// =====================================================================
// TAREFA 11 (Integração com a API real) — o que falta completar aqui:
//  - Validar o mapeamento request/response contra o contrato real de
//    `api-lavagens` (nomes de campos, envelopes, códigos de status).
//  - Confirmar as rotas/métodos exatos (ex.: PUT vs PATCH em atualizar).
//  - Tratar erros de domínio/validação do servidor (R03–R15) e mapear para a
//    UI, além do 401 já previsto.
//  - Testes de integração ponta a ponta com `VITE_USE_MOCK=false`.
// Enquanto a tarefa 11 não roda, a implementação padrão é o MockLavagemClient
// (ver clientFactory.ts); por isso os métodos abaixo já montam a chamada HTTP
// mas o contrato real só é garantido após a tarefa 11.
// =====================================================================

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
   * TAREFA 11: o parsing do corpo e o mapeamento de erros de validação do
   * servidor ainda serão ajustados ao contrato real.
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
      // TAREFA 11: mapear erros de domínio/validação (R03–R15) ao formato da UI.
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
  // TAREFA 11: confirmar rotas/formatos exatos contra o contrato de api-lavagens.

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
    // R17 (PUT) — TAREFA 11: confirmar PUT vs PATCH no contrato.
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
