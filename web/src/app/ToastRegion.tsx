// app/ToastRegion.tsx
//
// Região de toasts (Req. 10.1 — mensagens de sucesso/erro visíveis e
// temporárias, sem bloquear o fluxo).
//
// A API pública (`ToastProvider`/`useToast`) é consumida por `providers.tsx` e
// pelas páginas. Esta região concentra a lógica de empilhar as mensagens, a
// expiração por duração e a região `aria-live="polite"` que as anuncia a
// tecnologias assistivas. A renderização VISUAL de cada mensagem é delegada ao
// componente reutilizável `Toast` (tarefa 4.2, em `components/Toast.tsx`).

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Toast, type ToastSeveridade } from '../components/Toast';

export type { ToastSeveridade };

interface ToastItem {
  id: number;
  mensagem: string;
  severidade: ToastSeveridade;
}

export interface ToastContextValue {
  /** Exibe uma mensagem temporária (Req. 10.1). */
  mostrarToast: (mensagem: string, severidade?: ToastSeveridade) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Duração padrão (ms) até a mensagem desaparecer. */
const DURACAO_PADRAO_MS = 4000;

interface ToastProviderProps {
  children: ReactNode;
  /** Duração até remover a mensagem; injetável para testes. */
  duracaoMs?: number;
}

export function ToastProvider({
  children,
  duracaoMs = DURACAO_PADRAO_MS,
}: ToastProviderProps) {
  const [itens, setItens] = useState<ToastItem[]>([]);
  const proximoId = useRef(1);

  const remover = useCallback((id: number) => {
    setItens((atuais) => atuais.filter((t) => t.id !== id));
  }, []);

  const mostrarToast = useCallback(
    (mensagem: string, severidade: ToastSeveridade = 'info') => {
      const id = proximoId.current++;
      setItens((atuais) => [...atuais, { id, mensagem, severidade }]);
      if (duracaoMs > 0) {
        setTimeout(() => remover(id), duracaoMs);
      }
    },
    [duracaoMs, remover],
  );

  const valor = useMemo<ToastContextValue>(() => ({ mostrarToast }), [mostrarToast]);

  return (
    <ToastContext.Provider value={valor}>
      {children}
      {/* Região anunciada por leitores de tela (Req. 10.1/10.2). */}
      <div
        aria-live="polite"
        aria-atomic="false"
        role="status"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
        data-testid="toast-region"
      >
        {itens.map((t) => (
          <Toast
            key={t.id}
            mensagem={t.mensagem}
            severidade={t.severidade}
            onFechar={() => remover(t.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (ctx === null) {
    throw new Error('useToast deve ser usado dentro de um <ToastProvider>.');
  }
  return ctx;
}
