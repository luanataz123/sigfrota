// components/Toast.tsx
//
// Componente de toast DEFINITIVO (Req. 10.1 — mensagem temporária, visível, que
// não bloqueia o fluxo). É a renderização visual reutilizada pela região de
// toasts (`app/ToastRegion.tsx`), que cuida de empilhar e expirar as mensagens.
//
// Este componente é puramente de apresentação: recebe a mensagem, a severidade
// e um callback opcional de fechamento, e não gerencia timers nem estado. Isso
// mantém a lógica de duração/aria-live concentrada na região.
//
// Estilo Tailwind consistente com os demais componentes: slate para info,
// green para sucesso, red para erro.

/** Severidade visual da mensagem de toast. */
export type ToastSeveridade = 'sucesso' | 'erro' | 'info';

export interface ToastProps {
  /** Texto da mensagem exibida. */
  mensagem: string;
  /** Severidade da mensagem; controla as cores. Default: "info". */
  severidade?: ToastSeveridade;
  /** Callback opcional ao fechar; quando presente, exibe um botão "×". */
  onFechar?: () => void;
}

/** Classes utilitárias por severidade (borda/fundo/texto). */
const CLASSES_SEVERIDADE: Record<ToastSeveridade, string> = {
  sucesso: 'border-emerald-300 bg-emerald-50 text-emerald-900 border-l-4 border-l-emerald-500',
  erro: 'border-red-300 bg-red-50 text-red-900 border-l-4 border-l-red-500',
  info: 'border-slate-300 bg-white text-slate-800 border-l-4 border-l-blue-500',
};

/**
 * Toast visual. Renderiza um cartão colorido com a mensagem e, se `onFechar`
 * for informado, um botão de dispensa acessível.
 */
export function Toast({ mensagem, severidade = 'info', onFechar }: ToastProps) {
  return (
    <div
      data-severidade={severidade}
      className={`pointer-events-auto flex min-w-[18rem] items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg shadow-slate-900/10 ${CLASSES_SEVERIDADE[severidade]}`}
    >
      <span className="flex-1">{mensagem}</span>
      {onFechar && (
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="shrink-0 rounded px-1 leading-none opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </div>
  );
}
