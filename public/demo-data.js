// Canned debates for demo mode — used by the server (lib/demo.js) when no API
// key is configured, and by the browser directly when the site is hosted
// statically (e.g. GitHub Pages). Pure data, no side effects.

export const DEMO_DEBATES = [
  {
    match: /tutor|lecture|teacher|classroom|video/i,
    topic: "AI tutors will beat video lectures.",
    rounds: [
      {
        pro: "A video can't see you're stuck. An AI tutor notices the wrong answer, asks why, and adapts in seconds. Lectures broadcast; tutors respond. Learning is a conversation, and only one of these can hold one.",
        con: "Adaptivity without rigor is noise. Video lectures are scripted, reviewed, and vetted by experts before a single student watches. A tutor that improvises can improvise wrongly — and a confident wrong answer is worse than a slow right one.",
        judge: { pro: 56, rationale: "PRO's conversation framing lands; CON's vetting point keeps it close." },
      },
      {
        pro: "Vetted, static — and skipped. Completion rates for lecture videos are dismal because nobody checks understanding. A tutor checks every turn. And rigor isn't lost: ground the tutor in the same vetted material, then let it teach interactively.",
        con: "Grounding helps but doesn't guarantee. When the tutor hallucinates in a classroom, who catches it — the student who doesn't know better? Schools need accountability, and a fixed curriculum is auditable in a way ten thousand live conversations never will be.",
        judge: { pro: 60, rationale: "PRO turns CON's rigor argument into a grounding plan; strong rebuttal." },
      },
      {
        pro: "Log every conversation and you get MORE accountability than video, not less: teachers see exactly where each student struggled. Ground every claim, surface the source, flag uncertainty. Adaptive AND auditable — that's the whole case.",
        con: "That's a roadmap, not a product. Today, at scale, in real schools with real bandwidth, the vetted lecture is still the dependable backbone. Tutors should assist it — not replace what provably works.",
        judge: { pro: 62, rationale: "PRO closes with adaptivity plus auditability; CON ends defensively." },
      },
    ],
    verdict: "PRO takes it: adaptivity with grounded, logged claims answered every rigor objection.",
  },
  {
    match: /homework|assignment|cheat/i,
    topic: "AI should be allowed for homework.",
    rounds: [
      {
        pro: "Banning AI for homework is banning the calculator in 1980. Students will use it anyway — the only question is whether schools teach them to use it well: to question it, verify it, and build with it.",
        con: "A calculator doesn't write your essay. Homework exists to build the muscle, and AI lifts the weight for you. Allow it unchecked and we'll graduate students fluent at prompting and helpless at thinking.",
        judge: { pro: 52, rationale: "Strong opening analogies on both sides; CON's muscle metaphor bites." },
      },
      {
        pro: "Then change the homework, not the tool. Ask for the chat log. Grade the questions the student asked, the errors they caught, the revision they made. That's MORE thinking made visible, not less.",
        con: "Which assumes every teacher has time to audit thirty chat logs per class, per night. Redesigning assessment nationwide is a decade of work. Until then, unrestricted AI means unverifiable homework.",
        judge: { pro: 58, rationale: "PRO's assess-the-process move reframes the debate convincingly." },
      },
      {
        pro: "Nobody said unrestricted. Allowed means taught: disclosure rules, AI-visible assignments, oral defenses. The decade of work has already started — pretending students aren't using it is how schools lose that decade.",
        con: "And nobody said forbidden forever — but permission should follow the redesign, not precede it. Sequence matters. Letting the tool in before the rules exist is how you get a lost cohort, not a prepared one.",
        judge: { pro: 57, rationale: "Both close well; PRO keeps the edge on realism about current usage." },
      },
    ],
    verdict: "PRO wins narrowly: teaching the tool beats pretending it isn't already in every pocket.",
  },
  {
    match: null, // generic fallback — topic is interpolated
    topic: null,
    rounds: [
      {
        pro: "Here's the heart of it: {TOPIC} The strongest evidence points one way — the benefits are concrete, near-term, and compounding, while the objections are mostly fears about implementation, and implementation is a solvable problem.",
        con: "Calling objections 'fears' doesn't answer them. Every failed big idea was once called concrete and near-term. The burden of proof sits with the motion, and so far we've heard confidence, not evidence.",
        judge: { pro: 53, rationale: "PRO frames well; CON's burden-of-proof point scores." },
      },
      {
        pro: "Evidence, then: every comparable shift we've measured produced the same curve — early friction, fast adaptation, durable gains. The pattern is the proof. Betting against it requires explaining why this time is different.",
        con: "Because context is different every time — that's not a dodge, it's the whole discipline of judgment. Patterns from other domains are analogies, not data. Show me results in THIS domain or the motion stays unproven.",
        judge: { pro: 55, rationale: "PRO's pattern argument lands; CON's demand for domain evidence is fair." },
      },
      {
        pro: "And in this domain the early results exist — small, yes, but uniformly positive, which is exactly what the start of the curve looks like. The cautious path isn't waiting; it's starting small, measuring hard, and scaling what works.",
        con: "Start small and measure — notice that's MY position wearing your colors. If the motion now means 'pilot carefully', the bold claim we started with has already been abandoned.",
        judge: { pro: 59, rationale: "PRO absorbs the objection into a concrete plan; CON's reframe comes late." },
      },
    ],
    verdict: "PRO takes it on points: a concrete start-small plan beat a late reframe.",
  },
];

export function pickDebate(topic) {
  const t = String(topic || "").trim();
  for (const debate of DEMO_DEBATES) {
    if (debate.match && debate.match.test(t)) return { ...debate, topic: debate.topic };
  }
  const generic = DEMO_DEBATES[DEMO_DEBATES.length - 1];
  const filled = {
    topic: t || "This house believes AI will do more good than harm.",
    rounds: generic.rounds.map((r) => ({
      ...r,
      pro: r.pro.replace("{TOPIC}", t ? `"${t}" is the right call.` : "the motion is the right call."),
    })),
    verdict: generic.verdict,
  };
  return filled;
}
