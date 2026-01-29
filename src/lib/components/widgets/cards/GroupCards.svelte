<script lang="ts">
    import { scale, fade } from 'svelte/transition';
    import Icon from '@iconify/svelte';

    let { controlCard, collapsedIcon, xPosition = 'left', yPosition = 'bottom' } = $props();
    let isExpanded = $state(false);

    function toggleExpand() {
        console.log('you clicked')
        isExpanded = !isExpanded
    }

    const _ = ['sm:bottom-[27px]', 'sm:top-[27px]', 'sm:left-[10px]', 'sm:right-[10px]',
        'bottom-[10px]', 'top-[10px]', 'left-[10px]', 'right-[10px]'
    ]
</script>

<div class={`absolute ${yPosition}-[10px] ${xPosition}-[10px] sm:${yPosition}-[10px] sm:${xPosition}-[10px] z-20`}>
	{#if isExpanded}
        <div class={xPosition == 'left' ? `flex flex-col items-start`: `flex flex-col items-end`}>
            {@render controlCard()}
            <div>
                <button onclick={toggleExpand} class="rounded-full bg-white bg-opacity-80 text-lime-700 p-2 shadow-md mt-2 transition-colors hover:bg-amber-100">
                    <Icon icon="charm:chevron-down" width=1.5em/>
                </button>
            </div>
        </div>
	{:else}
		<div in:scale={{ duration: 200 }}>
			<button
				onclick={toggleExpand}
				class="rounded-full bg-white text-lime-700 bg-opacity-80 shadow-md p-2 transition-colors hover:bg-amber-100"
			>
				{@render collapsedIcon()}
			</button>
		</div>
	{/if}
</div>
