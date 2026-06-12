# CLAUDE.md — Clinical Trial Navigator

> **What this file is.** The build spec and standing context for this project.
> Use it two ways: (1) paste its contents as the kickoff prompt for Fable to
> generate the project, and (2) keep it committed in the repo root so Claude Code
> auto-loads it as project context on every session. Same content, two roles.
>
> **Build philosophy:** ship in 3–7 days with an AI coding tool. The human's job
> is to *understand* the generated code, not hand-type it. Build in vertical
> slices (see Build Order); commit after each working slice.

---

## 1. What we're building

A web app that helps a patient find clinical trials they might qualify for — but
that reasons like a navigator, not a search box.

The user enters a patient profile (condition, age, location, key clinical facts,
prior treatments). The app queries the **real, live ClinicalTrials.gov API**,
reasons over each trial's eligibility criteria one by one, and returns three
buckets: **Qualifies**, **Near-miss**, **Excluded** — each with a plain-language
explanation of *why*.

Two things make it more than a keyword filter (these are the point — build them):

- **Differentiator #1 — Near-miss gap reasoning.** For trials the patient is
  *close* to qualifying for, the agent reasons about *what would change the
  verdict*: "needs a 4-week washout from drug X → eligible ~6 weeks after
  stopping," "needs a biomarker test you haven't had → if positive, this opens
  up," "excluded from Cohort A (treatment-naïve only) but eligible for Cohort C."
  This turns "trial search" into "trial navigation."
- **Differentiator #2 — Info-gain conversational intake.** Instead of a static
  form, the agent *interviews* the patient, deciding the single highest-value
  question to ask next (the one that rules the most trials in/out) and deciding
  when it has enough to start matching.

**Goal of the project:** demonstrate to a health-tech startup that the builder
can ship a real, deployed, agentic AI product end-to-end. It must look like a
real product and behave like one. Polish matters more than feature count.

---

## 2. Stack

All-TypeScript, single repo. Keep it lean.

- **Language:** TypeScript, end to end.
- **Framework:** Next.js (App Router) — frontend + API routes in one repo.
- **UI:** React + Tailwind. Optional: a clean component lib (e.g. shadcn/ui).
  Include a streaming panel that shows the agent's live reasoning trace.
- **LLM:** Claude via the official Anthropic SDK (`@anthropic-ai/sdk`), used
  **directly**, with **native tool use** to run the agent loop. Use structured
  (JSON) outputs for the reasoning steps. Stream the live reasoning.
- **External data:** ClinicalTrials.gov API v2 (REST, JSON) via `fetch`.
  Responses cached to local JSON for the example patients.
- **Persistence:** none. Recorded demo sessions are static JSON files in the repo.
- **Deploy (later):** Vercel — static export for the public replay demo, plus a
  serverless route for optional live mode.

### Do NOT use (deliberate choices — do not add these)

- ❌ **No agent framework** — no LangGraph, no CrewAI, no AutoGen. The agent is a
  custom controller loop built on the SDK's tool use. At this complexity the SDK
  already provides everything the loop needs.
- ❌ **Not the Claude Agent SDK** — that's for autonomous coding/computer-use
  agents; wrong shape and overkill here. Use the plain API SDK (`@anthropic-ai/sdk`).
- ❌ **No database / no Supabase** — there is nothing to persist. Replay sessions
  are static JSON. Do not add a DB.
- ❌ **No auth, no accounts, no multi-tenancy.** One polished flow.
- ❌ **No API key for ClinicalTrials.gov** — it is free and open. If generated
  code adds auth for CT.gov, that's a mistake; remove it.

---

## 3. Architecture

```
┌──────────────────────── UI (Next.js / React) ─────────────────────────┐
│  Intake chat panel   │  Live reasoning trace  │  Results (qualify/near) │
└────────────────────────────────┬───────────────────────────────────────┘
                                 │ events
┌──────────────────── RUNNER  (Live | Replay) ─────────────────────────┐
│  LiveRunner   → real CT.gov API + real Claude calls (needs key)        │
│  ReplayRunner → replays recorded session JSON (no key, $0, no abuse)    │
└────────────────────────────────┬───────────────────────────────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │   AGENT CONTROLLER LOOP   │
                    │  while not done:          │
                    │   1. ask model: next move?│ ◄── the model DECIDES the
                    │   2. dispatch chosen tool │     next action. THIS is
                    │   3. record observation   │     what makes it an agent.
                    │   4. update state         │
                    └─────────┬────────────────┘
                              │ model picks ONE tool per turn
   ┌─────────────┬────────────┼──────────────┬──────────────┐
   ▼             ▼            ▼              ▼              ▼
 askPatient  searchTrials  evaluateTrial  computeGap     finish
 (→UI, wait) (→CT.gov API) (→ LLM call)   (→ LLM call)   (→ results)
```

The **Runner** is an interface with two implementations that emit the *same*
event stream, so the UI can't tell them apart:
- `LiveRunner` actually runs the loop (calls Claude + CT.gov).
- `ReplayRunner` reads a recorded session JSON and re-emits the recorded events
  with streaming animation.

This is what makes the public demo free and unabusable: the public build is a
**static frontend running `ReplayRunner`** off committed JSON — no server, no key
in the wild, nothing to abuse, and deterministic (it always hits the impressive
near-miss beat). Live mode runs behind the builder's own key via a Next API route.

---

## 4. The agent

### State (what the agent knows)

```ts
type Verdict = "MET" | "NOT_MET" | "UNKNOWN";

interface PatientProfile {
  condition?: string;
  age?: number;
  sex?: string;
  location?: { city?: string; lat?: number; lon?: number };
  stage?: string;
  biomarkers?: Record<string, string>;   // e.g. { HER2: "positive" }
  priorTreatments?: string[];
  comorbidities?: string[];
}

interface AgentState {
  profile: PatientProfile;
  unknowns: string[];                     // high-value fields still missing
  candidates: Trial[];                    // trials pulled from CT.gov
  verdicts: Record<string, {             // per trial (keyed by nctId)
    status: "QUALIFIES" | "NEAR_MISS" | "EXCLUDED";
    criteria: { text: string; verdict: Verdict; reason: string }[];
  }>;
  nearMissPaths: Record<string, string>;  // nctId -> path to eligibility (#1)
  history: unknown[];                     // running transcript / tool log
  done: boolean;
}
```

### The five tools (declared to the SDK via tool use)

The model chooses one per turn; the controller dispatches it, records the result
into state, and loops.

- **`askPatient(question)`** — surface a question to the UI and wait for the
  user's answer; update `profile`. The model picks the *highest-value* question
  given current `profile`/`unknowns` (this is differentiator #2).
- **`searchTrials(query)`** — build a query from the profile and call the
  ClinicalTrials.gov API; populate `candidates`.
- **`evaluateTrial(nctId)`** — LLM reasons over one trial's `eligibilityCriteria`
  (and `armGroups[].description`) criterion-by-criterion → `MET / NOT_MET /
  UNKNOWN` each, with a short reason; classify the trial.
- **`computeGap(nctId)`** — for a near-miss, LLM counterfactual reasoning →
  the path to eligibility (washout timing / missing test / required prior
  therapy / a different cohort). This is differentiator #1.
- **`finish()`** — produce the final results view.

### Controller loop (the human owns this)

```
state = seedFromInitialMessage(userText)
while (!state.done) {
  decision = await model.decideNextAction(state)   // SDK call w/ tools
  result   = await dispatch(decision.tool, decision.args, state)
  state    = applyResult(state, decision, result)
}
return state   // qualifies / near-miss + paths / excluded, with reasons
```

### Safety / trust boundary (propose → confirm)

This is medical-adjacent, so the agent **proposes, it does not promise**:
- It never asserts "you qualify" as a guarantee — eligibility is confirmed by the
  trial site. Frame matches with confidence and flag what a clinician must verify.
- Near-miss paths are *suggested* paths, not medical advice.
- Any outbound action (e.g. drafting outreach to a coordinator) requires an
  explicit human confirm before it happens.
- Keep "this is decision-support, not medical advice" framing visible in the UI.

---

## 5. ClinicalTrials.gov API v2 reference

**No API key. Free and open.**

- **Search:** `GET https://clinicaltrials.gov/api/v2/studies`
  - Params: `query.cond` (condition), `query.intr` (drug/intervention),
    `query.term` (broad — searches everywhere, prefer the specific ones),
    `query.locn` (location), `filter.overallStatus=RECRUITING`, `pageSize`,
    `pageToken` (pagination), `fields` (trim payload), `format=json`.
  - Enums are **exact, case-sensitive strings**: status `RECRUITING` /
    `ACTIVE_NOT_RECRUITING` / etc.; phases `PHASE1` `PHASE2` `PHASE3` `PHASE4`
    `EARLY_PHASE1` `NA` (not "Phase 1").
- **Detail:** `GET https://clinicaltrials.gov/api/v2/studies/{nctId}`

### Response fields that matter

```
studies[].protocolSection
  ├─ identificationModule.nctId, .briefTitle
  ├─ statusModule.overallStatus
  ├─ conditionsModule.conditions[]
  ├─ designModule.phases[], .enrollmentInfo.count
  ├─ armsInterventionsModule
  │     armGroups[]   { label, type, description, interventionNames[] }
  │       // ⚠ descriptions carry PRIOR-THERAPY logic and COHORT splits —
  │       //   read these too, not just eligibilityCriteria
  │     interventions[] { type, name, description }
  ├─ eligibilityModule           ← CORE
  │     eligibilityCriteria       // free text: "Inclusion Criteria:\n* ...
  │                               //             Exclusion Criteria:\n* ..."
  │     sex                       // "ALL" | "MALE" | "FEMALE"  (code pre-filter)
  │     minimumAge                // string WITH unit, e.g. "18 Years" — parse it
  │     maximumAge                // ⚠ OFTEN ABSENT — guard for missing
  │     stdAges[]                 // ["ADULT","OLDER_ADULT"], "CHILD" if peds
  │     healthyVolunteers
  └─ contactsLocationsModule
        centralContacts[] { name, role, phone, email }   // outreach draft
        locations[] { facility, city, state, country,
                      geoPoint{lat,lon}, contacts[] }     // geo distance filter
studies[].derivedSection.conditionBrowseModule.meshes[]   // normalized terms
```

### Gotchas (confirmed against the live API)

- `maximumAge` is missing on many trials — guard for it.
- Ages are unit-strings ("18 Years"), not numbers — parse them.
- Locations skew international — filter by `geoPoint` distance client-side rather
  than trusting `query.locn`.
- Arrays (`conditions`, `locations`, `armGroups`) can be null/empty — guard.
- `eligibilityCriteria` reliably uses `Inclusion Criteria:` / `Exclusion
  Criteria:` headers with bullet lists — **split on those headers** before
  sending to the LLM (hand it clean inclusion/exclusion lists separately).

---

## 6. Key design rules

- **Pre-filter in code before spending LLM calls.** Use the structured fields
  (`sex`, `minimumAge`/`maximumAge`, `geoPoint` distance) to drop obviously
  ineligible trials *before* any LLM reasoning. Cheaper and more reliable.
- **LLM only on the prose.** Reserve LLM calls for `eligibilityCriteria` +
  `armGroups[].description`, where real reasoning is needed.
- **Structured outputs.** `evaluateTrial`, classification, `computeGap`, and
  profile updates should return parseable JSON.
- **Synthetic patients only.** Patient profiles are example personas. No real PHI.
  (The *trials* are real, from the live API; the *patients* are fictional.)

---

## 7. Build order (vertical slices — build in this sequence)

Each slice is independently demoable. Commit after each. If time runs out, stop
at slice 3 or 4 with something real.

1. **Fetch + list.** Query CT.gov for one condition, render the returned trials
   as a list. *(No key needed — CT.gov is open.)*
2. **Evaluate one trial.** `evaluateTrial` — LLM reasons over a single trial's
   criteria → MET / NOT_MET / UNKNOWN per criterion. *(First LLM call — needs the
   Anthropic key in `.env.local`.)*
3. **Classify + results UI.** Bucket trials into Qualifies / Near-miss / Excluded
   with reasons; build the results view.
4. **Gap reasoning (#1).** `computeGap` on the near-misses → path to eligibility.
5. **Intake loop (#2).** The conversational, info-gain `askPatient` loop driving
   the controller.
6. **Runner + replay + deploy.** Implement `LiveRunner`/`ReplayRunner`, record
   2–3 example sessions to JSON, ship the static replay build to Vercel.

---

## 8. Example patients (synthetic — for demo + replay recording)

- **Maria — 54, metastatic HER2+ breast cancer, San Diego, prior trastuzumab.**
  Hero scenario. Shows: intake asking about receptor status (#2); a clean
  Qualifies; near-misses (a trial needing a biomarker test she hasn't had → "get
  the test, if positive this opens up"; a trial needing a washout → "eligible
  ~6 weeks after stopping"; a cohort split where she's excluded from a
  treatment-naïve cohort but eligible for another). This is the demo's money shot.
- **James — 67, Parkinson's, rural Montana, on levodopa.** Shows location as a
  real constraint + a timing near-miss (washout from levodopa → a date).
- **Aiden — 8, rare genetic condition** *(optional)*. Shows sparse trial
  availability and heavy UNKNOWN-driven intake (agent drills on the specific
  mutation).

---

## 9. Constraints & guardrails (consolidated)

- Custom agent on the Anthropic SDK + tool use. No framework. Not the Agent SDK.
- No database, no auth, no multi-tenancy. One polished flow.
- No API key for ClinicalTrials.gov. Anthropic key lives in `.env.local`
  (gitignored), added *after* the first generation.
- Synthetic patients only; real trials.
- The agent proposes with confidence and flags what needs verification; it never
  promises eligibility; human confirms before any outbound action.
- Polish over feature count. Don't sprawl.

---

## 10. Comprehension anchors (for the human)

After each generation, you understand the whole agent if you can explain these
four things. Use "can I explain these four?" as your checkpoint:

1. **The state object** — what the agent knows at any moment.
2. **The controller loop** — where the model decides the next action.
3. **One tool (e.g. `evaluateTrial`)** — how a single reasoning step works.
4. **The Runner** — how live vs. replay swaps without the UI noticing.

---

## 11. Verification notes

- SDK specifics (tool-use parameter names, streaming helpers) shift over time —
  sanity-check generated Anthropic SDK calls against the current reference at
  docs.claude.com rather than older patterns.
- Before wiring the API hard, pull one real CT.gov response and confirm the field
  paths above against the live JSON.
