// features/lavagem/ConfirmDeleteDialog.test.tsx
//
// Testes unitários do diálogo de confirmação acessível (tarefa 8.4 / Req. 9.2 +
// Req. 10). Verificam: conteúdo (título/mensagem/botões), callbacks de
// confirmar/cancelar, Esc = cancelar, estado "confirmando" desabilita o botão e
// o FOCO vai para o diálogo ao abrir.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';

/** Props base reutilizadas; cada teste sobrescreve o que precisa. */
function montar(overrides: Partial<Parameters<typeof ConfirmDeleteDialog>[0]> = {}) {
  const onConfirmar = vi.fn();
  const onCancelar = vi.fn();
  render(
    <ConfirmDeleteDialog
      aberto
      titulo="Excluir lavagem"
      mensagem="Tem certeza que deseja excluir esta lavagem?"
      onConfirmar={onConfirmar}
      onCancelar={onCancelar}
      {...overrides}
    />,
  );
  return { onConfirmar, onCancelar };
}

describe('ConfirmDeleteDialog (Req. 9.2 / Req. 10)', () => {
  it('quando fechado, não renderiza nada', () => {
    const { onConfirmar, onCancelar } = {
      onConfirmar: vi.fn(),
      onCancelar: vi.fn(),
    };
    render(
      <ConfirmDeleteDialog
        aberto={false}
        titulo="Excluir lavagem"
        mensagem="Tem certeza?"
        onConfirmar={onConfirmar}
        onCancelar={onCancelar}
      />,
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('aberto mostra título, mensagem e os botões Excluir/Cancelar', () => {
    montar();
    const dialogo = screen.getByRole('alertdialog');
    expect(dialogo).toHaveAttribute('aria-modal', 'true');
    expect(
      screen.getByRole('heading', { name: /excluir lavagem/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/tem certeza que deseja excluir/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /excluir/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument();
  });

  it('o diálogo é rotulado/descrito por título e mensagem (aria)', () => {
    montar();
    const dialogo = screen.getByRole('alertdialog');
    expect(dialogo).toHaveAttribute('aria-labelledby', 'confirm-delete-titulo');
    expect(dialogo).toHaveAttribute(
      'aria-describedby',
      'confirm-delete-mensagem',
    );
  });

  it('clicar em Excluir chama onConfirmar (Req. 9.3)', () => {
    const { onConfirmar, onCancelar } = montar();
    fireEvent.click(screen.getByRole('button', { name: /excluir/i }));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(onCancelar).not.toHaveBeenCalled();
  });

  it('clicar em Cancelar chama onCancelar (Req. 9.4)', () => {
    const { onConfirmar, onCancelar } = montar();
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(onCancelar).toHaveBeenCalledTimes(1);
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('Esc chama onCancelar (Req. 9.4 / Req. 10.3)', () => {
    const { onConfirmar, onCancelar } = montar();
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(onCancelar).toHaveBeenCalledTimes(1);
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('quando confirmando=true, o botão de confirmação fica desabilitado (Req. 9.5)', () => {
    montar({ confirmando: true });
    const botao = screen.getByRole('button', { name: /excluindo/i });
    expect(botao).toBeDisabled();
  });

  it('ao abrir, o foco vai para o diálogo (Req. 9.2 / Req. 10.3)', () => {
    montar();
    expect(screen.getByRole('alertdialog')).toHaveFocus();
  });
});
