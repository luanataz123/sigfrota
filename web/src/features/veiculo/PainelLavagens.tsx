// features/veiculo/PainelLavagens.tsx
//
// Painel de lavagens do veículo (Req. 2) — a região de listagem na tela do
// veículo. Monta, a partir dos hooks de query (useLavagens, useVeiculo,
// useTipos, usePostos):
//
//  - Km Atual read-only no topo (R16 / Req. 2.8), rotulado como somente leitura.
//  - Botão "Incluir Lavagem" (R22 / Req. 3.1): `/veiculos/:idVeiculo/lavagens/nova`.
//  - Resumo do histórico: total de lavagens, gasto total e última lavagem.
//  - Estados: carregando (Req. 2.6), erro com "tentar novamente" (Req. 2.7) e
//    vazio com CTA (Req. 2.5).
//  - A lista: tabela acessível (cabeçalhos `th scope="col"`) de `LavagemRow`,
//    já ordenada por data pelo hook (R20 / Req. 2.2).

import { useNavigate } from 'react-router-dom';
import type { Lavagem } from '../../api/types';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Spinner } from '../../components/Spinner';
import { formatarKm, formatarMoeda, isoParaBr } from '../../lib/format';
import { usePostos } from '../lavagem/usePostos';
import { LavagemRow } from './LavagemRow';
import { useLavagens, useVeiculo } from './useLavagens';
import { mapaDeTipos, useTipos } from './useTipos';

export interface PainelLavagensProps {
  /** Veículo cujo histórico de lavagens é exibido. */
  idVeiculo: number;
}

const CLASSE_TH = 'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500';

/** Cartão de indicador do resumo. */
function Indicador({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="card flex flex-col gap-1 px-5 py-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{rotulo}</dt>
      <dd className="text-2xl font-bold tabular-nums tracking-tight text-slate-900">{valor}</dd>
    </div>
  );
}

/** Resumo do histórico (lista já ordenada por data ASC). */
function ResumoLavagens({ lavagens }: { lavagens: Lavagem[] }) {
  const gasto = lavagens.reduce((soma, l) => soma + (l.vlLavagem ?? 0), 0);
  const ultima = lavagens[lavagens.length - 1];
  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Resumo do histórico">
      <Indicador rotulo="Lavagens" valor={String(lavagens.length)} />
      <Indicador rotulo="Gasto total" valor={formatarMoeda(gasto)} />
      <Indicador rotulo="Última lavagem" valor={ultima ? isoParaBr(ultima.dtLavagem) : '—'} />
    </dl>
  );
}

/** Painel de lavagens de um veículo (Req. 2). */
export function PainelLavagens({ idVeiculo }: PainelLavagensProps) {
  const navigate = useNavigate();

  const lavagensQuery = useLavagens(idVeiculo);
  const veiculoQuery = useVeiculo(idVeiculo);
  const tiposQuery = useTipos();
  const postosQuery = usePostos();

  const tipos = mapaDeTipos(tiposQuery.data);
  const postos = new Map((postosQuery.data ?? []).map((p) => [p.idPosto, p.nome]));

  /** Abre o formulário em modo inclusão (R22 / Req. 3.1/3.2). */
  function irParaInclusao() {
    navigate(`/veiculos/${idVeiculo}/lavagens/nova`);
  }

  return (
    <section aria-labelledby="painel-lavagens-titulo" className="flex flex-col gap-5">
      {/* Cabeçalho: título + Km Atual read-only + botão incluir */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2
            id="painel-lavagens-titulo"
            className="text-xl font-bold tracking-tight text-slate-900"
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

        <button type="button" onClick={irParaInclusao} className="btn-primary">
          <span aria-hidden="true" className="text-lg leading-none">＋</span>
          Incluir Lavagem
        </button>
      </header>

      {lavagensQuery.isSuccess && lavagensQuery.data.length > 0 && (
        <ResumoLavagens lavagens={lavagensQuery.data} />
      )}

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
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                Histórico de lavagens do veículo, ordenado por data.
              </caption>
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200">
                  <th scope="col" className={CLASSE_TH}>
                    Tipo de Lavagem
                  </th>
                  <th scope="col" className={CLASSE_TH}>
                    Data
                  </th>
                  <th scope="col" className={CLASSE_TH}>
                    Local
                  </th>
                  <th scope="col" className={`${CLASSE_TH} text-right`}>
                    Odômetro (Km)
                  </th>
                  <th scope="col" className={`${CLASSE_TH} text-right`}>
                    Valor
                  </th>
                  <th scope="col" className={`${CLASSE_TH} text-right`}>
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
                    postos={postos}
                  />
                ))}
              </tbody>
            </table>
          </div>
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
