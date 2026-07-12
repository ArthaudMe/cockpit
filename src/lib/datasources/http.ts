// Shared HTTP helpers for datasource connectors.
//
// Every connector fetch must go through here so the whole data plane gets:
//   - a request timeout (a hung socket on sleep/wake or a captive portal must
//     not pin the single-flight poll forever)
//   - uniform non-2xx handling (a 4xx/5xx becomes a thrown HttpError instead of
//     a silent empty array, so the manager can tell "broken" from "no data")
//   - one bounded retry that honors Retry-After on 429/503

export class HttpError extends Error {
  status: number;
  service: string;
  body?: string;
  constructor(status: number, service: string, body?: string) {
    super(`${service}: HTTP ${status}`);
    this.name = "HttpError";
    this.status = status;
    this.service = service;
    this.body = body;
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRY_WAIT_MS = 3_000;

function retryAfterMs(res: Response): number {
  const header = res.headers.get("retry-after");
  if (!header) return 500;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return Math.min(seconds * 1000, MAX_RETRY_WAIT_MS);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.min(Math.max(date - Date.now(), 0), MAX_RETRY_WAIT_MS);
  return 500;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  service?: string;
}

/**
 * fetch() with a timeout and one bounded retry on 429/503. Returns the Response
 * (which may be non-ok — callers that want a hard failure should use fetchOk).
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  opts: FetchOptions = {},
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = opts.retries ?? 1;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if ((res.status === 429 || res.status === 503) && attempt < retries) {
        await sleep(retryAfterMs(res));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      // Retry transient network/timeout errors once.
      if (attempt < retries) {
        await sleep(300);
        continue;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Like fetchWithTimeout but throws HttpError on a non-2xx response, capturing a
 * short slice of the body for diagnostics. Use in connectors so a rate-limit or
 * expired token surfaces as an error the manager can record, not an empty list.
 */
export async function fetchOk(
  url: string,
  init: RequestInit = {},
  opts: FetchOptions = {},
): Promise<Response> {
  const res = await fetchWithTimeout(url, init, opts);
  if (!res.ok) {
    let body: string | undefined;
    try {
      body = (await res.text()).slice(0, 500);
    } catch {
      /* ignore */
    }
    throw new HttpError(res.status, opts.service ?? "http", body);
  }
  return res;
}

/** fetchOk + JSON parse. */
export async function fetchJson<T = unknown>(
  url: string,
  init: RequestInit = {},
  opts: FetchOptions = {},
): Promise<T> {
  const res = await fetchOk(url, init, opts);
  return (await res.json()) as T;
}
