import { useEffect, useRef } from 'react';

/** Runs `action` on Ctrl/Cmd+Enter while the component is mounted. */
export function useCtrlEnter(action: () => void): void {
  const ref = useRef(action);
  useEffect(() => {
    ref.current = action;
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        ref.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
