<script lang="ts">
    import { slide } from 'svelte/transition';

    let { cardTitle, cardBody } = $props();
</script>

<div
    in:slide={{ duration: 200 }}
    class="w-72 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-xl backdrop-blur-md"
>
    <div class="border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
        <span class="text-xs font-semibold uppercase tracking-widest text-slate-400">{cardTitle}</span>
    </div>
    {@render cardBody()}
</div>
