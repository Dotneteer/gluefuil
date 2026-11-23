// "Did you mean …?": the closest candidate within a small edit distance
// (XMLUI type-contracts/suggestions.ts uses Levenshtein distance ≤ 2).

const MAX_DISTANCE = 2;

/** The Levenshtein edit distance (single-row dynamic programming). */
export function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = a[i - 1] === b[j - 1] ? diagonal : Math.min(diagonal, row[j - 1]!, above) + 1;
      diagonal = above;
    }
  }
  return row[b.length]!;
}

/** The closest candidate at distance ≤ 2 (the first on ties), or undefined. */
export function closestMatch(name: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestDistance = MAX_DISTANCE + 1;
  for (const candidate of candidates) {
    const distance = editDistance(name, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** `" Did you mean 'label'?"`, or "". */
export function didYouMean(name: string, candidates: Iterable<string>): string {
  const match = closestMatch(name, candidates);
  return match === undefined ? "" : ` Did you mean '${match}'?`;
}
