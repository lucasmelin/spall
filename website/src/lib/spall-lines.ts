import { knapStreamParser } from "knap/codemirror";
import { BEGIN_MARKER, END_MARKER, GENERATE_MARKER } from "./spall";

/**
 * Works out which part of a Spall block each line belongs to:
 *
 *   begin marker
 *   template      <- the Knap source you write (tokenised as Knap)
 *   generate marker
 *   output        <- what spall wrote last time, replaced on every run
 *   end marker
 *
 * This follows the same line-oriented state machine as `findBlocks` in Spall, but it is lenient:
 * a block that is still being typed (no generate or end marker yet) is classified as far as it goes.
 * It's pure, so the playground's editors and the landing page's code samples share it.
 */

export type LineKind = "plain" | "begin" | "template" | "generate" | "output" | "end";

/** A styled span inside a line. Offsets are within that line's text. */
export type Token = { from: number; to: number; cls: string };

export type LineInfo = {
  kind: LineKind;
  /** Where the spall marker sits in a marker line. */
  marker: { from: number; to: number } | null;
  tokens: Token[];
};

/**
 * Spall removes a shared comment prefix (e.g. `// `) from the template, but only when the begin and
 * generate markers agree on it and every non-empty template line carries it.
 */
function sharedPrefix(begin: string, generate: string | null, lines: string[]) {
  const prefix = generate === null || generate === begin ? begin : "";
  if (!prefix) return "";
  const content = lines.filter((text) => text.trim() !== "");
  return content.length > 0 && content.every((text) => text.startsWith(prefix)) ? prefix : "";
}

function tokenizeTemplate(indices: number[], lines: string[], prefix: string, infos: LineInfo[]) {
  const state = knapStreamParser.startState();
  for (const index of indices) {
    const text = lines[index];
    const cut = prefix && text.startsWith(prefix) ? prefix.length : 0;
    if (cut) infos[index].tokens.push({ from: 0, to: cut, cls: "cm-spall-prefix" });

    // Knap's parser only needs `string` and `pos`, so we can drive it one line at a time.
    const stream = { string: text.slice(cut), pos: 0 };
    while (stream.pos < stream.string.length) {
      const start = stream.pos;
      const type = knapStreamParser.token(stream, state);
      if (stream.pos <= start) stream.pos = start + 1;
      infos[index].tokens.push({
        from: cut + start,
        to: cut + stream.pos,
        cls: `cm-knap-${type ?? "text"}`,
      });
    }
  }
}

const markerAt = (text: string, marker: string) => {
  const at = text.indexOf(marker);
  return at < 0 ? null : { from: at, to: at + marker.length };
};

export function classifyLines(lines: string[]): LineInfo[] {
  const infos: LineInfo[] = lines.map(() => ({ kind: "plain", marker: null, tokens: [] }));
  let mode: "outside" | "template" | "output" = "outside";
  let beginPrefix = "";
  let template: number[] = [];

  const templateText = () => template.map((i) => lines[i]);

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];

    if (mode === "outside") {
      const at = text.indexOf(BEGIN_MARKER);
      if (at >= 0) {
        infos[i].kind = "begin";
        infos[i].marker = markerAt(text, BEGIN_MARKER);
        beginPrefix = text.slice(0, at);
        template = [];
        mode = "template";
      }
    } else if (mode === "template") {
      const at = text.indexOf(GENERATE_MARKER);
      if (at >= 0) {
        infos[i].kind = "generate";
        infos[i].marker = markerAt(text, GENERATE_MARKER);
        tokenizeTemplate(
          template,
          lines,
          sharedPrefix(beginPrefix, text.slice(0, at), templateText()),
          infos,
        );
        template = [];
        mode = "output";
      } else {
        infos[i].kind = "template";
        template.push(i);
      }
    } else {
      const at = text.indexOf(END_MARKER);
      if (at >= 0) {
        infos[i].kind = "end";
        infos[i].marker = markerAt(text, END_MARKER);
        mode = "outside";
      } else {
        infos[i].kind = "output";
      }
    }
  }

  // A template that was never closed is still worth highlighting while it's being written.
  if (mode === "template")
    tokenizeTemplate(template, lines, sharedPrefix(beginPrefix, null, templateText()), infos);

  return infos;
}
