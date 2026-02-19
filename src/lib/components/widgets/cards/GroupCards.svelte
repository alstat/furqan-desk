<script lang="ts">
    import { fade, fly } from 'svelte/transition';
    import Icon from '@iconify/svelte';

    let { controlCard, collapsedIcon, xPosition = 'left', yPosition = 'bottom' } = $props();
    let isExpanded = $state(false);

    function toggleExpand() {
        isExpanded = !isExpanded;
    }

    const _ = ['sm:bottom-[27px]', 'sm:top-[27px]', 'sm:left-[10px]', 'sm:right-[10px]',
        'bottom-[10px]', 'top-[10px]', 'left-[10px]', 'right-[10px]'
    ];

    // Anchor the expanded panel to the correct corner of the fixed-size container
    const panelCorner = `${yPosition === 'bottom' ? 'bottom-0' : 'top-0'} ${xPosition === 'right' ? 'right-0' : 'left-0'}`;
    const panelAlign = xPosition === 'right' ? 'items-end' : 'items-start';
</script>

<!--
    Outer container is always exactly button-sized (h-10 w-10 = 40×40px).
    The expanded panel is absolutely positioned out of flow so it never
    changes the container's dimensions and causes the button to drift.
-->
<div class={`absolute ${yPosition}-[10px] ${xPosition}-[10px] sm:${yPosition}-[10px] sm:${xPosition}-[10px] z-20 h-10 w-10`}>

    {#if isExpanded}
        <div
            class={`absolute ${panelCorner} flex flex-col gap-2 ${panelAlign}`}
            transition:fly={{ y: 6, duration: 180, opacity: 0 }}
        >
            {@render controlCard()}
            <button
                onclick={toggleExpand}
                class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-md hover:bg-slate-50 hover:shadow-lg active:scale-95"
            >
                <Icon icon="charm:chevron-down" width="1rem" />
            </button>
        </div>
    {:else}
        <button
            in:fade={{ duration: 150 }}
            onclick={toggleExpand}
            class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl border border-slate-200 bg-white/90 text-slate-600 shadow-lg backdrop-blur-sm hover:bg-white hover:shadow-xl hover:scale-105 active:scale-95"
        >
            {@render collapsedIcon()}
        </button>
    {/if}
</div>
