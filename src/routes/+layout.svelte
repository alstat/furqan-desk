<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import 'highlight.js/styles/github.css';

	let { children } = $props();
</script>

<div class="bg-gradient-radial">
	{@render children()}
</div>

<style>
	.bg-gradient-radial {
        /* background: radial-gradient(
            circle at center,
            #bc5312 0%,
            #9d440d 50%,
            #733007 100%
        );
		 */
		background-image:
		radial-gradient(closest-side, transparent 0%, transparent 75%, hsla(73, 50%, 60%, 0.03) 76%, hsla(73, 50%, 60%, 0.03) 85%, hsla(90, 100%, 93%, 0.03) 86%, hsla(90, 100%, 93%, 0.03) 94%, hsla(0, 0%, 100%, 0.03) 95%, hsla(0, 0%, 100%, 0.03) 103%, hsla(72, 56%, 78%, 0.03) 104%, hsla(72, 56%, 78%, 0.03) 112%, hsla(74, 40%, 39%, 0.03) 113%, hsla(74, 40%, 39%, 0.03) 121%, hsla(0, 0%, 100%, 0.03) 122%, hsla(0, 0%, 100%, 0.03) 130%, hsla(92, 31%, 88%, 0.03) 131%, hsla(92, 31%, 88%, 0.03) 140%),
		radial-gradient(closest-side, transparent 0%, transparent 75%, hsla(73, 50%, 60%, 0.03) 76%, hsla(73, 50%, 60%, 0.03) 85%, hsla(90, 100%, 93%, 0.03) 86%, hsla(90, 100%, 93%, 0.03) 94%, hsla(0, 0%, 100%, 0.03) 95%, hsla(0, 0%, 100%, 0.03) 103%, hsla(72, 56%, 78%, 0.03) 104%, hsla(72, 56%, 78%, 0.03) 112%, hsla(74, 40%, 39%, 0.03) 113%, hsla(74, 40%, 39%, 0.03) 121%, hsla(0, 0%, 100%, 0.03) 122%, hsla(0, 0%, 100%, 0.03) 130%, hsla(92, 31%, 88%, 0.03) 131%, hsla(92, 31%, 88%, 0.03) 140%);
		background-size: 110px 110px;
		background-color: rgb(246, 246, 246);
		background-position: 0 0, 55px 55px;
    }
</style>