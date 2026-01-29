<script lang="ts">
	import { createBubbler } from 'svelte/legacy';

	const bubble = createBubbler();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<svg
	id="close"
	class="absolute right-1 top-1 h-4 w-4 cursor-pointer fill-slate-300 duration-75 hover:scale-110 hover:transition-transform"
	onclick={bubble('click')}
	viewBox="0 0 12 12"
>
	<circle cx="6" cy="6" r="6" />
	<line class="w-1 stroke-white" x1="3" y1="3" x2="9" y2="9" />
	<line class="w-1 stroke-white" x1="9" y1="3" x2="3" y2="9" />
</svg>