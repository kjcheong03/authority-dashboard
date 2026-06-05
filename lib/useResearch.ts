"use client";

import { useCallback, useRef, useState } from "react";
import type { ServerEvent, Phase, Finding, Claim, Draft, SourceRef, Spread, Assessment, TopicInput } from "./types";

export interface LogLine {
  level: "info" | "warn" | "ok";
  message: string;
  ts: string;
}

export interface ResearchState {
  runId: string | null;
  running: boolean;
  phase: Phase | null;
  phaseLabel: string;
  pct: number;
  streamingUrl: string | null;
  channelStreamingUrls: Record<string, string>;
  logs: LogLine[];
  sources: SourceRef[];
  findings: Finding[];
  claims: Claim[];
  spread: Spread | null;
  assessment: Assessment | null;
  draft: Draft | null;
  error: string | null;
}

const initial: ResearchState = {
  runId: null,
  running: false,
  phase: null,
  phaseLabel: "",
  pct: 0,
  streamingUrl: null,
  channelStreamingUrls: {},
  logs: [],
  sources: [],
  findings: [],
  claims: [],
  spread: null,
  assessment: null,
  draft: null,
  error: null,
};

export function useResearch() {
  const [state, setState] = useState<ResearchState>(initial);
  const abortRef = useRef<AbortController | null>(null);

  const apply = useCallback((e: ServerEvent) => {
    setState((s) => {
      switch (e.type) {
        case "RUN_ID":
          return { ...s, runId: e.runId };
        case "PHASE":
          return { ...s, phase: e.phase, phaseLabel: e.label };
        case "PROGRESS_PCT":
          return { ...s, pct: e.pct };
        case "STREAMING_URL":
          return { ...s, streamingUrl: e.url };
        case "CHANNEL_STREAMING_URL":
          return { ...s, channelStreamingUrls: { ...s.channelStreamingUrls, [e.channelId]: e.url } };
        case "LOG":
          return { ...s, logs: [...s.logs, { level: e.level, message: e.message, ts: e.ts ?? "" }] };
        case "SOURCE":
          return s.sources.some((x) => x.name === e.source.name)
            ? s
            : { ...s, sources: [...s.sources, e.source] };
        case "FINDING":
          return { ...s, findings: [...s.findings, e.finding] };
        case "CLAIM":
          return { ...s, claims: [...s.claims, e.claim] };
        case "ORIGIN":
          return { ...s, claims: s.claims.map((c) => (c.id === e.claimId ? { ...c, origin: e.origin } : c)) };
        case "FACTCHECK":
          return { ...s, claims: s.claims.map((c) => (c.id === e.claimId ? { ...c, factChecks: e.factChecks } : c)) };
        case "SPREAD":
          return { ...s, spread: e.spread };
        case "ASSESSMENT":
          return { ...s, assessment: e.assessment };
        case "DRAFT":
          return { ...s, draft: e.draft };
        case "ERROR":
          return { ...s, error: e.message, running: false };
        case "COMPLETE":
          return { ...s, running: false };
        default:
          return s;
      }
    });
  }, []);

  const start = useCallback(
    async (input: TopicInput, mode: "live" | "replay", hazardSnapshot?: unknown) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setState({ ...initial, running: true });

      try {
        const res = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, mode, hazardSnapshot }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) throw new Error(`Request failed: ${res.status}`);

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            try {
              apply(JSON.parse(line.slice(6)) as ServerEvent);
            } catch {
              /* skip */
            }
          }
        }
        setState((s) => ({ ...s, running: false }));
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setState((s) => ({ ...s, running: false, error: (err as Error).message }));
      }
    },
    [apply],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setState((s) => ({ ...s, running: false }));
  }, []);

  // Hydrate the dashboard from a saved run (no pipeline replay needed). The
  // server route /api/runs/[id] returns the full HydratedRun JSON.
  const loadRun = useCallback(async (runId: string) => {
    abortRef.current?.abort();
    try {
      const res = await fetch(`/api/runs/${runId}`);
      if (!res.ok) throw new Error(`Load failed: ${res.status}`);
      const h = (await res.json()) as {
        run: { id: string; topic: string; status: string; phase: string | null; pct: number };
        findings: Finding[];
        claims: Claim[];
        spread: Spread | null;
        assessment: Assessment | null;
        draft: Draft | null;
        sources: SourceRef[];
      };
      setState({
        ...initial,
        runId: h.run.id,
        phase: (h.run.phase as Phase | null) ?? "done",
        phaseLabel: "Loaded from history",
        pct: 100,
        findings: h.findings,
        claims: h.claims,
        spread: h.spread,
        assessment: h.assessment,
        draft: h.draft,
        sources: h.sources,
      });
      // Drop the ?run=<id> from the address bar so the URL doesn't get stuck
      // pointing at a loaded run after the officer moves on.
      if (typeof window !== "undefined" && window.location.search.includes("run=")) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch (err) {
      setState((s) => ({ ...s, error: (err as Error).message }));
    }
  }, []);

  return { state, start, stop, loadRun };
}
