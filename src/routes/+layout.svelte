<script lang="ts">
	import '../app.css';
	import 'highlight.js/styles/github.css';
	import '$lib/icons';
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

<div class="bg-gradient-radial h-screen overflow-hidden">
	{@render children()}
</div>

<style>

</style>
