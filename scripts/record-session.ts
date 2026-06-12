// Headless session recorder. Runs the real agent loop (real Claude + real
// ClinicalTrials.gov) and captures the event stream into a replayable JSON
// under public/sessions/.
//
//   npm run record -- --scenario=maria     # scripted answers from scripts/scenarios/maria.json
//   npm run record                         # interactive — you type the patient's side
//
// Requires ANTHROPIC_API_KEY (read from .env.local).

import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { runAgentLoop } from "@/lib/agent/controller";
import { applyAnswer } from "@/lib/agent/extractProfile";
import { SessionRecorder } from "@/lib/runner/record";
import type { AgentEvent, Continuation } from "@/lib/agent/events";
import type { AgentState } from "@/lib/types";
import type Anthropic from "@anthropic-ai/sdk";

interface Scenario {
  slug: string;
  name: string;
  description: string;
  firstMessage: string;
  answers: string[];
}

const ROOT = path.resolve(import.meta.dirname, "..");
const SESSIONS_DIR = path.join(ROOT, "public", "sessions");

async function loadEnvLocal() {
  try {
    const raw = await fs.readFile(path.join(ROOT, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // no .env.local — rely on the shell environment
  }
}

async function main() {
  await loadEnvLocal();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set (checked .env.local and the environment).");
    process.exit(1);
  }

  const scenarioArg = process.argv.find((a) => a.startsWith("--scenario="))?.split("=")[1];
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let scenario: Scenario;
  if (scenarioArg) {
    const file = path.join(ROOT, "scripts", "scenarios", `${scenarioArg}.json`);
    scenario = JSON.parse(await fs.readFile(file, "utf8"));
    console.log(`Recording scripted scenario: ${scenario.name}`);
  } else {
    const slug = (await rl.question("Session slug (filename, e.g. maria): ")).trim();
    const name = (await rl.question("Display name: ")).trim();
    const description = (await rl.question("One-line description: ")).trim();
    const firstMessage = (await rl.question("Patient's first message:\n> ")).trim();
    scenario = { slug, name, description, firstMessage, answers: [] };
  }
  const interactive = !scenarioArg;

  const recorder = new SessionRecorder();
  const emit = (e: AgentEvent) => {
    recorder.record(e);
    if (e.type === "tool") console.log(`  ▸ ${e.detail}`);
    if (e.type === "verdict") console.log(`    → ${e.nctId}: ${e.verdict.status}`);
    if (e.type === "final") console.log(`\nFINAL: ${e.message}\n`);
  };

  const state: AgentState = {
    profile: {},
    unknowns: [],
    candidates: [],
    verdicts: {},
    nearMissPaths: {},
    history: [],
    done: false,
  };

  console.log(`\nPATIENT: ${scenario.firstMessage}\n`);
  recorder.recordUserMessage(scenario.firstMessage);
  const seeded = await applyAnswer(state.profile, "Initial intake message", scenario.firstMessage);
  state.profile = seeded.profile;
  state.unknowns = seeded.unknowns;
  emit({ type: "profile", profile: state.profile, unknowns: state.unknowns });

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `The patient (or their caregiver) wrote:\n"""${scenario.firstMessage}"""\n\nProfile extracted so far:\n${JSON.stringify(state.profile, null, 2)}\n\nHigh-value fields still unknown: ${state.unknowns.join(", ") || "none"}\n\nBegin navigating — decide your next move.`,
    },
  ];

  // Same loop the API route runs, but askPatient pauses resolve in-process —
  // from the scenario script or from the operator at the terminal.
  let answersUsed = 0;
  while (!state.done) {
    let ask: { question: string; continuation: Continuation } | null = null;
    await runAgentLoop({
      messages,
      state,
      emit: (e) => {
        if (e.type === "ask" && e.continuation) {
          ask = { question: e.question, continuation: e.continuation };
          emit(e); // recorder strips the continuation
        } else {
          emit(e);
        }
      },
    });
    if (state.done || !ask) break;
    const { question, continuation } = ask as { question: string; continuation: Continuation };

    console.log(`\nAGENT ASKS: ${question}`);
    let answer: string;
    if (interactive) {
      answer = (await rl.question("> ")).trim();
    } else {
      if (answersUsed >= scenario.answers.length) {
        throw new Error(
          `Scenario ran out of scripted answers (used ${answersUsed}). Add more answers or record interactively.`,
        );
      }
      answer = scenario.answers[answersUsed++];
      console.log(`PATIENT: ${answer}`);
    }

    recorder.recordUserMessage(answer);
    const applied = await applyAnswer(state.profile, question, answer);
    state.profile = applied.profile;
    state.unknowns = applied.unknowns;
    emit({ type: "profile", profile: state.profile, unknowns: state.unknowns });

    messages.push({
      role: "user",
      content: [
        ...continuation.completedResults,
        {
          type: "tool_result",
          tool_use_id: continuation.pendingToolUseId,
          content: JSON.stringify({
            answer,
            updatedProfile: state.profile,
            stillUnknown: state.unknowns,
          }),
        },
      ],
    });
  }
  rl.close();

  const session = recorder.toSession(scenario.name, scenario.description);
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
  const fileName = `${scenario.slug}.json`;
  await fs.writeFile(path.join(SESSIONS_DIR, fileName), JSON.stringify(session, null, 1));

  const indexPath = path.join(SESSIONS_DIR, "index.json");
  let manifest: { file: string; name: string; description: string }[] = [];
  try {
    manifest = JSON.parse(await fs.readFile(indexPath, "utf8"));
  } catch {
    // first session — start a fresh manifest
  }
  manifest = manifest.filter((m) => m.file !== fileName);
  manifest.push({ file: fileName, name: scenario.name, description: scenario.description });
  await fs.writeFile(indexPath, JSON.stringify(manifest, null, 1));

  console.log(`\nRecorded ${session.events.length} events → public/sessions/${fileName}`);
  console.log("Commit the JSON to ship it in the public replay demo.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
