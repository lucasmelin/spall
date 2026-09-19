<script lang="ts" module>
	export type PaletteItem = {
		id: string;
		group: string;
		title: string;
		/** Secondary text, shown in the code font. */
		hint?: string;
		run?: () => void;
		href?: string;
	};
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import Icon from './Icon.svelte';

	let {
		open = $bindable(false),
		items
	}: { open?: boolean; items: PaletteItem[] } = $props();

	let query = $state('');
	let active = $state(0);
	let input: HTMLInputElement | undefined = $state();
	let list: HTMLDivElement | undefined = $state();
	let opener: HTMLElement | null = null;

	const groupOrder = ['Actions', 'Examples', 'Filters', 'Docs'];

	const groups = $derived.by(() => {
		const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
		const matched = items
			.map((item) => {
				const title = item.title.toLowerCase();
				const haystack = `${title} ${item.hint ?? ''} ${item.group}`.toLowerCase();
				if (!words.every((w) => haystack.includes(w))) return null;
				const rank = words.length === 0 || title.startsWith(words[0]) ? 0 : title.includes(words[0]) ? 1 : 2;
				return { item, rank };
			})
			.filter((entry) => entry !== null)
			.sort((a, b) => a.rank - b.rank);

		let index = 0;
		return groupOrder
			.map((name) => ({
				name,
				entries: matched
					.filter((m) => m.item.group === name)
					.map((m) => ({ item: m.item, index: index++ }))
			}))
			.filter((g) => g.entries.length > 0);
	});

	const flat = $derived(groups.flatMap((g) => g.entries));

	$effect(() => {
		if (open) {
			opener = document.activeElement as HTMLElement | null;
			query = '';
			active = 0;
			tick().then(() => input?.focus());
		}
	});

	$effect(() => {
		// A new query starts at the best match.
		query;
		active = 0;
	});

	$effect(() => {
		active;
		list?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
	});

	function close() {
		open = false;
		opener?.focus();
	}

	function choose(item: PaletteItem) {
		open = false;
		if (item.href) window.open(item.href, '_blank', 'noopener,noreferrer');
		else item.run?.();
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') close();
		else if (event.key === 'ArrowDown') active = flat.length ? (active + 1) % flat.length : 0;
		else if (event.key === 'ArrowUp') active = flat.length ? (active - 1 + flat.length) % flat.length : 0;
		else if (event.key === 'Home') active = 0;
		else if (event.key === 'End') active = Math.max(0, flat.length - 1);
		else if (event.key === 'Enter') {
			const entry = flat[active];
			if (entry) choose(entry.item);
		} else if (event.key !== 'Tab') return;
		event.preventDefault();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-start justify-center bg-ctp-crust/70 px-4 pt-[12vh] backdrop-blur-[2px]"
		onpointerdown={(e) => e.target === e.currentTarget && close()}
	>
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Search the playground"
			tabindex="-1"
			class="w-full max-w-xl overflow-hidden rounded-xl border border-ctp-surface1 bg-ctp-mantle shadow-2xl shadow-black/50"
			{onkeydown}
		>
			<div class="flex items-center gap-3 border-b border-ctp-surface0 px-4">
				<Icon name="search" class="size-4 shrink-0 text-ctp-overlay1" />
				<input
					bind:this={input}
					bind:value={query}
					type="text"
					role="combobox"
					aria-expanded="true"
					aria-controls="palette-list"
					aria-activedescendant={flat.length ? `palette-option-${active}` : undefined}
					aria-label="Search filters, examples and actions"
					placeholder="Search filters, examples and actions"
					autocomplete="off"
					spellcheck="false"
					class="h-12 min-w-0 flex-1 bg-transparent text-sm text-ctp-text outline-none placeholder:text-ctp-overlay0"
				/>
				<kbd class="rounded border border-ctp-surface1 px-1.5 py-0.5 text-[11px] text-ctp-overlay1">Esc</kbd>
			</div>

			<div id="palette-list" role="listbox" bind:this={list} class="max-h-[52vh] overflow-y-auto p-2">
				{#each groups as group (group.name)}
					<div role="group" aria-label={group.name}>
						<div class="px-3 pt-2 pb-1 text-xs font-medium text-ctp-overlay1" aria-hidden="true">
							{group.name}
						</div>
						{#each group.entries as { item, index } (item.id)}
							<div
								role="option"
								tabindex="-1"
								id="palette-option-{index}"
								aria-selected={index === active}
								data-active={index === active}
								class="flex cursor-pointer items-center justify-between gap-4 rounded-md px-3 py-2 text-sm {index ===
								active
									? 'bg-ctp-surface0 text-ctp-text'
									: 'text-ctp-subtext1'}"
								onpointermove={() => (active = index)}
								onclick={() => choose(item)}
								onkeydown={() => {}}
							>
								<span class="flex shrink-0 items-center gap-2 whitespace-nowrap">
									{item.title}
									{#if item.href}<Icon name="external" class="size-3 text-ctp-overlay1" />{/if}
								</span>
								{#if item.hint}
									<span class="truncate text-xs text-ctp-overlay1 {group.name === 'Filters' ? 'font-mono' : ''}">{item.hint}</span>
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<p class="px-3 py-8 text-center text-sm text-ctp-overlay1">Nothing matches “{query}”.</p>
				{/each}
			</div>
		</div>
	</div>
{/if}
