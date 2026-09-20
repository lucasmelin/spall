<script lang="ts">
	import Icon from "./Icon.svelte";

	let { command, prompt = true }: { command: string; prompt?: boolean } =
		$props();

	// Colour the parts of a command so its shape is easy to scan:
	// the program is the primary colour, the subcommand stands out, flags are peach, and arguments are quieter.
	const SUBCOMMANDS = new Set([
		"render",
		"check",
		"install",
		"add",
		"global",
	]);

	type Part = { text: string; cls: string };

	function colour(text: string): Part[] {
		let first = true;
		return text
			.split(/(\s+)/)
			.filter((piece) => piece !== "")
			.map((piece) => {
				if (/^\s+$/.test(piece)) return { text: piece, cls: "" };
				if (first) {
					first = false;
					return { text: piece, cls: "font-medium text-primary" };
				}
				// `@scope/pkg` after npx is the program being run.
				if (piece.startsWith("@"))
					return { text: piece, cls: "text-primary" };
				if (piece.startsWith("-"))
					return { text: piece, cls: "text-ctp-peach" };
				if (SUBCOMMANDS.has(piece))
					return { text: piece, cls: "font-semibold text-ctp-text" };
				return { text: piece, cls: "text-ctp-subtext1" };
			});
	}

	const parts = $derived(colour(command));

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy() {
		try {
			await navigator.clipboard.writeText(command);
		} catch {
			const area = document.createElement("textarea");
			area.value = command;
			area.style.cssText = "position:fixed;opacity:0";
			document.body.append(area);
			area.select();
			document.execCommand("copy");
			area.remove();
		}
		copied = true;
		clearTimeout(timer);
		timer = setTimeout(() => (copied = false), 1600);
	}
</script>

<div
	class="flex items-center gap-2 rounded-xl border border-ctp-surface0 bg-ctp-mantle py-1 pr-1.5 pl-4"
>
	<pre
		class="min-w-0 flex-1 overflow-x-auto py-2.5 font-mono text-[13px] leading-none whitespace-pre"><code
			>{#if prompt}<span
					class="mr-2.5 text-ctp-overlay0 select-none"
					aria-hidden="true">$</span
				>{/if}{#each parts as part}<span class={part.cls}
					>{part.text}</span
				>{/each}</code
		></pre>
	<button
		type="button"
		class="grid size-8 shrink-0 place-items-center rounded-md text-ctp-overlay1 transition-colors hover:bg-ctp-surface0 hover:text-ctp-text"
		onclick={copy}
		aria-label={copied ? "Copied" : `Copy: ${command}`}
	>
		<Icon
			name={copied ? "check" : "copy"}
			class="size-4 {copied ? 'text-ctp-green' : ''}"
		/>
	</button>
	<span class="sr-only" role="status"
		>{copied ? "Copied to clipboard" : ""}</span
	>
</div>
