import { renderDocument } from "./spall";

/** Everything on the landing page that shows Spall's input or output lives here. */

export const heroData = `{
  "title": "Jurassic Park",
  "year": 1993,
  "cast": [
    "Sam Neill",
    "Laura Dern"
  ]
}
`;

export const heroBefore = `# Movie night

Your own notes stay put.

<!--[[[spall:begin
## {{ title }} ({{ year }})

{{ cast | list }}
spall:generate]]]-->
<!--[[[spall:end]]]-->

Including content after the template.
`;

export type CommentStyle = { id: string; name: string; note: string; source: string };

export const commentStyles: CommentStyle[] = [
  {
    id: "html",
    name: "HTML comments",
    note: "The default for Markdown. The template is hidden when the file is rendered.",
    source: `<!--[[[spall:begin
Hello from {{ name }}!
spall:generate]]]-->
<!--[[[spall:end]]]-->
`,
  },
  {
    id: "obsidian",
    name: "Obsidian comments",
    note: "Use %% to keep templates out of Obsidian's reading view.",
    source: `%%[[[spall:begin
Hello from {{ name }}!
spall:generate]]]%%
%%[[[spall:end]]]%%
`,
  },
  {
    id: "line",
    name: "Line comments",
    note: "For source files. A shared prefix like // is stripped from the template.",
    source: `// [[[spall:begin
// greet("{{ name }}");
// spall:generate]]]
// [[[spall:end]]]
`,
  },
];

async function run(source: string, variables: Record<string, unknown>) {
  const result = await renderDocument(source, { variables });
  return result.output;
}

/** Runs the real spall over every sample. Called while the site is being built. */
export async function renderSamples() {
  const data = JSON.parse(heroData) as Record<string, unknown>;
  return {
    heroData,
    heroBefore,
    heroAfter: await run(heroBefore, data),
    styles: await Promise.all(
      commentStyles.map(async (style) => ({
        ...style,
        rendered: await run(style.source, { name: "Lucas" }),
      })),
    ),
  };
}
