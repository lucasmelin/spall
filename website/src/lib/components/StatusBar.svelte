<script lang="ts" module>
	export type Tone = "checking" | "ok" | "warn" | "error" | "info";
</script>

<script lang="ts">
	import Icon, { type IconName } from "./Icon.svelte";

	let {
		tone,
		text,
		onjump,
	}: { tone: Tone; text: string; onjump?: () => void } = $props();

	const icons: Record<Tone, IconName> = {
		checking: "loader",
		ok: "circle-check",
		warn: "triangle-alert",
		error: "circle-alert",
		info: "info",
	};
	const colors: Record<Tone, string> = {
		checking: "text-ctp-overlay1",
		ok: "text-ctp-green",
		warn: "text-ctp-yellow",
		error: "text-ctp-red",
		info: "text-ctp-blue",
	};
</script>

<div
	class="flex h-9 shrink-0 items-center gap-2 border-t border-ctp-surface0 bg-ctp-mantle px-4 text-xs"
	role="status"
	aria-live="polite"
>
	<Icon
		name={icons[tone]}
		class="size-3.5 shrink-0 {colors[tone]} {tone === 'checking'
			? 'animate-spin'
			: ''}"
	/>
	{#if onjump}
		<button
			type="button"
			class="min-w-0 flex-1 truncate text-left text-ctp-subtext1 hover:text-ctp-text hover:underline"
			title="{text}. Jump to it."
			onclick={onjump}
		>
			{text}
		</button>
	{:else}
		<span class="min-w-0 flex-1 truncate text-ctp-subtext1" title={text}
			>{text}</span
		>
	{/if}
</div>
