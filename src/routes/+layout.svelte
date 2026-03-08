<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import 'highlight.js/styles/github.css';

	let { children } = $props();
</script>

<div class="bg-gradient-radial overflow-hidden">
	{@render children()}
</div>

<style>

</style>
