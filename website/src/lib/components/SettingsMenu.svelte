<script lang="ts">
	import { tick } from 'svelte';
	import Icon from './Icon.svelte';

	let {
		wrap = $bindable(true),
		live = $bindable(true),
		onshare,
		onreset,
		onclear
	}: {
		wrap?: boolean;
		live?: boolean;
		onshare: () => void;
		onreset: () => void;
		onclear: () => void;
	} = $props();

	let open = $state(false);
	let root: HTMLDivElement | undefined = $state();
	let trigger: HTMLButtonElement | undefined = $state();

	const items = () => Array.from(root?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);

	async function toggle() {
		open = !open;
		if (open) {
			await tick();
			items()[0]?.focus();
		}
	}

	function close(restoreFocus = false) {
		open = false;
		if (restoreFocus) trigger?.focus();
	}

	function run(action: () => void) {
		close(true);
		action();
	}

	function onkeydown(event: KeyboardEvent) {
		const list = items();
		const index = list.indexOf(document.activeElement as HTMLElement);
		if (event.key === 'ArrowDown') list[(index + 1) % list.length]?.focus();
		else if (event.key === 'ArrowUp') list[(index - 1 + list.length) % list.length]?.focus();
		else if (event.key === 'Home') list[0]?.focus();
		else if (event.key === 'End') list[list.length - 1]?.focus();
		else if (event.key === 'Escape') return close(true);
		else if (event.key === 'Tab') return close();
		else return;
		event.preventDefault();
	}

	const item =
		'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-ctp-subtext1 outline-none hover:bg-ctp-surface0 hover:text-ctp-text focus-visible:bg-ctp-surface0 focus-visible:text-ctp-text focus-visible:outline-none';
</script>

<svelte:window onpointerdown={(e) => open && root && !root.contains(e.target as Node) && close()} />

<div class="relative" bind:this={root}>
	<button
		bind:this={trigger}
		type="button"
		class="btn"
		aria-haspopup="menu"
		aria-expanded={open}
		onclick={toggle}
	>
		<Icon name="settings" class="size-3.5" />
		Settings
		<Icon name="chevron-down" class="size-3.5 text-ctp-overlay1" />
	</button>

	{#if open}
		<div
			role="menu"
			tabindex="-1"
			aria-label="Settings"
			class="absolute top-full left-0 z-40 mt-1.5 w-56 rounded-lg border border-ctp-surface1 bg-ctp-mantle p-1 shadow-xl shadow-black/40"
			{onkeydown}
		>
			<button type="button" role="menuitem" class={item} onclick={() => run(onshare)}>
				<Icon name="link" class="size-4 text-ctp-overlay1" />
				Copy share link
			</button>
			<button type="button" role="menuitem" class={item} onclick={() => run(onreset)}>
				<Icon name="reset" class="size-4 text-ctp-overlay1" />
				Reset
			</button>
			<button type="button" role="menuitem" class={item} onclick={() => run(onclear)}>
				<Icon name="eraser" class="size-4 text-ctp-overlay1" />
				Clear
			</button>
			<div role="separator" class="my-1 border-t border-ctp-surface0"></div>
			<button
				type="button"
				role="menuitemcheckbox"
				aria-checked={live}
				class={item}
				title="Rewrite generated regions as you type"
				onclick={() => (live = !live)}
			>
				<Icon name="play" class="size-4 text-ctp-overlay1" />
				<span class="flex-1">Live output</span>
				{#if live}<Icon name="check" class="size-4 text-ctp-mauve" />{/if}
			</button>
			<button
				type="button"
				role="menuitemcheckbox"
				aria-checked={wrap}
				class={item}
				onclick={() => (wrap = !wrap)}
			>
				<Icon name="wrap" class="size-4 text-ctp-overlay1" />
				<span class="flex-1">Line wrap</span>
				{#if wrap}<Icon name="check" class="size-4 text-ctp-mauve" />{/if}
			</button>
		</div>
	{/if}
</div>
