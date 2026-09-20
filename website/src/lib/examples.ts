export type PlaygroundState = {
  /** JSON template variables (`--data`). */
  data: string;
  /** The Markdown document containing Spall blocks. */
  doc: string;
  /** `key=value` overrides, one per line (`--set`). */
  set: string;
};

export type Example = {
  id: string;
  name: string;
  description: string;
  state: PlaygroundState;
};

const json = (value: unknown) => JSON.stringify(value, null, 2);

const movie = {
  title: "Jurassic Park",
  year: 1993,
  directors: ["Steven Spielberg"],
  writers: ["Michael Crichton", "David Koepp"],
  genres: ["Adventure", "Sci-Fi"],
  plot: "An industrialist invites some experts to visit his theme park of cloned dinosaurs. After a power failure, the creatures run loose, putting everyone's lives, including his grandchildren's, in danger.",
  cast: [
    { Actor: "Sam Neill", Role: "Grant" },
    { Actor: "Laura Dern", Role: "Ellie" },
    { Actor: "Jeff Goldblum", Role: "Malcolm" },
    { Actor: "Richard Attenborough", Role: "Hammond" },
    { Actor: "Wayne Knight", Role: "Nedry" },
  ],
};

export const examples: Example[] = [
  {
    id: "movie-note",
    name: "Movie note",
    description: "Generate a section of a note and leave your own writing alone",
    state: {
      data: json(movie),
      set: "",
      doc: `# Movie night

Anything outside a spall block stays exactly as you wrote it.

<!--[[[spall:begin
{{ title | h2 }}

{{ year }}, directed by {{ directors | join:" and " }}

**Plot:**
{{ plot | blockquote }}

{% if cast %}
{{ cast | sort:"Actor" | table }}
{% endif %}
spall:generate]]]-->
<!--[[[spall:end]]]-->

## Things to discuss

- How many sequels should be made?
`,
    },
  },
  {
    id: "hello",
    name: "Hello, with --set",
    description: "The smallest block, with a value overridden like `--set name=Lucas`",
    state: {
      data: json({ name: "World", greeting: "Hello" }),
      set: "name=Lucas",
      doc: `<!--[[[spall:begin
{{ greeting }} from {{ name }}!
spall:generate]]]-->
<!--[[[spall:end]]]-->
`,
    },
  },
  {
    id: "line-comments",
    name: "Line comments in code",
    description: "Keep templates inside `//` comments in a source file",
    state: {
      data: json({ name: "spall", version: "0.0.2", flags: ["dry-run", "data", "set"] }),
      set: "",
      doc: `// The constants below are generated. Edit the template, not the output.

// [[[spall:begin
// export const PACKAGE = "{{ name }}@{{ version }}";
// {% for flag in flags %}
// export const FLAG_{{ flag | upper | replace:"-":"_" }} = "--{{ flag }}";
// {% endfor %}
// spall:generate]]]
// [[[spall:end]]]

export function describe() {
  return PACKAGE;
}
`,
    },
  },
  {
    id: "obsidian",
    name: "Obsidian comments",
    description: "Hide the template in a `%%` comment so it never shows in reading view",
    state: {
      data: json({
        books: [
          { Title: "Anathem", Author: "Neal Stephenson", Status: "Reading" },
          { Title: "Diaspora", Author: "Greg Egan", Status: "Finished" },
          { Title: "Remarkably Bright Creatures", Author: "Shelby Van Pelt", Status: "Finished" },
        ],
      }),
      set: "",
      doc: `# Reading log

%%[[[spall:begin
{{ books | length }} books so far.

{{ books | table }}
spall:generate]]]%%
%%[[[spall:end]]]%%

Add notes below the table. They are never touched.
`,
    },
  },
];

export const defaultExample = examples[0];
