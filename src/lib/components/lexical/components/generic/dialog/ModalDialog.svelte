<script lang="ts">
	import { run, self, createBubbler, stopPropagation as stopPropagation_1 } from 'svelte/legacy';

	const bubble = createBubbler();
	interface Props {
		showModal: boolean;
		stopPropagation?: boolean;
		children?: import('svelte').Snippet;
	}

	let { showModal = $bindable(), stopPropagation = true, children }: Props = $props();

	let dialog: HTMLDialogElement | undefined = $state();

	run(() => {
		if (dialog) {
			if (showModal) {
				dialog.showModal();
			} else {
				dialog.close();
			}
		}
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={dialog}
	onclose={() => (showModal = false)}
	onclick={self(() => dialog!.close())}
	class="min-w-70 max-w-[90vw] max-h-[85vh] overflow-auto fixed m-auto p-2 inset-0 rounded-md border border-slate-200 bg-slate-50 bg-opacity-60 hover:bg-opacity-70 font-base text-amber-900 shadow-2xl backdrop-blur-sm"
>
	{#if stopPropagation}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div 
			onclick={stopPropagation_1(bubble('click'))}
			class="relative dark:text-gray-100 p-0"
		>
			{@render children?.()}
		</div>
	{:else}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div 
			onclick={bubble('click')}
			class="relative dark:text-gray-100 p-0"
		>
			{@render children?.()}
		</div>
	{/if}
</dialog>

<style>
	dialog {
		/* Centering styles */
		margin: 0;
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
	}

	/* Dark mode glass effect */
	:global(.dark) dialog {
		background: rgba(31, 41, 55, 0.95);
	}

	dialog::backdrop {
		background: rgba(0, 0, 0, 0.1);
		backdrop-filter: blur(4px);
	}

	/* Modern spring animation */
	dialog[open] {
		animation: zoom 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
		box-shadow: 
			0 0 0 1px rgba(0, 0, 0, 0.03),
			0 2px 4px rgba(0, 0, 0, 0.05),
			0 12px 24px rgba(0, 0, 0, 0.05);
	}

	/* Dark mode shadow */
	:global(.dark) dialog[open] {
		box-shadow: 
			0 0 0 1px rgba(255, 255, 255, 0.05),
			0 2px 4px rgba(0, 0, 0, 0.1),
			0 12px 24px rgba(0, 0, 0, 0.1);
	}

	@keyframes zoom {
		0% {
			opacity: 0;
			transform: translate(-50%, -45%) scale(0.95);
		}
		100% {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1);
		}
	}

	dialog[open]::backdrop {
		animation: fade 0.3s ease-out;
	}

	@keyframes fade {
		from {
			opacity: 0;
			backdrop-filter: blur(0);
		}
		to {
			opacity: 1;
			backdrop-filter: blur(4px);
		}
	}

	/* Scrollbar styling */
	dialog::-webkit-scrollbar {
		width: 8px;
		height: 8px;
	}

	dialog::-webkit-scrollbar-track {
		background: transparent;
	}

	dialog::-webkit-scrollbar-thumb {
		background: rgba(0, 0, 0, 0.2);
		border-radius: 4px;
	}

	:global(.dark) dialog::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.2);
	}

	dialog::-webkit-scrollbar-thumb:hover {
		background: rgba(0, 0, 0, 0.3);
	}

	:global(.dark) dialog::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.3);
	}
</style>