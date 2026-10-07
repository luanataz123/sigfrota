// app/router.tsx
//
// Define as rotas do módulo conforme a tabela "Roteamento" do design:
//
//   | Rota                                      | Componente       | Modo     |
//   | /login                                    | LoginPage        | público  |
//   | /veiculos/:idVeiculo                       | VeiculoPage      | protegido|
//   | /veiculos/:idVeiculo/lavagens/nova         | LavagemFormPage  | inclusão |
//   | /veiculos/:idVeiculo/lavagens/:idLavagem   | LavagemFormPage  | edição   |
//
// As rotas protegidas são encapsuladas por `RequireAuth` (Req. 1.1): usuário
// não autenticado é redirecionado para `/login`. A raiz "/" redireciona para o
// veículo 101 (demo) — o `RequireAuth` dessa rota garante o desvio ao login
// quando não há sessão.
//
// NOTA: VeiculoPage (tarefa 5.3) e LavagemFormPage (tarefa 8.2) já são as
// implementações reais. A `LavagemFormPage` lê os parâmetros de rota ela mesma
// e deriva o modo (inclusão/edição) pela presença de `:idLavagem` — por isso o
// router não passa prop de modo. O `<Routes>` fica aqui para que o
// `providers.tsx` possa envolvê-lo com Router/Query/Auth/Toast.

import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from '../auth/LoginPage';
import { RequireAuth } from '../auth/RequireAuth';
import { VeiculoPage } from '../features/veiculo/VeiculoPage';
import { LavagemFormPage } from '../features/lavagem/LavagemFormPage';

/** Veículo usado na demo ao acessar a raiz "/" (Req. 11.3). */
export const ID_VEICULO_DEMO = 101;

export function AppRoutes() {
  return (
    <Routes>
      {/* Raiz → veículo demo; RequireAuth dessa rota desvia ao login se preciso. */}
      <Route
        path="/"
        element={<Navigate to={`/veiculos/${ID_VEICULO_DEMO}`} replace />}
      />

      {/* Público (Req. 1.1). */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protegido: tela do veículo (R16, R19–R23). */}
      <Route
        path="/veiculos/:idVeiculo"
        element={
          <RequireAuth>
            <VeiculoPage />
          </RequireAuth>
        }
      />

      {/* Protegido: formulário em modo inclusão (R22). A LavagemFormPage deriva
          o modo pela AUSÊNCIA de `:idLavagem`. */}
      <Route
        path="/veiculos/:idVeiculo/lavagens/nova"
        element={
          <RequireAuth>
            <LavagemFormPage />
          </RequireAuth>
        }
      />

      {/* Protegido: formulário em modo edição (R21). A LavagemFormPage deriva o
          modo pela PRESENÇA de `:idLavagem`. */}
      <Route
        path="/veiculos/:idVeiculo/lavagens/:idLavagem"
        element={
          <RequireAuth>
            <LavagemFormPage />
          </RequireAuth>
        }
      />

      {/* Fallback: qualquer rota desconhecida volta para a raiz. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
