<script lang="ts">
	import type { Writable } from "svelte/store";
	import type { blockTypeToBlockName } from "./blockTypeToBlockName";
	import { getContext } from "svelte";
	import { getActiveEditor } from "$lexical/core/composerContext";
	import { INSERT_CODE_COMMAND } from "$lexical/core/plugins/CodeHighlighter/CodePlugin.svelte";
	import DropDownItem from "$lexical/components/generic/dropdown/DropDownItem.svelte";

    const blockType: Writable<keyof typeof blockTypeToBlockName> = getContext('blockType');
    const activeEditor = getActiveEditor();

    const formatCode = () => {
        if ($blockType !== 'code') {
            $activeEditor.dispatchCommand(INSERT_CODE_COMMAND, { code: '', language: 'python' });
        }
    }
</script>

<DropDownItem
  class={'item ' + ($blockType === 'code' ? 'active dropdown-item-active' : '')}
  onclick={formatCode}>
  <i class="icon code"></i>
  <span class="text">Code Block</span>
</DropDownItem>