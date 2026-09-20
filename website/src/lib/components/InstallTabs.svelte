<script lang="ts">
	import Command from './Command.svelte';

	const managers = [
		{ id: 'npm', command: 'npm install -g @lucasmelin/spall' },
		{ id: 'pnpm', command: 'pnpm add -g @lucasmelin/spall' },
		{ id: 'yarn', command: 'yarn global add @lucasmelin/spall' },
		{ id: 'bun', command: 'bun add -g @lucasmelin/spall' }
	] as const;

	const uid = $props.id();
	let active = $state<(typeof managers)[number]['id']>('npm');

	function onkeydown(event: KeyboardEvent) {
		const at = managers.findIndex((m) => m.id === active);
		const next =
			event.key === 'ArrowRight' ? at + 1 : event.key === 'ArrowLeft' ? at - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? managers.length - 1 : null;
		if (next === null) return;
		event.preventDefault();
		const target = managers[(next + managers.length) % managers.length];
		active = target.id;
		document.getElementById(`${uid}-tab-${target.id}`)?.focus();
	}
</script>

<div>
	<div role="tablist" aria-label="Package manager" class="mb-3 flex gap-1">
		{#each managers as m (m.id)}
			<button
				type="button"
				role="tab"
				id="{uid}-tab-{m.id}"
				aria-selected={active === m.id}
				aria-controls="{uid}-panel"
				tabindex={active === m.id ? 0 : -1}
				class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {active === m.id
					? 'bg-ctp-surface0 text-ctp-text'
					: 'text-ctp-overlay1 hover:text-ctp-text'}"
				onclick={() => (active = m.id)}
				{onkeydown}
			>
				{m.id}
			</button>
		{/each}
	</div>
	<div role="tabpanel" id="{uid}-panel" aria-labelledby="{uid}-tab-{active}">
		{#each managers as m (m.id)}
			{#if m.id === active}<Command command={m.command} />{/if}
		{/each}
	</div>
</div>
