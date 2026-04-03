<script lang="ts">
    import { slide } from 'svelte/transition';

    let { cardTitle, cardBody } = $props();
</script>

<div
    in:slide={{ duration: 200 }}
    class="w-72 overflow-hidden rounded-3xl border border-brand-sand-200/80 dark:border-[#414559] bg-white/95 dark:bg-[#303446] shadow-xl dark:shadow-black/40 backdrop-blur-md"
>
    <div class="border-b border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#292c3c] px-4 py-1.5 text-center">
        <span class="text-xs font-semibold uppercase tracking-widest text-brand-charcoal-300">{cardTitle}</span>
    </div>
    {@render cardBody()}
</div>
