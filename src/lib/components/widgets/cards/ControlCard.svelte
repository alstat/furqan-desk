<script lang="ts">
	import { slide } from 'svelte/transition';

	let { cardTitle, cardBody } = $props();
</script>

<div
	in:slide={{ duration: 300 }}
	class="text-sm w-80 flex flex-col rounded-md border border-slate-200 bg-slate-100 bg-opacity-60 hover:bg-opacity-70 font-base text-amber-900 shadow-2xl backdrop-blur-sm"
>
	<div
		class="border-1 rounded-tl-md border border-l-0 border-r-0 border-t-0 border-slate-200 px-2 py-1"
	>
		<span class="italic">{cardTitle}</span>
	</div>
	{@render cardBody()}
</div>
