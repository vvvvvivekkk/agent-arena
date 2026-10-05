// Agent Arena — front end.
// Talks to the server's SSE endpoint when one is available; when hosted
// statically (e.g. GitHub Pages) it replays the same canned debates fully
// client-side, through identical events, so the UI is the single renderer.
import { pickDebate } from "./demo-data.js";

const $ = (id) => document.getElementById(id);
const feed = $("feed");
const pods = { pro: $("podPro"), con: $("podCon") };
const statuses = { pro: $("statusPro"), con: $("statusCon") };
const fast = new URLSearchParams(location.search).get("fast") === "1";

let serverAvailable = null;
let activeSource = null;
let localAbort = null;
let running = false;
let currentBubble = null;
let scores = { pro: 50, con: 50 };

async function detectServer() {
  if (serverAvailable !== null) return serverAvailable;
  try {
    const r = await fetch("api/health", { signal: AbortSignal.timeout(2500) });
    const j = await r.json();
    serverAvailable = r.ok;
    $("modeBadge").textContent = j.mode === "live" ? "LIVE · CLAUDE API" : "DEMO REPLAY";
  } catch {
    serverAvailable = false;
    $("modeBadge").textContent = "STATIC DEMO";
  }
  return serverAvailable;
}

/* ——— rendering ——— */
const sideName = (s) => (s === "pro" ? "AGENT A · PRO" : "AGENT B · CON");

function addBubble(side, label) {
  $("feedEmpty")?.remove();
  const el = document.createElement("div");
  el.className = `bubble ${side}`;
  el.innerHTML = `<b></b><p><span class="txt"></span><span class="caret"></span></p>`;
  el.querySelector("b").textContent = label;
  feed.appendChild(el);
  feed.scrollTop = feed.scrollHeight;
  return el;
}

function setPod(side, state, text) {
  for (const s of ["pro", "con"]) {
    pods[s].classList.remove("thinking", "speaking");
  }
  if (side && state) pods[side].classList.add(state);
  if (side && text != null) statuses[side].textContent = text;
}

function setScores(pro, con, rationale) {
  scores = { pro, con };
  $("scorePro").textContent = pro;
  $("scoreCon").textContent = con;
  $("scoreFill").style.width = `${pro}%`;
  if (rationale) $("rationale").textContent = rationale;
}

function buildPips(rounds) {
  $("roundPips").innerHTML = Array.from({ length: rounds }, () => "<i></i>").join("");
}

function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

const handlers = {
  start({ rounds, mode }) {
    buildPips(rounds);
    $("liveDot").textContent = "● LIVE";
    $("liveDot").classList.add("on");
    if (mode === "demo" && serverAvailable) $("modeBadge").textContent = "DEMO REPLAY";
    setScores(50, 50, "The judge is seated. Scores update after every round.");
  },
  turn_start({ side, round }) {
    [...$("roundPips").children].forEach((pip, i) => pip.classList.toggle("on", i < round));
    setPod(side, "thinking", "thinking…");
    statuses[side === "pro" ? "con" : "pro"].textContent = "listening";
    currentBubble = addBubble(side, `${sideName(side)} — ROUND ${round}`);
  },
  token({ side, text }) {
    if (!currentBubble) return;
    setPod(side, "speaking", "speaking");
    currentBubble.querySelector(".txt").textContent += text;
    feed.scrollTop = feed.scrollHeight;
  },
  turn_end() {
    currentBubble?.querySelector(".caret")?.remove();
    currentBubble = null;
    setPod(null);
  },
  judge_start() {
    $("judgeName").textContent = "⚖ JUDGE IS SCORING…";
    $("judgeName").classList.add("scoring");
    statuses.pro.textContent = "awaiting scores";
    statuses.con.textContent = "awaiting scores";
  },
  judge({ round, pro, con, rationale, final }) {
    $("judgeName").textContent = "⚖ JUDGE";
    $("judgeName").classList.remove("scoring");
    setScores(pro, con, rationale);
    if (!final) {
      const el = addBubble("judge", `⚖ JUDGE — AFTER ROUND ${round}`);
      el.querySelector(".caret").remove();
      el.querySelector(".txt").textContent = `${pro}–${con}. ${rationale}`;
    }
  },
  verdict({ winner, pro, con, rationale }) {
    const title = $("verdictTitle");
    title.textContent = winner === "draw" ? "IT'S A DRAW" : winner === "pro" ? "PRO WINS" : "CON WINS";
    title.classList.toggle("pro", winner === "pro");
    $("verdictScore").textContent = `${pro} — ${con}`;
    $("verdictRationale").textContent = rationale;
    setTimeout(() => { $("verdictOverlay").hidden = false; }, fast ? 0 : 700);
    statuses.pro.textContent = winner === "pro" ? "victorious 🏆" : "defeated, gracefully";
    statuses.con.textContent = winner === "con" ? "victorious 🏆" : "defeated, gracefully";
  },
  error({ message }) {
    toast(message);
  },
  done() {
    running = false;
    $("start").disabled = false;
    $("liveDot").textContent = "● STANDBY";
    $("liveDot").classList.remove("on");
    setPod(null);
    currentBubble?.querySelector(".caret")?.remove();
    currentBubble = null;
  },
};

function handle(type, data) {
  handlers[type]?.(data);
}

/* ——— debate sources ——— */
function runServerDebate(topic, rounds) {
  const params = new URLSearchParams({ topic, rounds: String(rounds) });
  if (fast) params.set("fast", "1");
  activeSource = new EventSource(`api/debate?${params}`);
  for (const type of Object.keys(handlers)) {
    activeSource.addEventListener(type, (e) => {
      handle(type, JSON.parse(e.data));
      if (type === "done") { activeSource.close(); activeSource = null; }
    });
  }
  activeSource.onerror = () => {
    if (running) { handle("error", { message: "Connection lost." }); handle("done", {}); }
    activeSource?.close();
    activeSource = null;
  };
}

// Static hosting fallback: same debate, same events, no server.
async function runLocalDebate(topic, rounds) {
  localAbort = new AbortController();
  const signal = localAbort.signal;
  const delay = fast ? 0 : 34;
  const sleep = (ms) => new Promise((r) => setTimeout(r, signal.aborted ? 0 : ms));
  const debate = pickDebate(topic);
  const total = Math.min(rounds, debate.rounds.length);
  let last = { pro: 50, con: 50, rationale: "" };

  handle("start", { topic, rounds: total, mode: "demo" });
  for (let round = 1; round <= total && !signal.aborted; round++) {
    for (const side of ["pro", "con"]) {
      if (signal.aborted) break;
      handle("turn_start", { side, round });
      await sleep(delay * 8);
      const words = (debate.rounds[round - 1][side] ?? "…").split(" ");
      for (let i = 0; i < words.length && !signal.aborted; i++) {
        handle("token", { side, text: (i ? " " : "") + words[i] });
        await sleep(delay);
      }
      handle("turn_end", { side, round });
    }
    if (signal.aborted) break;
    handle("judge_start", { round });
    await sleep(delay * 16);
    const j = debate.rounds[round - 1].judge;
    const final = round === total;
    last = { pro: j.pro, con: 100 - j.pro, rationale: final ? debate.verdict : j.rationale };
    handle("judge", { round, ...last, final });
  }
  if (!signal.aborted) handle("verdict", { winner: last.pro >= last.con ? "pro" : "con", ...last });
  handle("done", {});
}

/* ——— controls ——— */
async function startDebate() {
  if (running) return;
  running = true;
  $("start").disabled = true;
  $("verdictOverlay").hidden = true;
  feed.innerHTML = "";
  currentBubble = null;
  const topic = $("topic").value.trim() || "AI tutors will beat video lectures.";
  const rounds = Number($("rounds").value) || 3;
  if (await detectServer()) runServerDebate(topic, rounds);
  else runLocalDebate(topic, rounds);
}

$("start").addEventListener("click", startDebate);
$("topic").addEventListener("keydown", (e) => { if (e.key === "Enter") startDebate(); });
$("rematch").addEventListener("click", () => {
  activeSource?.close(); activeSource = null;
  localAbort?.abort();
  running = false; $("start").disabled = false;
  startDebate();
});
$("presets").addEventListener("click", (e) => {
  const topic = e.target?.dataset?.topic;
  if (topic) { $("topic").value = topic; if (!running) startDebate(); }
});

detectServer();
