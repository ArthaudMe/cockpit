/**
 * Shared streaming chat client.
 *
 * Every chat surface (the multi-agent ChatColumn, the contextual focus chat,
 * and the dashboard chat) POSTs to an agent/chat endpoint, reads the response
 * body as a stream, and appends decoded chunks to the last assistant message.
 * That loop used to be copy-pasted four times; this module is the single
 * implementation.
 *
 * `streamChat` reproduces the superset of all callers' behavior:
 *  - streams the body chunk-by-chunk, invoking `onChunk` with both the
 *    accumulated text and the latest delta (callers keep their existing
 *    "append delta to the last message" logic),
 *  - reads the error body on non-ok responses (see `readErrorBody`) and
 *    returns it as `text`,
 *  - exposes the `X-Cockpit-Login-Needed` and `X-Cockpit-Fallback-Agent`
 *    response headers (via `loginNeeded` / `fallbackAgent` and the raw
 *    `headers`) so callers can opt into that handling,
 *  - forwards an optional `AbortSignal` to the underlying fetch.
 */

export interface StreamChatArgs {
  /** Endpoint to POST to (varies by caller). */
  url: string;
  /** JSON request body (varies by caller). */
  body: unknown;
  /** Aborts the underlying fetch when signalled. */
  signal?: AbortSignal;
  /**
   * Called once per streamed chunk with the full accumulated text so far and
   * the newly decoded delta.
   */
  onChunk: (fullTextSoFar: string, delta: string) => void;
  /**
   * Called once as soon as response headers are available, before any chunk is
   * read. Lets callers inspect headers (e.g. fallback-agent routing) and set up
   * where subsequent `onChunk` output should land.
   */
  onResponse?: (info: { ok: boolean; status: number; headers: Headers }) => void;
  /** Extra request headers (merged over the default Content-Type). */
  headers?: Record<string, string>;
}

export interface StreamChatResult {
  ok: boolean;
  status: number;
  /** Accumulated stream text when ok; the error body when not ok. */
  text: string;
  headers: Headers;
  loginNeeded?: boolean;
  fallbackAgent?: string | null;
}

export async function readErrorBody(res: Response): Promise<string> {
  try {
    return (await res.text()).trim();
  } catch {
    return "";
  }
}

export function chatFailureMessage(
  res: { status: number; headers: Headers },
  body: string
): string {
  if (res.headers.get("X-Cockpit-Login-Needed") === "1" && body) return body;
  if (res.status === 401 && body) return body;
  if (res.status === 503 && body) return body;
  if (res.status === 503) {
    return "I'm having trouble connecting right now. Please check your AI backend and try again.";
  }
  if (res.status === 401) return "Your session may have expired. Try reloading the app.";
  if (res.status >= 500) return "Something went wrong on my end. Please try again in a moment.";
  return body || "Sorry, I couldn't process that request. Please try again.";
}

export async function streamChat(args: StreamChatArgs): Promise<StreamChatResult> {
  const res = await fetch(args.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(args.headers || {}) },
    body: JSON.stringify(args.body),
    signal: args.signal,
  });

  const loginNeeded = res.headers.get("X-Cockpit-Login-Needed") === "1";
  const fallbackAgent = res.headers.get("X-Cockpit-Fallback-Agent");

  args.onResponse?.({ ok: res.ok, status: res.status, headers: res.headers });

  if (!res.ok || !res.body) {
    const text = await readErrorBody(res);
    return { ok: false, status: res.status, text, headers: res.headers, loginNeeded, fallbackAgent };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const delta = decoder.decode(value, { stream: true });
    full += delta;
    args.onChunk(full, delta);
  }

  return { ok: true, status: res.status, text: full, headers: res.headers, loginNeeded, fallbackAgent };
}
