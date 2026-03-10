<script lang="ts">
	import '../app.css';
	import 'highlight.js/styles/github.css';
	import { appDarkMode } from '$lib/stores/editor.store';

	let { children } = $props();

	$effect(() => {
		if ($appDarkMode) {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	});
</script>

<div class="bg-gradient-radial overflow-hidden">
	{@render children()}
</div>

<style>

</style>
