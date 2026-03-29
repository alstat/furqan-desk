<script lang="ts">
    import { fade } from 'svelte/transition';
    import { cubicOut } from 'svelte/easing';
    import Icon from '@iconify/svelte';

    // Fade in first (first 50%), then fly up (last 50%)
    function fadeThenFly(node: Element, { y = 8, duration = 300 }: { y?: number; duration?: number } = {}) {
        return {
            duration,
            css: (t: number) => {
                const opacity = Math.min(t / 0.5, 1);
                const flyProgress = cubicOut(Math.max((t - 0.5) / 0.5, 0));
                return `opacity:${opacity}; transform:translateY(${y * (1 - flyProgress)}px);`;
            },
        };
    }

    let { controlCard, collapsedIcon, xPosition = 'left', yPosition = 'bottom', id = undefined } = $props();
    let isExpanded = $state(false);
    let container: HTMLElement | undefined = $state();

    function toggleExpand() {
        isExpanded = !isExpanded;
    }

    $effect(() => {
        if (!isExpanded) return;

        function handlePointerDown(e: PointerEvent) {
            if (container && !container.contains(e.target as Node)) {
                isExpanded = false;
            }
        }

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    });

    const _ = ['sm:bottom-6.75', 'sm:top-6.75', 'sm:left-2.5', 'sm:right-2.5',
        'bottom-2.5', 'top-2.5', 'left-2.5', 'right-2.5'
    ];

    // Anchor the expanded panel to the correct corner of the fixed-size container
    const panelCorner = $derived(`${yPosition === 'bottom' ? 'bottom-0' : 'top-0'} ${xPosition === 'right' ? 'right-0' : 'left-0'}`);
    const panelAlign = $derived(xPosition === 'right' ? 'items-end' : 'items-start');
</script>

<!--
    Outer container is always exactly button-sized (h-10 w-10 = 40×40px).
    The expanded panel is absolutely positioned out of flow so it never
    changes the container's dimensions and causes the button to drift.
-->
<div bind:this={container} {id} class={`absolute ${yPosition}-2.5 ${xPosition}-2.5 sm:${yPosition}-2.5 sm:${xPosition}-2.5 z-[60] h-10 w-10`}>

    {#if isExpanded}
        <div
            class={`absolute ${panelCorner} flex flex-col gap-2 ${panelAlign}`}
            in:fadeThenFly={{ duration: 300 }}
            out:fade={{ duration: 180 }}
        >
            {@render controlCard()}
            <button
                onclick={toggleExpand}
                class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl border border-brand-sand-200 bg-brand-sand-50 dark:bg-[#292c3c] text-brand-charcoal-500 shadow-md hover:bg-brand-sand-100 dark:hover:bg-[#414559] hover:shadow-lg active:scale-95"
            >
                <Icon icon="charm:chevron-down" width="1rem" />
            </button>
        </div>
    {:else}
        <button
            in:fade={{ duration: 150 }}
            onclick={toggleExpand}
            class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl border border-brand-sand-200 bg-brand-sand-50/90 dark:bg-[#292c3c] text-brand-gold-600 shadow-lg backdrop-blur-sm hover:bg-brand-sand-100 hover:shadow-xl hover:scale-105 active:scale-95"
        >
            {@render collapsedIcon()}
        </button>
    {/if}
</div>
