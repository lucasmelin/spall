import { writeFile, readFile } from "fs/promises";
import { renderBlocks } from "./spall.js";
import { loadVariables } from "./variables.js";
import type { Command } from "./command.js";

/**
 * Parsed arguments for the `render` subcommand.
 */
export type RenderArguments = {
  /** Path to the Markdown file to render. */
  templateFile: string;
  /** Path to a JSON file of template variables, if `--data`/`-d` was provided. */
  dataFile?: string;
  /** Raw `key=value` strings from the `--set` flags.
   * Empty if `--set` was not provided. */
  sets: string[];
  /** Render and print the result without modifying the file. */
  dryRun: boolean;
  /** Print this subcommand's usage information and exit. */
  help: boolean;
};

/**
 * Build the `render` subcommand's `--help` text.
 *
 * @returns The full usage/help message for `render`.
 */
export function renderUsage(): string {
  return `
Usage:
  spall render <file>
  spall render <file> --data data.json
  spall render <file> --set key=value
  spall render <file> --dry-run

Render every Spall-managed block in <file> using the Knap template engine.

Options:
  -d, --data <file>      JSON object containing template variables
      --set <k=v>        Set/override a top-level template variable; repeatable
      --dry-run          Render and print the result without modifying the file
  -h, --help             Show this help text

Managed blocks:
  <!--
  [[[spall:begin]]]
  ... Knap template (preserved every run, hidden in an HTML comment) ...
  spall:generate]]]-->
  ... generated output (replaced every run, rendered normally) ...
  <!--[[[spall:end]]]-->

Everything outside managed blocks is preserved verbatim.

To check whether a file is up-to-date without writing to it, use
\`spall validate\` instead.
`;
}

/**
 * Parse the arguments to the `render` subcommand.
 *
 * @param argv - Arguments following `render` on the command line.
 * @returns The parsed arguments.
 * @throws {Error} If an option requiring a value is missing one, an unknown
 *   option is given, more than one file is given, or no file and no `--help`
 *   is given.
 */
export function parseRenderArgs(argv: readonly string[]): RenderArguments {
  let file: string | undefined;
  let data: string | undefined;
  const sets: string[] = [];
  let dryRun = false;
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

  if (!help && !file) {
    throw new Error("A Markdown file is required.");
  }

  return {
    templateFile: file ?? "",
    dataFile: data,
    sets,
    dryRun,
    help,
  };
}

/**
 * Run the `render` subcommand.
 *
 * Parses its arguments, renders the target file's managed blocks, and
 * either prints or writes the result depending on the flags given.
 *
 * @param argv - Arguments following `render` on the command line.
 * @returns The process exit code.
 */
export async function runRender(argv: readonly string[]): Promise<number> {
  const args = parseRenderArgs(argv);

  if (args.help) {
    process.stdout.write(renderUsage());
    return 0;
  }

  const source = await readFile(args.templateFile);
  const variables = await loadVariables(args.dataFile, args.sets);
  const rendered = await renderBlocks(source, { variables });

  if (args.dryRun) {
    process.stdout.write(rendered);
    return 0;
  }

  if (!source.equals(rendered)) {
    await writeFile(args.templateFile, rendered);
  }

  return 0;
}

/** The `render` subcommand, registered with the CLI dispatcher in `cli.ts`. */
export const renderCommand: Command = {
  name: "render",
  summary: "Render Spall-managed blocks in a file using Knap",
  usage: renderUsage,
  run: runRender,
};
