// components/inputs.test.tsx
//
// Testes dos inputs reutilizáveis acessíveis (Req. 10.2/10.3):
//  - o `label` associa ao controle (getByLabelText encontra o input);
//  - em erro, `aria-invalid="true"` e a mensagem é referenciada por
//    `aria-describedby`;
//  - o valor digitado propaga via `onChange`/`onValueChange`.
// Para MoneyInput, verifica-se que o valor NUMÉRICO é produzido (base da
// validação valor > 0 — R03).

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { Field } from './Field';
import { Select } from './Select';
import { DateInput } from './DateInput';
import {
  MoneyInput,
  parseValorMonetario,
  formatarValorMonetario,
} from './MoneyInput';

/** Verifica que o input marcado como inválido referencia a mensagem exibida. */
function esperaErroVinculado(control: HTMLElement, mensagem: string) {
  expect(control).toHaveAttribute('aria-invalid', 'true');
  const descrito = control.getAttribute('aria-describedby');
  expect(descrito).toBeTruthy();
  const alerta = screen.getByRole('alert');
  expect(alerta).toHaveAttribute('id', descrito!);
  expect(alerta).toHaveTextContent(mensagem);
}

describe('Field (Req. 10.2/10.3)', () => {
  it('associa o label ao input e começa sem aria-invalid', () => {
    render(<Field label="Odômetro (Km)" />);
    const input = screen.getByLabelText(/odômetro/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });

  it('expõe erro com aria-invalid e mensagem vinculada por aria-describedby', () => {
    render(<Field label="Odômetro (Km)" error="Deve ser maior que zero" />);
    const input = screen.getByLabelText(/odômetro/i);
    esperaErroVinculado(input, 'Deve ser maior que zero');
  });

  it('propaga o valor digitado via onChange', () => {
    const aoMudar = vi.fn();
    render(<Field label="Descrição" onChange={aoMudar} />);
    const input = screen.getByLabelText(/descrição/i);
    fireEvent.change(input, { target: { value: 'Posto X' } });
    expect(aoMudar).toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe('Posto X');
  });
});

describe('Select (Req. 10.2/10.3)', () => {
  const opcoes = [
    { value: 1, label: 'Lavagem simples' },
    { value: 2, label: 'Lavagem completa' },
  ];

  it('associa o label e renderiza as opções', () => {
    render(<Select label="Tipo de lavagem" options={opcoes} />);
    const select = screen.getByLabelText(/tipo de lavagem/i);
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Lavagem completa' })).toBeInTheDocument();
  });

  it('expõe erro com aria-invalid e mensagem vinculada', () => {
    render(
      <Select label="Tipo de lavagem" options={opcoes} error="Selecione um tipo" />,
    );
    const select = screen.getByLabelText(/tipo de lavagem/i);
    esperaErroVinculado(select, 'Selecione um tipo');
  });

  it('propaga a seleção via onChange', () => {
    const aoMudar = vi.fn();
    render(<Select label="Tipo de lavagem" options={opcoes} onChange={aoMudar} />);
    const select = screen.getByLabelText(/tipo de lavagem/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '2' } });
    expect(aoMudar).toHaveBeenCalled();
    expect(select.value).toBe('2');
  });
});

describe('DateInput (Req. 7.2, 10.2/10.3)', () => {
  it('associa o label a um input de data (contrato ISO)', () => {
    render(<DateInput label="Data da lavagem" />);
    const input = screen.getByLabelText(/data da lavagem/i);
    expect(input).toHaveAttribute('type', 'date');
  });

  it('mantém o valor em ISO YYYY-MM-DD ao digitar', () => {
    const aoMudar = vi.fn();
    render(<DateInput label="Data da lavagem" onChange={aoMudar} />);
    const input = screen.getByLabelText(/data da lavagem/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2024-02-28' } });
    expect(input.value).toBe('2024-02-28');
    expect(aoMudar).toHaveBeenCalled();
  });

  it('expõe erro com aria-invalid e mensagem vinculada', () => {
    render(<DateInput label="Data da lavagem" error="Data inválida" />);
    const input = screen.getByLabelText(/data da lavagem/i);
    esperaErroVinculado(input, 'Data inválida');
  });
});

describe('MoneyInput (Req. 4.4, 10.2/10.3)', () => {
  it('converte texto digitado em número (base de valor > 0 — R03)', () => {
    expect(parseValorMonetario('1234,50')).toBe(1234.5);
    expect(parseValorMonetario('1.234,50')).toBe(1234.5);
    expect(parseValorMonetario('10')).toBe(10);
    expect(parseValorMonetario('')).toBeUndefined();
    expect(formatarValorMonetario(1234.5)).toBe('1.234,50');
    expect(formatarValorMonetario(undefined)).toBe('');
  });

  it('associa o label ao input', () => {
    render(<MoneyInput label="Valor" />);
    expect(screen.getByLabelText(/valor/i)).toBeInTheDocument();
  });

  it('emite valor NUMÉRICO via onValueChange', () => {
    const aoMudar = vi.fn();
    render(<MoneyInput label="Valor" onValueChange={aoMudar} />);
    const input = screen.getByLabelText(/valor/i);
    fireEvent.change(input, { target: { value: '150,25' } });
    expect(aoMudar).toHaveBeenLastCalledWith(150.25);
  });

  it('reflete o valor numérico controlado e formata ao perder o foco', () => {
    function Host() {
      const [valor, setValor] = useState<number | undefined>(undefined);
      return <MoneyInput label="Valor" value={valor} onValueChange={setValor} />;
    }
    render(<Host />);
    const input = screen.getByLabelText(/valor/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '99,9' } });
    fireEvent.blur(input);
    // Exibição normalizada em BRL após blur; o valor numérico seguiu via estado.
    expect(input.value).toBe('99,90');
  });

  it('expõe erro com aria-invalid e mensagem vinculada', () => {
    render(<MoneyInput label="Valor" error="Informe um valor maior que zero" />);
    const input = screen.getByLabelText(/valor/i);
    esperaErroVinculado(input, 'Informe um valor maior que zero');
  });
});
