// Shared HTTP and string helpers for channel scrapers.
// All network helpers swallow errors and return null so callers can degrade
// gracefully (per the "never throw from scrapers" contract).

export const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

type FetchOpts = {
  headers?: Record<string, string>;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 15000;

export async function fetchHtml(
  url: string,
  opts: FetchOpts = {},
): Promise<string | null> {
  const { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      // UA first so callers can override via opts.headers if needed.
      headers: { "User-Agent": UA, ...headers },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T = unknown>(
  url: string,
  opts: FetchOpts = {},
): Promise<T | null> {
  const { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, ...headers },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const raw = await res.text();
    return JSON.parse(raw) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function encodeTopic(s: string): string {
  return encodeURIComponent(s);
}
