/**
 * A `spall` subcommand.
 *
 * Each subcommand owns its own argument parsing, help text, and behavior,
 * so adding a new one means adding a new module that implements this
 * interface and registering it in `cli.ts`.
 */
export interface Command {
  /** The subcommand's name. */
  readonly name: string;
  /** One-line description shown next to this command in the top-level `--help` listing. */
  readonly summary: string;
  /** Build this subcommand's own `--help` text. */
  usage(): string;
  /**
   * Run this subcommand.
   *
   * @param argv - The remaining command-line arguments, with the program
   *   name and the subcommand name already stripped off.
   * @returns The process exit code.
   */
  run(argv: readonly string[]): Promise<number>;
}
