// auth/RequireAuth.tsx
//
// Guard de rota (Req. 1.1). Quando um usuário não autenticado tenta acessar
// uma rota protegida, redireciona para `/login`, preservando o destino
// pretendido em `location.state.from` para um possível retorno pós-login.
// A rota `/login` é pública; `/veiculos/:idVeiculo` e as de formulário são
// protegidas por este componente (ver tabela de rotas no design).

import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './useAuth';

interface RequireAuthProps {
  children: ReactNode;
}

export function RequireAuth({ children }: RequireAuthProps) {
  const { autenticado } = useAuth();
  const location = useLocation();

  if (!autenticado) {
    // Req. 1.1: usuário não autenticado → tela de login.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
