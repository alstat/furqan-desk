<!-- Inline AI autocompletion for Lexical editors (Pro/Pro+ only).

     After a short typing pause it asks the chat-completion function to
     continue the text at the caret and shows the result as dimmed "ghost
     text" overlaid at the caret position. Tab accepts the suggestion,
     Escape (or any edit / caret move) dismisses it. Enabled from
     Settings → AI Tools → AI autocompletion. -->
<script lang="ts">
    import { onMount } from "svelte";
    import {
        $getSelection as getSelection,
        $isRangeSelection as isRangeSelection,
        $getRoot as getRoot,
        $isTextNode as isTextNode,
        $isElementNode as isElementNode,
        type LexicalNode,
        KEY_TAB_COMMAND,
        KEY_ESCAPE_COMMAND,
        COMMAND_PRIORITY_CRITICAL,
    } from "lexical";
    import { mergeRegister } from "@lexical/utils";
    import { $isCodeNode as isCodeNode } from "$lexical/core/plugins/CodeHighlighter/CodeNode";
    import { getEditor } from "$lexical/core/composerContext.js";
    import { isPro } from "$lib/stores/auth.store";
    import {
        aiAutocompleteActive,
        fetchAiCompletion,
    } from "$lib/stores/ai-autocomplete.store";

    const editor = getEditor();

    let ghost = $state<{
        text: string;
        x: number;
        y: number;
        maxWidth: number;
        font: string;
    } | null>(null);

    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    let requestId = 0;

    // Wait for a longer typing pause before requesting a completion — keeps the
    // request rate down (fewer 429s) while still feeling responsive.
    const DEBOUNCE_MS = 600;
    const MIN_PREFIX = 20;
    const PREFIX_CHARS = 2000;
    const SUFFIX_CHARS = 0;

    function clearGhost() {
        ghost = null;
        controller?.abort();
        controller = null;
    }

    function schedule() {
        if (timer) clearTimeout(timer);
        // Invalidate any in-flight stream so late chunks can't resurrect a
        // ghost that belongs to an outdated caret position.
        requestId++;
        clearGhost();
        if (!aiAutocompleteActive()) return;
        timer = setTimeout(run, DEBOUNCE_MS);
    }

    function editorHasFocus(): boolean {
        const root = editor.getRootElement();
        const active = document.activeElement;
        return !!root && (root === active || root.contains(active));
    }

    // Prefix/suffix of the document around the caret, flattened to plain text
    // (blocks joined with blank lines, like the document reads).
    function readContext(): { prefix: string; suffix: string; lineTail: string } | null {
        return editor.getEditorState().read(() => {
            const selection = getSelection();
            if (!isRangeSelection(selection) || !selection.isCollapsed()) return null;
            const anchor = selection.anchor;
            const node = anchor.getNode();
            const block = node.getTopLevelElement();
            if (!block) return null;

            // Caret offset within the block's text content. Walk every leaf in
            // document order — text nodes AND inline decorators — because some
            // decorators (e.g. citations) have non-empty getTextContent() that
            // is part of `blockText`. Summing only text nodes would undercount
            // the offset and make the end-of-block check misfire.
            const blockText = block.getTextContent();
            let offset = blockText.length;
            if (isTextNode(node)) {
                let acc = 0;
                let reached = false;
                const measure = (n: LexicalNode) => {
                    if (reached) return;
                    if (n.getKey() === node.getKey()) {
                        reached = true;
                        return;
                    }
                    if (isElementNode(n)) {
                        for (const child of n.getChildren()) {
                            measure(child);
                            if (reached) return;
                        }
                    } else {
                        acc += n.getTextContentSize();
                    }
                };
                for (const child of block.getChildren()) {
                    measure(child);
                    if (reached) break;
                }
                offset = acc + anchor.offset;
            }

            const before = blockText.slice(0, offset);
            const after = blockText.slice(offset);

            const children = getRoot().getChildren();
            const idx = children.findIndex((c) => c.getKey() === block.getKey());
            if (idx < 0) return null;
            // Render a sibling block to text for the model. Paragraphs,
            // headings, quotes, lists and tables expose their text via
            // getTextContent(); code blocks are decorator nodes whose text lives
            // in getCode(), so surface that (fenced, so the model treats it as
            // code) instead of dropping it. Other decorator blocks (Quran
            // verses, equations, images, …) return an empty string and are
            // dropped below — that avoids the blank-line runs that made the
            // model return no suggestion when a special block sat in the prefix.
            const blockToText = (n: LexicalNode): string => {
                if (isCodeNode(n)) {
                    const code = n.getCode() || "";
                    if (!code.trim()) return "";
                    return "```" + (n.getLanguage() || "") + "\n" + code + "\n```";
                }
                return n.getTextContent();
            };
            const joinText = (nodes: typeof children) =>
                nodes
                    .map(blockToText)
                    .filter((t) => t.trim() !== "")
                    .join("\n\n");
            const prev = joinText(children.slice(0, idx));
            const next = joinText(children.slice(idx + 1));

            // Collapse any remaining run of blank lines so a stray gap can't
            // confuse the completion.
            const prefix = ((prev ? prev + "\n\n" : "") + before)
                .replace(/\n{3,}/g, "\n\n")
                .slice(-PREFIX_CHARS);
            const suffix = (after + (next ? "\n\n" + next : "")).slice(0, SUFFIX_CHARS);
            return { prefix, suffix, lineTail: after };
        });
    }

    function caretPosition(): {
        x: number;
        y: number;
        maxWidth: number;
        font: string;
    } | null {
        const domSelection = window.getSelection();
        const root = editor.getRootElement();
        if (!domSelection || domSelection.rangeCount === 0 || !root) return null;
        if (!domSelection.isCollapsed) return null;
        const anchorNode = domSelection.anchorNode;
        if (!anchorNode || !root.contains(anchorNode)) return null;

        const range = domSelection.getRangeAt(0);
        let rect = range.getBoundingClientRect();
        const el =
            anchorNode instanceof HTMLElement
                ? anchorNode
                : anchorNode.parentElement;
        if ((rect.width === 0 && rect.height === 0 && rect.top === 0) || !rect) {
            // Collapsed caret in an empty block reports a zero rect; fall back
            // to the anchor element's box.
            if (!el) return null;
            rect = el.getBoundingClientRect();
        }
        if (!el) return null;

        // The overlay is fixed-positioned, so nothing clips it to the editor —
        // cap its width at the editor's right edge (it would otherwise run
        // over whatever sits beside the editor). Skip when the caret is so
        // close to the edge that no legible suggestion fits.
        const rootRect = root.getBoundingClientRect();
        const maxWidth = rootRect.right - rect.right - 8;
        if (maxWidth < 40) return null;

        const cs = getComputedStyle(el);
        const font = `font:${cs.font}; letter-spacing:${cs.letterSpacing}; line-height:${rect.height}px;`;
        return { x: rect.right, y: rect.top, maxWidth, font };
    }

    async function run() {
        if (!aiAutocompleteActive() || !editorHasFocus() || editor.isComposing()) return;
        const ctx = readContext();
        if (!ctx) return;
        // Only suggest at the end of a block (ignoring trailing whitespace).
        if (ctx.lineTail.trim() !== "") return;
        if (ctx.prefix.trim().length < MIN_PREFIX) return;

        controller = new AbortController();
        const id = ++requestId;
        // Stream the ghost in as chunks arrive instead of waiting for the
        // whole completion; the first tokens show almost immediately. The
        // caret box is measured once, on the first chunk.
        let box: { x: number; y: number; maxWidth: number; font: string } | null =
            null;
        const emit = (raw: string) => {
            if (id !== requestId || !editorHasFocus() || editor.isComposing()) return;
            // Lexical text nodes hold plain text — flatten newlines to spaces.
            const text = raw.replace(/\s*\n+\s*/g, " ").trimEnd();
            if (!text) return;
            box ??= caretPosition();
            if (!box) return;
            ghost = { text, ...box };
        };
        const raw = await fetchAiCompletion({
            prefix: ctx.prefix,
            suffix: ctx.suffix,
            language: "prose",
            signal: controller.signal,
            onPartial: emit,
        });
        emit(raw);
    }

    function acceptGhost(): boolean {
        const current = ghost;
        if (!current) return false;
        ghost = null;
        editor.update(() => {
            const selection = getSelection();
            if (isRangeSelection(selection) && selection.isCollapsed()) {
                selection.insertText(current.text);
            }
        });
        return true;
    }

    function onSelectionChange() {
        // Caret moves (without edits) also invalidate the ghost's position.
        schedule();
    }

    function onViewportChange() {
        // The overlay is fixed-positioned; scrolling/resizing desyncs it.
        if (timer) clearTimeout(timer);
        clearGhost();
    }

    onMount(() => {
        const unregister = mergeRegister(
            editor.registerUpdateListener(({ dirtyElements, dirtyLeaves, tags }) => {
                if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
                if (tags.has("history-merge")) return;
                schedule();
            }),
            editor.registerCommand(
                KEY_TAB_COMMAND,
                (event: KeyboardEvent) => {
                    if (!ghost) return false;
                    event.preventDefault();
                    return acceptGhost();
                },
                COMMAND_PRIORITY_CRITICAL,
            ),
            editor.registerCommand(
                KEY_ESCAPE_COMMAND,
                () => {
                    if (!ghost) return false;
                    clearGhost();
                    return true;
                },
                COMMAND_PRIORITY_CRITICAL,
            ),
        );
        document.addEventListener("selectionchange", onSelectionChange);
        window.addEventListener("scroll", onViewportChange, true);
        window.addEventListener("resize", onViewportChange);

        return () => {
            if (timer) clearTimeout(timer);
            controller?.abort();
            unregister();
            document.removeEventListener("selectionchange", onSelectionChange);
            window.removeEventListener("scroll", onViewportChange, true);
            window.removeEventListener("resize", onViewportChange);
        };
    });
</script>

{#if $isPro && ghost}
    <span
        aria-hidden="true"
        class="pointer-events-none fixed z-40 select-none overflow-hidden text-ellipsis whitespace-pre text-brand-charcoal-400 dark:text-[#737994] opacity-70"
        style="left:{ghost.x}px; top:{ghost.y}px; max-width:{ghost.maxWidth}px; {ghost.font}"
    >{ghost.text}</span>
{/if}
