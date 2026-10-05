// Debate orchestrator — provider-agnostic.
// Drives PRO and CON debater agents plus a judge agent in a round loop and
// reports everything through an event emitter, so the same loop runs against
// the Claude API (lib/claude.js), the canned demo (lib/demo.js), or a test fake.
//
// Event stream (in order):
//   start      {topic, rounds, mode}
//   turn_start {side, round}            side: "pro" | "con"
//   token      {side, text}             streamed fragments of the current turn
//   turn_end   {side, round, text}
//   judge_start{round}
//   judge      {round, pro, con, rationale, final}   pro+con === 100
//   verdict    {winner, pro, con, rationale}
//   error      {message}
//   done       {}

export const SIDES = ["pro", "con"];

export function clampScore(value, fallback = 50) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(99, Math.max(1, Math.round(n)));
}

// Judges are instructed to answer with strict JSON, but parse defensively:
// strip code fences, find the first JSON object, clamp scores.
export function parseJudge(raw) {
  let text = String(raw ?? "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) text = text.slice(start, end + 1);
  let parsed = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {};
  }
  const pro = clampScore(parsed.pro);
  return {
    pro,
    con: 100 - pro,
    rationale: typeof parsed.rationale === "string" && parsed.rationale.trim()
      ? parsed.rationale.trim()
      : "Scores updated.",
  };
}

export async function runDebate({ topic, rounds = 3, llm, emit, signal }) {
  const transcript = []; // {side, round, text}
  const aborted = () => Boolean(signal?.aborted);
  let lastJudge = { pro: 50, con: 50, rationale: "" };

  emit("start", { topic, rounds, mode: llm.mode ?? "live" });
  try {
    for (let round = 1; round <= rounds && !aborted(); round++) {
      for (const side of SIDES) {
        if (aborted()) break;
        emit("turn_start", { side, round });
        const text = await llm.speak({
          side,
          topic,
          round,
          rounds,
          transcript,
          signal,
          onToken: (fragment) => {
            if (!aborted() && fragment) emit("token", { side, text: fragment });
          },
        });
        transcript.push({ side, round, text });
        emit("turn_end", { side, round, text });
      }
      if (aborted()) break;
      const final = round === rounds;
      emit("judge_start", { round });
      lastJudge = await llm.judge({ topic, round, rounds, transcript, final, signal });
      emit("judge", { round, ...lastJudge, final });
    }
    if (!aborted()) {
      const winner = lastJudge.pro > lastJudge.con ? "pro" : lastJudge.pro < lastJudge.con ? "con" : "draw";
      emit("verdict", { winner, ...lastJudge });
    }
  } catch (err) {
    if (!aborted()) emit("error", { message: err?.message ?? "Debate failed." });
  } finally {
    emit("done", {});
  }
}
