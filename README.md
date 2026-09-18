# Spall

Spall is a small CLI that renders [Knap](https://github.com/obsidianmd/knap) templates embedded directly in Markdown files.

Spall is inspired by [Cog](https://github.com/nedbat/cog), but uses Knap's Markdown-native template language.

## Install

```bash
npm install -g @lucasmelin/spall
```

## Usage

Render a Markdown file containing a template:

```bash
npx @lucasmelin/spall render file.md --data data.json
```

All lines between `[[[spall:begin` and `spall:generate]]]` are part of the `knap` template.
The lines between `spall:generate]]]` and `[[[spall:end]]]` are the output from the `knap` template.

For example, if you run this file through `spall`:

```md
<!--[[[spall:begin
Hello from {{ name }}!
spall:generate]]]-->
<!--[[[spall:end]]]-->
```

with `npx @lucasmelin/spall render file.md --set name=Lucas`, it would generate:

```md
<!--[[[spall:begin
Hello from {{ name }}!
spall:generate]]]-->

Hello from Lucas!
<!--[[[spall:end]]]-->
```

Line comments and [Obsidian comments](https://obsidian.md/help/syntax#Comments) (`%%`) are supported as well.

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
