<script lang="ts">
	import { run } from 'svelte/legacy';

	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { setRegisterItemFunc } from './utils.js';

	interface Props {
		onClose: () => void;
		dropDownRef: HTMLDivElement | undefined;
		children?: import('svelte').Snippet;
	}

	let { onClose, dropDownRef = $bindable(), children }: Props = $props();

	let items: Array<HTMLButtonElement> = [];
	let highlightedItem: HTMLButtonElement | null = $state(null);

	function registerItem(itemRef: HTMLButtonElement) {
		items.push(itemRef);
		items = items;
	}
	setRegisterItemFunc(registerItem);

	function handleKeyDown(event: KeyboardEvent) {
		if (!items) return;

		const key = event.key;

		if (['Escape', 'ArrowUp', 'ArrowDown', 'Tab'].includes(key)) {
			event.preventDefault();
		}

		if (key === 'Escape' || key === 'Tab') {
			onClose();
		} else if (key === 'ArrowUp') {
			if (highlightedItem === null) {
				highlightedItem = items[0];
			} else {
				const index = items.indexOf(highlightedItem) - 1;
				highlightedItem = items[index === -1 ? items.length - 1 : index];
			}
		} else if (key === 'ArrowDown') {
			if (highlightedItem === null) {
				highlightedItem = items[0];
			} else {
				const index = items.indexOf(highlightedItem) + 1;
				highlightedItem = items[index >= items.length ? 0 : index];
			}
		}
	}

	onMount(() => {
		if (!highlightedItem) {
			highlightedItem = items[0];
		}
	});

	run(() => {
		if (highlightedItem) {
			highlightedItem.focus();
		}
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	transition:fly={{ y: 8, duration: 180, opacity: 0 }}
	class="absolute z-10000 block w-auto rounded-xl p-3 border border-brand-sand-200 bg-brand-sand-50 bg-opacity-95 p-2 shadow-xl backdrop-blur-sm"
	bind:this={dropDownRef}
	onkeydown={handleKeyDown}
>
	{@render children?.()}
</div>
