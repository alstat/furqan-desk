<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { getActiveEditor } from '$lexical/core/composerContext.js';
	import { INSERT_IMAGE_COMMAND } from '$lexical/core/plugins/Image/ImagePlugin.svelte';
	import TextInput from '../../generic/input/TextInput.svelte';

	const activeEditor = getActiveEditor();
	const dispatch = createEventDispatcher();

	let src = $state('');
	let altText = $state('');
	let isDisabled = $derived(src === '');
</script>

<div class="m-0">
	<div class="p-1">
        <h2 class="font-sans text-sm">Insert Image</h2>
    </div>
	<div class="flex flex-col p-4 border rounded-md">
		<TextInput
			label="Image URL"
			placeholder="link to image"
			bind:value={src}
			dataTestId="image-modal-url-input"
			id="lexical-modal-image-url"
            width="300px"
		/>
		<TextInput
			label="Alt Text"
			placeholder="random unsplash image"
			bind:value={altText}
			dataTestId="image-modal-alt-text-input"
			id="lexical-modal-image-alttext"
            width="300px"
		/>
		<div class="text-right">
			<button
				data-test-id="image-modal-confirm-btn"
				disabled={isDisabled}
				class="bg-slate-300 hover:bg-slate-400 active:text-white shadow-md active:shadow-none cursor-pointer rounded-md p-2 text-sm font-sans mt-5"
				onclick={() => {
                    console.log("image src: ", src);
					$activeEditor.dispatchCommand(INSERT_IMAGE_COMMAND, { altText, src });
					dispatch('confirm');
				}}
			>
				Confirm
			</button>
		</div>
	</div>
</div>
