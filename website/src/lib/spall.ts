// Single entry point for the real @lucasmelin/spall code used by the playground.
//
// The package currently only publishes a CLI entry (`bin`), but its rendering
// core lives in `dist/spall.js`, which has no dependency on the filesystem.
// We import that module directly so the playground runs the exact same code as
// the CLI.
import { Buffer } from "./buffer-polyfill";

export {
  BEGIN_MARKER,
  GENERATE_MARKER,
  END_MARKER,
  findBlocks,
  renderBlocks,
  parseSetValues,
} from "@lucasmelin/spall";
export type { Block } from "@lucasmelin/spall";
export { Buffer };
