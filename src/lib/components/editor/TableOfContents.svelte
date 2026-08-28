<script lang="ts">
    import { fly } from "svelte/transition";
    import { onDestroy } from "svelte";
    import { $getRoot as getRoot } from "lexical";
    import { $isHeadingNode as isHeadingNode } from "@lexical/rich-text";
    import { tocOpen, tocAnchorRect, lexicalEditorInstance } from "$lib/stores/editor.store";
    import { hideSurahPage } from "$lib/stores/quran.svelte";
    import { activeTab } from "$lib/stores/tabs.store";
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import { bringToFront } from "$lib/stores/window-manager.store";

    interface TocEntry {
        key: string;
        text: string;
        tag: "h1" | "h2" | "h3";
    }

    const PANEL_W = 208;

    let headings = $state<TocEntry[]>([]);
    let activeKey = $state<string | null>(null);
    let x = $state(0);
    let y = $state(0);
    let zIndex = $state(500);
    let isDragging = $state(false);
    let dragStartX = 0, dragStartY = 0, startX = 0, startY = 0;
    let initialized = false;

    $effect(() => {
        if ($tocOpen && !initialized) {
            const rect = $tocAnchorRect;
            x = rect ? Math.min(rect.right + 8, window.innerWidth - PANEL_W - 8) : Math.max(0, (window.innerWidth - PANEL_W) / 2);
            y = rect ? Math.max(8, rect.top) : Math.max(8, (window.innerHeight - 420) * 0.25);
            zIndex = bringToFront();
            initialized = true;
        }
        if (!$tocOpen) initialized = false;
    });

    function startDrag(e: PointerEvent) {
        isDragging = true;
        dragStartX = e.clientX; dragStartY = e.clientY;
        startX = x; startY = y;
        window.addEventListener('pointermove', onDrag);
        window.addEventListener('pointerup', stopDrag, { once: true });
    }
    function onDrag(e: PointerEvent) {
        x = Math.max(0, Math.min(window.innerWidth - PANEL_W, startX + (e.clientX - dragStartX)));
        y = Math.max(0, Math.min(window.innerHeight - 60, startY + (e.clientY - dragStartY)));
    }
    function stopDrag() {
        isDragging = false;
        window.removeEventListener('pointermove', onDrag);
    }
    onDestroy(() => {
        if (typeof window !== 'undefined') window.removeEventListener('pointermove', onDrag);
    });

    $effect(() => {
        const editor = $lexicalEditorInstance;
        if (!editor) {
            headings = [];
            return;
        }
        const unregister = editor.registerUpdateListener(({ editorState }) => {
            editorState.read(() => {
                const entries: TocEntry[] = [];
                getRoot()
                    .getChildren()
                    .forEach((node) => {
                        if (isHeadingNode(node)) {
                            const tag = node.getTag();
                            if (tag === "h1" || tag === "h2" || tag === "h3") {
                                const text = node.getTextContent().trim();
                                if (text)
                                    entries.push({
                                        key: node.getKey(),
                                        text,
                                        tag,
                                    });
                            }
                        }
                    });
                // Reassigning unconditionally re-rendered the outline on every
                // keystroke, even though a heading only changes when one is
                // added, removed, retitled or re-levelled. Comparing first
                // keeps typing inside a paragraph free.
                if (!sameHeadings(headings, entries)) headings = entries;
            });
        });
        return unregister;
    });

    function sameHeadings(a: TocEntry[], b: TocEntry[]): boolean {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i].key !== b[i].key || a[i].text !== b[i].text || a[i].tag !== b[i].tag) {
                return false;
            }
        }
        return true;
    }

    function scrollToHeading(key: string) {
        activeKey = key;
        $lexicalEditorInstance
            ?.getElementByKey(key)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // // When Hide Surah Page is toggled on AND the active tab is Lexical: auto-open
    // let prevHideSurahPage = false;
    // $effect(() => {
    //     const hidden = $hideSurahPage();
    //     if (hidden && !prevHideSurahPage && $activeTab?.type === "lexical") {
    //         $tocOpen = true;
    //     }
    //     prevHideSurahPage = hidden;
    // });
</script>

<!-- Floating panel — anchored below the TOC icon button in the sidebar -->
{#if $tocOpen && $tocAnchorRect}
    <div
        transition:fly={{ y: 9, duration: 180, opacity: 0 }}
        class="fixed max-h-[65vh]
		       rounded-xl overflow-hidden flex flex-col
		       bg-white dark:bg-[#292c3c]
		       border border-stone-200 dark:border-[#414559]
		       shadow-md shadow-black/5 dark:shadow-black/20"
        role="dialog"
        style="top: {y}px; left: {x}px; width: {PANEL_W}px; z-index: {zIndex};"
        onpointerdown={() => { zIndex = bringToFront(); }}
    >
        <!-- Header -->
        <div
            class="shrink-0 flex items-center gap-2 px-4 py-2.5
			       border-b border-stone-200 dark:border-[#414559]
			       bg-brand-sand-50 dark:bg-[#232634]
			       {isDragging ? 'cursor-grabbing' : 'cursor-grab'}"
            onpointerdown={startDrag}
        >
            <Icon
                icon="solar:list-bold-duotone"
                width="0.8rem"
                class="shrink-0 text-brand-gold-500 dark:text-brand-gold-400"
            />
            <span
                class="flex-1 text-[0.625rem] font-bold uppercase tracking-widest
				       text-brand-gold-600 dark:text-brand-gold-400 select-none"
            >
                {$t("toc.title")}
            </span>
            <!-- <button
                onclick={() => ($tocOpen = false)}
                aria-label="Close contents"
                class="cursor-pointer text-brand-charcoal-300 dark:text-[#626880]
				       hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5] transition-colors"
            >
                <Icon icon="solar:close-circle-bold" width="0.8rem" />
            </button> -->
        </div>

        <!-- TOC list -->
        <nav class="flex-1 overflow-y-auto flex flex-col py-2 px-1.5 gap-px">
            {#if headings.length === 0}
                <p
                    class="text-[0.6875rem] text-brand-charcoal-300 dark:text-[#626880]
					       italic text-center px-2 py-4 select-none leading-relaxed"
                >
                    {$t("toc.empty").split("\n")[0]}<br />{$t(
                        "toc.empty",
                    ).split("\n")[1]}
                </p>
            {:else}
                {#each headings as { key, text, tag }}
                    {@const isActive = activeKey === key}
                    <button
                        onclick={() => scrollToHeading(key)}
                        class="group text-left w-full rounded-full cursor-pointer transition-all duration-150
						       border-l-2 py-1 pr-2
						       {isActive
                            ? 'bg-brand-gold-50 dark:bg-[#3a3428]/20 border-brand-gold-400 dark:border-brand-gold-400'
                            : 'border-transparent hover:bg-brand-sand-50 dark:hover:bg-[#363a4f] hover:border-brand-gold-200 dark:hover:border-brand-gold-600'}
						       {tag === 'h1' ? 'pl-2' : tag === 'h2' ? 'pl-4' : 'pl-6'}"
                        title={text}
                    >
                        {#if tag === "h1"}
                            <span class="flex items-center gap-1.5 min-w-0">
                                <span
                                    class="shrink-0 text-[0.4375rem] leading-none
									       {isActive
                                        ? 'text-brand-gold-500 dark:text-brand-gold-400'
                                        : 'text-brand-gold-400 dark:text-brand-gold-600 group-hover:text-brand-gold-500 dark:group-hover:text-brand-gold-400'}"
                                    >◆</span
                                >
                                <span
                                    class="text-[0.8125rem] font-semibold truncate transition-colors
									       {isActive
                                        ? 'text-brand-gold-600 dark:text-brand-gold-400'
                                        : 'text-brand-charcoal-900 dark:text-[#c6d0f5] group-hover:text-brand-gold-600 dark:group-hover:text-brand-gold-400'}"
                                    >{text}</span
                                >
                            </span>
                        {:else if tag === "h2"}
                            <span class="flex items-center gap-1.5 min-w-0">
                                <span
                                    class="shrink-0 text-[0.75rem] font-light leading-none
									       {isActive
                                        ? 'text-brand-gold-400 dark:text-brand-gold-500'
                                        : 'text-brand-charcoal-300 dark:text-[#626880] group-hover:text-brand-gold-400 dark:group-hover:text-brand-gold-500'}"
                                    >›</span
                                >
                                <span
                                    class="text-[0.75rem] font-medium truncate transition-colors
									       {isActive
                                        ? 'text-brand-charcoal-900 dark:text-[#c6d0f5]'
                                        : 'text-brand-charcoal-500 dark:text-[#b5bfe2] group-hover:text-brand-charcoal-900 dark:group-hover:text-[#c6d0f5]'}"
                                    >{text}</span
                                >
                            </span>
                        {:else}
                            <span class="flex items-center gap-1.5 min-w-0">
                                <span
                                    class="shrink-0 text-[0.6875rem] leading-none
									       {isActive
                                        ? 'text-brand-charcoal-300 dark:text-[#838ba7]'
                                        : 'text-brand-charcoal-300 dark:text-[#626880] group-hover:text-brand-charcoal-300 dark:group-hover:text-[#838ba7]'}"
                                    >·</span
                                >
                                <span
                                    class="text-[0.6875rem] font-normal truncate transition-colors
									       {isActive
                                        ? 'text-brand-charcoal-500 dark:text-[#b5bfe2]'
                                        : 'text-brand-charcoal-300 dark:text-[#838ba7] group-hover:text-brand-charcoal-500 dark:group-hover:text-[#b5bfe2]'}"
                                    >{text}</span
                                >
                            </span>
                        {/if}
                    </button>
                {/each}
            {/if}
        </nav>
    </div>
{/if}
