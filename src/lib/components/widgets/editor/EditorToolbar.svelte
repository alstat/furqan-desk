<script lang="ts">
    import Icon from "@iconify/svelte";
    import ControlCard from "../cards/ControlCard.svelte";
    import GroupCards from "../cards/GroupCards.svelte";
    import {
        editorTheme,
        cmFontSize,
        appDarkMode,
    } from "$lib/stores/editor.store";
    import { createTab, tabs, activeTabId } from "$lib/stores/tabs.store";
    import { isSidebar, surahOrientation } from "$lib/stores/quran.svelte";
    import { rotateSpring } from "$lib/stores/animation";
    import { t } from '$lib/i18n';

    // ── create new tab ─────────────────────────────────────────────────────────
    let showNewOptions = $state(false);

    function createNew(type: "lexical" | "typst" | "julia") {
        const tab = createTab(type);
        tabs.update((ts) => [...ts, tab]);
        activeTabId.set(tab.id);
        showNewOptions = false;

        // Auto-open the sidebar if it is currently collapsed
        if (!$isSidebar) {
            $isSidebar = true;
            rotateSpring.set(
                $surahOrientation() === "flex-row-reverse" ? 180 : 0,
            );
        }
    }

    const labelClass =
        "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-300";

    let { onOpenSettings = () => {} }: { onOpenSettings?: () => void } =
        $props();
</script>

{#snippet cardBody()}
    <div class="flex flex-col gap-3.5 px-4 pt-3 pb-4">
        <!-- Settings -->
        <div>
            <button
                onclick={onOpenSettings}
                class="cursor-pointer mt-1.5 w-full px-3 py-1 text-[11px] font-semibold rounded-full
					   border border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200
					   text-brand-charcoal-500 transition-colors flex items-center justify-center gap-1.5"
            >
                <Icon icon="solar:settings-bold-duotone" width="0.85rem" />
                {$t('editor.settings')}
            </button>
        </div>

        <!-- Divider -->
        <div class="border-t border-brand-sand-200"></div>

        <!-- App Theme -->
        <div>
            <span class={labelClass}>{$t('editor.app_theme')}</span>
            <div class="flex gap-2 mt-1.5">
                <button
                    onclick={() => appDarkMode.set(false)}
                    class={`cursor-pointer flex-1 px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-colors
						${
                            !$appDarkMode
                                ? "bg-brand-gold-400 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 active:bg-brand-gold-600/90"
                                : "border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 text-brand-charcoal-500"
                        }`}
                >
                    {$t('editor.theme_light')}
                </button>
                <button
                    onclick={() => appDarkMode.set(true)}
                    class={`cursor-pointer flex-1 px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-colors
						${
                            $appDarkMode
                                ? "bg-[#1a1d2e] text-brand-gold-400 border-[#3e4568]"
                                : "border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 text-brand-charcoal-500"
                        }`}
                >
                    {$t('editor.theme_dark')}
                </button>
            </div>
        </div>

        <!-- Divider -->
        <div class="border-t border-brand-sand-200"></div>

        <!-- Editor Theme -->
        <div>
            <span class={labelClass}>{$t('editor.editor_theme')}</span>
            <div class="flex gap-2 mt-1.5">
                <button
                    onclick={() => editorTheme.set("ayu-light")}
                    class={`cursor-pointer flex-1 px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-colors
						${
                            $editorTheme === "ayu-light"
                                ? "bg-brand-gold-400 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 active:bg-brand-gold-600/90"
                                : "border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5]"
                        }`}
                >
                    Ayu Light
                </button>
                <button
                    onclick={() => editorTheme.set("ayu-mirage")}
                    class={`cursor-pointer flex-1 px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-colors
						${
                            $editorTheme === "ayu-mirage"
                                ? "bg-[#1f2430] text-[#ffa759] border-[#ffa759]"
                                : "border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5]"
                        }`}
                >
                    Ayu Mirage
                </button>
            </div>
        </div>

        <!-- Divider -->
        <div class="border-t border-brand-sand-200"></div>

        <!-- Code Editor Font Size -->
        <div>
            <span class={labelClass}>{$t('editor.font_size')}</span>
            <div class="flex items-center gap-2 mt-1.5">
                <button
                    onclick={() => cmFontSize.set($cmFontSize - 1)}
                    disabled={$cmFontSize <= 10}
                    class="cursor-pointer w-7 h-7 flex items-center justify-center rounded-full border
						   border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200
						   text-brand-charcoal-500 font-semibold text-sm transition-colors
						   disabled:opacity-40 disabled:cursor-not-allowed"
                    title={$t('editor.font_size_decrease')}>
                    <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
                        <line x1="0" y1="1" x2="10" y2="1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
                <span
                    class="flex-1 text-center text-[12px] font-mono font-semibold text-brand-charcoal-500"
                >
                    {$cmFontSize}px
                </span>
                <button
                    onclick={() => cmFontSize.set($cmFontSize + 1)}
                    disabled={$cmFontSize >= 24}
                    class="cursor-pointer w-7 h-7 flex items-center justify-center rounded-full border
						   border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200
						   text-brand-charcoal-500 font-semibold text-sm transition-colors
						   disabled:opacity-40 disabled:cursor-not-allowed"
                    title={$t('editor.font_size_increase')}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <line x1="5" y1="0" x2="5" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
        </div>

        <!-- Divider -->
        <div class="border-t border-brand-sand-200"></div>

        <!-- Create new file -->
        <div>
            <span class={labelClass}>{$t('editor.new_file')}</span>
            {#if showNewOptions}
                <div class="flex gap-2 mt-1.5">
                    <button
                        onclick={() => createNew("lexical")}
                        class="cursor-pointer flex-1 px-2.5 py-1 text-[11px] font-semibold rounded-full
							   border border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200
							   text-brand-charcoal-500 transition-colors"
                    >
                        Lexical
                    </button>
                    <button
                        onclick={() => createNew("typst")}
                        class="cursor-pointer flex-1 px-2.5 py-1 text-[11px] font-semibold rounded-full
							   bg-brand-gold-400 hover:bg-brand-gold-500 dark:bg-brand-gold-600 dark:hover:bg-brand-gold-500 dark:text-[#1a1d2e] text-white transition-colors"
                    >
                        Typst
                    </button>
                    <button
                        onclick={() => createNew("julia")}
                        class="cursor-pointer flex-1 px-2.5 py-1 text-[11px] font-semibold rounded-full
						   bg-violet-500 hover:bg-violet-600 dark:bg-violet-800 dark:hover:bg-violet-700 dark:text-violet-200 text-white transition-colors"
                    >
                        Julia
                    </button>
                </div>
            {:else}
                <button
                    onclick={() => (showNewOptions = true)}
                    class="cursor-pointer mt-1.5 w-full px-3 py-1 text-[11px] font-semibold rounded-full
						   border border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200
						   text-brand-charcoal-500 transition-colors flex items-center justify-center gap-1.5"
                >
                    <Icon
                        icon="solar:add-circle-bold-duotone"
                        width="0.85rem"
                    />
                    {$t('editor.create_new')}
                </button>
            {/if}
        </div>

    </div>
{/snippet}

{#snippet collapsedIcon()}
    <Icon icon="solar:menu-dots-line-duotone" width="2em" />
{/snippet}

{#snippet controlCard()}
    <ControlCard cardTitle={$t('editor.app_controls')} {cardBody} />
{/snippet}

<GroupCards
    {controlCard}
    {collapsedIcon}
    xPosition={"left"}
    id="tour-editor-toolbar"
/>
