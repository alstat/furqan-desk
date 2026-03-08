<script lang="ts">
	import type { MorphWord } from '$lib/types/morphology';
	import Icon from '@iconify/svelte';
	import { buckwalterToArabic } from '$lib/functions/utils/utils';
	import { fly } from 'svelte/transition';

	interface Props {
		word: MorphWord;
		position: { x: number; y: number; placement: 'above' | 'below' };
		onClose: () => void;
	}

	let { word, position, onClose }: Props = $props();

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy() { node.remove(); } };
	}

	type TokenStyle = { bg: string; border: string; badge: string; text: string; dot: string };

	const TOKEN_STYLES: Record<string, TokenStyle> = {
		N:    { bg: 'bg-sky-50',     border: 'border-sky-200',     badge: 'bg-sky-100 text-sky-700',        text: 'text-sky-700',     dot: 'bg-sky-400'     },
		V:    { bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-700', dot: 'bg-emerald-400' },
		P:    { bg: 'bg-violet-50',  border: 'border-violet-200',  badge: 'bg-violet-100 text-violet-700',  text: 'text-violet-700',  dot: 'bg-violet-400'  },
		PN:   { bg: 'bg-indigo-50',  border: 'border-indigo-200',  badge: 'bg-indigo-100 text-indigo-700',  text: 'text-indigo-700',  dot: 'bg-indigo-400'  },
		ADJ:  { bg: 'bg-amber-50',   border: 'border-amber-200',   badge: 'bg-amber-100 text-amber-700',    text: 'text-amber-700',   dot: 'bg-amber-400'   },
		DET:  { bg: 'bg-slate-50',   border: 'border-slate-200',   badge: 'bg-slate-100 text-slate-600',   text: 'text-slate-600',   dot: 'bg-slate-400'   },
		PRON: { bg: 'bg-rose-50',    border: 'border-rose-200',    badge: 'bg-rose-100 text-rose-700',      text: 'text-rose-700',    dot: 'bg-rose-400'    },
		REL:  { bg: 'bg-rose-50',    border: 'border-rose-200',    badge: 'bg-rose-100 text-rose-700',      text: 'text-rose-700',    dot: 'bg-rose-400'    },
		DEM:  { bg: 'bg-rose-50',    border: 'border-rose-200',    badge: 'bg-rose-100 text-rose-700',      text: 'text-rose-700',    dot: 'bg-rose-400'    },
		CONJ: { bg: 'bg-orange-50',  border: 'border-orange-200',  badge: 'bg-orange-100 text-orange-700',  text: 'text-orange-700',  dot: 'bg-orange-400'  },
		NEG:  { bg: 'bg-red-50',     border: 'border-red-200',     badge: 'bg-red-100 text-red-700',        text: 'text-red-700',     dot: 'bg-red-400'     },
	};
	const DEFAULT_STYLE: TokenStyle = {
		bg: 'bg-slate-50', border: 'border-slate-200', badge: 'bg-slate-100 text-slate-600', text: 'text-slate-600', dot: 'bg-slate-400'
	};

	function getStyle(tag: string): TokenStyle {
		return TOKEN_STYLES[tag] ?? DEFAULT_STYLE;
	}
</script>

<div
	use:portal
	class="ayah-tooltip fixed z-[9999] flex w-[22rem] max-h-[72vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
	style={position.placement === 'below'
		? `left: ${position.x}px; top: ${position.y + 8}px;`
		: `left: ${position.x}px; bottom: calc(100vh - ${position.y}px + 8px);`}
	transition:fly={{ y: 8, duration: 160, opacity: 0 }}
>
	<!-- Header -->
	<div class="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
		<span class="font-scheherazade text-3xl leading-none text-slate-800" dir="rtl">
			{word.combined_arabic}
		</span>
		<button
			onclick={onClose}
			class="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
		>
			<Icon icon="mdi:close" width="15" />
		</button>
	</div>

	<!-- Token list -->
	<div class="flex-1 space-y-2 overflow-y-auto p-3">
		{#each word.tokens as token}
			{@const s = getStyle(token.tag)}
			<div class="overflow-hidden rounded-xl border {s.border} {s.bg}">

				<!-- Token header row -->
				<div class="flex items-center justify-between border-b px-3 py-2 {s.border}">
					<span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold {s.badge}">
						<span class="h-1.5 w-1.5 rounded-full {s.dot}"></span>
						{token.tag_name}
					</span>
					<div class="flex flex-col items-end" dir="rtl">
						<span class="font-scheherazade text-2xl leading-snug {s.text}">{token.form_arabic}</span>
						<span class="font-mono text-[10px] text-slate-400" dir="ltr">{token.form_buckwalter}</span>
					</div>
				</div>

				<!-- Features -->
				<div class="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 py-2.5 text-xs">
					{#if token.features.root}
						<div class="flex items-center justify-between gap-1">
							<span class="shrink-0 text-slate-400">Root</span>
							<span class="font-scheherazade text-sm {s.text}" dir="rtl">{buckwalterToArabic(token.features.root)}</span>
						</div>
					{/if}
					{#if token.features.lemma}
						<div class="flex items-center justify-between gap-1">
							<span class="shrink-0 text-slate-400">Lemma</span>
							<span class="font-scheherazade text-sm {s.text}" dir="rtl">{buckwalterToArabic(token.features.lemma)}</span>
						</div>
					{/if}
					{#if token.features.pos}
						<div class="flex items-center justify-between gap-1">
							<span class="shrink-0 text-slate-400">POS</span>
							<span class="text-slate-600">{token.features.pos}</span>
						</div>
					{/if}
					{#if token.features.gender}
						<div class="flex items-center justify-between gap-1">
							<span class="shrink-0 text-slate-400">Gender</span>
							<span class="text-slate-600">{token.features.gender}</span>
						</div>
					{/if}
					{#if token.features.number}
						<div class="flex items-center justify-between gap-1">
							<span class="shrink-0 text-slate-400">Number</span>
							<span class="text-slate-600">{token.features.number}</span>
						</div>
					{/if}
					{#if token.features.case_type}
						<div class="flex items-center justify-between gap-1">
							<span class="shrink-0 text-slate-400">Case</span>
							<span class="text-slate-600">{token.features.case_type}</span>
						</div>
					{/if}
					{#if token.features.person}
						<div class="flex items-center justify-between gap-1">
							<span class="shrink-0 text-slate-400">Person</span>
							<span class="text-slate-600">{token.features.person}</span>
						</div>
					{/if}
					{#if token.features.aspect}
						<div class="flex items-center justify-between gap-1">
							<span class="shrink-0 text-slate-400">Aspect</span>
							<span class="text-slate-600">{token.features.aspect}</span>
						</div>
					{/if}
					{#if token.features.voice}
						<div class="flex items-center justify-between gap-1">
							<span class="shrink-0 text-slate-400">Voice</span>
							<span class="text-slate-600">{token.features.voice}</span>
						</div>
					{/if}
					{#if token.features.mood}
						<div class="flex items-center justify-between gap-1">
							<span class="shrink-0 text-slate-400">Mood</span>
							<span class="text-slate-600">{token.features.mood}</span>
						</div>
					{/if}
					{#if token.features.state}
						<div class="flex items-center justify-between gap-1">
							<span class="shrink-0 text-slate-400">State</span>
							<span class="text-slate-600">{token.features.state}</span>
						</div>
					{/if}
					{#if token.features.derivation}
						<div class="flex items-center justify-between gap-1">
							<span class="shrink-0 text-slate-400">Form</span>
							<span class="text-slate-600">{token.features.derivation}</span>
						</div>
					{/if}
					{#if token.features.prefix_type}
						<div class="flex items-center justify-between gap-1">
							<span class="shrink-0 text-slate-400">Prefix</span>
							<span class="text-slate-600">{token.features.prefix_type}</span>
						</div>
					{/if}
					{#if token.features.suffix_type}
						<div class="flex items-center justify-between gap-1">
							<span class="shrink-0 text-slate-400">Suffix</span>
							<span class="text-slate-600">{token.features.suffix_type}</span>
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>
