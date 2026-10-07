// features/lavagem/ConfirmDeleteDialog.tsx
//
// Diálogo de CONFIRMAÇÃO acessível (Req. 9.2 + Req. 10) usado na exclusão de
// lavagem (tarefa 8.4). Não conhece a regra de exclusão: apenas pergunta
// "tem certeza?" e delega a decisão por callbacks (`onConfirmar`/`onCancelar`).
//
// Acessibilidade (Req. 9.2 / Req. 10.2/10.3):
//  - `role="alertdialog"` + `aria-modal` — anuncia um diálogo modal de alerta
//    (ação destrutiva) a tecnologias assistivas.
//  - `aria-labelledby`/`aria-describedby` ligam o título e a mensagem ao diálogo.
//  - FOCO movido para dentro ao abrir (foca o próprio diálogo) e DEVOLVIDO ao
//    elemento que o abriu (o gatilho) ao fechar.
//  - `Esc` cancela (equivale a "Cancelar") — Req. 9.4.
//  - FOCUS TRAP simples: `Tab`/`Shift+Tab` circulam apenas entre os elementos
//    focáveis do diálogo, sem vazar para o restante da página (sem lib externa).
//
// Botão destrutivo em vermelho (convenção do design); "Cancelar" neutro (slate).

import { useEffect, useRef } from 'react';

export interface ConfirmDeleteDialogProps {
  /** Controla a visibilidade do diálogo (Req. 9.2). */
  aberto: boolean;
  /** Título curto (ex.: "Excluir lavagem"). Ligado por `aria-labelledby`. */
  titulo: string;
  /** Mensagem/explicação. Ligada por `aria-describedby`. */
  mensagem: string;
  /** Confirma a ação destrutiva (Req. 9.3). */
  onConfirmar: () => void;
  /** Cancela sem agir (Req. 9.4). Também disparado por Esc / clique no fundo. */
  onCancelar: () => void;
  /**
   * Quando `true`, a exclusão está em andamento: desabilita o botão confirmar
   * (evita duplo disparo) e indica o progresso. Em runtime vem de
   * `excluir.isPending`.
   */
  confirmando?: boolean;
  /** Rótulo do botão de confirmação (default "Excluir"). */
  rotuloConfirmar?: string;
  /** Rótulo do botão de cancelamento (default "Cancelar"). */
  rotuloCancelar?: string;
}

/** Seletor dos elementos focáveis dentro do diálogo (para o focus trap). */
const FOCAVEIS =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function ConfirmDeleteDialog({
  aberto,
  titulo,
  mensagem,
  onConfirmar,
  onCancelar,
  confirmando = false,
  rotuloConfirmar = 'Excluir',
  rotuloCancelar = 'Cancelar',
}: ConfirmDeleteDialogProps) {
  const dialogoRef = useRef<HTMLDivElement | null>(null);
  // Elemento que detinha o foco antes de abrir — para devolvê-lo ao fechar.
  const focoAnteriorRef = useRef<HTMLElement | null>(null);

  // Move o foco para dentro ao abrir e o devolve ao gatilho ao fechar
  // (Req. 9.2 / Req. 10.3).
  useEffect(() => {
    if (!aberto) return;

    focoAnteriorRef.current = (document.activeElement as HTMLElement) ?? null;
    // Foca o próprio diálogo (tem tabIndex={-1}) para que leitores de tela
    // anunciem título/mensagem e o Esc/Tab sejam capturados de imediato.
    dialogoRef.current?.focus();

    return () => {
      // Devolve o foco ao elemento que abriu o diálogo (o botão "Excluir").
      focoAnteriorRef.current?.focus?.();
    };
  }, [aberto]);

  if (!aberto) return null;

  function aoTeclar(evento: React.KeyboardEvent<HTMLDivElement>) {
    // Esc cancela (Req. 9.4).
    if (evento.key === 'Escape') {
      evento.preventDefault();
      onCancelar();
      return;
    }

    // Focus trap simples: mantém Tab/Shift+Tab dentro do diálogo.
    if (evento.key === 'Tab') {
      const container = dialogoRef.current;
      if (!container) return;
      const focaveis = Array.from(
        container.querySelectorAll<HTMLElement>(FOCAVEIS),
      ).filter((el) => el.offsetParent !== null || el === container);
      if (focaveis.length === 0) {
        // Nada focável além do container: prende o foco nele.
        evento.preventDefault();
        container.focus();
        return;
      }
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      const ativo = document.activeElement as HTMLElement | null;

      if (evento.shiftKey) {
        // Shift+Tab a partir do primeiro (ou do próprio diálogo) → vai ao último.
        if (ativo === primeiro || ativo === container) {
          evento.preventDefault();
          ultimo.focus();
        }
      } else if (ativo === ultimo) {
        // Tab a partir do último → volta ao primeiro.
        evento.preventDefault();
        primeiro.focus();
      }
    }
  }

  return (
    // Fundo (overlay): clicar fora cancela (equivale a "Cancelar"). O diálogo em
    // si para a propagação para não cancelar ao clicar dentro.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onMouseDown={onCancelar}
      data-testid="confirm-delete-overlay"
    >
      <div
        ref={dialogoRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-titulo"
        aria-describedby="confirm-delete-mensagem"
        tabIndex={-1}
        onKeyDown={aoTeclar}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <h2
          id="confirm-delete-titulo"
          className="text-lg font-semibold text-slate-800"
        >
          {titulo}
        </h2>
        <p id="confirm-delete-mensagem" className="mt-2 text-sm text-slate-600">
          {mensagem}
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancelar}
            className="btn-secondary"
          >
            {rotuloCancelar}
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={confirmando}
            aria-busy={confirmando}
            className="btn bg-red-600 text-white shadow-md shadow-red-600/25 hover:bg-red-700"
          >
            {confirmando ? 'Excluindo…' : rotuloConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
