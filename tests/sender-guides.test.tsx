// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Sender } from '@/features/sender/components/Sender';

configure({ asyncUtilTimeout: 15000 });

afterEach(cleanup);

beforeEach(() => {
  sessionStorage.setItem('devlens-sender-authorized', '1');
});

describe('Sender per-pane guides', () => {
  it('shows both the Sender overview guide and a pane-specific guide on Fuzz', () => {
    render(<Sender />);
    fireEvent.click(screen.getByRole('tab', { name: 'Fuzz' }));
    expect(screen.getAllByText('Guide · راهنما').length).toBe(2);
  });

  it('shows a dedicated guide on Collections', async () => {
    render(<Sender />);
    fireEvent.click(screen.getByRole('tab', { name: 'Collections' }));
    await waitFor(() => expect(screen.getAllByText('Guide · راهنما').length).toBe(2));
  });
});
