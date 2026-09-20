import { createEngine, standardFilters } from "knap";
import { Buffer, BEGIN_MARKER, findBlocks, renderBlocks, parseSetValues } from "./spall";
import type { Block } from "./spall";

export type Problem = {
  severity: "error" | "warning";
  message: string;
  code?: string;
  from: number;
  to: number;
  line: number;
  column: number;
};

/** Replace `from`..`to` in the analysed document with `insert`.
 *
 *  Offsets are UTF-16, as in an editor. */
export type Edit = { from: number; to: number; insert: string };

/** Represents the full set of results from analyzing a document with Spall markers. */
export type Analysis = {
  /** How many Spall blocks were found. */
  blocks: number;
  /** The full rendered document, or null when it could not be produced. */
  output: string | null;
  /** True when rendering the document would change it (`spall check` would exit 1). */
  changed: boolean;
  /**
   * The smallest edits that bring the generated regions up to date. Only output regions ever
   * appear here, so applying them never touches what you're typing in a template.
   */
  edits: Edit[];
  problems: Problem[];
  /** Set when the data is invalid, so the document was not rendered. */
  blockedByData: boolean;
  /** A failure that isn't tied to a template position, e.g. an unclosed block. */
  fatal: string | null;
};

// The Spall CLI uses this same setup internally, so diagnostics should match what rendering reports.
const engine = createEngine({ filters: standardFilters });

/**
 * Spall reports byte offsets, but editors use UTF-16 offsets.
 *
 * subarray() returns a Buffer at runtime.
 */
const decoder = (buf: Buffer, byteOffset: number) =>
  (buf.subarray(0, byteOffset) as unknown as Buffer).toString("utf8").length;

function lineOfChar(doc: string, index: number) {
  let line = 1;
  for (let i = 0; i < index && i < doc.length; i++) if (doc.charCodeAt(i) === 10) line++;
  return line;
}

function columnOfChar(doc: string, index: number) {
  return index - (doc.lastIndexOf("\n", index - 1) + 1) + 1;
}

/** Cover the token at `from`, so the underline spans something readable. */
function tokenEnd(doc: string, from: number) {
  const rest = doc.slice(from, from + 64);
  const match = /^(?:\{\{-?|\{%-?|-?%\}|-?\}\}|"[^"\n]*"?|[A-Za-z_$][\w$.-]*|\d[\d.]*|\S)/.exec(
    rest,
  );
  return from + Math.max(1, match ? match[0].length : 1);
}

type Located = { message: string; code?: string; line: number; column: number };

function locate(
  doc: string,
  rawTemplate: string,
  templateStart: number,
  template: string,
  item: Located,
  severity: Problem["severity"],
): Problem {
  const rawLines = rawTemplate.split("\n");
  const lines = template.split("\n");
  const lineIndex = Math.max(0, Math.min(rawLines.length - 1, item.line - 1));

  let offset = 0;
  for (let i = 0; i < lineIndex; i++) offset += rawLines[i].length + 1;

  // A shared comment prefix (e.g. `// `) is removed from the template before Knap sees it,
  // so shift the column back by however much this line lost.
  const stripped =
    rawLines.length === lines.length ? rawLines[lineIndex].length - lines[lineIndex].length : 0;

  const from = Math.min(
    doc.length,
    templateStart + offset + stripped + Math.max(0, item.column - 1),
  );
  const to = Math.min(doc.length, tokenEnd(doc, from));

  return {
    severity,
    message: item.message,
    code: item.code,
    from,
    to: Math.max(to, Math.min(doc.length, from + 1)),
    line: lineOfChar(doc, from),
    column: columnOfChar(doc, from),
  };
}

/**
 * Check a document the way `spall render --dry-run` would.
 *
 * `variables` is null while the data is invalid. The block structure and
 * template syntax are still checked, but nothing is rendered.
 */
export async function analyze(
  doc: string,
  variables: Record<string, unknown> | null,
): Promise<Analysis> {
  const source = Buffer.from(doc, "utf8");
  const result: Analysis = {
    blocks: 0,
    output: null,
    changed: false,
    edits: [],
    problems: [],
    blockedByData: variables === null,
    fatal: null,
  };

  let blocks: Block[];
  try {
    blocks = findBlocks(source);
  } catch (error) {
    // Spall currently reports byte offsets, but people think in lines.
    // Do some hacky manipulation here to render something more readable for users.
    // TODO: Fix this at the Spall layer, rather than here in the website.
    const raw = error instanceof Error ? error.message : String(error);
    const at = /at byte (\d+)/.exec(raw);
    let message = raw;
    let from = 0;
    if (at) {
      from = decoder(source, Number(at[1]));
      message = raw.replace(/at byte \d+/, `on line ${lineOfChar(doc, from)}`);
    }
    result.fatal = message;
    result.problems.push({
      severity: "error",
      message,
      from,
      to: Math.min(doc.length, from + BEGIN_MARKER.length),
      line: lineOfChar(doc, from),
      column: columnOfChar(doc, from),
    });
    return result;
  }

  result.blocks = blocks.length;
  const edits: Edit[] = [];

  for (const block of blocks) {
    const start = decoder(source, block.templateStart);
    const end = decoder(source, block.templateEnd);
    const rawTemplate = doc.slice(start, end);

    const checked = await engine.render(block.template, { variables: variables ?? {} });
    // This is the same call renderBlocks makes for this block, so its output is what Spall writes.
    const from = decoder(source, block.outputStart);
    const to = decoder(source, block.outputEnd);
    if (checked.errors.length === 0 && checked.output !== doc.slice(from, to)) {
      edits.push({ from, to, insert: checked.output });
    }
    for (const error of checked.errors) {
      result.problems.push(locate(doc, rawTemplate, start, block.template, error, "error"));
    }
    // Warnings depend on the data, so they're meaningless while the data is broken.
    if (variables !== null) {
      for (const warning of checked.warnings) {
        result.problems.push(locate(doc, rawTemplate, start, block.template, warning, "warning"));
      }
    }
  }

  result.problems.sort((a, b) => a.from - b.from);

  if (variables === null || result.problems.some((p) => p.severity === "error")) return result;

  try {
    const rendered = await renderBlocks(source, { variables });
    result.output = rendered.toString("utf8");
    result.changed = result.output !== doc;
    result.edits = edits;
  } catch (error) {
    result.fatal = error instanceof Error ? error.message : String(error);
  }
  return result;
}

/**
 * Where a position in the analysed document ends up once `edits` are applied.
 * Because problems are always found in templates, and never inside a replaced
 * output region, shifting by the size of earlier edits is exact.
 */
export function shiftThrough(edits: Edit[], position: number): number {
  let shift = 0;
  for (const edit of edits)
    if (edit.to <= position) shift += edit.insert.length - (edit.to - edit.from);
  return position + shift;
}

export type OverridesResult =
  | { ok: true; value: Record<string, string>; count: number }
  | { ok: false; message: string };

/** `--set key=value`, one per line. Values are always strings, as on the command line. */
export function parseOverrides(text: string): OverridesResult {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  try {
    const value = parseSetValues(lines);
    return { ok: true, value, count: Object.keys(value).length };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
