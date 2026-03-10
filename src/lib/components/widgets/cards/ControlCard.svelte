<script lang="ts">
    import { slide } from 'svelte/transition';

    let { cardTitle, cardBody } = $props();
</script>

<div
    in:slide={{ duration: 200 }}
    class="w-72 overflow-hidden rounded-2xl border border-brand-sand-200/80 bg-white/95 dark:bg-[#303446] shadow-xl backdrop-blur-md"
>
    <div class="border-b border-brand-sand-200 bg-brand-sand-50 px-4 py-2.5">
        <span class="text-xs font-semibold uppercase tracking-widest text-brand-charcoal-300">{cardTitle}</span>
    </div>
    {@render cardBody()}
</div>
