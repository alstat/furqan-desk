<script>
	export let checked = false;
	export let label = '';
	export let disabled = false;
</script>

<label class="toggle">
	<input type="checkbox" bind:checked {disabled} onchange={(e) => console.log('Toggle changed:', disabled)} />
	<span class="track">
		<span class="thumb"></span>
	</span>
	{#if label}
		<span class="label">{label}</span>
	{/if}
</label>
