<script lang="ts">
	import type { MorphWord } from '$lib/types/morphology';
	import Icon from '@iconify/svelte';

	interface Props {
		word: MorphWord;
		position: { x: number; y: number };
		onClose: () => void;
	}

	let { word, position, onClose }: Props = $props();

	function getTokenColor(tag: string): string {
		const colors: Record<string, string> = {
			N: 'bg-blue-100 text-blue-800 border-blue-300',
			V: 'bg-green-100 text-green-800 border-green-300',
			P: 'bg-purple-100 text-purple-800 border-purple-300',
			PN: 'bg-indigo-100 text-indigo-800 border-indigo-300',
			ADJ: 'bg-yellow-100 text-yellow-800 border-yellow-300',
			DET: 'bg-gray-100 text-gray-800 border-gray-300',
			PRON: 'bg-pink-100 text-pink-800 border-pink-300',
			REL: 'bg-pink-100 text-pink-800 border-pink-300',
			DEM: 'bg-pink-100 text-pink-800 border-pink-300',
			CONJ: 'bg-orange-100 text-orange-800 border-orange-300',
			NEG: 'bg-red-100 text-red-800 border-red-300'
		};
		return colors[tag] || 'bg-slate-100 text-slate-800 border-slate-300';
	}
</script>

<div
	class="ayah-tooltip fixed z-50 max-h-[70vh] w-80 overflow-auto rounded-lg border border-amber-200 bg-amber-50 p-3 shadow-xl"
	style="left: {position.x}px; top: {position.y}px;"
>
	<div class="mb-3 flex items-center justify-between border-b border-amber-200 pb-2">
		<span class="font-scheherazade text-2xl" dir="rtl">{word.combined_arabic}</span>
		<button
			onclick={onClose}
			class="rounded p-1 text-amber-700 transition-colors hover:bg-amber-200 hover:text-amber-900"
		>
			<Icon icon="mdi:close" width="20" />
		</button>
	</div>

	<div class="space-y-3">
		{#each word.tokens as token}
			<div class="rounded border {getTokenColor(token.tag)} p-2">
				<div class="mb-2 flex items-center justify-between">
					<span class="rounded px-2 py-0.5 text-xs font-medium {getTokenColor(token.tag)}">
						{token.tag_name}
					</span>
					<div class="flex items-center gap-2">
						<span class="font-scheherazade text-xl" dir="rtl">{token.form_arabic}</span>
						<span class="text-xs text-gray-500">({token.form_buckwalter})</span>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
					{#if token.features.root}
						<div class="flex justify-between">
							<span class="font-medium text-gray-600">Root:</span>
							<span class="font-mono">{token.features.root}</span>
						</div>
					{/if}
					{#if token.features.lemma}
						<div class="flex justify-between">
							<span class="font-medium text-gray-600">Lemma:</span>
							<span class="font-mono">{token.features.lemma}</span>
						</div>
					{/if}
					{#if token.features.pos}
						<div class="flex justify-between">
							<span class="font-medium text-gray-600">POS:</span>
							<span>{token.features.pos}</span>
						</div>
					{/if}
					{#if token.features.gender}
						<div class="flex justify-between">
							<span class="font-medium text-gray-600">Gender:</span>
							<span>{token.features.gender}</span>
						</div>
					{/if}
					{#if token.features.number}
						<div class="flex justify-between">
							<span class="font-medium text-gray-600">Number:</span>
							<span>{token.features.number}</span>
						</div>
					{/if}
					{#if token.features.case_type}
						<div class="flex justify-between">
							<span class="font-medium text-gray-600">Case:</span>
							<span>{token.features.case_type}</span>
						</div>
					{/if}
					{#if token.features.person}
						<div class="flex justify-between">
							<span class="font-medium text-gray-600">Person:</span>
							<span>{token.features.person}</span>
						</div>
					{/if}
					{#if token.features.aspect}
						<div class="flex justify-between">
							<span class="font-medium text-gray-600">Aspect:</span>
							<span>{token.features.aspect}</span>
						</div>
					{/if}
					{#if token.features.voice}
						<div class="flex justify-between">
							<span class="font-medium text-gray-600">Voice:</span>
							<span>{token.features.voice}</span>
						</div>
					{/if}
					{#if token.features.mood}
						<div class="flex justify-between">
							<span class="font-medium text-gray-600">Mood:</span>
							<span>{token.features.mood}</span>
						</div>
					{/if}
					{#if token.features.state}
						<div class="flex justify-between">
							<span class="font-medium text-gray-600">State:</span>
							<span>{token.features.state}</span>
						</div>
					{/if}
					{#if token.features.derivation}
						<div class="flex justify-between">
							<span class="font-medium text-gray-600">Form:</span>
							<span>{token.features.derivation}</span>
						</div>
					{/if}
					{#if token.features.prefix_type}
						<div class="flex justify-between">
							<span class="font-medium text-gray-600">Prefix:</span>
							<span>{token.features.prefix_type}</span>
						</div>
					{/if}
					{#if token.features.suffix_type}
						<div class="flex justify-between">
							<span class="font-medium text-gray-600">Suffix:</span>
							<span>{token.features.suffix_type}</span>
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>
