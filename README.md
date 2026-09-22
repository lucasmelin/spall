# Spall

Spall is a small CLI that renders [Knap](https://github.com/obsidianmd/knap) templates embedded directly in Markdown files.

Spall is inspired by [Cog](https://github.com/nedbat/cog), but uses Knap's Markdown-native template language.

## Install

Install Spall globally with `npm`:

```bash
npm install -g @lucasmelin/spall
```

Or run it without installing globally:

```bash
npx @lucasmelin/spall <command>
```

## Usage

### Render a file

Render a Markdown file containing a template:

```bash
spall render file.md --set name=Lucas
```

Spall updates the file in-place. If rendering produces the exact same content as what's already in on disk the file is left unchanged.

### Check a file

```bash
spall check file.md --set name=Lucas
```

`check` exits successfully if rendering would produce the content already on disk.
It exits with a non-zero exit code if the file is out-of-date or if rendering produces an error.
This command is especially useful for CI and other automated checks.

### Preview changes

Use `--dry-run` with `render` to render the file without modifying it:

```bash
spall render file.md --set name=Lucas --dry-run
```

The rendered document is written to standard output.

### Managed blocks

Spall manages the portion of a Markdown document between its begin and end markers:

```md
[[[spall:begin

... Knap template ...

spall:generate]]]

... generated output ...

[[[spall:end]]]
```

The template is preserved between runs, while the generated output is replaced with the result of rendering the template.

Everything outside managed blocks, either before or after, is preserved verbatim.

For example:

```md
Before
<!--[[[spall:begin
Hello from {{ name }}!
spall:generate]]]-->
<!--[[[spall:end]]]-->
After
```

With:

```bash
spall render file.md --set name=Lucas
```

the block becomes:

```md
Before
<!--[[[spall:begin
Hello from {{ name }}!
spall:generate]]]-->
Hello from Lucas!
<!--[[[spall:end]]]-->
After
```

Line comments and [Obsidian comments](https://obsidian.md/help/syntax#Comments) (`%%`) are supported as well.

### Template variables

Template variables can be loaded from a JSON file:

```json
{
  "name": "Lucas",
}
```

and used in the `render` and `check` commands, for example:

```bash
spall render file.md --data data.json
```

Individual top-level variables can also be supplied with `--set`:

```bash
spall render file.md --set name=Lucas
```

`--set` may be specified multiple times. When a variable is supplied by both `--data` and `--set`, the `--set` value takes precedence.

## Development

### Prerequisites

This project uses [Nix flakes](https://nixos.wiki/wiki/Flakes) to manage the development environment.

### Setting up the dev environment

Enter the development shell, which provides Node.js, pnpm, and TypeScript tooling:

```bash
nix develop

# Alternatively, if you have direnv installed:
direnv allow
```

Install dependencies:

```bash
pnpm install
```

### Running spall during development

Run the CLI directly against TypeScript source without a build step, using `tsx`:

```bash
pnpx tsx src/cli.ts <args>
```

Or compile first and run the emitted JavaScript:

```bash
pnpm build
node dist/cli.js <args>
```

### Installing and running via Nix

You don't need `nix develop` just to run `spall`, the flake can build and run it directly.

Run without installing anything persistently:

```bash
nix run . -- <args>
```

Build the package and invoke the binary directly:

```bash
nix build .
./result/bin/spall <args>
```

Install Spall into your Nix profile so it's available on your `PATH`:

```bash
nix profile add .
spall <args>
```
