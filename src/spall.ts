import { createEngine, standardFilters, type TemplateVariables } from "knap";

export const BEGIN_MARKER = "%% spall:begin %%";
export const END_MARKER = "%% spall:end %%";

/** Represents a single Spall-managed block. */
export interface Block {
  /** Byte offset of the first character of the {@link BEGIN_MARKER} .*/
  readonly beginLocation: number;
  /** Byte offset of the first character of the template body. */
  readonly templateStart: number;
  /** Byte offset of the first character of the {@link END_MARKER} */
  readonly templateEnd: number;
  /** Byte offset immediately past the last character of {@link END_MARKER}. */
  readonly endLocation: number;
  /** The raw template source between the begin and end markers, decoded as UTF-8. */
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
 *   array if no `%% spall:begin %%` marker is present.
 * @throws {Error} If a `%% spall:begin %%` marker is found with no matching
 *   `%% spall:end %%` after it.
 */
export function findBlocks(source: Buffer): Block[] {
  const blocks: Block[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const beginStart = source.indexOf(BEGIN_MARKER, cursor, UTF8);
    if (beginStart === -1) break;

    const templateStart = beginStart + Buffer.byteLength(BEGIN_MARKER);
    const endStart = source.indexOf(END_MARKER, templateStart, UTF8);

    if (endStart === -1) {
      throw new Error(
        `Found ${BEGIN_MARKER} at byte ${beginStart}, but no matching ${END_MARKER}.`,
      );
    }

    const endEnd = endStart + Buffer.byteLength(END_MARKER);
    const template = source.subarray(templateStart, endStart).toString(UTF8);

    blocks.push({
      beginLocation: beginStart,
      templateStart,
      templateEnd: endStart,
      endLocation: endEnd,
      template,
    });

    cursor = endEnd;
  }

  return blocks;
}

/**
 * Render every Spall-managed block in `source` using the Knap template engine.
 *
* @param source - The raw document bytes to render.
 * @param options - Rendering options.
 * @returns A new buffer with each block's template body replaced by its
 *   rendered output.
 * @throws {Error} If `source` contains no managed blocks, if a begin marker
 *   has no matching end marker, or if the Knap engine reports any errors while
 *   rendering a block.
*/
export async function renderBlocks(source: Buffer, options: RenderOptions): Promise<Buffer> {
  const blocks = findBlocks(source);

  if (blocks.length === 0) {
    throw new Error(`No ${BEGIN_MARKER} / ${END_MARKER} block found.`);
  }

  const pieces: Buffer[] = [];
  let cursor = 0;

  for (const block of blocks) {
    pieces.push(source.subarray(cursor, block.templateStart));

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
    cursor = block.templateEnd;
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
