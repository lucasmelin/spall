import { chmod, mkdtemp, readFile, rename, rm, stat, writeFile } from "fs/promises";
import { renderBlocks, parseSetValues } from "./spall.js";
import { dirname, join } from "path";
import { pathToFileURL } from "url";

/**
 * Parsed command-line arguments.
 */
interface Arguments {
  /** Path to the Markdown file to render. */
  templateFile: string;
  /** Path to a JSON file of template variables, if `--data`/`-d` was provided. */
  dataFile?: string;
  /** Raw `key=value` strings from the `--set` flags. */
  sets: string[];
  /** Exit non-zero if rendering would change the file, without writing. */
  check: boolean;
  /** Render and print the result without modifying the file. */
  dryRun: boolean;
  /** Print usage information and exit. */
  help: boolean;
  /** Print the version information and exit */
  version: boolean;
}

const VERSION = "0.0.1";

/**
 * Build the CLI's `--help` text.
 *
 * @returns The full usage/help message.
 */
function usage(): string {
  return `
Usage:
  spall <file>
  spall <file> --data data.json
  spall <file> --set key=value
  spall <file> --check
  spall <file> --dry-run

Options:
  -d, --data <file>      JSON object containing template variables
      --set <k=v>        Set/override a top-level template variable; repeatable
      --check            Exit 1 if rendering would change the file
      --dry-run          Render and print the result without modifying the file
  -h, --help             Show this help
  -v, --version          Show the version

Managed blocks:
  <!--[[[spall:begin
  ... Knap template (preserved every run, hidden in an HTML comment) ...
  spall:generate]]]-->
  ... generated output (replaced every run, rendered normally) ...
  <!--[[[spall:end]]]-->

Everything outside managed blocks is preserved verbatim.
`;
}

function parseArgs(argv: readonly string[]): Arguments {
  let file: string | undefined;
  let data: string | undefined;
  const sets: string[] = [];
  let check = false;
  let dryRun = false;
  let help = false;
  let version = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    switch (arg) {
      case "-h":
      case "--help":
        help = true;
        break;
      case "-v":
      case "--version":
        version = true;
        break;
      case "-d":
      case "--data":
        data = argv[++i];
        if (!data) throw new Error(`${arg} requires a file.`);
        break;
      case "--set":
        sets.push(argv[++i] ?? "");
        break;
      case "--check":
        check = true;
        break;
      case "--dry-run":
        dryRun = true;
        break;
      default:
        if (arg?.startsWith("-")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        if (file) throw new Error(`Unexpected argument: ${arg}`);
        file = arg;
    }
  }

  if (!help && !version && !file) {
    throw new Error("A Markdown file is required.");
  }

  return {
    templateFile: file ?? "",
    dataFile: data,
    sets,
    check,
    dryRun,
    help,
    version,
  };
}

/**
 * Load template variables from a `--data` JSON file merged with
 * `--set key=value` overrides.
 *
 * `--set` values are applied on top of the data file, so they take
 * precedence when the same key appears in both.
 *
 * @param dataPath - Path to a JSON file whose top level must be an object, or `undefined`.
 * @param sets - Raw `key=value` strings from `--set` flags.
 * @returns The merged variables.
 * @throws {Error} If the data file's JSON top level is not a plain object,
 *   or if `sets` contains an invalid entry.
 */

async function loadVariables(dataPath: string | undefined, sets: readonly string[]) {
  let variables: Record<string, unknown> = {};

  if (dataPath) {
    const parsed: unknown = JSON.parse(await readFile(dataPath, "utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("--data must contain a JSON object.");
    }
    variables = parsed as Record<string, unknown>;
  }

  Object.assign(variables, parseSetValues(sets));
  return variables;
}

/**
 * Write `content` to `path` atomically, preserving the original file's mode.
 *
 * Writes to a temporary file in a sibling temp directory on the same
 * filesystem as `path`, then renames it into place, so readers of `path`
 * never observe a partially-written file. The temp directory is always
 * cleaned up, even if the write or rename fails.
 *
 * @param path - The destination file path. Must already exist (its mode is read and reapplied).
 * @param content - The bytes to write.
 */
async function atomicWrite(path: string, content: Buffer): Promise<void> {
  const directory = dirname(path);
  const tempDirectory = await mkdtemp(join(directory, ".spall-"));
  const temporaryPath = join(tempDirectory, "output");
  const originalMode = (await stat(path)).mode;

  try {
    await writeFile(temporaryPath, content);
    await chmod(temporaryPath, originalMode);
    await rename(temporaryPath, path);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

/**
 * Run the `spall` CLI.
 *
 * Parses arguments, renders the target file's managed blocks,
 * and either checks, prints, or writes the result depending on
 * the flags given.
 *
 * @returns The process exit code.
 */
async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(usage());
    return 0;
  }

  if (args.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  const source = await readFile(args.templateFile);
  const variables = await loadVariables(args.dataFile, args.sets);
  const rendered = await renderBlocks(source, { variables });

  const changed = !source.equals(rendered);

  if (args.check) {
    if (changed) {
      process.stderr.write(`${args.templateFile}: generated content is out of date\n`);
      return 1;
    }

    return 0;
  }

  if (args.dryRun) {
    process.stdout.write(rendered);
    return 0;
  }

  if (changed) {
    await atomicWrite(args.templateFile, rendered);
  }

  return 0;
}

/**
 * Whether this module is being run directly (e.g. `node cli.js ...`) rather
 * than imported, e.g. from a test file. Used to gate the top-level
 * side-effecting call to {@link main} so importing this module for its
 * exports (in tests) doesn't also execute the CLI.
 */
function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  try {
    process.exitCode = await main();
  } catch (error) {
    process.stderr.write(
      `spall error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

export { usage, parseArgs, loadVariables, atomicWrite, main, VERSION };
export type { Arguments };
