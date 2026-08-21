// Shared file actions used by both the action-bar buttons (ImportButton,
// OpenFolderButton, ExportButton, SaveAsButton) and the native application
// menu (File > Open File / Open Folder / Save / Save As). Keeping the logic in
// one place ensures the menu and the buttons behave identically.

import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { serializedDocumentFromEditorState } from "@lexical/file";
import { get } from "svelte/store";
import { lexicalEditorInstance, typstRecompile } from "$lib/stores/editor.store";
import {
    openOrFocusTab,
    openFolderPath,
    folderRefreshTrigger,
    activeTab,
    tabs,
    markTabSaved,
} from "$lib/stores/tabs.store";
import type { EditorTab } from "$lib/stores/tabs.store";

/**
 * Resolve the tab an action targets. Split layouts render one action bar per
 * panel and pass that panel's tab id explicitly; everything else (native menu,
 * single-panel action bar) omits it and follows the active tab.
 */
function resolveTab(tabId?: string | null): EditorTab | null {
    if (!tabId) return get(activeTab);
    return get(tabs).find((t) => t.id === tabId) ?? null;
}

/** Open a single file via the OS dialog and load it into a tab. */
export async function openFile(): Promise<void> {
    const result = await openDialog({
        multiple: false,
        filters: [
            {
                name: "All Supported Files",
                extensions: ["typ", "bib", "txt", "md", "lexical", "json", "jl", "lean"],
            },
        ],
    });
    if (!result || Array.isArray(result)) return;
    const content = await readTextFile(result as string);
    openOrFocusTab(result as string, content);
}

/** Open a folder via the OS dialog and set it as the active explorer root. */
export async function openFolder(): Promise<void> {
    const result = await openDialog({ directory: true, multiple: false });
    if (!result || Array.isArray(result)) return;
    const picked = result as string;
    if (get(openFolderPath) === picked) {
        folderRefreshTrigger.update((n) => n + 1);
    } else {
        openFolderPath.set(picked);
    }
}

/**
 * Save a tab to its existing path, prompting for a location only when the tab
 * has never been saved. Defaults to the active tab.
 */
export async function saveFile(tabId?: string | null): Promise<void> {
    const tab = resolveTab(tabId);
    if (!tab) return;

    if (tab.type === "lexical") {
        const editor = get(lexicalEditorInstance);
        if (!editor) return;
        const doc = serializedDocumentFromEditorState(editor.getEditorState(), {
            source: "AyahLab",
        });
        const json = JSON.stringify(doc, null, 2);
        let path = tab.path;
        if (!path) {
            path = await saveDialog({
                title: "Save Lexical File",
                defaultPath: `${tab.name}.lexical`,
                filters: [
                    { name: "Lexical File", extensions: ["lexical", "json"] },
                ],
            });
            if (!path) return;
        }
        await writeTextFile(path, json);
        markTabSaved(tab.id, path);
    } else if (tab.type === "julia" || tab.type === "lean") {
        const isLean = tab.type === "lean";
        let path = tab.path;
        if (!path) {
            path = await saveDialog({
                defaultPath: `${tab.name}.${isLean ? "lean" : "jl"}`,
                filters: isLean
                    ? [{ name: "Lean 4", extensions: ["lean"] }]
                    : [{ name: "Julia", extensions: ["jl"] }],
            });
            if (!path) return;
        }
        await writeTextFile(path, tab.content);
        markTabSaved(tab.id, path);
    } else {
        // typst / text / bib — save raw content
        let path = tab.path;
        if (!path) {
            const ext = tab.type === "typst" ? "typ" : "txt";
            path = await saveDialog({
                defaultPath: `${tab.name}.${ext}`,
                filters: [
                    { name: "Text Files", extensions: ["typ", "bib", "txt", "md"] },
                ],
            });
            if (!path) return;
        }
        await writeTextFile(path, tab.content);
        markTabSaved(tab.id, path);
        // A pinned preview (e.g. main.typ) imports other files from disk, so a
        // recompile after saving picks up edits to the just-saved chapter file.
        if (tab.type === "typst" || tab.type === "text") {
            typstRecompile.update((n) => n + 1);
        }
    }
}

/** Always prompt for a new location and save the tab there (default: active tab). */
export async function saveAs(tabId?: string | null): Promise<void> {
    const tab = resolveTab(tabId);
    if (!tab) return;

    if (tab.type === "lexical") {
        const editor = get(lexicalEditorInstance);
        if (!editor) return;
        const doc = serializedDocumentFromEditorState(editor.getEditorState(), {
            source: "AyahLab",
        });
        const path = await saveDialog({
            title: "Save As",
            defaultPath: `${tab.name}.lexical`,
            filters: [{ name: "Lexical File", extensions: ["lexical", "json"] }],
        });
        if (!path) return;
        await writeTextFile(path, JSON.stringify(doc, null, 2));
        markTabSaved(tab.id, path);
    } else if (tab.type === "julia" || tab.type === "lean") {
        const isLean = tab.type === "lean";
        const path = await saveDialog({
            title: "Save As",
            defaultPath: `${tab.name}.${isLean ? "lean" : "jl"}`,
            filters: isLean
                ? [{ name: "Lean 4", extensions: ["lean"] }]
                : [{ name: "Julia", extensions: ["jl"] }],
        });
        if (!path) return;
        await writeTextFile(path, tab.content);
        markTabSaved(tab.id, path);
    } else {
        const ext = tab.type === "typst" ? "typ" : "txt";
        const path = await saveDialog({
            title: "Save As",
            defaultPath: `${tab.name}.${ext}`,
            filters: [{ name: "Text Files", extensions: ["typ", "bib", "txt", "md"] }],
        });
        if (!path) return;
        await writeTextFile(path, tab.content);
        markTabSaved(tab.id, path);
    }
}
