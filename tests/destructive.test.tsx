// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, configure, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Sender } from '@/features/sender/components/Sender';

configure({ asyncUtilTimeout: 15000 });

afterEach(cleanup);

beforeEach(() => {
  sessionStorage.setItem('devlens-sender-authorized', '1');
});

describe('DELETE confirmation guard', () => {
  it('disables Send until the DELETE acknowledgement is checked', () => {
    render(<Sender />);
    fireEvent.change(screen.getByLabelText('HTTP method'), { target: { value: 'DELETE' } });

    expect(screen.getByText(/DELETE requests are usually permanent/i)).toBeInTheDocument();
    const sendButton = screen.getByRole('button', { name: /send delete/i });
    expect(sendButton).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: /i mean to delete this resource/i }));
    expect(sendButton).not.toBeDisabled();
  });

  it('re-locks the Send button when switching back to DELETE after acknowledging', () => {
    render(<Sender />);
    const methodSelect = screen.getByLabelText('HTTP method');
    fireEvent.change(methodSelect, { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /i mean to delete this resource/i }));
    expect(screen.getByRole('button', { name: /send delete/i })).not.toBeDisabled();

    fireEvent.change(methodSelect, { target: { value: 'GET' } });
    fireEvent.change(methodSelect, { target: { value: 'DELETE' } });
    expect(screen.getByRole('button', { name: /send delete/i })).toBeDisabled();
  });

  it('shows the same guard in Fuzz for a batch of DELETE requests', () => {
    render(<Sender />);
    fireEvent.click(screen.getByRole('tab', { name: 'Fuzz' }));
    fireEvent.change(screen.getByLabelText('HTTP method'), { target: { value: 'DELETE' } });

    expect(screen.getByText(/DELETE requests are usually permanent/i)).toBeInTheDocument();
    const startButton = screen.getByRole('button', { name: 'Start' });
    expect(startButton).toBeDisabled();

    fireEvent.click(
      screen.getByRole('checkbox', { name: /i mean to send these delete requests/i }),
    );
    expect(startButton).not.toBeDisabled();
  });
});
