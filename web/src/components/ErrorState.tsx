// components/ErrorState.tsx
//
// Estado de erro com mensagem e ação "tentar novamente" (Req. 2.7 — busca
// falhou: exibir mensagem de erro + ação de nova tentativa).
//
// Acessibilidade: a raiz usa `role="alert"` para que o erro seja anunciado por
// leitores de tela; o botão de nova tentativa é operável por teclado.
// Estilo Tailwind na paleta de erro (red), consistente com os demais componentes.

export interface ErrorStateProps {
  /** Título curto do erro. Default: "Algo deu errado". */
  titulo?: string;
  /** Mensagem descrevendo o erro. */
  mensagem: string;
  /** Rótulo do botão de nova tentativa. Default: "Tentar novamente". */
  acaoLabel?: string;
  /** Callback acionado ao clicar em "tentar novamente". */
  onRetry?: () => void;
}

/**
 * Estado de erro acessível: título, mensagem e um botão opcional de nova
 * tentativa (renderizado apenas quando `onRetry` é informado).
 */
export function ErrorState({
  titulo = 'Algo deu errado',
  mensagem,
  acaoLabel = 'Tentar novamente',
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center"
    >
      <h3 className="text-base font-semibold text-red-800">{titulo}</h3>
      <p className="max-w-sm text-sm text-red-700">{mensagem}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn-danger mt-1"
        >
          {acaoLabel}
        </button>
      )}
    </div>
  );
}
