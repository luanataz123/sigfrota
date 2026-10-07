// features/veiculo/PainelLavagens.tsx
//
// Painel de lavagens do veículo (Req. 2) — a região de listagem na tela do
// veículo. Monta, a partir dos hooks de query (tarefa 5.1 + useTipos):
//
//  - Km Atual read-only no topo (R16 / Req. 2.8): referência de quilometragem
//    do veículo, formatada com `formatarKm`, claramente rotulada como somente
//    leitura (aria-readonly + "(somente leitura)").
//  - Botão "Incluir Lavagem" (R22 / Req. 3.1): navega para
//    `/veiculos/:idVeiculo/lavagens/nova` (modo inclusão).
//  - Estado de carregamento (Req. 2.6): `Spinner` enquanto a lista carrega.
//  - Estado de erro (Req. 2.7): `ErrorState` com "tentar novamente" que
//    dispara o `refetch` da query de lavagens.
//  - Estado vazio (Req. 2.5): `EmptyState` com CTA para incluir a primeira
//    lavagem.
//  - A lista: tabela acessível (cabeçalhos `th scope="col"`) de `LavagemRow`,
//    já ordenada por data pelo hook (R20 / Req. 2.2).
//
// A descrição do tipo de cada linha (R20 / Req. 2.3) é resolvida por um mapa
// `idTipoLavagem → descrição` montado de `useTipos`; enquanto os tipos ainda
// carregam, as linhas exibem um fallback discreto (sem bloquear a lista).

import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Spinner } from '../../components/Spinner';
import { formatarKm } from '../../lib/format';
import { LavagemRow } from './LavagemRow';
import { useLavagens, useVeiculo } from './useLavagens';
import { mapaDeTipos, useTipos } from './useTipos';

export interface PainelLavagensProps {
  /** Veículo cujo histórico de lavagens é exibido. */
  idVeiculo: number;
}

/** Painel de lavagens de um veículo (Req. 2). */
export function PainelLavagens({ idVeiculo }: PainelLavagensProps) {
  const navigate = useNavigate();

  const lavagensQuery = useLavagens(idVeiculo);
  const veiculoQuery = useVeiculo(idVeiculo);
  const tiposQuery = useTipos();

  const tipos = mapaDeTipos(tiposQuery.data);

  /** Abre o formulário em modo inclusão (R22 / Req. 3.1/3.2). */
  function irParaInclusao() {
    navigate(`/veiculos/${idVeiculo}/lavagens/nova`);
  }

  return (
    <section aria-labelledby="painel-lavagens-titulo" className="flex flex-col gap-4">
      {/* Cabeçalho: título + Km Atual read-only + botão incluir */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2
            id="painel-lavagens-titulo"
            className="text-lg font-semibold text-slate-900"
          >
            Lavagens do veículo
          </h2>
          {/* Km Atual read-only (R16 / Req. 2.8). Rotulado como somente leitura. */}
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-700">Km Atual:</span>{' '}
            <output
              aria-readonly="true"
              className="font-semibold tabular-nums text-slate-900"
            >
              {veiculoQuery.isSuccess ? formatarKm(veiculoQuery.data.kmAtual) : '—'}
            </output>{' '}
            <span className="text-xs text-slate-500">(somente leitura)</span>
          </p>
        </div>

        <button
          type="button"
          onClick={irParaInclusao}
          className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          Incluir Lavagem
        </button>
      </header>

      {/* Corpo: loading / erro / vazio / lista */}
      {lavagensQuery.isLoading ? (
        <Spinner label="Carregando lavagens..." />
      ) : lavagensQuery.isError ? (
        <ErrorState
          mensagem="Não foi possível carregar as lavagens deste veículo."
          onRetry={() => {
            void lavagensQuery.refetch();
          }}
        />
      ) : lavagensQuery.data && lavagensQuery.data.length > 0 ? (
        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">
              Histórico de lavagens do veículo, ordenado por data.
            </caption>
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200">
                <th scope="col" className="px-4 py-2 text-sm font-semibold text-slate-700">
                  Tipo de Lavagem
                </th>
                <th scope="col" className="px-4 py-2 text-sm font-semibold text-slate-700">
                  Data
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 text-right text-sm font-semibold text-slate-700"
                >
                  Odômetro (Km)
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 text-right text-sm font-semibold text-slate-700"
                >
                  Valor
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 text-right text-sm font-semibold text-slate-700"
                >
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lavagensQuery.data.map((lavagem) => (
                <LavagemRow
                  key={lavagem.idLavagem}
                  lavagem={lavagem}
                  tipos={tipos}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          titulo="Nenhuma lavagem registrada"
          mensagem="Este veículo ainda não tem lavagens. Comece incluindo a primeira."
          acaoLabel="Incluir primeira lavagem"
          onAction={irParaInclusao}
        />
      )}
    </section>
  );
}
