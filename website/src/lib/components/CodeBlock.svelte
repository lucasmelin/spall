<script lang="ts">
	import { classifyLines, type LineInfo } from '$lib/spall-lines';

	let {
		code,
		label,
		mode = 'spall'
	}: {
		code: string;
		/** A file name shown above the code. */
		label?: string;
		/** `spall` tints template and generated regions; `json` colours JSON; `plain` doesn't colour. */
		mode?: 'spall' | 'json' | 'plain';
	} = $props();

	type Segment = { text: string; cls: string };

	const lines = $derived(code.replace(/\n$/, '').split('\n'));
	const infos = $derived<LineInfo[] | null>(mode === 'spall' ? classifyLines(lines) : null);

	const KINDS = { begin: 1, template: 1, generate: 1, output: 1, end: 1 } as const;

	function spallSegments(text: string, info: LineInfo): Segment[] {
		// Marker lines and template lines carry their own tokens; the rest is plain Markdown.
		if (info.kind === 'plain' || info.kind === 'output') {
			return [{ text, cls: /^#{1,6} /.test(text) ? 'tok-heading' : '' }];
		}
		const spans = [...info.tokens.map((t) => ({ ...t })), ...(info.marker ? [{ ...info.marker, cls: 'cm-spall-marker' }] : [])]
			.sort((a, b) => a.from - b.from);
		const out: Segment[] = [];
		let at = 0;
		for (const span of spans) {
			if (span.from > at) out.push({ text: text.slice(at, span.from), cls: '' });
			out.push({ text: text.slice(span.from, span.to), cls: span.cls });
			at = span.to;
		}
		if (at < text.length) out.push({ text: text.slice(at), cls: '' });
		return out;
	}

	const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|-?\d+(?:\.\d+)?|\b(?:true|false|null)\b|[{}[\],]/g;

	function jsonSegments(text: string): Segment[] {
		const out: Segment[] = [];
		let at = 0;
		for (const match of text.matchAll(JSON_TOKEN)) {
			const start = match.index;
			if (start > at) out.push({ text: text.slice(at, start), cls: '' });
			const [whole, str, colon] = match;
			if (str) {
				out.push({ text: str, cls: colon ? 'tok-key' : 'tok-string' });
				if (colon) out.push({ text: colon, cls: 'tok-punct' });
			} else if (/^-?\d/.test(whole)) out.push({ text: whole, cls: 'tok-number' });
			else if (/^[a-z]/.test(whole)) out.push({ text: whole, cls: 'tok-atom' });
			else out.push({ text: whole, cls: 'tok-punct' });
			at = start + whole.length;
		}
		if (at < text.length) out.push({ text: text.slice(at), cls: '' });
		return out;
	}

	const rows = $derived(
		lines.map((text, i) => {
			const info = infos?.[i];
			return {
				text,
				kind: info && info.kind in KINDS ? `cm-spall-${info.kind}` : '',
				segments: info ? spallSegments(text, info) : mode === 'json' ? jsonSegments(text) : [{ text, cls: '' }]
			};
		})
	);
</script>

<figure class="code-block overflow-hidden rounded-xl border border-ctp-surface0 bg-ctp-mantle">
	{#if label}
		<figcaption class="border-b border-ctp-surface0 px-4 py-2 font-mono text-xs text-ctp-subtext0">{label}</figcaption>
	{/if}
	<pre class="overflow-x-auto py-3 font-mono text-[13px] leading-[1.7] whitespace-normal"><code class="block w-max min-w-full">{#each rows as row}<div class="min-h-[1.7em] px-4 whitespace-pre text-ctp-text {row.kind}">{#each row.segments as seg}<span class={seg.cls}>{seg.text}</span>{/each}</div>{/each}</code></pre>
</figure>
