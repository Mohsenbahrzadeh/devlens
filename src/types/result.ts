export interface AppError {
  title: string;
  message: string;
  /** Raw technical detail, shown behind a "Details" toggle. */
  details?: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (title: string, message: string, details?: string): Result<never> => ({
  ok: false,
  error: { title, message, details },
});
