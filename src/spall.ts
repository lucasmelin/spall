import { createEngine, standardFilters, type TemplateVariables } from "knap";

/**
 * Marks the start of a managed block. Together with {@link GENERATE_MARKER}
 * this opens and closes a real HTML comment around the template body, so
 * the raw Knap source stays invisible in any Markdown viewer or renderer
 * before spall has processed the file.
 */
export const BEGIN_MARKER = "<!--\n[[[spall:begin";
/**
 * Marks the end of the template body and the start of its previously
 * generated output. Closes the HTML comment opened by {@link BEGIN_MARKER}.
 *
 * Everything from here to {@link END_MARKER} is the actual generated
 * output, so it renders normally.
 */
export const GENERATE_MARKER = "spall:generate]]]-->";
/**
 * Marks the end of a managed block's generated output.
 */
export const END_MARKER = "<!--[[[spall:end]]]-->";

/**
 * Represents a single Spall-managed block.
 *
 * A block has two regions: the template (between {@link BEGIN_MARKER} and
 * {@link GENERATE_MARKER}), which is Knap source and is left untouched by
 * every render; and the output (between {@link GENERATE_MARKER} and
 * {@link END_MARKER}), which holds the previous render's result and is
 * discarded and replaced on every render.
 */
export interface Block {
  /** Byte offset of the first character of {@link BEGIN_MARKER}. */
  readonly beginLocation: number;
  /** Byte offset of the first character of the template body. */
  readonly templateStart: number;
  /** Byte offset of the first character of {@link GENERATE_MARKER}. */
  readonly templateEnd: number;
  /** Byte offset of the first character of the previously generated output. */
  readonly outputStart: number;
  /** Byte offset of the first character of {@link END_MARKER}. */
  readonly outputEnd: number;
  /** Byte offset immediately past the last character of {@link END_MARKER}. */
  readonly endLocation: number;
  /** The raw template source between the begin and generate markers, decoded as UTF-8. */
  readonly template: string;
}

export interface RenderOptions {
  /** Template variables made available to Knap while rendering. */
  readonly variables: TemplateVariables;
}

const engine = createEngine({ filters: standardFilters });

const UTF8 = "utf8";

/**
 * Find all Spall-managed blocks in a Markdown document.
 *
 * @param source - The raw document bytes to scan.
 * @returns The blocks found, in the order they appear in `source`. An empty
 *   array if no {@link BEGIN_MARKER} is present.
 * @throws {Error} If a {@link BEGIN_MARKER} is found with no matching
 *   {@link GENERATE_MARKER} after it, or no matching {@link END_MARKER}
 *   after that.
 */
export function findBlocks(source: Buffer): Block[] {
  const blocks: Block[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const beginStart = source.indexOf(BEGIN_MARKER, cursor, UTF8);
    if (beginStart === -1) break;

    const templateStart = beginStart + Buffer.byteLength(BEGIN_MARKER);
    const generateStart = source.indexOf(GENERATE_MARKER, templateStart, UTF8);

    if (generateStart === -1) {
      throw new Error(
        `Found ${BEGIN_MARKER} at byte ${beginStart}, but no matching ${GENERATE_MARKER}.`,
      );
    }

    const outputStart = generateStart + Buffer.byteLength(GENERATE_MARKER);
    const endStart = source.indexOf(END_MARKER, outputStart, UTF8);

    if (endStart === -1) {
      throw new Error(
        `Found ${BEGIN_MARKER} at byte ${beginStart}, but no matching ${END_MARKER}.`,
      );
    }

    const endLocation = endStart + Buffer.byteLength(END_MARKER);
    const template = source.subarray(templateStart, generateStart).toString(UTF8);

    blocks.push({
      beginLocation: beginStart,
      templateStart,
      templateEnd: generateStart,
      outputStart,
      outputEnd: endStart,
      endLocation,
      template,
    });

    cursor = endLocation;
  }

  return blocks;
}

/**
 * Render every Spall-managed block in `source` using the Knap template engine.
 *
 * Like cog, this is idempotent: each block's template body (between
 * {@link BEGIN_MARKER} and {@link GENERATE_MARKER}) is copied through
 * unchanged, and only the previously generated output (between
 * {@link GENERATE_MARKER} and {@link END_MARKER}) is replaced. Running
 * `renderBlocks` again on its own output reproduces the same result.
 *
 * @param source - The raw document bytes to render.
 * @param options - Rendering options.
 * @returns A new buffer with each block's generated output region replaced
 *   by fresh output from rendering its template.
 * @throws {Error} If a begin marker has no matching generate or end marker,
 *   or if the Knap engine reports any errors while rendering a block.
 */
export async function renderBlocks(source: Buffer, options: RenderOptions): Promise<Buffer> {
  const blocks = findBlocks(source);
  const pieces: Buffer[] = [];
  let cursor = 0;
  for (const block of blocks) {
    // Copy everything up to and including the template body and the
    // GENERATE_MARKER unchanged; the template itself is never modified.
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
    // Skip the stale output; END_MARKER is preserved by the next push
    // (or the final flush below).
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
 * @throws {Error} If an entry has no `=` separator, or has an empty key.
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
