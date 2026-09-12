<!-- The generated module, shown to the reader.
     
     This is the audit surface. A proof tool that says "verified" while keeping
     the thing it verified hidden is asking to be taken on faith, which is the
     one thing this product is trying not to do. So: the exact source that was
     sent to Lean, the diagnostics against the lines that produced them, and —
     from Lean's own `#print axioms`, not our bookkeeping — what the result
     actually rests on.
     
     Read-only on purpose. The graph is the source of truth for this release;
     parsing edited Lean back into a graph is a separate piece of language
     engineering, and a panel that let you type here would quietly imply
     otherwise. -->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import { generateModule } from "$lib/stores/logic/codegen";
    import type { LogicComponent, LogicContext } from "$lib/stores/logic/graph";
    import type { LogicTheory } from "$lib/stores/logic/theory";
    import type { NodeDiagnostic, TrustReport } from "$lib/stores/logic/status";
    import { copyToClipboard } from "$lib/utils/clipboard";

    interface Props {
        open: boolean;
        components: LogicComponent[];
        ctx: LogicContext;
        theory: LogicTheory | null;
        /** Lean's answers for each proof root, when a check has run. */
        diagnosticsByRoot: Map<string, NodeDiagnostic[]>;
        trustByRoot: Map<string, TrustReport | null>;
        onClose: () => void;
        /** Clicking a line selects the card that produced it. */
        onSelectNode: (nodeId: string) => void;
    }

    let { open, components, ctx, theory, diagnosticsByRoot, trustByRoot, onClose, onSelectNode }: Props =
        $props();

    let selectedRoot = $state<string | null>(null);
    const activeRoot = $derived(selectedRoot ?? components[0]?.rootId ?? null);
    const component = $derived(components.find((c) => c.rootId === activeRoot) ?? null);

    // Regenerated from the live graph rather than read off the last run, so the
    // panel always shows the Lean the *current* board would produce — including
    // before anything has been verified.
    const module = $derived(component ? generateModule(component, ctx, theory) : null);

    const diagnostics = $derived(activeRoot ? (diagnosticsByRoot.get(activeRoot) ?? []) : []);
    const trust = $derived(activeRoot ? (trustByRoot.get(activeRoot) ?? null) : null);

    /** Line number → the worst diagnostic on it, for the gutter. */
    const bySeverity = $derived.by(() => {
        const map = new Map<number, "error" | "warning" | "info">();
        for (const d of diagnostics) {
            const current = map.get(d.line);
            if (current === "error") continue;
            if (current === "warning" && d.severity !== "error") continue;
            map.set(d.line, d.severity);
        }
        return map;
    });

    const lines = $derived(module?.source.split("\n") ?? []);

    /** The card a given line belongs to, from the source map. */
    function ownerOf(line: number): string | null {
        if (!module) return null;
        let best: { line: number; nodeId: string } | null = null;
        for (const entry of module.sourceMap) {
            if (entry.line <= line && (!best || entry.line > best.line)) best = entry;
        }
        return best?.nodeId ?? null;
    }

    let copied = $state(false);
    async function copy() {
        if (!module) return;
        copied = await copyToClipboard(module.source);
        setTimeout(() => (copied = false), 1500);
    }
</script>

{#if open}
    <div class="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-6">
        <div class="flex h-full max-h-[46rem] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#303446]">
            <header class="flex shrink-0 items-center gap-3 border-b border-brand-sand-200 px-5 py-3 dark:border-[#414559]">
                <Icon icon="vscode-icons:file-type-light-lean" width="1.1rem" />
                <h2 class="text-sm font-semibold text-brand-charcoal-700 dark:text-[#c6d0f5]">
                    {$t("logic.source.title")}
                </h2>
                {#if components.length > 1}
                    <select
                        value={activeRoot ?? ""}
                        onchange={(e) => (selectedRoot = e.currentTarget.value)}
                        class="rounded-lg border border-brand-sand-200 bg-white px-2 py-1 text-xs dark:border-[#414559] dark:bg-[#292c3c] dark:text-[#c6d0f5]"
                    >
                        {#each components as c (c.rootId)}
                            <option value={c.rootId}>
                                {ctx.nodeById.get(c.rootId)?.logic?.plainLanguage?.trim() ||
                                    ctx.nodeById.get(c.rootId)?.logic?.source ||
                                    c.rootId.slice(0, 8)}
                            </option>
                        {/each}
                    </select>
                {/if}
                <span class="ml-auto"></span>
                <button
                    onclick={copy}
                    class="cursor-pointer rounded-lg bg-brand-sand-100 px-2.5 py-1 text-[0.7rem] font-semibold text-brand-charcoal-600 transition-colors hover:bg-brand-sand-200 dark:bg-[#414559] dark:text-[#c6d0f5] dark:hover:bg-[#51576d]"
                >
                    {copied ? $t("logic.source.copied") : $t("logic.source.copy")}
                </button>
                <button
                    onclick={onClose}
                    aria-label={$t("common.close")}
                    class="cursor-pointer rounded-lg p-1 text-brand-charcoal-400 hover:bg-brand-sand-100 dark:hover:bg-[#414559]"
                >
                    <Icon icon="solar:close-circle-bold-duotone" width="1.1rem" />
                </button>
            </header>

            <div class="flex min-h-0 flex-1">
                <!-- The source. Every line is clickable: it selects the card
                     that produced it, which is the same mapping diagnostics
                     travel back along. -->
                <div class="min-h-0 flex-1 overflow-auto bg-brand-sand-50/50 font-mono text-[0.7rem] leading-[1.5rem] dark:bg-[#292c3c]">
                    {#each lines as line, i (i)}
                        {@const lineNo = i + 1}
                        {@const severity = bySeverity.get(lineNo)}
                        {@const owner = ownerOf(lineNo)}
                        <button
                            onclick={() => owner && onSelectNode(owner)}
                            class="flex w-full cursor-pointer items-start gap-3 px-4 text-left transition-colors hover:bg-brand-sand-100 dark:hover:bg-[#363a4f] {severity ===
                            'error'
                                ? 'bg-rose-50 dark:bg-rose-900/20'
                                : severity === 'warning'
                                  ? 'bg-amber-50 dark:bg-amber-900/20'
                                  : ''}"
                        >
                            <span class="w-8 shrink-0 select-none text-right text-brand-charcoal-300 dark:text-[#626880]">
                                {lineNo}
                            </span>
                            <span
                                class="whitespace-pre {line.trimStart().startsWith('--')
                                    ? 'text-brand-charcoal-300 dark:text-[#737994]'
                                    : 'text-brand-charcoal-700 dark:text-[#c6d0f5]'}">{line || " "}</span
                            >
                        </button>
                    {/each}
                </div>

                <!-- What it rests on. -->
                <aside class="w-72 shrink-0 overflow-auto border-l border-brand-sand-200 px-4 py-4 dark:border-[#414559]">
                    <h3 class="text-[0.7rem] font-bold uppercase tracking-wide text-brand-charcoal-400 dark:text-[#838ba7]">
                        {$t("logic.source.rests_on")}
                    </h3>

                    {#if !trust}
                        <p class="mt-2 text-[0.7rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                            {$t("logic.source.not_checked")}
                        </p>
                    {:else}
                        {#if trust.usesSorry}
                            <p class="mt-2 rounded-lg bg-amber-100 px-2 py-1.5 text-[0.7rem] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                                {$t("logic.source.has_gap")}
                            </p>
                        {:else}
                            <p class="mt-2 rounded-lg bg-emerald-100 px-2 py-1.5 text-[0.7rem] font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                                {$t("logic.source.no_gap")}
                            </p>
                        {/if}
                        {#if trust.authorAxioms.length}
                            <p class="mt-3 text-[0.7rem] text-brand-charcoal-500 dark:text-[#a5adce]">
                                {$t("logic.source.author_axioms")}
                            </p>
                            <ul class="mt-1 space-y-0.5">
                                {#each trust.authorAxioms as axiom (axiom)}
                                    <li class="truncate font-mono text-[0.65rem] text-amber-700 dark:text-amber-300">
                                        {axiom}
                                    </li>
                                {/each}
                            </ul>
                        {/if}
                    {/if}

                    {#if module}
                        <p class="mt-4 text-[0.7rem] text-brand-charcoal-500 dark:text-[#a5adce]">
                            {$t("logic.source.premises").replace("{n}", String(module.premiseIds.length))}
                        </p>
                        {#if module.openGoals.length}
                            <p class="mt-1 text-[0.7rem] text-brand-charcoal-500 dark:text-[#a5adce]">
                                {$t("logic.source.open_goals").replace("{n}", String(module.openGoals.length))}
                            </p>
                        {/if}
                    {/if}

                    {#if diagnostics.length}
                        <h3 class="mt-5 text-[0.7rem] font-bold uppercase tracking-wide text-brand-charcoal-400 dark:text-[#838ba7]">
                            {$t("logic.source.diagnostics")}
                        </h3>
                        <ul class="mt-1.5 space-y-1.5">
                            {#each diagnostics as diag, i (i)}
                                <li>
                                    <button
                                        onclick={() => onSelectNode(diag.nodeId)}
                                        class="w-full cursor-pointer text-left text-[0.65rem] {diag.severity ===
                                        'error'
                                            ? 'text-rose-600 dark:text-rose-300'
                                            : 'text-amber-600 dark:text-amber-300'}"
                                    >
                                        <span class="font-mono">{diag.line}</span> · {diag.message}
                                    </button>
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </aside>
            </div>

            <footer class="shrink-0 border-t border-brand-sand-200 px-5 py-2.5 dark:border-[#414559]">
                <p class="text-[0.7rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                    {$t("logic.source.readonly")}
                </p>
            </footer>
        </div>
    </div>
{/if}
