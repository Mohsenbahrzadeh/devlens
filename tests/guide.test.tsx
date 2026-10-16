// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Guide } from '@/components/Guide';

afterEach(cleanup);

const en = {
  what: 'Does a thing.',
  steps: ['Step one.', 'Step two.'],
  example: 'input -> output',
  useCase: 'When you need the thing.',
};
const fa = {
  what: 'یک کاری انجام می‌دهد.',
  steps: ['قدم یک.', 'قدم دو.'],
  example: 'ورودی -> خروجی',
  useCase: 'وقتی به آن نیاز دارید.',
};

describe('Guide', () => {
  it('shows English content by default and switches to Persian on toggle', () => {
    render(<Guide en={en} fa={fa} />);
    expect(screen.getByText('Does a thing.')).toBeInTheDocument();
    expect(screen.queryByText('یک کاری انجام می‌دهد.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'فارسی' }));
    expect(screen.getByText('یک کاری انجام می‌دهد.')).toBeInTheDocument();
    expect(screen.queryByText('Does a thing.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByText('Does a thing.')).toBeInTheDocument();
  });

  it('lists every step and shows the example', () => {
    render(<Guide en={en} fa={fa} />);
    expect(screen.getByText('Step one.')).toBeInTheDocument();
    expect(screen.getByText('Step two.')).toBeInTheDocument();
    expect(screen.getByText('input -> output')).toBeInTheDocument();
  });
});
