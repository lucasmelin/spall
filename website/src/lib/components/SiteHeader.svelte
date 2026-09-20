<script lang="ts">
	import { resolve } from "$app/paths";
	import Icon from "./Icon.svelte";
	import Logo from "./Logo.svelte";

	const REPO = "https://github.com/lucasmelin/spall";
	const NPM = "https://www.npmjs.com/package/@lucasmelin/spall";
</script>

<header
	class="sticky top-0 z-30 border-b border-ctp-surface0 bg-ctp-mantle/90 backdrop-blur"
>
	<div
		class="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-5 sm:px-8"
	>
		<a
			href={resolve("/")}
			class="flex items-center gap-2 rounded-md py-1 pr-1 text-ctp-text hover:text-primary"
			aria-label="Spall home"
		>
			<Logo />
			<span class="text-[15px] font-semibold tracking-tight">Spall</span>
		</a>
		<nav aria-label="Main" class="flex items-center gap-1">
			<a
				class="link hidden sm:inline-flex"
				href="{REPO}#readme"
				target="_blank"
				rel="noreferrer">README</a
			>
			<a
				class="link hidden sm:inline-flex"
				href={NPM}
				target="_blank"
				rel="noreferrer">npm</a
			>
			<a
				class="link mr-1 flex items-center gap-1.5"
				href={REPO}
				target="_blank"
				rel="noreferrer"
				aria-label="Spall on GitHub"
			>
				<Icon name="github" class="size-4" />
				<span class="hidden sm:inline">GitHub</span>
			</a>
			<a
				href={resolve("/playground")}
				class="inline-flex h-8 items-center rounded-md bg-primary px-3.5 text-sm font-semibold text-ctp-crust transition-colors hover:bg-primary-hover"
			>
				Playground
			</a>
		</nav>
	</div>
</header>
