<!--
  One floating Comment or Prompt card, pinned beside a lesson card. Position
  is given by the parent (anchor rect + this card's own offset); dragging
  reports live offset deltas so the parent can redraw the link line and
  persist the final position on release.
-->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import { renderMarkdown } from "$lib/utils/markdown";
    import type { AnnotationDraft } from "./annotation-layout";

    interface Props {
        annotation: AnnotationDraft;
        left: number;
        top: number;
        onUpdate: (patch: Partial<AnnotationDraft>) => void;
        onDragMove: (offsetX: number, offsetY: number) => void;
        onDragEnd: () => void;
        onPersist: () => void;
        onGenerate: () => void;
        onDelete: () => void;
    }
    let { annotation, left, top, onUpdate, onDragMove, onDragEnd, onPersist, onGenerate, onDelete }: Props =
        $props();

    let previewMode = $state(annotation.kind === "comment" && annotation.content.length > 0);
    let textareaEl: HTMLTextAreaElement | undefined = $state();

    function startDrag(event: PointerEvent) {
        event.preventDefault();
        const handle = event.currentTarget as HTMLElement;
        const startX = event.clientX;
        const startY = event.clientY;
        const startOffsetX = annotation.offsetX;
        const startOffsetY = annotation.offsetY;
        try {
            handle.setPointerCapture?.(event.pointerId);
        } catch {
            /* capture is an optimisation, not a prerequisite */
        }
        function onMove(e: PointerEvent) {
            onDragMove(startOffsetX + (e.clientX - startX), startOffsetY + (e.clientY - startY));
        }
        function onUp() {
            handle.removeEventListener("pointermove", onMove);
            handle.removeEventListener("pointerup", onUp);
            onDragEnd();
        }
        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
    }

    function wrapSelection(marker: string) {
        if (!textareaEl) return;
        const { selectionStart: s, selectionEnd: e } = textareaEl;
        const value = annotation.content;
        const selected = value.slice(s, e);
        const next = value.slice(0, s) + marker + selected + marker + value.slice(e);
        onUpdate({ content: next });
        requestAnimationFrame(() => {
            textareaEl?.focus();
            textareaEl?.setSelectionRange(s + marker.length, s + marker.length + selected.length);
        });
    }

    function applyBullet() {
        if (!textareaEl) return;
        const { selectionStart: s } = textareaEl;
        const value = annotation.content;
        const lineStart = value.lastIndexOf("\n", s - 1) + 1;
        onUpdate({ content: value.slice(0, lineStart) + "- " + value.slice(lineStart) });
        requestAnimationFrame(() => textareaEl?.focus());
    }
</script>

<div
    style="position: absolute; left: {left}px; top: {top}px; z-index: 25;"
    class="w-64 rounded-2xl border border-brand-sand-200 bg-white shadow-lg shadow-stone-300/30 dark:border-[#414559] dark:bg-[#292c3c] dark:shadow-black/30"
>
    <!-- Header strip doubles as the drag handle -->
    <div
        onpointerdown={startDrag}
        title={$t("arabicStudy.grammar.annotation_drag")}
        class="flex cursor-grab items-center gap-1.5 rounded-t-2xl border-b border-brand-sand-200 bg-brand-sand-50 px-2.5 py-1.5 active:cursor-grabbing dark:border-[#414559] dark:bg-[#232634]"
    >
        <Icon
            icon={annotation.kind === "comment" ? "solar:notes-bold-duotone" : "solar:magic-stick-3-bold-duotone"}
            width="0.75rem"
            class="shrink-0 text-brand-charcoal-400 dark:text-[#838ba7]"
        />
        <input
            value={annotation.title}
            oninput={(e) => onUpdate({ title: e.currentTarget.value })}
            onpointerdown={(e) => e.stopPropagation()}
            onblur={onPersist}
            placeholder={$t("arabicStudy.grammar.annotation_title_placeholder")}
            class="min-w-0 flex-1 bg-transparent text-[0.6875rem] font-semibold text-brand-charcoal-700 outline-none placeholder:font-normal placeholder:text-brand-charcoal-300 dark:text-[#c6d0f5] dark:placeholder:text-[#626880]"
        />
        <button
            onclick={onDelete}
            onpointerdown={(e) => e.stopPropagation()}
            title={$t("arabicStudy.grammar.annotation_remove")}
            aria-label={$t("arabicStudy.grammar.annotation_remove")}
            class="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-lg text-brand-charcoal-300 transition-colors hover:bg-black/5 hover:text-red-500 dark:text-[#838ba7] dark:hover:bg-white/10"
        >
            <Icon icon="solar:close-circle-linear" width="0.75rem" />
        </button>
    </div>

    <div class="p-2.5">
        {#if annotation.kind === "comment"}
            {#if previewMode}
                <button
                    onclick={() => (previewMode = false)}
                    class="mb-1.5 flex cursor-pointer items-center gap-1 text-[0.5625rem] font-semibold uppercase tracking-wide text-brand-charcoal-300 hover:text-brand-charcoal-600 dark:text-[#838ba7] dark:hover:text-[#c6d0f5]"
                >
                    <Icon icon="solar:pen-linear" width="0.65rem" />
                    {$t("arabicStudy.grammar.annotation_edit")}
                </button>
                {#if annotation.content}
                    <div class="topic-explanation text-[0.71875rem] leading-relaxed text-brand-charcoal-600 dark:text-[#c6d0f5]">
                        {@html renderMarkdown(annotation.content)}
                    </div>
                {:else}
                    <p class="text-[0.6875rem] italic text-brand-charcoal-300 dark:text-[#626880]">
                        {$t("arabicStudy.grammar.annotation_note_placeholder")}
                    </p>
                {/if}
            {:else}
                <div class="mb-1.5 flex items-center gap-1">
                    <button
                        onclick={() => wrapSelection("**")}
                        title={$t("arabicStudy.grammar.annotation_bold")}
                        aria-label={$t("arabicStudy.grammar.annotation_bold")}
                        class="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-[0.625rem] font-bold text-brand-charcoal-400 hover:bg-brand-sand-100 dark:text-[#838ba7] dark:hover:bg-[#363a4f]"
                    >
                        B
                    </button>
                    <button
                        onclick={() => wrapSelection("*")}
                        title={$t("arabicStudy.grammar.annotation_italic")}
                        aria-label={$t("arabicStudy.grammar.annotation_italic")}
                        class="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-[0.625rem] italic text-brand-charcoal-400 hover:bg-brand-sand-100 dark:text-[#838ba7] dark:hover:bg-[#363a4f]"
                    >
                        I
                    </button>
                    <button
                        onclick={applyBullet}
                        title={$t("arabicStudy.grammar.annotation_bullet")}
                        aria-label={$t("arabicStudy.grammar.annotation_bullet")}
                        class="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-brand-charcoal-400 hover:bg-brand-sand-100 dark:text-[#838ba7] dark:hover:bg-[#363a4f]"
                    >
                        <Icon icon="solar:list-linear" width="0.7rem" />
                    </button>
                    {#if annotation.content}
                        <button
                            onclick={() => (previewMode = true)}
                            class="ml-auto flex cursor-pointer items-center gap-1 text-[0.5625rem] font-semibold uppercase tracking-wide text-brand-charcoal-300 hover:text-brand-charcoal-600 dark:text-[#838ba7] dark:hover:text-[#c6d0f5]"
                        >
                            <Icon icon="solar:eye-linear" width="0.65rem" />
                            {$t("arabicStudy.grammar.annotation_preview")}
                        </button>
                    {/if}
                </div>
                <textarea
                    bind:this={textareaEl}
                    value={annotation.content}
                    oninput={(e) => onUpdate({ content: e.currentTarget.value })}
                    onblur={onPersist}
                    placeholder={$t("arabicStudy.grammar.annotation_note_placeholder")}
                    rows="4"
                    class="default-scroll w-full resize-none rounded-lg border border-brand-sand-200 bg-brand-sand-50/60 p-1.5 text-[0.6875rem] text-brand-charcoal-700 outline-none placeholder:text-brand-charcoal-300 focus:border-brand-gold-300 dark:border-[#414559] dark:bg-[#232634] dark:text-[#c6d0f5] dark:placeholder:text-[#626880]"
                ></textarea>
            {/if}
        {:else}
            <input
                value={annotation.brief}
                oninput={(e) => onUpdate({ brief: e.currentTarget.value })}
                onblur={onPersist}
                placeholder={$t("arabicStudy.grammar.annotation_prompt_brief")}
                class="w-full rounded-lg border border-brand-sand-200 bg-white/70 px-2 py-1 text-[0.6875rem] text-brand-charcoal-700 outline-none placeholder:text-brand-charcoal-300 focus:border-brand-gold-300 dark:border-[#414559] dark:bg-[#232634] dark:text-[#c6d0f5] dark:placeholder:text-[#626880]"
            />
            <div class="mt-2 flex items-center gap-2">
                <button
                    onclick={onGenerate}
                    disabled={annotation.loading || !annotation.brief.trim()}
                    class="flex cursor-pointer items-center gap-1 rounded-full border border-brand-sand-200 bg-white px-2 py-0.5 text-[0.625rem] font-semibold text-brand-charcoal-500 transition-colors hover:bg-brand-sand-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#414559] dark:bg-[#232634] dark:text-[#c6d0f5] dark:hover:bg-[#363a4f]"
                >
                    <Icon
                        icon={annotation.loading ? "svg-spinners:180-ring-with-bg" : "solar:magic-stick-3-bold-duotone"}
                        width="0.7rem"
                    />
                    {$t("arabicStudy.grammar.annotation_generate")}
                </button>
            </div>
            {#if annotation.content}
                <div class="topic-explanation mt-2 text-[0.71875rem] leading-relaxed text-brand-charcoal-600 dark:text-[#c6d0f5]">
                    {@html renderMarkdown(annotation.content)}
                </div>
            {/if}
            {#if annotation.error}
                <p class="mt-2 text-[0.625rem] text-red-500 dark:text-red-400">{annotation.error}</p>
            {/if}
        {/if}
    </div>
</div>
