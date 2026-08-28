<script lang="ts">
    import Icon from "@iconify/svelte";
    import DialogPanelHeader from "./DialogPanelHeader.svelte";
    import { fly } from "svelte/transition";
    import { onDestroy } from "svelte";
    import { bringToFront } from "$lib/stores/window-manager.store";
    import { invoke } from "@tauri-apps/api/core";
    import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
    import { readDir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
    import { t } from "$lib/i18n";
    import { copyToClipboard } from "$lib/utils/clipboard";
    import { openFolderPath, folderRefreshTrigger } from "$lib/stores/tabs.store";
    import {
        references,
        referencesOpen,
        referencesAnchorRect,
        addReferences,
        removeReference,
        clearReferences,
        replaceReferences,
    } from "$lib/stores/references.store";
    import {
        type Reference,
        parseReferenceText,
        detectIdKind,
        normalizeId,
        toBibtex,
        formatCitation,
        shortAuthorLabel,
        newRefId,
        ensureCiteKeys,
    } from "$lib/utils/references";

    type Mode = "paste" | "import" | "search";
    let mode = $state<Mode>("paste");

    // The add-reference area (tabs + inputs) can be collapsed so the list gets
    // the full panel height; the header toggle brings it back.
    let showInput = $state(true);

    let pasteText = $state("");
    let idText = $state("");
    let busy = $state(false);
    let notice = $state<{ kind: "ok" | "err"; text: string } | null>(null);
    let copiedId = $state<string | null>(null);
    let copiedKeyId = $state<string | null>(null);

    // ── Filter the visible list ───────────────────────────────────────────
    let filterText = $state("");
    let filteredReferences = $derived.by(() => {
        const q = filterText.trim().toLowerCase();
        if (!q) return $references;
        return $references.filter(
            (r) =>
                r.title.toLowerCase().includes(q) ||
                r.container.toLowerCase().includes(q) ||
                r.year.toLowerCase().includes(q) ||
                r.citeKey.toLowerCase().includes(q) ||
                r.doi.toLowerCase().includes(q) ||
                r.identifier.toLowerCase().includes(q) ||
                r.authors.some((a) => a.toLowerCase().includes(q)),
        );
    });

    // ── Floating panel position / drag / resize ──────────────────────────
    const PANEL_W = 380;
    const PANEL_H = 600;
    const MIN_W = 300;
    const MIN_H = 360;
    let x = $state(0);
    let y = $state(0);
    // Current size — seeded from the defaults on open, then user-resizable.
    let panelW = $state(PANEL_W);
    let panelH = $state(PANEL_H);
    let zIndex = $state(500);
    let isDragging = $state(false);
    let dragStartX = 0,
        dragStartY = 0,
        startX = 0,
        startY = 0;
    let initialized = false;

    $effect(() => {
        if ($referencesOpen && !initialized) {
            // Open anchored just to the side of the References button, the same
            // way the Table of Contents panel does.
            const rect = $referencesAnchorRect;
            const h = Math.min(PANEL_H, window.innerHeight * 0.85);
            // A fresh open resets to the default size, discarding any prior resize.
            panelW = Math.min(PANEL_W, window.innerWidth - 16);
            panelH = h;
            x = rect
                ? Math.min(rect.right + 8, window.innerWidth - panelW - 8)
                : Math.max(8, window.innerWidth - panelW - 24);
            y = rect
                ? Math.max(8, Math.min(rect.top, window.innerHeight - h - 8))
                : Math.max(8, (window.innerHeight - h) / 2);
            zIndex = bringToFront();
            initialized = true;
        }
        if (!$referencesOpen) initialized = false;
    });

    function startDrag(e: PointerEvent) {
        // Ignore drags that start on interactive controls in the header.
        if ((e.target as HTMLElement).closest("button")) return;
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        startX = x;
        startY = y;
        window.addEventListener("pointermove", onDrag);
        window.addEventListener("pointerup", stopDrag, { once: true });
    }
    function onDrag(e: PointerEvent) {
        x = Math.max(
            0,
            Math.min(window.innerWidth - panelW, startX + (e.clientX - dragStartX)),
        );
        y = Math.max(
            0,
            Math.min(window.innerHeight - 60, startY + (e.clientY - dragStartY)),
        );
    }
    function stopDrag() {
        isDragging = false;
        window.removeEventListener("pointermove", onDrag);
    }

    // ── Resize (8 handles, mirrors the File Explorer panel) ───────────────
    type ResizeDir = { e: boolean; w: boolean; n: boolean; s: boolean };
    const resizeHandles: Array<{ cls: string; dir: ResizeDir }> = [
        { cls: "resize-n", dir: { n: true, s: false, e: false, w: false } },
        { cls: "resize-s", dir: { n: false, s: true, e: false, w: false } },
        { cls: "resize-e", dir: { n: false, s: false, e: true, w: false } },
        { cls: "resize-w", dir: { n: false, s: false, e: false, w: true } },
        { cls: "resize-ne", dir: { n: true, s: false, e: true, w: false } },
        { cls: "resize-se", dir: { n: false, s: true, e: true, w: false } },
        { cls: "resize-sw", dir: { n: false, s: true, e: false, w: true } },
        { cls: "resize-nw", dir: { n: true, s: false, e: false, w: true } },
    ];
    let _resizeDir: ResizeDir = { e: false, w: false, n: false, s: false };
    let _resizeStartX = 0,
        _resizeStartY = 0,
        _resizeStartW = 0,
        _resizeStartH = 0,
        _resizeStartPanelX = 0,
        _resizeStartPanelY = 0;

    function startResize(e: PointerEvent, dir: ResizeDir) {
        e.preventDefault();
        e.stopPropagation();
        zIndex = bringToFront();
        _resizeDir = dir;
        _resizeStartX = e.clientX;
        _resizeStartY = e.clientY;
        _resizeStartW = panelW;
        _resizeStartH = panelH;
        _resizeStartPanelX = x;
        _resizeStartPanelY = y;
        document.body.style.userSelect = "none";
        window.addEventListener("pointermove", onResize);
        window.addEventListener("pointerup", stopResize, { once: true });
    }
    function onResize(e: PointerEvent) {
        const dx = e.clientX - _resizeStartX;
        const dy = e.clientY - _resizeStartY;
        let newW = _resizeStartW;
        let newH = _resizeStartH;
        let newX = _resizeStartPanelX;
        let newY = _resizeStartPanelY;
        if (_resizeDir.e) newW = Math.max(MIN_W, _resizeStartW + dx);
        if (_resizeDir.s) newH = Math.max(MIN_H, _resizeStartH + dy);
        if (_resizeDir.w) {
            newW = Math.max(MIN_W, _resizeStartW - dx);
            newX = _resizeStartPanelX + (_resizeStartW - newW);
        }
        if (_resizeDir.n) {
            newH = Math.max(MIN_H, _resizeStartH - dy);
            newY = _resizeStartPanelY + (_resizeStartH - newH);
        }
        panelW = newW;
        panelH = newH;
        x = newX;
        y = newY;
    }
    function stopResize() {
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onResize);
    }

    onDestroy(() => {
        if (typeof window !== "undefined") {
            window.removeEventListener("pointermove", onDrag);
            window.removeEventListener("pointermove", onResize);
        }
    });

    function flash(kind: "ok" | "err", text: string) {
        notice = { kind, text };
        setTimeout(() => {
            if (notice && notice.text === text) notice = null;
        }, 4000);
    }

    function close() {
        referencesOpen.set(false);
    }

    // ── Paste ────────────────────────────────────────────────────────────
    function importPasted() {
        const refs = parseReferenceText(pasteText);
        if (!refs.length) {
            flash("err", $t("references.parse_empty"));
            return;
        }
        const added = addReferences(refs);
        pasteText = "";
        flash("ok", $t("references.added", { n: added }));
    }

    // ── Import files / folder ────────────────────────────────────────────
    const BIB_EXT = /\.(bib|ris)$/i;

    async function importFiles() {
        const picked = await openDialog({
            multiple: true,
            filters: [
                { name: "Reference files", extensions: ["bib", "ris"] },
            ],
        });
        if (!picked) return;
        const paths = Array.isArray(picked) ? picked : [picked];
        await ingestPaths(paths);
    }

    async function importFolder() {
        const picked = await openDialog({ directory: true, multiple: false });
        if (!picked || Array.isArray(picked)) return;
        busy = true;
        try {
            const paths = await collectRefFiles(picked);
            if (!paths.length) {
                flash("err", $t("references.no_files"));
                return;
            }
            await ingestPaths(paths);
        } finally {
            busy = false;
        }
    }

    const SKIP_DIRS = new Set([".git", "node_modules", "target", ".svelte-kit"]);

    async function collectRefFiles(folder: string): Promise<string[]> {
        const base = folder.replace(/\/+$/, "");
        const out: string[] = [];
        async function walk(dir: string) {
            let entries: Awaited<ReturnType<typeof readDir>>;
            try {
                entries = await readDir(dir);
            } catch {
                return;
            }
            for (const entry of entries) {
                if (!entry.name) continue;
                const full = `${dir}/${entry.name}`;
                if (entry.isDirectory) {
                    if (SKIP_DIRS.has(entry.name)) continue;
                    await walk(full);
                } else if (BIB_EXT.test(entry.name)) {
                    out.push(full);
                }
            }
        }
        await walk(base);
        return out;
    }

    async function ingestPaths(paths: string[]) {
        const all: Reference[] = [];
        for (const p of paths) {
            try {
                const text = await readTextFile(p);
                all.push(...parseReferenceText(text));
            } catch {
                /* skip unreadable file */
            }
        }
        if (!all.length) {
            flash("err", $t("references.parse_empty"));
            return;
        }
        const added = addReferences(all);
        flash("ok", $t("references.added", { n: added }));
    }

    // ── Search by id ─────────────────────────────────────────────────────
    async function searchIds() {
        const lines = idText
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter(Boolean);
        if (!lines.length) return;
        busy = true;
        const found: Reference[] = [];
        const failed: string[] = [];
        try {
            for (const raw of lines) {
                const kind = detectIdKind(raw);
                if (!kind) {
                    failed.push(raw);
                    continue;
                }
                const id = normalizeId(raw, kind);
                try {
                    const ref = await invoke<Reference>("fetch_reference", {
                        kind,
                        id,
                    });
                    ref.id = newRefId();
                    found.push(ref);
                } catch {
                    failed.push(raw);
                }
            }
        } finally {
            busy = false;
        }
        if (found.length) {
            const added = addReferences(ensureCiteKeys(found));
            idText = "";
            if (failed.length)
                flash("err", $t("references.added_some", { n: added, failed: failed.length }));
            else flash("ok", $t("references.added", { n: added }));
        } else {
            flash("err", $t("references.lookup_failed"));
        }
    }

    // ── Library file (save / load .bib) ──────────────────────────────────
    async function saveLibrary() {
        if (!$references.length) return;
        const path = await saveDialog({
            defaultPath: "references.bib",
            filters: [{ name: "BibTeX", extensions: ["bib"] }],
        });
        if (!path) return;
        try {
            await writeTextFile(path, toBibtex($references));
            // The FileExplorer's fs watcher doesn't reliably pick up a freshly
            // saved file, so nudge it via the same manual-refresh trigger that
            // create/move/delete use, whenever the .bib lands inside the open
            // folder (or a subfolder of it).
            const folder = $openFolderPath;
            if (folder) {
                const normFolder = folder.replace(/\\/g, "/").replace(/\/+$/, "");
                const normPath = path.replace(/\\/g, "/");
                if (normPath.startsWith(`${normFolder}/`)) {
                    folderRefreshTrigger.update((n) => n + 1);
                }
            }
            flash("ok", $t("references.saved"));
        } catch (e) {
            flash("err", String(e));
        }
    }

    async function loadLibraryFile() {
        const picked = await openDialog({
            multiple: false,
            filters: [{ name: "Reference files", extensions: ["bib", "ris"] }],
        });
        if (!picked || Array.isArray(picked)) return;
        try {
            const text = await readTextFile(picked);
            const refs = parseReferenceText(text);
            if (!refs.length) {
                flash("err", $t("references.parse_empty"));
                return;
            }
            replaceReferences(refs);
            flash("ok", $t("references.loaded", { n: refs.length }));
        } catch (e) {
            flash("err", String(e));
        }
    }

    let confirmClear = $state(false);
    function clearAll() {
        if (!confirmClear) {
            confirmClear = true;
            setTimeout(() => (confirmClear = false), 3000);
            return;
        }
        clearReferences();
        confirmClear = false;
    }

    // ── Card actions ─────────────────────────────────────────────────────
    async function copyCitation(ref: Reference) {
        const ok = await copyToClipboard(formatCitation(ref));
        if (ok) {
            copiedId = ref.id;
            setTimeout(() => {
                if (copiedId === ref.id) copiedId = null;
            }, 1500);
        }
    }

    async function copyCodeName(ref: Reference) {
        const ok = await copyToClipboard(ref.citeKey);
        if (ok) {
            copiedKeyId = ref.id;
            setTimeout(() => {
                if (copiedKeyId === ref.id) copiedKeyId = null;
            }, 1500);
        }
    }

    function identifierLabel(ref: Reference): string {
        if (ref.doi) return `DOI: ${ref.doi}`;
        if (ref.identifier) return ref.identifier;
        if (ref.extra?.isbn) return `ISBN: ${ref.extra.isbn}`;
        if (ref.extra?.pmid) return `PMID: ${ref.extra.pmid}`;
        if (ref.extra?.eprint) return `arXiv: ${ref.extra.eprint}`;
        return "";
    }

    const tabBtn =
        "cursor-pointer flex flex-1 items-center justify-center gap-1.5 rounded-full py-1 text-[0.6875rem] font-semibold transition-colors";
    const tabActive =
        "bg-white dark:bg-[#51576d] text-brand-charcoal-900 dark:text-[#c6d0f5] shadow-sm";
    const tabIdle =
        "text-brand-gold-600 dark:text-[#838ba7] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]";
    const toolBtn =
        "cursor-pointer inline-flex items-center gap-1.5 rounded-full border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-1.5 text-[0.6875rem] font-semibold text-brand-charcoal-500 dark:text-[#c6d0f5] transition-colors hover:bg-brand-sand-200 dark:hover:bg-[#292c3c] disabled:opacity-40 disabled:cursor-not-allowed";
    const primaryBtn =
        "cursor-pointer inline-flex items-center justify-center gap-1.5 rounded-full border border-transparent bg-brand-gold-400 px-4 py-1.5 text-[0.6875rem] font-semibold text-white transition-colors hover:bg-brand-gold-500 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#e5c890] dark:text-[#232634] dark:hover:bg-[#eed8a3]";
    const optionRow =
        "group flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-brand-sand-200 bg-brand-sand-100 px-3.5 py-3 text-left transition-colors hover:border-brand-gold-300 hover:bg-brand-sand-200 disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#414559] dark:bg-[#1e2030] dark:hover:border-[#e5c890]/40 dark:hover:bg-[#292c3c]";
    const textareaCls =
        "w-full flex-1 resize-none rounded-2xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-2.5 text-xs font-mono text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 dark:focus:border-[#e5c890] focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-[#e5c890]/20";
</script>

{#if $referencesOpen}
    <!-- Floating, draggable, non-modal panel — only closes via the X button. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        transition:fly={{ y: 8, duration: 180, opacity: 0 }}
        role="dialog"
        aria-modal="false"
        aria-label={$t("references.title")}
        tabindex="-1"
        class="fixed flex flex-col overflow-hidden rounded-xl border border-brand-sand-200 bg-brand-sand-50 shadow-xl dark:border-[#414559] dark:bg-[#232634] dark:shadow-black/40"
        style="left:{x}px; top:{y}px; width:{panelW}px; height:{panelH}px; z-index:{zIndex};"
        onpointerdown={() => {
            zIndex = bringToFront();
        }}
    >
        <!-- Header (drag handle) with tabs -->
        <DialogPanelHeader
            icon="solar:bookmark-square-bold-duotone"
            title={$t("references.title")}
            {isDragging}
            onClose={close}
            onpointerdown={startDrag}
        >
            {#snippet action()}
                <button
                    onclick={() => (showInput = !showInput)}
                    aria-label={showInput
                        ? $t("references.hide_input")
                        : $t("references.show_input")}
                    title={showInput
                        ? $t("references.hide_input")
                        : $t("references.show_input")}
                    class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg bg-brand-gold-200 text-brand-gold-600 transition-colors hover:bg-brand-gold-200/80 dark:bg-[#414559] dark:text-[#c6d0f5] dark:hover:bg-[#51576d]"
                >
                    <Icon
                        icon={showInput
                            ? "solar:minimize-square-bold-duotone"
                            : "solar:add-square-bold-duotone"}
                        width="0.85rem"
                    />
                </button>
            {/snippet}
            {#snippet children()}
                {#if showInput}
                <!-- mode tabs -->
                <div
                    class="mx-4 mb-2 flex gap-1 rounded-full bg-brand-gold-200/50 p-1 dark:bg-[#414559]/50"
                >
                    <button
                        class="{tabBtn} {mode === 'paste' ? tabActive : tabIdle}"
                        onclick={() => (mode = "paste")}
                    >
                        <Icon icon="solar:clipboard-text-bold" width="0.75rem" />
                        {$t("references.mode_paste")}
                    </button>
                    <button
                        class="{tabBtn} {mode === 'import' ? tabActive : tabIdle}"
                        onclick={() => (mode = "import")}
                    >
                        <Icon icon="solar:folder-open-bold" width="0.75rem" />
                        {$t("references.mode_import")}
                    </button>
                    <button
                        class="{tabBtn} {mode === 'search' ? tabActive : tabIdle}"
                        onclick={() => (mode = "search")}
                    >
                        <Icon icon="solar:magnifer-bold" width="0.75rem" />
                        {$t("references.mode_search")}
                    </button>
                </div>
                {/if}
            {/snippet}
        </DialogPanelHeader>

        <!-- Input area -->
        {#if showInput}
        <div
            class="shrink-0 border-b border-brand-sand-100 px-5 py-3.5 dark:border-[#414559]"
        >
                <!-- Mode content — fixed height so switching tabs never
                     resizes the panel. -->
                <div class="flex h-[156px] flex-col gap-2">
                    {#if mode === "paste"}
                        <textarea
                            bind:value={pasteText}
                            spellcheck="false"
                            placeholder={$t("references.paste_placeholder")}
                            class={textareaCls}
                        ></textarea>
                        <button
                            class="{primaryBtn} self-end"
                            onclick={importPasted}
                            disabled={!pasteText.trim()}
                        >
                            <Icon icon="solar:download-minimalistic-bold" width="0.85rem" />
                            {$t("references.parse_btn")}
                        </button>
                    {:else if mode === "import"}
                        <div class="flex flex-1 flex-col justify-center gap-2.5">
                            <button class={optionRow} onclick={importFiles} disabled={busy}>
                                <span
                                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gold-100 text-brand-gold-600 dark:bg-[#414559] dark:text-[#e5c890]"
                                >
                                    <Icon icon="solar:file-text-bold-duotone" width="1.1rem" />
                                </span>
                                <span class="flex min-w-0 flex-col">
                                    <span class="text-[0.75rem] font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                        {$t("references.import_files")}
                                    </span>
                                    <span class="text-[0.625rem] text-brand-charcoal-300 dark:text-[#838ba7]">
                                        {$t("references.import_files_desc")}
                                    </span>
                                </span>
                                <Icon
                                    icon="solar:alt-arrow-right-linear"
                                    width="0.9rem"
                                    class="ml-auto shrink-0 text-brand-charcoal-300 transition-transform group-hover:translate-x-0.5 dark:text-[#626880]"
                                />
                            </button>
                            <button class={optionRow} onclick={importFolder} disabled={busy}>
                                <span
                                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gold-100 text-brand-gold-600 dark:bg-[#414559] dark:text-[#e5c890]"
                                >
                                    <Icon icon="solar:folder-with-files-bold-duotone" width="1.1rem" />
                                </span>
                                <span class="flex min-w-0 flex-col">
                                    <span class="text-[0.75rem] font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                        {$t("references.import_folder")}
                                    </span>
                                    <span class="text-[0.625rem] text-brand-charcoal-300 dark:text-[#838ba7]">
                                        {$t("references.import_folder_desc")}
                                    </span>
                                </span>
                                {#if busy}
                                    <Icon icon="svg-spinners:180-ring" width="0.9rem" class="ml-auto shrink-0 text-brand-gold-500" />
                                {:else}
                                    <Icon
                                        icon="solar:alt-arrow-right-linear"
                                        width="0.9rem"
                                        class="ml-auto shrink-0 text-brand-charcoal-300 transition-transform group-hover:translate-x-0.5 dark:text-[#626880]"
                                    />
                                {/if}
                            </button>
                        </div>
                    {:else}
                        <textarea
                            bind:value={idText}
                            spellcheck="false"
                            placeholder={$t("references.search_placeholder")}
                            class={textareaCls}
                        ></textarea>
                        <div class="flex items-center justify-between gap-2">
                            <span class="text-[0.625rem] text-brand-charcoal-300 dark:text-[#838ba7]">
                                {$t("references.search_hint")}
                            </span>
                            <button
                                class={primaryBtn}
                                onclick={searchIds}
                                disabled={busy || !idText.trim()}
                            >
                                {#if busy}
                                    <Icon icon="svg-spinners:180-ring" width="0.85rem" />
                                {:else}
                                    <Icon icon="solar:magnifer-bold" width="0.85rem" />
                                {/if}
                                {$t("references.search_btn")}
                            </button>
                        </div>
                    {/if}
                </div>
            </div>
            {/if}

            <!-- Action feedback — kept outside the collapsible input so save /
                 load results are visible even when the input is hidden. -->
            {#if notice}
                <div class="shrink-0 px-5 pt-2">
                    <p
                        class="text-[0.6875rem] font-medium {notice.kind === 'ok'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-500 dark:text-red-400'}"
                    >
                        {notice.text}
                    </p>
                </div>
            {/if}

            <!-- List count label + filter box (moved out of the header) -->
            {#if $references.length}
                <div class="flex shrink-0 items-center gap-2 px-5 pt-3 pb-0.5">
                    <span
                        class="shrink-0 text-[0.625rem] font-semibold uppercase tracking-widest text-brand-charcoal-300 dark:text-[#838ba7]"
                    >
                        {$t("references.count", {
                            n: filterText.trim()
                                ? filteredReferences.length
                                : $references.length,
                        })}
                    </span>
                    <div class="relative ml-auto min-w-0 flex-1">
                        <Icon
                            icon="solar:magnifer-linear"
                            width="0.8rem"
                            class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-charcoal-300 dark:text-[#626880]"
                        />
                        <input
                            bind:value={filterText}
                            spellcheck="false"
                            placeholder={$t("references.filter_placeholder")}
                            class="w-full rounded-full border border-brand-sand-200 bg-brand-sand-100 py-1 pl-7 pr-7 text-[0.6875rem] text-brand-charcoal-900 placeholder-brand-charcoal-300 focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:border-[#414559] dark:bg-[#1e2030] dark:text-[#c6d0f5] dark:placeholder-[#626880] dark:focus:border-[#e5c890] dark:focus:ring-[#e5c890]/20"
                        />
                        {#if filterText}
                            <button
                                onclick={() => (filterText = "")}
                                aria-label={$t("references.clear")}
                                title={$t("references.clear")}
                                class="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-brand-charcoal-300 transition-colors hover:text-brand-charcoal-500 dark:text-[#626880] dark:hover:text-[#c6d0f5]"
                            >
                                <Icon icon="solar:close-circle-bold" width="0.8rem" />
                            </button>
                        {/if}
                    </div>
                </div>
            {/if}

            <!-- Cards -->
            <div class="default-scroll flex-1 overflow-y-auto px-5 pt-1.5 pb-4">
                {#if $references.length === 0}
                    <div
                        class="flex flex-col items-center justify-center gap-2 py-12 text-center"
                    >
                        <Icon
                            icon="solar:bookmark-opened-line-duotone"
                            width="2rem"
                            class="text-brand-charcoal-200 dark:text-[#626880]"
                        />
                        <p class="text-xs text-brand-charcoal-300 dark:text-[#838ba7]">
                            {$t("references.empty")}
                        </p>
                    </div>
                {:else if filteredReferences.length === 0}
                    <div
                        class="flex flex-col items-center justify-center gap-2 py-12 text-center"
                    >
                        <Icon
                            icon="solar:magnifer-line-duotone"
                            width="2rem"
                            class="text-brand-charcoal-200 dark:text-[#626880]"
                        />
                        <p class="text-xs text-brand-charcoal-300 dark:text-[#838ba7]">
                            {$t("references.no_match")}
                        </p>
                    </div>
                {:else}
                    <div class="flex flex-col gap-2.5">
                        {#each filteredReferences as ref, i (ref.id)}
                            <div
                                class="group flex flex-col rounded-2xl border border-brand-sand-200 bg-brand-sand-100 p-3.5 transition-colors hover:border-brand-gold-300 dark:border-[#414559] dark:bg-[#1e2030] dark:hover:border-[#e5c890]/40"
                            >
                                <div class="mb-1 flex items-start justify-between gap-2">
                                    <span
                                        class="flex items-center gap-1.5 text-[0.75rem] font-bold text-brand-gold-600 dark:text-[#e5c890]"
                                    >
                                        <span
                                            class="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-gold-200/70 px-1 text-[0.5625rem] font-bold text-brand-gold-600 dark:bg-[#414559] dark:text-[#e5c890]"
                                        >
                                            {i + 1}
                                        </span>
                                        {shortAuthorLabel(ref)}
                                    </span>
                                    <button
                                        onclick={() => removeReference(ref.id)}
                                        aria-label={$t("references.delete")}
                                        title={$t("references.delete")}
                                        class="shrink-0 cursor-pointer text-brand-charcoal-300 opacity-0 transition-all hover:text-red-500 group-hover:opacity-100 dark:text-[#626880]"
                                    >
                                        <Icon icon="solar:close-circle-bold" width="1rem" />
                                    </button>
                                </div>
                                <p
                                    class="mb-1 line-clamp-2 text-[0.8125rem] font-semibold leading-snug text-brand-charcoal-900 dark:text-[#c6d0f5]"
                                    title={ref.title}
                                >
                                    {ref.title || $t("references.untitled")}
                                </p>
                                {#if ref.container || identifierLabel(ref)}
                                    <p
                                        class="mb-2.5 line-clamp-1 text-[0.6875rem] text-brand-charcoal-300 dark:text-[#838ba7]"
                                    >
                                        {#if ref.container}<span class="italic">{ref.container}</span>{/if}
                                        {#if ref.container && identifierLabel(ref)} · {/if}
                                        {identifierLabel(ref)}
                                    </p>
                                {/if}
                                <div class="mt-auto flex items-center gap-2">
                                    <button
                                        onclick={() => copyCitation(ref)}
                                        class="cursor-pointer inline-flex items-center gap-1.5 rounded-full bg-brand-gold-100 px-3 py-1 text-[0.6875rem] font-semibold text-brand-gold-600 transition-colors hover:bg-brand-gold-200 dark:bg-[#414559] dark:text-[#e5c890] dark:hover:bg-[#51576d]"
                                    >
                                        <Icon
                                            icon={copiedId === ref.id
                                                ? "solar:check-circle-bold"
                                                : "solar:copy-bold-duotone"}
                                            width="0.85rem"
                                        />
                                        {copiedId === ref.id
                                            ? $t("references.copied")
                                            : $t("references.copy")}
                                    </button>
                                    {#if ref.citeKey}
                                        <button
                                            onclick={() => copyCodeName(ref)}
                                            title={$t("references.copy_code")}
                                            aria-label={$t("references.copy_code")}
                                            class="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-full bg-brand-sand-100 px-2 py-1 font-mono text-[0.625rem] text-brand-charcoal-500 transition-colors hover:bg-brand-sand-200 dark:bg-[#363a4f] dark:text-[#b5bfe2] dark:hover:bg-[#414559]"
                                        >
                                            <Icon
                                                icon={copiedKeyId === ref.id
                                                    ? "solar:check-circle-bold"
                                                    : "solar:copy-line-duotone"}
                                                width="0.7rem"
                                            />
                                            {ref.citeKey}
                                        </button>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>

            <!-- Footer: reference-set file actions -->
            <div
                class="flex shrink-0 items-center justify-between gap-2 border-t border-brand-sand-200 px-5 py-2.5 dark:border-[#414559]"
            >
                <div class="flex items-center gap-2">
                    <button class={toolBtn} onclick={saveLibrary} disabled={!$references.length}>
                        <Icon icon="solar:diskette-bold-duotone" width="0.9rem" />
                        {$t("references.save")}
                    </button>
                    <button class={toolBtn} onclick={loadLibraryFile}>
                        <Icon icon="solar:upload-bold-duotone" width="0.9rem" />
                        {$t("references.load")}
                    </button>
                </div>
                <button
                    class="{toolBtn} {confirmClear
                        ? '!border-red-300 !text-red-500 dark:!border-red-500/50'
                        : ''}"
                    onclick={clearAll}
                    disabled={!$references.length}
                >
                    <Icon icon="solar:trash-bin-trash-bold-duotone" width="0.9rem" />
                    {confirmClear ? $t("references.clear_confirm") : $t("references.clear")}
                </button>
            </div>

            <!-- Resize handles — let the panel be sized to taste -->
            {#each resizeHandles as { cls, dir }}
                <div
                    aria-hidden="true"
                    class="resize-handle {cls}"
                    onpointerdown={(e) => startResize(e, dir)}
                ></div>
            {/each}
    </div>
{/if}

<style>
    .resize-handle {
        position: absolute;
        z-index: 10;
    }
    .resize-n {
        top: 0;
        left: 10px;
        right: 10px;
        height: 6px;
        cursor: n-resize;
    }
    .resize-s {
        bottom: 0;
        left: 10px;
        right: 10px;
        height: 6px;
        cursor: s-resize;
    }
    .resize-e {
        top: 10px;
        right: 0;
        bottom: 10px;
        width: 6px;
        cursor: e-resize;
    }
    .resize-w {
        top: 10px;
        left: 0;
        bottom: 10px;
        width: 6px;
        cursor: w-resize;
    }
    .resize-ne {
        top: 0;
        right: 0;
        width: 14px;
        height: 14px;
        cursor: ne-resize;
    }
    .resize-se {
        bottom: 0;
        right: 0;
        width: 20px;
        height: 20px;
        cursor: se-resize;
    }
    .resize-sw {
        bottom: 0;
        left: 0;
        width: 14px;
        height: 14px;
        cursor: sw-resize;
    }
    .resize-nw {
        top: 0;
        left: 0;
        width: 14px;
        height: 14px;
        cursor: nw-resize;
    }
    .resize-se::before {
        content: "";
        position: absolute;
        bottom: 11px;
        right: 11px;
        width: 5px;
        height: 5px;
        border-bottom: 1.5px solid rgba(130, 130, 130, 0.4);
        border-right: 1.5px solid rgba(130, 130, 130, 0.4);
        border-bottom-right-radius: 5px;
        pointer-events: none;
    }
    .resize-se::after {
        content: "";
        position: absolute;
        bottom: 7px;
        right: 7px;
        width: 9px;
        height: 9px;
        border-bottom: 1.5px solid rgba(130, 130, 130, 0.55);
        border-right: 1.5px solid rgba(130, 130, 130, 0.55);
        border-bottom-right-radius: 9px;
        pointer-events: none;
    }
</style>
