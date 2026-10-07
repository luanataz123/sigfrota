// components/Spinner.tsx
//
// Indicador de carregamento acessível (Req. 2.6 — lista carregando; Req. 10.1).
//
// Acessibilidade:
//  - a raiz usa `role="status"`, anunciada por leitores de tela;
//  - o rótulo textual (`label`) é lido por tecnologias assistivas via
//    `.sr-only`, enquanto o círculo girando é apenas visual (`aria-hidden`).
//
// Estilo Tailwind consistente com os demais componentes (paleta slate).

export interface SpinnerProps {
  /** Texto anunciado por leitores de tela. Default: "Carregando...". */
  label?: string;
  /** Tamanho do círculo (classe utilitária Tailwind). Default: médio. */
  tamanho?: 'pequeno' | 'medio' | 'grande';
  /** Classe extra opcional para o contêiner. */
  className?: string;
}

const TAMANHOS: Record<NonNullable<SpinnerProps['tamanho']>, string> = {
  pequeno: 'h-4 w-4 border-2',
  medio: 'h-6 w-6 border-2',
  grande: 'h-10 w-10 border-4',
};

/**
 * Spinner de carregamento. Renderiza uma região `role="status"` com o rótulo
 * acessível e um círculo animado puramente visual.
 */
export function Spinner({
  label = 'Carregando...',
  tamanho = 'medio',
  className,
}: SpinnerProps) {
  return (
    <div
      role="status"
      className={className ?? 'flex items-center justify-center gap-2 text-slate-600'}
    >
      <span
        aria-hidden="true"
        className={`inline-block animate-spin rounded-full border-slate-300 border-t-blue-600 ${TAMANHOS[tamanho]}`}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
