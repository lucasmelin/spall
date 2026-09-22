import { createEngine, standardFilters } from "knap";
import { describe, expect, it } from "vitest";

import {
  applyEdits,
  BEGIN_MARKER,
  END_MARKER,
  GENERATE_MARKER,
  defaultEngine,
  findBlocks,
  parseSetValues,
  renderDocument,
} from "../src/spall.js";
import type { Diagnostic, DocumentRenderResult } from "../src/spall.js";

describe("findBlocks", () => {
  it("finds a single managed block", () => {
    const source = Buffer.from(
      `before
<!--
[[[spall:begin
Hello {{ name }}
spall:generate]]]-->
<!--[[[spall:end]]]-->
after
`,
    );

    const blocks = findBlocks(source);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.template).toEqual(`Hello {{ name }}\n`);
  });

  it("finds multiple managed blocks", () => {
    const source = Buffer.from(
      `a
<!--
[[[spall:begin
{{ one }}
spall:generate]]]-->
b
<!--[[[spall:end]]]-->
<!--
[[[spall:begin
{{ two }}
spall:generate]]]-->
<!--[[[spall:end]]]-->
c`,
    );

    expect(findBlocks(source)).toHaveLength(2);
  });

  it("rejects a block whose output region never reaches the end marker", () => {
    expect(() =>
      findBlocks(
        Buffer.from(`before
[[[spall:begin
{{ value }}
spall:generate]]]
stale output, never terminated
`),
      ),
    ).toThrow(/no matching/);
  });

  it("is inert to a second begin marker found inside a template", () => {
    // A marker only means something in the parser state that expects it.
    // A stray begin marker while already inside a template is just template
    // text, not a nested block.
    const source = Buffer.from(
      `[[[spall:begin
line one
[[[spall:begin
line two
spall:generate]]]
[[[spall:end]]]
`,
    );

    const blocks = findBlocks(source);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.template).toEqual("line one\n[[[spall:begin\nline two\n");
  });

  it("is inert to a stray end marker found outside any block", () => {
    const source = Buffer.from(
      `[[[spall:end]]]
[[[spall:begin
{{ value }}
spall:generate]]]
[[[spall:end]]]
`,
    );

    const blocks = findBlocks(source);

    expect(blocks).toHaveLength(1);
  });

  it("allows an empty template body", () => {
    const source = Buffer.from(
      `[[[spall:begin
spall:generate]]]
[[[spall:end]]]
`,
    );

    const blocks = findBlocks(source);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.template).toEqual("");
  });

  it("finds markers wrapped in different comment prefixes on one line", () => {
    const source = Buffer.from(
      `prologue
--[[[spall:begin
--{{ value }}
--spall:generate]]]
xx0
--[[[spall:end]]]
`,
    );

    const blocks = findBlocks(source);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.template).toEqual("{{ value }}\n");
  });

  it("handles a source with no trailing newline at all", () => {
    // The final line of the file has no LF, so nextLineStart must fall
    // back to source.length rather than searching forever.
    const source = Buffer.from(
      `[[[spall:begin
{{ value }}
spall:generate]]]
[[[spall:end]]]`,
    );

    const blocks = findBlocks(source);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.outputStart).toEqual(blocks[0]?.outputEnd);
  });

  it("records the common line prefix used by a block", () => {
    const source = Buffer.from(
      [
        "// [[[spall:begin",
        "// {{ value }}",
        "// spall:generate]]]",
        "value",
        "// [[[spall:end]]]",
      ].join("\n"),
    );

    expect(findBlocks(source)[0]?.prefix).toBe("// ");
  });

  it("does not record a prefix when begin and generate prefixes differ", () => {
    const source = Buffer.from(
      [
        "// [[[spall:begin",
        "// {{ value }}",
        "spall:generate]]]",
        "value",
        "[[[spall:end]]].",
      ].join("\n"),
    );

    expect(findBlocks(source)[0]?.prefix).toBe("");
  });
});

describe("renderDocument", () => {
  it("renders blocks and reports document-relative UTF-16 ranges", async () => {
    const source = [
      "before 😀",
      "// [[[spall:begin",
      "// Hello {{ name }}",
      "// spall:generate]]]",
      "old",
      "// [[[spall:end]]]",
      "after",
    ].join("\n");

    const result = await renderDocument(source, { variables: { name: "Lucas" } });
    const start = source.indexOf("old");

    expect(result.errors).toEqual([]);
    expect(result.output).toContain("Lucas");
    expect(result.blocks).toHaveLength(1);
    const [firstBlock] = result.blocks;
    if (!firstBlock) throw new Error("expected a rendered block");
    expect(source.slice(firstBlock.start, firstBlock.end)).toBe("old\n");
    expect(firstBlock).toMatchObject({
      start,
      end: start + 4,
      output: "Hello Lucas\n",
      changed: true,
      errors: [],
      warnings: [],
    });
  });

  it("keeps unchanged blocks marked unchanged", async () => {
    const source = [BEGIN_MARKER, "static", GENERATE_MARKER, "static", END_MARKER].join("\n");

    const result = await renderDocument(source, { variables: {} });

    expect(result.output).toBe(source);
    expect(result.blocks[0]?.changed).toBe(false);
  });

  it("returns structured Knap errors at document positions", async () => {
    const source = [
      "prefix",
      BEGIN_MARKER,
      "{{ missing | definitely_not_a_filter }}",
      GENERATE_MARKER,
      "stale",
      END_MARKER,
    ].join("\n");

    const result = await renderDocument(source, { variables: {} });
    const error = result.blocks[0]?.errors[0];

    expect(error).toBeDefined();
    expect(error?.severity).toBe("error");
    expect(error?.line).toBe(3);
    expect(error?.column).toBeGreaterThan(1);
    expect(error?.code).toBeDefined();
    expect(result.output).toBeNull();
  });

  it("reports malformed block structure as a document-level error", async () => {
    const source = `${BEGIN_MARKER}\nhello\n${GENERATE_MARKER}\nstale\n`;
    const result = await renderDocument(source, { variables: {} });

    expect(result.blocks).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.line).toBe(1);
    expect(result.errors[0]?.message).toMatch(/no matching/);
    expect(result.output).toBeNull();
  });

  it("supports a caller-provided engine", async () => {
    const engine = createEngine({ filters: standardFilters });
    expect(engine).not.toBe(defaultEngine);

    const source = `${BEGIN_MARKER}\n{{ name | upper }}\n${GENERATE_MARKER}\n\n${END_MARKER}`;
    const result = await renderDocument(source, {
      variables: { name: "ada" },
      engine,
    });

    expect(result.output).toContain("ADA");
  });
});

const vars = { title: "The Matrix", cast: ["Neo", "Trinity"] };

/** An HTML-comment block, with whatever is currently in its generated region. */
const block = (template: string, generated = "") =>
  `<!--[[[spall:begin\n${template}\nspall:generate]]]-->\n${generated}<!--[[[spall:end]]]-->\n`;

const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;

/** Documents that render cleanly, chosen to stress offset handling. */
const clean: [string, string][] = [
  ["one block", `intro\n${block("## {{ title }}\n{{ cast | list }}")}`],
  ["stale output", block("{{ title }}", "old\n")],
  ["already up to date", block("{{ title }}", "The Matrix\n")],
  [
    "two blocks, one stale",
    `${block("{{ title }}", "The Matrix\n")}\nmiddle\n${block("{{ cast | list }}", "stale\n")}`,
  ],
  [
    "line comments",
    `// [[[spall:begin\n// const a = "{{ title }}";\n// spall:generate]]]\n// [[[spall:end]]]\n`,
  ],
  [
    "obsidian comments",
    `%%[[[spall:begin\n{{ title }}\nspall:generate]]]%%\n%%[[[spall:end]]]%%\n`,
  ],
  [
    "emoji and accents before and inside",
    `héllo 🎉 wörld\n${block("{{ title }} 🎉 café")}after 🎉\n`,
  ],
  ["no blocks", "just some text\n"],
];

/** Documents with a template error, with the text the diagnostic should underline. */
const broken: [string, string, string][] = [
  ["unknown filter", block("{{ title | nofilter }}"), "nofilter"],
  ["unknown filter after emoji", `héllo 🎉\n${block("{{ title | nofilter }}")}`, "nofilter"],
  ["parse error", block("ok\n{% if %}"), "{%"],
  [
    "prefixed template",
    `// [[[spall:begin\n// fine {{ title }}\n// {% if %}\n// spall:generate]]]\n// [[[spall:end]]]\n`,
    "{%",
  ],
  ["error in second block", `${block("{{ title }}")}${block("{{ cast | nofilter }}")}`, "nofilter"],
];

function expectEditsAreSane(doc: string, result: DocumentRenderResult) {
  let previousEnd = 0;
  for (const edit of result.edits) {
    expect(edit.from).toBeGreaterThanOrEqual(previousEnd); // sorted, and no overlaps
    expect(edit.to).toBeGreaterThanOrEqual(edit.from);
    expect(edit.to).toBeLessThanOrEqual(doc.length);
    previousEnd = edit.to;
  }
}

function expectDiagnosticsAreSane(doc: string, list: Diagnostic[]) {
  for (const d of list) {
    expect(d.from).toBeGreaterThanOrEqual(0);
    expect(d.to).toBeGreaterThan(d.from);
    expect(d.to).toBeLessThanOrEqual(doc.length);
    expect(d.line).toBe(lineOf(doc, d.from));
  }
  expect([...list].sort((a, b) => a.from - b.from)).toEqual(list); // already in document order
}

describe("renderDocument: edits", () => {
  it.each(clean)("%s: applying the edits produces the output", async (_name, doc) => {
    const result = await renderDocument(doc, { variables: vars });
    expect(result.errors).toEqual([]);
    expect(result.output).not.toBeNull();
    expect(applyEdits(doc, result.edits)).toBe(result.output);
    expectEditsAreSane(doc, result);
  });

  it.each(clean)("%s: rendering the output changes nothing", async (_name, doc) => {
    const first = await renderDocument(doc, { variables: vars });
    const again = await renderDocument(first.output!, { variables: vars });
    expect(again.edits).toEqual([]);
    expect(again.output).toBe(first.output);
  });

  it("an up to date document has no edits and is returned unchanged", async () => {
    const doc = block("{{ title }}", "The Matrix\n");
    const result = await renderDocument(doc, { variables: vars });
    expect(result.edits).toEqual([]);
    expect(result.output).toBe(doc);
  });

  it("only changed blocks produce edits", async () => {
    const doc = `${block("{{ title }}", "The Matrix\n")}\nmiddle\n${block("{{ cast | list }}", "stale\n")}`;
    const result = await renderDocument(doc, { variables: vars });
    expect(result.blocks.map((b) => b.changed)).toEqual([false, true]);
    expect(result.edits).toHaveLength(1);
  });

  it("each edit replaces exactly the old generated text, even after non-ASCII text", async () => {
    // Offsets are UTF-16 here but bytes inside spall, so this is where a mix-up would show.
    const first = block("{{ title }}", "old 🎉 café\n");
    const second = block("{{ cast | list }}", "älso stale 🎉\n");
    const doc = `héllo 🎉 wörld\n${first}\n🎉🎉🎉\n${second}`;
    const { edits } = await renderDocument(doc, { variables: vars });
    expect(edits.map((e) => doc.slice(e.from, e.to))).toEqual(["old 🎉 café\n", "älso stale 🎉\n"]);
  });

  it("applyEdits does not depend on the order edits are given in", async () => {
    const doc = `${block("{{ title }}")}${block("{{ cast | list }}")}`;
    const { edits, output } = await renderDocument(doc, { variables: vars });
    expect(edits).toHaveLength(2);
    expect(applyEdits(doc, [...edits].reverse())).toBe(output);
  });
});

describe("renderDocument: diagnostics", () => {
  it.each(broken)("%s: underlines the right text", async (_name, doc, expected) => {
    const result = await renderDocument(doc, { variables: vars });
    expect(result.errors.length).toBeGreaterThan(0);
    const last = result.errors[result.errors.length - 1];
    if (!last) throw new Error("expected at least one error");
    expect(doc.slice(last.from, last.to).startsWith(expected)).toBe(true);
    expectDiagnosticsAreSane(doc, result.errors);
  });

  it.each(broken)("%s: has no output and no edits", async (_name, doc) => {
    const result = await renderDocument(doc, { variables: vars });
    expect(result.output).toBeNull();
    expect(result.edits).toEqual([]);
  });

  it("output is null exactly when there are errors", async () => {
    for (const [, doc] of clean)
      expect((await renderDocument(doc, { variables: vars })).output).not.toBeNull();
    for (const [, doc] of broken)
      expect((await renderDocument(doc, { variables: vars })).output).toBeNull();
  });

  it("keeps diagnostics on the right text after a long non-ASCII prefix", async () => {
    // Long enough that a bytes-versus-characters error can't be hidden by anything else.
    const doc = `${"🎉".repeat(40)}\nüber\n${block("a\nb\n{{ x | nofilter }}\nc")}`;
    const { errors } = await renderDocument(doc, { variables: { x: 1 } });
    expect(errors).toHaveLength(1);
    const [error] = errors;
    if (!error) throw new Error("expected an error");
    expect(doc.slice(error.from, error.to)).toBe("nofilter");
    expect(error.line).toBe(lineOf(doc, doc.indexOf("nofilter")));
  });

  it("reports an unclosed block by line, not byte", async () => {
    const doc = "a\nb\n<!--[[[spall:begin\n{{ title }}";
    const result = await renderDocument(doc, { variables: vars });
    expect(result.output).toBeNull();
    expect(result.blocks).toEqual([]);
    expect(result.errors).toHaveLength(1);
    const [error] = result.errors;
    if (!error) throw new Error("expected an error");
    expect(error.message).toContain("on line 3");
    expect(error.message).not.toContain("byte");
    expect(error.line).toBe(3);
    expectDiagnosticsAreSane(doc, result.errors);
  });

  it("returns errors and warnings together in document order", async () => {
    const doc = `${block("{{ n | round }}")}${block("{{ title | nofilter }}")}`;
    const result = await renderDocument(doc, { variables: { n: "abc", title: "x" } });
    expect(result.warnings).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.diagnostics.map((d) => d.severity)).toEqual(["warning", "error"]);
    expectDiagnosticsAreSane(doc, result.diagnostics);
  });
});

describe("renderDocument: validateOnly", () => {
  it.each(broken)("%s: reports the same errors as rendering", async (_name, doc) => {
    const rendered = await renderDocument(doc, { variables: {} });
    const validated = await renderDocument(doc, { validateOnly: true });
    expect(validated.errors).toEqual(rendered.errors);
  });

  it.each(clean)("%s: finds nothing wrong, and renders nothing", async (_name, doc) => {
    const result = await renderDocument(doc, { validateOnly: true });
    expect(result.errors).toEqual([]);
    expect(result.output).toBeNull();
    expect(result.edits).toEqual([]);
  });

  it("leaves out warnings, which depend on the data", async () => {
    const doc = block("{{ n | round }}");
    expect((await renderDocument(doc, { variables: { n: "abc" } })).warnings).toHaveLength(1);
    expect((await renderDocument(doc, { validateOnly: true })).warnings).toEqual([]);
  });
});

describe("renderDocument: engine option", () => {
  it("renders with the engine it is given", async () => {
    const engine = {
      render: async () => ({ output: "STUB\n", errors: [], warnings: [] }),
      validate: () => [],
    } as unknown as NonNullable<Parameters<typeof renderDocument>[1]>["engine"];
    const result = await renderDocument(block("{{ title }}"), { variables: vars, engine });
    expect(result.output).toContain("STUB");
  });
});

describe("parseSetValues", () => {
  it("supports values containing equals signs", () => {
    expect(parseSetValues(["url=https://example.test?a=b"])).toEqual({
      url: "https://example.test?a=b",
    });
  });

  it("uses the last value for duplicate keys", () => {
    expect(parseSetValues(["name=first", "name=second"])).toEqual({
      name: "second",
    });
  });

  it("rejects malformed values", () => {
    expect(() => parseSetValues(["missing-equals"])).toThrow(/KEY=VALUE/);
  });
});
