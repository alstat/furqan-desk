<script lang="ts">
	interface Props {
		dataTestId?: string | undefined;
		label: string;
		placeholder?: string;
		value: string;
		id?: string;
		onChange?: ((value: string) => void) | undefined;
		width?: string | undefined;
	}

	let {
		dataTestId = undefined,
		label,
		placeholder = '',
		value = $bindable(),
		id = '',
		onChange = undefined,
		width = undefined
	}: Props = $props();
</script>

<div class="flex flex-row justify-end items-center space-x-4 py-2">
	<label class="font-sans text-xs font-semibold uppercase tracking-widest text-brand-charcoal-300" for={id}>{label}</label>
	<input
		type="text"
		class="rounded-xl h-8 border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 text-xs text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 transition-colors"
		style="width: {width};"
		{placeholder}
		bind:value
		data-test-id={dataTestId}
		{id}
		onchange={(e) => {
			if (onChange) {
				/* @ts-ignore TS not supported in Svelte Html */
				onChange(e.target.value);
			}
		}}
	/>
</div>
