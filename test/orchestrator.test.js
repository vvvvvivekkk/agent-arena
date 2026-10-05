import { test } from "node:test";
import assert from "node:assert/strict";
import { runDebate, parseJudge, clampScore } from "../lib/orchestrator.js";

function makeFakeLLM() {
  return {
    mode: "demo",
    async speak({ side, round, onToken }) {
      onToken(`${side}-r${round} `);
      onToken("argument");
      return `${side}-r${round} argument`;
    },
    async judge({ round, final }) {
      return { pro: 50 + round * 4, con: 50 - round * 4, rationale: final ? "final" : `round ${round}` };
    },
  };
}

test("runDebate emits the full event sequence in order", async () => {
  const events = [];
  await runDebate({
    topic: "Testing beats guessing.",
    rounds: 2,
    llm: makeFakeLLM(),
    emit: (type, data) => events.push({ type, data }),
  });

  const types = events.map((e) => e.type);
  assert.deepEqual(types, [
    "start",
    "turn_start", "token", "token", "turn_end",   // pro r1
    "turn_start", "token", "token", "turn_end",   // con r1
    "judge_start", "judge",
    "turn_start", "token", "token", "turn_end",   // pro r2
    "turn_start", "token", "token", "turn_end",   // con r2
    "judge_start", "judge",
    "verdict",
    "done",
  ]);

  assert.equal(events[0].data.topic, "Testing beats guessing.");
  assert.equal(events[0].data.mode, "demo");

  const judges = events.filter((e) => e.type === "judge");
  assert.equal(judges[0].data.pro, 54);
  assert.equal(judges[0].data.final, false);
  assert.equal(judges[1].data.pro, 58);
  assert.equal(judges[1].data.final, true);

  const verdict = events.find((e) => e.type === "verdict");
  assert.equal(verdict.data.winner, "pro");
  assert.equal(verdict.data.pro + verdict.data.con, 100);
  assert.equal(verdict.data.rationale, "final");
});

test("runDebate gives debaters the transcript so far", async () => {
  const seen = [];
  const llm = {
    async speak({ side, transcript, onToken }) {
      seen.push(transcript.length);
      onToken("x");
      return `${side} says x`;
    },
    async judge() {
      return { pro: 40, con: 60, rationale: "con leads" };
    },
  };
  const events = [];
  await runDebate({ topic: "t", rounds: 1, llm, emit: (t, d) => events.push({ t, d }) });
  assert.deepEqual(seen, [0, 1]); // pro opens with empty transcript, con sees pro's turn
  assert.equal(events.find((e) => e.t === "verdict").d.winner, "con");
});

test("runDebate reports llm failures as an error event and still finishes", async () => {
  const llm = {
    async speak() { throw new Error("model exploded"); },
    async judge() { return { pro: 50, con: 50, rationale: "" }; },
  };
  const events = [];
  await runDebate({ topic: "t", rounds: 1, llm, emit: (t, d) => events.push({ t, d }) });
  const types = events.map((e) => e.t);
  assert.ok(types.includes("error"));
  assert.equal(types.at(-1), "done");
  assert.ok(!types.includes("verdict"));
  assert.equal(events.find((e) => e.t === "error").d.message, "model exploded");
});

test("runDebate stops cleanly when aborted", async () => {
  const controller = new AbortController();
  const llm = {
    async speak({ onToken }) {
      onToken("one");
      controller.abort();
      return "one";
    },
    async judge() { return { pro: 50, con: 50, rationale: "" }; },
  };
  const events = [];
  await runDebate({ topic: "t", rounds: 3, llm, emit: (t) => events.push(t), signal: controller.signal });
  assert.ok(!events.includes("verdict"));
  assert.equal(events.at(-1), "done");
});

test("parseJudge handles strict JSON, fences, prose and garbage", () => {
  assert.deepEqual(parseJudge('{"pro": 62, "rationale": "clear evidence"}'),
    { pro: 62, con: 38, rationale: "clear evidence" });
  assert.deepEqual(parseJudge('```json\n{"pro": 30, "rationale": "con leads"}\n```'),
    { pro: 30, con: 70, rationale: "con leads" });
  assert.equal(parseJudge('Here is my score: {"pro": 55, "rationale": "close"} as requested.').pro, 55);
  const garbage = parseJudge("no json here at all");
  assert.equal(garbage.pro, 50);
  assert.equal(garbage.con, 50);
  assert.ok(garbage.rationale.length > 0);
});

test("clampScore keeps scores in 1..99 and survives non-numbers", () => {
  assert.equal(clampScore(150), 99);
  assert.equal(clampScore(-20), 1);
  assert.equal(clampScore("72"), 72);
  assert.equal(clampScore("huh"), 50);
  assert.equal(clampScore(undefined, 33), 33);
});
