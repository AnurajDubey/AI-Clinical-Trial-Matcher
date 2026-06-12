// CT.gov eligibilityCriteria is free text with "Inclusion Criteria:" /
// "Exclusion Criteria:" headers and bullet lists. Split it before handing it
// to the LLM so it reasons over clean, separate lists.

export interface SplitCriteria {
  inclusion: string[];
  exclusion: string[];
}

const EXCLUSION_HEADER = /(?:key\s+)?exclusion criteria\s*:?/i;
const INCLUSION_HEADER = /(?:key\s+)?inclusion criteria\s*:?/i;

export function splitEligibilityCriteria(text: string): SplitCriteria {
  if (!text.trim()) return { inclusion: [], exclusion: [] };

  const exclusionSplit = text.split(EXCLUSION_HEADER);
  const inclusionPart = exclusionSplit[0] ?? "";
  const exclusionPart = exclusionSplit.slice(1).join("\n");

  const inclusionText = inclusionPart.split(INCLUSION_HEADER).slice(1).join("\n") || inclusionPart;

  return {
    inclusion: parseBullets(inclusionText),
    exclusion: parseBullets(exclusionPart),
  };
}

function parseBullets(block: string): string[] {
  const items: string[] = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const bullet = line.match(/^(?:[*\-•~]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      items.push(bullet[1].trim());
    } else if (items.length > 0) {
      // continuation of the previous bullet
      items[items.length - 1] += ` ${line}`;
    } else {
      items.push(line);
    }
  }
  return items;
}
