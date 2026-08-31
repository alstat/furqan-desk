<!-- One card on the workbook board. Every kind shares the same frame — header,
     drag handle, resize corner — and differs only in what it puts inside, so
     adding a kind is a case in one switch rather than another component with
     its own idea of what a card looks like. -->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import VerseRefBadge from "$lib/components/arabic-study/VerseRefBadge.svelte";
    import {
        attachTafsir,
        loadVerses,
        parseRef,
        relatedTo,
        runPipeline,
        type PipelineResult,
        type PipelineStep,
        type PipelineStepKind,
        type VerseRow,
        type WorkbookNode,
    } from "$lib/stores/workbook.store";

    interface Props {
        node: WorkbookNode;
        selected: boolean;
        onChange: (patch: Partial<WorkbookNode>) => void;
        onRemove: () => void;
        onSelect: () => void;
        onDragStart: (event: PointerEvent) => void;
        onResizeStart: (event: PointerEvent) => void;
    }
    let { node, selected, onChange, onRemove, onSelect, onDragStart, onResizeStart }: Props =
        $props();

    let rows = $state<VerseRow[]>([]);
    let pipeline = $state<PipelineResult | null>(null);
    let loading = $state(false);
    let error = $state("");

    const PALETTE: Record<string, string> = {
        ayah: "border-[#e6cf96] bg-[#fdf6e6] dark:border-[#6b5b37] dark:bg-[#34302a]",
        translation: "border-brand-teal-200 bg-brand-teal-50 dark:border-[#416067] dark:bg-[#29383e]",
        tafsir: "border-[#cfc4e8] bg-[#f5f1fb] dark:border-[#4e4a6b] dark:bg-[#2b2a3d]",
        related: "border-brand-emerald-200 bg-brand-emerald-50 dark:border-[#414559] dark:bg-[#292c3c]",
        pipeline: "border-brand-sand-300 bg-white dark:border-[#414559] dark:bg-[#292c3c]",
        note: "border-[#e8dca8] bg-[#fffbe8] dark:border-[#5a5030] dark:bg-[#34302a]",
        image: "border-brand-sand-200 bg-white dark:border-[#414559] dark:bg-[#292c3c]",
        title: "border-transparent bg-transparent",
    };

    const STEP_KINDS: PipelineStepKind[] = ["ayah", "translation", "tafsir", "related", "view"];

    async function reload() {
        if (node.kind === "title" || node.kind === "note" || node.kind === "image") return;
        loading = true;
        error = "";
        try {
            if (node.kind === "pipeline") {
                pipeline = await runPipeline(node.steps ?? []);
            } else if (node.ref && parseRef(node.ref)) {
                const base = await loadVerses([node.ref]);
                rows =
                    node.kind === "tafsir"
                        ? await attachTafsir(base)
                        : node.kind === "related"
                          ? await relatedTo(base, 4)
                          : base;
            } else {
                rows = [];
            }
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        } finally {
            loading = false;
        }
    }

    // Reload when the card's own inputs change — its ayah, or its pipeline's shape.
    $effect(() => {
        void node.ref;
        void node.steps?.map((step) => `${step.kind}:${step.refs?.join(",")}:${step.layout}`).join("|");
        void reload();
    });

    function addStep(kind: PipelineStepKind) {
        const steps = [...(node.steps ?? [])];
        const view = steps.findIndex((step) => step.kind === "view");
        const step: PipelineStep = {
            id: crypto.randomUUID(),
            kind,
            refs: kind === "ayah" ? ["1:1"] : undefined,
            layout: kind === "view" ? "list" : undefined,
        };
        // A view step ends the chain, so anything else is inserted before it.
        if (kind !== "view" && view >= 0) steps.splice(view, 0, step);
        else steps.push(step);
        onChange({ steps });
    }

    function updateStep(id: string, patch: Partial<PipelineStep>) {
        onChange({ steps: (node.steps ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s)) });
    }

    function removeStep(id: string) {
        onChange({ steps: (node.steps ?? []).filter((s) => s.id !== id) });
    }
</script>

<div
    class="absolute flex flex-col overflow-hidden rounded-2xl border shadow-sm transition-shadow {PALETTE[
        node.kind
    ]} {selected ? 'ring-2 ring-brand-gold-400 dark:ring-[#e5c890]' : ''}"
    style:left="{node.x}px"
    style:top="{node.y}px"
    style:width="{node.width}px"
    style:height="{node.height}px"
    onpointerdown={onSelect}
>
    <!-- Header doubles as the drag handle -->
    <div
        class="flex shrink-0 cursor-grab items-center gap-1.5 px-2.5 py-1.5 active:cursor-grabbing"
        onpointerdown={onDragStart}
    >
        {#if node.kind === "title"}
            <input
                value={node.text ?? ""}
                oninput={(e) => onChange({ text: e.currentTarget.value })}
                onpointerdown={(e) => e.stopPropagation()}
                placeholder={$t("workbook.node.title")}
                class="min-w-0 flex-1 bg-transparent text-lg font-bold text-brand-charcoal-900 outline-none placeholder:text-brand-charcoal-300 dark:text-[#c6d0f5]"
            />
        {:else}
            <span class="flex-1 truncate text-[0.625rem] font-bold uppercase tracking-wide text-brand-charcoal-400 dark:text-[#838ba7]">
                {$t(`workbook.node.${node.kind}`)}
            </span>
            {#if node.kind !== "note" && node.kind !== "image"}
                <button
                    onclick={reload}
                    onpointerdown={(e) => e.stopPropagation()}
                    title={$t("workbook.refresh")}
                    aria-label={$t("workbook.refresh")}
                    class="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-brand-charcoal-400 hover:bg-black/5 dark:text-[#838ba7] dark:hover:bg-white/10"
                >
                    <Icon
                        icon={loading ? "svg-spinners:180-ring-with-bg" : "solar:refresh-linear"}
                        width="0.7rem"
                    />
                </button>
            {/if}
        {/if}
        <button
            onclick={onRemove}
            onpointerdown={(e) => e.stopPropagation()}
            title={$t("workbook.remove_node")}
            aria-label={$t("workbook.remove_node")}
            class="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-brand-charcoal-400 hover:bg-black/5 hover:text-red-500 dark:text-[#838ba7] dark:hover:bg-white/10"
        >
            <Icon icon="solar:close-circle-linear" width="0.7rem" />
        </button>
    </div>

    <!-- Body -->
    <div class="default-scroll min-h-0 flex-1 overflow-y-auto px-2.5 pb-2.5">
        {#if node.kind === "note"}
            <textarea
                value={node.text ?? ""}
                oninput={(e) => onChange({ text: e.currentTarget.value })}
                onpointerdown={(e) => e.stopPropagation()}
                placeholder={$t("workbook.node.note_placeholder")}
                class="h-full w-full resize-none bg-transparent text-[0.75rem] leading-relaxed text-brand-charcoal-600 outline-none placeholder:text-brand-charcoal-300 dark:text-[#c6d0f5]"
            ></textarea>
        {:else if node.kind === "image"}
            {#if node.text}
                <img src={node.text} alt="" class="h-full w-full object-contain" />
            {:else}
                <p class="text-[0.6875rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                    {$t("workbook.node.image_empty")}
                </p>
            {/if}
        {:else if node.kind === "pipeline"}
            <div class="flex flex-wrap items-center gap-1">
                {#each node.steps ?? [] as step, i (step.id)}
                    {#if i > 0}
                        <Icon icon="solar:arrow-right-linear" width="0.7rem" class="text-brand-charcoal-300" />
                    {/if}
                    <div
                        class="flex items-center gap-1 rounded-lg border border-brand-sand-200 bg-white px-1.5 py-0.5 dark:border-[#414559] dark:bg-[#232634]"
                        onpointerdown={(e) => e.stopPropagation()}
                    >
                        <span class="text-[0.625rem] font-semibold text-brand-charcoal-500 dark:text-[#c6d0f5]">
                            {$t(`workbook.step.${step.kind}`)}
                        </span>
                        {#if step.kind === "ayah"}
                            <input
                                value={(step.refs ?? []).join(", ")}
                                oninput={(e) =>
                                    updateStep(step.id, {
                                        refs: e.currentTarget.value
                                            .split(",")
                                            .map((r) => r.trim())
                                            .filter(Boolean),
                                    })}
                                placeholder="1:2, 112:1"
                                class="w-24 bg-transparent text-[0.625rem] text-brand-charcoal-600 outline-none dark:text-[#c6d0f5]"
                            />
                        {/if}
                        {#if step.kind === "view"}
                            <select
                                value={step.layout ?? "list"}
                                onchange={(e) =>
                                    updateStep(step.id, {
                                        layout: e.currentTarget.value as "list" | "columns",
                                    })}
                                class="bg-transparent text-[0.625rem] text-brand-charcoal-600 outline-none dark:text-[#c6d0f5]"
                            >
                                <option value="list">{$t("workbook.view.list")}</option>
                                <option value="columns">{$t("workbook.view.columns")}</option>
                            </select>
                        {/if}
                        <button
                            onclick={() => removeStep(step.id)}
                            aria-label={$t("workbook.remove_step")}
                            class="cursor-pointer text-brand-charcoal-300 hover:text-red-500"
                        >
                            <Icon icon="solar:close-circle-linear" width="0.6rem" />
                        </button>
                    </div>
                {/each}
                <div class="flex items-center gap-1" onpointerdown={(e) => e.stopPropagation()}>
                    {#each STEP_KINDS as kind (kind)}
                        <button
                            onclick={() => addStep(kind)}
                            title={$t("workbook.add_step", { step: $t(`workbook.step.${kind}`) })}
                            class="cursor-pointer rounded-full border border-dashed border-brand-sand-300 px-1.5 text-[0.5625rem] text-brand-charcoal-400 hover:bg-brand-sand-100 dark:border-[#414559] dark:text-[#838ba7] dark:hover:bg-[#363a4f]"
                        >
                            +{$t(`workbook.step.${kind}`)}
                        </button>
                    {/each}
                </div>
            </div>

            {#if pipeline}
                <div class="mt-2 border-t border-brand-sand-200 pt-2 dark:border-[#414559]">
                    <div
                        class={pipeline.layout === "columns"
                            ? "grid grid-cols-2 gap-2"
                            : "flex flex-col gap-2"}
                    >
                        {#each pipeline.rows as row, i (i)}
                            <div class="rounded-lg bg-black/[0.02] p-1.5 dark:bg-white/[0.03]">
                                <div class="flex items-center justify-between gap-1">
                                    <VerseRefBadge verseRef={`${row.surah}:${row.ayah}`} size="sm" />
                                    {#if row.fromRef}
                                        <span class="text-[0.5625rem] text-brand-charcoal-300 dark:text-[#626880]">
                                            ← {row.fromRef}
                                        </span>
                                    {/if}
                                </div>
                                <div dir="rtl" class="pb-1 pt-1 font-scheherazade text-base leading-loose text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                    {row.arabic}
                                </div>
                                {#if row.translation}
                                    <p class="text-[0.625rem] italic leading-relaxed text-brand-charcoal-500 dark:text-[#a5adce]">
                                        {row.translation}
                                    </p>
                                {/if}
                                {#if row.tafsir}
                                    <p class="mt-1 line-clamp-4 text-[0.5625rem] leading-relaxed text-brand-charcoal-400 dark:text-[#838ba7]">
                                        {row.tafsir}
                                    </p>
                                {/if}
                            </div>
                        {/each}
                    </div>
                    <p class="mt-1.5 text-[0.5625rem] text-brand-charcoal-300 dark:text-[#626880]">
                        {pipeline.trace.join(" · ")}
                    </p>
                </div>
            {/if}
        {:else}
            <!-- ayah / translation / tafsir / related all read one verse -->
            <div class="flex items-center gap-1" onpointerdown={(e) => e.stopPropagation()}>
                <input
                    value={node.ref ?? ""}
                    oninput={(e) => onChange({ ref: e.currentTarget.value })}
                    placeholder="2:255"
                    class="w-20 rounded border border-brand-sand-200 bg-white/70 px-1.5 py-0.5 text-[0.625rem] text-brand-charcoal-600 outline-none dark:border-[#414559] dark:bg-[#232634] dark:text-[#c6d0f5]"
                />
                <VerseRefBadge verseRef={node.ref ?? "1:1"} size="sm" />
            </div>
            {#if error}
                <p class="mt-1 text-[0.625rem] text-red-500 dark:text-red-400">{error}</p>
            {/if}
            <div class="mt-1.5 flex flex-col gap-2">
                {#each rows as row, i (i)}
                    <div>
                        {#if node.kind === "related" && row.fromRef}
                            <VerseRefBadge verseRef={`${row.surah}:${row.ayah}`} size="sm" />
                        {/if}
                        {#if node.kind === "ayah" || node.kind === "related"}
                            <div dir="rtl" class="pb-1 font-scheherazade text-lg leading-loose text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                {row.arabic}
                            </div>
                        {/if}
                        {#if (node.kind === "translation" || node.kind === "related") && row.translation}
                            <p class="text-[0.6875rem] leading-relaxed text-brand-charcoal-600 dark:text-[#a5adce]">
                                {row.translation}
                            </p>
                        {:else if node.kind === "translation"}
                            <p class="text-[0.625rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                                {$t("workbook.no_translation")}
                            </p>
                        {/if}
                        {#if node.kind === "tafsir"}
                            {#if row.tafsir}
                                <p class="text-[0.6875rem] leading-relaxed text-brand-charcoal-600 dark:text-[#a5adce]">
                                    {row.tafsir}
                                </p>
                            {:else}
                                <p class="text-[0.625rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                                    {$t("workbook.no_tafsir")}
                                </p>
                            {/if}
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}
    </div>

    <!-- Resize handle -->
    <button
        onpointerdown={onResizeStart}
        aria-label={$t("workbook.resize")}
        class="absolute bottom-0 right-0 h-3.5 w-3.5 cursor-nwse-resize rounded-tl bg-transparent"
    >
        <span class="absolute bottom-1 right-1 block h-1.5 w-1.5 border-b border-r border-brand-charcoal-300 dark:border-[#626880]"></span>
    </button>
</div>
