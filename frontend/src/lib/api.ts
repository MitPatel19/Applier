/**
 * Typed API client.
 *
 * - All requests go to same-origin `/api/*` (Next rewrites proxy them to FastAPI), so the
 *   httpOnly session cookie is sent automatically and never touched by JavaScript.
 * - Every state-changing request carries the CSRF header the backend requires.
 * - Errors are normalized into `ApiError` with a user-safe `message`.
 */

export const API_BASE = "/api";
const CSRF_HEADER = "X-Requested-With";
const CSRF_VALUE = "applier";

export interface ApiFieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  code: string;
  retryable: boolean;
  details: unknown;

  constructor(status: number, code: string, message: string, retryable = false, details: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }

  get fieldErrors(): ApiFieldError[] {
    return Array.isArray(this.details) ? (this.details as ApiFieldError[]) : [];
  }
}

type Query = Record<string, string | number | boolean | null | undefined | Array<string | number>>;

function buildUrl(path: string, query?: Query) {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) v.forEach((item) => params.append(k, String(item)));
    else params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error */
  }
  const err = (body as { error?: { code?: string; message?: string; retryable?: boolean; details?: unknown } })?.error;
  if (err?.message) {
    return new ApiError(res.status, err.code ?? "error", err.message, !!err.retryable, err.details ?? null);
  }
  if (res.status >= 500 || res.status === 0) {
    return new ApiError(res.status, "unavailable", "We couldn't reach the server right now. Please try again.", true);
  }
  return new ApiError(res.status, "error", "Something went wrong. Please try again.");
}

async function request<T>(method: string, path: string, opts: { body?: unknown; query?: Query; form?: FormData } = {}) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method !== "GET") headers[CSRF_HEADER] = CSRF_VALUE;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), { method, headers, body, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "network", "You appear to be offline or the server is unreachable. Please try again.", true);
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("application/json") ? await res.json() : await res.text()) as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown, query?: Query) => request<T>("POST", path, { body, query }),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body }),
  del: <T = void>(path: string, body?: unknown) => request<T>("DELETE", path, { body }),
  upload: <T>(path: string, form: FormData) => request<T>("POST", path, { form }),
  /** URL for a file download endpoint (use in <a href download>). */
  url: (path: string, query?: Query) => buildUrl(path, query),
};

/** Human-readable message for any thrown value. */
export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again.") {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return fallback;
  return fallback;
}
