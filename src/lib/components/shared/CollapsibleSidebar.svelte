<script lang="ts">
	import { slide } from 'svelte/transition';
	import { rotateSpring } from '$lib/stores/animation';
	import type { TransitionConfig } from 'svelte/transition';
	import { hideSurahPage, isSidebar, surahOrientation } from '$lib/stores/quran.svelte';
	import { typstMode, juliaViewerOpen, juliaPlots } from '$lib/stores/editor.store';
	import FeedbackDialog from './FeedbackDialog.svelte';
	import DonationDialog from './DonationDialog.svelte';
	import Icon from '@iconify/svelte';
	import { donationOpen } from '$lib/stores/tour.store';
    import { actionBtnStyle } from '$lib/data/toolbar/toolbar';

	let feedbackOpen = $state(false);

	let { children, roundRight = true } = $props();

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

<div id="tour-sidebar" class={`relative flex justify-right overflow-visible font-base text-slate-900 dark:text-[#c6d0f5] ${sidebarWidth}`}>
	<!-- Sidebar toggle (top) -->
	<button
		class={`${$hideSurahPage() ? 'hidden ' : ''} cursor-pointer absolute ${$surahOrientation() == 'flex-row-reverse' ? 'sm:-right-4 -right-10' : 'sm:-left-4 left-2'} top-4 z-200 rounded-full bg-brand-gold-200 dark:bg-[#292c3c] p-2 shadow-md transition-colors text-brand-gold-600 dark:text-brand-gold-400 hover:bg-brand-gold-400 dark:hover:bg-[#363a4f] active:bg-brand-gold-500 dark:active:bg-[#414559]`}
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

	<!-- Julia Plot Viewer button -->
	<button
		class={`${$hideSurahPage() ? 'hidden ' : ''} ${actionBtnStyle} cursor-pointer absolute ${$surahOrientation() == 'flex-row-reverse' ? 'sm:-right-4 -right-10' : 'sm:-left-4 left-2'} bottom-26 z-3 rounded-full
		       ${$juliaViewerOpen ? 'bg-brand-gold-400 dark:bg-[#363a4f]' : ''}`}
		onclick={() => ($juliaViewerOpen = !$juliaViewerOpen)}
		aria-label="Julia Plot Viewer"
		title="Julia Plot Viewer"
	>
		<Icon icon="solar:chart-bold-duotone" class="h-4 w-4" />
		{#if $juliaPlots.length > 0}
			<span
				class="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center
				       rounded-full bg-brand-gold-500 dark:bg-[#e5c890] text-white dark:text-[#1a1d2e]
				       text-[8px] font-bold leading-none"
			>
				{$juliaPlots.length > 9 ? "9+" : $juliaPlots.length}
			</span>
		{/if}
	</button>

	<!-- Donation button (above feedback) -->
	<button
		class={`${$hideSurahPage() ? 'hidden ' : ''} ${actionBtnStyle} cursor-pointer absolute ${$surahOrientation() == 'flex-row-reverse' ? 'sm:-right-4 -right-10' : 'sm:-left-4 left-2'} bottom-15 z-3 `}
		onclick={() => ($donationOpen = true)}
		aria-label="Support AyahLab"
		title="Donate / Support"
	>
		<Icon icon="solar:heart-bold-duotone" class="h-4 w-4" />
	</button>

	<!-- Feedback button (bottom) — same strip as toggle, aligned vertically at bottom -->
	<button
		class={`${$hideSurahPage() ? 'hidden ' : ''} ${actionBtnStyle} cursor-pointer absolute ${$surahOrientation() == 'flex-row-reverse' ? 'sm:-right-4 -right-10' : 'sm:-left-4 left-2'} bottom-4 z-3 `}
		onclick={() => (feedbackOpen = true)}
		aria-label="Send feedback"
		title="Send feedback"
	>
		<Icon icon="solar:chat-round-dots-bold-duotone" class="h-4 w-4" />
	</button>

	<DonationDialog open={$donationOpen} onClose={() => ($donationOpen = false)} />
	<FeedbackDialog open={feedbackOpen} onClose={() => (feedbackOpen = false)} />

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
				class="w-full space-y-2 overflow-visible bg-white dark:bg-[#292c3c] px-1 pb-4 text-xl border border-stone-200 dark:border-[#414559] sm:shadow-xl sm:shadow-slate-200/60 dark:sm:shadow-black/40 {roundRight && $hideSurahPage() && !$typstMode ? 'rounded-md' : 'rounded-l-md'}"
			>
				{@render children()}
			</div>
		<!-- {/if} -->
	</div>
</div>
