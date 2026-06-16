// Synthetic example intakes — no real PHI. The trials are real; these are not.
// Daniel is the headline demo: his message is deliberately sparse ("advanced
// lung cancer"), so the agent's info-gain intake (differentiator #2) has to
// drill for histology, driver mutation, and prior lines.
export const EXAMPLE_INTAKES: { name: string; text: string }[] = [
  {
    name: "Daniel",
    text: "I'm trying to find trials for my husband Daniel. He's 61, has advanced lung cancer, and we're near Boston. He's been through a few rounds of treatment already and his last scans showed it's progressing.",
  },
  {
    name: "Maria",
    text: "I'm looking for trials for my mom Maria. She's 54, lives in San Diego, and has metastatic breast cancer. She's already been treated with trastuzumab and paclitaxel.",
  },
  {
    name: "James",
    text: "My dad James is 67, has Parkinson's disease, and takes levodopa. We live outside Billings, Montana — is anything within reach for him?",
  },
];
