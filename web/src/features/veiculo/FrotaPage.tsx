// features/veiculo/FrotaPage.tsx
//
// Tela inicial pós-login (`/veiculos`): lista a frota para o atendente
// escolher o veículo cujas lavagens quer ver/incluir. Cada cartão identifica o
// veículo (placa, marca/modelo, ano) e mostra o Km Atual (R16, só leitura).
// Busca por placa, marca ou modelo, no cliente (frota pequena).

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { ErrorState } from '../../components/ErrorState';
import { PlacaVeiculo } from '../../components/PlacaVeiculo';
import { Spinner } from '../../components/Spinner';
import { formatarKm } from '../../lib/format';
import { useVeiculos } from './useLavagens';

/** Normaliza para busca sem acento e sem diferença de caixa. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function FrotaPage() {
  const veiculosQuery = useVeiculos();
  const [busca, setBusca] = useState('');

  const termo = normalizar(busca.trim());
  const veiculos = (veiculosQuery.data ?? []).filter(
    (v) =>
      termo === '' ||
      normalizar(`${v.placa ?? ''} ${v.marca ?? ''} ${v.modelo ?? ''} ${v.descricao}`).includes(termo),
  );

  return (
    <AppShell>
      <section aria-labelledby="frota-titulo" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="frota-titulo" className="text-2xl font-bold tracking-tight text-slate-900">
              Frota
            </h2>
            <p className="text-sm text-slate-600">
              Escolha um veículo para consultar ou incluir lavagens.
            </p>
          </div>
          <div className="w-full sm:w-80">
            <label htmlFor="busca-veiculo" className="sr-only">
              Buscar veículo por placa, marca ou modelo
            </label>
            <input
              id="busca-veiculo"
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por placa, marca ou modelo"
              className="input"
            />
          </div>
        </div>

        {veiculosQuery.isLoading ? (
          <Spinner label="Carregando frota..." />
        ) : veiculosQuery.isError ? (
          <ErrorState
            mensagem="Não foi possível carregar a frota."
            onRetry={() => void veiculosQuery.refetch()}
          />
        ) : veiculos.length === 0 ? (
          <p role="status" className="card px-6 py-10 text-center text-sm text-slate-600">
            Nenhum veículo encontrado para “{busca}”.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {veiculos.map((v) => (
              <li key={v.idVeiculo}>
                <Link
                  to={`/veiculos/${v.idVeiculo}`}
                  className="card group flex h-full flex-col gap-4 p-5 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-900/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <PlacaVeiculo placa={v.placa} tamanho="pequeno" />
                    {v.ano && (
                      <span className="badge bg-slate-100 text-slate-600 ring-slate-200">
                        {v.ano}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-900">
                      {v.marca} {v.modelo}
                    </p>
                    <p className="text-sm text-slate-500">Código {v.idVeiculo}</p>
                  </div>
                  <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
                    <span className="text-slate-500">
                      Km atual{' '}
                      <strong className="tabular-nums text-slate-800">{formatarKm(v.kmAtual)}</strong>
                    </span>
                    <span className="font-semibold text-blue-700 transition group-hover:translate-x-0.5">
                      Ver lavagens →
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
