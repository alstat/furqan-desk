<script lang="ts">
	import type { Writable } from "svelte/store";
	import type { blockTypeToBlockName } from "./blockTypeToBlockName";
	import { getContext } from "svelte";
	import { getEditor } from "$lexical/core/composerContext";
	import { $getSelection as getSelection, $isRangeSelection as isRangeSelection } from "lexical";
    import { $setBlocksType as setBlocksType } from "@lexical/selection";
	import { $createCodeNode as createCodeNode } from "$lexical/core/plugins/CodeHighlighter/CodeNode";
	import DropDownItem from "$lexical/components/generic/dropdown/DropDownItem.svelte";

    const blockType: Writable<keyof typeof blockTypeToBlockName> = getContext('blockType');
    const editor = getEditor();

    const formatCode = () => {
        if ($blockType !== 'code') {
            editor.update(() => {
                let selection = getSelection();

                if (selection !== null) {
                    if (selection.isCollapsed()) {
                        // A selection is considered "collapsed" when the start and end points are at the same position - essentially when it's just a blinking cursor.
                        setBlocksType(selection, () => createCodeNode('', 'python'));
                    } else {
                        const textContent = selection.getTextContent();
                        const codeNode = createCodeNode(textContent, 'python');
                        selection.insertNodes([codeNode]);
                        selection = getSelection();
                        if (isRangeSelection(selection))
                            selection.insertRawText(textContent);
                    }
                }
            });
        }
    }
</script>

<DropDownItem
  class={'item ' + ($blockType === 'code' ? 'active dropdown-item-active' : '')}
  onclick={formatCode}>
  <i class="icon code"></i>
  <span class="text">Code Block</span>
</DropDownItem>