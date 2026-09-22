<script lang="ts">
	import { resolve } from "$app/paths";
	import CodeBlock from "$lib/components/CodeBlock.svelte";
	import Command from "$lib/components/Command.svelte";
	import Icon from "$lib/components/Icon.svelte";
	import InstallTabs from "$lib/components/InstallTabs.svelte";
	import SiteFooter from "$lib/components/SiteFooter.svelte";
	import SiteHeader from "$lib/components/SiteHeader.svelte";

	let { data } = $props();

	const REPO = "https://github.com/lucasmelin/spall";
	const KNAP = "https://knap.md";

	const files = {
		html: "notes.md",
		line: "app.ts",
		obsidian: "vault-note.md",
	} as Record<string, string>;

	const section = "mx-auto w-full max-w-5xl px-5 sm:px-8";
	const h2 = "text-2xl font-semibold tracking-tight text-ctp-text";
	const lead = "mt-3 max-w-2xl text-ctp-subtext1";
	const inline =
		"rounded bg-ctp-surface0 px-1.5 py-0.5 font-mono text-[0.85em] text-ctp-text";
	const textLink =
		"text-ctp-text underline decoration-ctp-surface2 underline-offset-[3px] transition-colors hover:decoration-primary";
</script>

<svelte:head>
	<title>Spall · Templates inside Markdown</title>
	<meta
		name="description"
		content="Spall renders Knap templates embedded in your Markdown files, and leaves everything else exactly as you wrote it."
	/>
	<meta property="og:title" content="Spall · Templates inside Markdown" />
	<meta
		property="og:description"
		content="Render Knap templates embedded in Markdown files without disturbing the surrounding content."
	/>
	<meta property="og:type" content="website" />
</svelte:head>

<SiteHeader />

<main>
	<section class="{section} pt-16 sm:pt-24" aria-labelledby="intro-title">
		<h1
			id="intro-title"
			class="max-w-3xl text-4xl leading-[1.1] font-semibold tracking-tight text-ctp-text sm:text-6xl"
		>
			Render templates inside your <span class="font-mono text-primary"
				>.md</span
			>
		</h1>
		<p class="mt-6 max-w-2xl text-lg leading-relaxed text-ctp-subtext1">
			Spall renders <a
				class={textLink}
				href={KNAP}
				target="_blank"
				rel="noreferrer">Knap</a
			> templates embedded in your Markdown files, and leaves everything else
			exactly as you wrote it.
		</p>
		<div class="mt-8 flex flex-wrap gap-3">
			<a class="btn-primary" href={resolve("/playground")}
				>Try the playground</a
			>
			<a class="btn-outline" href="#install">Install</a>
		</div>
	</section>

	<section class="{section} mt-20 sm:mt-28" aria-labelledby="how-title">
		<h2 id="how-title" class={h2}>How it works</h2>
		<p class={lead}>
			Write a template between two markers. Spall renders it with your
			data and writes the result underneath, so one file is both the
			template and the finished document.
		</p>

		<p
			class="mt-8 mb-3 flex items-center justify-end gap-4 text-sm text-ctp-subtext0"
			aria-label="Colour key"
		>
			<span class="flex items-center gap-1.5"
				><span class="size-2 rounded-sm bg-primary"
				></span>Template</span
			>
			<span class="flex items-center gap-1.5"
				><span class="size-2 rounded-sm bg-secondary"
				></span>Generated</span
			>
		</p>

		<div
			class="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.05fr)_minmax(0,1.1fr)]"
		>
			<CodeBlock label="data.json" mode="json" code={data.heroData} />
			<CodeBlock label="notes.md" code={data.heroBefore} />
			<CodeBlock
				label="notes.md after spall render"
				code={data.heroAfter ?? ""}
			/>
		</div>

		<div class="mt-4">
			<p class="mb-3 text-sm text-ctp-subtext0">
				<span class="font-medium text-ctp-text">spall render</span> writes
				the generated output back to the file.
			</p>
			<Command command="spall render notes.md --data data.json" />
		</div>

		<div class="mt-12 grid gap-8 sm:grid-cols-3">
			<div>
				<h3 class="font-semibold text-ctp-text">
					The template stays in the file
				</h3>
				<p class="mt-2 text-sm leading-relaxed text-ctp-subtext0">
					It's kept in a comment, so it's hidden when the Markdown is
					rendered. Run Spall to place the generated content in the
					same note.
				</p>
			</div>
			<div>
				<h3 class="font-semibold text-ctp-text">
					Everything else is untouched
				</h3>
				<p class="mt-2 text-sm leading-relaxed text-ctp-subtext0">
					Text outside a block is preserved verbatim, so hand-written
					notes and generated sections can share the same file.
				</p>
			</div>
			<div>
				<h3 class="font-semibold text-ctp-text">
					Safe to run again and again
				</h3>
				<p class="mt-2 text-sm leading-relaxed text-ctp-subtext0">
					Only the generated region is replaced. Run it twice with the
					same data and the second run changes nothing.
				</p>
			</div>
		</div>
	</section>

	<section class="{section} mt-24" aria-labelledby="terminal-title">
		<h2 id="terminal-title" class={h2}>Spall in your terminal</h2>
		<p class={lead}>
			Render a file in place, or check that it's up-to-date without
			writing anything. Run them with
			<code class={inline}>npx</code> or install Spall below.
		</p>
		<div class="mt-8 grid max-w-2xl gap-6">
			<div class="min-w-0">
				<p class="mb-3 text-sm text-ctp-subtext0">
					<span class="font-medium text-ctp-text">render</span> rewrites
					the generated output in the file.
				</p>
				<Command
					command="npx @lucasmelin/spall render notes.md --data data.json"
				/>
			</div>
			<div class="min-w-0">
				<p class="mb-3 text-sm text-ctp-subtext0">
					<span class="font-medium text-ctp-text">check</span> exits with
					1 if the file is out of date, which is good for things like CI.
				</p>
				<Command
					command="npx @lucasmelin/spall check notes.md --data data.json"
				/>
			</div>
		</div>
		<p class="mt-6 max-w-2xl text-sm leading-relaxed text-ctp-subtext0">
			Add <code class={inline}>--set key=value</code> to override a
			variable, or
			<code class={inline}>--dry-run</code> to print the result without modifying
			the file.
		</p>
	</section>

	<section
		id="install"
		class="{section} mt-24 scroll-mt-20"
		aria-labelledby="install-title"
	>
		<h2 id="install-title" class={h2}>Install</h2>
		<p class={lead}>
			Add the <code class={inline}>spall</code> command to your machine.
		</p>
		<div class="mt-8 max-w-xl"><InstallTabs /></div>
	</section>

	<section class="{section} mt-24" aria-labelledby="comments-title">
		<h2 id="comments-title" class={h2}>Comment out your templates</h2>
		<p class={lead}>
			Spall works wherever you can write a comment: plain Markdown, an
			Obsidian note, or even source code. These examples ran with
			<code class={inline}>--set name=Lucas</code>.
		</p>
		<div class="mt-8 grid gap-6 lg:grid-cols-3">
			{#each data.styles as style (style.id)}
				<div class="flex min-w-0 flex-col">
					<h3 class="font-semibold text-ctp-text">{style.name}</h3>
					<p
						class="mt-1.5 mb-4 flex-1 text-sm leading-relaxed text-ctp-subtext0"
					>
						{style.note}
					</p>
					<CodeBlock label={files[style.id]} code={style.rendered ?? ""} />
				</div>
			{/each}
		</div>
	</section>

	<section class="{section} mt-24" aria-labelledby="explore-title">
		<h2 id="explore-title" class={h2}>Explore</h2>
		<div class="mt-8 grid gap-4 md:grid-cols-3">
			{#each [{ title: "Playground", text: "Edit data and a document, and watch Spall rewrite the output as you type.", href: resolve("/playground"), external: false }, { title: "Knap templates", text: "Variables, filters and logic: the language your templates are written in.", href: KNAP, external: true }, { title: "Project README", text: "Install, usage and the full command reference.", href: `${REPO}#readme`, external: true }] as card (card.title)}
				<a
					href={card.href}
					target={card.external ? "_blank" : undefined}
					rel={card.external ? "noreferrer" : undefined}
					class="group flex flex-col rounded-xl border border-ctp-surface0 bg-ctp-mantle p-5 transition-colors hover:border-primary/60 hover:bg-ctp-surface0/40"
				>
					<span
						class="flex items-center justify-between font-semibold text-ctp-text"
					>
						{card.title}
						{#if card.external}<Icon
								name="external"
								class="size-3.5 text-ctp-overlay1 group-hover:text-primary"
							/>{/if}
					</span>
					<span class="mt-2 text-sm leading-relaxed text-ctp-subtext0"
						>{card.text}</span
					>
				</a>
			{/each}
		</div>
	</section>

	<section class="{section} mt-24" aria-labelledby="built-title">
		<h2 id="built-title" class={h2}>Built on Knap</h2>
		<p class="mt-3 max-w-2xl leading-relaxed text-ctp-subtext1">
			Spall is open source under the MIT license. It's inspired by
			<a
				class={textLink}
				href="https://github.com/nedbat/cog"
				target="_blank"
				rel="noreferrer">Cog</a
			>, and uses
			<a class={textLink} href={KNAP} target="_blank" rel="noreferrer"
				>Knap</a
			>, the template language that started in
			<a
				class={textLink}
				href="https://obsidian.md"
				target="_blank"
				rel="noreferrer">Obsidian</a
			>, so your templates are as Markdown-native as the files they live
			in.
		</p>
	</section>
</main>

<SiteFooter />
