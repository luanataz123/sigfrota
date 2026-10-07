// components/MoneyInput.tsx
//
// Input de valor monetário (BRL) acessível e reutilizável (Req. 4.4, 10.2/10.3).
//
// Contrato numérico: o valor que entra (`value`) e o que sai (`onValueChange`)
// é um `number` (ou `undefined` quando vazio) — nunca uma string formatada.
// Isso garante que a validação de domínio "valor > 0" (R03/R11) opere sobre o
// número real, e não sobre texto. A exibição é amigável em pt-BR; a digitação
// aceita dígitos, vírgula e ponto, convertendo para número ao editar.
//
// Decisão de UX: para não atrapalhar a digitação (Req. 10.3 — operação por
// teclado), o campo NÃO reformata o texto a cada tecla. Ele mantém o texto bruto
// enquanto focado e, ao perder o foco (blur), normaliza a exibição para o
// formato BRL. O valor numérico, porém, é emitido a cada mudança.
//
// Acessibilidade:
//  - `label` associado por `htmlFor`/`id`;
//  - em erro, `aria-invalid="true"` + mensagem vinculada por `aria-describedby`
//    e anunciada por leitores de tela (`role="alert"`);
//  - `inputMode="decimal"` abre teclado numérico em dispositivos móveis.
//
// Encaminha `ref` (forwardRef). Para React Hook Form (tarefa 7), use um
// `Controller`, ligando `value`/`onValueChange` ao campo numérico.

import {
  forwardRef,
  useId,
  useEffect,
  useState,
  type InputHTMLAttributes,
} from 'react';

export interface MoneyInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'id' | 'type' | 'value' | 'onChange' | 'defaultValue'
  > {
  /** Rótulo visível, associado ao input por `htmlFor`/`id`. */
  label: string;
  /** Valor numérico atual (BRL). `undefined` quando o campo está vazio. */
  value?: number;
  /** Emite o valor numérico a cada edição (`undefined` quando vazio). */
  onValueChange?: (valor: number | undefined) => void;
  /** Mensagem de erro; quando presente, ativa `aria-invalid` e o vínculo ARIA. */
  error?: string;
  /** Id opcional; se omitido, um id estável é gerado via `useId`. */
  id?: string;
}

const formatadorBRL = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Converte o texto digitado (aceitando vírgula/ponto) em número ou undefined. */
export function parseValorMonetario(texto: string): number | undefined {
  const limpo = texto.trim();
  if (limpo === '') return undefined;
  // Remove separadores de milhar e normaliza a vírgula decimal para ponto.
  const normalizado = limpo.replace(/\./g, '').replace(',', '.');
  const numero = Number(normalizado);
  return Number.isNaN(numero) ? undefined : numero;
}

/** Formata um número no padrão BRL de exibição (ex.: 1234.5 -> "1.234,50"). */
export function formatarValorMonetario(valor: number | undefined): string {
  if (valor === undefined || Number.isNaN(valor)) return '';
  return formatadorBRL.format(valor);
}

/**
 * Campo monetário rotulado com estado de erro acessível. Emite valor numérico
 * via `onValueChange`, mantendo a exibição amigável em BRL.
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  function MoneyInput(
    { label, value, onValueChange, error, id, required, className, onBlur, onFocus, ...inputProps },
    ref,
  ) {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-erro`;
    const temErro = Boolean(error);

    // Texto exibido no input. Sincroniza com o valor numérico externo quando o
    // campo não está sendo editado, mantendo o texto bruto durante o foco.
    const [editando, setEditando] = useState(false);
    const [texto, setTexto] = useState<string>(() =>
      formatarValorMonetario(value),
    );

    useEffect(() => {
      if (!editando) {
        setTexto(formatarValorMonetario(value));
      }
    }, [value, editando]);

    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </label>
        <div className="flex items-stretch">
          <span
            aria-hidden="true"
            className="inline-flex items-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-100 px-3 text-sm font-semibold text-slate-600"
          >
            R$
          </span>
          <input
            id={inputId}
            ref={ref}
            type="text"
            inputMode="decimal"
            required={required}
            value={texto}
            aria-invalid={temErro}
            aria-describedby={temErro ? errorId : undefined}
            onFocus={(e) => {
              setEditando(true);
              onFocus?.(e);
            }}
            onChange={(e) => {
              const novoTexto = e.target.value;
              setTexto(novoTexto);
              onValueChange?.(parseValorMonetario(novoTexto));
            }}
            onBlur={(e) => {
              setEditando(false);
              setTexto(formatarValorMonetario(parseValorMonetario(texto)));
              onBlur?.(e);
            }}
            className={
              className ??
              'input rounded-l-none'
            }
            {...inputProps}
          />
        </div>
        {temErro && (
          <p id={errorId} role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    );
  },
);
