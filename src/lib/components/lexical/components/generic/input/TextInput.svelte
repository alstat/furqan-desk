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
	<label class="font-sans text-sm" for={id}>{label}</label>
	<input
		type="text"
		class="rounded-md h-8 bg-slate-100 shadow-inner border-slate-300"
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
