// Agent Arena server — zero-framework Node http server.
// Serves the UI from /public and streams debates over Server-Sent Events.
//
//   GET /api/debate?topic=...&rounds=3[&demo=1][&fast=1]   → SSE event stream
//
// With ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) set, debates run live on
// the Claude API; otherwise — or with ?demo=1 — a canned debate is replayed
// through the identical pipeline.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runDebate } from "./lib/orchestrator.js";
import { makeDemoLLM } from "./lib/demo.js";
import { makeClaudeLLM, hasLiveCredentials } from "./lib/claude.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "public");
const PORT = Number(process.env.PORT) || 3000;
const MAX_ROUNDS = 5;
const MAX_TOPIC_LENGTH = 140;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(PUBLIC_DIR, path.normalize(requested));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
}

function handleDebate(req, res, url) {
  const topic = (url.searchParams.get("topic") ?? "").slice(0, MAX_TOPIC_LENGTH).trim()
    || "AI tutors will beat video lectures.";
  const rounds = Math.min(MAX_ROUNDS, Math.max(1, Number(url.searchParams.get("rounds")) || 3));
  const fast = url.searchParams.get("fast") === "1";
  const wantsDemo = url.searchParams.get("demo") === "1" || !hasLiveCredentials();
  const llm = wantsDemo ? makeDemoLLM({ delay: fast ? 0 : 34 }) : makeClaudeLLM();

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": agent-arena\n\n");

  const abort = new AbortController();
  req.on("close", () => abort.abort());

  const emit = (type, data) => {
    if (!res.writableEnded && !abort.signal.aborted) {
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  runDebate({ topic, rounds, llm, emit, signal: abort.signal }).finally(() => {
    if (!res.writableEnded) res.end();
  });
}

export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname === "/api/debate") return handleDebate(req, res, url);
    if (url.pathname === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, mode: hasLiveCredentials() ? "live" : "demo" }));
    }
    return serveStatic(req, res, url.pathname);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, () => {
    const mode = hasLiveCredentials() ? "LIVE (Claude API)" : "DEMO (no API key found)";
    console.log(`⚔  Agent Arena on http://localhost:${PORT} — mode: ${mode}`);
  });
}
