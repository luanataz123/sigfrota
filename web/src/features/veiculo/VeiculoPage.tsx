// features/veiculo/VeiculoPage.tsx
//
// Tela do veículo (Req. 2/3) — HOST do painel de lavagens. É o destino da rota
// protegida `/veiculos/:idVeiculo` (ver `app/router.tsx`). Suas três
// responsabilidades:
//
//  1. Ler o parâmetro de rota `:idVeiculo` (string) e convertê-lo para number,
//     tratando ausência/NaN de forma segura antes de montar o
//     `<PainelLavagens idVeiculo={...} />`.
//  2. Exibir um cabeçalho com a identificação do usuário logado (nome/e-mail) e
//     um botão "Sair" (logout) — apoia Req. 1.6/1.5. O cadastrador (R08) nunca
//     é campo de formulário; a identidade vem do contexto de auth.
//  3. Exibir um TOAST DE SUCESSO ao voltar de um salvamento/exclusão
//     (R18/R23 / Req. 8.4): quando a navegação chega com `location.state`
//     carregando uma mensagem de sucesso, mostra o toast e LIMPA o state para
//     não repetir ao recarregar/re-renderizar.
//
// Convenção do shape de `location.state` (CONTRATO com a tarefa 8.2):
//
//     interface VeiculoPageState { sucesso?: string }
//
// O formulário (tarefa 8.2) navega de volta assim após incluir/alterar/excluir:
//
//     navigate(`/veiculos/${idVeiculo}`, {
//       state: { sucesso: 'Lavagem incluída com sucesso' },
//     });
//
// `VeiculoPage` detecta `state.sucesso`, chama `mostrarToast(msg, 'sucesso')` e
// substitui a entrada do histórico por uma SEM state (navigate com
// `replace: true`), de modo que um reload/re-render não dispare o toast de novo.

import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { useToast } from '../../app/ToastRegion';
import { PainelLavagens } from './PainelLavagens';

/**
 * Shape do `location.state` aceito por esta página. É o contrato que a tarefa
 * 8.2 (`LavagemFormPage`) segue ao navegar de volta após salvar/excluir
 * (R18/R23). Mantê-lo mínimo evita acoplar a página a detalhes do formulário.
 */
export interface VeiculoPageState {
  /** Mensagem de sucesso a exibir como toast ao voltar ao painel. */
  sucesso?: string;
}

/** Extrai a mensagem de sucesso do state de forma defensiva (state é `unknown`). */
function lerSucesso(state: unknown): string | undefined {
  if (state && typeof state === 'object' && 'sucesso' in state) {
    const valor = (state as { sucesso?: unknown }).sucesso;
    if (typeof valor === 'string' && valor.trim() !== '') {
      return valor;
    }
  }
  return undefined;
}

/** Tela do veículo: cabeçalho do usuário + painel de lavagens (Req. 2/3). */
export function VeiculoPage() {
  const { idVeiculo: idVeiculoParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { usuario, logout } = useAuth();
  const { mostrarToast } = useToast();

  // Converte o parâmetro de rota (string) para number. `Number(undefined)` e
  // `Number('')` resultam em NaN; detectamos isso para evitar montar o painel
  // com um id inválido (que geraria uma query sem sentido).
  const idVeiculo = Number(idVeiculoParam);
  const idInvalido = idVeiculoParam === undefined || !Number.isFinite(idVeiculo);

  // Toast de sucesso ao voltar (R18/R23 / Req. 8.4). Observa `location.state`;
  // ao detectar uma mensagem, exibe o toast e limpa o state (replace) para que
  // um reload/re-render NÃO repita a mensagem.
  const mensagemSucesso = lerSucesso(location.state);
  useEffect(() => {
    if (!mensagemSucesso) return;
    mostrarToast(mensagemSucesso, 'sucesso');
    // Substitui a entrada atual por uma equivalente SEM state, evitando repetir
    // o toast em re-renders futuros ou ao recarregar a mesma rota.
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [
    mensagemSucesso,
    mostrarToast,
    navigate,
    location.pathname,
    location.search,
  ]);

  function aoSair() {
    logout(); // Req. 1.5 — limpa a sessão; RequireAuth redireciona ao login.
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6">
      {/* Cabeçalho: identificação do usuário logado + sair (Req. 1.5/1.6). */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <h1 className="text-xl font-bold text-slate-900">SIG Frota — Lavagens</h1>
        {usuario && (
          <div className="flex items-center gap-3 text-sm">
            <span className="flex flex-col text-right leading-tight">
              <span className="font-medium text-slate-800">{usuario.nome}</span>
              <span className="text-xs text-slate-500">{usuario.email}</span>
            </span>
            <button
              type="button"
              onClick={aoSair}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              Sair
            </button>
          </div>
        )}
      </header>

      {/* Corpo: o painel de lavagens, ou um aviso se o id de rota for inválido. */}
      <main>
        {idInvalido ? (
          <p role="alert" className="text-sm text-red-700">
            Veículo inválido. Verifique o endereço e tente novamente.
          </p>
        ) : (
          <PainelLavagens idVeiculo={idVeiculo} />
        )}
      </main>
    </div>
  );
}
