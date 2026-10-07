// components/states.test.tsx
//
// Testes dos estados de UI (tarefa 4.2):
//  - Spinner anuncia status a leitores de tela (Req. 2.6/10.1);
//  - EmptyState mostra mensagem e aciona o CTA (Req. 2.5);
//  - ErrorState mostra o erro e chama onRetry em "tentar novamente" (Req. 2.7);
//  - Toast exibe a mensagem (Req. 10.1) e a região do provider a remove após a
//    duração configurada (mensagem temporária).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Spinner } from './Spinner';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { Toast } from './Toast';
import { ToastProvider, useToast } from '../app/ToastRegion';

describe('Spinner (Req. 2.6/10.1 — carregando)', () => {
  it('expõe role="status" e anuncia o rótulo padrão', () => {
    render(<Spinner />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent('Carregando...');
  });

  it('permite customizar o rótulo anunciado', () => {
    render(<Spinner label="Buscando lavagens" />);
    expect(screen.getByRole('status')).toHaveTextContent('Buscando lavagens');
  });
});

describe('EmptyState (Req. 2.5 — sem lavagens, incluir a primeira)', () => {
  it('mostra a mensagem de orientação', () => {
    render(<EmptyState mensagem="Este veículo ainda não tem lavagens." />);
    expect(
      screen.getByText('Este veículo ainda não tem lavagens.'),
    ).toBeInTheDocument();
  });

  it('aciona o CTA ao clicar no botão', () => {
    const aoIncluir = vi.fn();
    render(
      <EmptyState
        mensagem="Nenhuma lavagem."
        acaoLabel="Incluir primeira lavagem"
        onAction={aoIncluir}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /incluir primeira lavagem/i }),
    );
    expect(aoIncluir).toHaveBeenCalledTimes(1);
  });

  it('renderiza um slot de ação livre quando fornecido', () => {
    render(
      <EmptyState
        mensagem="Nenhuma lavagem."
        action={<a href="/nova">Incluir</a>}
      />,
    );
    expect(screen.getByRole('link', { name: 'Incluir' })).toBeInTheDocument();
  });
});

describe('ErrorState (Req. 2.7 — busca falhou, tentar novamente)', () => {
  it('exibe o erro como alerta acessível', () => {
    render(<ErrorState mensagem="Não foi possível carregar as lavagens." />);
    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent('Não foi possível carregar as lavagens.');
  });

  it('chama onRetry ao clicar em "tentar novamente"', () => {
    const aoTentar = vi.fn();
    render(<ErrorState mensagem="Falha na busca." onRetry={aoTentar} />);
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));
    expect(aoTentar).toHaveBeenCalledTimes(1);
  });

  it('não renderiza o botão quando onRetry é omitido', () => {
    render(<ErrorState mensagem="Falha na busca." />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('Toast (Req. 10.1 — mensagem temporária e visível)', () => {
  it('exibe a mensagem e a severidade', () => {
    render(<Toast mensagem="Lavagem salva" severidade="sucesso" />);
    const toast = screen.getByText('Lavagem salva');
    expect(toast).toBeInTheDocument();
    expect(toast.closest('[data-severidade]')).toHaveAttribute(
      'data-severidade',
      'sucesso',
    );
  });

  it('chama onFechar ao acionar o botão de dispensa', () => {
    const aoFechar = vi.fn();
    render(<Toast mensagem="Erro ao salvar" severidade="erro" onFechar={aoFechar} />);
    fireEvent.click(screen.getByRole('button', { name: /fechar/i }));
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });
});

describe('ToastProvider + Toast (mensagem temporária)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function Disparador() {
    const { mostrarToast } = useToast();
    return (
      <button type="button" onClick={() => mostrarToast('Lavagem salva', 'sucesso')}>
        disparar
      </button>
    );
  }

  it('mostra a mensagem via useToast e a remove após a duração', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider duracaoMs={1000}>
        <Disparador />
      </ToastProvider>,
    );

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'disparar' }));
    });
    expect(screen.getByText('Lavagem salva')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Lavagem salva')).not.toBeInTheDocument();
  });
});
