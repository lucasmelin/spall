import { readFile } from "fs/promises";
import { renderDocument, formatDiagnostic } from "./spall.js";
import { loadVariables } from "./variables.js";
import type { Command } from "./command.js";

/**
 * Parsed arguments for the `check` subcommand.
 */
export interface CheckArguments {
  /** Path to the Markdown file to check. */
  templateFile: string;
  /** Path to a JSON file of template variables, if `--data`/`-d` was provided. */
  dataFile?: string;
  /** Raw `key=value` strings from the `--set` flags. */
  sets: string[];
  /** Print this subcommand's usage information and exit. */
  help: boolean;
}

/**
 * Build the `check` subcommand's `--help` text.
 *
 * @returns The full usage/help message for `check`.
 */
export function checkUsage(): string {
  return `
Usage:
  spall check <file>
  spall check <file> --data data.json
  spall check <file> --set key=value

Render <file> and exit 1 if the result would differ from what's on disk,
without writing anything.

Options:
  -d, --data <file>      JSON object containing template variables
      --set <k=v>        Set/override a top-level template variable; repeatable
  -h, --help             Show this help
`;
}

/**
 * Parse the arguments to the `check` subcommand.
 *
 * @param argv - Arguments following `check` on the command line.
 * @returns The parsed arguments.
 * @throws {Error} If an option requiring a value is missing one, an unknown
 *   option is given, more than one file is given, or no file and no `--help`
 *   is given.
 */
export function parseCheckArgs(argv: readonly string[]): CheckArguments {
  let file: string | undefined;
  let data: string | undefined;
  const sets: string[] = [];
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    switch (arg) {
      case "-h":
      case "--help":
        help = true;
        break;
      case "-d":
      case "--data":
        data = argv[++i];
        if (!data) throw new Error(`${arg} requires a file.`);
        break;
      case "--set":
        sets.push(argv[++i] ?? "");
        break;
      default:
        if (arg?.startsWith("-")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        if (file) throw new Error(`Unexpected argument: ${arg}`);
        file = arg;
    }
  }

  if (!help && !file) {
    throw new Error("A Markdown file is required.");
  }

  return {
    templateFile: file ?? "",
    dataFile: data,
    sets,
    help,
  };
}

/**
 * Run the `check` subcommand.
 *
 * Parses its arguments, renders the target file's managed blocks, and
 * reports whether the result would differ from what's currently on disk,
 * without writing anything back.
 *
 * @param argv - Arguments following `check` on the command line.
 * @returns The process exit code: `1` if rendering would change the file, `0` otherwise.
 */
export async function runCheck(argv: readonly string[]): Promise<number> {
  const args = parseCheckArgs(argv);

  if (args.help) {
    process.stdout.write(checkUsage());
    return 0;
  }

  const source = await readFile(args.templateFile);
  const variables = await loadVariables(args.dataFile, args.sets);

  const sourceText = source.toString("utf8");
  const result = await renderDocument(sourceText, { variables });

  if (result.errors.length > 0) {
    for (const diagnostic of result.errors) {
      process.stderr.write(`${args.templateFile}: ${formatDiagnostic(diagnostic)}\n`);
    }
    return 1;
  }

  if (result.output !== sourceText) {
    process.stderr.write(`${args.templateFile}: generated content is out-of-date\n`);
    return 1;
  }

  return 0;
}

/** The `check` subcommand, registered with the CLI dispatcher in `cli.ts`. */
export const checkCommand: Command = {
  name: "check",
  summary: "Check whether a file's generated output is up-to-date",
  usage: checkUsage,
  run: runCheck,
};
