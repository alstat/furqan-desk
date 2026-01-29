<script lang="ts">
	import ImportButton from './ImportButton.svelte';
	import ExportButton from './ExportButton.svelte';
	import ReadonlyButton from './ReadonlyButton.svelte';
	import RedoButton from './RedoButton.svelte';
	import UndoButton from './UndoButton.svelte';
</script>

<div class="absolute -top-11 flex flex-row justify-stretch">
	<div class="mr-4">
		<UndoButton />
		<RedoButton />
	</div>
	<div class="ml-4">
		<ImportButton />
		<ExportButton />
		<ReadonlyButton />
	</div>
</div>
