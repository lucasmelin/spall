// Spall is written for Node and uses the global `Buffer`.
// This module runs first and makes sure one exists in the browser. It must be imported before Spall.
//
// Whichever Buffer ends up global is the one we export, so Spall and the playground always agree
// (in Node, e.g. while prerendering, that's the native one; in browsers it's the polyfill).
import { Buffer as PolyfillBuffer } from "buffer/index.js";

const scope = globalThis as unknown as { Buffer?: unknown };
if (typeof scope.Buffer === "undefined") scope.Buffer = PolyfillBuffer;

// The polyfill mirrors Node's API, so we type it as Node's Buffer (which is what Spall expects).
const impl = scope.Buffer as typeof globalThis.Buffer;
export const Buffer = impl;
export type Buffer = InstanceType<typeof impl>;
