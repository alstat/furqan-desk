<script lang="ts">
    import DropDownItem from '../../generic/dropdown/DropDownItem.svelte';
    import Icon from '@iconify/svelte';
    import { icons } from '$lib/data/toolbar/toolbar';

    let { onclick } = $props();
</script>

<DropDownItem {onclick} class="item">
    <div class="flex flex-row items-center w-32">
        <div class="pr-2"><Icon icon={icons['table']} width="1rem" /></div>
        <div>Table</div>
    </div>
</DropDownItem>
