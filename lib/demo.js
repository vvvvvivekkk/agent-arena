// Demo mode: replays a canned debate through the same llm interface the Claude
// client implements, streaming word by word so the UI behaves identically with
// or without an API key.
import { pickDebate } from "../public/demo-data.js";

const sleep = (ms, signal) =>
  new Promise((resolve) => {
    if (!ms || signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });

export function makeDemoLLM({ delay = 34 } = {}) {
  let debate = null;
  return {
    mode: "demo",

    async speak({ side, topic, round, onToken, signal }) {
      debate ??= pickDebate(topic);
      const turn = debate.rounds[round - 1]?.[side] ?? "…";
      await sleep(delay * 8, signal);
      const words = turn.split(" ");
      let text = "";
      for (const word of words) {
        if (signal?.aborted) break;
        const fragment = (text ? " " : "") + word;
        text += fragment;
        onToken(fragment);
        await sleep(delay, signal);
      }
      return text;
    },

    async judge({ topic, round, final, signal }) {
      debate ??= pickDebate(topic);
      const scored = debate.rounds[round - 1]?.judge ?? { pro: 50, rationale: "Scores updated." };
      await sleep(delay * 16, signal);
      return {
        pro: scored.pro,
        con: 100 - scored.pro,
        rationale: final ? debate.verdict : scored.rationale,
      };
    },
  };
}
