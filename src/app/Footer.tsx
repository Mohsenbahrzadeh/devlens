import { AUTHOR, VERSION } from './author';

export function Footer() {
  return (
    <footer className="flex items-center justify-between border-t border-line bg-surface/70 px-4 py-1.5 text-[11px] text-muted backdrop-blur">
      <span>
        Made with <span className="text-bad">♥</span> by{' '}
        <a
          href={`mailto:${AUTHOR.email}`}
          title={AUTHOR.email}
          className="font-semibold text-fg underline-offset-2 hover:text-accent hover:underline"
        >
          {AUTHOR.name}
        </a>
      </span>
      <span className="rounded-full border border-line bg-surface2 px-2 py-0.5 font-mono text-[10px]">
        v{VERSION}
      </span>
    </footer>
  );
}
