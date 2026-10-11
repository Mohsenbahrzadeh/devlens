// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { JwtDecoder } from '@/features/jwt/components/JwtDecoder';
import { JsonViewer } from '@/features/json/components/JsonViewer';
import { CopyButton } from '@/components/CopyButton';

afterEach(cleanup);

const seg = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '');

describe('JwtDecoder', () => {
  it('shows an error instead of crashing on invalid input', () => {
    render(<JwtDecoder />);
    fireEvent.change(screen.getByLabelText('JSON Web Token'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The token must contain three segments.');
  });

  it('decodes a token and states that the signature is not verified', () => {
    render(<JwtDecoder />);
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `${seg({ alg: 'HS256' })}.${seg({ sub: '42', exp })}.sig`;
    fireEvent.change(screen.getByLabelText('JSON Web Token'), {
      target: { value: `Bearer ${token}` },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    expect(screen.getByText('Valid')).toBeInTheDocument();
    expect(screen.getByText(/Signature is not verified/)).toBeInTheDocument();
    expect(screen.getAllByText('"42"').length).toBeGreaterThan(0);
  });

  it('decodes on Ctrl+Enter', () => {
    render(<JwtDecoder />);
    fireEvent.change(screen.getByLabelText('JSON Web Token'), { target: { value: 'x.y' } });
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('JsonViewer', () => {
  it('reports invalid JSON with a location', () => {
    render(<JsonViewer />);
    fireEvent.change(screen.getByLabelText('JSON'), { target: { value: '{"a": }' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/line 1, column \d+/);
  });

  it('formats valid JSON', () => {
    render(<JsonViewer />);
    const box = screen.getByLabelText('JSON') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: '{"a":1}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    expect(box.value).toBe('{\n  "a": 1\n}');
  });
});

describe('CopyButton', () => {
  it('shows Copied and returns to Copy', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    render(<CopyButton text="hi" />);
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByText('✓ Copied')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent(/^Copy$/), {
      timeout: 3000,
    });
  });
});
