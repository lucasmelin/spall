import { describe, expect, it, vi } from "vitest";
import { analyze, parseOverrides } from "../src/lib/analyze";
import { renderDocument } from "../src/lib/spall";

// Real by default; individual tests make it throw.
vi.mock("../src/lib/spall", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/spall")>();
  return { ...actual, renderDocument: vi.fn(actual.renderDocument) };
});

const block = (template: string, generated = "") =>
  `<!--[[[spall:begin\n${template}\nspall:generate]]]-->\n${generated}<!--[[[spall:end]]]-->\n`;

describe("analyze", () => {
  it("returns the edits that bring the generated regions up to date", async () => {
    const result = await analyze(block("{{ title }}", "old\n"), { title: "The Matrix" });
    expect(result.blocks).toBe(1);
    expect(result.edits).toHaveLength(1);
    expect(result.problems).toEqual([]);
    expect(result.fatal).toBeNull();
    expect(result.blockedByData).toBe(false);
  });

  it("has no edits once the document is up to date", async () => {
    const result = await analyze(block("{{ title }}", "The Matrix\n"), { title: "The Matrix" });
    expect(result.edits).toEqual([]);
  });

  it("reports problems in document order, warnings included", async () => {
    const doc = block("{{ n | round }}") + block("{{ x | nofilter }}");
    const result = await analyze(doc, { n: "abc", x: 1 });
    expect(result.problems.map((p) => p.severity)).toEqual(["warning", "error"]);
    expect(result.edits).toEqual([]);
  });

  describe("while the data is invalid (variables is null)", () => {
    it("still finds syntax errors", async () => {
      const result = await analyze(block("{{ x | nofilter }}"), null);
      expect(result.blockedByData).toBe(true);
      expect(result.problems).toHaveLength(1);
      expect(result.problems[0].severity).toBe("error");
    });

    it("renders nothing and has no warnings", async () => {
      const result = await analyze(block("{{ n | round }}", "old\n"), null);
      expect(result.edits).toEqual([]);
      expect(result.problems).toEqual([]);
    });
  });

  it("reports a thrown failure as fatal instead of rejecting", async () => {
    vi.mocked(renderDocument).mockRejectedValueOnce(new Error("boom"));
    const result = await analyze(block("{{ title }}"), { title: "x" });
    expect(result.fatal).toBe("boom");
    expect(result.edits).toEqual([]);
    expect(result.problems).toEqual([]);
  });
});

describe("parseOverrides", () => {
  it("reads key=value lines, ignoring blanks", () => {
    expect(parseOverrides("name=Lucas\n\n  title = x  ")).toMatchObject({ ok: true, count: 2 });
  });

  it("explains a line that is not key=value", () => {
    expect(parseOverrides("oops")).toMatchObject({ ok: false });
  });
});
