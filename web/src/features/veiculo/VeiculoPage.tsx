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

import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../app/ToastRegion';
import { AppShell, BarraNavegacao } from '../../components/AppShell';
import { PlacaVeiculo } from '../../components/PlacaVeiculo';
import { PainelLavagens } from './PainelLavagens';
import { useVeiculo } from './useLavagens';

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
  const { mostrarToast } = useToast();
  // Guarda contra o duplo disparo do efeito (React.StrictMode em dev): cada
  // navegação tem um `location.key` próprio, e o toast sai uma vez por chave.
  const ultimaChaveComToast = useRef<string | null>(null);

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
    if (ultimaChaveComToast.current === location.key) return;
    ultimaChaveComToast.current = location.key;
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
    location.key,
  ]);

  return (
    // Cabeçalho com usuário logado + "Sair" (Req. 1.5/1.6) vive no AppShell.
    <AppShell>
      {idInvalido ? (
        <p role="alert" className="text-sm text-red-700">
          Veículo inválido. Verifique o endereço e tente novamente.
        </p>
      ) : (
        <main className="flex flex-col gap-6">
          <BarraNavegacao
            voltarPara="/veiculos"
            voltarRotulo="Voltar para a frota"
            itens={[
              { rotulo: 'Frota', to: '/veiculos' },
              { rotulo: `Veículo ${idVeiculo}` },
            ]}
          />
          <CabecalhoVeiculo idVeiculo={idVeiculo} />
          <PainelLavagens idVeiculo={idVeiculo} />
        </main>
      )}
    </AppShell>
  );
}

/**
 * Identificação do veículo (placa Mercosul, marca/modelo, ano e código).
 * Dado de cadastro, somente leitura. O Km Atual (R16) fica no painel.
 */
function CabecalhoVeiculo({ idVeiculo }: { idVeiculo: number }) {
  const { data: veiculo, isLoading, isError } = useVeiculo(idVeiculo);

  if (isLoading) {
    return (
      <div className="card h-28 animate-pulse bg-gradient-to-r from-slate-100 to-white" aria-hidden="true" />
    );
  }
  if (isError || !veiculo) return null;

  const titulo = [veiculo.marca, veiculo.modelo].filter(Boolean).join(' ') || veiculo.descricao;

  return (
    <section
      aria-label="Identificação do veículo"
      className="card flex flex-wrap items-center gap-6 border-l-4 border-l-blue-600 p-6"
    >
      <PlacaVeiculo placa={veiculo.placa} />
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">{titulo}</h2>
        <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          {veiculo.ano && (
            <span className="badge bg-blue-50 text-blue-800 ring-blue-200">Ano {veiculo.ano}</span>
          )}
          <span className="badge bg-slate-100 text-slate-700 ring-slate-200">
            Código {veiculo.idVeiculo}
          </span>
        </p>
      </div>
    </section>
  );
}
