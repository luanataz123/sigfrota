// components/Field.tsx
//
// Input de texto genérico, acessível e reutilizável (Req. 10.2/10.3).
//
// Acessibilidade:
//  - `label` associado ao input por `htmlFor`/`id`;
//  - em erro, o input recebe `aria-invalid="true"` e a mensagem é vinculada por
//    `aria-describedby`, sendo anunciada por leitores de tela (`role="alert"`);
//  - usa o `<input>` nativo, preservando toda a navegação/operação por teclado.
//
// Integração com React Hook Form (tarefa 7): o componente encaminha `ref`
// (forwardRef) e repassa as demais props nativas, então o retorno de
// `register('campo')` (name/onChange/onBlur/ref) pode ser espalhado direto.

import { forwardRef, useId, type InputHTMLAttributes } from 'react';

export interface FieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  /** Rótulo visível, associado ao input por `htmlFor`/`id`. */
  label: string;
  /** Mensagem de erro; quando presente, ativa `aria-invalid` e o vínculo ARIA. */
  error?: string;
  /** Id opcional; se omitido, um id estável é gerado via `useId`. */
  id?: string;
}

/**
 * Campo de texto rotulado com estado de erro acessível. Encaminha `ref` para o
 * `<input>` nativo (compatível com `register` do React Hook Form).
 */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
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
});
