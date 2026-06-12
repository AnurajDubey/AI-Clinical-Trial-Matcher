// Synthetic example intakes — no real PHI. The trials are real; these are not.
// Maria's message deliberately omits receptor status so the agent's first
// info-gain question (differentiator #2) has something real to ask.
export const EXAMPLE_INTAKES: { name: string; text: string }[] = [
  {
    name: "Maria",
    text: "I'm looking for trials for my mom Maria. She's 54, lives in San Diego, and has metastatic breast cancer. She's already been treated with trastuzumab and paclitaxel.",
  },
  {
    name: "James",
    text: "My dad James is 67, has Parkinson's disease, and takes levodopa. We live outside Billings, Montana — is anything within reach for him?",
  },
];
