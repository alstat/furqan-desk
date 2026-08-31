<!--
  The Workbook window — a board of its own, opened from the editor toolbar's
  "Create Workbook". Same window chrome as the other satellite windows; the
  board itself is shared with the Verse Study canvas.
-->
<script lang="ts">
    import { onMount } from "svelte";
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import WindowControls from "$lib/components/shared/WindowControls.svelte";
    import WorkbookBoard from "$lib/components/workbook/WorkbookBoard.svelte";
    import {
        emptyWorkbook,
        workbookFromSvg,
        WORKBOOK_OPEN_EVENT,
        type WorkbookDoc,
    } from "$lib/stores/workbook.store";

    const isMac =
        typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

    let doc = $state<WorkbookDoc>(emptyWorkbook());
    let board = $state<WorkbookBoard | null>(null);

    /** Header actions, in the order the header shows them. */
    const ACTIONS = [
        { key: "open", labelKey: "workbook.open", icon: "solar:folder-open-bold-duotone", run: () => board?.openSvg() },
        { key: "save", labelKey: "workbook.save", icon: "solar:diskette-bold-duotone", run: () => board?.saveSvg() },
        { key: "png", labelKey: "workbook.export_png_full", icon: "solar:gallery-bold-duotone", run: () => board?.exportPng() },
        { key: "pdf", labelKey: "workbook.export_pdf_full", icon: "solar:file-download-bold-duotone", run: () => board?.exportPdf() },
    ];

    /** Loads a saved board from disk; leaves the current one alone if it can't. */
    async function loadPath(path: string) {
        try {
            const { readTextFile } = await import("@tauri-apps/plugin-fs");
            const parsed = workbookFromSvg(await readTextFile(path));
            if (parsed) doc = parsed;
        } catch {
            // Unreadable or not one of ours — start blank rather than fail.
        }
    }

    // Opened on an existing file: ?path=… carries it when this window is being
    // created, the same way the verse study window is pointed at an ayah. A
    // window that is already open gets told by event instead — focusing it
    // re-runs no mount code, so the URL alone would never be read.
    onMount(() => {
        const path = new URLSearchParams(window.location.search).get("path");
        if (path) void loadPath(path);
        let stop: (() => void) | undefined;
        void (async () => {
            try {
                const { listen } = await import("@tauri-apps/api/event");
                stop = await listen<{ path: string }>(WORKBOOK_OPEN_EVENT, (event) => {
                    if (event.payload?.path) void loadPath(event.payload.path);
                });
            } catch {
                // Outside Tauri there is no other window to be told by.
            }
        })();
        return () => stop?.();
    });

</script>

<svelte:head>
    <title>{doc.title || "Workbook"}</title>
</svelte:head>

<div class="flex h-screen w-screen flex-col overflow-hidden bg-white dark:bg-[#303446]">
    <div
        data-tauri-drag-region
        class="flex shrink-0 select-none items-center justify-between gap-2 border-b border-brand-gold-200 bg-brand-gold-100 px-4 py-1.5 dark:border-[#414559] dark:bg-[#292c3c]"
        style:padding-left={isMac ? "5rem" : undefined}
    >
        <div class="flex items-center gap-2" data-tauri-drag-region>
            <Icon icon="solar:widget-5-bold-duotone" width="1.1rem" class="text-brand-gold-500" />
            <span
                class="py-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-brand-charcoal-500 dark:text-[#838ba7]"
            >
                {$t("workbook.title")}
            </span>
        </div>

        <!-- Save and export live in the window header, beside the chrome, in
             the manuscript viewer's icon-button style so every document window
             carries the same kind of header. -->
        <div class="ml-auto flex items-center gap-1">
            {#each ACTIONS as action (action.key)}
                <button
                    onclick={action.run}
                    title={$t(action.labelKey)}
                    aria-label={$t(action.labelKey)}
                    class="cursor-pointer rounded-lg p-1 text-brand-charcoal-300 transition-colors hover:bg-brand-gold-200 dark:text-[#838ba7] dark:hover:bg-[#414559]"
                >
                    <Icon icon={action.icon} width="1rem" />
                </button>
            {/each}
            <!-- Windows and Linux run this window undecorated, so the header
                 supplies the minimise / maximise / close buttons itself. macOS
                 overlays its own traffic lights instead (see the 5rem inset),
                 and a second close button beside them is one too many. -->
            {#if !isMac}
                <div class="-my-1.5 -mr-2 flex self-stretch">
                    <WindowControls />
                </div>
            {/if}
        </div>
    </div>

    <WorkbookBoard bind:this={board} {doc} onDocChange={(next) => (doc = next)} />
</div>
