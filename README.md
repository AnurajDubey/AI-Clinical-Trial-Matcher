# Clinical Trial Navigator

An agentic web app that helps a patient find clinical trials they might qualify
for — and that reasons like a navigator, not a search box.

Describe the patient in plain language. The agent interviews you (asking only
the questions that change the answer), searches the **live ClinicalTrials.gov
API**, reasons through each trial's eligibility criteria one by one, and sorts
trials into three buckets — **Likely qualifies / Near miss / Likely excluded**
— each with plain-language reasons. For near misses it goes one step further
and works out the *path to eligibility*: "eligible ~6 weeks after stopping X",
"get this biomarker test — if positive, this trial opens up", "excluded from
Cohort A but Cohort C fits".

> Decision-support only — not medical advice. Trial sites confirm final
> eligibility. All patients in examples and recordings are synthetic; the
> trials are real.

## Running it

```bash
npm install
cp .env.local.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev                        # http://localhost:3000
```

ClinicalTrials.gov needs **no key** (free, open API). Without an Anthropic key
the app still searches and pre-filters; the eligibility reasoning, intake
conversation, and gap analysis need the key.

## How it works

```
UI (chat | live reasoning trace | bucketed results)
        ▲  same AgentEvent stream either way
┌───────┴────────┐
│ LiveRunner     │ → /api/agent (SSE) → controller loop (real Claude + CT.gov)
│ ReplayRunner   │ → committed session JSON, re-emitted with pacing ($0, no key)
└────────────────┘
```

The **controller loop** ([lib/agent/controller.ts](lib/agent/controller.ts)) is
a custom loop on the Anthropic SDK's native tool use — no agent framework. Each
turn, the model chooses exactly one tool; the loop dispatches it, records the
observation into state, and repeats:

| Tool | What it does |
|---|---|
| `askPatient` | Surfaces the **highest-information-gain** question to the UI and pauses the run (the server is stateless — a serialized continuation round-trips through the client) |
| `searchTrials` | Queries CT.gov v2; code pre-filters (sex, age, geo distance) drop obvious mismatches before any LLM spend |
| `evaluateTrial` | LLM reasons criterion-by-criterion → MET / NOT_MET / UNKNOWN with reasons, via structured outputs |
| `computeGap` | Counterfactual reasoning on a near miss → the concrete path to eligibility |
| `finish` | Final plain-language wrap-up |

Four files explain the whole agent:

1. **State** — [lib/types.ts](lib/types.ts) (`AgentState`: profile, unknowns, candidates, verdicts, nearMissPaths)
2. **Controller loop** — [lib/agent/controller.ts](lib/agent/controller.ts) (the model decides; the loop dispatches)
3. **One reasoning step** — [lib/agent/evaluateTrial.ts](lib/agent/evaluateTrial.ts) (criteria split → structured verdicts)
4. **The Runner seam** — [lib/runner/live.ts](lib/runner/live.ts) vs [lib/runner/replay.ts](lib/runner/replay.ts) (same event stream, so the UI can't tell live from replay)

## Recording & replaying sessions

The public demo replays **recorded sessions** — deterministic, free, and
nothing to abuse, since no key is in the wild.

```bash
npm run record -- --scenario=maria   # scripted persona (scripts/scenarios/)
npm run record                       # interactive — you type the patient side
```

Recordings land in `public/sessions/` and register themselves in the manifest;
commit them and they appear under "Watch a recorded session" in the UI.

## Deploying

Standard Next.js deploy (e.g. Vercel). Replay works with zero configuration;
set `ANTHROPIC_API_KEY` in the environment to enable live mode. Long runs use
streaming responses (`maxDuration = 300` on the agent route).

## Stack

TypeScript end to end · Next.js App Router · React + Tailwind ·
`@anthropic-ai/sdk` with native tool use + structured outputs (zod) ·
ClinicalTrials.gov API v2 · no database, no auth, no agent framework.
