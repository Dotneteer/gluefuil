/** A 0-based line and column. Columns count UTF-16 code units (JavaScript string indices). */
export interface Position {
  line: number;
  column: number;
}

/**
 * Converts between offsets and line/column positions for one source text.
 * Recognizes "\n", "\r\n" and "\r" as line breaks.
 */
export class LineMap {
  /** Offset of the first character of each line. */
  private readonly lineStarts: number[];

  constructor(private readonly text: string) {
    const starts = [0];
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      if (ch === 13 /* \r */) {
        if (text.charCodeAt(i + 1) === 10 /* \n */) i++;
        starts.push(i + 1);
      } else if (ch === 10 /* \n */) {
        starts.push(i + 1);
      }
    }
    this.lineStarts = starts;
  }

  get lineCount(): number {
    return this.lineStarts.length;
  }

  /** Position of an offset. Offsets are clamped to `[0, text.length]`. */
  positionAt(offset: number): Position {
    const clamped = Math.max(0, Math.min(offset, this.text.length));
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (this.lineStarts[mid]! <= clamped) low = mid;
      else high = mid - 1;
    }
    return { line: low, column: clamped - this.lineStarts[low]! };
  }

  /** Offset of a position. Out-of-range lines and columns are clamped. */
  offsetAt(position: Position): number {
    const line = Math.max(0, Math.min(position.line, this.lineStarts.length - 1));
    const lineStart = this.lineStarts[line]!;
    const nextLineStart = this.lineStarts[line + 1] ?? this.text.length;
    return Math.max(lineStart, Math.min(lineStart + position.column, nextLineStart));
  }
}
