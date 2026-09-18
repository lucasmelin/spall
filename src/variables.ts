import { readFile } from "fs/promises";
import { parseSetValues } from "./spall.js";

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
export async function loadVariables(dataPath: string | undefined, sets: readonly string[]) {
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
