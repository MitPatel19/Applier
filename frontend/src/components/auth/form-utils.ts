import { ApiError } from "@/lib/api";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(email: string): string | null {
  const v = email.trim();
  if (!v) return "Enter your email address";
  if (!EMAIL_RE.test(v)) return "Enter a valid email address, like name@example.com";
  return null;
}

/**
 * Split an API error into per-field messages (422 `details`) and a form-level message.
 * Backend field paths may look like "email" or "body.email" — only the last segment matters.
 */
export function splitApiError<F extends string>(
  err: unknown,
  fields: readonly F[],
): { fieldErrors: Partial<Record<F, string>>; formError: string | null } {
  if (!(err instanceof ApiError)) {
    return { fieldErrors: {}, formError: "Something went wrong. Please try again." };
  }
  const fieldErrors: Partial<Record<F, string>> = {};
  for (const fe of err.fieldErrors) {
    const key = String(fe.field ?? "").split(".").pop() as F;
    if (fields.includes(key) && !fieldErrors[key]) {
      fieldErrors[key] = fe.message.replace(/^Value error,\s*/i, "");
    }
  }
  const hasField = Object.keys(fieldErrors).length > 0;
  return { fieldErrors, formError: hasField ? null : err.message };
}
