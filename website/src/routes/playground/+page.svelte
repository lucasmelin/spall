<script lang="ts">
	import { onMount } from "svelte";
	import { resolve } from "$app/paths";
	import { standardFilterMetadata, standardFilters } from "knap";
	import type { Diagnostic } from "@codemirror/lint";
	import { analyze, parseOverrides, type Analysis } from "$lib/analyze";
	import CommandPalette, {
		type PaletteItem,
	} from "$lib/components/CommandPalette.svelte";
	import Editor from "$lib/components/Editor.svelte";
	import Icon from "$lib/components/Icon.svelte";
	import Logo from "$lib/components/Logo.svelte";
	import Pane from "$lib/components/Pane.svelte";
	import SettingsMenu from "$lib/components/SettingsMenu.svelte";
	import StatusBar, { type Tone } from "$lib/components/StatusBar.svelte";
	import {
		defaultExample,
		examples,
		type PlaygroundState,
	} from "$lib/examples";
	import { parseData } from "$lib/json";
	import {
		DEFAULT_SPLIT,
		MAX_SPLIT,
		MIN_SPLIT,
		decodeState,
		loadSaved,
		loadSettings,
		save,
		saveSettings,
		shareUrl,
	} from "$lib/share";

	const REPO = "https://github.com/lucasmelin/spall";
	const NPM = "https://www.npmjs.com/package/@lucasmelin/spall";
	const KNAP = "https://knap.md";
	const BLOCK =
		"<!--[[[spall:begin\n\nspall:generate]]]-->\n<!--[[[spall:end]]]-->\n";

	// ---- State ---------------------------------------------------------------------------------

	let data = $state(defaultExample.state.data);
	let doc = $state(defaultExample.state.doc);
	let overrides = $state(defaultExample.state.set);
	let wrap = $state(true);
	/** Rewrite the generated regions of the document as you type, like a watcher running spall render. */
	let live = $state(true);
	/** Data's share of the width, in percent. Dragging the divider changes it. */
	let split = $state(DEFAULT_SPLIT);
	let dragging = $state(false);
	let main: HTMLElement | undefined = $state();
	let ready = $state(false);
	let isMac = $state(false);
	let pane = $state<"data" | "doc">("doc");
	let paletteOpen = $state(false);
	let toast = $state("");

	let analysis = $state.raw<Analysis | null>(null);

	let dataEditor: ReturnType<typeof Editor> | undefined = $state();
	let docEditor: ReturnType<typeof Editor> | undefined = $state();

	const dataResult = $derived(parseData(data));
	const overridesResult = $derived(parseOverrides(overrides));
	/** `--data` merged with `--set`, which wins. Null while either is invalid. */
	const variables = $derived(
		dataResult.ok && overridesResult.ok
			? { ...dataResult.value, ...overridesResult.value }
			: null,
	);

	const dataDiagnostics = $derived<Diagnostic[]>(
		dataResult.ok
			? []
			: [
					{
						from: dataResult.from,
						to: dataResult.to,
						severity: "error",
						message: dataResult.message,
					},
				],
	);

	// ---- Rendering -----------------------------------------------------------------------------

	let run = 0;
	$effect(() => {
		if (!ready) return;
		const source = doc;
		const vars = variables;
		const autoApply = live;
		const id = ++run;

		const timer = setTimeout(async () => {
			const result = await analyze(source, vars);
			// Anything typed since this started makes the result stale (and its positions wrong).
			if (id !== run) return;

			// Generated regions are rewritten in place. The editor carries the diagnostics through
			// those edits itself, so nothing here has to adjust positions.
			const applying = autoApply && result.edits.length > 0;
			analysis = applying ? { ...result, edits: [] } : result;
			docEditor?.update({
				diagnostics: result.problems.map((p) => ({
					from: p.from,
					to: p.to,
					severity: p.severity,
					message: p.message,
					source: p.code,
				})),
				edits: applying ? result.edits : [],
			});
		}, 90);

		return () => clearTimeout(timer);
	});

	// ---- Persistence ---------------------------------------------------------------------------

	$effect(() => {
		if (!ready) return;
		const state: PlaygroundState = { data, doc, set: overrides };
		const timer = setTimeout(() => save(state), 300);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		if (ready) saveSettings({ wrap, live, split });
	});

	onMount(() => {
		isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
		const shared = decodeState(location.hash);
		const state = shared ?? loadSaved() ?? defaultExample.state;
		data = state.data;
		doc = state.doc;
		overrides = state.set;
		// The link has done its job; from here the browser's own saved copy is the source of truth.
		if (shared)
			history.replaceState(null, "", location.pathname + location.search);
		const settings = loadSettings();
		wrap = settings.wrap;
		live = settings.live;
		split = settings.split;
		ready = true;
	});

	// ---- Status lines --------------------------------------------------------------------------

	const plural = (n: number, word: string) =>
		`${n} ${word}${n === 1 ? "" : "s"}`;

	type Status = { tone: Tone; text: string; jump?: () => void };

	const dataStatus = $derived<Status>(
		!ready
			? { tone: "checking", text: "Checking…" }
			: !dataResult.ok
				? {
						tone: "error",
						text: `Line ${dataResult.line}, column ${dataResult.column}: ${dataResult.message}`,
						jump: () => dataEditor?.reveal(dataResult.from),
					}
				: dataResult.empty
					? {
							tone: "info",
							text: "No data. Templates will render without variables",
						}
					: {
							tone: "ok",
							text: `Valid JSON, ${plural(dataResult.count, "variable")}`,
						},
	);

	const docStatus = $derived.by<Status>(() => {
		if (!ready || !analysis) return { tone: "checking", text: "Checking…" };
		if (analysis.blockedByData) {
			return {
				tone: "error",
				text: "Not rendered. Fix the data or overrides first",
			};
		}
		const errors = analysis.problems.filter((p) => p.severity === "error");
		const warnings = analysis.problems.filter(
			(p) => p.severity === "warning",
		);
		const jumpTo = (from: number) => () => {
			pane = "doc";
			docEditor?.reveal(from);
		};
		if (errors.length > 0) {
			const first = errors[0];
			return {
				tone: "error",
				text: `Line ${first.line}: ${first.message}${errors.length > 1 ? ` (+${errors.length - 1} more)` : ""}. Output not updated`,
				jump: jumpTo(first.from),
			};
		}
		if (analysis.fatal)
			return {
				tone: "error",
				text: `${analysis.fatal} Output not updated`,
			};
		if (warnings.length > 0) {
			const first = warnings[0];
			return {
				tone: "warn",
				text: `Line ${first.line}: ${first.message}${warnings.length > 1 ? ` (+${warnings.length - 1} more)` : ""}`,
				jump: jumpTo(first.from),
			};
		}
		if (analysis.blocks === 0) {
			return {
				tone: "info",
				text: "No spall blocks yet. Use Add block to create one",
			};
		}
		if (analysis.edits.length > 0) {
			return {
				tone: "info",
				text: "Output is out of date. Render to update it, since spall check exits 1",
			};
		}
		return {
			tone: "ok",
			text: `${plural(analysis.blocks, "block")}, output up to date`,
		};
	});

	const canRender = $derived(analysis !== null && analysis.edits.length > 0);

	const hasProblem = $derived({
		data: !dataResult.ok || !overridesResult.ok,
		doc:
			(analysis?.problems.some((p) => p.severity === "error") ?? false) ||
			!!analysis?.fatal,
	});

	// ---- Actions -------------------------------------------------------------------------------

	let toastTimer: ReturnType<typeof setTimeout> | undefined;
	function flash(message: string) {
		toast = message;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = ""), 2400);
	}

	async function copyText(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			const area = document.createElement("textarea");
			area.value = text;
			area.style.cssText = "position:fixed;opacity:0";
			document.body.append(area);
			area.select();
			const ok = document.execCommand("copy");
			area.remove();
			return ok;
		}
	}

	function load(state: PlaygroundState) {
		data = state.data;
		doc = state.doc;
		overrides = state.set;
	}

	async function copyShare() {
		const ok = await copyText(shareUrl({ data, doc, set: overrides }));
		flash(ok ? "Share link copied" : "Could not copy the link");
	}

	function reset() {
		load(defaultExample.state);
		flash("Reset to the example");
	}

	function clear() {
		load({ data: "", doc: "", set: "" });
		flash("Cleared");
	}

	async function copyDocument() {
		const ok = await copyText(doc);
		flash(ok ? "Document copied" : "Could not copy the document");
	}

	/** One-off render, for when live output is off. Like running spall render on the file. */
	function renderNow() {
		if (!canRender || !analysis) return;
		docEditor?.update({ edits: analysis.edits });
		flash("Output updated");
	}

	function addBlock() {
		pane = "doc";
		docEditor?.insert(BLOCK, "<!--[[[spall:begin\n".length);
	}

	function insertFilter(name: string) {
		pane = "doc";
		const example = standardFilterMetadata[name]?.example ?? name;
		docEditor?.insert(`{{ value | ${example} }}`);
	}

	// ---- Search palette ------------------------------------------------------------------------

	const paletteItems = $derived<PaletteItem[]>([
		{
			id: "a-share",
			group: "Actions",
			title: "Copy share link",
			run: copyShare,
		},
		{
			id: "a-block",
			group: "Actions",
			title: "Add spall block",
			run: addBlock,
		},
		{
			id: "a-live",
			group: "Actions",
			title: live ? "Turn live output off" : "Turn live output on",
			run: () => (live = !live),
		},
		{
			id: "a-wrap",
			group: "Actions",
			title: wrap ? "Turn line wrap off" : "Turn line wrap on",
			run: () => (wrap = !wrap),
		},
		{
			id: "a-reset",
			group: "Actions",
			title: "Reset",
			hint: "Back to the first example",
			run: reset,
		},
		{
			id: "a-clear",
			group: "Actions",
			title: "Clear",
			hint: "Empty every pane",
			run: clear,
		},
		...examples.map((example) => ({
			id: `e-${example.id}`,
			group: "Examples",
			title: example.name,
			hint: example.description.replaceAll("`", ""),
			run: () => {
				load(example.state);
				flash(`Loaded “${example.name}”`);
			},
		})),
		...Object.keys(standardFilters)
			.sort()
			.map((name) => ({
				id: `f-${name}`,
				group: "Filters",
				title: name,
				hint: `| ${standardFilterMetadata[name]?.example ?? name}`,
				run: () => insertFilter(name),
			})),
		{
			id: "d-vars",
			group: "Docs",
			title: "Knap: Variables",
			href: `${KNAP}/variables`,
		},
		{
			id: "d-filters",
			group: "Docs",
			title: "Knap: Filters",
			href: `${KNAP}/filters`,
		},
		{
			id: "d-logic",
			group: "Docs",
			title: "Knap: Logic",
			href: `${KNAP}/logic`,
		},
		{
			id: "d-knap-play",
			group: "Docs",
			title: "Knap: Playground",
			href: `${KNAP}/playground`,
		},
		{
			id: "d-readme",
			group: "Docs",
			title: "Spall: README",
			href: `${REPO}#readme`,
		},
		{ id: "d-npm", group: "Docs", title: "Spall: npm package", href: NPM },
		{ id: "d-github", group: "Docs", title: "Spall: GitHub", href: REPO },
	]);

	function onwindowkeydown(event: KeyboardEvent) {
		const modifier = isMac ? event.metaKey : event.ctrlKey;
		if (
			modifier &&
			!event.altKey &&
			!event.shiftKey &&
			event.key.toLowerCase() === "k"
		) {
			event.preventDefault();
			paletteOpen = !paletteOpen;
		}
	}

	// ---- Resizing ------------------------------------------------------------------------------

	const clampSplit = (value: number) =>
		Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, value));

	function dragTo(clientX: number) {
		if (!main) return;
		const box = main.getBoundingClientRect();
		split = clampSplit(((clientX - box.left) / box.width) * 100);
	}

	function startDrag(event: PointerEvent) {
		if (event.button !== 0) return;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		dragging = true;
		event.preventDefault();
	}

	function onDividerKeydown(event: KeyboardEvent) {
		const step = event.shiftKey ? 10 : 2;
		if (event.key === "ArrowLeft") split = clampSplit(split - step);
		else if (event.key === "ArrowRight") split = clampSplit(split + step);
		else if (event.key === "Home") split = MIN_SPLIT;
		else if (event.key === "End") split = MAX_SPLIT;
		else if (event.key === "Enter") split = DEFAULT_SPLIT;
		else return;
		event.preventDefault();
	}

	const panes = [
		{ id: "data", label: "Data" },
		{ id: "doc", label: "Document" },
	] as const;
</script>

<svelte:head>
	<title>Playground · Spall</title>
	<meta
		name="description"
		content="Try Spall in your browser. Edit JSON data and a Markdown document with embedded Knap templates, and see exactly what spall render would write."
	/>
	<meta property="og:title" content="Playground · Spall" />
	<meta
		property="og:description"
		content="Render Knap templates embedded in Markdown, live in your browser."
	/>
</svelte:head>

<svelte:window onkeydown={onwindowkeydown} />

<div class="flex h-dvh flex-col">
	<header
		class="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-ctp-surface0 bg-ctp-mantle px-3 sm:px-4"
	>
		<div class="flex min-w-0 items-center gap-3">
			<a
				href={resolve("/")}
				class="flex items-center gap-2 rounded-md py-1 pr-1 text-ctp-text hover:text-primary"
				aria-label="Spall home"
			>
				<Logo />
				<span class="text-[15px] font-semibold tracking-tight"
					>Spall</span
				>
			</a>
			<span class="text-ctp-surface2" aria-hidden="true">/</span>
			<h1 class="text-sm font-medium text-ctp-subtext0">Playground</h1>
		</div>

		<div class="flex items-center gap-1">
			<SettingsMenu
				bind:wrap
				bind:live
				onshare={copyShare}
				onreset={reset}
				onclear={clear}
			/>

			<button
				type="button"
				class="ml-1 flex h-8 items-center gap-2 rounded-md border border-ctp-surface1 px-2.5 text-xs text-ctp-subtext0 transition-colors hover:border-ctp-surface2 hover:text-ctp-text"
				onclick={() => (paletteOpen = true)}
				aria-label="Search"
				aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
			>
				<Icon name="search" class="size-3.5" />
				<span class="hidden sm:inline">Search</span>
				<kbd
					class="hidden rounded bg-ctp-surface0 px-1.5 py-px font-sans text-[11px] text-ctp-overlay1 sm:inline"
				>
					{isMac ? "⌘K" : "Ctrl K"}
				</kbd>
			</button>

			<div class="ml-2 hidden items-center gap-2 lg:flex">
				<nav
					aria-label="Knap documentation"
					class="flex h-8 items-center rounded-md border border-ctp-surface1 pr-0.5 pl-2.5"
				>
					<span class="pr-1 text-xs font-medium">Knap docs</span>
					<a
						class="link"
						href="{KNAP}/variables"
						target="_blank"
						rel="noreferrer">Variables</a
					>
					<a
						class="link"
						href="{KNAP}/filters"
						target="_blank"
						rel="noreferrer">Filters</a
					>
					<a
						class="link"
						href="{KNAP}/logic"
						target="_blank"
						rel="noreferrer">Logic</a
					>
				</nav>
				<nav
					aria-label="Spall"
					class="flex h-8 items-center rounded-md border border-primary/30 pr-0.5 pl-2.5"
				>
					<span class="pr-1 text-xs font-medium text-primary"
						>Spall</span
					>
					<a
						class="link"
						href="{REPO}#readme"
						target="_blank"
						rel="noreferrer">README</a
					>
					<a class="link" href={NPM} target="_blank" rel="noreferrer"
						>npm</a
					>
					<a
						class="link flex items-center gap-1.5"
						href={REPO}
						target="_blank"
						rel="noreferrer"
					>
						<Icon name="github" class="size-3.5" />
						GitHub
					</a>
				</nav>
			</div>
		</div>
	</header>

	<div
		class="flex shrink-0 gap-1 border-b border-ctp-surface0 bg-ctp-mantle px-3 py-2 lg:hidden"
		role="group"
		aria-label="Show pane"
	>
		{#each panes as p (p.id)}
			<button
				type="button"
				aria-pressed={pane === p.id}
				class="relative flex-1 rounded-md py-1.5 text-sm font-medium transition-colors {pane ===
				p.id
					? 'bg-ctp-surface0 text-ctp-text'
					: 'text-ctp-overlay1 hover:text-ctp-text'}"
				onclick={() => (pane = p.id)}
			>
				{p.label}
				{#if hasProblem[p.id]}
					<span
						class="absolute top-2 right-3 size-1.5 rounded-full bg-ctp-red"
						title="Has a problem"
					></span>
				{/if}
			</button>
		{/each}
	</div>

	<main
		bind:this={main}
		class="split grid min-h-0 flex-1 {dragging
			? 'cursor-col-resize select-none'
			: ''}"
		style="--split: {split}"
	>
		<Pane
			title="Data"
			kind="JSON"
			class={pane === "data" ? "" : "max-lg:hidden"}
		>
			<div class="absolute inset-0 flex flex-col">
				<div class="relative min-h-0 flex-1">
					{#if ready}
						<Editor
							bind:this={dataEditor}
							bind:value={data}
							label="JSON data"
							language="json"
							{wrap}
							diagnostics={dataDiagnostics}
							placeholder={'{ "name": "Lucas" }'}
						/>
					{/if}
				</div>
				<div
					class="shrink-0 border-t border-ctp-surface0 bg-ctp-mantle px-4 pt-2.5 pb-3"
				>
					<label
						for="overrides"
						class="flex items-baseline justify-between gap-3 text-xs"
					>
						<span class="font-medium text-ctp-subtext1"
							>Overrides</span
						>
						<span class="truncate text-ctp-overlay1">
							Like <code class="font-mono text-ctp-subtext0"
								>--set key=value</code
							>, one per line
						</span>
					</label>
					<textarea
						id="overrides"
						bind:value={overrides}
						rows="3"
						spellcheck="false"
						autocomplete="off"
						autocapitalize="off"
						placeholder="name=Lucas"
						aria-invalid={!overridesResult.ok}
						aria-describedby={overridesResult.ok
							? undefined
							: "overrides-error"}
						class="mt-2 block w-full resize-none rounded-md border bg-ctp-base px-3 py-2 font-mono text-[13px] leading-relaxed text-ctp-text placeholder:text-ctp-overlay0 {overridesResult.ok
							? 'border-ctp-surface0 focus:border-primary'
							: 'border-ctp-red/70'} outline-none"
					></textarea>
					{#if !overridesResult.ok}
						<p
							id="overrides-error"
							class="mt-1.5 text-xs text-ctp-red"
						>
							{overridesResult.message}
						</p>
					{/if}
				</div>
			</div>
			{#snippet footer()}
				<StatusBar
					tone={dataStatus.tone}
					text={dataStatus.text}
					onjump={dataStatus.jump}
				/>
			{/snippet}
		</Pane>

		<!-- A zero-width column: the visible line and the wider grab area are both positioned over it. -->
		<div class="relative z-10 max-lg:hidden">
			<!-- A focusable separator is the ARIA "window splitter" widget, so it is interactive by design. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
			<div
				role="separator"
				aria-orientation="vertical"
				aria-label="Resize the Data and Document panes"
				aria-valuemin={MIN_SPLIT}
				aria-valuemax={MAX_SPLIT}
				aria-valuenow={Math.round(split)}
				tabindex="0"
				class="group absolute inset-y-0 -left-2 flex w-4 cursor-col-resize touch-none justify-center outline-none"
				onpointerdown={startDrag}
				onpointermove={(e) => dragging && dragTo(e.clientX)}
				onpointerup={() => (dragging = false)}
				onpointercancel={() => (dragging = false)}
				onkeydown={onDividerKeydown}
				ondblclick={() => (split = DEFAULT_SPLIT)}
				title="Drag to resize. Double-click to reset."
			>
				<span
					class="h-full transition-colors {dragging
						? 'w-0.5 bg-primary'
						: 'w-px bg-ctp-surface0 group-hover:w-0.5 group-hover:bg-primary/70 group-focus-visible:w-0.5 group-focus-visible:bg-primary'}"
				></span>
			</div>
		</div>

		<Pane
			title="Document"
			kind="Markdown"
			class={pane === "doc" ? "" : "max-lg:hidden"}
		>
			{#snippet actions()}
				<span
					class="mr-2 hidden items-center gap-3 text-xs text-ctp-subtext0 xl:flex"
					aria-label="Colour key"
				>
					<span class="flex items-center gap-1.5">
						<span class="size-2 rounded-sm bg-primary"
						></span>Template
					</span>
					<span class="flex items-center gap-1.5">
						<span class="size-2 rounded-sm bg-secondary"
						></span>Generated
					</span>
				</span>
				<button
					type="button"
					class="btn"
					onclick={addBlock}
					disabled={!ready}
				>
					<Icon name="plus" class="size-3.5" />
					Add block
				</button>
				{#if !live}
					<button
						type="button"
						class="btn"
						onclick={renderNow}
						disabled={!canRender}
						title="Rewrite the generated regions, like running spall render"
					>
						<Icon name="render" class="size-3.5" />
						Render
					</button>
				{/if}
				<button
					type="button"
					class="btn"
					onclick={copyDocument}
					disabled={!ready}
				>
					<Icon name="copy" class="size-3.5" />
					Copy
				</button>
			{/snippet}
			<div class="absolute inset-0">
				{#if ready}
					<Editor
						bind:this={docEditor}
						bind:value={doc}
						label="Markdown document with spall blocks"
						language="markdown"
						{wrap}
						regions
						placeholder="Write Markdown, then add a spall block"
					/>
				{/if}
			</div>
			{#snippet footer()}
				<StatusBar
					tone={docStatus.tone}
					text={docStatus.text}
					onjump={docStatus.jump}
				/>
			{/snippet}
		</Pane>
	</main>
</div>

<CommandPalette bind:open={paletteOpen} items={paletteItems} />

{#if toast}
	<div
		class="pointer-events-none fixed inset-x-0 bottom-14 z-50 flex justify-center px-4"
		role="status"
	>
		<div
			class="rounded-lg border border-ctp-surface1 bg-ctp-mantle px-4 py-2 text-sm text-ctp-text shadow-xl shadow-black/40"
		>
			{toast}
		</div>
	</div>
{/if}

<noscript>
	<p class="p-6 text-sm text-ctp-subtext0">
		Enable JavaScript to render templates in the playground.
	</p>
</noscript>
