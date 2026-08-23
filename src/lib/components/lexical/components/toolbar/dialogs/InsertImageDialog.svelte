<script lang="ts">
    import { getCommands } from "$lexical/core/commands.js";
    import {
        getEditor,
        getActiveEditor,
    } from "$lexical/core/composerContext.js";
    import { tick, onDestroy } from "svelte";
    import { fly } from "svelte/transition";
    import { INSERT_IMAGE_COMMAND } from "$lexical/core/plugins/Image/ImagePlugin.svelte";
    import Icon from "@iconify/svelte";
    import { open as openDialog } from "@tauri-apps/plugin-dialog";
    import { readFile } from "@tauri-apps/plugin-fs";
    import { t } from '$lib/i18n';
    import { get } from 'svelte/store';
    import { bringToFront } from '$lib/stores/window-manager.store';
    import { headerHeight } from '$lib/stores/header.store';
    import DialogPanelHeader from '$lib/components/shared/DialogPanelHeader.svelte';

    const editor = getEditor();
    const activeEditor = getActiveEditor();

    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        return {
            destroy() {
                node.remove();
            },
        };
    }

    // ── state ────────────────────────────────────────────────────────────────
    let showModal = $state(false);
    let activeTab = $state<"url" | "file">("file");

    // URL tab
    let src = $state("");
    let altText = $state("");

    // File tab
    let fileSrc = $state("");
    let fileName = $state("");
    let fileAltText = $state("");
    let loadingFile = $state(false);
    let fileError = $state("");

    let isDisabled = $derived(
        activeTab === "url"
            ? src === ""
            : activeTab === "file"
              ? fileSrc === ""
              : true,
    );

    // ── lifecycle ────────────────────────────────────────────────────────────
    export function open() {
        src = "";
        altText = "";
        fileSrc = "";
        fileName = "";
        fileAltText = "";
        fileError = "";
        activeTab = "file";
        showModal = true;
    }

    async function close() {
        showModal = false;
        await tick();
        getCommands().FocusEditor.execute(editor);
    }

    // ── file picking ─────────────────────────────────────────────────────────
    const IMAGE_EXTENSIONS = [
        "png",
        "jpg",
        "jpeg",
        "gif",
        "webp",
        "svg",
        "bmp",
        "avif",
    ];

    const MIME: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
        bmp: "image/bmp",
        avif: "image/avif",
    };

    function uint8ToBase64(arr: Uint8Array): string {
        let binary = "";
        const chunk = 8192;
        for (let i = 0; i < arr.length; i += chunk)
            binary += String.fromCharCode(...arr.subarray(i, i + chunk));
        return btoa(binary);
    }

    async function browseFile() {
        fileError = "";
        const selected = await openDialog({
            title: get(t)('dialog.select_image_title'),
            filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }],
            multiple: false,
        });
        if (!selected || typeof selected !== "string") return;

        loadingFile = true;
        try {
            const bytes = await readFile(selected);
            const ext = selected.split(".").pop()?.toLowerCase() ?? "png";
            const mime = MIME[ext] ?? "image/png";
            fileSrc = `data:${mime};base64,${uint8ToBase64(bytes)}`;
            fileName = selected.split(/[\\/]/).pop() ?? selected;
            if (!fileAltText) fileAltText = fileName.replace(/\.[^.]+$/, "");
        } catch (e) {
            fileError = e instanceof Error ? e.message : "Failed to read file.";
            fileSrc = "";
            fileName = "";
        } finally {
            loadingFile = false;
        }
    }

    // ── insert ───────────────────────────────────────────────────────────────
    function insertImage() {
        const finalSrc = activeTab === "url" ? src : fileSrc;
        const finalAlt = activeTab === "url" ? altText : fileAltText;
        $activeEditor.dispatchCommand(INSERT_IMAGE_COMMAND, {
            altText: finalAlt,
            src: finalSrc,
        });
        src = "";
        altText = "";
        fileSrc = "";
        fileName = "";
        fileAltText = "";
        fileError = "";
    }

    // ── Sheet placement ─────────────────────────────────────────────────────
    const PANEL_W = 384; // matches max-w-sm

    let zIndex = $state(500);
    let initialized = false;

    // The sheet hangs off the header, so only its stacking needs setting.
    $effect(() => {
        if (showModal && !initialized) {
            zIndex = bringToFront();
            initialized = true;
        }
        if (!showModal) initialized = false;
    });

</script>

{#if showModal}
    <!-- Backdrop: a click anywhere outside dismisses the sheet, which no longer
         has a close button of its own. Transparent — this is a panel hanging
         off the header, not a modal over the page. -->
    <div
        use:portal
        role="presentation"
        class="fixed inset-0"
        style="z-index:{zIndex - 1};"
        onclick={close}
        onkeydown={() => {}}
    ></div>

    <div
        use:portal
        transition:fly={{ y: -10, duration: 180, opacity: 0 }}
        role="dialog"
        aria-label={$t('dialog.insert_image')}
        tabindex="-1"
        class="fixed flex flex-col -translate-x-1/2 rounded-b-xl border border-t-0 border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-[0_14px_28px_-10px_rgba(0,0,0,0.28)] dark:shadow-[0_14px_28px_-10px_rgba(0,0,0,0.55)] overflow-hidden"
        style="left:50%; top:{$headerHeight}px; width:{PANEL_W}px; z-index:{zIndex};"
        onkeydown={(e) => { if (e.key === 'Escape') close(); }}
    >
        <!-- Header -->
        <DialogPanelHeader
            icon="solar:gallery-bold-duotone"
            title={$t('dialog.insert_image')}
            isDragging={false}
            hideClose={true}
            sheet={true}
            onClose={close}
            onpointerdown={() => {}}
        >
            {#snippet children()}
                <!-- Tabs -->
                <div
                    class="mx-4 mb-2 flex gap-1 rounded-full bg-brand-gold-200/50 dark:bg-[#414559]/50 p-1"
                >
                    <button
                        onclick={() => (activeTab = "file")}
                        aria-pressed={activeTab === "file"}
                        class="cursor-pointer flex flex-1 items-center justify-center gap-1.5 rounded-full py-1 text-[11px] font-semibold transition-colors
                            {activeTab === 'file'
                            ? 'bg-white dark:bg-[#51576d] text-brand-charcoal-900 dark:text-[#c6d0f5] shadow-sm'
                            : 'text-brand-gold-600 dark:text-[#838ba7] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]'}"
                    >
                        <Icon icon="solar:folder-open-bold" width="0.75rem" />
                        {$t('dialog.tab_local_file')}
                    </button>
                    <button
                        onclick={() => (activeTab = "url")}
                        aria-pressed={activeTab === "url"}
                        class="cursor-pointer flex flex-1 items-center justify-center gap-1.5 rounded-full py-1 text-[11px] font-semibold transition-colors
                            {activeTab === 'url'
                            ? 'bg-white dark:bg-[#51576d] text-brand-charcoal-900 dark:text-[#c6d0f5] shadow-sm'
                            : 'text-brand-gold-600 dark:text-[#838ba7] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]'}"
                    >
                        <Icon icon="solar:link-bold" width="0.75rem" />
                        {$t('dialog.tab_web_url')}
                    </button>
                </div>
            {/snippet}
        </DialogPanelHeader>

        <!-- Body -->
        <div
            class="px-5 py-5 bg-brand-sand-50 dark:bg-[#232634] flex flex-col gap-3"
        >
            {#if activeTab === "url"}
                <!-- URL tab -->
                <div class="flex flex-col gap-1.5">
                    <label
                        class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300"
                        >{$t('dialog.image_url')}</label
                    >
                    <input
                        type="url"
                        placeholder="https://example.com/image.jpg"
                        bind:value={src}
                        data-test-id="image-modal-url-input"
                        class="w-full rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-2.5 text-[11px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 transition-colors"
                    />
                </div>
                <div class="flex flex-col gap-1.5">
                    <label
                        class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300"
                        >{$t('dialog.alt_text')}</label
                    >
                    <input
                        type="text"
                        placeholder={$t('dialog.alt_text_placeholder')}
                        bind:value={altText}
                        data-test-id="image-modal-alt-text-input"
                        class="w-full rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-2.5 text-[11px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 transition-colors"
                    />
                </div>
            {:else}
                <!-- Local file tab -->
                <div class="flex flex-col gap-1.5">
                    <label
                        class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300"
                        >{$t('dialog.image_file')}</label
                    >
                    <button
                        onclick={browseFile}
                        disabled={loadingFile}
                        class="cursor-pointer flex items-center gap-2 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-2.5 text-[11px] transition-colors hover:border-brand-gold-400 hover:bg-brand-gold-50 dark:hover:bg-[#292c3c] disabled:opacity-50"
                    >
                        {#if loadingFile}
                            <Icon
                                icon="solar:refresh-bold"
                                class="animate-spin text-brand-gold-500 shrink-0"
                                width="0.85rem"
                            />
                            <span
                                class="text-brand-charcoal-400 dark:text-[#838ba7]"
                                >{$t('explorer.loading')}</span
                            >
                        {:else if fileName}
                            <Icon
                                icon="solar:check-circle-bold"
                                class="text-brand-gold-500 shrink-0"
                                width="0.85rem"
                            />
                            <span
                                class="truncate text-brand-charcoal-900 dark:text-[#c6d0f5] font-medium"
                                >{fileName}</span
                            >
                            <span
                                class="ml-auto shrink-0 text-brand-charcoal-300 dark:text-[#626880]"
                                >{$t('explorer.change')}</span
                            >
                        {:else}
                            <Icon
                                icon="solar:folder-open-bold-duotone"
                                class="text-brand-gold-400 shrink-0"
                                width="0.85rem"
                            />
                            <span
                                class="text-brand-charcoal-400 dark:text-[#838ba7]"
                                >{$t('dialog.browse_files')}</span
                            >
                        {/if}
                    </button>
                </div>

                <!-- Thumbnail preview -->
                {#if fileSrc}
                    <div
                        class="flex items-center justify-center rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] overflow-hidden"
                        style="max-height: 140px;"
                    >
                        <img
                            src={fileSrc}
                            alt="preview"
                            class="max-h-35 object-contain"
                        />
                    </div>
                {/if}

                {#if fileError}
                    <p
                        class="flex items-center gap-1 text-[11px] text-red-500"
                    >
                        <Icon
                            icon="solar:danger-circle-bold"
                            width="0.75rem"
                        />{fileError}
                    </p>
                {/if}

                <div class="flex flex-col gap-1.5">
                    <label
                        class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300"
                        >{$t('dialog.alt_text')}</label
                    >
                    <input
                        type="text"
                        placeholder={$t('dialog.alt_text_placeholder')}
                        bind:value={fileAltText}
                        data-test-id="image-modal-file-alt-text-input"
                        class="w-full rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-2.5 text-[11px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 transition-colors"
                    />
                </div>
            {/if}

            <button
                data-test-id="image-modal-confirm-btn"
                disabled={isDisabled}
                onclick={insertImage}
                class="cursor-pointer flex w-full items-center justify-center gap-1.5 rounded-full bg-brand-gold-400 py-1.5 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 active:bg-brand-gold-600/90 disabled:opacity-50 transition-colors mt-1"
            >
                <Icon icon="solar:gallery-add-bold" width="0.8rem" />
                {$t('dialog.insert_image')}
            </button>
        </div>
    </div>
{/if}
