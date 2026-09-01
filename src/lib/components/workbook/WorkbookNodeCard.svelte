<!-- One card on the workbook board.
     Every kind shares the same frame — a ControlCard-style shell with a quiet
     header strip — and differs only in what it puts inside, so adding a kind
     is a case in one switch rather than another component with its own idea
     of what a card looks like. Every data kind always carries a pair of
     ports (see `hasPort`) so a wire can be started the moment it is on the
     board; the board draws the wire between two ports and resolves what
     flows through them. Only `view` renders that as verses — every other
     kind shows just its own settings, so a chain reads as source → shaping
     → the one place its result actually appears. -->
<script lang="ts">
    import { onMount } from "svelte";
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import VerseRefBadge from "$lib/components/arabic-study/VerseRefBadge.svelte";
    import { surahLabels, ensureSurahLabels } from "$lib/stores/quran.svelte";
    import {
        availableTranslators,
        ensureTranslators,
        availableTafsirAuthors,
        ensureTafsirAuthors,
    } from "$lib/stores/translation.store";
    import {
        nodeRefs,
        SURAH_AYAH_COUNTS,
        transformNode,
        type VerseRow,
        type WorkbookNode,
    } from "$lib/stores/workbook.store";

    interface Props {
        node: WorkbookNode;
        selected: boolean;
        /** True for every data kind — it always carries input/output ports. */
        hasPort: boolean;
        /** The upstream node's resolved rows, or `null` when nothing feeds this card. */
        inputRows: VerseRow[] | null;
        onChange: (patch: Partial<WorkbookNode>) => void;
        onRemove: () => void;
        onSelect: (event: PointerEvent) => void;
        onDragStart: (event: PointerEvent) => void;
        onResizeStart: (event: PointerEvent) => void;
        onPortDragStart: (event: PointerEvent, side: "in" | "out") => void;
    }
    let {
        node,
        selected,
        hasPort,
        inputRows,
        onChange,
        onRemove,
        onSelect,
        onDragStart,
        onResizeStart,
        onPortDragStart,
    }: Props = $props();

    let rows = $state<VerseRow[]>([]);
    let loading = $state(false);
    let error = $state("");

    onMount(() => {
        void ensureSurahLabels();
        void ensureTranslators();
        void ensureTafsirAuthors();
    });

    /** The verses an ayah/related card is pointed at. */
    const refs = $derived(nodeRefs(node));

    // The surah/ayah picker that adds to `refs` — its own local pick, not
    // committed until "Add" so browsing surahs doesn't touch the node.
    let pickerSurah = $state(1);
    let pickerAyah = $state(1);

    function addRef() {
        const ref = `${pickerSurah}:${pickerAyah}`;
        if (refs.includes(ref)) return;
        onChange({ refs: [...refs, ref], ref: undefined });
    }

    function removeRef(ref: string) {
        onChange({ refs: refs.filter((r) => r !== ref) });
    }

    // Translate's "Other" language — buffered locally so an AI request only
    // fires on Apply/Enter, not on every keystroke. This component's
    // lifetime is one node (the board keys each card by node id), so an
    // initial read is all the syncing this needs.
    let localOtherLanguage = $state(node.otherLanguage ?? "");
    function applyOtherLanguage() {
        onChange({ otherLanguage: localOtherLanguage.trim() });
    }

    /** Header accent per kind — a tint on the strip, a colour for the ports. */
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
        filter: {
            strip: "bg-[#f4f2fa] dark:bg-[#2b2a3d]",
            icon: "solar:filter-bold-duotone",
            dot: "bg-[#c3b6ea]",
        },
        limit: {
            strip: "bg-[#f4f2fa] dark:bg-[#2b2a3d]",
            icon: "solar:sort-vertical-bold-duotone",
            dot: "bg-[#c3b6ea]",
        },
        dedupe: {
            strip: "bg-[#f4f2fa] dark:bg-[#2b2a3d]",
            icon: "solar:copy-bold-duotone",
            dot: "bg-[#c3b6ea]",
        },
        view: {
            strip: "bg-brand-emerald-50 dark:bg-[#28352f]",
            icon: "solar:eye-bold-duotone",
            dot: "bg-brand-emerald-400",
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

    // Same construction as SurahWidget.svelte's `selectClass` — a bordered
    // pill with a chevron — scaled down to fit a card a few hundred px wide.
    const dropdownClass =
        "w-full appearance-none cursor-pointer rounded-lg border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#232634] px-2 py-1 pr-6 text-[0.625rem] text-brand-charcoal-600 dark:text-[#c6d0f5] transition-all focus:border-brand-gold-400 dark:focus:border-[#e5c890] focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-[#e5c890]/20 hover:border-brand-sand-400 dark:hover:border-[#626880] hover:bg-brand-sand-50 dark:hover:bg-[#363a4f]";

    const NO_SETTINGS_KIND = new Set(["note", "image", "title"]);

    async function reload() {
        if (NO_SETTINGS_KIND.has(node.kind)) return;
        loading = true;
        error = "";
        try {
            rows = await transformNode(node, inputRows ?? []);
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        } finally {
            loading = false;
        }
    }

    // Reload whenever what this card is pointed at changes — its own refs or
    // settings, or (for a wired card) what its upstream neighbour produced.
    $effect(() => {
        void refs.join(",");
        void node.query;
        void node.filterField;
        void node.filterOp;
        void node.limit;
        void node.layout;
        void node.translatorId;
        void node.otherLanguage;
        void node.tafsirAuthorId;
        void inputRows;
        void reload();
    });
</script>

{#snippet dropdownChevron()}
    <span class="pointer-events-none absolute inset-y-0 right-2 flex items-center text-brand-charcoal-300 dark:text-[#838ba7]">
        <Icon icon="charm:chevron-down" width="0.625rem" />
    </span>
{/snippet}

{#snippet verseCards(list: VerseRow[], layout: "list" | "columns")}
    <div class={layout === "columns" ? "grid grid-cols-2 gap-2" : "flex flex-col gap-2"}>
        {#each list as row, i (i)}
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
{/snippet}

{#snippet outputHeader()}
    <div class="mb-1.5 flex items-center gap-1.5">
        <span class="text-[0.5625rem] font-semibold uppercase tracking-widest text-brand-charcoal-300 dark:text-[#838ba7]">
            {$t("workbook.flow.output")}
        </span>
        <span class="rounded-full bg-brand-sand-100 px-1.5 text-[0.5625rem] font-semibold text-brand-charcoal-500 dark:bg-[#363a4f] dark:text-[#c6d0f5]">
            {rows.length}
        </span>
    </div>
{/snippet}

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
        {:else if node.kind === "filter"}
            {@const field = node.filterField ?? "text"}
            {@const op = node.filterOp ?? (field === "text" ? "contains" : "eq")}
            <div class="flex flex-col gap-1.5" onpointerdown={(e) => e.stopPropagation()} role="presentation">
                <div class="flex gap-1.5">
                    <div class="relative flex-1">
                        <select
                            value={field}
                            onchange={(e) => {
                                const next = e.currentTarget.value as "text" | "surah" | "ayah";
                                onChange({
                                    filterField: next,
                                    filterOp: next === "text" ? "contains" : "eq",
                                });
                            }}
                            class={dropdownClass}
                        >
                            <option value="text">{$t("workbook.filter.field.text")}</option>
                            <option value="surah">{$t("workbook.filter.field.surah")}</option>
                            <option value="ayah">{$t("workbook.filter.field.ayah")}</option>
                        </select>
                        {@render dropdownChevron()}
                    </div>
                    <div class="relative flex-1">
                        <select
                            value={op}
                            onchange={(e) => onChange({ filterOp: e.currentTarget.value as WorkbookNode["filterOp"] })}
                            class={dropdownClass}
                        >
                            {#if field === "text"}
                                <option value="contains">{$t("workbook.filter.op.contains")}</option>
                                <option value="not_contains">{$t("workbook.filter.op.not_contains")}</option>
                            {:else}
                                <option value="eq">{$t("workbook.filter.op.eq")}</option>
                                <option value="neq">{$t("workbook.filter.op.neq")}</option>
                                <option value="gt">{$t("workbook.filter.op.gt")}</option>
                                <option value="gte">{$t("workbook.filter.op.gte")}</option>
                                <option value="lt">{$t("workbook.filter.op.lt")}</option>
                                <option value="lte">{$t("workbook.filter.op.lte")}</option>
                            {/if}
                        </select>
                        {@render dropdownChevron()}
                    </div>
                </div>
                <input
                    type={field === "text" ? "text" : "number"}
                    value={node.query ?? ""}
                    oninput={(e) => onChange({ query: e.currentTarget.value })}
                    placeholder={field === "text" ? $t("workbook.flow.contains") : "0"}
                    class="w-full rounded-lg border border-brand-sand-200 bg-white px-2 py-1 text-[0.6875rem] text-brand-charcoal-600 outline-none focus:border-brand-gold-400 dark:border-[#414559] dark:bg-[#232634] dark:text-[#c6d0f5] dark:focus:border-[#e5c890]"
                />
            </div>
        {:else if node.kind === "limit"}
            <div class="flex items-center gap-1.5" onpointerdown={(e) => e.stopPropagation()} role="presentation">
                <span class="text-[0.625rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                    {$t("workbook.flow.keep")}
                </span>
                <input
                    type="number"
                    min="1"
                    value={node.limit ?? 5}
                    oninput={(e) => onChange({ limit: Number(e.currentTarget.value) })}
                    class="w-16 rounded-lg border border-brand-sand-200 bg-white px-2 py-0.5 text-[0.6875rem] text-brand-charcoal-600 outline-none focus:border-brand-gold-400 dark:border-[#414559] dark:bg-[#232634] dark:text-[#c6d0f5] dark:focus:border-[#e5c890]"
                />
            </div>
        {:else if node.kind === "dedupe"}
            <p class="text-[0.625rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                {$t("workbook.node.dedupe_hint")}
            </p>
        {:else if node.kind === "view"}
            <div class="relative w-32" onpointerdown={(e) => e.stopPropagation()} role="presentation">
                <select
                    value={node.layout ?? "list"}
                    onchange={(e) => onChange({ layout: e.currentTarget.value as "list" | "columns" })}
                    class={dropdownClass}
                >
                    <option value="list">{$t("workbook.view.list")}</option>
                    <option value="columns">{$t("workbook.view.columns")}</option>
                </select>
                {@render dropdownChevron()}
            </div>
            {#if error}
                <p class="mt-1.5 text-[0.625rem] text-red-500 dark:text-red-400">{error}</p>
            {/if}
            <div class="mt-2">
                {@render outputHeader()}
                {@render verseCards(rows, node.layout ?? "list")}
            </div>
        {:else if node.kind === "title"}
            <!-- A heading's own big text lives in the header; the body is just
                 room for an optional note about it, not another ayah picker. -->
            <textarea
                value={node.title ?? ""}
                oninput={(e) => onChange({ title: e.currentTarget.value })}
                onpointerdown={(e) => e.stopPropagation()}
                placeholder={$t("workbook.heading.description_placeholder")}
                class="h-full w-full resize-none bg-transparent text-[0.75rem] leading-relaxed text-brand-charcoal-600 outline-none placeholder:text-brand-charcoal-300 dark:text-[#c6d0f5]"
            ></textarea>
        {:else if node.kind === "translation"}
            <!-- No ayah picker: the verses come from whatever is wired into
                 the input port (an Ayah card, typically). -->
            <div onpointerdown={(e) => e.stopPropagation()} role="presentation">
                <div class="relative">
                    <select
                        value={node.translatorId === undefined ? "" : String(node.translatorId)}
                        onchange={(e) => {
                            const v = e.currentTarget.value;
                            onChange({ translatorId: v === "" ? undefined : v === "other" ? "other" : Number(v) });
                        }}
                        class={dropdownClass}
                    >
                        <option value="">{$t("workbook.translate.reader_default")}</option>
                        {#each $availableTranslators as tr (tr.id)}
                            <option value={String(tr.id)}>{tr.name}</option>
                        {/each}
                        <option value="other">{$t("workbook.translate.other")}</option>
                    </select>
                    {@render dropdownChevron()}
                </div>
                {#if node.translatorId === "other"}
                    <div class="mt-1.5 flex items-center gap-1">
                        <input
                            bind:value={localOtherLanguage}
                            onkeydown={(e) => e.key === "Enter" && applyOtherLanguage()}
                            placeholder={$t("workbook.translate.other_placeholder")}
                            class="w-full min-w-0 flex-1 rounded-lg border border-brand-sand-200 bg-white px-2 py-1 text-[0.6875rem] text-brand-charcoal-600 outline-none focus:border-brand-gold-400 dark:border-[#414559] dark:bg-[#232634] dark:text-[#c6d0f5] dark:focus:border-[#e5c890]"
                        />
                        <button
                            onclick={applyOtherLanguage}
                            title={$t("workbook.translate.apply")}
                            aria-label={$t("workbook.translate.apply")}
                            class="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-brand-sand-200 text-brand-charcoal-400 transition-colors hover:bg-brand-sand-100 dark:border-[#414559] dark:text-[#838ba7] dark:hover:bg-[#414559]"
                        >
                            <Icon icon="solar:check-circle-bold-duotone" width="0.8rem" />
                        </button>
                    </div>
                {/if}
            </div>
            {#if error}
                <p class="mt-1.5 text-[0.625rem] text-red-500 dark:text-red-400">{error}</p>
            {/if}
        {:else if node.kind === "tafsir"}
            <!-- No ayah picker here either — an Ayah card upstream (directly,
                 or through a Translate card, which passes the verses on
                 unchanged) is what this reads. -->
            <div class="relative" onpointerdown={(e) => e.stopPropagation()} role="presentation">
                <select
                    value={node.tafsirAuthorId === undefined ? "" : String(node.tafsirAuthorId)}
                    onchange={(e) => {
                        const v = e.currentTarget.value;
                        onChange({ tafsirAuthorId: v === "" ? undefined : Number(v) });
                    }}
                    class={dropdownClass}
                >
                    <option value="">{$t("workbook.tafsir.reader_default")}</option>
                    {#each $availableTafsirAuthors as author (author.id)}
                        <option value={String(author.id)}>{author.name}</option>
                    {/each}
                </select>
                {@render dropdownChevron()}
            </div>
            {#if error}
                <p class="mt-1.5 text-[0.625rem] text-red-500 dark:text-red-400">{error}</p>
            {/if}
        {:else}
            <!-- ayah / related read one or more verses, picked from dropdowns
                 rather than typed. What they resolve to is never shown here —
                 wire a View card downstream to see it. -->
            <div class="flex flex-wrap items-center gap-1.5" onpointerdown={(e) => e.stopPropagation()} role="presentation">
                <div class="relative w-28">
                    <select
                        value={String(pickerSurah)}
                        onchange={(e) => {
                            pickerSurah = Number(e.currentTarget.value);
                            pickerAyah = 1;
                        }}
                        class={dropdownClass}
                    >
                        {#each $surahLabels as label, i (i)}
                            <option value={String(i + 1)}>{i + 1}. {label.en}</option>
                        {/each}
                    </select>
                    {@render dropdownChevron()}
                </div>
                <div class="relative w-16">
                    <select
                        value={String(pickerAyah)}
                        onchange={(e) => (pickerAyah = Number(e.currentTarget.value))}
                        class={dropdownClass}
                    >
                        {#each Array.from({ length: SURAH_AYAH_COUNTS[pickerSurah] ?? 1 }, (_, i) => i + 1) as ayahNum (ayahNum)}
                            <option value={String(ayahNum)}>{ayahNum}</option>
                        {/each}
                    </select>
                    {@render dropdownChevron()}
                </div>
                <button
                    onclick={addRef}
                    title={$t("workbook.verse.add")}
                    aria-label={$t("workbook.verse.add")}
                    class="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-brand-sand-200 text-brand-charcoal-400 transition-colors hover:bg-brand-sand-100 dark:border-[#414559] dark:text-[#838ba7] dark:hover:bg-[#414559]"
                >
                    <Icon icon="solar:add-circle-bold-duotone" width="0.8rem" />
                </button>
            </div>
            {#if refs.length}
                <div class="mt-1.5 flex flex-wrap items-center gap-1" onpointerdown={(e) => e.stopPropagation()} role="presentation">
                    {#each refs as ref (ref)}
                        <span class="inline-flex items-center gap-1 rounded-full border border-brand-sand-200 bg-brand-sand-100 py-0.5 pl-2 pr-1 text-[0.625rem] font-semibold text-brand-charcoal-500 dark:border-[#414559] dark:bg-[#363a4f] dark:text-[#c6d0f5]">
                            {ref}
                            <button
                                onclick={() => removeRef(ref)}
                                aria-label={$t("workbook.verse.remove", { ref })}
                                class="flex h-3.5 w-3.5 cursor-pointer items-center justify-center rounded-full text-brand-charcoal-300 transition-colors hover:text-red-500 dark:text-[#838ba7]"
                            >
                                <Icon icon="solar:close-circle-bold-duotone" width="0.6rem" />
                            </button>
                        </span>
                    {/each}
                </div>
            {/if}
            {#if error}
                <p class="mt-1.5 text-[0.625rem] text-red-500 dark:text-red-400">{error}</p>
            {/if}
        {/if}
    </div>

    <!-- Ports — one input, one output, on every data card so a wire can be
         started the moment it is on the board. The board owns the wire
         itself; a port only starts the drag. -->
    {#if hasPort}
        <button
            onpointerdown={(e) => {
                e.stopPropagation();
                onPortDragStart(e, "in");
            }}
            title={$t("workbook.port.in")}
            aria-label={$t("workbook.port.in")}
            class="port-dot -left-[7px] {ACCENT[node.kind].dot}"
        ></button>
        <button
            onpointerdown={(e) => {
                e.stopPropagation();
                onPortDragStart(e, "out");
            }}
            title={$t("workbook.port.out")}
            aria-label={$t("workbook.port.out")}
            class="port-dot -right-[7px] {ACCENT[node.kind].dot}"
        ></button>
    {/if}

    <!-- Resize handle — same double-arc corner as FileExplorer's panel. -->
    <button
        onpointerdown={onResizeStart}
        aria-label={$t("workbook.resize")}
        class="resize-handle resize-se"
    ></button>
</div>

<style>
    /* Matches FileExplorer.svelte's resize-handle corner exactly, so every
       resizable surface in the app reads the same. Only the SE corner is
       used here — cards resize from one corner, not four edges. */
    .resize-handle {
        position: absolute;
        z-index: 10;
        background: transparent;
        cursor: se-resize;
    }
    .resize-se {
        bottom: 0;
        right: 0;
        width: 20px;
        height: 20px;
    }
    .resize-se::before {
        content: "";
        position: absolute;
        bottom: 11px;
        right: 11px;
        width: 5px;
        height: 5px;
        border-bottom: 1.5px solid rgba(130, 130, 130, 0.4);
        border-right: 1.5px solid rgba(130, 130, 130, 0.4);
        border-bottom-right-radius: 5px;
        pointer-events: none;
    }
    .resize-se::after {
        content: "";
        position: absolute;
        bottom: 7px;
        right: 7px;
        width: 9px;
        height: 9px;
        border-bottom: 1.5px solid rgba(130, 130, 130, 0.55);
        border-right: 1.5px solid rgba(130, 130, 130, 0.55);
        border-bottom-right-radius: 9px;
        pointer-events: none;
    }

    /* Input/output ports: a small filled dot straddling the card edge,
       ringed in the card's own background so it reads as a socket rather
       than a stray mark. */
    .port-dot {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        width: 14px;
        height: 14px;
        border-radius: 9999px;
        border: 2px solid white;
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12);
        cursor: crosshair;
        z-index: 15;
        transition: transform 0.15s ease;
    }
    :global(.dark) .port-dot {
        border-color: #292c3c;
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3);
    }
    .port-dot:hover {
        transform: translateY(-50%) scale(1.3);
    }
</style>
