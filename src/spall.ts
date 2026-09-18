import { createEngine, standardFilters, type TemplateVariables } from "knap";

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

  /**
   * The Knap template source between the begin and generate marker lines,
   * decoded as UTF-8 and with a common marker-line prefix removed when
   * applicable.
   */
  readonly template: string;
};

export type RenderOptions = {
  /** Template variables made available to Knap while rendering. */
  readonly variables: TemplateVariables;
};

const engine = createEngine({ filters: standardFilters });

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
      `Found ${BEGIN_MARKER} at byte ${beginLocation}, but no matching ${GENERATE_MARKER}.`,
    );
  }

  if (state === "output") {
    throw new Error(
      `Found ${BEGIN_MARKER} at byte ${beginLocation}, but no matching ${END_MARKER}.`,
    );
  }

  return blocks;
}

/**
 * Render every Spall-managed block in `source` using the Knap template engine.
 *
 * Each block's template body is copied through unchanged, and only the
 * previously generated output is replaced. Running `renderBlocks` again on
 * its own output produces the same result.
 *
 * @param source - The raw document bytes to render.
 * @param options - Rendering options.
 * @returns A new buffer with each block's generated output region replaced
 *   by fresh output from rendering its template.
 */
export async function renderBlocks(source: Buffer, options: RenderOptions): Promise<Buffer> {
  const blocks = findBlocks(source);
  const pieces: Buffer[] = [];

  let cursor = 0;

  for (const block of blocks) {
    // Copy everything up to and including the GENERATE_MARKER line.
    // The template and marker lines are never modified.
    pieces.push(source.subarray(cursor, block.outputStart));

    const result = await engine.render(block.template, {
      variables: options.variables,
    });

    if (result.errors.length > 0) {
      const diagnostics = result.errors
        .map((error) => `${error.code}: ${error.message} (${error.line}:${error.column})`)
        .join("\n");

      throw new Error(diagnostics);
    }

    pieces.push(Buffer.from(result.output, UTF8));

    // Skip the stale generated output. The END_MARKER line itself is
    // preserved by the next push (or the final flush below).
    cursor = block.outputEnd;
  }

  pieces.push(source.subarray(cursor));

  return Buffer.concat(pieces);
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
