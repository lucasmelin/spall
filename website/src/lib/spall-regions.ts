import { Prec, type Extension, type Line, type Text } from "@codemirror/state";
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from "@codemirror/view";
import { knapStreamParser } from "knap/codemirror";
import { BEGIN_MARKER, END_MARKER, GENERATE_MARKER } from "./spall";

/**
 * Makes Spall's structure visible in an editor.
 *
 *   begin marker
 *   template      <- the Knap source you write (highlighted as Knap)
 *   generate marker
 *   output        <- what Spall wrote last time, replaced on every run
 *   end marker
 *
 * This follows the same line-oriented state machine as `findBlocks` in Spall, but it is lenient:
 * a block that is still being typed (no generate or end marker yet) is decorated as far as it goes.
 */

type Range = ReturnType<Decoration["range"]>;

const line = (cls: string, at: number): Range => Decoration.line({ class: cls }).range(at);
const mark = (cls: string, from: number, to: number): Range | null =>
  to > from ? Decoration.mark({ class: cls }).range(from, to) : null;

/**
 * Spall removes a shared comment prefix (e.g. `// `) from the template, but only when the begin and
 * generate markers agree on it and every non-empty template line carries it.
 */
function sharedPrefix(begin: string, generate: string | null, lines: Line[]) {
  const prefix = generate === null || generate === begin ? begin : "";
  if (!prefix) return "";
  const content = lines.filter((l) => l.text.trim() !== "");
  return content.length > 0 && content.every((l) => l.text.startsWith(prefix)) ? prefix : "";
}

function tokenizeTemplate(lines: Line[], prefix: string, out: Range[]) {
  const state = knapStreamParser.startState();
  for (const l of lines) {
    const cut = prefix && l.text.startsWith(prefix) ? prefix.length : 0;
    const dim = mark("cm-spall-prefix", l.from, l.from + cut);
    if (dim) out.push(dim);

    // Knap's parser only needs `string` and `pos`, so we can drive it one line at a time.
    const stream = { string: l.text.slice(cut), pos: 0 };
    while (stream.pos < stream.string.length) {
      const start = stream.pos;
      const type = knapStreamParser.token(stream, state);
      if (stream.pos <= start) stream.pos = start + 1;
      const token = mark(
        `cm-knap-${type ?? "text"}`,
        l.from + cut + start,
        l.from + cut + stream.pos,
      );
      if (token) out.push(token);
    }
  }
}

function markerRange(l: Line, marker: string): Range | null {
  const at = l.text.indexOf(marker);
  return at < 0 ? null : mark("cm-spall-marker", l.from + at, l.from + at + marker.length);
}

function build(doc: Text): DecorationSet {
  const ranges: Range[] = [];
  let mode: "outside" | "template" | "output" = "outside";
  let beginPrefix = "";
  let template: Line[] = [];

  for (let n = 1; n <= doc.lines; n++) {
    const l = doc.line(n);

    if (mode === "outside") {
      const at = l.text.indexOf(BEGIN_MARKER);
      if (at >= 0) {
        ranges.push(line("cm-spall-begin", l.from));
        const m = markerRange(l, BEGIN_MARKER);
        if (m) ranges.push(m);
        beginPrefix = l.text.slice(0, at);
        template = [];
        mode = "template";
      }
    } else if (mode === "template") {
      const at = l.text.indexOf(GENERATE_MARKER);
      if (at >= 0) {
        ranges.push(line("cm-spall-generate", l.from));
        const m = markerRange(l, GENERATE_MARKER);
        if (m) ranges.push(m);
        tokenizeTemplate(
          template,
          sharedPrefix(beginPrefix, l.text.slice(0, at), template),
          ranges,
        );
        template = [];
        mode = "output";
      } else {
        ranges.push(line("cm-spall-template", l.from));
        template.push(l);
      }
    } else {
      const at = l.text.indexOf(END_MARKER);
      if (at >= 0) {
        ranges.push(line("cm-spall-end", l.from));
        const m = markerRange(l, END_MARKER);
        if (m) ranges.push(m);
        mode = "outside";
      } else {
        ranges.push(line("cm-spall-output", l.from));
      }
    }
  }

  // A template that was never closed is still worth highlighting while it's being written.
  if (mode === "template")
    tokenizeTemplate(template, sharedPrefix(beginPrefix, null, template), ranges);

  return Decoration.set(ranges, true);
}

export const spallRegions: Extension = Prec.lowest(
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view.state.doc);
      }
      update(update: ViewUpdate) {
        if (update.docChanged) this.decorations = build(update.state.doc);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  ),
);
