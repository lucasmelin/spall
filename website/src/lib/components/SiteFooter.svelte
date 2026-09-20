<script lang="ts">
	import { resolve } from "$app/paths";
	import Logo from "./Logo.svelte";

	const REPO = "https://github.com/lucasmelin/spall";
	const NPM = "https://www.npmjs.com/package/@lucasmelin/spall";
	const KNAP = "https://knap.md";

	const group = "flex flex-col gap-2.5 text-sm";
	const link = "text-ctp-subtext0 transition-colors hover:text-ctp-text";
</script>

<footer class="mt-28 border-t border-ctp-surface0 bg-ctp-mantle">
	<div
		class="mx-auto flex w-full max-w-5xl flex-col gap-10 px-5 py-12 sm:flex-row sm:justify-between sm:px-8"
	>
		<div class="max-w-sm">
			<div class="flex items-center gap-2 text-ctp-text">
				<Logo />
				<span class="text-[15px] font-semibold tracking-tight"
					>Spall</span
				>
			</div>
			<p class="mt-3 text-sm text-ctp-subtext0">
				Open source under the MIT license, by
				<a
					class="underline decoration-ctp-surface2 underline-offset-2 hover:text-ctp-text"
					href="https://lucasmelin.com"
					target="_blank"
					rel="noreferrer">Lucas Melin</a
				>.
			</p>
		</div>
		<div class="flex gap-16">
			<nav aria-label="Spall" class={group}>
				<span class="font-medium text-ctp-text">Spall</span>
				<a class={link} href={resolve("/")}>Introduction</a>
				<a class={link} href={resolve("/playground")}>Playground</a>
				<a
					class={link}
					href="{REPO}#readme"
					target="_blank"
					rel="noreferrer">README</a
				>
				<a class={link} href={NPM} target="_blank" rel="noreferrer"
					>npm</a
				>
				<a class={link} href={REPO} target="_blank" rel="noreferrer"
					>GitHub</a
				>
			</nav>
			<nav aria-label="Knap documentation" class={group}>
				<span class="font-medium text-ctp-text">Knap docs</span>
				<a
					class={link}
					href="{KNAP}/variables"
					target="_blank"
					rel="noreferrer">Variables</a
				>
				<a
					class={link}
					href="{KNAP}/filters"
					target="_blank"
					rel="noreferrer">Filters</a
				>
				<a
					class={link}
					href="{KNAP}/logic"
					target="_blank"
					rel="noreferrer">Logic</a
				>
				<a
					class={link}
					href="{KNAP}/playground"
					target="_blank"
					rel="noreferrer">Playground</a
				>
			</nav>
		</div>
	</div>
</footer>
