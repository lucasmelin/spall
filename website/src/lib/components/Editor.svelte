<script lang="ts" module>
	import { Annotation } from '@codemirror/state';

	/** Marks edits that came from the `value` prop so they don't echo back out. */
	const fromProp = Annotation.define<boolean>();
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import { json } from '@codemirror/lang-json';
	import { markdown } from '@codemirror/lang-markdown';
	import { bracketMatching } from '@codemirror/language';
	import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
	import { Compartment, EditorState, Transaction, type Extension } from '@codemirror/state';
	import {
		EditorView,
		drawSelection,
		highlightActiveLineGutter,
		keymap,
		lineNumbers,
		placeholder as placeholderExt
	} from '@codemirror/view';
	import { catppuccinHighlight, catppuccinTheme } from '$lib/catppuccin';
	import { spallRegions } from '$lib/spall-regions';

	let {
		value = $bindable(''),
		label,
		language,
		readonly = false,
		wrap = true,
		regions = false,
		diagnostics = [],
		placeholder = ''
	}: {
		value?: string;
		/** Announced by screen readers; there is no visible <label> for an editor. */
		label: string;
		language: 'json' | 'markdown';
		readonly?: boolean;
		wrap?: boolean;
		/** Colour spall's template and generated regions. */
		regions?: boolean;
		diagnostics?: Diagnostic[];
		placeholder?: string;
	} = $props();

	let host: HTMLDivElement | undefined = $state();
	let view: EditorView | undefined = $state.raw();
	const wrapping = new Compartment();

	/** Insert at the cursor. `caret` is where to leave the cursor, counted from the start of `text`. */
	export function insert(text: string, caret?: number) {
		if (!view) return;
		const start = view.state.selection.main.from;
		view.dispatch({
			...view.state.replaceSelection(text),
			...(caret === undefined ? {} : { selection: { anchor: start + caret } }),
			scrollIntoView: true,
			userEvent: 'input'
		});
		view.focus();
	}

	/**
	 * Apply generated changes. They stay out of undo history (undo should undo *your* typing, and the
	 * generated regions are rewritten anyway) and still flow back out through `value`.
	 */
	export function applyEdits(edits: { from: number; to: number; insert: string }[]) {
		if (!view || edits.length === 0) return;
		view.dispatch({ changes: edits, annotations: Transaction.addToHistory.of(false) });
	}

	export function reveal(position: number) {
		if (!view) return;
		const anchor = Math.max(0, Math.min(view.state.doc.length, position));
		view.dispatch({ selection: { anchor }, effects: EditorView.scrollIntoView(anchor, { y: 'center' }) });
		view.focus();
	}

	onMount(() => {
		const extensions: Extension[] = [
			catppuccinTheme,
			catppuccinHighlight,
			lineNumbers(),
			lintGutter(),
			highlightActiveLineGutter(),
			drawSelection(),
			bracketMatching(),
			history(),
			language === 'json' ? [json(), closeBrackets()] : markdown(),
			regions ? spallRegions : [],
			placeholder ? placeholderExt(placeholder) : [],
			wrapping.of(wrap ? EditorView.lineWrapping : []),
			EditorState.readOnly.of(readonly),
			EditorView.contentAttributes.of({
				'aria-label': label,
				spellcheck: 'false',
				autocorrect: 'off',
				autocapitalize: 'off'
			}),
			keymap.of([...(language === 'json' ? closeBracketsKeymap : []), ...defaultKeymap, ...historyKeymap]),
			EditorView.updateListener.of((update) => {
				if (!update.docChanged) return;
				if (update.transactions.some((tr) => tr.annotation(fromProp))) return;
				value = update.state.doc.toString();
			})
		];

		const created = new EditorView({
			parent: host,
			state: EditorState.create({ doc: value, extensions })
		});
		view = created;
		return () => created.destroy();
	});

	// Push outside changes (reset, examples, "apply") into the editor.
	$effect(() => {
		const next = value;
		if (!view || next === view.state.doc.toString()) return;
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: next },
			annotations: fromProp.of(true)
		});
	});

	$effect(() => {
		view?.dispatch({ effects: wrapping.reconfigure(wrap ? EditorView.lineWrapping : []) });
	});

	$effect(() => {
		const list = diagnostics;
		if (!view) return;
		const size = view.state.doc.length;
		const clamp = (n: number) => Math.max(0, Math.min(size, n));
		view.dispatch(
			setDiagnostics(
				view.state,
				list.map((d) => ({ ...d, from: clamp(d.from), to: clamp(Math.max(d.to, d.from)) }))
			)
		);
	});
</script>

<div bind:this={host} class="absolute inset-0"></div>
