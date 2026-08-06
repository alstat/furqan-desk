<script lang="ts">
    import { get } from "svelte/store";
    import { EditorView } from "@codemirror/view";
    import { codeMirrorViewInstance } from "$lib/stores/editor.store";

    let { error }: { error: string } = $props();

    // Matches a `file.typ:line:col` location emitted by the Rust diagnostic
    // formatter (see format_typst_diagnostics), so we can turn it into a link.
    const LOCATION_RE = /([\w.\-\/\\ ]+?\.typ):(\d+):(\d+)/g;

    type Segment =
        | { kind: "text"; text: string }
        | { kind: "link"; text: string; line: number; col: number };

    let segments = $derived.by<Segment[]>(() => {
        const out: Segment[] = [];
        let last = 0;
        for (const m of error.matchAll(LOCATION_RE)) {
            const start = m.index ?? 0;
            if (start > last) {
                out.push({ kind: "text", text: error.slice(last, start) });
            }
            out.push({
                kind: "link",
                text: m[0],
                line: parseInt(m[2], 10),
                col: parseInt(m[3], 10),
            });
            last = start + m[0].length;
        }
        if (last < error.length) {
            out.push({ kind: "text", text: error.slice(last) });
        }
        return out;
    });

    // Move the editor cursor to the diagnostic's line/column and scroll it into
    // view. Only the currently focused file's editor is targeted — that is the
    // main source where the vast majority of Typst errors originate.
    function jumpTo(line: number, col: number): void {
        const view = get(codeMirrorViewInstance);
        if (!view || line < 1 || line > view.state.doc.lines) return;
        const docLine = view.state.doc.line(line);
        const pos = Math.min(docLine.from + Math.max(col - 1, 0), docLine.to);
        view.dispatch({
            selection: { anchor: pos },
            effects: EditorView.scrollIntoView(pos, { y: "center" }),
        });
        view.focus();
    }
</script>

<pre class="text-xs text-red-500 whitespace-pre-wrap">{#each segments as seg}{#if seg.kind === "link"}<button
            type="button"
            class="underline decoration-dotted underline-offset-2 hover:text-red-600 focus:outline-none cursor-pointer"
            title="Go to line {seg.line}"
            onclick={() => jumpTo(seg.line, seg.col)}>{seg.text}</button
        >{:else}{seg.text}{/if}{/each}</pre>
