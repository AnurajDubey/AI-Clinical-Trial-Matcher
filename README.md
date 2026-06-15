# Clinical Trial Navigator

## Purpose

ClinicalTrials.gov is a keyword index over dense, jargon-heavy eligibility
criteria. A patient or caregiver can search it, but they can't easily tell
*which* trials they'd actually qualify for, which ones are close, or what
would have to change to get in.

This app is an agent that does that reading for you. Describe the patient in
plain language; the agent interviews you — asking only the questions that
would actually change the answer — searches the **live ClinicalTrials.gov
API**, and reasons through each trial's eligibility criteria one by one,
sorting results into **Likely qualifies / Near miss / Likely excluded** with
plain-language reasons. For near misses it goes one step further and works
out the *path to eligibility*: "eligible ~6 weeks after stopping X", "get this
biomarker test — if positive, this trial opens up", "excluded from Cohort A
but Cohort C fits". That gap reasoning is the part that turns a search box
into a navigator.


> Decision-support only — not medical advice. Trial sites confirm final
> eligibility. All patients in examples and recordings are synthetic; the
> trials are real.

## Running it

```bash
npm install
npm run dev                        # http://localhost:3000
```

There are two ways to see it work:

- **Live mode** — the real chat-driven navigator. Needs an Anthropic key:
  *every* turn, starting with your first message, calls Claude (to extract
  the patient profile and to decide the agent's next move).

  ```bash
  cp .env.local.example .env.local   # add your ANTHROPIC_API_KEY
  ```

- **Replay mode** — re-emits a recorded session through the identical UI and
  event stream, at $0 and with no key. Requires at least one recording in
  `public/sessions/` (create one with `npm run record` — see below).

ClinicalTrials.gov needs **no key** either way (free, open API).

## How it works

```
UI (chat | live reasoning trace | bucketed results)
        ▲  same AgentEvent stream either way
┌───────┴────────┐
│ LiveRunner     │ → /api/agent (SSE) → navigator loop (real Claude + CT.gov)
│ ReplayRunner   │ → committed session JSON, re-emitted with pacing ($0, no key)
└────────────────┘
```

It's a **two-agent system** — both are custom loops on the Anthropic SDK's
native tool use, with no agent framework (no LangGraph / CrewAI):

- **Navigator** ([lib/agent/controller.ts](lib/agent/controller.ts)) — owns the
  whole session (breadth). Each turn the model picks one tool; the loop
  dispatches it, records the observation into state, and repeats.
- **Eligibility-analyst** ([lib/agent/eligibilityAnalyst.ts](lib/agent/eligibilityAnalyst.ts))
  — a sub-agent the navigator spawns to judge **one** trial (depth). It runs
  its own short tool-use loop in isolated context (just that trial + the
  patient), pulls the full protocol narrative when the bullet criteria are
  ambiguous, and returns a criterion-by-criterion verdict. Its reasoning
  renders as a nested lane in the live trace.

The **navigator's** tools:

| Tool | What it does |
|---|---|
| `askPatient` | Surfaces the **highest-information-gain** question and pauses the run (stateless server — a serialized continuation round-trips through the client) |
| `searchTrials` | Queries CT.gov v2; code pre-filters (sex, age, geo distance) drop obvious mismatches before any LLM spend; candidates **accumulate and dedupe** across searches |
| `evaluateTrial` | Hands one trial to the **eligibility-analyst sub-agent**, which returns a per-criterion MET / NOT_MET / UNKNOWN verdict |
| `reviewUnknowns` | Aggregates UNKNOWN criteria across the in-play trials so the navigator can ask the one post-search question that resolves the most (info-gain, grounded in real trials) |
| `computeGap` | Counterfactual reasoning on a near miss → the concrete path to eligibility |
| `finish` | Final plain-language wrap-up |

The **eligibility-analyst's** tools: `getTrialDetail` (pull the full protocol
narrative on demand) and `finalizeVerdict` (submit the structured verdict).

Files that explain the whole thing:

1. **State** — [lib/types.ts](lib/types.ts) (`AgentState`: profile, unknowns, candidates, verdicts, nearMissPaths)
2. **Navigator loop** — [lib/agent/controller.ts](lib/agent/controller.ts) (the model decides; the loop dispatches)
3. **Sub-agent** — [lib/agent/eligibilityAnalyst.ts](lib/agent/eligibilityAnalyst.ts) (its own loop: fetch detail → reason → finalize verdict)
4. **The Runner seam** — [lib/runner/live.ts](lib/runner/live.ts) vs [lib/runner/replay.ts](lib/runner/replay.ts) (same event stream, so the UI can't tell live from replay)

`/api/agent` is the only route the UI calls. `/api/trials`, `/api/evaluate`,
and `/api/gap` are standalone routes left from earlier build slices — handy for
poking at one piece in isolation via curl. (`/api/evaluate` still uses the
one-shot [lib/agent/evaluateTrial.ts](lib/agent/evaluateTrial.ts); the navigator
path uses the sub-agent instead.)

## Recording & replaying sessions

The public demo replays **recorded sessions** — deterministic, free, and
nothing to abuse, since no key is in the wild.

```bash
npm run record -- --scenario=maria   # scripted persona (scripts/scenarios/)
npm run record -- --scenario=james   # the other scripted persona
npm run record                       # interactive — you type the patient side
```

Each run needs `ANTHROPIC_API_KEY` set (it drives the real navigator +
analyst loop). Recordings land in `public/sessions/` and register themselves in
`public/sessions/index.json`; commit them and they appear under "Watch a
recorded session" in the UI.

## Deploying

Standard Next.js deploy (e.g. Vercel). Before deploying a key-less public
demo, commit at least one recording — with an empty manifest and no key, the
start screen has nothing to replay and live mode fails on the first message.
Set `ANTHROPIC_API_KEY` in the environment to enable live mode. Long runs use
streaming responses (`maxDuration = 300` on the agent route).

## Stack

TypeScript end to end · Next.js App Router · React + Tailwind ·
`@anthropic-ai/sdk` with native tool use + structured outputs (zod) ·
ClinicalTrials.gov API v2 · no database, no auth, no agent framework.
