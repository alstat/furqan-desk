<script lang="ts">
	import { slide } from 'svelte/transition';
	import { rotateSpring } from '$lib/stores/animation';
	import type { TransitionConfig } from 'svelte/transition';
	import { hideSurahPage, isSidebar, surahOrientation } from '$lib/stores/quran.svelte';

	let { children } = $props();
	// State
	let isOpen = $state(false);
	let sidebarWidth = $state('');

	// Spring animation for the collapse icon

	function toggleSidebar() {
		$isSidebar = !$isSidebar;
		isOpen = !isOpen;
		rotateSpring.set(isOpen ? 180 : 0);
		if ($surahOrientation() == 'flex-row-reverse') {
			rotateSpring.set(isOpen ? 180 : 0);
		} else {
			rotateSpring.set(isOpen ? 0 : 180);
		}
		sidebarWidth = isOpen ? 'sm:w-full md:w-9/12 lg:w-6/12' : '';
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
		class={`${$hideSurahPage() ? 'hidden ' : ''} absolute ${$surahOrientation() == 'flex-row-reverse' ? 'sm:-right-4 -right-10' : 'sm:-left-4 left-2'} top-4 z-10 rounded-full bg-amber-200 p-2 shadow-md transition-colors text-lime-700 hover:bg-amber-300 active:bg-amber-400`}
		onclick={toggleSidebar}
		aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
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
	<div class={isOpen ? `flex flex-row w-full` : `hidden`}>
		<!-- Toggle Button -->

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
				class="w-full space-y-2 overflow-visible bg-white p-4 text-xl border border-stone-200 rounded-md"
			>
				{@render children()}
			</div>
		<!-- {/if} -->
	</div>
</div>
