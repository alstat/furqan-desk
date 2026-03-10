<script lang="ts">
    import { CodeNode } from "$lexical/core/plugins/CodeHighlighter/CodeNode";
    import CodePlugin from "$lexical/core/plugins/CodeHighlighter/CodePlugin.svelte";
    import { EquationNode } from "$lexical/core/plugins/Equation/EquationNode";
    import EquationPlugin from "$lexical/core/plugins/Equation/EquationPlugin.svelte";
    // import {
    // 	Composer,
    // 	ContentEditable,
    // 	ToolbarRichText,
    // 	ActionBar,
    // 	RichTextPlugin,
    // 	HistoryPlugin,
    // 	ListPlugin,
    // 	CheckListPlugin,
    // 	HorizontalRulePlugin,
    // 	ImagePlugin
    // } from 'svelte-lexical';
    import {
        Composer,
        ContentEditable,
        ToolbarRichText,
        RichTextPlugin,
        HistoryPlugin,
        ListPlugin,
        CheckListPlugin,
        HorizontalRulePlugin,
        ImagePlugin,
    } from "../lexical";
    import {
        HeadingNode,
        QuoteNode,
        ListNode,
        ListItemNode,
        HorizontalRuleNode,
        ImageNode,
    } from "../lexical";
    import { editorTheme as PlaygroundEditorTheme } from "../lexical";
    import {
        $getRoot as getRoot,
        $createTextNode as createTextNode,
        $createParagraphNode as createParagraphNode,
    } from "../lexical";

    import CaptionEditorHistoryPlugin from "$lexical/core/plugins/Image/CaptionEditorHistoryPlugin.svelte";
    import EditorStorePlugin from "./EditorStorePlugin.svelte";
    import { createEmptyHistoryState } from "@lexical/history";
    import { lexicalHistoryState } from "$lib/stores/editor.store";

    const historyState = createEmptyHistoryState();
    lexicalHistoryState.set(historyState);

    const initialConfig = {
        namespace: "Editor",
        theme: PlaygroundEditorTheme,
        nodes: [
            HeadingNode,
            ListNode,
            ListItemNode,
            QuoteNode,
            HorizontalRuleNode,
            ImageNode,
            EquationNode,
            CodeNode,
        ],
        onError: (error: Error) => {
            throw error;
        },
        editorState: () => {
            const root = getRoot();
            if (root.getFirstChild() === null) {
                const paragraph = createParagraphNode();
                root.append(paragraph);
            }
        },
    };
</script>

<Composer {initialConfig}>
    <div class="editor-shell p-2 relative overflow-visible">
        <ToolbarRichText />
        <div class="editor-container flex flex-col justify-stretch">
            <div class="editor-scroller">
                <div class="editor">
                    <ContentEditable />
                </div>
            </div>
            <RichTextPlugin />
            <HistoryPlugin externalHistoryState={historyState} />
            <ListPlugin />
            <CheckListPlugin />
            <HorizontalRulePlugin />
            <ImagePlugin>
                <CaptionEditorHistoryPlugin />
            </ImagePlugin>
            <EquationPlugin />
            <CodePlugin />
            <EditorStorePlugin />
        </div>
    </div>
</Composer>
