import { describe, expect, it } from "vitest";
import { findBlocks, parseSetValues, renderBlocks } from "../src/spall.js";

describe("findBlocks", () => {
  it("finds a single managed block", () => {
    const source = Buffer.from(
      `before
<!--[[[spall:begin
Hello {{ name }}
spall:generate]]]-->
<!--[[[spall:end]]]-->
after
`,
    );

    const blocks = findBlocks(source);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.template).toEqual(`
Hello {{ name }}
`);
  });

  it("finds multiple managed blocks", () => {
    const source = Buffer.from(
      `a
<!--[[[spall:begin
{{ one }}
spall:generate]]]-->
b
<!--[[[spall:end]]]-->
<!--[[[spall:begin
{{ two }}
spall:generate]]]-->
<!--[[[spall:end]]]-->
c`,
    );

    expect(findBlocks(source)).toHaveLength(2);
  });

  it("rejects an unterminated block", () => {
    expect(() =>
      findBlocks(
        Buffer.from(`
<!--[[[spall:begin
{{ value }}`),
      ),
    ).toThrow(/no matching/);
  });
});

describe("renderBlocks", () => {
  it("renders spall and preserves content after END exactly", async () => {
    const suffix = "AFTER\n{{ this is intentionally not rendered }}\n☃\r\n";
    const source = Buffer.from(
      `before
<!--[[[spall:begin
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
<!--[[[spall:begin
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
    const source = Buffer.from(
      "<!--[[[spall:begin\n{{ a }}\nspall:generate]]]--><!--[[[spall:end]]]-->\n" +
        "middle\n" +
        "<!--[[[spall:begin\n{{ b }}\nspall:generate]]]--><!--[[[spall:end]]]-->\n",
    );

    const rendered = await renderBlocks(source, {
      variables: { a: "one", b: "two" },
    });

    expect(rendered.toString()).toEqual(
      "<!--[[[spall:begin\n{{ a }}\nspall:generate]]]-->\none\n<!--[[[spall:end]]]-->\n" +
        "middle\n" +
        "<!--[[[spall:begin\n{{ b }}\nspall:generate]]]-->\ntwo\n<!--[[[spall:end]]]-->\n",
    );
  });

  it("does not render spall-looking content after END", async () => {
    const source = Buffer.from(
      "<!--[[[spall:begin\n{{ value }}\nspall:generate]]]--><!--[[[spall:end]]]-->\n" +
        "{{ value }}\n",
    );

    const rendered = await renderBlocks(source, {
      variables: { value: "rendered" },
    });

    expect(rendered.toString()).toContain("<!--[[[spall:end]]]-->\n{{ value }}\n");
  });

  it("preserves an unchanged file byte-for-byte", async () => {
    const source = Buffer.from(
      "\ufeffprefix\r\n<!--[[[spall:begin\nstatic\r\nspall:generate]]]-->\nstatic\r\n<!--[[[spall:end]]]-->\r\nsuffix\n",
    );

    const rendered = await renderBlocks(source, { variables: {} });

    expect(rendered.toString()).toEqual(source.toString());
  });

  it("renders the same file content if no blocks are found", async () => {
    const source = Buffer.from("plain markdown\nfoo\nbar\r\nbaz\n");
    const rendered = await renderBlocks(source, { variables: {} });

    expect(rendered).toEqual(source);
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
