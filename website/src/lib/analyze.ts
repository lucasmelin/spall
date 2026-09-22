import { parseSetValues, renderDocument } from "./spall";
import type { Diagnostic, Edit } from "./spall";

export type Problem = Diagnostic;

/** What the playground knows about a document after checking it the way `spall render` would. */
export type Analysis = {
  /** How many Spall blocks were found. */
  blocks: number;
  /**
   * The smallest edits that bring the generated regions up to date. Only output regions ever
   * appear here, so applying them never touches what you're typing in a template. Empty when the
   * document is up to date, and also when it can't be rendered. An empty list means "nothing to do",
   * and `spall check` would exit 0 only if there are no problems either.
   */
  edits: Edit[];
  /** Errors and warnings, in document order. */
  problems: Problem[];
  /** Set when the data is invalid, so the document was checked but not rendered. */
  blockedByData: boolean;
  /** Something threw. Problems in the document itself are reported through `problems`, never here. */
  fatal: string | null;
};

/**
 * Check a document the way `spall render --dry-run` would.
 *
 * `variables` is null while the data is invalid. Block structure and template syntax are still
 * checked, but nothing is rendered: there are no warnings (they depend on the data) and no edits.
 */
export async function analyze(
  doc: string,
  variables: Record<string, unknown> | null,
): Promise<Analysis> {
  const blockedByData = variables === null;

  try {
    const result = await renderDocument(
      doc,
      blockedByData ? { validateOnly: true } : { variables },
    );
    return {
      blocks: result.blocks.length,
      edits: result.edits,
      problems: result.diagnostics,
      blockedByData,
      fatal: null,
    };
  } catch (error) {
    // renderDocument reports document problems as diagnostics, so a throw means a bug or a
    // failure outside the document. Say so, rather than leaving the status line on its last value.
    return {
      blocks: 0,
      edits: [],
      problems: [],
      blockedByData,
      fatal: error instanceof Error ? error.message : String(error),
    };
  }
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
