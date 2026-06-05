/* ───────────────────────────────────────────────────────────────────────────
 * TinyFish run-sse client. Opens a streaming browser-automation run, parses the
 * raw SSE, and forwards lifecycle events to a callback. Returns the structured
 * result from the COMPLETE event (shaped by output_schema).
 * ─────────────────────────────────────────────────────────────────────────── */

const TINYFISH_KEY = process.env.TINYFISH_API_KEY!;
const TF_BASE = "https://agent.tinyfish.ai/v1";
const TF_ENDPOINT = `${TF_BASE}/automation/run-sse`;

export interface TFEvent {
  type: string; // STARTED | STREAMING_URL | PROGRESS | COMPLETE | HEARTBEAT
  run_id?: string;
  streaming_url?: string;
  purpose?: string;
  status?: string;
  result?: unknown;
  error?: string;
}

export interface RunAgentOpts {
  url: string;
  goal: string;
  outputSchema?: Record<string, unknown>;
  browserProfile?: "lite" | "stealth";
  onStreamingUrl?: (url: string) => void;
  onProgress?: (purpose: string) => void;
  /** Fires when TinyFish emits STARTED — used to collect run_ids for bulk-cancel on Stop. */
  onStarted?: (runId: string) => void;
}

/**
 * Run a TinyFish agent and stream its lifecycle. Resolves with the parsed
 * result object (from output_schema) once COMPLETE arrives.
 */
export async function runAgent(opts: RunAgentOpts): Promise<unknown> {
  const res = await fetch(TF_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": TINYFISH_KEY,
    },
    body: JSON.stringify({
      url: opts.url,
      goal: opts.goal,
      browser_profile: opts.browserProfile ?? "stealth",
      api_integration: "cara-authority-hub",
      ...(opts.outputSchema ? { output_schema: opts.outputSchema } : {}),
      // NOTE: TinyFish has no request-time "enable screenshots" flag. Screenshots
      // are retrieved retroactively via `GET /v1/runs/{id}?screenshots=base64`.
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`TinyFish run failed: ${res.status} ${await res.text().catch(() => "")}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let result: unknown = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      let ev: TFEvent;
      try {
        ev = JSON.parse(line.slice(6)) as TFEvent;
      } catch {
        continue; // skip malformed / heartbeat noise
      }
      switch (ev.type) {
        case "STARTED":
          if (ev.run_id) opts.onStarted?.(ev.run_id);
          break;
        case "STREAMING_URL":
          if (ev.streaming_url) opts.onStreamingUrl?.(ev.streaming_url);
          break;
        case "PROGRESS":
          if (ev.purpose) opts.onProgress?.(ev.purpose);
          break;
        case "COMPLETE":
          result = ev.result ?? result;
          break;
      }
    }
  }
  return result;
}

/**
 * Bulk-cancel TinyFish runs. Used by the Stop button to actually kill in-flight
 * browser sessions instead of letting them run to budget.
 */
export async function cancelRuns(runIds: string[]): Promise<void> {
  if (!runIds.length) return;
  try {
    await fetch(`${TF_BASE}/runs/cancel-multiple-runs-by-ids`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": TINYFISH_KEY },
      body: JSON.stringify({ run_ids: runIds }),
    });
  } catch {
    /* best-effort */
  }
}

export interface TFStep {
  id: string;
  screenshot?: string | null; // base64 when fetched with ?screenshots=base64
  // TinyFish may include other fields like purpose, url, etc — we don't rely on them.
}

interface TFRun {
  id: string;
  steps?: TFStep[];
  video_url?: string | null;
}

/**
 * In-memory cache of full run-with-screenshots payloads. ~50–100KB per step ×
 * 5–10 steps means a typical fetch is ~500KB. We cache for 5 minutes so a user
 * clicking multiple snapshot buttons for the same TinyFish session only pays
 * the upstream fetch once. Cap entries to avoid unbounded growth.
 */
const RUN_CACHE = new Map<string, { data: TFRun; expires: number }>();
const RUN_CACHE_TTL_MS = 5 * 60_000;
const RUN_CACHE_MAX = 50;

async function getRunFull(runId: string, withScreenshots: boolean): Promise<TFRun | null> {
  const key = `${runId}:${withScreenshots ? "ss" : "meta"}`;
  const cached = RUN_CACHE.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;
  try {
    const url = withScreenshots
      ? `${TF_BASE}/runs/${runId}?screenshots=base64`
      : `${TF_BASE}/runs/${runId}`;
    const res = await fetch(url, { headers: { "X-API-Key": TINYFISH_KEY } });
    if (!res.ok) return null;
    const data = (await res.json()) as TFRun;
    // Evict oldest if cap reached.
    if (RUN_CACHE.size >= RUN_CACHE_MAX) {
      const firstKey = RUN_CACHE.keys().next().value;
      if (firstKey) RUN_CACHE.delete(firstKey);
    }
    RUN_CACHE.set(key, { data, expires: Date.now() + RUN_CACHE_TTL_MS });
    return data;
  } catch {
    return null;
  }
}

/**
 * Fetch the recorded steps for a completed run so we can pick the "last
 * meaningful step" id to attach as a screenshot reference on each finding.
 * (No screenshots in this call — we want it cheap during the research loop.)
 */
export async function getRunSteps(runId: string): Promise<TFStep[]> {
  const run = await getRunFull(runId, false);
  return run?.steps ?? [];
}

/**
 * Fetch a single step's screenshot as raw JPEG bytes.
 *
 * TinyFish does NOT expose per-step screenshot endpoints. The documented method
 * is to fetch the entire run with `?screenshots=base64` and extract the step's
 * base64-encoded image from the steps array. We decode that to binary here so
 * the browser can render it directly as a JPEG.
 *
 * Returns a Response-shaped object (matching the previous interface) so the
 * /api/tinyfish/screenshot proxy route can stream it through.
 */
export async function fetchStepScreenshot(runId: string, stepId: string): Promise<Response> {
  const run = await getRunFull(runId, true);
  const step = run?.steps?.find((s) => s.id === stepId);
  if (!step?.screenshot) {
    return new Response("Screenshot not available for this step", { status: 404 });
  }
  // Decode base64 → bytes. Buffer is Node-only; we're in a Next.js API route.
  const bytes = Buffer.from(step.screenshot, "base64");
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

/**
 * Fetch a step's HTML snapshot. Undocumented but `GET /v1/runs/{id}/steps/{stepId}/html`
 * appears in some references — try it and let the proxy return 404 cleanly
 * if it isn't supported on this run.
 */
export async function fetchStepHtml(runId: string, stepId: string): Promise<Response> {
  return fetch(`${TF_BASE}/runs/${runId}/steps/${stepId}/html`, {
    headers: { "X-API-Key": TINYFISH_KEY },
  });
}

/** Convenience: video URL (if TinyFish recorded one for this run). */
export async function getRunVideoUrl(runId: string): Promise<string | null> {
  const run = await getRunFull(runId, false);
  return run?.video_url ?? null;
}

/** Best-effort extraction of an object from a TinyFish result (it may wrap JSON in a string). */
export function coerceResult<T>(result: unknown): T | null {
  if (!result) return null;
  if (typeof result === "object") return result as T;
  if (typeof result === "string") {
    const m = result.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as T;
      } catch {
        return null;
      }
    }
  }
  return null;
}
