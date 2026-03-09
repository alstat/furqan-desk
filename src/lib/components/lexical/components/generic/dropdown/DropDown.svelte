<script lang="ts">
	import { run } from 'svelte/legacy';
	import Icon from '@iconify/svelte';
	import { icons, toolBarBtnStyle } from '$lib/data/toolbar/toolbar.js';
	import { CAN_USE_DOM } from '../../../environment/canUseDOM.js';
	import DropDownItems from './DropDownItems.svelte';
	import Portal from '../portal/Portal.svelte';

	interface Props {
		disabled?: boolean;
		buttonAriaLabel?: string | undefined;
		buttonClassName: string;
		buttonIconClassName?: string | undefined;
		buttonLabel?: string | undefined;
		stopCloseOnClickSelf?: boolean;
		title?: string | undefined;
		children?: import('svelte').Snippet;
	}

	let {
		disabled = false,
		buttonAriaLabel = undefined,
		buttonClassName,
		buttonIconClassName = undefined,
		buttonLabel = undefined,
		stopCloseOnClickSelf = false,
		title = undefined,
		children
	}: Props = $props();

	let dropDownRef = $state<HTMLDivElement | undefined>();
	let buttonRef: HTMLButtonElement;
	let showDropDown = $state(false);

	function handleClose() {
		showDropDown = false;
		if (buttonRef) {
			buttonRef.focus();
		}
	}

	run(() => {
		if (showDropDown && buttonRef && dropDownRef) {
			const { top, left } = buttonRef.getBoundingClientRect();
			dropDownRef.style.top = `${top + 34}px`;
			dropDownRef.style.left = `${Math.min(
				left,
				window.innerWidth - dropDownRef.offsetWidth - 20
			)}px`;
		}
	});

	const handle = (event: MouseEvent) => {
		const target = event.target;
		if (stopCloseOnClickSelf) {
			if (dropDownRef && dropDownRef.contains(target as Node)) return;
		}
		if (!buttonRef.contains(target as Node)) {
			showDropDown = false;
		}
	};

	run(() => {
		if (showDropDown) {
			document.addEventListener('click', handle);
		} else if (CAN_USE_DOM) {
			document.removeEventListener('click', handle);
		}
	});
</script>

<button
	type="button"
	{disabled}
	aria-label={buttonAriaLabel || buttonLabel}
	class={`${buttonClassName} overflow-hidden text-ellipsis text-nowrap text-center text-sm ${toolBarBtnStyle}`}
	onclick={() => (showDropDown = !showDropDown)}
	bind:this={buttonRef}
	{title}
>
	<!-- {#if buttonIconClassName}
		<span class={buttonIconClassName}></span>
	{/if} -->

	<div class="relative flex flex-row items-center">
		{#if buttonLabel}
			<div class="my-1 flex-1 px-2 font-sans text-xs font-medium">{buttonLabel}</div>
		{:else if buttonIconClassName}
			<div class="my-1 flex-1 mx-2 pr-2">
				<Icon icon={icons[buttonIconClassName as keyof typeof icons]} width=1rem/>
			</div>
		{/if}
		<div
			class="absolute right-0 bg-gradient-to-l from-brand-sand-50/80 via-brand-sand-50/80 to-transparent text-brand-charcoal-300 hover:from-brand-sand-100/80 hover:via-brand-sand-100/80 hover:to-transparent"
		>
			<Icon icon={icons['dropdown']} />
		</div>
	</div>
</button>

{#if showDropDown}
	<Portal>
		<DropDownItems bind:dropDownRef onClose={handleClose}>
			{@render children?.()}
		</DropDownItems>
	</Portal>
{/if}
