// auth/useAuth.ts
//
// Hook de acesso ao contexto de autenticação (Req. 1). Lança um erro claro
// quando usado fora do `AuthProvider`, para falhar cedo em erros de montagem
// da árvore de componentes.

import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from './AuthProvider';

export function useAuth(): AuthContextValue {
  const contexto = useContext(AuthContext);
  if (contexto === null) {
    throw new Error('useAuth deve ser usado dentro de um <AuthProvider>.');
  }
  return contexto;
}
