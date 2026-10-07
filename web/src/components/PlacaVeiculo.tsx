// components/PlacaVeiculo.tsx
//
// Identificação visual do veículo: placa no padrão Mercosul (faixa azul
// "BRASIL" + caracteres em destaque). Puramente de apresentação; o texto da
// placa fica acessível (aria-label) e a faixa é decorativa.

export interface PlacaVeiculoProps {
  placa?: string;
  /** Tamanho: `normal` (cabeçalho do veículo) ou `pequeno` (cartões). */
  tamanho?: 'normal' | 'pequeno';
}

/** Placa Mercosul (formato contínuo, ex.: ABC1D23). Não renderiza sem placa. */
export function PlacaVeiculo({ placa, tamanho = 'normal' }: PlacaVeiculoProps) {
  if (!placa) return null;
  const pequeno = tamanho === 'pequeno';

  return (
    <span
      role="img"
      aria-label={`Placa ${placa}`}
      className={`inline-flex flex-col overflow-hidden rounded-md border-2 border-slate-800 bg-white shadow-sm ${
        pequeno ? 'w-24' : 'w-36'
      }`}
    >
      <span
        aria-hidden="true"
        className={`bg-blue-700 text-center font-bold uppercase tracking-widest text-white ${
          pequeno ? 'text-[7px] leading-3' : 'text-[9px] leading-4'
        }`}
      >
        Brasil
      </span>
      <span
        aria-hidden="true"
        className={`text-center font-mono font-bold tracking-wider text-slate-900 ${
          pequeno ? 'py-0.5 text-base' : 'py-1 text-2xl'
        }`}
      >
        {placa}
      </span>
    </span>
  );
}
