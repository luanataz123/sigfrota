// components/EmptyState.tsx
//
// Estado vazio com orientação e call-to-action (Req. 2.5 — veículo sem
// lavagens: orientar a incluir a primeira).
//
// Usado pelo painel de lavagens (tarefa 5). Pode receber um `onAction` + rótulo
// (renderiza um botão) OU um slot `action` livre (ex.: um `<Link>` de rota),
// mantendo o componente flexível sem acoplar a navegação.

import type { ReactNode } from 'react';

export interface EmptyStateProps {
  /** Título curto do estado vazio. Default: "Nada por aqui ainda". */
  titulo?: string;
  /** Mensagem orientando o próximo passo. */
  mensagem: string;
  /** Rótulo do botão de ação (ex.: "Incluir primeira lavagem"). */
  acaoLabel?: string;
  /** Callback do botão de ação; usado quando `acaoLabel` é informado. */
  onAction?: () => void;
  /** Slot de ação livre (ex.: um `<Link>`); alternativa a `onAction`. */
  action?: ReactNode;
}

/**
 * Estado vazio acessível: título, mensagem clara e um CTA opcional (botão via
 * `onAction`/`acaoLabel` ou slot `action`).
 */
export function EmptyState({
  titulo = 'Nada por aqui ainda',
  mensagem,
  acaoLabel,
  onAction,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-2xl"
      >
        🚿
      </span>
      <h3 className="text-base font-semibold text-slate-800">{titulo}</h3>
      <p className="max-w-sm text-sm text-slate-600">{mensagem}</p>
      {action ??
        (acaoLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="btn-primary mt-1"
          >
            {acaoLabel}
          </button>
        ) : null)}
    </div>
  );
}
