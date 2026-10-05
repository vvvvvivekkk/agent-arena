import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server.js";

const server = createServer();
await new Promise((resolve) => server.listen(0, resolve));
const base = `http://localhost:${server.address().port}`;
after(() => server.close());

test("serves the arena UI", async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  const html = await res.text();
  assert.match(html, /AGENT ARENA/);
  assert.match(html, /app\.js/);
});

test("serves static assets with correct types and blocks traversal", async () => {
  const css = await fetch(`${base}/style.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get("content-type"), /text\/css/);
  const missing = await fetch(`${base}/nope.js`);
  assert.equal(missing.status, 404);
  const traversal = await fetch(`${base}/..%2f..%2fetc%2fpasswd`);
  assert.notEqual(traversal.status, 200);
});

test("health endpoint reports mode", async () => {
  const res = await fetch(`${base}/api/health`);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(["live", "demo"].includes(body.mode));
});

test("demo debate streams a complete SSE event sequence", async () => {
  const res = await fetch(`${base}/api/debate?demo=1&fast=1&rounds=2&topic=AI+tutors+will+beat+video+lectures.`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/event-stream/);
  const raw = await res.text();

  const events = [...raw.matchAll(/^event: (\w+)\ndata: (.*)$/gm)]
    .map((m) => ({ type: m[1], data: JSON.parse(m[2]) }));
  const types = events.map((e) => e.type);

  assert.equal(types[0], "start");
  assert.equal(events[0].data.mode, "demo");
  assert.equal(events[0].data.rounds, 2);
  assert.equal(types.filter((t) => t === "turn_start").length, 4);
  assert.equal(types.filter((t) => t === "judge").length, 2);
  assert.ok(types.includes("token"));
  assert.ok(types.includes("verdict"));
  assert.equal(types.at(-1), "done");

  const verdict = events.find((e) => e.type === "verdict");
  assert.equal(verdict.data.pro + verdict.data.con, 100);
  assert.ok(["pro", "con", "draw"].includes(verdict.data.winner));

  // streamed tokens reassemble into the turn_end text
  const firstTurnEnd = events.find((e) => e.type === "turn_end");
  const proTokens = events
    .filter((e) => e.type === "token" && e.data.side === "pro")
    .map((e) => e.data.text).join("");
  assert.ok(proTokens.startsWith(firstTurnEnd.data.text.slice(0, 20)));
});

test("rounds and topic are clamped to sane limits", async () => {
  const res = await fetch(`${base}/api/debate?demo=1&fast=1&rounds=99&topic=${"x".repeat(500)}`);
  const raw = await res.text();
  const start = JSON.parse(raw.match(/^event: start\ndata: (.*)$/m)[1]);
  assert.equal(start.rounds, 5);
  assert.ok(start.topic.length <= 140);
});
