// auth/AuthProvider.tsx
//
// Contexto React de sessão (Requisito 1). Mantém o estado da sessão —
// token JWT e identificação do usuário (nome/e-mail) — e expõe os métodos
// `login`/`logout`. No MVP a autenticação é abstraída atrás de um
// `AuthAdapter` mockável (nota do Req. 1 e §"Auth abstraída" do design): a
// integração real com Cognito pertence ao spec `infra-base`.
//
// Decisões de design relevantes:
//  - Token em MEMÓRIA, não em localStorage (§"Segurança no cliente"): o JWT
//    vive apenas no estado do provider enquanto a aba está aberta.
//  - O cadastrador (R08) nunca vem do formulário; a identidade do usuário é
//    derivada do token/adapter e exposta para o cabeçalho (Req. 1.6).
//  - A camada de client HTTP acessa o token por um getter desacoplado
//    (`obterToken`) em vez de depender diretamente deste contexto (Req. 1.3).

import {
  createContext,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/** Identificação do usuário logado, exibida no cabeçalho (Req. 1.6). */
export interface Usuario {
  nome: string;
  email: string;
}

/** Credenciais informadas no login (Req. 1.2). */
export interface Credenciais {
  email: string;
  senha: string;
}

/** Sessão emitida pelo adapter de autenticação quando o login tem sucesso. */
export interface Sessao {
  /** JWT da sessão, anexado a cada requisição à API (Req. 1.3). */
  token: string;
  usuario: Usuario;
}

/**
 * Contrato de autenticação mockável (Req. 1, nota). No MVP, um adapter em
 * memória valida credenciais e devolve a sessão; em produção, um adapter
 * Cognito respeita o mesmo contrato sem alterar o provider/UI.
 */
export interface AuthAdapter {
  autenticar(credenciais: Credenciais): Promise<Sessao>;
}

/** Valor exposto pelo contexto de autenticação. */
export interface AuthContextValue {
  /** Usuário logado, ou `null` quando não há sessão (Req. 1.6). */
  usuario: Usuario | null;
  /** `true` quando existe uma sessão válida (token presente). */
  autenticado: boolean;
  /** Autentica e armazena o token da sessão em caso de sucesso (Req. 1.2). */
  login: (credenciais: Credenciais) => Promise<void>;
  /** Limpa a sessão local (Req. 1.5). */
  logout: () => void;
  /**
   * Getter do token atual para a camada de client (Req. 1.3). Retorna `null`
   * quando não há sessão. Fica estável entre renders (não dispara efeitos).
   */
  obterToken: () => string | null;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
  /** Adapter de autenticação (mockável). Req. 1 (nota). */
  adapter: AuthAdapter;
  /**
   * Sessão inicial opcional — útil em testes para montar já autenticado.
   * Em produção começa `null` (não autenticado → RequireAuth redireciona).
   */
  sessaoInicial?: Sessao | null;
}

export function AuthProvider({
  children,
  adapter,
  sessaoInicial = null,
}: AuthProviderProps) {
  const [sessao, setSessao] = useState<Sessao | null>(sessaoInicial);

  // Mantém o token também em uma ref para que `obterToken` seja estável e
  // reflita o valor mais recente sem recriar a função a cada render (Req. 1.3).
  const tokenRef = useRef<string | null>(sessaoInicial?.token ?? null);
  tokenRef.current = sessao?.token ?? null;

  const login = useCallback(
    async (credenciais: Credenciais) => {
      // Req. 1.2: autentica via adapter e, no sucesso, armazena o token.
      const nova = await adapter.autenticar(credenciais);
      setSessao(nova);
    },
    [adapter],
  );

  const logout = useCallback(() => {
    // Req. 1.5: limpa a sessão local (token sai da memória).
    setSessao(null);
  }, []);

  const obterToken = useCallback(() => tokenRef.current, []);

  const valor = useMemo<AuthContextValue>(
    () => ({
      usuario: sessao?.usuario ?? null,
      autenticado: sessao !== null,
      login,
      logout,
      obterToken,
    }),
    [sessao, login, logout, obterToken],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}
