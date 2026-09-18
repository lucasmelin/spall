#!/usr/bin/env node
import { pathToFileURL } from "url";
import type { Command } from "./command.js";
import { renderCommand } from "./render.js";
import { checkCommand } from "./check.js";

/** The version of the spall CLI. */
const VERSION = "0.0.1";

/**
 * All subcommands the CLI knows about.
 */
const commands: readonly Command[] = [renderCommand, checkCommand];

/**
 * Look up a registered subcommand by name.
 *
 * @param name - The subcommand name as typed on the command line.
 * @returns The matching command, or `undefined` if none is registered.
 */
function findCommand(name: string): Command | undefined {
  return commands.find((command) => command.name === name);
}

/**
 * Build the CLI's top-level `--help` text.
 *
 * @returns The full usage/help message.
 */
function usage(): string {
  const longestName = Math.max(...commands.map((command) => command.name.length));
  const listing = commands
    .map((command) => `  ${command.name.padEnd(longestName + 2)}${command.summary}`)
    .join("\n");

  return `
Usage:
  spall <command> [options]

Commands:
${listing}

Global options:
  -h, --help             Show this help
  -v, --version          Show the version

Run \`spall <command> --help\` for a command's own options.
`;
}

/**
 * Run the `spall` CLI.
 *
 * Handles the global `--help`/`--version` flags, then dispatches to
 * whichever registered subcommand matches the first argument, passing it
 * the rest of the arguments to parse and act on itself.
 *
 * @returns The process exit code.
 */
async function main(): Promise<number> {
  const [first, ...rest] = process.argv.slice(2);

  if (first === undefined || first === "-h" || first === "--help") {
    process.stdout.write(usage());
    return 0;
  }

  if (first === "-v" || first === "--version") {
    process.stdout.write(`spall ${VERSION}\n`);
    return 0;
  }

  const command = findCommand(first);
  if (!command) {
    throw new Error(`Unknown command: ${first}\n\n${usage()}`);
  }

  return command.run(rest);
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

export { commands, findCommand, main, usage, VERSION };
