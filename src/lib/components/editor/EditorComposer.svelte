<script>
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
        ActionBar,
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

    const initialConfig = {
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
        onError: (error) => {
            throw error;
        },
        editorState: () => {
            const root = getRoot();
            if (root.getFirstChild() === null) {
                const paragraph = createParagraphNode();
                paragraph.append(
                    createTextNode(
                        "This demo environment is built with This demo environment is built with This demo environment is built with This demo environment is built with This demo environment is built with This demo environment is built with This demo environment is built with This demo environment is built with This demo environment is built with This demo environment is built with This demo environment is built with This demo environment is built with This demo environment is built with ",
                    ),
                    // createTextNode('svelte-lexical').toggleFormat('code'),
                    createTextNode("."),
                    createTextNode(" Try typing in "),
                    createTextNode("some text").toggleFormat("bold"),
                    createTextNode(" with "),
                    createTextNode("different").toggleFormat("italic"),
                    createTextNode(" formats."),
                );
                root.append(paragraph);
            }
        },
    };
</script>

<Composer {initialConfig}>
    <div class="editor-shell p-2">
        <ToolbarRichText />
        <div class="editor-container flex flex-col justify-stretch">
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
            <ImagePlugin>
                <CaptionEditorHistoryPlugin />
            </ImagePlugin>
            <EquationPlugin />
            <CodePlugin />
        </div>
    </div>
</Composer>
