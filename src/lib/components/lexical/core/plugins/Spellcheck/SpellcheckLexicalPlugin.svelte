<!--
  Spell checking for the Lexical rich-text editor.

  Underlines are drawn with the CSS Custom Highlight API (CSS.highlights): we
  build DOM Ranges for each misspelled word and register them under the
  `spell-error` highlight — no DOM mutation, and the underlines track scrolling
  and edits for free. Right-clicking a flagged word opens the shared suggestion
  menu; picking a suggestion splices the Lexical text node in place.
-->
<script lang="ts">
    import { onMount } from "svelte";
    import {
        $getNearestNodeFromDOMNode as getNearestNodeFromDOMNode,
        $isTextNode as isTextNode,
    } from "lexical";
    import { getEditor } from "$lexical/core/composerContext.js";
    import SpellSuggestionMenu from "$lib/components/editor/SpellSuggestionMenu.svelte";
    import {
        checkText,
        spellRevision,
        ignoreWord,
        ignoreWordAll,
        type Misspelling,
    } from "$lib/stores/spellcheck.store";

    const editor = getEditor();

    // A flagged word: the DOM text node it lives in plus its local offsets and
    // a live Range used both for the highlight and for hit-testing.
    type Flagged = {
        node: Text;
        start: number;
        end: number;
        word: string;
        range: Range;
    };
    let flagged: Flagged[] = [];

    let menu = $state<{ x: number; y: number; word: string; item: Flagged } | null>(
        null,
    );

    let timer: ReturnType<typeof setTimeout> | undefined;
    let seq = 0;

    const HIGHLIGHT_SUPPORTED =
        typeof CSS !== "undefined" && "highlights" in CSS;

    onMount(() => {
        const root = editor.getRootElement();
        // Edits get the typing debounce; language/ignore/fix changes re-check
        // right away so underlines clear or appear immediately.
        const unregister = editor.registerUpdateListener(() => schedule(400));
        const unsubRev = spellRevision.subscribe(() => schedule(0));
        root?.addEventListener("contextmenu", onContextMenu);
        return () => {
            clearTimeout(timer);
            seq++;
            unregister();
            unsubRev();
            root?.removeEventListener("contextmenu", onContextMenu);
            clearHighlight();
        };
    });

    function schedule(delay = 400) {
        clearTimeout(timer);
        timer = setTimeout(() => void recompute(), delay);
    }

    function clearHighlight() {
        if (HIGHLIGHT_SUPPORTED) CSS.highlights.delete("spell-error");
        flagged = [];
    }

    // Collect the editable text nodes under the root, skipping decorator
    // subtrees (code blocks, Quran, equations, images…) which render as
    // contenteditable="false".
    function collectTextNodes(root: HTMLElement): Text[] {
        const out: Text[] = [];
        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    let el = node.parentElement;
                    while (el && el !== root) {
                        if (el.contentEditable === "false")
                            return NodeFilter.FILTER_REJECT;
                        el = el.parentElement;
                    }
                    return (node.textContent ?? "").trim().length > 0
                        ? NodeFilter.FILTER_ACCEPT
                        : NodeFilter.FILTER_REJECT;
                },
            },
        );
        let n: Node | null;
        while ((n = walker.nextNode())) out.push(n as Text);
        return out;
    }

    async function recompute() {
        const mySeq = ++seq;
        const root = editor.getRootElement();
        if (!root || !HIGHLIGHT_SUPPORTED) return;

        const nodes = collectTextNodes(root);
        if (nodes.length === 0) {
            clearHighlight();
            return;
        }

        // Join all node texts with newline separators (a word boundary) so the
        // single spell-check call can't merge words across nodes. Track where
        // each node's text starts in the combined string.
        const segments: { node: Text; offset: number; length: number }[] = [];
        let combined = "";
        for (const node of nodes) {
            const text = node.textContent ?? "";
            segments.push({ node, offset: combined.length, length: text.length });
            combined += text + "\n";
        }

        const misspellings: Misspelling[] = await checkText(combined);
        if (mySeq !== seq) return; // superseded while awaiting

        const next: Flagged[] = [];
        for (const m of misspellings) {
            const seg = segments.find(
                (s) => m.start >= s.offset && m.end <= s.offset + s.length,
            );
            if (!seg) continue;
            const start = m.start - seg.offset;
            const end = m.end - seg.offset;
            try {
                const range = document.createRange();
                range.setStart(seg.node, start);
                range.setEnd(seg.node, end);
                next.push({ node: seg.node, start, end, word: m.word, range });
            } catch {
                /* node changed under us; skip */
            }
        }

        flagged = next;
        if (next.length === 0) {
            CSS.highlights.delete("spell-error");
            return;
        }
        CSS.highlights.set(
            "spell-error",
            new Highlight(...next.map((f) => f.range)),
        );
    }

    function onContextMenu(event: MouseEvent) {
        const hit = flagged.find((f) =>
            [...f.range.getClientRects()].some(
                (r) =>
                    event.clientX >= r.left &&
                    event.clientX <= r.right &&
                    event.clientY >= r.top &&
                    event.clientY <= r.bottom,
            ),
        );
        if (!hit) return;
        event.preventDefault();
        menu = { x: event.clientX, y: event.clientY, word: hit.word, item: hit };
    }

    function replace(suggestion: string) {
        const item = menu?.item;
        if (item) {
            editor.update(() => {
                const lexNode = getNearestNodeFromDOMNode(item.node);
                if (isTextNode(lexNode)) {
                    lexNode.spliceText(
                        item.start,
                        item.end - item.start,
                        suggestion,
                        true,
                    );
                }
            });
        }
        menu = null;
        schedule(0);
    }
</script>

{#if menu}
    <SpellSuggestionMenu
        x={menu.x}
        y={menu.y}
        word={menu.word}
        onReplace={replace}
        onIgnore={() => {
            if (menu) ignoreWord(menu.word);
            menu = null;
        }}
        onIgnoreAll={() => {
            if (menu) ignoreWordAll(menu.word);
            menu = null;
        }}
        onClose={() => (menu = null)}
    />
{/if}
