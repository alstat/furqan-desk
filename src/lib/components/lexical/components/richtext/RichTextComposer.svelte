<script lang="ts">
    import { ListItemNode, ListNode } from "@lexical/list";
    import { HeadingNode, QuoteNode } from "@lexical/rich-text";
    import type { EditorThemeClasses, LexicalEditor } from "lexical";

    import Composer from "$lexical/core/Composer.svelte";
    import ContentEditable from "$lexical/core/ContentEditable.svelte";
    import SharedHistoryPlugin from "$lexical/core/plugins/SharedHistoryPlugin.svelte";
    import { HorizontalRuleNode } from "$lexical/core/plugins/HorizontalRuleNode.js";
    import { ImageNode } from "$lexical/core/plugins/Image/ImageNode.js";
    import ImagePlugin from "$lexical/core/plugins/Image/ImagePlugin.svelte";
    import EquationPlugin from "$lexical/core/plugins/Equation/EquationPlugin.svelte";
    import ListPlugin from "$lexical/core/plugins/ListPlugin.svelte";
    import CheckListPlugin from "$lexical/core/plugins/CheckListPlugin.svelte";
    import HorizontalRulePlugin from "$lexical/core/plugins/HorizontalRulePlugin.svelte";
    import RichTextPlugin from "$lexical/core/plugins/RichTextPlugin.svelte";
    import ActionBar from "../actionbar/ActionBar.svelte";
    import ToolbarRichText from "./ToolbarRichText.svelte";
    import PlaceHolder from "$lexical/core/plugins/PlaceHolder.svelte";
    import AutoFocusPlugin from "$lexical/core/plugins/AutoFocusPlugin.svelte";
    import CaptionEditorHistoryPlugin from "$lexical/core/plugins/Image/CaptionEditorHistoryPlugin.svelte";
    import HistoryPlugin from "$lexical/core/plugins/HistoryPlugin.svelte";

    interface Props {
        theme: EditorThemeClasses;
    }

    let { theme }: Props = $props();

    let composer!: Composer;

    const initialConfig = $derived({
        namespace: "Playground",
        theme,
        nodes: [
            HeadingNode,
            ListNode,
            ListItemNode,
            HorizontalRuleNode,
            ImageNode,
        ],
        onError: (error: Error) => {
            throw error;
        },
    });

    export function getEditor(): LexicalEditor {
        return composer.getEditor();
    }
</script>

<Composer {initialConfig} bind:this={composer}>
    <div class="editor-shell p-2 relative overflow-visible">
        <ToolbarRichText />
        <div class="editor-container">
            <div class="editor-scroller">
                <div class="editor">
                    <ContentEditable />
                </div>
            </div>
            <RichTextPlugin />
            <HistoryPlugin />
            <ListPlugin />
            <CheckListPlugin />
            <HorizontalRulePlugin />
            <ImagePlugin />
            <EquationPlugin />
            <ActionBar />
        </div>
    </div>
</Composer>
