import { createEngine, standardFilters } from "knap";

/**
 * Marks the start of a managed block.
 */
export const BEGIN_MARKER = "[[[spall:begin";

/**
 * Marks the end of the template body and the start of its previously
 * generated output.
 *
 * Everything from here to {@link END_MARKER} is the actual generated
 * output.
 */
export const GENERATE_MARKER = "spall:generate]]]";

/**
 * Marks the end of a managed block's generated output.
 */
export const END_MARKER = "[[[spall:end]]]";

/**
 * A diagnostic reported by Spall or Knap, positioned in the source document.
 */
export type Diagnostic = {
  severity: "error" | "warning";
  message: string;
  code?: string;
  /** UTF-16 offset of the start of the diagnostic in the document. */
  from: number;
  /** UTF-16 offset of the end of the diagnostic in the document. */
  to: number;
  /** One-based document line. */
  line: number;
  /** One-based document column. */
  column: number;
};

/** Replace `from`..`to` of the source with `insert`. Offsets are UTF-16. */
export type Edit = { from: number; to: number; insert: string };

/**
 * Represents a single Spall-managed block.
 *
 * A block has two regions: the template (between {@link BEGIN_MARKER} and
 * {@link GENERATE_MARKER}), which is Knap source and is left untouched by
 * every render; and the output (between {@link GENERATE_MARKER} and
 * {@link END_MARKER}), which holds the previous render's result and is
 * discarded and replaced on every render.
 *
 * If the marker lines share a prefix and every non-empty template line has
 * that prefix, the prefix is removed from the template before it is passed
 * to Knap. This allows templates to be embedded in line comments.
 */
export type Block = {
  /** Byte offset of the first character of {@link BEGIN_MARKER}. */
  readonly beginLocation: number;

  /** Byte offset of the first character of the template body. */
  readonly templateStart: number;

  /** Byte offset of the beginning of the {@link GENERATE_MARKER} line. */
  readonly templateEnd: number;

  /** Byte offset of the first character of the line after {@link GENERATE_MARKER}. */
  readonly outputStart: number;

  /** Byte offset of the beginning of the {@link END_MARKER} line. */
  readonly outputEnd: number;

  /** Byte offset immediately after the {@link END_MARKER} line. */
  readonly endLocation: number;

  /** The common line prefix removed from the Knap template, if any. */
  readonly prefix: string;

  /**
   * The Knap template source between the begin and generate marker lines,
   * decoded as UTF-8 and with a common marker-line prefix removed when
   * applicable.
   */
  readonly template: string;
};

type Engine = ReturnType<typeof createEngine>;

export type RenderOptions = {
  /** Template variables made available to Knap while rendering. */
  variables?: Record<string, unknown>;
  engine?: Engine;
  /** Check block structure and template syntax without rendering anything. */
  validateOnly?: boolean;
};

/** The engine used by Spall unless a caller supplies another engine. */
export const defaultEngine = createEngine({ filters: standardFilters });

/** The result of rendering one managed block. */
export type RenderedBlock = {
  /** UTF-16 offset of the existing generated output region. */
  readonly start: number;
  /** UTF-16 offset immediately after the existing generated output region. */
  readonly end: number;
  /** Fresh output produced by Knap. */
  readonly output: string;
  /** Whether replacing `start..end` with `output` would change the document. */
  readonly changed: boolean;
  readonly errors: Diagnostic[];
  readonly warnings: Diagnostic[];
};

export type DocumentRenderResult = {
  /** The rendered document, or null when either it can't be produced, there were errors, or `validateOnly`. */
  output: string | null;
  /** Successfully parsed blocks and their individual render results. */
  blocks: RenderedBlock[];
  /** The changes that turn the source into `output`. Empty whenever `output` is null. */
  edits: Edit[];
  /** Sorted by position. */
  errors: Diagnostic[];
  warnings: Diagnostic[];
  /** `errors` and `warnings` together, sorted by position. */
  diagnostics: Diagnostic[];
};

/** A structured rendering failure used by the Buffer API. */
export class SpallError extends Error {
  readonly diagnostics: Diagnostic[];

  constructor(diagnostics: readonly Diagnostic[]) {
    super(diagnostics.map(formatDiagnostic).join("\n"));
    this.name = "SpallError";
    this.diagnostics = [...diagnostics];
  }
}

const UTF8 = "utf8";

const BEGIN_MARKER_BYTES = Buffer.from(BEGIN_MARKER, UTF8);
const GENERATE_MARKER_BYTES = Buffer.from(GENERATE_MARKER, UTF8);
const END_MARKER_BYTES = Buffer.from(END_MARKER, UTF8);

type ParserState = "outside" | "template" | "output";

const LF_BYTE = 0x0a;
const CR_BYTE = 0x0d;

/**
 * Scans forward from `offset` for the next LF byte and returns
 * the byte right after it. CRLF is handled implicitly, since the CR is just
 * an ordinary byte that ends up as the last byte of the preceding line.
 *
 * If no further newline exists, `offset` is on the final line, so this
 * returns `source.length`.
 */
function nextLineStart(source: Buffer, offset: number): number {
  const newline = source.indexOf(LF_BYTE, offset);
  return newline === -1 ? source.length : newline + 1;
}

/**
 * Return the byte offset of the first non-newline character after `offset`.
 *
 * This is useful when a marker line does not end in LF, or when handling
 * CRLF input.
 */
function lineContentEnd(source: Buffer, lineStart: number): number {
  const newline = source.indexOf(LF_BYTE, lineStart);

  if (newline === -1) {
    return source.length;
  }

  return newline > lineStart && source[newline - 1] === CR_BYTE ? newline - 1 : newline;
}

/**
 * Return the byte offset of the beginning of the line containing `offset`.
 */
function currentLineStart(source: Buffer, offset: number): number {
  const newline = source.lastIndexOf(LF_BYTE, offset - 1);
  return newline === -1 ? 0 : newline + 1;
}

/**
 * Return the text occurring before a marker on its line.
 *
 * For example, given `// [[[spall:begin` and the offset
 * of `[[[spall:begin]`, this returns `// `.
 */
function markerLinePrefix(source: Buffer, markerOffset: number): string {
  const start = currentLineStart(source, markerOffset);

  return source.subarray(start, markerOffset).toString(UTF8);
}

/**
 * Remove a common line prefix from a Knap template.
 *
 * The prefix is removed only when every non-empty template line begins with
 * it. This prevents partially commented templates from being silently
 * modified.
 *
 * Blank lines are preserved unchanged.
 */
function removeTemplatePrefix(template: string, prefix: string): string {
  if (!prefix) {
    return template;
  }

  const lines = template.split("\n");
  const contentLines = lines.filter((line) => line.trim() !== "");

  if (contentLines.length === 0 || !contentLines.every((line) => line.startsWith(prefix))) {
    return template;
  }

  return lines
    .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line))
    .join("\n");
}

/**
 * Find a marker anywhere on a single line.
 *
 * Marker lines may contain arbitrary text before and after the marker. For
 * example:
 *
 *     <!-- [[[spall:begin -->
 *     spall:generate]]] -->
 *     [[[spall:end]]] -->
 *
 * The caller is responsible for restricting the search to the current line.
 */
function findMarker(source: Buffer, lineStart: number, marker: Buffer): number {
  const lineEnd = lineContentEnd(source, lineStart);
  const offset = source.subarray(lineStart, lineEnd).indexOf(marker);

  return offset === -1 ? -1 : lineStart + offset;
}

/**
 * Find all Spall-managed blocks in a Markdown document.
 *
 * Markers are line-oriented and stateful. A marker only has meaning in the
 * parser state where it is expected:
 *
 *   outside  -> BEGIN_MARKER    -> template
 *   template -> GENERATE_MARKER -> output
 *   output   -> END_MARKER      -> outside
 *
 * The entire marker line belongs to the marker itself. Consequently, text
 * after a marker is preserved and is not interpreted by the parser.
 *
 * If the text before the begin and generate markers is identical, and every
 * non-empty line in the template starts with that prefix, the prefix is
 * removed from the Knap source before it is stored in the block.
 *
 * @param source - The raw document bytes to scan.
 * @returns The blocks found, in the order they appear in `source`.
 * @throws If a begin marker has no matching generate marker, or a generate
 *   marker has no matching end marker.
 */
export function findBlocks(source: Buffer): Block[] {
  const blocks: Block[] = [];

  let state: ParserState = "outside";
  let cursor = 0;

  let beginLocation = -1;
  let templateStart = -1;
  let templateEnd = -1;
  let outputStart = -1;
  let templatePrefix = "";

  while (cursor < source.length) {
    const lineStart = cursor;
    const lineEnd = nextLineStart(source, lineStart);

    switch (state) {
      case "outside": {
        const markerOffset = findMarker(source, lineStart, BEGIN_MARKER_BYTES);

        if (markerOffset !== -1) {
          beginLocation = markerOffset;

          // The text before the begin marker is the candidate template
          // prefix. It must match the generate marker's prefix before it
          // will be used to uncomment the template.
          templatePrefix = markerLinePrefix(source, markerOffset);

          // The template starts on the line after the begin marker's line.
          templateStart = lineEnd;

          state = "template";
        }

        break;
      }

      case "template": {
        const markerOffset = findMarker(source, lineStart, GENERATE_MARKER_BYTES);

        if (markerOffset !== -1) {
          // The entire generate-marker line is preserved. The template ends
          // at the beginning of that line.
          templateEnd = lineStart;

          const generatePrefix = markerLinePrefix(source, markerOffset);

          const rawTemplate = source.subarray(templateStart, templateEnd).toString(UTF8);

          const effectivePrefix = generatePrefix === templatePrefix ? templatePrefix : "";

          // Generated output starts on the line after the generate marker.
          outputStart = lineEnd;

          state = "output";

          // Store the actual Knap source, removing the common line-comment
          // prefix when the template is consistently prefixed.
          //
          // This is deliberately done here rather than in renderBlocks(),
          // so Block.template always contains executable Knap source.
          templatePrefix = effectivePrefix;

          // Stash the transformed template temporarily by reusing the
          // existing variable below when the block is completed.
          //
          // We cannot push the block yet because its end marker has not
          // been found, so keep the raw boundaries and derive the template
          // again when the block is completed.
          void rawTemplate;
        }

        break;
      }

      case "output": {
        const markerOffset = findMarker(source, lineStart, END_MARKER_BYTES);

        if (markerOffset !== -1) {
          const endLocation = lineEnd;

          const rawTemplate = source.subarray(templateStart, templateEnd).toString(UTF8);

          const template = removeTemplatePrefix(rawTemplate, templatePrefix);

          blocks.push({
            beginLocation,
            templateStart,
            templateEnd,
            outputStart,
            outputEnd: lineStart,
            endLocation,
            prefix: templatePrefix,
            template,
          });

          state = "outside";
        }

        break;
      }
    }

    if (lineEnd === source.length) {
      break;
    }

    cursor = lineEnd;
  }

  if (state === "template") {
    throw new Error(
      `Found ${BEGIN_MARKER} on line ${byteLine(source, beginLocation)}, but no matching ${GENERATE_MARKER}.`,
    );
  }

  if (state === "output") {
    throw new Error(
      `Found ${BEGIN_MARKER} on line ${byteLine(source, beginLocation)}, but no matching ${END_MARKER}.`,
    );
  }

  return blocks;
}

/** Return the 1-based line number containing `byteOffset` in `source`. */
function byteLine(source: Buffer, byteOffset: number): number {
  let line = 1;

  for (let i = 0; i < byteOffset; i++) {
    if (source[i] === LF_BYTE) line++;
  }

  return line;
}

function utf16Offset(source: Buffer, byteOffset: number): number {
  return source.subarray(0, byteOffset).toString(UTF8).length;
}

function lineAndColumn(doc: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastNewline = -1;

  for (let i = 0; i < offset; i++) {
    if (doc.charCodeAt(i) === 10) {
      line++;
      lastNewline = i;
    }
  }

  return {
    line,
    column: offset - lastNewline,
  };
}

function tokenEnd(doc: string, from: number): number {
  const rest = doc.slice(from, from + 64);
  const match = /^(?:\{\{-?|\{%-?|-?%\}|-?\}\}|"[^"\n]*"?|[A-Za-z_$][\w$.-]*|\d[\d.]*|\S)/.exec(
    rest,
  );
  return from + Math.max(1, match ? match[0].length : 1);
}

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const code = diagnostic.code ? `${diagnostic.code}: ` : "";
  return `${code}${diagnostic.message} (${diagnostic.line}:${diagnostic.column})`;
}

/** Return the UTF-16 offset of the start of `line` (1-based). */
function lineStartOffset(doc: string, line: number): number {
  let offset = 0;

  for (let i = 1; i < line; i++) {
    const next = doc.indexOf("\n", offset);
    if (next === -1) return doc.length;
    offset = next + 1;
  }

  return offset;
}

function parserDiagnostic(doc: string, raw: unknown): Diagnostic {
  const message = raw instanceof Error ? raw.message : String(raw);
  const match = /on line (\d+)/.exec(message);
  const line = match ? Number(match[1]) : 1;
  const from = lineStartOffset(doc, line);

  return {
    severity: "error",
    message,
    from,
    to: Math.min(doc.length, Math.max(from + 1, from + BEGIN_MARKER.length)),
    line,
    column: 1,
  };
}

type Located = { message: string; code?: string; line: number; column: number };

/**
 * Maps a diagnostic reported against a rendered template back to its
 * corresponding location in the original source document.
 *
 * The template may have a prefix (for example, a Markdown comment marker)
 * that was stripped before rendering. When the raw and rendered templates
 * have the same line structure, that prefix length is accounted for when
 * translating the diagnostic column back to the source.
 *
 * @param doc The complete original source document.
 * @param rawTemplate The template as it appeared in the source, including
 *   any line prefixes that were stripped before rendering.
 * @param templateStart The UTF-16 offset where `rawTemplate` begins in
 *   `source`.
 * @param template The template passed to the template engine after any
 *   prefixes were stripped.
 * @param item The diagnostic location reported by the template engine.
 * @param severity The severity to assign to the resulting diagnostic.
 * @returns A diagnostic positioned relative to the original source document.
 */
function locateDiagnostic(
  doc: string,
  rawTemplate: string,
  templateStart: number,
  template: string,
  item: Located,
  severity: Diagnostic["severity"],
): Diagnostic {
  const rawLines = rawTemplate.split("\n");
  const lines = template.split("\n");
  // Template-engine line numbers are one-based. Clamp malformed locations so
  // that they cannot produce an out-of-bounds source offset.
  const lineIndex = Math.max(0, Math.min(rawLines.length - 1, item.line - 1));

  // Convert the diagnostic's line number into an offset within the raw template.
  const offset = rawLines.slice(0, lineIndex).reduce((sum, l) => sum + l.length + 1, 0);

  const rawLine = rawLines[lineIndex];
  const line = lines[lineIndex];
  const stripped =
    rawLine !== undefined && line !== undefined && rawLines.length === lines.length
      ? rawLine.length - line.length
      : 0;

  const from = Math.min(
    doc.length,
    templateStart + offset + stripped + Math.max(0, item.column - 1),
  );
  const to = Math.min(doc.length, tokenEnd(doc, from));
  const position = lineAndColumn(doc, from);

  return {
    severity,
    message: item.message,
    code: item.code,
    from,
    to: Math.max(to, Math.min(doc.length, from + 1)),
    line: position.line,
    column: position.column,
  };
}

const byPosition = (a: Diagnostic, b: Diagnostic) => a.from - b.from || a.to - b.to;

/** Apply edits to `source`. They must not overlap; the order they're given in doesn't matter. */
export function applyEdits(source: string, edits: readonly Edit[]): string {
  let result = source;
  for (const edit of [...edits].sort((a, b) => b.from - a.from)) {
    result = result.slice(0, edit.from) + edit.insert + result.slice(edit.to);
  }
  return result;
}

/**
 * Render every Spall-managed block in a string and return structured,
 * document-relative diagnostics and edits.
 *
 * Each block's template body is copied through unchanged, and only the
 * previously generated output is replaced. Running `renderDocument` again on
 * its own output produces the same result.
 *
 * @param source - The UTF-8 document text to render.
 * @param options - Rendering options.
 * @returns The rendered document, per-block results, edits, errors, warnings,
 *   and combined diagnostics. The result output is null when rendering fails
 *   or if validation-only mode is enabled.
 */
export async function renderDocument(
  source: string,
  options: RenderOptions = {},
): Promise<DocumentRenderResult> {
  const sourceBuffer = Buffer.from(source, UTF8);
  let blocks: Block[];

  try {
    blocks = findBlocks(sourceBuffer);
  } catch (error) {
    const errors = [parserDiagnostic(source, error)];
    return { output: null, blocks: [], edits: [], errors, warnings: [], diagnostics: errors };
  }

  const engine = options.engine ?? defaultEngine;
  const renderedBlocks: RenderedBlock[] = [];

  for (const block of blocks) {
    const templateStart = utf16Offset(sourceBuffer, block.templateStart);
    const templateEnd = utf16Offset(sourceBuffer, block.templateEnd);
    const rawTemplate = source.slice(templateStart, templateEnd);
    const start = utf16Offset(sourceBuffer, block.outputStart);
    const end = utf16Offset(sourceBuffer, block.outputEnd);

    const current = source.slice(start, end);
    const locate = (item: Located, severity: Diagnostic["severity"]) =>
      locateDiagnostic(source, rawTemplate, templateStart, block.template, item, severity);

    if (options.validateOnly) {
      renderedBlocks.push({
        start,
        end,
        output: current,
        changed: false,
        errors: engine.validate(block.template).map((item) => locate(item, "error")),
        warnings: [],
      });
      continue;
    }

    const result = await engine.render(block.template, { variables: options.variables ?? {} });
    const errors = result.errors.map((item) => locate(item, "error"));
    const warnings = result.warnings.map((item) => locate(item, "warning"));

    renderedBlocks.push({
      start,
      end,
      output: result.output,
      changed: errors.length === 0 && result.output !== current,
      errors,
      warnings,
    });
  }

  const errors = renderedBlocks.flatMap((block) => block.errors).sort(byPosition);
  const warnings = renderedBlocks.flatMap((block) => block.warnings).sort(byPosition);
  const diagnostics = [...errors, ...warnings].sort(byPosition);

  if (errors.length > 0 || options.validateOnly) {
    return { output: null, blocks: renderedBlocks, edits: [], errors, warnings, diagnostics };
  }

  const edits = renderedBlocks
    .filter((block) => block.changed)
    .map((block) => ({ from: block.start, to: block.end, insert: block.output }));

  return {
    output: applyEdits(source, edits),
    blocks: renderedBlocks,
    edits,
    errors,
    warnings,
    diagnostics,
  };
}

/**
 * Parse `--set key=value` command-line arguments into a plain object.
 *
 * @param values - Raw `key=value` strings, one per repeated `--set` flag.
 * @returns A map of keys to values.
 * @throws If an entry has no `=` separator, or has an empty key.
 */
export function parseSetValues(values: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (const value of values) {
    const separator = value.indexOf("=");

    if (separator <= 0) {
      throw new Error(`Invalid --set value "${value}". Expected KEY=VALUE.`);
    }

    const key = value.slice(0, separator);
    result[key] = value.slice(separator + 1);
  }

  return result;
}
