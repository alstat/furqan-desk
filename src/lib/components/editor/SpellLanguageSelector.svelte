<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import {
        spellCheckEnabled,
        spellLanguage,
        spellLanguages,
        installLanguage,
        initSpellcheck,
        type SpellLang,
    } from "$lib/stores/spellcheck.store";
    import { onMount } from "svelte";

    // `up` opens the panel above the button (for editors whose toolbar sits at
    // the bottom, e.g. the Lexical composer).
    //
    // `open` is bindable because the dock this sits in fades itself down when
    // the pointer is elsewhere: an open menu has to be able to say so, or it
    // ghosts out to 35% and reads as an empty box with its contents wiped (see
    // EditorComposer).
    let { up = false, open = $bindable(false) }: { up?: boolean; open?: boolean } =
        $props();
    let installing = $state<string | null>(null);
    let anchor = $state<HTMLDivElement | null>(null);

    onMount(() => {
        if ($spellLanguages.length === 0) void initSpellcheck();
    });

    let installed = $derived($spellLanguages.filter((l) => l.installed));
    let downloadable = $derived($spellLanguages.filter((l) => !l.installed));
    let currentName = $derived(
        $spellLanguages.find((l) => l.code === $spellLanguage)?.name ??
            $spellLanguage,
    );

    function choose(l: SpellLang) {
        spellLanguage.set(l.code);
        if (!$spellCheckEnabled) spellCheckEnabled.set(true);
        open = false;
    }

    async function download(l: SpellLang) {
        installing = l.code;
        try {
            await installLanguage(l.code);
            spellLanguage.set(l.code);
            spellCheckEnabled.set(true);
        } catch {
            /* surfaced by disabled state clearing */
        } finally {
            installing = null;
        }
    }

    /**
     * Dismissal. A pointer press outside the anchor is the ordinary way out,
     * but it is not the only way to leave the menu behind: Escape is expected
     * to work in any menu, and a press that lands in an iframe or in another
     * window never reaches this document at all — that one arrives as a blur.
     * Without those two the panel can be stranded open, and in a dock that
     * fades itself it is then near-invisible rather than obviously stuck.
     */
    $effect(() => {
        if (!open) return;

        const onPointerDown = (e: PointerEvent) => {
            if (anchor && !anchor.contains(e.target as Node)) open = false;
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") open = false;
        };
        const onBlur = () => (open = false);

        window.addEventListener("pointerdown", onPointerDown, true);
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("blur", onBlur);
        return () => {
            window.removeEventListener("pointerdown", onPointerDown, true);
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("blur", onBlur);
        };
    });
</script>

<div class="relative" bind:this={anchor}>
    <button
        onclick={() => (open = !open)}
        title={$t("spellcheck.language")}
        class="flex cursor-pointer items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-colors
               {$spellCheckEnabled
            ? 'bg-brand-gold-100 dark:bg-[#e5c890]/15 text-brand-gold-600 dark:text-brand-gold-400 hover:bg-brand-gold-200 dark:hover:bg-[#e5c890]/25'
            : 'bg-brand-sand-200 dark:bg-[#414559] text-brand-charcoal-500 dark:text-[#838ba7] hover:bg-brand-sand-400 dark:hover:bg-[#51566a]'}"
    >
        <Icon icon="material-symbols:spellcheck-rounded" width="12" />
        <span>{$spellCheckEnabled ? currentName || "—" : $t("spellcheck.off")}</span>
        <Icon
            icon="solar:alt-arrow-down-linear"
            width="9"
            class={up ? "rotate-180" : ""}
        />
    </button>

    {#if open}
        <div
            class="absolute right-0 z-[9999] w-56 max-h-72 flex flex-col overflow-hidden rounded-xl shadow-lg text-[12px]
                   bg-white dark:bg-[#292c3c] border border-stone-200 dark:border-[#414559]
                   text-brand-charcoal-600 dark:text-[#c6d0f5]
                   {up ? 'bottom-full mb-1' : 'top-full mt-1'}"
            role="menu"
        >
          <!-- Inner scroller: the parent's rounded overflow-hidden clips this
               element's scrollbar so it can't spill past the rounded corners. -->
          <div class="default-scroll overflow-y-auto py-2">
            <!-- On/off -->
            <button
                type="button"
                class="flex w-full items-center justify-between px-3 py-1.5 cursor-pointer
                       hover:bg-brand-gold-100 dark:hover:bg-[#e5c890]/15"
                onclick={() => spellCheckEnabled.set(!$spellCheckEnabled)}
            >
                <span class="font-medium">{$t("spellcheck.enable")}</span>
                <span
                    class="flex h-3.5 w-6 items-center rounded-full px-0.5 transition-colors
                           {$spellCheckEnabled
                        ? 'bg-brand-gold-500 justify-end'
                        : 'bg-stone-300 dark:bg-[#51566a] justify-start'}"
                >
                    <span class="h-2.5 w-2.5 rounded-full bg-white"></span>
                </span>
            </button>

            <div class="my-1 border-t border-stone-200 dark:border-[#414559]"></div>
            <div
                class="px-3 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-charcoal-300"
            >
                {$t("spellcheck.language")}
            </div>

            {#each installed as l}
                <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={l.code === $spellLanguage}
                    class="flex w-full items-center justify-between px-3 py-1 cursor-pointer
                           hover:bg-brand-gold-100 dark:hover:bg-[#e5c890]/15"
                    onclick={() => choose(l)}
                >
                    <span>{l.name}</span>
                    {#if l.code === $spellLanguage && $spellCheckEnabled}
                        <Icon
                            icon="solar:check-circle-bold"
                            width="13"
                            class="text-brand-gold-500"
                        />
                    {/if}
                </button>
            {/each}

            {#if downloadable.length > 0}
                <div
                    class="my-1 border-t border-stone-200 dark:border-[#414559]"
                ></div>
                <div
                    class="px-3 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-charcoal-300"
                >
                    {$t("spellcheck.more_languages")}
                </div>
                {#each downloadable as l}
                    <button
                        type="button"
                        class="flex w-full items-center justify-between px-3 py-1 cursor-pointer
                               hover:bg-brand-gold-100 dark:hover:bg-[#e5c890]/15
                               disabled:opacity-50 disabled:cursor-wait"
                        disabled={installing !== null}
                        onclick={() => download(l)}
                    >
                        <span>{l.name}</span>
                        {#if installing === l.code}
                            <Icon
                                icon="solar:refresh-bold"
                                width="12"
                                class="animate-spin text-brand-charcoal-300"
                            />
                        {:else}
                            <Icon
                                icon="solar:download-minimalistic-linear"
                                width="12"
                                class="text-brand-charcoal-300"
                            />
                        {/if}
                    </button>
                {/each}
            {/if}
          </div>
        </div>
    {/if}
</div>
