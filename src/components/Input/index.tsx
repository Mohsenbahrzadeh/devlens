import type { InputHTMLAttributes } from 'react';

/** Shared class for native form fields; see `.field` in styles/index.css. */
export const fieldClass = 'field';

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`field ${className}`} spellCheck={false} {...rest} />;
}
