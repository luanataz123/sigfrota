// components/Select.tsx
//
// Dropdown acessível e reutilizável (Req. 10.2/10.3). Usado para "Tipo de
// lavagem" (Req. 4.5) e "Posto conveniado" (Req. 6.6), entre outros.
//
// Acessibilidade:
//  - `label` associado ao `<select>` por `htmlFor`/`id`;
//  - em erro, `aria-invalid="true"` + mensagem vinculada por `aria-describedby`
//    e anunciada por leitores de tela (`role="alert"`);
//  - `<select>` nativo preserva navegação/seleção por teclado.
//
// Encaminha `ref` (forwardRef) e repassa props nativas, para espalhar o retorno
// de `register` do React Hook Form (tarefa 7).

import { forwardRef, useId, type SelectHTMLAttributes } from 'react';

/** Opção do dropdown: valor enviado e rótulo exibido. */
export interface SelectOption {
  value: string | number;
  label: string;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  /** Rótulo visível, associado ao `<select>` por `htmlFor`/`id`. */
  label: string;
  /** Lista de opções `{ value, label }`. */
  options: SelectOption[];
  /** Mensagem de erro; quando presente, ativa `aria-invalid` e o vínculo ARIA. */
  error?: string;
  /** Texto de uma opção placeholder inicial (sem valor), opcional. */
  placeholder?: string;
  /** Id opcional; se omitido, um id estável é gerado via `useId`. */
  id?: string;
}

/**
 * Dropdown rotulado com estado de erro acessível. Encaminha `ref` para o
 * `<select>` nativo (compatível com `register` do React Hook Form).
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, error, placeholder, id, required, className, ...selectProps },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-erro`;
  const temErro = Boolean(error);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={selectId} className="text-sm font-medium text-slate-700">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <select
        id={selectId}
        ref={ref}
        required={required}
        aria-invalid={temErro}
        aria-describedby={temErro ? errorId : undefined}
        className={
          className ??
          'rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-100 aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:ring-red-400'
        }
        {...selectProps}
      >
        {placeholder !== undefined && (
          <option value="">{placeholder}</option>
        )}
        {options.map((opcao) => (
          <option key={String(opcao.value)} value={opcao.value}>
            {opcao.label}
          </option>
        ))}
      </select>
      {temErro && (
        <p id={errorId} role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
});
