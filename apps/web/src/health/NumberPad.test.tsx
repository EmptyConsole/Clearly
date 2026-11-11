import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NumberPad } from './NumberPad.tsx';

describe('number pad', () => {
  it('takes three digits from the keyboard, with Backspace', () => {
    const onSubmit = vi.fn();
    render(<NumberPad enabled onSubmit={onSubmit} />);
    fireEvent.keyDown(window, { key: '4' });
    fireEvent.keyDown(window, { key: '9' });
    expect(screen.getByText('You entered: 4 9')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Backspace' });
    fireEvent.keyDown(window, { key: '7' });
    fireEvent.keyDown(window, { key: '1' });
    expect(onSubmit).toHaveBeenCalledWith([4, 7, 1]);
  });

  it('works with the on-screen keys and Not sure, and ignores input when disabled', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { rerender } = render(<NumberPad enabled={false} onSubmit={onSubmit} />);
    fireEvent.keyDown(window, { key: '1' });
    expect(onSubmit).not.toHaveBeenCalled();
    rerender(<NumberPad enabled onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: '0' }));
    await user.click(screen.getByRole('button', { name: 'Not sure' }));
    await user.click(screen.getByRole('button', { name: '5' }));
    expect(onSubmit).toHaveBeenCalledWith([0, null, 5]);
    // Keyboard-only: from the top of the page, Tab reaches the first key.
    (document.activeElement as HTMLElement | null)?.blur();
    await user.tab();
    expect(document.activeElement?.textContent).toBe('1');
  });
});
