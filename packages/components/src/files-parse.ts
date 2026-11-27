// The lazy chunk of FileInput parseAs="csv" (step 32B; decision D of
// poc-32-remaining.md): papaparse is loaded only when a CSV file is parsed.
import Papa from "papaparse";

export interface CsvResult {
  data: unknown[];
  fields: string[] | undefined;
  error: Error | undefined;
}

/**
 * Parses CSV text with XMLUI's defaults (`{ header: true, skipEmptyLines: true }`)
 * and `csvOptions` (papaparse's config) over them. Errors: the first three
 * messages (and how many more), as XMLUI (FileInputReact.tsx 170–200).
 */
export function parseCsv(text: string, csvOptions: unknown): CsvResult {
  const options = (csvOptions !== null && typeof csvOptions === "object" ? csvOptions : {}) as Papa.ParseConfig;
  const { complete: _complete, error: _error, step: _step, worker: _worker, chunk: _chunk, ...rest } = options as Papa.ParseConfig & Record<string, unknown>;
  const result = Papa.parse<unknown>(text, { header: true, skipEmptyLines: true, ...rest } as Papa.ParseConfig<unknown>);
  if (result.errors.length > 0) {
    const first = result.errors.slice(0, 3).map((e) => e.message).join(", ");
    const message = result.errors.length > 3 ? `${first} (and ${result.errors.length - 3} more)` : first;
    return { data: [], fields: undefined, error: new Error(message) };
  }
  return { data: result.data, fields: result.meta.fields, error: undefined };
}
