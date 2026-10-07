// Utilitários HTTP das Lambdas (API Gateway HTTP API, payload 2.0).

/** Recorte do evento do API Gateway HTTP API (payload 2.0) usado aqui. */
export interface EventoHttp {
  routeKey: string;
  pathParameters?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext?: {
    authorizer?: { jwt?: { claims?: Record<string, unknown> } };
  };
}

export interface RespostaHttp {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/** Corpo máximo aceito (uma lavagem tem bem menos que isso). */
const TAMANHO_MAXIMO_CORPO = 10_000;

/** Erro que vira resposta HTTP com status e mensagem para o usuário. */
export class ErroHttp extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
    readonly erros?: Record<string, string>,
  ) {
    super(mensagem);
    this.name = 'ErroHttp';
  }
}

const CABECALHOS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

export function responder(status: number, corpo?: unknown): RespostaHttp {
  return {
    statusCode: status,
    headers: CABECALHOS,
    body: corpo === undefined ? '' : JSON.stringify(corpo),
  };
}

/** Lê um parâmetro de rota inteiro e positivo. */
export function inteiroDaRota(evento: EventoHttp, nome: string): number {
  const bruto = evento.pathParameters?.[nome] ?? '';
  if (!/^\d{1,9}$/.test(bruto) || Number(bruto) <= 0) {
    throw new ErroHttp(400, `Parâmetro ${nome} inválido.`);
  }
  return Number(bruto);
}

/** Lê o corpo JSON (objeto) da requisição. */
export function corpoJson(evento: EventoHttp): Record<string, unknown> {
  if (!evento.body) throw new ErroHttp(400, 'Corpo da requisição ausente.');
  const texto = evento.isBase64Encoded
    ? Buffer.from(evento.body, 'base64').toString('utf8')
    : evento.body;
  if (texto.length > TAMANHO_MAXIMO_CORPO) {
    throw new ErroHttp(400, 'Corpo da requisição muito grande.');
  }
  let valor: unknown;
  try {
    valor = JSON.parse(texto);
  } catch {
    throw new ErroHttp(400, 'Corpo da requisição não é um JSON válido.');
  }
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new ErroHttp(400, 'Corpo da requisição deve ser um objeto JSON.');
  }
  return valor as Record<string, unknown>;
}

/**
 * R08: identificação do usuário vem do `sub` do JWT validado pelo authorizer,
 * nunca do corpo da requisição.
 */
export function subDoToken(evento: EventoHttp): string {
  const sub = evento.requestContext?.authorizer?.jwt?.claims?.sub;
  if (typeof sub !== 'string' || sub.length === 0) {
    throw new ErroHttp(401, 'Usuário não identificado.');
  }
  return sub;
}

export type Rota = (evento: EventoHttp) => Promise<RespostaHttp>;

/**
 * Cria o handler que despacha pelo `routeKey` e converte erros em respostas.
 * Logs só com nome do erro e rota: sem token, corpo, e-mail ou CNPJ (LGPD).
 */
export function criarDespachante(rotas: Record<string, Rota>) {
  return async (evento: EventoHttp): Promise<RespostaHttp> => {
    const rota = rotas[evento.routeKey];
    if (!rota) return responder(404, { mensagem: 'Rota não encontrada.' });
    try {
      return await rota(evento);
    } catch (erro) {
      if (erro instanceof ErroHttp) {
        return responder(erro.status, {
          mensagem: erro.message,
          ...(erro.erros ? { erros: erro.erros } : {}),
        });
      }
      console.error(
        JSON.stringify({
          mensagem: 'Falha inesperada',
          rota: evento.routeKey,
          erro: (erro as { name?: string } | null)?.name ?? 'Erro',
        }),
      );
      return responder(500, { mensagem: 'Erro interno. Tente novamente.' });
    }
  };
}
