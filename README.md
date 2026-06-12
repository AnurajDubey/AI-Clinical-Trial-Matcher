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
  `public/sessions/`; the committed manifest starts empty. See "Recording &
  replaying sessions" below to create one.

ClinicalTrials.gov needs **no key** either way (free, open API).

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
a custom loop using the Anthropic SDK's native tool use — no agent framework like LangGraph or CrewAI. Each turn, the model chooses exactly one tool; the loop dispatches it, records the
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

`/api/agent` is the only route the UI calls. `/api/trials`, `/api/evaluate`,
and `/api/gap` are standalone routes left over from earlier build slices —
useful for poking at one piece in isolation (e.g. `evaluateTrial` on a single
trial via curl) without running the full agent loop.

## Recording & replaying sessions

The public demo replays **recorded sessions** — deterministic, free, and
nothing to abuse, since no key is in the wild.

```bash
npm run record -- --scenario=maria   # scripted persona (scripts/scenarios/)
npm run record -- --scenario=james   # the other scripted persona
npm run record                       # interactive — you type the patient side
```

Each run needs `ANTHROPIC_API_KEY` set (it drives the real controller loop).
Recordings land in `public/sessions/` and register themselves in
`public/sessions/index.json`; commit them and they appear under "Watch a
recorded session" in the UI. That manifest is currently empty — no sessions
have been recorded yet.

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
