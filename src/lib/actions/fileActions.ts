// Shared file actions used by both the action-bar buttons (ImportButton,
// OpenFolderButton, ExportButton, SaveAsButton) and the native application
// menu (File > Open File / Open Folder / Save / Save As). Keeping the logic in
// one place ensures the menu and the buttons behave identically.

import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { serializedDocumentFromEditorState } from "@lexical/file";
import { get } from "svelte/store";
import { lexicalEditorInstance } from "$lib/stores/editor.store";
import {
    openOrFocusTab,
    openFolderPath,
    folderRefreshTrigger,
    activeTab,
    activeTabId,
    markTabSaved,
} from "$lib/stores/tabs.store";

/** Open a single file via the OS dialog and load it into a tab. */
export async function openFile(): Promise<void> {
    const result = await openDialog({
        multiple: false,
        filters: [
            {
                name: "All Supported Files",
                extensions: ["typ", "bib", "txt", "md", "lexical", "json", "jl"],
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
 * Save the active tab to its existing path, prompting for a location only when
 * the tab has never been saved.
 */
export async function saveFile(): Promise<void> {
    const tab = get(activeTab);
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
        markTabSaved(get(activeTabId)!, path);
    } else if (tab.type === "julia") {
        let path = tab.path;
        if (!path) {
            path = await saveDialog({
                defaultPath: `${tab.name}.jl`,
                filters: [{ name: "Julia", extensions: ["jl"] }],
            });
            if (!path) return;
        }
        await writeTextFile(path, tab.content);
        markTabSaved(get(activeTabId)!, path);
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
        markTabSaved(get(activeTabId)!, path);
    }
}

/** Always prompt for a new location and save the active tab there. */
export async function saveAs(): Promise<void> {
    const tab = get(activeTab);
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
        markTabSaved(get(activeTabId)!, path);
    } else if (tab.type === "julia") {
        const path = await saveDialog({
            title: "Save As",
            defaultPath: `${tab.name}.jl`,
            filters: [{ name: "Julia", extensions: ["jl"] }],
        });
        if (!path) return;
        await writeTextFile(path, tab.content);
        markTabSaved(get(activeTabId)!, path);
    } else {
        const ext = tab.type === "typst" ? "typ" : "txt";
        const path = await saveDialog({
            title: "Save As",
            defaultPath: `${tab.name}.${ext}`,
            filters: [{ name: "Text Files", extensions: ["typ", "bib", "txt", "md"] }],
        });
        if (!path) return;
        await writeTextFile(path, tab.content);
        markTabSaved(get(activeTabId)!, path);
    }
}
