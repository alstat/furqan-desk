<!--
  The Workbook window — a board of its own, opened from the editor toolbar's
  "Create Workbook". Same window chrome as the other satellite windows; the
  board itself is shared with the Verse Study canvas.

  Chrome-tab style: this window can hold several boards at once. A second
  "Create Workbook" (or opening another workbook file) adds a tab here
  instead of a second window — see WORKBOOK_NEW_TAB_EVENT in
  workbook.store.ts. A tab can also be popped out into a window of its own
  and dragged back onto another Workbook window's strip to reattach; see
  WorkbookTabStrip.svelte for that handshake.
-->
<script lang="ts">
    import { onMount } from "svelte";
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import WindowControls from "$lib/components/shared/WindowControls.svelte";
    import WorkbookBoard from "$lib/components/workbook/WorkbookBoard.svelte";
    import WorkbookTabStrip from "$lib/components/workbook/WorkbookTabStrip.svelte";
    import {
        createWorkbookTab,
        closeWorkbookTab,
        renameWorkbookTab,
        updateWorkbookTabDoc,
        type WorkbookTab,
    } from "$lib/stores/workbook-tabs";
    import {
        workbookFromSvg,
        WORKBOOK_NEW_TAB_EVENT,
        WORKBOOK_TAB_READY_EVENT,
        WORKBOOK_SEED_TAB_EVENT,
        type WorkbookDoc,
    } from "$lib/stores/workbook.store";
    import { openAppWindow } from "$lib/utils/appWindow";

    const isMac = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

    let tabs = $state<WorkbookTab[]>([]);
    let activeTabId = $state<string | null>(null);
    let board = $state<WorkbookBoard | null>(null);
    let runMode = $state<"live" | "manual">("live");

    const activeTab = $derived(tabs.find((t) => t.id === activeTabId) ?? null);

    /** Header actions, in the order the header shows them. */
    const ACTIONS = [
        { key: "open", labelKey: "workbook.open", icon: "solar:folder-open-bold-duotone", run: () => board?.openSvg() },
        { key: "save", labelKey: "workbook.save", icon: "solar:diskette-bold-duotone", run: () => board?.saveSvg() },
        { key: "png", labelKey: "workbook.export_png_full", icon: "solar:gallery-bold-duotone", run: () => board?.exportPng() },
        { key: "pdf", labelKey: "workbook.export_pdf_full", icon: "solar:file-download-bold-duotone", run: () => board?.exportPdf() },
    ];

    /** Closes this window. Explicit rather than relying only on the native/OS
     *  chrome, so there is always a working close control in the header. */
    async function closeWindow() {
        try {
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            await getCurrentWindow().close();
        } catch (e) {
            console.error("window close failed", e);
        }
    }

    function addTab(doc?: WorkbookDoc, path?: string) {
        const tab = createWorkbookTab(doc, path);
        tabs = [...tabs, tab];
        activeTabId = tab.id;
        return tab;
    }

    /** Loads a saved board from disk as a new tab; adds a blank tab instead if it can't. */
    async function loadPath(path: string) {
        try {
            const { readTextFile } = await import("@tauri-apps/plugin-fs");
            const parsed = workbookFromSvg(await readTextFile(path));
            if (parsed) addTab(parsed, path);
        } catch {
            // Unreadable or not one of ours — fall through to a blank tab below
            // rather than leave the window with nothing in it.
        } finally {
            if (tabs.length === 0) addTab();
        }
    }

    function handleDocChange(next: WorkbookDoc) {
        if (!activeTabId) return;
        tabs = updateWorkbookTabDoc(tabs, activeTabId, next);
    }

    function handleReorder(next: WorkbookTab[]) {
        tabs = next;
    }

    function handleRename(id: string, title: string) {
        tabs = renameWorkbookTab(tabs, id, title);
    }

    async function handleClose(id: string) {
        const result = closeWorkbookTab(tabs, activeTabId, id);
        tabs = result.tabs;
        activeTabId = result.activeId;
        if (tabs.length === 0) await closeWindow();
    }

    /** A window's worth of tabs dropped onto this one's strip — see WorkbookTabStrip's drag handling. */
    function handleAttachTabs(incoming: WorkbookTab[]) {
        // Fresh ids so a tab dragged in never collides with one already open here.
        const fresh = incoming.map((tab) => ({ ...tab, id: crypto.randomUUID() }));
        if (fresh.length === 0) return;
        tabs = [...tabs, ...fresh];
        activeTabId = fresh[0].id;
    }

    /** "Open as separate window" — pops one tab out, handing it its document over the seed-tab handshake. */
    async function handlePopOut(tab: WorkbookTab) {
        try {
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            const { listen, emitTo } = await import("@tauri-apps/api/event");
            const selfLabel = getCurrentWindow().label;
            const newLabel = `workbook-${crypto.randomUUID()}`;
            const created = await openAppWindow({
                label: newLabel,
                url: `/workbook/?seedFrom=${encodeURIComponent(selfLabel)}&seedTabId=${encodeURIComponent(tab.id)}`,
                title: tab.doc.title || "Workbook",
                width: 1280,
                height: 860,
                minWidth: 900,
                minHeight: 620,
            });
            if (!created) return;
            const stop = await listen<{ seedTabId: string }>(WORKBOOK_TAB_READY_EVENT, (event) => {
                if (event.payload.seedTabId !== tab.id) return;
                stop();
                void emitTo(newLabel, WORKBOOK_SEED_TAB_EVENT, { tab });
            });
            await handleClose(tab.id);
        } catch (e) {
            console.error("pop-out failed", e);
        }
    }

    // Three ways this window starts: seeded from another window's pop-out
    // (?seedFrom&seedTabId), pointed at a file (?path=…, the same "URL for
    // creation" carried in from openWorkbookWindow), or plain — one blank
    // tab. An already-open window instead hears WORKBOOK_NEW_TAB_EVENT,
    // since focusing it re-runs none of this mount code.
    onMount(() => {
        const params = new URLSearchParams(window.location.search);
        const seedFrom = params.get("seedFrom");
        const seedTabId = params.get("seedTabId");
        const path = params.get("path");
        const stops: Array<() => void> = [];

        void (async () => {
            try {
                const { listen, emitTo } = await import("@tauri-apps/api/event");

                if (seedFrom && seedTabId) {
                    const stopSeed = await listen<{ tab: WorkbookTab }>(WORKBOOK_SEED_TAB_EVENT, (event) => {
                        tabs = [event.payload.tab];
                        activeTabId = event.payload.tab.id;
                    });
                    stops.push(stopSeed);
                    await emitTo(seedFrom, WORKBOOK_TAB_READY_EVENT, { seedTabId });
                } else if (path) {
                    await loadPath(path);
                } else {
                    addTab();
                }

                const stopNewTab = await listen<{ path?: string }>(WORKBOOK_NEW_TAB_EVENT, (event) => {
                    if (event.payload?.path) void loadPath(event.payload.path);
                    else addTab();
                });
                stops.push(stopNewTab);
            } catch {
                // Outside Tauri (browser dev) — no other window can reach this
                // one, and a pop-out seed never arrives either; start blank.
                if (!seedFrom && tabs.length === 0) addTab();
            }
        })();

        return () => stops.forEach((stop) => stop());
    });
</script>

<svelte:head>
    <title>{activeTab?.doc.title || "Workbook"}</title>
</svelte:head>

<div class="flex h-full w-full flex-col overflow-hidden bg-white dark:bg-[#303446]">
    <div
        data-tauri-drag-region
        class="flex shrink-0 select-none items-stretch gap-2 border-b border-brand-gold-200 bg-brand-gold-100 px-4 py-1.5 dark:border-[#414559] dark:bg-[#292c3c]"
        style:padding-left={isMac ? "5rem" : undefined}
    >
        <div class="flex shrink-0 items-center pl-1" data-tauri-drag-region>
            <Icon icon="solar:widget-5-bold-duotone" width="1.1rem" class="shrink-0 text-brand-gold-500" />
        </div>

        <div class="flex min-w-0 flex-1 items-center py-0.5" data-tauri-drag-region>
            <WorkbookTabStrip
                {tabs}
                {activeTabId}
                onSelect={(id) => (activeTabId = id)}
                onReorder={handleReorder}
                onRename={handleRename}
                onClose={handleClose}
                onNewTab={() => addTab()}
                onPopOut={handlePopOut}
                onAttachTabs={handleAttachTabs}
            />
        </div>

        <!-- Live/Manual/Run governs whichever tab is active, and Save/Open/Export
             live in the header, beside the chrome, in the manuscript viewer's
             icon-button style so every document window carries the same kind
             of header. -->
        <div class="ml-auto flex shrink-0 items-center gap-1">
            <div class="flex items-center gap-1 rounded-full bg-brand-gold-200/50 p-1 dark:bg-[#414559]/50">
                {#each [["live", "solar:bolt-bold-duotone"], ["manual", "solar:hand-stars-bold-duotone"]] as const as [mode, icon] (mode)}
                    <button
                        onclick={() => (runMode = mode)}
                        title={$t(`workbook.run_mode.${mode}`)}
                        aria-pressed={runMode === mode}
                        class="flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-[0.625rem] font-semibold transition-colors {runMode ===
                        mode
                            ? 'bg-white text-brand-charcoal-900 shadow-sm dark:bg-[#51576d] dark:text-[#c6d0f5]'
                            : 'text-brand-gold-600 hover:text-brand-charcoal-900 dark:text-[#838ba7] dark:hover:text-[#c6d0f5]'}"
                    >
                        <Icon {icon} width="0.7rem" />
                        {$t(`workbook.run_mode.${mode}`)}
                    </button>
                {/each}
            </div>
            {#if runMode === "manual"}
                <button
                    onclick={() => board?.runNow()}
                    title={$t("workbook.run_now")}
                    aria-label={$t("workbook.run_now")}
                    class="flex cursor-pointer items-center gap-1 rounded-full bg-brand-gold-500 px-2 py-1 text-[0.625rem] font-semibold text-white shadow-sm transition-colors hover:bg-brand-gold-600 dark:bg-[#e5c890] dark:text-[#232634] dark:hover:bg-[#d4b57f]"
                >
                    <Icon icon="solar:play-bold-duotone" width="0.7rem" />
                    {$t("workbook.run_now")}
                </button>
            {/if}
            <span class="mx-0.5 h-5 w-px bg-brand-gold-200/70 dark:bg-[#414559]"></span>
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
                 also supplies the minimise / maximise buttons; macOS overlays
                 its own traffic lights instead (see the 5rem inset). Close is
                 explicit either way (see closeWindow), rather than depending
                 on native chrome alone. -->
            {#if !isMac}
                <div class="-my-1.5 -mr-2 flex self-stretch">
                    <WindowControls />
                </div>
            {:else}
                <button
                    onclick={closeWindow}
                    aria-label={$t("common.close")}
                    class="cursor-pointer rounded-lg p-1 text-brand-charcoal-300 transition-colors hover:bg-brand-gold-200 dark:text-[#838ba7] dark:hover:bg-[#414559]"
                >
                    <Icon icon="solar:close-circle-bold-duotone" width="1rem" />
                </button>
            {/if}
        </div>
    </div>

    {#if activeTab}
        {#key activeTab.id}
            <WorkbookBoard
                bind:this={board}
                doc={activeTab.doc}
                onDocChange={handleDocChange}
                bind:runMode
                showTitleInToolbar={false}
            />
        {/key}
    {:else}
        <div class="flex flex-1 items-center justify-center text-[0.75rem] text-brand-charcoal-300 dark:text-[#626880]">
            {$t("workbook.empty")}
        </div>
    {/if}
</div>
