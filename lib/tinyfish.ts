/* ───────────────────────────────────────────────────────────────────────────
 * TinyFish run-sse client. Opens a streaming browser-automation run, parses the
 * raw SSE, and forwards lifecycle events to a callback. Returns the structured
 * result from the COMPLETE event (shaped by output_schema).
 * ─────────────────────────────────────────────────────────────────────────── */

const TINYFISH_KEY = process.env.TINYFISH_API_KEY!;
const TF_ENDPOINT = "https://agent.tinyfish.ai/v1/automation/run-sse";

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
