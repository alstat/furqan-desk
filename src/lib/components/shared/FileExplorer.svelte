<script lang="ts">
    import { fly } from "svelte/transition";
    import {
        open as openDialog,
        confirm as confirmDialog,
    } from "@tauri-apps/plugin-dialog";
    import { invoke } from "@tauri-apps/api/core";
    import {
        readDir,
        readTextFile,
        watchImmediate,
        mkdir,
        writeTextFile,
        exists,
        type UnwatchFn,
    } from "@tauri-apps/plugin-fs";
    import { onDestroy, untrack } from "svelte";
    import Icon from "@iconify/svelte";
    import {
        openFolderPath,
        folderRefreshTrigger,
        openPreviewTab,
        openOrFocusTab,
        isFlatFile,
        isImageFile,
        isPdfFile,
        tabs,
        syncCleanTabsFromDisk,
        renameFileByPath,
        moveFileByPath,
        deleteFileByPath,
        copyPathInto,
        cutPathInto,
    } from "$lib/stores/tabs.store";
    import MediaViewerDialog from "./MediaViewerDialog.svelte";
    import { surahOrientation } from "$lib/stores/quran.svelte";
    import { actionBtnStyle } from "$lib/data/toolbar/toolbar";
    import { t } from "$lib/i18n";
    import { zenMode, zenPeek } from "$lib/stores/editor.store";
    import { bringToFront } from "$lib/stores/window-manager.store";

    interface FileTreeNode {
        name: string;
        path: string;
        isDirectory: boolean;
        isExpanded: boolean;
        isLoaded: boolean;
        isLoading: boolean;
        isForbidden: boolean;
        children: FileTreeNode[];
    }

    let isOpen = $state(false);
    let rootNodes = $state<FileTreeNode[]>([]);
    let isLoadingRoot = $state(false);
    let loadError = $state("");

    // ── Git working-tree status (VSCode-style change highlighting) ──
    // `changedFiles` maps an absolute file path → status label; `changedDirs`
    // holds every ancestor directory of a changed file, so a collapsed folder
    // that contains changes can be highlighted without expanding it.
    let changedFiles = $state<Map<string, string>>(new Map());
    let changedDirs = $state<Set<string>>(new Set());

    // git (libgit2) always reports forward-slash paths, while node paths on
    // Windows mix separators (the dialog yields `C:\…`, joined with `/`).
    // Normalising both sides to `/` makes every comparison work cross-platform.
    const norm = (p: string) => p.replace(/\\/g, "/");

    // Absolute paths git ignores (.gitignore etc.). Ignored directories are
    // stored as a single entry; descendants are treated as ignored by walking
    // ancestors in `isIgnored`. Used to gray out ignored files/folders.
    let ignoredPaths = $state<Set<string>>(new Set());

    // A node is ignored if its own path is ignored, or any ancestor directory
    // is (so everything inside an ignored folder is grayed out too).
    function isIgnored(path: string): boolean {
        if (ignoredPaths.size === 0) return false;
        let dir = norm(path);
        if (ignoredPaths.has(dir)) return true;
        while (dir.includes("/")) {
            dir = dir.slice(0, dir.lastIndexOf("/"));
            if (ignoredPaths.has(dir)) return true;
        }
        return false;
    }

    async function loadGitIgnored(folder: string) {
        try {
            const paths = await invoke<string[]>("git_ignored", { folder });
            ignoredPaths = new Set(paths);
        } catch {
            ignoredPaths = new Set();
        }
    }

    // Tailwind text colours per git status, echoing VSCode's palette
    // (modified = gold, added/untracked = green, deleted = red, conflict = orange).
    const GIT_STATUS_CLASS: Record<string, string> = {
        modified: "text-amber-600 dark:text-amber-300",
        renamed: "text-amber-600 dark:text-amber-300",
        added: "text-green-600 dark:text-green-400",
        untracked: "text-green-600 dark:text-green-400",
        deleted: "text-red-500 dark:text-red-400 line-through",
        conflicted: "text-orange-600 dark:text-orange-400",
    };

    function fileStatusClass(path: string): string {
        // Ignored files are grayed out and never carry a change colour.
        if (isIgnored(path)) return "opacity-50";
        const s = changedFiles.get(norm(path));
        return s ? (GIT_STATUS_CLASS[s] ?? "") : "";
    }

    // Collapsed folders containing changes get the "modified" colour so the user
    // sees there's something changed inside without opening them.
    function folderStatusClass(node: FileTreeNode): string {
        // Ignored folders are grayed out (expanded or not).
        if (isIgnored(node.path)) return "opacity-50";
        if (node.isExpanded) return "";
        return changedDirs.has(norm(node.path)) ? "text-amber-600 dark:text-amber-300" : "";
    }

    interface GitFileStatus {
        path: string;
        status: string;
    }

    async function loadGitStatus(folder: string) {
        try {
            const entries = await invoke<GitFileStatus[]>("git_status", {
                folder,
            });
            const files = new Map<string, string>();
            const dirs = new Set<string>();
            // git paths are forward-slash; normalise the root to match so the
            // ancestor walk works regardless of the OS path separator.
            const root = norm(folder).replace(/\/+$/, "");
            for (const { path, status } of entries) {
                files.set(path, status);
                // Walk up the ancestors within the displayed tree only.
                let dir = path.slice(0, path.lastIndexOf("/"));
                while (dir.length > root.length && dir.startsWith(`${root}/`)) {
                    dirs.add(dir);
                    dir = dir.slice(0, dir.lastIndexOf("/"));
                }
            }
            changedFiles = files;
            changedDirs = dirs;
        } catch {
            // git command unavailable (e.g. non-unix build) or not a repo.
            changedFiles = new Map();
            changedDirs = new Set();
        }
    }

    // Pinning keeps the panel open when clicking outside (no backdrop) and lets
    // the user drag it anywhere by its header. `panelPos` is null while the panel
    // sits at its default anchored position; once dragged it switches to fixed
    // positioning at the stored viewport coordinates.
    let isPinned = $state(false);
    let panelPos = $state<{ x: number; y: number } | null>(null);
    let panelEl = $state<HTMLElement | null>(null);
    let _dragging = false;
    let _dragOffsetX = 0;
    let _dragOffsetY = 0;

    // Share the global window-manager stack so clicking the panel raises it above
    // any open dialogs (which use the same `bringToFront()` counter, base 500).
    let zIndex = $state(50);
    function focusPanel() {
        zIndex = bringToFront();
    }

    function startDrag(e: PointerEvent) {
        if (!isPinned || !panelEl) return;
        // Let header buttons (change folder, pin, …) handle their own clicks.
        if ((e.target as HTMLElement).closest("button")) return;
        const rect = panelEl.getBoundingClientRect();
        if (!panelPos) panelPos = { x: rect.left, y: rect.top };
        _dragOffsetX = e.clientX - panelPos.x;
        _dragOffsetY = e.clientY - panelPos.y;
        _dragging = true;
        window.addEventListener("pointermove", onDrag);
        window.addEventListener("pointerup", endDrag);
        e.preventDefault();
    }

    function onDrag(e: PointerEvent) {
        if (!_dragging || !panelEl) return;
        const w = panelEl.offsetWidth;
        const h = panelEl.offsetHeight;
        const x = Math.max(
            0,
            Math.min(e.clientX - _dragOffsetX, window.innerWidth - w),
        );
        const y = Math.max(
            0,
            Math.min(e.clientY - _dragOffsetY, window.innerHeight - h),
        );
        panelPos = { x, y };
    }

    function endDrag() {
        _dragging = false;
        window.removeEventListener("pointermove", onDrag);
        window.removeEventListener("pointerup", endDrag);
    }

    // Resizing (available pinned or not). Like dragging, the panel keeps its default Tailwind
    // size until the first resize, then switches to an explicit width/height. The
    // n/w handles move the top-left corner, so resizing initialises `panelPos`
    // (switching to fixed positioning) the same way dragging does.
    const MIN_W = 200;
    const MIN_H = 160;
    let panelSize = $state<{ w: number; h: number } | null>(null);

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
        if (!panelEl) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = panelEl.getBoundingClientRect();
        if (!panelPos) panelPos = { x: rect.left, y: rect.top };
        if (!panelSize) panelSize = { w: rect.width, h: rect.height };
        _resizeDir = dir;
        _resizeStartX = e.clientX;
        _resizeStartY = e.clientY;
        _resizeStartW = panelSize.w;
        _resizeStartH = panelSize.h;
        _resizeStartPanelX = panelPos.x;
        _resizeStartPanelY = panelPos.y;
        document.body.style.userSelect = "none";
        window.addEventListener("pointermove", onResize);
        window.addEventListener("pointerup", stopResize, { once: true });
    }

    function onResize(e: PointerEvent) {
        if (!panelSize || !panelPos) return;
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
        panelSize = { w: newW, h: newH };
        panelPos = { x: newX, y: newY };
    }

    function stopResize() {
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onResize);
    }

    let folderName = $derived($openFolderPath?.split("/").pop() ?? "");
    let isRtl = $derived($surahOrientation() === "flex-row-reverse");

    // Panel opens to the left (LTR) or right (RTL) of the editor content div
    // let panelClass = $derived(
    // 	isRtl
    // 		? 'absolute top-0 left-full ml-2 z-20 rounded-r-lg'
    // 		: 'absolute top-0 right-full mr-2 z-20 rounded-l-lg'
    // );

    // Button sits just outside the editor content div's left (LTR) or right (RTL) edge
    // let buttonPosClass = $derived(isRtl ? '-right-10' : '-left-5');

    let _unwatch: UnwatchFn | null = null;
    let _refreshTimer: ReturnType<typeof setTimeout> | null = null;

    $effect(() => {
        const folder = $openFolderPath;
        rootNodes = [];
        loadError = "";
        changedFiles = new Map();
        changedDirs = new Set();
        ignoredPaths = new Set();
        if (_unwatch) {
            _unwatch();
            _unwatch = null;
        }
        if (_refreshTimer) {
            clearTimeout(_refreshTimer);
            _refreshTimer = null;
        }
        if (!folder) return;
        loadRoot(folder);
        loadGitStatus(folder);
        loadGitIgnored(folder);
        setupWatcher(folder);
    });

    // Manual refresh trigger (e.g. user re-picks the same folder via OpenFolderButton)
    // `refreshTree` both reads and writes `rootNodes`, so it must run untracked —
    // otherwise this effect would depend on `rootNodes` and loop endlessly.
    $effect(() => {
        const tick = $folderRefreshTrigger;
        if (tick === 0) return;
        const folder = $openFolderPath;
        if (folder) untrack(() => refreshTree(folder));
    });

    onDestroy(() => {
        if (_unwatch) _unwatch();
        if (_refreshTimer) clearTimeout(_refreshTimer);
        if (_hoverExpandTimer) clearTimeout(_hoverExpandTimer);
        window.removeEventListener("pointermove", onDrag);
        window.removeEventListener("pointerup", endDrag);
        window.removeEventListener("pointermove", onResize);
        document.body.style.userSelect = "";
    });

    async function setupWatcher(folder: string) {
        try {
            _unwatch = await watchImmediate(
                folder,
                () => {
                    if (_refreshTimer) clearTimeout(_refreshTimer);
                    _refreshTimer = setTimeout(() => {
                        _refreshTimer = null;
                        if ($openFolderPath === folder) refreshTree(folder);
                    }, 150);
                },
                { recursive: true },
            );
        } catch {
            // Watching unavailable (e.g. permissions); explorer still works manually.
        }
    }

    function collectExpanded(nodes: FileTreeNode[], set: Set<string>) {
        for (const n of nodes) {
            if (n.isDirectory && n.isExpanded && n.isLoaded) {
                set.add(n.path);
                collectExpanded(n.children, set);
            }
        }
    }

    async function buildWithExpanded(
        parentPath: string,
        expanded: Set<string>,
    ): Promise<FileTreeNode[]> {
        const entries = await readDir(parentPath);
        const nodes = buildNodes(entries, parentPath);
        for (const n of nodes) {
            if (n.isDirectory && expanded.has(n.path)) {
                try {
                    n.children = await buildWithExpanded(n.path, expanded);
                    n.isLoaded = true;
                    n.isExpanded = true;
                } catch {
                    n.isForbidden = true;
                }
            }
        }
        return nodes;
    }

    async function refreshTree(folder: string) {
        const expanded = new Set<string>();
        collectExpanded(rootNodes, expanded);
        try {
            rootNodes = await buildWithExpanded(folder, expanded);
            await refreshOpenTabsFromDisk(folder);
            loadGitStatus(folder);
            loadGitIgnored(folder);
            loadError = "";
        } catch (e) {
            loadError = String(e);
        }
    }

    async function refreshOpenTabsFromDisk(folder: string) {
        const normalizedFolder = folder.replace(/\\/g, "/").replace(/\/+$/, "");
        const openFileTabs = $tabs.filter((tab) => {
            if (!tab.path) return false;
            const normalizedPath = tab.path.replace(/\\/g, "/");
            return normalizedPath.startsWith(`${normalizedFolder}/`);
        });

        await Promise.all(
            openFileTabs.map(async (tab) => {
                if (!tab.path) return;
                try {
                    const content = await readTextFile(tab.path);
                    syncCleanTabsFromDisk(tab.path, content);
                } catch {
                    // Ignore tabs whose files were removed or are temporarily inaccessible.
                }
            }),
        );
    }

    function buildNodes(
        entries: Awaited<ReturnType<typeof readDir>>,
        parentPath: string,
    ): FileTreeNode[] {
        const dirs: FileTreeNode[] = [];
        const files: FileTreeNode[] = [];

        for (const entry of entries) {
            if (!entry.name) continue;
            const fullPath = `${parentPath}/${entry.name}`;
            if (entry.isDirectory) {
                dirs.push({
                    name: entry.name,
                    path: fullPath,
                    isDirectory: true,
                    isExpanded: false,
                    isLoaded: false,
                    isLoading: false,
                    isForbidden: false,
                    children: [],
                });
            } else {
                // Every file is listed so the user sees the full folder
                // contents. Unsupported types (handled in the template) are
                // shown grayed out and warn on click rather than opening.
                files.push({
                    name: entry.name,
                    path: fullPath,
                    isDirectory: false,
                    isExpanded: false,
                    isLoaded: true,
                    isLoading: false,
                    isForbidden: false,
                    children: [],
                });
            }
        }

        dirs.sort((a, b) => a.name.localeCompare(b.name));
        files.sort((a, b) => a.name.localeCompare(b.name));

        return [...dirs, ...files];
    }

    async function loadRoot(folder: string) {
        isLoadingRoot = true;
        loadError = "";
        try {
            const entries = await readDir(folder);
            rootNodes = buildNodes(entries, folder);
        } catch (e) {
            loadError = String(e);
        } finally {
            isLoadingRoot = false;
        }
    }

    async function toggleDirectory(node: FileTreeNode) {
        if (!node.isLoaded) {
            node.isLoading = true;
            node.isForbidden = false;
            try {
                const entries = await readDir(node.path);
                node.children = buildNodes(entries, node.path);
                node.isLoaded = true;
                node.isExpanded = true;
            } catch {
                // Permission denied or other error: mark as forbidden, stay collapsed
                node.isForbidden = true;
                node.isLoaded = false;
                node.isExpanded = false;
            } finally {
                node.isLoading = false;
            }
        } else {
            node.isExpanded = !node.isExpanded;
            // Reset forbidden flag when user retries by clicking again
            if (node.isExpanded) node.isForbidden = false;
        }
    }

    async function openFolder() {
        const result = await openDialog({ directory: true, multiple: false });
        if (!result || Array.isArray(result)) return;
        const picked = result as string;
        if ($openFolderPath === picked) {
            folderRefreshTrigger.update((n) => n + 1);
        } else {
            openFolderPath.set(picked);
        }
    }

    async function previewFile(node: FileTreeNode) {
        try {
            const content = await readTextFile(node.path);
            actionError = "";
            openPreviewTab(node.path, content);
        } catch (e) {
            actionError = `Cannot open "${node.name}": ${e}`;
        }
    }

    async function openFile(node: FileTreeNode) {
        try {
            const content = await readTextFile(node.path);
            actionError = "";
            openOrFocusTab(node.path, content);
        } catch (e) {
            actionError = `Cannot open "${node.name}": ${e}`;
        }
    }

    // Image / PDF files open in a standalone viewer dialog rather than a tab.
    let mediaViewerOpen = $state(false);
    let mediaViewerPath = $state<string | null>(null);

    function openMedia(node: FileTreeNode) {
        mediaViewerPath = node.path;
        mediaViewerOpen = true;
    }

    // Files the app can't render (binaries, archives, office docs, …) are still
    // listed so the user sees the folder's full contents, but clicking them just
    // surfaces a warning instead of trying to open them.
    function warnUnsupported(node: FileTreeNode) {
        actionError = $t("explorer.cannot_open", { name: node.name });
    }

    // ── Right-click context menu + inline rename ──
    let ctxMenuNode = $state<FileTreeNode | null>(null);
    let ctxMenuPos = $state<{ x: number; y: number } | null>(null);
    let renamingPath = $state<string | null>(null);
    let renameValue = $state("");
    // Transient error for rename/create actions — distinct from `loadError`,
    // whose banner offers a destructive "Back" that clears the whole folder.
    let actionError = $state("");

    function openNodeContextMenu(e: MouseEvent, node: FileTreeNode) {
        e.preventDefault();
        e.stopPropagation();
        ctxMenuNode = node;
        ctxMenuPos = { x: e.clientX, y: e.clientY };
    }

    function closeNodeContextMenu() {
        ctxMenuNode = null;
        ctxMenuPos = null;
    }

    function startRenameNode(node: FileTreeNode) {
        closeNodeContextMenu();
        actionError = "";
        renamingPath = node.path;
        renameValue = node.name;
    }

    async function commitRenameNode() {
        const path = renamingPath;
        if (!path) return;
        const newName = renameValue.trim();
        renamingPath = null;
        const oldName = path.split("/").pop() ?? "";
        if (!newName || newName === oldName) return;
        try {
            await renameFileByPath(path, newName);
        } catch (e) {
            actionError = String(e);
        }
    }

    function cancelRenameNode() {
        renamingPath = null;
    }

    // ── Copy / Cut / Paste (VS Code-style) ──
    // A single in-app clipboard holds the path plus whether it's a copy or a
    // move. Pasting targets the right-clicked folder (or a file's parent dir),
    // mirroring VS Code; cut entries clear once pasted.
    let clipboard = $state<{ path: string; mode: "copy" | "cut" } | null>(null);

    function copyNode(node: FileTreeNode) {
        closeNodeContextMenu();
        clipboard = { path: node.path, mode: "copy" };
    }

    function cutNode(node: FileTreeNode) {
        closeNodeContextMenu();
        clipboard = { path: node.path, mode: "cut" };
    }

    // Where a paste lands: into a folder itself, or into a file's parent dir.
    function pasteTargetDir(node: FileTreeNode | null): string {
        const root = $openFolderPath ?? "";
        if (!node) return root;
        return node.isDirectory ? node.path : dirOf(node.path);
    }

    async function pasteIntoNode(node: FileTreeNode | null) {
        const clip = clipboard;
        closeNodeContextMenu();
        if (!clip) return;
        const destDir = pasteTargetDir(node);
        // Reject pasting a folder into itself or one of its own descendants.
        if (
            clip.mode === "cut" &&
            (destDir === clip.path || destDir.startsWith(`${clip.path}/`))
        ) {
            actionError = "Cannot move a folder into itself";
            return;
        }
        actionError = "";
        try {
            // Make sure a folder target is expanded so the result is visible.
            if (node?.isDirectory) await ensureExpanded(node);
            if (clip.mode === "copy") {
                await copyPathInto(clip.path, destDir);
            } else {
                await cutPathInto(clip.path, destDir);
                clipboard = null; // a cut item moves only once
            }
        } catch (e) {
            actionError = String(e);
        }
    }

    // ── Soft delete (move to Trash / Recycle Bin) with confirmation ──
    // Uses the OS-native confirmation dialog so the warning matches the
    // platform's look and feel, emphasising that the item goes to the Trash.
    async function requestDeleteNode(node: FileTreeNode) {
        closeNodeContextMenu();
        const message = $t(
            node.isDirectory
                ? "explorer.delete_confirm_folder"
                : "explorer.delete_confirm_file",
            { name: node.name },
        );
        const confirmed = await confirmDialog(message, {
            title: $t("explorer.delete_confirm_title"),
            kind: "warning",
            okLabel: $t("explorer.delete_confirm"),
            cancelLabel: $t("explorer.delete_cancel"),
        });
        if (!confirmed) return;
        actionError = "";
        try {
            await deleteFileByPath(node.path);
            // Drop the deleted item from the clipboard if it was queued.
            if (clipboard?.path === node.path) clipboard = null;
        } catch (e) {
            actionError = String(e);
        }
    }

    // Autofocus the rename input and preselect the name (sans extension).
    function autofocusSelect(node: HTMLInputElement) {
        node.focus();
        const dot = node.value.lastIndexOf(".");
        if (dot > 0) node.setSelectionRange(0, dot);
        else node.select();
    }

    // ── New File / New Folder (VS Code-style inline draft row) ──
    let creating = $state<{ kind: "file" | "folder"; parentPath: string } | null>(
        null,
    );
    let createValue = $state("");

    /** Ensure a directory node is expanded and loaded so a draft row is visible. */
    async function ensureExpanded(node: FileTreeNode): Promise<boolean> {
        if (!node.isLoaded) {
            try {
                const entries = await readDir(node.path);
                node.children = buildNodes(entries, node.path);
                node.isLoaded = true;
            } catch {
                node.isForbidden = true;
                return false;
            }
        }
        node.isExpanded = true;
        return true;
    }

    /**
     * Begin creating a file/folder. `anchor` mirrors VS Code: right-clicking a
     * folder creates inside it; a file creates a sibling; the toolbar (null)
     * creates at the workspace root.
     */
    async function startCreate(
        kind: "file" | "folder",
        anchor: FileTreeNode | null,
    ) {
        closeNodeContextMenu();
        renamingPath = null;
        actionError = "";
        const root = $openFolderPath;
        if (!root) return;
        let parentPath = root;
        if (anchor) {
            if (anchor.isDirectory) {
                if (!(await ensureExpanded(anchor))) return;
                parentPath = anchor.path;
            } else {
                parentPath =
                    anchor.path.split("/").slice(0, -1).join("/") || root;
            }
        }
        createValue = "";
        creating = { kind, parentPath };
    }

    async function commitCreate() {
        const c = creating;
        if (!c) return;
        const name = createValue.trim();
        creating = null;
        if (!name) return;
        const newPath = `${c.parentPath}/${name}`;
        try {
            if (await exists(newPath)) {
                actionError = `"${name}" already exists`;
                return;
            }
            if (c.kind === "folder") {
                await mkdir(newPath);
            } else {
                await writeTextFile(newPath, "");
            }
            const root = $openFolderPath;
            if (root) await refreshTree(root);
            // Open freshly created text files just like VS Code does.
            if (c.kind === "file" && isFlatFile(name)) {
                try {
                    const content = await readTextFile(newPath);
                    openOrFocusTab(newPath, content);
                } catch {
                    // Newly created but momentarily unreadable — ignore.
                }
            }
        } catch (e) {
            actionError = String(e);
        }
    }

    function cancelCreate() {
        creating = null;
    }

    // ── Drag a file/folder into a folder (VS Code-style, pointer-based) ──
    // HTML5 DnD's `drop` doesn't fire in WKWebView, so we drive it with pointer
    // events like the editor tab strip does.
    let draggingPath = $state<string | null>(null);
    // Resolved destination directory currently under the pointer (null = none).
    // Empty-string sentinel is never used; the root folder path is stored as-is.
    let dragOverDir = $state<string | null>(null);
    let _dragCandidatePath: string | null = null;
    let _dragStartX = 0;
    let _dragStartY = 0;
    let _draggingActive = false;
    let _dragJustCompleted = false;
    const DRAG_THRESHOLD = 5;

    // Hover-to-expand: dwelling over a collapsed folder opens it mid-drag.
    let _hoverExpandTimer: ReturnType<typeof setTimeout> | null = null;
    let _hoverExpandPath: string | null = null;

    function findNode(
        nodes: FileTreeNode[],
        path: string,
    ): FileTreeNode | null {
        for (const n of nodes) {
            if (n.path === path) return n;
            if (n.children.length) {
                const found = findNode(n.children, path);
                if (found) return found;
            }
        }
        return null;
    }

    function dirOf(path: string): string {
        return path.split("/").slice(0, -1).join("/");
    }

    function onNodePointerDown(e: PointerEvent, node: FileTreeNode) {
        if (e.button !== 0) return;
        // Don't start a drag from the inline rename input.
        if ((e.target as HTMLElement).closest("input")) return;
        _dragCandidatePath = node.path;
        _dragStartX = e.clientX;
        _dragStartY = e.clientY;
    }

    function clearHoverExpand() {
        if (_hoverExpandTimer) clearTimeout(_hoverExpandTimer);
        _hoverExpandTimer = null;
        _hoverExpandPath = null;
    }

    function onWindowPointerMove(e: PointerEvent) {
        if (!_dragCandidatePath) return;
        if (
            !_draggingActive &&
            Math.hypot(e.clientX - _dragStartX, e.clientY - _dragStartY) <
                DRAG_THRESHOLD
        )
            return;
        if (!_draggingActive) {
            _draggingActive = true;
            draggingPath = _dragCandidatePath;
            document.body.style.userSelect = "none";
        }

        const dragged = draggingPath!;
        const draggedParent = dirOf(dragged);
        const els = document.elementsFromPoint(e.clientX, e.clientY);
        const nodeEl = els.find(
            (el): el is HTMLElement =>
                el instanceof HTMLElement && !!el.dataset.nodePath,
        );

        let dest: string | null = null;
        if (nodeEl) {
            const path = nodeEl.dataset.nodePath!;
            dest =
                nodeEl.dataset.nodeIsDir === "true" ? path : dirOf(path);
        } else if (
            els.some(
                (el) => el instanceof HTMLElement && el.dataset.treeBody,
            )
        ) {
            // Empty space inside the tree → move to the workspace root.
            dest = $openFolderPath ?? null;
        }

        // Reject no-ops and moving a folder into itself or a descendant.
        if (
            dest === null ||
            dest === draggedParent ||
            dest === dragged ||
            dest.startsWith(`${dragged}/`)
        ) {
            dragOverDir = null;
            clearHoverExpand();
            return;
        }

        dragOverDir = dest;

        // Schedule hover-expand when dwelling over a collapsed folder.
        if (dest !== _hoverExpandPath) {
            clearHoverExpand();
            _hoverExpandPath = dest;
            _hoverExpandTimer = setTimeout(() => {
                const n = findNode(rootNodes, dest!);
                if (n && n.isDirectory && !n.isExpanded) void ensureExpanded(n);
            }, 600);
        }
    }

    function onWindowPointerUp() {
        if (_draggingActive && draggingPath && dragOverDir !== null) {
            void moveNode(draggingPath, dragOverDir);
            _dragJustCompleted = true;
            setTimeout(() => (_dragJustCompleted = false), 50);
        }
        _draggingActive = false;
        draggingPath = null;
        dragOverDir = null;
        _dragCandidatePath = null;
        document.body.style.userSelect = "";
        clearHoverExpand();
    }

    async function moveNode(srcPath: string, destDir: string) {
        actionError = "";
        const name = srcPath.split("/").pop()!;
        const newPath = `${destDir}/${name}`;
        try {
            if (await exists(newPath)) {
                actionError = `"${name}" already exists in the destination`;
                return;
            }
            // moveFileByPath bumps folderRefreshTrigger, which refreshes the
            // tree via its effect — no explicit refresh needed here.
            await moveFileByPath(srcPath, destDir);
        } catch (e) {
            actionError = String(e);
        }
    }

    function hasAnySupportedFile(nodes: FileTreeNode[]): boolean {
        for (const node of nodes) {
            if (!node.isDirectory) return true;
            if (node.isLoaded && hasAnySupportedFile(node.children))
                return true;
        }
        return false;
    }

    function togglePanel() {
        isOpen = !isOpen;
        // A fresh open always returns to the default anchored position and size,
        // discarding any spot/size from a previous (pinned) session.
        if (isOpen) {
            panelPos = null;
            panelSize = null;
        }
    }

    // Close the panel when the user presses down anywhere outside it — the
    // non-modal replacement for the old full-screen backdrop. Crucially this
    // listener doesn't block wheel/scroll, so the editor behind stays usable.
    function handleWindowPointerDown(e: PointerEvent) {
        // Pinned panels intentionally stay open on outside interaction.
        if (!isOpen || isPinned) return;
        // While the panel owns a popover/dialog, let it manage its own clicks.
        if (ctxMenuNode || mediaViewerOpen) return;
        const target = e.target as HTMLElement | null;
        if (!target) return;
        if (panelEl?.contains(target)) return; // clicks inside the panel
        if (target.closest("[data-explorer-toggle]")) return; // the open/close button
        isOpen = false;
    }

    // Cmd+Shift+E / Ctrl+Shift+E toggles the File Explorer; Escape closes it.
    function handleWindowKeydown(e: KeyboardEvent) {
        // Note: on macOS WebKit, Cmd suppresses Shift in e.key, so Cmd+Shift+E
        // arrives as "e" rather than "E" — compare case-insensitively.
        if (
            (e.ctrlKey || e.metaKey) &&
            e.shiftKey &&
            e.key.toLowerCase() === "e"
        ) {
            e.preventDefault();
            togglePanel();
        }
        if (e.key === "Escape") {
            if (ctxMenuNode) {
                closeNodeContextMenu();
                return;
            }
            if (renamingPath) {
                cancelRenameNode();
                return;
            }
            if (creating) {
                cancelCreate();
                return;
            }
            if (isOpen) isOpen = false;
        }
    }
</script>

<svelte:window
    onkeydown={handleWindowKeydown}
    onpointerdown={handleWindowPointerDown}
    onpointermove={onWindowPointerMove}
    onpointerup={onWindowPointerUp}
/>

<!-- Zen-mode locator dot — marks where the (hidden) File Explorer button sits. -->
{#if $zenMode && !$zenPeek && !isOpen}
    <div
        aria-hidden="true"
        class="pointer-events-none absolute -left-5 top-1/3 z-2 h-8 w-8 flex items-center justify-center"
    >
        <span
            class="h-1.5 w-1.5 rounded-full bg-brand-charcoal-400 dark:bg-[#838ba7] opacity-15"
        ></span>
    </div>
{/if}

<!-- File Explorer button — outside the editor content div on the left (LTR) or right (RTL), same vertical level as CollapsibleSidebar toggle -->
<button
    class="cursor-pointer absolute -left-5 top-1/3 z-3 {actionBtnStyle} {isOpen
        ? 'bg-brand-gold-400 dark:bg-[#363a4f]'
        : ''} {$zenMode
        ? $zenPeek
            ? 'opacity-50 transition-opacity duration-200'
            : 'opacity-0 hover:opacity-100 transition-opacity duration-200'
        : ''}"
    onclick={togglePanel}
    data-explorer-toggle
    aria-label="File Explorer"
    title="File Explorer"
>
    <Icon icon="solar:folder-with-files-bold-duotone" class="h-4 w-4" />
</button>

<!-- No modal backdrop: closing on outside click is handled by the window
     pointerdown listener instead, so the editor behind the (non-pinned) panel
     stays scrollable and clickable while the panel is open. -->

<!-- Floating panel — opens to the left (LTR) or right (RTL) of the editor, ~1/3 height -->
{#if isOpen}
    <div
        bind:this={panelEl}
        role="presentation"
        onpointerdown={focusPanel}
        transition:fly={{ x: isRtl ? 8 : -8, duration: 180, opacity: 0 }}
        class="{panelPos
            ? 'fixed'
            : 'absolute top-1/3 left-1.5 ml-2'} rounded-3xl {panelSize
            ? ''
            : 'w-72 max-h-[33vh]'} bg-white dark:bg-[#292c3c]
		       border border-stone-200 dark:border-[#414559]
		       shadow-xl shadow-black/15 dark:shadow-black/40
		       flex flex-col overflow-hidden"
        style="z-index:{zIndex};{panelPos
            ? ` left:${panelPos.x}px; top:${panelPos.y}px;`
            : ''}{panelSize
            ? ` width:${panelSize.w}px; height:${panelSize.h}px;`
            : ''}"
    >
        <!-- Panel header — doubles as the drag handle while pinned -->
        <div
            role="presentation"
            onpointerdown={startDrag}
            class="shrink-0 px-3 py-2 border-b border-stone-200 dark:border-[#414559]
			       bg-brand-sand-50 dark:bg-[#232634] flex items-center justify-between gap-2 select-none {isPinned
                ? 'cursor-move'
                : ''}"
        >
            <div class="flex items-center gap-2 flex-1 min-w-0">
                {#if $openFolderPath}
                    <span
                        class="text-[10px] font-semibold uppercase tracking-wide
						       text-brand-charcoal-300 dark:text-[#838ba7] truncate flex-1"
                        title={$openFolderPath}
                    >
                        {folderName}
                    </span>
                    <button
                        onclick={openFolder}
                        class="cursor-pointer shrink-0 text-[10px] font-semibold text-brand-charcoal-300
						       dark:text-[#838ba7] hover:text-brand-gold-500 dark:hover:text-[#e5c890]
						       transition-colors"
                    >
                        {$t("explorer.change")}
                    </button>
                {:else}
                    <button
                        onclick={openFolder}
                        class="cursor-pointer w-full px-3 py-1 text-[11px] font-semibold rounded-full
						       border border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200
						       dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559]
						       text-brand-charcoal-500 dark:text-[#c6d0f5] transition-colors
						       flex items-center justify-center gap-1.5"
                    >
                        <Icon
                            icon="solar:folder-with-files-bold-duotone"
                            width="0.85rem"
                        />
                        {$t("explorer.open_folder")}
                    </button>
                {/if}
            </div>
            {#if $openFolderPath}
                <button
                    onclick={() => startCreate("file", null)}
                    class="cursor-pointer shrink-0 rounded-full p-1 transition-colors
                           text-brand-charcoal-300 dark:text-[#838ba7] hover:text-brand-gold-500 dark:hover:text-[#e5c890]"
                    title={$t("explorer.new_file")}
                    aria-label={$t("explorer.new_file")}
                >
                    <Icon icon="solar:document-add-bold-duotone" width="0.9rem" />
                </button>
                <button
                    onclick={() => startCreate("folder", null)}
                    class="cursor-pointer shrink-0 rounded-full p-1 transition-colors
                           text-brand-charcoal-300 dark:text-[#838ba7] hover:text-brand-gold-500 dark:hover:text-[#e5c890]"
                    title={$t("explorer.new_folder")}
                    aria-label={$t("explorer.new_folder")}
                >
                    <Icon icon="solar:add-folder-bold-duotone" width="0.9rem" />
                </button>
            {/if}
            <button
                onclick={() => (isPinned = !isPinned)}
                class="cursor-pointer shrink-0 rounded-full p-1 transition-colors {isPinned
                    ? 'text-brand-gold-500 dark:text-[#e5c890] bg-brand-gold-100 dark:bg-[#363a4f]'
                    : 'text-brand-charcoal-300 dark:text-[#838ba7] hover:text-brand-gold-500 dark:hover:text-[#e5c890]'}"
                title={isPinned ? "Unpin panel" : "Pin panel"}
                aria-label={isPinned ? "Unpin panel" : "Pin panel"}
            >
                <Icon icon="solar:pin-bold-duotone" width="0.85rem" />
            </button>
        </div>

        <!-- Root-level error banner with Back / Retry actions -->
        {#if loadError}
            <div
                class="shrink-0 px-3 py-1.5 border-b border-red-200 dark:border-red-800/40
			            bg-red-50 dark:bg-red-900/20 flex items-center gap-2"
            >
                <Icon
                    icon="solar:lock-bold-duotone"
                    width="0.75rem"
                    class="shrink-0 text-red-400"
                />
                <span
                    class="text-[10px] text-red-500 dark:text-red-400 flex-1 truncate"
                >
                    {$t("explorer.cannot_read")}
                </span>
                <button
                    onclick={() => {
                        loadError = "";
                        openFolderPath.set(null);
                    }}
                    class="cursor-pointer shrink-0 text-[10px] font-semibold text-brand-charcoal-400
					       dark:text-[#838ba7] hover:text-brand-gold-500 dark:hover:text-[#e5c890]
					       transition-colors"
                    title="Clear folder and go back"
                >
                    {$t("explorer.back")}
                </button>
                <button
                    onclick={() => $openFolderPath && loadRoot($openFolderPath)}
                    class="cursor-pointer shrink-0 text-[10px] font-semibold text-brand-charcoal-400
					       dark:text-[#838ba7] hover:text-brand-gold-500 dark:hover:text-[#e5c890]
					       transition-colors"
                    title="Retry loading folder"
                >
                    {$t("explorer.retry")}
                </button>
            </div>
        {/if}

        <!-- Transient action error (rename / create) — dismissible, non-destructive -->
        {#if actionError}
            <div
                class="shrink-0 px-3 py-1.5 border-b border-red-200 dark:border-red-800/40
			            bg-red-50 dark:bg-red-900/20 flex items-center gap-2"
            >
                <Icon
                    icon="solar:danger-triangle-bold-duotone"
                    width="0.75rem"
                    class="shrink-0 text-red-400"
                />
                <span
                    class="text-[10px] text-red-500 dark:text-red-400 flex-1 truncate"
                    title={actionError}
                >
                    {actionError}
                </span>
                <button
                    onclick={() => (actionError = "")}
                    class="cursor-pointer shrink-0 text-red-400 hover:text-red-500 transition-colors"
                    aria-label="Dismiss"
                    title="Dismiss"
                >
                    <Icon icon="solar:close-circle-bold" width="0.85rem" />
                </button>
            </div>
        {/if}

        <!-- Tree body -->
        <div
            data-tree-body="true"
            class="flex-1 min-h-0 overflow-y-auto py-1 px-1 rounded-b-3xl bg-brand-sand-50 dark:bg-[#232634] {draggingPath &&
            dragOverDir === $openFolderPath
                ? 'ring-2 ring-inset ring-brand-gold-400 bg-brand-gold-50/40 dark:bg-[#363a4f]/40'
                : ''}"
        >
            {#if isLoadingRoot}
                <p
                    class="text-[10px] italic text-brand-charcoal-300 dark:text-[#838ba7] px-2 py-2"
                >
                    {$t("explorer.loading")}
                </p>
            {:else if !$openFolderPath}
                <p
                    class="text-[11px] text-center italic text-brand-charcoal-300 dark:text-[#838ba7] px-2 py-2"
                >
                    {$t("explorer.no_folder")}
                </p>
            {:else if !loadError}
                {@render createRow($openFolderPath ?? "", 0)}
                {#if rootNodes.length === 0 && !creating}
                    <p
                        class="text-[10px] italic text-brand-charcoal-300 dark:text-[#838ba7] px-2 py-2"
                    >
                        {$t("explorer.no_files")}
                    </p>
                {:else}
                    {@render treeNodes(rootNodes, 0)}
                {/if}
            {/if}
        </div>

        <!-- Resize handles — always available so the panel can be sized to taste, pinned or not -->
        {#each resizeHandles as { cls, dir }}
            <div
                aria-hidden="true"
                class="resize-handle {cls}"
                onpointerdown={(e) => startResize(e, dir)}
            ></div>
        {/each}
    </div>
{/if}

<!-- Image / PDF viewer — independent of the explorer panel's open state -->
<MediaViewerDialog
    open={mediaViewerOpen}
    path={mediaViewerPath}
    onClose={() => (mediaViewerOpen = false)}
/>

<!-- File node context menu — Rename (rendered at top level so it escapes the panel's overflow) -->
{#if ctxMenuNode && ctxMenuPos}
    <div
        role="presentation"
        class="fixed inset-0"
        style="z-index: 9998;"
        onclick={closeNodeContextMenu}
        oncontextmenu={(e) => {
            e.preventDefault();
            closeNodeContextMenu();
        }}
    ></div>
    <div
        style="position: fixed; left: {ctxMenuPos.x}px; top: {ctxMenuPos.y}px; z-index: 9999;"
        class="bg-brand-sand-50 dark:bg-[#292c3c] border border-brand-sand-200 dark:border-[#414559] rounded-2xl shadow-xl p-1.5 min-w-36"
    >
        <button
            onclick={() => startCreate("file", ctxMenuNode)}
            class="cursor-pointer w-full flex items-center gap-2 p-1 px-3 text-xs rounded-full text-brand-charcoal-500 dark:text-[#8087a2] hover:bg-brand-sand-200 dark:hover:bg-[#414559] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]"
        >
            <Icon icon="solar:document-add-bold-duotone" width="0.85rem" class="shrink-0" />
            {$t("explorer.new_file")}
        </button>
        <button
            onclick={() => startCreate("folder", ctxMenuNode)}
            class="cursor-pointer w-full flex items-center gap-2 p-1 px-3 text-xs rounded-full text-brand-charcoal-500 dark:text-[#8087a2] hover:bg-brand-sand-200 dark:hover:bg-[#414559] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]"
        >
            <Icon icon="solar:add-folder-bold-duotone" width="0.85rem" class="shrink-0" />
            {$t("explorer.new_folder")}
        </button>
        <div class="my-1 border-t border-brand-sand-200 dark:border-[#414559]"></div>
        <button
            onclick={() => ctxMenuNode && startRenameNode(ctxMenuNode)}
            class="cursor-pointer w-full flex items-center gap-2 p-1 px-3 text-xs rounded-full text-brand-charcoal-500 dark:text-[#8087a2] hover:bg-brand-sand-200 dark:hover:bg-[#414559] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]"
        >
            <Icon icon="solar:pen-bold-duotone" width="0.85rem" class="shrink-0" />
            {$t("explorer.rename")}
        </button>
        <div class="my-1 border-t border-brand-sand-200 dark:border-[#414559]"></div>
        <button
            onclick={() => ctxMenuNode && copyNode(ctxMenuNode)}
            class="cursor-pointer w-full flex items-center gap-2 p-1 px-3 text-xs rounded-full text-brand-charcoal-500 dark:text-[#8087a2] hover:bg-brand-sand-200 dark:hover:bg-[#414559] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]"
        >
            <Icon icon="solar:copy-bold-duotone" width="0.85rem" class="shrink-0" />
            {$t("explorer.copy")}
        </button>
        <button
            onclick={() => ctxMenuNode && cutNode(ctxMenuNode)}
            class="cursor-pointer w-full flex items-center gap-2 p-1 px-3 text-xs rounded-full text-brand-charcoal-500 dark:text-[#8087a2] hover:bg-brand-sand-200 dark:hover:bg-[#414559] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]"
        >
            <Icon icon="solar:scissors-bold-duotone" width="0.85rem" class="shrink-0" />
            {$t("explorer.cut")}
        </button>
        {#if clipboard}
            <button
                onclick={() => pasteIntoNode(ctxMenuNode)}
                class="cursor-pointer w-full flex items-center gap-2 p-1 px-3 text-xs rounded-full text-brand-charcoal-500 dark:text-[#8087a2] hover:bg-brand-sand-200 dark:hover:bg-[#414559] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]"
            >
                <Icon icon="solar:clipboard-add-bold-duotone" width="0.85rem" class="shrink-0" />
                {$t("explorer.paste")}
            </button>
        {/if}
        <div class="my-1 border-t border-brand-sand-200 dark:border-[#414559]"></div>
        <button
            onclick={() => ctxMenuNode && requestDeleteNode(ctxMenuNode)}
            class="cursor-pointer w-full flex items-center gap-2 p-1 px-3 text-xs rounded-full text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-300"
        >
            <Icon icon="solar:trash-bin-trash-bold-duotone" width="0.85rem" class="shrink-0" />
            {$t("explorer.delete")}
        </button>
    </div>
{/if}

{#snippet createRow(parentPath: string, depth: number)}
    {#if creating && creating.parentPath === parentPath}
        <div
            class="flex items-center gap-1 py-0.5"
            style="padding-left: {0.5 + depth * 0.75}rem; padding-right: 0.5rem"
        >
            <Icon
                icon={creating.kind === "folder"
                    ? "solar:folder-bold-duotone"
                    : "solar:file-text-bold-duotone"}
                width="0.8rem"
                class="shrink-0 {creating.kind === 'folder'
                    ? 'text-brand-gold-500 dark:text-[#e5c890]'
                    : 'text-brand-charcoal-300 dark:text-[#626880]'}"
            />
            <input
                bind:value={createValue}
                use:autofocusSelect
                placeholder={creating.kind === "folder"
                    ? $t("explorer.new_folder")
                    : $t("explorer.new_file")}
                onpointerdown={(e) => e.stopPropagation()}
                onclick={(e) => e.stopPropagation()}
                onblur={commitCreate}
                onkeydown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                        e.preventDefault();
                        commitCreate();
                    } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancelCreate();
                    }
                }}
                class="min-w-0 flex-1 bg-transparent border-b border-brand-gold-400 outline-none
                       text-[13px] font-mono text-brand-charcoal-700 dark:text-[#c6d0f5]"
            />
        </div>
    {/if}
{/snippet}

{#snippet nodeName(node: FileTreeNode, extraClass: string)}
    {#if renamingPath === node.path}
        <input
            bind:value={renameValue}
            use:autofocusSelect
            onpointerdown={(e) => e.stopPropagation()}
            onclick={(e) => e.stopPropagation()}
            ondblclick={(e) => e.stopPropagation()}
            onblur={commitRenameNode}
            onkeydown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                    e.preventDefault();
                    commitRenameNode();
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancelRenameNode();
                }
            }}
            class="min-w-0 flex-1 bg-transparent border-b border-brand-gold-400 outline-none
                   text-[13px] font-mono text-brand-charcoal-700 dark:text-[#c6d0f5]"
        />
    {:else}
        <span class="truncate {extraClass}" title={node.name}>{node.name}</span>
    {/if}
{/snippet}

{#snippet treeNodes(nodes: FileTreeNode[], depth: number)}
    {#each nodes as node (node.path)}
        {#if node.isDirectory}
            <button
                data-node-path={node.path}
                data-node-is-dir="true"
                onpointerdown={(e) => onNodePointerDown(e, node)}
                onclick={() => {
                    if (_dragJustCompleted) return;
                    toggleDirectory(node);
                }}
                oncontextmenu={(e) => openNodeContextMenu(e, node)}
                class="cursor-pointer flex w-full items-center gap-1 py-0.5 text-[13px]
				       text-brand-charcoal-500 dark:text-[#c6d0f5]
				       hover:bg-brand-sand-100 dark:hover:bg-[#363a4f]
				       rounded-full transition-colors font-mono text-left {draggingPath === node.path ? 'opacity-40' : ''} {dragOverDir === node.path ? 'ring-2 ring-inset ring-brand-gold-400 bg-brand-gold-50 dark:bg-[#363a4f]' : ''}"
                style="padding-left: {0.5 +
                    depth * 0.75}rem; padding-right: 0.5rem"
            >
                {#if node.isLoading}
                    <Icon
                        icon="solar:refresh-bold"
                        width="0.65rem"
                        class="shrink-0 animate-spin text-brand-charcoal-300 dark:text-[#626880]"
                    />
                {:else if node.isForbidden}
                    <Icon
                        icon="solar:lock-bold-duotone"
                        width="0.65rem"
                        class="shrink-0 text-red-400 dark:text-red-500"
                    />
                {:else}
                    <Icon
                        icon={node.isExpanded
                            ? "solar:alt-arrow-down-bold-duotone"
                            : "solar:alt-arrow-right-bold-duotone"}
                        width="0.65rem"
                        class="shrink-0 text-brand-charcoal-300 dark:text-[#626880]"
                    />
                {/if}
                <Icon
                    icon={node.isExpanded
                        ? "solar:folder-open-bold-duotone"
                        : "solar:folder-bold-duotone"}
                    width="0.8rem"
                    class="shrink-0 {node.isForbidden
                        ? 'text-brand-charcoal-200 dark:text-[#414559]'
                        : 'text-brand-gold-500 dark:text-[#e5c890]'}"
                />
                {@render nodeName(
                    node,
                    node.isForbidden ? "opacity-50" : folderStatusClass(node),
                )}
            </button>
            {#if node.isExpanded && node.isLoaded}
                {@render createRow(node.path, depth + 1)}
                {#if node.children.length === 0 && !(creating && creating.parentPath === node.path)}
                    <p
                        class="text-[10px] italic text-brand-charcoal-300 dark:text-[#838ba7]"
                        style="padding-left: {0.5 + (depth + 1) * 0.75}rem"
                    >
                        {$t("explorer.empty")}
                    </p>
                {:else}
                    {@render treeNodes(node.children, depth + 1)}
                {/if}
            {/if}
        {:else if isImageFile(node.name) || isPdfFile(node.name)}
            <button
                data-node-path={node.path}
                data-node-is-dir="false"
                onpointerdown={(e) => onNodePointerDown(e, node)}
                ondblclick={() => openMedia(node)}
                oncontextmenu={(e) => openNodeContextMenu(e, node)}
                class="cursor-pointer flex w-full items-center gap-1 py-0.5 text-[13px]
				       text-brand-charcoal-500 dark:text-[#c6d0f5]
				       hover:text-brand-gold-500 dark:hover:text-[#e5c890]
				       hover:bg-brand-sand-100 dark:hover:bg-[#363a4f]
				       rounded-full transition-colors font-mono text-left {draggingPath === node.path ? 'opacity-40' : ''} {dragOverDir === node.path ? 'ring-2 ring-inset ring-brand-gold-400 bg-brand-gold-50 dark:bg-[#363a4f]' : ''}"
                style="padding-left: {0.5 +
                    depth * 0.75}rem; padding-right: 0.5rem"
                title={node.name}
            >
                <Icon
                    icon={isPdfFile(node.name)
                        ? "solar:file-text-bold-duotone"
                        : "solar:gallery-bold-duotone"}
                    width="0.8rem"
                    class="shrink-0 text-brand-gold-500 dark:text-[#e5c890]"
                />
                {@render nodeName(node, fileStatusClass(node.path))}
            </button>
        {:else if isFlatFile(node.name)}
            <button
                data-node-path={node.path}
                data-node-is-dir="false"
                onpointerdown={(e) => onNodePointerDown(e, node)}
                onclick={() => {
                    if (_dragJustCompleted) return;
                    previewFile(node);
                }}
                ondblclick={() => openFile(node)}
                oncontextmenu={(e) => openNodeContextMenu(e, node)}
                class="cursor-pointer flex w-full items-center gap-1 py-0.5 text-[13px]
				       text-brand-charcoal-500 dark:text-[#c6d0f5]
				       hover:text-brand-gold-500 dark:hover:text-[#e5c890]
				       hover:bg-brand-sand-100 dark:hover:bg-[#363a4f]
				       rounded-full transition-colors font-mono text-left {draggingPath === node.path ? 'opacity-40' : ''} {dragOverDir === node.path ? 'ring-2 ring-inset ring-brand-gold-400 bg-brand-gold-50 dark:bg-[#363a4f]' : ''}"
                style="padding-left: {0.5 +
                    depth * 0.75}rem; padding-right: 0.5rem"
                title={$t("explorer.file_hint")}
            >
                <Icon
                    icon="solar:file-text-bold-duotone"
                    width="0.8rem"
                    class="shrink-0 text-brand-charcoal-300 dark:text-[#626880]"
                />
                {@render nodeName(node, fileStatusClass(node.path))}
            </button>
        {:else}
            <button
                data-node-path={node.path}
                data-node-is-dir="false"
                onpointerdown={(e) => onNodePointerDown(e, node)}
                onclick={() => {
                    if (_dragJustCompleted) return;
                    warnUnsupported(node);
                }}
                oncontextmenu={(e) => openNodeContextMenu(e, node)}
                class="cursor-pointer flex w-full items-center gap-1 py-0.5 text-[13px]
					       text-brand-charcoal-400 dark:text-[#838ba7] opacity-70
					       hover:bg-brand-sand-100 dark:hover:bg-[#363a4f]
					       rounded-full transition-colors font-mono text-left {draggingPath === node.path ? 'opacity-40' : ''} {dragOverDir === node.path ? 'ring-2 ring-inset ring-brand-gold-400 bg-brand-gold-50 dark:bg-[#363a4f]' : ''}"
                style="padding-left: {0.5 +
                    depth * 0.75}rem; padding-right: 0.5rem"
                title={$t("explorer.unsupported_hint")}
            >
                <Icon
                    icon="solar:file-bold-duotone"
                    width="0.8rem"
                    class="shrink-0 text-brand-charcoal-300 dark:text-[#626880]"
                />
                {@render nodeName(node, fileStatusClass(node.path))}
            </button>
        {/if}
    {/each}
{/snippet}

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
