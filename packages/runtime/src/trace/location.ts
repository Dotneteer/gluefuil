// Markup positions (step 35; design: .ai/plan/poc-35-observability.md § Markup
// positions). The compiler emits one table per module:
//
//   const $$L = $$locations("Main.gui", ["Button", 14, 5, "DataSource", 3, 3, …]);
//
// and each located element or variable passes `at: $$L[i]`. The objects are made
// once, when the module loads, whether tracing is on or not (they are tiny).

/** Where an element or variable is in its `.gui` file. 1-based line and column. */
export interface SourceLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  /** The element's tag name, or the variable's name. */
  readonly element: string;
}

/** Builds a module's location table from `[element, line, column, …]` triples. */
export function locations(file: string, triples: readonly (string | number)[]): readonly SourceLocation[] {
  const result: SourceLocation[] = [];
  for (let i = 0; i + 2 < triples.length; i += 3) {
    result.push(Object.freeze({ file, element: String(triples[i]), line: Number(triples[i + 1]), column: Number(triples[i + 2]) }));
  }
  return Object.freeze(result);
}

/** `Main.gui:14:5`. */
export function formatLocation(at: SourceLocation | undefined): string {
  return at === undefined ? "" : `${at.file}:${at.line}:${at.column}`;
}
