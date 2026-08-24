<script lang="ts">
    import Icon from "@iconify/svelte";
    import { fade, fly } from "svelte/transition";
    import { tick } from "svelte";
    import { addHighlight } from "$lib/functions/bookmarks";
    import { pendingHighlight } from "$lib/stores/bookmarks.store";
    import { surahLabels } from "$lib/stores/quran.svelte";
    import { t } from "$lib/i18n";
    import { get } from "svelte/store";
    import { formatMorphNote } from "$lib/functions/utils/morphNote";
    import { isPro } from "$lib/stores/auth.store";
    import AiSelectionToolbar from "$lib/components/shared/AiSelectionToolbar.svelte";

    let noteInput = $state("");
    let saving = $state(false);
    let saveError = $state("");
    let textareaEl = $state<HTMLTextAreaElement | null>(null);

    // ── AI selection toolbar (pro users) ─────────────────────────────────────
    let aiSelection = $state<{
        start: number;
        end: number;
        text: string;
        x: number;
        y: number;
    } | null>(null);

    // Anchor the floating toolbar above the note textarea whenever it holds
    // a non-empty selection. Textareas don't expose per-character coordinates,
    // so the textarea itself is the anchor.
    function updateAiSelection() {
        if (!$isPro || !textareaEl) {
            aiSelection = null;
            return;
        }
        const start = textareaEl.selectionStart ?? 0;
        const end = textareaEl.selectionEnd ?? 0;
        if (start === end) {
            aiSelection = null;
            return;
        }
        const text = textareaEl.value.slice(start, end);
        if (!text.trim()) {
            aiSelection = null;
            return;
        }
        const rect = textareaEl.getBoundingClientRect();
        const viewportWidth = window.innerWidth || 0;
        aiSelection = {
            start,
            end,
            text,
            x: Math.max(
                180,
                Math.min(viewportWidth - 180, rect.left + rect.width / 2),
            ),
            y: Math.max(12, rect.top - 8),
        };
    }

    function replaceAiSelection(replacement: string) {
        if (!aiSelection) return;
        const { start, end } = aiSelection;
        noteInput =
            noteInput.slice(0, start) + replacement + noteInput.slice(end);
        aiSelection = null;
        const caret = start + replacement.length;
        tick().then(() => {
            textareaEl?.focus();
            textareaEl?.setSelectionRange(caret, caret);
        });
    }

    $effect(() => {
        if ($pendingHighlight) {
            noteInput = $pendingHighlight.word
                ? formatMorphNote($pendingHighlight.word, get(t))
                : "";
            saveError = "";
            aiSelection = null;
        }
    });

    function surahName(n: number): string {
        return $surahLabels[n - 1]?.en ?? `Surah ${n}`;
    }

    async function handleSave() {
        const info = $pendingHighlight;
        if (!info) return;
        saving = true;
        saveError = "";
        try {
            await addHighlight(
                info.surah,
                info.ayah,
                info.text,
                noteInput.trim() || null,
            );
            pendingHighlight.set(null);
        } catch (e) {
            saveError = String(e);
        } finally {
            saving = false;
        }
    }

    function handleCancel() {
        pendingHighlight.set(null);
    }
</script>

{#if $pendingHighlight}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
        role="dialog"
        aria-modal="true"
        aria-label={$t("highlight.save")}
        tabindex="-1"
        transition:fade={{ duration: 150 }}
        class="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        onclick={(e) => {
            if (e.target === e.currentTarget) handleCancel();
        }}
        onkeydown={(e) => {
            if (e.key === "Escape") {
                if (aiSelection) {
                    aiSelection = null;
                    return;
                }
                handleCancel();
            }
        }}
    >
        <!-- Card -->
        <div
            transition:fly={{ y: 8, duration: 180, opacity: 0 }}
            class="w-full max-w-sm flex flex-col rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40 overflow-hidden"
            style="max-height: 90vh;"
        >
            <!-- Header -->
            <div
                class="shrink-0 bg-brand-gold-100 dark:bg-[#292c3c] border-b border-brand-gold-200 dark:border-[#414559] px-5 py-4"
            >
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                        <div
                            class="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-gold-200 dark:bg-[#414559]"
                        >
                            <Icon
                                icon="solar:pen-new-square-bold-duotone"
                                class="text-brand-gold-500"
                                width="1rem"
                            />
                        </div>
                        <div>
                            <h2
                                class="text-sm font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                            >
                                {$t("highlight.save")}
                            </h2>
                            <p
                                class="text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]"
                            >
                                {surahName($pendingHighlight.surah)} · {$t(
                                    "bookmark.ayah",
                                )}
                                {$pendingHighlight.ayah}
                            </p>
                        </div>
                    </div>
                    <button
                        onclick={handleCancel}
                        aria-label={$t("common.close")}
                        class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
                    >
                        <Icon
                            icon="solar:close-circle-bold-duotone"
                            width="1rem"
                        />
                    </button>
                </div>
            </div>

            <!-- Body -->
            <div
                class="flex-1 overflow-y-auto px-5 py-4 bg-brand-sand-50 dark:bg-[#232634]"
            >
                <!-- Arabic text preview -->
                <div
                    class="mb-4 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#292c3c] px-4 py-3"
                >
                    <p
                        class="font-scheherazade text-lg leading-loose text-brand-charcoal-500 dark:text-[#c6d0f5] wrap-break-word"
                        dir="rtl"
                    >
                        {$pendingHighlight.text}
                    </p>
                    <div class="mt-2 flex items-center gap-1">
                        <span
                            class="inline-flex items-center gap-1 rounded-md bg-brand-gold-100 dark:bg-[#414559] border border-brand-gold-200 dark:border-[#51576d] px-2 py-0.5 text-[11px] font-medium text-brand-gold-600 dark:text-[#e5c890]"
                        >
                            <Icon icon="solar:book-bold" width="0.65rem" />
                            {surahName($pendingHighlight.surah)} · {$pendingHighlight.ayah}
                        </span>
                    </div>
                </div>

                <!-- Notes textarea -->
                <textarea
                    placeholder={$t("highlight.note_placeholder")}
                    bind:this={textareaEl}
                    bind:value={noteInput}
                    onselect={updateAiSelection}
                    onkeyup={updateAiSelection}
                    onmouseup={updateAiSelection}
                    oninput={updateAiSelection}
                    rows="3"
                    class="mb-3 w-full resize-none rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50/80 dark:bg-[#292c3c] px-3 py-2.5 text-[11px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-brand-gold-900/30 hover:border-brand-sand-400 dark:hover:border-[#51576d] hover:bg-brand-sand-100 dark:hover:bg-[#292c3c] transition-all"
                ></textarea>

                {#if saveError}
                    <p
                        class="mb-2 flex items-center gap-1 text-[11px] text-red-500"
                    >
                        <Icon
                            icon="solar:danger-circle-bold"
                            width="0.75rem"
                        />{saveError}
                    </p>
                {/if}

                <!-- Actions -->
                <div class="flex items-center gap-2">
                    <button
                        onclick={handleCancel}
                        class="cursor-pointer flex-1 rounded-full border border-brand-sand-200 dark:border-[#414559] py-1.5 text-[11px] font-semibold text-brand-charcoal-400 dark:text-[#838ba7] hover:text-brand-charcoal-600 dark:hover:text-[#c6d0f5] hover:border-brand-sand-400 dark:hover:border-[#51576d] transition-colors"
                    >
                        {$t("common.cancel")}
                    </button>
                    <button
                        onclick={handleSave}
                        disabled={saving}
                        class="cursor-pointer flex flex-1 items-center justify-center gap-1.5 rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 py-1.5 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 active:bg-brand-gold-600/90 disabled:opacity-50 transition-colors"
                    >
                        <Icon
                            icon="solar:pen-new-square-bold-duotone"
                            width="0.8rem"
                        />
                        {saving ? $t("highlight.saving") : $t("highlight.save")}
                    </button>
                </div>
            </div>
        </div>

        {#if $isPro && aiSelection}
            <AiSelectionToolbar
                selectedText={aiSelection.text}
                x={aiSelection.x}
                y={aiSelection.y}
                contextPrompt={`This text is a selection from a personal note attached to a highlighted Quran passage (${surahName($pendingHighlight.surah)}, Ayah ${$pendingHighlight.ayah}). Highlighted Arabic text:\n\n${$pendingHighlight.text}\n\nFull note:\n\n${noteInput}`}
                onReplace={replaceAiSelection}
                onClose={() => (aiSelection = null)}
            />
        {/if}
    </div>
{/if}
