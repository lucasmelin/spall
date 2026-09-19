<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		kind,
		class: className = '',
		actions,
		children,
		footer
	}: {
		title: string;
		kind: string;
		class?: string;
		actions?: Snippet;
		children: Snippet;
		footer?: Snippet;
	} = $props();

	const id = $props.id();
</script>

<section class="flex min-h-0 min-w-0 flex-col bg-ctp-base {className}" aria-labelledby="{id}-title">
	<header
		class="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-ctp-surface0 bg-ctp-mantle px-4"
	>
		<div class="flex min-w-0 items-baseline gap-2.5">
			<h2 id="{id}-title" class="text-sm font-semibold text-ctp-text">{title}</h2>
			<span class="text-xs text-ctp-overlay1">{kind}</span>
		</div>
		<div class="flex shrink-0 items-center gap-1">{@render actions?.()}</div>
	</header>
	<div class="relative min-h-0 flex-1">{@render children()}</div>
	{@render footer?.()}
</section>
