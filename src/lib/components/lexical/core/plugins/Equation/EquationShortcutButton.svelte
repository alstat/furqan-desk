<!-- ShortcutButton.svelte -->
<script lang="ts">
	import type { Key } from 'lucide-svelte';
    import { onMount, onDestroy } from 'svelte';

    // Props
    let { onTrigger, disabled=false } = $props()

    // Handle keyboard events
    function handleKeyPress(event: KeyboardEvent) {
        // Check for Ctrl+\ combination
        if (event.ctrlKey && event.key === '\\' && !disabled) {
            event.preventDefault();
            onTrigger();
        }
    }

    onMount(() => {
        // Add event listener when component mounts
        window.addEventListener('keydown', handleKeyPress);
    });

    // onDestroy(() => {
    //     // Remove event listener when component unmounts
    //     try {
    //         window.removeEventListener('keydown', handleKeyPress);
    //     } catch (e) {
    //         console.error(e);
    //     }
    // });
</script>