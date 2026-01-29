<script lang="ts">
	interface Props {
		dataTestId?: string | undefined;
		label: string;
		placeholder?: string;
		value: string;
		id?: string;
		onChange?: ((value: string) => void) | undefined;
        onInput?: ((e: InputEvent & { currentTarget: HTMLTextAreaElement; }) => void) | undefined;
	}

	let {
		dataTestId = undefined,
		label,
		placeholder = '',
		value = $bindable(),
		id = '',
		onChange = undefined,
        onInput = undefined,
	}: Props = $props();
</script>

<div class="flex flex-col items-end">
	<textarea
		class="rounded-md bg-slate-100 shadow-inner border-slate-300 w-96"
        rows="4"
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
        oninput={(e: Event) => {
            if (onInput) {
                /* @ts-ignore TS not supported in Svelte Html */
                onInput(e);
            }
        }}
	></textarea>
</div>
