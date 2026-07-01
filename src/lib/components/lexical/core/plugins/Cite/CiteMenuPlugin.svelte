<script module lang="ts">
    import { createCommand, type LexicalCommand } from "lexical";

    /** Payload identifies the `/cite…` text to replace with the citation. */
    export interface OpenCiteMenuPayload {
        /** Key of the text node holding the slash query. */
        key: string;
        /** Index of the leading `/` within that node. */
        offset: number;
        /** Length of the typed token ("/cite") to be replaced. */
        tokenLen: number;
        /** Caret rect for positioning the menu. */
        rect: DOMRect | null;
    }

    export const OPEN_CITE_MENU_COMMAND: LexicalCommand<OpenCiteMenuPayload> =
        createCommand("OPEN_CITE_MENU_COMMAND");
</script>

<script lang="ts">
    import { onMount, tick } from "svelte";
    import { fly } from "svelte/transition";
    import Icon from "@iconify/svelte";
    import { getEditor } from "$lexical/core/composerContext.js";
    import {
        $getSelection as getSelection,
        $isRangeSelection as isRangeSelection,
        $isTextNode as isTextNode,
        $getNodeByKey as getNodeByKey,
        COMMAND_PRIORITY_EDITOR,
    } from "lexical";
    import { mergeRegister } from "@lexical/utils";
    import { t } from "$lib/i18n";
    import { references } from "$lib/stores/references.store";
    import {
        type Reference,
        type CitationStyle,
        citationStyles,
        shortAuthorLabel,
    } from "$lib/utils/references";
    import { $addReferenceToList as addReferenceToList } from "$lexical/core/plugins/ReferenceList/ReferenceListNode";

    const editor = getEditor();

    let isOpen = $state(false);
    let step = $state<"ref" | "style">("ref");
    let search = $state("");
    let refIndex = $state(0);
    let styleIndex = $state(0);
    let selectedRef = $state<Reference | null>(null);
    let menuRect = $state<DOMRect | null>(null);
    let menuEl = $state<HTMLElement | null>(null);
    let searchInput = $state<HTMLInputElement | null>(null);

    // Captured when the menu opens — where the "/cite" token lives.
    let anchorNodeKey = "";
    let triggerOffset = 0;
    let triggerLen = 0;

    const filteredRefs = $derived.by(() => {
        const q = search.trim().toLowerCase();
        if (!q) return $references;
        return $references.filter((r) => {
            const hay = [
                r.title,
                r.citeKey,
                r.year,
                r.container,
                ...r.authors,
            ]
                .join(" ")
                .toLowerCase();
            return hay.includes(q);
        });
    });

    const currentStyles = $derived.by<CitationStyle[]>(() => {
        if (!selectedRef) return [];
        const number = $references.findIndex((r) => r.id === selectedRef!.id) + 1;
        return citationStyles(selectedRef, number || 1);
    });

    // Keep the active option scrolled into view.
    $effect(() => {
        void refIndex;
        void styleIndex;
        if (!isOpen || !menuEl) return;
        menuEl
            .querySelector<HTMLElement>('[aria-selected="true"]')
            ?.scrollIntoView({ block: "nearest" });
    });

    async function openMenu(payload: OpenCiteMenuPayload) {
        anchorNodeKey = payload.key;
        triggerOffset = payload.offset;
        triggerLen = payload.tokenLen;
        menuRect = payload.rect;
        search = "";
        refIndex = 0;
        styleIndex = 0;
        selectedRef = null;
        step = "ref";
        isOpen = true;
        await tick();
        searchInput?.focus();
    }

    function closeMenu() {
        isOpen = false;
        selectedRef = null;
        search = "";
    }

    async function pickReference(ref: Reference) {
        selectedRef = ref;
        styleIndex = 0;
        step = "style";
        // The search input (which held keyboard focus) is unmounted in the
        // style step, so move focus to the menu container — otherwise arrow/
        // Enter keys would land on <body> and the user would be forced to the
        // mouse to pick a style.
        await tick();
        menuEl?.focus();
    }

    async function back() {
        step = "ref";
        selectedRef = null;
        styleIndex = 0;
        // The search input is re-mounted when we return to the ref step; wait
        // for it to exist before restoring focus.
        await tick();
        searchInput?.focus();
    }

    function applyStyle(styleText: string) {
        const key = anchorNodeKey;
        const offset = triggerOffset;
        const refId = selectedRef?.id ?? null;
        closeMenu();
        editor.update(() => {
            const node = getNodeByKey(key);
            if (!isTextNode(node)) return;
            // Replace the "/cite" trigger with the chosen citation text.
            const sel = node.select(offset, offset + triggerLen);
            sel.insertText(styleText);
            const fresh = getSelection();
            if (isRangeSelection(fresh)) {
                fresh.anchor.set(fresh.focus.key, fresh.focus.offset, fresh.focus.type);
            }
            // Mirror the citation into the auto-maintained "References" section
            // at the bottom of the document (deduplicated, in citation order).
            if (refId) addReferenceToList(refId);
        });
        editor.focus();
    }

    function onKeydown(e: KeyboardEvent) {
        if (!isOpen) return;
        const list = step === "ref" ? filteredRefs : currentStyles;
        const idx = step === "ref" ? refIndex : styleIndex;
        const setIdx = (v: number) => {
            if (step === "ref") refIndex = v;
            else styleIndex = v;
        };
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (list.length) setIdx((idx + 1) % list.length);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (list.length) setIdx((idx - 1 + list.length) % list.length);
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (step === "ref") {
                if (filteredRefs[refIndex]) pickReference(filteredRefs[refIndex]);
            } else if (currentStyles[styleIndex]) {
                applyStyle(currentStyles[styleIndex].text);
            }
        } else if (e.key === "Escape") {
            e.preventDefault();
            if (step === "style") back();
            else cancel();
        } else if (e.key === "Backspace" && step === "style" && !search) {
            e.preventDefault();
            back();
        }
    }

    function cancel() {
        closeMenu();
        editor.focus();
    }

    // Close when clicking outside the menu.
    function handlePointerDown(e: PointerEvent) {
        if (!isOpen) return;
        if (menuEl && !menuEl.contains(e.target as Node)) cancel();
    }
    $effect(() => {
        if (!isOpen) return;
        window.addEventListener("pointerdown", handlePointerDown, true);
        return () =>
            window.removeEventListener("pointerdown", handlePointerDown, true);
    });

    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        return {
            destroy() {
                node.remove();
            },
        };
    }

    const menuLeft = $derived(
        menuRect ? Math.min(menuRect.left, window.innerWidth - 304) : 0,
    );
    const menuTop = $derived(menuRect ? menuRect.bottom + 6 : 0);

    onMount(() => {
        return mergeRegister(
            editor.registerCommand(
                OPEN_CITE_MENU_COMMAND,
                (payload) => {
                    void openMenu(payload);
                    return true;
                },
                COMMAND_PRIORITY_EDITOR,
            ),
        );
    });
</script>

{#if isOpen && menuRect}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        use:portal
        bind:this={menuEl}
        tabindex="-1"
        transition:fly={{ y: 4, duration: 120, opacity: 0 }}
        class="fixed z-[60] flex w-72 flex-col overflow-hidden rounded-3xl border border-brand-sand-200 bg-white shadow-xl outline-none dark:border-[#414559] dark:bg-[#303446] dark:shadow-black/40"
        style="top: {menuTop}px; left: {menuLeft}px;"
        onkeydown={onKeydown}
    >
        {#if step === "ref"}
            <!-- Search box -->
            <div
                class="flex items-center gap-2 border-b border-brand-sand-100 px-3 py-2 dark:border-[#414559]"
            >
                <Icon
                    icon="solar:magnifer-linear"
                    width="0.85rem"
                    class="shrink-0 text-brand-charcoal-300 dark:text-[#838ba7]"
                />
                <input
                    bind:this={searchInput}
                    bind:value={search}
                    oninput={() => (refIndex = 0)}
                    placeholder={$t("cite.search_placeholder")}
                    spellcheck="false"
                    class="w-full bg-transparent text-[12px] text-brand-charcoal-900 placeholder-brand-charcoal-300 focus:outline-none dark:text-[#c6d0f5] dark:placeholder-[#626880]"
                />
            </div>
            <div class="max-h-64 overflow-y-auto py-1">
                {#if filteredRefs.length === 0}
                    <p
                        class="px-3 py-4 text-center text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]"
                    >
                        {$references.length === 0
                            ? $t("cite.empty")
                            : $t("cite.no_match")}
                    </p>
                {:else}
                    {#each filteredRefs as ref, i (ref.id)}
                        <!-- svelte-ignore a11y_interactive_supports_focus -->
                        <div
                            role="option"
                            aria-selected={i === refIndex}
                            class="flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors {i ===
                            refIndex
                                ? 'bg-brand-gold-100 dark:bg-[#414559]'
                                : 'hover:bg-brand-sand-50 dark:hover:bg-[#292c3c]'}"
                            onmousedown={(e) => {
                                e.preventDefault();
                                pickReference(ref);
                            }}
                            onmousemove={() => (refIndex = i)}
                        >
                            <span class="flex min-w-0 flex-col">
                                <span
                                    class="truncate text-[12px] font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                                >
                                    {shortAuthorLabel(ref)}
                                </span>
                                <span
                                    class="truncate text-[10px] text-brand-charcoal-300 dark:text-[#626880]"
                                >
                                    {ref.title}
                                </span>
                            </span>
                            <span
                                class="ml-auto shrink-0 rounded-full bg-brand-sand-100 px-1.5 py-0.5 font-mono text-[9px] text-brand-charcoal-300 dark:bg-[#363a4f] dark:text-[#838ba7]"
                            >
                                {ref.citeKey}
                            </span>
                        </div>
                    {/each}
                {/if}
            </div>
        {:else if selectedRef}
            <!-- Style picker for the chosen reference -->
            <div
                class="flex items-center gap-2 border-b border-brand-sand-100 px-3 py-2 dark:border-[#414559]"
            >
                <button
                    onmousedown={(e) => {
                        e.preventDefault();
                        back();
                    }}
                    aria-label={$t("cite.back")}
                    class="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-brand-charcoal-300 hover:bg-brand-sand-100 hover:text-brand-charcoal-900 dark:text-[#838ba7] dark:hover:bg-[#414559]"
                >
                    <Icon icon="solar:alt-arrow-left-linear" width="0.85rem" />
                </button>
                <span
                    class="truncate text-[11px] font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                >
                    {shortAuthorLabel(selectedRef)}
                </span>
            </div>
            <div class="max-h-64 overflow-y-auto py-1">
                {#each currentStyles as style, i (style.id)}
                    <!-- svelte-ignore a11y_interactive_supports_focus -->
                    <div
                        role="option"
                        aria-selected={i === styleIndex}
                        class="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 transition-colors {i ===
                        styleIndex
                            ? 'bg-brand-gold-100 dark:bg-[#414559]'
                            : 'hover:bg-brand-sand-50 dark:hover:bg-[#292c3c]'}"
                        onmousedown={(e) => {
                            e.preventDefault();
                            applyStyle(style.text);
                        }}
                        onmousemove={() => (styleIndex = i)}
                    >
                        <span
                            class="truncate text-[12px] text-brand-charcoal-900 dark:text-[#c6d0f5]"
                        >
                            {style.text}
                        </span>
                        <span
                            class="shrink-0 text-[9px] uppercase tracking-wide text-brand-charcoal-300 dark:text-[#626880]"
                        >
                            {style.label}
                        </span>
                    </div>
                {/each}
            </div>
        {/if}
    </div>
{/if}
