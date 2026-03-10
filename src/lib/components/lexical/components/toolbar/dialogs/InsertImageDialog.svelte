<script lang="ts">
    import { getCommands } from '$lexical/core/commands.js';
    import { getEditor, getActiveEditor } from '$lexical/core/composerContext.js';
    import { tick } from 'svelte';
    import { INSERT_IMAGE_COMMAND } from '$lexical/core/plugins/Image/ImagePlugin.svelte';
    import Icon from '@iconify/svelte';
    import { open as openDialog } from '@tauri-apps/plugin-dialog';
    import { readFile } from '@tauri-apps/plugin-fs';

    const editor = getEditor();
    const activeEditor = getActiveEditor();

    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        return { destroy() { node.remove(); } };
    }

    // ── state ────────────────────────────────────────────────────────────────
    let showModal  = $state(false);
    let activeTab  = $state<'url' | 'file'>('url');

    // URL tab
    let src     = $state('');
    let altText = $state('');

    // File tab
    let fileSrc      = $state('');
    let fileName     = $state('');
    let fileAltText  = $state('');
    let loadingFile  = $state(false);
    let fileError    = $state('');

    let isDisabled = $derived(
        activeTab === 'url'  ? src === '' :
        activeTab === 'file' ? fileSrc === '' : true
    );

    // ── lifecycle ────────────────────────────────────────────────────────────
    export function open() {
        src = ''; altText = '';
        fileSrc = ''; fileName = ''; fileAltText = ''; fileError = '';
        activeTab = 'url';
        showModal = true;
    }

    async function close() {
        showModal = false;
        await tick();
        getCommands().FocusEditor.execute(editor);
    }

    // ── file picking ─────────────────────────────────────────────────────────
    const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'];

    const MIME: Record<string, string> = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
        bmp: 'image/bmp', avif: 'image/avif',
    };

    function uint8ToBase64(arr: Uint8Array): string {
        let binary = '';
        const chunk = 8192;
        for (let i = 0; i < arr.length; i += chunk)
            binary += String.fromCharCode(...arr.subarray(i, i + chunk));
        return btoa(binary);
    }

    async function browseFile() {
        fileError = '';
        const selected = await openDialog({
            title: 'Select an image',
            filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }],
            multiple: false,
        });
        if (!selected || typeof selected !== 'string') return;

        loadingFile = true;
        try {
            const bytes = await readFile(selected);
            const ext   = selected.split('.').pop()?.toLowerCase() ?? 'png';
            const mime  = MIME[ext] ?? 'image/png';
            fileSrc     = `data:${mime};base64,${uint8ToBase64(bytes)}`;
            fileName    = selected.split(/[\\/]/).pop() ?? selected;
            if (!fileAltText) fileAltText = fileName.replace(/\.[^.]+$/, '');
        } catch (e) {
            fileError = e instanceof Error ? e.message : 'Failed to read file.';
            fileSrc = '';
            fileName = '';
        } finally {
            loadingFile = false;
        }
    }

    // ── insert ───────────────────────────────────────────────────────────────
    function insertImage() {
        const finalSrc = activeTab === 'url' ? src : fileSrc;
        const finalAlt = activeTab === 'url' ? altText : fileAltText;
        $activeEditor.dispatchCommand(INSERT_IMAGE_COMMAND, { altText: finalAlt, src: finalSrc });
        close();
    }
</script>

{#if showModal}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
        use:portal
        class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-brand-charcoal-900/40 backdrop-blur-sm"
        onclick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
        <div class="flex w-full max-w-sm flex-col rounded-2xl bg-white dark:bg-[#303446] shadow-2xl overflow-hidden">

            <!-- Header -->
            <div class="shrink-0 bg-brand-gold-100 border-b border-brand-gold-200 px-5 py-4">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                        <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-gold-200">
                            <Icon icon="solar:gallery-bold-duotone" class="text-brand-gold-600" width="1rem" />
                        </div>
                        <h2 class="text-sm font-semibold text-brand-charcoal-900">Insert Image</h2>
                    </div>
                    <button
                        onclick={close}
                        class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold-200 text-brand-gold-600 hover:bg-brand-gold-200/80 transition-colors"
                    >
                        <Icon icon="solar:close-circle-bold" width="1rem" />
                    </button>
                </div>

                <!-- Tabs -->
                <div class="mt-3 flex gap-1 rounded-xl bg-brand-gold-200/50 p-1">
                    <button
                        onclick={() => activeTab = 'url'}
                        class="cursor-pointer flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-semibold transition-colors
                            {activeTab === 'url'
                                ? 'bg-white text-brand-charcoal-900 shadow-sm'
                                : 'text-brand-gold-700 hover:text-brand-charcoal-900'}"
                    >
                        <Icon icon="solar:link-bold" width="0.75rem" />
                        Web URL
                    </button>
                    <button
                        onclick={() => activeTab = 'file'}
                        class="cursor-pointer flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-semibold transition-colors
                            {activeTab === 'file'
                                ? 'bg-white text-brand-charcoal-900 shadow-sm'
                                : 'text-brand-gold-700 hover:text-brand-charcoal-900'}"
                    >
                        <Icon icon="solar:folder-open-bold" width="0.75rem" />
                        Local File
                    </button>
                </div>
            </div>

            <!-- Body -->
            <div class="px-5 py-4 bg-brand-sand-50 flex flex-col gap-3">

                {#if activeTab === 'url'}
                    <!-- URL tab -->
                    <div class="flex flex-col gap-1.5">
                        <label class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300">Image URL</label>
                        <input
                            type="url"
                            placeholder="https://example.com/image.jpg"
                            bind:value={src}
                            data-test-id="image-modal-url-input"
                            class="w-full rounded-xl border border-brand-sand-200 bg-brand-sand-100 px-3 py-2.5 text-xs text-brand-charcoal-900 placeholder-brand-charcoal-300 focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 transition-colors"
                        />
                    </div>
                    <div class="flex flex-col gap-1.5">
                        <label class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300">Alt Text</label>
                        <input
                            type="text"
                            placeholder="Descriptive alternative text"
                            bind:value={altText}
                            data-test-id="image-modal-alt-text-input"
                            class="w-full rounded-xl border border-brand-sand-200 bg-brand-sand-100 px-3 py-2.5 text-xs text-brand-charcoal-900 placeholder-brand-charcoal-300 focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 transition-colors"
                        />
                    </div>

                {:else}
                    <!-- Local file tab -->
                    <div class="flex flex-col gap-1.5">
                        <label class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300">Image File</label>
                        <button
                            onclick={browseFile}
                            disabled={loadingFile}
                            class="cursor-pointer flex items-center gap-2 rounded-xl border border-brand-sand-200 bg-brand-sand-100 px-3 py-2.5 text-xs transition-colors hover:border-brand-gold-400 hover:bg-brand-gold-50 disabled:opacity-50"
                        >
                            {#if loadingFile}
                                <Icon icon="solar:refresh-bold" class="animate-spin text-brand-gold-500 shrink-0" width="0.85rem" />
                                <span class="text-brand-charcoal-400">Loading…</span>
                            {:else if fileName}
                                <Icon icon="solar:check-circle-bold" class="text-brand-gold-500 shrink-0" width="0.85rem" />
                                <span class="truncate text-brand-charcoal-900 font-medium">{fileName}</span>
                                <span class="ml-auto shrink-0 text-brand-charcoal-300">Change</span>
                            {:else}
                                <Icon icon="solar:folder-open-bold-duotone" class="text-brand-gold-400 shrink-0" width="0.85rem" />
                                <span class="text-brand-charcoal-400">Browse file system…</span>
                            {/if}
                        </button>
                    </div>

                    <!-- Thumbnail preview -->
                    {#if fileSrc}
                        <div class="flex items-center justify-center rounded-xl border border-brand-sand-200 bg-brand-sand-100 overflow-hidden" style="max-height: 140px;">
                            <img src={fileSrc} alt="preview" class="max-h-35 object-contain" />
                        </div>
                    {/if}

                    {#if fileError}
                        <p class="flex items-center gap-1 text-xs text-red-500">
                            <Icon icon="solar:danger-circle-bold" width="0.75rem" />{fileError}
                        </p>
                    {/if}

                    <div class="flex flex-col gap-1.5">
                        <label class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300">Alt Text</label>
                        <input
                            type="text"
                            placeholder="Descriptive alternative text"
                            bind:value={fileAltText}
                            data-test-id="image-modal-file-alt-text-input"
                            class="w-full rounded-xl border border-brand-sand-200 bg-brand-sand-100 px-3 py-2.5 text-xs text-brand-charcoal-900 placeholder-brand-charcoal-300 focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 transition-colors"
                        />
                    </div>
                {/if}

                <button
                    data-test-id="image-modal-confirm-btn"
                    disabled={isDisabled}
                    onclick={insertImage}
                    class="cursor-pointer flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-gold-400 py-2 text-xs font-semibold text-white hover:bg-brand-gold-600 active:bg-brand-gold-600/90 disabled:opacity-50 transition-colors mt-1"
                >
                    <Icon icon="solar:gallery-add-bold" width="0.8rem" />
                    Insert Image
                </button>
            </div>

        </div>
    </div>
{/if}
