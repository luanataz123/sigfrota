// auth/handler401.ts
//
// Peça reutilizável e testável para o tratamento de 401 global (Req. 1.4).
//
// O `HttpLavagemClient` recebe um callback `aoNaoAutorizado` (ver
// `api/HttpLavagemClient.ts` e `ClientFactoryOptions` em `api/clientFactory.ts`)
// que é disparado quando a API responde 401 (token expirado/ausente). O que
// falta é a LIGAÇÃO entre esse callback e o encerramento de sessão do
// `AuthProvider`.
//
// Esta função é o ponto de ligação: dado o `logout()` do AuthProvider (e,
// opcionalmente, uma ação de redirecionamento para o login), devolve um handler
// adequado ao `aoNaoAutorizado`. Mantê-la como função pura e sem dependência de
// React a torna trivialmente testável e reaproveitável onde o client for criado
// (a montagem de router/providers acontece na tarefa 3.3).
//
// Uso previsto na tarefa 3.3 (ilustrativo):
//
//   const client = criarLavagemClient({
//     obterToken,
//     aoNaoAutorizado: criarHandler401(logout, () => navigate('/login', { replace: true })),
//   });
//
// Garantias de robustez (Req. 1.4 — "sem travar a aplicação"):
//  - sempre tenta encerrar a sessão (logout);
//  - se o redirecionamento falhar, o erro é contido para não propagar e travar
//    o fluxo da requisição que recebeu o 401.

/** Encerra a sessão local (tipicamente `useAuth().logout`). */
export type Logout = () => void;

/** Redireciona para a tela de login (ex.: `navigate('/login')`). Opcional. */
export type RedirecionarLogin = () => void;

/**
 * Cria o handler de 401 que liga a resposta não autorizada da API (Req. 1.4) ao
 * encerramento de sessão do AuthProvider, com redirecionamento opcional ao
 * login. Retorna uma função compatível com `aoNaoAutorizado` do client HTTP.
 */
export function criarHandler401(
  logout: Logout,
  redirecionarLogin?: RedirecionarLogin,
): () => void {
  return () => {
    // Req. 1.4: encerra a sessão. Qualquer falha aqui não deve travar a app.
    try {
      logout();
    } catch {
      // Contém o erro: encerrar a sessão nunca deve derrubar a requisição.
    }

    if (redirecionarLogin) {
      try {
        redirecionarLogin();
      } catch {
        // Redirecionamento é "melhor esforço"; o RequireAuth já protege as
        // rotas, então a app continua utilizável mesmo se isto falhar.
      }
    }
  };
}
