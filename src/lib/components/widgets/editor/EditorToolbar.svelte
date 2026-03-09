<script lang="ts">
	import { slide, fade } from 'svelte/transition';
	import { BookMarked, ChevronDown, Settings2 } from 'lucide-svelte';
	import Icon from '@iconify/svelte';
	import ControlCard from '../cards/ControlCard.svelte';
	import GroupCards from '../cards/GroupCards.svelte';
	import ActionBar from '$lexical/components/actionbar/ActionBar.svelte';

</script>

{#snippet cardBody()}
    <div class="grid grid-cols-2 items-center space-x-1 p-4">
        <button class="cursor-pointer p-1 mb-2 bg-slate-400 rounded-md">Show Docs</button>
        <div></div>
        <div class="flex flex-col justify-items-center space-y-5">
            <div>Docs Width</div>
        </div>
        <div class="flex flex-col space-y-2">
            <div>Width</div>
        </div>
    </div>
{/snippet}

{#snippet collapsedIcon()}
	<Icon icon="solar:menu-dots-line-duotone" width="2em" />
{/snippet}

{#snippet controlCard()}
	<ControlCard cardTitle={'Analysis Controls'} {cardBody} />
{/snippet}

<GroupCards {controlCard} {collapsedIcon} xPosition={'left'} />
