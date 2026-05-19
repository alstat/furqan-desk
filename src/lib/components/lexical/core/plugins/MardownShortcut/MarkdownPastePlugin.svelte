<script lang="ts">
    import { onMount } from "svelte";
    import {
        $convertFromMarkdownString as convertFromMarkdownString,
        type Transformer,
    } from "@lexical/markdown";
    import {
        $getRoot as getRoot,
        $getSelection as getSelection,
        $isRangeSelection as isRangeSelection,
        $isTextNode as isTextNode,
        $isElementNode as isElementNode,
        $isDecoratorNode as isDecoratorNode,
        $createTextNode as createTextNode,
        $createParagraphNode as createParagraphNode,
        $getNodeByKey as getNodeByKey,
        $insertNodes as insertNodes,
        COMMAND_PRIORITY_LOW,
        PASTE_COMMAND,
        type LexicalNode,
    } from "lexical";
    import { $createCodeNode as createCodeNode } from "$lexical/core/plugins/CodeHighlighter/CodeNode.js";
    import { getEditor } from "$lexical/core/composerContext.js";

    interface Props {
        transformers: Array<Transformer>;
    }

    let { transformers }: Props = $props();

    const editor = getEditor();

    const MARKDOWN_HINT = /(^#{1,6}\s)|(\*\*)|(__)|(^[-*+]\s)|(^\d+\.\s)|(```)|(\\\()|(\\\[)|(^>\s)|(\$\$)/m;

    function looksLikeMarkdown(text: string): boolean {
        return MARKDOWN_HINT.test(text);
    }

    function htmlIsRich(html: string): boolean {
        // Strip wrapping <meta>/<html>/<body>/<head>; if anything beyond plain
        // span/div/br/p remains, treat as rich and let the default rich-paste
        // path handle it.
        const tagSet = new Set<string>();
        const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(html)) !== null) {
            tagSet.add(m[1].toLowerCase());
        }
        for (const t of tagSet) {
            if (
                t !== "meta" &&
                t !== "html" &&
                t !== "head" &&
                t !== "body" &&
                t !== "span" &&
                t !== "div" &&
                t !== "br" &&
                t !== "p"
            ) {
                return true;
            }
        }
        return false;
    }

    // Collapse multi-line block math delimiters to a single line so the
    // line-oriented ElementTransformer regex can match them.
    //   \[\n ... \n\]   →   \[ ... \]
    //   $$\n ... \n$$   →   $$ ... $$
    function collapseBlockMath(md: string): string {
        return md
            .replace(
                /\\\[\s*\n([\s\S]+?)\n\s*\\\]/g,
                (_m, inner) => `\\[ ${inner.replace(/\s*\n\s*/g, " ").trim()} \\]`,
            )
            .replace(
                /\$\$\s*\n([\s\S]+?)\n\s*\$\$/g,
                (_m, inner) => `$$ ${inner.replace(/\s*\n\s*/g, " ").trim()} $$`,
            );
    }

    // Extract fenced code blocks before markdown→Lexical conversion (the line-
    // oriented ElementTransformer for code blocks only sees opening fences and
    // would otherwise leave the body as plain paragraphs). Replace each block
    // with a unique placeholder paragraph; substitute back into CodeNodes
    // after parsing.
    const CODE_PLACEHOLDER_PREFIX = "@@LEXICAL_CODE_BLOCK_";
    const CODE_PLACEHOLDER_SUFFIX = "@@";

    function extractCodeBlocks(md: string): {
        text: string;
        blocks: { lang: string; code: string }[];
    } {
        const blocks: { lang: string; code: string }[] = [];
        const re = /^[ \t]*```([\w+-]*)\s*\n([\s\S]*?)\n[ \t]*```[ \t]*$/gm;
        const text = md.replace(re, (_m, lang: string, code: string) => {
            const idx = blocks.length;
            blocks.push({
                lang: lang || "javascript",
                code: code.replace(/\n+$/, ""),
            });
            return `${CODE_PLACEHOLDER_PREFIX}${idx}${CODE_PLACEHOLDER_SUFFIX}`;
        });
        return { text, blocks };
    }

    function substituteCodeBlocks(
        nodes: LexicalNode[],
        blocks: { lang: string; code: string }[],
    ): LexicalNode[] {
        if (blocks.length === 0) return nodes;
        const placeholderRe = new RegExp(
            `^${CODE_PLACEHOLDER_PREFIX}(\\d+)${CODE_PLACEHOLDER_SUFFIX}$`,
        );
        const out: LexicalNode[] = [];
        for (const node of nodes) {
            let replaced = false;
            if (isElementNode(node)) {
                const text = node.getTextContent().trim();
                const m = placeholderRe.exec(text);
                if (m) {
                    const idx = Number(m[1]);
                    const block = blocks[idx];
                    if (block) {
                        out.push(createCodeNode(block.code, block.lang));
                        replaced = true;
                    }
                }
            }
            if (!replaced) out.push(node);
        }
        return out;
    }

    // Decorator nodes (equations, images, horizontal rules) cannot hold a
    // caret, so when one is pasted at the edge of a paragraph — or as a
    // standalone block — there is no adjacent position to click into and
    // delete it from. Pad inline decorators with a space text node on each
    // bare side, and surround block-level decorators with empty paragraphs,
    // so the caret can always be placed next to pasted content.
    function padForNavigation(nodes: LexicalNode[]): LexicalNode[] {
        const padInlineDecorators = (element: LexicalNode): void => {
            if (!isElementNode(element)) return;
            for (const child of element.getChildren()) {
                if (isElementNode(child)) {
                    padInlineDecorators(child);
                } else if (isDecoratorNode(child)) {
                    if (!isTextNode(child.getPreviousSibling())) {
                        child.insertBefore(createTextNode(" "));
                    }
                    if (!isTextNode(child.getNextSibling())) {
                        child.insertAfter(createTextNode(" "));
                    }
                }
            }
        };

        const out: LexicalNode[] = [];
        for (const node of nodes) {
            if (isDecoratorNode(node)) {
                const prev = out[out.length - 1];
                if (!prev || isDecoratorNode(prev)) {
                    out.push(createParagraphNode());
                }
                out.push(node);
                out.push(createParagraphNode());
            } else {
                padInlineDecorators(node);
                out.push(node);
            }
        }
        return out;
    }

    function insertMarkdown(markdown: string): void {
        const sel = getSelection();
        let anchor:
            | { key: string; offset: number; type: "text" | "element" }
            | null = null;
        if (isRangeSelection(sel)) {
            anchor = {
                key: sel.anchor.key,
                offset: sel.anchor.offset,
                type: sel.anchor.type,
            };
        }

        const { text: codeStripped, blocks } = extractCodeBlocks(markdown);
        const preprocessed = collapseBlockMath(codeStripped);

        const root = getRoot();
        const original = root.getChildren();
        original.forEach((c) => c.remove());

        convertFromMarkdownString(preprocessed, transformers);

        let parsed = root.getChildren();
        parsed.forEach((c) => c.remove());
        original.forEach((c) => root.append(c));

        parsed = substituteCodeBlocks(parsed, blocks);
        parsed = padForNavigation(parsed);

        if (anchor) {
            const node = getNodeByKey(anchor.key);
            if (node && isTextNode(node)) {
                node.select(anchor.offset, anchor.offset);
            } else if (node && isElementNode(node)) {
                node.select(anchor.offset, anchor.offset);
            } else {
                root.selectEnd();
            }
        } else {
            root.selectEnd();
        }

        insertNodes(parsed);
    }

    function handlePaste(event: ClipboardEvent): boolean {
        const data = event.clipboardData;
        if (!data) return false;
        const text = data.getData("text/plain");
        if (!text) return false;

        const html = data.getData("text/html");
        if (html && htmlIsRich(html)) return false;

        if (!looksLikeMarkdown(text)) return false;

        event.preventDefault();
        editor.update(() => insertMarkdown(text));
        return true;
    }

    onMount(() => {
        return editor.registerCommand(
            PASTE_COMMAND,
            (event) => {
                if (!(event instanceof ClipboardEvent)) return false;
                return handlePaste(event);
            },
            COMMAND_PRIORITY_LOW,
        );
    });
</script>
