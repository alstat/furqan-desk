<!--
  Find & replace for the Lexical rich-text editor.

  Matches are located in the editor state (see findEngine.ts) and painted with
  the CSS Custom Highlight API — the same trick the spell checker uses — so no
  nodes are added to the document just to show a hit: the highlights survive
  scrolling and editing, and nothing has to be unwound when the panel closes.
  Replacing goes back through the model: the match's node keys and offsets
  become a RangeSelection, and `insertText` swaps it, which keeps formatting,
  undo history and cross-node matches (a bolded word mid-sentence) intact.

  Shortcuts, handled on the editor's root element so they only fire for this
  editor: ⌘F / Ctrl+F to find, ⌥⌘F / Ctrl+H to open with replace, ⌘G / ⇧⌘G to
  step through matches, Esc to close.
-->
<script module lang="ts">
    const HIGHLIGHT_ALL = "find-match";
    const HIGHLIGHT_CURRENT = "find-match-current";

    export const HIGHLIGHT_SUPPORTED =
        typeof CSS !== "undefined" && "highlights" in CSS;

    // CSS.highlights is a document-wide registry, but two editors can be on
    // screen at once (the cross-type split view), so instances publish their
    // ranges here and what lands in the registry is the union.
    type Published = { rest: Range[]; current: Range | null };
    const published = new Map<symbol, Published>();

    function setHighlight(name: string, ranges: Range[]) {
        if (ranges.length === 0) CSS.highlights.delete(name);
        else CSS.highlights.set(name, new Highlight(...ranges));
    }

    function publishRanges(
        token: symbol,
        rest: Range[],
        current: Range | null,
    ) {
        if (!HIGHLIGHT_SUPPORTED) return;
        if (rest.length === 0 && current === null) published.delete(token);
        else published.set(token, { rest, current });

        const all: Range[] = [];
        const actives: Range[] = [];
        for (const entry of published.values()) {
            all.push(...entry.rest);
            if (entry.current) actives.push(entry.current);
        }
        setHighlight(HIGHLIGHT_ALL, all);
        setHighlight(HIGHLIGHT_CURRENT, actives);
    }
</script>

<script lang="ts">
    import { onMount, tick, untrack } from "svelte";
    import { createDOMRange } from "@lexical/selection";
    import { IS_APPLE } from "@lexical/utils";
    import {
        $getNodeByKey as getNodeByKey,
        $getSelection as getSelection,
        $isRangeSelection as isRangeSelection,
        $isTextNode as isTextNode,
        SKIP_DOM_SELECTION_TAG,
    } from "lexical";
    import { getEditor } from "$lexical/core/composerContext.js";
    import { lexicalFindOpener } from "$lib/stores/editor.store";
    import FindReplacePanel from "./FindReplacePanel.svelte";
    import {
        $readSnapshot as readSnapshot,
        $replaceAll as replaceAllMatches,
        $replaceMatch as replaceMatch,
        findMatches,
        offsetOfPoint,
        MAX_MATCHES,
        type FindMatch,
    } from "./findEngine";

    const editor = getEditor();
    const token = Symbol("find-replace");

    let open = $state(false);
    let showReplace = $state(false);
    let query = $state("");
    let replacement = $state("");
    let caseSensitive = $state(false);
    let wholeWord = $state(false);
    let matches = $state<FindMatch[]>([]);
    let currentIndex = $state(0);
    let panel = $state<{
        focusQuery: () => void;
        focusReplace: () => void;
    } | null>(null);

    // Plain (non-reactive) bookkeeping: where the next recompute should place
    // the current match, expressed as an offset into the flattened text.
    let pendingAnchor: number | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    /** How long a pause in typing before matches are recomputed. */
    const EDIT_DEBOUNCE = 150;

    function schedule(delay: number, scrollToCurrent = false) {
        clearTimeout(timer);
        timer = setTimeout(() => recompute(scrollToCurrent), delay);
    }

    // Only the search inputs are dependencies here; recompute() runs from a
    // timeout, i.e. outside this effect, so its own reads stay untracked.
    $effect(() => {
        query;
        caseSensitive;
        wholeWord;
        open;
        untrack(() => schedule(0, true));
    });

    function recompute(scrollToCurrent: boolean) {
        if (!open || query === "") {
            matches = [];
            currentIndex = 0;
            publishRanges(token, [], null);
            return;
        }

        const snapshot = editor
            .getEditorState()
            .read(() => readSnapshot());
        const next = findMatches(snapshot, query, {
            caseSensitive,
            wholeWord,
        });

        // Hold position: after an edit or a replace, land on the first match at
        // or after where we were rather than jumping back to the top.
        const anchor = pendingAnchor ?? matches[currentIndex]?.from ?? 0;
        pendingAnchor = null;
        const found = next.findIndex((m) => m.from >= anchor);

        matches = next;
        currentIndex = found === -1 ? 0 : found;
        paint(scrollToCurrent);
    }

    /** Build DOM ranges for the current matches and hand them to the registry. */
    function paint(scrollToCurrent: boolean) {
        if (!HIGHLIGHT_SUPPORTED) return;
        if (!open || matches.length === 0) {
            publishRanges(token, [], null);
            return;
        }

        const rest: Range[] = [];
        // Held in an array rather than a `Range | null` local: it is only ever
        // assigned inside the callback below, which TypeScript's narrowing
        // would not see.
        const active: Range[] = [];

        editor.getEditorState().read(() => {
            matches.forEach((match, index) => {
                const anchorNode = getNodeByKey(match.anchorKey);
                const focusNode = getNodeByKey(match.focusKey);
                if (!isTextNode(anchorNode) || !isTextNode(focusNode)) return;
                const range = createDOMRange(
                    editor,
                    anchorNode,
                    match.anchorOffset,
                    focusNode,
                    match.focusOffset,
                );
                if (!range) return;
                // The active match is published on its own so its style wins
                // over the plain-match one.
                if (index === currentIndex) active.push(range);
                else rest.push(range);
            });
        });

        const current = active[0] ?? null;
        publishRanges(token, rest, current);
        if (scrollToCurrent && current) scrollRangeIntoView(current);
    }

    function scrollRangeIntoView(range: Range) {
        const scroller = editor.getRootElement();
        if (!scroller) return;
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        const box = scroller.getBoundingClientRect();
        // Keep clear of the panel, which floats over the top of the scroller.
        const topMargin = 72;
        const bottomMargin = 24;
        if (rect.top < box.top + topMargin) {
            scroller.scrollTop += rect.top - box.top - topMargin;
        } else if (rect.bottom > box.bottom - bottomMargin) {
            scroller.scrollTop += rect.bottom - box.bottom + bottomMargin;
        }
    }

    function goTo(index: number) {
        if (matches.length === 0) return;
        const size = matches.length;
        currentIndex = ((index % size) + size) % size;
        paint(true);
    }

    const next = () => goTo(currentIndex + 1);
    const previous = () => goTo(currentIndex - 1);

    function replaceCurrent() {
        const match = matches[currentIndex];
        if (!match || query === "") return;
        // Replacing moves the model's selection onto the new text; the skip tag
        // stops Lexical from pulling the DOM selection (and the caret's
        // scroll-into-view) along with it while you are typing in the panel.
        editor.update(
            () => {
                replaceMatch(match, replacement);
            },
            { tag: SKIP_DOM_SELECTION_TAG },
        );
        // Resume searching after the text we just inserted, so replacing "a"
        // with "aa" can't match its own output forever.
        pendingAnchor = match.from + replacement.length;
        schedule(0, true);
    }

    function replaceAll() {
        if (query === "" || matches.length === 0) return;
        // Re-scanned inside the update so it acts on the live state, not on the
        // (debounced) matches the panel happens to be showing.
        editor.update(
            () => {
                replaceAllMatches(query, replacement, {
                    caseSensitive,
                    wholeWord,
                });
            },
            { tag: SKIP_DOM_SELECTION_TAG },
        );
        pendingAnchor = 0;
        schedule(0, true);
    }

    /** Offset of the editor's caret, so ⌘F starts searching from where you are. */
    function caretOffset(): number | null {
        return editor.getEditorState().read(() => {
            const selection = getSelection();
            if (!isRangeSelection(selection)) return null;
            const point = selection.isBackward()
                ? selection.focus
                : selection.anchor;
            if (point.type !== "text") return null;
            return offsetOfPoint(readSnapshot(), point.key, point.offset);
        });
    }

    function selectedText(): string {
        return editor.getEditorState().read(() => {
            const selection = getSelection();
            if (!isRangeSelection(selection) || selection.isCollapsed())
                return "";
            const text = selection.getTextContent();
            // A multi-line selection is a range to search in, not a term.
            return text.includes("\n") ? "" : text;
        });
    }

    function openPanel(withReplace: boolean) {
        pendingAnchor = caretOffset();
        const seed = selectedText();
        if (seed) query = seed;
        if (withReplace) showReplace = true;
        open = true;
        void tick().then(() =>
            withReplace && query ? panel?.focusReplace() : panel?.focusQuery(),
        );
        schedule(0, true);
    }

    function closePanel() {
        open = false;
        matches = [];
        currentIndex = 0;
        publishRanges(token, [], null);
        editor.focus();
    }

    function onEditorKeydown(event: KeyboardEvent) {
        if (event.key === "Escape" && open) {
            event.preventDefault();
            closePanel();
            return;
        }
        if (!(event.metaKey || event.ctrlKey)) return;
        const key = event.key.toLowerCase();

        if (key === "f" && !event.shiftKey) {
            event.preventDefault();
            openPanel(event.altKey);
        } else if (key === "h" && !IS_APPLE) {
            // ⌘H hides the app on macOS, so replace is ⌥⌘F there instead.
            event.preventDefault();
            openPanel(true);
        } else if (key === "g" && open) {
            event.preventDefault();
            if (event.shiftKey) previous();
            else next();
        }
    }

    onMount(() => {
        // The action bar renders outside the Composer, so hand it a way in.
        const opener = (withReplace = false) => openPanel(withReplace);
        lexicalFindOpener.set(opener);

        const unregisterRoot = editor.registerRootListener(
            (rootElement, prevRootElement) => {
                prevRootElement?.removeEventListener(
                    "keydown",
                    onEditorKeydown,
                );
                rootElement?.addEventListener("keydown", onEditorKeydown);
            },
        );
        const unregisterUpdate = editor.registerUpdateListener(() => {
            if (open && query !== "") schedule(EDIT_DEBOUNCE);
        });

        return () => {
            clearTimeout(timer);
            // Another editor may have registered in the meantime (remount
            // races in the split view), so only retract our own opener.
            lexicalFindOpener.update((current) =>
                current === opener ? null : current,
            );
            unregisterRoot();
            unregisterUpdate();
            editor
                .getRootElement()
                ?.removeEventListener("keydown", onEditorKeydown);
            publishRanges(token, [], null);
        };
    });
</script>

{#if open}
    <FindReplacePanel
        bind:this={panel}
        bind:query
        bind:replacement
        bind:caseSensitive
        bind:wholeWord
        bind:showReplace
        total={matches.length}
        current={matches.length === 0 ? 0 : currentIndex + 1}
        capped={matches.length >= MAX_MATCHES}
        onNext={next}
        onPrev={previous}
        onReplace={replaceCurrent}
        onReplaceAll={replaceAll}
        onClose={closePanel}
    />
{/if}
