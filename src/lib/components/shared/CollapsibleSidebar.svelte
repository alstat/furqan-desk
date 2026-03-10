<script lang="ts">
	import { slide } from 'svelte/transition';
	import { rotateSpring } from '$lib/stores/animation';
	import type { TransitionConfig } from 'svelte/transition';
	import { hideSurahPage, isSidebar, surahOrientation } from '$lib/stores/quran.svelte';
	import { typstMode } from '$lib/stores/editor.store';

	let { children } = $props();

	let sidebarWidth = $derived($isSidebar ? 'sm:w-full md:w-9/12 lg:w-6/12' : '');

	function toggleSidebar() {
		const opening = !$isSidebar;

		// Prevent both panels from being hidden at the same time:
		// if closing the sidebar while parchment is already hidden, reveal
		// the parchment instead so the user always sees content.
		if (!opening && $hideSurahPage()) {
			hideSurahPage.set(() => false);
		}

		$isSidebar = opening;
		rotateSpring.set(
			$surahOrientation() === 'flex-row-reverse'
				? (opening ? 180 : 0)
				: (opening ? 0 : 180)
		);
	}

	interface HorizontalSlideParams {
		duration?: number;
		direction?: 'left' | 'right';
	}

	function horizontalSlide(
		node: HTMLElement,
		{ duration = 300, direction = 'left' }: HorizontalSlideParams = {}
	): TransitionConfig {
		const style = getComputedStyle(node);
		const width = parseFloat(style.width);
		const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
		const margin = parseFloat(style.marginLeft) + parseFloat(style.marginRight);
		const initialWidth = width + padding + margin;

		return {
			duration,
			css: (t: number) => {
				const eased = t;
				return `
          overflow: hidden;
          width: ${eased * initialWidth}px;
          margin-left: ${direction === 'right' ? `${(1 - eased) * initialWidth}px` : '0'};
          transform-origin: ${direction === 'left' ? 'left' : 'right'};
        `;
			}
		};
	}
</script>

<div class={`relative flex justify-right overflow-visible font-base text-slate-900 ${sidebarWidth}`}>
	<button
		class={`${$hideSurahPage() ? 'hidden ' : ''} cursor-pointer absolute ${$surahOrientation() == 'flex-row-reverse' ? 'sm:-right-4 -right-10' : 'sm:-left-4 left-2'} top-4 z-3 rounded-full bg-amber-200 p-2 shadow-md transition-colors text-lime-700 hover:bg-amber-300 active:bg-amber-400`}
		onclick={toggleSidebar}
		aria-label={$isSidebar ? 'Collapse sidebar' : 'Expand sidebar'}
	>
		<svg
			class="h-4 w-4 transform transition-transform"
			style="transform: rotate({$rotateSpring}deg)"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<path d="M15 19l-7-7 7-7" />
		</svg>
	</button>
	<div class={$isSidebar ? `flex flex-row w-full` : `hidden`}>
		<!-- Sidebar Content -->
		<!-- {#if isOpen} -->
			<!-- <div
				transition:slide={{ duration: 300 }}
				class="vintage-scroll parchment space-y-2 overflow-auto bg-amber-50 p-4 text-xl leading-[2]"
			>
				{@render children()}
			</div> -->
			<div
				transition:horizontalSlide={{
					duration: 300,
					direction: $surahOrientation() == 'flex-row-reverse' ? 'right' : 'left'// or 'left' for left-to-right
				}}
				class="w-full space-y-2 overflow-visible bg-white px-1 pb-4 text-xl border border-stone-200 sm:shadow-xl sm:shadow-slate-200/60 {$hideSurahPage() && !$typstMode ? 'rounded-md' : 'rounded-l-md'}"
			>
				{@render children()}
			</div>
		<!-- {/if} -->
	</div>
</div>
