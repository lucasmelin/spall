import { Prec, type Extension, type Text } from "@codemirror/state";
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from "@codemirror/view";
import { classifyLines, type LineKind } from "./spall-lines";

/** Makes Spall's structure visible in an editor: tinted regions, marker text and Knap tokens. */

type Range = ReturnType<Decoration["range"]>;

const lineClass: Record<Exclude<LineKind, "plain">, string> = {
  begin: "cm-spall-begin",
  template: "cm-spall-template",
  generate: "cm-spall-generate",
  output: "cm-spall-output",
  end: "cm-spall-end",
};

function build(doc: Text): DecorationSet {
  const infos = classifyLines(doc.toString().split("\n"));
  const ranges: Range[] = [];

  infos.forEach((info, index) => {
    const line = doc.line(index + 1);
    if (info.kind !== "plain")
      ranges.push(Decoration.line({ class: lineClass[info.kind] }).range(line.from));
    if (info.marker) {
      ranges.push(
        Decoration.mark({ class: "cm-spall-marker" }).range(
          line.from + info.marker.from,
          line.from + info.marker.to,
        ),
      );
    }
    for (const token of info.tokens) {
      if (token.to > token.from) {
        ranges.push(
          Decoration.mark({ class: token.cls }).range(line.from + token.from, line.from + token.to),
        );
      }
    }
  });

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
