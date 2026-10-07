// components/DateInput.tsx
//
// Input de data acessível e reutilizável (Req. 7.2, 10.2/10.3).
//
// Contrato: o valor trafega em ISO `YYYY-MM-DD` (alinhado à API — Req. 7.2). Para
// acessibilidade e simplicidade, usamos `<input type="date">`: o browser cuida
// da exibição no locale do usuário (DD/MM/AAAA em pt-BR), do teclado e do
// seletor nativo, enquanto o `value`/`onChange` continuam em ISO. Assim o valor
// que entra e sai do formulário é exatamente o do contrato, sem máscara manual.
//
// Acessibilidade:
//  - `label` associado por `htmlFor`/`id`;
//  - em erro, `aria-invalid="true"` + mensagem vinculada por `aria-describedby`
//    e anunciada por leitores de tela (`role="alert"`);
//  - `<input type="date">` nativo preserva a operação por teclado.
//
// Encaminha `ref` (forwardRef) e repassa props nativas (compatível com
// `register` do React Hook Form — tarefa 7).

import { forwardRef, useId, type InputHTMLAttributes } from 'react';

export interface DateInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  /** Rótulo visível, associado ao input por `htmlFor`/`id`. */
  label: string;
  /** Mensagem de erro; quando presente, ativa `aria-invalid` e o vínculo ARIA. */
  error?: string;
  /** Id opcional; se omitido, um id estável é gerado via `useId`. */
  id?: string;
}

/**
 * Campo de data (ISO YYYY-MM-DD) rotulado com estado de erro acessível.
 * Encaminha `ref` para o `<input type="date">` nativo.
 */
export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  function DateInput(
    { label, error, id, required, className, ...inputProps },
    ref,
  ) {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-erro`;
    const temErro = Boolean(error);

    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </label>
        <input
          id={inputId}
          ref={ref}
          type="date"
          required={required}
          aria-invalid={temErro}
          aria-describedby={temErro ? errorId : undefined}
          className={
            className ??
            'rounded border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-100 aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:ring-red-400'
          }
          {...inputProps}
        />
        {temErro && (
          <p id={errorId} role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    );
  },
);
