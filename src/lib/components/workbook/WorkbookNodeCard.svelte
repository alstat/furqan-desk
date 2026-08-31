<!-- One card on the workbook board.
     Every kind shares the same frame — a ControlCard-style shell with a quiet
     header strip — and differs only in what it puts inside, so adding a kind is
     a case in one switch rather than another component with its own idea of
     what a card looks like. The pipeline's body is a flow canvas of its own:
     steps are dragged into place, their connectors follow them live, and
     left-to-right order is the running order. -->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import VerseRefBadge from "$lib/components/arabic-study/VerseRefBadge.svelte";
    import {
        attachTafsir,
        loadVerses,
        orderedSteps,
        parseRef,
        relatedTo,
        runPipeline,
        STEP_KINDS,
        STEP_META,
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
    let editingStep = $state<string | null>(null);

    /** Header accent per kind — a tint on the strip, not a wash over the card. */
    const ACCENT: Record<string, { strip: string; icon: string; dot: string }> = {
        ayah: {
            strip: "bg-brand-gold-50 dark:bg-[#34302a]",
            icon: "solar:book-2-bold-duotone",
            dot: "bg-brand-gold-400",
        },
        translation: {
            strip: "bg-brand-teal-50 dark:bg-[#29383e]",
            icon: "solar:translation-2-bold-duotone",
            dot: "bg-brand-teal-400",
        },
        tafsir: {
            strip: "bg-[#f5f1fb] dark:bg-[#2b2a3d]",
            icon: "solar:notebook-bold-duotone",
            dot: "bg-[#a999d6]",
        },
        related: {
            strip: "bg-brand-emerald-50 dark:bg-[#28352f]",
            icon: "solar:link-circle-bold-duotone",
            dot: "bg-brand-emerald-400",
        },
        pipeline: {
            strip: "bg-brand-sand-50 dark:bg-[#232634]",
            icon: "solar:flow-bold-duotone",
            dot: "bg-brand-charcoal-300",
        },
        note: {
            strip: "bg-[#fffbe8] dark:bg-[#34302a]",
            icon: "solar:notes-bold-duotone",
            dot: "bg-[#e8dca8]",
        },
        image: {
            strip: "bg-brand-sand-50 dark:bg-[#232634]",
            icon: "solar:gallery-bold-duotone",
            dot: "bg-brand-sand-300",
        },
        title: {
            strip: "bg-transparent",
            icon: "solar:text-bold-duotone",
            dot: "bg-transparent",
        },
    };

    /** Step chips are a fixed size, so edges can be drawn from their centres. */
    const CHIP = { width: 116, height: 34 };

    const steps = $derived(node.steps ?? []);
    const flowOrder = $derived(orderedSteps(steps));

    /** One edge per consecutive pair, recomputed from live positions. */
    const edges = $derived(
        flowOrder.slice(1).map((step, i) => {
            const from = flowOrder[i];
            const x1 = from.x + CHIP.width;
            const y1 = from.y + CHIP.height / 2;
            const x2 = step.x;
            const y2 = step.y + CHIP.height / 2;
            const bend = Math.max(18, Math.abs(x2 - x1) / 2);
            return { id: `${from.id}-${step.id}`, x1, y1, x2, y2, bend };
        }),
    );

    /** Zones: one dashed frame per named group, sized to its members. */
    const zones = $derived.by(() => {
        const byGroup = new Map<string, PipelineStep[]>();
        for (const step of steps) {
            if (!step.group) continue;
            byGroup.set(step.group, [...(byGroup.get(step.group) ?? []), step]);
        }
        return [...byGroup.entries()].map(([name, members]) => {
            // The frame leaves room for its own label above the chips, and
            // never starts off the top of the canvas where it would be clipped.
            const pad = 12;
            const x = Math.max(2, Math.min(...members.map((s) => s.x)) - pad);
            const y = Math.max(2, Math.min(...members.map((s) => s.y)) - pad - 10);
            const right = Math.max(...members.map((s) => s.x + CHIP.width)) + pad;
            const bottom = Math.max(...members.map((s) => s.y + CHIP.height)) + pad;
            return { name, x, y, width: right - x, height: bottom - y };
        });
    });

    async function reload() {
        if (node.kind === "title" || node.kind === "note" || node.kind === "image") return;
        loading = true;
        error = "";
        try {
            if (node.kind === "pipeline") {
                pipeline = await runPipeline(steps);
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

    // Reload when the card's own inputs change — its ayah, or the pipeline's
    // shape. Dragging a step only moves it, so position is deliberately not a
    // trigger; the order it implies is read when the flow next runs.
    $effect(() => {
        void node.ref;
        void steps
            .map((step) => `${step.kind}:${step.refs?.join(",")}:${step.query}:${step.limit}:${step.layout}`)
            .join("|");
        void reload();
    });

    function addStep(kind: PipelineStepKind) {
        const last = flowOrder.at(-1);
        onChange({
            steps: [
                ...steps,
                {
                    id: crypto.randomUUID(),
                    kind,
                    x: (last ? last.x + 140 : 16),
                    y: last ? last.y : 16,
                    refs: kind === "ayah" ? ["1:1"] : undefined,
                    limit: kind === "limit" ? 5 : kind === "related" ? 3 : undefined,
                    layout: kind === "view" ? "list" : undefined,
                },
            ],
        });
    }

    function updateStep(id: string, patch: Partial<PipelineStep>) {
        onChange({ steps: steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
    }

    function removeStep(id: string) {
        onChange({ steps: steps.filter((s) => s.id !== id) });
        if (editingStep === id) editingStep = null;
    }

    // ── Dragging a step inside the flow ─────────────────────────────────────
    let stepDrag: { id: string; startX: number; startY: number; x: number; y: number } | null = null;

    function startStepDrag(event: PointerEvent, step: PipelineStep) {
        event.preventDefault();
        event.stopPropagation();
        stepDrag = { id: step.id, startX: event.clientX, startY: event.clientY, x: step.x, y: step.y };
        // Capturing keeps the drag alive if the pointer outruns the chip, but a
        // failed capture must not cancel the drag itself.
        try {
            (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
        } catch {
            /* pointer already released, or not one the browser tracks */
        }
    }

    function moveStep(event: PointerEvent) {
        if (!stepDrag) return;
        updateStep(stepDrag.id, {
            x: Math.max(4, Math.round(stepDrag.x + (event.clientX - stepDrag.startX))),
            y: Math.max(4, Math.round(stepDrag.y + (event.clientY - stepDrag.startY))),
        });
    }
</script>

<div
    class="absolute flex flex-col overflow-hidden rounded-xl border border-brand-sand-200/80 bg-white/95 shadow-lg backdrop-blur-md transition-shadow dark:border-[#414559] dark:bg-[#292c3c]/95 dark:shadow-black/40 {selected
        ? 'ring-2 ring-brand-gold-400 dark:ring-[#e5c890]'
        : ''} {node.kind === 'title' ? 'border-transparent bg-transparent shadow-none backdrop-blur-none dark:bg-transparent' : ''}"
    style:left="{node.x}px"
    style:top="{node.y}px"
    style:width="{node.width}px"
    style:height="{node.height}px"
    onpointerdown={onSelect}
>
    <!-- Header strip doubles as the drag handle -->
    <div
        class="flex shrink-0 cursor-grab items-center gap-1.5 border-b border-brand-sand-200/70 px-3 py-1.5 active:cursor-grabbing dark:border-[#414559] {ACCENT[
            node.kind
        ].strip} {node.kind === 'title' ? 'border-transparent' : ''}"
        onpointerdown={onDragStart}
    >
        {#if node.kind === "title"}
            <input
                value={node.text ?? ""}
                oninput={(e) => onChange({ text: e.currentTarget.value })}
                onpointerdown={(e) => e.stopPropagation()}
                placeholder={$t("workbook.node.title")}
                class="min-w-0 flex-1 bg-transparent text-lg font-bold tracking-tight text-brand-charcoal-900 outline-none placeholder:text-brand-charcoal-300 dark:text-[#c6d0f5]"
            />
        {:else}
            <Icon icon={ACCENT[node.kind].icon} width="0.8rem" class="shrink-0 text-brand-charcoal-400 dark:text-[#838ba7]" />
            <span class="flex-1 truncate text-[0.625rem] font-semibold uppercase tracking-widest text-brand-charcoal-300 dark:text-[#838ba7]">
                {$t(`workbook.node.${node.kind}`)}
            </span>
            {#if node.kind !== "note" && node.kind !== "image"}
                <button
                    onclick={reload}
                    onpointerdown={(e) => e.stopPropagation()}
                    title={$t("workbook.refresh")}
                    aria-label={$t("workbook.refresh")}
                    class="flex h-5 w-5 cursor-pointer items-center justify-center rounded-lg text-brand-charcoal-300 transition-colors hover:bg-black/5 dark:text-[#838ba7] dark:hover:bg-white/10"
                >
                    <Icon
                        icon={loading ? "svg-spinners:180-ring-with-bg" : "solar:refresh-bold-duotone"}
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
            class="flex h-5 w-5 cursor-pointer items-center justify-center rounded-lg text-brand-charcoal-300 transition-colors hover:bg-black/5 hover:text-red-500 dark:text-[#838ba7] dark:hover:bg-white/10"
        >
            <Icon icon="solar:close-circle-bold-duotone" width="0.7rem" />
        </button>
    </div>

    <!-- Body -->
    <div class="default-scroll min-h-0 flex-1 overflow-auto p-3">
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
            <!-- Palette -->
            <div class="flex flex-wrap items-center gap-1" onpointerdown={(e) => e.stopPropagation()}>
                <span class="mr-0.5 text-[0.5625rem] font-semibold uppercase tracking-widest text-brand-charcoal-300 dark:text-[#838ba7]">
                    {$t("workbook.flow.add")}
                </span>
                {#each STEP_KINDS as kind (kind)}
                    <button
                        onclick={() => addStep(kind)}
                        title={$t("workbook.add_step", { step: $t(`workbook.step.${kind}`) })}
                        class="flex cursor-pointer items-center gap-1 rounded-full border border-brand-sand-200 bg-brand-sand-100 px-2 py-0.5 text-[0.5625rem] font-semibold text-brand-charcoal-500 transition-colors hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:text-[#c6d0f5] dark:hover:bg-[#414559]"
                    >
                        <Icon icon={STEP_META[kind].icon} width="0.6rem" />
                        {$t(`workbook.step.${kind}`)}
                    </button>
                {/each}
            </div>

            <!-- Flow canvas: zones behind, edges next, chips on top -->
            <div
                class="relative mt-2 min-h-[132px] overflow-auto rounded-xl border border-brand-sand-200/80 bg-brand-sand-50/60 p-1 dark:border-[#414559] dark:bg-[#232634]/60"
                onpointerdown={(e) => e.stopPropagation()}
                onpointermove={moveStep}
                onpointerup={() => (stepDrag = null)}
                onpointerleave={() => (stepDrag = null)}
                role="presentation"
            >
                {#each zones as zone (zone.name)}
                    <div
                        class="pointer-events-none absolute rounded-xl border border-dashed border-brand-gold-300/70 bg-brand-gold-50/40 dark:border-[#5a5030] dark:bg-[#34302a]/40"
                        style:left="{zone.x}px"
                        style:top="{zone.y}px"
                        style:width="{zone.width}px"
                        style:height="{zone.height}px"
                    >
                        <span class="absolute left-2 top-0.5 text-[0.5rem] font-semibold uppercase tracking-widest text-brand-gold-500 dark:text-[#e5c890]">
                            {zone.name}
                        </span>
                    </div>
                {/each}

                <!-- Connectors are derived from the chips' own coordinates, so
                     they follow a step the moment it is dragged. -->
                <svg class="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                    {#each edges as edge (edge.id)}
                        <path
                            d="M {edge.x1} {edge.y1} C {edge.x1 + edge.bend} {edge.y1}, {edge.x2 -
                                edge.bend} {edge.y2}, {edge.x2} {edge.y2}"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.5"
                            class="text-brand-sand-300 dark:text-[#51576d]"
                        />
                        <circle cx={edge.x2} cy={edge.y2} r="2.5" class="fill-brand-sand-300 dark:fill-[#51576d]" />
                    {/each}
                </svg>

                {#each steps as step (step.id)}
                    <div
                        class="absolute flex cursor-grab items-center gap-1.5 rounded-lg border border-brand-sand-200 bg-white px-2 shadow-sm active:cursor-grabbing dark:border-[#414559] dark:bg-[#292c3c] {editingStep ===
                        step.id
                            ? 'ring-2 ring-brand-gold-300 dark:ring-[#e5c890]/50'
                            : ''}"
                        style:left="{step.x}px"
                        style:top="{step.y}px"
                        style:width="{CHIP.width}px"
                        style:height="{CHIP.height}px"
                        onpointerdown={(e) => startStepDrag(e, step)}
                        ondblclick={() => (editingStep = editingStep === step.id ? null : step.id)}
                        role="presentation"
                    >
                        <span
                            class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md {STEP_META[step.kind]
                                .kind === 'source'
                                ? 'bg-brand-gold-100 text-brand-gold-600 dark:bg-[#34302a] dark:text-[#e5c890]'
                                : STEP_META[step.kind].kind === 'enrich'
                                  ? 'bg-brand-teal-100 text-brand-teal-600 dark:bg-[#29383e] dark:text-[#92cccc]'
                                  : STEP_META[step.kind].kind === 'shape'
                                    ? 'bg-[#f0ecfa] text-[#6b5ba8] dark:bg-[#2b2a3d] dark:text-[#c3b6ea]'
                                    : 'bg-brand-emerald-100 text-brand-emerald-600 dark:bg-[#28352f] dark:text-[#9dd4c8]'}"
                        >
                            <Icon icon={STEP_META[step.kind].icon} width="0.65rem" />
                        </span>
                        <span class="min-w-0 flex-1 truncate text-[0.625rem] font-semibold text-brand-charcoal-600 dark:text-[#c6d0f5]">
                            {$t(`workbook.step.${step.kind}`)}
                        </span>
                        <button
                            onclick={() => (editingStep = editingStep === step.id ? null : step.id)}
                            onpointerdown={(e) => e.stopPropagation()}
                            aria-label={$t("workbook.flow.settings")}
                            class="cursor-pointer text-brand-charcoal-300 hover:text-brand-charcoal-500 dark:text-[#838ba7]"
                        >
                            <Icon icon="solar:settings-bold-duotone" width="0.6rem" />
                        </button>
                    </div>
                {/each}
            </div>

            <!-- The selected step's settings, out of the way of the flow -->
            {#if editingStep}
                {@const step = steps.find((s) => s.id === editingStep)}
                {#if step}
                    <div
                        class="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-brand-sand-200/80 bg-white px-2.5 py-1.5 dark:border-[#414559] dark:bg-[#232634]"
                        onpointerdown={(e) => e.stopPropagation()}
                        role="presentation"
                    >
                        <span class="text-[0.5625rem] font-semibold uppercase tracking-widest text-brand-charcoal-300 dark:text-[#838ba7]">
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
                                class="w-32 rounded-lg border border-brand-sand-200 bg-white px-2 py-0.5 text-[0.625rem] text-brand-charcoal-600 outline-none dark:border-[#414559] dark:bg-[#292c3c] dark:text-[#c6d0f5]"
                            />
                        {:else if step.kind === "filter"}
                            <input
                                value={step.query ?? ""}
                                oninput={(e) => updateStep(step.id, { query: e.currentTarget.value })}
                                placeholder={$t("workbook.flow.contains")}
                                class="w-32 rounded-lg border border-brand-sand-200 bg-white px-2 py-0.5 text-[0.625rem] text-brand-charcoal-600 outline-none dark:border-[#414559] dark:bg-[#292c3c] dark:text-[#c6d0f5]"
                            />
                        {:else if step.kind === "limit" || step.kind === "related"}
                            <input
                                type="number"
                                min="1"
                                value={step.limit ?? (step.kind === "limit" ? 5 : 3)}
                                oninput={(e) => updateStep(step.id, { limit: Number(e.currentTarget.value) })}
                                class="w-16 rounded-lg border border-brand-sand-200 bg-white px-2 py-0.5 text-[0.625rem] text-brand-charcoal-600 outline-none dark:border-[#414559] dark:bg-[#292c3c] dark:text-[#c6d0f5]"
                            />
                        {:else if step.kind === "view"}
                            <select
                                value={step.layout ?? "list"}
                                onchange={(e) =>
                                    updateStep(step.id, {
                                        layout: e.currentTarget.value as "list" | "columns",
                                    })}
                                class="rounded-lg border border-brand-sand-200 bg-white px-2 py-0.5 text-[0.625rem] text-brand-charcoal-600 outline-none dark:border-[#414559] dark:bg-[#292c3c] dark:text-[#c6d0f5]"
                            >
                                <option value="list">{$t("workbook.view.list")}</option>
                                <option value="columns">{$t("workbook.view.columns")}</option>
                            </select>
                        {/if}
                        <input
                            value={step.group ?? ""}
                            oninput={(e) =>
                                updateStep(step.id, { group: e.currentTarget.value || undefined })}
                            placeholder={$t("workbook.flow.zone")}
                            class="w-24 rounded-lg border border-brand-sand-200 bg-white px-2 py-0.5 text-[0.625rem] text-brand-charcoal-600 outline-none dark:border-[#414559] dark:bg-[#292c3c] dark:text-[#c6d0f5]"
                        />
                        <button
                            onclick={() => removeStep(step.id)}
                            class="ml-auto flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[0.5625rem] font-semibold text-brand-charcoal-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-[#838ba7] dark:hover:bg-red-950/30"
                        >
                            <Icon icon="solar:trash-bin-trash-bold-duotone" width="0.6rem" />
                            {$t("workbook.remove_step")}
                        </button>
                    </div>
                {/if}
            {/if}

            <!-- What the flow produced -->
            {#if pipeline}
                <div class="mt-2">
                    <div class="mb-1.5 flex items-center gap-1.5">
                        <span class="text-[0.5625rem] font-semibold uppercase tracking-widest text-brand-charcoal-300 dark:text-[#838ba7]">
                            {$t("workbook.flow.output")}
                        </span>
                        <span class="rounded-full bg-brand-sand-100 px-1.5 text-[0.5625rem] font-semibold text-brand-charcoal-500 dark:bg-[#363a4f] dark:text-[#c6d0f5]">
                            {pipeline.rows.length}
                        </span>
                    </div>
                    <div
                        class={pipeline.layout === "columns"
                            ? "grid grid-cols-2 gap-2"
                            : "flex flex-col gap-2"}
                    >
                        {#each pipeline.rows as row, i (i)}
                            <div class="rounded-xl border border-brand-sand-200/70 bg-white p-2 dark:border-[#414559] dark:bg-[#232634]">
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
            <div class="flex items-center gap-1.5" onpointerdown={(e) => e.stopPropagation()} role="presentation">
                <input
                    value={node.ref ?? ""}
                    oninput={(e) => onChange({ ref: e.currentTarget.value })}
                    placeholder="2:255"
                    class="w-20 rounded-lg border border-brand-sand-200 bg-white px-2 py-0.5 text-[0.625rem] text-brand-charcoal-600 outline-none dark:border-[#414559] dark:bg-[#232634] dark:text-[#c6d0f5]"
                />
                <VerseRefBadge verseRef={node.ref ?? "1:1"} size="sm" />
            </div>
            {#if error}
                <p class="mt-1.5 text-[0.625rem] text-red-500 dark:text-red-400">{error}</p>
            {/if}
            <div class="mt-2 flex flex-col gap-2">
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
        class="absolute bottom-0 right-0 h-3.5 w-3.5 cursor-nwse-resize bg-transparent"
    >
        <span class="absolute bottom-1 right-1 block h-1.5 w-1.5 border-b border-r border-brand-charcoal-300 dark:border-[#626880]"></span>
    </button>
</div>
