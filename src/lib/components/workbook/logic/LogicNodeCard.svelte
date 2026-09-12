<!-- The body of a proof card. Rendered inside WorkbookNodeCard's frame, so it
     inherits selection, dragging, resizing and z-order from the board and only
     owns what a proof card actually needs: the plain-language reading, the
     formal proposition, the rule chooser, and the status.

     The one rule this component exists to hold: it never shows a single
     true/false. A green tick here means Lean checked an inference; an amber
     badge means a human asserted something. Those are different claims and the
     card keeps them visually apart. -->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import type { WorkbookNode } from "$lib/stores/workbook.store";
    import type { LogicContext, LogicRole } from "$lib/stores/logic/graph";
    import { availableReferences, nodeProp, ruleDecomposition } from "$lib/stores/logic/graph";
    import { applicableRules, RULE_BY_ID, type RuleId } from "$lib/stores/logic/rules";
    import { printProp, tryParseProp } from "$lib/stores/logic/ir";
    import { STATUS_TONE, type NodeStatus } from "$lib/stores/logic/status";
    import type { LogicTheory } from "$lib/stores/logic/theory";

    interface Props {
        node: WorkbookNode;
        ctx: LogicContext;
        theory: LogicTheory | null;
        status: NodeStatus | null;
        messages: string[];
        onChange: (patch: Partial<WorkbookNode>) => void;
        /** Opens the Theory editor from a theory-root card. */
        onEditTheory: () => void;
        /** Creates goal cards for this rule's unfilled obligations. */
        onCreateGoals: () => void;
    }

    let { node, ctx, theory, status, messages, onChange, onEditTheory, onCreateGoals }: Props = $props();

    const logic = $derived(node.logic!);
    const role = $derived(logic.role as LogicRole);

    /** Names in scope here, so a goal under a `∀` can mention the arbitrary value. */
    const binders = $derived(ctx.bindersByNode.get(node.id) ?? []);

    const parsed = $derived(logic.source?.trim() ? tryParseProp(logic.source, binders) : null);
    const prop = $derived(nodeProp(node, ctx, binders));

    /** Rules whose shape fits this card's goal — offered, never auto-applied. */
    const rules = $derived.by(() => {
        if (role !== "rule") return [];
        const goalEdge = ctx.edges.find((e) => e.from === node.id && (e.fromPort ?? "out") === "out");
        const goalNode = goalEdge ? ctx.nodeById.get(goalEdge.to) : null;
        if (!goalNode) return [];
        const goal = nodeProp(goalNode, ctx, ctx.bindersByNode.get(goalNode.id) ?? []);
        return goal ? applicableRules(goal) : [];
    });

    const references = $derived(role === "rule" ? availableReferences(node.id, ctx) : []);
    const decomposition = $derived(role === "rule" ? ruleDecomposition(node, ctx) : null);

    const needsWitness = $derived(logic.rule === "exists_intro");
    const needsReference = $derived(
        !!logic.rule && (RULE_BY_ID.get(logic.rule)?.params.includes("reference") ?? false),
    );

    /** Obligations this rule created that still have nothing wired into them. */
    const unfilled = $derived.by(() => {
        if (!decomposition?.ok) return 0;
        return decomposition.decomposition.obligations.filter(
            (_, i) => !ctx.edges.some((e) => e.to === node.id && (e.toPort ?? "in") === `a${i}`),
        ).length;
    });

    const tone = $derived(status ? STATUS_TONE[status] : "grey");

    const TONE_CLASS: Record<string, string> = {
        green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
        amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
        blue: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
        red: "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200",
        grey: "bg-brand-sand-100 text-brand-charcoal-500 dark:bg-[#414559] dark:text-[#c6d0f5]",
    };

    function patchLogic(patch: Record<string, unknown>) {
        onChange({ logic: { ...logic, ...patch } });
    }
</script>

<div class="flex h-full flex-col gap-1.5 overflow-hidden text-[0.7rem]">
    <!-- Status first: what this card is claiming, before anything else. -->
    {#if status}
        <span
            class="inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] font-semibold {TONE_CLASS[
                tone
            ]}"
        >
            <Icon
                icon={status === "checked"
                    ? "solar:check-circle-bold"
                    : status === "assumed"
                      ? "solar:hand-shake-bold"
                      : status === "externally-supported"
                        ? "solar:book-bookmark-bold"
                        : status === "invalid"
                          ? "solar:close-circle-bold"
                          : status === "checking"
                            ? "solar:refresh-bold"
                            : "solar:hourglass-line-duotone"}
                width="0.7rem"
            />
            {$t(`logic.status.${status}`)}
        </span>
    {/if}

    {#if role === "theory-root"}
        <!-- The trust inventory has to be visible before a proof may start:
             a Theory is accepted, not proved. -->
        <div class="min-h-0 flex-1 overflow-auto">
            {#if theory}
                <p class="font-semibold text-brand-charcoal-700 dark:text-[#c6d0f5]">{theory.name}</p>
                <p class="text-brand-charcoal-400 dark:text-[#838ba7]">
                    {$t("logic.theory.revision")}
                    {theory.revision} · {theory.contentHash.slice(0, 8)}
                </p>
                <p class="mt-1 text-brand-charcoal-500 dark:text-[#a5adce]">
                    {$t("logic.theory.summary")
                        .replace("{vocab}", String(theory.vocabulary.length))
                        .replace(
                            "{axioms}",
                            String(theory.trustedDeclarations.filter((d) => d.kind === "axiom").length),
                        )}
                </p>
            {:else}
                <p class="text-brand-charcoal-400 dark:text-[#838ba7]">{$t("logic.theory.none")}</p>
            {/if}
        </div>
        <button
            onclick={onEditTheory}
            class="shrink-0 cursor-pointer rounded-lg bg-brand-sand-100 px-2 py-1 text-[0.65rem] font-semibold text-brand-charcoal-600 transition-colors hover:bg-brand-sand-200 dark:bg-[#414559] dark:text-[#c6d0f5] dark:hover:bg-[#51576d]"
        >
            {$t("logic.theory.edit")}
        </button>
    {:else if role === "rule"}
        <select
            value={logic.rule ?? ""}
            onchange={(e) => patchLogic({ rule: (e.currentTarget.value || undefined) as RuleId | undefined })}
            class="w-full shrink-0 rounded-lg border border-brand-sand-200 bg-white px-1.5 py-1 text-[0.7rem] dark:border-[#414559] dark:bg-[#303446] dark:text-[#c6d0f5]"
        >
            <option value="">{$t("logic.rule.choose")}</option>
            {#each rules as rule (rule.id)}
                <option value={rule.id}>{$t(rule.labelKey)}</option>
            {/each}
        </select>

        {#if needsReference}
            <select
                value={logic.referenceName ?? ""}
                onchange={(e) => patchLogic({ referenceName: e.currentTarget.value || undefined })}
                class="w-full shrink-0 rounded-lg border border-brand-sand-200 bg-white px-1.5 py-1 text-[0.7rem] dark:border-[#414559] dark:bg-[#303446] dark:text-[#c6d0f5]"
            >
                <option value="">{$t("logic.rule.choose_reference")}</option>
                {#each references as ref (ref.leanName)}
                    <option value={ref.leanName}>{ref.leanName}</option>
                {/each}
            </select>
        {/if}

        {#if needsWitness}
            <!-- The witness is typed by the user and by nobody else. An
                 existential goal stays blocked until they name the thing. -->
            <input
                value={logic.witness ?? ""}
                oninput={(e) => patchLogic({ witness: e.currentTarget.value })}
                placeholder={$t("logic.rule.witness_placeholder")}
                class="w-full shrink-0 rounded-lg border border-brand-sand-200 bg-white px-1.5 py-1 font-mono text-[0.7rem] dark:border-[#414559] dark:bg-[#303446] dark:text-[#c6d0f5]"
            />
        {/if}

        <div class="min-h-0 flex-1 overflow-auto">
            {#if decomposition && !decomposition.ok}
                <p class="text-rose-600 dark:text-rose-300">{decomposition.reason}</p>
            {:else if decomposition?.ok}
                <p class="text-brand-charcoal-400 dark:text-[#838ba7]">
                    {$t("logic.rule.creates").replace(
                        "{n}",
                        String(decomposition.decomposition.obligations.length),
                    )}
                </p>
                {#each decomposition.decomposition.obligations as ob (ob.key)}
                    <p class="truncate font-mono text-[0.65rem] text-brand-charcoal-600 dark:text-[#c6d0f5]">
                        · {printProp(ob.prop)}
                    </p>
                {/each}
            {/if}
        </div>
        {#if unfilled > 0}
            <!-- The obligations are already known; this just puts them on the
                 board. Each lands as an open goal proving nothing on its own. -->
            <button
                onclick={onCreateGoals}
                class="shrink-0 cursor-pointer rounded-lg bg-[#e8eef8] px-2 py-1 text-[0.65rem] font-semibold text-[#4a6592] transition-colors hover:bg-[#dae4f3] dark:bg-[#414559] dark:text-[#8caaee] dark:hover:bg-[#51576d]"
            >
                {$t("logic.rule.create_goals").replace("{n}", String(unfilled))}
            </button>
        {/if}
    {:else if role === "evidence"}
        <input
            value={logic.citation ?? ""}
            oninput={(e) => patchLogic({ citation: e.currentTarget.value })}
            placeholder={$t("logic.evidence.placeholder")}
            class="w-full shrink-0 rounded-lg border border-brand-sand-200 bg-white px-1.5 py-1 text-[0.7rem] dark:border-[#414559] dark:bg-[#303446] dark:text-[#c6d0f5]"
        />
        <p class="shrink-0 text-[0.625rem] text-sky-700 dark:text-sky-300">{$t("logic.evidence.note")}</p>
        <textarea
            value={logic.plainLanguage ?? ""}
            oninput={(e) => patchLogic({ plainLanguage: e.currentTarget.value })}
            placeholder={$t("logic.plain_placeholder")}
            class="min-h-0 flex-1 resize-none rounded-lg border border-brand-sand-200 bg-white px-1.5 py-1 text-[0.7rem] dark:border-[#414559] dark:bg-[#303446] dark:text-[#c6d0f5]"
        ></textarea>
    {:else if role === "imported-theorem"}
        <select
            value={logic.declarationId ?? ""}
            onchange={(e) => patchLogic({ declarationId: e.currentTarget.value || undefined })}
            class="w-full shrink-0 rounded-lg border border-brand-sand-200 bg-white px-1.5 py-1 text-[0.7rem] dark:border-[#414559] dark:bg-[#303446] dark:text-[#c6d0f5]"
        >
            <option value="">{$t("logic.import.choose")}</option>
            {#each theory?.trustedDeclarations ?? [] as decl (decl.id)}
                <option value={decl.id}>{decl.name}</option>
            {/each}
        </select>
        <div class="min-h-0 flex-1 overflow-auto font-mono text-[0.65rem] text-brand-charcoal-600 dark:text-[#c6d0f5]">
            {prop ? printProp(prop) : ""}
        </div>
    {:else if role === "custom-lean"}
        <p class="shrink-0 rounded-lg bg-amber-100 px-1.5 py-0.5 text-[0.625rem] font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
            {$t("logic.custom.warning")}
        </p>
        <textarea
            value={logic.leanOverride ?? ""}
            oninput={(e) => patchLogic({ leanOverride: e.currentTarget.value })}
            placeholder={$t("logic.custom.placeholder")}
            class="min-h-0 flex-1 resize-none rounded-lg border border-brand-sand-200 bg-white px-1.5 py-1 font-mono text-[0.7rem] dark:border-[#414559] dark:bg-[#303446] dark:text-[#c6d0f5]"
        ></textarea>
    {:else}
        <!-- goal / proof-root / premise: the proposition, in both registers. -->
        <input
            value={logic.plainLanguage ?? ""}
            oninput={(e) => patchLogic({ plainLanguage: e.currentTarget.value })}
            placeholder={$t("logic.plain_placeholder")}
            class="w-full shrink-0 rounded-lg border border-brand-sand-200 bg-white px-1.5 py-1 text-[0.7rem] dark:border-[#414559] dark:bg-[#303446] dark:text-[#c6d0f5]"
        />
        <textarea
            value={logic.source ?? ""}
            oninput={(e) => patchLogic({ source: e.currentTarget.value })}
            placeholder={$t("logic.source_placeholder")}
            spellcheck="false"
            class="min-h-0 flex-1 resize-none rounded-lg border border-brand-sand-200 bg-white px-1.5 py-1 font-mono text-[0.7rem] dark:border-[#414559] dark:bg-[#303446] dark:text-[#c6d0f5]"
        ></textarea>
        {#if parsed && !parsed.ok}
            <p class="shrink-0 truncate text-[0.625rem] text-rose-600 dark:text-rose-300">{parsed.error}</p>
        {:else if prop}
            <p class="shrink-0 truncate font-mono text-[0.625rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                {printProp(prop)}
            </p>
        {/if}
        {#if role === "premise"}
            <p class="shrink-0 text-[0.625rem] text-amber-700 dark:text-amber-300">{$t("logic.premise.note")}</p>
        {/if}
    {/if}

    {#if messages.length}
        <div class="max-h-12 shrink-0 overflow-auto text-[0.625rem] text-brand-charcoal-500 dark:text-[#a5adce]">
            {#each messages.slice(0, 4) as message, i (i)}
                <p class="truncate" title={message}>{message}</p>
            {/each}
        </div>
    {/if}
</div>
