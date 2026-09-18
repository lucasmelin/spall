import { describe, expect, it } from "vitest";
import { findBlocks, parseSetValues, renderBlocks } from "../src/spall.js";

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
    // A marker only means something in theparser state that expects it.
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
});

describe("renderBlocks", () => {
  it("preserves trailing text glued onto the end marker's own line", async () => {
    const source = Buffer.from(
      `[[[spall:begin
{{ name }}
spall:generate]]]
[[[spall:end]]]Data Data
And some more
`,
    );

    const rendered = await renderBlocks(source, { variables: { name: "Ada" } });

    expect(rendered.toString()).toContain("[[[spall:end]]]Data Data\n");
  });

  it("renders a file with no markers at all, untouched", async () => {
    const strings = ["", " ", "hello", "the cat\nin the\nhat.", "Horton\n\tHears A\n\t\tWho"];

    for (const s of strings) {
      const source = Buffer.from(s);
      const rendered = await renderBlocks(source, { variables: {} });
      expect(rendered.toString()).toEqual(s);
    }
  });
});

describe("renderBlocks", () => {
  it("renders spall and preserves content after the end marker exactly", async () => {
    const suffix = "AFTER\n{{ this is intentionally not rendered }}\n☃\r\n";
    const source = Buffer.from(
      `before
<!--
[[[spall:begin
Hello {{ name }}
spall:generate]]]-->
<!--[[[spall:end]]]-->
${suffix}`,
    );

    const rendered = await renderBlocks(source, {
      variables: { name: "Ada" },
    });

    expect(rendered.toString("utf8")).toEqual(
      `before
<!--
[[[spall:begin
Hello {{ name }}
spall:generate]]]-->
Hello Ada
<!--[[[spall:end]]]-->
${suffix}`,
    );

    const end = rendered.indexOf("<!--[[[spall:end]]]-->", "utf8");
    const trailer = rendered
      .subarray(end + Buffer.byteLength("\n<!--[[[spall:end]]]-->"))
      .toString();
    expect(trailer).toEqual(Buffer.from(suffix).toString());
  });

  it("renders multiple blocks independently", async () => {
    const source = Buffer.from(`<!--
[[[spall:begin
{{ a }}
spall:generate]]]-->
<!--[[[spall:end]]]-->
middle
<!--[[[spall:begin
{{ b }}
spall:generate]]]-->
<!--[[[spall:end]]]-->
`);

    const rendered = await renderBlocks(source, {
      variables: { a: "one", b: "two" },
    });

    expect(rendered.toString()).toEqual(`<!--
[[[spall:begin
{{ a }}
spall:generate]]]-->
one
<!--[[[spall:end]]]-->
middle
<!--[[[spall:begin
{{ b }}
spall:generate]]]-->
two
<!--[[[spall:end]]]-->
`);
  });

  it("renders blocks separated by line comments", async () => {
    const source = Buffer.from(`
// [[[spall:begin
// {{ a }}
// spall:generate]]]
// [[[spall:end]]]
`);

    const rendered = await renderBlocks(source, {
      variables: { a: "one" },
    });

    expect(rendered.toString()).toEqual(`
// [[[spall:begin
// {{ a }}
// spall:generate]]]
one
// [[[spall:end]]]
`);
  });

  it("does not render spall-looking content after END", async () => {
    const source = Buffer.from(`
<!--
[[[spall:begin
{{ value }}
spall:generate]]]-->
<!--[[[spall:end]]]-->
{{ value }}`);

    const rendered = await renderBlocks(source, {
      variables: { value: "rendered" },
    });

    expect(rendered.toString()).toContain(`
<!--[[[spall:end]]]-->
{{ value }}`);
  });

  it("preserves an unchanged file byte-for-byte", async () => {
    const source = Buffer.from(
      "\ufeffprefix\r\n<!--\n[[[spall:begin\nstatic\r\nspall:generate]]]-->\nstatic\r\n<!--[[[spall:end]]]-->\r\nsuffix\n",
    );

    const rendered = await renderBlocks(source, { variables: {} });

    expect(rendered.toString()).toEqual(source.toString());
  });

  it("renders the same file content if no blocks are found", async () => {
    const source = Buffer.from("plain markdown\nfoo\nbar\r\nbaz\n");
    const rendered = await renderBlocks(source, { variables: {} });

    expect(rendered).toEqual(source);
  });

  it("does not interpret generate markers inside generated output", () => {
    const source = Buffer.from(
      [
        "<!-- [[[spall:begin -->",
        "template",
        "spall:generate]]] -->",
        "generated content",
        "spall:generate]]] -->",
        "more generated content",
        "[[[spall:end]]] -->",
      ].join("\n"),
    );

    const [block] = findBlocks(source);

    expect(block?.template).toBe("template\n");
    expect(source.subarray(block?.outputStart, block?.outputEnd).toString("utf8")).toContain(
      "spall:generate]]] -->",
    );
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
