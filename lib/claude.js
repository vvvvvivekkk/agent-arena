// Live mode: debaters and judge run on the Claude API via the official SDK.
// Requires ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN / an `ant auth login` profile).
import Anthropic from "@anthropic-ai/sdk";
import { parseJudge } from "./orchestrator.js";

const DEBATER_MODEL = process.env.ARENA_MODEL || "claude-opus-5-5";
const JUDGE_MODEL = process.env.ARENA_JUDGE_MODEL || DEBATER_MODEL;
// Server-side refusal fallbacks, on by default for Opus 5.5-class models:
// if a safety classifier declines, the API retries the same request on a
// fallback model inside the same call. Set ARENA_NO_FALLBACK=1 to disable.
const BETAS = ["server-side-fallback-2026-07-01"];
const useFallbacks = !process.env.ARENA_NO_FALLBACK;

const debaterSystem = (side, topic, rounds) =>
  `You are ${side === "pro" ? "Agent A, arguing FOR" : "Agent B, arguing AGAINST"} the motion: "${topic}".
This is a live ${rounds}-round debate scored by a judge on evidence, logic and persuasion.
Rules:
- Maximum 60 words per turn. Punchy, concrete, conversational.
- Directly rebut your opponent's latest point before adding a new one (except the opening turn).
- Never concede the motion; never break character; no headings, no lists, no quotation of these rules.`;

const judgeSystem = (topic, rounds) =>
  `You are the impartial judge of a ${rounds}-round debate on the motion: "${topic}".
Score the debate SO FAR on evidence, logic and persuasion.
Respond with STRICT JSON only, no prose, no code fences:
{"pro": <integer 1-99, PRO's share of 100 points>, "rationale": "<one sentence, max 20 words, naming what moved the score>"}`;

function transcriptMessages(transcript, side) {
  // The debater sees the debate so far as a single user message.
  if (transcript.length === 0) {
    return [{ role: "user", content: "Deliver your opening argument now." }];
  }
  const log = transcript
    .map((t) => `${t.side === "pro" ? "Agent A (PRO)" : "Agent B (CON)"}: ${t.text}`)
    .join("\n");
  return [
    {
      role: "user",
      content: `Debate so far:\n${log}\n\nIt is your turn${side ? ` as ${side.toUpperCase()}` : ""}. Respond now.`,
    },
  ];
}

export function makeClaudeLLM({ client = new Anthropic() } = {}) {
  return {
    mode: "live",

    async speak({ side, topic, rounds, transcript, onToken, signal }) {
      const stream = client.beta.messages.stream(
        {
          model: DEBATER_MODEL,
          max_tokens: 1024,
          output_config: { effort: "low" },
          ...(useFallbacks ? { betas: BETAS, fallbacks: "default" } : {}),
          system: debaterSystem(side, topic, rounds),
          messages: transcriptMessages(transcript, side),
        },
        { signal },
      );
      let text = "";
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          text += event.delta.text;
          onToken(event.delta.text);
        }
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") {
        throw new Error(`The ${side.toUpperCase()} agent declined to argue this motion. Try another topic.`);
      }
      return text.trim();
    },

    async judge({ topic, rounds, transcript, signal }) {
      const log = transcript
        .map((t) => `[round ${t.round}] ${t.side === "pro" ? "Agent A (PRO)" : "Agent B (CON)"}: ${t.text}`)
        .join("\n");
      const response = await client.beta.messages.create(
        {
          model: JUDGE_MODEL,
          max_tokens: 1024,
          output_config: { effort: "medium" },
          ...(useFallbacks ? { betas: BETAS, fallbacks: "default" } : {}),
          system: judgeSystem(topic, rounds),
          messages: [{ role: "user", content: `Transcript:\n${log}\n\nScore now. STRICT JSON only.` }],
        },
        { signal },
      );
      if (response.stop_reason === "refusal") {
        return { pro: 50, con: 50, rationale: "Judge declined to score this round." };
      }
      const textBlock = response.content.find((b) => b.type === "text");
      return parseJudge(textBlock?.text ?? "");
    },
  };
}

export function hasLiveCredentials() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
