import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

/** Catppuccin Mocha. https://catppuccin.com/palette */
export const mocha = {
  rosewater: "#f5e0dc",
  flamingo: "#f2cdcd",
  pink: "#f5c2e7",
  mauve: "#cba6f7",
  red: "#f38ba8",
  maroon: "#eba0ac",
  peach: "#fab387",
  yellow: "#f9e2af",
  green: "#a6e3a1",
  teal: "#94e2d5",
  sky: "#89dceb",
  sapphire: "#74c7ec",
  blue: "#89b4fa",
  lavender: "#b4befe",
  text: "#cdd6f4",
  subtext1: "#bac2de",
  subtext0: "#a6adc8",
  overlay2: "#9399b2",
  overlay1: "#7f849c",
  overlay0: "#6c7086",
  surface2: "#585b70",
  surface1: "#45475a",
  surface0: "#313244",
  base: "#1e1e2e",
  mantle: "#181825",
  crust: "#11111b",
} as const;

const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/**
 * Spall's two kinds of content get two colours so users tell them apart.
 * Mauve is the template users write, and Teal is the output Spall generates.
 */
export const regionColors = { template: mocha.mauve, generated: mocha.teal } as const;

type Style = Record<string, string>;
const knapTokenRules = (tokens: Record<string, Style>) =>
  Object.fromEntries(
    Object.entries(tokens).map(([name, style]) => [
      `.cm-knap-${name}, .cm-knap-${name} span`,
      style,
    ]),
  );

export const catppuccinTheme = EditorView.theme(
  {
    "&": {
      color: mocha.text,
      backgroundColor: mocha.base,
      height: "100%",
      fontSize: "13px",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily: "var(--font-mono)",
      // Ligatures would turn `<!--` and `-->` into arrows, which hides what's really in the file.
      fontVariantLigatures: "none",
      fontFeatureSettings: '"liga" 0, "calt" 0',
      lineHeight: "1.7",
      overflow: "auto",
    },
    ".cm-content": { caretColor: mocha.rosewater, padding: "10px 0 24px" },
    ".cm-line": { padding: "0 16px 0 14px" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: mocha.rosewater, borderLeftWidth: "2px" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      { backgroundColor: alpha(mocha.overlay2, 0.28) },
    ".cm-gutters": {
      backgroundColor: mocha.base,
      color: mocha.surface2,
      border: "none",
      paddingLeft: "6px",
    },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 4px", minWidth: "2.2ch" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: mocha.overlay1 },
    ".cm-matchingBracket, .cm-nonmatchingBracket": {
      backgroundColor: alpha(mocha.overlay2, 0.25),
      outline: "none",
    },
    ".cm-placeholder": { color: mocha.overlay0 },

    // Spall regions
    ".cm-spall-template": {
      backgroundColor: alpha(regionColors.template, 0.075),
      boxShadow: `inset 2px 0 0 ${alpha(regionColors.template, 0.5)}`,
    },
    ".cm-spall-output": {
      backgroundColor: alpha(regionColors.generated, 0.065),
      boxShadow: `inset 2px 0 0 ${alpha(regionColors.generated, 0.5)}`,
    },
    ".cm-spall-begin, .cm-spall-generate": {
      backgroundColor: alpha(regionColors.template, 0.14),
      boxShadow: `inset 2px 0 0 ${regionColors.template}`,
      color: mocha.overlay1,
    },
    ".cm-spall-end": {
      backgroundColor: alpha(regionColors.generated, 0.12),
      boxShadow: `inset 2px 0 0 ${regionColors.generated}`,
      color: mocha.overlay1,
    },
    ".cm-spall-begin .cm-spall-marker, .cm-spall-begin .cm-spall-marker span, .cm-spall-generate .cm-spall-marker, .cm-spall-generate .cm-spall-marker span":
      { color: regionColors.template, fontStyle: "normal", fontWeight: "600" },
    ".cm-spall-end .cm-spall-marker, .cm-spall-end .cm-spall-marker span": {
      color: regionColors.generated,
      fontStyle: "normal",
      fontWeight: "600",
    },
    ".cm-spall-prefix": { color: mocha.overlay0 },

    // Knap tokens inside templates. The Markdown highlighter can wrap these tokens (as a comment,
    // for templates hidden in `<!-- -->`), so the rules also cover spans nested inside them.
    ...knapTokenRules({
      text: { color: mocha.text, fontStyle: "normal" },
      punctuation: { color: mocha.overlay2, fontStyle: "normal" },
      keyword: { color: mocha.mauve, fontStyle: "normal", fontWeight: "500" },
      variable: { color: mocha.blue, fontStyle: "normal" },
      "variable-2": { color: mocha.teal, fontStyle: "normal" },
      operator: { color: mocha.sky, fontStyle: "normal" },
      string: { color: mocha.green, fontStyle: "normal" },
      number: { color: mocha.peach, fontStyle: "normal" },
      atom: { color: mocha.peach, fontStyle: "normal" },
      comment: { color: mocha.overlay1, fontStyle: "italic" },
    }),

    // Diagnostics
    ".cm-tooltip": {
      backgroundColor: mocha.mantle,
      color: mocha.text,
      border: `1px solid ${mocha.surface1}`,
      borderRadius: "8px",
      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
      overflow: "hidden",
    },
    ".cm-tooltip-lint": { fontFamily: "var(--font-sans)" },
    ".cm-diagnostic": { padding: "6px 10px", fontSize: "12.5px", lineHeight: "1.5" },
    ".cm-diagnostic-error": { borderLeft: `3px solid ${mocha.red}` },
    ".cm-diagnostic-warning": { borderLeft: `3px solid ${mocha.yellow}` },
    ".cm-lint-marker": { width: "0.9em", height: "0.9em" },
    ".cm-gutter-lint": { width: "1.1em" },
  },
  { dark: true },
);

export const catppuccinHighlight = syntaxHighlighting(
  HighlightStyle.define([
    // Markdown
    { tag: t.heading, color: mocha.lavender, fontWeight: "600" },
    { tag: t.strong, color: mocha.peach, fontWeight: "700" },
    { tag: t.emphasis, color: mocha.maroon, fontStyle: "italic" },
    { tag: t.strikethrough, textDecoration: "line-through", color: mocha.overlay1 },
    { tag: t.link, color: mocha.blue },
    { tag: t.url, color: mocha.sky, textDecoration: "underline" },
    { tag: t.monospace, color: mocha.green },
    { tag: t.quote, color: mocha.overlay2, fontStyle: "italic" },
    { tag: t.processingInstruction, color: mocha.overlay1 },
    { tag: t.contentSeparator, color: mocha.overlay1 },
    { tag: t.comment, color: mocha.overlay1, fontStyle: "italic" },
    { tag: t.meta, color: mocha.overlay1 },
    // JSON
    { tag: t.propertyName, color: mocha.blue },
    { tag: t.string, color: mocha.green },
    { tag: t.number, color: mocha.peach },
    { tag: [t.bool, t.null, t.atom], color: mocha.mauve },
    { tag: [t.punctuation, t.separator, t.brace, t.squareBracket], color: mocha.overlay2 },
    { tag: t.invalid, color: mocha.red },
  ]),
);
